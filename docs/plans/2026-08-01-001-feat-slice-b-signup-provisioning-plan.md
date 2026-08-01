---
title: "feat: First Profit Slice B — Start Building signup + child provisioning"
type: feat
status: active
date: 2026-08-01
origin: docs/brainstorms/2026-07-31-fpv2-the120-accounts-requirements.md
deepened: 2026-08-01
---

# feat: First Profit Slice B — Start Building signup + child provisioning

**Target repos:** `[T120]` = `120-The120` (system of record), `[FP]` =
`first-profit` (the SPA). Slice A shipped to `main` in both. **Scope: full**
(real Workspace provisioning + full consent now), with the document-review gaps
fixed (see Plan Revisions).

## Overview

Build the parent-facing **Start Building** flow (R9-R17) plus parent emails
(R26-R28): a parent self-serves a real First Profit account on firstprofit.school
that populates The120 (parent auth + `parents` + `children`), sets the child's
credential OR requests a provisioned Google Workspace address, verifies their own
email in-flow, and passes a **verifiable parental-consent** step — after which the
child can log in and play. Payments stay mock (Phase 2/3 later).

## Brainstorm build decisions (2026-08-01)

- **Real Google Workspace provisioning, end to end** — compose The120's existing
  machinery, but the composition REQUIRES modifying `provision-deps` (see the
  consent-adapter decision below); it is not verbatim reuse. Credential-gated on
  `GOOGLE_WORKSPACE_SA_KEY`; the real `users.insert` stays GATED OFF for the whole
  build (lands at `pending`) and is flipped on only for one scripted acceptance run.
- **Full verifiable-parental-consent flow now** — a first-class, versioned consent
  record (net-new data model), method = email-plus + attestation (card-in-transaction
  deferred to Phase 2/3). Legal sign-off of the text is a launch gate.
- **Guarded test families in production** — `families.is_test=true`, determined
  SERVER-SIDE (out-of-band allowlist, never client input), affecting CRM/GTM
  visibility ONLY (never gating consent/verification). Close the gap that CRM reads
  don't honor `is_test`.

## Plan Revisions from document-review (2026-08-01)

The review found structural/security/compliance gaps; all are folded into the
units below. Load-bearing resolutions:

1. **Cross-origin session model (was unspecified / broken).** Reused `insertChild`
   runs under a cookie-bound same-origin `supabaseServer()` session that a
   cross-origin SPA cannot supply. **Resolution:** after email verification the SPA
   obtains a parent session via `signInWithPassword` (tokens returned in JSON, adopted
   by `setSession`); the cross-origin child-mint route builds a **per-request RLS
   client seeded with the parent's access token** (global `Authorization` header /
   `setSession`), NOT `supabaseServer()`. `insertChild` is ADAPTED to accept a
   token-scoped client. (Units 2, 4, 9.)
2. **Provisioning consent gate is dead under mock payments.** `driveProvisioning`'s
   `readAcceptedPolicyVersion` reads `deposits WHERE status='paid'` + `deposit_attempts`.
   **Resolution:** Unit 5 MODIFIES `provision-deps` to inject a consent adapter (and
   drive-entry gate) that reads `fp_parental_consent` instead of the deposit path.
   Stated as a modification, not composition; sequenced after Unit 3.
3. **Code-level launch gate (P0).** The public signup route rejects any signup not on
   the server-side test-family allowlist while in `is_test`-only mode; lifting the
   gate is a deliberate, separately-reviewed change. (Unit 2.)
4. **Parent-principal RLS audit moved FIRST** (was last). A new principal's audit
   gates its introduction. Now Unit 0 (before the migration and any parent session).
5. **Age/jurisdiction capture** (COPPA under-13 vs 13-16, GDPR-K): capture child DOB/
   age-band + parent-declared/IP jurisdiction at signup, stored with consent, so the
   differentiated logic has data. (Units 1, 8.)
6. **Consent record shape hedged for legal:** fixed columns + an extensible `jsonb`
   evidence blob, so legal-driven field changes don't force re-collection (additive-
   only can't cheaply revise a populated regulated table). Consent policy versions live
   in their OWN namespace, separate from the Stripe refund policy. (Unit 1.)
7. **Consent<->child binding:** bind consent to `(parent_id, signup_attempt_id)`;
   child creation verifies the consent's attempt-id matches the child being minted.
8. **R28 deletion is IMPLEMENTED + tested** (was doc-only): a service-role cleanup
   that executes the deletion order end-to-end for a test family, incl. suspending/
   deleting the Google mailbox. (Unit 6 build, Unit 11 run.)
9. **Bounded mailbox burn:** real `users.insert` gated off during the build; one
   scripted, logged acceptance run with a fixed count; test provisioning uses a
   segregated OU where possible; a written live-provisioning acceptance protocol.
   (Units 5, 11.)
10. **Unit 6 edits EXISTING production CRM reads** — enumerate every families/leads
    read, apply the exclusion via ONE shared helper, and assert real-lead counts
    unchanged (guard the false-negative). Its own review.
11. **Cross-repo deploy order:** [T120] backend ships first (backward-compatible,
    unreferenced), verified live; the [FP] Landing CTA repoint (Unit 7/10) is the LAST
    cutover, behind a flag if possible — no half-live window.
12. **Smaller fixes:** step-token/abuse table settled before Unit 1's schema (R16);
    `is_test` set via a post-`parents`-insert service-role UPDATE on the trigger-owned
    `families` row; test-family email verification uses a server-side confirm restricted
    to `is_test` rows (never a general bypass); `funnel_resume_tokens` reused only as the
    token store/CAS + `funnel_rate_events` with a NEW non-session-minting redeem;
    `ensurePlayerProfile` precondition (`path_student_profiles` child->user row) created
    in Unit 4; Unit 7 refactors screens 2-5 to take navigation/profile via props (not
    just a file move); account-enumeration `existing_account` signal accepted as a
    documented tradeoff; correct file path is `src/state/gameCore.ts` and `signup`
    stays out of `isLoggedInStage`.

## Requirements Trace

R9 (one-sitting self-serve create), R10 (idempotent/resumable, existing-parent
attach), R11 (in-flow parent email verification), R12 (child credential paths a/b),
R13 (provision timing + exception), R14 (5-screen UI), R15 (consent gate), R16
(rate-limited/abuse-protected + step tokens), R17 (CRM ingestion), R26 (recap),
R27 (digest), R28 (data rights/deletion).

## Scope Boundaries

- Payments stay mock (so consent method = email-plus + attestation now).
- No public launch / no outside families — enforced by a CODE-LEVEL test-family gate,
  not just posture.
- Reuse The120 funnel primitives, adapting where the cross-origin/mock-payment context
  requires (session client, consent adapter) — do not fork account/child/family create.
- Real `users.insert` gated off for the build except one scripted acceptance run.

## Context & Research

### Reuse (adapting where noted) — [T120]
- **Parent account:** `app/lib/funnel/account.ts` `provisionOrRecognizeAccount`
  (`admin.createUser` `email_confirm:true`, `email_exists→existing_account` never a
  session, inserts `parents`, `cleanupAccount` compensation). Reused as-is.
- **Child row:** `app/lib/funnel/children-core.ts` `insertChild` — ADAPTED to accept a
  parent-token-scoped RLS client (see Revision 1). Also create the
  `path_student_profiles` child->user row (ensurePlayerProfile precondition).
- **CRM:** `on_parent_created`/`parents_families_sync` trigger owns `families.parent_id`;
  `matchOrCreateLead` is select-then-branch NEVER upsert. `is_test` set by a post-insert
  service-role UPDATE on the trigger-created family.
- **Child auth (path a):** `.invalid` scheme + `validateStudentPassword` +
  `email_confirm:true`; `app/api/fp/login/{profile-core,profile-rules}.ts` (built for
  this).
- **Provisioning (path b):** `provision-{core,rules,deps,driver}.ts` +
  `funnel_student_provisioning` + `provision_lease` — MODIFY `provision-deps` consent
  adapter (Revision 2); add an FP-signup drive path + re-drive cron (close the
  arrival-only-drive gap); enumerate arrival-route enqueue responsibilities so the
  signup path reproduces the ready-to-drive signal.
- **Email verification:** reuse the `funnel_resume_tokens` token STORE (sha256-at-rest,
  redeem-CAS, TTL) + `funnel_rate_events` limiter + `app/lib/email.ts` (Resend) +
  `escapeHtml`, with a NEW redeem that verifies the inbox WITHOUT minting a session or
  funnel-routing. `auth-mail-guard.ts` default-deny (parent mail is external → passes).
- **CORS + pure-core pattern:** mirror `app/api/fp/login/*` (exact-origin allowlist,
  OPTIONS 204, tokens-in-JSON, one generic failure). `supabaseAdmin()` service-role;
  token-scoped per-request client for parent-RLS writes.
- **Test families:** `families.is_test` + `scripts/provision-path-family.ts`
  (`@test.the120.invalid`), server-side allowlist determination.

### Reuse (adapting) — [FP]
- Screens 2-5 + primitives in `src/screens/Onboarding.tsx` — extract primitives AND
  refactor the four screens to take navigation/advance + profile via props (decouple
  from `state.ob`/`SET_OB` and the onboarding-terminal dispatches). `Stage`/`Profile`/
  `SaveDoc` live in `src/state/gameCore.ts`; keep `signup` out of `isLoggedInStage`.
- `src/App.tsx` stage machine; `src/screens/Landing.tsx` CTA (repoint LAST, as cutover);
  `src/lib/auth.ts` `loginChild`+`setSession` template; provider `login()` adopts a
  session. Design tokens, no-em-dash, 390px gate, vitest pure-core pattern.

### Must-heed traps (docs/solutions/)
`admin.createUser` needs `email_confirm:true`; `signUp()` returns no session under real
confirmations (use `admin.createUser`, never assume a post-create session); no
cross-call transaction → compensate what THIS call created; RLS-zero-policies only safe
if the server bypasses PostgREST (state which client per table); migration lock (live
`schema_migrations` query, additive-only, Management API, next slot ≈ `20260829120000`
verify live); lease serializes the take not the run (fence writes on `lease_owner`),
claim-before-spend, stamp-intent-before-Google-create (never-reissue); consent binds to
the exact rendered version (echo + refuse stale, parse-based compare); client idempotency
key ≠ double-submit guard; a guard with no callers is not a mechanism.

### External best-practice
- COPPA: bare checkbox ≠ verifiable; under-13 governed (13-16 policy choice); email-plus
  is internal-use-only and must pair with a second signal; store version+hash+method+
  identity+ip/ua+revocation; GDPR-K separate EU track.
- Workspace Admin SDK: SA + domain-wide delegation, `users.insert` (random pw +
  `changePasswordAtNextLogin`, dedicated OU), async eventual-consistency (poll
  `users.get`), 409=already-exists (reconcile), 429 backoff. Already implemented in
  `provision-deps.ts` (credential-gated).

## Key Technical Decisions

(See Plan Revisions above — each numbered resolution is a decision.) Additionally:
- **Signup endpoints are cross-origin route handlers importing pure cores**; parent-RLS
  writes use a per-request token-scoped client (not the cookie SSR client).
- **Consent = first-class table**, extensible jsonb evidence, own version namespace,
  bound to `(parent_id, signup_attempt_id)`, gates child minting, re-checks session
  freshness at the attest step.
- **The new parent principal is audited BEFORE it is introduced** (Unit 0).

## Open Questions

### Resolved during planning / review
- Real provisioning exists but needs a consent-adapter modification (Rev 2).
- Cross-origin parent session via signInWithPassword + token-scoped client (Rev 1).
- Consent method (email-plus + attestation), test-family determination (server-side),
  is_test enforcement (visibility only), deploy order (backend first, CTA last).
- Account-enumeration `existing_account` signal: accepted (industry-common), rate-limited.

### Deferred to implementation
- Exact schemas (consent, signup-attempt/step-token, any provisioning state addition).
- Final rate-limit thresholds per step/IP/email.
- Whether test provisioning writes to the production never-reissue ledger or a
  segregated namespace (decide in Unit 5 with ops).

### Dependency / needs ops (not code)
- `GOOGLE_WORKSPACE_SA_KEY` + domain-wide-delegation grants for the one real-provisioning
  acceptance run.
- Legal sign-off of the consent TEXT is a launch gate (schema is hedged via jsonb).

## Implementation Units

- [ ] **Unit 0: [T120] Parent-principal RLS reach audit (BEFORE any parent session)**
  **Requirements:** R20-analog. **Approach:** enumerate every `to authenticated` policy /
  grant a parent session (which HAS a `parents` row) can reach across the shared project
  (parents/children/deposits/families/CRM/path/fw/gauntlet); confirm cross-family
  isolation and no CRM/funnel over-reach; record accepted exposure + the required
  policies for the new tables Unit 1 adds. **Gate:** findings must be clean before Unit 1.
  **Test:** documented reach table + a probe with a throwaway parent session.

- [ ] **Unit 1: [T120] Consent + signup-state migration**
  **Requirements:** R15, R10, R16. **Files:** `supabase/migrations/<live-slot>_fp_signup.sql`.
  **Approach:** `fp_parental_consent` (parent_id, signup_attempt_id, child_id nullable-until-mint,
  policy_version [own namespace], policy_hash, rendered_text snapshot, method,
  child_dob/age_band, jurisdiction, parent_identity, ip, ua, `evidence jsonb`, revoked_at)
  + a `fp_signup_attempts`/step-token table (or documented reuse of `funnel_resume_tokens`
  store). RLS: service-role-only or narrow parent-scoped SELECT per Unit 0. Clone
  `20260827120000` per-command + WITH CHECK + column-scoped-grant discipline. **Query the
  LIVE `schema_migrations` first.** **GATE: applying mutates production schema — confirm
  before apply.** Post-apply checks.

- [ ] **Unit 2: [T120] Parent signup route + email verification + launch gate**
  **Requirements:** R9, R10, R11, R16, R17. **Files:** `app/api/fp/signup/{route,signup-rules,
  signup-core,__tests__/signup-rules.test}.ts`. **Approach:** CORS mirror of `/api/fp/login`;
  **code-level test-family gate** (reject non-allowlisted while is_test-only). Reuse
  `provisionOrRecognizeAccount`; `email_exists→existing_account` (accepted enumeration
  tradeoff, rate-limited). Issue an FP verification token (store reuse, NEW non-session
  redeem); send via Resend (escapeHtml); for `is_test` rows, server-side confirm restricted
  to test rows. Return parent session tokens in JSON on verified (Rev 1). Rate-limit
  (`funnel_rate_events` + login limiter) with defined per-step/IP/email thresholds.
  Idempotent/resumable (attempt row + `cleanupAccount` compensation). Post-insert
  service-role `is_test` UPDATE on the trigger-created family. **Tests:** rules; core
  (new/existing/verify/compensation/gate/is_test).

- [ ] **Unit 3: [T120] Consent record + gate**
  **Requirements:** R15. **Files:** `app/api/fp/signup/consent-{rules,core}.ts` (+ tests).
  **Approach:** render versioned+hashed policy snapshot; accept echoes version (refuse
  stale, `policyVersionAtLeast` per-namespace); re-check session freshness (just-verified
  parent); write `fp_parental_consent` bound to `(parent_id, signup_attempt_id)` with
  method/dob/jurisdiction/identity/ip/ua. Minting requires a valid verdict + attempt-id
  match. **Tests:** echo/refuse-stale; verdict; binding; freshness.

- [ ] **Unit 4: [T120] Child creation — path (a)**
  **Requirements:** R12(a), R9. **Files:** `app/api/fp/signup/child-core.ts` (+ tests).
  **Approach:** using the parent-token-scoped RLS client (Rev 1): `insertChild` (adapted) +
  child auth (`.invalid`, `validateStudentPassword`, `email_confirm:true`) + create the
  `path_student_profiles` child->user row + `ensurePlayerProfile` + save seed. Gated by
  Unit 3 (consent + attempt-id). Compensation on partial failure. **Tests:** happy path;
  consent-missing refusal; precondition row created; compensation.

- [ ] **Unit 5: [T120] Child provisioning — path (b), real Workspace (gated)**
  **Requirements:** R12(b), R13, R16. **Files:** MODIFY `provision-deps` consent adapter +
  drive gate (Rev 2); FP-signup drive path + re-drive cron; reproduce the arrival enqueue
  signal. **Approach:** ensure claim (idempotent on child_id), lease-fenced writes,
  stamp-intent-before-create, claim-before-spend; real `users.insert` GATED OFF (lands
  `pending`) except the acceptance run; exception→`notifyOps`; ready-notification email.
  **Execution note:** credential-gated; a written live-provisioning acceptance protocol
  (one family, expected 409/429/poll, cleanup) is the ONLY real-call exercise.
  **Tests:** claim idempotency, lease fencing, consent-adapter reads fp_parental_consent,
  pending-when-unconfigured, exception (mock deps).

- [ ] **Unit 6: [T120] Parent emails + is_test CRM exclusion + R28 cleanup**
  **Requirements:** R26, R27, R28. **Approach:** recap + digest via Resend/notify (escapeHtml,
  no em dashes); **enumerate every CRM/GTM families/leads read, apply exclusion via ONE
  shared helper, assert real-lead counts unchanged** (own review). Implement + test a
  service-role R28 cleanup executing the deletion order (ledger→saves→profile→child→parent)
  incl. Workspace suspend/delete. **Tests:** email content; is_test excluded + real counts
  unchanged; cleanup runs end-to-end on a test family; digest selection.

- [ ] **Unit 7: [FP] signup stage + shared-screen refactor**
  **Approach:** add `"signup"` to `Stage` (`src/state/gameCore.ts`), keep out of
  `isLoggedInStage`; extract pure primitives AND refactor screens 2-5 to take navigation/
  advance + profile via props (decouple from `state.ob`/onboarding-terminal dispatches).
  Do NOT repoint the Landing CTA yet (cutover is last). **Tests:** stage routing; shared
  screens render from props; existing Onboarding tests green.

- [ ] **Unit 8: [FP] Screen 1 + child-credential + consent + age UI**
  **Requirements:** R14, R12, R15. **Approach:** HQ parent-account form (name/email/password
  ≥8) + guardian note; child DOB/age-band + child-credential step (existing email+password
  OR provision toggle); consent step rendering the versioned snapshot + explicit attestation;
  jurisdiction capture. Signup-LOCAL state only. Pure validation module (tested);
  synchronous double-submit guard; no em dashes. **Tests:** validation; consent version
  echoed; transitions; age/jurisdiction captured.

- [ ] **Unit 9: [FP] Email-verify wait + signup API wiring + parent session adoption**
  **Requirements:** R9, R11. **Approach:** `src/lib/auth.ts` signup/verify/createChild
  mirroring `loginChild`; verify wait screen; on verified obtain the parent session
  (setSession from returned tokens) for the RLS child-mint call; on child-created adopt the
  child session via provider `login()`. Flat `{ok:false}` failures. **Tests:** auth fns
  (mock fetch+setSession); wait transitions.

- [ ] **Unit 10: [FP] Full flow assembly + mobile pass + CTA cutover**
  **Approach:** assemble screen 1 → verify → child-cred → consent → screens 2-5; progress
  bar from segment 1; 390px + desktop; no em dashes. **Repoint the Landing CTA to signup as
  the FINAL cutover** (behind a flag if available), after [T120] backend is verified live.
  **Tests:** full happy-path render; jsdom walk.

- [ ] **Unit 11: [T120+FP] E2E + confirmation audit + live-provision acceptance**
  **Approach:** full signup with guarded test families (both paths); the ONE scripted
  real-provisioning acceptance run (fixed count, logged); run the implemented R28 cleanup;
  confirm the Unit 0 parent-principal audit holds post-build; compensation/idempotency/
  double-submit stress; record learnings. **Test:** E2E checklist; RLS probes; cleanup
  verified.

## System-Wide Impact

- Every parent signup fires `on_parent_created` → a `families` CRM row (R17); test
  families set `is_test` (server-side) and CRM reads exclude it (shared helper, counts
  guarded).
- New parent principal audited FIRST (Unit 0), confirmed last (Unit 11).
- Real provisioning burns never-reissue names permanently — bounded to one acceptance run
  + segregated OU where possible.
- Cross-repo: [T120] backend deploys first (unreferenced/backward-compatible); [FP] CTA
  repoint is the last cutover — no half-live window. PRs cross-linked.
- Unit 6 mutates EXISTING production CRM reads — treated as a production-behavior change
  with its own review + count assertions.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Cross-origin route can't supply RLS parent session | signInWithPassword → token-scoped per-request client; adapt insertChild (Rev 1) |
| Provisioning consent gate dead under mock payments | modify provision-deps consent adapter to read fp_parental_consent (Rev 2) |
| Public endpoint used by non-test families | code-level test-family allowlist gate; lifting it is a separate reviewed change |
| Parent principal over-reach in shared DB | Unit 0 audit BEFORE the principal exists; explicit new-table policies |
| Migration breaks prod | live schema_migrations query, additive/idempotent, Management API, GATE before apply |
| Half-created/stranded parent + fired CRM trigger | admin.createUser + cleanupAccount compensation; on_parent_created is warning-wrapped |
| Forged/stale/replayed consent | versioned+hashed record, echo+refuse-stale, session-freshness, attempt-id binding |
| Age/jurisdiction can't be retrofitted | capture DOB/age-band + jurisdiction at signup now |
| Consent schema frozen before legal | fixed columns + jsonb evidence blob; own version namespace |
| Provisioning double-mints / burns ledger | claim-before-spend, lease fencing, stamp-intent, idempotent on child_id |
| Real Google call unverified until prod | build to pending; ONE scripted acceptance run w/ protocol + cleanup |
| is_test not honored / real leads dropped | one shared exclusion helper; assert real-lead counts unchanged |
| Non-atomic cross-repo deploy | backend first (unreferenced), CTA repoint last, flag if possible |
| Test minor PII persists | implemented+tested R28 cleanup incl. Workspace suspend/delete |
| COPPA/GDPR-K exposure | defensible v1 + captured age/jurisdiction; legal text sign-off = launch gate |

## Sources & References
- Origin: docs/brainstorms/2026-07-31-fpv2-the120-accounts-requirements.md; Slice A plan + R20 doc.
- [T120] `app/lib/funnel/{account,children-core,provision-*}.ts`, `app/crm/lib/lead-ingest.ts`,
  `app/lib/funnel/resume-core.ts`, `app/lib/email.ts`, `app/api/fp/login/*`,
  `app/api/funnel/arrival/route.ts`, migrations `20260817120000`/`20260818120000`/`20260827120000`,
  `supabase/MIGRATION-LOCK.md`, `scripts/provision-path-family.ts`.
- [FP] `src/screens/Onboarding.tsx`, `src/lib/auth.ts`, `src/state/gameCore.ts`, `src/App.tsx`.
- External: FTC COPPA VPC guidance; Google Admin SDK Directory API.
