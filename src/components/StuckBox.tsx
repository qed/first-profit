/**
 * StuckBox — the per-task "Stuck? Tell us" cohort feedback affordance
 * (plan Unit 2, R11/R13/R14).
 *
 * A collapsed text link under the Step Runner's task body. Expanding it shows a
 * short textarea (with a kid-worded no-PII hint and a near-limit character
 * counter) and a Send button. Submitting with EMPTY text is allowed — a tap
 * with no words is valid "I'm stuck here" signal. Submissions ride the durable
 * sync outbox (enqueue-then-insert, client-minted UUID), so the confirmation
 * shown after a submit is honest: the report is durably queued even if the
 * device is offline, and the copy refines to the offline/failed wording when
 * the immediate attempt parks or (unreachably, in normal use) drops.
 *
 * Double-submit: a synchronous `useRef` in-flight guard flips before the
 * submission is minted (the client-minted-idempotency-key learning) — the UUID
 * only dedupes RE-DELIVERY, never a second click. The guard re-arms when the
 * box is re-opened, so re-reporting the same task later is allowed (each
 * submission is a new row).
 *
 * Mobile: base classes are the 390px layout; every target is >= 44px tall; the
 * whole affordance sits BELOW the runner's primary CTA row so it never competes
 * with the task actions.
 */
import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/GameContext";
import { FEEDBACK_BODY_MAX } from "../lib/sync";

/**
 * Phase A task id synthesis: the brief's task number is `${stepId}.${index+1}`.
 * Valid ONLY because play is limited to 1.1/1.2, whose 5-task lists align 1:1
 * with the brief (a pinned test asserts task index 4 of "1.2" stamps "1.2.5").
 * Unit 5 replaces this with real generated task ids.
 */
export function taskIdFor(stepId: string, index: number): string {
  return `${stepId}.${index + 1}`;
}

/** The character counter appears once this many characters are typed. */
export const COUNTER_FROM = 900;

/** All user-facing copy in one place (kid-voiced, no em dashes) for review. */
export const STUCK_COPY = {
  link: "Stuck? Tell us →",
  prompt: "What is confusing? You can also just send this empty.",
  hint: "Do not put names or addresses in here. Just say what is tricky.",
  send: "Send it",
  cancel: "Never mind",
  sent: "Got it. Thanks for telling us!",
  queued: "Saved! It will send when you are back online.",
  dropped: "Hmm, that one could not send.",
  capped: "Wow, that is a lot of notes for one day. Try again tomorrow.",
} as const;

export function StuckBox({ taskId }: { taskId: string }) {
  const { submitFeedback } = useGame();
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  // Synchronous in-flight guard: flips BEFORE the submission is minted so a
  // double-click in one event-loop burst yields exactly one row.
  const submittingRef = useRef(false);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Unmount guard: the .then/.catch resolution handlers below no-op after
  // unmount and never (re)schedule the revert timer post-unmount (the runner
  // unmounts/remounts the box per task via its key).
  const mountedRef = useRef(true);
  // Per-submission token: only the LATEST submission's resolution may write
  // the message or arm the timer — a slow first submit resolving after a
  // re-open + second submit is stale and must be ignored.
  const submitSeqRef = useRef(0);
  // The collapsed "Stuck? Tell us" link, refocused after a collapse so the
  // runner's focus trap never loses focus to <body> (the Send/Never mind
  // buttons the user just clicked cease to exist on collapse).
  const linkRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (revertTimer.current) clearTimeout(revertTimer.current);
    };
  }, []);

  // After a collapse initiated by Send or Never mind, move focus onto the link
  // (it only exists after the collapsed view renders, hence an effect).
  useEffect(() => {
    if (!expanded && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      linkRef.current?.focus();
    }
  }, [expanded]);

  const openBox = () => {
    // Re-arm the guard on the deliberate re-open boundary (a prior attempt may
    // still be awaiting a slow network; re-reporting later must not be blocked).
    submittingRef.current = false;
    if (revertTimer.current) clearTimeout(revertTimer.current);
    setMessage(null);
    setExpanded(true);
  };

  const armRevert = () => {
    // Only reached through the guarded resolution handlers, so never scheduled
    // after unmount (the unmount cleanup above also clears any live timer).
    if (revertTimer.current) clearTimeout(revertTimer.current);
    revertTimer.current = setTimeout(() => setMessage(null), 6000);
  };

  const submit = () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const token = ++submitSeqRef.current;
    // Honest-optimism flow (the simplest honest one): submitFeedback enqueues
    // DURABLY and synchronously before its network attempt, so the immediate
    // confirmation below is truthful the moment it renders — while the promise
    // resolves only after the network insert attempt, so gating the message on
    // it would stall the confirmation on a slow network. The copy refines when
    // the outcome resolves queued/dropped/capped.
    const outcome = submitFeedback(taskId, text);
    setExpanded(false);
    restoreFocusRef.current = true;
    setText("");
    setMessage(STUCK_COPY.sent);
    outcome
      .then((result) => {
        if (!mountedRef.current || token !== submitSeqRef.current) return; // unmounted/stale
        submittingRef.current = false;
        if (result === "queued") setMessage(STUCK_COPY.queued);
        else if (result === "dropped") setMessage(STUCK_COPY.dropped);
        else if (result === "capped") setMessage(STUCK_COPY.capped);
        armRevert();
      })
      .catch(() => {
        // submitFeedback resolves outcomes rather than throwing, but a defect
        // (or a throwing storage shim) must still revert the optimistic
        // message honestly, re-arm the guard, and never surface an unhandled
        // rejection.
        if (!mountedRef.current || token !== submitSeqRef.current) return;
        submittingRef.current = false;
        setMessage(STUCK_COPY.dropped);
        armRevert();
      });
  };

  const cancel = () => {
    restoreFocusRef.current = true;
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <div className="mt-2" aria-live="polite">
        {message ? (
          <p className="flex min-h-[24px] items-center justify-center text-center text-[13px] font-semibold text-[hsl(150_52%_32%)]">
            {message}
          </p>
        ) : null}
        <button
          ref={linkRef}
          type="button"
          onClick={openBox}
          className="flex min-h-[44px] w-full items-center justify-center text-[12px] text-[hsl(25_20%_38%)] underline decoration-[hsl(25_20%_38%/0.4)] underline-offset-2 hover:text-[hsl(25_34%_20%)]"
        >
          {STUCK_COPY.link}
        </button>
      </div>
    );
  }

  const remaining = FEEDBACK_BODY_MAX - text.length;

  return (
    <div className="mt-3 rounded-[14px] border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_30%_99%)] p-3.5">
      <label
        htmlFor="fp-stuck-text"
        className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]"
      >
        {STUCK_COPY.prompt}
      </label>
      <textarea
        id="fp-stuck-text"
        rows={3}
        maxLength={FEEDBACK_BODY_MAX}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, FEEDBACK_BODY_MAX))}
        className="mt-2 w-full resize-y rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3 text-sm text-[hsl(25_34%_20%)] outline-none focus:border-sell"
      />
      <div className="mt-1 flex items-start justify-between gap-2">
        <p className="text-[11.5px] leading-[1.5] text-[hsl(25_20%_38%)]">{STUCK_COPY.hint}</p>
        {text.length >= COUNTER_FROM ? (
          <p className="shrink-0 font-mono text-[11px] text-[hsl(14_78%_44%)]">
            {remaining} left
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex gap-2.5">
        <button
          type="button"
          onClick={submit}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-sell px-4 font-display text-sm font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)]"
        >
          {STUCK_COPY.send}
        </button>
        <button
          type="button"
          onClick={cancel}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.2)] px-4 font-display text-sm font-bold text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.5)]"
        >
          {STUCK_COPY.cancel}
        </button>
      </div>
    </div>
  );
}
