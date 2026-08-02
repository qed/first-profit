// @vitest-environment jsdom
//
// PP2 Unit 4 — the Checkout Booth provider-comparison lesson (R24.1/R24.2/R24.11).
// Proves the 3 providers render as stacked cards with their fee + subscription
// copy, that "Choose" dispatches SET_PROVIDER with the id, and that First Profit
// Pay is present + pickable + framed AS A PROVIDER (not "the course").
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, act, fireEvent, cleanup, waitFor } from "@testing-library/react";

// ── Mocks (keep the provider off the network, mirroring rooms.test) ───────────
vi.mock("../../../lib/auth", () => ({
  loginChild: vi.fn(),
  logout: vi.fn().mockResolvedValue("explicit"),
  getCurrentUserId: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../../lib/draftCache", () => ({
  wipeAllForUser: vi.fn(),
  wipeAllFpKeys: vi.fn(),
  getLastUserId: vi.fn().mockReturnValue(null),
  setLastUserId: vi.fn(),
}));
vi.mock("../../../lib/sync", () => ({
  resolveProfileId: vi.fn().mockResolvedValue("profile-1"),
  resetProfileIdCache: vi.fn(),
  loadSave: vi.fn().mockResolvedValue({ doc: null, revision: 0 }),
  createSyncEngine: () => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    notifyLedger: vi.fn(),
    notifySnapshotChange: vi.fn(),
    flushOnHide: vi.fn(),
  }),
}));

import { GameProvider, useGame, type GameApi } from "../../../state/GameContext";
import { ProviderComparison } from "../ProviderComparison";
import { PROVIDER_IDS, PROVIDERS } from "../../../data/providers";

let api: GameApi | null = null;
function Probe() {
  api = useGame();
  return null;
}
function getApi(): GameApi {
  if (!api) throw new Error("provider not mounted");
  return api;
}
function button(match: (b: HTMLButtonElement) => boolean): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find(match);
  if (!found) throw new Error("button not found");
  return found;
}

function renderComparison() {
  return render(
    React.createElement(GameProvider, null, React.createElement(Probe), React.createElement(ProviderComparison)),
  );
}

beforeEach(() => {
  api = null;
});
afterEach(() => cleanup());

describe("ProviderComparison", () => {
  it("renders the 3 providers as stacked cards, in PROVIDER_IDS order", async () => {
    renderComparison();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    const chooseButtons = Array.from(document.querySelectorAll("button")).filter((b) =>
      /^Choose /.test(b.textContent || ""),
    );
    expect(chooseButtons).toHaveLength(3);
    expect(chooseButtons.map((b) => b.textContent)).toEqual(
      PROVIDER_IDS.map((id) => `Choose ${PROVIDERS[id].name}`),
    );
  });

  it("shows each provider's per-sale fee and monthly subscription", async () => {
    renderComparison();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    const text = document.body.textContent || "";
    // First Profit Pay: 50% strawman, no subscription.
    expect(text).toMatch(/50% of every sale/);
    expect(text).toMatch(/No monthly fee/);
    // Replit + Shopify: 2.9% + 30c, with their subscriptions.
    expect(text).toMatch(/2\.9% \+ 30c per sale/);
    expect(text).toMatch(/\$25\/mo/); // Replit
    expect(text).toMatch(/\$39\/mo/); // Shopify
  });

  it("choosing a provider dispatches SET_PROVIDER with the id + a chosenAt", async () => {
    renderComparison();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    const before = Date.now();
    act(() => fireEvent.click(button((b) => b.textContent === "Choose Replit")));

    const chosen = getApi().chosenProvider;
    expect(chosen?.providerId).toBe("replit");
    expect(typeof chosen?.chosenAt).toBe("number");
    expect(chosen?.chosenAt).toBeGreaterThanOrEqual(before);
  });

  it("First Profit Pay is present, pickable, and framed as a provider (not the course)", async () => {
    renderComparison();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    // Named exactly "First Profit Pay" and pickable.
    const fpBtn = button((b) => b.textContent === "Choose First Profit Pay");
    expect(fpBtn).toBeTruthy();
    // Never framed as the course.
    expect(document.body.textContent || "").not.toMatch(/the course/i);

    act(() => fireEvent.click(fpBtn));
    expect(getApi().chosenProvider?.providerId).toBe("first_profit_pay");
  });

  it("fires the onChoose callback with the chosen id", async () => {
    const onChoose = vi.fn();
    render(
      React.createElement(
        GameProvider,
        null,
        React.createElement(Probe),
        React.createElement(ProviderComparison, { onChoose }),
      ),
    );
    await waitFor(() => expect(api?.stage).toBe("landing"));

    act(() => fireEvent.click(button((b) => b.textContent === "Choose Shopify")));
    expect(onChoose).toHaveBeenCalledWith("shopify");
  });
});

