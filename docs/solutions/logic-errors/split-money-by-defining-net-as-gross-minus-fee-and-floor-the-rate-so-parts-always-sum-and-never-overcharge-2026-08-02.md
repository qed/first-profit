---
module: payments
tags: [money, rounding, fee, invariant, integer-cents]
problem_type: logic_error
---

# Split money by defining net = gross - fee (and floor the rate): parts always sum, never overcharge

## Problem

Splitting a gross sale into a provider fee and the seller's net (fee = a percent +
a flat cent amount) is a classic rounding trap. The obvious approach rounds BOTH
parts independently:

```ts
const feeCents = Math.round(gross * pct) + flat;
const netCents = Math.round(gross * (1 - pct)) - flat;  // ❌
```

Now `feeCents + netCents` can be off by a cent from `gross` (the two roundings don't
reconcile), and on a rounding tie the provider can take slightly MORE than its stated
rate — e.g. a "50%" fee becomes 50.02% on an odd number of cents. For a fee/tax/payout
ledger read in sums, that drift is a real bug (money that doesn't add up).

## Solution

Two rules make it exact and honest:

1. **Round only ONE part; define the other by subtraction.** Compute the fee, then
   `net = gross - fee`. The two parts then sum back to gross by construction, for any
   integer gross, immune to any rounding choice.
2. **FLOOR the percentage part** so a provider never exceeds its stated rate on a tie,
   and **clamp** the fee to gross so net is never negative when the flat part alone
   exceeds a tiny sale.

```ts
export function computeFee(grossCents, { percentBps, flatCents }) {
  const gross = Math.max(0, Math.trunc(grossCents));
  const rawFee = Math.floor((gross * percentBps) / 10000) + flatCents; // floor the %
  const feeCents = Math.min(rawFee, gross);                            // clamp
  const netCents = gross - feeCents;                                   // net by subtraction
  return { feeCents, netCents };                                       // fee + net === gross, net >= 0
}
```

## Why This Works

`net = gross - fee` makes `fee + net === gross` a definitional identity, not a
rounding coincidence — so no independent-rounding drift is possible. Flooring the
percentage guarantees the effective rate is `<=` the stated rate (a "50%" strawman
never takes 50.02%), and the `min(rawFee, gross)` clamp keeps net non-negative even
when a fixed 30c fee lands on a 1c sale.

## Prevention

- **Never round both sides of a money split.** Round one, subtract for the other.
- **Assert the invariant as a property test** over a spread of gross values —
  including `0`, `1`, flat-fee-dominated tiny amounts, odd cents, boundaries, and a
  huge value near the safe-integer limit: `fee + net === gross` and `net >= 0` for all.
- **Decide the tie-break direction deliberately.** Floor the rate when the payer must
  never be over-charged (fees, the house's cut); the choice is a product decision, not
  an accident of `Math.round`.
- **Snapshot the computed fee where it is applied** (e.g. per ledger row) so a later
  rate change never retroactively rewrites past splits.
