// @vitest-environment jsdom
//
// Isolated coverage for the sync engine start()/stop() teardown race. start() is
// async (awaits resolveProfileId, getSession, replayOutbox) and is called
// fire-and-forget. If stop() runs mid-start, start() must NOT resume to wire
// window/document listeners, subscribe onAuthStateChange, or replay the outbox
// for a torn-down session. jsdom so window/document exist to be spied on.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { handlers, getSession, onAuthStateChange, unsubscribe } = vi.hoisted(() => ({
  handlers: {
    select: null as null | (() => unknown),
    insert: null as null | ((row: unknown) => unknown),
  },
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}));

function makeFrom() {
  return () => {
    const builder: Record<string, unknown> = {};
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
    builder.insert = (row: unknown) => Promise.resolve(handlers.insert?.(row) ?? { error: null });
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

import { createSyncEngine, resetProfileIdCache, enqueueLedger, readOutbox } from "../sync";
import { DOC_VERSION, type SaveDoc } from "../../state/gameCore";

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

const DOC: SaveDoc = {
  docVersion: DOC_VERSION,
  ideas: [],
  activeIdea: 0,
  siteHeadline: "",
  onboardingComplete: false,
};

beforeEach(() => {
  resetProfileIdCache();
  handlers.select = null;
  handlers.insert = null;
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: "tok" } } });
  onAuthStateChange.mockReset().mockReturnValue({ data: { subscription: { unsubscribe } } });
});

describe("sync engine start()/stop() teardown race", () => {
  it("stop() mid-start wires no listeners/auth sub and runs no replay for the torn-down session", async () => {
    const storage = fakeStorage();
    // A queued outbox insert that a replay WOULD fire if the drain ran.
    enqueueLedger("user-1", { id: "led-1", kind: "sale", payer: "Mom", amountCents: 500 }, storage);

    // Defer resolveProfileId: its select stays pending until we release it, so
    // stop() runs while start() is genuinely awaiting.
    let releaseProfile: (v: unknown) => void = () => undefined;
    handlers.select = () => new Promise((res) => {
      releaseProfile = res;
    });

    let inserts = 0;
    handlers.insert = () => {
      inserts += 1;
      return { error: null };
    };

    const addWin = vi.spyOn(window, "addEventListener");
    const addDoc = vi.spyOn(document, "addEventListener");

    const engine = createSyncEngine({
      userId: "user-1",
      storage,
      getSnapshot: () => ({ doc: DOC, revision: 0 }),
      setRevision: () => undefined,
      onStatus: () => undefined,
      onReauthNeeded: () => undefined,
    });

    const startPromise = engine.start(); // hangs awaiting resolveProfileId
    engine.stop(); // tear down mid-start (bumps generation, sets stopped)
    releaseProfile({ data: { id: "profile-1" }, error: null }); // resolveProfileId resolves
    await startPromise;
    await Promise.resolve();

    const wiredEvents = [...addWin.mock.calls, ...addDoc.mock.calls].map(([evt]) => evt);
    expect(wiredEvents).not.toContain("online");
    expect(wiredEvents).not.toContain("pagehide");
    expect(wiredEvents).not.toContain("visibilitychange");

    // No auth subscription for a torn-down session, and no outbox replay ran.
    expect(onAuthStateChange).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(inserts).toBe(0);
    expect(readOutbox("user-1", storage).ledger).toHaveLength(1); // untouched, still queued

    addWin.mockRestore();
    addDoc.mockRestore();
  });

  it("a normal start() (no stop) DOES wire listeners + auth sub and replays", async () => {
    const storage = fakeStorage();
    handlers.select = () => ({ data: { id: "profile-1" }, error: null });

    const addWin = vi.spyOn(window, "addEventListener");
    const engine = createSyncEngine({
      userId: "user-1",
      storage,
      getSnapshot: () => ({ doc: DOC, revision: 0 }),
      setRevision: () => undefined,
      onStatus: () => undefined,
      onReauthNeeded: () => undefined,
    });

    await engine.start();

    const wiredEvents = addWin.mock.calls.map(([evt]) => evt);
    expect(wiredEvents).toContain("online");
    expect(wiredEvents).toContain("pagehide");
    expect(onAuthStateChange).toHaveBeenCalledTimes(1);

    engine.stop();
    addWin.mockRestore();
  });
});
