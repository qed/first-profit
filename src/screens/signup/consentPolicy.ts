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
export const CONSENT_POLICY_VERSION = "2026-08-05.1";

export const CONSENT_POLICY_TITLE = "Parental consent to create your child's account";

/**
 * The rendered policy body the parent reads and attests to. BYTE-IDENTICAL to the
 * backend FP_CONSENT_POLICY.text (consent-rules.ts) so its sha256 equals the
 * server's currentPolicyHash() and the echo reconciles. Do NOT edit this without
 * matching the backend text AND updating CONSENT_POLICY_HASH in the same change
 * (a validation test recomputes the hash and fails on drift). Unit 9 replaces
 * this constant with the fetched policy text.
 *
 * ⚠ THIS SNAPSHOT IS NOT DECORATIVE - IT IS A LIVE SUBMISSION PATH. It is what
 * the parent reads for the whole render window before `fetchConsentPolicy()`
 * resolves, and PERMANENTLY for any session where that fetch fails (the fetch
 * swallows errors and returns null, so we fall back here). The backend's
 * `consentVerdict` refuses ANY non-current published version as `stale`, so a
 * snapshot left behind a backend policy bump silently refuses every parent who
 * attests on the fallback path. When the backend bumps FP_CONSENT_POLICY, this
 * file bumps in the SAME change: version, text (verbatim), and hash.
 *
 * Current snapshot: backend 2026-08-05.1 (New User Flow v3, Unit 1) - adds the
 * photo -> third-party AI comic cover clause (including future uploads the child
 * starts from inside First Profit) and the answers/cover storage clause
 * (including the pre-account draft record), on top of 2026-08-03.1's wording.
 */
export const CONSENT_POLICY_TEXT =
  "I confirm I am the parent or legal guardian of the child named in this " +
  "signup, and I am at least 18 years old. I consent to First Profit creating " +
  "an account for my child so they can play and learn, and to First Profit " +
  "collecting and storing the limited information needed to run that account " +
  "(my child's first name, last name, age, age band, birth year - used only " +
  "to show age-appropriate wording - their saved game progress, and short " +
  "notes my child may choose to send about where they get stuck, which are " +
  "used only to improve First Profit and kept for up to twelve months). I " +
  "consent to First Profit collecting a photo of my child that I or my child " +
  "upload, and to that photo being sent to a third-party artificial " +
  "intelligence image service that draws a personalized comic book cover " +
  "starring my child; this covers the photo uploaded during signup and any " +
  "future photo my child chooses to upload from inside First Profit. I " +
  "consent to First Profit storing my child's answers to the signup questions " +
  "and the generated cover picture on my child's profile, including on the " +
  "draft record that is created before the account exists. I " +
  "understand this is a game-like business simulator for learners, that I can " +
  "review or delete my child's account by contacting First Profit, that I can " +
  "withdraw this photo consent at any time by contacting First Profit, and " +
  "that my " +
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
  "447e9a31f1c2cc07715914879de56a90b8a778bc4093271e6b4685d477bc489a";

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

/**
 * Build a RenderedConsentPolicy from the backend's fetched policy (Unit 9). The
 * server owns the binding fields (namespace / version / hash / method / text);
 * the TITLE is presentational only (not part of the hashed/echoed text), so it is
 * filled from the local constant. Returns null if any binding field is missing,
 * so the caller falls back to the aligned default rather than a half-formed
 * policy.
 */
export function renderedFromFetched(fetched: {
  namespace: string;
  version: string;
  hash: string;
  method: string;
  text: string;
}): RenderedConsentPolicy | null {
  if (
    !fetched.namespace ||
    !fetched.version ||
    !fetched.hash ||
    !fetched.method ||
    !fetched.text
  ) {
    return null;
  }
  return {
    namespace: fetched.namespace,
    version: fetched.version,
    hash: fetched.hash,
    method: fetched.method,
    title: CONSENT_POLICY_TITLE,
    text: fetched.text,
  };
}

/** Derive the buildSubmission ConsentMeta from any rendered policy (Unit 9 seam). */
export function consentMetaFor(policy: RenderedConsentPolicy) {
  return {
    policyNamespace: policy.namespace,
    policyVersion: policy.version,
    policyHash: policy.hash,
    method: policy.method,
  };
}
