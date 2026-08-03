import { describe, it, expect } from "vitest";
import {
  setDraft,
  getDraft,
  wipeAllForUser,
  wipeAllFpKeys,
  listDraftNames,
  getLastUserId,
  setLastUserId,
  FP_PREFIX,
} from "../draftCache";

/** Deterministic Map-backed Storage stand-in (no jsdom needed). */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  } as Storage;
}

const USER_A = "user-aaaa";
const USER_B = "user-bbbb";

describe("draftCache", () => {
  it("scopes keys under fp:<uid>: and round-trips values", () => {
    const s = fakeStorage();
    setDraft(USER_A, "oneLiner", "cool bracelets", s);

    expect(s.getItem(`${FP_PREFIX}${USER_A}:oneLiner`)).toBe(JSON.stringify("cool bracelets"));
    expect(getDraft(USER_A, "oneLiner", s)).toBe("cool bracelets");
    expect(getDraft(USER_A, "missing", s)).toBeUndefined();
  });

  it("same-user re-login restores drafts (they are never wiped on idle logout)", () => {
    const s = fakeStorage();
    // First session as user A.
    setLastUserId(USER_A, s);
    setDraft(USER_A, "pitch", "my 60 second pitch", s);

    // IDLE logout preserves the same user's drafts: no wipe call happens.
    // Same-user re-login: last === current, so nothing is wiped.
    const last = getLastUserId(s);
    expect(last).toBe(USER_A);
    if (last !== USER_A) wipeAllFpKeys(s);
    setLastUserId(USER_A, s);

    expect(getDraft(USER_A, "pitch", s)).toBe("my 60 second pitch");
  });

  it("different-user login wipes EVERY fp:* key before hydration", () => {
    const s = fakeStorage();
    setLastUserId(USER_A, s);
    setDraft(USER_A, "oneLiner", "A's draft", s);
    setDraft(USER_A, "outbox", [{ v: 1, kind: "sale" }], s);

    // User B logs in on the same device.
    const last = getLastUserId(s);
    if (last !== USER_B) wipeAllFpKeys(s);

    // The real guard: the out-of-namespace marker survives the wipe, BEFORE we
    // overwrite it. (Asserting after setLastUserId(USER_B) would mask a wipe
    // that clobbered the marker.)
    expect(getLastUserId(s)).toBe(USER_A);
    setLastUserId(USER_B, s);

    // No fp:* draft/outbox keys survive.
    expect(getDraft(USER_A, "oneLiner", s)).toBeUndefined();
    expect(getDraft(USER_A, "outbox", s)).toBeUndefined();
    const remainingFp = Array.from({ length: s.length }, (_, i) => s.key(i)).filter(
      (k) => k !== null && k.startsWith(FP_PREFIX),
    );
    expect(remainingFp).toEqual([]);
    expect(getLastUserId(s)).toBe(USER_B);
  });

  it("explicit logout purges the current user's drafts AND outbox keys", () => {
    const s = fakeStorage();
    setDraft(USER_A, "oneLiner", "A draft", s);
    setDraft(USER_A, "outbox", [{ v: 1 }], s);
    setDraft(USER_B, "oneLiner", "B draft", s);

    wipeAllForUser(USER_A, s);

    expect(getDraft(USER_A, "oneLiner", s)).toBeUndefined();
    expect(getDraft(USER_A, "outbox", s)).toBeUndefined();
    // Another user's drafts are untouched.
    expect(getDraft(USER_B, "oneLiner", s)).toBe("B draft");
  });

  it("idle logout preserves the same user's drafts and outbox entries", () => {
    const s = fakeStorage();
    setDraft(USER_A, "oneLiner", "still here", s);
    setDraft(USER_A, "outbox", [{ v: 1, id: "x" }], s);

    // Idle logout deliberately does NOT wipe: no draftCache call is made.
    // Assert the drafts remain readable, exactly as a same-user re-login sees them.
    expect(getDraft(USER_A, "oneLiner", s)).toBe("still here");
    expect(getDraft<Array<{ v: number; id: string }>>(USER_A, "outbox", s)).toEqual([
      { v: 1, id: "x" },
    ]);
    expect(listDraftNames(USER_A, s).sort()).toEqual(["oneLiner", "outbox"]);
  });

  it("setDraft NEVER throws on a refused write (quota/lockdown) — it reports false", () => {
    const s = fakeStorage();
    s.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => setDraft(USER_A, "oneLiner", "big", s)).not.toThrow();
    expect(setDraft(USER_A, "oneLiner", "big", s)).toBe(false);
  });

  it("setDraft reports true when the write lands", () => {
    const s = fakeStorage();
    expect(setDraft(USER_A, "oneLiner", "ok", s)).toBe(true);
    expect(getDraft(USER_A, "oneLiner", s)).toBe("ok");
  });

  it("corrupted JSON in a draft key is discarded, not thrown", () => {
    const s = fakeStorage();
    s.setItem(`${FP_PREFIX}${USER_A}:oneLiner`, "{not valid json");

    expect(() => getDraft(USER_A, "oneLiner", s)).not.toThrow();
    expect(getDraft(USER_A, "oneLiner", s)).toBeUndefined();
    // The offending key is dropped so it cannot poison later reads.
    expect(s.getItem(`${FP_PREFIX}${USER_A}:oneLiner`)).toBeNull();
  });
});
