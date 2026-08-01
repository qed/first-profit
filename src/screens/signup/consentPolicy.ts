/**
 * The rendered parental-consent policy (Slice B Unit 8, R15).
 *
 * This is the versioned + hashed snapshot the parent attests to. It lives in its
 * OWN namespace (`fp_parental_consent`, separate from the Stripe refund policy),
 * and the consent record the backend writes (Unit 3) echoes this exact version +
 * hash so a stale rendering can be refused. The legal TEXT is a launch gate; the
 * SHAPE (namespace / version / hash / method) is stable and is what the UI must
 * capture now.
 *
 * Copy rule (global product rule): NO em dashes anywhere.
 */
import type { AgeBand } from "./validation";

/** The consent policy namespace (its own, not the refund-policy namespace). */
export const CONSENT_POLICY_NAMESPACE = "fp_parental_consent";

/** Consent method for this build: email round-trip plus an explicit attestation. */
export const CONSENT_METHOD = "email_plus_attestation";

/** The rendered policy version. Bump when the TEXT below changes. */
export const CONSENT_POLICY_VERSION = "2026-08-01.v1";

export const CONSENT_POLICY_TITLE = "Parental consent to create your child's account";

/**
 * The rendered policy body, paragraph by paragraph. Any edit here MUST bump
 * CONSENT_POLICY_VERSION (the hash below is derived from this text, so the
 * backend echo/refuse-stale check will catch an un-versioned edit).
 */
export const CONSENT_POLICY_BODY: readonly string[] = [
  "You are the parent or legal guardian of the child whose account you are creating, and you have the authority to consent on their behalf.",
  "You consent to First Profit creating an account for your child, collecting the first name, age band, and date of birth you provide, and, if you choose a provisioned address, creating a school email address for them.",
  "You will supervise your child's use of First Profit. A parent is present for all in-person selling, controls every account and payment, and signs off anything published.",
  "You may withdraw this consent and request deletion of your child's data at any time, after which the account and its data are removed.",
] as const;

/**
 * Extra copy shown for the under-13 band: COPPA verifiable-parental-consent
 * emphasis. Returns null for older bands (differentiated messaging kept simple:
 * one added paragraph, same attestation model).
 */
export function consentEmphasis(ageBand: AgeBand | null): string | null {
  if (ageBand === "under_13") {
    return "Because your child is under 13, US COPPA rules require verifiable parental consent. We confirm your email in the flow and record your explicit attestation below as that verifiable consent.";
  }
  return null;
}

/**
 * A small, dependency-free deterministic hash (djb2, hex) of the policy text.
 * Not cryptographic: it is a version fingerprint so the backend can echo-and-
 * refuse a mismatched rendering. Kept in sync with CONSENT_POLICY_BODY.
 */
export function policyHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The hash of the currently rendered policy body. */
export const CONSENT_POLICY_HASH = policyHash(CONSENT_POLICY_BODY.join("\n"));

/** The consent metadata bundle passed into `buildSubmission`. */
export const CONSENT_META = {
  policyNamespace: CONSENT_POLICY_NAMESPACE,
  policyVersion: CONSENT_POLICY_VERSION,
  policyHash: CONSENT_POLICY_HASH,
  method: CONSENT_METHOD,
} as const;
