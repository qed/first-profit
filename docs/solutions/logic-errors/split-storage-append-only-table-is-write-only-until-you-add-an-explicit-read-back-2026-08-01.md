---
module: game-sync
tags: [persistence, hydrate, ledger, append-only, split-storage, data-loss, review]
problem_type: logic_error
severity: high
date: 2026-08-01
---

# Split storage: an append-only side table is WRITE-ONLY until you add an explicit read-back — and a HYDRATE that clears a slice it doesn't source silently drops it

## Problem

Game state was split across two stores: a JSONB save document
(`fp_player_saves`) for most state, and a separate append-only table
(`fp_ledger`) for the sales/backings money rows. The client had an `insertLedger`
write path and, correctly, `toSaveDoc` EXCLUDED the ledger (it lives in its own
table). But nothing ever SELECTed `fp_ledger` back, and the `HYDRATE` reducer
action unconditionally set `ledger: []`. Net effect: every reload or re-login
reset the child's earnings and ledger to $0 in the UI, even though every row was
safely persisted server-side. The money-tracking feature silently did not
survive a session.

The insidious part: this passed every per-unit review. The write path was
correct, the exclusion from the save doc was correct, the tests covered writes
and outbox replay — but no test ever did a round-trip READ of a prior session's
ledger, because the read path did not exist to test. It took a whole-branch
correctness pass to notice the slice was write-only.

## Symptoms

- HUD Sales/Profit totals and the ledger list showed $0 / empty immediately after
  any reload or re-login, despite rows persisting in the DB.
- Criterion-completion state derived from a sale survived (it lives in the save
  doc's `done` map), which masked the loss — only the money display reset.

## Root cause

Two compounding gaps:
1. A store that is written but never read. When state is deliberately split so a
   slice lives outside the main document, that slice needs its OWN load path;
   excluding it from the document is only half the design.
2. A rehydrate action that RESETS a slice it does not itself populate. `HYDRATE`
   cleared `ledger` to `[]` (right, for a fresh session boundary) but nothing
   filled it afterward — so the clear was the whole story.

## Solution

Add an explicit, capped read-back and a separate action to apply it:

```ts
// sync: a ranged, capped, own-rows read of the side table
async function loadLedger(profileId) {
  const { data } = await db.from("fp_ledger")
    .select("id, kind, payer, amount_cents, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(200);                       // cap: PostgREST silently truncates large reads
  return (data ?? []).map(toLedgerEntry);
}

// hydrate flow: load BOTH, then apply
const [save, ledger] = await Promise.all([loadSave(pid), loadLedger(pid)]);
dispatch({ type: "HYDRATE", doc: save.doc });   // still clears ledger:[]
dispatch({ type: "SET_LEDGER", rows: ledger }); // ...then fills it from the server
```

Guard against re-inserting the just-loaded rows: seed the "known ledger ids" set
from the loaded rows so the write-subscription only inserts genuinely new local
rows (the DB insert is also id-idempotent as a backstop).

## Prevention

- **When you split state so a slice lives outside the main persisted document,
  give that slice its own read-back path at the same time you give it a write
  path.** "It's excluded from the save doc" is not persistence — it's half of it.
- **Any rehydrate/HYDRATE action must be audited slice by slice: for each slice,
  what fills it after the reset?** A slice that HYDRATE clears but nothing
  repopulates is a silent data-drop. (Companion to the shared-device reset
  learning, where the danger was the opposite — a slice NOT cleared.)
- **Test the round-trip, not just the write.** A write-only slice looks fully
  working in write + replay tests; only a "persist, reload, assert it's still
  there" test catches a missing read path. Add that test for every persisted
  slice.
- Cap ranged reads of an append-only table (PostgREST truncates silently ~1000
  rows); decide the display cap and the aggregate strategy explicitly.
