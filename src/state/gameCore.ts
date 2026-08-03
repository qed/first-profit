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
 *
 * VOCABULARY: "step" (historical, from the v1 path) === "criterion" (the
 * curriculum brief's term) throughout this module — `stepId` IS a criterion id.
 * The rename is deferred to the Unit 9 cleanup; do not mix a partial rename in.
 */
import { STEPS, stepById, type PhaseId, type RoomId } from "../data/path";
import { SALE_AUTO_COMPLETE_TASK_ID } from "../data/pathHooks";
import { PROVIDER_IDS, computeFee, providerById, type ProviderId } from "../data/providers";
import {
  LEGACY_KEY_REMAP,
  TASK_REMAP,
  resolveTaskId,
  taskIdAt,
  type RemapTarget,
} from "../data/taskRemap";

/**
 * Schema version stored inside every serialized save doc. Bump on shape change.
 *
 * ⚠ CROSS-REPO CONSUMER: the120's fp_public_sites projection trigger
 * (the120 repo, supabase/migrations/20260907120000_fp_public_sites.sql)
 * parses this doc shape server-side — `doc->>'siteHeadline'` and
 * `doc->'ideas'->(activeIdea)->'fields'->>'oneLiner'` — and GATES on
 * `doc->>'docVersion' = '1'` (any other version is skipped, never misparsed).
 * A shape change to those paths, or a DOC_VERSION bump, must update that
 * trigger (and its shared extraction function fp_public_site_content) in the
 * same rollout, or public-site content silently stops refreshing.
 */
export const DOC_VERSION = 1;

/**
 * The full ordered criterion sequence (25 ids, "1.1".."5.5"), derived from the
 * generated content via path.ts's assembly (Unit 6). This RETIRES the old
 * PLAYABLE_STEPS constant: unlock/progress/next-up logic now walks this
 * sequence, phase-aware, per idea. Task counts per criterion are VARIABLE
 * (2.3 has six, 3.4 has four) — always read `step.tasks.length`, never ×5.
 */
export const CRITERION_SEQUENCE: readonly string[] = STEPS.map((s) => s.id);

/** Phases in play order (indices match PHASES' 1-based `index` - 1). */
export const PHASE_ORDER: readonly PhaseId[] = ["sell", "build", "validate", "grow", "scale"];

const CRITERIA_BY_PHASE: ReadonlyMap<PhaseId, readonly string[]> = new Map(
  PHASE_ORDER.map((phase) => [phase, STEPS.filter((s) => s.phase === phase).map((s) => s.id)]),
);

const PHASE_BY_CRITERION: ReadonlyMap<string, PhaseId> = new Map(
  STEPS.map((s) => [s.id, s.phase]),
);

/** The ordered criterion ids of one phase (e.g. 'sell' → ["1.1".."1.5"]). */
export function criterionIdsForPhase(phase: PhaseId): readonly string[] {
  return CRITERIA_BY_PHASE.get(phase) ?? [];
}

/** The phase a criterion belongs to, or undefined for an unknown id. */
export function phaseOfCriterion(stepId: string): PhaseId | undefined {
  return PHASE_BY_CRITERION.get(stepId);
}

/** Maximum parallel product ideas per the handoff multi-idea model. */
export const MAX_IDEAS = 5;

/** taskKey shape mirrors the existing GameContext convention: `${stepId}#${index}`. */
export const taskKey = (stepId: string, index: number): string => `${stepId}#${index}`;

/**
 * The criterion the real-sale auto-complete lives in, derived from the hooks
 * registry's stable task id ("1.2.5" → "1.2"). path.ts's assembly asserts the
 * target id exists AND is the last task of this criterion, so ADD_LEDGER can
 * keep addressing it positionally as `tasks.length - 1`.
 */
const SALE_STEP_ID = SALE_AUTO_COMPLETE_TASK_ID.split(".").slice(0, 2).join(".");

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
  /**
   * Stable idea identity (Unit 7). ADDITIVE OPTIONAL (the doneAt precedent — no
   * DOC_VERSION bump): NEW ideas are minted a caller-stamped crypto UUID via
   * CREATE_IDEA's `ideaId` field (this module stays Math.random()-free), while
   * LEGACY ideas get a DETERMINISTIC id minted on load inside fromSaveDoc
   * (`legacy-idea-{index}`). Determinism there is load-bearing: the rebase-union
   * path (sync.ts unionCompletionMaps) matches businesses to ideas BY ID across
   * tabs/devices, so two tabs independently loading the same legacy doc must
   * mint the SAME id — random minting would fork the identity and orphan a
   * business promoted in the other tab.
   */
  id?: string;
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

/**
 * A promoted business (Unit 7). One idea is PROMOTED into a business to open
 * phases 4-5; a business can be archived (and later unarchived) rather than
 * deleted. `ideaId` ties it back to the idea it grew from. Written by the
 * PROMOTE_IDEA / ARCHIVE_BUSINESS / UNARCHIVE_BUSINESS reducer actions.
 *
 * Phase 4-5 progress BELONGS TO THE BUSINESS (origin R7): `doneByTask` /
 * `doneAtByTask` mirror the Idea stable-id maps but live on the business
 * record, so archiving preserves Grow/Scale progress with the record and a
 * LATER promotion of a different idea starts a fresh record with no
 * inheritance. Grow/Scale tasks never had legacy `${stepId}#${index}` keys
 * (no pre-Unit-7 build could complete them), so only the stable-id maps exist
 * here — there is deliberately no legacy `done` map.
 */
export interface Business {
  id: string;
  ideaId?: string;
  archived?: boolean;
  /**
   * Caller-stamped epoch ms of the LAST archive/unarchive ACTION on this record
   * (stamped by ARCHIVE_BUSINESS / UNARCHIVE_BUSINESS; absent until one runs).
   * The cross-tab union resolves a conflicting `archived` flag by the LARGER
   * archiveStateAt — last-action-wins, deterministic in both merge directions —
   * with local winning only on a tie or when neither side carries a stamp.
   * Skewed-clock caveat: the stamps come from device clocks, so a badly skewed
   * clock can win a conflict it "shouldn't" — accepted, because the archive UI
   * is operated by one owner family and the flag is trivially re-toggled.
   * NOT written by normalization (normalizeBusinesses), which is derived state,
   * not an action.
   */
  archiveStateAt?: number;
  /** Caller-stamped epoch ms of the promotion (module stays Date.now()-free). */
  promotedAt?: number;
  /** Grow/Scale task completion, keyed by STABLE task id ("4.1.2"). */
  doneByTask?: Record<string, boolean>;
  /** Completion timestamps (caller-stamped epoch ms), keyed by stable task id. */
  doneAtByTask?: Record<string, number>;
}

/**
 * Publish-state of the account's public site (real-public-site plan, Unit 4).
 * The server ladder (none|claimed|published|offline — `offline` covers
 * parent-unpublished AND operator-locked without distinguishing them to the
 * child) plus the client-only `unknown`: the read-back has not answered (or
 * failed). The UI renders `unknown` as neutral — never a fake handle, never
 * a false "live".
 */
export type SiteStatus = "none" | "claimed" | "published" | "offline" | "unknown";

/**
 * The account's public-site registry state — the split-storage READ-BACK of
 * The120's `site` self-read endpoint (the registry is a separate store, so it
 * gets an explicit read-back per the split-storage learning). DELIBERATELY NOT
 * part of the SaveDoc (no docVersion change, toSaveDoc/fromSaveDoc never touch
 * it): the registry row is the source of truth and every session re-reads it,
 * so a persisted snapshot could only go stale. Written ONLY by SET_SITE
 * (GameContext's generation-guarded hydrate/room-open fetch and claim/publish
 * handlers); cleared by RESET_SESSION (per-account child data — the
 * in-memory-reducer-state-survives-logout learning).
 */
export interface SiteState {
  /** The claimed handle, or null while none/unknown. */
  handle: string | null;
  status: SiteStatus;
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
  /**
   * Promoted businesses (Unit 7). ADDITIVE OPTIONAL per the house discipline
   * (the chosenProvider/doneAt precedent): absent on every pre-Unit-7
   * state/doc and STAYS absent until PROMOTE_IDEA writes it — no DOC_VERSION
   * bump. activeBusinessExists reads it defensively.
   */
  businesses?: Business[];
  /**
   * Public-site registry state (Unit 4). NOT in the save doc — populated from
   * the authenticated self-read (SET_SITE); see the SiteState doc.
   */
  site: SiteState;
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
    site: { handle: null, status: "unknown" },
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
  /**
   * Promoted businesses (Unit 7). ADDITIVE OPTIONAL: absent on existing
   * docs and stays absent through the round-trip until one exists (the doneAt
   * absent-stays-absent discipline); coerced defensively on load.
   */
  businesses?: Business[];
}

/** Deep-copy one business record (its completion maps must never be aliased). */
function copyBusiness(b: Business): Business {
  return {
    ...b,
    ...(b.doneByTask ? { doneByTask: { ...b.doneByTask } } : {}),
    ...(b.doneAtByTask ? { doneAtByTask: { ...b.doneAtByTask } } : {}),
  };
}

/**
 * Serialize the persistent slice of state. The ledger is deliberately excluded
 * (it lives append-only in fp_ledger, not the JSONB save doc).
 */
export function toSaveDoc(state: GameState): SaveDoc {
  return {
    docVersion: DOC_VERSION,
    ideas: state.ideas.map((idea) => ({
      // Emit the id only when it exists (absent-stays-absent; legacy in-memory
      // ideas without one get a deterministic id on the NEXT load).
      ...(idea.id ? { id: idea.id } : {}),
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
    // Absent-stays-absent (Unit 7): a state that never promoted a business
    // emits a byte-identical doc to before the field existed. Per-business
    // completion maps are deep-copied so the doc never aliases live state.
    ...(state.businesses ? { businesses: state.businesses.map(copyBusiness) } : {}),
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
  // Additive-optional id (Unit 7): kept only when a well-typed string (a
  // missing/malformed one is minted deterministically in fromSaveDoc below).
  // The id leads the literal so a minted and a persisted id serialize with the
  // SAME key order (byte-stability across repeated loads).
  const idea: Idea = {
    ...(typeof value.id === "string" && value.id ? { id: value.id } : {}),
    fields,
    done,
  };
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

// Coerce the persisted businesses list (Unit 7). ADDITIVE OPTIONAL:
// absent (or not an array) stays ABSENT — never invented as []. Each entry
// needs a string id to survive; the optional leaves are kept only when
// well-typed (the coerceIdea leaf-filtering discipline), so a malformed entry
// can neither fail the load nor half-poison the model.
function coerceBusinesses(value: unknown): Business[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const businesses: Business[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== "string") continue;
    const business: Business = { id: entry.id };
    if (typeof entry.ideaId === "string") business.ideaId = entry.ideaId;
    if (typeof entry.archived === "boolean") business.archived = entry.archived;
    // Timestamp leaves follow the chosenAt discipline: finite, non-negative
    // only (NaN would JSON.stringify to null and poison the next load).
    if (
      typeof entry.promotedAt === "number" &&
      Number.isFinite(entry.promotedAt) &&
      entry.promotedAt >= 0
    ) {
      business.promotedAt = entry.promotedAt;
    }
    if (
      typeof entry.archiveStateAt === "number" &&
      Number.isFinite(entry.archiveStateAt) &&
      entry.archiveStateAt >= 0
    ) {
      business.archiveStateAt = entry.archiveStateAt;
    }
    if (isRecord(entry.doneByTask)) {
      const doneByTask: Record<string, boolean> = {};
      for (const [key, leaf] of Object.entries(entry.doneByTask)) {
        if (typeof leaf === "boolean") doneByTask[key] = leaf;
      }
      business.doneByTask = doneByTask;
    }
    if (isRecord(entry.doneAtByTask)) {
      const doneAtByTask: Record<string, number> = {};
      for (const [key, leaf] of Object.entries(entry.doneAtByTask)) {
        if (typeof leaf === "number" && Number.isFinite(leaf) && leaf >= 0) {
          doneAtByTask[key] = leaf;
        }
      }
      business.doneAtByTask = doneAtByTask;
    }
    businesses.push(business);
  }
  return businesses;
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
    ? raw.ideas
        .map(coerceIdea)
        .map((idea) => migrateIdeaProgress(idea, remap))
        // Legacy-id minting (Unit 7): an idea saved before ids existed gets a
        // DETERMINISTIC id derived from its position. Determinism is required
        // (never crypto-random here): two tabs/devices independently loading
        // the same legacy doc must mint IDENTICAL ids, or the rebase-union
        // path would fork the idea's identity and orphan any business promoted
        // from it in the other tab. Idea order is append-only (ideas are never
        // reordered or deleted), so the index is stable. NEW ideas get
        // caller-minted crypto UUIDs via CREATE_IDEA's `ideaId` instead.
        // (Id first, matching coerceIdea's key order, so a minted doc is
        // byte-identical to its own re-load.)
        .map((idea, index) => (idea.id ? idea : { id: `legacy-idea-${index}`, ...idea }))
    : [];
  const activeIdea = typeof raw.activeIdea === "number" ? raw.activeIdea : 0;
  const siteHeadline = typeof raw.siteHeadline === "string" ? raw.siteHeadline : "";
  const onboardingComplete = raw.onboardingComplete === true;
  // Additive-optional field: absent in existing v1 docs -> null, NOT a discard.
  const chosenProvider = coerceChosenProvider(raw.chosenProvider);
  // Additive-optional businesses: absent stays absent. NORMALIZED on every
  // load so the one-active invariant holds even for a doc written before the
  // normalization existed (or hand-edited): see normalizeBusinesses.
  const businesses = coerceBusinesses(raw.businesses);
  return {
    ok: true,
    doc: {
      docVersion: DOC_VERSION,
      ideas,
      activeIdea,
      siteHeadline,
      onboardingComplete,
      chosenProvider,
      ...(businesses ? { businesses: normalizeBusinesses(businesses) } : {}),
    },
  };
}

// ── Business normalization (one-active invariant, derived) ───────────────

/**
 * Enforce the ONE-ACTIVE invariant on a businesses list, deterministically:
 * when more than one business is unarchived (only ever producible by a
 * cross-tab union or a hand-edited doc — the reducer's PROMOTE/UNARCHIVE
 * refusals keep live state at <= 1), the EARLIEST-promoted record stays
 * active (missing promotedAt sorts last; ties break on the smaller id
 * string) and every other active record is marked archived.
 *
 * Normalization is DERIVED state, not an action: it never stamps
 * archiveStateAt, so a later real archive/unarchive still wins the
 * timestamped union cleanly. Pure; returns the input list unchanged
 * (same reference) when the invariant already holds. Applied in
 * fromSaveDoc AND to every unionBusinesses output, so both merge
 * directions converge on the same single active business.
 */
export function normalizeBusinesses(list: Business[]): Business[] {
  const active = list.filter((b) => !b.archived);
  if (active.length <= 1) return list;
  let winner = active[0];
  for (const b of active.slice(1)) {
    const wAt = winner.promotedAt ?? Number.POSITIVE_INFINITY;
    const bAt = b.promotedAt ?? Number.POSITIVE_INFINITY;
    if (bAt < wAt || (bAt === wAt && b.id < winner.id)) winner = b;
  }
  return list.map((b) => (!b.archived && b !== winner ? { ...b, archived: true } : b));
}

// ── Rebase union (cross-tab merge of monotonic state) ────────────────────

/**
 * Union one map: server-only entries are ADDED, both-present conflicts keep the
 * LOCAL value, nothing is ever removed. Absent-stays-absent: when neither side
 * carries the map, none is invented (byte-stable docs stay byte-stable).
 */
function unionMap<T>(
  local: Record<string, T> | undefined,
  server: Record<string, T> | undefined,
): Record<string, T> | undefined {
  if (!server || Object.keys(server).length === 0) return local;
  if (!local) return { ...server };
  return { ...server, ...local }; // spread order: local wins on conflicts
}

/** Union one idea's four completion maps (server → local); everything else local. */
function unionIdeaCompletions(local: Idea, server: Idea): Idea {
  const merged: Idea = { ...local, done: { ...server.done, ...local.done } };
  const doneAt = unionMap(local.doneAt, server.doneAt);
  const doneByTask = unionMap(local.doneByTask, server.doneByTask);
  const doneAtByTask = unionMap(local.doneAtByTask, server.doneAtByTask);
  if (doneAt) merged.doneAt = doneAt;
  if (doneByTask) merged.doneByTask = doneByTask;
  if (doneAtByTask) merged.doneAtByTask = doneAtByTask;
  return merged;
}

/**
 * Union the businesses lists (Unit 7). Businesses are MONOTONIC-ish:
 * - a business present only on the SERVER is KEPT (appended in server order —
 *   a concurrent session promoted it; dropping it would erase a promotion);
 * - matched BY BUSINESS ID, each business's completion maps union exactly like
 *   an idea's (server-only entries added, local wins on conflicts);
 * - `archived` resolves by the LARGER archiveStateAt (last-ACTION-wins, so a
 *   fresh archive beats a stale tab's resident unarchived flag in BOTH merge
 *   directions); local wins only on a tie or when neither side is stamped
 *   (see Business.archiveStateAt for the skewed-clock caveat). The other
 *   scalar leaves stay local (latest intent).
 * - The output is NORMALIZED (normalizeBusinesses) so a union can never
 *   surface two active businesses.
 * Absent-stays-absent: when neither side carries the list, none is invented.
 */
function unionBusinesses(
  local: Business[] | undefined,
  server: Business[] | undefined,
): Business[] | undefined {
  if (!server || server.length === 0) return local ? normalizeBusinesses(local) : local;
  if (!local || local.length === 0) return normalizeBusinesses(server.map(copyBusiness));
  const merged = local.map((lb) => {
    const sb = server.find((b) => b.id === lb.id);
    if (!sb) return lb;
    const out: Business = { ...lb }; // scalar leaves: local wins (latest intent)
    // archived: last-action-wins via archiveStateAt (deterministic both ways).
    const lAt = lb.archiveStateAt;
    const sAt = sb.archiveStateAt;
    if (typeof sAt === "number" && (typeof lAt !== "number" || sAt > lAt)) {
      out.archived = sb.archived ?? false;
      out.archiveStateAt = sAt;
    }
    const doneByTask = unionMap(lb.doneByTask, sb.doneByTask);
    const doneAtByTask = unionMap(lb.doneAtByTask, sb.doneAtByTask);
    if (doneByTask) out.doneByTask = doneByTask;
    if (doneAtByTask) out.doneAtByTask = doneAtByTask;
    return out;
  });
  for (const sb of server) {
    if (!local.some((b) => b.id === sb.id)) merged.push(copyBusiness(sb)); // kept, never dropped
  }
  return normalizeBusinesses(merged);
}

/**
 * The cross-tab merge contract (fix for the concurrent-session clobber), used
 * by BOTH the sync engine's CAS rebase (src/lib/sync.ts flushPending) and the
 * UNION_REMOTE reducer action that feeds a committed rebased doc back into
 * live state: the result is the LOCAL doc with the server doc's MONOTONIC
 * state unioned in — never a raw replacement that would erase what a
 * concurrent session (another tab / another device) did.
 *
 * - Completions (`done`, `doneAt`, `doneByTask`, `doneAtByTask`) are MONOTONIC:
 *   they only ever move toward "more complete", so union is always safe and
 *   lossless. Per idea: server-only entries are added, local wins on
 *   both-present conflicts, nothing is ever removed.
 * - IDEAS MATCH BY ID when both sides carry one (every idea loaded through
 *   fromSaveDoc has an id — minted deterministically for legacy docs). A
 *   same-index pair with DIFFERENT ids is two different ideas created
 *   concurrently: they are NOT fused — the local idea keeps its position and
 *   the unmatched server idea APPENDS at the tail (in server order),
 *   preserving its identity, fields, and completions. An id-LESS local idea
 *   (in-memory legacy, created before ids existed and not yet re-loaded)
 *   falls back to index matching — safe because legacy ids are the
 *   deterministic `legacy-idea-{index}`.
 * - Everything else (`fields` text, `activeIdea`, `siteHeadline`,
 *   `onboardingComplete`, `chosenProvider`) stays LOCAL-authoritative: those are
 *   latest-intent values, not monotonic sets — "merging" free text or a provider
 *   choice has no well-defined union, and the child's most recent edit in the
 *   live tab is the intent to honor. Last-writer-wins is correct there.
 * - BUSINESSES union per `unionBusinesses`: server-only records are kept,
 *   per-business completion maps union like an idea's, `archived` resolves by
 *   archiveStateAt (last action wins), and the output is normalized to one
 *   active business.
 *
 * Pure and exported for direct testing; `serverDoc` is null when the server row
 * was empty/unreadable (nothing to union — local is returned unchanged).
 */
export function unionCompletionMaps(localDoc: SaveDoc, serverDoc: SaveDoc | null): SaveDoc {
  if (!serverDoc) return localDoc;
  // Match ideas by id (index fallback for id-less local legacy ideas).
  const usedServer = new Set<number>();
  const ideas = localDoc.ideas.map((idea, i) => {
    let si = -1;
    if (idea.id) {
      si = serverDoc.ideas.findIndex((s, j) => !usedServer.has(j) && s.id === idea.id);
    } else if (i < serverDoc.ideas.length && !usedServer.has(i)) {
      si = i; // id-less legacy local idea: deterministic index match
    }
    if (si < 0) return idea; // no counterpart: local idea passes through
    usedServer.add(si);
    return unionIdeaCompletions(idea, serverDoc.ideas[si]);
  });
  for (let j = 0; j < serverDoc.ideas.length; j++) {
    if (!usedServer.has(j)) ideas.push(serverDoc.ideas[j]); // appended at tail, never dropped
  }
  const businesses = unionBusinesses(localDoc.businesses, serverDoc.businesses);
  return { ...localDoc, ideas, ...(businesses ? { businesses } : {}) };
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
  // Grow/Scale progress belongs to the BUSINESS (Unit 7; origin R7): read the
  // ACTIVE business's stable-id map — never an idea's — and NOTHING is done
  // when no active business exists (an archived business keeps its maps, but
  // they are unreadable until unarchived). SCOPED TO THE PROMOTED IDEA: the
  // business's progress is only readable through the idea it grew from — a
  // second Validate-complete idea reads nothing from it. No legacy fallback:
  // grow/scale tasks never had `${stepId}#${index}` keys.
  const taskPhase = PHASE_BY_CRITERION.get(stepId);
  if (taskPhase === "grow" || taskPhase === "scale") {
    const business = activeBusiness(state);
    if (!business || business.ideaId !== state.ideas[ideaIndex].id) return false;
    const businessTaskId = taskIdAt(stepId, index);
    return Boolean(businessTaskId && business.doneByTask?.[resolveTaskId(businessTaskId)]);
  }
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

/**
 * The single ACTIVE (non-archived) business, or null. At most one business is
 * ever unarchived: the reducer's PROMOTE/UNARCHIVE refusals hold the invariant
 * in live state, and normalizeBusinesses re-establishes it on every load and
 * every cross-tab union (earliest promotedAt wins, id tiebreak) — so the
 * `find` here is over a list that genuinely contains at most one active record.
 */
export function activeBusiness(state: GameState): Business | null {
  return state.businesses?.find((b) => !b.archived) ?? null;
}

/**
 * The business promoted from `ideaId`, or undefined. A re-promotion after an
 * archive creates a NEW record for the same idea, so the CURRENT record is the
 * LATEST-promoted match — resolved by the LARGEST promotedAt (not list order,
 * which a cross-tab union can reshuffle by appending server-only records at
 * the tail; a missing promotedAt sorts earliest, ties keep the later list
 * entry). Earlier matches are the archived history.
 */
export function businessFor(state: GameState, ideaId: string): Business | undefined {
  let current: Business | undefined;
  for (const b of state.businesses ?? []) {
    if (b.ideaId !== ideaId) continue;
    if (!current || (b.promotedAt ?? -1) >= (current.promotedAt ?? -1)) current = b;
  }
  return current;
}

/**
 * Whether ANY active (non-archived) business exists — the account-level half
 * of the Grow/Scale gate (written by PROMOTE_IDEA / UNARCHIVE_BUSINESS). The
 * per-idea half (the queried idea must BE the promoted one) lives in
 * isPhaseUnlocked. The read is defensive: an absent list is "no business".
 */
export function activeBusinessExists(state: GameState): boolean {
  return activeBusiness(state) !== null;
}

/** Whether every criterion of a phase is complete for an idea. */
export function isPhaseComplete(state: GameState, ideaIndex: number, phase: PhaseId): boolean {
  const ids = criterionIdsForPhase(phase);
  return ids.length > 0 && ids.every((id) => isCriterionDone(state, ideaIndex, id));
}

/**
 * Phase unlock per idea (Unit 6 rules):
 *  - phase 1 (sell) is open for any existing idea;
 *  - phases 2 and 3 unlock for an idea when THAT idea completed every
 *    criterion of the previous phase;
 *  - phases 4-5 additionally gate on the active business AND on the QUERIED
 *    idea being the one it was promoted from (`business.ideaId`): a second
 *    Validate-complete idea stays locked out of Grow/Scale until it is itself
 *    promoted (after the current business is archived).
 */
export function isPhaseUnlocked(state: GameState, ideaIndex: number, phase: PhaseId): boolean {
  if (!hasIdea(state, ideaIndex)) return false;
  const pos = PHASE_ORDER.indexOf(phase);
  if (pos < 0) return false;
  if (phase === "grow" || phase === "scale") {
    const business = activeBusiness(state);
    if (!business || business.ideaId !== state.ideas[ideaIndex].id) return false;
  }
  if (pos === 0) return true;
  return isPhaseComplete(state, ideaIndex, PHASE_ORDER[pos - 1]);
}

/**
 * The first incomplete criterion of the full sequence for an idea — the idea's
 * frontier — or null when every criterion is done. Pure position, no locking.
 */
function frontierFor(state: GameState, ideaIndex: number): string | null {
  for (const stepId of CRITERION_SEQUENCE) {
    if (!isCriterionDone(state, ideaIndex, stepId)) return stepId;
  }
  return null;
}

/**
 * The next criterion an idea can actually WORK: its frontier when that
 * frontier's phase is unlocked, else null (the frontier sits behind the
 * business gate — e.g. 4.1 after 3.5 with no business promoted yet, which is
 * the promotion seam floorSelectors surfaces). Null also once all 25 are done.
 */
export function nextUpFor(state: GameState, ideaIndex: number): string | null {
  if (!hasIdea(state, ideaIndex)) return null;
  const frontier = frontierFor(state, ideaIndex);
  if (!frontier) return null;
  return isStepUnlocked(state, ideaIndex, frontier) ? frontier : null;
}

/** Per-idea task progress across ONE phase (task counts from the content). */
export function phaseProgress(
  state: GameState,
  ideaIndex: number,
  phase: PhaseId,
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const stepId of criterionIdsForPhase(phase)) {
    const step = stepById(stepId);
    if (!step) continue;
    total += step.tasks.length;
    done += step.tasks.filter((_, i) => isTaskDone(state, ideaIndex, stepId, i)).length;
  }
  return { done, total };
}

/**
 * Total XP an idea has earned: the sum of `xp` (path.ts STEP_META) over every
 * criterion the idea has completed across the full sequence.
 */
export function xpFor(state: GameState, ideaIndex: number): number {
  if (!hasIdea(state, ideaIndex)) return 0;
  return STEPS.reduce(
    (sum, step) => (isCriterionDone(state, ideaIndex, step.id) ? sum + step.xp : sum),
    0,
  );
}

/** Total XP across every idea (the account's XP). */
export function totalXp(state: GameState): number {
  return state.ideas.reduce((sum, _idea, i) => sum + xpFor(state, i), 0);
}

/**
 * Sequential criterion unlock, phase-aware (Unit 6): the criterion's PHASE must
 * be unlocked for the idea (see isPhaseUnlocked — phases 4-5 gate on the
 * promoted business), and criteria unlock linearly WITHIN the phase (the previous
 * criterion complete; the phase's first criterion rides the phase gate alone).
 * Distinct from eligibility, which also requires this one NOT done.
 */
export function isStepUnlocked(state: GameState, ideaIndex: number, stepId: string): boolean {
  const phase = PHASE_BY_CRITERION.get(stepId);
  if (!phase || !hasIdea(state, ideaIndex)) return false;
  if (!isPhaseUnlocked(state, ideaIndex, phase)) return false;
  const ids = criterionIdsForPhase(phase);
  const pos = ids.indexOf(stepId);
  if (pos <= 0) return pos === 0;
  return isCriterionDone(state, ideaIndex, ids[pos - 1]);
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
  /**
   * `ideaId` is the CALLER-minted stable identity for the new idea (crypto
   * UUID at the GameContext boundary — this module stays Math.random()-free,
   * the chosenAt/at precedent). Optional so legacy callers/tests stay valid;
   * an idea created without one gets a deterministic id on the next load.
   */
  | { type: "CREATE_IDEA"; ideaId?: string }
  | { type: "SET_ACTIVE_IDEA"; ideaIndex: number }
  | { type: "SET_FIELD"; ideaIndex: number; key: string; value: string }
  /**
   * `at` is the caller-stamped completion time (epoch ms) — this module stays
   * Date.now()-free (the chosenAt precedent). Optional so stale/legacy callers
   * remain valid; without it the task completes with no doneAt entry.
   *
   * LOCK ENFORCEMENT IS SELECTOR-LAYER BY DESIGN: this action does NOT check
   * isStepUnlocked — a direct dispatch can complete a task in a locked phase.
   * Dispatch is app-internal (every UI path routes through the selectors,
   * which gate on unlock/eligibility), and both the load migration and the
   * test suite depend on free writes to construct arbitrary progress. Do not
   * add an unlock guard here.
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
  /**
   * Promote a phase-3-complete idea to THE business (origin R7: an explicit
   * moment, one active business at a time). `businessId` and `at` are
   * caller-stamped (crypto UUID / Date.now at the GameContext boundary).
   * REFUSED (state unchanged) unless the idea exists, completed every
   * Validate criterion, no unarchived business exists, and the businessId is
   * unused. A promotion after an archive creates a NEW record — Grow/Scale
   * progress is never inherited across promotions (origin decision).
   */
  | { type: "PROMOTE_IDEA"; ideaId: string; businessId: string; at: number }
  /**
   * Archive the business (kept, never deleted; its 4-5 progress rides along).
   * `at` is the caller-stamped action time (epoch ms, the chosenAt precedent),
   * recorded as `archiveStateAt` so the cross-tab union can resolve archived
   * conflicts last-action-wins. Optional so legacy dispatchers stay valid —
   * without it the flag flips with no stamp (local-wins union semantics).
   */
  | { type: "ARCHIVE_BUSINESS"; businessId: string; at?: number }
  /** Restore an archived business — refused while another business is active.
   *  `at` stamps `archiveStateAt` exactly like ARCHIVE_BUSINESS. */
  | { type: "UNARCHIVE_BUSINESS"; businessId: string; at?: number }
  | { type: "SET_PROVIDER"; providerId: ProviderId; chosenAt: number }
  /**
   * Adopt the public-site registry read-back (Unit 4) into the site slice.
   * The ONLY writer of `state.site`. Dispatched exclusively from GameContext's
   * generation-guarded async handlers (hydrate/room-open fetch, claim,
   * publish) — a stale-generation response is discarded there and never
   * reaches this action. Not persisted (see SiteState).
   */
  | { type: "SET_SITE"; handle: string | null; status: SiteStatus }
  | { type: "RESET_SESSION" }
  /**
   * Feed a committed CAS-rebased (merged) save doc back into live state so
   * tabs converge instead of split-braining (sync engine onRebasedDoc →
   * GameContext). Unions ONLY the doc's MONOTONIC state (completions,
   * businesses, appended ideas) via unionCompletionMaps; latest-intent fields
   * and all UI state are untouched — like the load migration, it MARKS state
   * only and can never close the runner or fire a celebration.
   */
  | { type: "UNION_REMOTE"; doc: SaveDoc }
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

  // Grow/Scale completion writes the ACTIVE business's maps (Unit 7; origin
  // R7) — never an idea's. With no active business there is nothing to write
  // (the phase is gated anyway), and the write is SCOPED TO THE PROMOTED IDEA:
  // an action addressed through a different idea (e.g. a second Validate-
  // complete idea) is a no-op rather than crediting the business. Stable ids
  // only, no legacy key is ever minted for a business task.
  const phase = PHASE_BY_CRITERION.get(stepId);
  if (phase === "grow" || phase === "scale") {
    const business = activeBusiness(state);
    const rawId = taskIdAt(stepId, index);
    const businessTaskId = rawId ? resolveTaskId(rawId) : undefined;
    if (!business || !businessTaskId) return state;
    if (business.ideaId !== state.ideas[ideaIndex].id) return state;
    const businesses = (state.businesses ?? []).map((b) =>
      b.id === business.id
        ? {
            ...b,
            doneByTask: { ...(b.doneByTask ?? {}), [businessTaskId]: true },
            ...(stampValid
              ? { doneAtByTask: { ...(b.doneAtByTask ?? {}), [businessTaskId]: at } }
              : {}),
          }
        : b,
    );
    return withCelebration({ ...state, businesses }, ideaIndex, stepId, wasCriterionDone);
  }

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
  return withCelebration({ ...state, ideas }, ideaIndex, stepId, wasCriterionDone);
}

/**
 * Shared criterion-completion tail of markTaskDone (idea and business writes):
 * if the write just completed the criterion, fire the celebration and advance
 * the runner to the next playable criterion.
 */
function withCelebration(
  next: GameState,
  ideaIndex: number,
  stepId: string,
  wasCriterionDone: boolean,
): GameState {
  if (wasCriterionDone || !isCriterionDone(next, ideaIndex, stepId)) return next;
  const advanced = nextUpFor(next, ideaIndex);
  return {
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
      // The caller-minted stable id rides in when supplied (absent-stays-absent
      // for legacy dispatchers; see the Idea.id doc).
      const ideas = [
        ...state.ideas,
        { ...(action.ideaId ? { id: action.ideaId } : {}), fields: {}, done: {} },
      ];
      return {
        ...state,
        ideas,
        activeIdea: ideas.length - 1,
        runnerOpen: true,
        runnerStep: CRITERION_SEQUENCE[0],
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
      const stepId = action.stepId ?? nextUpFor(state, state.activeIdea) ?? CRITERION_SEQUENCE[0];
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
        // A REAL logged sale auto-completes the sale target task — addressed by
        // STABLE ID through the hooks registry (SALE_AUTO_COMPLETE_TASK_ID,
        // "1.2.5"; path.ts's assembly asserts it is the LAST task of its
        // criterion, so `tasks.length - 1` below is that exact task and the
        // dual-write lands both `1.2#4` and doneByTask["1.2.5"]) — for the
        // active idea, but only when its criterion is unlocked for it (1.1
        // complete). A stray sale event before then must not light the final
        // pip while earlier pips are dark. The `mock` opt-out lets the cosmetic
        // Checkout Booth overlay log a ledger/HUD row (preserving pre-Unit-3
        // behavior) WITHOUT completing the real first sale or firing the
        // first-sale celebration; the real sale path (Sales Room / booth
        // log-a-sale) omits `mock` and completes.
        const saleStep = stepById(SALE_STEP_ID);
        if (
          saleStep &&
          hasIdea(next, next.activeIdea) &&
          isStepUnlocked(next, next.activeIdea, SALE_STEP_ID)
        ) {
          // Stamp the auto-completion from the row's caller-stamped createdAt
          // (the module stays Date.now()-free); an unparseable timestamp just
          // completes without a doneAt entry.
          const at = Date.parse(action.createdAt);
          next = markTaskDone(
            next,
            next.activeIdea,
            SALE_STEP_ID,
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

    case "PROMOTE_IDEA": {
      // REFUSALS (state unchanged, never a throw): unknown idea, idea not
      // through Validate, an active business already exists (archive first),
      // or a replayed/duplicate businessId.
      const ideaIndex = state.ideas.findIndex((idea) => idea.id === action.ideaId);
      if (ideaIndex < 0) return state;
      if (!isPhaseComplete(state, ideaIndex, "validate")) return state;
      if (activeBusinessExists(state)) return state;
      if (state.businesses?.some((b) => b.id === action.businessId)) return state;
      const stampValid =
        typeof action.at === "number" && Number.isFinite(action.at) && action.at >= 0;
      // A NEW record every time (origin decision: no progress inheritance
      // across promotions — an unarchived business resumes its OWN maps, but a
      // fresh promotion starts empty).
      const business: Business = {
        id: action.businessId,
        ideaId: action.ideaId,
        archived: false,
        ...(stampValid ? { promotedAt: action.at } : {}),
      };
      return { ...state, businesses: [...(state.businesses ?? []), business] };
    }

    case "ARCHIVE_BUSINESS": {
      // Archive keeps the record AND its Grow/Scale maps (weeks of progress
      // must never be a one-way door — UNARCHIVE_BUSINESS restores both).
      // A valid caller stamp becomes archiveStateAt (last-action-wins union).
      const target = state.businesses?.find((b) => b.id === action.businessId);
      if (!target || target.archived) return state;
      const stampValid =
        typeof action.at === "number" && Number.isFinite(action.at) && action.at >= 0;
      return {
        ...state,
        businesses: state.businesses!.map((b) =>
          b.id === action.businessId
            ? { ...b, archived: true, ...(stampValid ? { archiveStateAt: action.at } : {}) }
            : b,
        ),
      };
    }

    case "UNARCHIVE_BUSINESS": {
      // Refused while ANY business is active (the one-active invariant): the
      // child archives the current business first, then unarchives.
      const target = state.businesses?.find((b) => b.id === action.businessId);
      if (!target || !target.archived) return state;
      if (activeBusinessExists(state)) return state;
      const stampValid =
        typeof action.at === "number" && Number.isFinite(action.at) && action.at >= 0;
      return {
        ...state,
        businesses: state.businesses!.map((b) =>
          b.id === action.businessId
            ? { ...b, archived: false, ...(stampValid ? { archiveStateAt: action.at } : {}) }
            : b,
        ),
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

    case "SET_SITE":
      return { ...state, site: { handle: action.handle, status: action.status } };

    case "RESET_SESSION": {
      // Clear all per-account business/financial + UI state so no previous
      // child's ideas/ledger can leak into the next session on a shared device.
      // The `site` slice (Unit 4) rides `initialState()` here too — a previous
      // child's handle/publish state must never survive a session boundary
      // (in-memory-reducer-state-survives-logout learning); the next session's
      // hydrate re-reads it from the registry.
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

    case "UNION_REMOTE": {
      // Union a committed rebased doc's MONOTONIC state into live state (see
      // the Action doc). Latest-intent leaves (fields text, activeIdea,
      // chosenProvider, siteHeadline) and every UI flag (runner, celebrate,
      // room, stage) are DELIBERATELY untouched: unionCompletionMaps keeps
      // local fields on matched ideas, and only `ideas`/`businesses` are
      // written back here. Like the load migration this MARKS state only —
      // it can never close the runner, move it, or fire a celebration.
      const merged = unionCompletionMaps(toSaveDoc(state), action.doc);
      return {
        ...state,
        // Deep-copy every map so live state never aliases the engine's doc.
        ideas: merged.ideas.map((idea) => ({
          ...(idea.id ? { id: idea.id } : {}),
          fields: { ...idea.fields },
          done: { ...idea.done },
          ...(idea.doneAt ? { doneAt: { ...idea.doneAt } } : {}),
          ...(idea.doneByTask ? { doneByTask: { ...idea.doneByTask } } : {}),
          ...(idea.doneAtByTask ? { doneAtByTask: { ...idea.doneAtByTask } } : {}),
        })),
        ...(merged.businesses ? { businesses: merged.businesses.map(copyBusiness) } : {}),
      };
    }

    case "HYDRATE": {
      const { doc } = action;
      // NOTE: `site` (Unit 4) is DELIBERATELY untouched here — it is not part
      // of the save doc; its source of truth is the registry self-read, which
      // GameContext fetches alongside hydrate and adopts via SET_SITE. Every
      // hydrate follows a RESET_SESSION (login) or fresh boot state, so no
      // stale slice can ride through this spread.
      return {
        ...state,
        ideas: doc.ideas.map((idea) => ({
          // Stable idea identity (Unit 7): fromSaveDoc guarantees one on every
          // loaded idea (minted deterministically when legacy).
          ...(idea.id ? { id: idea.id } : {}),
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
        // Businesses (Unit 7), sourced per the split-storage learning:
        // HYDRATE must reset every persisted slice — a doc without the field
        // clears any resident list (undefined), absent-stays-absent. Deep copy
        // so the doc's per-business maps are never aliased into live state.
        businesses: doc.businesses?.map(copyBusiness),
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
