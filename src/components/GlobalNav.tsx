/**
 * Global persistent nav bar (spec: docs/superpowers/specs/
 * 2026-08-02-global-nav-design.md). Mounted ONCE in App's StageRouter above
 * the stage render, for every stage except `boot`, so it survives stage swaps.
 *
 * Logged out: wordmark routes home; the right side offers Log in as a pill
 * button (hidden on the login stage itself), plus a Start Building CTA on the
 * landing stage only (same signup-flag cutover as the landing page CTAs).
 * Logged in (`onboard`/`app`): the wordmark is inert
 * (a kid cannot accidentally leave the game) and the right side shows the
 * founder chip + Log out (moved here from the HUD).
 *
 * Full-screen mobile overlays (`fixed inset-0`, higher z) cover this bar by
 * design; desktop floating dialogs leave it visible. No em dashes in copy.
 */
import { isLoggedInStage, useGame } from "../state/GameContext";
import { isSignupEnabled } from "../config";
import { LogoMark } from "./LogoMark";

export function GlobalNav() {
  const { stage, dispatch, logout, profile } = useGame();
  const loggedIn = isLoggedInStage(stage);
  const founder = profile.firstName || profile.handle || "Founder";

  const wordmark = (
    <span className="flex items-center gap-2.5 whitespace-nowrap">
      <LogoMark className="h-6 w-auto" />
      <span className="text-[14px] font-extrabold tracking-[0.02em]">FIRST PROFIT</span>
    </span>
  );

  return (
    <nav
      aria-label="First Profit"
      className="sticky top-0 z-40 border-b border-[hsl(40_14%_89%)] bg-[hsl(40_30%_99%)] text-ink"
    >
      <div className="mx-auto flex min-h-[52px] max-w-[1120px] items-center justify-between px-4 sm:px-8">
        {loggedIn ? (
          wordmark
        ) : (
          <button
            type="button"
            onClick={() => dispatch({ type: "SET_STAGE", stage: "landing" })}
            className="inline-flex min-h-[44px] items-center rounded-lg"
            aria-label="Go to the First Profit home page"
          >
            {wordmark}
          </button>
        )}

        {loggedIn ? (
          <span className="flex items-center gap-2.5">
            <span className="inline-block max-w-[5.5rem] truncate rounded-full bg-[hsl(14_78%_54%/0.12)] px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[hsl(14_78%_44%)] sm:max-w-[12rem]">
              {founder}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex min-h-[44px] items-center rounded-full border-2 border-[hsl(25_34%_20%/0.15)] px-4 font-mono text-[11px] uppercase tracking-[0.06em] text-ink hover:border-[hsl(25_34%_20%/0.4)]"
            >
              Log out
            </button>
          </span>
        ) : stage !== "login" ? (
          <span className="flex items-center gap-2 sm:gap-2.5">
            {stage === "landing" && (
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: "SET_STAGE",
                    stage: isSignupEnabled() ? "signup" : "login",
                  })
                }
                className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full bg-verified px-3 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)] transition-transform hover:-translate-y-0.5 active:translate-y-px active:shadow-[0_1px_0_hsl(150_52%_26%)] sm:px-4 sm:text-sm"
              >
                Start Building
              </button>
            )}
            <button
              type="button"
              onClick={() => dispatch({ type: "SET_STAGE", stage: "login" })}
              className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border-2 border-[hsl(25_34%_20%/0.15)] px-3 font-mono text-[11px] uppercase tracking-[0.06em] text-ink hover:border-[hsl(25_34%_20%/0.4)] sm:px-4"
            >
              Log in
            </button>
          </span>
        ) : null}
      </div>
    </nav>
  );
}
