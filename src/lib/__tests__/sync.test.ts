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
  readOutbox,
  enqueueLedger,
  parkSnapshot,
  replayOutbox,
  flushSnapshotViaKeepalive,
  flushLedgerViaKeepalive,
  createSyncEngine,
  KEEPALIVE_MAX_BYTES,
  OUTBOX_VERSION,
  type LedgerInsertRow,
} from "../sync";
import { DOC_VERSION, type SaveDoc } from "../../state/gameCore";

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
  it("maps DB snake_case rows to the app LedgerEntry shape, newest-first as returned", async () => {
    handlers.select = () => ({
      data: [
        { id: "s1", kind: "sale", payer: "Mom", amount_cents: 1500, created_at: "2026-07-31T00:02:00.000Z" },
        { id: "b1", kind: "backing", payer: "Dad", amount_cents: 2500, created_at: "2026-07-31T00:01:00.000Z" },
      ],
      error: null,
    });
    const rows = await loadLedger(PROFILE);
    expect(rows).toEqual([
      { id: "s1", kind: "sale", payer: "Mom", amountCents: 1500, createdAt: "2026-07-31T00:02:00.000Z" },
      { id: "b1", kind: "backing", payer: "Dad", amountCents: 2500, createdAt: "2026-07-31T00:01:00.000Z" },
    ]);
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

// ── insertLedger ─────────────────────────────────────────────────────────────
describe("insertLedger", () => {
  const row: LedgerInsertRow = { id: "led-1", kind: "sale", payer: "Mom", amountCents: 500 };

  it("inserts with source pinned to 'mock' and the client id", async () => {
    let sent: Record<string, unknown> | null = null;
    handlers.insert = (r) => {
      sent = r as Record<string, unknown>;
      return { error: null };
    };
    const result = await insertLedger(PROFILE, row);
    expect(result).toEqual({ ok: true });
    expect(sent).toEqual({
      id: "led-1",
      profile_id: PROFILE,
      kind: "sale",
      source: "mock",
      payer: "Mom",
      amount_cents: 500,
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
    const b: LedgerInsertRow = { id: "b", kind: "backing", payer: "B", amountCents: 200 };
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
