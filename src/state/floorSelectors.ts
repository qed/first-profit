/**
 * fpv2 floor-surface selectors — pure, React-free presentation + routing helpers
 * layered on top of gameCore. Kept separate from gameCore so the reducer stays
 * the state authority and these stay display/derivation only.
 *
 * No side effects (no Date.now / Math.random / storage). Everything here is a
 * pure function of GameState so it is trivially testable (see the sibling test).
 */
import {
  PHASE_ORDER,
  activeBusinessExists,
  criterionIdsForPhase,
  ideasEnterableFor,
  isPhaseComplete,
  isTaskDone,
  nextUpFor,
  phaseOfCriterion,
  phaseProgress,
  type GameState,
} from "./gameCore";
import { BUILT_CRITERIA, phaseById, stepById, type PhaseId, type RoomId } from "../data/path";

/** One-liner truncation for idea summary cards (handoff: 42 chars, else placeholder). */
export const IDEA_NAME_MAX = 42;

/** The raw one-liner text for an idea (field key `oneLiner`), trimmed. */
export function ideaOneLiner(state: GameState, ideaIndex: number): string {
  const idea = state.ideas[ideaIndex];
  if (!idea) return "";
  return (idea.fields.oneLiner ?? "").trim();
}

/** The raw product name for an idea (field key `productName`, criterion 1.1), trimmed. */
export function ideaProductName(state: GameState, ideaIndex: number): string {
  const idea = state.ideas[ideaIndex];
  if (!idea) return "";
  return (idea.fields.productName ?? "").trim();
}

/** The criterion whose first task authors the product name + one-liner
 *  (pathHooks FIELD_HOOKS "1.1") — the destination of the naming redirect. */
export const NAMING_STEP_ID = "1.1";

/** The unit-task id the naming redirect points at (1.1's first task). */
const NAMING_TASK_ID = `${NAMING_STEP_ID}.1`;

/**
 * RULE (2026-08-03): an idea missing its product name OR its one-liner
 * (trimmed-empty counts as missing) still needs naming, and its next step is
 * ALWAYS 1.1 task 1 — even when 1.1 (or later criteria) are already complete.
 *
 * This is a FLOOR-LAYER redirect only: gameCore's unlock/progress/completion
 * semantics are untouched. The Step Runner already opens done tasks in review
 * mode (idempotent completion), where 1.1's fields stay editable, so the
 * redirect can never strand a kid. Consulted by nextTaskId, nextCoachTarget,
 * ideaProgressLabel, and roomEntryFor below.
 */
export function ideaNeedsNaming(state: GameState, ideaIndex: number): boolean {
  if (!state.ideas[ideaIndex]) return false;
  return ideaProductName(state, ideaIndex) === "" || ideaOneLiner(state, ideaIndex) === "";
}

/**
 * Display name for an idea summary card: the PRODUCT NAME first and foremost
 * (the `productName` field the learner authors in criterion 1.1), falling back
 * to the one-liner for ideas that haven't named a product yet, else the
 * "Not named yet" placeholder. Truncated for card handoff.
 */
export function ideaSummaryName(state: GameState, ideaIndex: number): string {
  const text = ideaProductName(state, ideaIndex) || ideaOneLiner(state, ideaIndex);
  if (!text) return "Not named yet";
  return text.length > IDEA_NAME_MAX ? `${text.slice(0, IDEA_NAME_MAX)}…` : text;
}

/**
 * Total unit tasks of one phase (Unit 6: phase-scoped, replacing the old
 * playableTaskTotal over PLAYABLE_STEPS). Counts come from the generated
 * content and VARY per criterion — never assume ×5.
 */
export function phaseTaskTotal(phase: PhaseId): number {
  let total = 0;
  for (const stepId of criterionIdsForPhase(phase)) {
    total += stepById(stepId)?.tasks.length ?? 0;
  }
  return total;
}

/** Count of an idea's completed tasks within one phase. */
export function phaseTasksDone(state: GameState, ideaIndex: number, phase: PhaseId): number {
  return phaseProgress(state, ideaIndex, phase).done;
}

/**
 * The phase an idea is currently WORKING (for progress labels): the phase of
 * its next workable criterion; when the frontier is gated (phases 1-3 done,
 * Grow behind the business seam) the phase it just completed; 'scale' once
 * every criterion is done.
 */
export function currentPhaseFor(state: GameState, ideaIndex: number): PhaseId {
  const next = nextUpFor(state, ideaIndex);
  if (next) return phaseOfCriterion(next) ?? "sell";
  // No workable criterion: fully done → scale; gated at the business seam →
  // the last idea-ownable phase (validate). Fresh/absent ideas report sell.
  if (isPhaseComplete(state, ideaIndex, "validate")) {
    return isPhaseComplete(state, ideaIndex, "scale") ? "scale" : "validate";
  }
  return "sell";
}

/** First incomplete task index within a criterion for an idea, or null if all done. */
export function firstIncompleteTaskIndex(
  state: GameState,
  ideaIndex: number,
  stepId: string,
): number | null {
  const step = stepById(stepId);
  if (!step) return null;
  for (let i = 0; i < step.tasks.length; i++) {
    if (!isTaskDone(state, ideaIndex, stepId, i)) return i;
  }
  return null;
}

/**
 * The next unit-task id for an idea, e.g. "1.1.4", walking the FULL sequence
 * (phase-aware via nextUpFor), or null when the idea has no workable task —
 * either everything is done or the frontier phase is gated (business seam).
 * Task ids are 1-based within a criterion, matching the generated stable ids.
 */
export function nextTaskId(state: GameState, ideaIndex: number): string | null {
  // Naming redirect: an unnamed idea's next task is always 1.1.1 (see
  // ideaNeedsNaming) — progress labels and coach copy follow this id.
  if (ideaNeedsNaming(state, ideaIndex)) return NAMING_TASK_ID;
  const stepId = nextUpFor(state, ideaIndex);
  if (!stepId) return null;
  const idx = firstIncompleteTaskIndex(state, ideaIndex, stepId);
  if (idx === null) return null;
  return `${stepId}.${idx + 1}`;
}

/**
 * The Products/Your-Ideas progress line, phase-scoped (Unit 6): task counts
 * cover the idea's CURRENT phase, e.g. "3/25 tasks · next 1.1.4". With no
 * workable task the tail is "· ready for <next phase>" (the frontier phase is
 * gated — Grow before a business exists, i.e. the promotion seam) or
 * "· path complete" once all 25 criteria are done. NOTE: phases 2-3 unlock the
 * moment their predecessor completes, so "ready for Build/Validate" never
 * lingers — the label rolls straight onto the next phase's first task.
 */
export function ideaProgressLabel(state: GameState, ideaIndex: number): string {
  // Naming redirect: an unnamed idea's label counts 1.1's phase (Sell) and its
  // nextTaskId reads 1.1.1, so the line honestly says where the coach sends it.
  const phase = ideaNeedsNaming(state, ideaIndex)
    ? (phaseOfCriterion(NAMING_STEP_ID) ?? "sell")
    : currentPhaseFor(state, ideaIndex);
  const { done } = phaseProgress(state, ideaIndex, phase);
  const total = phaseTaskTotal(phase);
  const next = nextTaskId(state, ideaIndex);
  if (next) return `${done}/${total} tasks · next ${next}`;
  if (isPhaseComplete(state, ideaIndex, "scale")) return `${done}/${total} tasks · path complete`;
  // Gated frontier: name the phase the idea is ready for (Grow today).
  const frontier = phaseAfter(phase);
  const name = frontier ? phaseById(frontier).name : "the next phase";
  return `${done}/${total} tasks · ready for ${name}`;
}

/** The phase that follows `phase` in play order, or null after 'scale'. */
function phaseAfter(phase: PhaseId): PhaseId | null {
  const pos = PHASE_ORDER.indexOf(phase);
  return pos >= 0 && pos < PHASE_ORDER.length - 1 ? PHASE_ORDER[pos + 1] : null;
}

/** Where the bottom-docked Next Step coach should send the player, or null to hide. */
export type CoachTarget =
  | { kind: "create" }
  | { kind: "criterion"; stepId: string; room: RoomId }
  /**
   * The promotion target: the idea finished phases 1-3 and Grow waits on a
   * promoted business that does not exist yet. Carries the eligible idea's
   * STABLE id (Unit 7) so Unit 8's promotion screen can dispatch PROMOTE_IDEA
   * directly; absent only for an unsaved legacy idea that has no id yet.
   * Until Unit 8 ships the screen, the coach simply hides on this target.
   */
  | { kind: "promote"; ideaIndex: number; ideaId?: string };

/**
 * The Next Step coach's destination: with no ideas yet, creating the first idea
 * (the Idea Room); otherwise walk the sequence — the next incomplete criterion
 * of the idea's current phase, for the ACTIVE idea when it still has work, else
 * the first idea that does. An idea whose phases 1-3 are complete while Grow is
 * gated on the business seam yields the `promote` target. Null only when no
 * idea has a workable step or a promotion pending.
 *
 * CONTENT-READINESS GATE: a frontier criterion outside the `built` allowlist
 * (path.ts BUILT_CRITERIA — the shipped-UI list, injectable so tests can walk
 * the full sequence, and so Unit 8 can exercise later phases before flipping
 * the default) yields no coach target for that idea: the coach STOPS at the
 * built frontier rather than pointing at a surface that does not exist yet.
 * The ENGINE's nextUpFor keeps walking regardless — the curriculum and the
 * shipped UI are deliberately separate models.
 */
export function nextCoachTarget(
  state: GameState,
  built: ReadonlySet<string> = BUILT_CRITERIA,
): CoachTarget | null {
  if (state.ideas.length === 0) return { kind: "create" };
  const order = [state.activeIdea, ...state.ideas.map((_, i) => i)];
  const seen = new Set<number>();
  for (const ideaIndex of order) {
    if (seen.has(ideaIndex)) continue;
    seen.add(ideaIndex);
    // Naming redirect: an unnamed idea's coach destination is always 1.1
    // (subject to the same content-readiness gate as every other target).
    if (ideaNeedsNaming(state, ideaIndex) && built.has(NAMING_STEP_ID)) {
      const room = stepById(NAMING_STEP_ID)?.room;
      if (room) return { kind: "criterion", stepId: NAMING_STEP_ID, room };
    }
    const stepId = nextUpFor(state, ideaIndex);
    if (stepId) {
      // Unbuilt frontier: behave exactly as pre-Unit-6 (no target for this
      // idea) — never send the coach past the built content.
      if (!built.has(stepId)) continue;
      const room = stepById(stepId)?.room;
      if (room) return { kind: "criterion", stepId, room };
      continue;
    }
    // No workable criterion: validated but unpromoted → the promotion target.
    if (isPhaseComplete(state, ideaIndex, "validate") && !activeBusinessExists(state)) {
      const ideaId = state.ideas[ideaIndex]?.id;
      return { kind: "promote", ideaIndex, ...(ideaId ? { ideaId } : {}) };
    }
  }
  return null;
}

export type RoomEntry = { action: "noop" } | { action: "enter"; ideaIndex: number; index: number };

/**
 * Room-entry routing for ANY criterion of the sequence (handoff Multi-idea
 * model): gather the ideas eligible for `stepId` (unlocked — which is now
 * phase-aware, so a criterion of a locked phase no-ops for everyone — and not
 * yet done). 0 eligible → no-op; otherwise ENTER, never ask.
 *
 * WHICH IDEA (2026-08-04 owner spec): the one the GlobalNav chip says you are
 * on. Entering a room used to raise a "pick the product" modal whenever more
 * than one idea was eligible; now the nav dropdown is the single place an idea
 * is chosen, and every room follows it. When the active idea is NOT eligible
 * for this criterion (it is done, or locked here) the first eligible idea wins
 * — the same priority order the picker used to list — so a tap still lands
 * somewhere sensible instead of dead-ending.
 *
 * CONTENT-READINESS GATE: a criterion outside the `built` allowlist (path.ts
 * BUILT_CRITERIA; injectable — see nextCoachTarget) is a no-op entry for
 * everyone, so no floor tap can open a surface the UI has not shipped. The
 * engine-level eligibility below stays allowlist-free.
 */
export function roomEntryFor(
  state: GameState,
  stepId: string,
  built: ReadonlySet<string> = BUILT_CRITERIA,
): RoomEntry {
  if (!built.has(stepId)) return { action: "noop" };
  // Naming redirect (see ideaNeedsNaming): entering 1.1 while any idea is
  // still unnamed routes to that idea at task 1 — the task that authors
  // productName/oneLiner — so a coach-driven walk for an unnamed idea always
  // lands on 1.1 index 0, even when the idea already completed 1.1 (the
  // runner's review entry keeps the fields editable). Several unnamed ideas
  // fall through to the picker, exactly like the normal many-eligible case.
  if (stepId === NAMING_STEP_ID) {
    const needing = state.ideas.map((_, i) => i).filter((i) => ideaNeedsNaming(state, i));
    if (needing.length > 0) return { action: "enter", ideaIndex: preferActive(state, needing), index: 0 };
  }
  // In-progress ideas keep exact pre-existing priority; when none, DONE ideas
  // re-enter in review mode (task 1, idempotent completion) so authored fields
  // like 1.1's productName/oneLiner are never orphaned behind a finished room.
  const eligible = ideasEnterableFor(state, stepId);
  if (eligible.length === 0) return { action: "noop" };
  const ideaIndex = preferActive(state, eligible);
  return { action: "enter", ideaIndex, index: firstIncompleteTaskIndex(state, ideaIndex, stepId) ?? 0 };
}

/** The active idea when it is in `eligible`, else the highest-priority one.
 *  `eligible` is never empty at either call site. */
function preferActive(state: GameState, eligible: number[]): number {
  return eligible.includes(state.activeIdea) ? state.activeIdea : eligible[0];
}
