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
};
vi.mock("../../lib/auth", () => ({
  loginChild: (...a: unknown[]) => authMock.loginChild(...a),
  logout: (...a: unknown[]) => authMock.logout(...a),
  getCurrentUserId: (...a: unknown[]) => authMock.getCurrentUserId(...a),
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
  notifySnapshotChange: ReturnType<typeof vi.fn>;
  flushOnHide: ReturnType<typeof vi.fn>;
}
const engines: FakeEngine[] = [];
const syncMock = {
  resolveProfileId: vi.fn(),
  loadSave: vi.fn(),
};
vi.mock("../../lib/sync", () => ({
  resolveProfileId: (...a: unknown[]) => syncMock.resolveProfileId(...a),
  resetProfileIdCache: vi.fn(),
  loadSave: (...a: unknown[]) => syncMock.loadSave(...a),
  createSyncEngine: () => {
    const engine: FakeEngine = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      notifyLedger: vi.fn(),
      notifySnapshotChange: vi.fn(),
      flushOnHide: vi.fn(),
    };
    engines.push(engine);
    return engine;
  },
}));

import { GameProvider, useGame, type GameApi } from "../GameContext";

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
  draftMock.wipeAllForUser.mockReset();
  draftMock.wipeAllFpKeys.mockReset();
  draftMock.getLastUserId.mockReset().mockReturnValue(null);
  draftMock.setLastUserId.mockReset();
  syncMock.resolveProfileId.mockReset().mockResolvedValue("profile-1");
  syncMock.loadSave.mockReset().mockResolvedValue({ doc: null, revision: 0 });
});

afterEach(() => {
  cleanup();
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
