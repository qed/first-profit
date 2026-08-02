---
title: "/fp child-surface retirement — make fpv2 the only child door"
status: requirements
date: 2026-08-02
type: requirements
origin: docs/brainstorms/2026-07-31-fpv2-the120-accounts-requirements.md
primary_repo: 120-The120 (Next.js) — with a first-profit (fpv2 SPA) verification leg
---

# /fp child-surface retirement — make fpv2 the only child door

## Problem & frame

fpv2 (the First Profit game SPA at firstprofit.school) is the replacement for the
old the120 `/fp` "Path" student PWA. Both back onto the **same accounts** (the
`path_student_profiles` identity on the shared the120 Supabase) — fpv2 is a re-skin
of the *student surface*, not a new user population. Today **two child doors are
live** at once: the old `/fp/sign-in` + `/fp` journey, and firstprofit.school. This
piece closes the old door so fpv2 is the single child-facing surface.

Per the roadmap decision (2026-08-02), retirement is **redirect-first**: flip the
old child routes to firstprofit.school now and accept that fpv2 is still behind on
some flows; the parity gaps are closed later as their own pieces. This is safe
because **no production children are on `/fp` today** (test/pilot only — a stated
assumption to re-verify at plan/go-live time), so there is no in-flight journey to
strand and **no progress-seed is in scope**.

## Goal

One child door. A child (or a stale bookmark, old link, or PWA icon) that hits any
old `/fp` **child** route lands on firstprofit.school, and the old child-facing
surface is removed from the the120 codebase — without touching the surfaces that
stay (parent, guide, and the shared API fpv2 itself depends on).

## Scope

### In scope
1. **Redirect** every `/fp` **child** route to firstprofit.school (permanent
   redirect). The child routes are the `(app)` child pages and the `(auth)` child
   door:
   - `/fp` (journey home), `/fp/now`, `/fp/task/[taskId]`,
     `/fp/criterion/[criterionId]`, `/fp/review`, `/fp/onboarding`,
     `/fp/notifications`
   - `/fp/sign-in` (child login)
   - A blanket child-route redirect to the firstprofit.school root is acceptable;
     deep-link path mapping (e.g. a specific task -> a specific fpv2 state) is **not**
     required (fpv2 is a stage machine, not a router, and there are no live users to
     preserve a deep link for).
2. **Remove** the `/fp` child-facing surface from the the120 codebase (the pages,
   child-only components, and child-only curriculum-rendering content), following
   the repo's own retirement discipline (enumerate every surface, remove together,
   grep the identifiers to zero). Keep anything **shared** with surfaces that stay.
3. **Confirm fpv2 is a complete child door on its own** for the flows that ARE at
   parity today: child login, onboarding, journey/dashboard view, ledger, checkout
   booth, profile/handle, session/sign-out + draft preservation. (Verification, not
   new build.)
4. **Sweep inbound links** to old `/fp` child routes (parent emails, guide tools,
   any CTA/menu) so nothing points a child at a route that now only redirects —
   the redirect is the safety net, not the primary path.

### Out of scope (stays live — must NOT be redirected or deleted)
- **Parent surface:** `/fp/family` (the parent dashboard; part of Slice B).
- **Guide/ops surface:** `/fp/fw/**` (Founder's Workshop — cohorts, rosters, board).
- **Shared API:** `/api/fp/**` (login, signup, consent) — **fpv2 calls these**.
- **Identity + game tables:** `path_*` and `fp_*` tables — no schema change, no data
  migration, no account move.
- **`/fp/invite/[token]`** — invite acceptance is family/guide onboarding, not a
  child-login surface; treat as **stays** unless plan-time inspection shows it is
  purely child-facing.

### Explicitly deferred to their own follow-on pieces (NOT this piece)
These are the fpv2 **parity gaps** the redirect-first strategy accepts as interim:
- **Evidence capture + adult verification loop** (photo/video upload + yes/no
  review). fpv2 has none; the old `/fp` did. Its own piece — and its own product
  question of whether fpv2 reproduces the adult-verification model at all or
  supersedes it with in-game self-verified progression.
- **Full criteria beyond Sell 1.1-1.2 playable** (1.3-1.5 + Build->Scale). fpv2 shows
  these visible-but-locked today, so a redirected child lands somewhere coherent.
- **Persistent notifications feed** (fpv2 has in-game celebration, no feed).
- **Seeding old `/fp` progress/evidence into fpv2** — not needed (no real users).

## Success criteria

- Hitting any old `/fp` child route (signed in or not) lands on firstprofit.school.
- The `/fp` child pages/components/content are gone from the the120 tree; a grep of
  the retired child-surface identifiers returns zero (outside history/tests that
  document the removal).
- `/fp/family`, `/fp/fw/**`, and `/api/fp/**` are unchanged and still answer live;
  fpv2 login (which calls `/api/fp/login`) still works.
- fpv2 is confirmed to stand alone as the child door for the at-parity flows.
- No console/route errors from a dangling reference to a removed child surface.

## Key decisions (resolved in this brainstorm)

- **Redirect-first, gaps-after** (not full-parity-first): retire the door now,
  close fpv2 parity gaps as separate pieces. (User decision 2026-08-02.)
- **No production children on `/fp`** -> interim gaps are acceptable and **no
  progress-seed** is in scope. (User decision; re-verify at plan/go-live.)
- **Redirect + delete now** (not redirect-only/soft-retire): the old child code is
  removed in this piece, since nothing real depends on it and the repo's retirement
  discipline favors removing all surfaces rather than leaving dead code. The old
  implementation stays available in git history as reference for the follow-on
  parity pieces.
- **Precisely path-scoped:** only `(app)` child pages + `(auth)/sign-in` redirect;
  parent/guide/API/shared surfaces are untouched.

## Dependencies & risks

- **Cross-repo, but the120-heavy.** The redirect + surface-delete live in the120
  (`proxy.ts` matcher already covers `/fp/:path*`; the child pages live under
  `app/fp/(app)` + `app/fp/(auth)`). The first-profit side is verification only.
- **Boundary risk (the main one):** a child-only component/lib that is actually
  shared with `/fp/family` or `/fp/fw`. Removal must use a boundary sweep so a
  shared dependency is not deleted out from under a surface that stays. (The repo
  has a documented route-boundary-sweep + grep-to-zero technique to lean on.)
- **Redirect precision risk:** the redirect must not catch `/fp/family`, `/fp/fw`,
  or `/api/fp`. A too-broad `/fp/*` rule would break parent/guide/fpv2 flows.
- **Assumption to verify at plan time:** the "no real children on `/fp`" premise
  (cheap to confirm against `path_student_profiles` activity before deleting).

## Open questions for planning

- Exact redirect mechanism + status code (middleware/`proxy.ts` rule vs per-route),
  and how it distinguishes child routes from the parent/guide/API routes under the
  same `/fp` prefix. (HOW — planning.)
- Whether `/fp/invite/[token]` is purely child or family/guide (determines if it
  redirects or stays).
- The precise shared-vs-child-only split of the `app/fp` component/content tree
  (drives what deletes vs stays).
