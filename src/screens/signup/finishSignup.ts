/**
 * The verify-return orchestration (Slice B Unit 9; FIX 1 of the Unit 9 review).
 *
 * This is the single, testable sequence the App's verify-return handler runs.
 * Extracted from App.tsx so a unit test can prove the ORDER — specifically that
 * the consent-record POST lands AFTER the parent session is adopted and BEFORE
 * the child mint. Without that consent row the child route is consent-gated and
 * every real mint fails `consent_required`, so the ordering is load-bearing.
 *
 *   1. verifySignup        → adopts the parent session (Bearer for 2 + 3).
 *   2. recordSignupConsent → writes the consent row (parent Bearer). MUST run
 *      after the session exists and before the mint. A failure aborts (a mint
 *      would only fail consent_required anyway).
 *   3. createSignupChild   → mints the child under the parent Bearer.
 *   4. path a: log the child in and hand off to the game (playing); on a rare
 *      login race, fall back to the confirmation. path b: confirmation.
 *
 * Every step is a flat result that never throws; any failure collapses to a flat
 * `{ ok: false }` for the UI.
 */

import type { CompleteVerificationRequest, CompleteVerificationResult } from "../Signup";
import type {
  createSignupChild,
  recordSignupConsent,
  verifySignup,
} from "../../lib/auth";

export interface FinishSignupDeps {
  verifySignup: typeof verifySignup;
  recordSignupConsent: typeof recordSignupConsent;
  createSignupChild: typeof createSignupChild;
  /** The game's login — adopts the CHILD session (path a) and routes into play. */
  loginChildIntoGame: (identifier: string, password: string) => Promise<boolean>;
}

export async function finishSignup(
  deps: FinishSignupDeps,
  req: CompleteVerificationRequest,
): Promise<CompleteVerificationResult> {
  // 1. Verify the email and ADOPT the parent session (the Bearer for 2 and 3).
  const verified = await deps.verifySignup({
    token: req.token,
    email: req.parentEmail,
    parentPassword: req.parentPassword,
  });
  if (!verified.ok) return { ok: false };

  // 2. Record consent under the just-adopted parent session, BEFORE the mint.
  //    Echo EXACTLY the version + hash the parent attested to. A failure here
  //    aborts: the consent-gated mint would only fail consent_required.
  const consent = await deps.recordSignupConsent({
    attemptId: req.attemptId,
    echoedVersion: req.consent.echoedVersion,
    echoedHash: req.consent.echoedHash,
    method: req.consent.method,
    childAgeBand: req.child.ageBand,
    childDob: req.child.dob,
    jurisdiction: req.jurisdiction,
  });
  if (!consent.ok) return { ok: false };

  // 3. Mint the child under the parent Bearer (path a carries the re-prompted
  //    child password; path b carries none).
  const minted = await deps.createSignupChild({
    attemptId: req.attemptId,
    childFirstName: req.child.firstName,
    credentialChoice: req.child.credentialChoice,
    childPassword:
      req.child.credentialChoice === "existing_credential" ? req.child.password : undefined,
  });
  if (!minted.ok) return { ok: false };

  // 4. Path a: adopt the CHILD session and hand off to the game.
  if (req.child.credentialChoice === "existing_credential") {
    const ok = await deps.loginChildIntoGame(req.child.firstName, req.child.password ?? "");
    if (ok) return { ok: true, outcome: "playing" };
    // The child login didn't take (a rare handle race): the account exists, so
    // show the confirmation; the child can log in later.
    return { ok: true, outcome: "confirmation" };
  }
  // Path b: the provisioned mailbox is not ready yet, so DON'T attempt a login.
  return { ok: true, outcome: "confirmation" };
}
