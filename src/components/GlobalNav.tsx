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
 * founder chip, now an Account dropdown holding the Log out action.
 *
 * In the `app` stage this is the ONE bar (the old parchment Hud is gone): the
 * right side also carries the game section — the active idea/business chip
 * (the only place the idea identity renders; taps open the switcher when
 * there is more than one idea), the Sales / Profit stats, and the save
 * indicator. The row wraps at narrow widths so nothing overflows at 390px.
 *
 * LAYERING (owner spec 2026-08-04, change 30). The bar sits at z-50, which
 * puts it ABOVE the unit task room (z-45, a room-scoped view that only ever
 * covers the factory floor) and BELOW every full-screen takeover (z-55/z-60:
 * room dialogs, promote, celebration, the suggestion modals). So the bar's
 * dropdowns open OVER a room the learner is standing in, while a real
 * takeover still covers the bar. `sticky` + z-index makes this bar its own
 * stacking context, so the menus' own z-50 is relative to the bar, not to the
 * page — raising the BAR is what lifts the menus. No em dashes in copy.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { isLoggedInStage, useGame } from "../state/GameContext";
import { activeBusiness } from "../state/gameCore";
import { ideaProgressLabel, ideaSummaryName } from "../state/floorSelectors";
import { isSignupEnabled } from "../config";
import { useCoverImage } from "../lib/cover";
import { CoverPortrait } from "./Avatar";
import { LogoMark } from "./LogoMark";
import type { SyncStatus } from "../lib/sync";

function dollars(cents: number): string {
  return Math.floor(cents / 100).toLocaleString("en-US");
}

/** Maps sync status to a short, kid-legible line (empty for idle). */
function SaveIndicator({ status }: { status: SyncStatus }) {
  const map: Record<SyncStatus, { text: string; className: string } | null> = {
    idle: null,
    pending: { text: "Saving…", className: "text-[hsl(25_20%_38%)]" },
    saving: { text: "Saving…", className: "text-[hsl(25_20%_38%)]" },
    saved: { text: "Saved", className: "text-verified" },
    error: { text: "Couldn't save", className: "text-wax" },
  };
  const entry = map[status];
  if (!entry) return null;
  return (
    <span className={`font-mono text-[9.5px] uppercase tracking-[0.08em] ${entry.className}`} role="status">
      {entry.text}
    </span>
  );
}

/** One right-aligned money stat (label over value), compact below sm. */
function MoneyStat({ label, cents }: { label: string; cents: number }) {
  return (
    <span className="text-right">
      <span className="block font-mono text-[8.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)] sm:text-[9.5px]">
        {label}
      </span>
      <span className="block font-mono text-[13px] font-bold leading-tight sm:text-[15px]">
        ${dollars(cents)}
      </span>
    </span>
  );
}

/**
 * The idea switcher as a NAV DROPDOWN (2026-08-04 owner spec), replacing the
 * full-screen SwitcherDialog modal that used to live in Factory: switching
 * ideas is navigation, so it belongs in a menu hanging off the nav chip that
 * names the current idea, not in a takeover that hides the floor behind it.
 *
 * Interaction is the AccountMenu contract verbatim (one dropdown convention in
 * this bar): mousedown outside closes, Escape closes and returns focus to the
 * chip, z-50 so it floats above the sticky bar, right-aligned so it never
 * overflows at 390px. Choosing an idea dispatches SET_ACTIVE_IDEA and then
 * fires `onSwitched` so Factory can cancel an in-flight walk (the kid's switch
 * wins over a pending arrival — the behavior the modal's onSwitched carried).
 */
function IdeaSwitcherMenu({ onSwitched }: { onSwitched?: () => void }) {
  const game = useGame();
  const { ideas, activeIdea, dispatch } = game;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        chipRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (ideaIndex: number) => {
    setOpen(false);
    onSwitched?.();
    dispatch({ type: "SET_ACTIVE_IDEA", ideaIndex });
  };

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        ref={chipRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch idea"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${CHIP_CLASS} min-h-[44px] px-1 transition-colors hover:text-[hsl(217_74%_44%)]`}
      >
        <ChipName />
        <ChevronDown size={14} aria-hidden className="shrink-0" />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-[15rem] rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white p-1.5 shadow-[0_8px_0_rgba(120,80,40,.1)]">
          <p className="px-2 pb-1 pt-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
            Switch idea
          </p>
          <div role="menu" aria-label="Switch idea">
            {ideas.map((_, n) => (
              <button
                key={n}
                type="button"
                role="menuitem"
                onClick={() => choose(n)}
                className="flex min-h-[44px] w-full flex-col justify-center rounded-xl px-2 py-1.5 text-left hover:bg-[hsl(40_30%_95%)]"
              >
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-bold text-ink">
                    {ideaSummaryName(game, n)}
                  </span>
                  {n === activeIdea ? (
                    <span className="shrink-0 font-mono text-[8.5px] font-bold uppercase tracking-[0.06em] text-grow">
                      now
                    </span>
                  ) : null}
                </span>
                <span className="truncate font-mono text-[9px] text-[hsl(25_20%_38%)]">
                  {ideaProgressLabel(game, n)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </span>
  );
}

/**
 * Regular bold text, no pill: no background, border, or rounding. Colored with
 * the First Profit BLUE (the `build` token, hsl(217 74% 56%) — the logo mark's
 * second bar, the same blue the Improve CTA and the runner's More-tools button
 * use). Owner spec 2026-08-04: the product name is blue and the founder name
 * is green, so the two identities in the bar never read as the same thing.
 */
const CHIP_CLASS =
  "inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-build";

/** The chip's label: business emoji when the active idea IS the promoted
 *  business, then the display name (productName preferred), truncated. */
function ChipName() {
  const game = useGame();
  const { ideas, activeIdea } = game;
  const business = activeBusiness(game);
  const isBusiness = Boolean(business && ideas[activeIdea] && business.ideaId === ideas[activeIdea].id);
  return (
    <>
      {isBusiness ? <span aria-hidden>🏢</span> : null}
      <span className="max-w-[6rem] truncate sm:max-w-[13rem]">{ideaSummaryName(game, activeIdea)}</span>
    </>
  );
}

/**
 * The app-stage IDENTITY group: which idea/business you are on, plus the save
 * indicator. Mounted ONLY when stage === "app", so the other stages never touch
 * the game fields on the context. With more than one idea the chip is the
 * dropdown trigger above; a single idea renders as plain text with no chevron.
 *
 * The money stats deliberately do NOT live here — see AppNavStats.
 */
function AppNavIdentity({ onSwitched }: { onSwitched?: () => void }) {
  const game = useGame();
  const { ideas, syncStatus } = game;
  return (
    <>
      {ideas.length > 1 ? (
        <IdeaSwitcherMenu onSwitched={onSwitched} />
      ) : ideas.length === 1 ? (
        <span className={`${CHIP_CLASS} py-1.5`}>
          <ChipName />
        </span>
      ) : null}
      <SaveIndicator status={syncStatus} />
    </>
  );
}

/**
 * Sales and Profit, rendered LAST in the bar — past the founder chip — so they
 * hold the far-right end position (owner spec 2026-08-04: the money is the
 * most important thing here, so it gets the most prominent slot). Split out of
 * the identity group purely so the ordering can put the account menu between
 * them and the idea chip.
 */
function AppNavStats() {
  const { grossSalesSumCents, salesSumCents } = useGame();
  return (
    <>
      <MoneyStat label="Sales" cents={grossSalesSumCents()} />
      <MoneyStat label="Profit" cents={salesSumCents()} />
    </>
  );
}

/**
 * The founder chip as an Account dropdown: clicking the chip opens a small
 * menu (title "Account") holding the Log out action. Dependency-free —
 * useState + refs + a document mousedown listener; Escape closes and returns
 * focus to the chip. The menu is z-50 so it floats above the sticky bar's
 * floor content, right-aligned under the chip so it never overflows at 390px.
 */
function AccountMenu({
  founder,
  coverUrl,
  onLogout,
}: {
  founder: string;
  coverUrl: string | null;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  // The identity thumbnail (v3 Unit 7). 22px wide → 28 tall: it fits INSIDE the
  // existing 44px tap target, so the bar's height and its 390px two-row wrap are
  // unchanged whether or not a child has a cover. A load failure drops back to
  // the plain text chip this bar has always shown.
  const cover = useCoverImage(coverUrl);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        chipRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-block">
      <button
        ref={chipRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        // No bubble (2026-08-04): the tinted pill is gone — plain text in the
        // First Profit green (the `grow` token, the logo's fourth bar), so the
        // bar carries no filled chips at all. px-1 keeps the 44px tap target
        // without reading as a button.
        className="inline-flex min-h-[44px] items-center gap-1 px-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-grow transition-colors hover:text-[hsl(150_52%_30%)]"
      >
        {cover.show && coverUrl ? (
          <CoverPortrait src={coverUrl} name={founder} width={22} onError={cover.onError} />
        ) : null}
        <span className="max-w-[5.5rem] truncate sm:max-w-[12rem]">{founder}</span>
        <ChevronDown size={14} aria-hidden className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-44 max-w-[calc(100vw-2rem)] rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white p-2 shadow-[0_6px_0_rgba(120,80,40,.12)]">
          <p className="px-2 pb-1 pt-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
            Account
          </p>
          <div role="menu" aria-label="Account">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex min-h-[44px] w-full items-center rounded-xl px-2 text-left font-mono text-[11px] uppercase tracking-[0.06em] text-ink hover:bg-[hsl(40_30%_95%)]"
            >
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}

export function GlobalNav({ onSwitched }: { onSwitched?: () => void } = {}) {
  const { stage, dispatch, logout, profile } = useGame();
  const loggedIn = isLoggedInStage(stage);
  const founder = profile.firstName || profile.handle || "Founder";

  /**
   * Publish the bar's LIVE height as `--fp-nav-h` (2026-08-04). The bar wraps
   * to two rows at 390px, so its height is not a constant anyone can hardcode:
   * Factory sizes the floor to `100dvh - var(--fp-nav-h)` so the floor (and
   * the unit-task runner that now fills it) always fits BELOW the sticky bar
   * instead of scrolling underneath it. Measured, not assumed, so a wrap, a
   * longer idea name, or a font swap can never desync the two.
   */
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const publish = () =>
      document.documentElement.style.setProperty("--fp-nav-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--fp-nav-h");
    };
  }, []);

  const wordmark = (
    <span className="flex items-center gap-2.5 whitespace-nowrap">
      <LogoMark className="h-6 w-auto" />
      <span className="text-[14px] font-extrabold tracking-[0.02em]">FIRST PROFIT</span>
    </span>
  );

  return (
    <nav
      ref={navRef}
      aria-label="First Profit"
      className="sticky top-0 z-50 border-b border-[hsl(40_14%_89%)] bg-[hsl(40_30%_99%)] text-ink"
    >
      <div className="mx-auto flex min-h-[52px] max-w-[1120px] flex-wrap items-center justify-between gap-y-1 px-4 py-1 sm:px-8">
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

        {/* Logged-in order (owner spec 2026-08-04): idea chip · save · founder
            chip · Sales · Profit. The money sits at the far right end of the
            bar, the most important slot, so the account menu moves inboard. */}
        {loggedIn ? (
          <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 sm:gap-x-2.5">
            {stage === "app" ? <AppNavIdentity onSwitched={onSwitched} /> : null}
            <AccountMenu
              founder={founder}
              coverUrl={profile.coverUrl}
              onLogout={() => void logout()}
            />
            {stage === "app" ? <AppNavStats /> : null}
          </span>
        ) : stage !== "login" ? (
          <span className="flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={() => dispatch({ type: "SET_STAGE", stage: "login" })}
              className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border-2 border-[hsl(25_34%_20%/0.15)] px-3 font-mono text-[11px] uppercase tracking-[0.06em] text-ink hover:border-[hsl(25_34%_20%/0.4)] sm:px-4"
            >
              Log in
            </button>
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
          </span>
        ) : null}
      </div>
    </nav>
  );
}
