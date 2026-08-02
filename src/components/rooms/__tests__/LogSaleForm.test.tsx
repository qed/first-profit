// @vitest-environment jsdom
//
// PP2 Unit 5 — the "log a real sale" form (R24.5/R24.7). Proves a valid amount
// logs a fee-MODELED row through the chosen provider, that an empty/zero/over-cap
// amount is rejected (no un-modeled row), and that with NO provider chosen the
// form routes the student to choose one FIRST (no sale is logged un-modeled).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, act, fireEvent, cleanup, waitFor } from "@testing-library/react";

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
  loadLedger: vi.fn().mockResolvedValue([]),
  createSyncEngine: () => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    notifyLedger: vi.fn(),
    notifySnapshotChange: vi.fn(),
    flushOnHide: vi.fn(),
  }),
}));

import { GameProvider, useGame, type GameApi } from "../../../state/GameContext";
import { LogSaleForm, parseAmountCents } from "../LogSaleForm";

// jsdom in older node may lack crypto.randomUUID; the form requires it.
if (typeof globalThis.crypto?.randomUUID !== "function") {
  let n = 0;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { ...globalThis.crypto, randomUUID: () => `test-uuid-${++n}` },
  });
}

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
function input(label: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`no input ${label}`);
  return el;
}

function renderForm(onChooseProvider?: () => void) {
  return render(
    React.createElement(
      GameProvider,
      null,
      React.createElement(Probe),
      React.createElement(LogSaleForm, { onChooseProvider }),
    ),
  );
}

beforeEach(() => {
  api = null;
});
afterEach(() => cleanup());

describe("parseAmountCents", () => {
  it("parses dollars to positive integer cents; rejects zero/empty/non-numeric/over-cap", () => {
    expect(parseAmountCents("12")).toBe(1200);
    expect(parseAmountCents("$20")).toBe(2000);
    expect(parseAmountCents("0")).toBeNull();
    expect(parseAmountCents("")).toBeNull();
    expect(parseAmountCents("abc")).toBeNull();
    expect(parseAmountCents("100000")).toBeNull(); // over the $1000 cap
  });
});

describe("LogSaleForm — no provider chosen", () => {
  it("does NOT render the form; routes to choose a provider first", async () => {
    const onChoose = vi.fn();
    renderForm(onChoose);
    await waitFor(() => expect(api?.stage).toBe("landing"));

    // No amount input rendered (the form is gated behind a provider choice).
    expect(document.querySelector('input[aria-label="Sale amount in dollars"]')).toBeNull();
    const cta = button((b) => b.textContent === "Choose a provider first");
    act(() => fireEvent.click(cta));
    expect(onChoose).toHaveBeenCalledTimes(1);
    // No ledger row was created un-modeled.
    expect(getApi().ledger).toHaveLength(0);
  });
});

describe("LogSaleForm — provider chosen", () => {
  async function withProvider() {
    renderForm();
    await waitFor(() => expect(api?.stage).toBe("landing"));
    act(() => getApi().dispatch({ type: "SET_PROVIDER", providerId: "replit", chosenAt: 1 }));
  }

  it("a valid amount logs a fee-MODELED row (Replit: gross 2000, fee 88, net 1912)", async () => {
    await withProvider();
    act(() => fireEvent.change(input("Customer name"), { target: { value: "Nadia" } }));
    act(() => fireEvent.change(input("Sale amount in dollars"), { target: { value: "$20" } }));
    act(() => fireEvent.click(button((b) => b.textContent === "Log the sale")));

    const ledger = getApi().ledger;
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      payer: "Nadia",
      grossCents: 2000,
      feeCents: 88,
      netCents: 1912,
      providerId: "replit",
    });
  });

  it("an empty amount keeps submit disabled (no row logged)", async () => {
    await withProvider();
    act(() => fireEvent.change(input("Customer name"), { target: { value: "Nadia" } }));
    const submit = button((b) => b.textContent === "Log the sale");
    expect(submit.disabled).toBe(true);
    act(() => fireEvent.click(submit));
    expect(getApi().ledger).toHaveLength(0);
  });

  it("a zero amount keeps submit disabled (no un-modeled row)", async () => {
    await withProvider();
    act(() => fireEvent.change(input("Customer name"), { target: { value: "Nadia" } }));
    act(() => fireEvent.change(input("Sale amount in dollars"), { target: { value: "0" } }));
    const submit = button((b) => b.textContent === "Log the sale");
    expect(submit.disabled).toBe(true);
    act(() => fireEvent.click(submit));
    expect(getApi().ledger).toHaveLength(0);
  });
});
