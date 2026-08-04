# ce:review run — Unit 1 (fp_task_feedback), branch feat/fp-task-feedback @ a74c7ec [T120]

Mode: autofix (per-unit pipeline). Team: correctness, testing, maintainability,
project-standards, security, data-migrations, adversarial, kieran-typescript,
agent-native, learnings-researcher, deployment-verification (11).

## Synthesized findings → routing

| # | Sev | Finding | Reviewers | Route |
|---|-----|---------|-----------|-------|
| 1 | P1 | Cap trigger fires before RLS WITH CHECK → cross-profile existence/cap oracle | security | fixed (ownership pre-check, silent pass) |
| 2 | P1 | Append-only guard raises on CASCADE delete from JWT-less sessions → can block profile deletion | correctness | fixed (JWT-less allowance) |
| 3 | P1 | Cap raise = P0001 → client contract terminal-drops a legit cross-device 51st report silently | adversarial | fixed (errcode FP429 + honest-drop client contract) |
| 4 | P1 | First-tap FK race (23503) vs profile provisioning → terminal-drop of first report | adversarial | fixed (23503 = retryable-park added to client contract; Unit 2 must implement) |
| 5 | P2 | Parity test doesn't pin day-window predicate | testing, data-migrations, adversarial | fixed (assertion added) |
| 6 | P2 | Parity test doesn't pin lock-BEFORE-count ordering | adversarial | fixed (index-ordering assertion) |
| 7 | P2/P3 | service_role exemption in cap guard untested; UTC anchor missing on date_trunc | testing, correctness, data-migrations | fixed (UTC anchor + assertions) |
| 8 | P2 | UUID collision indistinguishable from idempotent retry | adversarial | contract note (client must use crypto.randomUUID); Unit 2 |
| 9 | must-fix | Owner read + retention purge exist only as SQL comments (repo convention = scripts/) | agent-native | fixed (read-fp-task-feedback.ts, purge-fp-task-feedback.ts) |
| 10 | P3 adv | Parity-regex maintenance cost (pre-existing deliberate pattern) | maintainability | advisory, no action |

Suppressed: kieran-ts P3 @0.35 (below gate). Learnings-researcher: no documented
mistake repeated; FOR UPDATE deviation validated as correct.

## Carried into Unit 2 (client contract additions)
- FP429 → honest "could not send" UI outcome (never park, never silent).
- 23503 on fp_task_feedback → retryable-park.
- ids minted with crypto.randomUUID().
- Wire fp-task-feedback-rules predicates at the enqueue boundary (guard-function-with-no-callers).

## Deployment checklist (apply gate)
Full Go/No-Go checklist produced by deployment-verification (pre-apply slot check
against live schema_migrations; post-apply SQL verification of columns/CHECKs/
policy/grant/triggers/index; live RLS probes 3a-3f incl. Prefer:return=minimal
contract; PostgREST schema reload + verification; rollback = pure leaf drop;
cohort-days monitoring queries). Preserved in the task output and to be re-read
at the Phase A apply step. NOTE: probe 3d (51-row cap) pollutes the day's count —
use a disposable profile, then service-role cleanup.

## Residual / operational (not code)
- Version slot 20260905120000 must be reconfirmed vs LIVE ledger at apply time.
- Purge cadence is human-run (now scripted); track quarterly.
- Live RLS probes deferred to apply gate by repo convention (no test DB).
