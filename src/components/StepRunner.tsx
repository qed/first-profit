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
 * Layout (2026-08-04): its OWN sectioned view, not a modal. It fills the
 * factory floor's box — absolute inset-0 inside Factory's floor region, with
 * the floor's own rounded red border — so the GlobalNav stays visible and
 * usable above it. Content splits across a left nav (Overview / Instructions /
 * Inputs / Tools); below `sm` that nav is a horizontal strip above the
 * content, from `sm` up a left rail. That is the app's one overlay
 * breakpoint — no further tiers.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { criterionIdsForPhase, phaseOfCriterion } from "../state/gameCore";
import { getDraft, setDraft, getLastUserId } from "../lib/draftCache";
import { AvatarSprite } from "./Avatar";
import { MoreToolsModal } from "./MoreToolsModal";
import { IdeaBrainstormTool } from "./tools/IdeaBrainstormTool";
import { ObjectionLogTool } from "./tools/ObjectionLogTool";
import { PitchBuilderTool } from "./tools/PitchBuilderTool";
import { PricePickerTool } from "./tools/PricePickerTool";
import { RehearsalStudioTool } from "./tools/RehearsalStudioTool";
import { SayBackCardTool } from "./tools/SayBackCardTool";
import { TenListBuilderTool } from "./tools/TenListBuilderTool";
import { isPublicSiteEnabled } from "../config";
import {
  IDEA_BRAINSTORM_PERSISTED_FIELD_KEYS,
  IDEA_BRAINSTORM_TASK_ID,
} from "../lib/ideaBrainstorm";
import { SITE_ONE_LINER_MAX_CHARS } from "../lib/siteCopy";
import { PITCH_PERSISTED_FIELD_KEYS, PITCH_TASK_ID } from "../lib/pitch";
import {
  REHEARSAL_PERSISTED_FIELD_KEYS,
  REHEARSAL_TASK_ID,
} from "../lib/rehearsal";
import {
  OBJECTION_LOG_PERSISTED_FIELD_KEYS,
  OBJECTION_LOG_TASK_ID,
} from "../lib/objectionLog";
import {
  SAY_BACK_PERSISTED_FIELD_KEYS,
  SAY_BACK_TASK_ID,
} from "../lib/sayBack";
import {
  PRICE_PICKER_PERSISTED_FIELD_KEYS,
  PRICE_PICKER_TASK_ID,
} from "../lib/pricePicker";
import {
  TEN_LIST_PERSISTED_FIELD_KEYS,
  TEN_LIST_TASK_ID,
} from "../lib/tenList";

/**
 * Task id synthesis: the generated stable task id is `${stepId}.${index+1}` —
 * ids are 1-based positional within their criterion, for ALL 25 criteria of
 * the generated content (task counts vary per criterion; the synthesis never
 * assumes 5). A pinned test (StepRunner.test.tsx) walks every criterion × task
 * index of PATH_CONTENT and asserts this synthesis matches the generated id
 * exactly, so a future id-scheme change fails the suite here.
 * (Moved here from the retired StuckBox when Change #8 removed that affordance.)
 */
export function taskIdFor(stepId: string, index: number): string {
  return `${stepId}.${index + 1}`;
}

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

/**
 * The runner's left-nav sections (2026-08-04). Overview carries the criterion
 * chrome that used to sit above the progress rail; Instructions carries the
 * per-task words; Inputs carries the authored fields; Tools is a declared
 * placeholder for task helpers that do not exist yet.
 */
export type RunnerSection = "overview" | "instructions" | "inputs" | "tools";

const SECTIONS: { id: RunnerSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "instructions", label: "Instructions" },
  { id: "inputs", label: "Inputs" },
  { id: "tools", label: "Tools" },
];

/** The one thing the Tools section says until real per-task tools land. */
export const TOOLS_PLACEHOLDER = "Tools to help you complete the unit task will go here.";

/**
 * How far above the room's bottom border the avatar stands when you arrive
 * (owner spec 2026-08-04), matching where a Next Step walk leaves it on the
 * floor.
 */
const AVATAR_BOTTOM_INSET_PX = 120;

/**
 * How long a walk inside the room takes before the click's action runs (owner
 * spec 2026-08-04: move first, then execute). Shorter than the floor's 550ms
 * because a room is a smaller space to cross; the CSS glide below is shorter
 * still, so the avatar visibly ARRIVES before anything happens.
 */
const ROOM_WALK_MS = 380;

/** Point two refs at one node (the room box is both focus target and the box
 *  the avatar is positioned inside). */
function mergeRoomRefs(
  a: React.MutableRefObject<HTMLDivElement | null>,
  b: React.MutableRefObject<HTMLDivElement | null>,
) {
  return (node: HTMLDivElement | null) => {
    a.current = node;
    b.current = node;
  };
}

/** What the Inputs section says when the task authors no fields. */
export const NO_INPUTS_LINE = "This task has nothing to type in.";

/** Section headings (owner spec 2026-08-04): every section names itself in
 *  bold, with its copy in the same face and size at regular weight. */
export const INPUTS_HEADING = "Steps to finish";
export const TOOLS_HEADING = "Available Tools";

/** First Profit blue / purple - the criterion and task blocks in the header. */
const CRITERION_BLUE = "hsl(217 74% 56%)";
const TASK_PURPLE = "hsl(265 52% 58%)";

/**
 * ONE headline style, used by EVERY section (owner spec 2026-08-04: every
 * section gets a headline, so each one opens with something readable rather
 * than a label or a wall of body copy).
 */
const SECTION_HEADLINE =
  "font-display text-[22px] font-black leading-[1.2] text-[hsl(25_34%_20%)]";

/**
 * The same face and size as SECTION_HEADLINE at regular weight — for copy that
 * sits directly under a headline and should read as its continuation rather
 * than drop to small print (owner spec 2026-08-04, Overview's summary).
 */
const SECTION_HEADLINE_REGULAR =
  "font-display text-[22px] font-normal leading-[1.35] text-[hsl(25_34%_20%)]";

/**
 * A numbered block in the room header: phase, criterion, task. `dark` carries
 * ink text instead of white - phase 5 (scale) is amber, where white text is
 * unreadable (1.97:1), so it is the one block that flips.
 */
function NumberBlock({ n, bg, dark }: { n: number; bg: string; dark?: boolean }) {
  return (
    <span
      className={`flex h-[26px] min-w-[26px] shrink-0 items-center justify-center rounded-lg px-1 font-mono text-xs font-bold ${
        dark ? "text-[hsl(25_34%_20%)]" : "text-white"
      }`}
      style={{ background: bg }}
    >
      {n}
    </span>
  );
}

/** The "Criterion" / "Task" words between the blocks. */
function BlockLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
      {children}
    </span>
  );
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
  const roomRef = useRef<HTMLDivElement>(null);
  const walkTimer = useRef<number | null>(null);
  // Where the avatar stands, as percentages of the room box. Null until the
  // layout effect below measures the room, so it never paints at a guess.
  const [avatarPos, setAvatarPos] = useState<{ x: number; y: number } | null>(null);

  const open = runnerOpen && Boolean(runnerStep) && !celebrate;

  // "More tools please" (Change #8): a completely separate feedback modal.
  // While it is open the runner is NOT rendered (never visually nested); the
  // runner's open-state stays untouched in the reducer, so closing the modal
  // returns to the exact same task. Local state resets if the runner closes.
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  useEffect(() => {
    if (!open) setMoreToolsOpen(false);
  }, [open]);

  // Which left-nav section is showing (2026-08-04). Resets to Overview
  // whenever the runner opens or the task changes, so every task starts on
  // its orientation content instead of stranding the child on, say, Inputs
  // for a task that has none.
  const [section, setSection] = useState<RunnerSection>("overview");
  useEffect(() => {
    setSection("overview");
  }, [open, runnerStep, runnerIndex]);

  // Place the avatar where you arrive: bottom center, AVATAR_BOTTOM_INSET_PX
  // above the room's bottom border. Measured in a LAYOUT effect so the correct
  // spot is set before the browser paints (no visible jump), and re-run per
  // task so each one starts you back at the door.
  useLayoutEffect(() => {
    if (!open) return;
    const h = roomRef.current?.clientHeight ?? 0;
    const y = h > AVATAR_BOTTOM_INSET_PX ? ((h - AVATAR_BOTTOM_INSET_PX) / h) * 100 : 85;
    setAvatarPos({ x: 50, y });
  }, [open, runnerStep, runnerIndex]);

  useEffect(() => {
    return () => {
      if (walkTimer.current) window.clearTimeout(walkTimer.current);
    };
  }, []);

  // Focus the dialog on open and wire Escape → close (CLOSE_RUNNER). Guarded on
  // `open` (and suspended while the More-tools modal owns the screen — its own
  // Escape closes only itself) so listeners only exist while the runner is up.
  // The moreToolsOpen dep also refocuses the panel when the modal hands back.
  useEffect(() => {
    if (!open || moreToolsOpen) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "CLOSE_RUNNER" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, moreToolsOpen, dispatch]);

  // No focus trap (change 16): the runner fills the FLOOR, not the screen,
  // and the GlobalNav above it stays interactive on purpose — trapping
  // focus here would contradict what the learner can see and tap.

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
  const currentTaskId = runnerStep ? taskIdFor(runnerStep, idx) : "";
  const restorableFieldKeys = [
    ...taskFields.map((field) => field.key),
    ...(currentTaskId === IDEA_BRAINSTORM_TASK_ID
      ? IDEA_BRAINSTORM_PERSISTED_FIELD_KEYS
      : []),
    ...(currentTaskId === PITCH_TASK_ID ? PITCH_PERSISTED_FIELD_KEYS : []),
    ...(currentTaskId === REHEARSAL_TASK_ID
      ? REHEARSAL_PERSISTED_FIELD_KEYS
      : []),
    ...(currentTaskId === OBJECTION_LOG_TASK_ID
      ? OBJECTION_LOG_PERSISTED_FIELD_KEYS
      : []),
    ...(currentTaskId === SAY_BACK_TASK_ID
      ? SAY_BACK_PERSISTED_FIELD_KEYS
      : []),
    ...(currentTaskId === PRICE_PICKER_TASK_ID
      ? PRICE_PICKER_PERSISTED_FIELD_KEYS
      : []),
    ...(currentTaskId === TEN_LIST_TASK_ID
      ? TEN_LIST_PERSISTED_FIELD_KEYS
      : []),
  ];

  // Seed each reducer field, including task-tool fields, from the account-scoped
  // draft when the idea's saved value is empty (R6 restore-after-expiry). Runs
  // when the fields/idea change; the `!== ""` guard makes it idempotent, so no
  // dispatch loop.
  useEffect(() => {
    if (!open || !userId || restorableFieldKeys.length === 0) return;
    for (const key of restorableFieldKeys) {
      if ((idea?.fields[key] ?? "") !== "") continue;
      const draft = getDraft<string>(userId, fieldDraftName(activeIdea, key));
      if (typeof draft === "string" && draft !== "") {
        dispatch({ type: "SET_FIELD", ideaIndex: activeIdea, key, value: draft });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, activeIdea, runnerStep, idx, ideas, dispatch]);

  if (!open || !step || !runnerStep) return null;

  // Phase-aware header chrome (Unit 8): phase name/number AND colors/tints from
  // the phase engine + PHASES data (path.ts, single source), "Criterion N of M"
  // from the criterion's position within ITS phase (M varies only if the
  // content does — never assume 5). Sell resolves to the exact values the
  // runner always used, so phase 1 renders unchanged.
  const phaseId = phaseOfCriterion(runnerStep);
  const phase = phaseId ? phaseById(phaseId) : undefined;
  const accent = phase?.accent ?? "hsl(14 78% 54%)";
  const phaseCriteria = phaseId ? criterionIdsForPhase(phaseId) : [];
  const critNum = phaseCriteria.indexOf(runnerStep) + 1 || 1;

  // Band-resolved task content (P0: the words the child reads must come from
  // the generated content at the session's band, per task — never the
  // per-criterion STEP_META chrome). The stable task id is positional,
  // `${criterionId}.${index+1}` (taskIdFor, pinned by StepRunner.test against
  // every generated id). The accessors fall back safely: titles and done-when
  // lines are band-invariant, and a band without an authored variant reads the
  // shared body alone — so the `?? step.*` fallbacks below can only fire if a
  // task id ever failed to resolve, keeping the screen non-empty even then.
  const taskLabel =
    taskTitleForBand(currentTaskId, band) ?? parseTask(step.tasks[idx]).label;
  const taskBody = taskBodyForBand(currentTaskId, band);
  const taskBodyText = taskBody ? stripEmphasis(taskBody) : step.brief;
  const taskDoneWhen = doneWhenForBand(currentTaskId, band) ?? step.doneWhen;
  const allBandsNote = displayAllBandsNote(currentTaskId);

  const alreadyDone = isTaskDone(activeIdea, runnerStep, idx);
  const isLast = idx + 1 >= total;

  const advance = () => {
    if (!isLast) dispatch({ type: "OPEN_RUNNER", stepId: runnerStep, index: idx + 1 });
  };
  const markCurrentTaskDone = () => {
    if (alreadyDone) return;
    // `at` is caller-stamped (gameCore stays Date.now()-free) so completion
    // timestamps make silent stalls queryable for the cohort (R13). Tools may
    // mark their own evidence complete without forcing an immediate navigation.
    dispatch({
      type: "COMPLETE_TASK",
      ideaIndex: activeIdea,
      stepId: runnerStep,
      index: idx,
      at: Date.now(),
    });
  };
  const doIt = () => {
    // The reducer marks the task done; on the final task it fires the celebration
    // and closes the runner. On middle tasks it does not advance, so we do.
    markCurrentTaskDone();
    advance();
  };
  const onFieldChange = (key: string, value: string) => {
    dispatch({ type: "SET_FIELD", ideaIndex: activeIdea, key, value });
    // Mirror to the account-scoped draft cache on keystroke (survives expiry, R6).
    if (userId) setDraft(userId, fieldDraftName(activeIdea, key), value);
  };

  const close = () => {
    // BUG-008: dismissing the runner on an idea the child never touched — no
    // field text anywhere, no task completed — REMOVES the idea instead of
    // leaving an empty "Not named yet" husk occupying a floor slot. It rides
    // the same tombstoned DELETE_IDEA as the explicit delete flow (the
    // reducer closes the runner as part of the delete), so a stale-doc union
    // can never resurrect the husk. Any refusal — an id-less legacy idea, a
    // business reference, the tombstone cap — falls through to a plain close.
    const pristine =
      Object.keys(idea?.done ?? {}).length === 0 &&
      Object.values(idea?.fields ?? {}).every((v) => !String(v ?? "").trim());
    if (pristine && idea?.id && game.deleteIdea?.(idea.id)) return;
    dispatch({ type: "CLOSE_RUNNER" });
  };

  /**
   * MOVE FIRST, THEN ACT (owner spec 2026-08-04): a mouse click anywhere in
   * the room walks the avatar to the pointer (see onRoomClick) and only then
   * runs the control's action, exactly like a card tap on the factory floor.
   *
   * A keyboard or programmatic activation (`detail === 0`) runs IMMEDIATELY:
   * the instruction is about mouse clicks, and making a keyboard user wait out
   * an animation they did not aim would be a straight accessibility
   * regression. Typing is unaffected either way — inputs fire change events,
   * not clicks, so nothing about entering text is delayed.
   */
  const walkThen = (run: () => void) => (e: React.MouseEvent) => {
    if (e.detail === 0) {
      run();
      return;
    }
    if (walkTimer.current) window.clearTimeout(walkTimer.current);
    walkTimer.current = window.setTimeout(run, ROOM_WALK_MS);
  };

  /** Point the avatar at the pointer. Every click in the room bubbles here,
   *  so controls do not each have to place the avatar themselves. */
  const onRoomClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.detail === 0) return; // keyboard activation carries no coordinates
    const rect = roomRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAvatarPos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  // Primary CTA per phase (PHASES data): Sell keeps the pre-Unit-8 verified
  // green EXACTLY (the classes below); the other phases take the phase's
  // ctaFill/ctaShadow tokens (unit review FIX 4) — the WCAG-safe deepened
  // fills, NOT the raw accent (scale's amber accent is 1.97:1 under white
  // text; every ctaFill is computed-verified >= 4.5:1 by phaseContrast.test).
  const ctaStyle =
    phase && phaseId !== "sell"
      ? { background: phase.ctaFill, boxShadow: `0 3px 0 ${phase.ctaShadow}` }
      : undefined;

  // The More-tools modal fully replaces the runner overlay while open (own
  // clean overlay, runner hidden and inert underneath — it is simply not
  // mounted). All runner open-state lives in the reducer, so handing back
  // re-renders the exact same task.
  if (moreToolsOpen) {
    return (
      <MoreToolsModal
        taskId={currentTaskId}
        taskTitle={taskLabel}
        onClose={() => setMoreToolsOpen(false)}
      />
    );
  }

  return (
    // Its own VIEW, not a floating modal (2026-08-04): opaque, no scrim, no
    // rounded card at sm. It fills the FACTORY FLOOR's box rather than the
    // whole viewport (owner spec, change 16) — absolute inset-0 inside
    // Factory's floor region, wearing the same rounded red border the floor
    // wears — so the GlobalNav stays visible and usable above it and the task
    // view sits exactly where the floor it replaced sat.
    //
    // NOT aria-modal, and no focus trap: the nav above it is deliberately
    // still reachable, so trapping focus here would contradict what the
    // learner can see. The floor underneath IS inert (Factory), so nothing
    // hidden behind this panel can take a tap or a tab. Escape still closes.
    <div
      ref={mergeRoomRefs(panelRef, roomRef)}
      onClick={onRoomClick}
      role="dialog"
      aria-labelledby="fp-runner-title"
      tabIndex={-1}
      className="fp-rise fp-grid absolute inset-0 z-[45] rounded-[22px] border-2 border-[hsl(14_78%_54%/0.5)] bg-[hsl(38_40%_92%)] p-4 outline-none sm:p-7"
      style={{ animation: "fp-rise .3s cubic-bezier(.22,1,.36,1) both" }}
    >
      {/* The room's own FLOOR shows through around this panel (owner spec
          2026-08-04): the outer box wears the floor's grid, surface color and
          red border, and pads its content by the same amount the phase floor
          pads its cards (p-4 at 390px, p-7 from sm) — so a unit task sits ON
          the floor of the room instead of covering it wall to wall. */}
      <div className="flex h-full w-full flex-col overflow-hidden rounded-[16px] border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] shadow-[0_6px_0_rgba(120,80,40,.1)]">
      {/* The room header (owner spec 2026-08-04): NO background, and it states
          the whole address in one line - which phase, which criterion, which
          task, and the criterion's headline - so you always know which room
          you are in and where you are on The Path. It carries the view's
          accessible name, so no separate sr-only heading is needed. */}
      <header className="flex items-start justify-between gap-3 px-5 py-3 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          {/* Phase: the phase's own color. Phase 5 (scale) is amber, so it
              takes ink text where the other four take white. */}
          <NumberBlock n={phase?.index ?? 1} bg={accent} dark={phaseId === "scale"} />
          <BlockLabel>Criterion</BlockLabel>
          <NumberBlock n={critNum} bg={CRITERION_BLUE} />
          <BlockLabel>Task</BlockLabel>
          <NumberBlock n={idx + 1} bg={TASK_PURPLE} />
          {/* The UNIT TASK's title (owner spec 2026-08-04), so the headline
              changes as you move task to task. The criterion title was static
              across all five and told you nothing about where you were. */}
          <h1 id="fp-runner-title" className={`${SECTION_HEADLINE} min-w-0 basis-full sm:basis-auto`}>
            {taskLabel}
          </h1>
        </div>
        <button
          type="button"
          onClick={walkThen(close)}
          aria-label="Close"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] text-sm text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.4)]"
        >
          ✕
        </button>
      </header>

      {/* Task rail — one segment per REAL task (counts vary per criterion:
          2.3 has six, 3.4 has four — always step.tasks.length). Same styling
          as ever, still across the top of the view.
          Every segment is a BUTTON as of 2026-08-04: tapping one jumps
          straight to that task, so the rail is navigation and not just a
          progress readout. Jumping only moves `runnerIndex` (the same
          OPEN_RUNNER the Next CTA dispatches) — it never completes or
          un-completes anything, so a kid can read ahead and come back
          without touching their record. The current segment is aria-current
          and inert (tapping it is a no-op). */}
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
          const title = taskTitleForBand(taskIdFor(runnerStep, i), band) ?? parseTask(raw).label;
          return (
            <button
              key={i}
              type="button"
              onClick={walkThen(() => {
                if (i !== idx) dispatch({ type: "OPEN_RUNNER", stepId: runnerStep, index: i });
              })}
              aria-current={i === idx ? "step" : undefined}
              aria-label={`Task ${i + 1} of ${total}: ${title}`}
              className="min-w-0 flex-1 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sell/40"
            >
              <span className="block h-1.5 rounded-full" style={{ background: color }} />
              <span
                className="mt-1.5 block text-[9.5px] leading-[1.3] text-[hsl(25_20%_38%)]"
                style={{ fontWeight: i === idx ? 700 : 400 }}
              >
                {title}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body: the section nav + the selected section. Below sm the "left nav"
          is a horizontal strip above the content (the same sm overlay
          breakpoint the rest of the app switches on — no new tier); from sm up
          it is a real left rail. */}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav
          aria-label="Task sections"
          className="flex shrink-0 gap-0.5 overflow-x-auto border-b-2 border-[hsl(25_34%_20%/0.1)] px-2 py-2.5 sm:w-[184px] sm:flex-col sm:gap-1.5 sm:overflow-x-visible sm:border-b-0 sm:border-r-2 sm:px-3 sm:py-4"
        >
          {SECTIONS.map((s) => {
            const selected = s.id === section;
            return (
              <button
                key={s.id}
                type="button"
                onClick={walkThen(() => setSection(s.id))}
                aria-current={selected ? "true" : undefined}
                className={`flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-xl px-2 font-display text-[13px] font-bold transition-colors sm:w-full sm:px-3.5 sm:text-sm ${
                  selected ? "text-white" : "text-[hsl(25_20%_38%)] hover:bg-[hsl(25_34%_20%/0.06)]"
                }`}
                style={selected ? { background: accent } : undefined}
              >
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {section === "overview" ? (
            <div>
              {/* "Summary" names the section; the copy under it is the TASK's
                  description (owner spec 2026-08-04), so it changes task to
                  task like the header does — the criterion brief that used to
                  sit here was identical on all five tasks of a room. Same face
                  and size as the headline, regular weight, so it reads as one
                  block rather than headline-then-small-print. */}
              <h2 className={SECTION_HEADLINE}>Summary</h2>
              <p className={`${SECTION_HEADLINE_REGULAR} mt-1.5 whitespace-pre-line break-words`}>
                {taskBodyText}
              </p>
            </div>
          ) : null}

          {section === "instructions" ? (
            <div>
              {/* No eyebrow: the header already states phase, criterion and
                  task, so repeating "Task N of M" here was pure duplication. */}
              <h3 className={SECTION_HEADLINE}>{taskLabel}</h3>
              {/* Banded instruction body: the shared body plus the session
                  band's variant line (taskBodyForBand joins them with a
                  newline; pre-line keeps the variant on its own line).
                  break-words guards a long token at 390px. */}
              <p className="mt-2.5 whitespace-pre-line break-words text-[14.5px] leading-[1.65] text-[hsl(25_20%_38%)]">
                {taskBodyText}
              </p>
              {allBandsNote ? (
                <p className="mt-2 break-words text-[13px] italic leading-[1.55] text-[hsl(25_20%_38%)]">
                  All bands: {allBandsNote}
                </p>
              ) : null}

              {/* Done-when callout — phase-accent left border */}
              <div
                className="mt-[18px] rounded-r-[10px] border-l-2 bg-[hsl(40_30%_99%)] px-3.5 py-2.5"
                style={{ borderLeftColor: accent }}
              >
                <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[hsl(25_20%_38%)]">
                  Done when
                </p>
                <p className="mt-0.5 break-words text-[13.5px] leading-[1.55] text-[hsl(25_34%_20%)]">
                  {taskDoneWhen}
                </p>
              </div>
            </div>
          ) : null}

          {section === "inputs" ? (
            <div>
              <h3 className={SECTION_HEADLINE}>{INPUTS_HEADING}</h3>
              {taskFields.length === 0 ? (
                <p className={`${SECTION_HEADLINE_REGULAR} mt-1.5`}>{NO_INPUTS_LINE}</p>
              ) : null}
              {/* maxLength caps (2000 single-line / 4000 textarea) keep the
                  aggregate save doc well under the server's 256KiB cap even at
                  MAX_IDEAS=5, so a large paste can't trigger a terminal save
                  failure that kills all future saves. */}
              {taskFields.map((f, fi) => {
                const value = idea?.fields[f.key] ?? "";
                const inputId = `fp-runner-field-${f.key}`;
                // Public-string treatment for the one-liner (see
                // PUBLIC_ONE_LINER_KEY doc). game.flushNow is optional-called
                // defensively: test harnesses that stub the context may omit
                // it, and flag-off never calls it.
                const isPublicString = isPublicSiteEnabled() && f.key === PUBLIC_ONE_LINER_KEY;
                const onCommit = isPublicString ? () => void game.flushNow?.() : undefined;
                return (
                  <div key={f.key} className={fi === 0 ? "mt-4" : "mt-[18px]"}>
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
                      // R23 accepted-limit nudge: this string renders on the
                      // PUBLIC page, and a blocklist cannot catch
                      // self-disclosure.
                      <p className="mt-1.5 text-[12px] text-[hsl(25_20%_38%)]">
                        This goes on your public page. No phone numbers, addresses, or last names.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {section === "tools" ? (
            <div>
              {currentTaskId === IDEA_BRAINSTORM_TASK_ID ? (
                <div onClick={(event) => event.stopPropagation()}>
                  <IdeaBrainstormTool
                    fields={idea?.fields ?? {}}
                    onFieldChange={onFieldChange}
                  />
                </div>
              ) : currentTaskId === PITCH_TASK_ID ? (
                // Mini-tool interaction stays inside the work surface. Letting
                // clicks bubble to the room makes the avatar walk over the
                // timer/text controls and visually cover the thing in use.
                <div onClick={(event) => event.stopPropagation()}>
                  <PitchBuilderTool
                    fields={idea?.fields ?? {}}
                    onFieldChange={onFieldChange}
                  />
                </div>
              ) : currentTaskId === REHEARSAL_TASK_ID ? (
                <div onClick={(event) => event.stopPropagation()}>
                  <RehearsalStudioTool
                    fields={idea?.fields ?? {}}
                    onFieldChange={onFieldChange}
                    onTaskComplete={markCurrentTaskDone}
                  />
                </div>
              ) : currentTaskId === OBJECTION_LOG_TASK_ID ? (
                <div onClick={(event) => event.stopPropagation()}>
                  <ObjectionLogTool
                    band={band}
                    fields={idea?.fields ?? {}}
                    onFieldChange={onFieldChange}
                    onTaskComplete={markCurrentTaskDone}
                  />
                </div>
              ) : currentTaskId === SAY_BACK_TASK_ID ? (
                <div onClick={(event) => event.stopPropagation()}>
                  <SayBackCardTool
                    band={band}
                    fields={idea?.fields ?? {}}
                    onFieldChange={onFieldChange}
                    onTaskComplete={markCurrentTaskDone}
                  />
                </div>
              ) : currentTaskId === PRICE_PICKER_TASK_ID ? (
                <div onClick={(event) => event.stopPropagation()}>
                  <PricePickerTool
                    band={band}
                    fields={idea?.fields ?? {}}
                    onFieldChange={onFieldChange}
                    onTaskComplete={markCurrentTaskDone}
                  />
                </div>
              ) : currentTaskId === TEN_LIST_TASK_ID ? (
                <div onClick={(event) => event.stopPropagation()}>
                  <TenListBuilderTool
                    band={band}
                    fields={idea?.fields ?? {}}
                    onFieldChange={onFieldChange}
                    onTaskComplete={markCurrentTaskDone}
                  />
                </div>
              ) : (
                <>
                  <h3 className={SECTION_HEADLINE}>{TOOLS_HEADING}</h3>
                  <p className={`${SECTION_HEADLINE_REGULAR} mt-1.5`}>{TOOLS_PLACEHOLDER}</p>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Actions row (Change #8), rebalanced 2026-08-04 for beta testing:
          "More tools please" sits at the BOTTOM LEFT in the First Profit logo
          blue (the `build` token) with white text, so the route for telling us
          what is missing is impossible to miss; `mr-auto` pushes it left while
          the green CTA stays right. The CTA keeps the exact
          done/advance/complete semantics it always had. Closing is the top-bar
          ✕ only. The row is pinned OUTSIDE the scrolling section pane, so
          completing a task never needs a scroll hunt. */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t-2 border-[hsl(25_34%_20%/0.1)] px-5 py-4 sm:px-6">
        <button
          type="button"
          onClick={walkThen(() => setMoreToolsOpen(true))}
          className="mr-auto inline-flex min-h-[44px] items-center justify-center rounded-xl bg-build px-4 font-display text-sm font-bold text-white shadow-[0_3px_0_hsl(217_74%_36%)] transition active:translate-y-px active:shadow-[0_1px_0_hsl(217_74%_36%)] focus:outline-none focus-visible:ring-4 focus-visible:ring-build/40"
        >
          More tools please
        </button>
        {alreadyDone && isLast ? (
          // The room is finished. This used to be a greyed-out dead end
          // (owner spec 2026-08-04): it is now the way OUT — same CLOSE_RUNNER
          // the ✕ fires, so the last task hands you back to the floor instead
          // of stranding you on a disabled button.
          <button
            type="button"
            onClick={walkThen(close)}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-verified px-4 font-display text-sm font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)]"
            style={ctaStyle}
          >
            ✓ Done
          </button>
        ) : alreadyDone ? (
          <button
            type="button"
            onClick={walkThen(advance)}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-verified px-4 font-display text-sm font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)]"
            style={ctaStyle}
          >
            Next task →
          </button>
        ) : (
          <button
            type="button"
            onClick={walkThen(doIt)}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-verified px-4 font-display text-sm font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)]"
            style={ctaStyle}
          >
            ✓ I did it
          </button>
        )}
      </div>
      </div>

      {/* The learner is IN the room (owner spec 2026-08-04): the avatar stands
          in exactly the spot a Next Step walk leaves them on the floor —
          bottom center, 120px above the bottom border — so stepping into a
          unit task reads as walking in, not as a screen swap. `bottom` is
          measured from the padding box, i.e. the inner edge of the room's
          border. It sits at the horizontal CENTER of the action row, which is
          empty (More tools is pushed left, the CTA right), so it never covers
          a control, and pointer-events-none keeps it out of the way anyway. */}
      {avatarPos && section !== "tools" ? (
        <div
          data-runner-avatar
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
          style={{
            left: `${avatarPos.x}%`,
            top: `${avatarPos.y}%`,
            // Shorter than ROOM_WALK_MS, so the walk finishes before the
            // click's action runs.
            transition: "left .3s cubic-bezier(.22,1,.36,1), top .3s cubic-bezier(.22,1,.36,1)",
          }}
          aria-hidden
        >
          <AvatarSprite name={game.profile.firstName || game.profile.handle || "Founder"} />
        </div>
      ) : null}
    </div>
  );
}
