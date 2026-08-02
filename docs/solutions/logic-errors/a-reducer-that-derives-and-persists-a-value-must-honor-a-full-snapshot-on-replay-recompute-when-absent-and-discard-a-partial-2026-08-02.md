---
module: game-state
tags: [reducer, derived-value, snapshot, replay, idempotency, ledger, fee]
problem_type: logic_error
---

# A reducer that both DERIVES and PERSISTS a value must: honor a full snapshot on replay, recompute when absent, and DISCARD a partial

## Problem

`ADD_LEDGER` derives a per-sale fee: `net = computeFee(gross, chosenProvider)`. But
the same action is ALSO used to replay a row loaded from the DB, which already carries
a `feeCents`/`netCents`/`providerId` snapshot taken at the time of the original sale.
If the reducer always recomputed, a replayed row would be re-priced against whatever
provider is chosen NOW — rewriting history (a sale taken at 50% would silently become
2.9% after the kid switched providers). If it always trusted the action's fields, a
fresh `{grossCents}`-only sale would get `fee = 0`.

The subtle trap is the **partial snapshot**: a row with `feeCents` set but `netCents`
missing. Trusting it yields `fee = X, net = gross` (default) — so `gross != fee + net`,
breaking the money invariant. Discarding-and-recomputing is the only correct move for a
partial.

## Solution

Distinguish "replay a complete snapshot" from "compute now," and treat a partial as
absent:

```ts
const suppliedSnapshot =
  action.feeCents !== undefined && action.netCents !== undefined; // BOTH required

let feeCents, netCents, providerId;
if (suppliedSnapshot) {
  // replay: honor the persisted split verbatim (do NOT re-price against the current provider)
  ({ feeCents, netCents, providerId } = action);
} else if (kind === "sale" && !mock && state.chosenProvider) {
  // compute now from the CHOSEN provider, and snapshot it onto the row
  ({ feeCents, netCents } = computeFee(gross, providerById(state.chosenProvider.providerId)));
  providerId = state.chosenProvider.providerId;
} else {
  feeCents = 0; netCents = gross; providerId = null; // un-modeled (no provider / mock)
}
```

- **Full snapshot -> honor it** (past sales keep their original fee even after a
  provider switch — the durability/idempotent-replay contract).
- **Absent -> compute now** and snapshot onto the row so it persists.
- **Partial -> treated as absent -> recompute** (never carry a half-snapshot that
  breaks `gross = fee + net`). The `&&` on BOTH fields is what makes a partial fall
  through to recompute.

## Why This Works

A reducer that feeds both live input and replayed persisted state has two contracts on
one code path: derive freshly for new events, and reproduce exactly for replay. Keying
on "is a COMPLETE snapshot present" satisfies both — new events (no snapshot) compute
and store; replayed events (full snapshot) reproduce. Requiring both derived fields to
be present before trusting them closes the partial-snapshot hole where the invariant
would break.

## Prevention

- **When a reducer derives a value that also gets persisted and replayed, branch on a
  COMPLETE snapshot, not any-field-present.** Trusting a partial silently violates the
  derived invariant (`gross = fee + net`).
- **Snapshot the derived value onto the row at compute time** so replay never re-derives
  against changed inputs (the reason past sales keep their old fee after a switch).
- **Test all three branches:** fresh compute (no snapshot), replay honor (full snapshot,
  different current provider -> keeps the old one), and partial-snapshot discard
  (recomputes; invariant holds).
- Sibling: the money-split invariant note (net = gross - fee, floor the rate) — this is
  the reducer-level companion that decides WHEN to apply that split vs replay a stored
  one.
