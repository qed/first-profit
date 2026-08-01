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
import { fromSaveDoc, DOC_VERSION, type SaveDoc, type LedgerEntry } from "../state/gameCore";
import { getDraft, setDraft } from "./draftCache";

// ── Shared types ───────────────────────────────────────────────────────────

/** The columns a client is permitted to insert into fp_ledger (source is pinned). */
export interface LedgerInsertRow {
  id: string;
  kind: "sale" | "backing";
  payer: string;
  amountCents: number;
}

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

/** Unique-violation — for the ledger PK this means "already landed": success. */
const DUPLICATE_CODE = "23505";

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
      .select("id, kind, payer, amount_cents, created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(LEDGER_LOAD_LIMIT)) as { data: LedgerDbRow[] | null; error: PgError | null };
    if (error || !data) return [];
    const rows: LedgerEntry[] = [];
    for (const r of data) {
      if (
        typeof r.id === "string" &&
        (r.kind === "sale" || r.kind === "backing") &&
        typeof r.payer === "string" &&
        typeof r.amount_cents === "number" &&
        typeof r.created_at === "string"
      ) {
        rows.push({
          id: r.id,
          kind: r.kind,
          payer: r.payer,
          amountCents: r.amount_cents,
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
      })) as { error: PgError | null };
    if (!error) return { ok: true };
    if (pgCode(error) === DUPLICATE_CODE) return { ok: true };
    return classifyWriteError(error);
  } catch (error) {
    return classifyWriteError(error);
  }
}

// ── Outbox (account-scoped, localStorage) ────────────────────────────────────

/** Outbox schema version, mirroring docVersion. Bumped in lockstep with it. */
export const OUTBOX_VERSION = DOC_VERSION;

const OUTBOX_NAME = "outbox";

interface OutboxLedgerEntry {
  v: number;
  row: LedgerInsertRow;
}

interface OutboxSnapshotEntry {
  v: number;
  baseRevision: number;
  doc: SaveDoc;
}

export interface Outbox {
  ledger: OutboxLedgerEntry[];
  snapshot: OutboxSnapshotEntry | null;
}

function emptyOutbox(): Outbox {
  return { ledger: [], snapshot: null };
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
    (row.kind === "sale" || row.kind === "backing") &&
    typeof row.payer === "string" &&
    typeof row.amountCents === "number" &&
    Number.isFinite(row.amountCents)
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
  return { ledger, snapshot };
}

function writeOutbox(userId: string, outbox: Outbox, storage?: Storage): void {
  setDraft(userId, OUTBOX_NAME, outbox, storage);
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
  snapshot: SaveResult | null;
  reauthNeeded: boolean;
}

/**
 * Drain the outbox, in order: ledger inserts first, then the parked snapshot.
 * Idempotent — a ledger row whose id already exists resolves as success (23505);
 * the snapshot is idempotent by CAS. A retryable failure stops the drain and
 * preserves the remaining entries in order; a terminal failure drops the entry
 * (it would recur identically forever). A stale parked snapshot rejected by CAS
 * is dropped — the live tab holds current state and will schedule a fresh save.
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

  writeOutbox(userId, { ledger: remaining, snapshot: parkedSnapshot }, storage);
  return { ledgerSent, ledgerDroppedTerminal, snapshot, reauthNeeded };
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

// ── Sync engine ──────────────────────────────────────────────────────────────

/** Debounce window after the last save-doc change before a snapshot write. */
export const DEBOUNCE_MS = 3_000;
/** Hard ceiling — a stream of changes still flushes at least this often. */
export const MAX_INTERVAL_MS = 30_000;

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
  storage?: Storage;
}

export interface SyncEngine {
  start: () => Promise<void>;
  stop: () => void;
  /** A save-doc-relevant change happened — schedule a debounced snapshot. */
  notifySnapshotChange: () => void;
  /** A ledger row was optimistically added — persist it immediately + durably. */
  notifyLedger: (row: LedgerInsertRow) => void;
  /** Force the pending snapshot to flush now (async path). */
  flushPending: () => Promise<void>;
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

  async function flushPending(): Promise<void> {
    clearTimers();
    if (stopped || !pending || !profileId) return;
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

    if (!result.ok && result.reason === "cas-rejected") {
      // P0: the session may have ended during the network round-trip. Never issue
      // the rebase write under a superseded session.
      if (!isCurrent(gen)) return;
      // Refetch + rebase: re-save the CURRENT local doc against the fresh
      // revision. The server doc is discarded (this tab is authoritative for its
      // own snapshot); the CAS guard's job was only to reject the STALE write.
      const fresh = await loadSave(pid);
      const current = deps.getSnapshot();
      saveRevision = fresh.revision;
      saveDoc = current.doc;
      if (!isCurrent(gen)) return;
      result = await saveSnapshot(pid, saveRevision, saveDoc);
    }

    // P0: do not mutate the shared revision / outbox / status for a session that
    // has since been superseded — the new session owns persistence now.
    if (!isCurrent(gen)) return;

    if (result.ok) {
      deps.setRevision(result.revision);
      clearPendingSnapshot(userId, storage);
      setStatus("saved");
      return;
    }
    if (result.reason === "cas-rejected") {
      // Lost the CAS twice this round — reschedule rather than clobber.
      pending = true;
      setStatus("pending");
      scheduleDebounce();
      return;
    }
    if (result.reason === "terminal") {
      // A doc past the size cap / a trigger raise would retry-storm forever.
      clearPendingSnapshot(userId, storage);
      setStatus("error");
      return;
    }
    // Retryable (network / expired session): park the REBASED base/doc so replay
    // can actually succeed, then replay later.
    parkSnapshot(userId, saveRevision, saveDoc, storage);
    if (result.needsReauth) deps.onReauthNeeded();
    setStatus("pending");
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
    flushPending,
    flushOnHide,
  };
}
