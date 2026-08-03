# ce:review run — Unit 1: fp_public_sites migration (the120)

Date: 2026-08-03 · Mode: autofix (feature-pipeline: fix-all-real-findings) · Scope: staged Unit 1 diff in 120-The120-wt-public-site (feat/fp-public-site vs origin/main)
Plan: docs/plans/2026-08-03-002-feat-real-public-site-plan.md

## Reviewers (12)
correctness, testing, maintainability, project-standards, agent-native, learnings-researcher (always-on); security, data-migrations, performance, adversarial, kieran-typescript, deployment-verification (conditional).

## Verdict: Ready (all findings fixed)

## Findings → all FIXED
1. P1 perf — trigger lacked EXISTS short-circuit before jsonb extraction (every save paid full parse). Fixed: index-backed early exit, ordering pinned by test.
2. P2 — EXCEPTION handler swallowed silently. Fixed: `raise warning` per fp_save_doc_guard idiom; never-FAIL still pinned.
3. P2 — unconditional UPDATE churned tuples every save. Fixed: IS DISTINCT FROM guard.
4. P2 — guard tail-append can make out-of-bounds activeIdea in-bounds (projects grafted OLD idea). Accepted-by-design, now documented + test-pinned.
5. P2 — live-DB-only plan scenarios not named as deferred. Fixed: it.todo entries mapped to POST-APPLY steps.
6. P2 — no executable TS spec of extraction. Fixed: extractSiteContent() + 7 behavioral tests (guardSaveDocUpdate precedent).
7. P3 — no POST-APPLY VERIFICATION header. Fixed: 7-step probe section, test-pinned.
8. P3 — btrim vs .trim() parity. Fixed: documented fails-closed acceptance in both layers, test-pinned.
9. P3 — false claim that 1e3 is rejected (jsonb normalizes to 1000, accepted-then-bounds-checked). Fixed: test asserts true behavior.
10. Structural — added CHECK (not published or first_published_at is not null); reserved seed count pinned at 46.

## Residual (accepted / deferred)
- Live-DB behavior (trigger execution, grants-in-catalog, anon RPC probes) verified only at apply time — POST-APPLY VERIFICATION section is the gate before Units 2/3 ship.
- erase-family-core.ts does not yet delete the site row (RESTRICT will strand erases loudly once real claims exist) — assigned to Unit 2; migration header documents.
- fp_public_sites has no CAS column; trigger vs Unit 2 backfill is last-writer-wins with next-save self-correction — re-examine at Unit 2 review.
- Pre-existing upstream tsc errors in fp-save-doc-guard-rules.test.ts (on origin/main) — separate upstream fix.

## Deployment
Full Go/No-Go checklist produced (deployment-verification agent) — attach to the120 PR. Key gates: confirm live migration-ledger top before apply; NOTIFY pgrst; 3-trigger presence/timing query; has_function_privilege probes; three-state anon RPC probe; save-path latency baseline ±24h watch.

Verification after fixes: full the120 suite 5065 passed + 4 todo (208 files); eslint clean; tsc clean (excl. pre-existing upstream); migration re-parsed with libpg-query.
