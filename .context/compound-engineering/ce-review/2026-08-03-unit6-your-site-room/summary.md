# ce:review run — Unit 6: Your Site room + in-room claim

Date: 2026-08-03 · Mode: autofix (fix-all-real-findings) · Scope: YourSite.tsx, StepRunner.tsx, Factory.tsx, ClaimBlock extraction, siteCopy.ts, Landing.tsx + tests on feat/real-public-site
Plan: docs/plans/2026-08-03-002-feat-real-public-site-plan.md

## Reviewers (5): correctness, julik-races, security, kieran-typescript, standards+learnings

## Verdict: Ready (all findings fixed)

## Findings → all FIXED
- P0 (races 0.75): go-live effect published from a stale closure — an 'offline' flip mid-flush could auto-reverse a parent takedown. Fixed: siteStatusRef live re-check + cancellation flag; deferred-flush test pins publish NEVER fires after the flip.
- P1 (races 0.70): no effect cleanup — rapid close/reopen could fire overlapping publishes. Fixed both layers: cancelled-flag cleanup + publishInFlightRef memo in publishSiteNow (one network request for concurrent callers).
- P2 (correctness 0.62): slow room-open refresh could clobber a newer claim/publish status. Fixed: claimSite/publishSiteNow bump siteFetchSeqRef on dispatch, invalidating in-flight refreshes; two ordering tests.
- P2 (kieran 0.75): claim state machine duplicated ~100 lines + components→screens layer inversion. Fixed: src/lib/useClaimFlow.ts + src/components/claim/ClaimBlock.tsx; screens.tsx re-exports; ALL existing tests pass with zero edits.
- P3s: exhaustive roomViewFor(status) switch with never-guard; keyboard-inertness test on the disabled visit affordance; hint negative pins for claimed/offline/published; X-close-without-blur fallback documented + pinned (debounce covers, no data loss); unmount-safety comment in useClaimFlow.
- Docs: CLAUDE.md NextStepCoach paragraph updated (one-shot claim hint pre-emption); plan Unit 7 gains the 'your-name' reservation step (Landing mockup URL must never be claimable).

## Clean passes
Security: link built only from server-adopted handle with noopener noreferrer; offline affordance is a hrefless button; no innerHTML; flag-off byte-stable legacy room pinned. Standards: mobile gate (44px, no new tiers, RoomDialog restyles without unmount), pb-80 + coach positioning untouched, room open-state stays in reducer, content pipeline untouched. Learnings: all seven checked patterns followed with evidence.

## Accepted residuals
- 390px LIVE preview re-check remains the Unit 7 gate (local harness pass done for all five room states).
- Blur-as-commit best-effort; ✕-close path falls back to the 3s debounce (documented + pinned).
- Server-side stored-empty screening has no client-visible signal (child sees default copy on the public page) — plan-designed; noted for the whole-branch review.

Verification after fixes: 1015/1015 green (53 files); tsc clean; build passes; eslint clean.
Compound: docs/solutions/best-practices/cross-repo-render-boundary-caps-*.md.
