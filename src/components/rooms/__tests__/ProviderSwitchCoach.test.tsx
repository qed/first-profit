// @vitest-environment jsdom
//
// PP2 Unit 6 — the provider-SWITCH coach / reflection beat (R24.6). Proves the
// beat renders and NAMES the lesson on a switch away from First Profit Pay, that
// the ledger-derived reflection number is correct, that it follows the overlay
// conventions (role=dialog, aria-modal, Escape/dismiss, >=44px control), and that
// switching between two real providers reads as the lighter features/effort beat.
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, act, fireEvent, cleanup } from "@testing-library/react";

import {
  ProviderSwitchCoach,
  computeSwitchReflection,
} from "../ProviderSwitchCoach";
import type { LedgerEntry } from "../../../state/gameCore";

function saleRow(over: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: Math.random().toString(36).slice(2),
    kind: "sale",
    payer: "Someone",
    amountCents: 2000,
    grossCents: 2000,
    feeCents: 0,
    netCents: 2000,
    providerId: null,
    createdAt: "2026-08-02T00:00:00.000Z",
    ...over,
  };
}

// Two $20 sales taxed at 50% by First Profit Pay: paid 2000c ($20) in fees.
const FPP_LEDGER: LedgerEntry[] = [
  saleRow({ id: "a", grossCents: 2000, feeCents: 1000, netCents: 1000, providerId: "first_profit_pay" }),
  saleRow({ id: "b", grossCents: 2000, feeCents: 1000, netCents: 1000, providerId: "first_profit_pay" }),
];

afterEach(() => cleanup());

describe("computeSwitchReflection", () => {
  it("sums fees actually paid from each row's own snapshot and what the new provider would take", () => {
    const r = computeSwitchReflection(FPP_LEDGER, "replit");
    expect(r.saleCount).toBe(2);
    // Actually paid: 1000 + 1000 = 2000c ($20) under First Profit Pay's 50%.
    expect(r.feesPaidCents).toBe(2000);
    // Replit would take 2.9% + 30c on each $20 gross: (58 + 30) * 2 = 176c.
    expect(r.feesUnderNewCents).toBe(176);
  });

  it("is zero with no sales", () => {
    expect(computeSwitchReflection([], "shopify")).toEqual({
      saleCount: 0,
      feesPaidCents: 0,
      feesUnderNewCents: 0,
    });
  });

  it("counts ONLY rows with a real fee snapshot; excludes legacy + pre-provider rows from saleCount and both sums", () => {
    const ledger: LedgerEntry[] = [
      // Real FPP sale: gross $20, paid $10 (50%). The only row that qualifies.
      saleRow({ id: "real", grossCents: 2000, feeCents: 1000, netCents: 1000, providerId: "first_profit_pay" }),
      // Legacy row (pre-Unit-5): only amountCents, no gross/fee snapshot, no
      // provider. Never incurred a provider fee -> excluded entirely.
      saleRow({ id: "legacy", amountCents: 5000, grossCents: undefined, feeCents: undefined, netCents: undefined, providerId: null }),
      // Sale logged before a provider was chosen: feeCents 0, providerId null.
      // A $0 fee with no provider snapshot -> excluded (would otherwise pit a
      // positive "would take" against a $0 "paid").
      saleRow({ id: "preprovider", grossCents: 3000, feeCents: 0, netCents: 3000, providerId: null }),
    ];
    const r = computeSwitchReflection(ledger, "replit");
    // Only the one real FPP row participates in the comparison.
    expect(r.saleCount).toBe(1);
    expect(r.feesPaidCents).toBe(1000); // just the real row's $10, not $0-fee rows
    // Replit on the one $20 gross: floor(2000*290/10000)=58, +30 = 88c. The
    // excluded rows' $50 and $30 gross do NOT contribute.
    expect(r.feesUnderNewCents).toBe(88);
  });

  it("falls back to amountCents for a counted (fee-bearing) row that lacks grossCents", () => {
    const ledger: LedgerEntry[] = [
      // Fee-bearing row (providerId + feeCents set) but no grossCents -> gross
      // must fall back to amountCents (2000) when charging the new provider.
      saleRow({ id: "nogross", amountCents: 2000, grossCents: undefined, feeCents: 1000, netCents: 1000, providerId: "first_profit_pay" }),
    ];
    const r = computeSwitchReflection(ledger, "replit");
    expect(r.saleCount).toBe(1);
    expect(r.feesPaidCents).toBe(1000);
    // gross = amountCents = 2000 -> Replit takes 58 + 30 = 88c.
    expect(r.feesUnderNewCents).toBe(88);
  });
});

describe("ProviderSwitchCoach — switching away from First Profit Pay", () => {
  function renderCoach(onDismiss = vi.fn()) {
    render(
      React.createElement(ProviderSwitchCoach, {
        oldProviderId: "first_profit_pay",
        newProviderId: "replit",
        ledger: FPP_LEDGER,
        onDismiss,
      }),
    );
    return onDismiss;
  }

  it("renders an aria-modal dialog that names the lesson (half of every sale -> Replit keeps almost all)", () => {
    renderCoach();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");

    const text = document.body.textContent || "";
    expect(text).toMatch(/First Profit Pay was taking half of every sale/);
    expect(text).toMatch(/Replit keeps almost all/);
  });

  it("surfaces the correct ledger-derived reflection ($20 paid vs Replit's $1.76)", () => {
    renderCoach();
    const text = document.body.textContent || "";
    expect(text).toMatch(/Fees you paid/);
    expect(text).toMatch(/\$20/); // 2000c actually paid
    expect(text).toMatch(/\$1\.76/); // 176c under Replit
  });

  it("has a dismiss control that is at least 44px and calls onDismiss", () => {
    const onDismiss = renderCoach();
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Got it",
    );
    expect(btn).toBeTruthy();
    // The overlay classes assert the >=44px target (min-h-[48px]); behaviorally
    // the control dismisses.
    expect(btn?.className).toMatch(/min-h-\[48px\]/);
    act(() => fireEvent.click(btn as HTMLButtonElement));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("Escape dismisses the beat", () => {
    const onDismiss = renderCoach();
    act(() => fireEvent.keyDown(window, { key: "Escape" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("has no em dashes in its copy", () => {
    renderCoach();
    expect(document.body.textContent || "").not.toMatch(/—/);
  });
});

describe("ProviderSwitchCoach — switching TO First Profit Pay", () => {
  it("renders the enteringFpp heads-up copy naming the old real provider, with no em dash", () => {
    render(
      React.createElement(ProviderSwitchCoach, {
        oldProviderId: "replit",
        newProviderId: "first_profit_pay",
        ledger: [],
        onDismiss: vi.fn(),
      }),
    );
    const text = document.body.textContent || "";
    // Unique enteringFpp headline + body copy (not the leavingFpp lesson).
    expect(text).toMatch(/First Profit Pay takes half/);
    expect(text).toMatch(/it keeps half of every sale/);
    expect(text).toMatch(/Most founders pick a provider like Replit/);
    expect(text).not.toMatch(/Now you keep almost all of it/);
    // Copy standard: no em dashes anywhere in the rendered beat.
    expect(text).not.toMatch(/—/);
  });
});

describe("ProviderSwitchCoach — switching between two real providers", () => {
  it("reads as the lighter features/effort beat (fees are close)", () => {
    render(
      React.createElement(ProviderSwitchCoach, {
        oldProviderId: "replit",
        newProviderId: "shopify",
        ledger: [],
        onDismiss: vi.fn(),
      }),
    );
    const text = document.body.textContent || "";
    expect(text).toMatch(/almost the same/);
    expect(text).toMatch(/how you want to build/);
    // No half-of-every-sale strawman framing between two real providers.
    expect(text).not.toMatch(/half of every sale/);
  });

  it("omits the reflection panel when there are no past sales", () => {
    render(
      React.createElement(ProviderSwitchCoach, {
        oldProviderId: "replit",
        newProviderId: "shopify",
        ledger: [],
        onDismiss: vi.fn(),
      }),
    );
    expect(document.body.textContent || "").not.toMatch(/Fees you paid/);
  });
});
