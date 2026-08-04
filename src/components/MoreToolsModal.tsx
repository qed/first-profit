/**
 * MoreToolsModal — the "More tools please" improvement-feedback dialog opened
 * from the Step Runner's action row (Change #8; successor to the retired
 * StuckBox affordance).
 *
 * A completely separate overlay (never visually nested in the runner): while it
 * is open the runner is not rendered; closing it returns to the runner exactly
 * as it was (runner open-state lives in the gameCore reducer and is untouched
 * here). The X and Escape both close WITHOUT sending.
 *
 * Submissions ride the SAME feedback channel StuckBox used:
 * GameContext.submitFeedback(taskId, body) — the caller boundary mints the row
 * UUID, stamps the session band, enforces the daily cap, and enqueues durably
 * into the sync outbox before the network attempt. So the immediate thanks
 * message shown on Send is honest, and it refines to the offline/failed/capped
 * wording when the outcome resolves (same honest-optimism flow, same
 * double-submit guard rationale: a synchronous ref flips before the submission
 * is minted, so one event-loop burst yields exactly one row).
 *
 * Mobile: full-screen below `sm`, floating dialog from `sm` up (the app-wide
 * overlay breakpoint, matching the runner shell). Every target is >= 44px.
 */
import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/GameContext";
import { FEEDBACK_BODY_MAX } from "../lib/sync";
import { useFocusTrap } from "../lib/useFocusTrap";

/** All user-facing copy in one place (kid-voiced, no em dashes) for review. */
export const MORE_TOOLS_COPY = {
  title: "Improve First Profit",
  question: "What could help you complete this unit task?",
  send: "Send",
  close: "Back to the task",
  sent: "Got it. Thanks for telling us!",
  queued: "Saved! It will send when you are back online.",
  dropped: "Hmm, that one could not send.",
  capped: "Wow, that is a lot of notes for one day. Try again tomorrow.",
} as const;

export function MoreToolsModal({
  taskId,
  taskTitle,
  onClose,
}: {
  /** The stable generated task id (x.x.x) the feedback is about. */
  taskId: string;
  /** The band-resolved task title shown so the child knows what this is about. */
  taskTitle: string;
  /** Return to the runner. NEVER sends. */
  onClose: () => void;
}) {
  const { submitFeedback } = useGame();
  const panelRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  // Synchronous in-flight guard: flips BEFORE the submission is minted so a
  // double-click in one event-loop burst yields exactly one row.
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
    // Honest optimism (the StuckBox flow): submitFeedback enqueues durably and
    // synchronously before its network attempt, so the immediate thanks below
    // is truthful the moment it renders; the copy refines when the outcome
    // resolves queued/dropped/capped.
    const outcome = submitFeedback(taskId, text);
    setText("");
    setMessage(MORE_TOOLS_COPY.sent);
    outcome
      .then((result) => {
        if (!mountedRef.current) return;
        if (result === "queued") setMessage(MORE_TOOLS_COPY.queued);
        else if (result === "dropped") setMessage(MORE_TOOLS_COPY.dropped);
        else if (result === "capped") setMessage(MORE_TOOLS_COPY.capped);
      })
      .catch(() => {
        // submitFeedback resolves outcomes rather than throwing, but a defect
        // must still surface honestly and never leak an unhandled rejection.
        if (!mountedRef.current) return;
        setMessage(MORE_TOOLS_COPY.dropped);
      });
  };

  return (
    <div className="fixed inset-0 z-[60] flex bg-[hsl(25_34%_20%/0.55)] sm:items-center sm:justify-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fp-more-tools-title"
        tabIndex={-1}
        className="fp-rise flex h-full w-full flex-col overflow-y-auto bg-[hsl(40_55%_97%)] outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[480px] sm:rounded-3xl sm:border-2 sm:border-[hsl(25_34%_20%/0.15)] sm:shadow-[0_8px_0_rgba(120,80,40,.1)]"
        style={{ animation: "fp-rise .3s cubic-bezier(.22,1,.36,1) both" }}
      >
        <header className="flex items-start justify-between gap-4 border-b-2 border-[hsl(25_34%_20%/0.1)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2
              id="fp-more-tools-title"
              className="font-display text-xl font-black leading-tight text-[hsl(25_34%_20%)]"
            >
              {MORE_TOOLS_COPY.title}
            </h2>
            <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
              Unit task {taskId}
            </p>
            <p className="mt-0.5 break-words text-[13.5px] font-bold leading-[1.4] text-[hsl(25_34%_20%)]">
              {taskTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={MORE_TOOLS_COPY.close}
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
                htmlFor="fp-more-tools-text"
                className="block text-[14px] font-bold leading-[1.5] text-[hsl(25_34%_20%)]"
              >
                {MORE_TOOLS_COPY.question}
              </label>
              <textarea
                id="fp-more-tools-text"
                rows={4}
                maxLength={FEEDBACK_BODY_MAX}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, FEEDBACK_BODY_MAX))}
                className="mt-2 w-full resize-y rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3 text-sm text-[hsl(25_34%_20%)] outline-none focus:border-sell"
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={send}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-sell px-5 font-display text-sm font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)]"
                >
                  {MORE_TOOLS_COPY.send}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
