---
title: "First Profit login: Create Account link out to the120 /start"
status: requirements
date: 2026-08-02
type: requirements
scope: lightweight
supersedes: docs/brainstorms/2026-08-02-fpv2-testing-milestone-requirements.md (flag-flip model)
---

# First Profit login: Create Account link out to the120 /start

## Problem & frame

**Account model (decided 2026-08-02):** A First Profit student signs in with a
**username + password**. Those credentials are minted by **the120's `/start`
onboarding** (`https://the120.school/start`) — account creation lives entirely at
the120, not inside fpv2. fpv2 is the **game + login** only.

To make the full user flow walkable for testing (home → login → new user goes to
the120 `/start` → gets username+password → logs in → plays), the fpv2 login page
needs a **"Create Account"** link out to `/start`. That single addition is this
piece. Speed is the priority.

## Goal

The First Profit login page shows the username/password form **plus a "Create
Account" link** → `https://the120.school/start?src=fplogin`, so a new student can
get to account creation and a returning student logs straight in.

## Scope

### In scope (one small addition)
- On the login page (`src/screens/Login.tsx`), add a clear **"Create Account"**
  affordance below the username/password form → `https://the120.school/start?src=fplogin`.
  - `?src=fplogin` lets the120 attribute signups that came from the FP login.
  - It is an **external navigation** to the120 (leaving the SPA); no in-app signup.
  - Copy: kid/parent-appropriate, **no em dashes**; respects the ~390px mobile gate
    and a **>=44px** tap target.

### Explicitly deferred (NOT this piece)
- **Retiring the in-SPA fpv2 signup flow.** It stays **dormant** — `VITE_ENABLE_SIGNUP`
  is already off (default), so the four signup screens + `signup` stage are
  unreachable. Leaving the code in place is zero-cost now; removing it (grep-to-zero
  across `Signup.tsx`, `src/screens/signup/*`, the flag, and the `/api/fp/signup*`
  client calls) is a **separate later cleanup piece**, not needed to test the flow.

### Out of scope
- Any change to the120 (`/start` is owner-confirmed to mint fpv2-loginable
  username+passwords; `?src` tracking is the120's).
- The game, onboarding, and child login flow (unchanged).
- The `VITE_ENABLE_SIGNUP` flag / in-SPA signup (left dormant, untouched).

## Success criteria

- The login page shows a working **Create Account** link to
  `https://the120.school/start?src=fplogin` (correct `src`, opens the120 onboarding).
- Child login and the game are **unaffected** (login → onboarding → factory →
  1.1-1.2 → Checkout Booth still works).
- Build + typecheck + lint + tests green; **~390px mobile verified** on the login page.

## Key decisions (resolved)

- **In-SPA signup left dormant now** (flag already off), retirement deferred to a
  separate cleanup — chosen for speed.
- **Link-out model** — the login page is the door; new users go to the120
  `/start?src=fplogin`. No `VITE_ENABLE_SIGNUP` flip.
- **Home CTAs unchanged** — "Start Building" + login both already route to the login
  page; the new "Create Account" link lives on the login page.
- **`/start` is owner-confirmed** to produce fpv2-loginable student credentials; no
  the120 verification needed.

## Open questions for planning

- Link target behavior: same-tab navigation vs `target="_blank"` (+ `rel="noopener"`).
- Exact copy + placement of "Create Account" on the login screen.
