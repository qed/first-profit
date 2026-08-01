/**
 * Signup container (Slice B Unit 8 shell; Unit 9 wires the real backend).
 *
 * Holds signup-LOCAL state (React `useState`, NOT the game reducer): the parent
 * account fields, child credential choice + inputs, age band / DOB /
 * jurisdiction, consent acceptance, and a step cursor. It walks the four signup
 * screens and, on the final step, calls the injected `onSubmitSignup` with the
 * captured fields in the backend-contract shape (`buildSubmission`).
 *
 * ── Unit 9: the email round-trip ──
 * `onSubmitSignup` now performs the signup START (create the parent account with
 * a random password + send the verification email; NO session yet) and returns
 * `{ ok, attemptId? }`. On success the container:
 *   1. persists the pending signup (attempt id + which child to mint) so it
 *      survives the email link's fresh page load (see `pendingStore`), then
 *   2. shows the "check your email" WAIT screen.
 * The parent clicks the emailed link → the app boots at `/signup/verify?token=..`
 * → App reads the token and re-mounts this container with `verifyToken` set,
 * which renders the VERIFY-RETURN screen: it re-prompts the parent password (the
 * password was never persisted; on a fresh load / different tab it is not in
 * memory), then calls `onCompleteVerification` (verify → adopt parent session →
 * mint child → path a: log the child in and hand off to the game; path b: show
 * the "account created, watch for the setup email" confirmation).
 *
 * Why local state, not the engine: `signup` is a LOGGED-OUT stage (kept out of
 * `isLoggedInStage`, Unit 7). There is no session, save, or tick during signup;
 * the child session is adopted by the game's `login()` only AFTER the mint (path
 * a), at which point the stage leaves `signup` and this container unmounts.
 *
 * Copy rule (global product rule): NO em dashes anywhere.
 *
 * Mobile-first (CLAUDE.md, ~390px): the parchment card shell is single column,
 * max-w-bounded, full-width below; every interactive control is >=44px tall.
 */
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "./onboarding/screens";
import { BackLink, GreenCta } from "./onboarding/screens";
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
  type CredentialChoice,
  type SignupData,
  type SignupSubmission,
} from "./signup/validation";
import {
  DEFAULT_CONSENT_POLICY,
  consentMetaFor,
  type RenderedConsentPolicy,
} from "./signup/consentPolicy";
import {
  clearPendingSignup,
  loadPendingSignup,
  savePendingSignup,
} from "./signup/pendingStore";

/** The signup step cursor. `done` is the local email-verify WAIT screen. */
type Step = "parent" | "age" | "credential" | "consent" | "done";

const STEP_ORDER: Step[] = ["parent", "age", "credential", "consent"];
const TOTAL_STEPS = STEP_ORDER.length;

/** Result of the injected START stub. Unit 9 returns the real backend outcome:
 *  `attemptId` is the handle the verify-return carries to the child-mint call. */
export type SubmitResult = { ok: boolean; attemptId?: string | null };

/** What the injected verify-return handler reports back to the container. */
export type CompleteVerificationResult = {
  ok: boolean;
  /** `playing` = the child was logged in and the game took over (this container
   *  will unmount); `confirmation` = show the "watch for the setup email" screen. */
  outcome?: "playing" | "confirmation";
};

export interface CompleteVerificationRequest {
  token: string;
  parentEmail: string;
  parentPassword: string;
  attemptId: string;
  child: { firstName: string; credentialChoice: CredentialChoice; password: string };
}

export interface SignupProps {
  /**
   * Injected START seam. Unit 8 defaults to a mock that resolves success so the
   * flow is walkable/testable; Unit 9 passes the real signup START call, which
   * sends the verification email and returns the attempt id.
   */
  onSubmitSignup?: (submission: SignupSubmission) => Promise<SubmitResult>;
  /** Route out of signup (back to landing). App wires this to SET_STAGE. */
  onExit?: () => void;
  /**
   * The rendered consent policy the parent attests to. App fetches it from the
   * backend (text + version + hash) and injects it, so what is displayed and what
   * is echoed on submit are exactly what the server records. Defaults to the
   * backend-aligned local policy when the fetch is unavailable.
   */
  policy?: RenderedConsentPolicy;
  /**
   * When set (App read it from the `/signup/verify?token=` deep link), the
   * container renders the VERIFY-RETURN screen instead of the step flow.
   */
  verifyToken?: string;
  /**
   * Injected verify-return handler (Unit 9): verify the email + adopt the parent
   * session, mint the child, and either log the child in (path a) or resolve to a
   * confirmation (path b). Only called from the verify-return screen.
   */
  onCompleteVerification?: (
    req: CompleteVerificationRequest,
  ) => Promise<CompleteVerificationResult>;
}

/** Default START stub: resolves success (no backend in Unit 8; Unit 9 replaces). */
async function mockSubmit(submission: SignupSubmission): Promise<SubmitResult> {
  void submission;
  return { ok: true };
}

/** The parchment card shell shared by the step flow and the verify-return. */
function SignupShell({ filled, children }: { filled: number; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-[hsl(38_46%_95%)] px-4 py-8 text-ink">
      <div className="w-full max-w-[560px]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <LogoMark />
          <SignupProgress step={filled} total={TOTAL_STEPS} />
        </div>
        <div className="rounded-3xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] p-6 shadow-[0_2px_0_rgba(120,80,40,0.12),0_8px_24px_rgba(120,80,40,0.14)] sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}

export function Signup({
  onSubmitSignup = mockSubmit,
  onExit,
  policy = DEFAULT_CONSENT_POLICY,
  verifyToken,
  onCompleteVerification,
}: SignupProps) {
  // Verify-return takes over the whole container: the parent is returning from
  // the email link, not walking the form. Rendered inside the shared shell.
  if (verifyToken) {
    return (
      <SignupShell filled={TOTAL_STEPS}>
        <VerifyReturn token={verifyToken} onComplete={onCompleteVerification} onExit={onExit} />
      </SignupShell>
    );
  }
  return (
    <SignupStepFlow onSubmitSignup={onSubmitSignup} onExit={onExit} policy={policy} />
  );
}

// ── The four-step form flow (Screen 1..4 → START → verify-wait) ───────────────

function SignupStepFlow({
  onSubmitSignup,
  onExit,
  policy,
}: {
  onSubmitSignup: (submission: SignupSubmission) => Promise<SubmitResult>;
  onExit?: () => void;
  policy: RenderedConsentPolicy;
}) {
  const [step, setStep] = useState<Step>("parent");
  const [data, setData] = useState<SignupData>(emptySignupData);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  // A synchronous double-submit guard: the ref flips before the await so a second
  // tap in the same tick is dropped, never issuing a duplicate START.
  const submittingRef = useRef(false);

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
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const result = await onSubmitSignup(buildSubmission(data, consentMetaFor(policy)));
      if (result.ok) {
        // Persist what the verify-return needs to finish the mint across the
        // email link's fresh page load. The parent password is NEVER persisted;
        // it is re-prompted on return.
        savePendingSignup({
          attemptId: result.attemptId ?? null,
          parentEmail: data.parentEmail.trim(),
          child: {
            firstName: data.childFirstName.trim(),
            credentialChoice: data.credentialChoice,
            password: data.childPassword,
          },
        });
        setStep("done");
      } else {
        setSubmitError(true);
      }
    } catch {
      setSubmitError(true);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const filled = step === "done" ? TOTAL_STEPS : STEP_ORDER.indexOf(step) + 1;

  return (
    <>
      <SignupShell filled={filled}>
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
              policy={policy}
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
              Open it on this device to finish setting up your child's account.
            </p>
          </div>
        )}
      </SignupShell>

      {step !== "done" ? (
        <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-wider text-[hsl(30_6%_52%)]">
          A grown-up sets up every account
        </p>
      ) : null}
    </>
  );
}

// ── Verify-return: back from the email link, finish the mint ──────────────────

const REPROMPT_INPUT_CLS =
  "min-h-[48px] w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 font-display text-[17px] font-bold text-[hsl(25_34%_20%)] outline-none focus:border-[hsl(25_34%_20%/0.4)]";

function VerifyReturn({
  token,
  onComplete,
  onExit,
}: {
  token: string;
  onComplete?: (req: CompleteVerificationRequest) => Promise<CompleteVerificationResult>;
  onExit?: () => void;
}) {
  // Read the pending signup ONCE on mount (the email link reloaded the SPA, so
  // this is fresh from localStorage). Missing / attempt-less means we cannot mint
  // here (a different device, or storage cleared) and must degrade to a message.
  const pendingRef = useRef(loadPendingSignup());
  const pending = pendingRef.current;
  const canFinish = Boolean(pending && pending.attemptId && onComplete);

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const [show, setShow] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const finish = async () => {
    if (busyRef.current) return;
    if (!pending || !pending.attemptId || !onComplete) return;
    if (password.length === 0) return;
    busyRef.current = true;
    setBusy(true);
    setError(false);
    try {
      const res = await onComplete({
        token,
        parentEmail: pending.parentEmail,
        parentPassword: password,
        attemptId: pending.attemptId,
        child: pending.child,
      });
      if (!mountedRef.current) return;
      if (res.ok) {
        // Both outcomes clear the pending blob. `playing` navigates the app away
        // (this unmounts); `confirmation` shows the setup-email screen below.
        clearPendingSignup();
        if (res.outcome === "confirmation") setConfirmed(true);
      } else {
        setError(true);
      }
    } catch {
      if (mountedRef.current) setError(true);
    } finally {
      if (mountedRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  // Path b (and a login-failed path a): the account exists, the child logs in
  // later once the mailbox / setup email lands.
  if (confirmed) {
    return (
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-verified">
          Account created
        </p>
        <h2 className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
          You are all set.
        </h2>
        <p className="mt-2 text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
          We are finishing your child's sign-in details and will email them to you. Once they arrive,
          your child can log in and start playing.
        </p>
      </div>
    );
  }

  // Different device / cleared storage: we have no attempt to finish here.
  if (!canFinish) {
    return (
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[hsl(25_20%_38%)]">
          One more step
        </p>
        <h2 className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
          Finish on the device you started on.
        </h2>
        <p className="mt-2 text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
          Your email is confirmed, but the rest of your signup lives in the browser where you began.
          Open this link there to finish, or start again.
        </p>
        <div className="mt-5">
          <GreenCta onClick={() => onExit?.()}>Start again →</GreenCta>
        </div>
      </div>
    );
  }

  // Unreachable given `canFinish` was true above; the guard narrows the type so
  // the render below reads `pending` without a non-null assertion.
  if (!pending) return null;

  return (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "hsl(150 52% 32%)" }}>
        Almost done
      </p>
      <h2 className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
        Confirm your password.
      </h2>
      <p className="mt-2 break-words text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
        Your email is verified. Enter the password you chose for <b className="text-[hsl(25_34%_20%)]">{pending.parentEmail}</b> to
        finish setting up <b className="text-[hsl(25_34%_20%)]">{pending.child.firstName}</b>.
      </p>

      <div className="mt-6">
        <label htmlFor="fp-verify-password" className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
          Your password
        </label>
        <span className="relative block">
          <input
            id="fp-verify-password"
            type={show ? "text" : "password"}
            value={password}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(e) => setPassword(e.target.value)}
            className={`${REPROMPT_INPUT_CLS} pr-16`}
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
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border-l-4 border-goldleaf bg-goldleaf/10 px-3.5 py-3 text-sm leading-relaxed text-ink"
        >
          We couldn't finish setting up the account. Check your password and try again.
        </p>
      ) : null}

      <GreenCta onClick={finish} disabled={busy || password.length === 0}>
        {busy ? "Finishing..." : "Finish setup →"}
      </GreenCta>
      <BackLink onClick={() => onExit?.()} />
    </>
  );
}
