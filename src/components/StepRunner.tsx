/**
 * The Step Runner (task dialog) — handoff §Step Runner, screenshot 10.
 *
 * Drives entirely off the REAL path.ts criterion (any of the 25 assembled
 * STEPS — the header derives phase name/number and criterion position from the
 * phase engine, so the runner renders correctly for every phase) and the active
 * idea's `done`/`fields` maps in the gameCore reducer. Open-state
 * (runnerOpen/runnerStep/runnerIndex/activeIdea) lives in the reducer, ABOVE the
 * FactoryFloor breakpoint conditional, so a lg/sm crossing never drops it.
 *
 * Draft handling (origin R6 — session expiry must never silently lose input):
 *   - The optional per-criterion inputs (step.fields, e.g. 1.1's product name +
 *     one-liner; legacy single step.field still supported) are saved PER IDEA
 *     through SET_FIELD (the reducer → sync → save doc is the source of truth on
 *     completion) AND mirrored to the account-scoped draft cache on every
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
import {
  allBandsNoteFor,
  doneWhenForBand,
  parseTask,
  phaseById,
  stepById,
  taskBodyForBand,
  taskTitleForBand,
} from "../data/path";
import { activeBusiness, criterionIdsForPhase, phaseOfCriterion } from "../state/gameCore";
import { ideaOneLiner, ideaSummaryName } from "../state/floorSelectors";
import { getDraft, setDraft, getLastUserId } from "../lib/draftCache";
import { useFocusTrap } from "../lib/useFocusTrap";
import { StuckBox, taskIdFor } from "./StuckBox";
import { isPublicSiteEnabled } from "../config";
import { SITE_ONE_LINER_MAX_CHARS } from "../lib/siteCopy";

/**
 * The one authored field that renders on the PUBLIC page (real-public-site
 * plan, Unit 6): the active idea's one-liner (FIELD_HOOKS key "oneLiner",
 * criterion 1.1). With the public site enabled it takes the public-string
 * treatment: the R6 input cap (140, matching the projection/render clamps —
 * see src/lib/siteCopy.ts) and commit → immediate flush (R11), exactly like
 * the headline editor in the Your Site room. Content screening stays
 * server-side at the projection/publish layer (blocked strings stored empty);
 * the client ships no blocklist corpus. Flag off → the field behaves exactly
 * as before (generic 2000 cap, debounced sync only).
 */
const PUBLIC_ONE_LINER_KEY = "oneLiner";

/** Draft-cache name (within the user namespace) for a criterion field on an idea. */
function fieldDraftName(ideaIndex: number, key: string): string {
  return `runner:idea${ideaIndex}:${key}`;
}

/**
 * The brief's markdown emphasis (`*wrong*`, `**9–12**`) rendered as plain
 * text: the runner shows generated task copy verbatim except these markers,
 * which would otherwise read as literal asterisks to the child.
 */
function stripEmphasis(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
}

/**
 * The `All bands:` note to display for a task, or undefined. The bare
 * "as written." sentinel means "no extra guidance" (the parser keeps it raw
 * because notes often carry inline band addenda) — showing it would read as
 * noise, so only substantive notes render.
 */
function displayAllBandsNote(taskId: string): string | undefined {
  const note = allBandsNoteFor(taskId);
  if (!note) return undefined;
  if (/^as written\.?$/i.test(note.trim())) return undefined;
  return stripEmphasis(note);
}

export function StepRunner() {
  const game = useGame();
  const {
    runnerOpen,
    runnerStep,
    runnerIndex,
    activeIdea,
    ideas,
    isTaskDone,
    celebrate,
    dispatch,
    band,
  } = game;

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

  useFocusTrap(panelRef, open);

  const step = runnerStep ? stepById(runnerStep) : undefined;
  const total = step ? step.tasks.length : 0;
  const idx = total > 0 ? Math.min(Math.max(runnerIndex, 0), total - 1) : 0;

  // The criterion's optional authored inputs (path.ts `fields`, or the legacy
  // single `field`). Shown on the first task — that is where the artifact (e.g.
  // 1.1's product name + one-liner) is authored.
  const stepFields = step ? (step.fields ?? (step.field ? [step.field] : [])) : [];
  const taskFields = idx === 0 ? stepFields : [];
  const idea = ideas[activeIdea];
  const userId = getLastUserId();

  // Seed each reducer field from the account-scoped draft when the idea's saved
  // value is empty (R6 restore-after-expiry). Runs when the fields/idea change;
  // the `!== ""` guard makes it idempotent, so no dispatch loop.
  useEffect(() => {
    if (!open || !userId || taskFields.length === 0) return;
    for (const f of taskFields) {
      if ((idea?.fields[f.key] ?? "") !== "") continue;
      const draft = getDraft<string>(userId, fieldDraftName(activeIdea, f.key));
      if (typeof draft === "string" && draft !== "") {
        dispatch({ type: "SET_FIELD", ideaIndex: activeIdea, key: f.key, value: draft });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, activeIdea, runnerStep, idx, ideas, dispatch]);

  if (!open || !step || !runnerStep) return null;

  // The criterion's companion room dialog (handoff §Rooms). Only 1.1 (idea) and
  // 1.2 (market) have a built dialog in Slice A; opening it closes the runner so
  // the two fixed overlays never stack (mirrors the prototype's openTaskRoom).
  const ROOM_DIALOG_NAMES: Record<string, string> = { idea: "The Idea Room", market: "The Sales Room" };
  const roomDialogName = ROOM_DIALOG_NAMES[step.room];
  const openRoomDialog = () => {
    dispatch({ type: "CLOSE_RUNNER" });
    dispatch({ type: "OPEN_ROOM", room: step.room });
  };

  // Phase-aware header chrome (Unit 8): phase name/number AND colors/tints from
  // the phase engine + PHASES data (path.ts, single source), "Criterion N of M"
  // from the criterion's position within ITS phase (M varies only if the
  // content does — never assume 5). Sell resolves to the exact values the
  // runner always used, so phase 1 renders unchanged.
  const phaseId = phaseOfCriterion(runnerStep);
  const phase = phaseId ? phaseById(phaseId) : undefined;
  const accent = phase?.accent ?? "hsl(14 78% 54%)";
  const accentText = phase?.text ?? "hsl(14 78% 44%)";
  const accentWash = phase?.wash ?? "hsl(14 78% 54% / .09)";
  const phaseCriteria = phaseId ? criterionIdsForPhase(phaseId) : [];
  const critNum = phaseCriteria.indexOf(runnerStep) + 1 || 1;
  const critTotal = phaseCriteria.length || 1;

  // Band-resolved task content (P0: the words the child reads must come from
  // the generated content at the session's band, per task — never the
  // per-criterion STEP_META chrome). The stable task id is positional,
  // `${criterionId}.${index+1}` (taskIdFor, pinned by StuckBox.test against
  // every generated id). The accessors fall back safely: titles and done-when
  // lines are band-invariant, and a band without an authored variant reads the
  // shared body alone — so the `?? step.*` fallbacks below can only fire if a
  // task id ever failed to resolve, keeping the screen non-empty even then.
  const currentTaskId = taskIdFor(runnerStep, idx);
  const taskLabel =
    taskTitleForBand(currentTaskId, band) ?? parseTask(step.tasks[idx]).label;
  const taskBody = taskBodyForBand(currentTaskId, band);
  const taskBodyText = taskBody ? stripEmphasis(taskBody) : step.brief;
  const taskDoneWhen = doneWhenForBand(currentTaskId, band) ?? step.doneWhen;
  const allBandsNote = displayAllBandsNote(currentTaskId);

  // Idea/business context for the header (Unit 8; origin IA decision): phases
  // 1-3 name the idea being worked (one-liner when authored); phases 4-5 name
  // THE BUSINESS — the promoted idea's one-liner (a business IS a promoted
  // idea, never a separate name).
  const isBusinessPhase = phaseId === "grow" || phaseId === "scale";
  let ideaContext: string;
  if (isBusinessPhase) {
    const business = activeBusiness(game);
    const bizIndex = business ? ideas.findIndex((i) => i.id === business.ideaId) : -1;
    ideaContext = `Your business · ${bizIndex >= 0 ? ideaSummaryName(game, bizIndex) : `Idea #${activeIdea + 1}`}`;
  } else {
    const liner = ideaOneLiner(game, activeIdea);
    ideaContext = liner
      ? `Idea #${activeIdea + 1} · ${ideaSummaryName(game, activeIdea)}`
      : `Idea #${activeIdea + 1}`;
  }
  const alreadyDone = isTaskDone(activeIdea, runnerStep, idx);
  const isLast = idx + 1 >= total;

  const advance = () => {
    if (!isLast) dispatch({ type: "OPEN_RUNNER", stepId: runnerStep, index: idx + 1 });
  };
  const doIt = () => {
    // The reducer marks the task done; on the final task it fires the celebration
    // and closes the runner. On middle tasks it does not advance, so we do.
    // `at` is caller-stamped (gameCore stays Date.now()-free) so completion
    // timestamps make silent stalls queryable for the cohort (R13).
    dispatch({
      type: "COMPLETE_TASK",
      ideaIndex: activeIdea,
      stepId: runnerStep,
      index: idx,
      at: Date.now(),
    });
    advance();
  };
  const onFieldChange = (key: string, value: string) => {
    dispatch({ type: "SET_FIELD", ideaIndex: activeIdea, key, value });
    // Mirror to the account-scoped draft cache on keystroke (survives expiry, R6).
    if (userId) setDraft(userId, fieldDraftName(activeIdea, key), value);
  };

  const close = () => dispatch({ type: "CLOSE_RUNNER" });

  // Primary CTA per phase (PHASES data): Sell keeps the pre-Unit-8 verified
  // green EXACTLY (the classes below); the other phases take the phase's
  // ctaFill/ctaShadow tokens (unit review FIX 4) — the WCAG-safe deepened
  // fills, NOT the raw accent (scale's amber accent is 1.97:1 under white
  // text; every ctaFill is computed-verified >= 4.5:1 by phaseContrast.test).
  const ctaStyle =
    phase && phaseId !== "sell"
      ? { background: phase.ctaFill, boxShadow: `0 5px 0 ${phase.ctaShadow}` }
      : undefined;

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
        {/* Header — phase tint/text from PHASES (sell values match pre-Unit-8) */}
        <header
          className="flex items-start justify-between gap-4 border-b-2 border-[hsl(25_34%_20%/0.1)] px-5 py-4 sm:px-6"
          style={{ background: accentWash }}
        >
          <div className="min-w-0">
            {/* Wraps (never truncates) so the idea/business context stays
                visible at 390px. */}
            <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: accentText }}>
              Phase {phase?.index ?? 1} · {phase?.name ?? "Sell"} · Criterion {critNum} of {critTotal} · {ideaContext}
            </p>
            <h2
              id="fp-runner-title"
              className="mt-1 font-display text-xl font-black leading-tight text-[hsl(25_34%_20%)]"
            >
              {step.title}
            </h2>
            {/* Criterion intro chrome (STEP_META brief) — the per-TASK words
                below come from the banded content accessors. */}
            <p className="mt-1 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
              {step.brief}
            </p>
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

        {/* Task rail — one segment per REAL task (counts vary per criterion:
            2.3 has six, 3.4 has four — always step.tasks.length) */}
        <div className="flex gap-1.5 border-b-2 border-[hsl(25_34%_20%/0.1)] px-5 py-3 sm:px-6">
          {step.tasks.map((raw, i) => {
            const done = isTaskDone(activeIdea, runnerStep, i);
            // Rail: done stays the app-wide verified green; the CURRENT segment
            // takes the phase accent (sell = the exact pre-Unit-8 value).
            const color = done
              ? "hsl(150 52% 40%)"
              : i === idx
                ? accent
                : "hsl(25 34% 20% / .12)";
            return (
              <div key={i} className="min-w-0 flex-1">
                <div className="h-1.5 rounded-full" style={{ background: color }} />
                <p
                  className="mt-1.5 text-[9.5px] leading-[1.3] text-[hsl(25_20%_38%)]"
                  style={{ fontWeight: i === idx ? 700 : 400 }}
                >
                  {taskTitleForBand(taskIdFor(runnerStep, i), band) ?? parseTask(raw).label}
                </p>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="px-5 pb-7 pt-5 sm:px-6">
          <div className="flex items-center gap-2">
            <span
              className="flex h-[26px] w-[26px] items-center justify-center rounded-lg font-mono text-xs font-bold text-white"
              style={{ background: accent }}
            >
              {idx + 1}
            </span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
              Task {idx + 1} of {total}
            </span>
          </div>

          <h3 className="mt-3 font-display text-[26px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
            {taskLabel}
          </h3>
          {/* Banded instruction body: the shared body plus the session band's
              variant line (taskBodyForBand joins them with \n; pre-line keeps
              the variant on its own line). break-words guards a long token at
              390px. */}
          <p className="mt-2.5 whitespace-pre-line break-words text-[14.5px] leading-[1.65] text-[hsl(25_20%_38%)]">
            {taskBodyText}
          </p>
          {allBandsNote ? (
            <p className="mt-2 break-words text-[13px] italic leading-[1.55] text-[hsl(25_20%_38%)]">
              All bands: {allBandsNote}
            </p>
          ) : null}

          {/* maxLength caps (2000 single-line / 4000 textarea) keep the aggregate
              save doc well under the server's 256KiB cap even at MAX_IDEAS=5, so a
              large paste can't trigger a terminal save failure that kills all future
              saves. */}
          {taskFields.map((f) => {
            const value = idea?.fields[f.key] ?? "";
            const inputId = `fp-runner-field-${f.key}`;
            // Public-string treatment for the one-liner (see PUBLIC_ONE_LINER_KEY
            // doc). game.flushNow is optional-called defensively: test harnesses
            // that stub the context may omit it, and flag-off never calls it.
            const isPublicString = isPublicSiteEnabled() && f.key === PUBLIC_ONE_LINER_KEY;
            const onCommit = isPublicString ? () => void game.flushNow?.() : undefined;
            return (
              <div key={f.key} className="mt-[18px]">
                <label
                  htmlFor={inputId}
                  className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]"
                >
                  {f.label}
                </label>
                {f.long ? (
                  <textarea
                    id={inputId}
                    rows={4}
                    maxLength={isPublicString ? SITE_ONE_LINER_MAX_CHARS : 4000}
                    value={value}
                    onChange={(e) => onFieldChange(f.key, e.target.value)}
                    onBlur={onCommit}
                    placeholder={f.placeholder}
                    className="w-full resize-y rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3 text-sm text-[hsl(25_34%_20%)] outline-none focus:border-sell"
                  />
                ) : (
                  <input
                    id={inputId}
                    maxLength={isPublicString ? SITE_ONE_LINER_MAX_CHARS : 2000}
                    value={value}
                    onChange={(e) => onFieldChange(f.key, e.target.value)}
                    onBlur={onCommit}
                    placeholder={f.placeholder}
                    className="w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3 text-sm text-[hsl(25_34%_20%)] outline-none focus:border-sell"
                  />
                )}
                {isPublicString ? (
                  // R23 accepted-limit nudge: this string renders on the PUBLIC
                  // page, and a blocklist cannot catch self-disclosure.
                  <p className="mt-1.5 text-[12px] text-[hsl(25_20%_38%)]">
                    This goes on your public page. No phone numbers, addresses, or last names.
                  </p>
                ) : null}
              </div>
            );
          })}

          {/* Done-when callout — phase-accent left border */}
          <div
            className="mt-[18px] rounded-r-[10px] border-l-2 bg-[hsl(40_30%_99%)] px-3.5 py-2.5"
            style={{ borderLeftColor: accent }}
          >
            <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[hsl(25_20%_38%)]">
              Done when
            </p>
            <p className="mt-0.5 break-words text-[13.5px] leading-[1.55] text-[hsl(25_34%_20%)]">{taskDoneWhen}</p>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-3">
            {alreadyDone && isLast ? (
              <button
                type="button"
                disabled
                className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-verified px-5 font-display text-base font-bold text-white opacity-60 shadow-[0_5px_0_hsl(150_52%_26%)]"
                style={ctaStyle}
              >
                ✓ Done
              </button>
            ) : alreadyDone ? (
              <button
                type="button"
                onClick={advance}
                className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-verified px-5 font-display text-base font-bold text-white shadow-[0_5px_0_hsl(150_52%_26%)]"
                style={ctaStyle}
              >
                Next task →
              </button>
            ) : (
              <button
                type="button"
                onClick={doIt}
                className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-verified px-5 font-display text-base font-bold text-white shadow-[0_5px_0_hsl(150_52%_26%)]"
                style={ctaStyle}
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

          {roomDialogName ? (
            <button
              type="button"
              onClick={openRoomDialog}
              className="mt-3 block w-full text-center text-[12px] text-[hsl(25_20%_38%)] underline decoration-[hsl(25_20%_38%/0.4)] underline-offset-2 hover:text-[hsl(25_34%_20%)]"
            >
              Everything you need for this task is inside {roomDialogName} →
            </button>
          ) : null}

          {/* "Stuck? Tell us" (Unit 2): below the CTA row so it never competes
              with the primary actions at 390px. Keyed per task so the box and
              its draft text reset when the runner moves to another task. */}
          <StuckBox key={taskIdFor(runnerStep, idx)} taskId={taskIdFor(runnerStep, idx)} />
        </div>
      </div>
    </div>
  );
}
