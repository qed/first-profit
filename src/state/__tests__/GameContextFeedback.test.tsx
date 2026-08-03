// @vitest-environment jsdom
//
// REAL GameContext.submitFeedback coverage (unit-review test debt). Unlike
// GameContext.test.tsx (which stubs the whole sync module), this suite keeps the
// sync module REAL — real isValidFeedbackRow / enqueueFeedback / day counter /
// utcDayToday against jsdom's real localStorage — and stubs only the network
// seams (createSyncEngine, resolveProfileId, loadSave, loadLedger). draftCache
// is real too, so getLastUserId/setLastUserId hit real storage. What's pinned:
//  - an under-cap submit reaches the engine with a real crypto.randomUUID id
//    and the default band "unknown";
//  - the local at-cap short-circuit ('capped', nothing enqueued);
//  - no recorded user -> 'dropped';
//  - no live engine -> durable enqueue -> 'queued';
//  - the UTC-midnight boundary of the REAL day derivation;
//  - FIX 6: an invalid row (bad band through the seam) never consumes budget;
//  - FIX 3: a throwing storage resolves 'dropped' without corrupting the counter.
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

interface FakeEngine {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  notifyLedger: ReturnType<typeof vi.fn>;
  notifyFeedback: ReturnType<typeof vi.fn>;
  notifySnapshotChange: ReturnType<typeof vi.fn>;
  flushPending: ReturnType<typeof vi.fn>;
  flushOnHide: ReturnType<typeof vi.fn>;
}
const { engines } = vi.hoisted(() => ({ engines: [] as unknown[] }));
const typedEngines = engines as FakeEngine[];

vi.mock("../../lib/sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/sync")>();
  return {
    ...actual,
    // Network seams only — everything feedback-shaped stays REAL.
    resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
    resetProfileIdCache: vi.fn(),
    loadSave: vi.fn().mockResolvedValue({ doc: null, revision: 0 }),
    loadLedger: vi.fn().mockResolvedValue([]),
    flushOutboxForPriorUser: vi.fn().mockResolvedValue(undefined),
    createSyncEngine: () => {
      const engine = {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
        notifyLedger: vi.fn(),
        notifyFeedback: vi.fn().mockResolvedValue("sent"),
        notifySnapshotChange: vi.fn(),
        flushPending: vi.fn().mockResolvedValue(undefined),
        flushOnHide: vi.fn(),
      };
      engines.push(engine);
      return engine;
    },
  };
});

import { GameProvider, useGame, type GameApi } from "../GameContext";
import {
  readOutbox,
  feedbackCountForDay,
  setFeedbackCountForDay,
  utcDayToday,
  FEEDBACK_DAILY_CAP,
  type FeedbackBand,
} from "../../lib/sync";
import { setLastUserId } from "../../lib/draftCache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

async function bootToLanding() {
  authMock.getCurrentUserId.mockResolvedValue(null);
  renderProvider();
  await waitFor(() => expect(api?.stage).toBe("landing"));
}

async function loginAs(userId: string) {
  await bootToLanding();
  authMock.loginChild.mockResolvedValue({
    ok: true,
    userId,
    profile: { firstName: "Kid", handle: "kid" },
  });
  await act(async () => {
    await getApi().login("kid", "supersecret10");
  });
  await waitFor(() => expect(api?.stage).toBe("onboard"));
}

async function submit(taskId: string, body: string, band?: FeedbackBand) {
  let outcome: string | undefined;
  await act(async () => {
    outcome = await getApi().submitFeedback(taskId, body, band);
  });
  return outcome;
}

beforeEach(() => {
  engines.length = 0;
  api = null;
  window.localStorage.clear();
  authMock.loginChild.mockReset();
  authMock.logout.mockReset().mockResolvedValue("explicit");
  authMock.getCurrentUserId.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("GameContext.submitFeedback (real feedback plumbing)", () => {
  it("under-cap submit reaches the engine with a REAL crypto.randomUUID id and band 'unknown'", async () => {
    await loginAs("user-A");

    const outcome = await submit("1.1.2", "help me");
    expect(outcome).toBe("sent");
    expect(typedEngines).toHaveLength(1);
    expect(typedEngines[0].notifyFeedback).toHaveBeenCalledTimes(1);
    const row = typedEngines[0].notifyFeedback.mock.calls[0][0] as {
      id: string;
      taskId: string;
      band: string;
      body: string;
    };
    expect(row).toMatchObject({ taskId: "1.1.2", band: "unknown", body: "help me" });
    // A REAL crypto.randomUUID id — the collision-resistance the server's
    // 23505-as-success contract depends on.
    expect(row.id).toMatch(UUID_RE);
    // The real day counter was bumped for today (FIX 6: after validation).
    expect(feedbackCountForDay("user-A", utcDayToday())).toBe(1);
  });

  it("at the local cap it short-circuits to 'capped' and enqueues NOTHING", async () => {
    await loginAs("user-A");
    setFeedbackCountForDay("user-A", utcDayToday(), FEEDBACK_DAILY_CAP);

    const outcome = await submit("1.1.1", "one more");
    expect(outcome).toBe("capped");
    expect(typedEngines[0].notifyFeedback).not.toHaveBeenCalled();
    expect(readOutbox("user-A").feedback).toHaveLength(0);
  });

  it("with no recorded user it resolves 'dropped'", async () => {
    await bootToLanding(); // never logged in; no firstprofit.lastUserId marker
    const outcome = await submit("1.1.1", "who am i");
    expect(outcome).toBe("dropped");
  });

  it("with NO live engine it enqueues durably and resolves the honest 'queued'", async () => {
    await bootToLanding(); // no engine exists at the landing stage
    setLastUserId("user-Z"); // but a user is recorded on the device

    const outcome = await submit("1.2.3", "engine is down");
    expect(outcome).toBe("queued");
    const { feedback } = readOutbox("user-Z");
    expect(feedback).toHaveLength(1);
    expect(feedback[0].row).toMatchObject({
      taskId: "1.2.3",
      band: "unknown",
      body: "engine is down",
    });
    expect(feedback[0].row.id).toMatch(UUID_RE);
    expect(feedbackCountForDay("user-Z", utcDayToday())).toBe(1);
  });

  it("UTC midnight boundary: the REAL day derivation caps at 23:59:59.999Z and resets at 00:00:00.000Z", async () => {
    // Fake ONLY Date (real timers keep waitFor/microtasks alive).
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-08-03T23:59:59.999Z") });
    await loginAs("user-A");
    setFeedbackCountForDay("user-A", "2026-08-03", FEEDBACK_DAILY_CAP);

    // The last millisecond of the UTC day is still capped.
    expect(await submit("1.1.1", "late night")).toBe("capped");
    expect(typedEngines[0].notifyFeedback).not.toHaveBeenCalled();

    // The very first millisecond of the next UTC day is a fresh budget.
    vi.setSystemTime(new Date("2026-08-04T00:00:00.000Z"));
    expect(await submit("1.1.1", "new day")).toBe("sent");
    expect(typedEngines[0].notifyFeedback).toHaveBeenCalledTimes(1);
    expect(feedbackCountForDay("user-A", "2026-08-04")).toBe(1);
    expect(feedbackCountForDay("user-A", "2026-08-03")).toBe(0); // old record replaced
  });

  it("FIX 6: an invalid row (bad band through the seam) is 'dropped' and never consumes the day budget", async () => {
    await loginAs("user-A");

    const outcome = await submit("1.1.1", "hi", "g1_2" as FeedbackBand);
    expect(outcome).toBe("dropped");
    expect(typedEngines[0].notifyFeedback).not.toHaveBeenCalled();
    expect(feedbackCountForDay("user-A", utcDayToday())).toBe(0);
    expect(readOutbox("user-A").feedback).toHaveLength(0);
  });

  it("FIX 3: a THROWING storage during enqueue resolves 'dropped' without corrupting the counter", async () => {
    await bootToLanding();
    setLastUserId("user-Z"); // engine-null path exercises the direct enqueue

    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    let outcome: string | undefined;
    try {
      outcome = await submit("1.1.1", "full disk");
    } finally {
      spy.mockRestore();
    }
    expect(outcome).toBe("dropped");
    expect(readOutbox("user-Z").feedback).toHaveLength(0); // nothing half-queued
    expect(feedbackCountForDay("user-Z", utcDayToday())).toBe(0); // budget untouched
  });
});
