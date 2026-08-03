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
import { CRITERION_SEQUENCE, activeBusinessExists, phaseOfCriterion } from "../state/gameCore";
import { phaseById, stepById } from "../data/path";
import { useFocusTrap } from "../lib/useFocusTrap";

export function Celebration() {
  const game = useGame();
  const { celebrate, dispatch } = game;
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
  const phase = step ? phaseById(step.phase) : undefined;
  // Sequence-driven next criterion (Unit 6/8): the next-step block names the
  // next criterion + its room ACROSS phase boundaries (every criterion carries
  // a roomName; rooms without dialogs are named, inert cards on the floor).
  const seqPos = CRITERION_SEQUENCE.indexOf(celebrate);
  const nextId = seqPos >= 0 ? CRITERION_SEQUENCE[seqPos + 1] : undefined;
  const nextStep = nextId ? stepById(nextId) : undefined;
  // Terminal 5.5 (Unit 8 Tier C2): the last criterion of the whole sequence —
  // the same Celebration chrome with distinct terminal copy and NO next-step.
  const terminal = seqPos >= 0 && seqPos === CRITERION_SEQUENCE.length - 1;
  // The promotion seam: the next criterion is Grow's first and no business
  // exists yet — the next step is PROMOTION, not a room (the coach and the
  // Grow card carry the actual CTA once this dismisses).
  const promoteNext =
    !terminal &&
    nextStep !== undefined &&
    phaseOfCriterion(nextStep.id) === "grow" &&
    !activeBusinessExists(game);
  const showNextRoom = !terminal && !promoteNext && nextStep !== undefined;

  const keepGoing = () => dispatch({ type: "DISMISS_CELEBRATION" });

  return (
    <div className="fixed inset-0 z-[60] flex bg-[hsl(25_34%_20%/0.55)] sm:items-center sm:justify-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fp-celebrate-title"
        tabIndex={-1}
        className="fp-rise flex h-full w-full flex-col justify-center overflow-y-auto border-t-4 bg-[hsl(40_55%_97%)] px-6 py-9 text-center outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[480px] sm:justify-start sm:rounded-3xl sm:p-9 sm:shadow-[0_12px_32px_rgba(30,24,16,.2)]"
        style={{
          animation: "fp-rise .35s cubic-bezier(.22,1,.36,1) both",
          // Top border in the passed criterion's phase accent (sell unchanged).
          borderTopColor: phase?.accent ?? "hsl(14 78% 54%)",
        }}
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
          {terminal ? "★" : "✓"}
        </span>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.25em] text-[hsl(4_62%_46%)]">
          {terminal ? "Path complete" : "Criterion passed"}
        </p>
        <h2
          id="fp-celebrate-title"
          className="mt-2 font-display text-[28px] font-black leading-[1.15] text-[hsl(25_34%_20%)]"
        >
          {terminal ? "You built the whole path" : step?.title}
        </h2>
        {terminal && step ? (
          <p className="mt-2 text-[14px] leading-[1.6] text-[hsl(25_20%_38%)]">
            {step.title}. All 25 criteria, Sell to Scale. You did not just play a founder. You
            are one.
          </p>
        ) : null}
        {step ? (
          <p className="mt-1.5 font-mono text-sm text-[hsl(25_20%_38%)]">+{step.xp} XP</p>
        ) : null}

        {showNextRoom && nextStep ? (
          <div
            className="mt-[18px] rounded-2xl border-2 border-dashed p-3.5 text-left"
            style={{
              borderColor: phaseById(nextStep.phase).faded,
              background: phaseById(nextStep.phase).wash,
            }}
          >
            <p
              className="font-mono text-[10px] uppercase tracking-[0.08em]"
              style={{ color: phaseById(nextStep.phase).text }}
            >
              New on The Path
            </p>
            <p className="mt-1.5 font-display text-[17px] font-bold text-[hsl(25_34%_20%)]">
              {nextStep.id} · {nextStep.roomName}
            </p>
          </div>
        ) : null}

        {promoteNext ? (
          <div
            className="mt-[18px] rounded-2xl border-2 border-dashed p-3.5 text-left"
            style={{ borderColor: phaseById("grow").faded, background: phaseById("grow").wash }}
          >
            <p
              className="font-mono text-[10px] uppercase tracking-[0.08em]"
              style={{ color: phaseById("grow").text }}
            >
              Next up
            </p>
            <p className="mt-1.5 font-display text-[17px] font-bold text-[hsl(25_34%_20%)]">
              🏢 Make it your business
            </p>
            <p className="mt-1 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
              This idea passed Validate. Promote it to open Phase 4 · Grow.
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={keepGoing}
          className="mt-[22px] inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-verified px-5 font-display text-base font-bold text-white shadow-[0_5px_0_hsl(150_52%_26%)]"
        >
          {terminal ? "Back to the floor" : "Keep going →"}
        </button>
      </div>
    </div>
  );
}
