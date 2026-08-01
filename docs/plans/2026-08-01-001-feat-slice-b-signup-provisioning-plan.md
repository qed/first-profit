---
title: "feat: First Profit Slice B — Start Building signup + child provisioning"
type: feat
status: active
date: 2026-08-01
origin: docs/brainstorms/2026-07-31-fpv2-the120-accounts-requirements.md
---

# feat: First Profit Slice B — Start Building signup + child provisioning

**Target repos:** `[T120]` = `120-The120` (system of record), `[FP]` =
`first-profit` (the SPA). Slice A shipped to `main` in both.

## Overview

Build the parent-facing **Start Building** flow (R9-R17) plus parent emails
(R26-R28): a parent self-serves a real First Profit account on firstprofit.school
that populates The120 (parent auth + `parents` + `children`), sets the child's
credential OR requests a provisioned Google Workspace address, verifies their own
email in-flow, and passes a **verifiable parental-consent** step — after which the
child can log in and play. Payments stay mock (Phase 2/3 later).

## Brainstorm build decisions (2026-08-01, origin doc)

- **Real Google Workspace provisioning, end to end** — compose The120's EXISTING
  machinery (`provision-deps.ts` real Admin SDK calls, `funnel_student_provisioning`
  claim + `provision_lease`, never-reissue ledger), not a stub and not a rebuild.
  Credential-gated: `GOOGLE_WORKSPACE_SA_KEY` + Google Admin domain-wide-delegation
  grants must be installed for the real Google call; absent the key, the machinery
  gracefully lands claims at `pending` (identity provisioned, mailbox deferred).
- **Full verifiable-parental-consent flow now** — a first-class, versioned consent
  record (the net-new data model), not a bare checkbox. See Consent decision below.
- **Guarded test families in production** — no staging DB; exercise Slice B with
  `families.is_test=true` families on `@test.the120.invalid`, and CLOSE the gap
  that CRM/GTM queries don't yet honor `is_test`.

## Requirements Trace

R9 (one-sitting self-serve create), R10 (idempotent/resumable, existing-parent
attach), R11 (in-flow parent email verification), R12 (child credential: path a
existing-email+password, path b provision-an-address), R13 (provision timing +
exception path), R14 (5-screen UI extends screen 2), R15 (consent gate), R16
(rate-limited/abuse-protected provisioning + step tokens), R17 (intended CRM
ingestion), R26 (recap email), R27 (progress digest), R28 (data rights/deletion).

## Scope Boundaries

- Payments stay mock; no real charge (so the card-in-transaction consent method is
  NOT available yet — see Consent decision).
- No public launch / no outside families (launch posture); Slice B is exercised by
  guarded test families in prod.
- Reuse The120's funnel primitives; do not fork parent/child/family creation.
- No new Google integration code — compose the existing `provision-deps.ts`.

## Context & Research

### Reuse (do not rebuild) — [T120]
- **Parent account:** `app/lib/funnel/account.ts` `provisionOrRecognizeAccount`
  (`admin.createUser` with `email_confirm:true`, `email_exists → existing_account`
  never a session, inserts `parents`, `cleanupAccount` compensation).
- **Child row (RLS-scoped):** `app/lib/funnel/children-core.ts` `insertChild`
  (under the family's own session, never `supabaseAdmin`, cap 10).
- **CRM ingestion:** the `on_parent_created`/`parents_families_sync` trigger owns
  `families.parent_id` — app never writes it; `matchOrCreateLead`
  (`app/crm/lib/lead-ingest.ts`) is select-then-branch, NEVER upsert.
- **Child auth (path a):** `app/fp/lib/provision-rules.ts` `.invalid` scheme +
  `validateStudentPassword` (≥10 chars) + `email_confirm:true` (type-pinned);
  `app/api/fp/login/profile-core.ts` (the FP player-profile ensure, built for
  Slice B to import).
- **Provisioning (path b):** `app/lib/funnel/provision-{core,rules,deps,driver}.ts`;
  `funnel_student_provisioning` + `provision_lease` (migrations `20260817120000`,
  `20260818120000` fencing, `20260821120000` refund/never-reissue writer);
  drive via `app/api/funnel/arrival/route.ts` poll + `app/api/cron/funnel-*`.
- **Email verification:** `funnel_resume_tokens` + `resume-core.ts` (sha256
  single-use tokens, redeem-CAS, 60-min TTL), `funnel_rate_events` DB limiter,
  `app/lib/email.ts` (Resend), `app/fp/lib/actions/invite.ts` (unauth token
  accept + compensation), `escapeHtml`. `app/lib/auth-mail-guard.ts` default-deny
  for `@the120.school` (parent mail is external → passes).
- **CORS + route/pure-core pattern:** mirror `app/api/fp/login/{route,login-rules,
  profile-core,profile-rules}.ts` (exact-origin allowlist, OPTIONS 204, stateless
  tokens-in-JSON, one generic failure). Cross-origin signup endpoints = route
  handlers importing pure cores; `supabaseAdmin()` service-role, `supabaseServer()`
  anon SSR.
- **Test families:** `families.is_test` marker + `scripts/provision-path-family.ts`
  (`@test.the120.invalid`, `casl_consent:false`, gitignored passwords).

### Reuse (do not rebuild) — [FP]
- Screens 2-5 + primitives (`ProgressBar`, `GreenCta`, `LogoMark`, `TIER_CHIPS`,
  `CHECKMARKS`) live in `src/screens/Onboarding.tsx` — EXTRACT to a shared module.
- `src/App.tsx` stage machine + `src/screens/Landing.tsx` CTA (repoint to signup);
  `src/lib/auth.ts` `loginChild`+`setSession` is the API-call template; the
  provider's `login()` adopts a session + hydrates + routes.
- Design tokens, no-em-dash rule, 390px mobile gate, vitest pure-core pattern.

### Must-heed traps (from docs/solutions/, both repos)
1. `admin.createUser` on a non-deliverable address REQUIRES `email_confirm:true`
   (config.toml lies; prod has confirmations ON).
2. `signUp()` returns NO session under real confirmations — never write the
   `parents` row assuming a post-signUp session; `account.ts` uses `admin.createUser`
   for exactly this reason. Consent must never be forged via unconfirmed signup.
3. No cross-call transaction — compensate exactly what THIS call created;
   verify aggregate invariants with a post-write read.
4. RLS-enabled-zero-policies is only safe if the server truly bypasses PostgREST —
   state which client (`admin` vs `server`) touches every new table; add policies
   to match. New client-facing tables clone the `20260827120000_fp_player_tables`
   per-command-policy + WITH CHECK + column-scoped-grant discipline.
5. Migration lock: query the LIVE `schema_migrations` immediately before authoring
   (file listing is not the truth); authoring-is-applying; additive-only; apply via
   the Management API playbook; next slot ≈ `20260829120000` (verify live).
6. Lease serializes the TAKE not the RUN — fence every write after an await on
   `.eq("lease_owner", owner)`. Claim-before-spend (reserve the slot before the
   priced Google call). Stamp intent (`workspace_attempted_at/_email`) BEFORE the
   Google create so a crash-replay adopts its own mailbox (never-reissue).
7. Consent record must bind to the EXACT policy version the client rendered —
   client echoes the version, server refuses stale; version compare is parse-based
   (`policyVersionAtLeast`), never string compare.
8. Client-minted idempotency key ≠ double-submit guard (synchronous ref); a
   guard with no callers is not a mechanism (enforce child-account invariants in
   DB/config, not app code a public form routes around).

### External best-practice
- **Consent (COPPA):** a bare checkbox is not verifiable. COPPA governs under-13
  (13-16 is a policy choice; GDPR-K is a separate EU track — flag for launch).
  Strongest v1 is card-in-transaction + confirmed-consent email — but Slice B has
  no real charge, so see the Consent decision. Store: policy version snapshot,
  hash, method, parent-identity, timestamp, IP/UA, revocation status.
- **Workspace Admin SDK:** service account + domain-wide delegation, `users.insert`
  (random pw + `changePasswordAtNextLogin`, dedicated OU), async/eventual-consistency
  (a new user isn't immediately usable — poll `users.get`), 409 = already-exists
  (reconcile, don't re-POST), backoff on 429. The120's `provision-deps.ts` already
  implements this shape.

## Key Technical Decisions

- **Consent method for Slice B = "email-plus + attestation + versioned record",
  card-in-transaction deferred to Phase 2/3.** The strongest VPC method (a real
  card charge) isn't available while payments are mock. Slice B builds a first-class
  verifiable-consent artifact: the parent verifies their email (email-plus), makes
  an explicit attestation against a versioned, hashed policy snapshot they rendered,
  and we store method/version/hash/identity/ip/timestamp. When payments go real
  (Phase 2/3), upgrade the method to include the card-in-transaction signal. This is
  a defensible internal-use v1; full legal sign-off remains a launch gate (R15).
- **Signup endpoints are cross-origin route handlers mirroring `/api/fp/login`,
  importing pure cores; reuse funnel primitives verbatim.** No fork of account/
  child/family creation.
- **Consent is a first-class new table** (decoupled from the Stripe refund policy it
  currently piggy-backs on) + gates child minting (consentVerdict-style).
- **Provisioning composes the funnel machinery; close the stale-claim re-drive gap**
  with an FP-signup drive path (a cron that actually drives, not only pages) so a
  family that doesn't return still gets provisioned.
- **Guarded test families**: tag `is_test`, and wire `is_test` exclusion into CRM/GTM
  reads (the flagged gap) so test signups never pollute funnel metrics.
- **New parent principal needs its own RLS reach audit** (the R20 analog): a parent
  session HAS a `parents` row, unlike a child session — re-audit what it reaches.

## Open Questions

### Resolved
- Real provisioning exists (compose it) — resolved by research.
- Consent method under mock payments — resolved (email-plus + attestation now).
- Test data location — guarded test families in prod.

### Deferred to implementation
- Exact new-table schemas (consent record, any signup-state table) + RLS.
- Whether parent verification reuses `funnel_resume_tokens` directly or a
  FP-scoped sibling table.
- The FP-signup provisioning drive cadence (extend a funnel cron vs a new one).

### Dependency / needs ops (not code)
- `GOOGLE_WORKSPACE_SA_KEY` + Google Admin domain-wide-delegation grants must be
  installed to verify REAL mailbox creation end to end. Build/test up to the
  `pending`/claim boundary without it; the real Google call is verified once the
  key is present (an ops step, like Slice A's live-account gate).
- COPPA/GDPR-K legal sign-off of the consent text is a launch gate (R15), not a
  build blocker.

## Implementation Units

### Phase B1 — [T120] backend (system of record)

- [ ] **Unit 1: [T120] Consent + signup-state migration**
  **Requirements:** R15, R10, R16. **Files:** `supabase/migrations/<live-slot>_fp_signup_consent.sql`.
  **Approach:** a first-class `fp_parental_consent` table (child_id/parent_id, policy
  version + hash + rendered-text snapshot, method, verified-parent-identity, ip/ua,
  timestamp, revocation) — service-role-only (RLS on, zero policies), or narrow
  parent-scoped SELECT if the SPA reads it. Any signup-attempt/step-token table
  (or a decision to reuse `funnel_resume_tokens`). Clone `20260827120000` RLS
  discipline. **Query the live `schema_migrations` first.** Post-apply checks.
  **GATE: applying this migration mutates production schema — pause and confirm.**
  **Test:** post-apply verification (to_regclass/pg_policies/pg_constraint).

- [ ] **Unit 2: [T120] Parent signup route + in-flow email verification**
  **Requirements:** R9, R10, R11, R16, R17. **Files:** `app/api/fp/signup/{route.ts,
  signup-rules.ts,signup-core.ts,__tests__/signup-rules.test.ts}`.
  **Approach:** CORS mirror of `/api/fp/login`. `signup-core` reuses
  `provisionOrRecognizeAccount` (parent auth + `parents`, fires CRM trigger) →
  `email_exists` returns existing-account (SPA routes to login/attach, R10). Issue a
  `funnel_resume_tokens`-style verification token, send via Resend (escapeHtml).
  Verify endpoint redeems (CAS, single-use). Rate-limit via `funnel_rate_events` +
  the login-route limiter. Idempotent/resumable (attempt row + compensation:
  cleanupAccount on failure). Never assume a session post-create. Tag `is_test` when
  the signup is a test family.
  **Tests:** rules (parse/origin/validation/refusal parity); core against injected
  db mock (new parent, existing-account, verification redeem, compensation).

- [ ] **Unit 3: [T120] Consent record + gate**
  **Requirements:** R15. **Files:** `app/api/fp/signup/consent-{rules,core}.ts` (+ tests);
  wire into Unit 4/5 minting.
  **Approach:** render a versioned+hashed policy snapshot to the client; the accept
  call echoes the version (refuse stale, `policyVersionAtLeast`); write the
  `fp_parental_consent` record with method=email-plus+attestation, verified-parent
  identity, ip/ua. Minting a child REQUIRES a valid consent verdict.
  **Tests:** version-echo/refuse-stale; verdict (missing/stale/ok); record shape.

- [ ] **Unit 4: [T120] Child creation — path (a) credential + player profile**
  **Requirements:** R12(a), R9. **Files:** `app/api/fp/signup/child-core.ts` (+ tests).
  **Approach:** under the verified parent session, `insertChild` (RLS-scoped) +
  child auth account (`.invalid` scheme, `validateStudentPassword`,
  `email_confirm:true`) + `ensurePlayerProfile` + save seed (reuse Slice A
  profile-core). Gated by Unit 3 consent. Compensation on partial failure.
  **Tests:** child+auth+profile happy path; consent-missing refusal; compensation.

- [ ] **Unit 5: [T120] Child provisioning — path (b) real Workspace address**
  **Requirements:** R12(b), R13, R16. **Files:** compose `provision-{core,deps,driver}.ts`;
  an FP-signup drive path + a re-drive cron (`app/api/cron/fp-provision` or extend
  a funnel cron) closing the stale-claim gap; migration only if a new state column
  is needed (else reuse `funnel_student_provisioning`).
  **Approach:** ensure the claim (idempotent on child_id), lease-fenced writes,
  stamp-intent-before-Google-create, claim-before-spend, real `users.insert` when
  the key is present else graceful `pending`. Exception → `notifyOps`. Parent sees
  a pending state; ready-notification email when the mailbox is live.
  **Execution note:** credential-gated — verify up to `pending` without the key.
  **Tests:** claim idempotency, lease fencing, pending-when-unconfigured,
  exception path (mock the Google deps).

- [ ] **Unit 6: [T120] Parent emails + is_test CRM exclusion**
  **Requirements:** R26, R27, R28. **Files:** notify wiring; `app/crm/**` reads gain
  `is_test` exclusion; recap on signup, digest cron; a documented data-deletion path
  (R28) using the FP-aware order from the Slice A R20 doc.
  **Approach:** reuse the Resend/notify pipeline + escapeHtml; recap email (accounts,
  how the child logs in, reset link); low-frequency digest; wire `is_test` filters
  into CRM/GTM queries; document the service-role deletion order.
  **Tests:** email content (no em dashes, escaped names); is_test excluded from a CRM
  read; digest selection.

### Phase B2 — [FP] signup UI

- [ ] **Unit 7: [FP] signup stage + shared onboarding-screen extraction**
  **Files:** add `"signup"` to `Stage` (`gameCore.ts`); `src/App.tsx` case;
  `src/screens/Landing.tsx` CTA repoint; extract screens 2-5 + primitives from
  `Onboarding.tsx` into `src/screens/signup/shared.tsx` (both signup and in-app
  onboarding import them). **Tests:** stage routing; shared screens still render;
  existing Onboarding tests green.

- [ ] **Unit 8: [FP] Screen 1 (parent account) + child-credential + consent UI**
  **Requirements:** R14, R12, R15. **Files:** `src/screens/signup/*`.
  **Approach:** HQ parent-account form (name/email/password ≥8, validation) with the
  guardian-consent note; the child-credential step (existing email+password OR a "my
  kid needs an email" toggle → provision path); the consent step rendering the
  versioned policy snapshot + explicit attestation. Keep parent/child-credential/
  consent data in signup-LOCAL state (never the persisted Profile/save doc). Pure
  validation module, tested. Double-submit guard (synchronous ref). No em dashes.
  **Tests:** validation rules; consent version echoed; screen transitions.

- [ ] **Unit 9: [FP] Email-verify wait UI + signup API wiring**
  **Requirements:** R9, R11. **Files:** `src/lib/auth.ts` (signupParent/verifyEmail/
  createChild mirroring loginChild); a verification wait screen (poll/"I clicked it").
  **Approach:** call the Unit 2/4 routes; on child-created success, adopt the child
  session via the provider `login()` (or route to login). Flat `{ok:false}` failure
  convention. **Tests:** auth fns (mock fetch+setSession); wait-state transitions.

- [ ] **Unit 10: [FP] Full flow assembly + mobile pass**
  **Files:** the end-to-end 5-screen sequence, progress bar filling from segment 1,
  wiring all steps. **Approach:** assemble screen 1 → verify → child-cred → consent →
  screens 2-5 → child can play. 390px pass on every new screen + desktop; no em
  dashes. **Tests:** full happy-path render; a jsdom walk of the sequence.

### Phase B3 — hardening

- [ ] **Unit 11: [T120+FP] E2E + parent-principal RLS reach audit**
  **Approach:** run the full signup with guarded test families in prod (both paths,
  up to the Workspace credential boundary); re-audit what a PARENT session reaches
  across the shared project (the R20 analog — a parent HAS a `parents` row);
  compensation/idempotency/double-submit stress; record accepted exposures + any
  new learnings. **Test:** E2E checklist; RLS probes with a test parent session.

## System-Wide Impact

- Every parent signup fires `on_parent_created` → a `families` CRM row (intended,
  R17) — test families MUST set `is_test` and CRM reads MUST exclude it.
- New parent principal is a new identity shape in the shared project's threat model
  (Slice A only had child sessions) — Unit 11 re-audits it.
- Real Workspace provisioning burns never-reissue ledger names permanently — test
  families still consume real addresses; acceptable per the build decision, but
  bounded (guarded test families, not open signup).
- Cross-repo: [T120] routes and [FP] UI must move together; PRs cross-linked.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Migration collides / breaks prod | live schema_migrations query, additive/idempotent, Management API, post-apply checks, GATE before apply |
| signUp/session assumption strands a half-created parent | reuse account.ts admin.createUser + cleanupAccount compensation; no post-create session assumption |
| Forged/stale consent | first-class versioned+hashed record, client echoes version, refuse stale, email-verified parent |
| Provisioning double-mints / burns ledger | claim-before-spend, lease fencing, stamp-intent-before-create, idempotent on child_id |
| Stale claims never provisioned | FP-signup re-drive cron (close the funnel gap) |
| Test data pollutes CRM/GTM | is_test tag + wire exclusion into CRM reads |
| Real Google call needs credentials | build/test to pending boundary; real E2E gated on GOOGLE_WORKSPACE_SA_KEY (ops) |
| COPPA/GDPR-K exposure | defensible email-plus+attestation v1; legal sign-off is a launch gate |
| Parent principal over-reach in shared DB | Unit 11 RLS reach audit + explicit policies on new tables |

## Sources & References
- Origin: docs/brainstorms/2026-07-31-fpv2-the120-accounts-requirements.md
- Slice A plan + R20 doc (parent-principal audit basis, deletion order).
- [T120] `app/lib/funnel/{account,children-core,provision-*}.ts`,
  `app/crm/lib/lead-ingest.ts`, `app/lib/funnel/resume-core.ts`, `app/lib/email.ts`,
  `app/api/fp/login/*`, migrations `20260817120000`/`20260818120000`/`20260827120000`,
  `supabase/MIGRATION-LOCK.md`, `scripts/provision-path-family.ts`.
- [FP] `src/screens/Onboarding.tsx`, `src/lib/auth.ts`, `src/App.tsx`.
- External: FTC COPPA VPC guidance; Google Admin SDK Directory API (users.insert,
  limits, DWD).
