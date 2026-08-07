/**
 * Signup validation + submission-shape unit tests (Slice B Unit 8). Pure: no
 * DOM, no context, no network. Pins the backend-contract field names / enums and
 * the per-step gates the container relies on.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CHILD_PASSWORD_MIN,
  JURISDICTION_MAX,
  PARENT_PASSWORD_MIN,
  buildSubmission,
  canContinueAge,
  canContinueConsent,
  canContinueCredential,
  canContinueParent,
  computeAge,
  emptySignupData,
  isDobConsistentWithBand,
  isValidDob,
  isValidEmail,
  isValidJurisdiction,
  type AgeBand,
  type SignupData,
} from "../validation";
import {
  CONSENT_META,
  CONSENT_POLICY_HASH,
  CONSENT_POLICY_TEXT,
  CONSENT_POLICY_VERSION,
  DEFAULT_CONSENT_POLICY,
} from "../consentPolicy";

/** A DOB (yyyy-mm-dd) for a child who turns `age` today, so computeAge === age
 *  regardless of the calendar day the suite runs on (a birthday today counts). */
function dobForAge(age: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** A DOB the base fixture uses: age 14 keeps it consistent with `13_to_15`
 *  whatever calendar day the suite runs on. */
const BASE_DOB = dobForAge(14);

function base(): SignupData {
  return {
    ...emptySignupData(),
    parentName: "Sam Rivera",
    parentEmail: "sam@example.com",
    parentPassword: "a".repeat(PARENT_PASSWORD_MIN),
    childFirstName: "Alex",
    childPassword: "a".repeat(CHILD_PASSWORD_MIN),
    ageBand: "13_to_15",
    dob: BASE_DOB,
    jurisdiction: "California, US",
    consentAccepted: true,
  };
}

describe("field validators", () => {
  it("accepts a well-formed email and rejects obvious typos", () => {
    expect(isValidEmail("sam@example.com")).toBe(true);
    expect(isValidEmail("sam@example")).toBe(false);
    expect(isValidEmail("sam.example.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects an empty or future DOB", () => {
    expect(isValidDob("2011-05-04")).toBe(true);
    expect(isValidDob("")).toBe(false);
    expect(isValidDob("3000-01-01")).toBe(false);
  });

});

describe("per-step gates", () => {
  it("gates the parent step on name + email + password >= 8", () => {
    expect(canContinueParent(base())).toBe(true);
    expect(canContinueParent({ ...base(), parentPassword: "short" })).toBe(false);
    expect(canContinueParent({ ...base(), parentEmail: "nope" })).toBe(false);
    expect(canContinueParent({ ...base(), parentName: "  " })).toBe(false);
  });

  it("gates the age step on band + DOB + jurisdiction", () => {
    expect(canContinueAge(base())).toBe(true);
    expect(canContinueAge({ ...base(), ageBand: null })).toBe(false);
    expect(canContinueAge({ ...base(), dob: "" })).toBe(false);
    expect(canContinueAge({ ...base(), jurisdiction: "   " })).toBe(false);
  });

  it("gates the credential step on a first name AND a child password >= 10 (single path)", () => {
    expect(canContinueCredential(base())).toBe(true);
    expect(canContinueCredential({ ...base(), childPassword: "short" })).toBe(false);
    expect(canContinueCredential({ ...base(), childPassword: "" })).toBe(false);
    expect(canContinueCredential({ ...base(), childFirstName: "" })).toBe(false);
    expect(canContinueCredential({ ...base(), childFirstName: "   " })).toBe(false);
  });

  it("gates consent on the attestation checkbox", () => {
    expect(canContinueConsent(base())).toBe(true);
    expect(canContinueConsent({ ...base(), consentAccepted: false })).toBe(false);
  });
});

describe("consent policy is backend-echoable (version + hash)", () => {
  // Mirrors the backend's currentPolicyHash() = sha256(FP_CONSENT_POLICY.text).
  //
  // This baked-in snapshot is a LIVE submission path, not a placeholder: it is
  // rendered before fetchConsentPolicy() resolves and permanently whenever that
  // fetch fails. The backend refuses any non-current published version as
  // `stale`, so a snapshot that lags a backend policy bump refuses every parent
  // who attests on the fallback path. These assertions are the drift alarm.
  it("carries the exact backend consent version string", () => {
    expect(CONSENT_POLICY_VERSION).toBe("2026-08-05.1");
    expect(CONSENT_META.policyVersion).toBe("2026-08-05.1");
  });

  it("hash is the sha256 hex of the rendered text (== backend currentPolicyHash())", () => {
    // SELF-CONSISTENCY GUARD: the hash literal and the text literal can never
    // drift apart, whatever the policy text becomes.
    const recomputed = createHash("sha256").update(CONSENT_POLICY_TEXT, "utf8").digest("hex");
    expect(recomputed).toMatch(/^[0-9a-f]{64}$/); // the backend accept-schema shape
    expect(recomputed).toBe(CONSENT_POLICY_HASH);
    expect(CONSENT_META.policyHash).toBe(CONSENT_POLICY_HASH);
    expect(DEFAULT_CONSENT_POLICY.hash).toBe(recomputed);
    expect(DEFAULT_CONSENT_POLICY.text).toBe(CONSENT_POLICY_TEXT);
    // The exact value the backend's sha256(FP_CONSENT_POLICY.text) produces for
    // 2026-08-05.1 (verified byte-for-byte against The120's currentPolicyHash()).
    expect(CONSENT_POLICY_HASH).toBe(
      "447e9a31f1c2cc07715914879de56a90b8a778bc4093271e6b4685d477bc489a",
    );
  });

  it("renders the 2026-08-05.1 disclosures the backend text carries", () => {
    // Byte-identity is asserted by the hash above; these read as the human
    // check on WHAT drifted if it ever does.
    for (const phrase of [
      "creating an account for my child",
      "collecting a photo of my child",
      "third-party artificial intelligence image service",
      "comic book cover",
      "future photo my child chooses to upload from inside First Profit",
      "answers to the signup questions",
      "draft record that is created before the account exists",
      "birth year",
      "twelve months",
    ]) {
      expect(CONSENT_POLICY_TEXT).toContain(phrase);
    }
    expect(CONSENT_POLICY_TEXT).not.toContain("—"); // repo copy rule: no em dashes
  });
});

describe("jurisdiction bounds (backend min 2 / max 100)", () => {
  it("rejects a 1-char jurisdiction, accepts 2 chars, rejects >100", () => {
    expect(isValidJurisdiction("U")).toBe(false);
    expect(isValidJurisdiction("US")).toBe(true);
    expect(isValidJurisdiction("x".repeat(JURISDICTION_MAX))).toBe(true);
    expect(isValidJurisdiction("x".repeat(JURISDICTION_MAX + 1))).toBe(false);
    // Trimmed like the backend: surrounding whitespace does not pad the length.
    expect(isValidJurisdiction("  U  ")).toBe(false);
  });

  it("gates the age step on the same 2..100 jurisdiction bound", () => {
    expect(canContinueAge({ ...base(), jurisdiction: "U" })).toBe(false);
    expect(canContinueAge({ ...base(), jurisdiction: "US" })).toBe(true);
    expect(canContinueAge({ ...base(), jurisdiction: "x".repeat(JURISDICTION_MAX + 1) })).toBe(false);
  });
});

describe("DOB / age-band consistency (COPPA under-protection guard)", () => {
  it("computes whole-year age from the calendar parts", () => {
    const now = new Date(2026, 7, 1); // 2026-08-01, deterministic
    expect(computeAge("2013-08-01", now)).toBe(13); // birthday today counts
    expect(computeAge("2013-08-02", now)).toBe(12); // birthday tomorrow: not yet
    expect(computeAge("", now)).toBeNull();
    expect(computeAge("not-a-date", now)).toBeNull();
  });

  it("blocks a band/DOB mismatch and passes each consistent pair", () => {
    const pairs: { band: AgeBand; age: number }[] = [
      { band: "under_13", age: 8 },
      { band: "under_13", age: 12 },
      { band: "13_to_15", age: 13 },
      { band: "13_to_15", age: 15 },
      { band: "16_plus", age: 16 },
      { band: "16_plus", age: 20 },
    ];
    for (const { band, age } of pairs) {
      expect(isDobConsistentWithBand(dobForAge(age), band)).toBe(true);
      expect(canContinueAge({ ...base(), ageBand: band, dob: dobForAge(age) })).toBe(true);
    }
    // Self-contradictory: band 16_plus but a DOB making the child 8 (would also
    // wrongly skip the under-13 COPPA copy) — blocked.
    expect(isDobConsistentWithBand(dobForAge(8), "16_plus")).toBe(false);
    expect(canContinueAge({ ...base(), ageBand: "16_plus", dob: dobForAge(8) })).toBe(false);
    // Boundaries the other way.
    expect(isDobConsistentWithBand(dobForAge(13), "under_13")).toBe(false);
    expect(isDobConsistentWithBand(dobForAge(16), "13_to_15")).toBe(false);
    expect(isDobConsistentWithBand(dobForAge(12), "13_to_15")).toBe(false);
  });
});

describe("buildSubmission (backend-contract shape)", () => {
  it("carries the parent-set first name + password, no credential choice or provision address", () => {
    const sub = buildSubmission(base(), CONSENT_META);
    expect(sub.parent).toEqual({
      name: "Sam Rivera",
      email: "sam@example.com",
      password: "a".repeat(PARENT_PASSWORD_MIN),
    });
    // Single path (U15): the child sub-shape is exactly firstName + password +
    // ageBand + dob — no credentialChoice, no provisionAddress.
    expect(sub.child).toEqual({
      firstName: "Alex",
      password: "a".repeat(CHILD_PASSWORD_MIN),
      ageBand: "13_to_15",
      dob: BASE_DOB,
    });
    expect(sub.jurisdiction).toBe("California, US");
  });

  it("echoes the consent namespace / version / hash / method", () => {
    const sub = buildSubmission(base(), CONSENT_META);
    expect(sub.consent.accepted).toBe(true);
    expect(sub.consent.policyNamespace).toBe("fp_parental_consent");
    expect(sub.consent.policyVersion).toBe(CONSENT_META.policyVersion);
    expect(sub.consent.policyHash).toBe(CONSENT_META.policyHash);
    expect(sub.consent.method).toBe("email_plus_attestation");
  });

  it("refuses to emit a null ageBand (re-checks the age gate at submit)", () => {
    expect(() => buildSubmission({ ...base(), ageBand: null }, CONSENT_META)).toThrow(/ageBand/);
  });
});
