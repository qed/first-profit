---
module: game-state
tags: [reducer, derived-value, aggregate, comparison, ledger, fee, ui-copy, data-migration]
problem_type: logic_error
---

# A comparative aggregate (paid-vs-would-have-paid) must be computed over ONE consistent row set — exclude un-snapshotted rows from BOTH sides, not one

## Problem

The provider-switch coach shows a reflection: "Fees you paid **$X**" next to
"`<newProvider>` would have taken **$Y**" over the student's past sales. The first
pass computed the two sums with different guards on the same loop:

```ts
for (const row of ledger) {
  if (row.kind !== "sale") continue;
  const gross = row.grossCents ?? row.amountCents;
  feesPaidCents      += row.feeCents ?? 0;                         // 0 for un-snapshotted rows
  feesUnderNewCents  += computeFee(gross, newProvider).feeCents;   // ALWAYS positive
}
```

A row that carries **no real fee snapshot** — a legacy row from before the fee columns
existed (`feeCents`/`providerId` null, only `amountCents`), or a sale logged before any
provider was chosen (`feeCents 0`, `providerId null`) — contributes **0** to the "paid"
side but a **positive** amount to the "would have taken" side. The two sums silently
range over different sets. A real, shipping account (PP2 launched with existing sales)
switching AWAY from the 50% strawman then sees "Fees you paid **$0**" sitting directly
under the headline "First Profit Pay was taking half of every sale." The concrete number
flatly contradicts the lesson — the single most damaging thing a money-teaching beat can do.

## Solution

A comparative aggregate must range over ONE set of rows. A row that can't supply the
LEFT side (no real fee snapshot) has no business supplying the RIGHT side either — it
never incurred a provider fee, so it isn't a data point in "what fees cost you." Gate
membership once, before either sum:

```ts
const newProvider = providerById(newProviderId);
if (newProvider) {                 // also the unknown-target guard, see below
  for (const row of ledger) {
    if (row.kind !== "sale") continue;
    if (row.providerId == null || row.feeCents == null) continue; // one gate, both sums
    saleCount += 1;
    const gross = row.grossCents ?? row.amountCents;
    feesPaidCents     += row.feeCents;                            // no ?? 0 needed now
    feesUnderNewCents += computeFee(gross, newProvider).feeCents;
  }
}
// showReflection = saleCount > 0  -> zero fee-bearing rows omits the panel entirely
```

Now `saleCount`, `feesPaidCents`, and `feesUnderNewCents` all describe the identical set,
so "on the same sales" is literally true, and a history with only un-snapshotted rows
shows the coach copy with **no** bogus $0 panel.

## Why This Works

The bug isn't arithmetic — `feeCents ?? 0` is a correct per-row value. The bug is
**set inconsistency**: a comparison of two aggregates is only meaningful when both are
taken over the same population. The `?? 0` fallback quietly admitted rows to one sum that
the other sum treated as absent. Deciding membership ONCE (a single `continue` that
governs `saleCount` and both sums together) makes the invariant "both sides cover the
same rows" structural rather than something two separate fallbacks have to happen to agree on.

## Prevention

- **When you render "A vs B" over a collection, compute A and B in the same loop behind a
  single membership gate.** Never let one side use a `?? default` that the other side
  doesn't — that is exactly how the two aggregates drift onto different populations.
- **A row that lacks the data for one side of a comparison should be excluded from the
  comparison, not defaulted into it.** Defaulting an absent value to 0/empty produces a
  number that looks real and reads as a claim.
- **Migration-awareness:** a feature that summarizes historical rows must decide what to
  do with rows written before the summarized fields existed. Legacy/un-snapshotted rows
  are a real production population the moment the feature ships to existing accounts —
  test the mixed-ledger case (real snapshot + legacy + pre-provider rows), not just the
  all-modern case.
- **Same fix carried the unknown-target guard:** `providerById(id)` returns `undefined`
  for an id not in the canonical set, and `computeFee` dereferences it — with no
  ErrorBoundary in the tree, that white-screens the room. Wrapping the loop in
  `if (newProvider)` both guards the crash and makes an unknown target degrade to "no
  panel," matching the display path's raw-id fallback.
- Sibling: the reducer-snapshot note (honor full snapshot on replay, recompute when
  absent, discard a partial) — that governs how a row GETS its fee snapshot; this note
  governs how a later aggregate must treat rows that never got one.
