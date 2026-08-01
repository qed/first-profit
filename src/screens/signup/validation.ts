/**
 * Signup validation + the backend-contract submission shape (Slice B Unit 8).
 *
 * Pure, React-free, side-effect-free: every function here is a deterministic
 * function of its inputs, so the signup screens and the container can be tested
 * without a DOM, a session, or a network. The field names and enum values below
 * MUST match the Units 1-6 backend contract exactly (they map to
 * `fp_parental_consent` / child-create / provisioning) — do NOT rename them.
 *
 * Copy rule (global product rule): NO em dashes anywhere.
 */

/**
 * R12 credential path. `existing_credential` = parent sets the child's first
 * name + a password (path a). `provision_workspace` = request a provisioned
 * @the120.school address, no password (path b). Values match the backend enum.
 */
export type CredentialChoice = "existing_credential" | "provision_workspace";

/** Revision 5 age band. Values match the backend `child_age_band` enum. */
export type AgeBand = "under_13" | "13_to_15" | "16_plus";

/** Child password floor, mirroring The120 `validateStudentPassword` (min 10). */
export const CHILD_PASSWORD_MIN = 10;

/** Parent password floor (plan Unit 8: name/email/password >= 8). */
export const PARENT_PASSWORD_MIN = 8;

/** The Workspace domain a provisioned (path b) child address lands under. */
export const PROVISION_DOMAIN = "the120.school";

/**
 * The signup-LOCAL state the container owns and every screen reads/writes via
 * props. Not the game reducer: this never touches the engine, save, or session.
 */
export interface SignupData {
  parentName: string;
  parentEmail: string;
  parentPassword: string;
  childFirstName: string;
  credentialChoice: CredentialChoice;
  childPassword: string;
  ageBand: AgeBand | null;
  dob: string; // ISO yyyy-mm-dd from a native date input
  jurisdiction: string;
  consentAccepted: boolean;
}

/** A blank signup-local state (path a is the default credential choice). */
export function emptySignupData(): SignupData {
  return {
    parentName: "",
    parentEmail: "",
    parentPassword: "",
    childFirstName: "",
    credentialChoice: "existing_credential",
    childPassword: "",
    ageBand: null,
    dob: "",
    jurisdiction: "",
    consentAccepted: false,
  };
}

// A deliberately permissive, dependency-free email check: one @, a dot in the
// domain, no spaces. Real verification is the in-flow email round-trip (Unit 9),
// so this only catches obvious typos, never enforces deliverability.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Slug a first name for a handle / provisioned-address local-part. */
export function slugifyName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The provisioned (path b) address preview. Format only — the real address is
 * minted server-side (Unit 5); this shows the parent the shape they will get.
 */
export function derivedProvisionAddress(firstName: string): string {
  return `${slugifyName(firstName) || "student"}@${PROVISION_DOMAIN}`;
}

/** True once the child's own password clears the min-length floor (path a). */
export function isChildPasswordValid(password: string): boolean {
  return password.length >= CHILD_PASSWORD_MIN;
}

/** True once the parent's password clears its min-length floor. */
export function isParentPasswordValid(password: string): boolean {
  return password.length >= PARENT_PASSWORD_MIN;
}

/** A DOB is usable when it parses and is not in the future. */
export function isValidDob(dob: string): boolean {
  if (!dob) return false;
  const t = Date.parse(dob);
  if (Number.isNaN(t)) return false;
  return t <= Date.now();
}

// ── Per-step "can continue" gates (drive the CTA enabled/disabled state) ──

export function canContinueParent(d: SignupData): boolean {
  return (
    d.parentName.trim().length > 0 &&
    isValidEmail(d.parentEmail) &&
    isParentPasswordValid(d.parentPassword)
  );
}

export function canContinueAge(d: SignupData): boolean {
  return d.ageBand !== null && isValidDob(d.dob) && d.jurisdiction.trim().length > 0;
}

export function canContinueCredential(d: SignupData): boolean {
  if (d.childFirstName.trim().length === 0) return false;
  if (d.credentialChoice === "existing_credential") {
    return isChildPasswordValid(d.childPassword);
  }
  // provision_workspace: no password is entered on this path.
  return true;
}

export function canContinueConsent(d: SignupData): boolean {
  return d.consentAccepted === true;
}

// ── Backend-contract submission shape (what onSubmitSignup receives) ──

export interface SignupSubmission {
  parent: {
    name: string;
    email: string;
    password: string;
  };
  child: {
    firstName: string;
    credentialChoice: CredentialChoice;
    /** Path a only; null on the provision path (no password entered). */
    password: string | null;
    /** Path b only; null on the credential path. Format preview of the address. */
    provisionAddress: string | null;
    ageBand: AgeBand;
    dob: string;
  };
  jurisdiction: string;
  consent: {
    accepted: boolean;
    policyNamespace: string;
    policyVersion: string;
    policyHash: string;
    method: string;
  };
}

/** Metadata about the rendered consent policy the parent accepted. */
export interface ConsentMeta {
  policyNamespace: string;
  policyVersion: string;
  policyHash: string;
  method: string;
}

/**
 * Assemble the backend-contract payload from signup-local state. Path a carries
 * a child password and no provision address; path b carries a provision-address
 * preview and a null password. `ageBand` is asserted non-null here because the
 * container only submits once every step gate (incl. `canContinueAge`) passed.
 */
export function buildSubmission(d: SignupData, consent: ConsentMeta): SignupSubmission {
  const isProvision = d.credentialChoice === "provision_workspace";
  return {
    parent: {
      name: d.parentName.trim(),
      email: d.parentEmail.trim(),
      password: d.parentPassword,
    },
    child: {
      firstName: d.childFirstName.trim(),
      credentialChoice: d.credentialChoice,
      password: isProvision ? null : d.childPassword,
      provisionAddress: isProvision ? derivedProvisionAddress(d.childFirstName) : null,
      ageBand: d.ageBand as AgeBand,
      dob: d.dob,
    },
    jurisdiction: d.jurisdiction.trim(),
    consent: {
      accepted: d.consentAccepted,
      policyNamespace: consent.policyNamespace,
      policyVersion: consent.policyVersion,
      policyHash: consent.policyHash,
      method: consent.method,
    },
  };
}
