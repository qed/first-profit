/**
 * Signup validation + submission-shape unit tests (Slice B Unit 8). Pure: no
 * DOM, no context, no network. Pins the backend-contract field names / enums and
 * the per-step gates the container relies on.
 */
import { describe, expect, it } from "vitest";
import {
  CHILD_PASSWORD_MIN,
  PARENT_PASSWORD_MIN,
  buildSubmission,
  canContinueAge,
  canContinueConsent,
  canContinueCredential,
  canContinueParent,
  derivedProvisionAddress,
  emptySignupData,
  isValidDob,
  isValidEmail,
  type SignupData,
} from "../validation";
import { CONSENT_META } from "../consentPolicy";

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
    dob: "2011-05-04",
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

  it("derives the provisioned address from the first name", () => {
    expect(derivedProvisionAddress("Alex")).toBe("alex@the120.school");
    expect(derivedProvisionAddress("  ")).toBe("student@the120.school");
    expect(derivedProvisionAddress("Ann-Marie")).toBe("annmarie@the120.school");
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
    expect(sub.child.dob).toBe("2011-05-04");
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
});
