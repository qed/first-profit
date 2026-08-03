---
title: "Returning an outcome from a fire-and-forget API makes latent reentrancy a real bug — guard with in-flight memoization, sticky failure flags, and per-call sequence counters"
date: 2026-08-03
category: logic-errors
module: sync-engine
problem_type: logic_error
component: state-management
symptoms:
  - "flushPending() upgraded from void to Promise<FlushOutcome>; a flushNow() racing the 3s debounce timer read pending=false mid-flight and returned a false 'landed' while the save was still on the wire"
  - "A terminal write error cleared the outbox (by design), so a LATER flushNow with nothing newly pending reported 'landed' for content that never reached the server — the publish gate would have shown 'live' for a page missing the learner's edit"
  - "Two same-session refreshes resolving out of order let a stale 'none' overwrite a fresh 'published' (session-generation guard alone doesn't order responses WITHIN a session)"
root_cause: race_condition
resolution_type: code
severity: high
last_updated: 2026-08-03
related_components:
  - src/lib/sync.ts (flushPending / flushOnce, inFlight memo, terminalDropped flag)
  - src/state/GameContext.tsx (refreshSiteStatus seq counter, sessionGenRef)
tags:
  - reentrancy
  - fire-and-forget
  - flush
  - race-condition
  - generation-token
  - sequence-counter
---

# Returning an outcome from a fire-and-forget API makes latent reentrancy a real bug

## Problem

`flushPending()` was always re-entrant-unsafe (it flips `pending=false` synchronously
before awaiting the network write), but as a `void` fire-and-forget that was inert —
nobody acted on its answer. Unit 4 made it return `landed | parked | cas-rescheduled`
so a publish flow could gate on "content is on the server." The moment callers act on
the return value, every latent interleaving becomes a correctness bug.

## Solution

Three small guards, one per failure mode:

1. **In-flight promise memoization** (concurrent calls): `let inFlight:
   Promise<Outcome> | null`; a new caller `while (inFlight) await inFlight;` then runs
   its own pass re-reading live state. No caller can observe the mid-flight
   `pending=false` window; background timer calls serialize through the same guard.
2. **Sticky failure flag** (history erased by design): the terminal-error branch
   deliberately clears the outbox (no poison retries) — which also erased the only
   evidence that content never landed. An in-memory `terminalDropped` flag, set on
   terminal drop and cleared on the next successful land, keeps the nothing-pending
   branch answering `parked` until content truly lands.
3. **Per-call sequence counter** (same-session ordering): a session-generation token
   only rejects responses from a PREVIOUS session; two overlapping calls within one
   session still race. `seq = ++seqRef.current` before the await, drop the response if
   `seq !== seqRef.current` after — last-STARTED wins, not last-RESOLVED.

## Why This Works

Each guard targets a distinct clock: (1) orders concurrent executions, (2) preserves
truth across erased history, (3) orders responses within a session. The session
generation token — the codebase's existing lesson — handles only the fourth clock
(cross-session). All four are needed the moment an async subsystem's answer is load-
bearing.

## Prevention

- Changing a `void` async API to return a result is a SEMANTIC change: audit every
  interleaving as if writing the function fresh. "It was always like that" is exactly
  wrong — the return value is what makes the race observable.
- Ask "what erases the evidence?" for every failure branch. A cleanup that is correct
  for retry-hygiene (clearing a poison outbox row) can silently invalidate a
  truthfulness contract added later.
- Test overlapping calls with deferred mocks (start call A, hold its network promise,
  start call B, assert B does not resolve optimistically), not just sequential awaits
  — sequential tests structurally cannot catch any of these.
