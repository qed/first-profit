---
title: "Infrastructure-complete is not requirement-complete: name the consuming unit and test the rendered surface"
module: fp-content-engine
date: 2026-08-03
problem_type: process_gap
component: development_workflow
severity: high
applies_when: "A plan builds accessors/plumbing 'for later units' to satisfy a user-facing requirement"
tags: [planning, requirements-trace, seam-review, banded-content, rendering-test, dead-plumbing]
---

# Infrastructure-complete is not requirement-complete

## Context

R2 (grade-banded task text) was THE content payload of the whole path-content
engine: "the text you read is connected to the age band." Unit 4 generated the
band variants; Unit 3 plumbed `grade → band` onto the game API; `path.ts`
exported four band accessors under a comment that said, precisely, "for later
units". Every per-unit review passed. No later unit ever consumed them: the
runner still rendered unbanded, per-criterion text, and the plan's Requirements
Trace marked R2 delivered by the units that built the plumbing. Two independent
whole-branch seam reviewers each rated it P0/P1 — kids would never have seen a
single banded word.

## Guidance

- A comment like "for later units" is a TODO wearing an architecture costume.
  When a plan schedules infrastructure for a requirement, it must also name the
  unit that CONSUMES it, and that unit's verification must be phrased at the
  rendered surface ("a grade-4 login SEES g3_5 text in the runner"), not at the
  data layer ("band variant present for authored bands").
- Requirements Trace rows must point at the consuming unit, not the producing
  one. "Delivered by Unit 4" was true for the variants and false for the
  requirement.
- The test that closes the loop is a component test that renders the SAME task
  under two bands and asserts the visible copy differs (and pins the per-task
  done-when). Pure accessor tests cannot catch a never-called accessor.

## Why This Matters

Every layer was individually reviewed and green; the defect was that a chain of
custody had no final link. Per-unit reviews structurally cannot see this — each
unit honestly did its job. Only the whole-branch pass, auditing requirements
against rendered surfaces, caught it. This is the requirements-level sibling of
the `BUILT_CRITERIA` lesson (see
[an-engine-that-models-the-full-domain-needs-a-separate-shipped-surface-allowlist]):
there, two shipped surfaces disagreed; here, the shipped surface and the
requirement disagreed.

## When to Apply

- Writing or reviewing any plan whose units split a requirement into
  produce-content / plumb-state / render-surface layers.
- Whole-branch review: for each user-visible requirement, demand the name of
  the component that renders it and the test that exercises it end to end.
- Grepping for exported symbols with zero non-test consumers is a cheap
  mechanical detector for this class ("dead plumbing scan").

## Examples

Fixed in StepRunner (branch feat/path-content-engine): current task renders
`taskTitleForBand`/`taskBodyForBand`/`doneWhenForBand` keyed by the stable task
id and `game.band`; `StepRunner.test.tsx` asserts task 1.1.1 shows different
copy at g3_5 vs g9_12 and that the per-task done-when renders for both.
