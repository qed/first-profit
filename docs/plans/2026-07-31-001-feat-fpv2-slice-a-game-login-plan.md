---
title: "feat: fpv2 Slice A — game, child login via The120, server-side state, mock checkout"
type: feat
status: active
date: 2026-07-31
origin: docs/brainstorms/2026-07-31-fpv2-the120-accounts-requirements.md
deepened: 2026-07-31
---

# feat: fpv2 Slice A — game, child login via The120, server-side state, mock checkout

**Target repos:** this plan spans two repositories. Units are labeled:
- **[FP]** = `first-profit` (this repo, Vite SPA, firstprofit.school)
- **[T120]** = `120-The120` (Next.js 16 + Supabase, the120.school; sibling checkout at `../120-The120`)

All paths are repo-relative to the labeled repo.

## Overview

Build Slice A of the fpv2 experience (see origin doc): the full factory-floor game
from the design handoff, child login through a The120-hosted API route, a First
Profit player-profile + game-state layer in The120's Supabase with child-scoped
RLS, first-run in-game onboarding for existing The120 children, and the mock
Stripe checkout writing an append-only ledger. Slice B (Start Building signup /
provisioning) and payment Phases 2–3 are explicitly out of scope here.

## Problem Frame

First Profit is currently a stateless demo SPA (no auth, no persistence, no
network code). The120 is the family system of record with real child login
accounts. Slice A turns the SPA into the actual student product: existing The120
children log in with their current name + password credentials, play the fpv2
game to the handoff's fidelity bar, and their progress persists server-side.
This ships a playable increment before the cross-repo signup funnel (Slice B)
exists. (See origin: docs/brainstorms/2026-07-31-fpv2-the120-accounts-requirements.md.)

## Requirements Trace

From the origin doc, Slice A covers: R1–R8 (identity/login), R18–R20 (player
profiles, game state, RLS), R21–R22 (game + mobile), R23 (mock checkout /
ledger discriminator), R29–R31 (architecture). Slice B requirements (R9–R17,
R26–R28) are traced only where a Slice A surface must not paint over them
(landing CTA, profile-creation path reused later).

## Scope Boundaries

- No Start Building signup, no provisioning, no parent emails (Slice B).
- No real Stripe (Phase 2/3); the checkout is the prototype's mock, but ledger
  rows carry `source` from day one (R23).
- Sell criteria 1.3–1.5 and phases Build–Scale visible but locked, per handoff.
- Landing page ships (it is part of the fpv2 experience), but its Start
  Building CTA routes to the child login until Slice B exists (pre-launch, no
  outside traffic — origin doc launch posture).
- No `/fp` retirement work; `/fp` continues running untouched.
- No changes to The120's existing tables' policies or triggers; new FP tables
  only, plus one new API route file cluster.

## Context & Research

### Relevant Code and Patterns

**[FP]** (all exist; handoff says evolve, not replace)
- `src/state/GameContext.tsx` — single context, plain useState; single-company
  model. Needs the fpv2 multi-idea model, stage machine, and ledger kinds.
- `src/components/FactoryFloor.tsx` + `src/components/MobilePath.tsx` —
  `matchMedia(1024px)` swap; the `walkTo`/`onWalk`/`onArrived` lifted-intent
  contract (see Institutional Learnings, breakpoint fix). `PodCardContent.tsx`
  shared between variants.
- `src/components/RoomShell.tsx` (full-screen <`sm`, floating ≥`sm`),
  `src/components/NextStepCoach.tsx` (bottom dock; `MobilePath` reserves
  `pb-80`), `src/components/Avatar.tsx` (the SVG the handoff reuses),
  `src/data/path.ts` (STEPS 1.1/1.2 copy — strip em dashes), `src/data/rooms.ts`.
- Authoritative UI spec: `artifacts/fpv2prototype/design_handoff_v1_user_flow/README.md`
  (+ `First Profit Flow.dc.html` prototype). Design tokens, screen inventory,
  multi-idea mechanics, copy rules (no em dashes) are all there.
- No router, no tests, no env plumbing, no network code today. Tailwind maps
  `mono` to IBM Plex Mono; handoff wants Spline Sans Mono.

**[T120]**
- Student sign-in today: `app/fp/(auth)/sign-in/SignInForm.tsx` → server action
  `app/fp/lib/actions/sign-in.ts` (`signInStudent`): zod → atomic in-memory
  rate limits (`app/fp/lib/rate-limit-store.ts`, name 5/15min + IP 40/15min) →
  service-role candidate scan of `path_student_profiles` (+`children!inner`,
  max 5 candidates) → `signInWithPassword(deriveStudentEmail(childId), pw)`,
  first success wins; one generic failure message.
- `app/fp/lib/provision-rules.ts`: `STUDENT_EMAIL_DOMAIN =
  "students.the120.invalid"`, `deriveStudentEmail`, `normalizeStudentName`,
  `STUDENT_PASSWORD_MIN_LENGTH = 10`, `buildStudentCreateUserPayload`
  (type-pins `email_confirm: true`), `parseCandidateRow`.
- Supabase clients: `app/lib/supabase/client.ts` / `server.ts` / `admin.ts`
  (service-role, `server-only`, `persistSession:false`).
- Route-handler precedents: `app/api/funnel/arrival/route.ts` (session-auth),
  `app/fp/fw/board/[token]/feed/route.ts` (hostile-facing: one bare refusal,
  no-store both in Response and `next.config.ts`). **No CORS anywhere yet** —
  greenfield. `proxy.ts` matcher covers `/crm|/fp|/staff` only; a new
  `/api/fp/*` route is outside it.
- RLS precedent for child-scoped policies: `supabase/migrations/20260808120000_funnel_projects_policies.sql`
  (quoted-sentence policy names, ownership subquery) and the
  `security definer set search_path = ''` helper idiom in
  `supabase/migrations/20260722140000_path_storage.sql`. All `path_*` tables
  are deliberately zero-policy — the FP tables deviate, stated in the banner.
- Identity: `path_student_profiles` (`user_id` UNIQUE → auth.users RESTRICT,
  `child_id` UNIQUE nullable → children RESTRICT, `family_id`, FW name/band
  columns), `path_role_grants` (role rows, not user columns). Password reset
  already exists: `resetStudentPasswordAction` in `app/fp/lib/actions/provision.ts`
  (parent-gated, `admin.updateUserById`) — Slice A reuses it as-is via `/fp`.
- Migrations: `supabase/migrations/YYYYMMDDHHMMSS_name.sql`, additive-only,
  idempotent, authoring-is-applying via Management API
  (`supabase/MIGRATION-LOCK.md`); query the live
  `supabase_migrations.schema_migrations` ledger immediately before authoring
  (next free slot ≈ `20260827120000`, verify live). Vitest is an include
  allowlist (`vitest.config.ts`) — new test dirs must be added to it.

### Institutional Learnings (docs/solutions/, both repos)

- **[FP]** `docs/solutions/ui-bugs/breakpoint-crossing-drops-navigation-2026-07-31.md`:
  keep all in-flight intent (walks, open dialogs, runner state) above the
  breakpoint-conditional mounts; single state channel per action; test across
  640px and 1024px. Binding for every new fpv2 surface.
- **[T120]** `docs/solutions/security-issues/rls-enabled-zero-policies-but-the-server-code-is-postgrest-anon-key-2026-07-28.md`:
  policies ship in the same migration as the table; name which client each
  access path uses; test against real RLS at least once.
- **[T120]** `docs/solutions/integration-issues/supabase-admin-createuser-non-deliverable-email-requires-email-confirm-2026-07-21.md`:
  `email_confirm: true` always (production has confirmations ON despite config.toml).
- **[T120]** `docs/solutions/security-issues/a-default-deny-guard-cannot-ask-does-this-account-exist-on-a-public-path-2026-07-28.md`
  + `constant-response-is-not-constant-timing-...-2026-07-27.md`: the login
  route must not branch response shape, latency, or side effects on account
  existence; record rate-limit strikes before early returns.
- **[T120]** `docs/solutions/best-practices/in-memory-rate-limiter-toctou-race-and-fifo-eviction-clears-lockout-2026-07-22.md`:
  atomic check-and-record, importance-aware eviction, key by identifier + IP.
- **[T120]** `docs/solutions/integration-issues/migration-version-collision-...-2026-07-28.md`
  + `dormant-migration-not-applied-...-2026-07-17.md`
  + `database-issues/add-column-if-not-exists-skips-the-whole-clause-...-2026-07-27.md`
  + `integration-issues/supabase-cli-stale-db-password-management-api-workaround-2026-07-13.md`:
  the full migration-authoring discipline for Unit 1.
- **[T120]** `docs/solutions/best-practices/no-transaction-multi-step-write-compensation-post-write-verify-cas-scoped-claim-2026-07-22.md`
  + `database-issues/partial-unique-index-under-live-upsert-...-2026-07-27.md`:
  ledger/save write discipline (PostgREST has no cross-call transactions).
- **[T120]** `docs/solutions/build-issues/env-less-build-hangs-render-time-supabase-clients-and-undefined-fetch-url-2026-07-17.md`:
  create the SPA's Supabase client lazily; fail fast on missing env.
- **[T120]** `docs/solutions/security-issues/guard-function-with-no-callers-is-not-a-mechanism-...-2026-07-23.md`:
  every Supabase Auth endpoint reachable with the publishable key and a child
  session is attack surface; enforce invariants server/DB-side.

### External References

- Supabase: `setSession({access_token, refresh_token})` is the supported way to
  adopt a server-minted password-grant session in an SPA; keep `persistSession:
  false, autoRefreshToken: false` on the server-side client; return tokens in a
  POST JSON body with `Cache-Control: no-store`; never in URLs.
- Supabase RLS guide: wrap `auth.uid()` as `(select auth.uid())` (per-statement
  caching), `to authenticated` on every policy, separate select/insert/update
  policies, index both sides of the profile link, duplicate the ownership
  filter in client queries.
- Supabase rate limits: the `/token` endpoint's per-IP limit will see Vercel's
  egress IP — forward the real client IP via the server client's headers, and
  rate-limit at the route regardless.
- Next.js App Router CORS: explicit `OPTIONS` handler (auto-OPTIONS does not
  satisfy preflight), echo the matched origin (never `*`), `Vary: Origin`,
  headers on the POST response too, and server-side Origin validation as an
  authorization check.
- Supabase API keys: new-style `sb_publishable_...` key for the SPA (legacy
  anon JWT keys are deprecated; sunset end of 2026). Verify which style the
  existing project uses before naming envs.
- Fonts: self-host via Fontsource (variable Fraunces + Inter, Spline Sans
  Mono, Caveat), subset latin, preload only above-the-fold faces.
- framer-motion: use `LazyMotion` + `m` components (~4.6kb vs ~34kb); animate
  transform/opacity only; respect `useReducedMotion()`.

## Key Technical Decisions

- **Login route returns tokens; SPA adopts them** — `signInWithPassword` on a
  stateless server client in a The120 route handler, JSON `{access_token,
  refresh_token}` back to the SPA, `supabase.auth.setSession(...)`. Cookie
  sessions cannot cross domains; this is the supported pattern. (Resolves the
  origin doc's login-route contract question.)
- **One login route, two credential shapes** — the route accepts `{identifier,
  password}` where identifier is a student name (resolved via the existing
  candidate-scan against `path_student_profiles`, exactly like `signInStudent`)
  or an email (tried directly). Constant response shape and timing; one generic
  failure message; strikes recorded before early returns.
- **Child gate + profile creation live in the login route** (service-role):
  after successful auth, the route verifies the account maps to a `children`
  row (via `path_student_profiles` or, later, Slice B's records), refuses
  non-child accounts, and upserts the `fp_player_profiles` row on first login.
  Where `path_student_profiles` exists, the profile's `(user_id, child_id)`
  must match it (origin R18).
- **Game state = snapshot + append-only ledger** — `fp_player_saves` holds one
  JSONB document per player (ideas, activeIdea, **site headline**, onboarding
  progress) guarded by **compare-and-swap on revision**: `set revision =
  base+1 where revision = :base`; a zero-row result (detected via `.select()`
  row count — PostgREST returns 200 on zero-row updates) means refetch and
  rebase. A naive `revision < :incoming` guard would NOT stop a stale tab
  that accumulated more actions; CAS equality does. A DB trigger additionally
  enforces `new.revision = old.revision + 1` for non-service-role writers so
  a hostile/buggy client can't jump the counter and brick saves. The save row
  is **seeded (revision 0) by the login route** — the client never inserts,
  eliminating the first-save race and the insert policy. `fp_ledger` is
  append-only (`kind: sale|backing`, `source: mock|stripe_test|live` from day
  one, origin R23), enforced structurally by a raise-trigger on
  UPDATE/DELETE, not just policy absence. Client: optimistic in-memory state,
  debounced snapshot writes (~3s, max-interval flush),
  `pagehide`/`visibilitychange` flush with `fetch keepalive` (on keepalive's
  ~64KiB rejection, park in the outbox), an outbox in localStorage keyed by
  user id. Note for R27: the parent digest will read task/criteria progress
  out of the JSONB doc; if that proves painful, promote an additive
  `criteria_done` summary column later.
- **`site_headline` lives in the save doc, not the profile** — resolves a
  design fork: `fp_player_profiles` stays identity-only (user/child link +
  handle) and service-role-write-only, so no update policy ever exposes
  `handle`/`child_id`/`user_id` to the client. The Your Site room edits the
  headline through the normal save path.
- **Child-scoped RLS ships with the tables, in the same migration** — policies
  follow `funnel_projects_policies.sql` + `(select auth.uid())`; the FP
  deviation from the path-tables zero-policy posture is stated in the
  migration banner. SPA reads/writes `fp_*` tables directly; everything else
  goes through The120 routes.
- **Child password minimum is 10** — The120's `STUDENT_PASSWORD_MIN_LENGTH`
  supersedes the origin doc's "minimum 8" (R8): the system of record already
  enforces 10 for student accounts, and Slice A creates no new passwords
  anyway. Recorded here so Slice B inherits it.
- **No router** — the SPA keeps a `stage` machine in `GameContext` (boot |
  landing | login | onboard | app), matching the prototype's design and the
  existing architecture. `boot` is required: session restore → save fetch →
  stage decision is async, and without it a logged-in child flashes `landing`
  on every reload. Deep-linking is a non-goal pre-launch.
- **The publishable/anon key is a parallel auth surface — accepted exposure
  is the plan of record for Slice A**: with only the SPA's key, anyone can
  call Supabase Auth directly (`signInWithPassword` against derivable
  `.invalid` student addresses bypassing the route's limiters, `signUp`
  minting fresh `authenticated` principals, `updateUser` letting a live child
  session change its own email/password past the parent-gated reset). Both
  hard levers are BLOCKED by live The120 flows: disabling public signup
  breaks The120's account modal (`signUp` is a tested, deliberate path), and
  Supabase Auth CAPTCHA is project-wide — it would instantly break every
  existing The120 `signInWithPassword` call (CRM login, dashboard, funnel,
  `/fp` student action), none of which send captcha tokens. Slice A therefore
  (a) documents this as the accepted exposure in the R20 review, with the
  route limiter as the live control (defensible pre-launch: the population is
  internal and the surface exists for The120 today already); (b) records the
  real fix — captcha-token plumbing across The120's sign-in surfaces, then
  enabling CAPTCHA — as owned pre-public-launch work outside Slice A; and
  (c) runs attacker-perspective probes in Unit 12 so the exposure is
  measured, not assumed.
- **Logout revokes, not just hides — but idle and explicit logout differ**:
  both call `supabase.auth.signOut()` (revoking the refresh token
  server-side) and purge `sb-*` session keys. Explicit logout and a
  different-user login additionally purge all `fp:*` drafts/outbox. Idle
  logout PRESERVES the same user's `fp:<uid>:*` drafts and outbox — origin R6
  requires that session expiry mid-play never silently lose Step Runner
  input; the draft restores on same-user re-login. localStorage persistence
  is kept (kids lose tabs constantly); residual shared-device exposure is
  recorded in the R20 review.
- **Save doc and outbox entries carry a schema version from day one** — a
  `docVersion` int inside the doc and a `v` field on serialized outbox
  entries; hydrate and replay check it and discard/migrate unknown versions
  instead of feeding them to a newer reducer. Costs one field now; nearly
  impossible to retrofit once production rows and long-lived tabs exist.
- **Fonts self-hosted via Fontsource; `LazyMotion` for motion** — mobile
  budget; four families is already heavy.
- **Vitest lands in first-profit** — pure logic (game reducer/selectors, sync
  outbox, save-revision rules) gets node-environment tests; UI verification
  stays the CLAUDE.md 390px visual pass. The120 units use its existing vitest
  (respecting the include allowlist).

## Open Questions

### Resolved During Planning

- Login contract → tokens-in-JSON + `setSession` (above).
- RLS shape → child-scoped per-command policies on `fp_*` only, shipped with
  tables, every insert/update carrying explicit `with check` (the gauntlet
  precedent's missing `with check` is a known cross-tenant-write hazard — do
  not copy it).
- Password minimum → 10 (The120 standard).
- Router vs stage machine → stage machine with a `boot` state.
- Existing parent password reset → Slice A reuses The120's existing
  `resetStudentPasswordAction` via `/fp`; no new reset surface.
- Landing CTA pre-Slice-B → routes to login.
- `site_headline` home → save doc (profiles stay service-role-write-only).
- Supabase key style → the project uses legacy anon JWT keys today
  (`NEXT_PUBLIC_SUPABASE_ANON_KEY` throughout The120), so the SPA var is
  `VITE_SUPABASE_ANON_KEY`; the `sb_publishable_` migration is separate,
  pre-sunset work.
- Proxy carve-out → verified: `proxy.ts`'s matcher (`/crm|/fp|/staff`) never
  covers `/api/*`; no proxy-rules work needed.
- Rate limiting → house in-memory limiter keyed `(ip, identifier)` + IP
  aggregate as one layer, PLUS the CAPTCHA/signup-setting decision above —
  "public reachability starts at deploy, not at marketing launch," so this is
  a Unit 2 decision, not a launch-time revisit.

### Deferred to Implementation

- Exact JSONB save-document schema details (field names inside `ideas[]`) —
  settled when the GameContext v2 reducer takes shape; the DB treats it as an
  opaque, size-capped document guarded by `revision`.
- Live migration version slot — must be read from
  `supabase_migrations.schema_migrations` immediately before authoring
  (MIGRATION-LOCK; the file listing is not the truth; re-read the lock file
  itself too).
- The concrete `fp_player_saves.doc` size cap — chosen at implementation
  against a computed worst case (5 ideas × all task inputs at max length +
  onboarding state), checked against both the cap and the keepalive ~64KiB
  body limit. Note `pg_column_size` measures post-TOAST compressed size.

### Flag for pre-launch product review (not decided here)

- Handles derive from the child's first name and appear in public-looking
  URLs (`firstprofit.school/<handle>`, `pay.firstprofit.school/<handle>`) —
  this publishes minors' first names, and sequential uniquification
  (`maya`, `maya2`) is an enumeration signal. Fine while pre-launch and
  internal (origin launch posture); must be revisited before outside
  families arrive. Origin doc owns the product call.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for
> review, not implementation specification. The implementing agent should
> treat it as context, not code to reproduce.*

```mermaid
sequenceDiagram
    participant Kid as Child (SPA, firstprofit.school)
    participant T120 as The120 /api/fp/login
    participant SB as Supabase (shared project)

    Kid->>T120: POST {identifier, password} (preflighted, origin-allowlisted)
    T120->>T120: rate-limit strike (atomic, before any I/O)
    T120->>SB: resolve identifier -> candidate emails (service role)
    T120->>SB: signInWithPassword (stateless client, per-candidate)
    T120->>SB: child gate; ensure fp_player_profiles + seed save row (service role)
    T120-->>Kid: {access_token, refresh_token, profile} (no-store)
    Kid->>SB: auth.setSession(tokens) -> localStorage persistence
    Kid->>SB: select fp_player_saves / fp_ledger (RLS: own rows)
    Note over Kid: play: optimistic state, debounced snapshot upsert<br/>(revision guard), append-only ledger inserts,<br/>pagehide flush + outbox retry
```

State flow inside the SPA: `stage: landing → login → onboard (screens 2–5,
step 1 pre-completed) → app`, with `onboard` skipped when the loaded save says
onboarding is complete.

## Implementation Units

### Phase A1 — The120 foundation

- [ ] **Unit 1: [T120] FP tables migration (profiles, saves, ledger) with RLS**

**Goal:** The three FP-owned tables exist in production with child-scoped RLS,
indexes, and RESTRICT FKs.

**Requirements:** R18 (identity + handle; `site_headline` deliberately lives
in the save doc — see Key Technical Decisions), R19, R20, R23 (discriminator).

**Dependencies:** None. (Live ledger version check immediately before authoring.)

**Files:**
- Create: `supabase/migrations/<live-slot>_fp_player_tables.sql`
- Test: `app/lib/__tests__/migration-versions.test.ts` (must stay green; no edits expected)

**Approach:** (These choices are effectively permanent — authoring is
applying to production — so every guard below is a pre-authoring decision,
not a hardening follow-up.)
- `fp_player_profiles`: `id` PK, `user_id` UNIQUE NOT NULL → auth.users
  RESTRICT, `child_id` UNIQUE NOT NULL → children RESTRICT, `handle` UNIQUE
  NOT NULL with length + charset `check` (lowercase alphanumeric, bounded),
  timestamps. NO `site_headline` (it lives in the save doc). Identity
  agreement with `path_student_profiles` is enforced by a `before insert or
  update` trigger that rejects a `(user_id, child_id)` pair contradicting an
  existing `path_student_profiles` row — DB-side mechanism, with the login
  route's check as the friendly path (guard-with-no-callers learning; Slice B
  becomes a second writer).
- `fp_player_saves`: `profile_id` PK/FK RESTRICT, `doc` jsonb NOT NULL with a
  size-cap `check` (e.g. `pg_column_size` bound), `revision` bigint NOT NULL
  default 0, `updated_at`. A `before update` trigger enforces
  `new.revision = old.revision + 1` for non-service-role writers (same idiom
  as `children_applicant_state_guard`) — the client CAS is UX, the trigger is
  the mechanism.
- `fp_ledger`: append-only — `id` uuid PK (client-generated for idempotent
  retry), `profile_id` FK RESTRICT NOT NULL, `kind` (`sale|backing` check),
  `source` (`mock|stripe_test|live` check), `payer` (length-capped),
  `amount_cents` int NOT NULL `check (amount_cents > 0)`, `created_at`.
  Append-only is structural: a `before update or delete` raise-trigger, not
  just policy absence. Index on `(profile_id, created_at)` — Postgres does
  not auto-index FK columns and both RLS and every read filter on it.
- RLS in the same file, per-command, all `to authenticated`, and **every
  insert/update policy carries an explicit `with check` with the same
  ownership predicate as `using`** (the gauntlet_saves precedent omits
  `with check` on update — that shape allows re-pointing a row at another
  tenant; do not copy it):
  - profiles: `select` where `user_id = (select auth.uid())` only. No
    insert/update/delete policies (service-role writes only).
  - saves: `select` + `update` via
    `profile_id in (select id from fp_player_profiles where user_id = (select auth.uid()))`,
    with column-scoped `grant update (doc, revision, updated_at)` so
    `profile_id` is not client-updatable at all. No insert policy — the
    login route seeds the row.
  - ledger: `select` + `insert` only; insert `with check` additionally pins
    `source = 'mock'` and the amount bounds — only the service role may ever
    write `stripe_test`/`live` rows (a client-forged `live` row would poison
    Phase 2/3 reconciliation permanently in an append-only table).
  - Explicit `revoke all ... from anon, authenticated` then narrow grants per
    table (house pattern in `gauntlet_daily_sprints` / `funnel_student_provisioning`).
- Banner states the deliberate deviation from the path-tables zero-policy
  posture and cites the origin doc (and notes the funnel FOR-ALL precedent's
  own guard-bug history as the reason for per-command policies). Idempotent
  statements throughout; constraint-adds guarded separately from column-adds;
  apply via the Management API playbook; version row inserted and read back.
- Post-apply checks: `to_regclass` for all three tables, `pg_constraint` for
  FKs/checks, **`pg_policies` count per table per command, and
  `pg_class.relrowsecurity = true`** for all three (a silently-skipped policy
  under RLS-enabled is this repo's founding failure class).

**Patterns to follow:**
- `supabase/migrations/20260808120000_funnel_projects_policies.sql` (policy style)
- `supabase/migrations/20260721130000_path_identity.sql` (RESTRICT posture, banner voice)
- `supabase/MIGRATION-LOCK.md` + the Management-API playbook solution doc

**Test scenarios:**
- Test expectation: none — schema-only migration; correctness is verified by
  the post-apply checks above and exercised by Units 2 and 6 against real RLS.

**Verification:**
- All post-apply checks above pass; a probe with a real authenticated session
  (not service role) can read/write only its own rows, cannot update/delete
  ledger rows, cannot re-point its save row at another `profile_id` (named
  probe, not folded into the general check), cannot insert a ledger row with
  `source <> 'mock'` or a foreign `profile_id`, and cannot skip the revision
  sequence; the schema_migrations row reads back with this migration's name.

- [ ] **Unit 2: [T120] Child login route (`/api/fp/login`)**

**Goal:** A cross-origin login endpoint that authenticates name-or-email +
password, gates to children, ensures the player profile, and returns session
tokens.

**Requirements:** R1, R2, R4 (server side), R18 (first-login creation), R30, R31.

**Dependencies:** Unit 1.

**Files:**
- Create: `app/api/fp/login/route.ts` (POST + OPTIONS)
- Create: `app/api/fp/login/login-rules.ts` (pure decision module: request
  parsing, origin allowlist check, candidate/identifier classification,
  response shaping)
- Create: `app/api/fp/login/__tests__/login-rules.test.ts`
- Modify: `vitest.config.ts` (include allowlist gains the new test dir)
- Modify: `next.config.ts` (no-store headers for `/api/fp/:path*`, belt-and-suspenders)

**Approach:**
- POST body `{identifier, password}`. **Slice A implements the name path
  only**: student name → the `signInStudent` candidate-scan pattern
  (`normalizeStudentName`, `parseCandidateRow`, `deriveStudentEmail`, max-5
  candidates) against `path_student_profiles`. Email-shaped identifiers get
  the same generic refusal (constant shape holds automatically) — no email
  auth branch ships until Slice B, when email-credentialed children actually
  exist (scope-guardian: zero Slice A users, pure added surface). The
  classifier in the pure module is structured so Slice B adds the email
  branch without reshaping the contract.
- Known carry-forward, NOT a Slice A prerequisite: the candidate scan runs
  the same full-table-scan posture `/fp` runs in production today
  (acceptable at current row counts); the normalized-name column + index on
  `path_student_profiles` is its own future The120 migration (out of Slice
  A's scope boundary), tracked for pre-public-launch scale work.
- Rate limiting first, atomically, before any DB I/O, keyed exactly like the
  house pattern: `(ip, identifier)` bucket + IP-aggregate bucket (a bare
  identifier key was deliberately rejected in The120's review — one attacker
  would lock out every student sharing a first name); inherit
  `releaseRateLimitEvent` on candidate-load outage so a DB blip never burns
  strikes. This limiter is one layer, not the story (see Key Decisions:
  CAPTCHA/signup-setting decision must land before Unit 5 merges).
- Client IP: verify in a preview deployment which header the platform
  attests (`x-vercel-forwarded-for` / rightmost hop) and use that — the
  leftmost `x-forwarded-for` hop is client-spoofable on a public
  cross-origin endpoint and would defeat all three throttles at once. Do NOT
  import `app/fp/lib/client-ip.ts` here — it returns the leftmost hop by
  design for the proxied `/fp` surface; this route needs its own
  attested-header extractor, pinned by the pure-module test.
- Auth via a stateless client (`persistSession:false, autoRefreshToken:false`),
  forwarding the attested client IP so Supabase's `/token` limits attribute
  correctly.
- On success: service-role child gate — resolve the auth user to a `children`
  row (via `path_student_profiles.user_id`); no mapping → **revoke the
  just-minted session server-side, SCOPED to the tokens this call returned**
  — never a global admin signOut, which would force-log the account out of
  every The120 surface on every device (a curious parent trying their own
  credentials, or anyone holding a staff password, must not be able to
  weaponize this endpoint as a remote force-logout). Then return the same
  generic failure as bad credentials.
- Profile creation: select-then-insert-if-absent — never a full-row upsert
  (an upsert's DO UPDATE arm would overwrite `handle` with freshly-derived
  defaults on every login). On 23505: `user_id`/`child_id` conflict →
  re-select and adopt the existing row, never update it; `handle` conflict →
  re-derive with a new suffix and retry, bounded. Seed the `fp_player_saves`
  row (revision 0) in the same step. Keep all of this in a pure module Slice
  B's signup route imports.
- Response: `{access_token, refresh_token, profile: {handle, firstName}}` with
  `Cache-Control: no-store`. One constant-shape, constant-copy generic
  failure for every refusal. Timing honesty: the candidate scan does 0–5
  `/token` round-trips depending on name matches — a residual timing signal
  identical to `/fp`'s accepted posture. State it as accepted (or pad to a
  fixed count); do not claim constant timing.
- CORS: explicit `OPTIONS` (204 + headers); allowlist
  `https://firstprofit.school`, localhost dev origins, AND the feature
  branch's stable Vercel preview alias (exact-match, e.g. the branch-scoped
  `<project>-git-<branch>-<team>.vercel.app` URL — never a `*.vercel.app`
  wildcard; removed at launch) so the deploy-gating strategy's preview
  deploys can actually log in; echo the matched origin, `Vary: Origin`;
  refuse other origins server-side. The Origin check
  constrains browser-embedded misuse only — it is NOT an authorization
  control and does nothing against curl; the limiter + CAPTCHA layers carry
  that load. No cookies, no `Allow-Credentials`.

**Execution note:** Implement the pure module test-first; the route stays a
thin impure wrapper (house pattern: pure decision module + thin wrapper,
vitest is node-only).

**Patterns to follow:**
- `app/fp/lib/actions/sign-in.ts` (candidate scan, generic failure, limiter order)
- `app/fp/lib/provision-rules.ts` (name/email helpers — import, don't copy)
- `app/fp/fw/board/[token]/feed/route.ts` (hostile-facing route posture)

**Test scenarios (login-rules pure module):**
- Happy path: valid student name classifies as name-scan; well-formed request
  parses.
- Happy path: allowed origin (`https://firstprofit.school`, localhost dev,
  the branch preview alias) passes; the matched origin is echoed.
- Edge case: identifier with stray whitespace/case normalizes like
  `normalizeStudentName`; empty identifier/password → generic refusal shape.
- Edge case: email-shaped identifiers (including synthetic `.invalid`
  addresses) produce the same generic refusal as unknown names — no email
  auth branch in Slice A, no special-casing that leaks the scheme.
- Error path: disallowed or missing Origin → refusal decision (403 shape);
  malformed JSON body → generic refusal shape identical to bad-credentials.
- Error path: response shaping produces byte-identical refusal payloads for
  bad-password, unknown-identifier, and non-child-account inputs.
- Error path: a client-supplied `x-forwarded-for` value cannot select the
  rate-limit key (pins the attested-header decision).
- Edge case: profile-creation conflict classification — `user_id` collision
  adopts the existing row untouched; `handle` collision re-derives bounded.
- Integration (route, minimal): OPTIONS preflight returns 204 with
  allow-origin/methods/headers; POST failure and success both carry CORS +
  no-store headers.
- Integration (manual, Unit 12 set): attacker-with-anon-key probes — direct
  `signUp`, direct `signInWithPassword` against a derived `.invalid` address,
  and `updateUser({email}/{password})` with a live child session — each
  outcome recorded as blocked or explicitly accepted.

**Verification:**
- From a browser console on an allowed origin: a real student's name+password
  returns tokens; `setSession` with them yields RLS-scoped reads. A parent's
  email+password returns the generic failure. Six rapid failures rate-limit.

### Phase A2 — SPA foundation

- [ ] **Unit 3: [FP] App scaffolding — env, Supabase client, fonts, motion, vitest**

**Goal:** The SPA can hold configuration, talk to Supabase lazily, load the
handoff's fonts self-hosted, and run tests.

**Requirements:** R21 (tokens/fonts), R29; groundwork for everything after.

**Dependencies:** None (parallel with Phase A1).

**Files:**
- Create: `src/config.ts` (validated `import.meta.env` reader), `src/lib/supabase.ts`
  (lazy singleton), `vite-env.d.ts` additions, `.env.example`
- Create: `vitest.config.ts`, `src/state/__tests__/` (seed with one trivial test)
- Modify: `package.json` (deps: `@supabase/supabase-js`, Fontsource packages,
  vitest; script `test`), `tailwind.config.js` (font families per handoff:
  Fraunces, Inter, Spline Sans Mono, Caveat; phase-color tokens as hsl),
  `src/index.tsx` (font CSS imports), `index.html` (preload above-the-fold faces)

**Approach:**
- `src/config.ts` fails fast with a clear message when env is missing
  (env-less-build learning: never construct the Supabase client at module
  scope; `src/lib/supabase.ts` constructs on first call).
- Env names: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the project is on
  legacy anon JWT keys — verified in The120's code; the `sb_publishable_`
  migration is separate later work), `VITE_T120_API_URL`. Set in Vercel
  per-environment.
- Auth-surface check (pairs with the Key Decision): confirm the dashboard's
  actual signup/CAPTCHA settings and write the accepted-exposure record —
  neither lever can flip in Slice A (both break live The120 flows; see Key
  Decisions). Informational, not a merge gate.
- Migrate `motion` usage toward `LazyMotion` + `m` in new components; existing
  components keep working (`framer-motion` already installed).

**Test scenarios:**
- Happy path: config parses when all vars present.
- Error path: missing var → boot-time error naming the variable (not an
  `undefined/rest/v1` fetch hang).

**Verification:**
- `npm run build` succeeds with envs; `npm run test` runs; fonts render from
  same-origin woff2 (no fonts.googleapis.com requests); app boots env-less in
  dev with the clear failure message.

- [ ] **Unit 4: [FP] GameContext v2 — stage machine, multi-idea model, ledger kinds**

**Goal:** The state layer matches the fpv2 handoff: stages, up to 5 ideas with
per-idea `fields`/`done`, active idea, backing/sale ledger, celebrations,
picker, and derived selectors — as a pure, tested reducer.

**Requirements:** R21 (multi-idea mechanics), R19 (state shape that persists).

**Dependencies:** Unit 3 (vitest).

**Files:**
- Create: `src/state/gameCore.ts` (pure reducer + selectors, no React),
  `src/state/__tests__/gameCore.test.ts`
- Modify: `src/state/GameContext.tsx` (wraps the core; keeps provider API
  stable for existing components during the transition), `src/data/path.ts`
  (em-dash sweep on 1.1/1.2 copy; XP values 60/120 per handoff)

**Approach:**
- State per handoff §State Management: `stage`, `ob` index, `profile`
  (child firstName/handle; parent fields arrive in Slice B), `ideas:
  {fields, done}[]` max 5, `activeIdea`, `sales[]` with `kind: sale|backing`,
  `pickFor`, `runnerOpen`, `celebrate`, `room`, checkout overlay, avatar pos.
- Derived: `nextUpFor(idea)`, `isStepDone(stepId, idea)`, backing/revenue
  sums, per-idea progress, room eligibility (previous criterion complete),
  sequential room unlock, idea-picker candidate set.
- Every action is a pure event on the core (enables the outbox/serialization
  in Unit 6 and exhaustive tests without DOM).

**Execution note:** Test-first on the core — the multi-idea eligibility rules
are the heart of the game and the likeliest source of subtle bugs.

**Patterns to follow:** existing `GameContext.tsx` selector naming; handoff
§Multi-idea model rules verbatim.

**Test scenarios:**
- Happy path: Idea #1 exists from onboarding; completing 1.1 tasks 1–5 marks
  criterion done, unlocks 1.2 (The Sales Room) and fires the celebration event.
- Happy path: creating Idea #2 appends `{fields:{}, done:{}}`, sets it active,
  opens the runner at 1.1.1.
- Happy path: logging a sale adds a `kind: sale` ledger row and auto-completes
  task 1.2.5 for the active idea; a checkout backing adds `kind: backing`.
- Edge case: room click with one eligible idea auto-selects it; with two
  eligible ideas emits `pickFor`; with none is a no-op.
- Edge case: 6th idea creation refused; idea slots beyond next are inert.
- Edge case: `@artifact`-prefixed tasks auto-complete when the artifact exists
  (existing mechanic preserved for 1.1/1.2 data).
- Error path: actions referencing an out-of-range idea index are ignored
  (stale-event tolerance for the outbox replay).
- Integration: a serialized save-doc round-trips through the reducer
  (hydrate → act → snapshot) without loss.

**Verification:**
- Core test suite green; existing floor/rooms still function against the
  wrapped provider (manual smoke at both breakpoints).

- [ ] **Unit 5: [FP] Login screen + session lifecycle**

**Goal:** Children sign in (name or email + password) through The120's route;
sessions persist, log out cleanly, and drafts are account-scoped.

**Requirements:** R1, R2, R4, R6, R8 (client side).

**Dependencies:** Units 2, 3; Unit 4 for the stage machine.

**Files:**
- Create: `src/screens/Login.tsx`, `src/lib/auth.ts` (login call, setSession,
  logout, onAuthStateChange wiring), `src/lib/draftCache.ts`
  (account-namespaced localStorage helpers), `src/lib/__tests__/draftCache.test.ts`
- Modify: `src/App.tsx` (stage routing: no session → login), `src/components/Hud.tsx`
  (child name chip + always-visible "Log out")

**Approach:**
- POST to `VITE_T120_API_URL/api/fp/login`; on success
  `supabase.auth.setSession(tokens)` then load save (Unit 6) and route to
  `onboard` or `app`.
- Error copy: one kid-friendly generic message ("Hmm, that name and password
  don't match. Check the spelling and try again, or ask your grown-up.") for
  every refusal — no unknown-vs-wrong distinction (R4 enumeration resistance;
  no em dashes).
- Session: supabase-js localStorage persistence + auto-refresh, singleton
  client. Idle logout (~45 min no interaction) and explicit logout both call
  `supabase.auth.signOut()` — revoking the refresh token server-side, not
  just flipping `stage` — and purge `sb-*` session keys (an unrevoked
  refresh token on a shared Chromebook is the child's whole The120
  identity). Per the Key Decision: idle logout PRESERVES the same user's
  `fp:<uid>:*` drafts/outbox (restored on same-user re-login); explicit
  logout and different-user login purge all `fp:*` keys.
- Boot: `stage: boot` while session restore + save fetch resolve; no landing
  flash for a logged-in child.
- Draft cache keys `fp:<userId>:...`; on login with a different userId than
  cached → wipe all `fp:*` keys before hydrating; explicit logout wipes too
  (R6; shared-Chromebook learning). Drafts hold task text only — no PII.
- HQ visual language per handoff tokens; 390px layout; ≥44px targets.

**Patterns to follow:** handoff signup screens' card/input styling (HQ white
card, Fraunces headings); `RoomShell` overlay conventions.

**Test scenarios (draftCache pure module):**
- Happy path: same-user re-login restores drafts; keys are `fp:<uid>:` scoped.
- Edge case: different-user login wipes every `fp:*` key before hydration.
- Edge case: explicit logout purges drafts and outbox for the current user;
  idle logout preserves the same user's drafts and outbox entries.
- Error path: corrupted JSON in a draft key is discarded, not thrown.

UI scenarios (manual, pre-launch): wrong password shows the generic message;
session survives reload; idle timeout returns to login without losing an
unsent Step Runner draft (it restores after re-login as same user).

**Verification:**
- A real The120 student logs in on a phone-sized viewport, closes the tab,
  reopens: still signed in. Log out → drafts gone, back at login. A parent
  credential shows the same generic failure as a typo.

- [ ] **Unit 6: [FP] Server sync — save snapshots, ledger writes, outbox**

**Goal:** Game progress survives devices: snapshot upserts with revision
guard, append-only ledger inserts, flush-on-hide, retry outbox.

**Requirements:** R19, R23; origin R6 (no silent loss).

**Dependencies:** Units 1, 4, 5.

**Files:**
- Create: `src/lib/sync.ts` (load/save/ledger/outbox), `src/lib/__tests__/sync.test.ts`
- Modify: `src/state/GameContext.tsx` (wire reducer events → sync layer)

**Approach:**
- On login: fetch `fp_player_saves` for own profile (the row always exists —
  the login route seeds it at revision 0); doc empty → `onboard` stage seed;
  else hydrate reducer and skip completed onboarding.
- Saves: debounce ~3s after last action + 30s max interval; CAS update
  `set doc, revision = base+1 where profile_id = :p and revision = :base`,
  with `.select('profile_id')` appended — PostgREST returns 200 with no
  error on a zero-row update, so guard rejection is detected by returned row
  count, never by error. Zero rows → refetch, rebase local actions, retry.
  No client insert path at all.
- Ledger: one insert per sale/backing with client-generated UUID `id`; a
  replayed insert whose id already exists surfaces 23505 — classify
  23505-on-the-ledger-PK as success and resolve the outbox entry (a
  retry-forever loop on duplicate ids is the documented retry-storm shape).
  Never update, never delete; totals derive from ranged selects with an
  explicit cap (PostgREST silently truncates at ~1000 rows — cap the ledger
  display and note the server-side aggregate as later work).
- Flush on `visibilitychange: hidden` + `pagehide` with `fetch(...,
  {keepalive:true})` — note this bypasses supabase-js, so the `apikey` +
  `Authorization` headers must be attached manually or the write fails
  silently. Keepalive rejects bodies over ~64KiB — on rejection, park in the
  outbox (flush the small ledger delta via keepalive; let a large snapshot
  ride the outbox). Unsent events + snapshot park in the account-scoped
  outbox (Unit 5's cache) and replay on next boot/`online`. Errors classify
  three ways: retryable (network/RLS-expiry → outbox replay), CAS rejection
  (→ refetch/rebase), terminal (constraint/trigger violations → park without
  replay + persistent "couldn't save" indicator — a doc past the size cap
  would otherwise retry-storm forever). The save doc carries `docVersion`;
  outbox entries carry `v` (see Key Decisions).
- Duplicate the ownership filter (`eq('profile_id', ...)`) in every query
  (RLS performance guidance).

**Execution note:** Test-first on the outbox/revision rules (pure); network
calls stubbed at the module seam.

**Test scenarios:**
- Happy path: action → debounced snapshot write carries `base+1` revision;
  ledger insert fires immediately with a stable client id.
- Edge case: two tabs — the tab with the stale base revision gets a zero-row
  update response (no error object), classified as guard-rejection →
  refetch/rebase, never clobber; a stale tab with MORE local actions still
  loses (CAS equality, not counter comparison).
- Edge case: offline actions accumulate in the outbox; `online` replays in
  order; a replayed ledger insert whose id exists resolves as success (23505
  classified), not an infinite retry.
- Error path: RLS refusal (expired session) parks the write in the outbox and
  surfaces the login stage, not a crash.
- Error path: keepalive rejection (body too large) parks the snapshot in the
  outbox instead of dropping it.
- Error path: a terminal server rejection (check-constraint violation such as
  the doc size cap, or the revision trigger raise) is classified as
  non-retryable — parked WITHOUT replay and surfaced as a persistent
  "couldn't save" state, never an infinite retry loop.
- Edge case: a save doc or outbox entry with an unknown `docVersion`/`v` is
  discarded or migrated at hydrate/replay, never fed to a newer reducer.
- Integration (manual, real RLS): a second child's session cannot read or
  write the first child's save/ledger rows (verifies Unit 1's policies from
  the client).

**Verification:**
- Complete a task on device A; log in on device B: progress intact. Kill the
  tab mid-play: the last action survives (flush or outbox replay). Saving
  indicator shows saving/saved states.

### Phase A3 — the fpv2 game surfaces

- [ ] **Unit 7: [FP] Landing page**

**Goal:** The parent-facing landing page per handoff §A, at the `landing` stage.

**Requirements:** R21; Slice B boundary (CTA → login for now).

**Dependencies:** Unit 3 (fonts/tokens); Unit 4 (stage machine).

**Files:**
- Create: `src/screens/Landing.tsx` (+ small local components for the
  browser-frame mockup, phase cards, CTA band)
- Modify: `src/App.tsx` (stage wiring), assets copied from
  `artifacts/fpv2prototype/design_handoff_v1_user_flow/assets/` into `src/assets/`

**Approach:** Recreate §A pixel-faithfully (hero 2-col, AZEAP browser mockup
rotated -1.5deg, payment float card, dark Path section, 3-step cards, parchment
CTA band). Both CTAs route to login until Slice B. Mobile: single column,
mockup scales, no horizontal scroll.

**Test scenarios:**
- Test expectation: none — static presentation; verified visually per
  CLAUDE.md at 390px and desktop.

**Verification:** Side-by-side with prototype screens 01; 390px pass; no em
dashes; fonts/tokens exact.

- [ ] **Unit 8: [FP] First-run in-game onboarding (screens 2–5)**

**Goal:** An existing child's first login flows through founder profile →
website reveal → money booth → The Path, with the 5-segment progress bar and
step 1 pre-completed, landing on the floor with handle + Idea #1 (origin R5).

**Requirements:** R5, R21.

**Dependencies:** Units 4, 5, 6.

**Files:**
- Create: `src/screens/Onboarding.tsx` (four screens + progress bar),
  `src/state/__tests__/onboarding.test.ts` (core transitions)
- Modify: `src/state/gameCore.ts` (ob stage events), `src/App.tsx`

**Approach:** Handoff §B screens 2–5 verbatim (founder profile with live
handle preview seeded from the profile's handle; typed website reveal at
18ms/2-char with terracotta caret; money-booth tier chips + checkmark copy;
Path screen with Sell highlighted). Segment 1 renders pre-filled (Sell
terracotta) with step-1 marked complete. Completing screen 5 seeds Idea #1,
persists the save, enters `app`.

**Test scenarios (core):**
- Happy path: ob advances 2→5; completion seeds exactly one idea and marks
  onboarding done in the save doc.
- Edge case: reload mid-onboarding resumes at the same screen (save-backed).
- Edge case: a save with onboarding complete never re-enters `onboard`.
- Error path: handle collision from the profile is impossible client-side
  (handle comes from the server profile) — assert the screen renders the
  server-provided handle read-only-ish per handoff (editable first name, not
  handle ownership).

**Verification:** A fresh The120 student account walks 2–5 on a 390px
viewport, lands on the floor with name tag, handle, Idea #1; second login
skips straight to the floor.

- [ ] **Unit 9: [FP] Factory floor v2 — Path / Company / Products rows + Sell floor**

**Goal:** The handoff's floor: three rows of compact cards, phase-bordered
floor panel, avatar walking, and the Sell-phase sub-floor (5 rooms, sequential
unlock, Your Ideas row with the only new-idea entry point).

**Requirements:** R21, R22.

**Dependencies:** Units 4, 6 (state + persistence); Unit 3 (tokens).

**Files:**
- Modify: `src/components/FactoryFloor.tsx`, `src/components/MobilePath.tsx`,
  `src/components/PodCardContent.tsx`, `src/data/rooms.ts` (fpv2 card
  inventory/geometry), `src/components/Hud.tsx` (phase chip, Sales/Profit
  stats, founder chip; drop XP/website link per handoff)
- Create: `src/components/SellFloor.tsx` (shared content, both breakpoints)

**Approach:**
- Row 1 Path (5 phase cards, locked styling per handoff), Row 2 Company (Your
  Site, Checkout Booth, dashed placeholders), Row 3 Products (read-only idea
  summaries, not clickable). Sell card → Sell floor (back pill, 5 room cards
  with pips/stamps/"You are here", Your Ideas row: current chip, "＋ Start
  Idea #N" as the only creation point, later slots faint).
- Preserve the `walkTo`/`onWalk`/`onArrived` lifted-intent contract for every
  new clickable card on both variants (breakpoint learning is binding); keep
  `MobilePath`'s bottom padding for the coach dock.
- Idea-picker dialog when a room has multiple eligible ideas (`pickFor`).

**Test scenarios (core selectors already covered in Unit 4; UI checks manual):**
- Integration (manual): tap a room on mobile at 639px, rotate/resize across
  640px and 1024px mid-walk — navigation completes on the new variant (regression
  guard for the documented breakpoint bug).
- Manual: locked rooms (1.3–1.5) show "Coming in the next build" and are
  inert; products row cards have no hover/click affordance.

**Verification:** Screens 08–09 fidelity check; 390px + desktop pass;
walk-then-open behavior on both variants.

- [ ] **Unit 10: [FP] Step Runner + celebrations**

**Goal:** The task dialog (rail, task body, inputs, "I did it") and the
criterion-passed celebration with wax stamp and unlock listing.

**Requirements:** R21; R6 (draft preservation).

**Dependencies:** Units 4, 6, 9.

**Files:**
- Create: `src/components/StepRunner.tsx`, `src/components/Celebration.tsx`
- Modify: `src/App.tsx` (runner/celebration mounted above the breakpoint
  conditional — dialog state lives in App-level state, not inside a variant)

**Approach:** Handoff §Step Runner verbatim: Sell-tint header with idea badge,
5-segment task rail, numbered chip + time estimate, Fraunces 900 label, "how"
paragraph, per-idea saved inputs (through the reducer → sync), "Done when"
callout, ✓ advance + Back to Floor. Celebration: wax stamp spring, "+N XP",
"New on The Path" unlock box, Keep going. Inputs write drafts to the
account-scoped cache on keystroke (survives expiry per R6) and to the save doc
on task completion.

**Test scenarios:**
- Happy path (core, added to gameCore tests): completing the 5th task of 1.2
  via the runner fires the 1.2 celebration listing "1.3 · The Learning Room".
- Edge case: closing the runner mid-task keeps typed input (draft cache);
  reopening restores it.
- Manual: runner is full-screen below `sm`, floating dialog above; open runner
  survives a breakpoint crossing.

**Verification:** Screen 10 fidelity; a full 1.1 run end-to-end persists all
five answers server-side (visible after re-login).

- [ ] **Unit 11: [FP] Room dialogs + mock Stripe checkout**

**Goal:** Your Site, Checkout Booth (with ledger), Sales Room (log a sale),
Idea Room, and the two-pane mock Stripe checkout overlay that writes
`kind: backing, source: mock` ledger rows.

**Requirements:** R21, R23.

**Dependencies:** Units 4, 6, 9.

**Files:**
- Create: `src/components/rooms/YourSite.tsx`, `src/components/rooms/CheckoutBooth.tsx`,
  `src/components/rooms/SalesRoom.tsx`, `src/components/rooms/IdeaRoom.tsx`,
  `src/components/MockCheckout.tsx`
- Modify: `src/App.tsx` (PANELS map swap to fpv2 rooms), retire/park unused
  legacy panels (Workshop/Command/etc. stay out of the fpv2 floor)

**Approach:** Per handoff §Rooms and §G: Your Site (editable headline →
written into the save doc via the normal sync path — profiles are
service-role-write-only; "Edits publish instantly"), Checkout Booth (offer
card + Open the live checkout + ledger list with backing/sale tinting and the
empty-state line), Sales Room (customer+amount form → `kind: sale` ledger row
→ auto-completes 1.2.5), Idea Room (read-only one-liner + pitch). Mock
checkout: `pay.firstprofit.school/<handle>` framing, amount picker, read-only
4242 card fields, success stamp + credit line; writes the backing and updates
the Sales stat. Checkout overlay state lives at App level (breakpoint rule).

**Test scenarios:**
- Happy path (core): mock checkout success appends `{kind: backing, source:
  mock}`; Sales stat sums backings; Sales Room submission appends `{kind:
  sale}` and completes 1.2.5 (celebration when last).
- Edge case: ledger renders the empty state until the first row; amounts are
  whole dollars per the picker (no free-text amounts in checkout).
- Error path: ledger insert failing offline parks in the outbox; the UI still
  shows the optimistic row with the saving indicator.
- Manual: overlay reachable from onboarding screen 4's "See your live
  checkout" and from the Checkout Booth; full-screen on mobile.

**Verification:** Screens 06 and 11 fidelity; backing → HUD Sales updates;
rows visible after re-login on another device.

### Phase A4 — hardening

- [ ] **Unit 12: [FP + T120] End-to-end verification pass**

**Goal:** The Slice A success criteria from the origin doc hold against
production infrastructure, and every screen passes the mobile bar.

**Requirements:** Origin Success Criteria (Slice A subset), R20 review, R22.

**Dependencies:** All prior units.

**Files:**
- Create: `docs/solutions/` entries for anything non-obvious discovered
  (both repos, house frontmatter)
- Modify: whatever the pass turns up

**Approach / checklist:**
- Real-account flows: existing student name+password login → onboarding →
  task 1.1.1 → cross-device persistence; parent credential refused
  generically (and its minted session verified revoked, scoped — the
  parent's other The120 sessions stay live); explicit logout wipes drafts
  AND revokes the session; idle timeout revokes but preserves same-user
  drafts. (Email-shaped identifiers refuse generically by design in Slice A —
  do not chase that as broken.)
- RLS probe with a second real child session (cannot touch the first's rows,
  cannot re-point its save at another profile, cannot forge ledger
  `source`/`profile_id`); service-role-only writes confirmed for profiles.
- Attacker-with-anon-key probes (from Unit 2's scenario list): `signUp`,
  direct `signInWithPassword` on a derived address, `updateUser` mutations —
  each recorded blocked or accepted.
- R20 review artifact: enumerate what an FP-minted authenticated session can
  reach across the whole shared project — the parent-scoped policies on
  `parents`/`children`/`deposits`, `gauntlet_saves` own-row writes, the
  anon-granted `gauntlet_leaderboard()` public surface, and `storage.objects`
  policies keyed on `path_role_grants` — and record mitigation or accepted
  exposure per surface in a solutions entry.
- Deleter audit: enumerate The120's existing `children`/`auth.users` deletion
  paths and record each verdict against the new RESTRICT FKs; document the
  FP-aware deletion order (ledger → saves → profile → child).
- 390px + desktop pass over every screen (landing, login, onboarding 2–5,
  floor, Sell floor, runner, all four rooms, checkout, celebrations);
  breakpoint-crossing checks mid-walk and mid-dialog; ≥44px targets;
  `useReducedMotion` honored.

**Test scenarios:**
- Test expectation: none — this unit executes the manual/E2E checklist above;
  automated coverage lives in Units 2, 4, 5, 6, 8.

**Verification:** Every checklist item recorded pass/fail; failures fixed or
filed before Slice A is called done.

## System-Wide Impact

- **Interaction graph:** New The120 route `/api/fp/login` sits outside
  `proxy.ts`'s matcher (verified: the matcher never covers `/api/*`).
  `fp_player_profiles` FKs into `children`/`auth.users` with RESTRICT: CRM
  parent deletion now also blocks on FP profiles (same intended behavior as
  the path graph) — Unit 12 must enumerate every existing deleter of
  `children`/`auth.users` in The120 (provisioning compensation cleanup, CRM
  removal paths) and record each verdict (23503-now accepted vs needs an
  FP-aware deletion order: ledger → saves → profile → child). This ordering
  is also the data-deletion path origin R28 depends on — record it durably.
- **Error propagation:** SPA network failures degrade to outbox + optimistic
  UI, never data loss; login-route refusals are one generic shape; RLS
  refusals surface as re-login, not crashes.
- **State lifecycle risks:** stale-tab clobbering is bounded by the revision
  guard; retired legacy panels must not retain write paths into the new save
  doc (stale-writer learning — the save doc versions via `revision`, and any
  future shape change must consider open tabs).
- **API surface parity:** the login route is the only new public surface;
  password reset stays on `/fp` (existing, parent-gated). Slice B will reuse
  the profile-upsert path — keep it in a pure module the signup route can
  import.
- **Integration coverage:** real-RLS probes (Units 1, 6, 12) cover what
  injected fakes cannot (the zero-policies-vs-PostgREST learning).
- **New principal reach (R20 scope):** an FP-minted child session is a full
  The120 `authenticated` session — it reaches every `to authenticated` grant
  in the shared project, including the parent-scoped policies on
  `parents`/`children`/`deposits`, `gauntlet_saves` (own-row insert/update)
  and the anon-granted `gauntlet_leaderboard()` (renders free-text handles
  publicly), and any `storage.objects` policies keyed on `path_role_grants`.
  If public email signup is enabled, anyone can mint such a principal without
  The120 at all. The Unit 12 R20 review names each surface with a mitigation
  or written accepted exposure.
- **Unchanged invariants:** no edits to existing The120 tables, policies,
  triggers, or `/fp` behavior; `path_student_profiles` remains the identity
  authority (FP profiles must agree where both exist, DB-enforced);
  first-profit's two-breakpoint architecture and coach-padding contract are
  preserved. (Note: "no auth email in Slice A" holds only for FP's own code —
  a child session can invoke Supabase Auth email flows directly with the anon
  key, which is exactly why the auth-surface decision in Unit 3 exists.)

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| The anon key is a parallel, un-gated auth surface: direct `/token` calls against derivable `.invalid` addresses bypass the route's limiters; `signUp` may mint fresh authenticated principals; `updateUser` lets a live child session change its own email/password past the parent-gated reset | Unit 3 auth-surface decision (disable public signup unless needed; enable Supabase Auth CAPTCHA — the only lever covering direct `/token` — or document accepted exposure) before Unit 5 merges; Unit 12 attacker-perspective probes with recorded outcomes |
| Migration lands in a taken version slot / against dormant prerequisites; a policy silently skips under RLS-enabled | MIGRATION-LOCK ritual: re-read the lock file + live ledger query immediately before authoring; `to_regclass`, `pg_constraint`, `pg_policies`-per-command, `relrowsecurity` post-apply checks; read back the version row (Unit 1) |
| Login route becomes an enumeration/brute-force oracle for child accounts | Constant-shape refusals (timing residual from 0–5 candidate verifications stated as accepted, matching `/fp`'s posture), atomic pre-I/O `(ip, identifier)` limiting with outage release, attested-IP header (leftmost XFF is spoofable), no existence branching, refused logins revoke their minted session (Unit 2) |
| In-memory rate limiter is per-instance on Vercel — and the endpoint is publicly reachable at deploy, not at launch | Not treated as launch-deferred: CAPTCHA/auth-surface decision is a Unit 2/3 gate; durable-store limiter recorded as pre-public-launch work |
| FP-minted sessions reach every `to authenticated` grant in the shared project (parents/children/deposits policies, gauntlet_saves, leaderboard, storage.objects) | R20 whole-surface review is an explicit Unit 12 deliverable naming each surface with mitigation or written accepted exposure |
| A stolen refresh token from a shared Chromebook is the child's whole The120 identity, indefinitely | signOut() on idle + explicit logout (server-side revocation) + `sb-*` purge (Unit 5); residual exposure recorded in the R20 review |
| Client-forged ledger rows poison Phase 2/3 reconciliation (append-only = no cleanup) | Insert policy pins `source='mock'` + amount bounds + ownership `with check`; only service role writes `stripe_test`/`live` (Unit 1); Unit 12 probes it |
| Cross-origin token handoff leaks tokens | POST-only, no-store, origin allowlist (browser-misuse constraint only — not authorization), tokens never in URLs or logs (Unit 2) |
| Two identity link tables drift (`fp_player_profiles` vs `path_student_profiles`) | DB trigger rejects contradictory pairs (mechanism); login route checks first (friendly path) (Units 1–2) |
| GameContext rewrite breaks existing floor mid-build | Unit 4 wraps the pure core behind the current provider API; surfaces migrate room-by-room in Phase A3 |
| Save clobbering or bricking from stale tabs / hostile revision values | CAS-equality guard with zero-row detection + DB trigger enforcing `revision = old+1` + login-route-seeded row (Units 1, 6) |
| Half-built fpv2 ships publicly (push-to-main = production on firstprofit.school) | Long-lived feature branch with Vercel preview deploys until Unit 12 passes (operational note) — "pre-launch" is a mechanism, not a posture claim |
| Vercel/Vite env misconfiguration ships a hanging build | Fail-fast config module; lazy client construction (Unit 3; env-less-build learning) |

## Documentation / Operational Notes

- **Deploy gating:** first-profit's push-to-main deploys straight to
  production firstprofit.school. Phase A2–A3 work happens on a long-lived
  feature branch with Vercel preview deploys; main gets it only when Unit 12
  passes. (The current live demo keeps serving until then.) The [T120] units
  have no such gate — `/api/fp/login` is publicly reachable the moment Unit 2
  merges, weeks before Unit 12's probes run; its hostile-facing posture
  (limits, generic refusals, scoped revocation) must be complete IN the
  merge, not hardened later. The120 preview deployments may have Vercel
  Deployment Protection enabled — verify before relying on preview-based
  route testing.
- Vercel (first-profit project): add the Supabase URL/key and `VITE_T120_API_URL`
  per environment before Unit 5 merges.
- The120: no new env vars expected (route uses existing Supabase envs); no new
  crons; `vercel.json` untouched.
- Record the Unit 12 accepted-exposure review and any migration-apply learnings
  as `docs/solutions/` entries (both repos use the same frontmatter scheme).
- Slice B planning should start from this plan's login-route pure modules and
  the origin doc's R9–R17.

## Sources & References

- **Origin document:** docs/brainstorms/2026-07-31-fpv2-the120-accounts-requirements.md
- UI spec: `artifacts/fpv2prototype/design_handoff_v1_user_flow/README.md` [FP]
- Key code: `src/state/GameContext.tsx`, `src/components/FactoryFloor.tsx` [FP];
  `app/fp/lib/actions/sign-in.ts`, `app/fp/lib/provision-rules.ts`,
  `supabase/migrations/20260808120000_funnel_projects_policies.sql`,
  `supabase/MIGRATION-LOCK.md` [T120]
- External: Supabase docs — setSession, RLS guide, auth rate limits, API-key
  migration; Next.js route-handler CORS reference; Fontsource; motion.dev
  LazyMotion.
