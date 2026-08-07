---
module: fp-auth
tags: [rls, shared-database, supabase, accepted-exposure, r20, threat-model, deleter-audit, minors]
problem_type: security_issue
severity: high
date: 2026-08-01
---

# R20: what a First Profit child session can reach across The120's shared Supabase project (accepted-exposure record)

First Profit (Slice A) mints real Supabase sessions for children who log in via
The120's `/api/fp/login`, and the SPA then talks to the **shared** The120
Supabase project directly with the anon key under RLS. Origin requirement R20
demands enumerating everything such a session can reach across the whole shared
project (not just the new FP tables) and recording the accepted exposure. This
is that record, produced by a read-only review of every `authenticated`-role
policy and grant in `../120-The120/supabase/migrations` plus a deleter audit of
The120 code. It is the security posture of record for Slice A.

## The child session's identity facts (these drive every verdict)

- Genuine `auth.users` session, role `authenticated`, `auth.uid()` = the child.
- **No `parents` row** (a child is not a parent), **no `path_role_grants`**, not
  in `staff`. So every policy keyed on `auth.uid() = parent_id`,
  `is_active_staff()`, or a `path_role_grants` lookup evaluates to empty/false.

## What a child session CAN reach

- Its **own** FP rows only: read `fp_player_profiles`/`fp_player_saves`/
  `fp_ledger`; update its own save (revision forced `+1` by trigger, `doc`
  capped 256KiB, `profile_id` not in the update grant so un-repointable); append
  its own **mock** ledger rows (`source='mock'`, amount 1..100000, `created_at`
  not grantable so it defaults to `now()`). All own-row scoped with USING +
  explicit WITH CHECK (migrations `20260827120000`, `20260828120000`).
- Public read-only aggregates via SECURITY DEFINER functions granted to
  anon/authenticated: `seats_claimed()`, `gauntlet_leaderboard()`,
  `gauntlet_tournament_leaderboard()`.
- Its own `gauntlet_saves` / `gauntlet_daily_sprints` rows (Gauntlet is a
  separate free product; see residual #1).

## What a child session CANNOT reach (verified by policy analysis)

- **No other child's or any parent's data on any table.** `parents`,
  `children`, `deposits`, `projects`, `funnel_student_provisioning` are all
  parent-scoped; the child holds no `parents` row, so every one returns zero
  rows (read AND write). This is the crux: cross-tenant isolation holds not by
  an FP-specific guard but because the pre-existing parent-scoped policies are
  empty for a non-parent principal.
- **No staff/CRM data** — `families`, `child_reviews`, `crm_audit_log`,
  `library_*`, `nurture_sends`, `gtm_*`, `staff` are gated on
  `is_active_staff()` = false.
- **No path/fw/funnel internals** — RLS-enabled with ZERO policies (service-role
  only): all `path_*`, `fw_*`, and funnel internal tables, and
  `gauntlet_tournament_entries` (so the tournament leaderboard cannot be
  polluted). `path_evidence` storage read requires a `path_role_grants` the
  child lacks.
- `change_door_and_invalidate_project(...)` is SECURITY INVOKER over
  parent-scoped tables → a no-op returning `'locked'` for a child.

## The anon key is a parallel auth surface (confirmed live)

Live auth config on project `deolvqnyvhhnavsifgxz` (read via Management API,
2026-08-01): `disable_signup: false`, `external_email_enabled: true`,
`mailer_autoconfirm: false`, `security_captcha_enabled: false`,
`password_min_length: 6`. So with only the SPA's anon key an attacker can:

- `signUp` a fresh `authenticated` principal (public signup is ON). That
  principal is NOT a child (no FP profile) — it reaches only its own empty FP
  rows and the gauntlet surfaces. It cannot become a First Profit player without
  the service-role login route creating a profile.
- `signInWithPassword` directly against a derived `s-<childId>@students.the120.invalid`
  address, bypassing `/api/fp/login`'s rate limiter — but still needs the
  correct password, and success yields only that child's own scoped data.
- `updateUser` with a live child session to change its own email/password,
  bypassing the parent-gated `resetStudentPasswordAction`.

**Accepted for Slice A** (as the plan documented): neither mitigation lever can
flip without breaking live The120 flows — disabling public signup breaks
The120's account modal (a tested, deliberate `signUp` path), and project-wide
CAPTCHA would break every existing The120 client-side `signInWithPassword` (CRM,
dashboard, funnel, `/fp`). The route-level limiter is the live control. The real
fix (captcha-token plumbing across The120's sign-in surfaces, then enabling
CAPTCHA; and raising `password_min_length`) is owned pre-public-launch work
outside Slice A. Note `password_min_length: 6` at the project level is below the
student password rule (10, enforced server-side by `validateStudentPassword`);
the project-level value only governs the blocked-in-Slice-A email-signup path.

## Residual items (recorded, not fixed in Slice A)

1. **Gauntlet leaderboard pollution** (pre-existing, widened by FP). Any
   `authenticated` session — now including every FP child — satisfies
   `gauntlet_saves` own-row insert/update (`auth.uid() = user_id`) and can set an
   **unbounded free-text `handle`**, an arbitrary `trial_best`, and an
   **uncapped `save` jsonb**, all surfaced on the public `gauntlet_leaderboard()`
   (fabricated scores, arbitrary published strings, a storage-abuse blob). NOT
   cross-tenant (WITH CHECK defaults to the USING `auth.uid() = user_id`, so no
   tenant crossover). FP's only contribution is widening the population of
   authenticated sessions. Recommend either explicit accept (Gauntlet is a
   separate low-stakes free product) or a The120-side `handle` length/charset
   check + `save` size cap + server-validated `trial_best`. Contrast:
   `fp_player_profiles.handle` IS bounded (`^[a-z0-9]{1,30}$`) and
   `fp_player_saves.doc` IS capped (256KiB) — the FP tables applied the
   discipline gauntlet_saves lacks.

2. **Deleter gap / R28 data-rights.** The new `fp_player_profiles` FKs into
   `children` and `auth.users` are `ON DELETE RESTRICT` (matching the existing
   `path_student_profiles` posture). So deleting a child or their auth user now
   fails with 23503 while FP game data exists. The one parent-facing children
   DELETE (`removeChildCore` in `../120-The120/app/lib/funnel/form-step-core.ts`
   — currently retired/un-wired) catches only the guard's "in review or paid
   deposit" raise; a 23503 from the FP FK falls through to a generic `"failed"`,
   NOT attributed to First Profit data. No service-role FP deletion path exists.
   Before R28 (parent-requested deletion/export) can be honored, a service-role
   deletion must be built in this order:
   `fp_ledger → fp_player_saves → fp_player_profiles → (path graph if present) → children / auth.users`.
   If `removeChildCore` is ever re-wired, it must special-case the FP FK 23503.

3. **Handle is a minor's derived identity.** `fp_player_profiles.handle` derives
   from the child's first name and is published at `firstprofit.school/<handle>`;
   bounded/validated but flagged in-migration for pre-launch product review.
   **RESOLVED 2026-08-03 (owner decision): accepted with parent disclosure.**
   First-name handles stay (core to the real-storefront product feel); the
   parent notice email (The120 `artifacts/First Profit/parent-notice-2026-08-03-draft.md`)
   discloses the URL shape and offers a different handle on request.

## Re-checks

- **2026-08-02 (Phase A, cohort instrument):** added `fp_task_feedback` —
  child-INSERT-only under RLS with a column-scoped grant and an ownership-gated
  daily cap trigger (FP429), plus fill-only `/api/fp/grade`. Both audited in
  their own units; posture unchanged otherwise.
- **2026-08-03 (Phase B/C, path content engine + business model):** re-audited
  the whole branch diff for new child-reachable surface. NONE added: no new
  tables, policies, grants, RPCs, or endpoints; every PostgREST target in
  `src/lib/sync.ts` predates the branch. The only DB-visible change is a larger
  `fp_player_saves.doc` (recomputed worst case ~58KiB, within the 256KiB CHECK).
  The companion The120 trigger (`fp_player_saves` BEFORE UPDATE monotonic-key
  guard, branch feat/fp-save-doc-guard) runs as table owner on the same row the
  child could already update — it narrows data-loss risk and adds no reach.
- **2026-08-03 (real public site, Units 1–6; branches first-profit
  feat/real-public-site + the120 feat/fp-public-site):** the branch pair adds
  ONE new anon-callable surface and one new server-side anon-key consumer, and
  CLOSES residual #2. Details:
  - **`fp_public_site(handle)` is a new anon-callable SECURITY DEFINER RPC**
    (the120 migration `20260907120000_fp_public_sites.sql`; companion grants in
    `20260908120000_fp_public_sites_ops.sql` — both AUTHORED, NOT YET APPLIED
    at this re-check). Like `seats_claimed()`, it is reachable DIRECTLY at the
    shared project's Supabase URL with only the anon key — **outside
    firstprofit.school's WAF rate limits, and outside the serving function's
    noindex headers**, so the page-level mitigations do not cover it. What it
    reveals, per state (verified against the migration source + its parity
    test):
    - published AND NOT operator_locked → the sanitized triple only
      (`first_name`, `headline`, `one_liner`) plus the `'published'`
      discriminator. `headline`/`one_liner` are clamped (120/140) AND
      blocklist-screened at the shared extraction
      (`fp_public_site_content`/`fp_clamp_public_text`). `first_name` is
      DIFFERENT: a verbatim copy of `children.first_name` (roster data),
      validated only at signup as a trimmed 1–80-char string (zod
      `childFirstName`, no charset or blocklist pass) and bounded by the
      table's 80-char CHECK — which REJECTS an over-long service-role write
      (falls to the endpoint's outage branch) rather than truncating. It is
      HTML-escaped at render, but published unscreened.
    - ever-published but currently hidden (parent-unpublished or
      operator-locked) → the `'offline'` discriminator with NULL content — an
      attacker learns a page existed, never what it said.
    - never-published claim OR unknown handle → **zero rows, byte-identical**.
      This is the enumeration-resistance core: `first_published_at` (stamped
      only by the first publish, structurally implied by a CHECK when
      `published=true`) gates row visibility, so the anon RPC can never be a
      registry oracle for children who claimed but never went public. The
      tables themselves have RLS with zero policies and full anon/authenticated
      revokes — the RPC is the ONLY public read.
  - **`api/site.ts` (first-profit) is a new SERVER-SIDE anon-key consumer** —
    the repo's first serverless code. It reads `SUPABASE_URL`/
    `SUPABASE_ANON_KEY` from Vercel server env (never the `VITE_` bundle vars)
    and calls only `fp_public_site(handle)`; it holds no service key and no
    session, so its compromise ceiling is exactly the anon surface above.
  - **Residual #2 (deleter gap) is now CLOSED for the FP graph.** The new
    `fp_public_sites.profile_id` FK is `ON DELETE RESTRICT` (matching the
    documented posture) and JOINS the documented service-role deletion ordering
    as its FIRST step: `sites → ledger → saves → profile → child`. The erase
    path itself was amended in the120 in Unit 2 (`app/lib/funnel/
    erase-family-core.ts` + `scripts/erase-fp-family.ts`): the site row is
    deleted first, handle disposition is an explicit recorded decision (never a
    CASCADE side effect), and an operator-locked handle release is logged
    loudly (`site-locked-released`). The deletion round-trip is covered by a
    Unit 2 test; a live page can no longer outlast its child's erasure, and
    the previously-flagged 23503 fall-through can no longer strand FP data
    behind a live public page.
  - **Accepted residuals (recorded, bounded):** (a) PUBLISHED pages are
    scrapable via the anon RPC at whatever rate the Supabase project allows —
    accepted because the exposed set is exactly the sanitized triple the
    public page serves anyway, publishing is an explicit parent-notified act,
    and takedown (parent unpublish / operator lock) removes content from the
    very next RPC call; (b) the serving layer's SWR cache
    (`s-maxage=5, stale-while-revalidate=55`) can serve taken-down content for
    up to ~60s per region after an unpublish/lock — the Unit 7
    `Vercel-Cache-Tag` purge decision covers shrinking this. Content-safety
    enforcement lives at the lowest shared writer (the SQL extraction), per
    the120 `docs/solutions/security-issues/content-safety-must-live-at-the-
    lowest-shared-writer-not-the-api-endpoints-2026-08-03.md`.
  - Child-session reach is otherwise unchanged: the new `/api/fp/site/*`
    endpoints are service-role-mediated, require a session resolving to an
    existing `fp_player_profiles` row (not merely any anon-key-minted
    `authenticated` principal), and are fail-closed gated
    (`FP_SITE_TEST_ONLY`); no new table grants, policies, or client-reachable
    columns were added.

- **2026-08-05 (New User Flow v3, Unit 5 — the sign-in HANDOFF; the120 branch
  `feat/new-user-flow-v3`):** a SECOND route now mints exactly the session this
  document threat-modeled, so a re-check was owed. Reach is **unchanged**;
  recorded here so the absence of change is on the record rather than assumed.
  - **The new route:** `POST /api/fp/handoff/exchange` (the120) trades a
    one-time code for a child session. The code is minted by a parent-session
    Server Action on the account-ready screen of the v3 signup and rides to
    firstprofit.school in a URL fragment; Unit 6 builds the `/auth/enter`
    landing that spends it.
  - **Same session kind, by the same mechanism.** The session is minted for the
    same derived `s-<childId>@students.the120.invalid` identity, through the
    same stateless (`persistSession:false`) client, and the 200 body is the same
    token pair `/api/fp/login` returns — the two routes now share the response
    type and the serialized refusal string outright. The principal that comes
    out is therefore identical in every respect this document reasons about: an
    `authenticated` role, `auth.uid()` = the child, no `parents` row, no
    `path_role_grants`, not in `staff`. **R20's reach analysis above applies
    verbatim and needs no amendment** — nothing in "CAN reach" or "CANNOT reach"
    moves, no table, policy, grant, RPC, or client-reachable column was added,
    and the SPA still talks to the shared project with the anon key exactly as
    before.
  - **The new table is closed by the same posture as the other internals.**
    `fp_handoff_codes` is RLS-on with **ZERO policies (service-role only)** —
    the same shape as `fp_signup_attempts` and the `path_*`/`fw_*` tables listed
    under "CANNOT reach". A row there is a bearer credential for a child's
    session, so a child session (or any anon-key principal) can neither read nor
    write it. Its child FK is `ON DELETE CASCADE` — deliberately, as operational
    ephemera rather than compliance evidence — so it adds **no new RESTRICT edge
    to the documented erase ordering** and residual #2 stays closed.
  - **Revocation is scoped, not global.** Where the exchange mints a session it
    then declines to hand over (identity disagreement, profile-ensure refusal),
    it calls `admin.signOut(accessToken, "local")` — the login route's rule,
    for the login route's reason: a `"global"` sign-out would turn this
    anonymous, cross-origin endpoint into a remote force-logout of every device
    for any account whose session it can cause to be minted.
  - **Not a new finding.** This is a re-check confirming no new reach. The
    handoff's own controls (256-bit code, sha256 at rest, single-use CAS, 120s
    TTL, child binding, Origin allowlist, IP rate limit) are documented in
    `../120-The120/app/api/fp/handoff/handoff-rules.ts` and are about protecting
    the code, not about widening or narrowing what the resulting session reaches.

- **2026-08-05 (New User Flow v3, Unit 7 — the COMIC COVER on the session body;
  both repos, branch `feat/new-user-flow-v3`):** the shared session body grew
  two OPTIONAL fields, so the same re-check was owed. Reach is **unchanged**;
  recorded here for the same reason the Unit 5 entry is.
  - **What was added:** `coverUrl` and `coverStatus` on the 200 body of BOTH
    sign-in doors (`POST /api/fp/login` and `POST /api/fp/handoff/exchange`),
    emitted by one shared pure function (`deriveCoverSessionFields`) so the two
    doors cannot diverge. Both are OMITTED — not nulled — when the child has no
    cover, which is every child provisioned before v3.
  - **No new reach, and no new data leaving the project.** `coverStatus` is a
    status word from the child's own row. `coverUrl` is a
    `data:image/svg+xml;base64,…` cover stored on that same row
    (`children.fp_cover_data_url`), rendered ONCE during the child's own parent
    signup and served verbatim. Its only personal content is the child's FIRST
    NAME, their AGE, and their own story answers — all of which the parent
    supplied about their own child, and the first of which the SAME BODY
    already carries in `profile.firstName`. The recipient is unchanged (the
    child who just authenticated), the transport is unchanged (the same 200),
    and no new table, policy, grant, RPC, or client-reachable column is
    involved: the columns are read by service-role code and are not reachable
    by the child session itself.
  - **No new table posture to state.** The artifact lives in TEXT columns on
    `fp_onboarding_drafts` (RLS-on, zero policies, service-role only) and
    `public.children` (existing policies, unchanged — migration
    20260917120000 adds no policy and grants nothing). No object store, so no
    new bucket, no new key namespace, and nothing added to the documented
    erase ordering.
  - **Erasure (R28) is unaffected, deliberately.** The cover is a COLUMN on
    rows that erasure already destroys — the draft row and the child row — so
    deleting the child deletes the cover, with no sweep to remember and no
    orphan class to create. This is precisely why a TEXT column was chosen over
    a blob for ~2 KB of SVG. The inert blob-erasure task stays inert: there are
    still no blobs.
  - **Not logged, and never inlined.** Neither field is written to any log line
    on either door (both are spread into the response object and nowhere else).
    On the First Profit side the value is gated by `asCoverUrl`
    (`src/lib/cover.ts`) — base64 SVG data URLs only, size-bounded — and is
    rendered ONLY as an `<img src>`, never via `dangerouslySetInnerHTML` or an
    inline `<svg>`. That distinction is load-bearing: SVG is live markup, and
    the compositor's XML escaping is written for the sandboxed `<img>` parsing
    context. The same gate runs again on the way OUT of the localStorage
    profile cache, because localStorage is writable by anything on the origin
    and is not a trusted source for having been ours once.
  - **Not a new finding.** A re-check confirming no new reach.

## Prevention / how to reuse this

- **When an app adds a session to a SHARED database, the threat surface is every
  `authenticated`-reachable policy in the whole project, not just the new
  tables.** Enumerate them all; for each, reason about what YOUR new principal
  type resolves to (here: a child has no `parents` row, so parent-scoped
  policies are empty — that is what makes it safe, and it must be verified, not
  assumed).
- **A new principal type widens the population of every role-wide grant.** Audit
  pre-existing `to authenticated` / anon-granted surfaces (leaderboards, public
  RPCs, storage) for what the new, larger, and here younger population can now
  do — pollution and abuse, not only data theft.
- **RESTRICT FKs into shared tables silently break existing deleters.** Any new
  FK into a table other apps delete from needs a deleter audit and a documented
  service-role deletion order.
- Sibling records:
  `docs/solutions/security-issues/rls-with-check-pins-values-not-columns-column-scope-the-grant-to-protect-created-at-2026-07-31.md`
  (../120-The120) and the shared-device isolation pair in this repo.
