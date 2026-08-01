/**
 * Signup screens (Slice B Unit 8, R14 / R12 / R15) — PURE, props-driven.
 *
 * These are the parent-facing Start Building screens. Each one takes its data +
 * change handlers + navigation via props and reaches into NO React context, no
 * game state, and no network: the `Signup` container owns signup-LOCAL state and
 * wires these together. This is the same decoupling the Unit-7 onboarding screens
 * use, so the flow is walkable and unit-testable from props alone.
 *
 * Screens here:
 *   1 · SignupIntro       (parent account: name + email + password, value prop)
 *   2 · AgeJurisdiction   (age band + DOB + parent-declared jurisdiction)
 *   3 · ChildCredential   (path a: first name + password >=10 | path b: provision)
 *   4 · ConsentScreen     (rendered versioned policy + attestation gate)
 *
 * Copy rule (global product rule): NO em dashes anywhere.
 *
 * Mobile-first (CLAUDE.md, ~390px): single column, inputs are w-full, every
 * interactive control is >=44px tall, no fixed widths beyond the card. Desktop
 * is layered with `sm:`. The shared GreenCta/BackLink primitives come from the
 * onboarding module so both flows share one CTA implementation.
 */
import { useState } from "react";
import { BackLink, GreenCta, PHASE_COLORS } from "../onboarding/screens";
import {
  CHILD_FIRST_NAME_MAX,
  CHILD_PASSWORD_MIN,
  JURISDICTION_MAX,
  PARENT_NAME_MAX,
  PARENT_PASSWORD_MIN,
  canContinueAge,
  canContinueConsent,
  canContinueCredential,
  canContinueParent,
  derivedProvisionAddress,
  isChildPasswordValid,
  isDobConsistentWithBand,
  isValidDob,
  type AgeBand,
  type CredentialChoice,
  type SignupData,
} from "./validation";
import {
  DEFAULT_CONSENT_POLICY,
  consentEmphasis,
  type RenderedConsentPolicy,
} from "./consentPolicy";

// ── Small shared field primitives (kept local to the signup module) ──────────

const LABEL_CLS =
  "mb-1.5 block font-mono text-[11px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]";
const INPUT_CLS =
  "min-h-[48px] w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 font-display text-[17px] font-bold text-[hsl(25_34%_20%)] outline-none focus:border-[hsl(25_34%_20%/0.4)]";
const HINT_CLS = "mt-1.5 block text-[12px] leading-[1.5] text-[hsl(25_20%_38%)]";

function StepKicker({ text, color }: { text: string; color: string }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color }}>
      {text}
    </p>
  );
}

/**
 * A labeled field wrapper. The `<label>` carries ONLY the label text and is
 * associated via `htmlFor` (input as a sibling, not wrapped), so the input's
 * accessible name is exactly the label — getByLabelText resolves cleanly and no
 * hint/toggle text leaks into the accessible name.
 */
function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className ?? "mt-4"}>
      <label htmlFor={id} className={LABEL_CLS}>
        {label}
      </label>
      {children}
      {hint ? <span className={HINT_CLS}>{hint}</span> : null}
    </div>
  );
}

/** A plain single-line text/email/date input inside a Field. */
function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  hint,
  className,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  hint?: React.ReactNode;
  className?: string;
  maxLength?: number;
}) {
  return (
    <Field id={id} label={label} hint={hint} className={className}>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        autoCapitalize={type === "email" ? "none" : undefined}
        autoCorrect={type === "email" ? "off" : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLS}
      />
    </Field>
  );
}

/**
 * A password input with a show/hide toggle. Presentational: the value + change
 * are lifted to the caller so validation stays in the container.
 */
function PasswordField({
  id,
  label,
  value,
  onChange,
  hint,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: React.ReactNode;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field id={id} label={label} hint={hint}>
      <span className="relative block">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(e) => onChange(e.target.value)}
          className={`${INPUT_CLS} pr-16`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-pressed={show}
          className="absolute right-1 top-1/2 flex min-h-[44px] -translate-y-1/2 items-center rounded-lg px-3 font-mono text-[11px] uppercase tracking-wider text-[hsl(25_20%_38%)] hover:text-ink"
        >
          {show ? "Hide" : "Show"}
        </button>
      </span>
    </Field>
  );
}

/** The 4-segment signup progress bar (mirrors the onboarding ProgressBar). */
export function SignupProgress({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5" aria-label={`Step ${step} of ${total}`} role="img">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="h-1.5 w-6 rounded-full transition-colors sm:w-7"
          style={{ background: i < step ? PHASE_COLORS[i % PHASE_COLORS.length] : "hsl(30 12% 12% / .15)" }}
        />
      ))}
    </div>
  );
}

// ── Screen 1 · Signup intro / parent account ─────────────────────────────────

export interface SignupIntroProps {
  data: SignupData;
  onChange: (patch: Partial<SignupData>) => void;
  onNext: () => void;
  /** Leave signup (back to landing). Screen 1 is the first step, so back exits. */
  onBack: () => void;
}

export function SignupIntro({ data, onChange, onNext, onBack }: SignupIntroProps) {
  const canContinue = canContinueParent(data);
  return (
    <>
      <StepKicker text="Step 1 of 4 · Your grown-up account" color="hsl(14 78% 44%)" />
      <h1 className="mt-2 font-display text-[28px] font-extrabold leading-[1.15] text-[hsl(25_34%_20%)]">
        Create your child's account.
      </h1>
      <p className="mt-2 text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
        You set this up, you stay in control. First Profit turns a real, tiny business into a guided
        game. You are the coach and the verifier, your child is the founder.
      </p>

      <TextField
        id="fp-parent-name"
        label="Your name"
        value={data.parentName}
        onChange={(v) => onChange({ parentName: v })}
        autoComplete="name"
        placeholder="Sam Rivera"
        maxLength={PARENT_NAME_MAX}
        className="mt-6"
      />

      <TextField
        id="fp-parent-email"
        label="Your email"
        type="email"
        value={data.parentEmail}
        onChange={(v) => onChange({ parentEmail: v })}
        autoComplete="email"
        placeholder="you@example.com"
        hint="We send a link here to confirm it is really you. This is the account that controls everything."
      />

      <PasswordField
        id="fp-parent-password"
        label="Create a password"
        value={data.parentPassword}
        onChange={(v) => onChange({ parentPassword: v })}
        autoComplete="new-password"
        hint={`At least ${PARENT_PASSWORD_MIN} characters.`}
      />

      <GreenCta onClick={onNext} disabled={!canContinue}>
        Continue →
      </GreenCta>
      <BackLink onClick={onBack} />
    </>
  );
}

// ── Screen 2 · Age + jurisdiction ────────────────────────────────────────────

const AGE_BANDS: { value: AgeBand; label: string; note: string }[] = [
  { value: "under_13", label: "Under 13", note: "Extra consent steps apply" },
  { value: "13_to_15", label: "13 to 15", note: "" },
  { value: "16_plus", label: "16 or older", note: "" },
];

export interface AgeJurisdictionProps {
  data: SignupData;
  onChange: (patch: Partial<SignupData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function AgeJurisdiction({ data, onChange, onNext, onBack }: AgeJurisdictionProps) {
  const canContinue = canContinueAge(data);
  // Only warn once the parent has entered a usable DOB and picked a band: a valid
  // but band-inconsistent pair (e.g. band 16+ with a DOB making the child 8) must
  // be corrected before continue, and must never bank a self-contradictory record.
  const bandMismatch =
    data.ageBand !== null &&
    isValidDob(data.dob) &&
    !isDobConsistentWithBand(data.dob, data.ageBand);
  return (
    <>
      <StepKicker text="Step 2 of 4 · Your child" color="hsl(217 74% 46%)" />
      <h2 className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
        A little about your founder.
      </h2>
      <p className="mt-2 text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
        This sets the right privacy protections. We never put an age on the public website.
      </p>

      <div className="mt-6">
        <p className={LABEL_CLS} id="fp-age-band-label">
          Age band
        </p>
        <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby="fp-age-band-label">
          {AGE_BANDS.map((band) => {
            const selected = data.ageBand === band.value;
            return (
              <button
                key={band.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ ageBand: band.value })}
                className={`flex min-h-[52px] w-full items-center justify-between rounded-xl border-2 px-4 text-left transition-colors ${
                  selected
                    ? "border-verified bg-[hsl(150_52%_42%/0.08)]"
                    : "border-[hsl(25_34%_20%/0.15)] bg-white hover:border-[hsl(25_34%_20%/0.3)]"
                }`}
              >
                <span className="font-display text-[17px] font-bold text-[hsl(25_34%_20%)]">
                  {band.label}
                </span>
                {band.note ? (
                  <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.06em] text-[hsl(25_20%_38%)]">
                    {band.note}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className={`ml-3 h-4 w-4 rounded-full border-2 ${
                      selected ? "border-verified bg-verified" : "border-[hsl(25_34%_20%/0.25)]"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <TextField
        id="fp-child-dob"
        label="Date of birth"
        type="date"
        value={data.dob}
        onChange={(v) => onChange({ dob: v })}
        hint={
          bandMismatch ? (
            <span role="alert" className="text-sell">
              This date of birth does not match the age band you picked. Please check the band or the
              date.
            </span>
          ) : undefined
        }
      />

      <TextField
        id="fp-jurisdiction"
        label="Where do you live?"
        value={data.jurisdiction}
        onChange={(v) => onChange({ jurisdiction: v })}
        autoComplete="country-name"
        placeholder="Country or state"
        maxLength={JURISDICTION_MAX}
      />

      <GreenCta onClick={onNext} disabled={!canContinue}>
        Continue →
      </GreenCta>
      <BackLink onClick={onBack} />
    </>
  );
}

// ── Screen 3 · Child credential (path a / path b) ────────────────────────────

export interface ChildCredentialProps {
  data: SignupData;
  onChange: (patch: Partial<SignupData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function ChildCredential({ data, onChange, onNext, onBack }: ChildCredentialProps) {
  const canContinue = canContinueCredential(data);
  const setChoice = (credentialChoice: CredentialChoice) => onChange({ credentialChoice });
  const isProvision = data.credentialChoice === "provision_workspace";
  const pwEntered = data.childPassword.length > 0;
  const pwTooShort = pwEntered && !isChildPasswordValid(data.childPassword);

  return (
    <>
      <StepKicker text="Step 3 of 4 · How they log in" color="hsl(265 52% 48%)" />
      <h2 className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
        How will your child sign in?
      </h2>
      <p className="mt-2 text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
        Only a first name ever goes on the public website. Pick how they log in.
      </p>

      <TextField
        id="fp-child-first-name"
        label="Child's first name"
        value={data.childFirstName}
        onChange={(v) => onChange({ childFirstName: v })}
        autoComplete="off"
        placeholder="Alex"
        maxLength={CHILD_FIRST_NAME_MAX}
        className="mt-6"
      />

      <div
        className="mt-5 grid grid-cols-1 gap-2"
        role="radiogroup"
        aria-label="Login method"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!isProvision}
          onClick={() => setChoice("existing_credential")}
          className={`min-h-[52px] rounded-xl border-2 px-4 py-3 text-left transition-colors ${
            !isProvision
              ? "border-verified bg-[hsl(150_52%_42%/0.08)]"
              : "border-[hsl(25_34%_20%/0.15)] bg-white hover:border-[hsl(25_34%_20%/0.3)]"
          }`}
        >
          <span className="block font-display text-[16px] font-bold text-[hsl(25_34%_20%)]">
            Set a password now
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
            You choose a first name and password. Your child logs in with those.
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={isProvision}
          onClick={() => setChoice("provision_workspace")}
          className={`min-h-[52px] rounded-xl border-2 px-4 py-3 text-left transition-colors ${
            isProvision
              ? "border-verified bg-[hsl(150_52%_42%/0.08)]"
              : "border-[hsl(25_34%_20%/0.15)] bg-white hover:border-[hsl(25_34%_20%/0.3)]"
          }`}
        >
          <span className="block font-display text-[16px] font-bold text-[hsl(25_34%_20%)]">
            Give them a school email
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
            We create a managed {"@" + "the120.school"} address. No password to pick now.
          </span>
        </button>
      </div>

      {!isProvision ? (
        <PasswordField
          id="fp-child-password"
          label="Password for your child"
          value={data.childPassword}
          onChange={(v) => onChange({ childPassword: v })}
          autoComplete="new-password"
          hint={
            pwTooShort ? (
              <span className="text-sell">At least {CHILD_PASSWORD_MIN} characters. Keep going.</span>
            ) : (
              `At least ${CHILD_PASSWORD_MIN} characters, so it is safe for a kid to use.`
            )
          }
        />
      ) : (
        <div className="mt-4 rounded-xl border-2 border-dashed border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
            Their address will look like
          </p>
          <p className="mt-1 break-all font-mono text-[14px] font-bold text-[hsl(25_34%_20%)]">
            {derivedProvisionAddress(data.childFirstName)}
          </p>
          <p className="mt-2 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
            We set it up after you finish. You will get the sign-in details by email. Nothing to
            remember right now.
          </p>
        </div>
      )}

      <GreenCta onClick={onNext} disabled={!canContinue}>
        Continue →
      </GreenCta>
      <BackLink onClick={onBack} />
    </>
  );
}

// ── Screen 4 · Consent ───────────────────────────────────────────────────────

export interface ConsentScreenProps {
  data: SignupData;
  onChange: (patch: Partial<SignupData>) => void;
  onSubmit: () => void;
  onBack: () => void;
  /** True while the injected submit stub is in flight (double-submit guard). */
  submitting: boolean;
  /**
   * The rendered policy the parent attests to (title + version + text). Defaults
   * to the Unit-8 backend-aligned policy; Unit 9 injects the fetched policy so the
   * text shown and the version/hash echoed are exactly what the server records.
   */
  policy?: RenderedConsentPolicy;
}

export function ConsentScreen({
  data,
  onChange,
  onSubmit,
  onBack,
  submitting,
  policy = DEFAULT_CONSENT_POLICY,
}: ConsentScreenProps) {
  const emphasis = consentEmphasis(data.ageBand);
  const canSubmit = canContinueConsent(data) && !submitting;
  return (
    <>
      <StepKicker text="Step 4 of 4 · Your consent" color="hsl(150 52% 32%)" />
      <h2 className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
        Your permission to begin.
      </h2>
      <p className="mt-2 text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
        Please read this and confirm. This is what you are agreeing to.
      </p>

      <div className="mt-5 rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white">
        <div className="flex items-center justify-between border-b-2 border-[hsl(25_34%_20%/0.1)] px-4 py-2.5">
          <p className="font-display text-[15px] font-bold text-[hsl(25_34%_20%)]">
            {policy.title}
          </p>
          <span className="ml-3 shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[hsl(25_20%_38%)]">
            v{policy.version}
          </span>
        </div>
        <div className="max-h-56 overflow-y-auto px-4 py-3.5">
          {emphasis ? (
            <p className="mb-2.5 rounded-lg bg-[hsl(14_78%_54%/0.08)] px-3 py-2 text-[12.5px] font-semibold leading-[1.5] text-[hsl(14_78%_38%)]">
              {emphasis}
            </p>
          ) : null}
          <p className="text-[13px] leading-[1.6] text-[hsl(25_20%_38%)]">{policy.text}</p>
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-4 py-3.5">
        <input
          type="checkbox"
          checked={data.consentAccepted}
          onChange={(e) => onChange({ consentAccepted: e.target.checked })}
          className="mt-0.5 h-6 w-6 shrink-0 accent-verified"
        />
        <span className="text-[13.5px] font-semibold leading-[1.5] text-[hsl(25_34%_20%)]">
          I am the parent or legal guardian, and I consent to the terms above for my child.
        </span>
      </label>

      <GreenCta onClick={onSubmit} disabled={!canSubmit}>
        {submitting ? "Creating account..." : "Create my child's account →"}
      </GreenCta>
      <BackLink onClick={onBack} />
    </>
  );
}
