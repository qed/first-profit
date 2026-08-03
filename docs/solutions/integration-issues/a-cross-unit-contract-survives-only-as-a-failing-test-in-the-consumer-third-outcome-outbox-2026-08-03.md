---
title: "A cross-unit contract survives only as a failing test in the consumer: the outbox's third outcome (FP429 capped) and the dropped 23503 carry-over"
module: fp-sync
date: 2026-08-03
problem_type: integration_issue
component: background_job
severity: high
symptoms:
  - "The server's custom cap errcode (FP429) fell through the outbox classifier's default terminal-drop branch: a legitimately capped child saw the generic could-not-send message instead of the honest capped copy that already existed in the UI"
  - "23503 (the first-tap profile-provisioning race) stayed in TERMINAL_CODES: a brand-new child's first stuck report would be silently discarded instead of parked and retried"
  - "Both requirements were written down in the producing unit's review artifact and still absent from the consuming unit's code"
root_cause: missing_workflow_step
resolution_type: code_fix
tags: [outbox, error-classification, fp429, 23503, cross-repo, contract, parity-test, third-outcome, sync]
---

# A cross-unit contract survives only as a failing test in the consumer — the outbox's third outcome

## Problem

Unit 1's review (fp_task_feedback, The120) changed the client contract: the
daily-cap trigger raises custom SQLSTATE `FP429` (honest "capped" outcome,
never park, never silent-drop) and `23503` must park as retryable (provisioning
race). Unit 2 (the SPA outbox client) was built in parallel by an agent that
never saw the change — and shipped with FP429 unclassified (fell to
terminal-drop) and 23503 still terminal. The contract existed in prose (review
summary, migration header) and nowhere in the consumer's tests, so nothing
failed.

## Symptoms

See frontmatter. The near-miss was invisible in every green test run: 533
tests passed around a wrong contract.

## What Didn't Work

- Carrying the contract as prose: the migration's CLIENT CONTRACT NOTES and the
  review artifact both stated the rules precisely; the consuming builder still
  missed them because nothing red pointed at the gap.
- Relying on the default branch being "accidentally right": unrecognized codes
  → terminal happened to be non-silent for FP429, but it showed the WRONG
  message and would break silently if the default ever changed.

## Solution

1. **Classify the third outcome explicitly**: the write-error classifier gets a
   named `capped` reason for `FEEDBACK_CAP_ERRCODE = "FP429"`; the outcome
   flows to the UI's existing capped copy; the entry is resolved (not parked);
   and the server's verdict is ADOPTED locally (`adoptServerFeedbackCap` pins
   the day counter to the cap) so the client's mirror re-syncs with reality.
   An outbox has three outcomes, not two: delivered, parked-retryable, and
   REFUSED-BUT-LEGITIMATE — the third needs its own code, copy, and handling.
2. **Park the provisioning race**: `23503` is retryable for the feedback kind
   (scoped override; the ledger's classification untouched).
3. **Pin the contract in the consumer**: a parity test in first-profit hardcodes
   the mirrored constants (`FP429`, cap 50, body 1000, task-id regex source,
   band list) with a comment naming The120's rules module as the counterpart —
   the next contract drift is a red test, not a prose archaeology exercise.

## Why This Works

A contract between units (or repos) has no enforcement surface until the
CONSUMER carries a test that fails when the contract is violated. Prose travels
by luck; a red test travels by construction. And modeling "the server said no,
correctly" as its own outcome keeps the client honest in exactly the situations
(cross-device caps, local-mirror desync) where the local state cannot know the
truth — plus adopting the server's verdict repairs the mirror instead of
letting it keep lying.

## Prevention

- When a review changes a contract another in-flight unit consumes, the
  carry-over is not the prose note — it is a FAILING TEST added to the
  consumer's suite (or the consumer's builder prompt updated AND the reviewer
  told to verify). Check both ends at the seam review.
- Every outbox/queue classifier: enumerate the third outcome explicitly. If a
  refusal can be legitimate (caps, quotas, rate limits), the UI needs distinct
  honest copy and the local mirror needs to adopt the server's verdict.
- Mirrored cross-repo constants get a parity test in EACH repo, pinning
  literals with a pointer at the counterpart file.
- Related: The120's
  `docs/solutions/security-issues/before-row-trigger-fires-before-rls-with-check-gate-on-ownership-and-exempt-jwt-less-sessions-2026-08-03.md`
  (the producing unit's half of this same review cycle) and
  `docs/solutions/integration-issues/additive-column-plus-unconditional-write-a-missing-column-error-classifies-terminal-and-drops-the-row-park-it-2026-08-02.md`
  (the park-vs-drop discipline this extends).
