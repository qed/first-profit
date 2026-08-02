---
title: "feat: Login Create Account link out to the120 /start"
type: feat
status: active
date: 2026-08-02
origin: docs/brainstorms/2026-08-02-fp-login-account-creation-requirements.md
---

# feat: Login Create Account link out to the120 /start

## Overview

Add a single "Create Account" affordance to the First Profit login screen
(`src/screens/Login.tsx`) that navigates to `https://the120.school/start?src=fplogin`.
Account creation lives entirely at the120's `/start` onboarding (owner-confirmed to
mint fpv2-loginable username+passwords); fpv2 is game + login only. This unblocks the
end-to-end user-flow walk: home → login → new user goes to `/start` → gets
credentials → logs in → plays.

## Problem Frame

The login page has username/password + a "Log in" button but **no path to account
creation**, so a new student has no way in. The in-SPA signup flow stays dormant
(flag off, out of scope); this piece adds the one link out. (See origin:
`docs/brainstorms/2026-08-02-fp-login-account-creation-requirements.md`.)

## Requirements Trace

- R1. Login page shows a working "Create Account" link →
  `https://the120.school/start?src=fplogin` (correct `src`).
- R2. Child login + the game are unaffected.
- R3. ~390px mobile: no overflow, tap target ≥44px; no em dashes in copy.

## Scope Boundaries

- **Only** the login screen gets a new link. No other screen changes.
- **Do NOT** touch the in-SPA signup flow, `VITE_ENABLE_SIGNUP`, `src/screens/signup/*`,
  or `src/lib/auth.ts` signup functions — they stay dormant (retirement is a separate
  later cleanup).
- No the120 change (`/start` + `?src` handling are the120's, owner-confirmed live).
- Home CTAs ("Start Building" / login) already route to the login page — unchanged.

## Context & Research

### Relevant Code and Patterns
- `src/screens/Login.tsx` — the target. White HQ card; form with `min-h-[48px]`
  inputs and a `min-h-[52px]` "Log in" submit; a "Back" control at `min-h-[44px]`; a
  footer note **"A grown-up sets up every account"** (`font-mono text-[11px] uppercase
  tracking-wider text-ink/60`) below the card. Mobile-first, `sm:` re-asserts desktop.
- Copy rule (file header + CLAUDE.md): **no em dashes** anywhere in product copy.

### Institutional Learnings
- None specific; standard UI addition with strong local patterns.

## Key Technical Decisions

- **Same-tab navigation via a plain `<a href>`** (no `target="_blank"`). Rationale:
  mobile-first audience (~390px phones) where tab-switching is poor UX; a logged-out
  visitor on the login screen has no in-app state to lose; the flow is linear (create
  account at the120, then return to firstprofit.school to log in). A plain external
  anchor is also free of the `rel="noopener"` reverse-tabnabbing concern that
  `target="_blank"` would require. (Alternative — new tab with `rel="noopener
  noreferrer"` to keep FP login open — considered and rejected for the mobile reason.)
- **Placement:** inside/just below the card, as a secondary affordance beneath the
  "Log in" button, framed consistently with the existing grown-up-sets-up-accounts
  copy. It is a link, styled as a ≥44px tap target, visually secondary to "Log in".
- **Copy (no em dashes):** a short line such as **"New to First Profit? Create an
  account"** with "Create an account" as the link (final wording at implementer's
  discretion within these constraints; keep it kid/grown-up friendly and consistent
  with "A grown-up sets up every account").

## Open Questions

### Resolved During Planning
- Same-tab vs `target="_blank"`: initially shipped **same-tab**, then **reversed to
  `target="_blank"` + `rel="noopener noreferrer"`** (new tab) at owner request
  2026-08-02 — keeps the First Profit login tab open while the120 onboarding runs in
  a new tab; `rel` blocks reverse-tabnabbing, attribution still rides `?src=fplogin`.
- Copy + placement: **below the "Log in" button**, secondary link, wording per above.

### Deferred to Implementation
- Final visual treatment (a plain text link vs an outlined secondary button) — pick
  whichever reads as clearly secondary to "Log in" at 390px; both satisfy the ≥44px
  tap-target requirement.

## Implementation Units

- [ ] **Unit 1: Add the Create Account link to the login screen**

**Goal:** A new student on the login page can reach account creation at the120.

**Requirements:** R1, R2, R3

**Dependencies:** None.

**Files:**
- Modify: `src/screens/Login.tsx`
- Test: `src/screens/__tests__/Login.test.tsx` (new — no login test exists today)

**Approach:**
- Add a secondary "Create Account" affordance beneath the "Log in" submit button
  (within `src/screens/Login.tsx`), rendered as an `<a>` to
  `https://the120.school/start?src=fplogin`, same-tab (no `target`), styled as a
  ≥44px tap target and visually secondary to "Log in".
- Keep the existing form, generic-error behavior, "Back" control, and footer note
  intact. No change to `login()` / `GameContext` / auth.
- Copy per Key Technical Decisions; verify no em dashes.

**Patterns to follow:**
- The card's existing spacing + `min-h-[44px]` control sizing and `font-mono` /
  `text-ink/60` secondary styling in `src/screens/Login.tsx`.

**Test scenarios:**
- Happy path: the login screen renders a link whose text conveys "create an account"
  and whose `href` is exactly `https://the120.school/start?src=fplogin`.
- Edge/standards: the link is a same-tab anchor (no `target="_blank"`); its rendered
  text contains no em dash (`—`); the control carries a ≥44px min-height class.
- Regression (unchanged): the username/password fields and the "Log in" button still
  render, and adding the link does not alter the login submit path (form still
  present and submittable).

**Verification:**
- The login screen shows a "Create Account" link pointing at
  `the120.school/start?src=fplogin`; clicking it navigates to that URL.
- Child login still works end to end (login → onboarding → factory → 1.1-1.2 →
  Checkout Booth) — unchanged.
- `tsc` + eslint + full test suite green; login screen verified at ~390px (no
  overflow, tap target ≥44px) and desktop.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Accidentally touching the dormant in-SPA signup / auth while editing | Change is confined to `Login.tsx` render output; do not import or alter signup/auth code. |
| Link copy or the extra element breaks 390px layout | Mobile-verify the login screen at ~390px per the CLAUDE.md gate before done. |
| `/start` or `?src` behavior wrong on the120 | Out of scope here; owner-confirmed live. FP only needs the correct href. |

## Sources & References

- **Origin document:** docs/brainstorms/2026-08-02-fp-login-account-creation-requirements.md
- Related code: `src/screens/Login.tsx`
