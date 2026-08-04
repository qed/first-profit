/**
 * Shared test harness for floor-level components (Unit 8): a minimal stand-in
 * for GameContext that drives the REAL gameCore reducer and binds the same
 * selectors GameContext binds, so components are exercised end to end against
 * real engine semantics (never a stubbed unlock model).
 *
 * Each test file still owns its `vi.mock("../../state/GameContext", ...)` —
 * vitest hoists mocks per file — and passes the mocked context in.
 */
import React from "react";
import {
  reducer,
  initialState,
  isTaskDone as isTaskDoneFn,
  isCriterionDone as isCriterionDoneFn,
  isStepUnlocked as isStepUnlockedFn,
  ideasEnterableFor as ideasEligibleForFn,
  nextUpFor as nextUpForFn,
  isPhaseComplete as isPhaseCompleteFn,
  activeBusiness as activeBusinessFn,
  grossSalesSumCents as grossSalesSumCentsFn,
  salesSumCents as salesSumCentsFn,
  type Action,
  type GameState,
} from "../state/gameCore";
import { criterionIdsForPhase } from "../state/gameCore";
import { stepById, type PhaseId } from "../data/path";

export function apply(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce(reducer, state);
}

/** Base state with N ideas (ids minted, runner closed). */
export function withIdeas(n: number): GameState {
  let s: GameState = { ...initialState(), stage: "app" };
  for (let i = 0; i < n; i++) {
    s = apply(s, { type: "CREATE_IDEA", ideaId: `idea-${i}` }, { type: "CLOSE_RUNNER" });
  }
  return s;
}

/** Give one idea BOTH naming fields, so the floor-layer naming redirect
 *  (floorSelectors.ideaNeedsNaming: unnamed idea → 1.1.1) stays out of the
 *  way of what a test pins. */
export function nameIdea(state: GameState, ideaIndex: number): GameState {
  return apply(
    state,
    { type: "SET_FIELD", ideaIndex, key: "productName", value: `Product ${ideaIndex + 1}` },
    { type: "SET_FIELD", ideaIndex, key: "oneLiner", value: `One-liner ${ideaIndex + 1}` },
  );
}

/** Base state with N ideas, every one fully named. */
export function withNamedIdeas(n: number): GameState {
  let s = withIdeas(n);
  for (let i = 0; i < n; i++) s = nameIdea(s, i);
  return s;
}

/** Mark every task of a criterion done for one idea (real reducer writes). */
export function completeStep(state: GameState, ideaIndex: number, stepId: string): GameState {
  const step = stepById(stepId);
  if (!step) throw new Error(`no step ${stepId}`);
  let s = step.tasks.reduce(
    (acc, _t, index) => reducer(acc, { type: "COMPLETE_TASK", ideaIndex, stepId, index }),
    state,
  );
  if (s.celebrate) s = apply(s, { type: "DISMISS_CELEBRATION" }, { type: "CLOSE_RUNNER" });
  return s;
}

/** Complete every criterion of a phase, in order, for one idea. */
export function completePhase(state: GameState, ideaIndex: number, phase: PhaseId): GameState {
  return criterionIdsForPhase(phase).reduce(
    (s, stepId) => completeStep(s, ideaIndex, stepId),
    state,
  );
}

/** Drive an idea through Sell + Build + Validate (promotion-eligible). */
export function validatedIdea(state: GameState, ideaIndex: number): GameState {
  let s = state;
  for (const phase of ["sell", "build", "validate"] as const) s = completePhase(s, ideaIndex, phase);
  return s;
}

export interface HarnessProps {
  seed: GameState;
  Ctx: React.Context<unknown>;
  children: React.ReactNode;
  onAction?: (a: Action) => void;
  /** Override the bound promoteIdea (e.g. a forced-refusal probe). */
  promoteIdea?: (ideaIndex: number) => boolean;
  /** Override the stubbed submitFeedback (e.g. the Improve-app kind probe). */
  submitFeedback?: (
    taskId: string,
    body: string,
    band?: unknown,
    kind?: unknown,
  ) => Promise<unknown>;
}

/**
 * Mounts children inside the mocked context with GameContext-equivalent bound
 * selectors plus a REAL promoteIdea (mirrors GameContext's caller-boundary
 * refusal mirror + minted ids, deterministic here).
 */
export function FloorHarness({ seed, Ctx, children, onAction, promoteIdea, submitFeedback }: HarnessProps) {
  const [state, rawDispatch] = React.useReducer(reducer, seed);
  const dispatch: typeof rawDispatch = (action) => {
    onAction?.(action);
    rawDispatch(action);
  };
  let minted = 0;
  const boundPromote = (ideaIndex: number): boolean => {
    const ideaId = state.ideas[ideaIndex]?.id;
    if (!ideaId) return false;
    if (!isPhaseCompleteFn(state, ideaIndex, "validate")) return false;
    if (activeBusinessFn(state)) return false;
    dispatch({ type: "PROMOTE_IDEA", ideaId, businessId: `biz-${Date.now()}-${minted++}`, at: Date.now() });
    return true;
  };
  const value = {
    ...state,
    dispatch,
    promoteIdea: promoteIdea ?? boundPromote,
    isTaskDone: (i: number, s: string, x: number) => isTaskDoneFn(state, i, s, x),
    isCriterionDone: (i: number, s: string) => isCriterionDoneFn(state, i, s),
    isStepUnlocked: (i: number, s: string) => isStepUnlockedFn(state, i, s),
    ideasEligibleFor: (s: string) => ideasEligibleForFn(state, s),
    nextUpFor: (i: number) => nextUpForFn(state, i),
    // Extras the full-screen surfaces (GlobalNav, screens/Factory) consume; harmless
    // for the floor components that ignore them.
    grossSalesSumCents: () => grossSalesSumCentsFn(state),
    salesSumCents: () => salesSumCentsFn(state),
    syncStatus: "idle" as const,
    grade: state.profile.grade,
    band: "g6_8" as const,
    gradeAskDone: true,
    skipGradeAsk: () => {},
    submitGradeAnswer: async () => ({ ok: true }),
    submitFeedback: submitFeedback ?? (async () => "sent" as const),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
