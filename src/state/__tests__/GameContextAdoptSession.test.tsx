// @vitest-environment jsdom
//
// THE EXTRACTION REGRESSION (v3 Unit 6).
//
// GameContext's login sequence — shared-device wipe -> SET_PROFILE -> profile
// draft cache -> hydrateAndRoute — used to be inlined inside `login`. Unit 6
// extracted it to `adoptSession` so the handoff landing at /auth/enter adopts
// its session through the SAME path. That refactor is exactly the kind that can
// silently drop the shared-device wipe (a security control with no visible
// symptom), so these tests pin the ORDER and the effects for BOTH doors:
//
//  - password login still performs wipe -> profile -> draft cache -> hydrate,
//    in that order, with the same arguments as before;
//  - the handoff redeem performs the identical sequence;
//  - a handoff landing while ANOTHER kid's session is resident wipes first and
//    leaves no state bleed (in-memory-reducer-state-survives-logout learning);
//  - a refused exchange adopts nothing.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, act, waitFor, cleanup } from "@testing-library/react";

// ── Ordered call log: every step of the sequence records into ONE array, so an
//    assertion can pin the ORDER and not merely the occurrence. ──────────────
const order: string[] = [];

const authMock = {
  loginChild: vi.fn(),
  redeemSignInToken: vi.fn(),
  logout: vi.fn(),
  getCurrentUserId: vi.fn(),
  submitBirthYear: vi.fn(),
  fetchSiteStatus: vi.fn(),
  claimHandle: vi.fn(),
  publishSite: vi.fn(),
};
vi.mock("../../lib/auth", () => ({
  loginChild: (...a: unknown[]) => authMock.loginChild(...a),
  redeemSignInToken: (...a: unknown[]) => authMock.redeemSignInToken(...a),
  logout: (...a: unknown[]) => authMock.logout(...a),
  getCurrentUserId: (...a: unknown[]) => authMock.getCurrentUserId(...a),
  submitBirthYear: (...a: unknown[]) => authMock.submitBirthYear(...a),
  fetchSiteStatus: (...a: unknown[]) => authMock.fetchSiteStatus(...a),
  claimHandle: (...a: unknown[]) => authMock.claimHandle(...a),
  publishSite: (...a: unknown[]) => authMock.publishSite(...a),
}));

// The boot URL read. Real by default ({code:null}) so every other test in this
// file behaves exactly as before; the boot-race test seeds a pending handoff.
const enterLinkMock = { code: null as string | null, fromEnterRoute: false };
vi.mock("../../screens/auth/enterLink", () => ({
  peekEnterLink: () => enterLinkMock,
}));

const draftStore = new Map<string, unknown>();
const draftMock = {
  wipeAllForUser: vi.fn(),
  wipeAllFpKeys: vi.fn(() => order.push("wipeAllFpKeys")),
  getLastUserId: vi.fn(),
  setLastUserId: vi.fn((id: string) => order.push(`setLastUserId:${id}`)),
  getDraft: vi.fn((userId: string, name: string) => draftStore.get(`${userId}:${name}`)),
  setDraft: vi.fn((userId: string, name: string, value: unknown) => {
    order.push(`setDraft:${userId}:${name}`);
    draftStore.set(`${userId}:${name}`, value);
    return true;
  }),
};
vi.mock("../../lib/draftCache", () => ({
  wipeAllForUser: (...a: unknown[]) => draftMock.wipeAllForUser(...a),
  wipeAllFpKeys: (...a: unknown[]) => draftMock.wipeAllFpKeys(...(a as [])),
  getLastUserId: (...a: unknown[]) => draftMock.getLastUserId(...a),
  setLastUserId: (...a: unknown[]) => draftMock.setLastUserId(...(a as [string])),
  getDraft: (...a: unknown[]) => draftMock.getDraft(...(a as [string, string])),
  setDraft: (...a: unknown[]) => draftMock.setDraft(...(a as [string, string, unknown])),
}));

const syncMock = {
  resolveProfileId: vi.fn(),
  loadSave: vi.fn(),
  loadLedger: vi.fn(),
  flushOutboxForPriorUser: vi.fn(),
};
vi.mock("../../lib/sync", () => ({
  resolveProfileId: (...a: unknown[]) => {
    order.push("hydrate:resolveProfileId");
    return syncMock.resolveProfileId(...a);
  },
  resetProfileIdCache: vi.fn(() => order.push("resetProfileIdCache")),
  loadSave: (...a: unknown[]) => syncMock.loadSave(...a),
  loadLedger: (...a: unknown[]) => syncMock.loadLedger(...a),
  flushOutboxForPriorUser: (...a: unknown[]) => {
    order.push("flushOutboxForPriorUser");
    return syncMock.flushOutboxForPriorUser(...a);
  },
  enqueueFeedback: vi.fn().mockReturnValue(true),
  isValidFeedbackRow: vi.fn().mockReturnValue(true),
  feedbackCountForDay: vi.fn().mockReturnValue(0),
  bumpFeedbackCountForDay: vi.fn(),
  utcDayToday: () => new Date().toISOString().slice(0, 10),
  FEEDBACK_DAILY_CAP: 50,
  FEEDBACK_BODY_MAX: 1000,
  createSyncEngine: () => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    notifyLedger: vi.fn(),
    notifyFeedback: vi.fn().mockResolvedValue("sent"),
    notifySnapshotChange: vi.fn(),
    flushPending: vi.fn().mockResolvedValue("landed"),
    flushOnHide: vi.fn(),
  }),
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

/** The success value both doors return (identical by contract). */
const session = {
  ok: true as const,
  userId: "kid-B",
  profile: { handle: "remi.newal", firstName: "Remi" },
  grade: 4,
};

/** wipe -> profile-cache -> hydrate, with the outbox flush before the wipe. */
const EXPECTED_SEQUENCE = [
  "flushOutboxForPriorUser",
  "wipeAllFpKeys",
  "setLastUserId:kid-B",
  "setDraft:kid-B:profileCache",
  "hydrate:resolveProfileId",
];

beforeEach(() => {
  api = null;
  order.length = 0;
  draftStore.clear();
  enterLinkMock.code = null;
  enterLinkMock.fromEnterRoute = false;
  authMock.loginChild.mockReset();
  authMock.redeemSignInToken.mockReset();
  authMock.logout.mockReset().mockResolvedValue("explicit");
  authMock.getCurrentUserId.mockReset().mockResolvedValue(null);
  authMock.fetchSiteStatus.mockReset().mockResolvedValue({ ok: false });
  authMock.claimHandle.mockReset().mockResolvedValue({ ok: false, reason: "outage" });
  authMock.publishSite.mockReset().mockResolvedValue({ ok: false, reason: "outage" });
  draftMock.wipeAllForUser.mockClear();
  draftMock.wipeAllFpKeys.mockClear();
  draftMock.setLastUserId.mockClear();
  draftMock.setDraft.mockClear();
  draftMock.getDraft.mockClear();
  // A DIFFERENT kid was the last one on this device — the shared-device case.
  draftMock.getLastUserId.mockReset().mockReturnValue("kid-A");
  syncMock.resolveProfileId.mockReset().mockResolvedValue("profile-B");
  syncMock.loadSave.mockReset().mockResolvedValue({ doc: null, revision: 0 });
  syncMock.loadLedger.mockReset().mockResolvedValue([]);
  syncMock.flushOutboxForPriorUser.mockReset().mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("adoptSession extraction — password login is unchanged", () => {
  it("still runs wipe -> SET_PROFILE -> draft cache -> hydrate, in that order", async () => {
    authMock.loginChild.mockResolvedValue(session);
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    order.length = 0; // ignore the boot's own bookkeeping

    let ok: boolean | undefined;
    await act(async () => {
      ok = await getApi().login("remi.newal", "iloveschoolrocket");
    });

    expect(ok).toBe(true);
    // The whole sequence, in order. `resetProfileIdCache` runs FIRST (the
    // session boundary opens before the network call that may create one).
    expect(order[0]).toBe("resetProfileIdCache");
    expect(order.slice(1)).toEqual(EXPECTED_SEQUENCE);

    // SET_PROFILE landed between the wipe and the hydrate (observable as the
    // adopted profile + grade on the live API).
    expect(getApi().profile.firstName).toBe("Remi");
    expect(getApi().profile.handle).toBe("remi.newal");
    expect(getApi().grade).toBe(4);
    // The roster patch was cached account-scoped, exactly as before.
    expect(draftStore.get("kid-B:profileCache")).toEqual({
      firstName: "Remi",
      handle: "remi.newal",
      grade: 4,
    });
    await waitFor(() => expect(api?.stage).toBe("onboard"));
  });

  it("does NOT wipe when the SAME kid signs back in (idle-logout drafts survive)", async () => {
    draftMock.getLastUserId.mockReturnValue("kid-B");
    authMock.loginChild.mockResolvedValue(session);
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    await act(async () => {
      await getApi().login("remi.newal", "iloveschoolrocket");
    });

    expect(draftMock.wipeAllFpKeys).not.toHaveBeenCalled();
    expect(syncMock.flushOutboxForPriorUser).not.toHaveBeenCalled();
  });

  it("a refused login adopts nothing", async () => {
    authMock.loginChild.mockResolvedValue({ ok: false });
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await getApi().login("remi.newal", "wrong");
    });

    expect(ok).toBe(false);
    expect(draftMock.wipeAllFpKeys).not.toHaveBeenCalled();
    expect(draftMock.setDraft).not.toHaveBeenCalled();
    expect(getApi().profile.firstName).toBe("");
  });
});

describe("adoptSession extraction — the handoff door takes the same path", () => {
  it("redeemHandoff runs the IDENTICAL sequence as login", async () => {
    authMock.redeemSignInToken.mockResolvedValue(session);
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    order.length = 0;

    let ok: boolean | undefined;
    await act(async () => {
      ok = await getApi().redeemHandoff("one-time-code");
    });

    expect(ok).toBe(true);
    expect(authMock.redeemSignInToken).toHaveBeenCalledWith("one-time-code");
    expect(order[0]).toBe("resetProfileIdCache");
    expect(order.slice(1)).toEqual(EXPECTED_SEQUENCE);
    expect(getApi().profile.firstName).toBe("Remi");
    await waitFor(() => expect(api?.stage).toBe("onboard"));
  });

  it("landing while ANOTHER kid's session is live wipes first — no state bleed", async () => {
    // Kid A is resident: signed in, with an idea and a ledger row in memory.
    authMock.loginChild.mockResolvedValue({
      ok: true,
      userId: "kid-A",
      profile: { handle: "ada", firstName: "Ada" },
      grade: 7,
    });
    draftMock.getLastUserId.mockReturnValue("kid-A");
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    await act(async () => {
      await getApi().login("ada", "iloveschoolcomet");
    });
    await waitFor(() => expect(api?.stage).toBe("onboard"));
    act(() => {
      getApi().dispatch({ type: "CREATE_IDEA" });
    });
    expect(getApi().ideas.length).toBe(1);

    // Kid B's handoff lands in this same tab.
    order.length = 0;
    draftMock.wipeAllFpKeys.mockClear();
    authMock.redeemSignInToken.mockResolvedValue(session);
    await act(async () => {
      await getApi().redeemHandoff("kid-b-code");
    });

    // The shared-device wipe ran, and kid A's in-memory state is gone (the
    // reducer RESET_SESSION, not a hope that kid B's hydrate overwrites it —
    // kid B's save here is EMPTY, so only an explicit reset can clear it).
    expect(draftMock.wipeAllFpKeys).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe("resetProfileIdCache");
    expect(order).toContain("wipeAllFpKeys");
    expect(order.indexOf("wipeAllFpKeys")).toBeLessThan(
      order.indexOf("hydrate:resolveProfileId"),
    );
    expect(getApi().ideas).toEqual([]);
    expect(getApi().profile.firstName).toBe("Remi");
    expect(getApi().grade).toBe(4);
  });

  it("a refused exchange adopts nothing and leaves no half-session", async () => {
    authMock.redeemSignInToken.mockResolvedValue({ ok: false });
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await getApi().redeemHandoff("spent-code");
    });

    expect(ok).toBe(false);
    expect(draftMock.setDraft).not.toHaveBeenCalled();
    expect(draftMock.setLastUserId).not.toHaveBeenCalled();
    expect(getApi().profile.firstName).toBe("");
    // Even a refusal cleared the previous session's resident state first: the
    // boundary opens BEFORE the network call, never after a success.
    expect(order).toContain("resetProfileIdCache");
  });

  it("the failed exchange REVOKED the resident session (no stale kid A on next load)", async () => {
    // Shared family device (review FIX 5): kid A's refresh token is sitting in
    // localStorage when kid B's handoff refuses. Clearing the reducer is only
    // the in-memory half — without a revoke, the NEXT page load silently
    // restores kid A. The boundary must give the same guarantee `logout()`
    // does, on the FAILURE path too.
    authMock.redeemSignInToken.mockResolvedValue({ ok: false });
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    authMock.logout.mockClear();

    await act(async () => {
      await getApi().redeemHandoff("spent-code");
    });

    expect(authMock.logout).toHaveBeenCalledWith("signin");
  });

  it("the password door revokes up front too (same pre-existing gap)", async () => {
    authMock.loginChild.mockResolvedValue({ ok: false });
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    authMock.logout.mockClear();

    await act(async () => {
      await getApi().login("remi.newal", "wrong");
    });

    expect(authMock.logout).toHaveBeenCalledWith("signin");
  });

  it("revoking does NOT wipe the same kid's drafts (the re-sign-in restore still holds)", async () => {
    // The revoke touches `sb-*` session keys only; the fp:* draft decision
    // still belongs to adoptSession's last-user-id comparison.
    draftMock.getLastUserId.mockReturnValue("kid-B");
    authMock.redeemSignInToken.mockResolvedValue(session);
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    await act(async () => {
      await getApi().redeemHandoff("code");
    });

    expect(authMock.logout).toHaveBeenCalledWith("signin");
    expect(draftMock.wipeAllFpKeys).not.toHaveBeenCalled();
    expect(draftMock.wipeAllForUser).not.toHaveBeenCalled();
  });
});

/* ─────────────────── The boot race the whole unit exists to stop ─────────────
 *
 * `if (peekEnterLink().code) return;` in GameProvider's boot effect is the ONE
 * mechanism stopping kid A's persisted session from hydrating over kid B's
 * adopted one. It had NO coverage: this file never mocked the enterLink module,
 * so `peekEnterLink()` always answered `{code:null}` and the branch never ran
 * in a single test (review FIX 6).
 *
 * BITE PROOF: delete the early return in GameContext's boot effect and the
 * first test below goes red on `getCurrentUserId` (called 1 time, expected 0).
 */
describe("boot: a pending handoff OWNS the boot", () => {
  it("skips the persisted-session restore entirely and parks the stage at boot", async () => {
    enterLinkMock.code = "pending-one-time-code";
    enterLinkMock.fromEnterRoute = true;
    // A previous child's session IS resident — this is precisely the race.
    authMock.getCurrentUserId.mockResolvedValue("kid-A");

    renderProvider();
    // Let every microtask the boot effect could have queued drain.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(authMock.getCurrentUserId).not.toHaveBeenCalled();
    expect(syncMock.loadSave).not.toHaveBeenCalled();
    expect(syncMock.resolveProfileId).not.toHaveBeenCalled();
    // Parked at boot: /auth/enter renders its own spinner and every redeem
    // outcome routes from there. NOT `landing` — a landing render here would
    // flash the marketing page under the handoff.
    expect(getApi().stage).toBe("boot");
    expect(getApi().profile.firstName).toBe("");
  });

  it("landing at /auth/enter WITHOUT a code (a refresh after the strip) boots normally", async () => {
    // fromEnterRoute alone must not park the boot: there is nothing to redeem,
    // so a signed-in kid refreshing that URL still gets their session back.
    enterLinkMock.code = null;
    enterLinkMock.fromEnterRoute = true;
    authMock.getCurrentUserId.mockResolvedValue("kid-A");

    renderProvider();
    await waitFor(() => expect(authMock.getCurrentUserId).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(syncMock.resolveProfileId).toHaveBeenCalled());
  });

  it("with no handoff pending the boot restores as before (the control)", async () => {
    authMock.getCurrentUserId.mockResolvedValue("kid-A");
    renderProvider();
    await waitFor(() => expect(authMock.getCurrentUserId).toHaveBeenCalledTimes(1));
  });
});
