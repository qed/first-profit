---
title: "Surfacing a weakness is not removing it — check the diagnostic against the REALISTIC attack, not the extreme one"
module: fp-staff-watchtower
date: 2026-08-05
problem_type: process_gap
component: data-aggregation
severity: medium
applies_when: "A known weakness is deliberately left in place and a diagnostic field is emitted so a UI can caveat it, instead of the weakness being designed out"
symptoms:
  - "The flow board's median cycle time could be moved by one child's crafted save doc (children write their own jsonb; the server caps them at 50 ideas), and the decision was to SURFACE the concentration via sampleChildCount rather than cap or reweight"
  - "sampleChildCount counts DISTINCT contributing children, so it only flags concentration when the poisoner is the SOLE contributor"
  - "Reproduced: five honest children at 2 days plus one attacker holding six ideas at 45 days moved a row's median from 2 days to 45 — and sampleChildCount read 6 of 6, the MAXIMUM possible breadth"
  - "A poisoner who is one of N contributors RAISES the diagnostic instead of lowering it, so the metric reads healthiest exactly when the attack is most effective"
  - "Same module: elapsed === 0 passed a guard that rejected only negatives — the exact zero the guard's own comment warned would 'silently drag the median down'"
root_cause: design_gap
resolution_type: code_fix
last_updated: 2026-08-05
related_components:
  - src/screens/staff/flowBoard.ts (computeFlowRows per-child medians, FlowRow.sampleChildCount, FlowRow.maxSamplesFromOneChild, MIN_CHILDREN_PER_MEDIAN)
  - src/screens/staff/__tests__/flowBoard.test.ts ("one child with MANY ideas cannot move the median — per-child medians first", "a ZERO elapsed is an unusable pair")
tags:
  - metrics
  - diagnostics
  - threat-model
  - aggregation
  - median
  - data-poisoning
  - guard-clause
  - staff-tooling
---

# Surfacing a weakness is not removing it

## Problem

The Watchtower's flow board publishes a median cycle time per curriculum task,
computed across the cohort. The input is child-writable: each child owns their
own save doc, and the endpoint's only structural limit is a 50-idea cap
(`PROGRESS_IDEAS_CAP`). So one child with a crafted doc can contribute up to 50
of the samples behind a row's median.

The decision taken was deliberate and, in its reasoning, correct: do NOT cap and
do NOT invent a weight, because — as the review put it — inventing a weight
produces a wrong number that looks right. Instead, SURFACE the concentration, so
the UI can caveat what it renders. The chosen surface was `sampleChildCount`, the
number of distinct children behind the median.

The reasoning was sound. The metric was not.

`sampleChildCount` counts DISTINCT contributing children. It falls only when the
poisoner is the SOLE contributor — the degenerate case. In the realistic case the
poisoner is one voice among several, and every additional honest child RAISES the
number. Executed against the real module: five honest children each with one idea
completing a task in 2 days, plus one attacker holding six ideas at 45 days.
Eleven raw samples, six of them the attacker's, so a pooled median lands at 45
days. And `sampleChildCount` read **6 of 6** — the maximum breadth the fixture
could possibly express. The diagnostic was at its most reassuring precisely when
the attack was most effective.

A second instance of the same failure sits a few lines away. The elapsed-time
guard rejected only negatives, while its own comment named zero as a hazard: an
`elapsed === 0` pair (a task and its predecessor stamped in the same instant)
sailed through and dragged the median down. Nine crafted ideas were enough to
collapse an honest 10-day median to 0. The hazard had been identified in prose
and then not excluded in code.

## Solution

**Change the unit of aggregation, not the weight.** Each child's usable pairs are
collapsed to that CHILD'S median first; the row's median is then taken across
those per-child values:

```ts
  for (const row of rows) {
    const byChild = samplesByTask.get(row.taskId);
    if (!byChild) continue;
    const perChildMedians: number[] = [];
    for (const childSamples of byChild.values()) {
      row.sampleSize += childSamples.length;
      if (childSamples.length > row.maxSamplesFromOneChild) {
        row.maxSamplesFromOneChild = childSamples.length;
      }
      const childMedian = median(childSamples);
      if (childMedian !== null) perChildMedians.push(childMedian);
    }
    row.sampleChildCount = perChildMedians.length;
    if (perChildMedians.length === 0) continue;
    if (perChildMedians.length < MIN_CHILDREN_PER_MEDIAN) {
      row.medianSuppressed = true;
      continue;
    }
    row.cycleTimeMedianMs = median(perChildMedians);
  }
```

One child now contributes exactly one number, whether they hold one idea or
fifty. The attack fixture yields the true 2 days, and the raw shape is still
reported alongside it:

```ts
    const { rowBy, cohort } = board(response(...honest, attacker), SELL_1_2);
    const row = rowBy("1.2.1");
    expect(row.cycleTimeMedianMs).toBe(2 * DAY);
    // the raw shape is still reported, because a fix does not make the caveat useless
    expect(row.sampleSize).toBe(11);
    expect(row.sampleChildCount).toBe(6);
    expect(row.maxSamplesFromOneChild).toBe(6);
    expect(cohort.maxUnitsPerChild).toBe(6);
```

`maxSamplesFromOneChild` was added as part of the same change — but as a
diagnostic BESIDE a fix, not instead of one, and its doc comment records the
exact scenario that made it necessary:

```ts
  /** The most pairs any ONE child contributed. `sampleChildCount` alone does not
   *  catch concentration — 5 honest children plus one attacker with 6 ideas
   *  reads as 6 of 6 contributors, the maximum breadth, while moving a raw
   *  median from 2 days to 45. */
  maxSamplesFromOneChild: number;
```

The zero-elapsed guard was widened to match its own comment, and every rejected
pair is counted rather than silently skipped:

```ts
      // NEGATIVE is clock skew or an out-of-order save. ZERO is a task and its
      // predecessor stamped at the same instant — an unusable pair, not a
      // zero-duration cycle; admitting it let nine crafted ideas collapse an
      // honest 10-day median to 0. ABOVE THE CAP is a backwards-set clock (see
      // MAX_CYCLE_TIME_MS). All three are dropped and counted, never clamped.
      if (elapsed <= 0 || elapsed > MAX_CYCLE_TIME_MS) {
        row.droppedSamples++;
        continue;
      }
```

The WIP columns, which have no equivalent structural defence, keep the
diagnostic-only treatment — and say so, naming the exposure rather than implying
it is handled:

```ts
  /**
   * The most flow units contributed by any single child. One child may hold up
   * to 50 ideas (the endpoint's `PROGRESS_IDEAS_CAP`), so a crafted doc can
   * inflate a task's WIP by 50 while reporting no anomaly of any kind. The
   * MEDIAN is defended structurally instead (see `computeFlowRows`); this number
   * is what lets the UI caveat the WIP columns, which have no such defence.
   */
  maxUnitsPerChild: number;
```

## Why This Works

The original reasoning was right and the fix respects it. Per-child medians are
not a weighting — nobody's data is discounted, scaled, or discarded, and no
invented constant appears anywhere. What changed is the **unit of analysis**: the
row's population is now children rather than ideas. That removes the lever
(holding more ideas) without introducing a number that has to be justified.

It also composes with the privacy floor already in the module.
`MIN_CHILDREN_PER_MEDIAN` suppresses a median computed over one child — because a
one-child median over one sample IS that child's exact elapsed time between two
named tasks, on a board whose stalled count is drillable to usernames. Both rules
now operate on the same population, so they cannot disagree.

The honest tension worth recording: the diagnostic was not wrong to exist. It was
wrong to be the ONLY response. Structural fix first, diagnostic beside it.

## Prevention

- **When you choose to surface rather than fix, write down the specific attack
  the diagnostic is meant to catch, and then execute it.** Not a description — a
  fixture. `sampleChildCount` would have been rejected in five minutes by anyone
  who built the five-honest-children case.
- **Check the diagnostic against the REALISTIC case, not the extreme one.** A
  metric that fires only in the degenerate case (sole contributor, empty cohort,
  single sample) gives false comfort in the ordinary one, which is where the
  attack actually lives.
- **Watch for diagnostics that move the WRONG WAY.** `sampleChildCount` rises as
  honest participation rises, so an attacker hiding inside a healthy cohort makes
  it look healthier. A diagnostic correlated with the attack's success in the
  wrong direction is worse than none.
- **Prefer changing the unit of aggregation over adding a weight.** It removes the
  lever without inventing a number, and it is defensible to a non-statistician:
  "one child, one vote."
- **A guard's comment naming a hazard is a checklist item, not documentation.**
  "A zero would drag the median down" beside `if (elapsed < 0)` is a bug someone
  has already written the bug report for. Read every hazard comment as an
  assertion to verify against the code beneath it.
- **Keep the caveat after the fix.** `sampleSize`, `sampleChildCount` and
  `maxSamplesFromOneChild` all survive, because a structurally sound median over
  a thin or lopsided sample is still a thin, lopsided sample.
