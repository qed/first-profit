/**
 * fpv2 floor-surface selectors — pure, React-free presentation + routing helpers
 * layered on top of gameCore. Kept separate from gameCore so the reducer stays
 * the state authority and these stay display/derivation only.
 *
 * No side effects (no Date.now / Math.random / storage). Everything here is a
 * pure function of GameState so it is trivially testable (see the sibling test).
 */
import { PLAYABLE_STEPS, isCriterionDone, isStepUnlocked, isTaskDone, nextUpFor, type GameState } from "./gameCore";
import { stepById } from "../data/path";

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

/** Total playable unit tasks across the Sell criteria we ship (1.1 + 1.2). */
export function playableTaskTotal(): number {
  let total = 0;
  for (const stepId of PLAYABLE_STEPS) {
    total += stepById(stepId)?.tasks.length ?? 0;
  }
  return total;
}

/** Count of completed playable tasks for an idea (across 1.1 + 1.2). */
export function playableTasksDone(state: GameState, ideaIndex: number): number {
  let done = 0;
  for (const stepId of PLAYABLE_STEPS) {
    const step = stepById(stepId);
    if (!step) continue;
    done += step.tasks.filter((_, i) => isTaskDone(state, ideaIndex, stepId, i)).length;
  }
  return done;
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
 * The next unit-task id for an idea, e.g. "1.1.4", or null if it has finished the
 * playable Sell criteria ("ready for Build"). Task ids are 1-based within a step.
 */
export function nextTaskId(state: GameState, ideaIndex: number): string | null {
  const stepId = nextUpFor(state, ideaIndex);
  if (!stepId) return null;
  const idx = firstIncompleteTaskIndex(state, ideaIndex, stepId);
  if (idx === null) return null;
  return `${stepId}.${idx + 1}`;
}

/** The Products/Your-Ideas progress line, e.g. "3/9 tasks · next 1.1.4" / "· ready for Build". */
export function ideaProgressLabel(state: GameState, ideaIndex: number): string {
  const done = playableTasksDone(state, ideaIndex);
  const total = playableTaskTotal();
  const next = nextTaskId(state, ideaIndex);
  return `${done}/${total} tasks ${next ? `· next ${next}` : "· ready for Build"}`;
}

export type RoomEntry =
  | { action: "noop" }
  | { action: "enter"; ideaIndex: number; index: number }
  | { action: "pick"; eligible: number[] };

/**
 * Room-entry routing for a Sell criterion (handoff Multi-idea model): gather the
 * ideas eligible for `stepId` (previous criterion done, this one not).
 *   0 eligible → no-op; 1 → enter the runner for that idea; many → idea picker.
 * Pure so it is unit-tested directly (the game's core mechanic).
 */
export function roomEntryFor(state: GameState, stepId: string): RoomEntry {
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
