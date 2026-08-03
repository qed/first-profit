---
title: "An engine that models the full domain needs a separate shipped-surface allowlist, or one surface will outrun another"
module: fp-phase-engine
date: 2026-08-03
problem_type: logic_error
component: development_workflow
severity: high
symptoms:
  - "Retiring PLAYABLE_STEPS made the engine walk all 25 criteria; the Next Step coach immediately routed kids into criteria whose floor cards still said 'Coming in the next build'"
  - "The same kid on the same screen saw 1.3 as a locked dashed card AND had a green coach button that opened its fully-working runner - two internally-correct components with no shared readiness contract"
root_cause: logic_error
resolution_type: code_fix
tags: [allowlist, gating, engine-vs-ui, coach, unlock, phase-engine, gate-relaxation, content-readiness]
---

# An engine that models the full domain needs a separate shipped-surface allowlist

## Problem

Unit 6 (feat/path-content-engine, c6dfa2a) generalized the unlock engine from
`PLAYABLE_STEPS = ["1.1","1.2"]` to the full 25-criterion sequence. The engine
was correct — but "the curriculum says this criterion is next" and "this app
build has a finished surface for it" are DIFFERENT facts, and the old constant
had silently encoded both at once. Removing it split the two meanings, and
every consumer picked one: the coach and room-entry followed the engine (full
sequence), while SellFloor's hand-kept `built` flags and PhasesFloor's
hardcoded locks followed shipped-surface reality. The coach could walk a child
into a criterion the floor called "coming soon", with a wrong "Phase 1 · Sell"
runner header on top.

## Symptoms

See frontmatter. Every unit test stayed green — each component was internally
correct; only the COMPOSITION was wrong, and no test crossed the boundary.

## What Didn't Work

- Assuming the engine's unlock logic could serve as the UI gate: curriculum
  order is a domain fact; surface readiness is a build fact. One constant
  cannot mean both once they diverge.
- Hand-kept per-component flags (SellFloor's `built`): three components each
  encoding their own copy of "what's shipped" guarantees drift.

## Solution

One content-owned readiness allowlist (`BUILT_CRITERIA` in src/data/path.ts,
ad6ed00), consumed by EVERY surface that offers entry — the coach target
selector, room-entry routing, and the floor cards — with the ENGINE kept
allowlist-free (it models the curriculum; tests exercise the full sequence via
an injectable allowlist). Expanding shipped content is now a one-line change
that moves every surface in lockstep, and the engine/UI split is documented at
the constant.

## Why This Works

A gate that exists to say "not built yet" must have exactly one author and be
consumed at every door. Keeping it OUT of the engine preserves the engine's
truthfulness (progress, migration, and future units reason about the real
curriculum), while keeping every user-visible entry behind the single list
makes "surface outruns surface" structurally impossible.

## Prevention

- When retiring a constant, ask what MEANINGS it carried, not just what code
  references it. `PLAYABLE_STEPS` was both "curriculum prefix" and "shipped
  surface"; each meaning needed a successor.
- Any "coming soon" visual implies a readiness gate; grep every OTHER entry
  path (coaches, deep links, dialogs, keyboard nav) and make them consume the
  same gate.
- Test the composition: at least one test should assert the coach/entry
  target is always renderable by the floor (engine-frontier ∩ allowlist).
- Related: The120's
  `docs/solutions/logic-errors/a-gate-relaxation-resurrects-dead-trigger-branches-audit-guards-keyed-on-the-newly-possible-state-2026-08-02.md`
  (this is its UI-composition sibling: relaxing the gate resurrected the
  unreachable-surface branches).
