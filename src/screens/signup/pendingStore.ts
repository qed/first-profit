/**
 * The pending-signup carry-across-the-email-wait store (Slice B Unit 9).
 *
 * When startSignup succeeds the SPA shows a "check your email" wait, then the
 * parent clicks the emailed link — which opens `${origin}/signup/verify?token=...`
 * as a FRESH page load (a new tab, or the same tab navigated away). That reload
 * wipes all in-memory signup state, so the data the verify-return needs to finish
 * the mint (the attempt id + which child to create) is persisted HERE, in
 * `localStorage` (shared across tabs of the same origin on the same device).
 *
 * SECURITY: the parent's OWN password is NEVER persisted. It lived only in the
 * original tab's memory; on the verify-return page it is re-prompted (the
 * "different tab / after reload" reprompt the plan calls for). The child's
 * password IS persisted (the parent set it moments ago, and it is needed both to
 * mint the child and to log the child in for path a) — a deliberate, bounded
 * tradeoff, cleared the instant the mint completes.
 *
 * A DIFFERENT device (or cleared storage) has no pending blob at all: the
 * verify-return degrades to a clear "finish on the device you started on"
 * message rather than a broken mint.
 */

import type { SignupCredentialChoice } from "../../lib/auth";

const PENDING_KEY = "fp:signup:pending";

export interface PendingSignup {
  attemptId: string | null;
  parentEmail: string;
  child: {
    firstName: string;
    credentialChoice: SignupCredentialChoice;
    /** Path (a) child password; "" for path (b). */
    password: string;
  };
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Persist the pending signup so the verify-return page can finish the mint. */
export function savePendingSignup(pending: PendingSignup): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // A full/blocked quota must not break the wait screen; the return page will
    // simply reprompt for everything (treated as a different-device return).
  }
}

/** Read the pending signup, or null if none is stored / it is malformed. */
export function loadPendingSignup(): PendingSignup | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSignup>;
    if (
      !parsed ||
      typeof parsed.parentEmail !== "string" ||
      typeof parsed.child !== "object" ||
      parsed.child === null ||
      typeof parsed.child.firstName !== "string" ||
      (parsed.child.credentialChoice !== "existing_credential" &&
        parsed.child.credentialChoice !== "provision_workspace")
    ) {
      return null;
    }
    return {
      attemptId: typeof parsed.attemptId === "string" ? parsed.attemptId : null,
      parentEmail: parsed.parentEmail,
      child: {
        firstName: parsed.child.firstName,
        credentialChoice: parsed.child.credentialChoice,
        password: typeof parsed.child.password === "string" ? parsed.child.password : "",
      },
    };
  } catch {
    return null;
  }
}

/** Drop the pending signup (call the instant the mint completes). */
export function clearPendingSignup(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Best-effort; a stale blob is harmless (attemptId is re-validated server-side).
  }
}
