// @vitest-environment jsdom
//
// Room dialogs (jsdom). Two surfaces:
//   - The Sales Room "Log a sale" form appends a {kind:'sale'} row through
//     ADD_LEDGER with a caller-minted id/timestamp and completes 1.2's last task
//     for the active idea (firing the 1.2 celebration when it is the last task).
//   - The simplified Checkout Booth (owner spec 2026-08-03): ONLY First Profit
//     Pay, exact fee/hold subhead, a LOCKED disabled affordance, no comparison,
//     no log-a-real-sale card, no setup/compare CTAs. Legacy accounts with a
//     chosenProvider keep a compact summary (the reducer state is untouched).
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import React from "react";
import { render, act, fireEvent, waitFor, cleanup } from "@testing-library/react";

// ── Mocks (mirror GameContext.test: keep the provider off the network) ────────
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
import { SalesRoom } from "../SalesRoom";
import { CheckoutBooth } from "../CheckoutBooth";
import { stepById, type Step } from "../../../data/path";

let api: GameApi | null = null;
function Probe() {
  api = useGame();
  return null;
}
function getApi(): GameApi {
  if (!api) throw new Error("provider not mounted");
  return api;
}

// ── DOM helpers (throw instead of non-null asserting) ─────────────────────────
function input(label: string): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!found) throw new Error(`input not found: ${label}`);
  return found;
}
function button(match: (b: HTMLButtonElement) => boolean): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find(match);
  if (!found) throw new Error("button not found");
  return found;
}
function step(id: string): Step {
  const s = stepById(id);
  if (!s) throw new Error(`missing step ${id}`);
  return s;
}

function renderAll() {
  return render(
    React.createElement(GameProvider, null, React.createElement(Probe), React.createElement(SalesRoom)),
  );
}

function renderBooth() {
  return render(
    React.createElement(GameProvider, null, React.createElement(Probe), React.createElement(CheckoutBooth)),
  );
}

// Mirrors the ~30-day month the "subscription so far" proxy uses in CheckoutBooth.
const MS_PER_MONTH = 30 * 24 * 60 * 60 * 1000;

// The reducer only auto-completes 1.2's last task via a sale once 1.1 is done
// (1.2 unlocked). Drive the active idea into "1.1 done, 1.2 all-but-last done".
function setupIdeaAtLastSaleTask() {
  const { dispatch } = getApi();
  act(() => dispatch({ type: "CREATE_IDEA" }));
  act(() => {
    step("1.1").tasks.forEach((_, i) => dispatch({ type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.1", index: i }));
  });
  // 1.1 completion fired its celebration; clear it so we can assert the 1.2 one.
  act(() => dispatch({ type: "DISMISS_CELEBRATION" }));
  const oneTwo = step("1.2");
  act(() => {
    for (let i = 0; i < oneTwo.tasks.length - 1; i++) {
      dispatch({ type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.2", index: i });
    }
  });
}

beforeAll(() => {
  // jsdom in older node may lack crypto.randomUUID; the components require it.
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    let n = 0;
    Object.defineProperty(globalThis, "crypto", {
      value: { ...globalThis.crypto, randomUUID: () => `test-uuid-${++n}` },
      configurable: true,
    });
  }
});

beforeEach(() => {
  api = null;
});
afterEach(() => cleanup());

describe("Sales Room — Log a sale", () => {
  it("appends a sale ledger row and completes 1.2 (fires the celebration)", async () => {
    renderAll();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    setupIdeaAtLastSaleTask();

    // Not done yet: 1.2's last task is still open.
    expect(getApi().isCriterionDone(0, "1.2")).toBe(false);

    act(() => {
      fireEvent.change(input("Customer name"), { target: { value: "Ms. Okafor" } });
      fireEvent.change(input("Sale amount in dollars"), { target: { value: "$12" } });
    });
    act(() => fireEvent.click(button((b) => b.textContent === "Log the sale")));

    const after = getApi();
    const saleRows = after.ledger.filter((r) => r.kind === "sale");
    expect(saleRows).toHaveLength(1);
    expect(saleRows[0]).toMatchObject({ kind: "sale", payer: "Ms. Okafor", amountCents: 1200 });
    expect(saleRows[0].id).toBeTruthy(); // caller-minted id
    expect(saleRows[0].createdAt).toBeTruthy(); // caller-minted timestamp
    // The sale completed 1.2's last task → criterion done → celebration.
    expect(after.isCriterionDone(0, "1.2")).toBe(true);
    expect(after.celebrate).toBe("1.2");
  });

  it("a fast double-click logs the sale only once", async () => {
    renderAll();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    setupIdeaAtLastSaleTask();

    act(() => {
      fireEvent.change(input("Customer name"), { target: { value: "Ms. Okafor" } });
      fireEvent.change(input("Sale amount in dollars"), { target: { value: "$12" } });
    });
    const logBtn = button((b) => b.textContent === "Log the sale");
    // Two synchronous clicks before the cleared inputs re-render.
    act(() => {
      fireEvent.click(logBtn);
      fireEvent.click(logBtn);
    });
    expect(getApi().ledger.filter((r) => r.kind === "sale")).toHaveLength(1);
  });

  it("rejects an amount over the $1000 mock cap", async () => {
    renderAll();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    setupIdeaAtLastSaleTask();

    act(() => {
      fireEvent.change(input("Customer name"), { target: { value: "Big Spender" } });
      fireEvent.change(input("Sale amount in dollars"), { target: { value: "5000" } });
    });
    const logBtn = button((b) => b.textContent === "Log the sale");
    expect(logBtn.hasAttribute("disabled")).toBe(true);
    act(() => fireEvent.click(logBtn));
    expect(getApi().ledger.filter((r) => r.kind === "sale")).toHaveLength(0);
  });
});

describe("Checkout Booth (simplified): only First Profit Pay, locked checkout", () => {
  it("shows a single First Profit Pay card with the exact fee and hold subhead", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    expect(getApi().chosenProvider).toBeNull();

    // The one and only provider on offer.
    expect(document.body.textContent).toMatch(/First Profit Pay/);
    // The subhead copy is EXACT (owner spec).
    expect(document.body.textContent).toContain("5% of every sale. 90 day hold before transfer.");
    // No other providers and no comparison: zero "Choose <name>" actions.
    expect(document.body.textContent).not.toMatch(/Shopify/);
    expect(document.body.textContent).not.toMatch(/Replit/);
    expect(
      Array.from(document.querySelectorAll("button")).some((b) => /^Choose /.test(b.textContent || "")),
    ).toBe(false);
  });

  it("the unlock line is the booth's main message, as static text and not a dead button", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    expect(document.body.textContent).toContain(
      "You can unlock a live checkout page in the app.",
    );
    // It is NOT a button: the old locked pseudo-button looked pressable but
    // could never do anything, so nothing in this room is clickable-but-dead.
    expect(
      Array.from(document.querySelectorAll("button")).some((b) =>
        (b.textContent || "").includes("unlock a live checkout page"),
      ),
    ).toBe(false);
    // The lucide Lock icon still renders alongside it, decorative.
    const icons = Array.from(document.querySelectorAll("svg[aria-hidden='true']"));
    expect(icons.length).toBeGreaterThan(0);
  });

  it("shows the First Profit logo mark in the unchosen state", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    expect(
      document.querySelector("svg[aria-label^='First Profit logo mark']"),
    ).toBeTruthy();
  });

  it("none of the retired copy renders (unchosen state)", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    expect(document.body.textContent).not.toMatch(/Take real money/i);
    expect(document.body.textContent).not.toMatch(/Your payment provider/i);
    expect(document.body.textContent).not.toMatch(/Works right now/i);
    expect(document.body.textContent).not.toMatch(/log a real sale/i);
    expect(document.body.textContent).not.toMatch(/Set it up for real/i);
    expect(document.body.textContent).not.toMatch(/Compare providers/i);
    // Retired 2026-08-04 (owner spec): the locked button's product-and-price
    // claim, in the room body AND in the dialog tagline.
    expect(document.body.textContent).not.toMatch(/when you have a product and a price/i);
  });

  it("a legacy chosen provider still shows its summary, without the retired label or CTAs", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    // Legacy account: a provider was chosen before the simplification.
    act(() => getApi().dispatch({ type: "SET_PROVIDER", providerId: "shopify", chosenAt: 1 }));

    await waitFor(() => expect(document.body.textContent).toMatch(/Shopify Starter Plan/));
    // The summary fee line still reads from providers.ts data.
    expect(document.body.textContent).toMatch(/\$5\/mo/);
    // The retired label and CTAs are gone from the chosen view too.
    expect(document.body.textContent).not.toMatch(/Your payment provider/i);
    expect(document.body.textContent).not.toMatch(/Set it up for real/i);
    expect(document.body.textContent).not.toMatch(/Compare providers/i);
    expect(document.body.textContent).not.toMatch(/log a real sale/i);
    // Retired 2026-08-04 (owner spec); the unlock line took its place.
    expect(document.body.textContent).not.toMatch(/You chose this/);
    expect(document.body.textContent).toContain(
      "You can unlock a live checkout page in the app.",
    );
  });

  it("a legacy chosen First Profit Pay shows the SAME fee and hold subhead (states agree)", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    act(() => getApi().dispatch({ type: "SET_PROVIDER", providerId: "first_profit_pay", chosenAt: 1 }));

    await waitFor(() =>
      expect(document.body.textContent).toContain("5% of every sale. 90 day hold before transfer."),
    );
    // No subscription estimate for a no-subscription provider.
    expect(document.body.textContent).not.toMatch(/Subscription so far/);
    // A chosen First Profit Pay shows the First Profit logo mark too.
    expect(document.querySelector("svg[aria-label^='First Profit logo mark']")).toBeTruthy();
  });

  it("keeps the light 'subscription so far' estimate for a legacy subscription provider", async () => {
    // Freeze the wall clock so the CONCRETE dollar figure is deterministic:
    // ChosenSummary reads Date.now() at render, so a frozen now makes elapsed
    // exactly two months. Spying only Date.now (not full fake timers) keeps
    // waitFor's real-timer polling working. Shopify Starter is 500c/mo, so two
    // months -> Math.round(500 * 2) = 1000c -> "$10".
    const NOW = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(NOW);
    try {
      renderBooth();
      await waitFor(() => expect(api?.stage).toBe("landing"));
      const twoMonthsAgo = NOW - 2 * MS_PER_MONTH;
      act(() => getApi().dispatch({ type: "SET_PROVIDER", providerId: "shopify", chosenAt: twoMonthsAgo }));

      await waitFor(() => expect(document.body.textContent).toMatch(/Subscription so far \(estimate\)/));
      expect(document.body.textContent).toMatch(/about \$10 so far/);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("the ledger of existing sale rows stays visible in the booth", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    act(() =>
      getApi().dispatch({
        type: "ADD_LEDGER",
        id: "row-1",
        kind: "sale",
        payer: "Ms. Okafor",
        amountCents: 1200,
        createdAt: new Date().toISOString(),
      }),
    );
    await waitFor(() => expect(document.body.textContent).toMatch(/Ledger/));
    expect(document.body.textContent).toMatch(/Ms\. Okafor/);
  });
});
