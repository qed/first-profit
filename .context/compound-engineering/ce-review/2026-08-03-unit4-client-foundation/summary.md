# ce:review run — Unit 4: FP client foundation

Date: 2026-08-03 · Mode: autofix (fix-all-real-findings) · Scope: src/lib/auth.ts, config, gameCore site slice, GameContext, sync.ts FlushOutcome + tests, on feat/real-public-site
Plan: docs/plans/2026-08-03-002-feat-real-public-site-plan.md

## Reviewers (6): correctness, julik-races, security, api-contract, kieran-typescript, standards+learnings

## Verdict: Ready (all findings fixed)

## Findings → all FIXED
- P0 (races 0.85): flushPending reentrancy — concurrent flushNow vs debounce timer read a false 'landed' mid-flight. Fixed: in-flight promise memoization + own re-reading pass; 3 deferred-mock interleaving tests.
- P1 (correctness 0.85): terminal drop cleared the outbox → later quiet-queue flushNow read 'landed' for never-landed content. Fixed: sticky terminalDropped flag; parked until content truly lands; tested through the full cycle.
- P1 (races 0.72): same-session out-of-order refreshes — stale 'none' could overwrite fresh 'published'. Fixed: per-call sequence counter beside the session-generation guard; out-of-order test.
- P2 (api-contract 0.62): flag-off/no-session/transport/server all collapsed into reason:"outage". Fixed: client-local optional `cause` diagnostic (never on the wire); asserted per branch.
- P3s: !profileId branch test; flushNow gen-guard exemption comment; publishSiteNow pre-await handle capture.

## Clean passes
Security: no findings (gen guards verified on all handlers; RESET_SESSION clears slice; UNION_REMOTE can't touch it; flag-off = zero network + zero session reads; no weakened prior assertions). Standards: SaveDoc untouched (docVersion 1, injected `site` key stripped by fromSaveDoc — tested); engine ref private; contract pins verified BYTE-FOR-BYTE against the120 c9226bb.

## Carry-forwards (MUST-LAND, per the ledger-read-back precedent)
- Unit 5: useRef CTA in-flight guard on claim submit; suggestions[] via React escaping only; publish gate honors sticky-parked after terminal drop (not-live-yet state).
- Unit 6: wire the room-open refreshSiteStatus() call (the deferred half of the split-storage read-back).
- Cross-repo pins are manual-sync (verified at c9226bb); re-verify at whole-branch review.

Verification after fixes: 929/929 green (51 files); tsc clean; build passes; eslint clean.
Compound: docs/solutions/logic-errors/returning-an-outcome-from-a-fire-and-forget-api-*.md.
