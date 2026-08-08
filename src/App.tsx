/**
 * fpv2 stage router.
 *
 * The app is a `stage` machine (no router): boot | landing | login | signup |
 * onboard | app. Unit 9 wires the `signup` stage to the REAL The120 backend:
 * the START call (send verify email), the email-verify WAIT + RETURN, parent
 * session adoption, the authenticated child mint, and the path-a child login
 * handoff into the game.
 *
 * The verify-return deep link (`/signup/verify?token=...`, emailed by the
 * backend) boots the SPA fresh. App reads the token out of the URL and renders
 * the signup verify-return screen while logged out, OVERRIDING the normal stage
 * routing (the token flow lives inside `signup`, out of `isLoggedInStage`).
 *
 * The old single-company Factory / rooms are intentionally no longer imported
 * (they consume the removed old GameContext API).
 */
import { useCallback, useEffect, useState } from "react";
import { GameProvider, isLoggedInStage, useGame } from "./state/GameContext";
import { GlobalNav } from "./components/GlobalNav";
import { Login } from "./screens/Login";
import { Landing } from "./screens/Landing";
import { Onboarding } from "./screens/Onboarding";
import {
  Signup,
  type CompleteVerificationRequest,
  type CompleteVerificationResult,
  type SubmitResult,
} from "./screens/Signup";
import { Factory } from "./screens/Factory";
import {
  createSignupChild,
  fetchConsentPolicy,
  recordSignupConsent,
  startSignup,
  verifySignup,
} from "./lib/auth";
import { finishSignup } from "./screens/signup/finishSignup";
import {
  renderedFromFetched,
  type RenderedConsentPolicy,
} from "./screens/signup/consentPolicy";
import type { SignupSubmission } from "./screens/signup/validation";
import { readVerifyToken, stripVerifyTokenFromUrl } from "./screens/signup/verifyLink";
import { peekEnterLink } from "./screens/auth/enterLink";
import { Enter } from "./screens/auth/Enter";
import { isLegacyAdminPath, isStaffPath } from "./screens/staff/staffLink";
import { StaffShell } from "./screens/staff/StaffShell";

function Boot() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[hsl(40_30%_99%)] text-ink">
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-9 items-end gap-[3px]" aria-hidden>
          <span className="h-3 w-[5px] animate-pulse rounded-sm bg-sell" />
          <span className="h-5 w-[5px] animate-pulse rounded-sm bg-build" />
          <span className="h-7 w-[5px] animate-pulse rounded-sm bg-grow" />
          <span className="h-9 w-[5px] animate-pulse rounded-sm bg-scale" />
        </span>
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink/50">Loading</p>
      </div>
    </main>
  );
}

function StageRouter() {
  const { stage, dispatch, login } = useGame();

  // The reserved /staff route (Change #9), read ONCE from the boot URL exactly
  // like the verify-return token below (but never stripped — the path IS the
  // page). It overrides ALL stage routing and renders the staff suggestions
  // screen OUTSIDE the game shell (no GlobalNav): a child hitting /staff sees
  // the staff sign-in, and their credential can never pass the server's staff
  // gate (byte-identical 401 → the staff-only refusal).
  //
  // The retired /admin route counts as the staff route too. Production 308s it
  // at the edge (vercel.json redirects), but vite dev never reads vercel.json —
  // this keeps a stale bookmark working in EVERY environment.
  const [staffRoute] = useState(() => isStaffPath() || isLegacyAdminPath());

  // The handoff landing (v3 Unit 6), read ONCE from the boot URL exactly like
  // the verify-return token below — except the read AND the strip already
  // happened in src/index.tsx before render, so the one-time code never sat in
  // the address bar while React booted. This only picks up the result.
  const [enterLink] = useState(() => peekEnterLink());

  // Bring the address bar in line when the edge redirect did not run. replace,
  // not push: /admin must not sit in the back-stack waiting to redirect again.
  useEffect(() => {
    if (staffRoute && isLegacyAdminPath()) {
      window.history.replaceState(null, "", "/staff");
    }
  }, [staffRoute]);

  // The idea switcher is a DROPDOWN owned entirely by the GlobalNav chip
  // (2026-08-04), so no open-state crosses this boundary any more. What still
  // has to cross is the SWITCH EVENT: Factory cancels an in-flight walk when
  // the kid switches ideas, and the nav sits above it. This monotonic counter
  // is that signal — bumped per explicit switch, watched by Factory.
  const [switchSignal, setSwitchSignal] = useState(0);

  // The verify-return token, read ONCE from the boot URL and then stripped from
  // the address bar so a refresh never re-triggers it and the one-time token
  // does not linger in history.
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  useEffect(() => {
    const token = readVerifyToken();
    if (token) {
      setVerifyToken(token);
      stripVerifyTokenFromUrl();
    }
  }, []);

  // The rendered consent policy, fetched from the backend so the client displays
  // and echoes exactly what the server records. Undefined until it resolves (the
  // Signup screen falls back to the byte-aligned local default meanwhile).
  const [policy, setPolicy] = useState<RenderedConsentPolicy | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void fetchConsentPolicy().then((fetched) => {
      if (cancelled || !fetched) return;
      const rendered = renderedFromFetched(fetched);
      if (rendered) setPolicy(rendered);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // START: create the parent account + send the verify email; carry the attempt
  // id back to the container so the verify-return can mint the child.
  const handleStart = useCallback(async (submission: SignupSubmission): Promise<SubmitResult> => {
    const result = await startSignup({
      parentName: submission.parent.name,
      parentEmail: submission.parent.email,
      parentPassword: submission.parent.password,
      childFirstName: submission.child.firstName,
      childAgeBand: submission.child.ageBand,
      childDob: submission.child.dob || undefined,
      jurisdiction: submission.jurisdiction,
    });
    if (result.ok) return { ok: true, attemptId: result.attemptId };
    // A returning parent (the backend's deliberate R10 `existing_account` signal)
    // is surfaced so the container routes them to the sign-in interruption; every
    // other refusal stays a generic error. Non-enumerating: we only forward the
    // flag the backend already chose to return (the accepted enumeration tradeoff).
    return { ok: false, existingAccount: result.existingAccount };
  }, []);

  // Verify-return: verify the email + adopt the parent session, RECORD CONSENT,
  // mint the child, then log the child in (by their generated username, U13) and
  // hand off to the game — or, on a login race, resolve to the confirmation that
  // reveals the username. The sequence (incl. the consent-record step that gates
  // the mint) lives in finishSignup so it is unit-testable; every failure is a
  // flat { ok: false } (never throws).
  const handleCompleteVerification = useCallback(
    (req: CompleteVerificationRequest): Promise<CompleteVerificationResult> =>
      finishSignup(
        {
          verifySignup,
          recordSignupConsent,
          createSignupChild,
          loginChildIntoGame: login,
          fetchConsentPolicy,
        },
        req,
      ),
    [login],
  );

  const renderSignup = (token?: string) => (
    <Signup
      onExit={() => {
        setVerifyToken(null);
        dispatch({ type: "SET_STAGE", stage: "landing" });
      }}
      onGoToLogin={() => {
        setVerifyToken(null);
        dispatch({ type: "SET_STAGE", stage: "login" });
      }}
      onSubmitSignup={handleStart}
      onCompleteVerification={handleCompleteVerification}
      policy={policy}
      verifyToken={token}
    />
  );

  // A verify-return link overrides normal routing while logged out (the token
  // flow is a signup stage, out of isLoggedInStage). Once the child is logged in
  // (path a), the lingering token is ignored and the game renders normally.
  const content = (() => {
    if (verifyToken && !isLoggedInStage(stage)) {
      return renderSignup(verifyToken);
    }
    switch (stage) {
      case "boot":
        return <Boot />;
      case "landing":
        return <Landing />;
      case "login":
        return <Login />;
      case "signup":
        return renderSignup();
      case "onboard":
        return <Onboarding />;
      case "app":
        return <Factory switchSignal={switchSignal} />;
      default:
        return <Boot />;
    }
  })();

  // /staff renders as a pre-stage route (the verify precedent): no GlobalNav,
  // no stage content — the staff screen is not part of the game shell.
  if (staffRoute) return <StaffShell />;

  // /auth/enter is a pre-stage route too, and it OVERRIDES the boot: while a
  // handoff is pending, GameProvider deliberately skips its session restore, so
  // the stage sits at `boot` until the redeem resolves. On success adoptSession
  // routes to onboard/app — isLoggedInStage flips and this screen falls away,
  // handing the kid straight to the game. On failure it stays put and shows the
  // recovery surface (the code is spent; retrying cannot help).
  if (enterLink.fromEnterRoute && !isLoggedInStage(stage)) {
    return <Enter code={enterLink.code} />;
  }

  // The global nav mounts ABOVE the stage render (never remounts across stage
  // swaps); only the boot spinner stays chrome-free. Spec:
  // docs/superpowers/specs/2026-08-02-global-nav-design.md
  return (
    <>
      {stage !== "boot" ? (
        <GlobalNav
          onSwitched={() => setSwitchSignal((n) => n + 1)}
          // While the emailed verify deep link is completing account creation
          // over the landing stage, the nav must not offer an external-origin
          // Start Building link: clicking it would navigate away and abandon
          // the in-flight verify (fpv03 U1 review finding).
          suppressStartCta={Boolean(verifyToken) && !isLoggedInStage(stage)}
        />
      ) : null}
      {content}
    </>
  );
}

export function App() {
  return (
    <GameProvider>
      <StageRouter />
    </GameProvider>
  );
}
