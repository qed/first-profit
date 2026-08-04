# ce:review — first-profit Slice A full-branch pass (2026-08-01)

Scope: branch `feat/fpv2-slice-a` vs base `53998a4` (the whole fpv2 Slice A SPA,
59 files / ~7,740 insertions). Mode: autofix, extended to fix real defects (not
just safe_auto) per the user's standing quality bar. Plan: explicit.

Reviewers (10): correctness, testing, maintainability, project-standards,
agent-native, learnings-researcher, security, adversarial, kieran-typescript,
julik-frontend-races. All returned; learnings-researcher confirmed the four
prior compound learnings are HONORED by the branch.

## Findings fixed (commit dad41ff + this commit)

- **P1 ledger never read back** (correctness): HYDRATE cleared `state.ledger` and
  no `select fp_ledger` existed, so earnings/ledger reset to $0 every
  reload/re-login. Added `loadLedger` (capped ranged own-rows select) + a
  `SET_LEDGER` action, wired into hydrate with a known-ids guard so loaded rows
  aren't re-inserted.
- **P1 sync `start()` teardown race** (julik + correctness + testing agree): a
  `stop()` landing mid-`start()` leaked listeners and replayed the outbox for a
  torn-down session. Generation/`stopped` re-checked after every await.
- **P1 poison-pill outbox jam** (adversarial): a malformed-but-versioned outbox
  entry retried forever, blocking all writes. `readOutbox` now validates ledger
  entry runtime shape and drops bad ones; `classifyWriteError` defaults an
  unrecognized DB error to terminal (drop), not retryable.
- **P2 malformed parked snapshot** (adversarial + kieran-ts): unvalidated doc was
  PATCHed then discarded on load = silent save loss. `readOutbox` now runs the
  parked doc through `fromSaveDoc` and discards on failure.
- **P2 StepRunner unbounded input** (adversarial): could exceed the 256KiB doc
  cap and kill all future saves. Added `maxLength` caps.
- **P2 coerceIdea leaf coercion** (kieran-ts): non-string field / non-boolean
  done leaves could reach `.trim()`/inputs. Now coerced.
- **P1 project-standards**: CLAUDE.md described the removed Next Step coach.
  Reconciled the Responsive architecture section to the shipped fpv2 floor.
- Cleanup: removed dead `SET_AVATAR`/`state.avatar` and the unused `onAuthChange`
  export.

Tests: 139 → 151 (+12). Build / lint / tsc all green.

## Accepted residuals (recorded, not fixed — pre-launch / larger scope)

- **Concurrent same-child multi-tab CAS clobber + cross-tab outbox race**
  (adversarial P2): two tabs for one child can lose the loser's doc-level edits
  (whole-doc last-write-wins, a deliberate Slice A decision) and, offline, race
  the shared localStorage outbox key with no cross-tab lock. A conflict UI /
  Web-Locks-based coordination is a Slice-B-scale feature; acceptable pre-launch
  (single-device is the norm), revisit before wide rollout.
- **Phase-data duplication** (maintainability P2, conf 0.8): the five-phase
  name/color dataset is copy-pasted across `data/path.ts`, `PodCardContent`,
  `Landing`, `Onboarding` and has already drifted (hex vs hsl). Plus `LogoMark`
  ×3 and two cents formatters. Real drift trap; deferred to a dedicated
  presentation-layer cleanup to avoid visual regressions mid-review.
- **No integration test wiring real sync+auth+draftCache together** (testing):
  each is unit-tested; the provider flow is tested with them mocked. A live
  end-to-end pass is the Unit 12 human gate.
- The keepalive PATCH puts a live access token (not refresh token) on the wire on
  every tab-hide — standard bearer usage, RLS is the gate (security: no finding).

## Verdict
Ready with fixes applied. Remaining before real users: the live-account gates in
the plan's Implementation Status + the accepted residuals above.
