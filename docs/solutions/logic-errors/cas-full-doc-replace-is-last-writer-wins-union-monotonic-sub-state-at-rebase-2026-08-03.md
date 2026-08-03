---
title: "A CAS full-doc replace is still last-writer-wins: union monotonic sub-state at rebase, keep latest-intent local"
module: fp-sync
date: 2026-08-03
problem_type: logic_error
component: background_job
severity: high
symptoms:
  - "Two live sessions for one child (two tabs, tab + phone): session B loses its CAS write, rebases by taking a FRESH revision but keeping its own stale doc, and the full-column update permanently erases session A's completions"
  - "The migration's stale-tab recovery could not help - the clobbered completion was absent from the overwriting doc, so no later union had anything to recover"
root_cause: async_timing
resolution_type: code_fix
last_updated: 2026-08-03
tags: [cas, rebase, last-writer-wins, union, monotonic, save-doc, sync, concurrency, data-loss]
---

# A CAS full-doc replace is still last-writer-wins — union monotonic sub-state at rebase

## Problem

The save engine's CAS discipline (`update ... where revision = base`; zero rows
= stale base → refetch + rebase) prevented TORN writes, and its rebase
deliberately discarded the server doc ("this tab is authoritative for its own
snapshot"). Unit 5's adversarial review traced the consequence: with two live
sessions, the CAS loser rebases onto a fresh revision but writes its own stale
doc as a FULL-COLUMN REPLACE — the winner's completions, present only on the
server, are deleted with nothing left anywhere for merge-on-load to recover.
The mixed-build rollout window (an old tab that doesn't know the new fields
exist) had the same shape.

## Symptoms

A previously-passed criterion silently regresses to incomplete; a completion
made on the phone vanishes after the Chromebook tab's next debounced save.
Invisible in every sequential test — it needs two divergent local states.

## What Didn't Work

- Trusting CAS alone: revision-arming guarantees you never write over a state
  you haven't SEEN — it does not make what you then write a merge. A full-doc
  replace after rebase is still last-writer-wins.
- Merge-on-load: unions only what is still present somewhere in the doc. A
  replace that omits data leaves nothing to union.

## Solution

Split the doc by UPDATE SEMANTICS, not by field age (feat/path-content-engine,
d9baca9): at the rebase point, `unionCompletionMaps(localDoc, serverDoc)`
merges the MONOTONIC sub-state — `done`, `doneAt`, `doneByTask`,
`doneAtByTask`, and the idea LIST itself (creation is monotonic: extra server
ideas are appended, never dropped) — server→local, add-only, local wins on
conflicts. LATEST-INTENT state (typed fields, activeIdea, siteHeadline,
chosenProvider) stays local-authoritative, because "newest expression of the
user's intent" is the correct merge for it and no well-defined union exists.

## Why This Works

Monotonic state has a natural CRDT: set-union. Once the rebase unions instead
of replaces, no interleaving of writers can lose a completion — including
future stable-key-only tasks with no legacy shadow, and including the
mixed-build window (the old build's replace can still drop new-shape maps, but
the next new-build session's rebase or load re-unions them from wherever they
survive). Latest-intent fields keep the old contract because for them
last-writer-wins IS the right semantics.

## Round 2 (Unit 7, same day): three more halves of the same guarantee

The business-model review found the union alone still left split-brain:

1. **Merged docs must flow BACK into live state.** The rebase union wrote the
   merged doc to the server but never fed it to the merging tab's reducer —
   each tab kept re-asserting its own stale state on every flush, so the
   persisted "active business" flapped forever. Fix: an `onRebasedDoc`
   callback fires after the rebased save commits (generation-guarded) and a
   `UNION_REMOTE` action unions the merged doc's monotonic state into live
   state (marks state only — never closes dialogs or fires celebrations).
   A union with no feedback loop converges the DATABASE, not the SESSIONS.
2. **Union entity lists by ID, never by index.** Two tabs concurrently
   creating an idea at the same array position got FUSED by the index-matched
   union — one idea's completions grafted onto the other's fields, and the
   second identity silently dropped. Ids existed on the records; the union
   just didn't use them. Match by id when present, append the unmatched,
   reserve index-matching for deterministic-id legacy rows.
3. **Scalar conflicts need ACTION timestamps, not save timestamps.**
   "Local wins" for `archived` let a stale tab's unrelated write resurrect a
   business another tab had just archived — the local value was carried-over
   state, not fresh intent, and the union couldn't tell. Fix: stamp the
   ACTION (`archiveStateAt`), resolve by larger stamp (last-action-wins),
   and add a pure normalization (`normalizeBusinesses`: earliest-promoted
   active, rest archived) applied on load and after every union so the
   one-active invariant is restored deterministically no matter what merges.

## Round 3 (whole-branch seam review, same day): the client union cannot protect against writers running OLD CODE

The rebase union only fires when THIS session's write is CAS-rejected. A
still-open tab running the previously-deployed bundle whose cached revision is
simply current performs an ordinary, successful full-column replace — omitting
every key its build doesn't know (`businesses`, per-idea `doneByTask` maps,
idea `id`s), with no legacy shadow for phases 2-5 and no union anywhere in its
code path. If that is the last write for those keys, the loss is permanent. No
client-side fix can reach code that is already deployed.

Fix: a server-side BEFORE UPDATE trigger on the save row (The120,
`20260906120000_fp_save_doc_guard.sql`, branch feat/fp-save-doc-guard) that
grafts back monotonic keys the incoming doc omits AT THE KEY LEVEL (key absent
= writer-unknown → graft from OLD; key present = intentional → untouched, with
one evidence-based exception: `businesses` present-but-empty against a
non-empty OLD is also carried, because the client's coercion emits `[]` for
all-invalid entries and no legitimate writer shrinks the list to empty). Ideas
are id-matched with index fallback; the trigger never raises (it repairs or
warns-and-passes-through), and exempts service_role/JWT-less sessions so
owner-initiated erasure via the Management API stays possible.

Its own adversarial review then hardened it with three guards the first draft
lacked — each a lesson on server-side repair of client-owned documents:

1. **A repair trigger is an amplifier for attacker-shaped input.** The doc-size
   CHECK bounds BYTES, not element count — compressible junk fits ~50k ideas
   under 256KiB, turning the quadratic matcher into a repeatable CPU burn. An
   element-count fuse (>200 ideas → pass through untouched) bounds the work;
   past the fuse it is by definition not the mixed-build case. And the client
   must classify SQLSTATE 57014 (statement timeout) as RETRYABLE — the unknown-
   code→terminal default would have discarded the pending snapshot.
2. **"No writer legitimately deletes X" must be checked against every shipped
   discard path.** The client deliberately starts fresh on malformed/unknown-
   version docs; an unconditional graft would resurrect exactly what it
   discarded, silently block promotion via the one-active-business invariant,
   and accrete the doc toward the size-cap brick. A docVersion-equality gate
   (`OLD.doc->>'docVersion' is distinct from NEW.doc->>'docVersion'` → pass
   through) scopes the repair to the no-bump window it was designed for.
3. **A guard that fails open silently cannot be known to work.** The catch-all
   handler now `raise warning`s (parity test relaxed from "no raise" to "no
   raise exception"); gates are hoisted outside the protected region; the doc
   is built in a local and assigned once (so the exception path truly returns
   NEW as sent); and the apply ritual ends with a live probe — an old-shape
   UPDATE under a real child JWT asserting the grafted keys survive.

Accepted, documented loss mode: an id-less old-build idea can index-match an
id-bearing OLD idea created concurrently by a new-build session and fuse with
it — not fixable without defeating the graft; exposure is proportional to the
mixed-build window, so deploy order and window length are the mitigation.

Prevention addition: during any rollout that adds fields to a client-replaced
document, enumerate the writers that CANNOT be updated (deployed bundles in
open tabs) — the merge discipline must live at the last common chokepoint they
all pass through, which is the database write, not the client.

## Prevention

- Any time a client holds a whole document and saves it with CAS + rebase, ask
  per field: is this monotonic (grows only) or latest-intent? Monotonic state
  must union at every point where two divergent copies meet: rebase, load, and
  any import path. Latest-intent may replace.
- A rebase that "keeps local" is a silent-delete machine for anything another
  session added. The comment saying so ("this tab is authoritative") was the
  bug's specification — treat such comments as review flags.
- Test with two divergent states explicitly (server-only completion vs
  local-only completion vs both), not just sequential CAS rejects.
- Related: the merge-on-load union in this same module (gameCore
  migrateIdeaProgress) — load-time and rebase-time union are the two halves of
  one guarantee; either alone leaves a loss window.
