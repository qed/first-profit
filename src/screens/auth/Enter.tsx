/**
 * `/auth/enter` — the handoff landing (new-user-flow-v3, Unit 6).
 *
 * The120's account-ready screen opens this in a NEW TAB with a one-time code in
 * the fragment. `enterLink.ts` has already read and stripped that code before
 * React mounted; this screen redeems it exactly once and then gets out of the
 * way (a successful redeem routes the stage to onboard/app, which unmounts us).
 *
 * THE FAILURE STATE IS THE POINT (Unit 5 review, FIX 1 — binding on this unit).
 * The exchange NEVER un-burns a code: unknown, already-consumed, and expired
 * are one indistinguishable 401 by design, 403 means Origin, and no retry can
 * help. Because the ending is a new tab, the tab the family came FROM is still
 * open on the120.school showing their username and password. So this screen
 * must not say "something went wrong" and stop — it must say the code is spent,
 * point back at that other tab, offer the plain sign-in form RIGHT HERE, and
 * give a human address for a family whose other tab is already gone.
 *
 * Mobile-first at ~390px: no fixed widths, the recovery form is the existing
 * Login card (tap targets >= 44px), and the notice rides inside that card so
 * the whole recovery fits one screen instead of pushing the form below the fold.
 */
import { useEffect, useRef, useState } from "react";
import { Login } from "../Login";
import { useGame } from "../../state/GameContext";

/** Where a family whose other tab is gone can reach a human. */
const SUPPORT_EMAIL = "admissions@the120.school";

type Phase = "redeeming" | "failed";

function Spinner() {
  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-[hsl(40_30%_99%)] px-4 py-8 text-ink">
      <span className="flex h-9 items-end gap-[3px]" aria-hidden>
        <span className="h-3 w-[5px] animate-pulse rounded-sm bg-sell" />
        <span className="h-5 w-[5px] animate-pulse rounded-sm bg-build" />
        <span className="h-7 w-[5px] animate-pulse rounded-sm bg-grow" />
        <span className="h-9 w-[5px] animate-pulse rounded-sm bg-scale" />
      </span>
      <p
        role="status"
        className="mt-4 text-center font-display text-lg font-bold leading-snug text-ink"
      >
        Signing you in...
      </p>
      <p className="mt-1 text-center text-sm leading-relaxed text-ink/60">
        This only takes a moment.
      </p>
    </main>
  );
}

/**
 * The recovery notice. Every clause is load-bearing: what happened, that it
 * cannot be retried, where the credentials still are, and who to ask.
 */
function ExpiredNotice() {
  return (
    <div
      role="alert"
      className="rounded-xl border-l-4 border-goldleaf bg-goldleaf/10 px-3.5 py-3 text-sm leading-relaxed text-ink"
    >
      <p className="font-display text-base font-bold">This sign-in link is used up.</p>
      <p className="mt-1.5">
        Sign-in links work one time only, so this one cannot be used again. Nothing is wrong with
        the account.
      </p>
      <p className="mt-1.5">
        The other tab you came from still shows the username and password. Switch back to it, then
        type them in below.
      </p>
      <p className="mt-1.5">
        Closed that tab already? Email{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="inline-block font-bold text-sell underline decoration-2 underline-offset-2 hover:text-sell/80"
        >
          {SUPPORT_EMAIL}
        </a>{" "}
        and we will help a grown-up get back in.
      </p>
    </div>
  );
}

export interface EnterProps {
  /**
   * The one-time code read from the fragment at boot, or null when the SPA
   * landed on `/auth/enter` without one (a refresh after the strip, or a
   * mangled link). Null goes STRAIGHT to the recovery state — there is nothing
   * to redeem, and a spinner that never resolves is the worst of both.
   */
  code: string | null;
}

export function Enter({ code }: EnterProps) {
  const { redeemHandoff } = useGame();
  const [phase, setPhase] = useState<Phase>(code ? "redeeming" : "failed");

  /**
   * TWO SEPARATE GUARANTEES, TWO SEPARATE REFS (Unit 6 review, FIX 3).
   *
   * `attempted` means ONLY "do not POST twice". The code is single-use, and a
   * second exchange would race two `adoptSession` runs; a remount (React
   * re-running the effect after a synthetic cleanup, a Fast Refresh in dev, or
   * a parent that swaps the subtree) must not re-fire it. NOTE: this app does
   * NOT wrap <App/> in <React.StrictMode> — see `src/index.tsx` — so the dev
   * double-invoke is not the live reason; the guard is here because "exactly
   * once" is a property of the CODE, not of a React mode.
   *
   * `mountedRef` means ONLY "we are still on screen". It gets its OWN effect
   * with an empty dep array so it tracks the COMPONENT's lifetime, not the
   * redeem effect's. Conflating the two is what strands the spinner: if the
   * unmount flag lives in the redeem effect's closure, a mount → cleanup →
   * mount sequence marks invocation #1's closure cancelled while `attempted`
   * stops invocation #2 from starting anything, so when the ONE real request
   * finally answers `ok:false` nothing is listening and "Signing you in…" stays
   * up forever even though a real answer arrived.
   */
  const attempted = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!code || attempted.current) return;
    attempted.current = true;
    void redeemHandoff(code).then((ok) => {
      // On success the provider advances the stage and this screen unmounts, so
      // only the failure branch needs handling here. `redeemHandoff` ALWAYS
      // settles (the exchange is timeout-bounded — see SIGNIN_TIMEOUT_MS in
      // src/lib/auth.ts), so a hung network lands here too and gets the same
      // recovery surface as a refusal. The spinner is never terminal.
      if (!ok && mountedRef.current) setPhase("failed");
    });
  }, [code, redeemHandoff]);

  if (phase === "redeeming") return <Spinner />;
  return <Login notice={<ExpiredNotice />} />;
}
