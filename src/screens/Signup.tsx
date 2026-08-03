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
 * which renders the VERIFY-RETURN screen: it re-prompts the parent password AND
 * (path a) the child password (NO password is ever persisted — FIX 2; on a fresh
 * load / different tab neither is in memory), then calls `onCompleteVerification`
 * (verify → adopt parent session → RECORD CONSENT → mint child → path a: log the
 * child in and hand off to the game; path b: show the "account created, watch for
 * the setup email" confirmation).
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
  isChildPasswordValid,
  type AgeBand,
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

/**
 * The signup step cursor.
 *   parent/age/credential/consent = the four input screens.
 *   done     = the local email-verify WAIT screen ("Check your email").
 *   existing = the "you already have an account, sign in" interruption (a
 *              returning parent the backend flagged `existing_account`, Unit 10).
 */
type Step = "parent" | "age" | "credential" | "consent" | "done" | "existing";

/** The four input screens the parent walks (the age step, credential, etc.). */
const STEP_ORDER: Step[] = ["parent", "age", "credential", "consent"];

/**
 * The ONE coherent signup progress bar (Unit 10). It spans the WHOLE signup
 * journey as five segments, filling left-to-right in the phase palette:
 *   1 Your account · 2 Your child · 3 How they log in · 4 Your consent ·
 *   5 Confirm your email.
 * The four input screens fill segments 1..4; submitting consent advances the bar
 * to segment 5 (the email round-trip: the WAIT screen, the return-from-link
 * reprompt, and the "account created" confirmation all sit on the final segment,
 * matching the house style where the current step is lit). This is deliberately a
 * SEPARATE track from the child's five-PHASE onboarding bar (sell..scale) in
 * `Onboarding.tsx`: signup is the logged-OUT parent setup and ENDS at "account
 * created -> entering the game"; path a then logs the child in and the game's
 * `onboard` stage renders the child's own founder onboarding (screens 2-5) with
 * its own bar. We do NOT span one bar across the two sessions or re-render the
 * onboarding screens here.
 */
const SIGNUP_SEGMENTS = 5;
const CONFIRM_EMAIL_SEGMENT = 5;

/** Result of the injected START stub. Unit 9 returns the real backend outcome:
 *  `attemptId` is the handle the verify-return carries to the child-mint call.
 *  `existingAccount` (Unit 10) is the backend's deliberate returning-parent
 *  signal: the container routes it to the sign-in interruption, NOT a generic
 *  error. */
export type SubmitResult = {
  ok: boolean;
  attemptId?: string | null;
  existingAccount?: boolean;
};

/** What the injected verify-return handler reports back to the container. */
export type CompleteVerificationResult = {
  ok: boolean;
  /** `playing` = the child was logged in and the game took over (this container
   *  will unmount); `confirmation` = show the "you are all set" screen. */
  outcome?: "playing" | "confirmation";
  /** The generated fp_username (U15) the child logs in with — shown on the
   *  confirmation so the parent learns the login key (the recap email also states
   *  it). May be empty when the mint could not surface it. */
  username?: string;
  /**
   * The consent policy moved on between the consent screen and this submit
   * (dormant-flow fix): `finishSignup` re-fetched it and it no longer matches
   * what was echoed. `policy` carries the CURRENT rendered policy so the
   * verify-return can show it and let the parent re-attest, instead of
   * retrying the same stale echo forever.
   */
  staleConsent?: boolean;
  policy?: RenderedConsentPolicy;
};

export interface CompleteVerificationRequest {
  token: string;
  parentEmail: string;
  parentPassword: string;
  attemptId: string;
  jurisdiction: string;
  /** The consent policy echo the consent-record step replays (bind-to-rendered). */
  consent: { echoedVersion: string; echoedHash: string; method: string };
  child: {
    firstName: string;
    ageBand: AgeBand;
    /** ISO yyyy-mm-dd; optional. */
    dob?: string;
    /** The parent-set child password — RE-PROMPTED on the verify-return screen,
     *  never persisted (single path, U15; always present). */
    password: string;
  };
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
   * Route a RETURNING parent to the login stage (Unit 10). Fired from the
   * "you already have an account" interruption when START reports
   * `existingAccount`. App wires this to `SET_STAGE login`.
   */
  onGoToLogin?: () => void;
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
          <SignupProgress step={filled} total={SIGNUP_SEGMENTS} />
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
  onGoToLogin,
  policy = DEFAULT_CONSENT_POLICY,
  verifyToken,
  onCompleteVerification,
}: SignupProps) {
  // Verify-return takes over the whole container: the parent is returning from
  // the email link, not walking the form. It owns its OWN shell so the progress
  // bar can sit on the final "confirm email" segment.
  if (verifyToken) {
    return <VerifyReturn token={verifyToken} onComplete={onCompleteVerification} onExit={onExit} />;
  }
  return (
    <SignupStepFlow
      onSubmitSignup={onSubmitSignup}
      onExit={onExit}
      onGoToLogin={onGoToLogin}
      policy={policy}
    />
  );
}

// ── The four-step form flow (Screen 1..4 → START → verify-wait) ───────────────

function SignupStepFlow({
  onSubmitSignup,
  onExit,
  onGoToLogin,
  policy,
}: {
  onSubmitSignup: (submission: SignupSubmission) => Promise<SubmitResult>;
  onExit?: () => void;
  onGoToLogin?: () => void;
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
      const submission = buildSubmission(data, consentMetaFor(policy));
      const result = await onSubmitSignup(submission);
      if (!result.ok && result.existingAccount) {
        // A returning parent (R10 signal): route to the sign-in interruption, NOT
        // a generic error. Copy is deliberately non-enumerating (mirrors the
        // plan's accepted enumeration tradeoff; it never re-confirms the email).
        setStep("existing");
        return;
      }
      if (result.ok) {
        // Persist what the verify-return needs to finish the flow across the
        // email link's fresh page load. NO PASSWORD is persisted (FIX 2) —
        // neither the parent's nor the child's; both are re-prompted on return.
        // The consent echo rides along so the consent-record step can replay the
        // exact version/hash the parent attested to.
        savePendingSignup({
          attemptId: result.attemptId ?? null,
          parentEmail: submission.parent.email,
          createdAt: Date.now(),
          child: {
            firstName: submission.child.firstName,
            ageBand: submission.child.ageBand,
            dob: submission.child.dob || undefined,
          },
          jurisdiction: submission.jurisdiction,
          consent: {
            policyVersion: submission.consent.policyVersion,
            policyHash: submission.consent.policyHash,
            method: submission.consent.method,
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

  // Progress across the coherent 5-segment bar: the four input screens light
  // segments 1..4; the email-verify WAIT screen ("done") advances to segment 5
  // (Confirm your email). The existing-account interruption keeps the bar at the
  // input steps it completed (4) rather than pretending it advanced.
  const filled =
    step === "done"
      ? CONFIRM_EMAIL_SEGMENT
      : step === "existing"
        ? STEP_ORDER.length
        : STEP_ORDER.indexOf(step) + 1;

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
            <p className="mt-2 break-words text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
              We sent a confirmation link to <b className="text-[hsl(25_34%_20%)]">{data.parentEmail}</b>.
              Open it on this device to finish setting up your child's account.
            </p>
          </div>
        )}
        {step === "existing" && (
          <div className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[hsl(25_20%_38%)]">
              One account per family
            </p>
            <h2 className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
              You may already have an account.
            </h2>
            <p className="mt-2 break-words text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
              Sign in to pick up where you left off. If you cannot get in, use the password reset on
              the sign-in screen.
            </p>
            <div className="mt-5">
              <GreenCta onClick={() => onGoToLogin?.()}>Go to sign in →</GreenCta>
            </div>
            <BackLink onClick={() => setStep("parent")} />
          </div>
        )}
      </SignupShell>

      {STEP_ORDER.includes(step) ? (
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
  const [childPassword, setChildPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // The generated login username the mint returns — shown on the confirmation so
  // the parent learns the child's login key (single path, U15).
  const [username, setUsername] = useState("");
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const [show, setShow] = useState(false);
  const [showChild, setShowChild] = useState(false);
  // Stale-consent retry (dormant-flow fix): the policy moved on between the
  // consent screen and this submit. `stalePolicy` is the freshly re-fetched
  // policy `finishSignup` surfaced; the parent must tick the checkbox again
  // (a fresh attestation to the NEW text) before the retry is allowed to fire.
  const [stalePolicy, setStalePolicy] = useState<RenderedConsentPolicy | null>(null);
  const [reattested, setReattested] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Both credentials must be present before the finish CTA enables (single path,
  // U15): the parent password AND the re-prompted child password.
  const canSubmit = password.length > 0 && childPassword.length > 0;

  const finish = async () => {
    if (busyRef.current) return;
    if (!pending || !pending.attemptId || !onComplete) return;
    if (!canSubmit) return;
    busyRef.current = true;
    setBusy(true);
    setError(false);
    setStalePolicy(null);
    try {
      const res = await onComplete({
        token,
        parentEmail: pending.parentEmail,
        parentPassword: password,
        attemptId: pending.attemptId,
        jurisdiction: pending.jurisdiction,
        consent: {
          echoedVersion: pending.consent.policyVersion,
          echoedHash: pending.consent.policyHash,
          method: pending.consent.method,
        },
        child: {
          firstName: pending.child.firstName,
          ageBand: pending.child.ageBand,
          dob: pending.child.dob,
          password: childPassword,
        },
      });
      if (!mountedRef.current) return;
      if (res.ok && res.outcome === "confirmation") {
        setUsername(res.username ?? "");
        setConfirmed(true);
      } else if (!res.ok && res.staleConsent && res.policy) {
        // The policy moved on between the consent screen and this submit. Carry
        // the FRESHLY fetched version/hash forward on the in-memory pending copy
        // (mirrors FIX 2: no password rides this, only the non-secret consent
        // echo) so the re-attest retry echoes the CURRENT policy, not the stale
        // one that just got refused — otherwise the retry loop never converges.
        pendingRef.current = pendingRef.current
          ? {
              ...pendingRef.current,
              consent: {
                policyVersion: res.policy.version,
                policyHash: res.policy.hash,
                method: res.policy.method,
              },
            }
          : pendingRef.current;
        setReattested(false);
        setStalePolicy(res.policy);
      } else if (!res.ok) {
        setError(true);
      }
    } catch {
      if (mountedRef.current) setError(true);
    } finally {
      // Clear the pending blob on EVERY terminal outcome (success OR failure,
      // FIX 2): the in-memory pendingRef still drives any in-session retry, so a
      // failed/abandoned finish leaves nothing persisted. `playing` also unmounts
      // this screen; clearing in `finally` guarantees it runs even then.
      clearPendingSignup();
      if (mountedRef.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  // The confirmation screen (a login-failed mint, or a lost-response replay). Its
  // JOB (U15) is to reveal the child's generated login USERNAME to the parent —
  // this is how they learn it in-app (the recap email also states it, U14). When
  // the mint could not surface a username, degrade to a graceful fallback line.
  if (confirmed) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return (
      <SignupShell filled={CONFIRM_EMAIL_SEGMENT}>
        <div className="text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-verified">
            Account created
          </p>
          <h2 className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
            You are all set.
          </h2>
          {username ? (
            <>
              <p className="mt-2 break-words text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
                <b className="text-[hsl(25_34%_20%)]">{pending?.child.firstName}</b> logs in
                {origin ? (
                  <> at <b className="text-[hsl(25_34%_20%)]">{origin}</b></>
                ) : null}{" "}
                with the username below and the password you set.
              </p>
              <div className="mt-4 rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-4 py-3.5">
                <p
                  id="fp-confirm-username-label"
                  className="font-mono text-[10px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]"
                >
                  Username
                </p>
                <p
                  aria-labelledby="fp-confirm-username-label"
                  className="mt-1 break-all font-display text-[20px] font-black text-[hsl(25_34%_20%)]"
                >
                  {username}
                </p>
              </div>
              <p className="mt-3 break-words text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
                We also emailed this to you. If the sign-in does not take right away, try again in a
                moment.
              </p>
            </>
          ) : (
            <p className="mt-2 break-words text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
              <b className="text-[hsl(25_34%_20%)]">{pending?.child.firstName}</b> can log in with the
              username you were emailed and the password you set. Check your inbox for the exact
              username, then sign in
              {origin ? (
                <> at <b className="text-[hsl(25_34%_20%)]">{origin}</b></>
              ) : null}
              .
            </p>
          )}
        </div>
      </SignupShell>
    );
  }

  // Different device / cleared storage: we have no attempt to finish here.
  if (!canFinish) {
    return (
      <SignupShell filled={CONFIRM_EMAIL_SEGMENT}>
        <div className="text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[hsl(25_20%_38%)]">
            One more step
          </p>
          <h2 className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
            Finish on the device you started on.
          </h2>
          <p className="mt-2 break-words text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
            Your email is confirmed, but the rest of your signup lives in the browser where you began.
            Open this link there to finish, or start again.
          </p>
          <div className="mt-5">
            <GreenCta onClick={() => onExit?.()}>Start again →</GreenCta>
          </div>
        </div>
      </SignupShell>
    );
  }

  // Unreachable given `canFinish` was true above; the guard narrows the type so
  // the render below reads `pending` without a non-null assertion.
  if (!pending) return null;

  // Stale-consent retry (dormant-flow fix): the permission text changed while
  // this page sat open. Show the CURRENT text, require a fresh tick, then let
  // `finish` re-run — it will echo the version/hash we just stashed on
  // `pendingRef.current`, so this converges instead of looping on the old echo.
  if (stalePolicy) {
    return (
      <SignupShell filled={CONFIRM_EMAIL_SEGMENT}>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "hsl(14 78% 44%)" }}>
          One quick check
        </p>
        <h2 className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
          Please review this again.
        </h2>
        <p className="mt-2 break-words text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
          The permission text was updated while this page was open. Take a look and confirm again before
          we finish setting up the account.
        </p>

        <div className="mt-5 rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white">
          <div className="flex items-center justify-between border-b-2 border-[hsl(25_34%_20%/0.1)] px-4 py-2.5">
            <p className="font-display text-[15px] font-bold text-[hsl(25_34%_20%)]">{stalePolicy.title}</p>
            <span className="ml-3 shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[hsl(25_20%_38%)]">
              v{stalePolicy.version}
            </span>
          </div>
          <div className="max-h-56 overflow-y-auto px-4 py-3.5">
            <p className="text-[13px] leading-[1.6] text-[hsl(25_20%_38%)]">{stalePolicy.text}</p>
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-4 py-3.5">
          <input
            type="checkbox"
            checked={reattested}
            onChange={(e) => setReattested(e.target.checked)}
            className="mt-0.5 h-6 w-6 shrink-0 accent-verified"
          />
          <span className="text-[13.5px] font-semibold leading-[1.5] text-[hsl(25_34%_20%)]">
            I am the parent or legal guardian, and I consent to the updated terms above for my child.
          </span>
        </label>

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-xl border-l-4 border-goldleaf bg-goldleaf/10 px-3.5 py-3 text-sm leading-relaxed text-ink"
          >
            We couldn't finish setting up the account. Check your details and try again.
          </p>
        ) : null}

        <GreenCta onClick={finish} disabled={busy || !reattested}>
          {busy ? "Finishing..." : "Confirm and continue →"}
        </GreenCta>
        <BackLink onClick={() => onExit?.()} />
      </SignupShell>
    );
  }

  return (
    <SignupShell filled={CONFIRM_EMAIL_SEGMENT}>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "hsl(150 52% 32%)" }}>
        Almost done
      </p>
      <h2 className="mt-2 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
        Confirm your password.
      </h2>
      <p className="mt-2 break-words text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
        Your email is verified. Enter the password you chose for <b className="text-[hsl(25_34%_20%)]">{pending.parentEmail}</b>
        {" "}and the password you set for <b className="text-[hsl(25_34%_20%)]">{pending.child.firstName}</b> to finish
        setting up their account.
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

      <div className="mt-4">
        <label htmlFor="fp-verify-child-password" className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
          {pending.child.firstName}'s password
        </label>
        <span className="relative block">
          <input
            id="fp-verify-child-password"
            type={showChild ? "text" : "password"}
            value={childPassword}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            onChange={(e) => setChildPassword(e.target.value)}
            className={`${REPROMPT_INPUT_CLS} pr-16`}
          />
          <button
            type="button"
            onClick={() => setShowChild((s) => !s)}
            aria-pressed={showChild}
            className="absolute right-1 top-1/2 flex min-h-[44px] -translate-y-1/2 items-center rounded-lg px-3 font-mono text-[11px] uppercase tracking-wider text-[hsl(25_20%_38%)] hover:text-ink"
          >
            {showChild ? "Hide" : "Show"}
          </button>
        </span>
        {childPassword.length > 0 && !isChildPasswordValid(childPassword) ? (
          <p className="mt-1.5 text-[13px] leading-snug text-[hsl(25_20%_38%)]">
            Use at least 10 characters (the same password you set earlier).
          </p>
        ) : null}
      </div>

      {error ? (
        <>
          <p
            role="alert"
            className="mt-3 rounded-xl border-l-4 border-goldleaf bg-goldleaf/10 px-3.5 py-3 text-sm leading-relaxed text-ink"
          >
            We couldn't finish setting up the account. Check your details and try again.
          </p>
          <p className="mt-2 text-center text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
            Still stuck?{" "}
            <button
              type="button"
              onClick={() => onExit?.()}
              className="inline-flex min-h-[44px] items-center px-1 font-semibold text-[hsl(25_34%_20%)] underline hover:text-ink"
            >
              Start again
            </button>
          </p>
        </>
      ) : null}

      <GreenCta onClick={finish} disabled={busy || !canSubmit}>
        {busy ? "Finishing..." : "Finish setup →"}
      </GreenCta>
      <BackLink onClick={() => onExit?.()} />
    </SignupShell>
  );
}
