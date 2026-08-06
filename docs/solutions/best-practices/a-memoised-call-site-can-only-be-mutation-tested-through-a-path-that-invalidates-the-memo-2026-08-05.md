---
title: "A memoised call site can only be mutation-tested through a path that invalidates the memo — otherwise the mutant never runs and the test 'passes' against it"
module: fp-staff-watchtower
date: 2026-08-05
problem_type: process_gap
component: development_workflow
severity: medium
applies_when: "Judging a mutant that lives inside a useMemo, useCallback, React.memo, or any other cache — the mutation may never be evaluated on the test's path"
symptoms:
  - "A clock-pinning test PASSED against the mutant that replaced the shared fetch instant with a fresh Date.now() at the row-computation call site — the mutant was nearly recorded as dead"
  - "Advancing the clock re-rendered the component but did not re-run the useMemo, so the previously computed (correct) value was reused and the mutated expression never executed"
  - "The kill required a criterion round-trip to a cache hit — the only available path that rebuilds the memo's dependencies"
root_cause: missing_workflow_step
resolution_type: workflow_improvement
last_updated: 2026-08-05
related_components:
  - src/screens/staff/StaffWatchtower.tsx (THE ONE CLOCK; the rows/totals/roster memos)
  - src/screens/__tests__/StaffWatchtower.test.tsx ("StaffWatchtower — ONE CLOCK")
tags:
  - mutation-testing
  - memoization
  - react
  - usememo
  - test-design
  - invariant
  - vitest
---

# A memoised call site can only be mutation-tested through a path that invalidates the memo

## The invariant being pinned

The Watchtower computes three things from the same cohort — the table rows, the
footer totals, and the drill-down roster — and each one re-runs the placement
walk independently. The walk classifies a unit as *sitting* or *stalled* against
a 30-day line, so if the three consumers are told different instants they can
contradict each other: a count of 2 in the table, an empty roster underneath it.

The screen therefore threads one instant, and says so in its header:

```
 * ── ONE CLOCK ──
 * `computeFlowRows`, `computeFlowTotals` and `drillDown` each re-run the
 * placement walk, so they must be told the same instant or the table and the
 * drill-down can disagree across the 30-day boundary. This screen uses the
 * FETCH instant (`shown.fetchedAt`) as that one clock rather than a fresh
 * `Date.now()` per render …
```

In code that is one derived value feeding three memos:

```tsx
// THE ONE CLOCK — see the header. Every walk below is told this same instant.
const nowMs = shown?.fetchedAt ?? 0;
const units = useMemo(() => (shown ? anonymousUnits(shown.cohort) : []), [shown]);
const rows = useMemo(
  () => (shown ? computeFlowRows(units, window_, nowMs) : []),
  [shown, units, window_, nowMs],
);
```

The mutant that must die is the obvious wrong version: replace `nowMs` at ONE
consumer with a fresh `Date.now()`.

## What went wrong

The new test pins the clock with `vi.spyOn(Date, "now")`, renders the board,
advances the spy by 31 days, and opens a drill-down. Both units sitting on
1.1.3 last completed 10 and 16 days before the fetch, so a fresh clock at either
consumer moves them from sitting to stalled and the two surfaces disagree.

It passed on the real source. It also **passed against the mutant** at the
`computeFlowRows` call site. The implementer nearly recorded that mutant as
dead — the assertion mentions the mechanism, the scenario is built around the
30-day boundary, and the test is red for the *right* reasons in other variants.

The reason is the memo, and it is entirely mundane once seen: the mutated
expression is inside a `useMemo` whose dependency array contains `shown`,
`units`, `window_` and `nowMs` — **not one of which changes when only the clock
moves**. `shown` is the cached entry, `nowMs` is `shown.fetchedAt`, and the
window is derived from phase and criterion. Advancing `Date.now()` and clicking
a drill-down re-rendered the component, but React returned the memoised value
from the previous run. The mutated line was never executed. The test observed
the correct value it had computed *before* the mutation could matter.

## The kill

The mutant only executes on a path that **invalidates** the memo. The available
one is a criterion round-trip: switch to 1.2 and back to 1.1, which is served
from the cache but rebuilds `window_` (a new object from `criterionWindow`) and
therefore forces every downstream memo to recompute — now under the advanced
clock, now running the mutated line, now producing stalled instead of sitting.

```tsx
// And a RE-READ of the cached board, long after its fetch, still reads as
// of that fetch. The round trip is what forces the row memo to RECOMPUTE
// (the window object is rebuilt on a criterion change) — without it,
// memoization alone would preserve the right answer and hide a fresh
// clock at that consumer.
await click(screen.getByRole("button", { name: /Step 1\.2/ }));
await click(screen.getByRole("button", { name: /Step 1\.1/ }));
expect(screen.getByTestId("fp-watchtower-drill-1.1.3:active").textContent).toBe("2");
expect(screen.getByTestId("fp-watchtower-footer").textContent).toContain(
  `4 ${STAFF_COPY.watchtowerFooterActive}`,
);
```

That is not a contrivance bolted on to satisfy a mutation score. It is the
independently valuable case — *a cached board re-read later still reads as of
its fetch instant* — which is the property staff actually rely on when they
leave the tab open and come back. The coverage was worth having on its own; the
mutant simply made the case for writing it.

## The generalisation

Memoisation is a **correctness-preserving optimisation**. That is exactly the
guarantee that defeats naive mutation testing: if the memo preserves the
correct value along a path, it preserves it *under mutation* along that same
path too, because the mutated code is never reached. The optimisation launders
the defect.

So a mutation-test verdict on a memoised expression carries no information
unless the test forces re-evaluation. "The test passed with the mutant applied"
decomposes into two very different conclusions — *the mutation is behaviourally
equivalent* and *the mutation never ran* — and only the first is a statement
about the code. Distinguishing them costs one look at the dependency array.

This is not React-specific. Any memo table, `once()` / lazy-singleton wrapper,
`@lru_cache`, resolved-promise cache or module-level constant has the same
property: the mutant is dead code on the second and subsequent calls, and a test
that only ever hits the cached path can never observe it.

## Prevention

- **Before recording a mutant inside `useMemo` / `useCallback` / `React.memo` /
  any cache as dead OR alive, check whether the test path actually re-evaluates
  it.** Read the dependency array and ask what in it changes during the test.
  If the answer is "nothing", the verdict is void, not favourable.
- **Prefer a mutation site OUTSIDE the memo**, or design the test around a real
  dependency change. Here the dependency that moves is the criterion, and the
  round-trip that moves it is a scenario worth testing anyway — look for that
  overlap before inventing a synthetic invalidation.
- **A suspiciously easy death is as much of a signal as a suspicious
  survival.** Both mean the mutation and the assertion may not be connected by
  an execution path. Inspect the dependencies before concluding anything in
  either direction.
- **When an invariant threads ONE value into several consumers, mutate each
  consumer separately.** A shared-instant invariant is only pinned if every
  call site is individually observable; a test that kills the mutant at
  `drillDown` says nothing about `computeFlowRows`.
- Record the reason a test is shaped the way it is **next to the assertion**, as
  the round-trip comment above does. Otherwise the next contributor reads two
  clicks that "do nothing" and deletes them, taking the kill with them.
