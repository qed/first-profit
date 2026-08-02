import { describe, expect, it, vi } from "vitest";
import { finishSignup, type FinishSignupDeps } from "../finishSignup";
import type { CompleteVerificationRequest } from "../../Signup";

/**
 * The verify-return SEQUENCE (Slice B Unit 9 review, FIX 4a; single path since
 * U15). This test FAILS if the consent-record POST is absent between verify and
 * the child mint: it asserts recordSignupConsent is called with the echoed
 * version + hash BEFORE createSignupChild, and that a consent failure aborts
 * before any mint. It also pins the U15 contract: the child logs in with the
 * generated USERNAME the mint returns (not the first name), and that username is
 * threaded up to the container for the confirmation.
 */

const REQ: CompleteVerificationRequest = {
  token: "tok-1",
  parentEmail: "sam@example.com",
  parentPassword: "parentpass",
  attemptId: "attempt-1",
  jurisdiction: "California, US",
  consent: {
    echoedVersion: "2026-08-01.1",
    echoedHash: "f".repeat(64),
    method: "email_plus_attestation",
  },
  child: {
    firstName: "Alex",
    ageBand: "13_to_15",
    dob: "2011-05-04",
    password: "kidpassword",
  },
};

/** A deps set that records the ORDER of the backend calls into `order`. */
function makeDeps(overrides: Partial<FinishSignupDeps> = {}) {
  const order: string[] = [];
  const deps: FinishSignupDeps = {
    verifySignup: vi.fn(async () => {
      order.push("verify");
      return { ok: true } as const;
    }),
    recordSignupConsent: vi.fn(async () => {
      order.push("consent");
      return { ok: true };
    }),
    createSignupChild: vi.fn(async () => {
      order.push("child");
      return { ok: true, childId: "child-1", username: "alex" } as const;
    }),
    loginChildIntoGame: vi.fn(async () => {
      order.push("login");
      return true;
    }),
    ...overrides,
  };
  return { deps, order };
}

describe("finishSignup — verify → consent → child ordering (FIX 1/4a)", () => {
  it("records consent (with the echoed version+hash) BETWEEN verify and the child mint", async () => {
    const { deps, order } = makeDeps();
    const res = await finishSignup(deps, REQ);

    // The generated username is threaded up for the confirmation.
    expect(res).toEqual({ ok: true, outcome: "playing", username: "alex" });
    // The load-bearing order: consent lands after verify and before the mint.
    expect(order).toEqual(["verify", "consent", "child", "login"]);
    expect(order.indexOf("consent")).toBeGreaterThan(order.indexOf("verify"));
    expect(order.indexOf("consent")).toBeLessThan(order.indexOf("child"));

    // Consent carries the EXACT echoed version + hash the parent attested to.
    expect(deps.recordSignupConsent).toHaveBeenCalledWith({
      attemptId: "attempt-1",
      echoedVersion: "2026-08-01.1",
      echoedHash: "f".repeat(64),
      method: "email_plus_attestation",
      childAgeBand: "13_to_15",
      childDob: "2011-05-04",
      jurisdiction: "California, US",
    });
    // Single-path mint (U15): no credentialChoice; the child password is always sent.
    expect(deps.createSignupChild).toHaveBeenCalledWith({
      attemptId: "attempt-1",
      childFirstName: "Alex",
      childPassword: "kidpassword",
    });
    // The child login uses the generated USERNAME (U13), NOT the first name.
    expect(deps.loginChildIntoGame).toHaveBeenCalledWith("alex", "kidpassword");
  });

  it("a consent failure ABORTS before the child mint (fail-closed)", async () => {
    const { deps, order } = makeDeps({
      recordSignupConsent: vi.fn(async () => {
        order.push("consent");
        return { ok: false };
      }),
    });
    const res = await finishSignup(deps, REQ);
    expect(res).toEqual({ ok: false });
    expect(order).toEqual(["verify", "consent"]);
    expect(deps.createSignupChild).not.toHaveBeenCalled();
  });

  it("a verify failure never records consent or mints", async () => {
    const { deps, order } = makeDeps({
      verifySignup: vi.fn(async () => {
        order.push("verify");
        return { ok: false } as const;
      }),
    });
    const res = await finishSignup(deps, REQ);
    expect(res).toEqual({ ok: false });
    expect(order).toEqual(["verify"]);
    expect(deps.recordSignupConsent).not.toHaveBeenCalled();
    expect(deps.createSignupChild).not.toHaveBeenCalled();
  });

  it("a mint failure surfaces { ok:false } and never logs the child in", async () => {
    const { deps } = makeDeps({
      createSignupChild: vi.fn(async () => ({ ok: false }) as const),
    });
    const res = await finishSignup(deps, REQ);
    expect(res).toEqual({ ok: false });
    expect(deps.loginChildIntoGame).not.toHaveBeenCalled();
  });

  it("a rare child-login race falls back to the confirmation outcome, still carrying the username", async () => {
    const { deps } = makeDeps({ loginChildIntoGame: vi.fn(async () => false) });
    const res = await finishSignup(deps, REQ);
    expect(res).toEqual({ ok: true, outcome: "confirmation", username: "alex" });
  });

  it("an empty minted username attempts login with '' , fails, and degrades to confirmation (not playing)", async () => {
    // The mint could not surface a username (empty replay): login by an empty
    // username fails, so the outcome is the graceful confirmation carrying "".
    const { deps, order } = makeDeps({
      createSignupChild: vi.fn(async () => {
        order.push("child");
        return { ok: true, childId: "child-1", username: "" } as const;
      }),
      loginChildIntoGame: vi.fn(async (identifier: string) => {
        order.push("login");
        return identifier !== ""; // login by empty username fails
      }),
    });
    const res = await finishSignup(deps, REQ);
    // Login was attempted with the empty string ...
    expect(deps.loginChildIntoGame).toHaveBeenCalledWith("", "kidpassword");
    // ... and, failing, the outcome is confirmation (never playing), carrying "".
    expect(res).toEqual({ ok: true, outcome: "confirmation", username: "" });
    expect(order).toEqual(["verify", "consent", "child", "login"]);
  });
});
