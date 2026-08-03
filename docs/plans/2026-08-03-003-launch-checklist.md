---
title: "Real public site — ordered launch checklist (Unit 7)"
type: runbook
status: ready-to-run (human/gated)
date: 2026-08-03
plan: docs/plans/2026-08-03-002-feat-real-public-site-plan.md
---

# Real public site — launch checklist

The single ordered runbook to take `firstprofit.school/<handle>` live. Nothing
here runs automatically; each box is a deliberate operator step. Steps marked
**DONE-BY-CODE** are already satisfied by artifacts on the branches (link
given) and need only be confirmed present in the deployed revision; everything
else is **OPERATOR-ACTION** (cannot be performed from a working tree).

Companion the120-side detail: the120
`docs/runbooks/2026-08-03-fp-public-site-operations.md` (gate env semantics,
fp:site-lock, /fp/family takedown, reconciliation query, migration order).

Nothing is user-visible until the FINAL step: `VITE_` flags are baked into the
one production bundle, so "enable" is global — the ordering below exists so
every prior step happens dark.

## 1. Database (shared Supabase project) — OPERATOR-ACTION

- [ ] Confirm the LIVE `supabase_migrations.schema_migrations` top is
      `20260906120000` (fp_save_doc_guard). If not, RENAME both new migration
      files to the true next-free 12:00:00 slots before applying (ritual in
      each file header). Apply via the Management API playbook — never write
      the ledger by hand.
- [ ] Apply the120 `supabase/migrations/20260907120000_fp_public_sites.sql`
      (registry + reserved/blocklist seeds + projection trigger + anon RPC).
      *(Migration itself: DONE-BY-CODE, the120 feat/fp-public-site.)*
- [ ] `NOTIFY pgrst, 'reload schema';`
- [ ] Run the 20260907 header's **POST-APPLY VERIFICATION** — all 7 steps:
      (1) seed three-state probe rows (published / unpublished-ever-published /
      never-published); (2) anon-key RPC per state — published row, offline row
      with NULL content, and ZERO rows byte-identical to an unknown handle;
      (3) grants catalog check (`has_function_privilege` for anon +
      authenticated on `fp_public_site(text)`, false for
      `fp_public_site_content(jsonb)`; `proconfig` search_path pin);
      (4) trigger presence/timing on `fp_player_saves` (AFTER, beside the two
      BEFORE guards); (5) direct-table anon read refusal; (6) projection probe
      under a real child JWT (docVersion 1 projects clamped; docVersion 2
      skips); (7) teardown, sites first. The apply is NOT complete until this
      passes.
- [ ] Apply the120 `20260908120000_fp_public_sites_ops.sql` (service-role
      EXECUTE grant + `fp-site-lock` audit action). CAUTION: it drops and
      re-adds `crm_audit_log_action_check`, which validates against the full
      `crm_audit_log` table — on a large audit log, run at a quiet moment.

## 2. Deploy the120 — endpoints live but CLOSED — OPERATOR-ACTION

- [ ] Deploy the120 (branch feat/fp-public-site) with `FP_SITE_TEST_ONLY` and
      `FP_SITE_TEST_ALLOWLIST` **unset** — the gate is FAIL-CLOSED (unset =
      allowlist-only with an empty allowlist = closed to everyone). The child
      self-read is deliberately ungated and answers `none` while dark.
      *(Gate logic: DONE-BY-CODE, `app/api/fp/site/site-rules.ts`
      `siteGateVerdict` + tests.)*

## 3. Deploy first-profit — serving layer DARK — OPERATOR-ACTION

- [ ] Deploy first-profit (branch feat/real-public-site) to production with
      `VITE_ENABLE_PUBLIC_SITE` **unset/false** and the server env vars
      `SUPABASE_URL` + `SUPABASE_ANON_KEY` set in the Vercel project (names
      pinned by `api/site.ts`; documented in `.env.example`). This ships
      `vercel.json` + the `api/site.ts` function dark: the flag is off and no
      claims exist, so every handle 404s.
      *(vercel.json + function + reserved exclusions incl. `your-name` +
      `their-name`:
      DONE-BY-CODE — `vercel.json`, `api/site.ts`,
      `api/_lib/reservedHandles.ts`, pinned by
      `api/_lib/__tests__/vercelConfig.test.ts`.)*
- [ ] Verify SPA routes and assets on PRODUCTION, at minimum:
      - `https://firstprofit.school/` (landing renders)
      - `https://firstprofit.school/signup/verify?token=x` (SPA, not 404)
      - `https://firstprofit.school/assets/<a-built-asset>` (serves untouched)
      - `https://firstprofit.school/some-unclaimed-handle` (the function's 404
        page, NOT the SPA landing)
      - `https://firstprofit.school/signup` (SPA — reserved word excluded from
        the handle rewrite)
- [ ] Delete the Vercel DASHBOARD catchall rewrite (one source of truth: the
      repo-committed `vercel.json`). Re-verify the URLs above after deletion.

## 4. Preview verification (crawler path) — OPERATOR-ACTION

Run against a PREVIEW deployment with Deployment Protection OFF or a bypass
token in hand (prior-plan caution: previews 401 the anonymous-crawler path
otherwise). This executes the PREVIEW-DEPLOY CHECKLIST pinned in
`api/site.ts`:

- [ ] Deployment Protection off / bypass token works for an anonymous fetch
- [ ] `/signup/verify?token=x` still reaches the SPA
- [ ] `/assets/*` (and other built files) serve untouched
- [ ] unknown handle → the function's 404 page (not the SPA landing)
- [ ] mixed-case `/Handle` → 308 → lowercase
- [ ] `/SIGNUP` (uppercase reserved) → 308 → `/signup` → SPA (no loop)
- [ ] `/cedric?handle=evil` — verify which value Vercel's query merge feeds
      `req.query.handle` and that the page served matches the PATH handle
      (extraction takes the first array value — see `api/_lib/handlerSupport.ts`)
- [ ] a claimed+published handle renders the learner page — verified LIVE at
      ~390px AND desktop
- [ ] link pasted into a REAL messaging app shows the learner's headline
      (og:title/og:description)
- [ ] confirm which client-IP header the platform sets on live requests
      (WAF keying + the120 `extractClientIp` assumption)

## 5. WAF rate limiting — OPERATOR-ACTION

- [ ] Add ONE rate-limit rule covering `/:handle` traffic (the `/api/site`
      destination) AND the availability path, keyed by client IP. Action
      **LOG first** → observe real traffic → flip to **DENY**. **NEVER
      Challenge** — link-preview crawlers must be able to fetch pages, and a
      challenge breaks the share-with-preview moment.
- [ ] Separately consider the AUTHED claim/availability bucket thresholds: a
      learner cycling suggestions in onboarding must never be locked out
      (the120 already runs roomy per-user + per-IP app-level buckets —
      `SITE_AVAILABILITY_RATE_LIMIT` 60/15min, `SITE_IP_RATE_LIMIT` 240/15min;
      any WAF rule on that path must sit ABOVE those budgets).
- [ ] Note: the anon RPC at the Supabase URL is OUTSIDE this WAF — that
      exposure is recorded and accepted in the R20 record (2026-08-03
      re-check).

## 6. Cedric test family end-to-end (PREVIEW client, allowlisted backend) — OPERATOR-ACTION

REQUIRED MECHANISM (Unit 7 review): the driving client is a PREVIEW
deployment with `VITE_ENABLE_PUBLIC_SITE=true` in the PREVIEW env only —
preview envs build their own bundle — pointed at production the120, whose
gate is scoped by the allowlist. **`VITE_ENABLE_PUBLIC_SITE` stays OFF in
production until step 9.**

> STRUCK ALTERNATIVE — "run the test in production scoped by the allowlist"
> (the plan's original either/or): the VITE flag is GLOBAL (baked into the one
> production bundle), so enabling it in production for a scoped test would
> show EVERY child the live claim UI while every non-allowlisted claim dies
> on the server's generic 401 — rendered client-side as retry-inviting
> "outage" copy. A client bundle cannot scope per-account. Revisit only if a
> client-visible gate state (server-driven "not for you yet" signal) ever
> ships.

- [ ] the120 production env: `FP_SITE_TEST_ONLY` left ON (default) and
      `FP_SITE_TEST_ALLOWLIST=<cedric family fp_usernames, comma-separated>`
- [ ] `VITE_ENABLE_PUBLIC_SITE=true` in the PREVIEW env for the driving
      client (production VITE flag stays unset/false)
- [ ] Full loop (republish legs are ACTOR-SPECIFIC — the asymmetry is by
      design and must be asserted, not assumed):
      claim → publish → **parent email received** → page renders at the real
      URL (390px + desktop) → parent unpublish via `/fp/family` → page offline
      (allow the ~60s SWR window) →
      **CHILD in-app republish** → live again, content re-synced, AND
      **re-notification email received** (the R21 notification belongs to the
      child publish endpoint's hidden→visible transition) →
      parent unpublish again → **PARENT republish via `/fp/family`** → live
      again but **NO email sent and content NOT re-synced** (flag flip only —
      `setSitePublishedForParent`; assert the inbox stays empty for this leg)
- [ ] `npm run fp:site-lock` lock/unlock round-trip on the test handle
      (ACTOR set; audit row present; locked page offline; publish-while-locked
      stays invisible)
- [ ] Measure takedown latency during the unpublish step (feeds step 7)

## 7. Vercel-Cache-Tag purge decision — OPERATOR-ACTION

- [ ] Decide, from the measured latency: is the SWR window
      (`s-maxage=5, stale-while-revalidate=55` — up to ~60s/region of stale
      content) acceptable for BOTH takedowns (unpublish/lock) and ordinary
      edits? If not, implement `Vercel-Cache-Tag` + purge-on-transition as a
      follow-up before (or promptly after) launch. Record the decision here.

## 8. Policy gate — OPERATOR-ACTION

- [ ] **COPPA policy check sign-off** (launch gate carried from the origin
      doc — outside this plan's units). No child data is public until the
      final step, so the flag stays off until this box is checked.

## 9. GO LIVE — OPERATOR-ACTION (final, deliberate, reversible)

- [ ] Set `VITE_ENABLE_PUBLIC_SITE=true` in first-profit's Vercel PRODUCTION
      env and redeploy (bundle-baked: this enables claim/publish UI for every
      learner).
- [ ] Set `FP_SITE_TEST_ONLY=off` in the120 production (opens
      claim/availability/publish for all FP children;
      `FP_SITE_TEST_ALLOWLIST` may be removed).
- [ ] Post-launch watch: first real claims land; parent emails deliver; watch
      for publish crash-window suspects (reconciliation query in the 20260907
      OPS NOTE / the120 fp-public-site operations runbook §4).

## Rollback

- **Functional rollback (first choice, instant):** flags off —
  `FP_SITE_TEST_ONLY` back to unset (fail-closed) and/or
  `VITE_ENABLE_PUBLIC_SITE` unset + redeploy. Existing published pages can be
  taken offline per-page via parent unpublish or `fp:site-lock`.
- **Migration rollback (two-tier, per the 20260907 header):** the projection
  trigger and the RPC are droppable independently — saves are unaffected;
  pages go 404 and `api/site.ts` renders "temporarily unavailable" (503),
  never an error page. The TABLE is not dropped once any real claim exists; a
  claimed handle is never released except via the documented deletion ordering
  (sites first).
- **Serving rollback:** revert `vercel.json` (or re-add the dashboard
  catchall) to send everything back to the SPA; the function is inert without
  the rewrite.
