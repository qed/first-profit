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
  derivedProvisionAddress,
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
    credentialChoice: "existing_credential",
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

  it("derives the provisioned address from the first name, aligned with the backend first-name-only slug", () => {
    expect(derivedProvisionAddress("Alex")).toBe("alex@the120.school");
    expect(derivedProvisionAddress("  ")).toBe("student@the120.school");
    // Separators level to a single hyphen (matching the backend), NOT stripped.
    expect(derivedProvisionAddress("Ann-Marie")).toBe("ann-marie@the120.school");
    expect(derivedProvisionAddress("Mary  Kate")).toBe("mary-kate@the120.school");
    // Diacritics fold rather than drop (backend foldToAscii parity).
    expect(derivedProvisionAddress("José")).toBe("jose@the120.school");
    expect(derivedProvisionAddress("Zoë")).toBe("zoe@the120.school");
    expect(derivedProvisionAddress("Weiß")).toBe("weiss@the120.school");
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

  it("path a requires child password >= 10; path b does not", () => {
    expect(canContinueCredential(base())).toBe(true);
    expect(canContinueCredential({ ...base(), childPassword: "short" })).toBe(false);
    // Path b: no password needed, but still needs a first name.
    const provision: SignupData = {
      ...base(),
      credentialChoice: "provision_workspace",
      childPassword: "",
    };
    expect(canContinueCredential(provision)).toBe(true);
    expect(canContinueCredential({ ...provision, childFirstName: "" })).toBe(false);
  });

  it("gates consent on the attestation checkbox", () => {
    expect(canContinueConsent(base())).toBe(true);
    expect(canContinueConsent({ ...base(), consentAccepted: false })).toBe(false);
  });
});

describe("consent policy is backend-echoable (version + hash)", () => {
  // Mirrors the backend's currentPolicyHash() = sha256(FP_CONSENT_POLICY.text).
  it("carries the exact backend consent version string", () => {
    expect(CONSENT_POLICY_VERSION).toBe("2026-08-01.1");
    expect(CONSENT_META.policyVersion).toBe("2026-08-01.1");
  });

  it("hash is the sha256 hex of the rendered text (== backend currentPolicyHash())", () => {
    const recomputed = createHash("sha256").update(CONSENT_POLICY_TEXT, "utf8").digest("hex");
    expect(recomputed).toMatch(/^[0-9a-f]{64}$/); // the backend accept-schema shape
    expect(recomputed).toBe(CONSENT_POLICY_HASH);
    expect(CONSENT_META.policyHash).toBe(CONSENT_POLICY_HASH);
    // The exact value the backend's sha256(FP_CONSENT_POLICY.text) produces.
    expect(CONSENT_POLICY_HASH).toBe(
      "f1e59c9c88b69213ead54edb7506e0a52ae4260cb8c764a9e734674e396c3727",
    );
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
  it("path a carries a child password and a null provision address", () => {
    const sub = buildSubmission(base(), CONSENT_META);
    expect(sub.parent).toEqual({
      name: "Sam Rivera",
      email: "sam@example.com",
      password: "a".repeat(PARENT_PASSWORD_MIN),
    });
    expect(sub.child.credentialChoice).toBe("existing_credential");
    expect(sub.child.password).toBe("a".repeat(CHILD_PASSWORD_MIN));
    expect(sub.child.provisionAddress).toBeNull();
    expect(sub.child.ageBand).toBe("13_to_15");
    expect(sub.child.dob).toBe(BASE_DOB);
    expect(sub.jurisdiction).toBe("California, US");
  });

  it("path b carries a provision address and a null password", () => {
    const provision: SignupData = {
      ...base(),
      credentialChoice: "provision_workspace",
      childPassword: "",
      ageBand: "under_13",
    };
    const sub = buildSubmission(provision, CONSENT_META);
    expect(sub.child.credentialChoice).toBe("provision_workspace");
    expect(sub.child.password).toBeNull();
    expect(sub.child.provisionAddress).toBe("alex@the120.school");
    expect(sub.child.ageBand).toBe("under_13");
  });

  it("echoes the consent namespace / version / hash / method", () => {
    const sub = buildSubmission(base(), CONSENT_META);
    expect(sub.consent.accepted).toBe(true);
    expect(sub.consent.policyNamespace).toBe("fp_parental_consent");
    expect(sub.consent.policyVersion).toBe(CONSENT_META.policyVersion);
    expect(sub.consent.policyHash).toBe(CONSENT_META.policyHash);
    expect(sub.consent.method).toBe("email_plus_attestation");
  });

  it("nulls a STALE childPassword on the provision path (pins the Unit 9 contract)", () => {
    // The parent typed a password on path a, then switched to provision: the
    // stale value must NOT leak. A regression to `password: d.childPassword` fails.
    const stale: SignupData = {
      ...base(),
      credentialChoice: "provision_workspace",
      childPassword: "leftoverpass",
    };
    const sub = buildSubmission(stale, CONSENT_META);
    expect(sub.child.password).toBeNull();
    expect(sub.child.provisionAddress).toBe("alex@the120.school");
  });

  it("nulls the provision address on path a even with a first name that would derive one", () => {
    const sub = buildSubmission({ ...base(), childFirstName: "Robin" }, CONSENT_META);
    // derivedProvisionAddress("Robin") would be robin@the120.school — must stay null.
    expect(sub.child.provisionAddress).toBeNull();
    expect(sub.child.password).toBe("a".repeat(CHILD_PASSWORD_MIN));
  });

  it("refuses to emit a null ageBand (re-checks the age gate at submit)", () => {
    expect(() => buildSubmission({ ...base(), ageBand: null }, CONSENT_META)).toThrow(/ageBand/);
  });
});
