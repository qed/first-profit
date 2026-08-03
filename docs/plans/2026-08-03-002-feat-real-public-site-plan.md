---
title: "feat: Real public site at firstprofit.school/<handle>"
type: feat
status: active
date: 2026-08-03
origin: docs/brainstorms/2026-08-03-real-public-site-requirements.md
deepened: 2026-08-03
---

# feat: Real public site at firstprofit.school/&lt;handle&gt;

**Target repos:** `first-profit` (primary) and `the120` (companion backend units, marked per unit). All paths are relative to their unit's repo root.

## Overview

Make the product's central promise real: when a learner claims a handle in onboarding, a real, shareable, logged-out-viewable page exists at `firstprofit.school/<handle>`, shows their headline and idea one-liner, carries proper link-preview meta tags, and updates within seconds when they edit in the game. Includes: a handle registry with atomic claims, the repo's first server-side code (a Vercel Function + `vercel.json`), a sanitized public read surface in the shared Supabase project, parent notification + parent/operator unpublish via the120, and in-game claim/visit/publish-state UI.

## Problem Frame

Today the "website" is a mock: onboarding fakes an "available" badge, the Your Site room fakes a browser frame, and `firstprofit.school/cedric` boots the SPA to the landing page (see origin: docs/brainstorms/2026-08-03-real-public-site-requirements.md). This plan implements the twice-reviewed requirements doc; product behavior questions were resolved there and are not re-opened here.

## Requirements Trace

From the origin doc (IDs preserved): R1–R4, R15, R16 (claiming); R5–R10, R17, R18 (public page); R11, R12, R19, R20, R24 (publishing); R21–R23 (parent safety net); R13, R14 (in-game). Success criteria: share-with-preview moment, edit→refresh within seconds, uniqueness under race, parent notify + one-action takedown, existing app paths untouched.

## Scope Boundaries

Carried from origin: no payments UI on the page, no approval gate/moderation queue, no visitor report affordance, no themes/customization, no search indexing, no learner-visible analytics, no handle renames. Additional planning boundaries: no changes to the login/username model; no seeding of legacy usernames (R16 removes it); the COPPA policy check is a launch gate outside this plan's units.

## Context & Research

### Relevant Code and Patterns

- `src/App.tsx` + `src/screens/signup/verifyLink.ts` — the one URL-path precedent (pure boot-URL reader, injected location, overrides stage routing). The `/handle` public route in the SPA is NOT needed: the Vercel Function serves the page; the SPA never sees `/handle` requests.
- `src/lib/sync.ts` — sync engine: `flushPending()` (exported immediate flush), `DEBOUNCE_MS=3000`, `MAX_INTERVAL_MS=30000`, CAS via `saveSnapshot` (zero-row = stale), `classifyWriteError` (P0001/CHECK violations = TERMINAL; PGRST204/42703 = retryable), localStorage outbox, session-generation guard.
- `src/state/gameCore.ts` — `SaveDoc` (docVersion 1; new fields must be additive-optional with defaulting in `fromSaveDoc`, never a version bump), `toSaveDoc`/`fromSaveDoc`, `SET_ONBOARDING_COMPLETE` (only writer of the completion flag).
- `src/lib/auth.ts` — the120 client: `${t120ApiUrl}/api/fp/*`, flat `{ok:false}` results, never throws. New handle/site endpoints follow this file's discipline.
- `src/state/GameContext.tsx` — hydrate flow (`hydrateAndRoute`), `RESET_SESSION`, profile patch at login, idle logout, engine ref (private — expose `flushNow()` on `GameApi`).
- `src/screens/Onboarding.tsx` + `src/screens/onboarding/screens.tsx` — pure props-driven screens; `ob` index in-memory only (resume at screen 2); `deriveHandle` display fallback; completion sequence `CREATE_IDEA` → `SET_ONBOARDING_COMPLETE` → `SET_STAGE app`. NOTE (verified during review): parent signup does NOT render these screens — `src/screens/Signup.tsx` has its own screen set and explicitly does not re-render onboarding; no handle UI exists in signup and none is added by this plan.
- `src/components/rooms/YourSite.tsx` — mock frame + headline editor; `src/screens/Factory.tsx` `ROOM_META`; rooms open via `OPEN_ROOM` reducer state (survives breakpoint swaps).
- `src/config.ts` — `getConfig()` env validation; feature-flag precedent `isSignupEnabled()` / `VITE_ENABLE_SIGNUP` (optional, defaults off).
- Tests: colocated `__tests__`, vitest (node default env; jsdom opt-in per file), injected-deps pure modules (`finishSignup(deps, req)` pattern), fake-timer sync-engine tests.

### Institutional Learnings

- `docs/solutions/integration-issues/additive-column-plus-unconditional-write-a-missing-column-error-classifies-terminal-and-drops-the-row-park-it-2026-08-02.md` — deploy ordering: apply migration → `NOTIFY pgrst, 'reload schema'` → verify queryable → ship client code; PGRST204/42703 already retryable.
- `docs/solutions/security-issues/async-writer-closes-over-per-session-key-but-reads-live-shared-state-guard-with-a-generation-token-2026-08-01.md` — any new async claim/publish path must re-check the session generation before mutating state; captured IDs alone are insufficient on shared devices.
- `docs/solutions/logic-errors/split-storage-append-only-table-is-write-only-until-you-add-an-explicit-read-back-2026-08-01.md` — the registry/site status is a new store: design the read-back with the write; round-trip test across sessions.
- `docs/solutions/security-issues/in-memory-reducer-state-survives-logout-on-shared-devices-reset-explicitly-2026-07-31.md` — new state slices join `RESET_SESSION` and HYDRATE explicitly.
- `docs/solutions/security-issues/r20-fp-child-session-reach-across-the-shared-supabase-project-accepted-exposure-2026-08-01.md` — anon key is a live parallel auth surface; public reads must go through a narrow SECURITY DEFINER function exposing only the published sanitized subset; this exposure record must be amended.
- `docs/solutions/logic-errors/client-minted-idempotency-key-does-not-prevent-double-submit-2026-08-01.md` — DB unique constraint is the claim arbiter; `useRef` in-flight guard; unique-violation is a designed UX branch.
- `docs/solutions/logic-errors/a-client-that-authors-and-hashes-consent-text-itself-can-never-match-the-servers-echo-check-echo-the-servers-rendered-artifact-2026-08-01.md` — the120 is the source of truth for handle validity/blocklist; the client receives rules/results, never re-authors them.
- `docs/solutions/ui-bugs/breakpoint-crossing-drops-navigation-2026-07-31.md` — claim/publish in-flight intent lives above the breakpoint conditionals.
- the120 repo: `docs/solutions/best-practices/no-transaction-multi-step-write-compensation-post-write-verify-cas-scoped-claim-2026-07-22.md` — pattern for claim+notify multi-step writes.

### External References

- Vercel rewrites & filesystem precedence: https://vercel.com/docs/project-configuration/vercel-json, https://vercel.com/docs/routing/rewrites (rewrites check filesystem first; ordered, first match wins; named params pass as query string; negative lookaheads must be wrapped in a capture group; `source` is case-sensitive; no fall-through after a rewrite matches).
- Vite on Vercel SPA fallback: https://vercel.com/docs/frameworks/frontend/vite
- Functions (`api/` directory, Node default runtime, fluid compute): https://vercel.com/docs/functions
- CDN caching (`s-maxage` stripped before client; per-region cache; SWR): https://vercel.com/docs/caching/cache-control-headers
- WAF rate limiting (dashboard/CLI rules; per-region fixed windows; do NOT use Challenge on pages crawlers must fetch): https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- Prior-plan cautions: verify the client-IP header on a live preview; Deployment Protection on previews will 401 the anonymous-crawler path (docs/plans/2026-07-31-001-feat-fpv2-slice-a-game-login-plan.md).

## Key Technical Decisions

- **"Go live" is an explicit the120 endpoint call, never inferred from save-doc writes.** The sync engine runs during onboarding, so partial saves land before completion; a projection trigger alone would make abandoned onboardings look published (violating R9b). The FP client calls `publish` at the end of each claim flow — onboarding completion for new accounts, immediately after a successful in-room claim for existing accounts (their onboarding never re-runs, so claim IS their go-live moment and triggers the parent email then). the120 flips `published=true` and sends the parent email in the same request — co-locating flag and notification solves the cross-backend exactly-once problem, with `first_published_at` as the single idempotency marker. Publish is also the authoritative content refresh: it re-syncs headline/one-liner/first_name from the current save doc and profile before flipping the flag. Honest guarantee: the client must `await flushNow()` and see a LANDED result before calling publish; if the flush parks (offline) the client shows the R19 not-live-yet state and retries flush+publish on room open — a parked flush means the page's first render may lag until the outbox replays, which is stated, not hidden. `flushNow()` therefore surfaces the flush outcome (landed / parked / cas-rescheduled), a small extension of `flushPending()`.
- **`first_published_at` distinguishes R9b from R9d.** `published=false` alone cannot separate "claimed but never published" (must be indistinguishable from unclaimed — otherwise the anon RPC becomes a registry-enumeration oracle for children who never went public) from "unpublished by parent" (renders the offline state). The read function returns `offline` only when ever-published; never-published claims return the same empty result as unknown handles.
- **The projection trigger clamps, never raises.** A trigger `RAISE` is P0001 → TERMINAL in `classifyWriteError`, which would drop the learner's entire snapshot over a long headline. Length caps at the projection are enforced by truncation; blocklist screening for headline/one-liner is client-side at commit for UX (R19b), with the projection's clamp as the cap backstop. No CHECK constraints on save-doc content.
- **Two independent flags: `published` (parent/child-controlled) and `operator_locked` (operator-only, always wins).** A parent republish cannot override an abuse takedown. The public read exposes the page only when `published AND NOT operator_locked`.
- **Public reads go through one SECURITY DEFINER function** (`fp_public_site(handle)`) returning the sanitized published subset (first_name, headline, one_liner, published-state discriminator). No anon SELECT grants on any table; availability/enumeration is not served by anon reads (per the R20 exposure record).
- **The claim arbiter is a DB unique constraint on the registry**, called through a the120 endpoint (service role) that enforces format, reserved words, and blocklist server-side; re-claiming your own handle is idempotent success; claims bind to the authenticated session (R24 at claim time).
- **Serving: repo-committed `vercel.json` + `api/site.ts` Vercel Function.** Rewrite order: charset-constrained single-segment `/:handle` (with grouped reserved-route exclusions) → `/api/site`; then SPA catchall → `/index.html`; `trailingSlash: false`. Filesystem precedence keeps `/assets/*` and `/api/*` working untouched. The dashboard catchall route is deleted after verification (one source of truth). Multi-segment deep links (`/signup/verify`) can never match the single-segment rule.
- **Editing while unpublished keeps the projection current** (republish shows the latest content) — simpler trigger, matches "republishing is equally simple."
- **Feature flag:** `VITE_ENABLE_PUBLIC_SITE` (client UI, following the `VITE_ENABLE_SIGNUP` precedent) plus a the120-side gate on the claim/publish endpoints. The serving function can deploy dark: unknown handles 404 until claims exist.
- **Function env:** the function reads Supabase with non-`VITE_` server env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) — `VITE_` vars are client-bundle vars and must not be the function's source.

## Open Questions

### Resolved During Planning

- Registry home: shared Supabase project table with unique constraint; writes only via the120 service role. (Grounded in the R20 exposure record + auth.ts endpoint pattern.)
- Serving architecture: `vercel.json` + `api/` function (R10-capable); SPA gains no client route for `/handle`.
- Parent notification transport: the120 email on the publish endpoint (it owns parent emails and the mailer from signup verify).
- Existing-account claim: no new interstitial machinery. The Your Site room body renders the claim UI (same component as onboarding) when no handle exists, and the floor's existing hint mechanism points there once. A successful in-room claim flows straight into publish (page live, parent notified) — parity with the onboarding path, and the only way existing accounts ever reach `published`.
- Parent signup: untouched. Signup has its own screens and no handle UI (verified); availability display during parent signup was considered and dropped — the handle could be sniped in the days before the child's first login, making a signup-time "available" badge a false promise. The claim moment is the child's onboarding/room, full stop.
- Operator surface: the120 admin (existing operator tooling), audit-logged there.

### Deferred to Implementation

- Exact suggestion-generation algorithm for taken handles (server-side; simple deterministic variants first).
- Final HTML/CSS of the public page and 404/offline states (design at ~390px during implementation; verify with screenshots).
- Precise WAF thresholds (start with Log action, observe, then Deny — per prior-plan caution, verify client-IP header on a live preview first).
- Whether `Vercel-Cache-Tag` purge is needed — scoped to BOTH publish freshness and unpublish/lock takedown latency (the SWR window can serve taken-down content for up to ~60s per region; measure during implementation).
- Handle disposition on account deletion beyond the recorded constraint (CASCADE frees the row; whether the handle should be retired instead of reclaimable is an open policy question carried from the origin doc — operator-locked handles must never be released either way).
- the120 mailer template copy for the parent notification (escaping requirement is already pinned in Unit 2).
- Whether the120's existing admin tooling can host the operator lock/unlock action with audit logging as assumed — verify at Unit 2 start; if absent, that unit grows a minimal audit-logged admin action.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart LR
  subgraph Visitor [Logged-out visitor / crawler]
    V[GET firstprofit.school/cedric]
  end
  subgraph Vercel [first-profit deployment]
    RW[vercel.json rewrites\n1. /:handle -> /api/site\n2. /(.*) -> /index.html]
    F[api/site.ts\nHTML + OG tags + noindex\nCache-Control s-maxage=5]
  end
  subgraph Supabase [shared Supabase project]
    RPC[fp_public_site handle\nSECURITY DEFINER]
    T[(fp_public_sites\nhandle UNIQUE, profile_id UNIQUE,\nfirst_name, headline, one_liner,\npublished, operator_locked)]
    SAV[(fp_player_saves)] -- clamping trigger --> T
  end
  subgraph The120 [the120 /api/fp/*]
    AV[availability]
    CL[claim - unique constraint arbiter,\nformat + reserved + blocklist]
    PB[publish - flips published,\nsends parent email once]
    UP[unpublish/republish - parent;\noperator lock separate + wins]
  end
  V --> RW --> F --> RPC --> T
  FP[FP client\nonboarding claim step,\nYour Site room,\nflushNow on commit] --> AV & CL & PB
  Parent[the120 parent surface] --> UP
  CL --> T
  PB --> T
  UP --> T
```

Publish lifecycle: `unclaimed → claimed (not published) → published ⇄ unpublished(parent)`, with `operator_locked` as an orthogonal override; content columns stay live in all states.

## Implementation Units

- [x] **Unit 1: Registry + projection schema (migration)** — shipped as the120 `20260907120000_fp_public_sites.sql` (feat/fp-public-site 07b710e); one-liner JSON path corrected to `ideas[i].fields.oneLiner`; reviewed (12 personas, 10 fixes applied) + compounded — *target repo: the120 (owns migrations for the shared project)*

**Goal:** `fp_public_sites` exists with atomic-claim semantics, a clamping content trigger, and a narrow public read function.

**Requirements:** R3, R4, R6 (render-boundary caps), R9, R15, R16, R17-adjacent (data for the page), R22 flags, R24.

**Dependencies:** None.

**Files:**
- Create: migration under the120's migrations dir (`fp_public_sites` table, `fp_public_site(handle)` SECURITY DEFINER function, clamping trigger on `fp_player_saves`)
- Create: reserved-words seed (table or checked-in list the endpoint reads)
- Test: the120 migration/DB test location per its conventions

**Approach:**
- Table: `handle` (UNIQUE, stored lowercase, CHECK charset `^[a-z0-9-]{3,20}$`), `profile_id` (UNIQUE — one site per learner, FK to `fp_player_profiles` **ON DELETE RESTRICT** — matching the shared schema's documented delete posture (the120 migration `20260827120000_fp_player_tables.sql`: RESTRICT throughout, ordered service-role deletion). `fp_public_sites` joins the documented deletion ordering as its FIRST step (sites → ledger → saves → profile → child), and that procedure decides handle disposition explicitly — which also guarantees an operator-locked handle is never silently freed. DELETE of the save row alone deliberately does not touch the projection), `first_name`, `headline`, `one_liner`, `published boolean default false`, `first_published_at` (null until first publish — the R9b/R9d discriminator and the notification idempotency marker), `operator_locked boolean default false`, timestamps. RLS: no client policies at all (service-role writes only; public reads only via the function).
- `fp_public_site(handle)`: SECURITY DEFINER with pinned `search_path`, marked STABLE, `EXECUTE` revoked from PUBLIC and granted explicitly to `anon`/`authenticated`; validates/normalizes its handle argument (charset + length) before querying. Returns the sanitized row (first_name, headline, one_liner) for `published AND NOT operator_locked`; returns the `offline` discriminator (no content) only when ever-published (`first_published_at` set) and currently hidden; never-published claims return the same empty result as unknown handles.
- Trigger on `fp_player_saves` INSERT/UPDATE: extract `doc->>'siteHeadline'` and the active idea's one-liner, truncate to 120/140, update the matching `fp_public_sites` row if one exists. **Never errors** (stronger than "never RAISE"): the body is wrapped in `EXCEPTION WHEN OTHERS THEN RETURN NEW`, and extraction is defensive before that — `jsonb_typeof` checks on `ideas`/element/string fields, active-idea index validated as a non-negative integer within `jsonb_array_length` before use (no bare `::int` cast on client-writable JSON; no negative-index access — Postgres `-1` means "last element", the client's `hasIdea` rejects it). Skip = key absent or not a string; an **empty string is a legitimate value and overwrites** (clearing a headline must propagate; the renderer falls back to defaults). The trigger gates on `doc->>'docVersion' = '1'` and skips on any other/missing version — a future doc shape must consciously update the trigger, never be misparsed by it. Migration header documents the exact JSON paths with a cross-reference to `first-profit/src/state/gameCore.ts` `toSaveDoc` and `src/state/floorSelectors.ts`; Unit 1 also adds a reciprocal note at the `docVersion` comment in `gameCore.ts`.
- The clamped-extraction SQL is factored into one function shared by the trigger and Unit 2's claim/publish backfill (single source of truth for the doc→projection mapping).
- Deploy ordering per the additive-column solution doc: apply → `NOTIFY pgrst, 'reload schema'` → verify → only then ship dependent code.
- Rollback story: the trigger and function are droppable independently (saves unaffected; pages go 404 — Unit 3 must render "temporarily unavailable", not a 500, when the RPC is absent). The table is not dropped once any real claim exists; functional rollback is the feature flags (Unit 7). A handle claimed by a real account is never released back to the pool except via account deletion.

**Patterns to follow:** the120's fp_ledger migration (2026-08-02) for ordering and RLS style; the R20 exposure record's SECURITY DEFINER precedent (`seats_claimed()`).

**Test scenarios:**
- Happy path: claimed+published row → function returns sanitized fields; unclaimed handle → empty/none result.
- Edge case (three offline-state cases): claimed-never-published (`first_published_at` null) → **none, indistinguishable from unclaimed**; ever-published-then-unpublished → `offline` discriminator, no content; `operator_locked=true` (regardless of `published`) → offline/none, never content.
- Edge case: trigger with 500-char headline → row stores 120 chars, save upsert succeeds; `siteHeadline: ""` → projection column becomes empty (clearing propagates).
- Error path (adversarial docs — every case: save upsert succeeds, projection updates correctly or is untouched): `activeIdea` = `"abc"`, `1.5`, `-1`, `999`; `ideas` = a string; idea element = a number; `oneLiner` = an object. Specifically assert `activeIdea: -1` does NOT project the last idea's one-liner.
- Error path: doc with `docVersion` ≠ 1 or missing → trigger skips, projection untouched, save succeeds.
- Integration: duplicate-handle insert → unique violation (the claim arbiter works at the DB).
- Integration: round-trip — save-doc upsert with new headline → projection row reflects clamp within the same transaction; stale-revision upsert (CAS mismatch, zero rows) → trigger does not fire, projection unchanged.

**Verification:** migration applies cleanly on a shadow DB; PostgREST schema reload verified; function callable with anon key returning only sanitized fields; grants and pinned `search_path` asserted in the migration test, not just the sanitized-fields check.

- [x] **Unit 2: Claim / availability / publish / unpublish endpoints** — shipped as the120 c9226bb (endpoints + /fp/family FamilySites + fp:site-lock CLI + erase-order amendment; blocklist moved into shared SQL extraction, publish CAS; 12-persona review + round-2 verify, all fixed; compounded) — *target repo: the120*

**Goal:** authenticated `/api/fp/*` endpoints govern the registry: **site self-read**, availability, atomic claim, publish (with parent email), parent unpublish/republish; operator lock via admin surface.

**Requirements:** R1–R4, R15, R16, R18 (auth'd-bucket rate limits), R21, R22, R24.

**Dependencies:** Unit 1.

**Files:**
- Create/modify: the120 route files under its `/api/fp/` module; mailer template for parent notification; admin surface action + audit log entry for operator lock
- Test: the120's API test conventions

**Approach:**
- Auth posture: all three child endpoints require a session that **resolves to an existing `fp_player_profiles` row** (a real FP child) — not merely any `authenticated` Supabase JWT, since the shared project's anon key can mint fresh authenticated principals (per the R20 record). `Authorization: Bearer` only, no cookie fallback (CSRF-resistant by construction, matching `src/lib/auth.ts`); CORS allowlist pinned to the FP origin. Parent-surface unpublish/republish follows the120's existing CSRF protection for session-authenticated mutations.
- `site` self-read (child session, GET): returns the account's own registry row status — `{ handle, status: none | claimed | published | offline }` (offline covers parent-unpublished AND operator-locked without distinguishing them to the child) — the read-back the split-storage lesson demands. This is what FP hydrate and room-open consume; the anon RPC cannot serve it (the client doesn't know its handle at hydrate, and never-published rows are deliberately invisible there).
- `availability` (child session): normalizes, checks format/reserved/blocklist, returns `available | taken | yours` (yours = this account's own handle; never identifies other owners); includes suggestion variants when taken. Generated suggestions pass through the identical validate→reserved→blocklist→availability pipeline as user input before being returned; suggestion count bounded.
- `claim` (child session): server-side re-validation, INSERT with the session's profile_id; unique-violation → `taken` result (designed branch, not error); re-claim of own handle → idempotent success; a second, different handle for an account that already holds one → rejected `already-claimed` (no rename in v1). The claim write snapshots `first_name` AND backfills `headline`/`one_liner` from the account's current `fp_player_saves.doc` in the same service-role transaction (using Unit 1's shared extraction function), so the projection row is content-complete from birth. The backfill and every publish-time refresh apply the120's blocklist to headline/one-liner server-side (offending strings stored empty → the renderer's default copy shows) — client screening is UX, this is the enforcement, since a save-doc write can bypass the client entirely (R20 threat model).
- `publish` (child session): idempotent via `first_published_at`; before flipping the flag it **re-syncs headline/one_liner from the current doc and `first_name` from the current the120 profile** (publish is the moment content becomes visible, so it is the authoritative refresh — closes the flushNow race and the trigger/claim interleaving window). First publish sends the parent notification email (the template escapes learner-controlled strings — handle, any headline excerpt — per email context, same discipline as renderSite); republish after a parent unpublish re-notifies; publish while `operator_locked` → nothing becomes visible, no email, response tells the client the locked/offline state. Missing/unreachable parent email → publish succeeds but flags for operator attention (notification is the discovery path — silent failure is logged loudly, not swallowed).
- `first_name` freshness: the120's profile is authoritative; visibility transitions (publish/republish) are the refresh points. A profile-name edit while published is eventually-consistent until the next republish — unless the120 already has a name-edit path, in which case that path also updates the projection (decide during this unit).
- `unpublish`/`republish` (parent session, the120 parent surface): flips `published`; cannot clear `operator_locked`. Operator lock/unlock is an admin action, audit-logged.
- Follow the multi-step-write compensation pattern (claim then notify: post-write verify, no distributed transaction pretense).

**Test scenarios:**
- Happy path: fresh claim → success; availability of a free handle → available; taken → taken + suggestions.
- Happy path: first publish sends exactly one email; second publish call sends none.
- Edge case: concurrent claims for the same handle → exactly one success, loser gets `taken`.
- Edge case: re-claim own handle after timeout-retry → success (idempotent); claim second handle → `already-claimed`.
- Error path: format-invalid / reserved / blocklisted handle → structured rejection, nothing inserted.
- Error path: publish with no parent email on file → publish succeeds, operator-attention flag recorded.
- Integration: parent unpublish → `fp_public_site()` returns offline; republish → content current (edits made while offline are visible); republish does not clear an operator lock; republish after parent takedown re-sends notification.
- Integration: claim uses the session's profile_id even if the request smuggles another id (R24).
- Error path: token from a freshly signed-up non-FP `authenticated` principal → rejected on all three endpoints, no availability data, nothing inserted.
- Edge case: publish while operator-locked → no page visible, no email, locked state in the response.
- Edge case: suggestions never include reserved, blocklisted, or taken handles.
- Integration: claim after saves already carry a headline → projection content-complete immediately; publish with a stale projection but newer save doc → page shows the doc's content.
- Integration: rename child in the120 → republish → page shows the new name.
- Integration (deletion round-trip): provision → claim → publish → run the documented service-role deletion ordering (amended to delete the site row first) → `fp_public_site(handle)` returns none, page 404s, ordering does not error on the new FK. (The "existing deletion path" is the documented procedure in the migration comments, not a callable endpoint — verify and amend that documentation in this unit.)

**Verification:** endpoint suite green in the120; manual: claim→publish→email received; parent unpublish→page offline.

- [x] **Unit 3: Serving layer — vercel.json + public page function** — code complete + reviewed (6 bundles, all findings fixed; 47 api tests); PREVIEW-DEPLOY CHECKLIST in api/site.ts is the outstanding live gate (Unit 7); compound doc deferred to post-preview per plan — *target repo: first-profit*

**Goal:** `firstprofit.school/<handle>` serves real HTML with per-page meta tags for all four R9 states; existing SPA routes and assets untouched.

**Requirements:** R5, R6 (render), R7, R8, R9, R10, R17, R18 (page bucket), R12.

**Dependencies:** Unit 1 (function reads `fp_public_site`). Deployable dark before Units 2/4–6.

**Files:**
- Create: `vercel.json` (trailingSlash false; rewrites: handle rule then SPA catchall)
- Create: `api/site.ts` (handler) and `api/_lib/renderSite.ts` (pure HTML renderer — testable without the Vercel runtime)
- Create: `api/_lib/__tests__/renderSite.test.ts`
- Modify: `vitest.config.ts` (extend include with `api/**/__tests__/**` and `api/**/*.test.ts` — the current include is `src/`-only, so api tests would be silently skipped), `tsconfig.json` (add `api` to include or add `api/tsconfig.json`), `package.json` (add `@vercel/node` types to devDependencies)
- Modify: `.env.example` (document `SUPABASE_URL`, `SUPABASE_ANON_KEY` server vars)

**Approach:**
- Rewrite source: single-segment, charset-constrained, grouped negative lookahead excluding single-segment app routes (`signup`, `login`, etc. — generated from the same reserved list Unit 1 seeds, kept in sync manually with a comment cross-reference). Multi-segment paths fall to the catchall automatically.
- Handler: the rewrite charset includes `A-Z` so mixed-case links reach the function (a lowercase-only rewrite would silently drop `/Cedric` to the SPA landing); the handler redirects to lowercase, with the `Location` constructed exclusively as `/` + the already-charset-validated lowercase handle — never echoed from `req.url` (no open-redirect/CRLF shapes). (Alternative of 404-ing mixed case was considered and rejected: hand-typed and auto-capitalized links from kids/parents are a mainstream arrival path.) Then query `fp_public_site` via PostgREST with anon key and render one of: published page / offline page (R9d, ever-published-only per Unit 1) / not-found (R9a-b, covers unknown AND claimed-never-published — the RPC returns identical results for both by design). RPC error or missing env → "temporarily unavailable" (R9c) with 503; not-found only on a definitive empty result.
- Escaping rule (state it in the module header): renderSite escapes every learner-sourced string (`first_name`, `headline`, `one_liner`) per context — HTML text, `<title>`, and attribute values (og:title/og:description `content`) — with newlines/control chars stripped before anything reaches the head; no string is ever concatenated raw.
- HTML: og:title (headline), og:description (one-liner or default), `<meta name="robots" content="noindex">` + `X-Robots-Tag: noindex`, inline mobile-first CSS (~390px), "Built with First Profit" footer → landing. Cache policy per state: published → `Cache-Control: public, s-maxage=5, stale-while-revalidate=55`; not-found/offline/503 → no or minimal `s-maxage` (a cached 404 at the onboarding-reveal moment would defeat the success criterion). 404/offline pages carry noindex too and their R9 copy.
- No SPA fall-through: every branch returns complete HTML with correct status (200/404/503).

**Patterns to follow:** house style flat error handling; pure renderer with injected data (like `verifyLink.ts` purity); origin-doc copy directions for the three non-published states.

**Test scenarios (renderSite as pure function):**
- Happy path: published site data → HTML contains headline, first name, og:title/og:description, noindex meta, footer link.
- Happy path: no one-liner → section omitted entirely; default headline renders when headline empty.
- Edge case: handle casing/trailing-slash inputs normalize to one canonical form; 21-char or bad-charset segment → not-found without an RPC call.
- Edge case: headline at exactly 120 chars renders without layout-breaking markup (no raw string injection — HTML-escape all learner strings).
- Error path: RPC error → "temporarily unavailable" HTML with 503 and no cache; offline state → R9d copy with HTTP 404 (crawlers and preview caches treat a taken-down page as gone — the copy, not the status, distinguishes it for humans); missing/invalid server env → the same 503 HTML, no cache, no error detail or env values in the response body.
- Error path (XSS adversarial): headline containing `"><script>alert(1)</script>` and stray `"` renders inert in the body, `<title>`, and both OG `content` attributes; `first_name` containing markup is escaped everywhere it appears; newlines in learner strings never reach the head unescaped.
- Edge case: mixed-case path → permanent redirect to lowercase with `Location` exactly `/<handle>`; hostile path segments never produce a redirect.
- Integration (preview deployment, manual): `/signup/verify?token=x` still reaches the SPA; `/assets/*` serves; unknown handle 404s; a claimed+published handle renders; link pasted into a messaging app shows the learner's headline (Deployment Protection OFF on the preview or bypass token used — prior-plan caution).

**Verification:** preview deployment passes the integration checklist above at ~390px and desktop; production dashboard catchall deleted only after `vercel.json` verified live.

- [x] **Unit 4: FP client foundation — API client, site state slice, flushNow** — shipped (contract pins byte-verified vs the120 c9226bb; flush reentrancy/terminal-drop/ordering races fixed under review; compounded: fire-and-forget→outcome lesson). Carry-forwards: Unit 5 CTA guard + sticky-parked publish gate; Unit 6 room-open refresh

**Goal:** the FP client can check availability, claim, publish, and know its own site state across sessions; committed public-string edits flush immediately.

**Requirements:** R1–R3, R11, R12, R16, R19, R24-adjacent (session binding), success criterion "edit→refresh within seconds".

**Dependencies:** Units 1–2 (live endpoints) for integration; client code can land against fakes first.

**Files:**
- Modify: `src/lib/auth.ts` (add `checkHandleAvailability`, `claimHandle`, `publishSite` — flat `{ok:false}` style)
- Modify: `src/state/gameCore.ts` (new `site` slice: `{ handle: string | null, status: 'none'|'claimed'|'published'|'offline' }`; additive-optional if any part rides the save doc — preferred: slice is NOT in the save doc, hydrated from the registry read; `RESET_SESSION` clears it)
- Modify: `src/state/GameContext.tsx` (hydrate reads site state via a new the120/RPC read; expose `flushNow()` on `GameApi`; generation-token guard on claim/publish responses)
- Create: `src/lib/__tests__/siteApi.test.ts`, extend `src/state/__tests__/gameCore.test.ts`
- Modify: `src/config.ts` (`isPublicSiteEnabled()` / `VITE_ENABLE_PUBLIC_SITE`, mirroring `isSignupEnabled()`)

**Approach:**
- Site state is a new read-back store (split-storage lesson): hydrate fetches it via Unit 2's authenticated `site` self-read at login and on Your Site room open (bounded staleness for parent unpublish reaching a playing child); fetch failure → `status: 'unknown'`-safe rendering (room shows neutral, never the fake `/you`). Add `fetchSiteStatus` to `src/lib/auth.ts` alongside the other three calls.
- All API calls capture the session generation before dispatching results; stale-generation responses are dropped (shared-device lesson).
- `flushNow()` delegates to the engine's `flushPending()` but surfaces the outcome (landed / parked / cas-rescheduled) so callers can sequence publish on confirmation; called on headline commit, one-liner commit, and claim-flow completion (R11).

**Test scenarios:**
- Happy path: hydrate with claimed+published site → state slice populated; room selectors see the real handle.
- Edge case: hydrate fetch fails → slice `none/unknown`, no crash, no fake handle; `RESET_SESSION` clears the slice (write in session 1, absent after logout, repopulated by session 2's hydrate — round-trip test).
- Error path: claim response arriving after logout/login (stale generation) → discarded, no state mutation.
- Integration: commit headline → `flushNow` invoked → engine flush path exercised (fake timers: no 3s debounce wait).
- Flag off → API functions short-circuit `{ok:false}` and UI affordances hidden.

**Verification:** vitest suite green; manual: login as Cedric test child → room shows real (or none) state, never `/you`.

- [x] **Unit 5: Onboarding claim step + completion publish** — shipped (real availability/claim in screen 2, flushNow-gated completion publish, generation-guarded finally; blocklist corpus removed from client per review — UX rides server verdicts; 390px pass done locally, live re-check in Unit 7; compounded)

**Goal:** onboarding claims for real (live availability, suggestions, race handling) and the page is live by completion.

**Requirements:** R1–R3, R14, R15 (input UX), R19 (completion signaling), R20 (soft nudge), R23 (client screening).

**Dependencies:** Unit 4.

**Files:**
- Modify: `src/screens/onboarding/screens.tsx` (FounderProfile gains real availability wiring via props: pending/available/taken/yours badge states with ARIA live region, normalized input, suggestion chips, inline race-retry copy; WebsiteReveal gains not-live-yet signaling + R20 nudge)
- Modify: `src/screens/Onboarding.tsx` (claim submit with `useRef` in-flight guard; already-claimed pass-through on resume; completion sequence adds `await flushNow()` then, on LANDED, `publishSite`, alongside `SET_ONBOARDING_COMPLETE`; `ob` clamp/progress-bar untouched if claim stays inside screen 2's CTA — decide there rather than inserting a screen)
- Create/extend: `src/screens/__tests__/Onboarding.test.tsx`, `src/screens/__tests__/onboardingScreens.test.tsx`
- (Parent signup is untouched — see Key Technical Decisions; no `Signup.tsx` changes in this plan.)

**Approach:**
- Keep screens pure (props-driven); claim I/O injected by the Onboarding container (the only consumer of these screens — verified).
- Prefer claim-on-"Claim my page" CTA within screen 2 over a new screen (avoids `ob` renumbering and progress-bar changes; flow analyzer item 15).
- Resume path: if the account already holds a handle (from the Unit 4 site slice), screen 2 renders the claimed state (URL locked, no availability spinner) and the CTA advances without re-claiming.
- Completion ordering (explicit): `await flushNow()`; only on a LANDED result call `publishSite`. On parked/failed flush or failed publish → reveal/floor shows the R19 "not live yet" state: the URL is still displayed, but framed as "going live…" with no share encouragement, and flush+publish retry on room open (flow analyzer item 7). Completion itself is never blocked (learner can keep playing).
- Client blocklist screening runs at claim submit (handle) with the kid-friendly inline message; server remains authoritative.

**Test scenarios:**
- Happy path: type name → pending badge → available → claim → advance; page-live state at reveal.
- Edge case: taken handle → suggestions render, one-tap pick claims; all suggestions sniped → manual entry still works.
- Edge case: claim race (submit returns taken after available badge) → inline explanation + refreshed suggestions, no dead end; double-tap CTA → one request (ref guard).
- Edge case: reload mid-onboarding after claim → screen 2 shows claimed pass-through, no second claim call.
- Error path: flush parks or publish fails at completion → onboarding still completes; URL shown with "going live…" framing and no share encouragement; room-open retriggers flush+publish.
- Sequencing: publish is only invoked after a LANDED flush result (assert call order with fakes).
- Breakpoint: pending claim survives a 640/1024px resize (intent above conditional mounts).

**Verification:** suite green; manual run at 390px and desktop through fresh onboarding against a preview backend.

- [x] **Unit 6: Your Site room, first-login claim, publish-state UI** — shipped (three-state room + shared useClaimFlow/ClaimBlock; in-room claim→publish go-live; P0 stale-closure publish + overlap/clobber races fixed under review; flag-off legacy room byte-pinned; compounded: cross-repo cap-alignment doc)

**Goal:** the room edits and links to the real site; existing accounts get a claim path; unpublished/not-live states are visible everywhere they matter.

**Requirements:** R6 (input caps), R11, R13, R19, R21-adjacent (child-visible state), R22 (room reflects unpublish), R23 (screening + PII nudge copy), R20.

**Dependencies:** Units 4–5.

**Files:**
- Modify: `src/components/rooms/YourSite.tsx` (three URL-bar states: live → real `<a target="_blank" rel="noopener">`; offline/not-published → plain text with an explanatory caption, link disabled — not "warned", a disabled affordance with visible reason; unclaimed → the bar shows `firstprofit.school/ …` placeholder and the room body renders the claim UI (same component as onboarding screen 2's claim block). Headline `maxLength=120` + client screening on commit + inline rejection message keeping prior value; PII nudge copy; remove the fake "● live" hardcode)
- Modify: the one-liner editing surface (Step Runner field commit → `flushNow`; `maxLength=140`; same client blocklist screening + inline rejection as the headline — R23 covers all three strings)
- Modify: `src/screens/Factory.tsx` (existing hint mechanism points handle-less accounts to the Your Site room once; NO new interstitial state machinery — the room-embedded claim UI is the claim path, and a successful in-room claim immediately calls `publishSite` per the Key Technical Decision)
- Create/extend: room tests (jsdom)
- Modify: `src/screens/Landing.tsx` only if its `firstprofit.school/cedric` demo copy needs truth-alignment (check during implementation)

**Test scenarios:**
- Happy path: published site → URL bar is a real link with correct href; click opens new tab (assert attrs).
- Edge case: no handle claimed → room shows claim CTA, no fake `/you` URL, no dead link; unpublished by parent OR operator-locked → offline badge, "Visit" disabled/warned, editing still saves — the room never shows "live" while locked (R19's never-mislead rule).
- Copy note: the public one-liner tracks whichever idea is active (designed behavior per origin doc) — the room makes that visible so it isn't reported as a data bug.
- Edge case: headline input stops at 120 chars; blocklist rejection at commit → inline message, prior value intact, no outbox entry for the rejected value, no retry loop.
- Error path: publish state fetch fails on room open → neutral state, no false "live".
- Integration: headline commit → immediate flush → (with fake backend) projection update path invoked; room open refreshes site status (parent-unpublish staleness bound).
- Existing-account claim: handle-less account opens the room → claim UI renders (with ~44px tap-target suggestion chips and keyboard focus, per the mobile criterion); successful claim → `publishSite` fires, parent-notification path exercised, room flips to live state; hint shown once on the floor.
- Edge case: one-liner blocklist rejection at commit → inline message, prior value intact (parity with the headline scenario).

**Verification:** suite green; manual at 390px: room states (live/offline/unclaimed), link opens the real page.

- [x] **Unit 7: Hardening, ops, and launch checklist** — code/docs complete (R20 amended, your-name + their-name reserved everywhere, env docs, the120 ops runbook, launch runbook at docs/plans/2026-08-03-003-launch-checklist.md); reviewed (runbook actor-asymmetry corrected + test-pinned). OPERATOR-ACTION steps in the checklist are the live launch gate

**Goal:** rate limiting, config hygiene, exposure-record updates, and the gated rollout.

**Launch runbook:** the ordered operator checklist this unit produces lives at [docs/plans/2026-08-03-003-launch-checklist.md](2026-08-03-003-launch-checklist.md) (companion the120-side detail: the120 `docs/runbooks/2026-08-03-fp-public-site-operations.md`).

**Requirements:** R4 (list governance), R17 (verify), R18, launch gate.

**Dependencies:** Units 1–6.

**Files:**
- Modify: `docs/solutions/security-issues/r20-fp-child-session-reach-across-the-shared-supabase-project-accepted-exposure-2026-08-01.md` (amend: `fp_public_site` is a new anon-callable surface reachable directly at the Supabase URL — outside firstprofit.school's WAF/rate-limit/noindex coverage; document what it reveals per state, and the deletion guarantee via FK CASCADE)
- Create: `docs/solutions/` entry for the serving-layer pattern once landed (via `ce:compound` after ship)
- Modify: `.env.example`, README/deploy notes for the new env vars and the dashboard-route deletion step

**Approach (operational steps, not code):**
- WAF: one rate-limit rule covering `/:handle` + the availability path, keyed by IP, action Log first → observe → Deny; never Challenge (crawlers must fetch pages). Separate/authenticated bucket consideration for claim-availability so a learner cycling suggestions isn't locked out of onboarding (flow analyzer item 11).
- Verify on a live preview: client-IP header, Deployment Protection OFF (or bypass token) for crawler-path testing, link previews in at least one real messaging app.
- Launch order (corrected so nothing is user-visible before sign-off — `VITE_` flags are baked into the one production bundle, so "enable" is global): migration (Unit 1, with schema reload + verify) → the120 endpoints deployed but gated OFF → FP production deploy with `vercel.json` + function (dark: no claims exist) → verify SPA routes → delete dashboard catchall → **Cedric test family end-to-end on a PREVIEW deployment** (flag enabled in the preview env only, the120 gate opened for the preview/test window; Deployment Protection off or bypass token for crawler-path checks) → **COPPA policy check sign-off** → only then enable `VITE_ENABLE_PUBLIC_SITE` in production + open the the120 gate for all accounts. ~~If the120's gate can allowlist accounts, the Cedric test may run in production scoped to the test family instead of a preview — decide when building the gate; either mechanism satisfies the ordering constraint.~~ **DECIDED (Unit 7 review): the PREVIEW-deployment path is the REQUIRED mechanism.** The allowlist scopes only the SERVER; `VITE_ENABLE_PUBLIC_SITE` is baked globally into the one production bundle, so a "production-scoped" test would show every child the live claim UI while non-allowlisted claims die on the generic 401 (rendered as retry-inviting outage copy). The production VITE flag stays OFF until full launch; revisit only if a client-visible per-account gate state ever ships (see the launch checklist §6).
- Reserved-word list: initial curated list committed with rationale comments (Unit 1 seed + `vercel.json` exclusions cross-referenced); owner named in the solution doc.
- Add `your-name` to the reserved-handle list (the120 seed + `vercel.json` exclusions + `api/_lib/reservedHandles.ts`) BEFORE claiming is enabled anywhere: the Landing hero mockup (Unit 6 truth-alignment) shows the literal URL `firstprofit.school/your-name`, which must never become a real child's page.

**Test scenarios:** Test expectation: none — operational/config unit; verification is the live checklist above.

**Verification:** every launch-order step checked off in a PR description or ops note; success criteria from the origin doc demonstrated end-to-end with the test family.

## System-Wide Impact

- **Interaction graph:** `fp_player_saves` upserts now fire a trigger (every save, every learner) — the trigger must be cheap and never fail the save. `GameApi` grows `flushNow`; onboarding completion sequence gains a publish call; hydrate gains a registry read.
- **Error propagation:** the publish endpoint failing must never block onboarding completion; the projection trigger must never fail a save; RPC failure at the public function renders "temporarily unavailable," not not-found (misreporting existence is the worse failure).
- **State lifecycle risks:** new site slice must join `RESET_SESSION`/hydrate (shared-device leak class); claim/publish responses need generation guards. Projection freshness inherits `fp_player_saves`' CAS ordering: a stale parked snapshot CAS-rejects (zero rows, `src/lib/sync.ts` replay path) and is dropped, so the trigger can never fire on superseded content — no separate versioning on `fp_public_sites` needed. Invariant: content columns are written only by the trigger and the claim/publish backfill, never a third writer.
- **Cross-repo parser coupling:** the trigger is a second consumer of the SaveDoc JSON shape living in the120's migrations; any `toSaveDoc` shape change or `docVersion` bump now has cross-repo blast radius (silently stale projection, not errors). Mitigated by the trigger's docVersion gate + reciprocal comments in both repos (Unit 1).
- **API surface parity:** the availability/claim/publish client functions follow `auth.ts` conventions so signup/login/game surfaces stay uniform; the120 parent surface gains view/unpublish (companion work there mirrors FP's states).
- **Integration coverage:** the rewrite ordering (handle rule vs SPA catchall vs `/signup/verify`) is only provable on a deployment — the preview checklist in Unit 3 is mandatory, not optional.
- **Unchanged invariants:** login/username model untouched (public handle is a new field); parent signup flow untouched (renders its own screens; gains no handle UI); SaveDoc version stays 1 (no new save-doc fields in the preferred design); existing RLS on `fp_player_saves`/`fp_ledger` unchanged; the two-breakpoint layout rule holds (no new tiers); `MobilePath` `pb-80` untouched.
- **Known bounded staleness:** a publish that proceeds after a parked flush (offline completion) leaves the page's first render behind until the outbox replays — possibly a later session. The success criterion's "within seconds" holds for the online path; the offline tail is stated in the room's not-live-yet state rather than hidden. **Accepted residual (Unit 7 review): terminal-drop cross-session silent edit loss.** When the sync engine classifies a save as TERMINAL and drops the snapshot, the in-memory dirty flag does not survive the session; the next session's hydrate re-bases on server truth, so no false publish and no corrupt state — but the dropped edit is silently gone (the learner re-types it). Bounded by the trigger/guard design that makes terminal classifications rare (no CHECKs on save-doc content; the projection trigger never raises); accepted rather than building a cross-session outbox for it.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Trigger on every save-doc write regresses save latency or errors | Trigger is UPDATE-only-if-row-exists, clamps, wrapped in `EXCEPTION WHEN OTHERS` (an implicit cast error would classify terminal and drop the learner's snapshot); adversarial-doc tests in Unit 1; deploy ordering verified |
| Rewrite misordering breaks `/signup/verify` or assets in production | Repo-committed `vercel.json` tested on preview first; dashboard catchall deleted only after verification; single-segment rule cannot match multi-segment links |
| Handle claimed but the120 publish email silently fails | Publish succeeds + loud operator-attention flag (never silent); republish re-notifies |
| Cross-repo sequencing (the120 units land separately) | Launch order in Unit 7; FP client lands dark behind `VITE_ENABLE_PUBLIC_SITE`; endpoints gated the120-side |
| Enumeration/scraping of child pages | The anon RPC is directly callable at the Supabase URL, bypassing WAF/noindex — mitigations there are: never-published claims indistinguishable from unclaimed (`first_published_at` gate), sanitized triple only, accepted residual for published pages (recorded in the R20 amendment). On firstprofit.school: WAF rate limit + noindex. Availability requires a session resolving to a real FP profile row, not any anon-key-minted JWT |
| SWR cache serves stale published content up to ~60s after parent/operator takedown | Accepted, bounded residual; `Vercel-Cache-Tag` purge deferred item is re-scoped to cover unpublish/lock, not only publish freshness |
| Account deletion leaves a live public page with a child's name | `fp_public_sites` joins the documented RESTRICT deletion ordering as its first step + Unit 2 deletion round-trip test; R20 amendment documents the deletion guarantee. The explicit procedure (not a CASCADE) decides handle disposition, so an operator-locked handle is never silently freed |
| Shared-device cross-child claim/publish | Generation-token guard on all new async paths (Unit 4), per the critical solution doc |
| Preview Deployment Protection blocks crawler-path testing | Explicit checklist step (bypass token or unprotected preview) |
| COPPA policy check fails at launch gate | Feature flag keeps everything dark; no data is public until enablement |

## Documentation / Operational Notes

- Amend the R20 exposure record (Unit 7) — it is the security posture of record for the shared Supabase project.
- New env vars documented in `.env.example` (client `VITE_ENABLE_PUBLIC_SITE`; function-side `SUPABASE_URL`/`SUPABASE_ANON_KEY`).
- Post-ship: `ce:compound` a solution doc for "first serverless route beside a SPA catchall" and the clamping-trigger pattern.
- Per the memory/project rule: full `ce:review` + `ce:compound` on every unit and commit.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-08-03-real-public-site-requirements.md](../brainstorms/2026-08-03-real-public-site-requirements.md)
- Related code: `src/lib/sync.ts`, `src/lib/auth.ts`, `src/state/gameCore.ts`, `src/state/GameContext.tsx`, `src/screens/onboarding/screens.tsx`, `src/components/rooms/YourSite.tsx`, `src/screens/signup/verifyLink.ts`, `src/config.ts`
- Related plans: `docs/plans/2026-07-31-001-feat-fpv2-slice-a-game-login-plan.md` (deep-link non-goal now superseded; client-IP and preview-protection cautions), `docs/plans/2026-08-02-001-feat-checkout-booth-provider-lesson-plan.md` (migration ordering)
- External docs: Vercel rewrites/functions/caching/WAF (URLs in Context & Research)
