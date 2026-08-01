// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingSignup,
  loadPendingSignup,
  savePendingSignup,
  type PendingSignup,
} from "../pendingStore";

const SAMPLE: PendingSignup = {
  attemptId: "attempt-1",
  parentEmail: "sam@example.com",
  child: { firstName: "Alex", credentialChoice: "existing_credential", password: "kidpassword" },
};

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("pendingStore", () => {
  it("round-trips a saved pending signup", () => {
    savePendingSignup(SAMPLE);
    expect(loadPendingSignup()).toEqual(SAMPLE);
  });

  it("returns null when nothing is stored", () => {
    expect(loadPendingSignup()).toBeNull();
  });

  it("clear removes the pending signup", () => {
    savePendingSignup(SAMPLE);
    clearPendingSignup();
    expect(loadPendingSignup()).toBeNull();
  });

  it("never persists a parent password (only the child credential)", () => {
    savePendingSignup(SAMPLE);
    const raw = window.localStorage.getItem("fp:signup:pending") ?? "";
    // The blob carries the child password by design, but there is no parent
    // password field on PendingSignup at all — assert the type-level absence holds
    // at runtime too.
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect("parentPassword" in parsed).toBe(false);
  });

  it("null attemptId is preserved (older backend not surfacing it)", () => {
    savePendingSignup({ ...SAMPLE, attemptId: null });
    expect(loadPendingSignup()?.attemptId).toBeNull();
  });

  it("malformed / partial JSON -> null (never throws)", () => {
    window.localStorage.setItem("fp:signup:pending", "{not json");
    expect(loadPendingSignup()).toBeNull();
    window.localStorage.setItem("fp:signup:pending", JSON.stringify({ parentEmail: "x" }));
    expect(loadPendingSignup()).toBeNull();
    window.localStorage.setItem(
      "fp:signup:pending",
      JSON.stringify({ parentEmail: "x", child: { firstName: "A", credentialChoice: "bogus" } }),
    );
    expect(loadPendingSignup()).toBeNull();
  });
});
