/**
 * Account-namespaced localStorage draft cache.
 *
 * Draft/outbox keys are namespaced per user: `fp:<userId>:<name>`. This keeps
 * one child's Step Runner input (and, in Unit 6, the sync outbox) from leaking
 * into another child's session on a shared Chromebook.
 *
 * Draft-handling policy (Key Technical Decision: "logout revokes, not just
 * hides — but idle and explicit logout differ"):
 *  - EXPLICIT logout and a DIFFERENT-user login purge `fp:*` keys.
 *  - IDLE logout PRESERVES the same user's `fp:<uid>:*` keys, so an unsent
 *    Step Runner draft restores on same-user re-login (origin R6).
 *
 * ⚠ WHAT IS ACTUALLY IN HERE (corrected 2026-08-05, v3 Unit 7 review).
 * This header used to claim "drafts hold task text only (no PII)". That has not
 * been true for a while and is less true now, and an inaccurate inventory in the
 * one module that owns the storage is worse than none — it is what a future
 * reader consults before deciding whether a key needs wiping.
 *
 * The keys under this namespace hold:
 *  - Step Runner draft answers — a child's free text about their own business.
 *  - `profileCache` — the child's FIRST NAME, their public HANDLE, their school
 *    GRADE, and (Unit 7) their comic COVER: a `data:image/svg+xml;base64,…`
 *    picture personalized with their name, age and story answers. That is
 *    personal data about a minor, not task text.
 *  - the sync outbox — pending writes, i.e. more of the above.
 *
 * NONE of it is a credential (no tokens, no passwords: the Supabase session is
 * managed by the SDK under its own key), and all of it is account-namespaced, so
 * the wipe rules above are what keep one child's data off another child's
 * session. Anything ADDED here should be added to this list — and if it is ever
 * a secret rather than personal data, the wipe rules are not sufficient and the
 * value does not belong in localStorage at all.
 *
 * Corrupted JSON in a draft key is discarded, never thrown, so one bad key can
 * never break hydration.
 *
 * Testable: every function takes an optional `Storage` instance; it defaults to
 * `window.localStorage`, resolved lazily so importing this module never touches
 * the DOM (keeps the node-environment vitest suite happy).
 */

/** Namespace prefix for every account-scoped key. */
export const FP_PREFIX = "fp:";

/**
 * Where the "who logged in last" marker lives. Deliberately OUTSIDE the `fp:`
 * namespace so `wipeAllFpKeys()` never clears it — we must still remember the
 * previous user after wiping their drafts, to detect same-vs-different login.
 */
const LAST_USER_KEY = "firstprofit.lastUserId";

function resolveStorage(storage?: Storage): Storage {
  if (storage) return storage;
  return window.localStorage;
}

function draftKey(userId: string, name: string): string {
  return `${FP_PREFIX}${userId}:${name}`;
}

/** Every key in `storage` (a stable snapshot; safe to remove while iterating). */
function allKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k !== null) keys.push(k);
  }
  return keys;
}

/**
 * Store a JSON-serialized draft value under `fp:<userId>:<name>`.
 *
 * NON-THROWING: a refused write (QuotaExceededError on a full disk, a
 * private-mode/locked-down Storage, a serialization failure) reports `false`
 * instead of throwing, so a caller on the outbox/feedback path can degrade to
 * an honest "could not save" instead of crashing mid-submit. Returns `true`
 * when the write landed.
 */
export function setDraft(userId: string, name: string, value: unknown, storage?: Storage): boolean {
  try {
    const s = resolveStorage(storage);
    s.setItem(draftKey(userId, name), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a draft value. Returns `undefined` when absent OR when the stored JSON is
 * corrupted (the corrupted key is dropped, never thrown).
 */
export function getDraft<T = unknown>(userId: string, name: string, storage?: Storage): T | undefined {
  const s = resolveStorage(storage);
  const key = draftKey(userId, name);
  const raw = s.getItem(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupted JSON: discard the offending key so it can never poison a later
    // hydrate/replay, and report absence.
    s.removeItem(key);
    return undefined;
  }
}

/**
 * List the draft names (the `<name>` segment) stored for a user. This does NOT
 * validate the stored JSON — callers must still read each value through
 * `getDraft`, which defensively discards corrupted entries.
 */
export function listDraftNames(userId: string, storage?: Storage): string[] {
  const s = resolveStorage(storage);
  const scope = `${FP_PREFIX}${userId}:`;
  return allKeys(s)
    .filter((k) => k.startsWith(scope))
    .map((k) => k.slice(scope.length));
}

/**
 * Purge every `fp:<userId>:*` key for one user. Used by EXPLICIT logout — it
 * clears both drafts and (Unit 6) outbox entries, which share the namespace.
 */
export function wipeAllForUser(userId: string, storage?: Storage): void {
  const s = resolveStorage(storage);
  const scope = `${FP_PREFIX}${userId}:`;
  for (const k of allKeys(s)) {
    if (k.startsWith(scope)) s.removeItem(k);
  }
}

/**
 * Purge EVERY `fp:*` key regardless of user. Used when a DIFFERENT user logs in
 * on the same device, before hydrating their state, so no residual drafts or
 * outbox entries from the prior child cross accounts.
 */
export function wipeAllFpKeys(storage?: Storage): void {
  const s = resolveStorage(storage);
  for (const k of allKeys(s)) {
    if (k.startsWith(FP_PREFIX)) s.removeItem(k);
  }
}

/** The user id that last logged in on this device, or `null` if none recorded. */
export function getLastUserId(storage?: Storage): string | null {
  return resolveStorage(storage).getItem(LAST_USER_KEY);
}

/** Record the user id that just logged in on this device. */
export function setLastUserId(userId: string, storage?: Storage): void {
  resolveStorage(storage).setItem(LAST_USER_KEY, userId);
}
