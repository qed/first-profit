// @vitest-environment jsdom
//
// PP2 Unit 7 — the real-world SetupGuide overlay (R24.10) + the light
// "subscription so far" proxy (R24.8). Proves the guide renders the CHOSEN
// provider's parent-framed steps, that First Profit Pay shows an explicit
// "nothing to set up" state (never empty/crash), that the overlay follows the
// dialog conventions (role=dialog, aria-modal, Escape/dismiss, >=44px control),
// and that the estimate proxy is directional, null for a no-subscription
// provider, and guarded against a non-positive elapsed.
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, act, fireEvent, cleanup } from "@testing-library/react";

import { SetupGuide } from "../SetupGuide";
import { estimateSubscriptionSoFarCents } from "../CheckoutBooth";
import { PROVIDERS, type ProviderId } from "../../../data/providers";

afterEach(() => cleanup());

describe("SetupGuide — a provider with real setup", () => {
  function renderGuide(providerId: "replit" | "shopify", onDismiss = vi.fn()) {
    render(React.createElement(SetupGuide, { providerId, onDismiss }));
    return onDismiss;
  }

  it("renders Replit's real-world steps in order with the parent-controlled framing", () => {
    renderGuide("replit");
    const text = document.body.textContent || "";
    // Parent owns the account + payouts framing.
    expect(text).toMatch(/A parent owns the account and the payouts/);
    // Every setup step from providers.ts is present.
    for (const s of PROVIDERS.replit.setup) {
      expect(text).toContain(s.title);
    }
    // ...and rendered IN ORDER: the <ol> step titles match providers.ts exactly.
    // (Each <li>'s first <p> is the step title; the number lives in a <span>.)
    const renderedTitles = Array.from(document.querySelectorAll("ol li")).map(
      (li) => li.querySelector("p")?.textContent,
    );
    expect(renderedTitles).toEqual(PROVIDERS.replit.setup.map((s) => s.title));
    // Headline names the provider.
    expect(text).toMatch(/Go live with Replit/);
  });

  it("renders Shopify's steps too", () => {
    renderGuide("shopify");
    const text = document.body.textContent || "";
    for (const s of PROVIDERS.shopify.setup) {
      expect(text).toContain(s.title);
    }
    expect(text).toMatch(/Go live with Shopify/);
  });

  it("is an aria-modal dialog with a >=44px 'Got it' control that dismisses", () => {
    const onDismiss = renderGuide("replit");
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");

    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Got it");
    expect(btn).toBeTruthy();
    expect(btn?.className).toMatch(/min-h-\[48px\]/);
    act(() => fireEvent.click(btn as HTMLButtonElement));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("Escape dismisses the guide", () => {
    const onDismiss = renderGuide("shopify");
    act(() => fireEvent.keyDown(window, { key: "Escape" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("has no em dashes in its copy", () => {
    renderGuide("replit");
    expect(document.body.textContent || "").not.toMatch(/—/);
  });
});

describe("SetupGuide — First Profit Pay (no external setup)", () => {
  it("renders an explicit 'nothing to set up' state, not an empty panel or a crash", () => {
    render(React.createElement(SetupGuide, { providerId: "first_profit_pay", onDismiss: vi.fn() }));
    const text = document.body.textContent || "";
    // The no-setup state, not the "Go live with" step framing.
    expect(text).toMatch(/There is nothing to set up/);
    expect(text).toMatch(/First Profit Pay is ready to go/);
    expect(text).not.toMatch(/A parent owns the account and the payouts/);
    // No numbered step list rendered.
    expect(document.querySelectorAll("ol li")).toHaveLength(0);
    // Still dismissible.
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent === "Got it")).toBe(true);
    // No em dashes.
    expect(text).not.toMatch(/—/);
  });
});

describe("SetupGuide — unknown/stale providerId (render fallback)", () => {
  it("renders the raw id as the heading with no step list and does not throw", () => {
    // A stale/off-type id that is not in PROVIDERS (e.g. a persisted value from a
    // removed provider). The render path must degrade gracefully, mirroring the
    // helper's undefined-provider path that is already covered below.
    const unknownId = "stripe_direct" as unknown as ProviderId;
    expect(() =>
      render(React.createElement(SetupGuide, { providerId: unknownId, onDismiss: vi.fn() })),
    ).not.toThrow();

    const text = document.body.textContent || "";
    // The raw id is surfaced as the name in the heading (React-escaped text),
    // never a crash or a blank panel.
    expect(text).toMatch(/stripe_direct is ready to go/);
    // No numbered step list for an unknown provider (treated as no steps).
    expect(document.querySelectorAll("ol li")).toHaveLength(0);
    // Still a dismissible dialog.
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent === "Got it")).toBe(
      true,
    );
  });
});

describe("estimateSubscriptionSoFarCents — the light 'subscription so far' proxy", () => {
  it("scales the monthly subscription by whole months elapsed for a subscription provider", () => {
    const chosenAt = 1_000_000_000_000;
    const threeMonths = 3 * 30 * 24 * 60 * 60 * 1000;
    // Shopify Starter = 500c/mo. 3 months elapsed -> ~1500c.
    const cents = estimateSubscriptionSoFarCents(PROVIDERS.shopify, chosenAt, chosenAt + threeMonths);
    expect(cents).toBe(500 * 3);
  });

  it("is null for a no-subscription provider (First Profit Pay)", () => {
    const now = 2_000_000_000_000;
    expect(estimateSubscriptionSoFarCents(PROVIDERS.first_profit_pay, 1_000_000_000_000, now)).toBeNull();
  });

  it("is null for an undefined/unknown provider", () => {
    expect(estimateSubscriptionSoFarCents(undefined, 1, 2)).toBeNull();
  });

  it("guards a non-positive elapsed (chosenAt in the future) to 0, never negative", () => {
    const now = 1_000_000_000_000;
    // chosenAt AFTER now -> elapsed < 0 -> clamped to 0.
    expect(estimateSubscriptionSoFarCents(PROVIDERS.replit, now + 5000, now)).toBe(0);
    // chosenAt == now -> elapsed 0 -> 0.
    expect(estimateSubscriptionSoFarCents(PROVIDERS.replit, now, now)).toBe(0);
  });

  it("guards a non-finite elapsed to 0", () => {
    expect(estimateSubscriptionSoFarCents(PROVIDERS.replit, NaN, 1_000_000_000_000)).toBe(0);
  });
});
