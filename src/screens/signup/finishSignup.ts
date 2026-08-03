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
 *   3. createSignupChild   → mints the child under the parent Bearer AND returns
 *      the generated fp_username (U15) the child logs in with.
 *   4. log the child in with that USERNAME (U13 — login is username-only, NOT the
 *      first name) and hand off to the game (playing); on a rare login race, fall
 *      back to the confirmation, which reveals the username to the parent.
 *
 * (Slice B U15) There is no longer a credential-path branch: every child is minted
 * the one username+password way, so the child password is always present and the
 * login always runs.
 *
 * Every step is a flat result that never throws; any failure collapses to a flat
 * `{ ok: false }` for the UI.
 *
 * ── Stale-consent retry (dormant-flow fix) ──
 * The consent-record route (see `../signup-rules.ts` on The120 backend)
 * deliberately flattens EVERY refusal reason — missing, stale, version_mismatch,
 * not_verified, parent_mismatch, outage — into the SAME generic 401 body (no
 * oracle, so a client cannot tell "wrong password" from "the policy moved on").
 * That means staleness cannot be read off the wire; the ONLY way to tell "the
 * parent attested to text that is no longer current" from any other refusal is
 * to RE-FETCH the policy right after a consent failure and compare it to what
 * THIS request echoed. If the two differ, this collapses to
 * `staleConsent: true`, carrying the freshly fetched policy, so the caller can
 * show a distinct message and let the parent re-attest with the CURRENT
 * version/hash instead of retrying the same stale echo forever.
 * `fetchConsentPolicy` is an OPTIONAL dep, un-called unless the caller wires it,
 * so every existing generic-failure test (and any call site that doesn't care)
 * is unaffected.
 */

import type { CompleteVerificationRequest, CompleteVerificationResult } from "../Signup";
import type {
  createSignupChild,
  fetchConsentPolicy,
  recordSignupConsent,
  verifySignup,
} from "../../lib/auth";
import { renderedFromFetched } from "./consentPolicy";

export interface FinishSignupDeps {
  verifySignup: typeof verifySignup;
  recordSignupConsent: typeof recordSignupConsent;
  createSignupChild: typeof createSignupChild;
  /** The game's login — adopts the CHILD session (path a) and routes into play. */
  loginChildIntoGame: (identifier: string, password: string) => Promise<boolean>;
  /**
   * Optional: re-fetch the current consent policy after a consent-record
   * failure, so a stale echo can be distinguished from any other refusal (see
   * the module doc). Omit to keep the old flat `{ ok: false }` behavior.
   */
  fetchConsentPolicy?: typeof fetchConsentPolicy;
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
  if (!consent.ok) {
    // The wire gives no oracle (see the module doc): re-fetch the current
    // policy, if the caller wired that in, and compare it to what we just
    // echoed. A mismatch means the policy moved on between the consent screen
    // and this submit — surface it distinctly so the UI can re-attest instead
    // of retrying the identical stale echo forever.
    if (deps.fetchConsentPolicy) {
      const fetched = await deps.fetchConsentPolicy();
      if (
        fetched &&
        (fetched.version !== req.consent.echoedVersion || fetched.hash !== req.consent.echoedHash)
      ) {
        const policy = renderedFromFetched(fetched);
        if (policy) return { ok: false, staleConsent: true, policy };
      }
    }
    return { ok: false };
  }

  // 3. Mint the child under the parent Bearer. Single path (U15): the re-prompted
  //    child password is always sent. The mint returns the generated fp_username.
  const minted = await deps.createSignupChild({
    attemptId: req.attemptId,
    childFirstName: req.child.firstName,
    childPassword: req.child.password,
  });
  if (!minted.ok) return { ok: false };

  // 4. Adopt the CHILD session and hand off to the game. The login identifier is
  //    the generated USERNAME (U13 — login is username-only), NOT the first name.
  const ok = await deps.loginChildIntoGame(minted.username, req.child.password);
  if (ok) return { ok: true, outcome: "playing", username: minted.username };
  // The child login didn't take (a rare handle race, or an empty replay username):
  // the account exists, so show the confirmation — which reveals the username so
  // the parent can sign the child in later.
  return { ok: true, outcome: "confirmation", username: minted.username };
}
