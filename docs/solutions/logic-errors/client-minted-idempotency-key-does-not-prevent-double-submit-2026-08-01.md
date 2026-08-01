---
module: game-checkout
tags: [idempotency, double-submit, ledger, react, uuid, money]
problem_type: logic_error
severity: medium
date: 2026-08-01
---

# A client-minted idempotency key does NOT protect against a double-submit — you still need a synchronous in-flight guard

## Problem

The mock checkout (and the "log a sale" form) recorded money by dispatching
`ADD_LEDGER` with a client-generated `crypto.randomUUID()` id. That UUID makes
outbox *retries* idempotent (the DB insert dedupes a repeated same-id row via
23505-as-success). It reads like double-submit protection — but it is not. A
fast double-click on "Pay" calls the handler twice, and each call mints a NEW
UUID, so two genuinely distinct ledger rows land and the HUD Sales stat
double-counts.

## Symptoms

- Double-clicking Pay / Log-a-sale created two ledger rows for one intended
  payment; backing/sales totals doubled.
- The `disabled` attribute driven by React state did not help: the second click
  fired before the state update from the first re-rendered the button.

## Root cause

Two different jobs conflated:
- A **stable idempotency key** dedupes RE-DELIVERY of the *same logical*
  operation (a network retry, an outbox replay).
- A **submit guard** prevents a SECOND logical operation from starting.

A per-click-minted UUID is a fresh key per click, so it does the first job for
retries but nothing for the second — two clicks are two logical operations with
two keys. And a React-state `disabled` flag updates asynchronously (next render),
so it can't gate a burst of synchronous clicks.

## Solution

A synchronous, imperative in-flight guard that flips BEFORE the id is minted and
the action dispatched:

```ts
const submittingRef = useRef(false);
function pay() {
  if (submittingRef.current) return;   // second click within the same tick: drop
  submittingRef.current = true;        // flips synchronously, before any dispatch
  const id = crypto.randomUUID();
  dispatch({ type: "ADD_LEDGER", id, kind: "backing", source: "mock", ... });
  setPaid(true);
}
// re-arm on overlay close / next input change so legitimate later submits work.
```

Keep the UUID too — it still earns its keep for retry/outbox idempotency. The
`useRef` guard covers the double-submit; the UUID covers re-delivery. They are
complementary, not redundant.

## Why this works

`useRef` mutates synchronously, so the second click in the same event-loop burst
sees `submittingRef.current === true` and returns before minting a second id.
The button's `disabled` state (driven by the ref-backed `processing` flag) is
still set for the visible/keyboard case, but correctness no longer depends on the
async re-render.

## Prevention

- **Never treat a client-generated idempotency key as double-submit protection.**
  Ask which of the two jobs you need: dedupe re-delivery (stable key) vs. block a
  second start (synchronous guard). Money/side-effecting actions usually need
  BOTH.
- **Don't rely on a React-state `disabled` flag alone to prevent double-submit** —
  it updates on the next render, after a synchronous double-click has already
  fired. Gate with a `useRef` (or disable the control imperatively) that flips in
  the same tick as the handler entry.
- Re-arm the guard on a clear boundary (dialog close, form reset, next edit) so a
  legitimate subsequent submission is not permanently blocked.
