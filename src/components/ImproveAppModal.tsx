/**
 * ImproveAppModal — the floor-level "Improve First Profit" suggestion dialog
 * (Change #9), opened by the blue CTA docked above the green Next Step coach on
 * every factory floor view (phases overview and each criterion floor).
 *
 * Mirrors MoreToolsModal's house shell exactly (same overlay breakpoints, same
 * focus trap, same X/Escape close-without-sending, same honest-optimism send
 * flow and double-submit guard) but rides the SAME feedback channel with
 * kind 'app' — a suggestion about the product as a whole, not the unit task.
 *
 * task_id stamping: fp_task_feedback.task_id is NOT NULL with an x.x.x CHECK,
 * so an app-kind row still needs a syntactically valid task id even though the
 * suggestion is not about a task. We stamp the child's CURRENT position (it
 * doubles as useful "where were they when they said this" context):
 *   1. nextTaskId(state, activeIdea) — the active idea's next workable task;
 *   2. if null (path complete, or the frontier phase is gated), the Step
 *      Runner's open task if one is open;
 *   3. else the constant "1.1.1" — always CHECK-valid, never blocks a send.
 */
import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/GameContext";
import { FEEDBACK_BODY_MAX } from "../lib/sync";
import { useFocusTrap } from "../lib/useFocusTrap";
import { nextTaskId } from "../state/floorSelectors";
import type { GameState } from "../state/gameCore";

/** All user-facing copy in one place (kid-voiced, no em dashes) for review. */
export const IMPROVE_APP_COPY = {
  title: "Improve First Profit",
  question:
    "What could we improve about First Profit? Any part, the game, the content, the tools. Anything is fair game.",
  hint: "Do not put names or addresses in here.",
  send: "Send",
  close: "Close",
  sent: "Got it. Thanks for telling us!",
  queued: "Saved! It will send when you are back online.",
  dropped: "Hmm, that one could not send.",
  capped: "Wow, that is a lot of notes for one day. Try again tomorrow.",
} as const;

/**
 * The x.x.x task id stamped on an app-kind suggestion (see the file doc for
 * the three-step fallback and why a valid id is required at all). Exported for
 * the component test suite.
 */
export function appFeedbackTaskId(state: GameState): string {
  const next = nextTaskId(state, state.activeIdea);
  if (next) return next;
  if (state.runnerOpen && state.runnerStep) return `${state.runnerStep}.${state.runnerIndex + 1}`;
  return "1.1.1";
}

export function ImproveAppModal({ onClose }: { /** Close WITHOUT sending. */ onClose: () => void }) {
  const game = useGame();
  const { submitFeedback } = game;
  const panelRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  // Synchronous in-flight guard (the MoreToolsModal pattern): flips BEFORE the
  // submission is minted so one event-loop burst yields exactly one row.
  const submittingRef = useRef(false);
  // Unmount guard: the resolution handlers below no-op after close/unmount.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Focus the dialog on open; Escape mirrors the X (close without sending).
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useFocusTrap(panelRef, true);

  const send = () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    // Honest optimism (the MoreToolsModal flow): submitFeedback enqueues
    // durably and synchronously before its network attempt, so the immediate
    // thanks is truthful; the copy refines when the outcome resolves. The task
    // id is stamped AT SUBMISSION so it reflects where the child is right now.
    const outcome = submitFeedback(appFeedbackTaskId(game), text, undefined, "app");
    setText("");
    setMessage(IMPROVE_APP_COPY.sent);
    outcome
      .then((result) => {
        if (!mountedRef.current) return;
        if (result === "queued") setMessage(IMPROVE_APP_COPY.queued);
        else if (result === "dropped") setMessage(IMPROVE_APP_COPY.dropped);
        else if (result === "capped") setMessage(IMPROVE_APP_COPY.capped);
      })
      .catch(() => {
        // submitFeedback resolves outcomes rather than throwing, but a defect
        // must still surface honestly and never leak an unhandled rejection.
        if (!mountedRef.current) return;
        setMessage(IMPROVE_APP_COPY.dropped);
      });
  };

  return (
    <div className="fixed inset-0 z-[60] flex bg-[hsl(25_34%_20%/0.55)] sm:items-center sm:justify-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fp-improve-app-title"
        tabIndex={-1}
        className="fp-rise flex h-full w-full flex-col overflow-y-auto bg-[hsl(40_55%_97%)] outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[480px] sm:rounded-3xl sm:border-2 sm:border-[hsl(25_34%_20%/0.15)] sm:shadow-[0_8px_0_rgba(120,80,40,.1)]"
        style={{ animation: "fp-rise .3s cubic-bezier(.22,1,.36,1) both" }}
      >
        <header className="flex items-start justify-between gap-4 border-b-2 border-[hsl(25_34%_20%/0.1)] px-5 py-4 sm:px-6">
          <h2
            id="fp-improve-app-title"
            className="font-display text-xl font-black leading-tight text-[hsl(25_34%_20%)]"
          >
            {IMPROVE_APP_COPY.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={IMPROVE_APP_COPY.close}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] text-sm text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.4)]"
          >
            ✕
          </button>
        </header>

        <div className="px-5 pb-7 pt-5 sm:px-6" aria-live="polite">
          {message ? (
            <p className="flex min-h-[44px] items-center justify-center text-center text-[14px] font-semibold text-[hsl(150_52%_32%)]">
              {message}
            </p>
          ) : (
            <>
              <label
                htmlFor="fp-improve-app-text"
                className="block text-[14px] font-bold leading-[1.5] text-[hsl(25_34%_20%)]"
              >
                {IMPROVE_APP_COPY.question}
              </label>
              <textarea
                id="fp-improve-app-text"
                rows={4}
                maxLength={FEEDBACK_BODY_MAX}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, FEEDBACK_BODY_MAX))}
                className="mt-2 w-full resize-y rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3 text-sm text-[hsl(25_34%_20%)] outline-none focus:border-build"
              />
              <p className="mt-1 text-[11.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
                {IMPROVE_APP_COPY.hint}
              </p>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={send}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-build px-5 font-display text-sm font-bold text-white shadow-[0_3px_0_hsl(217_74%_36%)]"
                >
                  {IMPROVE_APP_COPY.send}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
