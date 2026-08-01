---
module: game-ui
tags: [modal, dialog, state-machine, reducer, celebration, terminal-state, a11y]
problem_type: ui_bug
severity: medium
date: 2026-08-01
---

# A completion event that opens a celebration must also CLOSE the underlying dialog, and the dismiss must decide next-or-exit

## Problem

In the fpv2 game, finishing the last task of a criterion inside the Step Runner
dialog set `celebrate: <criterionId>` in the reducer to pop a "Criterion passed"
celebration — but it never set `runnerOpen: false`. Both are full-screen
`aria-modal` dialogs, so after the last task BOTH mounted at once: the
celebration on top, the still-open runner underneath. Keyboard/screen-reader
focus walked the hidden runner's "Back to the Floor" button before reaching the
celebration. Worse, on the FINAL criterion (no next step), dismissing the
celebration only cleared `celebrate` — so the app dropped the player back into
the runner on an already-completed task with no forward action: a terminal-state
trap.

## Symptoms

- Two `aria-modal` dialogs rendered simultaneously after completing a criterion's
  last task; focus order broken.
- Dismissing the celebration on the last playable criterion returned to a runner
  showing a done task with only "Back to the Floor" — never the floor directly.

## Root cause

Two half-transitions. The completion action opened the "next" surface
(celebration) without closing the "current" one (runner). And the dismiss action
was a single-field clear (`celebrate = null`) rather than a real decision about
where the player goes next.

## Solution

Make the reducer own the whole transition at both ends:

```ts
// completing a criterion's LAST task: the celebration takes the screen,
// so close the runner in the SAME action.
if (nowCriterionDone && !wasCriterionDone) {
  next = { ...next, celebrate: stepId, runnerOpen: false };
}

// dismissing the celebration DECIDES next-or-exit:
case "DISMISS_CELEBRATION": {
  const nextStep = nextUpFor(state, state.activeIdea);
  return nextStep
    ? { ...state, celebrate: null, runnerOpen: true,
        runnerStep: nextStep, runnerIndex: firstIncompleteIndex(...) }  // advance
    : { ...state, celebrate: null, runnerOpen: false };                 // return to floor
}
```

Belt-and-suspenders at the view: the runner dialog early-returns `null` whenever
`celebrate` is set, so even a future path that sets both can never visually stack
them.

## Why this works

A "you finished X" celebration is a *transition* between two states, not an
overlay added on top of the current one. The action that triggers it must close
the surface it supersedes, and the action that dismisses it must resolve to a
concrete next state (advance to the next unit, or exit to the parent surface) —
never just un-set a flag and let the previous surface reappear by default.

## Prevention

- **When a completion/success event opens a new modal, close the modal it
  replaces in the same reducer action.** Two `aria-modal` dialogs open at once
  is both an a11y defect (focus escapes to the hidden one) and a sign the state
  machine has two half-transitions instead of one whole one.
- **A "dismiss/continue" action on a terminal surface must branch on what comes
  next** (next item → open it; nothing left → return to the parent), not clear a
  single field. "Clear the celebrate flag" silently falls back to whatever was
  underneath, which on the last item is a completed, actionless dialog.
- Keep modal open-state in the reducer (one place decides which single surface is
  visible) rather than in per-dialog local state, so "only one modal at a time"
  is enforceable in one spot.
