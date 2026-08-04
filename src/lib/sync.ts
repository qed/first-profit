/**
 * Server sync layer (Unit 6).
 *
 * A write-through, async persistence layer over the lazy Supabase singleton.
 * The reducer/UI stays optimistic and instant; nothing here ever blocks a
 * render. Progress is persisted as a snapshot document guarded by a
 * compare-and-swap on `revision`, plus an append-only ledger, with a resilient
 * localStorage outbox for anything that could not be sent immediately.
 *
 * Design anchors (plan "Key Technical Decisions"):
 *  - CAS revision guard with ZERO-ROW detection. PostgREST returns HTTP 200 with
 *    an EMPTY array (no error object) when an UPDATE matches no rows, so a stale
 *    base revision is detected by returned-row-count === 0, NEVER by an error.
 *    A zero-row result means "refetch + rebase", never "clobber".
 *  - 23505-as-success. A duplicate-id ledger insert (a replayed outbox entry
 *    whose row already landed) surfaces PostgREST code '23505' — classified as
 *    SUCCESS and resolved, never retried forever.
 *  - keepalive flush. On pagehide/visibility-hidden the pending write is flushed
 *    with `fetch(..., { keepalive: true })`. This bypasses supabase-js, so the
 *    `apikey` + `Authorization: Bearer <token>` headers are attached manually. A
 *    keepalive body over ~64KiB is rejected by the browser, so an oversized
 *    snapshot is parked in the outbox instead (the small ledger delta still
 *    rides keepalive).
 *  - docVersion / `v`. The save doc carries `docVersion`; every outbox entry
 *    carries a schema version `v`. Unknown versions are DISCARDED at load/replay,
 *    never fed to a newer reducer/writer.
 *  - Terminal vs retryable. A check-constraint or trigger violation (doc size
 *    cap, revision-monotonicity trigger) recurs identically on every replay, so
 *    it is TERMINAL: parked without replay + a persistent "couldn't save"
 *    signal, never an infinite retry loop. A network error or an expired-session
 *    RLS refusal is RETRYABLE: parked in the outbox and replayed.
 *
 * Date.now()/crypto.randomUUID stay at the CALLER boundary — ledger ids and
 * timestamps are minted by the reducer's dispatcher and passed in.
 */
import { getConfig } from "../config";
import { getSupabase } from "./supabase";
import {
  fromSaveDoc,
  unionCompletionMaps,
  DOC_VERSION,
  type SaveDoc,
  type LedgerEntry,
} from "../state/gameCore";

// Re-exported so existing consumers/tests keep importing the union from here;
// it LIVES in gameCore now so the UNION_REMOTE reducer action can share it
// without a sync→gameCore→sync import cycle.
export { unionCompletionMaps };
import { getDraft, setDraft } from "./draftCache";

// ── Shared types ───────────────────────────────────────────────────────────

/**
 * The columns a client is permitted to insert into fp_ledger (source is pinned).
 * `amountCents` stays = gross for back-compat; the per-sale fee snapshot
 * (`grossCents`/`feeCents`/`netCents`/`providerId`) is optional so a caller that
 * has not computed a fee yet (or a legacy-shaped row) still inserts coherently —
 * insertLedger defaults a missing gross/net to amountCents and fee to 0.
 * The 'backing' concept is retired at the ledger boundary: the runtime
 * validators (loadLedger + isValidLedgerRow) accept only 'sale'. The `kind` type
 * stays a union for source-compatibility with the in-memory `LedgerKind` (which
 * Unit 3 finalizes); a 'backing' value never survives the validators.
 */
export interface LedgerInsertRow {
  id: string;
  kind: "sale" | "backing";
  payer: string;
  amountCents: number;
  grossCents?: number;
  feeCents?: number;
  netCents?: number;
  providerId?: string | null;
}

// ── Feedback ("Stuck? Tell us", fp_task_feedback) ───────────────────────────

/** The grade band stamped on a feedback row (DB CHECK mirror). */
export type FeedbackBand = "g3_5" | "g6_8" | "g9_12" | "unknown";

export const FEEDBACK_BANDS: readonly FeedbackBand[] = ["g3_5", "g6_8", "g9_12", "unknown"];

/**
 * Client-side mirrors of the fp_task_feedback CHECKs — a row must satisfy these
 * BEFORE enqueue so a terminal DB refusal is unreachable in normal use. The
 * task-id regex EQUALS the DB CHECK (`^[0-9]+(\.[0-9]+){2}$`, <= 16 chars); the
 * producer (the synthesized `${stepId}.${index + 1}` id) stays a subset of it.
 */
export const FEEDBACK_TASK_ID_RE = /^[0-9]+(\.[0-9]+){2}$/;
export const FEEDBACK_TASK_ID_MAX = 16;
export const FEEDBACK_BODY_MAX = 1000;

/**
 * What a feedback row is ABOUT (Change #9). FP-side mirror of The120's
 * fp-task-feedback-rules kind vocabulary (byte-for-byte): 'task' = the original
 * "More tools please" report about the unit task the child is on; 'app' = the
 * floor-level "Improve First Profit" suggestion about the product as a whole.
 */
export type FeedbackKind = "task" | "app";

export const FEEDBACK_KINDS: readonly FeedbackKind[] = ["task", "app"];

/**
 * Local mirror of the DB's per-profile daily-cap trigger (50 rows/UTC day).
 * The trigger's refusal is a P0001 raise — TERMINAL, a silent drop — so the
 * client refuses the 51st submission itself and the trigger stays unreachable.
 */
export const FEEDBACK_DAILY_CAP = 50;

/**
 * The custom SQLSTATE the DB's daily-cap trigger raises (mirrors The120's
 * fp-task-feedback-rules.ts FEEDBACK_CAP_ERRCODE, byte-for-byte). Client
 * contract (migration "CLIENT CONTRACT NOTES"): FP429 = capped → the child sees
 * the honest capped message; the entry is REMOVED from the outbox (replaying it
 * would raise identically for the rest of the UTC day) — never parked, never
 * silently dropped, never claimed as saved.
 */
export const FEEDBACK_CAP_ERRCODE = "FP429";

/**
 * The columns a child may insert into fp_task_feedback. `created_at` is
 * DELIBERATELY absent: the column-scoped INSERT grant excludes it (server-set
 * default), so sending it would fail the entire insert.
 */
export interface FeedbackInsertRow {
  id: string;
  taskId: string;
  band: FeedbackBand;
  /** Empty string allowed — a tap with no words is valid "I'm stuck" signal. */
  body: string;
  /**
   * OPTIONAL, default 'task' (Change #9): absent on every pre-#9 row (incl.
   * queued outbox entries from older builds) and on every task-kind submission
   * — the wire payload OMITS the column for 'task' so the existing write path
   * stays byte-identical and the DB default covers it. Only the app-kind
   * "Improve First Profit" modal stamps 'app'.
   */
  kind?: FeedbackKind;
}

/**
 * A failed FEEDBACK write. The ledger's WriteFailure plus the distinct 'capped'
 * outcome for the daily-cap trigger's FP429 raise — capped is neither terminal
 * (the child must SEE it, not have it silently dropped) nor retryable (a replay
 * raises identically for the rest of the UTC day).
 */
export type FeedbackWriteFailure =
  | WriteFailure
  | { ok: false; reason: "capped"; error: unknown };

export type FeedbackResult = { ok: true } | FeedbackWriteFailure;

/** Minimal shape of a PostgREST / supabase-js error. */
interface PgError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

/** A failed write, classified for the caller's replay/park decision. */
export type WriteFailure =
  | { ok: false; reason: "retryable"; needsReauth: boolean; error: unknown }
  | { ok: false; reason: "terminal"; error: unknown };

export type SaveResult =
  | { ok: true; revision: number }
  | { ok: false; reason: "cas-rejected" }
  | WriteFailure;

export type LedgerResult = { ok: true } | WriteFailure;

/** Status the UI (HUD) can read: idle → saving → saved, or pending/error. */
export type SyncStatus = "idle" | "saving" | "saved" | "pending" | "error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ── Error classification ─────────────────────────────────────────────────────

/**
 * Postgres SQLSTATEs (or PostgREST codes) that recur identically on every
 * replay — a check-constraint violation (doc size cap), a not-null/fk/length
 * violation, or a `raise exception` from one of our guard triggers (P0001, e.g.
 * the revision-monotonicity trigger). Retrying these is a guaranteed storm.
 */
const TERMINAL_CODES = new Set(["22001", "22003", "23502", "23503", "23514", "P0001"]);

/**
 * Missing-column errors, which are TRANSIENT-by-deploy, not structural. If the
 * FP build that names gross_cents/fee_cents/net_cents/provider_id deploys BEFORE
 * the T120 migration applies — or during the brief PostgREST schema-cache reload
 * window right after apply — the insert fails with `PGRST204` ("could not find
 * the 'gross_cents' column in the schema cache") or the Postgres `42703`
 * (undefined_column). Unlike a check-constraint violation, this clears itself
 * the moment the columns + a schema reload are live, so it MUST be RETRYABLE
 * (park in the outbox and replay) — never terminal. Classifying it terminal
 * would DROP a child's real sale on a mis-ordered deploy (silent sale loss).
 */
const MISSING_COLUMN_CODES = new Set(["PGRST204", "42703"]);

/**
 * Missing-TABLE errors — transient-by-deploy exactly like a missing column. If
 * the FP build that writes fp_task_feedback deploys before the T120 migration
 * applies (or during the PostgREST schema-cache reload window), the insert fails
 * with `PGRST205` ("could not find the table ... in the schema cache") or the
 * Postgres `42P01` (undefined_table). These MUST be RETRYABLE for the feedback
 * kind — classifying them terminal would silently DROP every stuck report sent
 * before the table lands. Scoped to the feedback classifier only: fp_ledger has
 * existed since Slice A, so ledger keeps its stricter default-terminal posture.
 */
const MISSING_TABLE_CODES = new Set(["PGRST205", "42P01"]);

/** Unique-violation — for the ledger PK this means "already landed": success. */
const DUPLICATE_CODE = "23505";

/**
 * Query-canceled (`57014`) — the server killed the statement mid-flight (a
 * statement_timeout or a pooler cancel), which says nothing structural about
 * the write: the identical replay normally succeeds once the load spike or
 * timeout window passes. It MUST be RETRYABLE (park in the outbox and replay)
 * — the unknown-code terminal default below would silently discard the
 * pending snapshot on a transient timeout.
 */
const QUERY_CANCELED_CODE = "57014";

function pgCode(error: unknown): string {
  if (isRecord(error) && typeof error.code === "string") return error.code;
  return "";
}

/**
 * An expired/invalid session surfaces as a PostgREST JWT error (`PGRST3xx`) or a
 * bare RLS refusal (`42501`). These are retryable — the write should park and
 * the app should surface a re-login — NOT terminal.
 */
function isAuthError(code: string): boolean {
  return code === "42501" || code.startsWith("PGRST3");
}

/**
 * Classify a real error object (never a zero-row CAS result — that is detected
 * by row count, not by an error). A thrown network error has no `code` and
 * classifies as plain retryable.
 */
export function classifyWriteError(error: unknown): WriteFailure {
  const code = pgCode(error);
  if (isAuthError(code)) return { ok: false, reason: "retryable", needsReauth: true, error };
  // A missing-column error means the columns / schema-cache reload are not live
  // YET (premature deploy or the post-apply reload window). It clears itself once
  // they are, so PARK + replay — do NOT drop the sale. Checked BEFORE the unknown
  // -code terminal default below.
  if (MISSING_COLUMN_CODES.has(code)) return { ok: false, reason: "retryable", needsReauth: false, error };
  // A statement-timeout cancellation is transient-by-load, not structural —
  // park + replay, never drop. Checked BEFORE the unknown-code terminal
  // default below.
  if (code === QUERY_CANCELED_CODE) return { ok: false, reason: "retryable", needsReauth: false, error };
  if (TERMINAL_CODES.has(code)) return { ok: false, reason: "terminal", error };
  // No code at all → a thrown network/offline error (fetch reject, timeout):
  // genuinely transient, so retryable.
  if (code === "") return { ok: false, reason: "retryable", needsReauth: false, error };
  // A DB error carrying a code we do NOT recognize recurs identically on every
  // replay just like a listed check-constraint violation would. Defaulting it to
  // retryable would wedge the entire outbox behind one poison entry forever
  // (replayOutbox keeps a retryable entry FIRST and stops the drain). Default an
  // unknown DB code to TERMINAL so a single malformed write cannot jam the queue.
  return { ok: false, reason: "terminal", error };
}

/**
 * Feedback-kind classification: the ledger rules PLUS
 *  - FP429 (the daily-cap trigger) as the distinct 'capped' outcome, and
 *  - 23503 (FK violation on profile_id) as retryable, and
 *  - the missing-table codes as retryable (separate deploy lane; see
 *    MISSING_TABLE_CODES).
 */
export function classifyFeedbackWriteError(error: unknown): FeedbackWriteFailure {
  const code = pgCode(error);
  // The DB's daily-cap trigger refused (server contract: FP429 = capped). A
  // distinct outcome so it can neither park (it recurs all day) nor fall into
  // the terminal silent-drop path — the child must see the capped message.
  if (code === FEEDBACK_CAP_ERRCODE) {
    return { ok: false, reason: "capped", error };
  }
  // 23503: the profile row does not exist YET — a brand-new child's first tap
  // can race the service-role profile provisioning (migration CLIENT CONTRACT
  // NOTES). That timing gap is transient, so PARK + replay once the profile
  // exists. FEEDBACK ONLY: the ledger's classifier keeps 23503 terminal
  // (pre-existing behavior, out of this unit's scope) — do not move this into
  // classifyWriteError.
  if (code === "23503") {
    return { ok: false, reason: "retryable", needsReauth: false, error };
  }
  if (MISSING_TABLE_CODES.has(code)) {
    return { ok: false, reason: "retryable", needsReauth: false, error };
  }
  return classifyWriteError(error);
}

/**
 * Collapse a ledger insert result into the one decision both the immediate-write
 * path (persistLedger) and the outbox drain (replayOutbox) share:
 *  - `sent`  → landed (or already-landed via 23505); resolve/drop from the queue.
 *  - `drop`  → a structural rejection that recurs identically; drop it, no storm.
 *  - `keep`  → retryable (network / expired session); keep queued for replay.
 */
export type LedgerDecision = "sent" | "drop" | "keep";

export function classifyLedgerOutcome(
  result: LedgerResult,
): { decision: LedgerDecision; needsReauth: boolean } {
  if (result.ok) return { decision: "sent", needsReauth: false };
  if (result.reason === "terminal") return { decision: "drop", needsReauth: false };
  return { decision: "keep", needsReauth: result.needsReauth };
}

/**
 * Decision collapse for a feedback insert: the ledger's sent / drop / keep
 * plus 'capped' — remove from the queue AND show the child the capped copy
 * (never a silent drop, never a park).
 */
export type FeedbackDecision = LedgerDecision | "capped";

export function classifyFeedbackOutcome(
  result: FeedbackResult,
): { decision: FeedbackDecision; needsReauth: boolean } {
  if (result.ok) return { decision: "sent", needsReauth: false };
  if (result.reason === "capped") return { decision: "capped", needsReauth: false };
  if (result.reason === "terminal") return { decision: "drop", needsReauth: false };
  return { decision: "keep", needsReauth: result.needsReauth };
}

// ── Profile id resolution (RLS "own row") ────────────────────────────────────

let cachedProfileId: string | null = null;

/** Drop the cached profile id (on logout / user switch). */
export function resetProfileIdCache(): void {
  cachedProfileId = null;
}

/**
 * The caller's own profile id. `select id from fp_player_profiles` returns only
 * the caller's row via the "own row" RLS policy, so no explicit filter is
 * needed to scope it — but the row is unique per user, so `maybeSingle` is safe.
 * Cached for the session.
 */
export async function resolveProfileId(): Promise<string | null> {
  if (cachedProfileId) return cachedProfileId;
  try {
    const { data, error } = (await getSupabase()
      .from("fp_player_profiles")
      .select("id")
      .maybeSingle()) as { data: { id?: unknown } | null; error: PgError | null };
    if (error || !data || typeof data.id !== "string") return null;
    cachedProfileId = data.id;
    return cachedProfileId;
  } catch {
    return null;
  }
}

// ── Load ─────────────────────────────────────────────────────────────────────

export interface LoadedSave {
  /** The parsed save doc, or null when the row is empty/new/unreadable/discarded. */
  doc: SaveDoc | null;
  /** The row's current revision (0 for a freshly seeded row), used as the CAS base. */
  revision: number;
}

/**
 * Load the caller's save. The row is always seeded (revision 0) by the login
 * route, but absence is tolerated defensively. A doc whose `docVersion` is
 * unknown/malformed is DISCARDED (returned as a null doc, so it is treated as an
 * empty/new save) rather than fed to the reducer — the CAS base revision is
 * still returned so the next write can proceed.
 */
export async function loadSave(profileId: string): Promise<LoadedSave> {
  try {
    const { data, error } = (await getSupabase()
      .from("fp_player_saves")
      .select("doc, revision")
      .eq("profile_id", profileId)
      .maybeSingle()) as {
      data: { doc?: unknown; revision?: unknown } | null;
      error: PgError | null;
    };
    if (error || !data) return { doc: null, revision: 0 };
    const revision = typeof data.revision === "number" ? data.revision : 0;
    const parsed = fromSaveDoc(data.doc);
    if (!parsed.ok) {
      // A freshly seeded '{}' is expected on a new player — do not warn on it;
      // only warn on a genuinely non-empty doc we refuse to hydrate.
      const emptySeed = isRecord(data.doc) && Object.keys(data.doc).length === 0;
      if (!emptySeed) {
        console.warn(
          `[fp:sync] discarding save doc (${parsed.reason}) for profile ${profileId}; starting fresh.`,
        );
      }
      return { doc: null, revision };
    }
    return { doc: parsed.doc, revision };
  } catch {
    return { doc: null, revision: 0 };
  }
}

// ── Ledger read-back ─────────────────────────────────────────────────────────

/**
 * Cap on rows read back from fp_ledger in a single load. Bounds one PostgREST
 * response so a long history can neither exceed PostgREST's default row ceiling
 * (a silently-truncated response) nor balloon memory. 200 rows is far above any
 * realistic Slice A history (a handful of sales/backings per idea).
 */
export const LEDGER_LOAD_LIMIT = 200;

/** A raw fp_ledger row as returned by the ranged read-back select. */
interface LedgerDbRow {
  id?: unknown;
  kind?: unknown;
  payer?: unknown;
  amount_cents?: unknown;
  gross_cents?: unknown;
  fee_cents?: unknown;
  net_cents?: unknown;
  provider_id?: unknown;
  created_at?: unknown;
}

/**
 * Load the caller's own ledger rows. The "read own" RLS policy already scopes
 * the SELECT to the caller's profile; the explicit `.eq('profile_id', …)` is
 * duplicated to hit the (profile_id, created_at) index (RLS perf guidance).
 * Newest-first and capped at LEDGER_LOAD_LIMIT so the response is bounded and
 * never silently truncated. Maps DB snake_case rows → the app LedgerEntry shape;
 * a malformed row is skipped defensively, and any failure returns [].
 */
export async function loadLedger(profileId: string): Promise<LedgerEntry[]> {
  try {
    const { data, error } = (await getSupabase()
      .from("fp_ledger")
      .select(
        "id, kind, payer, amount_cents, gross_cents, fee_cents, net_cents, provider_id, created_at",
      )
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(LEDGER_LOAD_LIMIT)) as { data: LedgerDbRow[] | null; error: PgError | null };
    if (error || !data) return [];
    const rows: LedgerEntry[] = [];
    for (const r of data) {
      if (
        typeof r.id === "string" &&
        // 'backing' is retired: only a 'sale' row is surfaced. A legacy backing
        // row (if any exists at rest) is dropped here, never fed to the reducer.
        r.kind === "sale" &&
        typeof r.payer === "string" &&
        typeof r.amount_cents === "number" &&
        typeof r.created_at === "string"
      ) {
        // Fee snapshot with legacy-row DEFAULTS so a reload of an amount-only row
        // (new columns null) never yields NaN: gross/net fall back to the gross
        // amount, fee to 0, provider to null.
        const gross = typeof r.gross_cents === "number" ? r.gross_cents : r.amount_cents;
        const fee = typeof r.fee_cents === "number" ? r.fee_cents : 0;
        // net default is layered: an explicit net wins; else a PARTIAL row whose
        // gross AND fee are present derives net = gross - fee (NOT amount_cents, so
        // a fee-bearing row isn't silently over-counted); else the all-null legacy
        // default net = amount_cents.
        const net =
          typeof r.net_cents === "number"
            ? r.net_cents
            : typeof r.gross_cents === "number" && typeof r.fee_cents === "number"
              ? r.gross_cents - r.fee_cents
              : r.amount_cents;
        // provider_id is bounded free text (DB CHECK: <= 64 chars). Unit 4/5
        // display code MUST render it through React's default escaping only (never
        // dangerouslySetInnerHTML), with a safe fallback label for an unknown /
        // foreign id — a crafted row must never inject markup into the P&L view.
        const providerId = typeof r.provider_id === "string" ? r.provider_id : null;
        rows.push({
          id: r.id,
          kind: r.kind,
          payer: r.payer,
          amountCents: r.amount_cents,
          grossCents: gross,
          feeCents: fee,
          netCents: net,
          providerId,
          createdAt: r.created_at,
        });
      }
    }
    return rows;
  } catch {
    return [];
  }
}

// ── Snapshot write (CAS) ─────────────────────────────────────────────────────

/**
 * Compare-and-swap snapshot write: `set doc, revision = base+1 where
 * profile_id = :p and revision = :base`, with `.select('profile_id')` appended
 * and the ownership filter duplicated (RLS perf guidance). A zero-row RESPONSE
 * (200, no error, empty array) is the CAS guard rejecting a stale base — it is
 * detected by row count, never by an error object.
 */
export async function saveSnapshot(
  profileId: string,
  baseRevision: number,
  doc: SaveDoc,
): Promise<SaveResult> {
  try {
    const { data, error } = (await getSupabase()
      .from("fp_player_saves")
      .update({ doc, revision: baseRevision + 1 })
      .eq("profile_id", profileId)
      .eq("revision", baseRevision)
      .select("profile_id")) as { data: unknown[] | null; error: PgError | null };
    if (error) return classifyWriteError(error);
    if (!data || data.length === 0) return { ok: false, reason: "cas-rejected" };
    return { ok: true, revision: baseRevision + 1 };
  } catch (error) {
    return classifyWriteError(error);
  }
}

// ── Rebase union (CAS-conflict merge) ────────────────────────────────────────
// The union itself (unionCompletionMaps + its business/idea helpers) lives in
// ../state/gameCore so the reducer's UNION_REMOTE action shares the exact same
// merge semantics; it is re-exported above. flushPending below is the only
// caller here (the CAS rebase path).

// ── Ledger insert ────────────────────────────────────────────────────────────

/**
 * Insert one append-only ledger row. `source` is pinned to 'mock' (only the
 * service role may write other sources). A duplicate-id insert (23505) means the
 * row already landed on a prior try — classified as SUCCESS and resolved, never
 * retried forever.
 */
export async function insertLedger(
  profileId: string,
  row: LedgerInsertRow,
): Promise<LedgerResult> {
  try {
    const { error } = (await getSupabase()
      .from("fp_ledger")
      .insert({
        id: row.id,
        profile_id: profileId,
        kind: row.kind,
        source: "mock",
        payer: row.payer,
        amount_cents: row.amountCents,
        // Fee snapshot columns. A caller without a computed fee (or a legacy
        // amount-only row) still writes coherent values: gross/net default to
        // the gross amount, fee to 0, provider to null — mirroring loadLedger.
        gross_cents: row.grossCents ?? row.amountCents,
        fee_cents: row.feeCents ?? 0,
        net_cents: row.netCents ?? row.amountCents,
        provider_id: row.providerId ?? null,
      })) as { error: PgError | null };
    if (!error) return { ok: true };
    if (pgCode(error) === DUPLICATE_CODE) return { ok: true };
    return classifyWriteError(error);
  } catch (error) {
    return classifyWriteError(error);
  }
}

// ── Feedback insert ──────────────────────────────────────────────────────────

/**
 * Insert one append-only stuck report. NO `.select()` — the table has no SELECT
 * grant/policy for children, so a returning insert would 42501 even though the
 * row landed (supabase-js sends `Prefer: return=minimal` without `.select()`).
 * `created_at` is never sent (excluded from the column-scoped INSERT grant).
 * A duplicate-id insert (23505: a replayed outbox entry that already landed) is
 * SUCCESS; a missing table (PGRST205/42P01) parks as retryable.
 */
export async function insertFeedback(
  profileId: string,
  row: FeedbackInsertRow,
): Promise<FeedbackResult> {
  try {
    const { error } = (await getSupabase()
      .from("fp_task_feedback")
      .insert({
        id: row.id,
        profile_id: profileId,
        task_id: row.taskId,
        band: row.band,
        body: row.body,
        // `kind` rides only on non-default rows ('app'): the 'task' payload
        // stays byte-identical to pre-#9 builds (the DB default is 'task'),
        // so a mis-ordered deploy can never park the existing stuck-report
        // lane behind a missing column.
        ...(row.kind && row.kind !== "task" ? { kind: row.kind } : {}),
      })) as { error: PgError | null };
    if (!error) return { ok: true };
    if (pgCode(error) === DUPLICATE_CODE) return { ok: true };
    return classifyFeedbackWriteError(error);
  } catch (error) {
    return classifyFeedbackWriteError(error);
  }
}

// ── Outbox (account-scoped, localStorage) ────────────────────────────────────

/** Outbox schema version, mirroring docVersion. Bumped in lockstep with it. */
export const OUTBOX_VERSION = DOC_VERSION;

const OUTBOX_NAME = "outbox";

/**
 * Where a user's resolved profile id is remembered (inside their `fp:<uid>:*`
 * namespace, so it is wiped with everything else). Written by the engine on
 * start; read by flushOutboxForPriorUser, which must address a PRIOR user's
 * rows after that user's session (and profile-id cache) are gone.
 */
const PROFILE_ID_NAME = "profileId";

interface OutboxLedgerEntry {
  v: number;
  row: LedgerInsertRow;
}

interface OutboxSnapshotEntry {
  v: number;
  baseRevision: number;
  doc: SaveDoc;
}

interface OutboxFeedbackEntry {
  v: number;
  row: FeedbackInsertRow;
}

export interface Outbox {
  ledger: OutboxLedgerEntry[];
  /** Stuck reports (fp_task_feedback). Absent in pre-feedback outboxes -> []. */
  feedback: OutboxFeedbackEntry[];
  snapshot: OutboxSnapshotEntry | null;
}

function emptyOutbox(): Outbox {
  return { ledger: [], feedback: [], snapshot: null };
}

/**
 * Read the outbox for a user, DISCARDING any entry whose `v` is not the current
 * OUTBOX_VERSION — a long-lived tab or an older build must never feed a
 * stale-shape entry to a newer writer.
 */
/**
 * Runtime shape-check for a queued ledger insert row. A versioned-but-malformed
 * entry (e.g. `amountCents` a non-numeric string from a corrupted write or an
 * older buggy build) would otherwise trigger a Postgres error whose code is not
 * TERMINAL, be classified retryable, and jam the queue FIRST forever. Validate
 * the leaf types here and DROP anything that fails before it is ever queued.
 */
function isValidLedgerRow(row: unknown): row is LedgerInsertRow {
  return (
    isRecord(row) &&
    typeof row.id === "string" &&
    // 'backing' retired: a queued backing entry is dropped before it can be sent.
    row.kind === "sale" &&
    typeof row.payer === "string" &&
    typeof row.amountCents === "number" &&
    Number.isFinite(row.amountCents)
  );
}

/**
 * Runtime shape-check for a queued feedback row — the client-side mirror of the
 * fp_task_feedback CHECKs (task-id regex + length, band enum, body cap). Applied
 * BOTH before enqueue and at read, so a malformed/oversized entry can never
 * reach the DB, draw a terminal refusal, and be silently dropped.
 */
export function isValidFeedbackRow(row: unknown): row is FeedbackInsertRow {
  return (
    isRecord(row) &&
    typeof row.id === "string" &&
    row.id !== "" &&
    typeof row.taskId === "string" &&
    row.taskId.length <= FEEDBACK_TASK_ID_MAX &&
    FEEDBACK_TASK_ID_RE.test(row.taskId) &&
    typeof row.band === "string" &&
    (FEEDBACK_BANDS as readonly string[]).includes(row.band) &&
    typeof row.body === "string" &&
    row.body.length <= FEEDBACK_BODY_MAX &&
    // `kind` is optional (absent = 'task', incl. every pre-#9 queued outbox
    // entry); when present it must be in the FP-side kind vocabulary mirror.
    (row.kind === undefined || (FEEDBACK_KINDS as readonly string[]).includes(row.kind as string))
  );
}

export function readOutbox(userId: string, storage?: Storage): Outbox {
  const raw = getDraft<unknown>(userId, OUTBOX_NAME, storage);
  if (!isRecord(raw)) return emptyOutbox();
  const ledger: OutboxLedgerEntry[] = Array.isArray(raw.ledger)
    ? raw.ledger.filter(
        (e): e is OutboxLedgerEntry =>
          isRecord(e) && e.v === OUTBOX_VERSION && isValidLedgerRow(e.row),
      )
    : [];
  const feedback: OutboxFeedbackEntry[] = Array.isArray(raw.feedback)
    ? raw.feedback.filter(
        (e): e is OutboxFeedbackEntry =>
          isRecord(e) && e.v === OUTBOX_VERSION && isValidFeedbackRow(e.row),
      )
    : [];
  // A parked snapshot's `doc` must pass the SAME shape + docVersion gate as a
  // freshly loaded save (fromSaveDoc). An unvalidated doc PATCHed to the server
  // (JSONB accepts anything, and the revision still bumps) would make the next
  // loadSave reject it and start fresh — silently overwriting then discarding a
  // good save. Discard a malformed parked snapshot instead, mirroring loadSave.
  const snapRaw = raw.snapshot;
  let snapshot: OutboxSnapshotEntry | null = null;
  if (isRecord(snapRaw) && snapRaw.v === OUTBOX_VERSION && isRecord(snapRaw.doc)) {
    const parsed = fromSaveDoc(snapRaw.doc);
    if (parsed.ok) {
      snapshot = {
        v: OUTBOX_VERSION,
        baseRevision: typeof snapRaw.baseRevision === "number" ? snapRaw.baseRevision : 0,
        doc: parsed.doc,
      };
    }
  }
  return { ledger, feedback, snapshot };
}

/** Write the outbox; `false` when storage refused the write (quota/lockdown). */
function writeOutbox(userId: string, outbox: Outbox, storage?: Storage): boolean {
  return setDraft(userId, OUTBOX_NAME, outbox, storage);
}

/** Queue a ledger insert durably (idempotent by id). */
export function enqueueLedger(userId: string, row: LedgerInsertRow, storage?: Storage): void {
  const outbox = readOutbox(userId, storage);
  if (!outbox.ledger.some((e) => e.row.id === row.id)) {
    outbox.ledger.push({ v: OUTBOX_VERSION, row });
    writeOutbox(userId, outbox, storage);
  }
}

/** Remove a resolved ledger insert from the queue. */
export function resolveLedger(userId: string, id: string, storage?: Storage): void {
  const outbox = readOutbox(userId, storage);
  const next = outbox.ledger.filter((e) => e.row.id !== id);
  if (next.length !== outbox.ledger.length) {
    writeOutbox(userId, { ...outbox, ledger: next }, storage);
  }
}

/**
 * Queue a stuck report durably (idempotent by id). A row failing the client-side
 * CHECK mirror is REFUSED (returns false) — never queued, never sent. A storage
 * write that fails (quota exceeded, locked-down Storage) ALSO returns false:
 * the row is not durable, so the caller must resolve 'dropped' honestly rather
 * than pretend it is queued (setDraft is non-throwing, so this never throws).
 */
export function enqueueFeedback(
  userId: string,
  row: FeedbackInsertRow,
  storage?: Storage,
): boolean {
  if (!isValidFeedbackRow(row)) return false;
  const outbox = readOutbox(userId, storage);
  if (outbox.feedback.some((e) => e.row.id === row.id)) return true;
  outbox.feedback.push({ v: OUTBOX_VERSION, row });
  return writeOutbox(userId, outbox, storage);
}

/** Remove a resolved stuck report from the queue. */
export function resolveFeedback(userId: string, id: string, storage?: Storage): void {
  const outbox = readOutbox(userId, storage);
  const next = outbox.feedback.filter((e) => e.row.id !== id);
  if (next.length !== outbox.feedback.length) {
    writeOutbox(userId, { ...outbox, feedback: next }, storage);
  }
}

/** Park the latest unsent snapshot (overwrites any prior parked snapshot). */
export function parkSnapshot(
  userId: string,
  baseRevision: number,
  doc: SaveDoc,
  storage?: Storage,
): void {
  const outbox = readOutbox(userId, storage);
  outbox.snapshot = { v: OUTBOX_VERSION, baseRevision, doc };
  writeOutbox(userId, outbox, storage);
}

/** Clear the parked snapshot after it is confirmed sent (or dropped). */
export function clearPendingSnapshot(userId: string, storage?: Storage): void {
  const outbox = readOutbox(userId, storage);
  if (outbox.snapshot !== null) writeOutbox(userId, { ...outbox, snapshot: null }, storage);
}

export interface ReplayResult {
  ledgerSent: number;
  ledgerDroppedTerminal: number;
  feedbackSent: number;
  feedbackDroppedTerminal: number;
  /** Entries the server refused with FP429 (daily cap): removed, never wedged. */
  feedbackCapped: number;
  snapshot: SaveResult | null;
  reauthNeeded: boolean;
}

/**
 * Drain the outbox, in order: ledger inserts first, then stuck reports, then the
 * parked snapshot. Idempotent — a row whose id already exists resolves as
 * success (23505); the snapshot is idempotent by CAS. A retryable failure stops
 * that kind's drain and preserves its remaining entries in order; a terminal
 * failure drops the entry (it would recur identically forever). The feedback
 * drain is INDEPENDENT of the ledger's: a parked stuck report (e.g. the table
 * not deployed yet, PGRST205) must never block a child's sales or snapshot, and
 * vice versa. A stale parked snapshot rejected by CAS is dropped — the live tab
 * holds current state and will schedule a fresh save.
 */
export async function replayOutbox(
  userId: string,
  profileId: string,
  storage?: Storage,
): Promise<ReplayResult> {
  const outbox = readOutbox(userId, storage);
  const remaining: OutboxLedgerEntry[] = [];
  let ledgerSent = 0;
  let ledgerDroppedTerminal = 0;
  let reauthNeeded = false;
  let stopped = false;

  for (const entry of outbox.ledger) {
    if (stopped) {
      remaining.push(entry);
      continue;
    }
    const { decision, needsReauth } = classifyLedgerOutcome(await insertLedger(profileId, entry.row));
    if (decision === "sent") {
      ledgerSent += 1;
    } else if (decision === "drop") {
      ledgerDroppedTerminal += 1;
    } else {
      if (needsReauth) reauthNeeded = true;
      remaining.push(entry);
      stopped = true;
    }
  }

  // Stuck reports drain after the ledger, with their OWN stop flag so one
  // kind's retryable park never wedges the other kind's queue.
  const feedbackRemaining: OutboxFeedbackEntry[] = [];
  let feedbackSent = 0;
  let feedbackDroppedTerminal = 0;
  let feedbackCapped = 0;
  let feedbackStopped = false;
  for (const entry of outbox.feedback) {
    if (feedbackStopped) {
      feedbackRemaining.push(entry);
      continue;
    }
    const { decision, needsReauth } = classifyFeedbackOutcome(
      await insertFeedback(profileId, entry.row),
    );
    if (decision === "sent") {
      feedbackSent += 1;
    } else if (decision === "drop") {
      feedbackDroppedTerminal += 1;
    } else if (decision === "capped") {
      // FP429 on replay: remove the entry (it recurs identically for the rest
      // of the UTC day, so keeping it would wedge the queue) and adopt the
      // server's cap locally so the next tap short-circuits to 'capped'.
      feedbackCapped += 1;
      adoptServerFeedbackCap(userId, storage);
    } else {
      if (needsReauth) reauthNeeded = true;
      feedbackRemaining.push(entry);
      feedbackStopped = true;
    }
  }

  let snapshot: SaveResult | null = null;
  let parkedSnapshot = outbox.snapshot;
  if (!stopped && parkedSnapshot) {
    const result = await saveSnapshot(profileId, parkedSnapshot.baseRevision, parkedSnapshot.doc);
    snapshot = result;
    if (result.ok) {
      parkedSnapshot = null;
    } else if (result.reason === "cas-rejected") {
      parkedSnapshot = null; // stale; live state will re-save.
    } else if (result.reason === "terminal") {
      parkedSnapshot = null; // would recur identically forever.
    } else if (result.needsReauth) {
      reauthNeeded = true; // keep parked for the next attempt.
    }
  }

  writeOutbox(
    userId,
    { ledger: remaining, feedback: feedbackRemaining, snapshot: parkedSnapshot },
    storage,
  );
  return {
    ledgerSent,
    ledgerDroppedTerminal,
    feedbackSent,
    feedbackDroppedTerminal,
    feedbackCapped,
    snapshot,
    reauthNeeded,
  };
}

// ── Keepalive flush (bypasses supabase-js) ───────────────────────────────────

/**
 * A keepalive request body over this size is rejected by the browser. Kept
 * comfortably under the ~64KiB hard limit to leave room for headers.
 */
export const KEEPALIVE_MAX_BYTES = 60 * 1024;

export interface KeepaliveAuth {
  supabaseUrl: string;
  apikey: string;
  accessToken: string;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function keepaliveHeaders(auth: KeepaliveAuth): Record<string, string> {
  // These headers are supabase-js's job normally; on the keepalive path we must
  // attach them by hand or PostgREST rejects the write as unauthenticated.
  return {
    apikey: auth.apikey,
    Authorization: `Bearer ${auth.accessToken}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

/**
 * Flush a snapshot CAS via keepalive. Returns `{ sent: false, reason:
 * 'too-large' }` WITHOUT sending when the body would exceed the keepalive cap —
 * the caller parks it in the outbox instead.
 */
export function flushSnapshotViaKeepalive(
  auth: KeepaliveAuth,
  profileId: string,
  baseRevision: number,
  doc: SaveDoc,
): { sent: boolean; reason?: "too-large" } {
  const body = JSON.stringify({ doc, revision: baseRevision + 1 });
  if (byteLength(body) > KEEPALIVE_MAX_BYTES) return { sent: false, reason: "too-large" };
  const url =
    `${auth.supabaseUrl}/rest/v1/fp_player_saves` +
    `?profile_id=eq.${encodeURIComponent(profileId)}&revision=eq.${baseRevision}`;
  void fetch(url, {
    method: "PATCH",
    headers: keepaliveHeaders(auth),
    body,
    keepalive: true,
  }).catch(() => {
    // Best-effort: a keepalive failure is unobservable during unload; the outbox
    // replay is the durable path. Swallow so no unhandled rejection escapes.
  });
  return { sent: true };
}

/** Flush a single ledger insert via keepalive (best-effort; outbox is durable). */
export function flushLedgerViaKeepalive(
  auth: KeepaliveAuth,
  profileId: string,
  row: LedgerInsertRow,
): { sent: boolean; reason?: "too-large" } {
  const body = JSON.stringify({
    id: row.id,
    profile_id: profileId,
    kind: row.kind,
    source: "mock",
    payer: row.payer,
    amount_cents: row.amountCents,
    gross_cents: row.grossCents ?? row.amountCents,
    fee_cents: row.feeCents ?? 0,
    net_cents: row.netCents ?? row.amountCents,
    provider_id: row.providerId ?? null,
  });
  if (byteLength(body) > KEEPALIVE_MAX_BYTES) return { sent: false, reason: "too-large" };
  void fetch(`${auth.supabaseUrl}/rest/v1/fp_ledger`, {
    method: "POST",
    headers: keepaliveHeaders(auth),
    body,
    keepalive: true,
  }).catch(() => {
    // Best-effort during unload; the outbox is the durable path.
  });
  return { sent: true };
}

/** Flush a single stuck report via keepalive (best-effort; outbox is durable). */
export function flushFeedbackViaKeepalive(
  auth: KeepaliveAuth,
  profileId: string,
  row: FeedbackInsertRow,
): { sent: boolean; reason?: "too-large" } {
  // Never includes created_at (server-managed; excluded from the INSERT grant).
  const body = JSON.stringify({
    id: row.id,
    profile_id: profileId,
    task_id: row.taskId,
    band: row.band,
    body: row.body,
    // Same omit-the-default rule as insertFeedback: 'task' payloads stay
    // byte-identical to pre-#9 builds; only 'app' rows carry the column.
    ...(row.kind && row.kind !== "task" ? { kind: row.kind } : {}),
  });
  if (byteLength(body) > KEEPALIVE_MAX_BYTES) return { sent: false, reason: "too-large" };
  void fetch(`${auth.supabaseUrl}/rest/v1/fp_task_feedback`, {
    method: "POST",
    headers: keepaliveHeaders(auth),
    body,
    keepalive: true,
  }).catch(() => {
    // Best-effort during unload; the outbox is the durable path.
  });
  return { sent: true };
}

/**
 * Best-effort flush of a PRIOR user's outbox, fired by the different-user login
 * path right BEFORE wipeAllFpKeys destroys it (a queued stuck report / sale
 * would otherwise die silently when a sibling logs in on a shared device).
 *
 * Same fire-and-forget keepalive shape as flushOnHide, addressed with the prior
 * user's stored profile id (PROFILE_ID_NAME) and whatever session token is
 * still resolvable. Bounded (the outbox is bounded), never awaited by login,
 * never throws. All storage reads happen SYNCHRONOUSLY before the first await,
 * so the caller's wipe (which runs right after the call) cannot race them.
 *
 * This NARROWS the loss window but cannot eliminate it: an offline switch, no
 * resolvable token, an expired token, or an RLS refusal of the prior user's
 * rows under a successor token still loses the queued rows. That residual is
 * ACCEPTED — feedback is telemetry and the flushed writes are idempotent by id
 * (23505 = already landed), so the flush can only help, never corrupt.
 */
export async function flushOutboxForPriorUser(userId: string, storage?: Storage): Promise<void> {
  try {
    // Synchronous captures — must complete before the caller wipes fp:* keys.
    const outbox = readOutbox(userId, storage);
    if (outbox.ledger.length === 0 && outbox.feedback.length === 0 && !outbox.snapshot) return;
    const profileId = getDraft<string>(userId, PROFILE_ID_NAME, storage);
    if (typeof profileId !== "string" || profileId === "") return;

    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const { supabaseUrl, supabaseAnonKey } = getConfig();
    const auth: KeepaliveAuth = { supabaseUrl, apikey: supabaseAnonKey, accessToken: token };

    for (const entry of outbox.ledger) flushLedgerViaKeepalive(auth, profileId, entry.row);
    for (const entry of outbox.feedback) flushFeedbackViaKeepalive(auth, profileId, entry.row);
    if (outbox.snapshot) {
      flushSnapshotViaKeepalive(auth, profileId, outbox.snapshot.baseRevision, outbox.snapshot.doc);
    }
  } catch {
    // Best-effort only: nothing here may ever block or fail a login.
  }
}

// ── Feedback daily counter (local mirror of the DB cap) ──────────────────────

const FEEDBACK_DAY_NAME = "feedbackDay";

interface FeedbackDayRecord {
  day: string;
  count: number;
}

function readFeedbackDay(userId: string, storage?: Storage): FeedbackDayRecord | null {
  const raw = getDraft<unknown>(userId, FEEDBACK_DAY_NAME, storage);
  if (
    isRecord(raw) &&
    typeof raw.day === "string" &&
    typeof raw.count === "number" &&
    Number.isFinite(raw.count) &&
    raw.count >= 0
  ) {
    return { day: raw.day, count: raw.count };
  }
  return null;
}

/**
 * Stuck reports already counted for `day` (a UTC `YYYY-MM-DD`, caller-derived —
 * this module stays clock-free; UTC mirrors the DB trigger's date_trunc). A
 * stored record for a different day reads as 0.
 */
export function feedbackCountForDay(userId: string, day: string, storage?: Storage): number {
  const rec = readFeedbackDay(userId, storage);
  return rec && rec.day === day ? rec.count : 0;
}

/**
 * Count one more report against `day` (resets automatically on a new day).
 * Tolerates a refused storage write (setDraft is non-throwing): the counter is
 * a best-effort local mirror — the DB trigger stays authoritative.
 */
export function bumpFeedbackCountForDay(userId: string, day: string, storage?: Storage): void {
  const next = feedbackCountForDay(userId, day, storage) + 1;
  setDraft(userId, FEEDBACK_DAY_NAME, { day, count: next }, storage);
}

/**
 * Overwrite the counter for `day` outright — used to adopt the server's FP429
 * refusal (the authoritative cap) into the local mirror. Best-effort write.
 */
export function setFeedbackCountForDay(
  userId: string,
  day: string,
  count: number,
  storage?: Storage,
): void {
  setDraft(userId, FEEDBACK_DAY_NAME, { day, count }, storage);
}

/**
 * Today's UTC day (`YYYY-MM-DD`), matching the DB trigger's
 * `date_trunc('day', now() at time zone 'utc')`. The one shared derivation for
 * the daily-cap mirror — callers and the FP429 adoption below must agree on it.
 */
export function utcDayToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The server refused with FP429: today's budget is spent (possibly partly from
 * another device — the local mirror can be desynced). Pin the local counter to
 * the cap so the very next tap takes the local capped path immediately instead
 * of sending another doomed insert. Deliberate clock read (this module is
 * otherwise clock-free): FP429 is inherently "today, per the server's clock",
 * so the adoption must stamp today's UTC day itself.
 */
function adoptServerFeedbackCap(userId: string, storage?: Storage): void {
  setFeedbackCountForDay(userId, utcDayToday(), FEEDBACK_DAILY_CAP, storage);
}

// ── Sync engine ──────────────────────────────────────────────────────────────

/** Debounce window after the last save-doc change before a snapshot write. */
export const DEBOUNCE_MS = 3_000;
/** Hard ceiling — a stream of changes still flushes at least this often. */
export const MAX_INTERVAL_MS = 30_000;

/**
 * The honest fate of one submitted stuck report: "sent" (landed), "queued"
 * (parked retryable), "dropped" (terminal/invalid/undurable), or "capped" (the
 * server's FP429 daily-cap refusal — shown honestly, removed from the queue).
 */
export type FeedbackSendOutcome = "sent" | "queued" | "dropped" | "capped";

/**
 * The honest outcome of a forced snapshot flush (real-public-site plan,
 * Unit 4 — flushNow sequencing: the client may call publish only after a
 * LANDED flush, so the page's authoritative content re-sync reads current
 * data). Three values, per the plan's contract:
 *  - "landed": the pending snapshot committed (or nothing was pending AND no
 *    earlier failure left a snapshot parked in the outbox) — the server holds
 *    current content; safe to publish.
 *  - "parked": the content is NOT on the server — parked retryable, terminal-
 *    dropped, unflushable (no profile), superseded mid-flight (session ended),
 *    or a stale parked snapshot still sits in the outbox. The caller shows the
 *    R19 not-live-yet state and retries flush+publish later; it must NOT
 *    pretend the page is current. AFTER A TERMINAL DROP the engine keeps
 *    answering "parked" — even with nothing newly pending — until content
 *    actually lands again (the terminal branch clears the outbox by design, so
 *    without this stickiness a later flushNow would read the quiet queue as
 *    "landed" and a publish would go live over content that never reached the
 *    server; Unit 5's not-live-yet state is the honest render instead).
 *  - "cas-rescheduled": lost the CAS twice this round; the flush rescheduled
 *    itself (debounce) rather than clobber — content will land shortly, but
 *    it has not yet.
 */
export type FlushOutcome = "landed" | "parked" | "cas-rescheduled";

export interface SyncEngineDeps {
  userId: string;
  /** Reads the current save doc + CAS base revision from live app state. */
  getSnapshot: () => { doc: SaveDoc; revision: number };
  /** Adopt a new base revision after a successful save. */
  setRevision: (revision: number) => void;
  /** Surface saving/saved/pending/error to the UI. */
  onStatus: (status: SyncStatus) => void;
  /** An expired session was hit mid-play — the app should route to login. */
  onReauthNeeded: () => void;
  /**
   * A CAS-rebased (merged) doc COMMITTED to the server. Invoked only after the
   * rebased save succeeds, and only while this session is still the live one
   * (generation-guarded like every async writer). The caller must feed the doc
   * back into live state (GameContext dispatches UNION_REMOTE) — otherwise the
   * concurrent session's work exists on the server and in this tab's next
   * rebase, but never on this tab's screen, and the two tabs split-brain until
   * a reload. Optional so bare test engines stay valid.
   */
  onRebasedDoc?: (doc: SaveDoc) => void;
  storage?: Storage;
}

export interface SyncEngine {
  start: () => Promise<void>;
  stop: () => void;
  /** A save-doc-relevant change happened — schedule a debounced snapshot. */
  notifySnapshotChange: () => void;
  /** A ledger row was optimistically added — persist it immediately + durably. */
  notifyLedger: (row: LedgerInsertRow) => void;
  /**
   * A stuck report was submitted — enqueue durably, then attempt the insert.
   * Resolves to the HONEST outcome the UI may show: "sent" (landed), "queued"
   * (parked retryable, will replay), or "dropped" (terminal / invalid — never
   * claim saved for a dropped row).
   */
  notifyFeedback: (row: FeedbackInsertRow) => Promise<FeedbackSendOutcome>;
  /**
   * Force the pending snapshot to flush now (async path) and surface the
   * honest outcome (see FlushOutcome) so callers can sequence publish on a
   * LANDED result. GameApi.flushNow delegates here.
   */
  flushPending: () => Promise<FlushOutcome>;
  /** Flush pending writes via keepalive on hide/unload. */
  flushOnHide: () => void;
}

/**
 * Create the sync engine that GameContext drives. Framework-agnostic: it uses
 * setTimeout and (when present) window events, so it is exercised directly by
 * the unit tests with fake timers and mocked fetch.
 */
export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { userId, storage } = deps;
  let profileId: string | null = null;
  let accessToken: string | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let unsubAuth: (() => void) | null = null;
  let stopped = false;
  // Session generation. Bumped on stop() so an in-flight async write (awaiting
  // the network) can detect that its session has ended — GameContext shares one
  // stateRef/revisionRef across sessions on a shared device, so an old flush
  // must NEVER write the next child's doc under the previous child's profile_id.
  let generation = 0;
  // REENTRANCY GUARD (Unit 4 review, P0): flushOnce sets `pending = false`
  // synchronously BEFORE awaiting saveSnapshot, so a concurrent second
  // flushPending (flushNow racing the 3s debounce / 30s max timer — the exact
  // commit→flushNow→publish sequence) would otherwise see nothing-pending +
  // an empty outbox and answer a FALSE "landed" while the first call's save is
  // still unresolved. The in-flight promise is memoized; a concurrent caller
  // awaits it, then runs its own flush pass (which honestly re-reads the
  // pending/outbox/terminal state at that point).
  let inFlight: Promise<FlushOutcome> | null = null;
  // TERMINAL-DROP STICKINESS (Unit 4 review, P1): a terminal write error
  // clears the parked snapshot by design (no poison retry), which would let a
  // LATER flushPending with nothing newly pending read the quiet queue as
  // "landed" even though the content never reached the server — and a publish
  // would go live over stale server content. In-memory is sufficient (the
  // flag guards same-session publish sequencing only; the engine is
  // per-session). Set on the terminal branch, cleared by the next successful
  // land; the nothing-pending branch answers "parked" while it is set.
  let terminalDropped = false;

  /** True only while THIS flush's captured generation is still the live one. */
  function isCurrent(gen: number): boolean {
    return !stopped && gen === generation;
  }

  function clearTimers(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
  }

  function setStatus(status: SyncStatus): void {
    deps.onStatus(status);
  }

  /** The guarded entry: serializes overlapping flushes (see `inFlight`). */
  async function flushPending(): Promise<FlushOutcome> {
    // Await any flush already in flight (looped: by the time we wake, another
    // waiter may have started the next one). Only then run our own pass, which
    // re-reads the live pending/outbox/terminal state — so a caller can never
    // be answered "landed" while an unresolved save is still on the wire, and
    // content that became pending during the wait still gets flushed.
    while (inFlight) await inFlight;
    const run = flushOnce();
    inFlight = run;
    try {
      return await run;
    } finally {
      inFlight = null;
    }
  }

  async function flushOnce(): Promise<FlushOutcome> {
    clearTimers();
    // Outcome mapping (Unit 4): a stopped/superseded engine or an unresolved
    // profile can flush nothing → "parked" (never claim landed for content
    // that is not on the server). With nothing pending in memory, an EARLIER
    // failure may still hold a parked snapshot in the outbox — or a terminal
    // drop may have discarded content outright (terminalDropped) — neither of
    // which has landed, so only a genuinely clean, un-dropped queue answers
    // "landed".
    if (stopped) return "parked";
    if (!pending) {
      if (terminalDropped) return "parked";
      return readOutbox(userId, storage).snapshot ? "parked" : "landed";
    }
    if (!profileId) return "parked";
    const gen = generation;
    const pid = profileId;
    pending = false;
    setStatus("saving");

    // Track the base/doc actually written so a rebase re-parks the REBASED base,
    // not the stale one (a stale-base park would CAS-reject on replay and be lost).
    let saveRevision: number;
    let saveDoc: SaveDoc;
    {
      const snap = deps.getSnapshot();
      saveRevision = snap.revision;
      saveDoc = snap.doc;
    }
    let result = await saveSnapshot(pid, saveRevision, saveDoc);

    // True once saveDoc is a REBASED merge (local ∪ server) rather than the raw
    // local snapshot — the commit of a rebased doc must be fed back to the
    // reducer (onRebasedDoc) or this tab never sees the concurrent session's
    // work it just persisted on the server (split-brain until reload).
    let rebased = false;

    if (!result.ok && result.reason === "cas-rejected") {
      // P0: the session may have ended during the network round-trip. Never issue
      // the rebase write under a superseded session.
      if (!isCurrent(gen)) return "parked";
      // Refetch + rebase: re-save against the fresh revision, but MERGE first —
      // the CAS loss means a concurrent session (another tab/device) committed
      // work we have not seen. Completions are monotonic, so the server doc's
      // completion maps are UNIONED into the current local doc (and any extra
      // server ideas appended) before the rebased write; latest-intent fields
      // (text fields, activeIdea, chosenProvider, …) stay local-authoritative.
      // See unionCompletionMaps for the precise contract. This is the ONLY
      // rebase path: flushOnHide/replayOutbox never rebase (the keepalive parks
      // and a CAS-rejected parked snapshot is dropped in favor of live state).
      const fresh = await loadSave(pid);
      const current = deps.getSnapshot();
      saveRevision = fresh.revision;
      saveDoc = unionCompletionMaps(current.doc, fresh.doc);
      rebased = true;
      if (!isCurrent(gen)) return "parked";
      result = await saveSnapshot(pid, saveRevision, saveDoc);
    }

    // P0: do not mutate the shared revision / outbox / status for a session that
    // has since been superseded — the new session owns persistence now.
    if (!isCurrent(gen)) return "parked";

    if (result.ok) {
      deps.setRevision(result.revision);
      // Content landed: any earlier terminal drop is superseded by real
      // server-side content — flushNow may answer "landed" again.
      terminalDropped = false;
      clearPendingSnapshot(userId, storage);
      // A rebased save COMMITTED: feed the merged doc back into live state
      // (UNION_REMOTE) so this tab converges on the union it just persisted.
      // Ordered before the status flip so 'saved' reflects converged state;
      // guarded by the isCurrent(gen) check above like every shared mutation.
      if (rebased) deps.onRebasedDoc?.(saveDoc);
      setStatus("saved");
      return "landed";
    }
    if (result.reason === "cas-rejected") {
      // Lost the CAS twice this round — reschedule rather than clobber.
      pending = true;
      setStatus("pending");
      scheduleDebounce();
      return "cas-rescheduled";
    }
    if (result.reason === "terminal") {
      // A doc past the size cap / a trigger raise would retry-storm forever.
      // Outcome: "parked" — the three-value contract has no "dropped"; what a
      // publish caller needs to know is only that this content did NOT land.
      // STICKY (P1): the flag keeps later nothing-pending flushes answering
      // "parked" until content actually lands (see terminalDropped).
      terminalDropped = true;
      clearPendingSnapshot(userId, storage);
      setStatus("error");
      return "parked";
    }
    // Retryable (network / expired session): park the REBASED base/doc so replay
    // can actually succeed, then replay later.
    parkSnapshot(userId, saveRevision, saveDoc, storage);
    if (result.needsReauth) deps.onReauthNeeded();
    setStatus("pending");
    return "parked";
  }

  function scheduleDebounce(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void flushPending(), DEBOUNCE_MS);
  }

  function notifySnapshotChange(): void {
    if (stopped) return;
    pending = true;
    scheduleDebounce();
    if (!maxTimer) {
      // 30s ceiling: a continuous stream of edits still flushes periodically.
      maxTimer = setTimeout(() => void flushPending(), MAX_INTERVAL_MS);
    }
  }

  async function persistLedger(row: LedgerInsertRow): Promise<void> {
    if (!profileId) return; // will be replayed from the outbox once profile resolves.
    const gen = generation;
    const pid = profileId;
    const { decision, needsReauth } = classifyLedgerOutcome(await insertLedger(pid, row));
    if (decision === "sent") {
      // A → A insert is always correct to resolve from A's outbox, even if the
      // session has since switched (the row is A's, keyed by A's frozen userId).
      resolveLedger(userId, row.id, storage);
      return;
    }
    if (decision === "drop") {
      // Structural rejection (e.g. amount out of bounds) — drop it, never storm.
      resolveLedger(userId, row.id, storage);
      if (isCurrent(gen)) setStatus("error");
      return;
    }
    // Retryable: stays queued in the outbox for replay. Only touch the shared UI
    // status/reauth if this session is still the live one.
    if (isCurrent(gen)) {
      if (needsReauth) deps.onReauthNeeded();
      setStatus("pending");
    }
  }

  function notifyLedger(row: LedgerInsertRow): void {
    if (stopped) return;
    // Durable first: enqueue before the network attempt so a tab kill mid-insert
    // still replays it. On success it is resolved out; the insert is idempotent.
    enqueueLedger(userId, row, storage);
    void persistLedger(row);
  }

  async function persistFeedback(row: FeedbackInsertRow): Promise<FeedbackSendOutcome> {
    if (!profileId) return "queued"; // replays from the outbox once the profile resolves.
    const gen = generation;
    const pid = profileId;
    const { decision, needsReauth } = classifyFeedbackOutcome(await insertFeedback(pid, row));
    if (decision === "sent") {
      // A → A insert stays correct to resolve from A's outbox even after a
      // session switch (the row is A's, keyed by A's frozen userId).
      resolveFeedback(userId, row.id, storage);
      return "sent";
    }
    if (decision === "capped") {
      // FP429: the DB's daily-cap trigger refused (the local mirror can lag a
      // second device). Honest 'capped' end-to-end — the entry is REMOVED from
      // the outbox (replaying it recurs identically all day: never park) and
      // the caller shows the capped copy (never silent). Adopt the server cap
      // into the local day mirror so subsequent taps short-circuit locally.
      resolveFeedback(userId, row.id, storage);
      adoptServerFeedbackCap(userId, storage);
      return "capped";
    }
    if (decision === "drop") {
      // Terminal (should be unreachable: rows are validated pre-enqueue and the
      // local daily counter mirrors the DB cap). Drop honestly — never storm,
      // never claim saved. Feedback is not save state, so no global error status.
      resolveFeedback(userId, row.id, storage);
      return "dropped";
    }
    // Retryable: stays queued for replay. Only touch the shared reauth/status
    // path when this session is still the live one (generation guard).
    if (isCurrent(gen) && needsReauth) deps.onReauthNeeded();
    return "queued";
  }

  function notifyFeedback(row: FeedbackInsertRow): Promise<FeedbackSendOutcome> {
    // A row that fails the client-side CHECK mirror is refused outright; a
    // stopped engine belongs to a torn-down session and must not enqueue into
    // (or write under) the next child's namespace.
    if (stopped || !enqueueFeedback(userId, row, storage)) return Promise.resolve("dropped");
    return persistFeedback(row);
  }

  function keepaliveAuth(): KeepaliveAuth | null {
    if (!accessToken) return null;
    const { supabaseUrl, supabaseAnonKey } = getConfig();
    return { supabaseUrl, apikey: supabaseAnonKey, accessToken };
  }

  function flushOnHide(): void {
    if (stopped || !profileId) return;
    const auth = keepaliveAuth();

    if (pending) {
      const { doc, revision } = deps.getSnapshot();
      // Park FIRST, unconditionally. A keepalive PATCH on tab-close is
      // fire-and-forget: it may never complete (network drop), the body may be
      // too large, or there may be no token. In every case the durable outbox
      // must hold the edit; the next boot's replayOutbox reconciles it via CAS.
      // Mirrors the ledger path, which keeps entries queued until a confirmed
      // insert. The keepalive below is then a best-effort fast path only.
      parkSnapshot(userId, revision, doc, storage);
      pending = false;
      if (auth) flushSnapshotViaKeepalive(auth, profileId, revision, doc);
    }

    if (!auth) return;
    // Small ledger delta: fire via keepalive; entries stay queued and the next
    // replay confirms/removes them idempotently.
    const outbox = readOutbox(userId, storage);
    for (const entry of outbox.ledger) flushLedgerViaKeepalive(auth, profileId, entry.row);
    // Queued stuck reports ride keepalive too; entries stay queued and the next
    // replay confirms/removes them idempotently (23505 = already landed).
    for (const entry of outbox.feedback) flushFeedbackViaKeepalive(auth, profileId, entry.row);
  }

  // Bound listeners (removed on stop).
  const onOnline = () => {
    if (profileId) void replayOutbox(userId, profileId, storage);
  };
  const onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") flushOnHide();
  };
  const onPageHide = () => flushOnHide();

  async function start(): Promise<void> {
    stopped = false;
    // Capture the session generation at entry. start() is async and called
    // fire-and-forget; if stop() runs mid-start it bumps the generation and
    // removes listeners that were not wired yet. Re-check isCurrent(gen) after
    // EVERY await and before wiring any listener/subscription or running replay,
    // so a torn-down session never leaks listeners or acts on a stale user.
    const gen = generation;
    profileId = await resolveProfileId();
    if (!isCurrent(gen)) return;
    // Remember the resolved profile id inside the user's own namespace so a
    // later different-user login can still address THIS user's queued rows in
    // its pre-wipe best-effort flush (flushOutboxForPriorUser). Best-effort
    // write; wiped with the namespace.
    if (profileId) setDraft(userId, PROFILE_ID_NAME, profileId, storage);

    const supabase = getSupabase();
    try {
      const { data } = await supabase.auth.getSession();
      if (!isCurrent(gen)) return;
      accessToken = data.session?.access_token ?? null;
    } catch {
      accessToken = null;
    }
    if (!isCurrent(gen)) return;
    // Keep the keepalive token fresh across background refreshes.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      accessToken = session?.access_token ?? null;
    });
    unsubAuth = () => sub.subscription.unsubscribe();

    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      window.addEventListener("pagehide", onPageHide);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    // Replay anything left from a prior session/offline stretch.
    if (profileId) {
      const result = await replayOutbox(userId, profileId, storage);
      if (!isCurrent(gen)) return;
      if (result.reauthNeeded) deps.onReauthNeeded();
    }
  }

  function stop(): void {
    stopped = true;
    // Supersede this session: any in-flight flushPending/persistLedger awaiting
    // the network will see the generation change and short-circuit before
    // touching shared state (the P0 cross-session guard).
    generation += 1;
    clearTimers();
    pending = false;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
    if (unsubAuth) {
      unsubAuth();
      unsubAuth = null;
    }
  }

  return {
    start,
    stop,
    notifySnapshotChange,
    notifyLedger,
    notifyFeedback,
    flushPending,
    flushOnHide,
  };
}
