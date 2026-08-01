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
  startSignup,
  verifySignup,
} from "./lib/auth";
import {
  renderedFromFetched,
  type RenderedConsentPolicy,
} from "./screens/signup/consentPolicy";
import type { SignupSubmission } from "./screens/signup/validation";
import { readVerifyToken, stripVerifyTokenFromUrl } from "./screens/signup/verifyLink";

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
      credentialChoice: submission.child.credentialChoice,
    });
    if (result.ok) return { ok: true, attemptId: result.attemptId };
    // A returning parent (existing_account) and a generic refusal both surface as
    // the container's generic error here (not a crash); Unit 10 can route an
    // existing account to login.
    return { ok: false };
  }, []);

  // Verify-return: verify the email + adopt the parent session, mint the child,
  // then (path a) log the child in and hand off to the game, or (path b) resolve
  // to the confirmation. Every failure is a flat { ok: false } (never throws).
  const handleCompleteVerification = useCallback(
    async (req: CompleteVerificationRequest): Promise<CompleteVerificationResult> => {
      const verified = await verifySignup({
        token: req.token,
        email: req.parentEmail,
        parentPassword: req.parentPassword,
      });
      if (!verified.ok) return { ok: false };

      // The parent session is adopted; mint the child under its Bearer token.
      const minted = await createSignupChild({
        attemptId: req.attemptId,
        childFirstName: req.child.firstName,
        credentialChoice: req.child.credentialChoice,
        childPassword:
          req.child.credentialChoice === "existing_credential" ? req.child.password : undefined,
      });
      if (!minted.ok) return { ok: false };

      if (req.child.credentialChoice === "existing_credential") {
        // PATH A: adopt the CHILD session (replacing the parent session) and hand
        // off to the game. login() routes to onboard/app, unmounting Signup.
        const ok = await login(req.child.firstName, req.child.password);
        if (ok) return { ok: true, outcome: "playing" };
        // The child login didn't take (a rare handle race): the account exists,
        // so show the confirmation; the child can log in later.
        return { ok: true, outcome: "confirmation" };
      }
      // PATH B: the provisioned mailbox is not ready yet, so DON'T attempt a child
      // login. Show the "account created, watch for the setup email" confirmation.
      return { ok: true, outcome: "confirmation" };
    },
    [login],
  );

  const renderSignup = (token?: string) => (
    <Signup
      onExit={() => {
        setVerifyToken(null);
        dispatch({ type: "SET_STAGE", stage: "landing" });
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
      return <Factory />;
    default:
      return <Boot />;
  }
}

export function App() {
  return (
    <GameProvider>
      <StageRouter />
    </GameProvider>
  );
}
