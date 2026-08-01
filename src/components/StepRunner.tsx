/**
 * The Step Runner (task dialog) — handoff §Step Runner, screenshot 10.
 *
 * Drives entirely off the REAL path.ts criterion (STEPS 1.1/1.2) and the active
 * idea's `done`/`fields` maps in the gameCore reducer. Open-state
 * (runnerOpen/runnerStep/runnerIndex/activeIdea) lives in the reducer, ABOVE the
 * FactoryFloor breakpoint conditional, so a lg/sm crossing never drops it.
 *
 * Draft handling (origin R6 — session expiry must never silently lose input):
 *   - The optional per-criterion input (step.field, e.g. 1.1 `oneLiner`) is saved
 *     PER IDEA through SET_FIELD (the reducer → sync → save doc is the source of
 *     truth on completion) AND mirrored to the account-scoped draft cache on every
 *     keystroke, so text typed but not yet synced survives an idle logout.
 *   - Hydration order: the idea's saved field first; when that is empty, we seed
 *     the reducer from the account-scoped draft so a re-login restores it.
 *
 * Minute estimate: the prototype shows a per-task "⏱ about N min", but path.ts
 * carries NO per-task minutes. Rather than invent a misleading number we OMIT the
 * chip (plan: "do not invent misleading data; keep truthful").
 *
 * Layout: full-screen below `sm`, floating dialog from `sm` up — the overlay
 * breakpoint (matches RoomShell). No further tiers.
 */
import { useEffect, useRef } from "react";
import { useGame } from "../state/GameContext";
import { parseTask, stepById } from "../data/path";
import { getDraft, setDraft, getLastUserId } from "../lib/draftCache";

/** Draft-cache name (within the user namespace) for a criterion field on an idea. */
function fieldDraftName(ideaIndex: number, key: string): string {
  return `runner:idea${ideaIndex}:${key}`;
}

export function StepRunner() {
  const { runnerOpen, runnerStep, runnerIndex, activeIdea, ideas, isTaskDone, celebrate, dispatch } =
    useGame();

  const panelRef = useRef<HTMLDivElement>(null);

  const open = runnerOpen && Boolean(runnerStep) && !celebrate;

  // Focus the dialog on open and wire Escape → close (CLOSE_RUNNER). Guarded on
  // `open` so listeners only exist while the runner is up.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "CLOSE_RUNNER" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dispatch]);

  const step = runnerStep ? stepById(runnerStep) : undefined;
  const total = step ? step.tasks.length : 0;
  const idx = total > 0 ? Math.min(Math.max(runnerIndex, 0), total - 1) : 0;

  // The criterion's single optional input (path.ts field). Shown on the first
  // task — that is where the artifact (e.g. the one-liner) is authored.
  const field = step?.field;
  const fieldKey = field && idx === 0 ? field.key : null;
  const idea = ideas[activeIdea];
  const reducerValue = fieldKey ? idea?.fields[fieldKey] ?? "" : "";
  const userId = getLastUserId();

  // Seed the reducer field from the account-scoped draft when the idea's saved
  // value is empty (R6 restore-after-expiry). Runs when the field/idea changes;
  // the `=== ""` guard makes it idempotent, so no dispatch loop.
  useEffect(() => {
    if (!open || !fieldKey || !userId || reducerValue !== "") return;
    const draft = getDraft<string>(userId, fieldDraftName(activeIdea, fieldKey));
    if (typeof draft === "string" && draft !== "") {
      dispatch({ type: "SET_FIELD", ideaIndex: activeIdea, key: fieldKey, value: draft });
    }
  }, [open, fieldKey, userId, reducerValue, activeIdea, dispatch]);

  if (!open || !step || !runnerStep) return null;

  const critNum = Number(runnerStep.split(".")[1]) || 1;
  const taskLabel = parseTask(step.tasks[idx]).label;
  const alreadyDone = isTaskDone(activeIdea, runnerStep, idx);
  const isLast = idx + 1 >= total;

  const advance = () => {
    if (!isLast) dispatch({ type: "OPEN_RUNNER", stepId: runnerStep, index: idx + 1 });
  };
  const doIt = () => {
    // The reducer marks the task done; on the final task it fires the celebration
    // and closes the runner. On middle tasks it does not advance, so we do.
    dispatch({ type: "COMPLETE_TASK", ideaIndex: activeIdea, stepId: runnerStep, index: idx });
    advance();
  };
  const onFieldChange = (value: string) => {
    if (!fieldKey) return;
    dispatch({ type: "SET_FIELD", ideaIndex: activeIdea, key: fieldKey, value });
    // Mirror to the account-scoped draft cache on keystroke (survives expiry, R6).
    if (userId) setDraft(userId, fieldDraftName(activeIdea, fieldKey), value);
  };

  const close = () => dispatch({ type: "CLOSE_RUNNER" });

  return (
    <div className="fixed inset-0 z-[55] flex bg-[hsl(25_34%_20%/0.55)] sm:items-center sm:justify-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fp-runner-title"
        tabIndex={-1}
        className="fp-rise flex h-full w-full flex-col overflow-y-auto bg-[hsl(40_55%_97%)] outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[640px] sm:rounded-3xl sm:border-2 sm:border-[hsl(25_34%_20%/0.15)] sm:shadow-[0_8px_0_rgba(120,80,40,.1)]"
        style={{ animation: "fp-rise .3s cubic-bezier(.22,1,.36,1) both" }}
      >
        {/* Header — Sell tint */}
        <header className="flex items-start justify-between gap-4 border-b-2 border-[hsl(25_34%_20%/0.1)] bg-[hsl(14_78%_54%/0.09)] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[hsl(14_78%_44%)]">
              Phase 1 · Sell · Criterion {critNum} of 5 · Idea #{activeIdea + 1}
            </p>
            <h2
              id="fp-runner-title"
              className="mt-1 font-display text-xl font-black leading-tight text-[hsl(25_34%_20%)]"
            >
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Back to the floor"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] text-sm text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.4)]"
          >
            ✕
          </button>
        </header>

        {/* Task rail — one segment per REAL task (1.1 has 5, 1.2 has 4) */}
        <div className="flex gap-1.5 border-b-2 border-[hsl(25_34%_20%/0.1)] px-5 py-3 sm:px-6">
          {step.tasks.map((raw, i) => {
            const done = isTaskDone(activeIdea, runnerStep, i);
            const color = done
              ? "hsl(150 52% 40%)"
              : i === idx
                ? "hsl(14 78% 54%)"
                : "hsl(25 34% 20% / .12)";
            return (
              <div key={i} className="min-w-0 flex-1">
                <div className="h-1.5 rounded-full" style={{ background: color }} />
                <p
                  className="mt-1.5 text-[9.5px] leading-[1.3] text-[hsl(25_20%_38%)]"
                  style={{ fontWeight: i === idx ? 700 : 400 }}
                >
                  {parseTask(raw).label}
                </p>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="px-5 pb-7 pt-5 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-sell font-mono text-xs font-bold text-white">
              {idx + 1}
            </span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
              Task {idx + 1} of {total}
            </span>
          </div>

          <h3 className="mt-3 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
            {taskLabel}
          </h3>
          <p className="mt-2.5 text-[14.5px] leading-[1.65] text-[hsl(25_20%_38%)]">{step.brief}</p>

          {field && fieldKey ? (
            <div className="mt-[18px]">
              <label
                htmlFor="fp-runner-field"
                className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]"
              >
                {field.label}
              </label>
              {field.long ? (
                <textarea
                  id="fp-runner-field"
                  rows={4}
                  value={reducerValue}
                  onChange={(e) => onFieldChange(e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full resize-y rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3 text-sm text-[hsl(25_34%_20%)] outline-none focus:border-sell"
                />
              ) : (
                <input
                  id="fp-runner-field"
                  value={reducerValue}
                  onChange={(e) => onFieldChange(e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3 text-sm text-[hsl(25_34%_20%)] outline-none focus:border-sell"
                />
              )}
            </div>
          ) : null}

          {/* Done-when callout — terracotta left border */}
          <div className="mt-[18px] rounded-r-[10px] border-l-2 border-sell bg-[hsl(40_30%_99%)] px-3.5 py-2.5">
            <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[hsl(25_20%_38%)]">
              Done when
            </p>
            <p className="mt-0.5 text-[13.5px] leading-[1.55] text-[hsl(25_34%_20%)]">{step.doneWhen}</p>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-3">
            {alreadyDone && isLast ? (
              <button
                type="button"
                disabled
                className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-verified px-5 font-display text-base font-bold text-white opacity-60 shadow-[0_5px_0_hsl(150_52%_26%)]"
              >
                ✓ Done
              </button>
            ) : alreadyDone ? (
              <button
                type="button"
                onClick={advance}
                className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-verified px-5 font-display text-base font-bold text-white shadow-[0_5px_0_hsl(150_52%_26%)]"
              >
                Next task →
              </button>
            ) : (
              <button
                type="button"
                onClick={doIt}
                className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-verified px-5 font-display text-base font-bold text-white shadow-[0_5px_0_hsl(150_52%_26%)]"
              >
                ✓ I did it
              </button>
            )}
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-[52px] items-center justify-center rounded-2xl border-2 border-[hsl(25_34%_20%/0.2)] px-5 font-display text-sm font-bold text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.5)]"
            >
              Back to the Floor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
