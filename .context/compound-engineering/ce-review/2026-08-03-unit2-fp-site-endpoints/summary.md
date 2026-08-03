# ce:review run — Unit 2: fp site endpoints (the120)

Date: 2026-08-03 · Mode: autofix (fix-all-real-findings) · Scope: Unit 2 staged diff (feat/fp-public-site vs 07b710e), 26→32 files
Plan: docs/plans/2026-08-03-002-feat-real-public-site-plan.md

## Reviewers (12 + round-2 adversarial verify)
correctness, testing, maintainability, project-standards, agent-native, learnings-researcher, security, api-contract, reliability, adversarial, data-migrations, kieran-typescript.

## Verdict: Ready (2 fix rounds, all real findings fixed)

## Round 1 → FIXED
- CRITICAL (adversarial 0.85): projection trigger republished RAW un-blocklisted content over live pages — the only post-publish content path had no blocklist. Fixed structurally: fp_blocked_terms + fold + clamp INSIDE the shared SQL extraction (trigger/backfill/resync all inherit); TS spec mirrors; parity-tested.
- P1 (adversarial 0.80): double parent-email race — publish UPDATE was not a CAS on published=false. Fixed: transition CAS owns the email; refresh arm for already-published.
- P1 (testing 0.85 ×2): outage branches untested (fault machinery unused); availability/publish routes had zero route tests. Fixed: full fault-injection + 2 new route suites.
- P2: missing docVersion gate in claim/publish extraction (fixed); outage contract dead-on-the-wire (routes now serialize 200 {reason:"outage"}); notifyParent throw path lost R21 email silently (try/catch → attention flag); erase-family lock-read error unchecked + untyped (fixed + 4 new tests incl. RESTRICT-proven ordering); statusOf duplicated deriveSiteStatus (deduped); blocklist bypass via zero-width/NFKC (fixed) and scunthorpe false positives meth/retardant (word-class curation); parent unpublish action had ZERO callers while the R21 email links /fp/family (FamilySites section wired into the real page); gateway header honesty; email copy softened to enforced truth.
- P0-adjacent process finding: adversarial probe confirmed deriveSiteStatus ⟷ SQL RPC state parity; constraint-name sniffing verified against real + fake names.

## Round 2 → FIXED
- P1: cross-word-join false positives ('Sushi Tempura'→'shit', 'Bass Hole Lures'→'asshole') — space-preserving fold in TS+SQL, phrase forms for multi-word terms, 'cunt' moved to word class (within-token Scunthorpe), innocent cases regression-pinned.
- P2 accepted+documented: crash window between publish CAS and notifyParent (no outbox at this scale; ops reconciliation query documented in migration POST-APPLY notes).

## Designed behaviors confirmed (not bugs)
- Child publish endpoint CAN reverse a parent unpublish and re-notifies — plan-designed; comment in publishSite; Unit 6 must never AUTO-retry publish while status=offline.
- Erase releases operator-locked handles (data-rights outrank lock), loudly logged + order-marked; plan's "never silently freed" satisfied; policy divergence from the stronger Open-Questions wording flagged for the human at PR review.
- Parent notification bypasses suppression (R21 safety net) — documented.

## Carry-forwards
- Unit 4 MUST open with consumer-side contract-pinning tests against the route-header contracts (cross-unit-contract lesson).
- Unit 6: no auto-retry publish when offline; one-liner tracks active idea copy note.
- Unit 7: R20 exposure-record amendment (add re-check entry: new anon RPC + FK; deleter-gap closure), .env docs (FP_SITE_TEST_ONLY / FP_SITE_TEST_ALLOWLIST), CLI runbook pointer (fp:site-lock), 20260908 CHECK re-add lock caution on large crm_audit_log.
- Co-parent limitation: invited co-parent cannot toggle site (children.parent_id ownership) — v1 accepted, documented in page comment.

Verification after fixes: 5164 tests (5160+4 todo) 214 files green; eslint clean; tsc clean (excl. 2 pre-existing upstream); next build succeeds; migration parses (33 stmts).
Compound: docs/solutions/security-issues/content-safety-must-live-at-the-lowest-shared-writer-*.md (the120).
