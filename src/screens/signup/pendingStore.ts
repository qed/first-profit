/**
 * The pending-signup carry-across-the-email-wait store (Slice B Unit 9).
 *
 * When startSignup succeeds the SPA shows a "check your email" wait, then the
 * parent clicks the emailed link — which opens `${origin}/signup/verify?token=...`
 * as a FRESH page load (a new tab, or the same tab navigated away). That reload
 * wipes all in-memory signup state, so the data the verify-return needs to finish
 * the flow (the attempt id, which child to create, and the consent echo the
 * consent-record step must replay) is persisted HERE, in `localStorage` (shared
 * across tabs of the same origin on the same device).
 *
 * SECURITY (Unit 9 review, FIX 2): NO PASSWORD is EVER persisted — neither the
 * parent's nor the child's. Both are re-prompted on the verify-return screen (the
 * "different tab / after reload" reprompt). The blob carries only non-secret
 * carry-forward: the attempt id, the parent email, the child's first name + age
 * band + DOB, the jurisdiction, and the consent policy echo (version + hash +
 * method) — which are validated-then-discarded server-side at START, so they must
 * ride the client to reach the consent-record step.
 *
 * TTL (FIX 2): the blob is stamped with `createdAt`; a blob older than
 * `PENDING_TTL_MS` is treated as absent (a stale, abandoned signup degrades to
 * the "finish on the device you started on" message rather than a broken mint).
 * The verify-return ALSO clears the blob on every terminal outcome (success or
 * failure), so an abandoned attempt never lingers past its window.
 *
 * A DIFFERENT device (or cleared storage) has no pending blob at all: the
 * verify-return degrades to a clear "finish on the device you started on"
 * message rather than a broken mint.
 */

import type { SignupAgeBand } from "../../lib/auth";

const PENDING_KEY = "fp:signup:pending";

/** The pending blob's lifetime. A signup not finished within this window is
 *  treated as abandoned (the emailed verify link outlives it → reprompt-to-
 *  restart). 24h comfortably covers "click the email later today". */
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingSignup {
  attemptId: string | null;
  parentEmail: string;
  /** Epoch ms stamped at save; a blob older than PENDING_TTL_MS is stale. */
  createdAt: number;
  child: {
    firstName: string;
    /** The validated age band (echoed to the consent-record step). */
    ageBand: SignupAgeBand;
    /** ISO yyyy-mm-dd; optional (the age band is the required signal). */
    dob?: string;
  };
  jurisdiction: string;
  /** The consent policy echo the consent-record step replays (bind-to-rendered).
   *  Exactly the fetched policy's version/hash/method the parent attested to. */
  consent: {
    policyVersion: string;
    policyHash: string;
    method: string;
  };
}

const AGE_BANDS: readonly SignupAgeBand[] = ["under_13", "13_to_15", "16_plus"];

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Persist the pending signup so the verify-return page can finish the flow. */
export function savePendingSignup(pending: PendingSignup): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // A full/blocked quota must not break the wait screen; the return page will
    // simply reprompt for everything (treated as a different-device return).
  }
}

/** Read the pending signup, or null if none is stored / it is malformed / stale.
 *  `now` is injectable so the TTL is testable without faking the clock. */
export function loadPendingSignup(now: number = Date.now()): PendingSignup | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSignup>;
    if (
      !parsed ||
      typeof parsed.parentEmail !== "string" ||
      typeof parsed.createdAt !== "number" ||
      typeof parsed.jurisdiction !== "string" ||
      typeof parsed.child !== "object" ||
      parsed.child === null ||
      typeof parsed.child.firstName !== "string" ||
      !AGE_BANDS.includes(parsed.child.ageBand as SignupAgeBand) ||
      typeof parsed.consent !== "object" ||
      parsed.consent === null ||
      typeof parsed.consent.policyVersion !== "string" ||
      typeof parsed.consent.policyHash !== "string" ||
      typeof parsed.consent.method !== "string"
    ) {
      return null;
    }
    // TTL: a blob past its window is treated as absent (abandoned signup).
    if (now - parsed.createdAt > PENDING_TTL_MS) return null;
    return {
      attemptId: typeof parsed.attemptId === "string" ? parsed.attemptId : null,
      parentEmail: parsed.parentEmail,
      createdAt: parsed.createdAt,
      child: {
        firstName: parsed.child.firstName,
        ageBand: parsed.child.ageBand as SignupAgeBand,
        dob: typeof parsed.child.dob === "string" ? parsed.child.dob : undefined,
      },
      jurisdiction: parsed.jurisdiction,
      consent: {
        policyVersion: parsed.consent.policyVersion,
        policyHash: parsed.consent.policyHash,
        method: parsed.consent.method,
      },
    };
  } catch {
    return null;
  }
}

/** Drop the pending signup (call on EVERY terminal outcome — success OR failure). */
export function clearPendingSignup(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Best-effort; a stale blob is harmless (attemptId is re-validated server-side).
  }
}
