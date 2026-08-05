// @vitest-environment jsdom
//
// THE ROUTING GATE (v3 Unit 6 review, FIX 7a).
//
// App.tsx's handoff branch is one line:
//
//     if (enterLink.fromEnterRoute && !isLoggedInStage(stage)) return <Enter …/>;
//
// and it carries two decisions that nothing else in the repo tested — there was
// no App/StageRouter test at all. It must PRE-EMPT every other pre-stage route
// and stage render while the handoff is live, and it must STOP taking over the
// instant the stage flips logged-in, or a successful redeem would hand the kid
// the recovery screen instead of the game.
//
// Targeted, not integrative: GameContext is mocked so `stage` is a dial, and
// the stage screens are stubbed so this test can only fail for routing reasons.
// The composed behavior is covered separately in enterHandoff.integration.test.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

const gameState = {
  stage: "boot" as string,
  redeemHandoff: vi.fn().mockResolvedValue(false),
  login: vi.fn().mockResolvedValue(false),
  dispatch: vi.fn(),
};
vi.mock("../state/GameContext", async () => {
  const actual = await vi.importActual<typeof import("../state/GameContext")>(
    "../state/GameContext",
  );
  return {
    isLoggedInStage: actual.isLoggedInStage,
    GameProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useGame: () => gameState,
  };
});

const enterLinkMock = { code: null as string | null, fromEnterRoute: false };
vi.mock("../screens/auth/enterLink", () => ({
  peekEnterLink: () => enterLinkMock,
}));

// Stage screens + chrome are stubs: their real trees need the real provider and
// would only add ways for this test to fail for reasons that are not routing.
vi.mock("../components/GlobalNav", () => ({ GlobalNav: () => React.createElement("nav", null, "NAV") }));
vi.mock("../screens/Landing", () => ({ Landing: () => React.createElement("div", null, "LANDING") }));
vi.mock("../screens/Onboarding", () => ({ Onboarding: () => React.createElement("div", null, "ONBOARDING") }));
vi.mock("../screens/Factory", () => ({ Factory: () => React.createElement("div", null, "FACTORY") }));
vi.mock("../screens/staff/staffLink", () => ({
  isStaffPath: () => false,
  isLegacyAdminPath: () => false,
}));
vi.mock("../lib/auth", () => ({
  fetchConsentPolicy: vi.fn().mockResolvedValue(null),
  startSignup: vi.fn(),
  verifySignup: vi.fn(),
  createSignupChild: vi.fn(),
  recordSignupConsent: vi.fn(),
}));

import { App } from "../App";

beforeEach(() => {
  gameState.stage = "boot";
  gameState.redeemHandoff.mockReset().mockReturnValue(new Promise(() => undefined));
  enterLinkMock.code = null;
  enterLinkMock.fromEnterRoute = false;
});

afterEach(() => cleanup());

describe("StageRouter — the /auth/enter gate", () => {
  it("renders Enter (not the boot spinner) while the handoff is pending", () => {
    enterLinkMock.code = "one-time-code";
    enterLinkMock.fromEnterRoute = true;

    render(React.createElement(App));

    expect(screen.getByRole("status").textContent ?? "").toMatch(/signing you in/i);
    expect(gameState.redeemHandoff).toHaveBeenCalledWith("one-time-code");
    // It PRE-EMPTS the stage render and the chrome.
    expect(screen.queryByText("LANDING")).toBeNull();
    expect(screen.queryByText("NAV")).toBeNull();
  });

  it("renders Enter's recovery on the route with NO code, over the landing stage", () => {
    // A refresh after the strip: the stage machine has moved on to `landing`,
    // but the family still deserves the explanation, not the marketing page.
    enterLinkMock.code = null;
    enterLinkMock.fromEnterRoute = true;
    gameState.stage = "landing";

    render(React.createElement(App));

    expect(screen.getByRole("alert").textContent ?? "").toMatch(/used up/i);
    expect(screen.queryByText("LANDING")).toBeNull();
    expect(gameState.redeemHandoff).not.toHaveBeenCalled();
  });

  it("FALLS THROUGH once the stage flips logged-in — the redeem succeeded", () => {
    enterLinkMock.code = "one-time-code";
    enterLinkMock.fromEnterRoute = true;
    gameState.stage = "onboard";

    render(React.createElement(App));

    expect(screen.getByText("ONBOARDING")).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    // And the game shell is back.
    expect(screen.getByText("NAV")).not.toBeNull();
  });

  it("falls through at the `app` stage too (a returning kid's handoff)", () => {
    enterLinkMock.code = "one-time-code";
    enterLinkMock.fromEnterRoute = true;
    gameState.stage = "app";

    render(React.createElement(App));

    expect(screen.getByText("FACTORY")).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does NOT hijack any other boot: no enter route means normal routing", () => {
    enterLinkMock.fromEnterRoute = false;
    gameState.stage = "landing";

    render(React.createElement(App));

    expect(screen.getByText("LANDING")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
