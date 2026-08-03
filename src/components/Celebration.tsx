/**
 * The criterion-passed celebration — handoff §Step Runner (celebration) + §Design
 * Tokens (Ceremony). Fires when a criterion's last task completes (the reducer
 * sets `celebrate`); "Keep going →" dispatches DISMISS_CELEBRATION, and the
 * reducer decides whether to re-open the next criterion's runner or return to the
 * floor.
 *
 * Motion: wax-stamp spring + panel rise via the `fp-stamp` / `fp-rise` keyframes.
 * prefers-reduced-motion is honored in src/index.css (the media query zeroes both
 * animations with `!important`); the stamp keeps its static -6deg rest rotation
 * from the inline transform, so it shows without the spring.
 *
 * Only one modal is visible at a time: the Step Runner returns null while
 * `celebrate` is set, so these never stack.
 */
import { useEffect, useRef } from "react";
import { useGame } from "../state/GameContext";
import { CRITERION_SEQUENCE } from "../state/gameCore";
import { stepById } from "../data/path";
import { useFocusTrap } from "../lib/useFocusTrap";

/** Sell-criterion id → room name, for the "New on The Path" unlock line. */
const SELL_ROOMS: Record<string, string> = {
  "1.2": "The Sales Room",
  "1.3": "The Learning Room",
  "1.4": "The Pricing Room",
  "1.5": "The Outreach Room",
};

export function Celebration() {
  const { celebrate, dispatch } = useGame();
  const panelRef = useRef<HTMLDivElement>(null);

  const open = Boolean(celebrate);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "DISMISS_CELEBRATION" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dispatch]);

  useFocusTrap(panelRef, open);

  if (!celebrate) return null;

  const step = stepById(celebrate);
  // Sequence-driven next criterion (Unit 6): safe across phase boundaries —
  // at 1.5 the next id is "2.1", which has no SELL_ROOMS entry, so the "New on
  // The Path" block simply hides (Unit 8 generalizes it per phase).
  const seqPos = CRITERION_SEQUENCE.indexOf(celebrate);
  const nextId = seqPos >= 0 ? CRITERION_SEQUENCE[seqPos + 1] : undefined;
  const nextRoom = nextId ? SELL_ROOMS[nextId] : undefined;

  const keepGoing = () => dispatch({ type: "DISMISS_CELEBRATION" });

  return (
    <div className="fixed inset-0 z-[60] flex bg-[hsl(25_34%_20%/0.55)] sm:items-center sm:justify-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fp-celebrate-title"
        tabIndex={-1}
        className="fp-rise flex h-full w-full flex-col justify-center overflow-y-auto border-t-4 border-sell bg-[hsl(40_55%_97%)] px-6 py-9 text-center outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[480px] sm:justify-start sm:rounded-3xl sm:p-9 sm:shadow-[0_12px_32px_rgba(30,24,16,.2)]"
        style={{ animation: "fp-rise .35s cubic-bezier(.22,1,.36,1) both" }}
      >
        <span
          className="fp-stamp mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white"
          style={{
            background: "hsl(4 62% 46%)",
            transform: "rotate(-6deg)",
            animation: "fp-stamp .6s cubic-bezier(.34,1.56,.64,1) both",
          }}
          aria-hidden
        >
          ✓
        </span>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.25em] text-[hsl(4_62%_46%)]">
          Criterion passed
        </p>
        <h2
          id="fp-celebrate-title"
          className="mt-2 font-display text-[28px] font-black leading-[1.15] text-[hsl(25_34%_20%)]"
        >
          {step?.title}
        </h2>
        {step ? (
          <p className="mt-1.5 font-mono text-sm text-[hsl(25_20%_38%)]">+{step.xp} XP</p>
        ) : null}

        {nextRoom ? (
          <div className="mt-[18px] rounded-2xl border-2 border-dashed border-[hsl(14_78%_54%/0.4)] bg-[hsl(14_78%_54%/0.05)] p-3.5 text-left">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[hsl(14_78%_44%)]">
              New on The Path
            </p>
            <p className="mt-1.5 font-display text-[17px] font-bold text-[hsl(25_34%_20%)]">
              {nextId} · {nextRoom}
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={keepGoing}
          className="mt-[22px] inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-verified px-5 font-display text-base font-bold text-white shadow-[0_5px_0_hsl(150_52%_26%)]"
        >
          Keep going →
        </button>
      </div>
    </div>
  );
}
