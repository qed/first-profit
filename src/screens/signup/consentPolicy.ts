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
 * BACKEND IS THE SOURCE OF TRUTH FOR THE POLICY. The server's consent-rules.ts
 * owns the policy text, its version, and its sha256 hash (currentPolicyHash()).
 * The client must NOT independently invent a hash that has to match the server's:
 * it echoes back the version + hash of the exact text it RENDERED, and the server
 * refuses anything that does not bind to the text it currently serves.
 *
 * For Unit 8 (no API yet) DEFAULT_CONSENT_POLICY below is hard-coded to values
 * that EXACTLY MATCH the backend's current FP_CONSENT_POLICY (byte-identical text
 * and its sha256), so the echo always reconciles. In Unit 9 the client will FETCH
 * the rendered policy (text + version + hash) from the backend and inject it as a
 * RenderedConsentPolicy, so the client always echoes exactly what the server will
 * record (consent binds to the rendered version). The props are shaped so that
 * injection needs no rewrite: pass a `policy` to the screen / container and it is
 * both displayed and echoed.
 *
 * Copy rule (global product rule): NO em dashes anywhere.
 */
import type { AgeBand } from "./validation";

/** The consent policy namespace (its own, not the refund-policy namespace). */
export const CONSENT_POLICY_NAMESPACE = "fp_parental_consent";

/** Consent method for this build: email round-trip plus an explicit attestation. */
export const CONSENT_METHOD = "email_plus_attestation";

/**
 * The rendered policy version. For Unit 8 this is the backend's current
 * FP_CONSENT_POLICY.version VERBATIM (consent-rules.ts). Unit 9 injects the
 * fetched version instead of relying on this constant.
 */
export const CONSENT_POLICY_VERSION = "2026-08-01.1";

export const CONSENT_POLICY_TITLE = "Parental consent to create your child's account";

/**
 * The rendered policy body the parent reads and attests to. BYTE-IDENTICAL to the
 * backend FP_CONSENT_POLICY.text (consent-rules.ts) so its sha256 equals the
 * server's currentPolicyHash() and the echo reconciles. Do NOT edit this without
 * matching the backend text AND updating CONSENT_POLICY_HASH in the same change
 * (a validation test recomputes the hash and fails on drift). Unit 9 replaces
 * this constant with the fetched policy text.
 */
export const CONSENT_POLICY_TEXT =
  "I confirm I am the parent or legal guardian of the child named in this " +
  "signup, and I am at least 18 years old. I consent to First Profit creating " +
  "an account for my child so they can play and learn, and to First Profit " +
  "collecting and storing the limited information needed to run that account " +
  "(my child's first name, age band, and their saved game progress). I " +
  "understand this is a game-like business simulator for learners, that I can " +
  "review or delete my child's account by contacting First Profit, and that my " +
  "consent is recorded with the version of this notice shown above.";

/**
 * sha256 hex (64 chars) of CONSENT_POLICY_TEXT. Hard-coded rather than computed
 * in the browser: it must equal the backend's currentPolicyHash() =
 * sha256(FP_CONSENT_POLICY.text), and this literal is exactly that value. This is
 * the binding the server checks (echo + refuse stale); it is NOT a client-local
 * fingerprint. Unit 9 injects the fetched hash instead. Regenerate with
 * `sha256(CONSENT_POLICY_TEXT)` if the text ever changes (validation test guards).
 */
export const CONSENT_POLICY_HASH =
  "f1e59c9c88b69213ead54edb7506e0a52ae4260cb8c764a9e734674e396c3727";

/**
 * Extra copy shown for the under-13 band: COPPA verifiable-parental-consent
 * emphasis. Returns null for older bands (differentiated messaging kept simple:
 * one added paragraph, same attestation model). This is supplementary UI copy,
 * NOT part of the hashed/echoed policy text.
 */
export function consentEmphasis(ageBand: AgeBand | null): string | null {
  if (ageBand === "under_13") {
    return "Because your child is under 13, US COPPA rules require verifiable parental consent. We confirm your email in the flow and record your explicit attestation below as that verifiable consent.";
  }
  return null;
}

/**
 * A rendered consent policy: everything needed to DISPLAY the notice and to ECHO
 * the exact version + hash the server records. Unit 9 fetches one of these from
 * the backend and injects it (via the screen / container `policy` prop) with zero
 * rewrite; Unit 8 uses DEFAULT_CONSENT_POLICY below.
 */
export interface RenderedConsentPolicy {
  namespace: string;
  version: string;
  hash: string;
  method: string;
  title: string;
  text: string;
}

/** The Unit-8 default policy: aligned byte-for-byte with the backend's current
 *  rendered policy so the echo reconciles without an API. */
export const DEFAULT_CONSENT_POLICY: RenderedConsentPolicy = {
  namespace: CONSENT_POLICY_NAMESPACE,
  version: CONSENT_POLICY_VERSION,
  hash: CONSENT_POLICY_HASH,
  method: CONSENT_METHOD,
  title: CONSENT_POLICY_TITLE,
  text: CONSENT_POLICY_TEXT,
};

/** The consent metadata bundle passed into `buildSubmission` (version + hash the
 *  submission echoes). Derived from the rendered policy so the echoed values are
 *  always exactly what was displayed. */
export const CONSENT_META = {
  policyNamespace: DEFAULT_CONSENT_POLICY.namespace,
  policyVersion: DEFAULT_CONSENT_POLICY.version,
  policyHash: DEFAULT_CONSENT_POLICY.hash,
  method: DEFAULT_CONSENT_POLICY.method,
} as const;

/** Derive the buildSubmission ConsentMeta from any rendered policy (Unit 9 seam). */
export function consentMetaFor(policy: RenderedConsentPolicy) {
  return {
    policyNamespace: policy.namespace,
    policyVersion: policy.version,
    policyHash: policy.hash,
    method: policy.method,
  };
}
