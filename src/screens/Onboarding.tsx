/**
 * First-run in-game onboarding (screens 2..5) — the LOGGED-IN founder flow.
 *
 * Slice A boundary: the parent-account step (screen 1) is ALREADY complete — an
 * existing The120 child arrives already authenticated. So this file is the
 * child's screens 2..5:
 *   2 · Founder profile   (Trail parchment card, live handle preview)
 *   3 · Website reveal     (typed browser-frame headline)
 *   4 · Money booth        (Invest-in-me offer + checkmark copy)
 *   5 · The Path           (five phase rows, Sell highlighted)
 *
 * The four screens themselves live in `./onboarding/screens` as PURE,
 * props-driven components (Slice B Unit 7) so the parent signup flow can reuse
 * them driven by signup-LOCAL state. This module is the LOGGED-IN wiring: it
 * reads `state.ob` / `state.profile` and dispatches game actions, passing the
 * navigation + profile into each screen via props. All markup/styling lives in
 * the shared module; nothing here renders founder copy directly.
 *
 * The 5-segment progress bar fills in the five phase colors in order
 * (sell → build → validate → grow → scale). Segment 1 is ALWAYS filled (Sell):
 * the parent step is pre-completed. On screen N (state.ob = 2..5), segments
 * 1..N are filled; the rest are ink at 15% alpha.
 *
 * State: the screen index is `state.ob` (2..5). Advance / go back with SET_OB.
 * NOTE (per plan): the save doc only tracks `onboardingComplete`, not the
 * per-screen index, so a mid-onboarding reload resumes at screen 2 (in-memory
 * progress only). Completing screen 5 seeds Idea #1 (CREATE_IDEA), sets
 * onboardingComplete (SET_ONBOARDING_COMPLETE — persisted, so the NEXT login's
 * HYDRATE routes straight to `app`), and enters the `app` stage.
 *
 * Copy rule (global product rule): NO em dashes anywhere — "·", commas, periods.
 *
 * Mobile-first (CLAUDE.md, ~390px): single column, the card is `max-w`-bounded
 * and full-width below it. The shared screens own the founder copy and CTAs;
 * this shell owns the parchment card, the logo row, and the progress bar.
 */
import { useGame } from "../state/GameContext";
import {
  LogoMark,
  ProgressBar,
  FounderProfile,
  WebsiteReveal,
  MoneyBooth,
  ThePath,
} from "./onboarding/screens";

export function Onboarding() {
  const { ob, profile, dispatch } = useGame();
  // Clamp to the valid screen range so an out-of-range `ob` never blanks the UI.
  const screen = Math.min(5, Math.max(2, ob));

  return (
    <main className="flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-[hsl(38_46%_95%)] px-4 py-8 text-ink">
      {/* Caret keyframes are scoped here so the reveal needs no global CSS. */}
      <style>{"@keyframes fp-caret-blink{0%,100%{opacity:1}50%{opacity:0}}"}</style>
      <div className="w-full max-w-[560px]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <LogoMark />
          <ProgressBar filled={screen} />
        </div>
        <div className="rounded-3xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] p-6 shadow-[0_2px_0_rgba(120,80,40,0.12),0_8px_24px_rgba(120,80,40,0.14)] sm:p-8">
          {screen === 2 && (
            <FounderProfile
              firstName={profile.firstName}
              handle={profile.handle}
              onFirstNameChange={(value) =>
                dispatch({ type: "SET_PROFILE", patch: { firstName: value } })
              }
              onNext={() => dispatch({ type: "SET_OB", ob: 3 })}
            />
          )}
          {screen === 3 && (
            <WebsiteReveal
              firstName={profile.firstName}
              handle={profile.handle}
              onNext={() => dispatch({ type: "SET_OB", ob: 4 })}
              onBack={() => dispatch({ type: "SET_OB", ob: 2 })}
            />
          )}
          {screen === 4 && (
            <MoneyBooth
              onNext={() => dispatch({ type: "SET_OB", ob: 5 })}
              onBack={() => dispatch({ type: "SET_OB", ob: 3 })}
            />
          )}
          {screen === 5 && (
            <ThePath
              onComplete={() => {
                // Seed Idea #1 (sets it active + opens the runner at 1.1.1), mark
                // onboarding complete (persisted so the next login skips
                // onboarding), enter the floor.
                // The idea's stable id is minted at this caller boundary
                // (Unit 7; gameCore stays randomness-free).
                dispatch({ type: "CREATE_IDEA", ideaId: crypto.randomUUID() });
                dispatch({ type: "SET_ONBOARDING_COMPLETE" });
                dispatch({ type: "SET_STAGE", stage: "app" });
              }}
              onBack={() => dispatch({ type: "SET_OB", ob: 4 })}
            />
          )}
        </div>
      </div>
    </main>
  );
}
