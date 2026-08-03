import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted supabase mock ────────────────────────────────────────────────────
// A single mutable `handlers` object lets each test script the from()/auth chain
// results without re-mocking the module.
const { handlers, getSession, onAuthStateChange, unsubscribe } = vi.hoisted(() => ({
  handlers: {
    select: null as null | (() => unknown),
    update: null as null | ((patch: unknown) => unknown),
    insert: null as null | ((row: unknown) => unknown),
  },
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}));

function makeFrom() {
  return () => {
    const builder: Record<string, unknown> = {};
    // A load: .select().eq()*.maybeSingle(), or awaited directly. The handler is
    // invoked LAZILY (only at the terminal) so call counts are exact.
    builder.select = () => {
      const resolve = () => handlers.select?.() ?? { data: null, error: null };
      const chain: Record<string, unknown> = {
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve(resolve()),
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve(resolve()).then(onF, onR),
      };
      return chain;
    };
    // A CAS update tail: .update().eq()*.select() resolves to an array directly.
    builder.update = (patch: unknown) => {
      const tail: Record<string, unknown> = {};
      tail.eq = () => tail;
      tail.select = () =>
        Promise.resolve(handlers.update?.(patch) ?? { data: [{ profile_id: "p" }], error: null });
      return tail;
    };
    builder.insert = (row: unknown) =>
      Promise.resolve(handlers.insert?.(row) ?? { error: null });
    return builder;
  };
}

vi.mock("../supabase", () => ({
  getSupabase: () => ({
    from: makeFrom(),
    auth: { getSession, onAuthStateChange },
  }),
}));

vi.mock("../../config", () => ({
  getConfig: () => ({
    supabaseUrl: "https://supabase.test",
    supabaseAnonKey: "anon-key",
    t120ApiUrl: "https://api.test",
  }),
}));

import {
  resolveProfileId,
  resetProfileIdCache,
  loadSave,
  loadLedger,
  LEDGER_LOAD_LIMIT,
  saveSnapshot,
  insertLedger,
  classifyWriteError,
  classifyLedgerOutcome,
  readOutbox,
  enqueueLedger,
  parkSnapshot,
  replayOutbox,
  flushSnapshotViaKeepalive,
  flushLedgerViaKeepalive,
  createSyncEngine,
  KEEPALIVE_MAX_BYTES,
  OUTBOX_VERSION,
  insertFeedback,
  classifyFeedbackWriteError,
  classifyFeedbackOutcome,
  enqueueFeedback,
  isValidFeedbackRow,
  flushFeedbackViaKeepalive,
  feedbackCountForDay,
  bumpFeedbackCountForDay,
  utcDayToday,
  flushOutboxForPriorUser,
  FEEDBACK_BODY_MAX,
  FEEDBACK_DAILY_CAP,
  FEEDBACK_CAP_ERRCODE,
  FEEDBACK_TASK_ID_RE,
  FEEDBACK_TASK_ID_MAX,
  FEEDBACK_BANDS,
  unionCompletionMaps,
  type LedgerInsertRow,
  type FeedbackInsertRow,
} from "../sync";
import { DOC_VERSION, type Idea, type SaveDoc } from "../../state/gameCore";

// ── Fake Storage (Map-backed, node-safe) ─────────────────────────────────────
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

function docWith(overrides: Partial<SaveDoc> = {}): SaveDoc {
  return {
    docVersion: DOC_VERSION,
    ideas: [],
    activeIdea: 0,
    siteHeadline: "",
    onboardingComplete: false,
    ...overrides,
  };
}

const USER = "user-1";
const PROFILE = "profile-1";

function resetHandlers() {
  handlers.select = null;
  handlers.update = null;
  handlers.insert = null;
}

beforeEach(() => {
  resetHandlers();
  resetProfileIdCache();
  getSession.mockReset();
  onAuthStateChange.mockReset();
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
});

// ── resolveProfileId (RLS "own row") ─────────────────────────────────────────
describe("resolveProfileId", () => {
  it("returns the caller's own profile id and caches it for the session", async () => {
    let calls = 0;
    handlers.select = () => {
      calls += 1;
      return { data: { id: PROFILE }, error: null };
    };

    expect(await resolveProfileId()).toBe(PROFILE);
    expect(await resolveProfileId()).toBe(PROFILE);
    expect(calls).toBe(1); // second call served from cache
  });

  it("returns null when no row is visible (RLS returns nothing)", async () => {
    handlers.select = () => ({ data: null, error: null });
    expect(await resolveProfileId()).toBeNull();
  });
});

// ── loadSave ─────────────────────────────────────────────────────────────────
describe("loadSave", () => {
  it("parses a valid doc and returns its revision", async () => {
    const doc = docWith({ onboardingComplete: true, ideas: [{ fields: {}, done: {} }] });
    handlers.select = () => ({ data: { doc, revision: 7 }, error: null });

    const result = await loadSave(PROFILE);
    expect(result.revision).toBe(7);
    expect(result.doc?.onboardingComplete).toBe(true);
    expect(result.doc?.ideas).toHaveLength(1);
  });

  it("treats a freshly seeded empty '{}' doc as new (null doc) without warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    handlers.select = () => ({ data: { doc: {}, revision: 0 }, error: null });

    const result = await loadSave(PROFILE);
    expect(result.doc).toBeNull();
    expect(result.revision).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("DISCARDS an unknown-docVersion doc (never feeds the reducer) but keeps the revision", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    handlers.select = () => ({
      data: { doc: { docVersion: 999, ideas: [{ fields: {}, done: {} }] }, revision: 4 },
      error: null,
    });

    const result = await loadSave(PROFILE);
    expect(result.doc).toBeNull(); // discarded
    expect(result.revision).toBe(4); // base still usable for the next CAS
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("tolerates an absent row defensively", async () => {
    handlers.select = () => ({ data: null, error: null });
    const result = await loadSave(PROFILE);
    expect(result).toEqual({ doc: null, revision: 0 });
  });
});

// ── loadLedger (server read-back) ────────────────────────────────────────────
describe("loadLedger", () => {
  it("maps DB snake_case rows (incl. the fee columns) to the app LedgerEntry shape", async () => {
    handlers.select = () => ({
      data: [
        {
          id: "s1",
          kind: "sale",
          payer: "Mom",
          amount_cents: 2000,
          gross_cents: 2000,
          fee_cents: 88,
          net_cents: 1912,
          provider_id: "replit",
          created_at: "2026-07-31T00:02:00.000Z",
        },
      ],
      error: null,
    });
    const rows = await loadLedger(PROFILE);
    expect(rows).toEqual([
      {
        id: "s1",
        kind: "sale",
        payer: "Mom",
        amountCents: 2000,
        grossCents: 2000,
        feeCents: 88,
        netCents: 1912,
        providerId: "replit",
        createdAt: "2026-07-31T00:02:00.000Z",
      },
    ]);
  });

  it("DURABILITY: a legacy amount-only row (fee columns null) defaults gross=amount, fee=0, net=amount, providerId=null — no NaN", async () => {
    handlers.select = () => ({
      data: [
        {
          id: "legacy",
          kind: "sale",
          payer: "Gran",
          amount_cents: 1500,
          gross_cents: null,
          fee_cents: null,
          net_cents: null,
          provider_id: null,
          created_at: "2026-07-31T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const [row] = await loadLedger(PROFILE);
    expect(row).toEqual({
      id: "legacy",
      kind: "sale",
      payer: "Gran",
      amountCents: 1500,
      grossCents: 1500, // defaulted from amount_cents
      feeCents: 0,
      netCents: 1500, // defaulted from amount_cents
      providerId: null,
      createdAt: "2026-07-31T00:00:00.000Z",
    });
    // Explicitly guard the NaN-avoidance the durability requirement is about.
    expect(Number.isNaN(row.grossCents)).toBe(false);
    expect(Number.isNaN(row.feeCents)).toBe(false);
    expect(Number.isNaN(row.netCents)).toBe(false);
  });

  it("DURABILITY: a PARTIAL-null row (gross+fee present, net null) derives net = gross - fee (not amount_cents)", async () => {
    // A fee-bearing row whose net_cents somehow arrived null must NOT default net
    // to amount_cents (gross) — that would silently OVER-count the sale by the
    // fee. Derive net = gross - fee instead.
    handlers.select = () => ({
      data: [
        {
          id: "partial",
          kind: "sale",
          payer: "Mom",
          amount_cents: 2000,
          gross_cents: 2000,
          fee_cents: 88,
          net_cents: null,
          provider_id: "replit",
          created_at: "2026-07-31T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const [row] = await loadLedger(PROFILE);
    expect(row.netCents).toBe(1912); // gross - fee, NOT amount_cents (2000)
    expect(row.grossCents).toBe(2000);
    expect(row.feeCents).toBe(88);
    expect(Number.isNaN(row.netCents)).toBe(false);
  });

  it("DROPS a row with a null amount_cents (never defaulted; no NaN leaks)", async () => {
    // amount_cents is the RLS-bounded anchor; a row missing it is malformed and
    // must be dropped, not defaulted (a defaulted null would poison gross/net).
    handlers.select = () => ({
      data: [
        { id: "ok", kind: "sale", payer: "Mom", amount_cents: 500, created_at: "2026-07-31T00:00:00.000Z" },
        {
          id: "no-amount",
          kind: "sale",
          payer: "Mom",
          amount_cents: null,
          gross_cents: null,
          fee_cents: null,
          net_cents: null,
          provider_id: null,
          created_at: "2026-07-31T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const rows = await loadLedger(PROFILE);
    expect(rows.map((r) => r.id)).toEqual(["ok"]); // null-amount row dropped
    expect(rows.every((r) => !Number.isNaN(r.netCents))).toBe(true);
  });

  it("DROPS a 'backing' DB row (kind retired: only 'sale' is surfaced)", async () => {
    handlers.select = () => ({
      data: [
        { id: "s1", kind: "sale", payer: "Mom", amount_cents: 500, created_at: "2026-07-31T00:01:00.000Z" },
        { id: "b1", kind: "backing", payer: "Dad", amount_cents: 2500, created_at: "2026-07-31T00:00:00.000Z" },
      ],
      error: null,
    });
    const rows = await loadLedger(PROFILE);
    expect(rows.map((r) => r.id)).toEqual(["s1"]); // backing dropped
  });

  it("skips malformed rows and returns [] on error", async () => {
    handlers.select = () => ({
      data: [
        { id: "ok", kind: "sale", payer: "Mom", amount_cents: 500, created_at: "2026-07-31T00:00:00.000Z" },
        { id: "bad-amount", kind: "sale", payer: "Mom", amount_cents: "500", created_at: "2026-07-31T00:00:00.000Z" },
        { id: 7, kind: "sale", payer: "Mom", amount_cents: 500, created_at: "2026-07-31T00:00:00.000Z" },
        { id: "bad-kind", kind: "refund", payer: "Mom", amount_cents: 500, created_at: "2026-07-31T00:00:00.000Z" },
      ],
      error: null,
    });
    const rows = await loadLedger(PROFILE);
    expect(rows.map((r) => r.id)).toEqual(["ok"]);

    handlers.select = () => ({ data: null, error: { code: "PGRST301" } });
    expect(await loadLedger(PROFILE)).toEqual([]);
  });

  it("caps the read at LEDGER_LOAD_LIMIT (guards PostgREST truncation)", async () => {
    // The server would truncate at its own ceiling; the client cap is the .limit()
    // passed on the query. Assert the constant the query pins to is a sane bound.
    expect(LEDGER_LOAD_LIMIT).toBe(200);
    const many = Array.from({ length: LEDGER_LOAD_LIMIT }, (_, i) => ({
      id: `id-${i}`,
      kind: "sale",
      payer: "P",
      amount_cents: 100,
      created_at: "2026-07-31T00:00:00.000Z",
    }));
    handlers.select = () => ({ data: many, error: null });
    const rows = await loadLedger(PROFILE);
    expect(rows).toHaveLength(LEDGER_LOAD_LIMIT);
  });
});

// ── saveSnapshot (CAS) ───────────────────────────────────────────────────────
describe("saveSnapshot", () => {
  it("writes revision base+1 and reports the new revision on success", async () => {
    let sentPatch: Record<string, unknown> | null = null;
    handlers.update = (patch) => {
      sentPatch = patch as Record<string, unknown>;
      return { data: [{ profile_id: PROFILE }], error: null };
    };

    const result = await saveSnapshot(PROFILE, 5, docWith());
    expect(result).toEqual({ ok: true, revision: 6 });
    expect(sentPatch).not.toBeNull();
    expect((sentPatch as unknown as { revision: number }).revision).toBe(6);
  });

  it("classifies a ZERO-ROW response (200, no error, empty array) as cas-rejected", async () => {
    handlers.update = () => ({ data: [], error: null }); // stale base -> no rows matched
    const result = await saveSnapshot(PROFILE, 5, docWith());
    expect(result).toEqual({ ok: false, reason: "cas-rejected" });
  });

  it("a stale tab with MORE local actions still loses (CAS equality, not counter compare)", async () => {
    // The tab holds base=5 (and many un-flushed actions) but the DB is at 8.
    // The equality guard (`where revision = 5`) matches no rows -> rejected.
    handlers.update = (patch) => {
      const p = patch as { revision: number };
      // Only a base that equals the DB's current revision (8) would match.
      return p.revision === 9 ? { data: [{ profile_id: PROFILE }], error: null } : { data: [], error: null };
    };
    const result = await saveSnapshot(PROFILE, 5, docWith());
    expect(result).toEqual({ ok: false, reason: "cas-rejected" });
  });

  it("classifies a check-constraint / trigger violation as terminal", async () => {
    handlers.update = () => ({ data: null, error: { code: "23514", message: "doc too big" } });
    const result = await saveSnapshot(PROFILE, 5, docWith());
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: "terminal" }));
  });

  it("classifies an expired-session RLS refusal as retryable + needsReauth", async () => {
    handlers.update = () => ({ data: null, error: { code: "PGRST301", message: "JWT expired" } });
    const result = await saveSnapshot(PROFILE, 5, docWith());
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: "retryable", needsReauth: true }));
  });
});

// ── unionCompletionMaps (CAS rebase merge contract) ──────────────────────────
describe("unionCompletionMaps", () => {
  function idea(over: Partial<Idea> = {}): Idea {
    return { fields: {}, done: {}, ...over };
  }

  it("returns the local doc unchanged when the server doc is null (empty/unreadable row)", () => {
    const local = docWith({ ideas: [idea({ doneByTask: { "1.1.1": true } })] });
    expect(unionCompletionMaps(local, null)).toBe(local);
  });

  it("ADDS a server-only doneByTask completion; local-only completions are never removed", () => {
    const local = docWith({ ideas: [idea({ doneByTask: { "1.3.1": true } })] });
    const server = docWith({ ideas: [idea({ doneByTask: { "1.2.1": true } })] });
    const merged = unionCompletionMaps(local, server);
    expect(merged.ideas[0].doneByTask).toEqual({ "1.3.1": true, "1.2.1": true });
  });

  it("ADDS a server-only LEGACY completion (done + doneAt) into the local doc", () => {
    const local = docWith({ ideas: [idea()] });
    const server = docWith({
      ideas: [idea({ done: { "1.1#0": true }, doneAt: { "1.1#0": 777 } })],
    });
    const merged = unionCompletionMaps(local, server);
    expect(merged.ideas[0].done).toEqual({ "1.1#0": true });
    expect(merged.ideas[0].doneAt).toEqual({ "1.1#0": 777 });
  });

  it("LOCAL wins on both-present conflicts (done flags and timestamps)", () => {
    const local = docWith({
      ideas: [idea({ doneByTask: { "1.1.1": true }, doneAtByTask: { "1.1.1": 111 } })],
    });
    const server = docWith({
      ideas: [idea({ doneByTask: { "1.1.1": true }, doneAtByTask: { "1.1.1": 999 } })],
    });
    const merged = unionCompletionMaps(local, server);
    expect(merged.ideas[0].doneAtByTask).toEqual({ "1.1.1": 111 });
  });

  it("latest-intent values stay LOCAL-authoritative: fields, activeIdea, headline, provider", () => {
    const local = docWith({
      ideas: [idea({ fields: { oneLiner: "local" } })],
      activeIdea: 0,
      siteHeadline: "local headline",
      chosenProvider: { providerId: "shopify", chosenAt: 1 },
    });
    const server = docWith({
      ideas: [idea({ fields: { oneLiner: "server" }, doneByTask: { "1.1.1": true } })],
      activeIdea: 1,
      siteHeadline: "server headline",
      chosenProvider: { providerId: "replit", chosenAt: 2 },
    });
    const merged = unionCompletionMaps(local, server);
    expect(merged.ideas[0].fields).toEqual({ oneLiner: "local" });
    expect(merged.activeIdea).toBe(0);
    expect(merged.siteHeadline).toBe("local headline");
    expect(merged.chosenProvider).toEqual({ providerId: "shopify", chosenAt: 1 });
    // …while the server's completion still unions in.
    expect(merged.ideas[0].doneByTask).toEqual({ "1.1.1": true });
  });

  it("idea-count mismatch: EXTRA server ideas are APPENDED (a concurrent tab created one)", () => {
    const local = docWith({ ideas: [idea({ fields: { oneLiner: "first" } })] });
    const server = docWith({
      ideas: [idea(), idea({ fields: { oneLiner: "new idea" }, doneByTask: { "1.1.1": true } })],
    });
    const merged = unionCompletionMaps(local, server);
    expect(merged.ideas).toHaveLength(2);
    expect(merged.ideas[0].fields).toEqual({ oneLiner: "first" });
    expect(merged.ideas[1].fields).toEqual({ oneLiner: "new idea" });
    expect(merged.ideas[1].doneByTask).toEqual({ "1.1.1": true });
  });

  it("does not invent absent maps (absent-stays-absent on both sides)", () => {
    const merged = unionCompletionMaps(docWith({ ideas: [idea()] }), docWith({ ideas: [idea()] }));
    expect(merged.ideas[0]).not.toHaveProperty("doneByTask");
    expect(merged.ideas[0]).not.toHaveProperty("doneAtByTask");
    expect(merged.ideas[0]).not.toHaveProperty("doneAt");
  });
});

// ── insertLedger ─────────────────────────────────────────────────────────────
describe("insertLedger", () => {
  const row: LedgerInsertRow = { id: "led-1", kind: "sale", payer: "Mom", amountCents: 500 };

  it("inserts with source pinned to 'mock', the client id, and the (defaulted) fee columns", async () => {
    let sent: Record<string, unknown> | null = null;
    handlers.insert = (r) => {
      sent = r as Record<string, unknown>;
      return { error: null };
    };
    const result = await insertLedger(PROFILE, row);
    expect(result).toEqual({ ok: true });
    // A row without an explicit fee snapshot still writes coherent columns:
    // gross/net default to the gross amount, fee to 0, provider to null.
    expect(sent).toEqual({
      id: "led-1",
      profile_id: PROFILE,
      kind: "sale",
      source: "mock",
      payer: "Mom",
      amount_cents: 500,
      gross_cents: 500,
      fee_cents: 0,
      net_cents: 500,
      provider_id: null,
    });
  });

  it("writes the 4 fee columns from the row's snapshot (gross/fee/net/providerId)", async () => {
    let sent: Record<string, unknown> | null = null;
    handlers.insert = (r) => {
      sent = r as Record<string, unknown>;
      return { error: null };
    };
    const feeRow: LedgerInsertRow = {
      id: "led-fee",
      kind: "sale",
      payer: "Mom",
      amountCents: 2000,
      grossCents: 2000,
      feeCents: 88,
      netCents: 1912,
      providerId: "replit",
    };
    const result = await insertLedger(PROFILE, feeRow);
    expect(result).toEqual({ ok: true });
    expect(sent).toMatchObject({
      amount_cents: 2000,
      gross_cents: 2000,
      fee_cents: 88,
      net_cents: 1912,
      provider_id: "replit",
    });
  });

  it("classifies a duplicate-id insert (23505) as SUCCESS (already landed)", async () => {
    handlers.insert = () => ({ error: { code: "23505", message: "duplicate key" } });
    const result = await insertLedger(PROFILE, row);
    expect(result).toEqual({ ok: true });
  });

  it("classifies a network throw as retryable", async () => {
    handlers.insert = () => {
      throw new Error("network down");
    };
    const result = await insertLedger(PROFILE, row);
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: "retryable" }));
  });

  it("PARKS (keep, not drop) a PGRST204 missing-column insert (premature deploy / schema-cache window)", async () => {
    // If the FP build deploys before the T120 fee-column migration applies — or
    // during the PostgREST schema-cache reload window right after apply — the
    // insert fails with PGRST204. This is TRANSIENT-by-deploy: it must PARK in the
    // outbox and replay once the columns are live, never DROP the child's sale.
    handlers.insert = () => ({
      error: { code: "PGRST204", message: "could not find the 'gross_cents' column in the schema cache" },
    });
    const result = await insertLedger(PROFILE, row);
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: "retryable" }));
    // Prove the full classifier path routes it to KEEP (park), not DROP.
    expect(classifyLedgerOutcome(result)).toEqual({ decision: "keep", needsReauth: false });
  });

  it("PARKS (keep) a 42703 undefined_column insert too", async () => {
    handlers.insert = () => ({ error: { code: "42703", message: 'column "gross_cents" does not exist' } });
    const result = await insertLedger(PROFILE, row);
    expect(classifyLedgerOutcome(result)).toEqual({ decision: "keep", needsReauth: false });
  });

  it("ROUND-TRIP: an insertLedger payload echoed back through loadLedger preserves all 4 fee fields", async () => {
    let sent: Record<string, unknown> | null = null;
    handlers.insert = (r) => {
      sent = r as Record<string, unknown>;
      return { error: null };
    };
    const feeRow: LedgerInsertRow = {
      id: "rt-1",
      kind: "sale",
      payer: "Mom",
      amountCents: 2000,
      grossCents: 2000,
      feeCents: 88,
      netCents: 1912,
      providerId: "replit",
    };
    expect(await insertLedger(PROFILE, feeRow)).toEqual({ ok: true });
    // Echo the server-shaped row back (the DB adds created_at) and re-read it.
    handlers.select = () => ({
      data: [{ ...(sent as Record<string, unknown>), created_at: "2026-08-02T00:00:00.000Z" }],
      error: null,
    });
    const [row] = await loadLedger(PROFILE);
    expect(row).toEqual({
      id: "rt-1",
      kind: "sale",
      payer: "Mom",
      amountCents: 2000,
      grossCents: 2000,
      feeCents: 88,
      netCents: 1912,
      providerId: "replit",
      createdAt: "2026-08-02T00:00:00.000Z",
    });
  });
});

// ── classifyWriteError ───────────────────────────────────────────────────────
describe("classifyWriteError", () => {
  it("maps trigger raise (P0001) to terminal", () => {
    expect(classifyWriteError({ code: "P0001" })).toEqual(
      expect.objectContaining({ reason: "terminal" }),
    );
  });
  it("maps a bare RLS refusal (42501) to retryable + needsReauth", () => {
    expect(classifyWriteError({ code: "42501" })).toEqual(
      expect.objectContaining({ reason: "retryable", needsReauth: true }),
    );
  });
  it("maps a codeless (network/offline) error to plain retryable", () => {
    expect(classifyWriteError(new Error("boom"))).toEqual(
      expect.objectContaining({ reason: "retryable", needsReauth: false }),
    );
  });

  it("maps a missing-column error (PGRST204 schema-cache / 42703 undefined_column) to retryable, NOT terminal", () => {
    // Transient-by-deploy: the columns/schema-cache reload are not live yet. Park
    // + replay once they are — a terminal classification here would DROP the sale.
    expect(classifyWriteError({ code: "PGRST204", message: "schema cache" })).toEqual(
      expect.objectContaining({ reason: "retryable", needsReauth: false }),
    );
    expect(classifyWriteError({ code: "42703", message: "undefined column" })).toEqual(
      expect.objectContaining({ reason: "retryable", needsReauth: false }),
    );
  });

  it("maps an UNRECOGNIZED postgres error code to terminal (never wedge the queue)", () => {
    // A DB error carrying a code we don't list recurs identically on replay; if it
    // were retryable it would jam the outbox FIRST forever. Default it to terminal.
    expect(classifyWriteError({ code: "22P02", message: "invalid input syntax" })).toEqual(
      expect.objectContaining({ reason: "terminal" }),
    );
  });
});

// ── Outbox ───────────────────────────────────────────────────────────────────
describe("outbox", () => {
  const row: LedgerInsertRow = { id: "led-1", kind: "sale", payer: "Mom", amountCents: 500 };

  it("enqueues ledger inserts idempotently by id", () => {
    const s = fakeStorage();
    enqueueLedger(USER, row, s);
    enqueueLedger(USER, row, s); // same id -> no duplicate
    expect(readOutbox(USER, s).ledger).toHaveLength(1);
  });

  it("DISCARDS entries with an unknown `v` at read (never fed to a newer writer)", () => {
    const s = fakeStorage();
    // Hand-write an outbox with a mix of current and future-version entries.
    s.setItem(
      `fp:${USER}:outbox`,
      JSON.stringify({
        ledger: [
          { v: OUTBOX_VERSION, row },
          { v: OUTBOX_VERSION + 1, row: { ...row, id: "future" } },
        ],
        snapshot: { v: OUTBOX_VERSION + 1, baseRevision: 0, doc: docWith() },
      }),
    );
    const outbox = readOutbox(USER, s);
    expect(outbox.ledger).toHaveLength(1);
    expect(outbox.ledger[0].row.id).toBe("led-1");
    expect(outbox.snapshot).toBeNull(); // unknown-v snapshot discarded
  });

  it("DROPS a versioned-but-malformed ledger entry (poison-pill) before it can jam the queue", () => {
    const s = fakeStorage();
    // A current-version entry whose amountCents is a non-numeric string would
    // provoke a non-terminal Postgres error, be retried, and wedge the queue.
    s.setItem(
      `fp:${USER}:outbox`,
      JSON.stringify({
        ledger: [
          { v: OUTBOX_VERSION, row: { ...row, id: "poison", amountCents: "not-a-number" } },
          { v: OUTBOX_VERSION, row: { ...row, id: "bad-kind", kind: "refund" } },
          { v: OUTBOX_VERSION, row: { ...row, id: "bad-payer", payer: 42 } },
          { v: OUTBOX_VERSION, row },
        ],
        snapshot: null,
      }),
    );
    const outbox = readOutbox(USER, s);
    expect(outbox.ledger.map((e) => e.row.id)).toEqual(["led-1"]); // only the valid row survives
  });

  it("DROPS a 'backing' ledger entry (kind retired: only 'sale' survives the validator)", () => {
    const s = fakeStorage();
    s.setItem(
      `fp:${USER}:outbox`,
      JSON.stringify({
        ledger: [
          { v: OUTBOX_VERSION, row: { ...row, id: "backing", kind: "backing" } },
          { v: OUTBOX_VERSION, row },
        ],
        snapshot: null,
      }),
    );
    expect(readOutbox(USER, s).ledger.map((e) => e.row.id)).toEqual(["led-1"]);
  });

  it("DISCARDS a parked snapshot whose doc fails the SaveDoc shape/version gate", () => {
    const s = fakeStorage();
    // Current `v`, but the doc's docVersion is wrong: an unvalidated PATCH of this
    // would bump the revision and make the next loadSave reject a good save.
    s.setItem(
      `fp:${USER}:outbox`,
      JSON.stringify({
        ledger: [],
        snapshot: { v: OUTBOX_VERSION, baseRevision: 3, doc: { docVersion: 999, ideas: [] } },
      }),
    );
    expect(readOutbox(USER, s).snapshot).toBeNull();
  });

  it("KEEPS a parked snapshot whose doc passes the gate (validated, normalized)", () => {
    const s = fakeStorage();
    parkSnapshot(USER, 3, docWith({ onboardingComplete: true }), s);
    const parked = readOutbox(USER, s).snapshot;
    expect(parked).not.toBeNull();
    expect(parked?.baseRevision).toBe(3);
    expect(parked?.doc.onboardingComplete).toBe(true);
  });
});

// ── replayOutbox ─────────────────────────────────────────────────────────────
describe("replayOutbox", () => {
  it("replays queued ledger inserts IN ORDER and resolves them; a 23505 replay is success", async () => {
    const s = fakeStorage();
    const a: LedgerInsertRow = { id: "a", kind: "sale", payer: "A", amountCents: 100 };
    const b: LedgerInsertRow = { id: "b", kind: "sale", payer: "B", amountCents: 200 };
    enqueueLedger(USER, a, s);
    enqueueLedger(USER, b, s);

    const seen: string[] = [];
    handlers.insert = (r) => {
      const row = r as { id: string };
      seen.push(row.id);
      // `a` already landed on a prior try (duplicate); `b` inserts fresh.
      return row.id === "a" ? { error: { code: "23505" } } : { error: null };
    };

    const result = await replayOutbox(USER, PROFILE, s);
    expect(seen).toEqual(["a", "b"]); // order preserved
    expect(result.ledgerSent).toBe(2);
    expect(readOutbox(USER, s).ledger).toHaveLength(0); // both resolved, no storm
  });

  it("stops the drain on a retryable failure and PRESERVES the remaining entries in order", async () => {
    const s = fakeStorage();
    enqueueLedger(USER, { id: "a", kind: "sale", payer: "A", amountCents: 100 }, s);
    enqueueLedger(USER, { id: "b", kind: "sale", payer: "B", amountCents: 200 }, s);

    handlers.insert = (r) => {
      const row = r as { id: string };
      return row.id === "a" ? { error: null } : { error: new Error("offline") };
    };

    const result = await replayOutbox(USER, PROFILE, s);
    expect(result.ledgerSent).toBe(1);
    const remaining = readOutbox(USER, s).ledger;
    expect(remaining.map((e) => e.row.id)).toEqual(["b"]); // b kept for later
  });

  it("drops a terminal ledger entry (no infinite replay)", async () => {
    const s = fakeStorage();
    enqueueLedger(USER, { id: "a", kind: "sale", payer: "A", amountCents: 100 }, s);
    handlers.insert = () => ({ error: { code: "23514" } }); // structural rejection
    const result = await replayOutbox(USER, PROFILE, s);
    expect(result.ledgerDroppedTerminal).toBe(1);
    expect(readOutbox(USER, s).ledger).toHaveLength(0);
  });

  it("sends a parked snapshot and clears it on success", async () => {
    const s = fakeStorage();
    parkSnapshot(USER, 3, docWith({ onboardingComplete: true }), s);
    handlers.update = () => ({ data: [{ profile_id: PROFILE }], error: null });
    const result = await replayOutbox(USER, PROFILE, s);
    expect(result.snapshot).toEqual({ ok: true, revision: 4 });
    expect(readOutbox(USER, s).snapshot).toBeNull();
  });

  it("drops a stale parked snapshot rejected by CAS (live state will re-save)", async () => {
    const s = fakeStorage();
    parkSnapshot(USER, 3, docWith(), s);
    handlers.update = () => ({ data: [], error: null }); // CAS reject
    const result = await replayOutbox(USER, PROFILE, s);
    expect(result.snapshot).toEqual({ ok: false, reason: "cas-rejected" });
    expect(readOutbox(USER, s).snapshot).toBeNull();
  });
});

// ── Keepalive flush ──────────────────────────────────────────────────────────
describe("keepalive flush", () => {
  const auth = { supabaseUrl: "https://supabase.test", apikey: "anon-key", accessToken: "tok" };

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  it("PATCHes the CAS with apikey + Authorization headers attached manually", () => {
    const res = flushSnapshotViaKeepalive(auth, PROFILE, 5, docWith());
    expect(res).toEqual({ sent: true });
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/rest/v1/fp_player_saves");
    expect(url).toContain("revision=eq.5");
    expect(init.method).toBe("PATCH");
    expect(init.keepalive).toBe(true);
    expect(init.headers.apikey).toBe("anon-key");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body).revision).toBe(6);
  });

  it("does NOT send an over-cap body — reports too-large so the caller parks it", () => {
    const huge = docWith({ siteHeadline: "x".repeat(KEEPALIVE_MAX_BYTES + 10) });
    const res = flushSnapshotViaKeepalive(auth, PROFILE, 5, huge);
    expect(res).toEqual({ sent: false, reason: "too-large" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("POSTs a ledger row with source pinned to mock", () => {
    const row: LedgerInsertRow = { id: "led-1", kind: "sale", payer: "Mom", amountCents: 500 };
    flushLedgerViaKeepalive(auth, PROFILE, row);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/rest/v1/fp_ledger");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).source).toBe("mock");
  });
});

// ── Sync engine ──────────────────────────────────────────────────────────────
describe("createSyncEngine", () => {
  let statuses: string[];
  let revision: number;
  let doc: SaveDoc;
  let reauth: number;

  let engineStorage: Storage;
  let setRevisionCalls: number;

  function makeEngine() {
    statuses = [];
    revision = 5;
    doc = docWith();
    reauth = 0;
    setRevisionCalls = 0;
    engineStorage = fakeStorage();
    return createSyncEngine({
      userId: USER,
      storage: engineStorage,
      getSnapshot: () => ({ doc, revision }),
      setRevision: (r) => {
        setRevisionCalls += 1;
        revision = r;
      },
      onStatus: (s) => statuses.push(s),
      onReauthNeeded: () => {
        reauth += 1;
      },
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    handlers.select = () => ({ data: { id: PROFILE }, error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces a snapshot change and writes revision base+1 after ~3s", async () => {
    const engine = makeEngine();
    // Capture the patch and assert AFTER the awaited flush — asserting inside the
    // handler would let saveSnapshot's try/catch reclassify the thrown
    // AssertionError as a retryable error and swallow it.
    let sentRevision: number | null = null;
    handlers.update = (patch) => {
      sentRevision = (patch as { revision: number }).revision;
      return { data: [{ profile_id: PROFILE }], error: null };
    };
    await engine.start();

    engine.notifySnapshotChange();
    expect(statuses).not.toContain("saving"); // still debouncing

    await vi.advanceTimersByTimeAsync(3_000);
    expect(sentRevision).toBe(6); // base(5) + 1
    expect(statuses).toContain("saving");
    expect(statuses).toContain("saved");
    expect(revision).toBe(6); // base adopted
    engine.stop();
  });

  it("fires a ledger insert immediately with a stable client id", async () => {
    const engine = makeEngine();
    const seen: string[] = [];
    handlers.insert = (r) => {
      seen.push((r as { id: string }).id);
      return { error: null };
    };
    await engine.start();

    engine.notifyLedger({ id: "led-9", kind: "sale", payer: "Kid", amountCents: 300 });
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual(["led-9"]);
    engine.stop();
  });

  it("on CAS rejection, refetches + rebases the current local doc, then succeeds", async () => {
    const engine = makeEngine();
    let attempt = 0;
    handlers.update = () => {
      attempt += 1;
      // First write (base=5) is stale -> zero rows; after refetch (base=8) it wins.
      return attempt === 1
        ? { data: [], error: null }
        : { data: [{ profile_id: PROFILE }], error: null };
    };
    // start() resolves the profile via select (beforeEach points it at the
    // profile row). Only AFTER the engine has cached the profile id do we
    // re-point select at the save row, so the CAS refetch reads revision 8.
    await engine.start();
    handlers.select = () => ({ data: { doc, revision: 8 }, error: null });

    engine.notifySnapshotChange();
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(attempt).toBeGreaterThanOrEqual(2);
    expect(revision).toBe(9); // rebased base(8) + 1
    expect(statuses).toContain("saved");
    engine.stop();
  });

  it("CAS reject → the rebased write UNIONS the concurrent session's completions, keeps local intent", async () => {
    const engine = makeEngine();
    // Local tab: completed 1.3.1 (stable-only) and holds its own field text.
    doc = docWith({
      ideas: [{ fields: { oneLiner: "local" }, done: {}, doneByTask: { "1.3.1": true } }],
    });
    const sentDocs: SaveDoc[] = [];
    let attempt = 0;
    handlers.update = (patch) => {
      attempt += 1;
      sentDocs.push((patch as { doc: SaveDoc }).doc);
      return attempt === 1
        ? { data: [], error: null } // stale base: the concurrent session won the race
        : { data: [{ profile_id: PROFILE }], error: null };
    };
    await engine.start();
    // Server doc (the concurrent session's save): a legacy completion (1.1#0,
    // with its timestamp), a stable completion (1.2.1), and its own field text.
    const serverDoc = docWith({
      ideas: [
        {
          fields: { oneLiner: "server" },
          done: { "1.1#0": true },
          doneAt: { "1.1#0": 777 },
          doneByTask: { "1.2.1": true },
        },
      ],
    });
    handlers.select = () => ({ data: { doc: serverDoc, revision: 8 }, error: null });

    engine.notifySnapshotChange();
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(0);

    const rebased = sentDocs[1];
    // Server-only completions survive the rebase: the raw legacy key, its
    // loadSave-migrated stable id (with timestamp), and the stable-only key.
    expect(rebased.ideas[0].done["1.1#0"]).toBe(true);
    expect(rebased.ideas[0].doneByTask?.["1.1.1"]).toBe(true);
    expect(rebased.ideas[0].doneAtByTask?.["1.1.1"]).toBe(777);
    expect(rebased.ideas[0].doneByTask?.["1.2.1"]).toBe(true);
    // Local completions kept; latest-intent text stays LOCAL-authoritative.
    expect(rebased.ideas[0].doneByTask?.["1.3.1"]).toBe(true);
    expect(rebased.ideas[0].fields).toEqual({ oneLiner: "local" });
    expect(revision).toBe(9); // rebased base(8) + 1
    expect(statuses).toContain("saved");
    engine.stop();
  });

  it("on an expired session, parks the snapshot in the outbox and signals reauth", async () => {
    const storage = fakeStorage();
    revision = 5;
    doc = docWith();
    statuses = [];
    reauth = 0;
    const engine = createSyncEngine({
      userId: USER,
      storage,
      getSnapshot: () => ({ doc, revision }),
      setRevision: (r) => {
        revision = r;
      },
      onStatus: (s) => statuses.push(s),
      onReauthNeeded: () => {
        reauth += 1;
      },
    });
    handlers.update = () => ({ data: null, error: { code: "PGRST301", message: "JWT expired" } });
    await engine.start();

    engine.notifySnapshotChange();
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(reauth).toBe(1);
    expect(statuses).toContain("pending");
    expect(readOutbox(USER, storage).snapshot).not.toBeNull(); // parked, not dropped
    engine.stop();
  });

  it("on a terminal violation, sets the persistent 'couldn't save' status and does NOT park", async () => {
    const storage = fakeStorage();
    revision = 5;
    doc = docWith();
    statuses = [];
    const engine = createSyncEngine({
      userId: USER,
      storage,
      getSnapshot: () => ({ doc, revision }),
      setRevision: (r) => {
        revision = r;
      },
      onStatus: (s) => statuses.push(s),
      onReauthNeeded: () => undefined,
    });
    handlers.update = () => ({ data: null, error: { code: "23514", message: "doc too big" } });
    await engine.start();

    engine.notifySnapshotChange();
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(statuses[statuses.length - 1]).toBe("error");
    expect(readOutbox(USER, storage).snapshot).toBeNull(); // NOT parked -> no replay storm
    engine.stop();
  });

  // ── P0: cross-session write guard (the shared-device corruption bug) ────────
  it("an in-flight save whose engine is stopped mid-flight does NOT issue the rebase write or mutate revision", async () => {
    const engine = makeEngine();

    // Control the FIRST saveSnapshot so it is genuinely in flight across stop().
    let releaseFirst: () => void = () => undefined;
    let updateCalls = 0;
    handlers.update = () => {
      updateCalls += 1;
      if (updateCalls === 1) {
        // A stale base -> the flush would proceed to loadSave + a rebase write.
        return new Promise((resolve) => {
          releaseFirst = () => resolve({ data: [], error: null });
        });
      }
      return { data: [{ profile_id: PROFILE }], error: null };
    };
    await engine.start();

    engine.notifySnapshotChange();
    await vi.advanceTimersByTimeAsync(3_000); // flushPending runs, awaits saveSnapshot

    // Simulate a session switch on the shared device: child B's state is now live
    // in the shared refs, and the engine is torn down for the new session.
    doc = docWith({ onboardingComplete: true, ideas: [{ fields: {}, done: {} }] });
    revision = 99;
    engine.stop(); // bumps the generation

    releaseFirst(); // first save resolves (cas-rejected)
    await vi.advanceTimersByTimeAsync(0);

    // The rebase write (which would carry B's doc under A's profile_id) never fires,
    // and A's flush never writes the shared revision.
    expect(updateCalls).toBe(1);
    expect(setRevisionCalls).toBe(0);
    expect(revision).toBe(99); // B's revision untouched by A's superseded flush
  });

  // ── P1: rebase then retryable-failure parks the REBASED base (not the stale) ─
  it("cas-rejected -> rebase -> rebased retry fails retryable: parks the REBASED revision/doc", async () => {
    const engine = makeEngine();
    let attempt = 0;
    handlers.update = () => {
      attempt += 1;
      // 1st (base=5): stale -> zero rows. 2nd (rebased base=8): retryable network fail.
      return attempt === 1
        ? { data: [], error: null }
        : { data: null, error: new Error("network dropped") };
    };
    await engine.start();
    const rebasedDoc = docWith({ onboardingComplete: true });
    // After start caches the profile id, re-point select at the save row so the
    // CAS refetch reads revision 8, and make the current doc the rebased one.
    handlers.select = () => ({ data: { doc: rebasedDoc, revision: 8 }, error: null });
    doc = rebasedDoc;

    engine.notifySnapshotChange();
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(0);

    const parked = readOutbox(USER, engineStorage).snapshot;
    expect(parked).not.toBeNull();
    // The parked base is the REBASED 8 (not the stale 5), so replay can CAS-succeed.
    expect(parked?.baseRevision).toBe(8);
    expect(parked?.doc.onboardingComplete).toBe(true);
    engine.stop();
  });

  // ── P2 + flushOnHide coverage ───────────────────────────────────────────────
  it("flushOnHide with NO access token parks the pending snapshot (not lost)", async () => {
    const engine = makeEngine();
    getSession.mockResolvedValue({ data: { session: null } }); // no token
    await engine.start();

    engine.notifySnapshotChange();
    engine.flushOnHide();

    expect(readOutbox(USER, engineStorage).snapshot).not.toBeNull();
    engine.stop();
  });

  it("flushOnHide with an oversized body parks the snapshot after the too-large keepalive", async () => {
    const engine = makeEngine();
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    await engine.start();

    doc = docWith({ siteHeadline: "x".repeat(KEEPALIVE_MAX_BYTES + 10) });
    engine.notifySnapshotChange();
    engine.flushOnHide();

    const parked = readOutbox(USER, engineStorage).snapshot;
    expect(parked).not.toBeNull(); // parked, not dropped
    engine.stop();
  });

  it("flushOnHide parks the snapshot BEFORE the best-effort keepalive send (normal path)", async () => {
    const engine = makeEngine();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    await engine.start();

    engine.notifySnapshotChange();
    engine.flushOnHide();

    // Durable park happened regardless of whether the keepalive completes.
    expect(readOutbox(USER, engineStorage).snapshot).not.toBeNull();
    // And the keepalive PATCH was still attempted as the fast path.
    const patchCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as { method?: string }).method === "PATCH",
    );
    expect(patchCalls).toHaveLength(1);
    engine.stop();
  });

  it("flushOnHide fires queued outbox ledger entries via keepalive", async () => {
    const engine = makeEngine();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    // Leave a ledger entry queued (an insert that never confirmed).
    handlers.insert = () => ({ error: new Error("offline") });
    await engine.start();

    engine.notifyLedger({ id: "led-h", kind: "sale", payer: "Kid", amountCents: 250 });
    await vi.advanceTimersByTimeAsync(0);
    expect(readOutbox(USER, engineStorage).ledger).toHaveLength(1); // still queued

    engine.flushOnHide();
    const postCalls = fetchMock.mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("/rest/v1/fp_ledger"),
    );
    expect(postCalls).toHaveLength(1);
    engine.stop();
  });

  // ── Feedback ("Stuck? Tell us") engine paths ────────────────────────────────
  it("notifyFeedback enqueues durably then resolves 'sent' on a landed insert", async () => {
    const engine = makeEngine();
    let sent: Record<string, unknown> | null = null;
    handlers.insert = (r) => {
      sent = r as Record<string, unknown>;
      return { error: null };
    };
    await engine.start();

    const outcome = await engine.notifyFeedback({
      id: "fb-1",
      taskId: "1.2.5",
      band: "unknown",
      body: "stuck here",
    });
    expect(outcome).toBe("sent");
    // The row shape the DB sees: snake_case columns, NEVER created_at (the
    // column-scoped INSERT grant excludes it; sending it fails the insert).
    expect(sent).toEqual({
      id: "fb-1",
      profile_id: PROFILE,
      task_id: "1.2.5",
      band: "unknown",
      body: "stuck here",
    });
    expect(readOutbox(USER, engineStorage).feedback).toHaveLength(0); // resolved
    engine.stop();
  });

  it("notifyFeedback with a missing TABLE (PGRST205) resolves 'queued' and the entry stays parked", async () => {
    const engine = makeEngine();
    handlers.insert = () => ({
      error: { code: "PGRST205", message: "could not find the table 'public.fp_task_feedback' in the schema cache" },
    });
    await engine.start();

    const outcome = await engine.notifyFeedback({ id: "fb-2", taskId: "1.1.1", band: "unknown", body: "" });
    expect(outcome).toBe("queued");
    expect(readOutbox(USER, engineStorage).feedback).toHaveLength(1); // parked, not dropped
    engine.stop();
  });

  it("notifyFeedback FP429 resolves 'capped': entry RESOLVED out of the outbox (never parked, never silent) and the local day counter pinned to the cap", async () => {
    const engine = makeEngine();
    handlers.insert = () => ({
      error: { code: FEEDBACK_CAP_ERRCODE, message: "fp_task_feedback: daily feedback cap reached" },
    });
    await engine.start();

    const outcome = await engine.notifyFeedback({
      id: "fb-cap",
      taskId: "1.1.1",
      band: "unknown",
      body: "",
    });
    expect(outcome).toBe("capped"); // the child SEES the capped copy — not "sent", not silence
    expect(readOutbox(USER, engineStorage).feedback).toHaveLength(0); // removed, not parked
    // Server cap adopted locally: the next tap short-circuits to 'capped'
    // without another doomed insert.
    expect(feedbackCountForDay(USER, utcDayToday(), engineStorage)).toBe(FEEDBACK_DAILY_CAP);
    engine.stop();
  });

  it("notifyFeedback whose outbox write is REFUSED (storage quota) resolves 'dropped' without throwing or inserting undurably", async () => {
    const engine = makeEngine();
    await engine.start();
    let inserts = 0;
    handlers.insert = () => {
      inserts += 1;
      return { error: null };
    };
    // Every subsequent write to the engine's storage now fails (quota).
    engineStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };

    const outcome = await engine.notifyFeedback({
      id: "fb-q",
      taskId: "1.1.2",
      band: "unknown",
      body: "full disk",
    });
    expect(outcome).toBe("dropped"); // honest: the row is not durable anywhere
    expect(inserts).toBe(0); // no network attempt for an undurable row
    // The day counter was not corrupted by the failed write path.
    expect(feedbackCountForDay(USER, utcDayToday(), engineStorage)).toBe(0);
    engine.stop();
  });

  it("start() records the resolved profile id under fp:<uid>:profileId (for the pre-wipe prior-user flush)", async () => {
    const engine = makeEngine();
    await engine.start();
    expect(JSON.parse(engineStorage.getItem(`fp:${USER}:profileId`) as string)).toBe(PROFILE);
    engine.stop();
  });

  it("GENERATION GUARD: a feedback insert resolving after stop() never touches the live session's reauth path", async () => {
    const engine = makeEngine();
    let release: (v: unknown) => void = () => undefined;
    handlers.insert = () => new Promise((resolve) => {
      release = resolve;
    });
    await engine.start();

    const pending = engine.notifyFeedback({ id: "fb-3", taskId: "1.1.2", band: "unknown", body: "x" });
    engine.stop(); // session switch on the shared device; generation bumps.
    release({ error: { code: "42501", message: "RLS refusal" } }); // retryable + needsReauth
    const outcome = await pending;

    expect(outcome).toBe("queued"); // still honestly parked in USER's own outbox
    expect(reauth).toBe(0); // but the superseded session never drives the live UI
    expect(readOutbox(USER, engineStorage).feedback).toHaveLength(1);
  });

  it("notifyFeedback on a STOPPED engine refuses ('dropped') and enqueues nothing", async () => {
    const engine = makeEngine();
    await engine.start();
    engine.stop();
    const outcome = await engine.notifyFeedback({ id: "fb-4", taskId: "1.1.1", band: "unknown", body: "" });
    expect(outcome).toBe("dropped");
    expect(readOutbox(USER, engineStorage).feedback).toHaveLength(0);
  });

  it("flushOnHide fires queued feedback entries via keepalive (no created_at in the body)", async () => {
    const engine = makeEngine();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
    handlers.insert = () => ({ error: new Error("offline") });
    await engine.start();

    await engine.notifyFeedback({ id: "fb-5", taskId: "1.2.3", band: "unknown", body: "help" });
    expect(readOutbox(USER, engineStorage).feedback).toHaveLength(1); // still queued

    engine.flushOnHide();
    const posts = fetchMock.mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("/rest/v1/fp_task_feedback"),
    );
    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0][1].body as string) as Record<string, unknown>;
    expect(body).toEqual({ id: "fb-5", profile_id: PROFILE, task_id: "1.2.3", band: "unknown", body: "help" });
    expect("created_at" in body).toBe(false);
    engine.stop();
  });

  // ── persistLedger immediate-write terminal branch ───────────────────────────
  it("an immediate ledger insert that fails terminally is dropped (outbox empty) and status ends error", async () => {
    const engine = makeEngine();
    handlers.insert = () => ({ error: { code: "23514", message: "amount out of bounds" } });
    await engine.start();

    engine.notifyLedger({ id: "led-t", kind: "sale", payer: "Kid", amountCents: 999999 });
    await vi.advanceTimersByTimeAsync(0);

    expect(readOutbox(USER, engineStorage).ledger).toHaveLength(0); // dropped, not stuck
    expect(statuses[statuses.length - 1]).toBe("error");
    engine.stop();
  });
});

// ── Feedback ("Stuck? Tell us") module paths ─────────────────────────────────
describe("insertFeedback + classification", () => {
  const row: FeedbackInsertRow = { id: "fb-1", taskId: "1.2.5", band: "unknown", body: "stuck" };

  it("inserts the row (no created_at) and reports ok", async () => {
    let sent: Record<string, unknown> | null = null;
    handlers.insert = (r) => {
      sent = r as Record<string, unknown>;
      return { error: null };
    };
    expect(await insertFeedback(PROFILE, row)).toEqual({ ok: true });
    expect(sent).toEqual({
      id: "fb-1",
      profile_id: PROFILE,
      task_id: "1.2.5",
      band: "unknown",
      body: "stuck",
    });
    expect("created_at" in (sent as unknown as Record<string, unknown>)).toBe(false);
  });

  it("classifies a duplicate-id insert (23505) as SUCCESS (already landed)", async () => {
    handlers.insert = () => ({ error: { code: "23505", message: "duplicate key" } });
    expect(await insertFeedback(PROFILE, row)).toEqual({ ok: true });
  });

  it("PARKS (keep) a missing-TABLE insert: PGRST205 schema-cache and 42P01 undefined_table", async () => {
    // The table ships in a separate deploy lane (T120 migration). A report sent
    // before it lands must PARK and replay, never DROP — else every pre-deploy
    // stuck report is silently lost.
    handlers.insert = () => ({
      error: { code: "PGRST205", message: "could not find the table in the schema cache" },
    });
    let result = await insertFeedback(PROFILE, row);
    expect(classifyFeedbackOutcome(result)).toEqual({ decision: "keep", needsReauth: false });

    handlers.insert = () => ({ error: { code: "42P01", message: "relation does not exist" } });
    result = await insertFeedback(PROFILE, row);
    expect(classifyFeedbackOutcome(result)).toEqual({ decision: "keep", needsReauth: false });
  });

  it("FP429 (daily-cap trigger) classifies as the DISTINCT 'capped' outcome, end to end", async () => {
    expect(classifyFeedbackWriteError({ code: FEEDBACK_CAP_ERRCODE })).toEqual(
      expect.objectContaining({ ok: false, reason: "capped" }),
    );
    handlers.insert = () => ({
      error: { code: "FP429", message: "fp_task_feedback: daily feedback cap reached" },
    });
    const result = await insertFeedback(PROFILE, row);
    expect(classifyFeedbackOutcome(result)).toEqual({ decision: "capped", needsReauth: false });
  });

  it("23503 (profile provisioning race) is retryable for FEEDBACK ONLY; the ledger keeps it terminal", () => {
    // A brand-new child's first tap can race the service-role profile
    // provisioning: park + replay once the profile exists.
    expect(classifyFeedbackWriteError({ code: "23503" })).toEqual(
      expect.objectContaining({ reason: "retryable", needsReauth: false }),
    );
    // The ledger's classification is deliberately UNCHANGED (pre-existing
    // terminal posture; out of this unit's scope).
    expect(classifyWriteError({ code: "23503" })).toEqual(
      expect.objectContaining({ reason: "terminal" }),
    );
  });

  it("keeps the ledger rules otherwise: terminal drops, auth parks with reauth, unknown code terminal", async () => {
    // The daily-cap trigger raise (P0001) and CHECK violations (23514) recur
    // identically forever -> drop.
    expect(classifyFeedbackWriteError({ code: "P0001" })).toEqual(
      expect.objectContaining({ reason: "terminal" }),
    );
    expect(classifyFeedbackWriteError({ code: "23514" })).toEqual(
      expect.objectContaining({ reason: "terminal" }),
    );
    expect(classifyFeedbackWriteError({ code: "42501" })).toEqual(
      expect.objectContaining({ reason: "retryable", needsReauth: true }),
    );
    expect(classifyFeedbackWriteError({ code: "22P02" })).toEqual(
      expect.objectContaining({ reason: "terminal" }),
    );
    handlers.insert = () => ({ error: { code: "23514", message: "body too long" } });
    const result = await insertFeedback(PROFILE, row);
    expect(classifyFeedbackOutcome(result)).toEqual({ decision: "drop", needsReauth: false });
  });
});

describe("feedback outbox (CHECK mirror + queue)", () => {
  const row: FeedbackInsertRow = { id: "fb-1", taskId: "1.1.3", band: "unknown", body: "" };

  it("enqueues idempotently by id; empty body is VALID (a tap is signal)", () => {
    const s = fakeStorage();
    expect(enqueueFeedback(USER, row, s)).toBe(true);
    expect(enqueueFeedback(USER, row, s)).toBe(true); // same id -> no duplicate
    expect(readOutbox(USER, s).feedback).toHaveLength(1);
  });

  it("REFUSES a row failing the client-side CHECK mirror before it can ever draw a terminal refusal", () => {
    const s = fakeStorage();
    // Malformed task ids (regex mirror of the DB CHECK).
    expect(enqueueFeedback(USER, { ...row, taskId: "1.2" }, s)).toBe(false);
    expect(enqueueFeedback(USER, { ...row, taskId: "1.2.x" }, s)).toBe(false);
    expect(enqueueFeedback(USER, { ...row, taskId: "12345.67890.12345" }, s)).toBe(false); // > 16 chars
    // Body over the 1000-char CHECK.
    expect(enqueueFeedback(USER, { ...row, body: "x".repeat(FEEDBACK_BODY_MAX + 1) }, s)).toBe(false);
    // Band outside the enum.
    expect(enqueueFeedback(USER, { ...row, band: "g1_2" as FeedbackInsertRow["band"] }, s)).toBe(false);
    expect(readOutbox(USER, s).feedback).toHaveLength(0);

    // The happy shapes all pass.
    expect(isValidFeedbackRow({ id: "a", taskId: "1.2.5", band: "unknown", body: "" })).toBe(true);
    expect(isValidFeedbackRow({ id: "a", taskId: "5.5.5", band: "g9_12", body: "x".repeat(1000) })).toBe(true);
  });

  it("a REFUSED storage write (quota) makes enqueueFeedback report false — never throws, never claims durability", () => {
    const s = fakeStorage();
    s.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => enqueueFeedback(USER, row, s)).not.toThrow();
    expect(enqueueFeedback(USER, row, s)).toBe(false);
    // The day counter tolerates the same failure without throwing or corrupting.
    expect(() => bumpFeedbackCountForDay(USER, "2026-08-03", s)).not.toThrow();
    expect(feedbackCountForDay(USER, "2026-08-03", s)).toBe(0);
  });

  it("readOutbox drops unknown-version and malformed feedback entries, keeps valid ones", () => {
    const s = fakeStorage();
    s.setItem(
      `fp:${USER}:outbox`,
      JSON.stringify({
        ledger: [],
        feedback: [
          { v: OUTBOX_VERSION, row },
          { v: OUTBOX_VERSION + 1, row: { ...row, id: "future" } },
          { v: OUTBOX_VERSION, row: { ...row, id: "bad", taskId: "nope" } },
        ],
        snapshot: null,
      }),
    );
    expect(readOutbox(USER, s).feedback.map((e) => e.row.id)).toEqual(["fb-1"]);
  });

  it("a pre-feedback outbox (no feedback field) reads as an empty feedback queue", () => {
    const s = fakeStorage();
    s.setItem(`fp:${USER}:outbox`, JSON.stringify({ ledger: [], snapshot: null }));
    expect(readOutbox(USER, s).feedback).toEqual([]);
  });
});

describe("replayOutbox with feedback entries", () => {
  const led = (id: string): LedgerInsertRow => ({ id, kind: "sale", payer: "P", amountCents: 100 });
  const fb = (id: string, taskId = "1.1.1"): FeedbackInsertRow => ({
    id,
    taskId,
    band: "unknown",
    body: "stuck",
  });

  it("drains feedback to inserts AFTER the ledger, in queue order, resolving all", async () => {
    const s = fakeStorage();
    enqueueLedger(USER, led("led-a"), s);
    enqueueFeedback(USER, fb("fb-a", "1.1.2"), s);
    enqueueLedger(USER, led("led-b"), s);
    enqueueFeedback(USER, fb("fb-b", "1.2.5"), s);

    const seen: string[] = [];
    handlers.insert = (r) => {
      seen.push((r as { id: string }).id);
      return { error: null };
    };
    const result = await replayOutbox(USER, PROFILE, s);
    // Ledger first (money before telemetry), then feedback, each in enqueue order.
    expect(seen).toEqual(["led-a", "led-b", "fb-a", "fb-b"]);
    expect(result.ledgerSent).toBe(2);
    expect(result.feedbackSent).toBe(2);
    const outbox = readOutbox(USER, s);
    expect(outbox.ledger).toHaveLength(0);
    expect(outbox.feedback).toHaveLength(0);
  });

  it("a 23505 duplicate on replay is success (report already landed on a prior try)", async () => {
    const s = fakeStorage();
    enqueueFeedback(USER, fb("fb-dup"), s);
    handlers.insert = () => ({ error: { code: "23505" } });
    const result = await replayOutbox(USER, PROFILE, s);
    expect(result.feedbackSent).toBe(1);
    expect(readOutbox(USER, s).feedback).toHaveLength(0);
  });

  it("PGRST205 / 42P01 (table not deployed yet) PARKS the entry: retained for a later replay", async () => {
    const s = fakeStorage();
    enqueueFeedback(USER, fb("fb-park"), s);
    handlers.insert = () => ({ error: { code: "PGRST205", message: "no such table in schema cache" } });
    let result = await replayOutbox(USER, PROFILE, s);
    expect(result.feedbackSent).toBe(0);
    expect(result.feedbackDroppedTerminal).toBe(0);
    expect(readOutbox(USER, s).feedback.map((e) => e.row.id)).toEqual(["fb-park"]);

    handlers.insert = () => ({ error: { code: "42P01", message: "undefined table" } });
    result = await replayOutbox(USER, PROFILE, s);
    expect(readOutbox(USER, s).feedback.map((e) => e.row.id)).toEqual(["fb-park"]);

    // Once the table lands, the same parked entry drains clean.
    handlers.insert = () => ({ error: null });
    result = await replayOutbox(USER, PROFILE, s);
    expect(result.feedbackSent).toBe(1);
    expect(readOutbox(USER, s).feedback).toHaveLength(0);
  });

  it("a terminal code DROPS the entry with the terminal classification (no retry storm)", async () => {
    const s = fakeStorage();
    enqueueFeedback(USER, fb("fb-term"), s);
    handlers.insert = () => ({ error: { code: "P0001", message: "daily feedback cap reached" } });
    const result = await replayOutbox(USER, PROFILE, s);
    expect(result.feedbackDroppedTerminal).toBe(1);
    expect(result.feedbackSent).toBe(0);
    expect(readOutbox(USER, s).feedback).toHaveLength(0);
  });

  it("FP429 on replay REMOVES the entry without wedging the queue and pins the local counter to the cap", async () => {
    const s = fakeStorage();
    enqueueFeedback(USER, fb("fb-c1"), s);
    enqueueFeedback(USER, fb("fb-c2", "1.2.2"), s);
    handlers.insert = () => ({ error: { code: FEEDBACK_CAP_ERRCODE, message: "cap reached" } });

    const result = await replayOutbox(USER, PROFILE, s);
    // Capped never stops the drain (both entries were attempted and removed) —
    // the queue can NEVER wedge behind a capped report.
    expect(result.feedbackCapped).toBe(2);
    expect(result.feedbackSent).toBe(0);
    expect(result.feedbackDroppedTerminal).toBe(0);
    expect(readOutbox(USER, s).feedback).toHaveLength(0);
    expect(feedbackCountForDay(USER, utcDayToday(), s)).toBe(FEEDBACK_DAILY_CAP);
  });

  it("23503 (provisioning race) PARKS the entry, then drains clean once the profile exists", async () => {
    const s = fakeStorage();
    enqueueFeedback(USER, fb("fb-fk"), s);
    handlers.insert = () => ({ error: { code: "23503", message: "fk violation on profile_id" } });

    let result = await replayOutbox(USER, PROFILE, s);
    expect(result.feedbackSent).toBe(0);
    expect(result.feedbackDroppedTerminal).toBe(0);
    expect(readOutbox(USER, s).feedback.map((e) => e.row.id)).toEqual(["fb-fk"]); // retained

    // The profile lands (service-role provisioning completed): drains clean.
    handlers.insert = () => ({ error: null });
    result = await replayOutbox(USER, PROFILE, s);
    expect(result.feedbackSent).toBe(1);
    expect(readOutbox(USER, s).feedback).toHaveLength(0);
  });

  it("SYMMETRIC drain: a ledger retryable STOP does not block the feedback drain", async () => {
    const s = fakeStorage();
    enqueueLedger(USER, led("led-a"), s);
    enqueueFeedback(USER, fb("fb-a"), s);
    handlers.insert = (r) => {
      const row = r as { task_id?: string };
      // The ledger insert fails retryable (codeless network error); the
      // feedback insert lands.
      return row.task_id ? { error: null } : { error: new Error("offline") };
    };

    const result = await replayOutbox(USER, PROFILE, s);
    expect(result.ledgerSent).toBe(0);
    expect(readOutbox(USER, s).ledger.map((e) => e.row.id)).toEqual(["led-a"]); // ledger kept
    expect(result.feedbackSent).toBe(1); // feedback drained anyway
    expect(readOutbox(USER, s).feedback).toHaveLength(0);
  });

  it("a retryable feedback stop preserves order and does NOT block the ledger/snapshot drains", async () => {
    const s = fakeStorage();
    enqueueLedger(USER, led("led-a"), s);
    enqueueFeedback(USER, fb("fb-a"), s);
    enqueueFeedback(USER, fb("fb-b"), s);
    parkSnapshot(USER, 3, docWith(), s);

    handlers.insert = (r) => {
      const row = r as { id: string; task_id?: string };
      // Only feedback fails (table missing); the ledger insert lands.
      return row.task_id ? { error: { code: "PGRST205" } } : { error: null };
    };
    handlers.update = () => ({ data: [{ profile_id: PROFILE }], error: null });

    const result = await replayOutbox(USER, PROFILE, s);
    expect(result.ledgerSent).toBe(1); // money drained
    expect(result.snapshot).toEqual({ ok: true, revision: 4 }); // snapshot drained
    expect(result.feedbackSent).toBe(0);
    // Both feedback entries retained IN ORDER for the next replay.
    expect(readOutbox(USER, s).feedback.map((e) => e.row.id)).toEqual(["fb-a", "fb-b"]);
  });
});

describe("flushFeedbackViaKeepalive", () => {
  it("POSTs the report with manual auth headers and return=minimal, no created_at", () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    const auth = { supabaseUrl: "https://supabase.test", apikey: "anon-key", accessToken: "tok" };
    const res = flushFeedbackViaKeepalive(auth, PROFILE, {
      id: "fb-k",
      taskId: "1.1.4",
      band: "unknown",
      body: "hi",
    });
    expect(res).toEqual({ sent: true });
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/rest/v1/fp_task_feedback");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(init.headers.apikey).toBe("anon-key");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers.Prefer).toBe("return=minimal");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body).toEqual({ id: "fb-k", profile_id: PROFILE, task_id: "1.1.4", band: "unknown", body: "hi" });
    // created_at is server-managed (excluded from the INSERT grant): sending it
    // would fail the whole insert. It must NEVER ride the keepalive body.
    expect("created_at" in body).toBe(false);
  });
});

// ── flushOutboxForPriorUser (pre-wipe best-effort flush, FIX 5) ──────────────
describe("flushOutboxForPriorUser", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    getSession.mockResolvedValue({ data: { session: { access_token: "prior-tok" } } });
  });

  function feedbackPosts() {
    return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("/rest/v1/fp_task_feedback"),
    );
  }

  it("fires keepalive POSTs for the prior user's queued feedback rows, addressed by their stored profile id", async () => {
    const s = fakeStorage();
    s.setItem(`fp:${USER}:profileId`, JSON.stringify(PROFILE)); // persisted by engine.start
    enqueueFeedback(
      USER,
      { id: "fb-prior", taskId: "1.1.2", band: "unknown", body: "left behind" },
      s,
    );

    await flushOutboxForPriorUser(USER, s);

    const posts = feedbackPosts();
    expect(posts).toHaveLength(1);
    const [, init] = posts[0] as [string, { keepalive: boolean; body: string }];
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toEqual({
      id: "fb-prior",
      profile_id: PROFILE,
      task_id: "1.1.2",
      band: "unknown",
      body: "left behind",
    });
  });

  it("captures the outbox SYNCHRONOUSLY, so the caller's immediate wipe cannot race it", async () => {
    const s = fakeStorage();
    s.setItem(`fp:${USER}:profileId`, JSON.stringify(PROFILE));
    enqueueFeedback(USER, { id: "fb-race", taskId: "1.2.4", band: "unknown", body: "" }, s);

    // The login path fires the flush unawaited and wipes fp:* immediately after.
    const pending = flushOutboxForPriorUser(USER, s);
    s.clear();
    await pending;

    const posts = feedbackPosts();
    expect(posts).toHaveLength(1);
    expect((JSON.parse((posts[0][1] as { body: string }).body) as { id: string }).id).toBe(
      "fb-race",
    );
  });

  it("is inert (never throws, sends nothing) without a stored profile id or a session token", async () => {
    const s = fakeStorage();
    enqueueFeedback(USER, { id: "fb-x", taskId: "1.1.1", band: "unknown", body: "" }, s);
    await flushOutboxForPriorUser(USER, s); // no profileId stored

    s.setItem(`fp:${USER}:profileId`, JSON.stringify(PROFILE));
    getSession.mockResolvedValue({ data: { session: null } });
    await flushOutboxForPriorUser(USER, s); // no token

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── Cross-repo mirror parity (The120 app/fp/lib/fp-task-feedback-rules.ts) ───
describe("feedback contract parity pins", () => {
  it("pins the mirrored constants as LITERALS, byte-for-byte", () => {
    // These literals mirror The120's app/fp/lib/fp-task-feedback-rules.ts (the
    // counterpart contract module for the fp_task_feedback migration). Any byte
    // drift here is a DELIBERATE test failure: change both repos (and the DB
    // CHECKs/trigger they mirror) together, or not at all.
    expect(FEEDBACK_TASK_ID_RE.source).toBe("^[0-9]+(\\.[0-9]+){2}$");
    expect(FEEDBACK_TASK_ID_MAX).toBe(16);
    expect(FEEDBACK_BODY_MAX).toBe(1000);
    expect(FEEDBACK_DAILY_CAP).toBe(50);
    expect(FEEDBACK_CAP_ERRCODE).toBe("FP429");
    expect([...FEEDBACK_BANDS]).toEqual(["g3_5", "g6_8", "g9_12", "unknown"]);
  });
});

describe("feedback daily counter (local mirror of the DB 50/day cap)", () => {
  it("counts per UTC day and resets on a new day", () => {
    const s = fakeStorage();
    expect(feedbackCountForDay(USER, "2026-08-03", s)).toBe(0);
    bumpFeedbackCountForDay(USER, "2026-08-03", s);
    bumpFeedbackCountForDay(USER, "2026-08-03", s);
    expect(feedbackCountForDay(USER, "2026-08-03", s)).toBe(2);
    // A new day reads as zero; bumping it replaces the stale record.
    expect(feedbackCountForDay(USER, "2026-08-04", s)).toBe(0);
    bumpFeedbackCountForDay(USER, "2026-08-04", s);
    expect(feedbackCountForDay(USER, "2026-08-04", s)).toBe(1);
  });

  it("tolerates a corrupted stored record (reads 0, never throws)", () => {
    const s = fakeStorage();
    s.setItem(`fp:${USER}:feedbackDay`, JSON.stringify({ day: 7, count: "many" }));
    expect(feedbackCountForDay(USER, "2026-08-03", s)).toBe(0);
  });
});
