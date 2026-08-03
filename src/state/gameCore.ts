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
import { stepById, type RoomId } from "../data/path";
import { PROVIDER_IDS, computeFee, providerById, type ProviderId } from "../data/providers";
import {
  LEGACY_KEY_REMAP,
  TASK_REMAP,
  resolveTaskId,
  taskIdAt,
  type RemapTarget,
} from "../data/taskRemap";

/** Schema version stored inside every serialized save doc. Bump on shape change. */
export const DOC_VERSION = 1;

/** The criteria that are actually playable in Slice A. */
export const PLAYABLE_STEPS = ["1.1", "1.2"] as const;

/** Maximum parallel product ideas per the handoff multi-idea model. */
export const MAX_IDEAS = 5;

/** taskKey shape mirrors the existing GameContext convention: `${stepId}#${index}`. */
export const taskKey = (stepId: string, index: number): string => `${stepId}#${index}`;

/**
 * Top-level stage machine. `signup` is the parent-facing Start Building flow
 * (Slice B): a user who is creating an account but is NOT yet authenticated.
 * Like `landing`/`login`, `signup` is a LOGGED-OUT stage — it has no engine, no
 * save, and no session — so it is deliberately excluded from `isLoggedInStage`
 * in GameContext (the engine/save/tick effects must not fire during signup).
 * SET_STAGE is generic, so boot/landing can route INTO signup and signup can
 * route on to login or onboard/app as the flow later needs.
 */
export type Stage = "boot" | "landing" | "login" | "signup" | "onboard" | "app";

/** Ledger rows are all `sale` now — the `backing` mock kind is retired (PP2). */
export type LedgerKind = "sale";

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  payer: string;
  /** Kept = gross for back-compat. */
  amountCents: number;
  /**
   * Per-sale fee snapshot (Payment Phase 2). Optional on the TYPE so a legacy /
   * server-mapped row (sync.ts loadLedger already defaults these) and older
   * callers stay assignable, but ADD_LEDGER always POPULATES all four with
   * per-row defaults (gross = net = amountCents, fee = 0, providerId = null)
   * when no snapshot is supplied, so the net/gross sums are always consistent.
   * Fee COMPUTATION (computeFee) is wired in Unit 5; Unit 3 only carries the
   * fields through.
   */
  grossCents?: number;
  feeCents?: number;
  netCents?: number;
  providerId?: string | null;
  createdAt: string;
}

/** The provider the student has chosen to collect their money (PP2). */
export interface ChosenProvider {
  providerId: ProviderId;
  /** Caller-stamped epoch ms of the choice (module stays Date.now()-free). */
  chosenAt: number;
}

export interface Idea {
  /** Task text answers, keyed by field key (e.g. `oneLiner`). */
  fields: Record<string, string>;
  /** Task completion, keyed by `${stepId}#${index}`. */
  done: Record<string, boolean>;
  /**
   * Completion timestamps (caller-stamped epoch ms), keyed by the SAME legacy
   * `${stepId}#${index}` scheme as `done` (Unit 5 remaps both together).
   * ADDITIVE OPTIONAL (the chosenProvider precedent): existing docs/ideas have
   * no such field, so it is absent until a timestamped completion happens —
   * no DOC_VERSION bump. Makes silent stalls queryable for the cohort (R13).
   */
  doneAt?: Record<string, number>;
  /**
   * Task completion keyed by STABLE task id ("1.1.3") — the forward shape
   * (Unit 5). ADDITIVE OPTIONAL (no DOC_VERSION bump): fromSaveDoc UNIONS the
   * legacy `done` keys into this map through taskRemap's explicit table on
   * every load (merge-on-load: completions are monotonic, so the union only
   * ever adds — this is what makes a stale old tab, which strips these fields
   * on save, unable to lose any legacy-representable completion). The legacy
   * maps are retained untouched beside it during the transition.
   */
  doneByTask?: Record<string, boolean>;
  /** Completion timestamps keyed by stable task id, migrated/dual-written
   *  alongside `doneByTask` exactly as `doneAt` is beside `done`. */
  doneAtByTask?: Record<string, number>;
}

export interface Profile {
  firstName: string;
  handle: string;
  siteHeadline: string;
  /**
   * The child's grade (Unit 3; R9), or null while unknown. ROSTER-DERIVED and
   * adopted at login from the /api/fp/login response (or from the ask-once
   * answer), so it is deliberately NOT part of the save doc: persisting a
   * grade snapshot would let it go stale across school years, while the
   * roster's read-time derivation never does — every session re-adopts the
   * current truth. Per-account child data, so RESET_SESSION nulls it.
   */
  grade: number | null;
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
  /** The chosen payment provider (durable, in the save doc), or null. */
  chosenProvider: ChosenProvider | null;
  /** True once onboarding screens 2..5 are complete (persisted in the save doc). */
  onboardingComplete: boolean;
  docVersion: number;
}

export function initialState(): GameState {
  return {
    stage: "boot",
    ob: 2,
    profile: { firstName: "", handle: "", siteHeadline: "", grade: null },
    ideas: [],
    activeIdea: 0,
    ledger: [],
    pickFor: null,
    runnerOpen: false,
    runnerStep: null,
    runnerIndex: 0,
    celebrate: null,
    room: null,
    chosenProvider: null,
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
  /**
   * The chosen payment provider (PP2). ADDITIVE OPTIONAL: existing v1 docs have
   * no such field (hence optional here), so fromSaveDoc DEFAULTS it to null and
   * DOC_VERSION stays 1 (a bump would discard in-flight outbox entries).
   */
  chosenProvider?: ChosenProvider | null;
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
      // Emit doneAt only when it exists so an untimestamped doc stays byte-stable.
      ...(idea.doneAt ? { doneAt: { ...idea.doneAt } } : {}),
      // Emit BOTH shapes during the transition (dual-write): the new stable-id
      // maps ride beside the legacy index maps, absent-stays-absent. Retirement
      // condition for the dual-write: see markTaskDone's doc comment.
      ...(idea.doneByTask ? { doneByTask: { ...idea.doneByTask } } : {}),
      ...(idea.doneAtByTask ? { doneAtByTask: { ...idea.doneAtByTask } } : {}),
    })),
    activeIdea: state.activeIdea,
    siteHeadline: state.profile.siteHeadline,
    onboardingComplete: state.onboardingComplete,
    chosenProvider: state.chosenProvider,
  };
}

export type FromSaveResult =
  | { ok: true; doc: SaveDoc }
  | { ok: false; reason: "unknown-version" | "malformed" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Shape-coercion with leaf-type filtering: a malformed persisted doc (or a
// hand-edited one) must never let a non-string field or non-boolean done flag
// reach .trim()/a controlled input. Keep only string field values and boolean
// done values; silently drop the rest.
function coerceIdea(value: unknown): Idea {
  if (!isRecord(value)) return { fields: {}, done: {} };
  const fields: Record<string, string> = {};
  if (isRecord(value.fields)) {
    for (const [key, leaf] of Object.entries(value.fields)) {
      if (typeof leaf === "string") fields[key] = leaf;
    }
  }
  const done: Record<string, boolean> = {};
  if (isRecord(value.done)) {
    for (const [key, leaf] of Object.entries(value.done)) {
      if (typeof leaf === "boolean") done[key] = leaf;
    }
  }
  const idea: Idea = { fields, done };
  // Additive-optional doneAt: absent on old docs -> stays absent (never invented).
  // Only finite, non-negative numeric leaves survive (NaN would JSON.stringify to
  // null and poison the next load, mirroring the chosenAt discipline).
  if (isRecord(value.doneAt)) {
    const doneAt: Record<string, number> = {};
    for (const [key, leaf] of Object.entries(value.doneAt)) {
      if (typeof leaf === "number" && Number.isFinite(leaf) && leaf >= 0) doneAt[key] = leaf;
    }
    idea.doneAt = doneAt;
  }
  // The stable-id maps (Unit 5), same leaf discipline: malformed leaves are
  // dropped by coercion — a bad key/value never fails the load.
  if (isRecord(value.doneByTask)) {
    const doneByTask: Record<string, boolean> = {};
    for (const [key, leaf] of Object.entries(value.doneByTask)) {
      if (typeof leaf === "boolean") doneByTask[key] = leaf;
    }
    idea.doneByTask = doneByTask;
  }
  if (isRecord(value.doneAtByTask)) {
    const doneAtByTask: Record<string, number> = {};
    for (const [key, leaf] of Object.entries(value.doneAtByTask)) {
      if (typeof leaf === "number" && Number.isFinite(leaf) && leaf >= 0) doneAtByTask[key] = leaf;
    }
    idea.doneAtByTask = doneAtByTask;
  }
  return idea;
}

/**
 * MERGE-on-load migration (Unit 5): union an idea's legacy `${stepId}#${index}`
 * completions into the stable-id maps, and carry stable-id keys through the
 * (future-edit) remap table. Pure doc transform — it only MARKS state; it never
 * dispatches actions, so loading can never fire a celebration or the sale
 * auto-complete (the remap table is behavior; see taskRemap.ts).
 *
 * Properties the tests pin:
 * - UNION: completions are monotonic, so migration only ever ADDS to the new
 *   maps (an old tab that stripped them on save is fully recovered next load);
 *   on a timestamp conflict the already-present new-shape value wins.
 * - Idempotent / re-runnable: a second pass over its own output is byte-stable.
 * - Legacy fields are retained untouched (old tabs keep working).
 * - Unmappable legacy keys (anything outside the explicit ten-entry table) are
 *   preserved raw in the legacy map — never invented into the new shape, never
 *   dropped.
 * - A remap entry old→new moves a stable-id completion exactly once; a retired
 *   entry (null) leaves it preserved in place.
 */
function migrateIdeaProgress(
  idea: Idea,
  remap: Readonly<Record<string, RemapTarget>>,
): Idea {
  const doneByTask: Record<string, boolean> = { ...(idea.doneByTask ?? {}) };
  const doneAtByTask: Record<string, number> = { ...(idea.doneAtByTask ?? {}) };

  // 1) Move existing stable-id keys through the remap table (exactly once:
  //    after the move the old key is gone, so a re-run is a no-op).
  for (const key of Object.keys(doneByTask)) {
    const target = resolveTaskId(key, remap);
    if (target === key) continue;
    const value = doneByTask[key];
    delete doneByTask[key];
    if (value) doneByTask[target] = true; // union: never un-complete the target
    else if (!(target in doneByTask)) doneByTask[target] = value;
  }
  for (const key of Object.keys(doneAtByTask)) {
    const target = resolveTaskId(key, remap);
    if (target === key) continue;
    const at = doneAtByTask[key];
    delete doneAtByTask[key];
    if (!(target in doneAtByTask)) doneAtByTask[target] = at;
  }

  // 2) Union legacy index keys through the explicit legacy table (and onward
  //    through the remap chain, so a later-remapped target is landed directly).
  for (const [key, value] of Object.entries(idea.done)) {
    if (value !== true) continue;
    const mapped = LEGACY_KEY_REMAP[key];
    if (!mapped) continue; // unmappable: preserved raw in the legacy map
    const target = resolveTaskId(mapped, remap);
    if (!doneByTask[target]) doneByTask[target] = true;
  }
  for (const [key, at] of Object.entries(idea.doneAt ?? {})) {
    // Mirror the done loop's completion guard: an ORPHANED legacy timestamp
    // (doneAt entry without done:true — e.g. a hand-edited or partially
    // corrupted doc) must never mint a doneAtByTask entry for a task that was
    // never completed.
    if (idea.done?.[key] !== true) continue;
    const mapped = LEGACY_KEY_REMAP[key];
    if (!mapped) continue;
    const target = resolveTaskId(mapped, remap);
    if (!(target in doneAtByTask)) doneAtByTask[target] = at; // new shape wins
  }

  return {
    ...idea, // legacy fields retained untouched
    // Absent-stays-absent: a doc that never had (or never needed) the new maps
    // keeps its exact shape, so fresh docs load clean and byte-stable.
    ...(idea.doneByTask || Object.keys(doneByTask).length ? { doneByTask } : {}),
    ...(idea.doneAtByTask || Object.keys(doneAtByTask).length ? { doneAtByTask } : {}),
  };
}

// Coerce a persisted chosenProvider leaf. ADDITIVE OPTIONAL: an existing v1 doc
// has no such field (or a malformed one), which DEFAULTS to null — never a
// discard. Only a well-formed {providerId, chosenAt} with a known id survives.
// Validated against the canonical PROVIDER_IDS from ../data/providers, so a new
// provider is never silently rejected on load. chosenAt must be a FINITE, non-
// negative number: NaN/Infinity/negative are rejected (NaN would otherwise
// JSON.stringify to null and drop the whole provider on the next load), so a
// malformed timestamp defaults the whole leaf to null rather than half-breaking.
function coerceChosenProvider(value: unknown): ChosenProvider | null {
  if (!isRecord(value)) return null;
  const { providerId, chosenAt } = value;
  if (
    typeof providerId === "string" &&
    (PROVIDER_IDS as readonly string[]).includes(providerId) &&
    typeof chosenAt === "number" &&
    Number.isFinite(chosenAt) &&
    chosenAt >= 0
  ) {
    return { providerId: providerId as ProviderId, chosenAt };
  }
  return null;
}

/**
 * Parse a loaded save doc into a validated `SaveDoc`, or signal that the caller
 * should DISCARD it. An unknown/absent docVersion is signaled for discard so a
 * newer reducer is never fed a stale (or future) shape.
 *
 * Runs the Unit 5 MERGE-on-load migration on every idea (see
 * `migrateIdeaProgress`). `remap` is injectable for tests of future remap
 * entries; production always uses the committed TASK_REMAP table.
 */
export function fromSaveDoc(
  raw: unknown,
  remap: Readonly<Record<string, RemapTarget>> = TASK_REMAP,
): FromSaveResult {
  if (!isRecord(raw)) return { ok: false, reason: "malformed" };
  if (raw.docVersion !== DOC_VERSION) return { ok: false, reason: "unknown-version" };
  const ideas = Array.isArray(raw.ideas)
    ? raw.ideas.map(coerceIdea).map((idea) => migrateIdeaProgress(idea, remap))
    : [];
  const activeIdea = typeof raw.activeIdea === "number" ? raw.activeIdea : 0;
  const siteHeadline = typeof raw.siteHeadline === "string" ? raw.siteHeadline : "";
  const onboardingComplete = raw.onboardingComplete === true;
  // Additive-optional field: absent in existing v1 docs -> null, NOT a discard.
  const chosenProvider = coerceChosenProvider(raw.chosenProvider);
  return {
    ok: true,
    doc: {
      docVersion: DOC_VERSION,
      ideas,
      activeIdea,
      siteHeadline,
      onboardingComplete,
      chosenProvider,
    },
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
  const idea = state.ideas[ideaIndex];
  // fpv2 core carries no artifact map yet; an @artifact task (parseTask's
  // `auto` hook) is only ever complete via the explicit done maps until
  // artifact state exists — the hook is preserved for later phases.
  // Stable-id map first (Unit 5), resolved through the remap table; then fall
  // back to the legacy `${stepId}#${index}` map (belt and braces — a stale tab
  // or pre-migration in-memory state may carry only the legacy key).
  const taskId = taskIdAt(stepId, index);
  if (taskId && idea.doneByTask?.[resolveTaskId(taskId)]) return true;
  return Boolean(idea.done[taskKey(stepId, index)]);
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

/**
 * Total NET of all `sale` ledger rows, in cents (the provider fee is felt). A
 * row with no fee snapshot (legacy / no-provider) counts at its gross amount via
 * the `netCents ?? amountCents` default.
 */
export function salesSumCents(state: GameState): number {
  return state.ledger
    .filter((row) => row.kind === "sale")
    .reduce((sum, row) => sum + (row.netCents ?? row.amountCents), 0);
}

/**
 * Total GROSS of all `sale` ledger rows, in cents (before the provider fee), so
 * the fee is visible next to net. Same per-row default at gross.
 */
export function grossSalesSumCents(state: GameState): number {
  return state.ledger
    .filter((row) => row.kind === "sale")
    .reduce((sum, row) => sum + (row.grossCents ?? row.amountCents), 0);
}

// ── Reducer ──────────────────────────────────────────────────────────────

export type Action =
  | { type: "SET_STAGE"; stage: Stage }
  | { type: "SET_OB"; ob: number }
  | { type: "SET_PROFILE"; patch: Partial<Profile> }
  | { type: "SET_ONBOARDING_COMPLETE"; value?: boolean }
  | { type: "CREATE_IDEA" }
  | { type: "SET_ACTIVE_IDEA"; ideaIndex: number }
  | { type: "SET_FIELD"; ideaIndex: number; key: string; value: string }
  /**
   * `at` is the caller-stamped completion time (epoch ms) — this module stays
   * Date.now()-free (the chosenAt precedent). Optional so stale/legacy callers
   * remain valid; without it the task completes with no doneAt entry.
   */
  | { type: "COMPLETE_TASK"; ideaIndex: number; stepId: string; index: number; at?: number }
  | { type: "OPEN_RUNNER"; stepId?: string; index?: number }
  | { type: "CLOSE_RUNNER" }
  | { type: "OPEN_ROOM"; room: RoomId }
  | { type: "CLOSE_ROOM" }
  | { type: "SET_PICK_FOR"; pickFor: string | null }
  | ({ type: "ADD_LEDGER"; mock?: boolean } & LedgerEntry)
  | { type: "SET_LEDGER"; ledger: LedgerEntry[] }
  | { type: "DISMISS_CELEBRATION" }
  | { type: "SET_PROVIDER"; providerId: ProviderId; chosenAt: number }
  | { type: "RESET_SESSION" }
  | { type: "HYDRATE"; doc: SaveDoc };

/**
 * Mark one task done for an idea (immutably). If that completes the criterion,
 * fire the celebration and advance the runner to the next playable criterion.
 * Idempotent and out-of-range tolerant: returns the same state if the index is
 * invalid or the task was already done.
 *
 * LEGACY-WRITE SCOPE (intended): a task OUTSIDE the ten-entry legacy table
 * (anything past 1.2) writes ONLY the stable-id maps — no legacy
 * `${stepId}#${index}` key is ever minted for it. That is deliberate: no legacy
 * reader ever existed for post-1.2 tasks (old builds could not complete them),
 * so a legacy mirror would be an invented key with no consumer. Their
 * loss-protection against a concurrent stale tab is the sync engine's
 * rebase-union (unionCompletionMaps in src/lib/sync.ts), not the legacy map.
 *
 * DUAL-WRITE RETIREMENT: the legacy dual-write (and the legacy fallback in
 * isTaskDone) retires when every cohort save has been re-persisted under the
 * stable-id shape AND no pre-stable-key build can still run — practically: a
 * deliberate cleanup unit after the cohort's saves are observed migrated (all
 * rows carry doneByTask); not before, and never as a drive-by edit.
 */
function markTaskDone(
  state: GameState,
  ideaIndex: number,
  stepId: string,
  index: number,
  at?: number,
): GameState {
  if (!hasIdea(state, ideaIndex)) return state;
  const step = stepById(stepId);
  if (!step || index < 0 || index >= step.tasks.length) return state;
  if (isTaskDone(state, ideaIndex, stepId, index)) return state;

  // Only a well-formed caller stamp is recorded (finite, non-negative epoch ms);
  // a missing/malformed stamp completes the task with no doneAt entry.
  const stampValid = typeof at === "number" && Number.isFinite(at) && at >= 0;
  const wasCriterionDone = isCriterionDone(state, ideaIndex, stepId);
  // DUAL-WRITE (Unit 5 transition; retirement condition in the doc comment
  // above): the stable-id maps are the forward shape; the legacy
  // `${stepId}#${index}` key is ALSO written when the task maps back through
  // the explicit legacy table, so an old tab that hydrates this doc and strips
  // the new fields still carries every completion in its legacy map and the
  // next new-code load re-unions losslessly (stale-tab risk row).
  const legacyKey = taskKey(stepId, index);
  const rawTaskId = taskIdAt(stepId, index);
  const stableId = rawTaskId ? resolveTaskId(rawTaskId) : undefined;
  const writeLegacy = legacyKey in LEGACY_KEY_REMAP || !stableId;
  const ideas = state.ideas.map((idea, i) =>
    i === ideaIndex
      ? {
          ...idea,
          done: writeLegacy ? { ...idea.done, [legacyKey]: true } : idea.done,
          ...(stableId
            ? { doneByTask: { ...(idea.doneByTask ?? {}), [stableId]: true } }
            : {}),
          ...(stampValid && writeLegacy
            ? { doneAt: { ...(idea.doneAt ?? {}), [legacyKey]: at } }
            : {}),
          ...(stampValid && stableId
            ? { doneAtByTask: { ...(idea.doneAtByTask ?? {}), [stableId]: at } }
            : {}),
        }
      : idea,
  );
  let next: GameState = { ...state, ideas };

  const nowCriterionDone = isCriterionDone(next, ideaIndex, stepId);
  if (!wasCriterionDone && nowCriterionDone) {
    const advanced = nextUpFor(next, ideaIndex);
    next = {
      ...next,
      celebrate: stepId,
      // The celebration takes over the whole screen. Close the runner so the
      // two fixed aria-modal dialogs never stack (and focus never lands on the
      // hidden runner underneath). DISMISS_CELEBRATION decides what re-opens.
      runnerOpen: false,
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

    case "SET_ONBOARDING_COMPLETE":
      // The only writer of `onboardingComplete`. Persisted via toSaveDoc so the
      // NEXT login's HYDRATE routes straight to `app` (never back into onboard).
      return { ...state, onboardingComplete: action.value ?? true };

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
      return markTaskDone(state, action.ideaIndex, action.stepId, action.index, action.at);

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
      // Gross is the amount charged the customer (amountCents kept = gross).
      const grossCents = action.grossCents ?? action.amountCents;
      // Fee MODELING (Unit 5): a REAL sale (kind:'sale', NOT mock) with a provider
      // chosen is modeled through the CHOSEN provider at sale time —
      // computeFee(gross, provider) snapshots {feeCents, netCents} and providerId
      // onto the row (computeFee guarantees gross = fee + net). A caller may still
      // pass a full snapshot explicitly (feeCents+netCents together, e.g. an
      // idempotent replay); that is honored as-is and never recomputed. Otherwise
      // the row defaults to un-modeled: gross = net = amountCents, fee = 0,
      // providerId = null (a mock overlay row, or a real sale with no provider
      // chosen, which the UI prevents but the reducer stays safe against). A
      // snapshot is honored as full only when BOTH halves are present; a partial
      // one (only feeCents or only netCents) is not trusted as a replay, and the
      // omitted half is derived from gross below so gross = fee + net always holds.
      const suppliedSnapshot =
        action.feeCents !== undefined && action.netCents !== undefined;
      let feeCents: number;
      let netCents: number;
      let providerId: string | null;
      if (
        action.kind === "sale" &&
        !action.mock &&
        state.chosenProvider &&
        !suppliedSnapshot
      ) {
        const computed = computeFee(grossCents, providerById(state.chosenProvider.providerId));
        feeCents = computed.feeCents;
        netCents = computed.netCents;
        providerId = state.chosenProvider.providerId;
      } else if (action.feeCents !== undefined && action.netCents === undefined) {
        // Partial snapshot: derive the omitted half from gross instead of
        // defaulting it independently, so the row stays coherent (gross = fee +
        // net). An incoherent row would be rejected by the fp_ledger coherence
        // CHECK and terminally dropped by the outbox.
        feeCents = action.feeCents;
        netCents = grossCents - feeCents;
        providerId = action.providerId ?? null;
      } else if (action.netCents !== undefined && action.feeCents === undefined) {
        netCents = action.netCents;
        feeCents = grossCents - netCents;
        providerId = action.providerId ?? null;
      } else {
        feeCents = action.feeCents ?? 0;
        netCents = action.netCents ?? grossCents;
        providerId = action.providerId ?? null;
      }
      const entry: LedgerEntry = {
        id: action.id,
        kind: action.kind,
        payer: action.payer,
        amountCents: action.amountCents,
        grossCents,
        feeCents,
        netCents,
        providerId,
        createdAt: action.createdAt,
      };
      let next: GameState = { ...state, ledger: [...state.ledger, entry] };
      if (action.kind === "sale" && !action.mock) {
        // A REAL logged sale auto-completes the LAST task of 1.2 for the active
        // idea, but only when 1.2 is unlocked for it (1.1 complete). A stray sale
        // event before then must not light 1.2's final pip while earlier pips are
        // dark. The `mock` opt-out lets the cosmetic Checkout Booth overlay log a
        // ledger/HUD row (preserving pre-Unit-3 behavior) WITHOUT completing the
        // real first sale or firing the first-sale celebration; the real sale
        // path (Unit 5 Sales Room / booth log-a-sale) omits `mock` and completes.
        const saleStep = stepById("1.2");
        if (
          saleStep &&
          hasIdea(next, next.activeIdea) &&
          isStepUnlocked(next, next.activeIdea, "1.2")
        ) {
          // Stamp the auto-completion from the row's caller-stamped createdAt
          // (the module stays Date.now()-free); an unparseable timestamp just
          // completes without a doneAt entry.
          const at = Date.parse(action.createdAt);
          next = markTaskDone(
            next,
            next.activeIdea,
            "1.2",
            saleStep.tasks.length - 1,
            Number.isFinite(at) && at >= 0 ? at : undefined,
          );
        }
      }
      return next;
    }

    case "SET_LEDGER":
      // Replace the whole session ledger (used to fill from the server after a
      // HYDRATE clears it to []). Server rows are authoritative on load.
      return { ...state, ledger: action.ledger };

    case "DISMISS_CELEBRATION": {
      // Clear the celebration, then re-open the runner ONLY if the active idea
      // still has an incomplete step to work. On the final criterion (nextUpFor
      // null) leave the runner closed so dismissing returns to the floor rather
      // than dropping the user back onto an already-done task.
      const nextStep = nextUpFor(state, state.activeIdea);
      if (!nextStep) {
        return { ...state, celebrate: null, runnerOpen: false };
      }
      const step = stepById(nextStep);
      const foundIndex = step
        ? step.tasks.findIndex((_, i) => !isTaskDone(state, state.activeIdea, nextStep, i))
        : -1;
      return {
        ...state,
        celebrate: null,
        runnerOpen: true,
        runnerStep: nextStep,
        runnerIndex: foundIndex >= 0 ? foundIndex : 0,
      };
    }

    case "SET_PROVIDER":
      // Record (or switch to) the chosen provider. The choice is durable (rides
      // the save doc); a switch stamps a fresh chosenAt. Past ledger rows keep
      // their own fee snapshot, so a switch never rewrites history (R24.6).
      //
      // Choosing the SAME provider is a NO-OP: return the same state reference so
      // there is no spurious effect (no chosenAt churn, nothing for the switch
      // coach to react to). A real switch is old id != new id (PP2 Unit 6).
      if (state.chosenProvider && state.chosenProvider.providerId === action.providerId) {
        return state;
      }
      return {
        ...state,
        chosenProvider: { providerId: action.providerId, chosenAt: action.chosenAt },
      };

    case "RESET_SESSION": {
      // Clear all per-account business/financial + UI state so no previous
      // child's ideas/ledger can leak into the next session on a shared device.
      // `stage` and `profile` are deliberately left for the caller to set —
      // EXCEPT `grade`, which is per-account child data adopted from the
      // roster at login and must never survive a session boundary (the next
      // child's login re-adopts, or the ask-once flow runs).
      const fresh = initialState();
      return {
        ...fresh,
        stage: state.stage,
        profile: { ...state.profile, grade: null },
      };
    }

    case "HYDRATE": {
      const { doc } = action;
      return {
        ...state,
        ideas: doc.ideas.map((idea) => ({
          fields: { ...idea.fields },
          done: { ...idea.done },
          // Split-storage learning: HYDRATE must source every persisted slice it
          // resets — copying doneAt here keeps timestamps from being wiped on load.
          ...(idea.doneAt ? { doneAt: { ...idea.doneAt } } : {}),
          // The stable-id maps (Unit 5) are sourced the same way, never wiped.
          ...(idea.doneByTask ? { doneByTask: { ...idea.doneByTask } } : {}),
          ...(idea.doneAtByTask ? { doneAtByTask: { ...idea.doneAtByTask } } : {}),
        })),
        // The ledger lives append-only in fp_ledger, never the save doc. Reset
        // it here so a hydrate can never carry a prior session's rows forward.
        ledger: [],
        activeIdea: doc.activeIdea,
        profile: { ...state.profile, siteHeadline: doc.siteHeadline },
        // Additive-optional: an existing v1 doc may omit it -> null.
        chosenProvider: doc.chosenProvider ?? null,
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
