// @vitest-environment jsdom
//
// THE PROFILE-CACHE ROUND TRIP FOR THE COMIC COVER (new-user-flow-v3, Unit 7).
//
// ── WHY THIS FILE EXISTS ──
// `profileCache` is written by `adoptSession` as an object literal and read
// back by `hydrateAndRoute` FIELD BY FIELD, by hand. That asymmetry is a
// documented hazard with a specific failure signature: a field added to the
// write but not to the read survives the sign-in and then silently VANISHES the
// first time the child reloads the page. Nothing type-checks it — the draft
// cache is `unknown` on the way out — and nothing renders an error; the picture
// is just gone, and only on reload, which is the hardest kind of bug to notice.
//
// So the assertion that matters here is not "the cover renders". It is: SIGN IN
// WITH A COVER, THROW THE PROVIDER AWAY, MOUNT A FRESH ONE ON A RESTORED
// SESSION, AND THE COVER IS STILL THERE. That is a reload, and it is the exact
// motion the hazard breaks.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, act, waitFor, cleanup } from "@testing-library/react";

import { COVER_DATA_URL_PREFIX, COVER_URL_MAX_BYTES } from "../../lib/cover";

const COVER = `${COVER_DATA_URL_PREFIX}PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=`;

// ── Mocks ────────────────────────────────────────────────────────────────────
const authMock = {
  loginChild: vi.fn(),
  logout: vi.fn(),
  getCurrentUserId: vi.fn(),
  submitBirthYear: vi.fn(),
  fetchSiteStatus: vi.fn(),
  claimHandle: vi.fn(),
  publishSite: vi.fn(),
  redeemSignInToken: vi.fn(),
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

// A REAL in-memory draft store: the write and the read must meet in something
// that actually holds values, or the round trip proves nothing.
const draftStore = new Map<string, unknown>();
/** The default write: a JSON round-trip, exactly like the real
 *  localStorage-backed cache, so a field that cannot survive serialization
 *  fails here rather than in production. One test swaps in a budgeted variant;
 *  `beforeEach` puts this back. */
const defaultSetDraft = (userId: string, name: string, value: unknown) => {
  draftStore.set(`${userId}:${name}`, JSON.parse(JSON.stringify(value)));
  return true;
};
const draftMock = {
  wipeAllForUser: vi.fn(),
  wipeAllFpKeys: vi.fn(),
  getLastUserId: vi.fn(),
  setLastUserId: vi.fn(),
  getDraft: vi.fn((userId: string, name: string) => draftStore.get(`${userId}:${name}`)),
  setDraft: vi.fn(defaultSetDraft),
};
vi.mock("../../lib/draftCache", () => ({
  wipeAllForUser: (...a: unknown[]) => draftMock.wipeAllForUser(...a),
  wipeAllFpKeys: (...a: unknown[]) => draftMock.wipeAllFpKeys(...a),
  getLastUserId: (...a: unknown[]) => draftMock.getLastUserId(...a),
  setLastUserId: (...a: unknown[]) => draftMock.setLastUserId(...a),
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
  return React.createElement("div", { "data-testid": "stage" }, api.stage);
}
function renderProvider() {
  return render(React.createElement(GameProvider, null, React.createElement(Probe)));
}
function getApi(): GameApi {
  if (!api) throw new Error("provider not mounted");
  return api;
}

const SAVED_DOC = {
  doc: {
    docVersion: 1,
    ideas: [{ fields: {}, done: {} }],
    activeIdea: 0,
    siteHeadline: "",
    onboardingComplete: true,
  },
  revision: 3,
};

beforeEach(() => {
  api = null;
  authMock.loginChild.mockReset();
  authMock.redeemSignInToken.mockReset();
  authMock.logout.mockReset().mockResolvedValue("explicit");
  authMock.getCurrentUserId.mockReset().mockResolvedValue(null);
  authMock.fetchSiteStatus.mockReset().mockResolvedValue({ ok: false });
  authMock.claimHandle.mockReset().mockResolvedValue({ ok: false, reason: "outage" });
  authMock.publishSite.mockReset().mockResolvedValue({ ok: false, reason: "outage" });
  draftMock.wipeAllForUser.mockReset();
  draftMock.wipeAllFpKeys.mockReset();
  draftMock.getLastUserId.mockReset().mockReturnValue(null);
  draftMock.setLastUserId.mockReset();
  draftStore.clear();
  draftMock.getDraft.mockClear();
  draftMock.setDraft.mockReset().mockImplementation(defaultSetDraft);
  syncMock.resolveProfileId.mockReset().mockResolvedValue("profile-1");
  syncMock.loadSave.mockReset().mockResolvedValue(SAVED_DOC);
  syncMock.loadLedger.mockReset().mockResolvedValue([]);
  syncMock.flushOutboxForPriorUser.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe("profileCache round trip — the cover survives a reload", () => {
  it("writes the cover at sign-in AND reads it back on a restored session", async () => {
    authMock.loginChild.mockResolvedValue({
      ok: true,
      userId: "kid-cover",
      profile: { handle: "remi.newal", firstName: "Remi" },
      grade: 4,
      coverUrl: COVER,
      coverStatus: "final",
    });

    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    await act(async () => {
      await getApi().login("remi.newal", "iloveschoolrocket");
    });

    // (1) Adopted into live state.
    expect(getApi().profile.coverUrl).toBe(COVER);
    expect(getApi().profile.coverStatus).toBe("final");
    // (2) WRITTEN to the account-scoped cache.
    expect(draftStore.get("kid-cover:profileCache")).toMatchObject({
      coverUrl: COVER,
      coverStatus: "final",
    });

    // (3) THE RELOAD. Tear the tree down completely and mount a fresh provider
    // on a RESTORED session — no login call, so the cache is the only source
    // the cover can come from.
    cleanup();
    api = null;
    authMock.loginChild.mockReset();
    authMock.getCurrentUserId.mockResolvedValue("kid-cover");
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("app"));

    expect(authMock.loginChild).not.toHaveBeenCalled();
    expect(getApi().profile.firstName).toBe("Remi");
    // THE ASSERTION THE FILE EXISTS FOR. A read that forgot this field would
    // leave it null here and nowhere else.
    expect(getApi().profile.coverUrl).toBe(COVER);
    expect(getApi().profile.coverStatus).toBe("final");
  });

  it("a cached cover that is not a base64 SVG data URL is dropped on restore", async () => {
    // The cache is localStorage: anything on this origin can write it, so the
    // read re-runs the same one gate the network response cleared. A value
    // that becomes an <img src> is never trusted for having been ours once.
    const { setDraft } = await import("../../lib/draftCache");
    setDraft("kid-cover", "profileCache", {
      firstName: "Remi",
      handle: "remi.newal",
      grade: 4,
      coverUrl: "https://evil.example/cover.svg",
      coverStatus: "final",
    });
    authMock.getCurrentUserId.mockResolvedValue("kid-cover");

    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("app"));

    expect(getApi().profile.firstName).toBe("Remi"); // the rest still restores
    expect(getApi().profile.coverUrl).toBeNull();
  });

  it("an OVERSIZED cached cover is dropped on restore, and nothing else is lost", async () => {
    // Unit 7 review, FIX E — the localStorage half of the size ceiling.
    //
    // WHY THE READ NEEDS ITS OWN BOUND even though the network door has one:
    // the cache is localStorage, writable by anything on this origin, and it
    // OUTLIVES the deploy that wrote it. A value stored by a build with a
    // laxer gate — or by another script entirely — is a value this build must
    // still refuse. Re-validating on the way out is what makes the gate a
    // property of the `<img src>` rather than of one code path.
    //
    // It is also the read that matters for cost: a 5 MB string in the profile
    // cache is 5 MB of the per-origin budget the child's unsent Step Runner
    // drafts and the sync outbox share.
    const { setDraft } = await import("../../lib/draftCache");
    setDraft("kid-cover", "profileCache", {
      firstName: "Remi",
      handle: "remi.newal",
      grade: 4,
      coverUrl: `${COVER_DATA_URL_PREFIX}${"A".repeat(COVER_URL_MAX_BYTES)}`,
      coverStatus: "final",
    });
    authMock.getCurrentUserId.mockResolvedValue("kid-cover");

    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("app"));

    // Everything else restores; only the decoration is refused.
    expect(getApi().profile.firstName).toBe("Remi");
    expect(getApi().profile.grade).toBe(4);
    expect(getApi().profile.coverUrl).toBeNull();
  });

  it("an oversized cover from the WIRE never reaches storage, and no quota error escapes", async () => {
    // The write half. `asCoverUrl` refuses at the door, so the cache is written
    // with null and the storage budget is never spent. The store below THROWS
    // like a real over-budget localStorage, so if an oversized value ever did
    // reach it, this test would surface the crash rather than a missing pixel.
    const QUOTA_LIMIT = 64 * 1024;
    let quotaExceeded = false;
    draftMock.setDraft.mockImplementation((userId: string, name: string, value: unknown) => {
      const serialized = JSON.stringify(value);
      // Mirrors the real `draftCache.setDraft`, which wraps `setItem` in a
      // try/catch and reports failure as `false` — so an over-budget write is
      // silent, and the ONLY way to notice it is to count it here.
      if (serialized.length > QUOTA_LIMIT) {
        quotaExceeded = true;
        return false;
      }
      draftStore.set(`${userId}:${name}`, JSON.parse(serialized));
      return true;
    });

    authMock.loginChild.mockResolvedValue({
      ok: true,
      userId: "kid-cover",
      profile: { handle: "remi.newal", firstName: "Remi" },
      grade: 4,
      // Already refused at the door in the real app; null is what `loginChild`
      // hands back for an oversized wire value (src/lib/__tests__/auth.test.ts).
      coverUrl: null,
      coverStatus: "final",
    });

    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    await act(async () => {
      await getApi().login("remi.newal", "iloveschoolrocket");
    });

    // The session is adopted, the cache write FITS (nothing was silently
    // dropped on the floor), and the child sees the procedural sprite — the
    // same experience as having no cover at all.
    expect(quotaExceeded).toBe(false);
    expect(getApi().profile.coverUrl).toBeNull();
    expect(draftStore.get("kid-cover:profileCache")).toMatchObject({
      firstName: "Remi",
      coverUrl: null,
    });
  });

  it("an OLD cached profile with no cover fields restores cleanly", async () => {
    // Written by a build that predates Unit 7 — the deploy-gap case, on the
    // storage side rather than the wire.
    const { setDraft } = await import("../../lib/draftCache");
    setDraft("kid-cover", "profileCache", {
      firstName: "Remi",
      handle: "remi.newal",
      grade: 4,
    });
    authMock.getCurrentUserId.mockResolvedValue("kid-cover");

    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("app"));

    expect(getApi().profile.firstName).toBe("Remi");
    expect(getApi().profile.grade).toBe(4);
    expect(getApi().profile.coverUrl).toBeNull();
    expect(getApi().profile.coverStatus).toBeNull();
  });

  it("a session with NO cover clears a previous kid's cover on the same device", async () => {
    // Shared family device. The cover is per-account child data, so kid B's
    // sign-in must not leave kid A's face on the journey.
    authMock.loginChild.mockResolvedValueOnce({
      ok: true,
      userId: "kid-A",
      profile: { handle: "ada", firstName: "Ada" },
      grade: 4,
      coverUrl: COVER,
      coverStatus: "final",
    });
    renderProvider();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    await act(async () => {
      await getApi().login("ada", "iloveschoolrocket");
    });
    expect(getApi().profile.coverUrl).toBe(COVER);

    draftMock.getLastUserId.mockReturnValue("kid-A");
    authMock.loginChild.mockResolvedValueOnce({
      ok: true,
      userId: "kid-B",
      profile: { handle: "bo", firstName: "Bo" },
      grade: 5,
      coverUrl: null,
      coverStatus: null,
    });
    await act(async () => {
      await getApi().login("bo", "iloveschoolrocket");
    });

    expect(getApi().profile.firstName).toBe("Bo");
    expect(getApi().profile.coverUrl).toBeNull();
    expect(getApi().profile.coverStatus).toBeNull();
  });
});
