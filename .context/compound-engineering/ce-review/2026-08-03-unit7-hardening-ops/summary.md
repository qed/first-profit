# ce:review run — Unit 7: hardening, ops, launch checklist

Date: 2026-08-03 · Mode: autofix (fix-all-real-findings) · Scope: docs/config/tests in BOTH repos (uncommitted)
Plan: docs/plans/2026-08-03-002-feat-real-public-site-plan.md

## Reviewers (2, verification-focused): adversarial-docs, standards-parity

## Verdict: Ready (all findings fixed)

## Findings → all FIXED
- P1 (0.92): the120 runbook claimed parent /fp/family republish "re-syncs content and re-sends the notification" — FALSE (parent path flips only `published`; resync + email belong to the CHILD publish endpoint). Docs corrected in both repos; launch-checklist E2E step now names the actor per leg; NEW pinning test in the120: parent republish sends no email, touches no content (suite 5160→5161).
- P2 (0.85): second placeholder handle 'their-name' (Landing STEPS copy) unreserved — reserved at all six points (seed 48, RESERVED_HANDLES, parity test, reservedHandles.ts, vercel.json, config test).
- P2 (0.78): R20 amendment overstated first_name enforcement — corrected: headline/one_liner only are clamped+blocklisted at the shared extraction; first_name is verbatim roster data bounded by an 80-char REJECTING CHECK, screened only by whatever signup validation exists.
- P3: launch checklist claimed parity with api/site.ts's 9-item preview list while listing 10 — client-IP item added to the code comment; lists in lockstep (10/10).
- Naming: checklist renamed to docs/plans/2026-08-03-003-launch-checklist.md (unique daily sequence); cross-refs updated; plan Unit 7 links forward.

## Unit deliverables (recap)
R20 exposure record re-check entry (new anon RPC surface, serving-function consumer, deleter-gap CLOSED, accepted residuals); your-name + their-name reserved everywhere (parity-tested 48); env docs (.env.example VITE flag warning; the120 runbook for FP_SITE_TEST_ONLY/ALLOWLIST, fp:site-lock, crash-window reconciliation, migration deploy order); the ordered launch runbook with DONE-BY-CODE vs OPERATOR-ACTION labels and rollback tiers.

## Compound pass
Run; no new doc emitted. Rationale: the actor-asymmetry lesson is pinned as a test + corrected operational docs (stronger than prose); the "runbook claims must be verified against shipped behavior" lesson is generic; the planned serving-layer solution doc remains deferred to post-live-preview per plan.

## Verification after fixes
the120: 214 files, 5161 passed + 4 todo. first-profit: 53 files, 1015 passed; tsc exit 0.
