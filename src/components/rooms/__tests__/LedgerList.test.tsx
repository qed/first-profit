// @vitest-environment jsdom
//
// PP2 Unit 5 — the re-laid-out ledger row (gross -> fee -> net + provider label).
// LedgerList is a pure presentational component (props only, no context), so it
// renders directly. Proves a modeled row shows gross/fee/net + the provider name,
// and that a legacy null-provider / no-fee row renders gracefully (gross only).
import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { LedgerList } from "../LedgerList";
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
