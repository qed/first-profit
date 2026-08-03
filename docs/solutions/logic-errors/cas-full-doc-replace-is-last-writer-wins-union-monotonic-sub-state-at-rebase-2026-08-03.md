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
