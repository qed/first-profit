import { describe, expect, it } from "vitest";
import {
  PROVIDERS,
  PROVIDER_IDS,
  computeFee,
  providerById,
  type Provider,
  type ProviderId,
} from "../providers";

const ALL: Provider[] = PROVIDER_IDS.map(providerById);

describe("provider set", () => {
  it("has exactly the three expected ids", () => {
    expect(PROVIDER_IDS).toEqual(["first_profit_pay", "shopify", "replit"]);
    expect(Object.keys(PROVIDERS).sort()).toEqual(
      ["first_profit_pay", "replit", "shopify"].sort(),
    );
  });

  it("each provider's id matches its record key and display name is set", () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDERS[id].id).toBe(id);
    }
    expect(PROVIDERS.first_profit_pay.name).toBe("First Profit Pay");
    expect(PROVIDERS.replit.name).toBe("Replit");
    expect(PROVIDERS.shopify.name).toBe("Shopify Starter Plan");
  });

  it("fee models match the plan", () => {
    expect(PROVIDERS.first_profit_pay.fee).toEqual({ percentBps: 5000, flatCents: 0 });
    expect(PROVIDERS.replit.fee).toEqual({ percentBps: 290, flatCents: 30 });
    expect(PROVIDERS.shopify.fee).toEqual({ percentBps: 290, flatCents: 30 });
  });
});

describe("subscriptions", () => {
  it("first_profit_pay has no subscription", () => {
    expect(PROVIDERS.first_profit_pay.subscriptionCents).toBeNull();
  });

  it("replit and shopify have present, positive subscription cents", () => {
    expect(PROVIDERS.replit.subscriptionCents).toBe(2500);
    expect(PROVIDERS.shopify.subscriptionCents).toBe(500);
    for (const p of [PROVIDERS.replit, PROVIDERS.shopify]) {
      expect(p.subscriptionCents).not.toBeNull();
      expect(p.subscriptionCents as number).toBeGreaterThan(0);
    }
  });
});

describe("computeFee happy paths", () => {
  it("$20 on replit -> fee 88 (58 + 30), net 1912", () => {
    expect(computeFee(2000, PROVIDERS.replit)).toEqual({ feeCents: 88, netCents: 1912 });
  });

  it("$20 on first_profit_pay -> fee 1000, net 1000 (50% flat)", () => {
    expect(computeFee(2000, PROVIDERS.first_profit_pay)).toEqual({
      feeCents: 1000,
      netCents: 1000,
    });
  });

  it("shopify equals replit at the same gross", () => {
    for (const gross of [2000, 4000, 1, 999, 123456]) {
      expect(computeFee(gross, PROVIDERS.shopify)).toEqual(
        computeFee(gross, PROVIDERS.replit),
      );
    }
  });
});

describe("computeFee invariant: gross === fee + net and net >= 0", () => {
  const GROSSES = [
    0, 1, 2, 3, 5, 7, 29, 30, 31, 33, 99, 100, 101, 250, 999, 1000, 1001, 1999,
    2000, 2001, 4000, 5001, 99999, 100000, 1000001, 999999999,
  ];

  for (const provider of ALL) {
    for (const gross of GROSSES) {
      it(`${provider.id} @ ${gross}c splits exactly`, () => {
        const { feeCents, netCents } = computeFee(gross, provider);
        expect(feeCents + netCents).toBe(gross);
        expect(netCents).toBeGreaterThanOrEqual(0);
        expect(feeCents).toBeGreaterThanOrEqual(0);
      });
    }
  }

  it("a tiny sale where the 30c flat dominates never goes negative", () => {
    // gross 1c: raw fee would be 30c, but it is clamped to gross so net = 0.
    const { feeCents, netCents } = computeFee(1, PROVIDERS.replit);
    expect(feeCents).toBe(1);
    expect(netCents).toBe(0);
    expect(feeCents + netCents).toBe(1);
  });

  it("an odd gross keeps the invariant with 50% rounding", () => {
    const { feeCents, netCents } = computeFee(2001, PROVIDERS.first_profit_pay);
    expect(feeCents + netCents).toBe(2001);
    expect(netCents).toBeGreaterThanOrEqual(0);
  });
});

describe("no em dashes in any student-facing copy", () => {
  const copyStrings = (p: Provider): string[] => [
    p.name,
    p.tagline,
    p.ease,
    p.whoOwnsAccount,
    ...p.setup.flatMap((s) => [s.title, s.detail]),
  ];

  it("no provider copy string contains an em dash", () => {
    for (const p of ALL) {
      for (const s of copyStrings(p)) {
        expect(s).not.toContain("—"); // em dash
        expect(s).not.toContain("–"); // en dash (belt and suspenders)
      }
    }
  });
});

// Type-level sanity: ProviderId union is exactly the three ids.
const _idCheck: ProviderId[] = ["first_profit_pay", "replit", "shopify"];
void _idCheck;
