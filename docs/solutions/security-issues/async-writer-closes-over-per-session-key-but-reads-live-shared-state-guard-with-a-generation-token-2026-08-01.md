---
module: game-sync
tags: [async, session-boundary, shared-device, generation-token, epoch, race, sync, data-corruption]
problem_type: security_issue
severity: critical
date: 2026-08-01
---

# An async writer that closes over a per-session key but reads LIVE shared state writes the new session's data under the old session's key

## Problem

First Profit's server-sync engine debounces game-state saves: on each edit it
schedules a write ~3s later. The write (`flushPending`) closes over the
`profileId` captured when the engine started, but reads the document to save
from a **live, shared** `stateRef` that the single React reducer mutates for
whoever is currently logged in. On a shared classroom device this is a
cross-tenant data-corruption bug: child A's debounced save is in flight
(awaiting the network) when A logs out and child B logs in; A's write resolves
using A's frozen `profileId` but B's now-current `stateRef` doc — persisting
child B's private game and financial data into child A's save row.

Tearing down the engine on logout did not help: `stop()` set a `stopped` flag,
but an already-running `flushPending` promise kept executing and only checked
the flag at entry, not before the actual write.

## Symptoms

- After a fast logout→login on one device, a child's save row contains another
  child's ideas/ledger.
- No error anywhere: both the CAS revision guard and RLS pass, because the write
  is a legitimately-authorized update to A's own row (A's session token was
  still valid when the flush started) carrying B's doc.
- Only reproducible under timing: an edit within the debounce window of a
  session switch.

## What Didn't Work

- **A `stopped` boolean checked once at function entry.** An async function that
  `await`s can be superseded at any `await` point; a flag read only before the
  first `await` says nothing about whether the session is still current by the
  time the write actually fires several awaits later.
- **Freezing the key (`profileId`) at start.** Correct instinct, wrong half: the
  key was pinned but the *payload* (the doc) was read live. Pinning one and not
  the other is worse than pinning neither — it guarantees the mismatch (old
  key + new payload) instead of merely risking it.

## Solution

Give each engine instance a monotonic **generation token**, bump it on teardown,
and re-check it immediately before *every* state-mutating step — not just at
entry.

```ts
let generation = 0;
function start() {
  const gen = ++generation;          // this run's identity
  const isCurrent = () => gen === generation;
  // ...
}
function stop() { generation++; }    // supersede any in-flight run

async function flushPending() {
  const gen = generation;
  const isCurrent = () => gen === generation;

  let result = await saveSnapshot(profileId, base, doc);
  if (!isCurrent()) return;          // a newer session took over — write nothing
  if (result.reason === "cas-rejected") {
    const fresh = await loadSave(profileId);
    if (!isCurrent()) return;
    result = await saveSnapshot(profileId, fresh.revision, getSnapshot().doc);
    if (!isCurrent()) return;
  }
  if (!isCurrent()) return;
  setRevision(...); clearPending();   // only if still the current session
}
```

The provider already tore the engine down (`stop()`) before starting the next
one, so the generation bump on `stop()` makes every in-flight flush from the old
session a no-op the moment the new session begins.

## Why This Works

The generation token is the engine's identity across async suspension points.
Checking `isCurrent()` right before each write means a superseded run can never
mutate anything — not the save row, not the local revision, not the outbox —
regardless of where its `await`s were suspended when the session changed. It
converts "is this still valid?" from a start-of-function assumption into a
precondition re-verified at every side effect.

## Prevention

- **Any async operation that survives a session/context boundary must re-verify
  it still owns the context immediately before each side effect** — not once at
  entry. Capture a generation/epoch at start, bump it on teardown, and gate
  every write on it.
- **Never pair a captured (frozen) identity key with a live-read payload.** If
  the key is pinned at start, pin the payload at start too (snapshot it), or
  re-derive both at write time under a currency check. The dangerous middle
  ground is one frozen and one live.
- **A boolean `stopped` flag is not cancellation.** It only works if checked
  before every await-crossing side effect; a generation token generalizes that
  and also distinguishes "stopped" from "restarted as a different session."
- Sibling learning on this codebase:
  `docs/solutions/security-issues/in-memory-reducer-state-survives-logout-on-shared-devices-reset-explicitly-2026-07-31.md`
  — the in-memory-reset half of the same shared-device isolation problem. This
  doc is the async-write half.
