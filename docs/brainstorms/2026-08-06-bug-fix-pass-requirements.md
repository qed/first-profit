# Bug Fix Pass — First Look Feedback (Aug 6, 2026)

**Source:** `artifacts/bugs-to-be-fixed-aug-5-2026.md` (11 triaged bugs from Tsenguun, Pietro, Edgar).

## Process (agreed 2026-08-06)

- Walk the bugs in the doc's **suggested fix order** (severity-first), one at a time.
- For **every** bug: investigate first, then present the proposed fix and ask the user
  go/no-go before changing anything. Several are judgment calls.
- Verification medium: **live site URLs** (https://firstprofit.school/...) showing where
  the bug lives / where the fix will be visible, provided with each proposal.
- Mobile acceptance criterion applies to every UI fix (per `CLAUDE.md`): verify at
  ~390px and desktop before calling a fix done.

## Fix order

1. BUG-001 first-login 403 (P0)
2. BUG-003 session expiry / no refresh (P1)
3. BUG-005 step skipping + BUG-006 criterion gating (P1)
4. BUG-002 password paste, BUG-004 dead checkout button, BUG-008 idea creation/deletion (P1)
5. BUG-007 Founder File discoverability, BUG-009 phase transition (P1)
6. BUG-010 live chip, BUG-011 copy clarity (P2)

## Decision log

| Bug | Decision | Notes |
|-----|----------|-------|
| BUG-001 | fixed (pending deploy) | Root cause: www.firstprofit.school serves the SPA but The120's origin allowlist refused it → preflight 403. Fixed: www→apex redirect (`vercel.json`), www added to `buildAllowedOrigins`, refused origins now logged (the120 `app/api/fp/login`). |
| BUG-002 | fixed (pending deploy) | Password now trimmed on login submit like the username (paste brings trailing whitespace). `src/screens/Login.tsx`. |
| BUG-003 | fixed (pending deploy) | Root cause: `signOut()` defaulted to GLOBAL revoke — one device's idle/explicit/pre-signin logout expired every device on the shared account, surfacing as "kicked mid-session". Refresh flow already existed. Fixed: `signOut({ scope: "local" })` in `src/lib/auth.ts`. |
| BUG-004 | fixed (pending deploy) | Inert "See your live checkout ↗" button demoted to a plain caption ("Your live checkout unlocks on your factory floor."). `src/screens/onboarding/screens.tsx`. |
| BUG-005 | closed, no action (2026-08-06) | Every unit task is being massively reworked within 7 days; the runner's honor-system CTA goes with it. |
| BUG-006 | closed, no action (2026-08-06) | Same rework covers criterion gating. |
| BUG-007 | pending | |
| BUG-008 | fixed (pending deploy) | Delete UI + grey unnamed cards were already live; added: dismissing the runner on a pristine idea (no fields, no completed tasks) now removes it via the tombstoned DELETE_IDEA path. `src/components/StepRunner.tsx`. |
| BUG-009 | pending | |
| BUG-010 | pending | |
| BUG-011 | pending | |
