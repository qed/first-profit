/**
 * The Watchtower's flow-board math (plan Unit 4) — pure functions only.
 *
 * No React, no fetch, no clock: every function here takes the endpoint's
 * anonymised payload plus an explicit `fetchedAt` / `nowMs` and returns view
 * models. The board is a QUEUE view over the curriculum, one criterion at a
 * time: per unit task, how many ideas got THROUGH it (throughput), how long that
 * took (median cycle time), and how many are SITTING on it right now (WIP, split
 * into active and stalled).
 *
 * ── The unit of analysis is the IDEA, not the child ──
 * A child with three ideas contributes three flow units. A promoted BUSINESS is
 * not a separate unit — its Phase 4-5 completions and its recency fold into the
 * idea it was promoted from (`Business.ideaId`), because they are the same flow.
 * A business whose `ideaId` is absent or dangling has no idea to fold into and
 * becomes its OWN unit, marked `origin: "business"` (see `isGatedOut` for why
 * that marking is load-bearing).
 *
 * ── The union rule is IMPORTED, never re-implemented ──
 * `migrateIdeaProgress` is exported from `src/state/gameCore.ts` and applied
 * here verbatim: legacy `${stepId}#${index}` keys through `LEGACY_KEY_REMAP`,
 * every stable key (including remap outputs) through `resolveTaskId`/
 * `TASK_REMAP`, new shape wins on collision, and a timestamp without its
 * `done: true` never mints a completion. A hand-copy would drift from the
 * child's own client and the drift would surface only as a wrong number.
 *
 * ── What actually validates this board ──
 * THROUGHPUT MONOTONICITY (`FlowTotals.throughputMonotonic`). It is the one
 * property here that CAN fail: throughput is derived from the completion maps
 * while the WIP columns are derived from the walk, so a mis-placed unit, a
 * broken entry gate or a genuinely out-of-order doc breaks it.
 * `active + stalled + before + after === liveUnits` is NOT a check — `placeUnit`
 * is total and single-valued, so that identity holds by construction even when
 * every number on the board is wrong (verified: it survives swapping `active`
 * and `stalled` wholesale). Those numbers are reported because staff read them
 * as a footer, never as validation.
 *
 * ── SURVIVORSHIP: read `cycleTimeMedianMs` with `stalled`, never alone ──
 * The median is computed ONLY over ideas that actually COMPLETED the task.
 * Ideas abandoned before completing it contribute nothing, and the slowest are
 * the likeliest to be abandoned, so the median systematically UNDERSTATES how
 * hard a task is. `sampleSize`, `sampleChildCount` and `maxSamplesFromOneChild`
 * are emitted so Unit 5's copy can carry that honestly. This is a property of
 * the metric, not a defect to engineer away.
 */

import {
  CRITERION_SEQUENCE,
  migrateIdeaProgress,
  phaseOfCriterion,
  type Idea,
} from "../../state/gameCore";
import { stepById, type PhaseId } from "../../data/path";
import {
  TASK_REMAP,
  legacyKeyForTaskId,
  remapSourcesForTaskId,
  taskIdAt,
  type RemapTarget,
} from "../../data/taskRemap";

/* ------------------------------------------------------------- constants */

/**
 * How long a flow unit may go without a corroborated completion before it counts
 * as STALLED rather than actively sitting on its task.
 *
 * Defined HERE and only here. The server deliberately does not know the
 * threshold — it supplies `lastCompletionAt` and nothing else — because a
 * threshold defined in two repos is a threshold that will drift. Named, exported
 * and test-pinned so changing it is a one-line deliberate edit rather than a
 * literal buried at a call site.
 *
 * Without the split, an idea abandoned months ago sits in a WIP count forever
 * and every "sitting here" number drifts upward as the cohort ages.
 */
export const STALLED_AFTER_MS = 30 * 86400e3;

/**
 * The longest elapsed this module will accept as a CYCLE TIME.
 *
 * `clampStamp` bounds the FUTURE side only, so a device with a backwards-set
 * clock — an ancient predecessor stamp beside a correct successor — yields a
 * huge POSITIVE elapsed that passes every other guard. Reproduced on a fixture:
 * two such pairs produced a median of 1204 days. The whole program is a year of
 * work, so an elapsed past 365 days is not a task duration, it is a broken
 * clock. Such pairs are DROPPED and counted in `droppedSamples`, never clamped —
 * a clamped pair would silently assert "this task takes exactly a year".
 */
export const MAX_CYCLE_TIME_MS = 365 * 86400e3;

/**
 * The fewest DISTINCT children a median may be computed over. Either reason
 * below would justify it alone:
 *
 *  - Statistical: a "median" over one child is that child's number, not the
 *    cohort's, and a staff member reading it as a task duration draws the wrong
 *    conclusion about which task to fix.
 *  - PRIVACY: a median over one child's single sample IS that child's exact
 *    elapsed time between two named tasks. On a board whose `stalled` count is
 *    drillable to usernames by design, that is an identified individual's timing
 *    published on the aggregate surface. The data layer declines to emit it
 *    rather than deferring the caveat to Unit 5's copy.
 *
 * Below it the row reports `cycleTimeMedianMs: null` with `medianSuppressed:
 * true`, so the UI can say "not enough children yet" rather than "—", which
 * means "not measurable here".
 */
export const MIN_CHILDREN_PER_MEDIAN = 2;

/**
 * The endpoint's hard cap on requested ids (`PROGRESS_MAX_REQUESTED_TASK_IDS` in
 * the120's `app/api/fp/progress/progress-rules.ts`). Mirrored, not imported — it
 * is another repo and another deploy.
 */
export const REQUESTED_TASK_IDS_CAP = 32;

/**
 * The budget this client holds itself to: half the server's cap.
 *
 * A criterion is ~5 tasks plus one predecessor plus their legacy aliases and any
 * remapped old ids, so today's worst case is nowhere near this.
 *
 * THE GUARD IS THE TEST — `flowBoard.test.ts` ("stays well under the server's
 * 32-id cap for EVERY criterion") — plus `scripts/check-path-content.ts`, the
 * build preflight where content edits are already gated. It is deliberately NOT
 * a module-load throw: `App.tsx` imports `StaffShell` statically and Unit 5
 * pulls this module in behind it, so a top-level throw would abort the entry
 * module graph and blank the app for every LEARNER, not just staff. (`vite build`
 * bundles without executing top-level code, so a throw would not have been a
 * build gate either.)
 */
export const REQUESTED_TASK_IDS_BUDGET = 16;

/* ------------------------------------------------------------ wire shape */

/**
 * The response contract of `GET /api/fp/progress`, mirrored from the120's
 * `progress-rules.ts` header. Declared structurally here rather than imported —
 * it is a different repo and a different deploy — so a change over there shows
 * up as a test failure here rather than as a silent type-hole.
 */
export interface WireIdea {
  /** ORIGINAL position in `doc.ideas`, preserved by the server across entries it
   *  skipped — load-bearing for `legacy-idea-{index}` minting, and the detector
   *  behind `NormalizedCohort.childrenWithSkippedIdeas`. */
  index: number;
  id: string | null;
  done: Record<string, boolean>;
  doneAt: Record<string, number>;
  doneByTask: Record<string, boolean>;
  doneAtByTask: Record<string, number>;
  /** Max stamp across ALL maps, computed BEFORE the task-id filter and NOT gated
   *  on a matching `done: true` — see `FlowUnit.recencyCorroborated`. */
  lastCompletionAt: number | null;
  /** The server clamped a future-dated stamp: `lastCompletionAt` is synthetic. */
  recencyClamped: boolean;
  hasCompletionsOutsideRequest: boolean;
}

export interface WireBusiness {
  id: string;
  ideaId: string | null;
  /** The record was retired. Its COMPLETIONS still count (the progress
   *  happened); its RECENCY does not — see `normalizeCohort`. */
  archived: boolean;
  doneByTask: Record<string, boolean>;
  doneAtByTask: Record<string, number>;
  /** The business's OWN recency. Phase 4-5 completions write only here, so an
   *  idea working in Grow has a FROZEN idea-side `lastCompletionAt`. */
  lastCompletionAt: number | null;
  recencyClamped: boolean;
  hasCompletionsOutsideRequest: boolean;
}

export interface WireChild {
  username: string;
  /** A walk bound fired somewhere in this child's doc. Per CHILD, not per idea. */
  truncated: boolean;
  /** A save row exists but its doc could not be read — NOT "never started". */
  docUnreadable: boolean;
  ideas: WireIdea[];
  businesses: WireBusiness[];
}

export interface WireProgressResponse {
  children: readonly WireChild[];
}

/* ------------------------------------------------------------ flow units */

/** Where a flow unit came from. Load-bearing at the criterion boundary: a
 *  Business record carries ONLY Phase 4-5 completions, so it can never satisfy
 *  an idea-side entry predecessor (see `isGatedOut`). */
export type FlowUnitOrigin = "idea" | "business";

/**
 * One flow unit, as every AGGREGATE function sees it: no username, no key.
 *
 * The type alone is NOT the protection. `NamedFlowUnit extends FlowUnit`, so
 * handing the named array to an aggregate function still passes the names in at
 * runtime — the type only stops the function BODY from reading them. Unit 5 must
 * call `anonymousUnits` and hold THAT array in component state, so no name is
 * ever in scope where the aggregate table renders.
 *
 * ⚠ `childIndex` is a stable per-child PSEUDONYM (the position in
 * `response.children`). It exists so per-child concentration math is possible
 * without a name, and it must never be rendered, serialised into the DOM, or
 * logged — re-identifying it against the drill-down is one step.
 */
export interface FlowUnit {
  childIndex: number;
  origin: FlowUnitOrigin;
  /**
   * taskId → completion. The VALUE is the completion stamp in epoch ms, or
   * `null` for an untimestamped completion (`done: true` with no stamp —
   * pre-timestamp play). Presence of the key IS the completion; a stamp without
   * its `done: true` never gets here.
   */
  completions: ReadonlyMap<string, number | null>;
  /** Max stamp anywhere in the child's doc for this unit, pre-filter, clamped to
   *  `fetchedAt`. Null when there is no stamp at all. */
  lastCompletionAt: number | null;
  /** Any stamp feeding `lastCompletionAt` was clamped by the server. */
  recencyClamped: boolean;
  /**
   * Is `lastCompletionAt` backed by an actual completion?
   *
   * The server computes that number over every TYPE-VALID stamp, deliberately
   * NOT gated on a matching `done: true` — so a bare `doneAtByTask` entry, which
   * mints no completion at all, still yields fresh recency. Two attacks land
   * here and both were reproduced: a `doneAtByTask` key with no `doneByTask`
   * makes a unit with ZERO in-window completions read "actively working", and a
   * business carrying a fresh stamp and no completions revives a 400-day-dead
   * idea. Because `stalled` is the only drillable, actionable number, hiding
   * from it removes a child from every intervention path.
   *
   * Corroborated means one of: a completion of this unit is at least as new as
   * `lastCompletionAt` (the recency IS that completion), or the server reported
   * completions outside the request — a real completion we cannot see plausibly
   * explains it, which is the "working in a later criterion" case. An
   * uncorroborated unit is not credited as active, and the row counts it under
   * `uncorroborated` so the UI can tell it from an ordinary quiet child.
   */
  recencyCorroborated: boolean;
  /** The unit has completions the request did not ask about. Aggregated as
   *  `NormalizedCohort.unitsWithCompletionsOutsideRequest` — the aggregate view
   *  must read THAT, never iterate the named array to count it. */
  hasCompletionsOutsideRequest: boolean;
  /** This unit came from a child whose doc tripped a server walk bound. */
  fromTruncatedDoc: boolean;
}

/**
 * A flow unit WITH the identity behind it. Only `drillDown` accepts this type.
 *
 * `key` is a deterministic per-unit identity — it is what proves duplicate idea
 * ids stay distinct units. It lives here rather than on `FlowUnit` because it
 * embeds `childIndex`, and an aggregate row must not carry a per-child token,
 * even an opaque one.
 */
export interface NamedFlowUnit extends FlowUnit {
  key: string;
  username: string;
}

/**
 * The whole cohort, normalized, plus the cohort-level facts the board must state
 * rather than silently fold into a number.
 *
 * The rule these fields keep: a child who contributes no flow units is COUNTED,
 * never merely absent. An absent child is indistinguishable from a child who has
 * not started, which makes erasure — accidental or deliberate — free.
 */
export interface NormalizedCohort {
  units: NamedFlowUnit[];
  /**
   * Children with a save row whose doc could not be read. They contribute NO
   * flow units: their own client refuses to load the doc, so they are neither
   * "not started" nor "sitting" anywhere, and counting them as either would be a
   * fabricated number. The board must say "N saves unreadable" instead.
   */
  unreadableChildren: number;
  /**
   * Children whose doc tripped a server walk bound. Their units ARE counted,
   * flagged per-unit as `fromTruncatedDoc`. Excluding them would silently delete
   * real ideas from throughput and the WIP columns — and abnormal docs are
   * exactly what staff most need to see. The losses happen BEFORE the task-id
   * filter, so a flagged child usually delivered every requested id intact. A
   * caveat to display, not an exclusion.
   */
  truncatedChildren: number;
  /**
   * Children whose ideas array is missing entries the server SKIPPED as
   * malformed, detected as `max(index) + 1 > ideas.length` — the server
   * preserves original indices, so a gap is evidence. Those ideas are absent
   * from throughput, from the WIP columns and from the stalled roster, and
   * nothing else reports them.
   */
  childrenWithSkippedIdeas: number;
  /** Readable children that produced NO units at all — indistinguishable from
   *  "never started" unless counted here. */
  childrenWithNoUnits: number;
  /** Units the server said have completions outside the requested ids. */
  unitsWithCompletionsOutsideRequest: number;
  /** Units whose recency no completion backs — see `FlowUnit.recencyCorroborated`. */
  unitsWithUncorroboratedRecency: number;
  /** Children present in the payload, including unreadable ones. */
  childCount: number;
  /**
   * The most flow units contributed by any single child. One child may hold up
   * to 50 ideas (the endpoint's `PROGRESS_IDEAS_CAP`), so a crafted doc can
   * inflate a task's WIP by 50 while reporting no anomaly of any kind. The
   * MEDIAN is defended structurally instead (see `computeFlowRows`); this number
   * is what lets the UI caveat the WIP columns, which have no such defence.
   */
  maxUnitsPerChild: number;
}

/* -------------------------------------------------------------- the window */

/** The ~5 unit tasks on screen, in order, plus the predecessor wiring. */
export interface FlowWindow {
  phaseId: PhaseId;
  criterionId: string;
  /** The criterion's task ids, in curriculum order. */
  taskIds: readonly string[];
  /**
   * taskId → the task that must be completed IMMEDIATELY BEFORE it, or null.
   *
   * Null only for the very first task of the WHOLE sequence, which therefore has
   * no cycle time, permanently, for every idea: `Idea` carries no creation
   * timestamp (verified — only `id`, `fields` and the four maps), so there is
   * nothing to subtract from. That row renders "—". Adding an idea `createdAt`
   * would close it forward-only; it is a recorded deferred gap, not a bug.
   */
  predecessorByTask: ReadonlyMap<string, string | null>;
  /** The ONE predecessor id from the PRECEDING criterion — the extra id the
   *  request carries. Null for the first criterion of the whole sequence. */
  entryPredecessorId: string | null;
}

/* ------------------------------------------- the global task order (content) */

/**
 * Every task id in the whole curriculum, in play order, derived from
 * `CRITERION_SEQUENCE` + the generated content. Never hardcoded: a content edit
 * moves this, and everything below reads it.
 */
const GLOBAL_TASK_ORDER: readonly string[] = CRITERION_SEQUENCE.flatMap((criterionId) => {
  const step = stepById(criterionId);
  if (!step) return [];
  const ids: string[] = [];
  for (let index = 0; index < step.tasks.length; index++) {
    const id = taskIdAt(criterionId, index);
    if (id) ids.push(id);
  }
  return ids;
});

const GLOBAL_INDEX_BY_TASK: ReadonlyMap<string, number> = new Map(
  GLOBAL_TASK_ORDER.map((id, index) => [id, index]),
);

/**
 * The task ids belonging to ONE criterion, filtered out of a global play order.
 *
 * The TRAILING DOT is load-bearing and is the whole reason this is a named
 * function rather than an inline filter. `"1.10.1".startsWith("1.1")` is true;
 * `"1.10.1".startsWith("1.1.")` is not. Every criterion id ships single-digit
 * today, so dropping the dot changes nothing NOW — which is exactly why the
 * invariant needs pinning rather than leaving to luck. The day a phase gains a
 * tenth criterion, a dotless prefix would silently pull `1.10`'s tasks into
 * `1.1`'s window, inflating its throughput and mis-placing every unit on it.
 *
 * @internal Test seam — `order` is injectable ONLY so the dot can be proven
 * against a synthetic id list that includes a tenth criterion. Production
 * callers pass nothing and get the real curriculum order.
 */
export function taskIdsForCriterion(
  criterionId: string,
  order: readonly string[] = GLOBAL_TASK_ORDER,
): string[] {
  return order.filter((id) => id.startsWith(`${criterionId}.`));
}

/* ------------------------------------------------------------ window + ids */

/**
 * The window for one (phase, criterion) selection.
 *
 * Throws with a DISTINCT message for an unknown criterion and for one that
 * belongs to a different phase: both are caller bugs in a two-level selector
 * whose options come from the same content, and on a staff-only screen a loud
 * failure beats a silently empty board.
 */
export function criterionWindow(phaseId: PhaseId, criterionId: string): FlowWindow {
  const actualPhase = phaseOfCriterion(criterionId);
  // Ordered so BOTH branches are reachable: an unknown id has no phase at all,
  // and the mismatch check below would otherwise swallow it.
  if (actualPhase === undefined) {
    throw new Error(`flowBoard: unknown criterion ${criterionId}`);
  }
  if (actualPhase !== phaseId) {
    throw new Error(`flowBoard: criterion ${criterionId} is not in phase ${phaseId}`);
  }
  // Safe by content invariant, not by luck: parseCurriculum ENFORCES task ids as
  // `${criterion.id}.${n}`, so no other criterion's id can share this prefix.
  const taskIds = taskIdsForCriterion(criterionId);
  if (taskIds.length === 0) {
    throw new Error(`flowBoard: criterion ${criterionId} has no tasks`);
  }
  const predecessorByTask = new Map<string, string | null>();
  for (const id of taskIds) {
    const globalIndex = GLOBAL_INDEX_BY_TASK.get(id) ?? 0;
    predecessorByTask.set(id, globalIndex === 0 ? null : GLOBAL_TASK_ORDER[globalIndex - 1]);
  }
  return {
    phaseId,
    criterionId,
    taskIds,
    predecessorByTask,
    entryPredecessorId: predecessorByTask.get(taskIds[0]) ?? null,
  };
}

/**
 * The EXACT id list the client sends as `?tasks=` — the criterion's ~5 ids plus
 * the ONE predecessor id from the preceding criterion, plus every OTHER SPELLING
 * of those ids a child's doc might still use, de-duplicated and order-stable.
 *
 * This is where the client's `CRITERION_SEQUENCE` knowledge becomes request
 * input, and it is the reason the server needs no sequence knowledge of its own:
 * the predecessor is EXACT because it is read from the content here, rather than
 * inferred server-side as "the highest stamp outside the criterion" — an
 * inference that is unsound, because `markTaskDone` has no predecessor guard and
 * the save doc is child-writable, so out-of-order stamps are possible.
 *
 * ── Why the other spellings ride along ──
 * The endpoint filters completion maps by EXACT string membership, BEFORE
 * anything remaps. A key the request does not name is gone before
 * `migrateIdeaProgress` — which knows how to fold it — ever sees it, and the
 * child reads as "never got here". Two tables produce other spellings, and both
 * inverses come from `taskRemap.ts` rather than being re-derived here:
 *  - `legacyKeyForTaskId` — the legacy `${stepId}#${index}` form. Only 1.1 and
 *    1.2 have one (LEGACY_KEY_REMAP is exactly ten entries), so this adds at
 *    most 6 ids and nothing past 1.2.
 *  - `remapSourcesForTaskId` — old stable ids a TASK_REMAP entry moved onto this
 *    one. Contributes nothing today because TASK_REMAP ships empty; CLAUDE.md's
 *    editorial rule guarantees it will not stay empty, and the failure it would
 *    otherwise cause is silent.
 */
export function requestedTaskIds(
  phaseId: PhaseId,
  criterionId: string,
  remap: Readonly<Record<string, RemapTarget>> = TASK_REMAP,
): string[] {
  const window = criterionWindow(phaseId, criterionId);
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string | null | undefined): void => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  const pushEverySpelling = (taskId: string): void => {
    push(taskId);
    push(legacyKeyForTaskId(taskId));
    for (const oldId of remapSourcesForTaskId(taskId, remap)) {
      push(oldId);
      push(legacyKeyForTaskId(oldId));
    }
  };
  if (window.entryPredecessorId) pushEverySpelling(window.entryPredecessorId);
  for (const id of window.taskIds) pushEverySpelling(id);
  return out;
}

/* -------------------------------------------------------------- normalize */

/** Clamp a client-visible stamp to the fetch instant. A stamp after the moment
 *  we asked is not a time; it must never mint a negative elapsed or a
 *  freshly-active unit. */
function clampStamp(value: number | null | undefined, fetchedAt: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value > fetchedAt ? fetchedAt : value;
}

function laterOf(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

/**
 * The four wire maps → a completion map, through gameCore's `migrateIdeaProgress`.
 *
 * Every semantic lives in that imported helper; this function only adapts the
 * wire shape into an `Idea` and reads the migrated stable maps back out. A
 * `doneAtByTask` entry whose `doneByTask` is not `true` is skipped here for the
 * same reason the helper skips an orphaned legacy `doneAt`: a timestamp is not a
 * completion.
 */
function completionsFromMaps(
  maps: {
    done?: Record<string, boolean>;
    doneAt?: Record<string, number>;
    doneByTask?: Record<string, boolean>;
    doneAtByTask?: Record<string, number>;
  },
  fetchedAt: number,
  remap: Readonly<Record<string, RemapTarget>>,
): Map<string, number | null> {
  const asIdea: Idea = {
    fields: {},
    done: maps.done ?? {},
    doneAt: maps.doneAt ?? {},
    doneByTask: maps.doneByTask ?? {},
    doneAtByTask: maps.doneAtByTask ?? {},
  };
  const migrated = migrateIdeaProgress(asIdea, remap);
  const out = new Map<string, number | null>();
  for (const [taskId, done] of Object.entries(migrated.doneByTask ?? {})) {
    if (done !== true) continue;
    out.set(taskId, clampStamp(migrated.doneAtByTask?.[taskId], fetchedAt));
  }
  return out;
}

/** The newest stamp among a unit's own completions, or null. */
function newestCompletionStamp(completions: ReadonlyMap<string, number | null>): number | null {
  let newest: number | null = null;
  for (const at of completions.values()) newest = laterOf(newest, at);
  return newest;
}

/** See `FlowUnit.recencyCorroborated` for the argument. */
function isRecencyCorroborated(
  lastCompletionAt: number | null,
  completions: ReadonlyMap<string, number | null>,
  hasCompletionsOutsideRequest: boolean,
): boolean {
  if (lastCompletionAt === null) return true; // nothing to corroborate
  if (hasCompletionsOutsideRequest) return true;
  const newest = newestCompletionStamp(completions);
  return newest !== null && newest >= lastCompletionAt;
}

/** A unit under construction: businesses fold into it before `recencyCorroborated`
 *  is derived and it is frozen into a `NamedFlowUnit`. */
type DraftUnit = {
  key: string;
  childIndex: number;
  username: string;
  origin: FlowUnitOrigin;
  completions: Map<string, number | null>;
  lastCompletionAt: number | null;
  recencyClamped: boolean;
  hasCompletionsOutsideRequest: boolean;
  fromTruncatedDoc: boolean;
};

/**
 * The payload → a flat list of flow units.
 *
 * The cohort-level counters are documented on `NormalizedCohort`, where the
 * decisions live.
 *
 * The decision that belongs at THIS call site is the BUSINESS FOLD. A business
 * folds into the idea named by its `ideaId` (first match wins when a doc carries
 * duplicate idea ids) because they are the same flow, and Phase 4-5 completions
 * write ONLY to the business record — so reading recency off the idea alone
 * would paint the cohort's most active children as stalled.
 *
 * But the two halves of a fold answer different questions, and an ARCHIVED
 * record splits them: its COMPLETIONS still count, because the progress
 * genuinely happened, while its RECENCY does not, because WIP asks "is someone
 * sitting on this right now?" and a retired record is not evidence of that.
 * Without the split, one archived business with a fresh stamp revives a
 * long-dead idea into `active` and out of every intervention path.
 */
export function normalizeCohort(
  response: WireProgressResponse,
  fetchedAt: number,
  remap: Readonly<Record<string, RemapTarget>> = TASK_REMAP,
): NormalizedCohort {
  const units: NamedFlowUnit[] = [];
  let unreadableChildren = 0;
  let truncatedChildren = 0;
  let childrenWithSkippedIdeas = 0;
  let childrenWithNoUnits = 0;
  let unitsWithCompletionsOutsideRequest = 0;
  let unitsWithUncorroboratedRecency = 0;
  let maxUnitsPerChild = 0;

  const children = response.children ?? [];
  for (let childIndex = 0; childIndex < children.length; childIndex++) {
    const child = children[childIndex];
    if (child.docUnreadable) {
      unreadableChildren++;
      continue;
    }
    if (child.truncated) truncatedChildren++;

    const ideas = child.ideas ?? [];
    // The server preserves ORIGINAL indices across entries it skipped, so a gap
    // between the highest index and the count is evidence of silent loss.
    const highestIndex = ideas.reduce((max, idea) => Math.max(max, idea.index), -1);
    if (highestIndex + 1 > ideas.length) childrenWithSkippedIdeas++;

    const drafts: DraftUnit[] = [];
    // Idea id → the FIRST draft carrying it, for the business fold. Duplicate
    // ids stay distinct units; only the fold target is disambiguated.
    const draftByIdeaId = new Map<string, DraftUnit>();

    for (const idea of ideas) {
      // `legacy-idea-{index}` minting, from the server's PRESERVED original
      // index — identical to what the kid's own client mints in fromSaveDoc.
      const ideaId = idea.id ?? `legacy-idea-${idea.index}`;
      const draft: DraftUnit = {
        key: `${childIndex}:i${idea.index}:${ideaId}`,
        childIndex,
        username: child.username,
        origin: "idea",
        completions: completionsFromMaps(idea, fetchedAt, remap),
        lastCompletionAt: clampStamp(idea.lastCompletionAt, fetchedAt),
        recencyClamped: idea.recencyClamped === true,
        hasCompletionsOutsideRequest: idea.hasCompletionsOutsideRequest === true,
        fromTruncatedDoc: child.truncated === true,
      };
      drafts.push(draft);
      if (!draftByIdeaId.has(ideaId)) draftByIdeaId.set(ideaId, draft);
    }

    for (const business of child.businesses ?? []) {
      const completions = completionsFromMaps(business, fetchedAt, remap);
      const archived = business.archived === true;
      const target = business.ideaId ? draftByIdeaId.get(business.ideaId) : undefined;
      if (target) {
        for (const [taskId, at] of completions) {
          // Union, idea-side wins a collision — the idea's own maps are the
          // older, authoritative record for anything both carry (in practice
          // the two never overlap: Phase 4-5 writes only to the business).
          if (!target.completions.has(taskId)) target.completions.set(taskId, at);
        }
        target.hasCompletionsOutsideRequest =
          target.hasCompletionsOutsideRequest || business.hasCompletionsOutsideRequest === true;
        if (archived) continue; // completions folded; recency deliberately not
        target.lastCompletionAt = laterOf(
          target.lastCompletionAt,
          clampStamp(business.lastCompletionAt, fetchedAt),
        );
        target.recencyClamped = target.recencyClamped || business.recencyClamped === true;
        continue;
      }
      drafts.push({
        key: `${childIndex}:b:${business.id}`,
        childIndex,
        username: child.username,
        origin: "business",
        completions,
        // An idea-less business is its own unit; an ARCHIVED one still gets no
        // recency credit, for the same reason as above.
        lastCompletionAt: archived ? null : clampStamp(business.lastCompletionAt, fetchedAt),
        recencyClamped: archived ? false : business.recencyClamped === true,
        hasCompletionsOutsideRequest: business.hasCompletionsOutsideRequest === true,
        fromTruncatedDoc: child.truncated === true,
      });
    }

    if (drafts.length === 0) childrenWithNoUnits++;
    if (drafts.length > maxUnitsPerChild) maxUnitsPerChild = drafts.length;
    for (const draft of drafts) {
      const recencyCorroborated = isRecencyCorroborated(
        draft.lastCompletionAt,
        draft.completions,
        draft.hasCompletionsOutsideRequest,
      );
      if (draft.hasCompletionsOutsideRequest) unitsWithCompletionsOutsideRequest++;
      if (!recencyCorroborated) unitsWithUncorroboratedRecency++;
      units.push({ ...draft, recencyCorroborated });
    }
  }

  return {
    units,
    unreadableChildren,
    truncatedChildren,
    childrenWithSkippedIdeas,
    childrenWithNoUnits,
    unitsWithCompletionsOutsideRequest,
    unitsWithUncorroboratedRecency,
    childCount: children.length,
    maxUnitsPerChild,
  };
}

/**
 * The named array → the anonymous one the aggregate functions should receive.
 *
 * A real projection, not a cast: `NamedFlowUnit extends FlowUnit`, so handing
 * the named array straight to `computeFlowRows` satisfies the type while
 * carrying every username into the aggregate view's state. Unit 5 holds THIS
 * array for the table, and the named one only behind the drill-down.
 */
export function anonymousUnits(cohort: NormalizedCohort): FlowUnit[] {
  return cohort.units.map((unit) => ({
    childIndex: unit.childIndex,
    origin: unit.origin,
    completions: unit.completions,
    lastCompletionAt: unit.lastCompletionAt,
    recencyClamped: unit.recencyClamped,
    recencyCorroborated: unit.recencyCorroborated,
    hasCompletionsOutsideRequest: unit.hasCompletionsOutsideRequest,
    fromTruncatedDoc: unit.fromTruncatedDoc,
  }));
}

/* ------------------------------------------------------------- placement */

/** Which WIP bucket a unit sitting on a task belongs in. */
export type FlowBucket = "active" | "stalled";

/** Why a unit landed in `stalled`. Null when it is active. */
export type StalledReason = "clamped" | "no-stamp" | "uncorroborated" | "idle";

/**
 * Where one flow unit sits relative to the visible window.
 *
 * @internal Test seam and shared internal. Unit 5 builds on `computeFlowRows`,
 * `computeFlowTotals` and `drillDown` — three views of one walk — rather than
 * re-deriving placement and drifting from them.
 */
export type FlowPlacement =
  | { where: "before" }
  | { where: "row"; taskId: string; bucket: FlowBucket; reason: StalledReason | null }
  | { where: "after" };

/**
 * The active/stalled decision for a unit sitting on a visible task.
 *
 * Four ways to be stalled, in order:
 *  1. `clamped` — the server clamped a future-dated stamp, so `lastCompletionAt`
 *     is THIS REQUEST'S clock, not a moment the child did anything. Crediting it
 *     would make one forward-clocked tablet permanently "just active" and
 *     invisible on a board whose entire job is noticing who has stopped.
 *  2. `no-stamp` — no stamp at all: completions with unknown time, or none. The
 *     population the old "recency unknown" state existed to catch; letting it
 *     hide inside the healthy number is the failure the split exists to prevent.
 *  3. `uncorroborated` — see `FlowUnit.recencyCorroborated`.
 *  4. `idle` — `now - lastCompletionAt >= STALLED_AFTER_MS`. The ordinary case.
 *
 * The first and third are also reported as row-level counts so the UI can
 * separate "gone quiet" from "this doc is strange" without a fourth column.
 */
function bucketFor(
  unit: FlowUnit,
  nowMs: number,
): { bucket: FlowBucket; reason: StalledReason | null } {
  if (unit.recencyClamped) return { bucket: "stalled", reason: "clamped" };
  if (unit.lastCompletionAt === null) return { bucket: "stalled", reason: "no-stamp" };
  if (!unit.recencyCorroborated) return { bucket: "stalled", reason: "uncorroborated" };
  const idleMs = nowMs - unit.lastCompletionAt;
  if (idleMs >= STALLED_AFTER_MS) return { bucket: "stalled", reason: "idle" };
  return { bucket: "active", reason: null };
}

/**
 * Does the window's ENTRY PREDECESSOR gate this unit out of the criterion?
 *
 * The gate exists so a unit that has not reached the criterion is counted
 * `before` rather than parked on its first task. It must NOT override the walk,
 * and there are two ways it would:
 *
 *  - IN-WINDOW EVIDENCE. A unit with completions inside the criterion has
 *    demonstrably reached it. Gating it produced a board asserting both "has not
 *    reached 1.2" and "got through 1.2.5" for the same unit — and it needs no
 *    hostile doc: the server's insertion-ordered entry cap can drop the single
 *    predecessor key while keeping the in-window ones, and truncated children
 *    are deliberately kept. The walk already handles out-of-order units
 *    correctly; this extends that guarantee to the criterion boundary.
 *  - BUSINESS-ORIGIN UNITS. A Business record carries ONLY Phase 4-5
 *    completions, so an idea-side entry predecessor (`3.5.5` for the first Grow
 *    criterion) is one it can never satisfy. Gating it made an idea-less
 *    business permanently `before`, producing a board that showed completions on
 *    4.1 and nobody working 4.1.
 */
function isGatedOut(unit: FlowUnit, window: FlowWindow): boolean {
  const entry = window.entryPredecessorId;
  if (entry === null) return false; // this criterion IS the sequence start
  if (unit.origin === "business") return false;
  if (unit.completions.has(entry)) return false;
  return !window.taskIds.some((taskId) => unit.completions.has(taskId));
}

/**
 * The next-incomplete walk, scoped to the visible window. Total and
 * single-valued: every unit lands in exactly one of before / a row / after.
 *
 * `hasCompletionsOutsideRequest` is deliberately NOT consulted: the partition is
 * derived from the walk alone, so it stays sound if the flag is ever wrong.
 *
 * @internal Test seam — see `FlowPlacement`.
 */
export function placeUnit(unit: FlowUnit, window: FlowWindow, nowMs: number): FlowPlacement {
  if (isGatedOut(unit, window)) return { where: "before" };
  for (const taskId of window.taskIds) {
    if (unit.completions.has(taskId)) continue;
    return { where: "row", taskId, ...bucketFor(unit, nowMs) };
  }
  return { where: "after" };
}

/* ------------------------------------------------------------------ rows */

export interface FlowRow {
  taskId: string;
  /** Null only for the very first task of the whole sequence. */
  predecessorTaskId: string | null;
  /** Flow units that have COMPLETED this task, timestamped or not. */
  throughput: number;
  /**
   * The cohort median of per-CHILD median cycle times, in ms. Null when the
   * sample is empty, when fewer than `MIN_CHILDREN_PER_MEDIAN` children
   * contributed, and ALWAYS for the first task of the sequence.
   *
   * Median, not mean: at cohort scale a single idea left open over a weekend
   * owns the mean. Per-child first: see `computeFlowRows`.
   *
   * ⚠ Survivorship: computed over COMPLETERS ONLY — read it with `stalled`.
   */
  cycleTimeMedianMs: number | null;
  /** A median existed but was withheld for having too few children. Distinct
   *  from "not measurable", so Unit 5 can say which. */
  medianSuppressed: boolean;
  /** Raw usable pairs behind the median. A thin sample must be visibly thin. */
  sampleSize: number;
  /** DISTINCT children behind the median. */
  sampleChildCount: number;
  /** The most pairs any ONE child contributed. `sampleChildCount` alone does not
   *  catch concentration — 5 honest children plus one attacker with 6 ideas
   *  reads as 6 of 6 contributors, the maximum breadth, while moving a raw
   *  median from 2 days to 45. */
  maxSamplesFromOneChild: number;
  /** Pairs discarded as unusable: negative, zero, or past MAX_CYCLE_TIME_MS. */
  droppedSamples: number;
  /** Units sitting on this task whose recency is corroborated and inside
   *  STALLED_AFTER_MS. */
  active: number;
  /** Units sitting on this task with none. The surviving trace of the old stuck
   *  list — drilling it is how staff find who to nudge. */
  stalled: number;
  /** Of `stalled`, those stalled because the server CLAMPED their recency (a
   *  device clock set forward). A diagnostic subset, not a bucket. */
  clamped: number;
  /** Of `stalled`, those whose recency no completion backs. A diagnostic
   *  subset, not a bucket. */
  uncorroborated: number;
}

function median(samples: readonly number[]): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Per-task throughput, derived from the completion maps alone and never from
 *  the walk — which is what lets the monotonicity invariant actually fail. */
function throughputByTask(units: readonly FlowUnit[], window: FlowWindow): Map<string, number> {
  const counts = new Map<string, number>(window.taskIds.map((taskId) => [taskId, 0]));
  for (const unit of units) {
    for (const taskId of window.taskIds) {
      if (unit.completions.has(taskId)) counts.set(taskId, (counts.get(taskId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * One row per visible unit task.
 *
 * Takes `FlowUnit`, not `NamedFlowUnit` — feed it `anonymousUnits(cohort)`.
 *
 * ── How the median resists one crafted doc ──
 * Each child's pairs are collapsed to that CHILD'S median first; the row's
 * median is then taken across those per-child values. One child with fifty ideas
 * contributes exactly one number, the same as a child with one — so the lever
 * that moved a median from 2 days to 45 is gone, without inventing a weight and
 * without discarding anyone's data. `sampleSize` and `maxSamplesFromOneChild`
 * still report the raw shape, because the fix does not make the caveat useless.
 */
export function computeFlowRows(
  units: readonly FlowUnit[],
  window: FlowWindow,
  nowMs: number,
): FlowRow[] {
  const counts = throughputByTask(units, window);
  const rows: FlowRow[] = window.taskIds.map((taskId) => ({
    taskId,
    predecessorTaskId: window.predecessorByTask.get(taskId) ?? null,
    throughput: counts.get(taskId) ?? 0,
    cycleTimeMedianMs: null,
    medianSuppressed: false,
    sampleSize: 0,
    sampleChildCount: 0,
    maxSamplesFromOneChild: 0,
    droppedSamples: 0,
    active: 0,
    stalled: 0,
    clamped: 0,
    uncorroborated: 0,
  }));
  const rowByTask = new Map<string, FlowRow>(rows.map((row) => [row.taskId, row]));
  // taskId → childIndex → that child's usable pairs.
  const samplesByTask = new Map<string, Map<number, number[]>>(
    rows.map((row) => [row.taskId, new Map<number, number[]>()]),
  );

  for (const unit of units) {
    for (const row of rows) {
      const predecessorId = row.predecessorTaskId;
      if (predecessorId === null) continue; // first task of the sequence: nothing to subtract
      const own = unit.completions.get(row.taskId);
      if (typeof own !== "number") continue; // untimestamped completion, or none
      const predecessorAt = unit.completions.get(predecessorId);
      if (typeof predecessorAt !== "number") continue;
      const elapsed = own - predecessorAt;
      // NEGATIVE is clock skew or an out-of-order save. ZERO is a task and its
      // predecessor stamped at the same instant — an unusable pair, not a
      // zero-duration cycle; admitting it let nine crafted ideas collapse an
      // honest 10-day median to 0. ABOVE THE CAP is a backwards-set clock (see
      // MAX_CYCLE_TIME_MS). All three are dropped and counted, never clamped.
      if (elapsed <= 0 || elapsed > MAX_CYCLE_TIME_MS) {
        row.droppedSamples++;
        continue;
      }
      const byChild = samplesByTask.get(row.taskId);
      if (!byChild) continue;
      const existing = byChild.get(unit.childIndex);
      if (existing) existing.push(elapsed);
      else byChild.set(unit.childIndex, [elapsed]);
    }

    const placement = placeUnit(unit, window, nowMs);
    if (placement.where !== "row") continue;
    const row = rowByTask.get(placement.taskId);
    if (!row) continue;
    if (placement.bucket === "active") {
      row.active++;
      continue;
    }
    row.stalled++;
    if (placement.reason === "clamped") row.clamped++;
    if (placement.reason === "uncorroborated") row.uncorroborated++;
  }

  for (const row of rows) {
    const byChild = samplesByTask.get(row.taskId);
    if (!byChild) continue;
    const perChildMedians: number[] = [];
    for (const childSamples of byChild.values()) {
      row.sampleSize += childSamples.length;
      if (childSamples.length > row.maxSamplesFromOneChild) {
        row.maxSamplesFromOneChild = childSamples.length;
      }
      const childMedian = median(childSamples);
      if (childMedian !== null) perChildMedians.push(childMedian);
    }
    row.sampleChildCount = perChildMedians.length;
    if (perChildMedians.length === 0) continue;
    if (perChildMedians.length < MIN_CHILDREN_PER_MEDIAN) {
      row.medianSuppressed = true;
      continue;
    }
    row.cycleTimeMedianMs = median(perChildMedians);
  }

  return rows;
}

/* ---------------------------------------------------------------- totals */

/**
 * The board's footer numbers, and the one real invariant.
 *
 * `throughputMonotonic` IS the validation. Throughput comes from the completion
 * maps; the WIP columns come from the walk; the two are computed by different
 * code over different evidence, so a mis-placed unit, a broken entry gate or a
 * genuinely out-of-order doc makes throughput RISE along the criterion — a
 * physically impossible row shape (`0 0 1 0 0`) that nothing else surfaces.
 *
 * `active + stalled + before + after === liveUnits` is NOT validation and is
 * deliberately not exposed as a boolean. `placeUnit` is total and single-valued,
 * so it is an identity that holds however wrong the board is; it was verified
 * surviving three attacks that produced materially wrong boards, including a
 * wholesale swap of `active` and `stalled`. The numbers are here because staff
 * read them, not because they check anything.
 */
export interface FlowTotals {
  liveUnits: number;
  active: number;
  stalled: number;
  /** Units gated out of the criterion — they have not reached it. */
  before: number;
  /** Units that have completed every visible task — past this criterion. */
  after: number;
  /** Throughput is non-increasing along the window's task order. */
  throughputMonotonic: boolean;
  /** The first task whose throughput EXCEEDS its predecessor's, or null. */
  firstNonMonotonicTaskId: string | null;
}

/**
 * Derived from `units` alone — no `rows` parameter.
 *
 * It used to take the rows AND re-walk the units, which made every number
 * meaningful only if the caller had built those rows from these same inputs: an
 * unenforceable four-argument consistency contract, in service of a check that
 * could not fail anyway.
 *
 * NOTE FOR UNIT 5: capture `nowMs` ONCE per render and pass the same value here,
 * to `computeFlowRows` and to `drillDown`. Three separate `Date.now()` calls can
 * straddle the 30-day boundary and make the table and the drill-down disagree.
 */
export function computeFlowTotals(
  units: readonly FlowUnit[],
  window: FlowWindow,
  nowMs: number,
): FlowTotals {
  let active = 0;
  let stalled = 0;
  let before = 0;
  let after = 0;
  for (const unit of units) {
    const placement = placeUnit(unit, window, nowMs);
    if (placement.where === "before") before++;
    else if (placement.where === "after") after++;
    else if (placement.bucket === "active") active++;
    else stalled++;
  }

  const counts = throughputByTask(units, window);
  let firstNonMonotonicTaskId: string | null = null;
  for (let index = 1; index < window.taskIds.length; index++) {
    const taskId = window.taskIds[index];
    const previous = counts.get(window.taskIds[index - 1]) ?? 0;
    if ((counts.get(taskId) ?? 0) > previous) {
      firstNonMonotonicTaskId = taskId;
      break;
    }
  }

  return {
    liveUnits: units.length,
    active,
    stalled,
    before,
    after,
    throughputMonotonic: firstNonMonotonicTaskId === null,
    firstNonMonotonicTaskId,
  };
}

/* ------------------------------------------------------------- drill-down */

/**
 * One child in a WIP bucket. Not a bare username list: a child with two ideas on
 * the same task appears ONCE with `units: 2`, so the roster reconciles against
 * the count staff clicked on instead of quietly disagreeing with it.
 */
export interface DrillDownEntry {
  username: string;
  units: number;
}

/**
 * Who is sitting in one bucket on one task.
 *
 * THE ONLY function here that receives usernames. The main board is
 * aggregate-only (owner's hard boundary), and the drill-down covers the ACTIVE
 * and STALLED counts only — never throughput, which is a historical count with
 * no action attached, so naming those children would buy exposure without buying
 * a decision.
 *
 * Sorted by username with a plain code-point comparison — no locale collation,
 * which is environment-dependent. There is no secondary key because there cannot
 * be one: results collapse per username, so each name appears exactly once.
 */
export function drillDown(
  units: readonly NamedFlowUnit[],
  window: FlowWindow,
  taskId: string,
  bucket: FlowBucket,
  nowMs: number,
): DrillDownEntry[] {
  const byUsername = new Map<string, number>();
  for (const unit of units) {
    const placement = placeUnit(unit, window, nowMs);
    if (placement.where !== "row") continue;
    if (placement.taskId !== taskId || placement.bucket !== bucket) continue;
    byUsername.set(unit.username, (byUsername.get(unit.username) ?? 0) + 1);
  }
  return [...byUsername]
    .map(([username, count]) => ({ username, units: count }))
    .sort((a, b) => (a.username < b.username ? -1 : a.username > b.username ? 1 : 0));
}
