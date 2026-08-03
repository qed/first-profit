// @vitest-environment jsdom
//
// GameContext public-site plumbing (real-public-site plan, Unit 4):
//  - hydrate fetches the registry self-read and populates the site slice
//    (claimed/published -> real handle visible to consumers/selectors);
//  - a failed read lands as the honest 'unknown' — no crash, no fake handle;
//  - the RESET_SESSION round-trip across a session boundary (write in session
//    1, ABSENT after logout, repopulated by session 2's hydrate);
//  - the generation guard: a claim response resolving after logout/login is
//    DISCARDED — no state mutation, no cross-child leak (the async-writer
//    generation-token learning);
//  - flushNow delegates to the engine's flushPending and SURFACES the honest
//    outcome (landed / parked / cas-rescheduled); no engine -> 'parked'.
// The engine is a fake (the sync suite covers real flushPending outcomes), so
// no timers — and never a real 3s debounce wait — are involved here.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, act, waitFor, cleanup } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────
const authMock = {
  loginChild: vi.fn(),
  logout: vi.fn(),
  getCurrentUserId: vi.fn(),
  submitBirthYear: vi.fn(),
  fetchSiteStatus: vi.fn(),
  claimHandle: vi.fn(),
  publishSite: vi.fn(),
};
vi.mock("../../lib/auth", () => ({
  loginChild: (...a: unknown[]) => authMock.loginChild(...a),
  logout: (...a: unknown[]) => authMock.logout(...a),
  getCurrentUserId: (...a: unknown[]) => authMock.getCurrentUserId(...a),
  submitBirthYear: (...a: unknown[]) => authMock.submitBirthYear(...a),
  fetchSiteStatus: (...a: unknown[]) => authMock.fetchSiteStatus(...a),
  claimHandle: (...a: unknown[]) => authMock.claimHandle(...a),
  publishSite: (...a: unknown[]) => authMock.publishSite(...a),
}));

const draftMock = {
  wipeAllForUser: vi.fn(),
  wipeAllFpKeys: vi.fn(),
  getLastUserId: vi.fn(),
  setLastUserId: vi.fn(),
};
vi.mock("../../lib/draftCache", () => ({
  wipeAllForUser: (...a: unknown[]) => draftMock.wipeAllForUser(...a),
  wipeAllFpKeys: (...a: unknown[]) => draftMock.wipeAllFpKeys(...a),
  getLastUserId: (...a: unknown[]) => draftMock.getLastUserId(...a),
  setLastUserId: (...a: unknown[]) => draftMock.setLastUserId(...a),
}));

interface FakeEngine {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  notifyLedger: ReturnType<typeof vi.fn>;
  notifyFeedback: ReturnType<typeof vi.fn>;
  notifySnapshotChange: ReturnType<typeof vi.fn>;
  flushPending: ReturnType<typeof vi.fn>;
  flushOnHide: ReturnType<typeof vi.fn>;
  /** The deps GameContext handed createSyncEngine (getSnapshot etc.). */
  deps?: { getSnapshot: () => { doc: { siteHeadline: string }; revision: number } };
}
const engines: FakeEngine[] = [];
const syncMock = {
  resolveProfileId: vi.fn(),
  loadSave: vi.fn(),
  loadLedger: vi.fn(),
  flushOutboxForPriorUser: vi.fn(),
};
vi.mock("../../lib/sync", () => ({
  resolveProfileId: (...a: unknown[]) => syncMock.resolveProfileId(...a),
  resetProfileIdCache: vi.fn(),
  loadSave: (...a: unknown[]) => syncMock.loadSave(...a),
  loadLedger: (...a: unknown[]) => syncMock.loadLedger(...a),
  flushOutboxForPriorUser: (...a: unknown[]) => syncMock.flushOutboxForPriorUser(...a),
  enqueueFeedback: vi.fn().mockReturnValue(true),
  isValidFeedbackRow: vi.fn().mockReturnValue(true),
  feedbackCountForDay: vi.fn().mockReturnValue(0),
  bumpFeedbackCountForDay: vi.fn(),
  utcDayToday: () => new Date().toISOString().slice(0, 10),
  FEEDBACK_DAILY_CAP: 50,
  FEEDBACK_BODY_MAX: 1000,
  createSyncEngine: (deps: FakeEngine["deps"]) => {
    const engine: FakeEngine = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      notifyLedger: vi.fn(),
      notifyFeedback: vi.fn().mockResolvedValue("sent"),
      notifySnapshotChange: vi.fn(),
      flushPending: vi.fn().mockResolvedValue("landed"),
      flushOnHide: vi.fn(),
      deps,
    };
    engines.push(engine);
    return engine;
  },
}));

import { GameProvider, useGame, type GameApi } from "../GameContext";

let api: GameApi | null = null;
function Probe() {
  api = useGame();
  return React.createElement("div", null, api.stage);
}

function renderProvider() {
  return render(React.createElement(GameProvider, null, React.createElement(Probe)));
}

function getApi(): GameApi {
  if (!api) throw new Error("provider not mounted");
  return api;
}

/** A manually-resolvable promise, to hold an API response in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const COMPLETED_DOC = {
  docVersion: 1,
  ideas: [{ fields: {}, done: {} }],
  activeIdea: 0,
  siteHeadline: "",
  onboardingComplete: true,
};

beforeEach(() => {
  engines.length = 0;
  api = null;
  authMock.loginChild.mockReset();
  authMock.logout.mockReset().mockResolvedValue("explicit");
  authMock.getCurrentUserId.mockReset().mockResolvedValue(null);
  authMock.fetchSiteStatus.mockReset().mockResolvedValue({ ok: false });
  authMock.claimHandle.mockReset().mockResolvedValue({ ok: false, reason: "outage" });
  authMock.publishSite.mockReset().mockResolvedValue({ ok: false, reason: "outage" });
  draftMock.wipeAllForUser.mockReset();
  draftMock.wipeAllFpKeys.mockReset();
  draftMock.getLastUserId.mockReset().mockReturnValue(null);
  draftMock.setLastUserId.mockReset();
  syncMock.resolveProfileId.mockReset().mockResolvedValue("profile-1");
  syncMock.loadSave.mockReset().mockResolvedValue({ doc: COMPLETED_DOC, revision: 1 });
  syncMock.loadLedger.mockReset().mockResolvedValue([]);
  syncMock.flushOutboxForPriorUser.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

async function bootToApp() {
  authMock.getCurrentUserId.mockResolvedValue("user-A");
  renderProvider();
  await waitFor(() => expect(api?.stage).toBe("app"));
}

async function bootToLanding() {
  authMock.getCurrentUserId.mockResolvedValue(null);
  renderProvider();
  await waitFor(() => expect(api?.stage).toBe("landing"));
}

async function loginAs(userId: string) {
  authMock.loginChild.mockResolvedValue({
    ok: true,
    userId,
    profile: { firstName: "Kid", handle: "kid" },
    grade: null,
  });
  await act(async () => {
    expect(await getApi().login("kid", "supersecret10")).toBe(true);
  });
}

describe("hydrate populates the site slice (split-storage read-back)", () => {
  it("claimed+published site -> slice carries the REAL handle for selectors/rooms", async () => {
    authMock.fetchSiteStatus.mockResolvedValue({
      ok: true,
      handle: "cedric",
      status: "published",
    });
    await bootToApp();
    await waitFor(() =>
      expect(api?.site).toEqual({ handle: "cedric", status: "published" }),
    );
    expect(authMock.fetchSiteStatus).toHaveBeenCalledTimes(1);
  });

  it("no site yet -> slice adopts none with a null handle (never a fake /you)", async () => {
    authMock.fetchSiteStatus.mockResolvedValue({ ok: true, handle: null, status: "none" });
    await bootToApp();
    await waitFor(() => expect(api?.site).toEqual({ handle: null, status: "none" }));
  });

  it("fetch failure -> slice stays the honest 'unknown', hydrate neither crashes nor stalls", async () => {
    authMock.fetchSiteStatus.mockResolvedValue({ ok: false });
    await bootToApp(); // stage reached app: routing was not blocked
    expect(getApi().site).toEqual({ handle: null, status: "unknown" });
  });

  it("even a REJECTING fetch cannot crash hydrate (fire-and-forget seam)", async () => {
    // fetchSiteStatus itself never throws by contract, but the provider must
    // not depend on that from a mocked/broken build either: a rejection lands
    // as 'unknown', never an unhandled rejection or a stalled hydrate.
    authMock.fetchSiteStatus.mockRejectedValue(new Error("build skew"));
    await bootToApp();
    await waitFor(() => expect(api?.site).toEqual({ handle: null, status: "unknown" }));
    expect(getApi().stage).toBe("app");
  });
});

describe("same-session response ordering (per-call sequence guard)", () => {
  it("two overlapping refreshes resolved OUT OF ORDER keep the newer call's result", async () => {
    // Review P1: hydrate's fire-and-forget read + a room-open refresh overlap
    // in ONE session; the session-generation guard cannot order them. The
    // per-call sequence must drop the STALE first call's late response.
    authMock.fetchSiteStatus.mockResolvedValue({ ok: false });
    await bootToApp();

    const d1 = deferred<{ ok: true; handle: string | null; status: "none" }>();
    const d2 = deferred<{ ok: true; handle: string; status: "published" }>();
    authMock.fetchSiteStatus
      .mockReturnValueOnce(d1.promise)
      .mockReturnValueOnce(d2.promise);
    let r1: Promise<void> = Promise.resolve();
    let r2: Promise<void> = Promise.resolve();
    act(() => {
      r1 = getApi().refreshSiteStatus(); // e.g. hydrate's read, slow
      r2 = getApi().refreshSiteStatus(); // e.g. room-open refresh, fast
    });

    // The NEWER call resolves first and wins…
    await act(async () => {
      d2.resolve({ ok: true, handle: "cedric", status: "published" });
      await r2;
    });
    expect(getApi().site).toEqual({ handle: "cedric", status: "published" });

    // …then the STALE call's late 'none' arrives and must be dropped, never
    // overwriting the newer 'published'.
    await act(async () => {
      d1.resolve({ ok: true, handle: null, status: "none" });
      await r1;
    });
    expect(getApi().site).toEqual({ handle: "cedric", status: "published" });
  });
});

describe("session boundary round-trip (shared-device learning)", () => {
  it("session 1 writes the slice; logout clears it; session 2's hydrate repopulates it", async () => {
    await bootToLanding();

    // Session 1: hydrate read-back answers claimed.
    authMock.fetchSiteStatus.mockResolvedValue({ ok: true, handle: "cedric", status: "claimed" });
    await loginAs("user-A");
    await waitFor(() => expect(api?.site).toEqual({ handle: "cedric", status: "claimed" }));

    // Logout: the slice must NOT survive the boundary.
    await act(async () => {
      await getApi().logout();
    });
    expect(getApi().site).toEqual({ handle: null, status: "unknown" });

    // Session 2 (sibling on the same device): repopulated from THEIR registry
    // row — the none shape (no handle) in the real contract.
    authMock.fetchSiteStatus.mockResolvedValue({ ok: true, handle: null, status: "none" });
    await loginAs("user-B");
    await waitFor(() => expect(api?.site).toEqual({ handle: null, status: "none" }));
  });
});

describe("claim / publish slice adoption + generation guard", () => {
  it("a successful claim adopts the canonical handle + status into the slice and passes the result through", async () => {
    await bootToApp();
    authMock.claimHandle.mockResolvedValue({ ok: true, handle: "cedric", status: "claimed" });
    let result: unknown;
    await act(async () => {
      result = await getApi().claimSite("Cedric");
    });
    expect(result).toEqual({ ok: true, handle: "cedric", status: "claimed" });
    expect(getApi().site).toEqual({ handle: "cedric", status: "claimed" });
  });

  it("a designed refusal (taken) passes through WITHOUT touching the slice", async () => {
    await bootToApp();
    authMock.claimHandle.mockResolvedValue({
      ok: false,
      reason: "taken",
      suggestions: ["cedric2"],
    });
    let result: unknown;
    await act(async () => {
      result = await getApi().claimSite("cedric");
    });
    expect(result).toEqual({ ok: false, reason: "taken", suggestions: ["cedric2"] });
    expect(getApi().site).toEqual({ handle: null, status: "unknown" });
  });

  it("STALE GENERATION: a claim resolving after logout/login is DISCARDED — no state mutation, no leak", async () => {
    await bootToLanding();
    authMock.fetchSiteStatus.mockResolvedValue({ ok: true, handle: null, status: "none" });
    await loginAs("user-A");
    await waitFor(() => expect(api?.site).toEqual({ handle: null, status: "none" }));

    // Child A's claim goes in flight…
    const claim = deferred<{ ok: true; handle: string; status: "claimed" }>();
    authMock.claimHandle.mockReturnValue(claim.promise);
    let claimResult: unknown;
    let claimDone: Promise<void> = Promise.resolve();
    act(() => {
      claimDone = getApi()
        .claimSite("cedric")
        .then((r) => {
          claimResult = r;
        });
    });

    // …then the session ends and child B logs in on the shared device.
    await act(async () => {
      await getApi().logout();
    });
    authMock.fetchSiteStatus.mockResolvedValue({ ok: false });
    await loginAs("user-B");
    const siteBefore = getApi().site;

    // A's claim finally resolves ok:true — it must be dropped, not adopted.
    await act(async () => {
      claim.resolve({ ok: true, handle: "cedric", status: "claimed" });
      await claimDone;
    });
    expect(getApi().site).toEqual(siteBefore); // no mutation from the stale response
    expect(getApi().site.handle).toBeNull(); // and certainly not A's handle
    // The stale caller receives the neutral outage shape, never A's outcome.
    expect(claimResult).toEqual({ ok: false, reason: "outage" });
  });

  it("publish success flips the slice to published; a locked refusal flips it to offline", async () => {
    await bootToApp();
    authMock.claimHandle.mockResolvedValue({ ok: true, handle: "cedric", status: "claimed" });
    await act(async () => {
      await getApi().claimSite("cedric");
    });

    authMock.publishSite.mockResolvedValue({
      ok: true,
      status: "published",
      firstPublish: true,
      parentNotified: true,
    });
    let result: unknown;
    await act(async () => {
      result = await getApi().publishSite();
    });
    expect(result).toEqual({
      ok: true,
      status: "published",
      firstPublish: true,
      parentNotified: true,
    });
    expect(getApi().site).toEqual({ handle: "cedric", status: "published" });

    // Operator-locked: nothing became visible — no surface may render "live".
    authMock.publishSite.mockResolvedValue({ ok: false, reason: "locked" });
    await act(async () => {
      result = await getApi().publishSite();
    });
    expect(result).toEqual({ ok: false, reason: "locked" });
    expect(getApi().site).toEqual({ handle: "cedric", status: "offline" });
  });

  it("publish stamps the handle CAPTURED AT CALL TIME, not a mid-flight slice rewrite", async () => {
    // Review P3(c): the SET_SITE after the await must not read stateRef's
    // then-current handle — a racing refresh/claim could have rewritten it.
    await bootToApp();
    authMock.claimHandle.mockResolvedValue({ ok: true, handle: "cedric", status: "claimed" });
    await act(async () => {
      await getApi().claimSite("cedric");
    });

    const pub = deferred<{
      ok: true;
      status: "published";
      firstPublish: boolean;
      parentNotified: boolean;
    }>();
    authMock.publishSite.mockReturnValue(pub.promise);
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = getApi().publishSite();
    });
    // Mid-flight, something rewrites the slice…
    act(() => {
      getApi().dispatch({ type: "SET_SITE", handle: "mid-flight", status: "claimed" });
    });
    // …the resolving publish still stamps the handle it was issued for.
    await act(async () => {
      pub.resolve({ ok: true, status: "published", firstPublish: false, parentNotified: false });
      await done;
    });
    expect(getApi().site).toEqual({ handle: "cedric", status: "published" });
  });
});

describe("flushNow (surfaced flush outcome)", () => {
  it("delegates to the live engine's flushPending and surfaces every outcome", async () => {
    await bootToApp();
    expect(engines).toHaveLength(1);

    for (const outcome of ["landed", "parked", "cas-rescheduled"] as const) {
      engines[0].flushPending.mockResolvedValue(outcome);
      await expect(getApi().flushNow()).resolves.toBe(outcome);
    }
    expect(engines[0].flushPending).toHaveBeenCalledTimes(3);
  });

  it("answers 'parked' with no live engine (logged out: nothing can land)", async () => {
    await bootToLanding();
    expect(engines).toHaveLength(0);
    await expect(getApi().flushNow()).resolves.toBe("parked");
  });

  it("a commit-then-flushNow sequence exercises the engine flush path immediately (no debounce wait)", async () => {
    await bootToApp();
    // The commit itself schedules the debounced snapshot…
    act(() => {
      getApi().dispatch({
        type: "SET_PROFILE",
        patch: { siteHeadline: "Cedric's Cookie Stand" },
      });
    });
    await waitFor(() => expect(engines[0].notifySnapshotChange).toHaveBeenCalled());
    // …and the committing surface calls flushNow to land it NOW (R11): the
    // engine's immediate flush is invoked and its outcome surfaced, with no
    // 3-second debounce involved anywhere in this test.
    engines[0].flushPending.mockResolvedValue("landed");
    await expect(getApi().flushNow()).resolves.toBe("landed");
    expect(engines[0].flushPending).toHaveBeenCalledTimes(1);
  });
});

describe("flushNow marks the snapshot pending BEFORE flushing (Unit 5 review, P1)", () => {
  it("calls notifySnapshotChange synchronously before flushPending, even with no prior change", async () => {
    // A caller may invoke flushNow in the same task as a dispatch, before the
    // passive [state] subscription effect has notified the engine. flushNow
    // must therefore mark the snapshot itself — otherwise flushOnce's
    // nothing-pending fast path could answer a FALSE "landed" for content the
    // engine never read.
    await bootToApp();
    const engine = engines[0];
    engine.notifySnapshotChange.mockClear();
    await expect(getApi().flushNow()).resolves.toBe("landed");
    expect(engine.notifySnapshotChange).toHaveBeenCalledTimes(1);
    expect(engine.notifySnapshotChange.mock.invocationCallOrder[0]).toBeLessThan(
      engine.flushPending.mock.invocationCallOrder[0],
    );
  });

  it("dispatch then flushNow: the snapshot the engine reads carries the dispatched change", async () => {
    await bootToApp();
    const engine = engines[0];
    await act(async () => {
      getApi().dispatch({ type: "SET_PROFILE", patch: { siteHeadline: "Fresh lemonade" } });
    });
    await act(async () => {
      await expect(getApi().flushNow()).resolves.toBe("landed");
    });
    // getSnapshot reads live state (stateRef) at save time: the doc the engine
    // would persist carries the just-dispatched headline.
    expect(engine.deps?.getSnapshot().doc.siteHeadline).toBe("Fresh lemonade");
    // And the pending mark preceded the flush.
    const lastNotify = Math.max(...engine.notifySnapshotChange.mock.invocationCallOrder);
    const lastFlush = Math.max(...engine.flushPending.mock.invocationCallOrder);
    expect(lastNotify).toBeLessThan(lastFlush);
  });
});

describe("getSessionGen (screen-layer async guard input, Unit 5 review, P1)", () => {
  it("is bumped by a session boundary so a captured generation goes stale", async () => {
    await bootToLanding();
    const before = getApi().getSessionGen();
    await loginAs("user-B");
    expect(getApi().getSessionGen()).toBeGreaterThan(before);
    const captured = getApi().getSessionGen();
    await act(async () => {
      await getApi().logout();
    });
    expect(getApi().getSessionGen()).toBeGreaterThan(captured);
  });
});
