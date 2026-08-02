---
module: game-state
tags: [refactoring, discriminated-union, enum, reducer, side-effects, retire]
problem_type: logic_error
---

# Remapping a retired discriminant value to a live one INHERITS its side-effects (it is not a behavior-neutral compile-fix)

## Problem

Retiring a member of a discriminated union (`LedgerKind = 'sale' | 'backing'` ->
`'sale'`) breaks every exhaustive switch and every dispatch that still uses the old
value. The tempting "minimal compile-fix" is to remap the one remaining `'backing'`
dispatch to `'sale'`:

```ts
// MockCheckout "Pay" — was kind:'backing' (did nothing to progression)
dispatch({ type: "ADD_LEDGER", kind: "sale", ... });   // ✅ compiles again
```

That looks neutral. It is NOT. Behavior downstream was keyed on the discriminant: the
reducer auto-completes the "first sale" criterion (and fires a celebration) for ANY
`kind === 'sale'` row. So the mock "Invest in me" checkout — reachable in normal play —
now silently completes the learner's REAL first-sale milestone from a fake flow. The
old `'backing'` value was inert precisely because nothing keyed behavior on it; folding
it into `'sale'` inherited all of `'sale'`'s side-effects. A code comment even claimed
"behavior otherwise unchanged," which was false.

## Symptoms

- After retiring an enum/union value, a place that dispatched the old value now
  triggers logic gated on the value it was remapped to.
- The regression is invisible to existing tests if they exercise the remapped call in a
  state where the downstream behavior can't fire (e.g. the mock-Pay test ran with no
  active idea, so the criterion wasn't unlocked and the completion never triggered).

## Solution

When you retire a discriminant value, decide what the callers that USED it should now
do — don't just remap them to a live value and assume neutrality:

- If the old value was inert, preserve inertness: either stop the call from producing a
  behavior-bearing row, or add an explicit opt-out so the remapped value doesn't trigger
  the downstream logic:
  ```ts
  // reducer: only a real (non-mock) sale completes the first-sale criterion
  if (action.kind === "sale" && !action.mock) { markFirstSaleDone(); celebrate(); }
  // mock Pay: dispatch({ ..., kind: "sale", mock: true })   // appends a row, but inert
  ```
- Test the remapped call in the STATE WHERE THE DOWNSTREAM BEHAVIOR CAN FIRE (here: the
  criterion unlocked, an active idea) and assert the intended outcome — the pre-existing
  test's state hid the regression.

## Why This Works

Behavior in a discriminated-union system is a function of the discriminant. Retiring a
value doesn't just remove a type member; it removes whatever inertness that value
carried. Re-pointing the caller at a live value silently opts it into that value's
behavior. Making the opt-out explicit (or removing the behavior-bearing dispatch)
restores the caller's original semantics instead of inheriting a new one.

## Prevention

- **Treat "collapse retired value X into live value Y" as a behavior change, not a
  compile-fix.** Grep every branch keyed on Y and ask: should the ex-X callers now do
  all of that? Usually not.
- **A comment claiming "behavior unchanged" on a discriminant remap is a red flag** —
  verify it against the reducer/handlers keyed on the new value.
- **Add the regression test at the state where the downstream effect is live.** A test
  that exercises the call in a state where the effect is disabled proves nothing about
  the effect.
- Import validation sets from the canonical source (don't re-list a union's members in
  a validator) so the two can't drift when a member is added or removed.
