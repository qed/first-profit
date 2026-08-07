// @vitest-environment jsdom
//
// THE HANDOFF, COMPOSED (v3 Unit 6 review, FIX 7b).
//
// Three mechanisms have to agree for /auth/enter to work, and each was only
// ever unit-tested in isolation — their composition was reasoned about, not
// executed:
//
//   1. `consumeEnterLink()` reads the code and strips the URL before render;
//   2. GameProvider's boot effect returns early on a pending code, so kid A's
//      persisted session cannot hydrate over kid B's adopted one;
//   3. StageRouter's gate renders <Enter/> until the stage flips logged-in,
//      and Enter's own effect redeems exactly once.
//
// This test mounts the REAL App at /auth/enter#code=… — real GameProvider, real
// GameContext, real enterLink, real StageRouter, real Enter — and mocks only
// the two I/O layers (lib/auth's network, lib/sync's storage). If any one of
// the three drifts out of step with the others, this goes red even while all
// three unit suites stay green.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

const authMock = {
  loginChild: vi.fn(),
  redeemSignInToken: vi.fn(),
  logout: vi.fn(),
  getCurrentUserId: vi.fn(),
  submitBirthYear: vi.fn(),
  fetchSiteStatus: vi.fn(),
  claimHandle: vi.fn(),
  publishSite: vi.fn(),
  fetchConsentPolicy: vi.fn(),
  startSignup: vi.fn(),
  verifySignup: vi.fn(),
  createSignupChild: vi.fn(),
  recordSignupConsent: vi.fn(),
};
vi.mock("../lib/auth", () => ({
  loginChild: (...a: unknown[]) => authMock.loginChild(...a),
  redeemSignInToken: (...a: unknown[]) => authMock.redeemSignInToken(...a),
  logout: (...a: unknown[]) => authMock.logout(...a),
  getCurrentUserId: (...a: unknown[]) => authMock.getCurrentUserId(...a),
  submitBirthYear: (...a: unknown[]) => authMock.submitBirthYear(...a),
  fetchSiteStatus: (...a: unknown[]) => authMock.fetchSiteStatus(...a),
  claimHandle: (...a: unknown[]) => authMock.claimHandle(...a),
  publishSite: (...a: unknown[]) => authMock.publishSite(...a),
  fetchConsentPolicy: (...a: unknown[]) => authMock.fetchConsentPolicy(...a),
  startSignup: (...a: unknown[]) => authMock.startSignup(...a),
  verifySignup: (...a: unknown[]) => authMock.verifySignup(...a),
  createSignupChild: (...a: unknown[]) => authMock.createSignupChild(...a),
  recordSignupConsent: (...a: unknown[]) => authMock.recordSignupConsent(...a),
}));

const syncMock = {
  resolveProfileId: vi.fn(),
  loadSave: vi.fn(),
  loadLedger: vi.fn(),
  flushOutboxForPriorUser: vi.fn(),
};
vi.mock("../lib/sync", () => ({
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

// The destination screens are stubbed: this test is about the three mechanisms
// agreeing, and a real Onboarding/Factory mount would add failure modes that
// have nothing to do with the handoff. Everything BETWEEN the URL and them is
// the real thing.
vi.mock("../components/GlobalNav", () => ({ GlobalNav: () => React.createElement("nav", null, "NAV") }));
vi.mock("../screens/Onboarding", () => ({ Onboarding: () => React.createElement("div", null, "ONBOARDING") }));
vi.mock("../screens/Factory", () => ({ Factory: () => React.createElement("div", null, "FACTORY") }));

import { App } from "../App";
import { consumeEnterLink, resetEnterLinkForTests } from "../screens/auth/enterLink";

const session = {
  ok: true as const,
  userId: "kid-B",
  profile: { handle: "remi.newal", firstName: "Remi" },
  grade: 4,
};

/** Put the browser at the handoff URL and run the boot read exactly the way
 *  `src/screens/auth/bootEnterLink.ts` does — before anything renders. */
function bootAt(url: string) {
  window.history.replaceState(null, "", url);
  resetEnterLinkForTests();
  return consumeEnterLink();
}

beforeEach(() => {
  window.localStorage.clear();
  resetEnterLinkForTests();
  window.history.replaceState(null, "", "/");
  authMock.loginChild.mockReset();
  authMock.redeemSignInToken.mockReset();
  authMock.logout.mockReset().mockResolvedValue("signin");
  // A PREVIOUS child's session is persisted in this browser — the race.
  authMock.getCurrentUserId.mockReset().mockResolvedValue("kid-A");
  authMock.fetchSiteStatus.mockReset().mockResolvedValue({ ok: false });
  authMock.fetchConsentPolicy.mockReset().mockResolvedValue(null);
  syncMock.resolveProfileId.mockReset().mockResolvedValue("profile-B");
  syncMock.loadSave.mockReset().mockResolvedValue({ doc: null, revision: 0 });
  syncMock.loadLedger.mockReset().mockResolvedValue([]);
  syncMock.flushOutboxForPriorUser.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  resetEnterLinkForTests();
});

describe("/auth/enter, whole tree", () => {
  it("strips the URL, parks the boot, shows the spinner, and redeems ONCE", async () => {
    const boot = bootAt("/auth/enter#code=live-one-time-code");
    expect(boot).toEqual({ code: "live-one-time-code", fromEnterRoute: true });
    // (1) The code is out of the address bar before React ever ran.
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/");

    authMock.redeemSignInToken.mockReturnValue(new Promise(() => undefined));
    render(React.createElement(App));

    // (3) The gate wins over the boot spinner and every stage screen.
    await waitFor(() =>
      expect(screen.getByRole("status").textContent ?? "").toMatch(/signing you in/i),
    );
    expect(authMock.redeemSignInToken).toHaveBeenCalledTimes(1);
    expect(authMock.redeemSignInToken).toHaveBeenCalledWith("live-one-time-code");

    // (2) kid A's persisted session was never touched — no hydrate raced the
    // redeem, which is the entire reason this unit exists.
    expect(authMock.getCurrentUserId).not.toHaveBeenCalled();
    expect(syncMock.resolveProfileId).not.toHaveBeenCalled();
  });

  it("a SUCCESSFUL exchange flips the stage and the gate lets go", async () => {
    bootAt("/auth/enter#code=live-one-time-code");
    authMock.redeemSignInToken.mockResolvedValue(session);

    render(React.createElement(App));

    // The spinner gives way to the game, in the SAME tree, with no reload.
    await waitFor(() => expect(screen.getByText("ONBOARDING")).not.toBeNull());
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("NAV")).not.toBeNull();
    // The previous child's persisted session still never hydrated.
    expect(authMock.getCurrentUserId).not.toHaveBeenCalled();
  });

  it("a REFUSED exchange lands on the recovery notice plus a live sign-in form", async () => {
    bootAt("/auth/enter#code=spent-code");
    authMock.redeemSignInToken.mockResolvedValue({ ok: false });

    render(React.createElement(App));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/used up/i);
    expect(alert.textContent ?? "").toMatch(/other tab/i);
    expect(screen.getByRole("button", { name: /log in/i })).not.toBeNull();
    // The stage never advanced, and the boot restore stayed skipped — a
    // half-restored kid A behind the recovery form is exactly the bleed the
    // early return prevents.
    expect(authMock.getCurrentUserId).not.toHaveBeenCalled();
    expect(screen.queryByText("ONBOARDING")).toBeNull();
    // The resident session was revoked on the way in (review FIX 5).
    expect(authMock.logout).toHaveBeenCalledWith("signin");
  });

  it("recovery works: signing in from the notice adopts a session in the same tree", async () => {
    bootAt("/auth/enter#code=spent-code");
    authMock.redeemSignInToken.mockResolvedValue({ ok: false });
    authMock.loginChild.mockResolvedValue(session);

    const { container } = render(React.createElement(App));
    await screen.findByRole("alert");

    const form = container.querySelector("form");
    const inputs = Array.from(container.querySelectorAll("input"));
    expect(form, "the recovery card renders a real sign-in form").not.toBeNull();
    expect(inputs.length, "username + password fields").toBeGreaterThanOrEqual(2);
    const [identifier, password] = inputs as [HTMLInputElement, HTMLInputElement];
    fireEvent.change(identifier, { target: { value: "remi.newal" } });
    fireEvent.change(password, { target: { value: "iloveschoolrocket" } });
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(screen.getByText("ONBOARDING")).not.toBeNull());
  });

  it("a REFRESH of /auth/enter after the strip shows recovery and never re-POSTs", async () => {
    // The URL no longer carries a code (replaceState already dropped it), but
    // a family that hit Back/refresh must still get the explanation.
    const boot = bootAt("/auth/enter");
    expect(boot).toEqual({ code: null, fromEnterRoute: true });

    render(React.createElement(App));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/used up/i);
    expect(authMock.redeemSignInToken).not.toHaveBeenCalled();
    // With NO pending code the boot is NOT parked: a kid who is still signed in
    // gets their session resolved normally behind the notice.
    await waitFor(() => expect(authMock.getCurrentUserId).toHaveBeenCalledTimes(1));
  });
});
