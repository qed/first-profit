// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingSignup,
  loadPendingSignup,
  savePendingSignup,
  PENDING_TTL_MS,
  type PendingSignup,
} from "../pendingStore";

const NOW = 1_700_000_000_000;

const SAMPLE: PendingSignup = {
  attemptId: "attempt-1",
  parentEmail: "sam@example.com",
  createdAt: NOW,
  child: {
    firstName: "Alex",
    credentialChoice: "existing_credential",
    ageBand: "13_to_15",
    dob: "2011-05-04",
  },
  jurisdiction: "California, US",
  consent: {
    policyVersion: "2026-08-01.1",
    policyHash: "f".repeat(64),
    method: "email_plus_attestation",
  },
};

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("pendingStore", () => {
  it("round-trips the carry-forward (ageBand / dob / jurisdiction / consent echo)", () => {
    savePendingSignup(SAMPLE);
    // Read at a time inside the TTL window so the stamp is honored.
    expect(loadPendingSignup(NOW + 1000)).toEqual(SAMPLE);
  });

  it("returns null when nothing is stored", () => {
    expect(loadPendingSignup(NOW)).toBeNull();
  });

  it("clear removes the pending signup", () => {
    savePendingSignup(SAMPLE);
    clearPendingSignup();
    expect(loadPendingSignup(NOW)).toBeNull();
  });

  it("NEVER persists a password (neither parent nor child) — FIX 2", () => {
    savePendingSignup(SAMPLE);
    const raw = window.localStorage.getItem("fp:signup:pending") ?? "";
    // No password field exists on PendingSignup at all; assert the runtime blob
    // carries neither a parent nor a child password anywhere.
    expect(raw.toLowerCase()).not.toContain("password");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect("parentPassword" in parsed).toBe(false);
    const child = parsed.child as Record<string, unknown>;
    expect("password" in child).toBe(false);
  });

  it("a blob past the TTL is treated as absent (stale abandoned signup) — FIX 2", () => {
    savePendingSignup(SAMPLE);
    // One ms past the window → gone.
    expect(loadPendingSignup(NOW + PENDING_TTL_MS + 1)).toBeNull();
    // Exactly at the window edge → still present.
    expect(loadPendingSignup(NOW + PENDING_TTL_MS)).toEqual(SAMPLE);
  });

  it("null attemptId is preserved (older backend not surfacing it)", () => {
    savePendingSignup({ ...SAMPLE, attemptId: null });
    expect(loadPendingSignup(NOW)?.attemptId).toBeNull();
  });

  it("dob is optional (path with no DOB round-trips without it)", () => {
    const noDob: PendingSignup = { ...SAMPLE, child: { ...SAMPLE.child, dob: undefined } };
    savePendingSignup(noDob);
    expect(loadPendingSignup(NOW)?.child.dob).toBeUndefined();
  });

  it("malformed / partial JSON -> null (never throws)", () => {
    window.localStorage.setItem("fp:signup:pending", "{not json");
    expect(loadPendingSignup(NOW)).toBeNull();
    // Missing the new required fields (createdAt / consent / ageBand / jurisdiction).
    window.localStorage.setItem("fp:signup:pending", JSON.stringify({ parentEmail: "x" }));
    expect(loadPendingSignup(NOW)).toBeNull();
    window.localStorage.setItem(
      "fp:signup:pending",
      JSON.stringify({
        parentEmail: "x",
        createdAt: NOW,
        jurisdiction: "US",
        child: { firstName: "A", credentialChoice: "bogus", ageBand: "13_to_15" },
        consent: { policyVersion: "v", policyHash: "h", method: "m" },
      }),
    );
    expect(loadPendingSignup(NOW)).toBeNull();
    // A valid child shape but a bogus age band is rejected too.
    window.localStorage.setItem(
      "fp:signup:pending",
      JSON.stringify({
        ...SAMPLE,
        child: { ...SAMPLE.child, ageBand: "not_a_band" },
      }),
    );
    expect(loadPendingSignup(NOW)).toBeNull();
  });
});
