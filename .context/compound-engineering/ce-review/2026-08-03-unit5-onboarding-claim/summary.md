# ce:review run — Unit 5: onboarding claim + completion publish

Date: 2026-08-03 · Mode: autofix (fix-all-real-findings) · Scope: screens.tsx, Onboarding.tsx, handleRules.ts + tests on feat/real-public-site
Plan: docs/plans/2026-08-03-002-feat-real-public-site-plan.md

## Reviewers (5): correctness, julik-races, security, kieran-typescript, standards+learnings

## Verdict: Ready (all findings fixed)

## Findings → all FIXED
- P1 (races 0.82): completion finally dispatched SET_ONBOARDING_COMPLETE/SET_STAGE app unguarded — logout mid-flight resurrected the app view. Fixed: GameApi.getSessionGen() + generation-guarded finally; negative-assertion test.
- P1 (correctness 0.60): setTimeout(0) yield didn't guarantee the engine saw the CREATE_IDEA snapshot before flushNow's fast path. Fixed: flushNow() synchronously pushes notifySnapshotChange() before flushPending; ordering + snapshot-content tests; yield kept for stateRef currency with the split documented.
- P2 (security 0.62): full curated slur/profanity list shipped in the kids' client bundle, unconditionally imported. Fixed: handleRules.ts is format-only; R23 inline UX rides server verdicts (availability 'invalid' as-you-type + claim 'invalid' refusal). Compounded as a best-practice doc.
- P2 (races 0.68): input + suggestion chips stayed active mid-claim. Fixed: disabled={claiming} on both.
- P2 (kieran 0.68): resize test was a no-op — replaced with a real unmount/remount-mid-claim test; comment states Onboarding has no viewport-conditional mounts.
- P2 (kieran 0.66): checkSeqRef guard untested — out-of-order deferred-promise test added.
- P3s: seq bumped on all effect runs incl. early returns (+ no-AbortController residual comment); fake-timer conversion for debounce tests; flag-off-with-populated-slice test; parked→reveal 'going live…' end-to-end test; 390px-pass provenance note in the test header.

## Clean passes
Standards: mobile classes verified in code (44px chips, min-w-0 input, wrap); screens pure; no new tiers; pb-80 untouched; ob rules preserved. Learnings: idempotency ref, breakpoint lesson, echo-the-server, fire-and-forget outcome doc — all compliant with evidence.

## Accepted residuals
- No AbortController on availability fetches (seq guard + unmount gating suffice at this scale; commented).
- publishSite may still fire once into a bumped generation before the finally guard — provider-level generation guard makes it inert (documented judgment call).
- 390px LIVE preview re-check remains a Unit 7 gate item (local harness pass done 2026-08-03).

Verification after fixes: 978/978 green (52 files); tsc clean; build passes; eslint clean.
Compound: docs/solutions/best-practices/client-mirrors-format-rules-never-the-moderation-corpus-2026-08-03.md.
