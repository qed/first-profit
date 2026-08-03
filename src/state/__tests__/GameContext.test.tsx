// @vitest-environment jsdom
//
// Focused provider tests for the load-bearing session-boundary paths (Unit 6
// review). Not exhaustive: the reducer/selectors are covered by gameCore tests
// and the sync mechanics by sync tests. Here we prove the GLUE — that
// GameContext drives those pieces correctly across a session boundary:
//  - P0: a new login tears down the previous session's engine BEFORE starting a
//    new one, so a stale in-flight write is neutralized on a shared device.
//  - different-user vs same-user draft wipe.
//  - hydrate-failure falls back to onboard (never strands / crashes).
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
  // Public-site client (Unit 4): hydrate fires fetchSiteStatus fire-and-forget,
  // so it must exist here; the flat failure keeps the slice at 'unknown'.
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
  flushOnHide: ReturnType<typeof vi.fn>;
  /** The deps GameContext handed createSyncEngine (to drive its callbacks). */
  deps: Record<string, unknown>;
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
  // Feedback plumbing (Unit 2): real constants, inert queue/counter fns.
  enqueueFeedback: vi.fn().mockReturnValue(true),
  isValidFeedbackRow: vi.fn().mockReturnValue(true),
  feedbackCountForDay: vi.fn().mockReturnValue(0),
  bumpFeedbackCountForDay: vi.fn(),
  utcDayToday: () => new Date().toISOString().slice(0, 10),
  FEEDBACK_DAILY_CAP: 50,
  FEEDBACK_BODY_MAX: 1000,
  createSyncEngine: (deps: Record<string, unknown>) => {
    const engine: FakeEngine = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      notifyLedger: vi.fn(),
      notifyFeedback: vi.fn().mockResolvedValue("sent"),
      notifySnapshotChange: vi.fn(),
      flushOnHide: vi.fn(),
      deps,
    };
    engines.push(engine);
    return engine;
  },
}));

import { GameProvider, useGame, isLoggedInStage, type GameApi } from "../GameContext";
import { CRITERION_SEQUENCE, criterionIdsForPhase, type SaveDoc } from "../gameCore";
import { nextCoachTarget } from "../floorSelectors";
import { stepById } from "../../data/path";

// A probe that surfaces the live provider API to the test body.
let api: GameApi | null = null;
function Probe() {
  api = useGame();
  return React.createElement("div", { "data-testid": "stage" }, api.stage);
}

function renderProvider() {
  return render(React.createElement(GameProvider, null, React.createElement(Probe)));
}

function getApi(): GameApi {
  if (!api) throw new Error("provider not mounted");
  return api;
}

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
  syncMock.loadSave.mockReset().mockResolvedValue({ doc: null, revision: 0 });
  syncMock.loadLedger.mockReset().mockResolvedValue([]);
  syncMock.flushOutboxForPriorUser.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe("isLoggedInStage gate (Slice B Unit 7)", () => {
  it("is true ONLY for app + onboard (the session-owning stages)", () => {
    expect(isLoggedInStage("app")).toBe(true);
    expect(isLoggedInStage("onboard")).toBe(true);
  });

  it("is false for every logged-OUT stage, including signup", () => {
    // signup is the load-bearing addition: a signing-up parent has no engine,
    // no save, and no session, so the engine/save/tick effects must not fire.
    expect(isLoggedInStage("signup")).toBe(false);
    expect(isLoggedInStage("boot")).toBe(false);
    expect(isLoggedInStage("landing")).toBe(false);
    expect(isLoggedInStage("login")).toBe(false);
  });
});

describe("signup stage does not run login-only effects", () => {
  it("dispatching SET_STAGE signup starts no engine (no session for a signup user)", async () => {
    authMock.getCurrentUserId.mockResolvedValue(null);
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    expect(engines).toHaveLength(0);

    act(() => {
      getApi().dispatch({ type: "SET_STAGE", stage: "signup" });
    });

    // The reducer->sync subscription and the idle timer are both gated on
    // isLoggedInStage, so a signup user never spins up an engine.
    await waitFor(() => expect(api?.stage).toBe("signup"));
    expect(engines).toHaveLength(0);
  });
});

describe("GameProvider boot", () => {
  it("no session -> landing", async () => {
    authMock.getCurrentUserId.mockResolvedValue(null);
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));
  });

  it("restored session with an empty save -> onboard", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-A");
    syncMock.loadSave.mockResolvedValue({ doc: null, revision: 0 });
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("onboard"));
    expect(engines).toHaveLength(1); // engine started for the session
    expect(engines[0].start).toHaveBeenCalled();
  });

  it("restored session with a completed save -> app (HYDRATE routes it)", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-A");
    syncMock.loadSave.mockResolvedValue({
      doc: {
        docVersion: 1,
        ideas: [{ fields: {}, done: {} }],
        activeIdea: 0,
        siteHeadline: "",
        onboardingComplete: true,
      },
      revision: 3,
    });
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("app"));
  });

  it("hydrate failure falls back to onboard (never strands / crashes)", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-A");
    syncMock.loadSave.mockRejectedValue(new Error("load blew up"));
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("onboard"));
  });

  it("loads existing fp_ledger rows into state and does NOT re-insert them", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-A");
    syncMock.loadSave.mockResolvedValue({
      doc: {
        docVersion: 1,
        ideas: [{ fields: {}, done: {} }],
        activeIdea: 0,
        siteHeadline: "",
        onboardingComplete: true,
      },
      revision: 3,
    });
    syncMock.loadLedger.mockResolvedValue([
      { id: "s1", kind: "sale", payer: "Mom", amountCents: 1500, createdAt: "2026-07-31T00:00:00.000Z" },
      {
        id: "s2",
        kind: "sale",
        payer: "Dad",
        amountCents: 2500,
        grossCents: 2500,
        feeCents: 100,
        netCents: 2400,
        providerId: "replit",
        createdAt: "2026-07-31T00:01:00.000Z",
      },
    ]);
    renderProvider();

    await waitFor(() => expect(api?.stage).toBe("app"));
    // Server rows survive the session boundary: totals + list are populated.
    await waitFor(() => expect(api?.ledger).toHaveLength(2));
    // Net (fee felt): s1 has no snapshot so it counts at gross; s2 counts at net.
    expect(api?.salesSumCents()).toBe(1500 + 2400);
    // Gross exposes the pre-fee total.
    expect(api?.grossSalesSumCents()).toBe(1500 + 2500);

    // The just-loaded rows must NOT be forwarded to the engine for (re-)insert:
    // knownLedgerIdsRef was seeded from them before SET_LEDGER dispatched.
    expect(engines).toHaveLength(1);
    const forwardedIds = engines[0].notifyLedger.mock.calls.map(
      ([r]) => (r as { id: string }).id,
    );
    expect(forwardedIds).not.toContain("s1");
    expect(forwardedIds).not.toContain("s2");
  });

  it("notifyLedger forwards the per-sale fee fields (gross/fee/net/providerId) to the engine", async () => {
    authMock.getCurrentUserId.mockResolvedValue("user-A");
    syncMock.loadSave.mockResolvedValue({
      doc: {
        docVersion: 1,
        ideas: [{ fields: {}, done: {} }],
        activeIdea: 0,
        siteHeadline: "",
        onboardingComplete: true,
      },
      revision: 3,
    });
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("app"));

    // A fee-snapshotted row that was NOT seeded into knownLedgerIds (unlike the
    // hydrate path) must be forwarded to the engine WITH its fee fields intact.
    act(() => {
      getApi().dispatch({
        type: "SET_LEDGER",
        ledger: [
          {
            id: "sale-fee",
            kind: "sale",
            payer: "Mom",
            amountCents: 2000,
            grossCents: 2000,
            feeCents: 88,
            netCents: 1912,
            providerId: "replit",
            createdAt: "2026-08-02T00:00:00.000Z",
          },
        ],
      });
    });

    await waitFor(() =>
      expect(engines[0].notifyLedger).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "sale-fee",
          grossCents: 2000,
          feeCents: 88,
          netCents: 1912,
          providerId: "replit",
        }),
      ),
    );
  });
});

describe("GameProvider login (draft wipe + session boundary)", () => {
  async function bootToLanding() {
    authMock.getCurrentUserId.mockResolvedValue(null);
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));
  }

  it("different-user login wipes ALL fp:* drafts before hydrating", async () => {
    await bootToLanding();
    draftMock.getLastUserId.mockReturnValue("user-A");
    authMock.loginChild.mockResolvedValue({
      ok: true,
      userId: "user-B",
      profile: { firstName: "Bee", handle: "bee" },
    });

    await act(async () => {
      await getApi().login("Bee", "supersecret10");
    });

    expect(draftMock.wipeAllFpKeys).toHaveBeenCalledTimes(1);
    expect(draftMock.setLastUserId).toHaveBeenCalledWith("user-B");
    // FIX 5: the prior child's queued outbox gets a best-effort flush attempt
    // for THEIR user id, initiated BEFORE the wipe destroys the queue.
    expect(syncMock.flushOutboxForPriorUser).toHaveBeenCalledWith("user-A");
    expect(syncMock.flushOutboxForPriorUser.mock.invocationCallOrder[0]).toBeLessThan(
      draftMock.wipeAllFpKeys.mock.invocationCallOrder[0],
    );
    await waitFor(() => expect(api?.stage).toBe("onboard"));
  });

  it("same-user re-login does NOT wipe drafts (restores them)", async () => {
    await bootToLanding();
    draftMock.getLastUserId.mockReturnValue("user-A");
    authMock.loginChild.mockResolvedValue({
      ok: true,
      userId: "user-A",
      profile: { firstName: "Ada", handle: "ada" },
    });

    await act(async () => {
      await getApi().login("Ada", "supersecret10");
    });

    expect(draftMock.wipeAllFpKeys).not.toHaveBeenCalled();
    expect(syncMock.flushOutboxForPriorUser).not.toHaveBeenCalled(); // same user: no pre-wipe flush
    await waitFor(() => expect(api?.stage).toBe("onboard"));
  });

  it("P0: a second login tears down the previous session's engine BEFORE starting a new one", async () => {
    await bootToLanding();
    authMock.loginChild.mockResolvedValue({
      ok: true,
      userId: "user-A",
      profile: { firstName: "Ada", handle: "ada" },
    });
    await act(async () => {
      await getApi().login("Ada", "supersecret10");
    });
    expect(engines).toHaveLength(1);
    const firstEngine = engines[0];

    // Child B logs in on the same device.
    authMock.loginChild.mockResolvedValue({
      ok: true,
      userId: "user-B",
      profile: { firstName: "Bee", handle: "bee" },
    });
    await act(async () => {
      await getApi().login("Bee", "supersecret10");
    });

    // The previous engine was stopped (its in-flight writes neutralized) and a
    // fresh engine started for the new session.
    expect(firstEngine.stop).toHaveBeenCalled();
    expect(engines).toHaveLength(2);
    expect(engines[1].start).toHaveBeenCalled();
  });

  it("failed login returns false and starts no engine", async () => {
    await bootToLanding();
    authMock.loginChild.mockResolvedValue({ ok: false });
    let result: boolean | undefined;
    await act(async () => {
      result = await getApi().login("Nope", "bad");
    });
    expect(result).toBe(false);
    expect(engines).toHaveLength(0);
  });
});

// ── Unit 7 review FIX 5: promotion boundary + rebased-doc feedback loop ───────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Boot a logged-in session at the app stage with an empty completed save. */
async function bootToApp() {
  authMock.getCurrentUserId.mockResolvedValue("user-A");
  syncMock.loadSave.mockResolvedValue({
    doc: {
      docVersion: 1,
      ideas: [],
      activeIdea: 0,
      siteHeadline: "",
      onboardingComplete: true,
    },
    revision: 1,
  });
  renderProvider();
  await waitFor(() => expect(api?.stage).toBe("app"));
}

/** Drive one idea through phases 1-3 with real reducer dispatches. */
function completeThroughValidate(ideaIndex: number) {
  act(() => {
    for (const phase of ["sell", "build", "validate"] as const) {
      for (const stepId of criterionIdsForPhase(phase)) {
        const step = stepById(stepId);
        if (!step) throw new Error(`no step ${stepId}`);
        for (let index = 0; index < step.tasks.length; index++) {
          getApi().dispatch({ type: "COMPLETE_TASK", ideaIndex, stepId, index });
        }
        getApi().dispatch({ type: "DISMISS_CELEBRATION" });
      }
    }
  });
}

describe("promoteIdea / archiveBusiness / unarchiveBusiness (caller boundary)", () => {
  it("promoteIdea mints a REAL UUID business id + timestamp and returns true", async () => {
    await bootToApp();
    act(() => {
      getApi().dispatch({ type: "CREATE_IDEA", ideaId: "idea-a" });
      getApi().dispatch({ type: "CLOSE_RUNNER" });
    });
    completeThroughValidate(0);

    let outcome: boolean | undefined;
    act(() => {
      outcome = getApi().promoteIdea(0);
    });
    expect(outcome).toBe(true);
    const business = getApi().businesses?.[0];
    expect(business?.id).toMatch(UUID_RE); // crypto.randomUUID shape, minted here
    expect(business?.ideaId).toBe("idea-a");
    expect(business?.archived).toBe(false);
    expect(typeof business?.promotedAt).toBe("number");
  });

  it("promoteIdea returns FALSE (guaranteed no-op) on every refusal: not validated, id-less idea, business active", async () => {
    await bootToApp();
    act(() => {
      getApi().dispatch({ type: "CREATE_IDEA", ideaId: "idea-a" });
      getApi().dispatch({ type: "CLOSE_RUNNER" });
      getApi().dispatch({ type: "CREATE_IDEA" }); // legacy, id-less
      getApi().dispatch({ type: "CLOSE_RUNNER" });
    });
    // Not through Validate yet -> refused.
    expect(getApi().promoteIdea(0)).toBe(false);
    expect(getApi().businesses).toBeUndefined();
    // Unknown index -> refused.
    expect(getApi().promoteIdea(9)).toBe(false);

    completeThroughValidate(0);
    completeThroughValidate(1);
    // The ID-LESS legacy idea cannot be promoted this session even when validated.
    expect(getApi().promoteIdea(1)).toBe(false);
    expect(getApi().businesses).toBeUndefined();
    // Promote the real one, then a second promotion is refused (one active).
    act(() => {
      expect(getApi().promoteIdea(0)).toBe(true);
    });
    expect(getApi().promoteIdea(0)).toBe(false);
    expect(getApi().businesses).toHaveLength(1);
  });

  it("archiveBusiness / unarchiveBusiness stamp Date.now() as archiveStateAt", async () => {
    await bootToApp();
    act(() => {
      getApi().dispatch({ type: "CREATE_IDEA", ideaId: "idea-a" });
      getApi().dispatch({ type: "CLOSE_RUNNER" });
    });
    completeThroughValidate(0);
    act(() => {
      getApi().promoteIdea(0);
    });
    const businessId = getApi().businesses![0].id;

    const before = Date.now();
    act(() => {
      getApi().archiveBusiness();
    });
    const archived = getApi().businesses![0];
    expect(archived.archived).toBe(true);
    expect(archived.archiveStateAt).toBeGreaterThanOrEqual(before);

    act(() => {
      getApi().unarchiveBusiness(businessId);
    });
    const restored = getApi().businesses![0];
    expect(restored.archived).toBe(false);
    expect(restored.archiveStateAt).toBeGreaterThanOrEqual(archived.archiveStateAt!);
    // archiveBusiness with nothing active is a silent no-op (refusal-safe).
    act(() => {
      getApi().unarchiveBusiness("nope");
    });
    expect(getApi().businesses).toHaveLength(1);
  });

  it("PROMOTION SEAM, selector-driven: the coach's promote target becomes 4.1 after promoteIdea", async () => {
    const ALL_BUILT: ReadonlySet<string> = new Set(CRITERION_SEQUENCE);
    await bootToApp();
    act(() => {
      getApi().dispatch({ type: "CREATE_IDEA", ideaId: "idea-a" });
      getApi().dispatch({ type: "CLOSE_RUNNER" });
    });
    completeThroughValidate(0);

    // Validated but unpromoted: the coach surfaces the promotion target.
    expect(nextCoachTarget(getApi(), ALL_BUILT)).toEqual({
      kind: "promote",
      ideaIndex: 0,
      ideaId: "idea-a",
    });

    act(() => {
      expect(getApi().promoteIdea(0)).toBe(true);
    });

    // Promotion opens the business gate: the coach now points at 4.1's room.
    const step41 = stepById("4.1");
    expect(nextCoachTarget(getApi(), ALL_BUILT)).toEqual({
      kind: "criterion",
      stepId: "4.1",
      room: step41?.room,
    });
  });
});

describe("onRebasedDoc → UNION_REMOTE (FIX 1 wiring)", () => {
  it("feeds a committed rebased doc back into live state without disturbing the open runner", async () => {
    await bootToApp();
    act(() => {
      getApi().dispatch({ type: "CREATE_IDEA", ideaId: "idea-a" });
    });
    expect(getApi().runnerOpen).toBe(true);

    // The engine reports a committed rebased doc carrying a concurrent
    // session's completion + business.
    const mergedDoc: SaveDoc = {
      docVersion: 1,
      ideas: [{ id: "idea-a", fields: {}, done: {}, doneByTask: { "1.1.1": true } }],
      activeIdea: 0,
      siteHeadline: "remote headline",
      onboardingComplete: true,
      businesses: [{ id: "biz-remote", ideaId: "idea-b", archived: true, archiveStateAt: 5 }],
    };
    const onRebasedDoc = engines[0].deps.onRebasedDoc as (doc: SaveDoc) => void;
    expect(typeof onRebasedDoc).toBe("function");
    act(() => {
      onRebasedDoc(mergedDoc);
    });

    // Monotonic state unioned in…
    expect(getApi().isTaskDone(0, "1.1", 0)).toBe(true);
    expect(getApi().businesses).toEqual([
      { id: "biz-remote", ideaId: "idea-b", archived: true, archiveStateAt: 5 },
    ]);
    // …while UI + latest-intent stay untouched (runner still open, no celebration).
    expect(getApi().runnerOpen).toBe(true);
    expect(getApi().celebrate).toBeNull();
    expect(getApi().profile.siteHeadline).not.toBe("remote headline");
  });
});
