// @vitest-environment jsdom
//
// Room dialogs (jsdom). Two surfaces:
//   - The Sales Room "Log a sale" form appends a {kind:'sale'} row through
//     ADD_LEDGER with a caller-minted id/timestamp and completes 1.2's last task
//     for the active idea (firing the 1.2 celebration when it is the last task).
//   - The Checkout Booth provider-choice lesson (PP2 Unit 4, replacing the retired
//     mock Stripe overlay): with no provider chosen it shows the 3-provider
//     comparison; choosing dispatches SET_PROVIDER; once chosen it shows the
//     chosen-provider summary with a "Compare providers again" re-entry.
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

describe("Checkout Booth — provider choice", () => {
  it("with no provider chosen, shows the 3-provider comparison as the booth body", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    // No provider chosen yet (reachable on first booth entry, R24.3).
    expect(getApi().chosenProvider).toBeNull();

    // One "Choose <name>" action per provider, in PROVIDER_IDS order.
    const chooseButtons = Array.from(document.querySelectorAll("button")).filter((b) =>
      /^Choose /.test(b.textContent || ""),
    );
    expect(chooseButtons.map((b) => b.textContent)).toEqual([
      "Choose First Profit Pay",
      "Choose Shopify Starter Plan",
      "Choose Replit",
    ]);

    // First Profit Pay is present + pickable, framed AS A PROVIDER (not "the course").
    expect(button((b) => b.textContent === "Choose First Profit Pay")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/the course/i);
    // Its 50% fee copy is shown (sourced from providers.ts).
    expect(document.body.textContent).toMatch(/50% of every sale/);
    // The real options' fee copy is shown too.
    expect(document.body.textContent).toMatch(/2\.9% \+ 30c per sale/);
    // Each card's cost line (costLine): FPP has no subscription suffix,
    // Replit adds $25/mo, Shopify Starter adds $5/mo.
    expect(document.body.textContent).toMatch(/\$25\/mo/);
    expect(document.body.textContent).toMatch(/\$5\/mo/);
    // And each card's one-line pitch.
    expect(document.body.textContent).toMatch(/Works right now/);
    expect(document.body.textContent).toMatch(/Sell online quickly/);
    expect(document.body.textContent).toMatch(/Build your own store/);
  });

  it("choosing a provider dispatches SET_PROVIDER with the id and shows the summary", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    act(() => fireEvent.click(button((b) => b.textContent === "Choose Replit")));

    const after = getApi();
    expect(after.chosenProvider?.providerId).toBe("replit");
    expect(typeof after.chosenProvider?.chosenAt).toBe("number");

    // The booth now shows the chosen-provider summary, not the comparison.
    await waitFor(() => expect(document.body.textContent).toMatch(/You chose this/));
    expect(document.body.textContent).toMatch(/Replit/);
    // The comparison's "Choose" actions are gone once a provider is chosen.
    expect(
      Array.from(document.querySelectorAll("button")).some((b) => /^Choose /.test(b.textContent || "")),
    ).toBe(false);
  });

  it("First Profit Pay is pickable and labeled as a provider (not the course)", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));

    act(() => fireEvent.click(button((b) => b.textContent === "Choose First Profit Pay")));

    const after = getApi();
    expect(after.chosenProvider?.providerId).toBe("first_profit_pay");
    await waitFor(() => expect(document.body.textContent).toMatch(/First Profit Pay/));
    expect(document.body.textContent).toMatch(/You chose this/);
  });

  it("with a provider already chosen, the summary offers a 'Compare providers again' re-entry", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    act(() => getApi().dispatch({ type: "SET_PROVIDER", providerId: "shopify", chosenAt: 1 }));

    // Summary state: name + fee + the "compare again" entry, no comparison cards.
    await waitFor(() => expect(document.body.textContent).toMatch(/You chose this/));
    expect(document.body.textContent).toMatch(/Shopify/);
    const compareAgain = button((b) => b.textContent === "Compare providers again");

    // Re-opening surfaces the comparison again (all three Choose actions return).
    act(() => fireEvent.click(compareAgain));
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll("button")).filter((b) => /^Choose /.test(b.textContent || "")),
      ).toHaveLength(3),
    );
  });

  it("shows a light 'subscription so far' estimate for a subscription provider (R24.8)", async () => {
    // Freeze the wall clock so the CONCRETE dollar figure is deterministic:
    // ChosenSummary reads Date.now() at render, so a frozen now makes elapsed
    // exactly two months. Spying only Date.now (not full fake timers) keeps
    // waitFor's real-timer polling working. Shopify Starter is 500c/mo, so two months
    // -> Math.round(500 * 2) = 1000c -> formatWholeDollars -> "$10".
    const NOW = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(NOW);
    try {
      renderBooth();
      await waitFor(() => expect(api?.stage).toBe("landing"));
      const twoMonthsAgo = NOW - 2 * MS_PER_MONTH;
      act(() => getApi().dispatch({ type: "SET_PROVIDER", providerId: "shopify", chosenAt: twoMonthsAgo }));

      await waitFor(() => expect(document.body.textContent).toMatch(/You chose this/));
      // The directional estimate line is present + labeled as an estimate.
      expect(document.body.textContent).toMatch(/Subscription so far \(estimate\)/);
      // ...and its CONCRETE value renders through the summary, not just the label:
      // 2 months of Shopify Starter's $5/mo = $10. (A $0 / wrong-multiplier / cents-as-
      // dollars bug would slip past a bare /\$/ check; this pins the real figure.)
      expect(document.body.textContent).toMatch(/about \$10 so far/);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("the chosen summary's fee line shows the provider's subscription (subscriptionLabel)", async () => {
    // The summary fee line renders `{feeLabel} · {subscriptionLabel}`. Assert the
    // subscription HALF through the rendered summary for each provider shape:
    // Replit + Shopify subscribe, First Profit Pay does not.
    const replit = renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    act(() => getApi().dispatch({ type: "SET_PROVIDER", providerId: "replit", chosenAt: 1 }));
    await waitFor(() => expect(document.body.textContent).toMatch(/You chose this/));
    expect(document.body.textContent).toMatch(/\$25\/mo/);
    replit.unmount();

    const shopify = renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    act(() => getApi().dispatch({ type: "SET_PROVIDER", providerId: "shopify", chosenAt: 1 }));
    await waitFor(() => expect(document.body.textContent).toMatch(/You chose this/));
    expect(document.body.textContent).toMatch(/\$5\/mo/);
    shopify.unmount();

    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    act(() => getApi().dispatch({ type: "SET_PROVIDER", providerId: "first_profit_pay", chosenAt: 1 }));
    await waitFor(() => expect(document.body.textContent).toMatch(/You chose this/));
    expect(document.body.textContent).toMatch(/No monthly fee/);
  });

  it("omits the 'subscription so far' estimate for First Profit Pay (no subscription)", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    act(() => getApi().dispatch({ type: "SET_PROVIDER", providerId: "first_profit_pay", chosenAt: 1 }));

    await waitFor(() => expect(document.body.textContent).toMatch(/You chose this/));
    expect(document.body.textContent).not.toMatch(/Subscription so far/);
  });

  it("'Set it up for real' opens the SetupGuide dialog for the chosen provider (R24.10)", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    act(() => getApi().dispatch({ type: "SET_PROVIDER", providerId: "replit", chosenAt: 1 }));

    await waitFor(() => expect(document.body.textContent).toMatch(/You chose this/));
    // No dialog until the affordance is used.
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    act(() => fireEvent.click(button((b) => b.textContent === "Set it up for real")));
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeTruthy());
    expect(document.body.textContent).toMatch(/Go live with Replit/);
  });

  it("switching to a DIFFERENT provider shows the coach beat; dismissing lands on the new provider (R24.6)", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    // Start on First Profit Pay.
    act(() => getApi().dispatch({ type: "SET_PROVIDER", providerId: "first_profit_pay", chosenAt: 1 }));
    await waitFor(() => expect(document.body.textContent).toMatch(/You chose this/));

    // Re-open and choose a DIFFERENT provider -> a real switch.
    act(() => fireEvent.click(button((b) => b.textContent === "Compare providers again")));
    act(() => fireEvent.click(button((b) => b.textContent === "Choose Replit")));

    // The coach beat renders and names the lesson.
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeTruthy());
    expect(document.body.textContent).toMatch(/First Profit Pay was taking half of every sale/);
    expect(getApi().chosenProvider?.providerId).toBe("replit");

    // Dismissing returns to the chosen summary with the NEW provider active.
    act(() => fireEvent.click(button((b) => b.textContent === "Got it")));
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(document.body.textContent).toMatch(/You chose this/);
    expect(document.body.textContent).toMatch(/Replit/);
  });

  it("the FIRST-EVER provider choice (from null) raises NO coach beat", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    // No provider chosen yet: this is a first choice, not a switch.
    expect(getApi().chosenProvider).toBeNull();

    act(() => fireEvent.click(button((b) => b.textContent === "Choose Replit")));

    // The choice landed, and the summary is shown WITHOUT a coach dialog (a
    // first choice has no "old" provider to reflect against).
    await waitFor(() => expect(document.body.textContent).toMatch(/You chose this/));
    expect(getApi().chosenProvider?.providerId).toBe("replit");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("choosing the SAME provider again does NOT show the coach beat (no-op switch)", async () => {
    renderBooth();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    act(() => getApi().dispatch({ type: "SET_PROVIDER", providerId: "replit", chosenAt: 1 }));
    await waitFor(() => expect(document.body.textContent).toMatch(/You chose this/));

    act(() => fireEvent.click(button((b) => b.textContent === "Compare providers again")));
    act(() => fireEvent.click(button((b) => b.textContent === "Choose Replit")));

    // Back to the summary, and NO coach dialog appeared.
    await waitFor(() => expect(document.body.textContent).toMatch(/You chose this/));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
