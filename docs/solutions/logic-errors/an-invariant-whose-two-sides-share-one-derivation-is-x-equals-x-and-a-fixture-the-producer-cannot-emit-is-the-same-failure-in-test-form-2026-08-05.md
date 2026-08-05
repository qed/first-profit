---
title: "An invariant whose two sides share one derivation is x === x — and a fixture the producer cannot emit is the same failure in test form"
module: fp-staff-watchtower
date: 2026-08-05
problem_type: logic_error
component: data-aggregation
severity: high
symptoms:
  - "The flow board shipped a sum-check (active + stalled + before + after === units.length) described as catching a unit double-counted into two rows or dropped out of the walk; three reviewers independently proved it cannot fail for any input the intended call sequence can produce"
  - "The check stayed TRUE while `active` and `stalled` were swapped wholesale, and across three separate attacks that produced materially wrong boards — a median moved from 2 days to 45, a dead idea shown as active, a throughput row of [0,0,1,0,0]"
  - "The only way the project's own test could make it fail was hand-mutating the rows array after computation — a shape production never produces; ~20 fixtures asserted it for zero signal"
  - "A test covering dangling-business placement passed because its fixture gave the business a Phase-3 idea-task completion; a real Business record carries only Phase 4-5 completions, so the server cannot emit that shape"
  - "The shape that DOES occur — a business with only Phase 4-5 keys — was mis-bucketed: the board reported completions on a Grow task and nobody working it"
root_cause: false_assumption
resolution_type: code_fix
last_updated: 2026-08-05
related_components:
  - src/screens/staff/flowBoard.ts (placeUnit, throughputByTask, computeFlowTotals, isGatedOut)
  - src/screens/staff/__tests__/flowBoard.test.ts ("throughput monotonicity — the board's real invariant", "a DANGLING business carrying ONLY Phase 4-5 keys is placed, not stranded")
  - src/state/gameCore.ts (Business carries Phase 4-5 progress only)
tags:
  - invariant
  - self-check
  - tautology
  - test-fixture
  - mutation-testing
  - aggregation
  - staff-tooling
---

# An invariant whose two sides share one derivation is `x === x`

## Problem

Unit 4 of the Watchtower computes, per curriculum task, throughput, a median
cycle time, and WIP split into active and stalled. It is a numbers surface for
staff, so it shipped with a self-check — and the self-check was a tautology.

### Instance A — the sum that cannot fail

The board reported `active + stalled + before + after === liveUnits`, and the
module header sold it as validation: it would catch "a bug that double-counts a
unit into two rows, or drops one out of the walk". It was rendered as a quiet
footer so, in the original phrasing, staff would see a broken board before a test
did.

Three reviewers independently proved it cannot fail. Both sides come from the
same function. `computeFlowRows` places each unit with `placeUnit`; the totals
re-ran the SAME `placeUnit` over the SAME units, the same window and the same
clock:

```ts
export function placeUnit(unit: FlowUnit, window: FlowWindow, nowMs: number): FlowPlacement {
  if (isGatedOut(unit, window)) return { where: "before" };
  for (const taskId of window.taskIds) {
    if (unit.completions.has(taskId)) continue;
    return { where: "row", taskId, ...bucketFor(unit, nowMs) };
  }
  return { where: "after" };
}
```

`placeUnit` is total and single-valued: every unit returns from exactly one of
those three exits. Summing the four buckets therefore counts each unit once, by
construction. The one branch that could have broken the identity —

```ts
const row = rowByTask.get(placement.taskId);
if (!row) continue;
```

— is unreachable, because the placement's `taskId` is drawn from
`window.taskIds`, which is the same list `rows` was built from. So the check
reduces to `x === x` for every input the intended call sequence can produce.

It was also blind to everything that mattered. It stayed true when `active` and
`stalled` were swapped wholesale, and true across three separate attacks that
each produced a materially wrong board: a crafted doc that moved a median from 2
days to 45, an archived business that revived a 400-day-dead idea into `active`,
and an out-of-order doc yielding the physically impossible throughput row
`[0, 0, 1, 0, 0]`. Roughly twenty fixtures asserted the identity and none of them
could ever have gone red. The project's own test suite could only falsify it by
hand-mutating the rows array after the fact — a shape production never produces.

### Instance B — the fixture the producer cannot emit

A test covering placement of a DANGLING business (a `Business` whose `ideaId` is
absent or points at an idea that is gone) passed, and it passed for the wrong
reason: the fixture handed that business an idea-side Phase-3 task completion.
No such record exists. The module's own header states the constraint, and
`gameCore` enforces it — Phase 4-5 progress belongs to the business record and
nothing else writes there:

```ts
/** Where a flow unit came from. Load-bearing at the criterion boundary: a
 *  Business record carries ONLY Phase 4-5 completions, so it can never satisfy
 *  an idea-side entry predecessor (see `isGatedOut`). */
export type FlowUnitOrigin = "idea" | "business";
```

So the test proved the code handles an input the upstream system cannot generate,
while the input that actually arrives — a business carrying only Phase 4-5 keys —
was mis-bucketed. Its idea-side entry predecessor (`3.5.5` for the first Grow
criterion) is one it can never satisfy, so the entry gate parked it permanently
in `before`, and the board asserted both "1 completion on this Grow task" and
"nobody working it".

The two instances share a root. A check that cannot fail is worthless whether the
reason is that both sides agree by construction, or that the input which would
falsify it is unreachable.

## Solution

**Replace the identity with an invariant whose sides are derived differently.**
Throughput is counted straight off the completion maps, never off the walk:

```ts
/** Per-task throughput, derived from the completion maps alone and never from
 *  the walk — which is what lets the monotonicity invariant actually fail. */
function throughputByTask(units: readonly FlowUnit[], window: FlowWindow): Map<string, number> {
  const counts = new Map<string, number>(window.taskIds.map((taskId) => [taskId, 0]));
  for (const unit of units) {
    for (const taskId of window.taskIds) {
      if (unit.completions.has(taskId)) counts.set(taskId, (counts.get(taskId) ?? 0) + 1);
    }
  }
  return counts;
}
```

and the shipped invariant is that throughput must be non-increasing along the
criterion's task order, naming the offender when it is not:

```ts
  const counts = throughputByTask(units, window);
  let firstNonMonotonicTaskId: string | null = null;
  for (let index = 1; index < window.taskIds.length; index++) {
    const taskId = window.taskIds[index];
    const previous = counts.get(window.taskIds[index - 1]) ?? 0;
    if ((counts.get(taskId) ?? 0) > previous) {
      firstNonMonotonicTaskId = taskId;
      break;
    }
  }
```

It fails on a real document — no post-hoc mutation required:

```ts
  it("FAILS on a physically impossible row shape, naming the offending task", () => {
    // An out-of-order doc: 1.2.3 complete while 1.2.1 and 1.2.2 are not. Nothing
    // else on the board surfaces this — the WIP columns still add up.
```

The sum is still reported, but demoted in the type and in the prose — the header
now says outright that it is a footer staff read, not a check — and asserted
exactly once, at the one place its contract is stated:

```ts
  it("reports before/after/active/stalled as a reconciling footer", () => {
    // NOT validation — placeUnit is total, so this identity holds by
    // construction. It is asserted once, here, as the footer contract Unit 5
    // renders, and nowhere else.
```

For instance B, the gate was narrowed so origin decides it, and the fixture was
rewritten to the shape the server can actually emit:

```ts
function isGatedOut(unit: FlowUnit, window: FlowWindow): boolean {
  const entry = window.entryPredecessorId;
  if (entry === null) return false; // this criterion IS the sequence start
  if (unit.origin === "business") return false;
  if (unit.completions.has(entry)) return false;
  return !window.taskIds.some((taskId) => unit.completions.has(taskId));
}
```

with an isolating test whose business has NO in-window completions at all, so the
in-window-evidence escape cannot rescue it and only the origin rule can.

## Why This Works

Monotonicity is falsifiable because the two quantities it relates travel by
different routes: throughput from the completion maps, placement from the walk.
A disagreement between two independent derivations is observable; a disagreement
between one derivation and itself is not a thing that exists. The sum-check was
never an assertion about correctness — it was an assertion that `placeUnit` is
deterministic, which TypeScript's type signature already implies.

The same reasoning explains the fixture. A test's discriminating power comes from
the gap between what the code assumes and what the world supplies. A fixture
outside the producer's output set closes that gap by fiat: it can only ever
confirm the code's own assumptions back to it.

## Prevention

- **For any invariant, ask by what independent route each side is computed.** If
  the answer is "the same function", it is an assertion about determinism, not
  about correctness. Write it down in the header — the act of naming both
  derivations is what exposes the collapse.
- **Prefer invariants that relate different derivations**: a count taken from the
  data versus a count taken from the walk; a total from the source versus a total
  from the projection. Those can disagree, which is the whole point.
- **An invariant no legitimate input can falsify is decoration — delete it or
  replace it.** Rendering it is worse than omitting it, because a displayed check
  implies validation and stops the next reader looking. If the number is still
  useful to a human, keep the number and say in the type and the docs that it
  checks nothing.
- **Try to break it before you trust it.** Swap two buckets, delete a branch, feed
  a hostile document. Here, three attacks that each produced a visibly wrong board
  left the check green — which is the fastest possible proof it was measuring
  nothing.
- **When writing a fixture, ask whether the PRODUCER can emit that shape.** Trace
  the field back to the code that writes it. A fixture the upstream system cannot
  generate tests nothing — and it is worse than no test, because it hides the
  shape that does arrive behind a green tick.
- **Prefer the isolating fixture.** If a test would still pass with the mechanism
  under test removed (here, in-window evidence rescuing a unit the origin rule was
  supposed to rescue), strip the fixture until only the mechanism can explain the
  result.
