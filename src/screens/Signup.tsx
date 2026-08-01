/**
 * Signup container (Slice B Unit 8) — the parent-facing Start Building flow.
 *
 * Holds signup-LOCAL state (React `useState`, NOT the game reducer): the parent
 * account fields, child credential choice + inputs, age band / DOB /
 * jurisdiction, consent acceptance, and a step cursor. It walks the four signup
 * screens and, on the final step, calls an INJECTED async submit stub with the
 * captured fields in the backend-contract shape (`buildSubmission`). Unit 9 drops
 * the real API calls (signup + email-verify wait + child-mint) into that same
 * seam; Unit 10 assembles this with the shared onboarding screens 2-5.
 *
 * Why local state, not the engine: `signup` is a LOGGED-OUT stage (kept out of
 * `isLoggedInStage`, Unit 7). There is no session, save, or tick during signup,
 * so nothing here touches GameContext except the injected `onExit` (a plain
 * stage route back to landing that App wires in).
 *
 * Copy rule (global product rule): NO em dashes anywhere.
 *
 * Mobile-first (CLAUDE.md, ~390px): the parchment card shell mirrors
 * `Onboarding.tsx` (single column, max-w-bounded, full-width below). The shared
 * screens own the field markup and CTAs; this shell owns the card, logo row, and
 * the 4-segment signup progress bar.
 */
import { useState } from "react";
import { LogoMark } from "./onboarding/screens";
import {
  AgeJurisdiction,
  ChildCredential,
  ConsentScreen,
  SignupIntro,
  SignupProgress,
} from "./signup/screens";
import {
  buildSubmission,
  emptySignupData,
  type SignupData,
  type SignupSubmission,
} from "./signup/validation";
import { CONSENT_META } from "./signup/consentPolicy";

/** The signup step cursor. `done` is the local post-submit confirmation. */
type Step = "parent" | "age" | "credential" | "consent" | "done";

const STEP_ORDER: Step[] = ["parent", "age", "credential", "consent"];
const TOTAL_STEPS = STEP_ORDER.length;

/** Result of the injected submit stub. Unit 9 returns the real backend outcome. */
export type SubmitResult = { ok: boolean };

export interface SignupProps {
  /**
   * Injected submit seam. Unit 8 defaults to a mock that resolves success so the
   * flow is walkable/testable; Unit 9 passes the real signup + child-mint calls.
   */
  onSubmitSignup?: (submission: SignupSubmission) => Promise<SubmitResult>;
  /** Route out of signup (back to landing). App wires this to SET_STAGE. */
  onExit?: () => void;
}

/** Default submit stub: resolves success (no backend in Unit 8; Unit 9 replaces). */
async function mockSubmit(submission: SignupSubmission): Promise<SubmitResult> {
  // The submission is intentionally dropped here; the seam exists so Unit 9 can
  // pass a real implementation without any change to the container.
  void submission;
  return { ok: true };
}

export function Signup({ onSubmitSignup = mockSubmit, onExit }: SignupProps) {
  const [step, setStep] = useState<Step>("parent");
  const [data, setData] = useState<SignupData>(emptySignupData);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const patch = (p: Partial<SignupData>) => setData((d) => ({ ...d, ...p }));

  const goBackFrom = (current: Step) => {
    const i = STEP_ORDER.indexOf(current);
    if (i <= 0) {
      onExit?.();
    } else {
      setStep(STEP_ORDER[i - 1]);
    }
  };

  const submit = async () => {
    // Synchronous double-submit guard: flip the flag before the await so a second
    // tap in the same tick is dropped, never issuing a duplicate submission.
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const result = await onSubmitSignup(buildSubmission(data, CONSENT_META));
      if (result.ok) {
        setStep("done");
      } else {
        setSubmitError(true);
      }
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  // The progress bar fills 1..4 across the four steps; the confirmation shows all
  // four filled.
  const filled = step === "done" ? TOTAL_STEPS : STEP_ORDER.indexOf(step) + 1;

  return (
    <main className="flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-[hsl(38_46%_95%)] px-4 py-8 text-ink">
      <div className="w-full max-w-[560px]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <LogoMark />
          <SignupProgress step={filled} total={TOTAL_STEPS} />
        </div>
        <div className="rounded-3xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] p-6 shadow-[0_2px_0_rgba(120,80,40,0.12),0_8px_24px_rgba(120,80,40,0.14)] sm:p-8">
          {step === "parent" && (
            <SignupIntro
              data={data}
              onChange={patch}
              onNext={() => setStep("age")}
              onBack={() => goBackFrom("parent")}
            />
          )}
          {step === "age" && (
            <AgeJurisdiction
              data={data}
              onChange={patch}
              onNext={() => setStep("credential")}
              onBack={() => goBackFrom("age")}
            />
          )}
          {step === "credential" && (
            <ChildCredential
              data={data}
              onChange={patch}
              onNext={() => setStep("consent")}
              onBack={() => goBackFrom("credential")}
            />
          )}
          {step === "consent" && (
            <>
              <ConsentScreen
                data={data}
                onChange={patch}
                onSubmit={submit}
                onBack={() => goBackFrom("consent")}
                submitting={submitting}
              />
              {submitError ? (
                <p
                  role="alert"
                  className="mt-3 rounded-xl border-l-4 border-goldleaf bg-goldleaf/10 px-3.5 py-3 text-sm leading-relaxed text-ink"
                >
                  Something went wrong creating the account. Please check your details and try again.
                </p>
              ) : null}
            </>
          )}
          {step === "done" && (
            <div className="text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-verified">
                Account requested
              </p>
              <h2 className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
                Check your email.
              </h2>
              <p className="mt-2 text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
                We sent a confirmation link to <b className="text-[hsl(25_34%_20%)]">{data.parentEmail}</b>.
                Open it to finish setting up your child's account.
              </p>
            </div>
          )}
        </div>

        {step !== "done" ? (
          <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-wider text-[hsl(30_6%_52%)]">
            A grown-up sets up every account
          </p>
        ) : null}
      </div>
    </main>
  );
}
