# ce:review run — Phase 3: whole-branch seam review (both repos)

Date: 2026-08-03 · Scope: first-profit feat/real-public-site (Units 3-7) + the120 feat/fp-public-site (Units 1-2, 7) vs main
Plan: docs/plans/2026-08-03-002-feat-real-public-site-plan.md

## Reviewers (2 adversarial seam reviewers, one per repo, cross-repo probes in both)

## Verdict: Ready for PR (all 5 seam findings fixed; both suites green)

## Seam findings → all FIXED
- P2 (t120 0.78): TS sanitize re-check ran on the RPC's ALREADY-TRUNCATED output — 'proven methodology' cut at char 120 got blanked by the "idempotent belt-and-suspenders" the SQL layer (raw-value check) correctly preserved. Fixed: redundant call removed, SQL extraction is the single enforcement point; boundary-cut regression tests.
- P2 (fp 0.72): room showed raw typed headline forever while the public page showed default copy (server stored-empty) and room copy claimed parity. Fixed cross-repo: self-read returns own-row projected {headline, oneLiner}; room shows a kid-friendly note on divergence; copy softened.
- P2 (fp 0.75): stuck-'claimed' accounts (parked completion flush) had no nudge back to the retry surface. Fixed: coach one-shot hint extended to 'claimed' with finish-your-page copy.
- P2 (cross-repo 0.68): the plan's production-scoped Cedric test option would show ALL children the claim UI while non-allowlisted claims 401 as retry-inviting 'outage'. Fixed in docs: preview path REQUIRED; production-scoped alternative struck with rationale in checklist, runbook, and plan.
- P3 (fp 0.62): already-claimed race flashed a fabricated firstName-slug handle on the reveal. Fixed: refresh awaited before the continuation; ordering pinned.

## Residuals recorded
- Terminal-drop cross-session edit loss: in-memory flag resets, hydrate re-bases on server truth (no false publish), the dropped edit is silently gone — now an explicit accepted residual in the plan's Known-bounded-staleness paragraph.
- Self-read is deliberately ungated (own-row only) during allowlist windows — documented for operators.
- Publish crash-window reconciliation remains manual (accepted, documented).

## Final verification
first-profit: 53 files / 1023 tests, tsc clean, build passes. the120: 214 files / 5164 passed + 4 todo, tsc clean.
Contract pins re-verified against the120 HEAD (incl. the new projected field). Reserved list (48) byte-set-equal across the120 seed/TS/parity and first-profit reservedHandles/vercel.json/test.
