/**
 * Factory-floor HUD (handoff §H): parchment rounded bar with logo + wordmark, a
 * Sell phase chip (n/5 criteria), right-side Sales / Profit stats, the founder
 * chip, and a small save-status indicator (from useGame().syncStatus). Log out
 * moved to the persistent GlobalNav (spec 2026-08-02-global-nav-design.md).
 *
 * Per the handoff HUD spec: NO XP, NO website link.
 * Dollars are whole-dollar (cents / 100, floored) mono numerals.
 */
import { useGame } from "../state/GameContext";
import { criterionIdsForPhase } from "../state/gameCore";
import type { SyncStatus } from "../lib/sync";

function LogoMark() {
  return (
    <span className="flex h-6 shrink-0 items-end gap-[3px]" aria-label="First Profit" role="img">
      <span className="h-2.5 w-[4px] rounded-sm bg-sell" />
      <span className="h-3.5 w-[4px] rounded-sm bg-build" />
      <span className="h-[18px] w-[4px] rounded-sm bg-validate" />
      <span className="h-[22px] w-[4px] rounded-sm bg-grow" />
      <span className="h-6 w-[4px] rounded-sm bg-scale" />
    </span>
  );
}

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

export function Hud() {
  const { profile, activeIdea, isCriterionDone, grossSalesSumCents, salesSumCents, syncStatus } = useGame();
  // All five Sell criteria count now (Unit 6 engine); the chip stays Sell-scoped
  // until Unit 8 makes the HUD phase-aware.
  const phaseDone = criterionIdsForPhase("sell").filter((id) => isCriterionDone(activeIdea, id)).length;
  const founder = profile.firstName || profile.handle || "Founder";

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[20px] border-2 border-[hsl(25_34%_20%/0.1)] bg-[hsl(40_55%_97%)] px-4 py-3 sm:px-5">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <p className="font-display text-[13px] font-extrabold leading-none tracking-[0.02em]">FIRST PROFIT</p>
      </div>

      <div className="flex items-center gap-2 rounded-[10px] border-2 border-sell bg-[hsl(14_78%_54%/0.09)] px-3 py-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-sell font-mono text-[10px] font-bold text-white">
          1
        </span>
        <span className="text-[12.5px] font-semibold text-[hsl(14_78%_44%)]">Sell</span>
        <span className="font-mono text-[10.5px] text-[hsl(25_20%_38%)]">{phaseDone}/5 criteria</span>
      </div>

      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <div className="text-right">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">Sales</p>
          <p className="font-mono text-[16px] font-bold leading-tight">${dollars(grossSalesSumCents())}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">Net of fees</p>
          <p className="font-mono text-[16px] font-bold leading-tight">
            ${dollars(salesSumCents())} <span className="text-[10px] font-normal text-[hsl(25_20%_38%)]">of $1,000</span>
          </p>
        </div>
        {/* Always present (handoff HUD element). Compact + truncated on mobile so
            a long first name never forces horizontal scroll at 390px. */}
        <span className="inline-block max-w-[4.5rem] truncate rounded-full bg-[hsl(14_78%_54%/0.12)] px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[hsl(14_78%_44%)] sm:max-w-[12rem]">
          {founder}
        </span>
        <SaveIndicator status={syncStatus} />
      </div>
    </header>
  );
}
