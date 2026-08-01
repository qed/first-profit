// @vitest-environment jsdom
//
// Unit 11 room dialogs + mock checkout (jsdom). Proves the two load-bearing
// ledger writes go through ADD_LEDGER with a caller-minted id/timestamp and land
// in the reducer state (the sync layer, mocked here, is what stamps source='mock'
// on persistence — covered by sync tests):
//   - The Sales Room "Log a sale" form appends a {kind:'sale'} row and completes
//     1.2's last task for the active idea (firing the 1.2 celebration when it is
//     the last remaining task).
//   - The mock checkout "Pay" appends a {kind:'backing'} row that feeds the HUD
//     Sales stat (backingSumCents).
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
import { MockCheckout } from "../../MockCheckout";
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
    React.createElement(GameProvider, null, React.createElement(Probe), React.createElement(SalesRoom), React.createElement(MockCheckout)),
  );
}

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

describe("Mock checkout — Pay", () => {
  it("appends a backing ledger row that feeds the Sales stat", async () => {
    renderAll();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    act(() => getApi().dispatch({ type: "OPEN_CHECKOUT" }));

    // Default amount is $25.
    const payBtn = button((b) => Boolean(b.textContent?.startsWith("Pay $")));
    expect(payBtn.textContent).toBe("Pay $25.00");
    act(() => fireEvent.click(payBtn));

    const after = getApi();
    const backings = after.ledger.filter((r) => r.kind === "backing");
    expect(backings).toHaveLength(1);
    expect(backings[0]).toMatchObject({ kind: "backing", amountCents: 2500 });
    expect(backings[0].id).toBeTruthy();
    expect(backings[0].createdAt).toBeTruthy();
    // HUD Sales stat = sum of backings.
    expect(after.backingSumCents()).toBe(2500);
    // Success state rendered.
    await waitFor(() =>
      expect(Array.from(document.querySelectorAll("h2")).some((h) => /backed/.test(h.textContent || ""))).toBe(true),
    );
  });

  it("a fast double-click pays only once (no double-counted backing)", async () => {
    renderAll();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    act(() => getApi().dispatch({ type: "OPEN_CHECKOUT" }));

    const payBtn = button((b) => Boolean(b.textContent?.startsWith("Pay $")));
    act(() => {
      fireEvent.click(payBtn);
      fireEvent.click(payBtn);
    });

    const after = getApi();
    expect(after.ledger.filter((r) => r.kind === "backing")).toHaveLength(1);
    expect(after.backingSumCents()).toBe(2500);
  });
});
