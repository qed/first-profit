---
title: "Retire a feature by removing ALL its surfaces (action + state field + reducer cases + mount + comments + tests) and PROVE it with a grep of the identifiers to zero across the source tree"
date: 2026-08-02
category: best-practices
module: game-state
problem_type: best_practice
component: refactoring
symptoms:
  - "A retired feature leaves an orphan: a state field with no consumer, a mount for a deleted component, a stale comment, or a test still exercising it"
  - "The build compiles but a retired flow is half-alive, or a later reader can't tell whether the feature is gone"
root_cause: design_gap
resolution_type: workflow_improvement
severity: low
tags:
  - refactoring
  - retire
  - dead-code
  - reducer
  - grep
  - verification
related_components:
  - refactoring
  - game-state
---

# Retire a feature across ALL its surfaces, and prove removal by grepping its identifiers to zero

## Context

Retiring the mock checkout overlay (fpv2 Payment Phase 2, Unit 4) meant removing a
feature that had SIX distinct surfaces: the `MockCheckout` component, its `<MockCheckout/>`
mount, two reducer actions (`OPEN_CHECKOUT`/`CLOSE_CHECKOUT`), a `checkoutOpen` field in
game state + its `initialState` default, a stale reference in a focus-trap comment, and
several tests. A "compile-clean" removal is not the same as a complete one: TypeScript
catches a dangling *type* reference, but it does NOT catch an orphan mount that renders
nothing, a state field nobody reads, a now-false doc comment, or a test asserting
behavior that no longer exists.

The sibling failure this prevents is real and recent (Unit 3, same project): a *partial*
retirement — remapping a retired discriminant value to a live one — silently shipped a
behavior change. Doing the removal completely, and proving it, is the counter-practice.

## Guidance

**Treat a feature retirement as a checklist across every surface, then verify with a
grep of the feature's identifiers to zero:**

1. Enumerate the surfaces before deleting: component(s), mount points, actions/events,
   state fields + their initializers, persistence/serialization (does it ride a save
   doc / a DB column?), comments/docstrings, and tests.
2. Remove them together in one unit so the tree is never half-retired.
3. **Prove it:** `grep -rn "OpenCheckout\|CLOSE_CHECKOUT\|checkoutOpen\|MockCheckout" src/`
   must return **zero**. A non-zero result is an orphan — a mount that renders nothing,
   a state field with no consumer, a stale comment, or a lingering test.
4. Re-point (don't delete) the tests that exercised the retired path onto the
   replacement behavior, so coverage isn't silently lost.

## Why This Matters

TypeScript's exhaustiveness and no-unused checks cover *some* surfaces (a removed union
member forces every switch to update), but they are blind to render-time orphans,
unread state, stale prose, and tests that still pass against absent behavior. The
grep-to-zero is the cheap, decisive proof that the retirement is total — and it is the
exact check that would have flagged the Unit-3 partial-retirement botch.

## When to Apply

Any time you delete or replace a feature that spans more than one file/surface —
especially reducer/event-driven UI where a component, an action, a state field, and its
mount are separate places that can each be left behind. Pair it with the sibling rule:
if you find yourself *remapping* a retired value onto a live one instead of removing it,
stop — that is a behavior change, not a retirement (see the discriminant-remap note).
