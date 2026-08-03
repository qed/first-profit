---
title: "Cross-repo render-boundary caps align by convention — pin them with shared constants per repo and name every enforcement point"
date: 2026-08-03
category: best-practices
module: public-site
problem_type: best_practice
component: cross-repo
applies_when:
  - "The same numeric limit (length cap, count bound) is enforced at multiple layers across repos: DB clamp, API refresh, server renderer, client maxLength"
severity: medium
last_updated: 2026-08-03
related_components:
  - src/lib/siteCopy.ts (SITE_HEADLINE_MAX_CHARS=120 / SITE_ONE_LINER_MAX_CHARS=140 — the ONE first-profit source)
  - api/_lib/renderSite.ts (render-boundary re-clamp)
  - src/components/rooms/YourSite.tsx + src/components/StepRunner.tsx (input maxLength)
  - the120 supabase/migrations/20260907120000_fp_public_sites.sql (projection truncation + CHECK backstop)
tags:
  - caps
  - clamp
  - cross-repo
  - shared-constants
  - drift
---

# Cross-repo render-boundary caps align by convention — pin them

## Context

The public-site headline (120) and one-liner (140) caps are enforced at four layers in
two repos: the120's projection trigger truncates (CHECK as backstop), the publish
resync clamps, first-profit's renderSite re-clamps defensively, and the room/runner
inputs set maxLength. Review found the numbers aligned — but only via comments; each
layer hand-typed its own literals. A future cap change (say 120→150) would need five
edits in two repos with nothing failing when one is missed: the symptom would be a
learner typing 150 chars and the public page silently showing 120.

## Guidance

- **One constants module per repo**, doc-linked to its counterpart: first-profit's
  `src/lib/siteCopy.ts` exports the caps consumed by renderSite AND every input
  maxLength; the120's migration + rules module own the server numbers. Never re-type
  the literal at a consumption site.
- **Name every enforcement point in the constant's doc comment** (trigger, resync,
  renderer, inputs) so the person changing the number has the checklist in front of
  them.
- **Pin the repo-local hops with tests** (renderSite clamps at the constant; inputs
  carry it). The cross-repo hop can't be import-shared — pin it the way the reserved
  list is pinned (a test asserting the local copy against a documented fixture), and
  re-verify at whole-branch review.
- Layers are deliberately redundant (client cap = UX, renderer clamp = defense,
  DB truncation = enforcement): keep all of them; the alignment, not the redundancy,
  is the maintenance burden.

## Why This Matters

Silent cap drift is invisible until a learner hits it, and the failure reads as data
loss ("my headline got cut"). The cost of prevention is one constants module and a
doc comment; the cost of drift is a cross-repo bug hunt through four layers.
