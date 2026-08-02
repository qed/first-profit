---
module: sync
tags: [postgrest, supabase, migration, deploy-ordering, schema-cache, outbox, data-loss, error-classification]
problem_type: integration_issue
---

# Additive column + code that writes it: a missing-column error classifies TERMINAL and DROPS the row — park it, and order the deploy

## Problem

Adding nullable columns to a table (`fp_ledger` gained `gross_cents/fee_cents/
net_cents/provider_id`) is a safe additive migration. The trap is the CODE that starts
writing them. The insert now UNCONDITIONALLY names the new columns:

```ts
await db.from("fp_ledger").insert({ ..., gross_cents, fee_cents, net_cents, provider_id });
```

If that code reaches production before the migration is applied — **or during the
PostgREST schema-cache reload window right after it applies** (PostgREST caches the
schema; a freshly-added column is invisible until it reloads) — the insert fails with
`PGRST204` ("could not find the 'gross_cents' column in the schema cache") or `42703`
(undefined_column).

The silent killer is the ERROR CLASSIFIER. A durable-write outbox classifies known
transient codes as retryable and everything else as **terminal → drop**. `PGRST204`/
`42703` weren't in the retryable set, so they hit the "unknown code -> terminal"
default -> the row is **dropped from the outbox and lost forever**, not retried. A
real kid sale logged in that window silently vanishes — the exact opposite of the
outbox's "keep and replay" guarantee.

## Symptoms

- A brief window after a schema deploy where writes fail with `PGRST204`/`42703`.
- Rows written in that window never appear — and never replay — because the outbox
  treated the transient schema-cache miss as a permanent failure and dropped them.

## Solution

1. **Classify missing-column errors as RETRYABLE (park), not terminal (drop).**
   ```ts
   const MISSING_COLUMN_CODES = new Set(["PGRST204", "42703"]);
   if (MISSING_COLUMN_CODES.has(code)) return { ok:false, reason:"retryable" }; // -> keep/park
   ```
   The row parks in the outbox and replays once the column (and the reloaded schema
   cache) are live. A missing column is transient during a deploy, not a permanent
   defect.
2. **Pin the deploy ordering explicitly** (in the migration header AND the plan): apply
   the migration, force a PostgREST schema reload (`NOTIFY pgrst, 'reload schema'` /
   restart), verify the columns are queryable, THEN ship the code that writes them.
3. **Bound/validate the new columns while you're in the migration.** Child-inserted
   columns aren't covered by an RLS `WITH CHECK` that only pins other columns; add a
   NULL-tolerant coherence CHECK (`gross = fee + net`, `gross = amount_cents`,
   non-negatives) so the ledger stays internally consistent and a derived column can't
   be used to bypass a cap on the original column. Add a length bound on free-text
   columns (`provider_id <= 64`) matching the table's other bounds.

## Why This Works

The classifier is the last line of defense for an at-least-once outbox. If a transient
schema-propagation error is labeled terminal, the queue's whole purpose (survive a
temporary failure, replay later) is defeated for exactly the rows written during a
deploy. Parking them turns a deploy-timing slip from silent data loss into a
self-healing delay. The explicit ordering removes the window entirely for the planned
path; the retryable classification covers the unplanned one.

## Prevention

- **Whenever code begins writing a newly-added column, do BOTH: order the migration+
  schema-reload before the write code deploys, AND make the missing-column error
  retryable.** Either alone leaves a data-loss window (ordering can still be raced by
  the schema-cache reload; retryable alone risks a long outbox backlog).
- **Audit your write-error classifier's DEFAULT.** "Unknown code -> terminal -> drop"
  is dangerous next to a schema change; enumerate the transient DB/PostgREST codes
  (`PGRST204`, `42703`, and the connectivity/timeout family) as retryable.
- **A safe additive migration can still cause data loss through the writer.** The
  migration's safety (nullable, no rewrite) says nothing about the code that starts
  populating it. Review the two together.
- **Test the park:** assert an insert failing with `PGRST204` KEEPS (parks), does not
  drop.
