/**
 * fpv2 game core — a pure, React-free reducer + selectors module.
 *
 * No side effects: it never calls Date.now(), Math.random(), or touches
 * localStorage / the network. Ids and timestamps for ledger rows are stamped
 * by the caller and passed in, so the sync layer and tests stay deterministic.
 *
 * This is intentionally NOT yet wired into GameContext.tsx / App.tsx — that
 * rewiring is Unit 5's job. The existing app keeps compiling; this module only
 * adds new code.
 */
import { parseTask, stepById, type RoomId } from "../data/path";

/** Schema version stored inside every serialized save doc. Bump on shape change. */
export const DOC_VERSION = 1;

/** The criteria that are actually playable in Slice A. */
export const PLAYABLE_STEPS = ["1.1", "1.2"] as const;

/** Maximum parallel product ideas per the handoff multi-idea model. */
export const MAX_IDEAS = 5;

/** taskKey shape mirrors the existing GameContext convention: `${stepId}#${index}`. */
export const taskKey = (stepId: string, index: number): string => `${stepId}#${index}`;

export type Stage = "boot" | "landing" | "login" | "onboard" | "app";

export type LedgerKind = "sale" | "backing";

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  payer: string;
  amountCents: number;
  createdAt: string;
}

export interface Idea {
  /** Task text answers, keyed by field key (e.g. `oneLiner`). */
  fields: Record<string, string>;
  /** Task completion, keyed by `${stepId}#${index}`. */
  done: Record<string, boolean>;
}

export interface Profile {
  firstName: string;
  handle: string;
  siteHeadline: string;
}

export interface GameState {
  stage: Stage;
  /** Onboarding screen index (2..5 per handoff; screen 1 is pre-completed). */
  ob: number;
  profile: Profile;
  ideas: Idea[];
  activeIdea: number;
  /** In-memory ledger for the session. NOT part of the save doc (lives in fp_ledger). */
  ledger: LedgerEntry[];
  /** Criterion id awaiting an idea-picker choice, or null. */
  pickFor: string | null;
  runnerOpen: boolean;
  /** Criterion id the Step Runner is showing, or null. */
  runnerStep: string | null;
  /** Task index the Step Runner is positioned on. */
  runnerIndex: number;
  /** Criterion id that was just passed (drives the celebration dialog), or null. */
  celebrate: string | null;
  /** Open room dialog, or null. */
  room: RoomId | null;
  /** Mock-checkout overlay visibility. */
  checkoutOpen: boolean;
  avatar: { x: number; y: number };
  /** True once onboarding screens 2..5 are complete (persisted in the save doc). */
  onboardingComplete: boolean;
  docVersion: number;
}

export function initialState(): GameState {
  return {
    stage: "boot",
    ob: 2,
    profile: { firstName: "", handle: "", siteHeadline: "" },
    ideas: [],
    activeIdea: 0,
    ledger: [],
    pickFor: null,
    runnerOpen: false,
    runnerStep: null,
    runnerIndex: 0,
    celebrate: null,
    room: null,
    checkoutOpen: false,
    avatar: { x: 50, y: 94 },
    onboardingComplete: false,
    docVersion: DOC_VERSION,
  };
}

// ── Serialization ────────────────────────────────────────────────────────

export interface SaveDoc {
  docVersion: number;
  ideas: Idea[];
  activeIdea: number;
  siteHeadline: string;
  onboardingComplete: boolean;
}

/**
 * Serialize the persistent slice of state. The ledger is deliberately excluded
 * (it lives append-only in fp_ledger, not the JSONB save doc).
 */
export function toSaveDoc(state: GameState): SaveDoc {
  return {
    docVersion: DOC_VERSION,
    ideas: state.ideas.map((idea) => ({
      fields: { ...idea.fields },
      done: { ...idea.done },
    })),
    activeIdea: state.activeIdea,
    siteHeadline: state.profile.siteHeadline,
    onboardingComplete: state.onboardingComplete,
  };
}

export type FromSaveResult =
  | { ok: true; doc: SaveDoc }
  | { ok: false; reason: "unknown-version" | "malformed" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Shallow shape-coercion only: leaf values are trusted for v1 (the docVersion
// guard in fromSaveDoc is the real cross-version compatibility gate).
function coerceIdea(value: unknown): Idea {
  if (!isRecord(value)) return { fields: {}, done: {} };
  const fields = isRecord(value.fields) ? (value.fields as Record<string, string>) : {};
  const done = isRecord(value.done) ? (value.done as Record<string, boolean>) : {};
  return { fields: { ...fields }, done: { ...done } };
}

/**
 * Parse a loaded save doc into a validated `SaveDoc`, or signal that the caller
 * should DISCARD it. An unknown/absent docVersion is signaled for discard so a
 * newer reducer is never fed a stale (or future) shape.
 */
export function fromSaveDoc(raw: unknown): FromSaveResult {
  if (!isRecord(raw)) return { ok: false, reason: "malformed" };
  if (raw.docVersion !== DOC_VERSION) return { ok: false, reason: "unknown-version" };
  const ideas = Array.isArray(raw.ideas) ? raw.ideas.map(coerceIdea) : [];
  const activeIdea = typeof raw.activeIdea === "number" ? raw.activeIdea : 0;
  const siteHeadline = typeof raw.siteHeadline === "string" ? raw.siteHeadline : "";
  const onboardingComplete = raw.onboardingComplete === true;
  return {
    ok: true,
    doc: { docVersion: DOC_VERSION, ideas, activeIdea, siteHeadline, onboardingComplete },
  };
}

// ── Selectors (pure functions of state) ──────────────────────────────────

function hasIdea(state: GameState, ideaIndex: number): boolean {
  return ideaIndex >= 0 && ideaIndex < state.ideas.length;
}

/**
 * Whether a single task is complete for an idea. Honors the existing
 * `@artifact`-prefix auto-complete convention via `parseTask` — Slice A's
 * 1.1/1.2 tasks are all plain (no `@artifact`), so this reduces to the `done`
 * map, but the hook is preserved for later phases.
 */
export function isTaskDone(
  state: GameState,
  ideaIndex: number,
  stepId: string,
  index: number,
): boolean {
  if (!hasIdea(state, ideaIndex)) return false;
  const step = stepById(stepId);
  const raw = step?.tasks[index];
  if (raw) {
    const { auto } = parseTask(raw);
    // fpv2 core carries no artifact map yet; an @artifact task is only ever
    // complete via the explicit done map until artifact state exists.
    if (auto) {
      return Boolean(state.ideas[ideaIndex].done[taskKey(stepId, index)]);
    }
  }
  return Boolean(state.ideas[ideaIndex].done[taskKey(stepId, index)]);
}

/** Whether every task of a criterion is complete for an idea. */
export function isCriterionDone(state: GameState, ideaIndex: number, stepId: string): boolean {
  const step = stepById(stepId);
  if (!step || !hasIdea(state, ideaIndex)) return false;
  return step.tasks.every((_, i) => isTaskDone(state, ideaIndex, stepId, i));
}

/** Per-task completion flags (pips) for a criterion. */
export function stepPips(state: GameState, ideaIndex: number, stepId: string): boolean[] {
  const step = stepById(stepId);
  if (!step) return [];
  return step.tasks.map((_, i) => isTaskDone(state, ideaIndex, stepId, i));
}

/** The first incomplete playable criterion for an idea, or null if all done. */
export function nextUpFor(state: GameState, ideaIndex: number): string | null {
  if (!hasIdea(state, ideaIndex)) return null;
  for (const stepId of PLAYABLE_STEPS) {
    if (!isCriterionDone(state, ideaIndex, stepId)) return stepId;
  }
  return null;
}

/** Per-idea Sell progress across the playable criteria (task counts from path.ts). */
export function sellProgress(state: GameState, ideaIndex: number): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const stepId of PLAYABLE_STEPS) {
    const step = stepById(stepId);
    if (!step) continue;
    total += step.tasks.length;
    done += step.tasks.filter((_, i) => isTaskDone(state, ideaIndex, stepId, i)).length;
  }
  return { done, total };
}

/**
 * Sequential room unlock: whether the criterion's room is reachable for an idea
 * (the previous criterion is complete). The first playable criterion is always
 * unlocked. Distinct from eligibility, which also requires this one NOT done.
 */
export function isStepUnlocked(state: GameState, ideaIndex: number, stepId: string): boolean {
  const pos = (PLAYABLE_STEPS as readonly string[]).indexOf(stepId);
  if (pos < 0 || !hasIdea(state, ideaIndex)) return false;
  if (pos === 0) return true;
  return isCriterionDone(state, ideaIndex, PLAYABLE_STEPS[pos - 1]);
}

/**
 * Room eligibility for a criterion, for the idea picker: the previous criterion
 * is complete AND this one is not.
 */
export function isIdeaEligibleFor(state: GameState, ideaIndex: number, stepId: string): boolean {
  return isStepUnlocked(state, ideaIndex, stepId) && !isCriterionDone(state, ideaIndex, stepId);
}

/** All idea indexes eligible for a criterion (drives auto-select / picker / no-op). */
export function ideasEligibleFor(state: GameState, stepId: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < state.ideas.length; i++) {
    if (isIdeaEligibleFor(state, i, stepId)) result.push(i);
  }
  return result;
}

/** Total of all `backing` ledger rows, in cents. */
export function backingSumCents(state: GameState): number {
  return state.ledger
    .filter((row) => row.kind === "backing")
    .reduce((sum, row) => sum + row.amountCents, 0);
}

/** Total of all `sale` ledger rows, in cents. */
export function salesSumCents(state: GameState): number {
  return state.ledger
    .filter((row) => row.kind === "sale")
    .reduce((sum, row) => sum + row.amountCents, 0);
}

// ── Reducer ──────────────────────────────────────────────────────────────

export type Action =
  | { type: "SET_STAGE"; stage: Stage }
  | { type: "SET_OB"; ob: number }
  | { type: "SET_PROFILE"; patch: Partial<Profile> }
  | { type: "CREATE_IDEA" }
  | { type: "SET_ACTIVE_IDEA"; ideaIndex: number }
  | { type: "SET_FIELD"; ideaIndex: number; key: string; value: string }
  | { type: "COMPLETE_TASK"; ideaIndex: number; stepId: string; index: number }
  | { type: "OPEN_RUNNER"; stepId?: string; index?: number }
  | { type: "CLOSE_RUNNER" }
  | { type: "OPEN_ROOM"; room: RoomId }
  | { type: "CLOSE_ROOM" }
  | { type: "SET_PICK_FOR"; pickFor: string | null }
  | ({ type: "ADD_LEDGER" } & LedgerEntry)
  | { type: "DISMISS_CELEBRATION" }
  | { type: "OPEN_CHECKOUT" }
  | { type: "CLOSE_CHECKOUT" }
  | { type: "SET_AVATAR"; x: number; y: number }
  | { type: "RESET_SESSION" }
  | { type: "HYDRATE"; doc: SaveDoc };

/**
 * Mark one task done for an idea (immutably). If that completes the criterion,
 * fire the celebration and advance the runner to the next playable criterion.
 * Idempotent and out-of-range tolerant: returns the same state if the index is
 * invalid or the task was already done.
 */
function markTaskDone(
  state: GameState,
  ideaIndex: number,
  stepId: string,
  index: number,
): GameState {
  if (!hasIdea(state, ideaIndex)) return state;
  const step = stepById(stepId);
  if (!step || index < 0 || index >= step.tasks.length) return state;
  if (isTaskDone(state, ideaIndex, stepId, index)) return state;

  const wasCriterionDone = isCriterionDone(state, ideaIndex, stepId);
  const ideas = state.ideas.map((idea, i) =>
    i === ideaIndex
      ? { ...idea, done: { ...idea.done, [taskKey(stepId, index)]: true } }
      : idea,
  );
  let next: GameState = { ...state, ideas };

  const nowCriterionDone = isCriterionDone(next, ideaIndex, stepId);
  if (!wasCriterionDone && nowCriterionDone) {
    const advanced = nextUpFor(next, ideaIndex);
    next = {
      ...next,
      celebrate: stepId,
      runnerStep: advanced ?? next.runnerStep,
      runnerIndex: 0,
    };
  }
  return next;
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "SET_STAGE":
      return { ...state, stage: action.stage };

    case "SET_OB":
      return { ...state, ob: action.ob };

    case "SET_PROFILE":
      return { ...state, profile: { ...state.profile, ...action.patch } };

    case "CREATE_IDEA": {
      if (state.ideas.length >= MAX_IDEAS) return state;
      const ideas = [...state.ideas, { fields: {}, done: {} }];
      return {
        ...state,
        ideas,
        activeIdea: ideas.length - 1,
        runnerOpen: true,
        runnerStep: PLAYABLE_STEPS[0],
        runnerIndex: 0,
        pickFor: null,
      };
    }

    case "SET_ACTIVE_IDEA": {
      if (!hasIdea(state, action.ideaIndex)) return state;
      return { ...state, activeIdea: action.ideaIndex };
    }

    case "SET_FIELD": {
      if (!hasIdea(state, action.ideaIndex)) return state;
      const ideas = state.ideas.map((idea, i) =>
        i === action.ideaIndex
          ? { ...idea, fields: { ...idea.fields, [action.key]: action.value } }
          : idea,
      );
      return { ...state, ideas };
    }

    case "COMPLETE_TASK":
      return markTaskDone(state, action.ideaIndex, action.stepId, action.index);

    case "OPEN_RUNNER": {
      const stepId = action.stepId ?? nextUpFor(state, state.activeIdea) ?? PLAYABLE_STEPS[0];
      return {
        ...state,
        runnerOpen: true,
        runnerStep: stepId,
        runnerIndex: action.index ?? 0,
      };
    }

    case "CLOSE_RUNNER":
      return { ...state, runnerOpen: false };

    case "OPEN_ROOM":
      return { ...state, room: action.room };

    case "CLOSE_ROOM":
      return { ...state, room: null };

    case "SET_PICK_FOR":
      return { ...state, pickFor: action.pickFor };

    case "ADD_LEDGER": {
      // Idempotent on id (retried outbox inserts must not double-append).
      if (state.ledger.some((row) => row.id === action.id)) return state;
      const entry: LedgerEntry = {
        id: action.id,
        kind: action.kind,
        payer: action.payer,
        amountCents: action.amountCents,
        createdAt: action.createdAt,
      };
      let next: GameState = { ...state, ledger: [...state.ledger, entry] };
      if (action.kind === "sale") {
        // A logged sale auto-completes the LAST task of 1.2 for the active idea,
        // but only when 1.2 is unlocked for it (1.1 complete). A stray sale event
        // before then must not light 1.2's final pip while earlier pips are dark.
        const saleStep = stepById("1.2");
        if (
          saleStep &&
          hasIdea(next, next.activeIdea) &&
          isStepUnlocked(next, next.activeIdea, "1.2")
        ) {
          next = markTaskDone(next, next.activeIdea, "1.2", saleStep.tasks.length - 1);
        }
      }
      return next;
    }

    case "DISMISS_CELEBRATION":
      return { ...state, celebrate: null };

    case "OPEN_CHECKOUT":
      return { ...state, checkoutOpen: true };

    case "CLOSE_CHECKOUT":
      return { ...state, checkoutOpen: false };

    case "SET_AVATAR":
      return { ...state, avatar: { x: action.x, y: action.y } };

    case "RESET_SESSION": {
      // Clear all per-account business/financial + UI state so no previous
      // child's ideas/ledger can leak into the next session on a shared device.
      // `stage` and `profile` are deliberately left for the caller to set.
      const fresh = initialState();
      return {
        ...fresh,
        stage: state.stage,
        profile: state.profile,
      };
    }

    case "HYDRATE": {
      const { doc } = action;
      return {
        ...state,
        ideas: doc.ideas.map((idea) => ({
          fields: { ...idea.fields },
          done: { ...idea.done },
        })),
        // The ledger lives append-only in fp_ledger, never the save doc. Reset
        // it here so a hydrate can never carry a prior session's rows forward.
        ledger: [],
        activeIdea: doc.activeIdea,
        profile: { ...state.profile, siteHeadline: doc.siteHeadline },
        onboardingComplete: doc.onboardingComplete,
        docVersion: DOC_VERSION,
        stage: doc.onboardingComplete ? "app" : "onboard",
      };
    }

    default: {
      // Exhaustiveness guard.
      const _never: never = action;
      return _never;
    }
  }
}
