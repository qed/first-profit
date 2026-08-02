> ⚠️ **SUPERSEDED 2026-08-02 — do not action.** The account model changed: fpv2 no
> longer hosts an in-SPA signup flow. Account creation lives entirely at the120's
> `/start` onboarding; the fpv2 login page just links out to
> `https://the120.school/start?src=fplogin`. So this "enable the in-SPA signup for
> testing" ask (test-gate, `FP_PREVIEW_ORIGIN`, `VITE_ENABLE_SIGNUP` flip) is moot.
> The only live the120 touchpoints now: `/start` mints fpv2-loginable student
> username+passwords (owner-confirmed), and (nice-to-have) attributing `?src=fplogin`.
> See `docs/brainstorms/2026-08-02-fp-login-account-creation-requirements.md`.
> Retained below for history only.

---

# the120 ask: make the fpv2 signup + child-login flow walkable for testing

**From:** First Profit (fpv2 SPA) side
**To:** the120 engineering
**Date:** 2026-08-02
**Goal:** Let us walk the full user flow on **firstprofit.school** end to end —
parent signup → email verify → consent → child creation → **child logs in with a
username** → plays the fpv2 game — using **test families only**, without burning any
real Google Workspace mailbox and without a public launch.

This is a **testing enablement** ask, NOT the Slice B go-live. Please do **not** lift
the launch gate to real families, run the live-Workspace acceptance protocol, or
treat this as the CTA cutover. Those stay separate (see "Explicitly NOT asked").

---

## Context (why this is small)

- fpv2 is the replacement **student** surface. It backs onto the **same accounts**
  as `/fp` (the `path_student_profiles` identity on the shared the120 Supabase) — no
  new user population, no data migration.
- The Slice B signup/login backend already lives in the120 and is fully implemented
  + tested (`app/api/fp/signup/**`, `app/api/fp/login`). We believe it is
  backward-compatible and safe to run while nothing points real users at it.
- The current FP-signup **child creation path is `.invalid` username+password only**
  (the old `credentialChoice` / `provision_workspace` branch was removed in Slice B
  U14/U15). So a test signup **never touches Google Workspace** and never burns a
  mailbox — regardless of `GOOGLE_WORKSPACE_SA_KEY`. This is what makes test walks
  cheap and safe.

---

## The ask — concrete the120-side steps

1. **Confirm the Slice B signup/login backend is DEPLOYED to the120 production.**
   (We can't verify deploy state from the source. The go-live checklist §E.1 treats
   "backend ships FIRST" as a pending human step, so please confirm or deploy.)
   - **Acceptance:** `OPTIONS` + a guarded test `POST` succeed for
     `/api/fp/signup`, `/api/fp/signup/verify`, `/api/fp/signup/consent`,
     `/api/fp/signup/child`, and `/api/fp/login` on the prod the120 origin.

2. **Set the test gate + test emails on the the120 backend deployment.**
   - Keep **`FP_SIGNUP_TEST_ONLY`** ON (unset = ON = fail-closed; only explicit
     `off`/`false`/`0` disables it — leave it ON so real families cannot sign up).
   - A signup counts as a **test family** if the parent email ends with
     **`@test.the120.invalid`** OR is listed (comma-separated) in
     **`FP_SIGNUP_TEST_ALLOWLIST`**. Please tell us which you prefer:
     - Option A: we use `@test.the120.invalid` parent emails (no allowlist change).
     - Option B: add our real test email(s) to `FP_SIGNUP_TEST_ALLOWLIST`.
   - Keep **`GOOGLE_WORKSPACE_SA_KEY` UNSET** (the child path doesn't need it; this
     guarantees no mailbox is ever created during our testing).

3. **CORS — one decision based on where we test:**
   - If we test on **production `https://firstprofit.school`**: already allowed by
     the origin allowlist (`app/api/fp/login/login-rules.ts` `buildAllowedOrigins`),
     no action needed.
   - If we test on a **Vercel preview URL** of the fpv2 SPA: the allowlist is
     exact-match and does NOT include preview origins. You'd need to set
     **`FP_PREVIEW_ORIGIN`** to the exact preview origin (one origin, exact string).
     Preview URLs rotate per deploy, so this is fiddly — we'll likely test on prod
     to avoid it. We'll confirm which we use (see "What we do on our side").

4. **Verify-email step for test families:** confirm the expected behavior so we know
   what to click. For `@test.the120.invalid` attempts the verify step appears to be
   auto-confirmed server-side / tokenless (`app/api/fp/signup/signup-core.ts`
   ~L208-223). Please confirm how a tester completes verify for a test family (real
   inbox link vs auto-confirm), so we don't get stuck waiting on an email.

5. **(Optional, your call) RLS re-probe** (`scripts/rls-reprobe-fp-parent.ts`,
   `npm run rls:reprobe`) before we invite anyone. Not required to test the flow,
   but it's the go-live-gated isolation check if you'd rather run it now.

---

## The walk we want to complete (acceptance for the whole ask)

From `https://firstprofit.school`, a tester can:
1. Start Building → **signup** with a test-family parent email.
2. Complete **verify** (per step 4) → **consent** → **create a child** with a
   **known password** we choose at creation. The response returns the generated
   **`fp_username`**.
3. **Log in** at the fpv2 login with that `fp_username` + the chosen password.
4. Land in the game and play the at-parity flows (onboarding, factory floor,
   criteria 1.1–1.2, log a sale, the Checkout Booth provider lesson, ledger).

No Google Workspace mailbox is created at any point in this walk.

---

## Explicitly NOT asked (keep separate / do NOT do)

- Do **not** set `FP_SIGNUP_TEST_ONLY=off` (admitting real families) — that's a
  separately-reviewed go-live change.
- Do **not** run the live-Workspace provisioning acceptance protocol
  (`docs/runbooks/2026-08-01-live-provisioning-acceptance-protocol.md`) or set
  `GOOGLE_WORKSPACE_SA_KEY` just to test — the child path doesn't need it.
- Do **not** treat this as the FP CTA cutover — flipping the First Profit landing
  CTA to signup (`VITE_ENABLE_SIGNUP`) is **our** side and we'll do it for the test
  window.

---

## One code discrepancy to flag while you're in here

The live-provisioning acceptance-protocol runbook (Phase 1) still describes creating
`credentialChoice = existing_credential` / `provision_workspace` path-a/path-b
children via signup. Slice B **U14/U15 removed `credentialChoice`** — the child
route now `.strip()`s it and every child is minted `.invalid` username+password
(`app/api/fp/signup/child/route.ts`, `child-core.ts`). The runbook's path-b
"mint a mailbox via signup" no longer matches the code. Worth reconciling before
anyone runs that protocol.

---

## What we (First Profit) do on our side — for your awareness, not your action

- Flip **`VITE_ENABLE_SIGNUP=true`** on the first-profit deployment for the test
  window so the landing CTA routes to signup (it defaults OFF → login). With your
  `FP_SIGNUP_TEST_ONLY` gate ON, any real visitor who hits signup is safely refused,
  so a brief prod test window is low-risk while traffic is ~nil.
- Confirm back to you whether we test on **prod `firstprofit.school`** (no CORS
  change needed) or a **preview URL** (needs your `FP_PREVIEW_ORIGIN`).

---

## References (the120 repo)

- `docs/runbooks/2026-08-01-slice-b-go-live-checklist.md` — the full ordered go-live
  checklist (this ask is a strict subset: deploy backend + test-only gate + verify
  the routes answer).
- `docs/runbooks/2026-08-01-live-provisioning-acceptance-protocol.md` — the separate
  real-Workspace run (NOT part of this ask).
- `app/api/fp/signup/**`, `app/api/fp/login/route.ts` — the routes.
- `app/api/fp/signup/signup-rules.ts` `launchGateVerdict` — the `FP_SIGNUP_TEST_ONLY`
  semantics; `isTestSignup` — the test-email rule.
- `app/api/fp/login/login-rules.ts` `buildAllowedOrigins` — the CORS allowlist +
  `FP_PREVIEW_ORIGIN`.
