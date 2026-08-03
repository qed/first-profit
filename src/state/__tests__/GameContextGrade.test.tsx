// @vitest-environment jsdom
/**
 * GameContext grade/band plumbing (Unit 3; R9/R10):
 *  - login adopts the roster grade (or null) into profile state; `band` derives
 *    via displayBand (g6_8 while unknown);
 *  - submitGradeAnswer success adopts the SERVER's derived grade;
 *  - generic failure adopts the CLIENT-derived grade for the session and arms
 *    exactly ONE silent write-back retry on the next window focus;
 *  - the generation guard discards a write that resolves after logout;
 *  - ask-once semantics: skip sets the in-memory flag only; login re-arms it.
 * Auth and the sync network seams are stubbed (the GameContextFeedback suite
 * covers the real feedback plumbing).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, act, waitFor, cleanup } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────
const authMock = {
  loginChild: vi.fn(),
  logout: vi.fn(),
  getCurrentUserId: vi.fn(),
  submitBirthYear: vi.fn(),
};
vi.mock("../../lib/auth", () => ({
  loginChild: (...a: unknown[]) => authMock.loginChild(...a),
  logout: (...a: unknown[]) => authMock.logout(...a),
  getCurrentUserId: (...a: unknown[]) => authMock.getCurrentUserId(...a),
  submitBirthYear: (...a: unknown[]) => authMock.submitBirthYear(...a),
}));

vi.mock("../../lib/sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/sync")>();
  return {
    ...actual,
    resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
    resetProfileIdCache: vi.fn(),
    loadSave: vi.fn().mockResolvedValue({ doc: null, revision: 0 }),
    loadLedger: vi.fn().mockResolvedValue([]),
    flushOutboxForPriorUser: vi.fn().mockResolvedValue(undefined),
    createSyncEngine: () => ({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      notifyLedger: vi.fn(),
      notifyFeedback: vi.fn().mockResolvedValue("sent"),
      notifySnapshotChange: vi.fn(),
      flushPending: vi.fn().mockResolvedValue(undefined),
      flushOnHide: vi.fn(),
    }),
  };
});

import { GameProvider, useGame, type GameApi } from "../GameContext";

let api: GameApi | null = null;
function Probe() {
  api = useGame();
  return React.createElement("div", null, api.stage);
}

function getApi(): GameApi {
  if (!api) throw new Error("provider not mounted");
  return api;
}

async function bootToLanding() {
  authMock.getCurrentUserId.mockResolvedValue(null);
  render(React.createElement(GameProvider, null, React.createElement(Probe)));
  await waitFor(() => expect(api?.stage).toBe("landing"));
}

async function loginAs(userId: string, grade: number | null) {
  authMock.loginChild.mockResolvedValue({
    ok: true,
    userId,
    profile: { firstName: "Kid", handle: "kid" },
    grade,
  });
  await act(async () => {
    await getApi().login("kid", "supersecret10");
  });
  await waitFor(() => expect(api?.stage).toBe("onboard"));
}

const fireFocus = async () =>
  act(async () => {
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
  });

beforeEach(() => {
  api = null;
  window.localStorage.clear();
  authMock.loginChild.mockReset();
  authMock.logout.mockReset().mockResolvedValue("explicit");
  authMock.getCurrentUserId.mockReset().mockResolvedValue(null);
  authMock.submitBirthYear.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("grade adoption at login", () => {
  it("a roster grade rides the login response into state; band resolves", async () => {
    await bootToLanding();
    await loginAs("user-A", 4);
    expect(getApi().grade).toBe(4);
    expect(getApi().band).toBe("g3_5");
    expect(getApi().gradeAskDone).toBe(false); // never asked; grade gate hides the card
  });

  it("grade null -> band defaults to g6_8 and the ask is armed", async () => {
    await bootToLanding();
    await loginAs("user-A", null);
    expect(getApi().grade).toBeNull();
    expect(getApi().band).toBe("g6_8");
    expect(getApi().gradeAskDone).toBe(false);
  });
});

describe("submitGradeAnswer", () => {
  it("success adopts the SERVER's derived grade and marks the ask done", async () => {
    await bootToLanding();
    await loginAs("user-A", null);
    authMock.submitBirthYear.mockResolvedValue({ ok: true, grade: 6 });

    let outcome: { ok: boolean } | undefined;
    await act(async () => {
      outcome = await getApi().submitGradeAnswer(2015);
    });

    expect(outcome).toEqual({ ok: true });
    expect(authMock.submitBirthYear).toHaveBeenCalledTimes(1);
    expect(authMock.submitBirthYear).toHaveBeenCalledWith(2015);
    expect(getApi().grade).toBe(6);
    expect(getApi().band).toBe("g6_8");
    expect(getApi().gradeAskDone).toBe(true);
  });

  it("generic failure adopts the CLIENT-derived grade for the session and retries ONCE on focus", async () => {
    // Pin the clock: Oct 2026 -> school year 2026-27 -> born 2015 = grade 6.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-01T12:00:00Z") });
    await bootToLanding();
    await loginAs("user-A", null);
    authMock.submitBirthYear.mockResolvedValue({ ok: false });

    let outcome: { ok: boolean } | undefined;
    await act(async () => {
      outcome = await getApi().submitGradeAnswer(2015);
    });

    // Never blocks, never errors at the kid: the band applies locally.
    expect(outcome).toEqual({ ok: false });
    expect(getApi().grade).toBe(6);
    expect(getApi().band).toBe("g6_8");
    expect(getApi().gradeAskDone).toBe(true);

    // Next focus: exactly one silent write-back retry; success adopts the
    // server's answer (which may differ from the local derivation).
    authMock.submitBirthYear.mockResolvedValue({ ok: true, grade: 5 });
    await fireFocus();
    expect(authMock.submitBirthYear).toHaveBeenCalledTimes(2);
    expect(getApi().grade).toBe(5);

    // The retry was consumed: further focus events never re-post (no
    // retry storm against the rate limiter).
    await fireFocus();
    await fireFocus();
    expect(authMock.submitBirthYear).toHaveBeenCalledTimes(2);
  });

  it("a retry that fails again stays silent and never re-arms", async () => {
    await bootToLanding();
    await loginAs("user-A", null);
    authMock.submitBirthYear.mockResolvedValue({ ok: false });

    await act(async () => {
      await getApi().submitGradeAnswer(2015);
    });
    await fireFocus(); // the one retry, also failing
    expect(authMock.submitBirthYear).toHaveBeenCalledTimes(2);
    await fireFocus();
    expect(authMock.submitBirthYear).toHaveBeenCalledTimes(2); // never again
  });

  it("GENERATION GUARD: a write resolving after logout is discarded", async () => {
    await bootToLanding();
    await loginAs("user-A", null);

    let resolveWrite: ((v: { ok: true; grade: number }) => void) | null = null;
    authMock.submitBirthYear.mockImplementation(
      () =>
        new Promise((res) => {
          resolveWrite = res as typeof resolveWrite;
        }),
    );

    let pending: Promise<{ ok: boolean }> | null = null;
    act(() => {
      pending = getApi().submitGradeAnswer(2015);
    });
    // The session changes while the write is in flight.
    await act(async () => {
      await getApi().logout();
    });
    await act(async () => {
      resolveWrite?.({ ok: true, grade: 8 });
      await pending;
    });

    // Nothing from the stale session lands in the new one.
    expect(getApi().grade).toBeNull();
    expect(getApi().gradeAskDone).toBe(false);
  });
});

describe("ask-once bookkeeping", () => {
  it("skip sets the in-memory flag only; grade stays null and band stays the default", async () => {
    await bootToLanding();
    await loginAs("user-A", null);

    act(() => {
      getApi().skipGradeAsk();
    });
    expect(getApi().gradeAskDone).toBe(true);
    expect(getApi().grade).toBeNull();
    expect(getApi().band).toBe("g6_8");
    // Nothing was persisted for the skip: no fp:* draft key carries it, so the
    // next session re-asks while the roster grade stays null.
    const fpKeys = Object.keys(window.localStorage).filter((k) => k.startsWith("fp:"));
    expect(fpKeys.filter((k) => k.includes("grade"))).toHaveLength(0);
  });

  it("a NEW login re-arms the ask (skip does not survive the session boundary)", async () => {
    await bootToLanding();
    await loginAs("user-A", null);
    act(() => {
      getApi().skipGradeAsk();
    });
    expect(getApi().gradeAskDone).toBe(true);

    await act(async () => {
      await getApi().logout();
    });
    await loginAs("user-A", null);
    expect(getApi().gradeAskDone).toBe(false); // asked again while roster grade is null
  });
});
