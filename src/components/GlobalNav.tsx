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
 * Full-screen mobile overlays (`fixed inset-0`, higher z) cover this bar by
 * design; desktop floating dialogs leave it visible. No em dashes in copy.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { isLoggedInStage, useGame } from "../state/GameContext";
import { activeBusiness } from "../state/gameCore";
import { ideaSummaryName } from "../state/floorSelectors";
import { isSignupEnabled } from "../config";
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
 * The app-stage game section (idea/business chip + stats + save indicator).
 * Mounted ONLY when stage === "app", so the other stages never touch the game
 * fields on the context. The chip shows the ACTIVE idea's display name
 * (productName preferred via ideaSummaryName) and, when the active idea IS
 * the promoted business, the building emoji. It is a button that opens the
 * switcher only when there is another idea to switch to.
 */
function AppNavSection({ onOpenSwitcher }: { onOpenSwitcher?: () => void }) {
  const game = useGame();
  const { ideas, activeIdea, grossSalesSumCents, salesSumCents, syncStatus } = game;
  const name = ideaSummaryName(game, activeIdea);
  const business = activeBusiness(game);
  const isBusiness = Boolean(business && ideas[activeIdea] && business.ideaId === ideas[activeIdea].id);
  const chipInner = (
    <>
      {isBusiness ? <span aria-hidden>🏢</span> : null}
      <span className="max-w-[6rem] truncate sm:max-w-[13rem]">{name}</span>
    </>
  );
  // Regular bold text, no pill: no background, border, or rounding. The >1-idea
  // button keeps its 44px hit target via min-h + a little inline padding only.
  const chipClass =
    "inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-ink";
  return (
    <>
      {ideas.length > 1 ? (
        <button
          type="button"
          onClick={onOpenSwitcher}
          aria-label="Switch idea"
          aria-haspopup="dialog"
          className={`${chipClass} min-h-[44px] px-1 transition-colors hover:text-[hsl(14_78%_44%)]`}
        >
          {chipInner}
          <ChevronDown size={14} aria-hidden className="shrink-0" />
        </button>
      ) : ideas.length === 1 ? (
        <span className={`${chipClass} py-1.5`}>{chipInner}</span>
      ) : null}
      <MoneyStat label="Sales" cents={grossSalesSumCents()} />
      <MoneyStat label="Profit" cents={salesSumCents()} />
      <SaveIndicator status={syncStatus} />
    </>
  );
}

/**
 * The founder chip as an Account dropdown: clicking the chip opens a small
 * menu (title "Account") holding the Log out action. Dependency-free —
 * useState + refs + a document mousedown listener; Escape closes and returns
 * focus to the chip. The menu is z-50 so it floats above the sticky z-40 bar's
 * floor content, right-aligned under the chip so it never overflows at 390px.
 */
function AccountMenu({ founder, onLogout }: { founder: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);

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
        className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-[hsl(14_78%_54%/0.12)] px-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[hsl(14_78%_44%)] transition-colors hover:bg-[hsl(14_78%_54%/0.2)]"
      >
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

export function GlobalNav({ onOpenSwitcher }: { onOpenSwitcher?: () => void } = {}) {
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

        {loggedIn ? (
          <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 sm:gap-x-2.5">
            {stage === "app" ? <AppNavSection onOpenSwitcher={onOpenSwitcher} /> : null}
            <AccountMenu founder={founder} onLogout={() => void logout()} />
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
