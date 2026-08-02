// @vitest-environment jsdom
//
// PP2 Unit 5 — the re-laid-out ledger row (gross -> fee -> net + provider label).
// LedgerList is a pure presentational component (props only, no context), so it
// renders directly. Proves a modeled row shows gross/fee/net + the provider name,
// and that a legacy null-provider / no-fee row renders gracefully (gross only).
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { LedgerList, LEDGER_RENDER_CAP } from "../LedgerList";
import type { LedgerEntry } from "../../../state/gameCore";

afterEach(() => cleanup());

function row(overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: "r1",
    kind: "sale",
    payer: "Nadia",
    amountCents: 2000,
    createdAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("LedgerList", () => {
  it("a modeled row shows gross, fee, net and the provider name", () => {
    render(
      React.createElement(LedgerList, {
        ledger: [
          row({ grossCents: 2000, feeCents: 88, netCents: 1912, providerId: "replit" }),
        ],
      }),
    );
    const text = document.body.textContent || "";
    expect(text).toMatch(/Gross/);
    expect(text).toMatch(/\$20/); // gross
    expect(text).toMatch(/-\$0\.88/); // fee
    expect(text).toMatch(/\$19\.12/); // net
    expect(text).toMatch(/Replit/); // provider label
    expect(text).toMatch(/Nadia/);
  });

  it("a legacy null-provider / no-fee row renders gracefully (amount only, no crash)", () => {
    render(
      React.createElement(LedgerList, {
        ledger: [row({ grossCents: 1500, feeCents: 0, netCents: 1500, providerId: null })],
      }),
    );
    const text = document.body.textContent || "";
    expect(text).toMatch(/Amount/);
    expect(text).toMatch(/\$15/);
    // No fee/net breakdown and no provider chip for an un-modeled row.
    expect(text).not.toMatch(/Gross/);
    expect(text).not.toMatch(/Replit|Shopify|First Profit Pay/);
  });

  it("an unknown (non-null) provider id falls back to the raw id string, not a crash", () => {
    render(
      React.createElement(LedgerList, {
        ledger: [row({ grossCents: 2000, feeCents: 88, netCents: 1912, providerId: "acme_pay" })],
      }),
    );
    expect(document.body.textContent || "").toMatch(/acme_pay/);
  });

  it("renders the empty text when the ledger is empty", () => {
    render(React.createElement(LedgerList, { ledger: [], emptyText: "Nothing yet" }));
    expect(document.body.textContent || "").toMatch(/Nothing yet/);
  });
});

// PP2 whole-branch review — the render order must be newest-first and derived
// from createdAt, NOT array position. Before the fix the list did
// `ledger.slice(-CAP).reverse()`, which assumed append order (oldest->newest);
// after a reload SET_LEDGER stores loadLedger's created_at DESC rows verbatim,
// so a position-based slice flipped the order and (past the CAP) dropped the
// NEWEST rows. These are the regression guards.
describe("LedgerList order + cap are createdAt-driven (reload-safe)", () => {
  const BASE_MS = Date.UTC(2026, 7, 2, 0, 0, 0); // 2026-08-02T00:00:00.000Z

  /** Build `count` rows with monotonically increasing createdAt + distinct payers. */
  function ascRows(count: number): LedgerEntry[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `row-${String(i).padStart(3, "0")}`,
      kind: "sale" as const,
      payer: `Payer${String(i).padStart(3, "0")}`, // higher index = newer
      amountCents: 1000 + i,
      createdAt: new Date(BASE_MS + i * 60_000).toISOString(),
    }));
  }

  /** The payer substrings, in the order they appear in the rendered DOM text. */
  function renderedPayerOrder(ledger: LedgerEntry[], count: number): string[] {
    render(React.createElement(LedgerList, { ledger }));
    const text = document.body.textContent || "";
    return Array.from({ length: count }, (_, i) => `Payer${String(i).padStart(3, "0")}`)
      .filter((p) => text.includes(p))
      .sort((a, b) => text.indexOf(a) - text.indexOf(b));
  }

  it("(a) ASCENDING in-memory ledger (as ADD_LEDGER appends) renders NEWEST FIRST", () => {
    const rows = ascRows(4); // Payer000 (oldest) .. Payer003 (newest)
    const order = renderedPayerOrder(rows, 4);
    expect(order).toEqual(["Payer003", "Payer002", "Payer001", "Payer000"]);
  });

  it("(b) DESCENDING in-memory ledger (as after a reload via SET_LEDGER) renders the SAME newest-first order", () => {
    // Same four rows, but supplied in created_at DESC order — exactly how
    // loadLedger returns them and SET_LEDGER stores them after a reload.
    const desc = [...ascRows(4)].reverse();
    const order = renderedPayerOrder(desc, 4);
    // Identical visible order to the ASC case: the render is order-source
    // independent. This is the core regression guard.
    expect(order).toEqual(["Payer003", "Payer002", "Payer001", "Payer000"]);
  });

  it("(c) past the CAP the NEWEST rows survive (not the array-position ones), ASC or DESC input", () => {
    const count = LEDGER_RENDER_CAP + 5; // 55 rows -> newest 50 render, oldest 5 drop
    const newest = `Payer${String(count - 1).padStart(3, "0")}`; // Payer054
    const oldestDropped = "Payer000"; // beyond the cap once sorted newest-first

    for (const rows of [ascRows(count), [...ascRows(count)].reverse()]) {
      cleanup();
      render(React.createElement(LedgerList, { ledger: rows }));
      const text = document.body.textContent || "";
      // The very newest row is present...
      expect(text).toContain(newest);
      // ...and an oldest row beyond the cap is NOT rendered, regardless of the
      // input array's ordering (a position-based slice would have kept the wrong
      // rows for one of these two orderings).
      expect(text).not.toContain(oldestDropped);
      // Exactly CAP rows render (count the row containers by their payer prefix).
      const rendered = (text.match(/Payer\d{3}/g) || []).length;
      expect(rendered).toBe(LEDGER_RENDER_CAP);
    }
  });
});
