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
