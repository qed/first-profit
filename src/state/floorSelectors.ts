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
  isCriterionDone,
  isPhaseComplete,
  isStepUnlocked,
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

/** Display name for an idea summary card: truncated one-liner or "Not named yet". */
export function ideaSummaryName(state: GameState, ideaIndex: number): string {
  const text = ideaOneLiner(state, ideaIndex);
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
  const phase = currentPhaseFor(state, ideaIndex);
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

export type RoomEntry =
  | { action: "noop" }
  | { action: "enter"; ideaIndex: number; index: number }
  | { action: "pick"; eligible: number[] };

/**
 * Room-entry routing for ANY criterion of the sequence (handoff Multi-idea
 * model): gather the ideas eligible for `stepId` (unlocked — which is now
 * phase-aware, so a criterion of a locked phase no-ops for everyone — and not
 * yet done). 0 eligible → no-op; 1 → enter the runner for that idea; many →
 * idea picker. Pure so it is unit-tested directly (the game's core mechanic).
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
  const eligible: number[] = [];
  for (let i = 0; i < state.ideas.length; i++) {
    if (isStepUnlocked(state, i, stepId) && !isCriterionDone(state, i, stepId)) {
      eligible.push(i);
    }
  }
  if (eligible.length === 0) return { action: "noop" };
  if (eligible.length === 1) {
    const ideaIndex = eligible[0];
    return { action: "enter", ideaIndex, index: firstIncompleteTaskIndex(state, ideaIndex, stepId) ?? 0 };
  }
  return { action: "pick", eligible };
}
