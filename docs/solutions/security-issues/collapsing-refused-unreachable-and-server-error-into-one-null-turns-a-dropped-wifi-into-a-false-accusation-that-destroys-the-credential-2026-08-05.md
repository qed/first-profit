---
title: "Collapsing refused, unreachable and server-error into one null turns a dropped wifi into a false accusation that also destroys the credential"
module: fp-staff-auth
date: 2026-08-05
problem_type: security_issue
component: frontend_stimulus
severity: high
symptoms:
  - "A real staff member on a phone walking into a dead spot taps a tab and is told 'This page is for First Profit staff.' — the refusal screen, for a network error"
  - "The same path calls /auth/v1/logout with the still-valid access token, and GoTrue's default global scope revokes the whole refresh-token family: a transient blip permanently destroys a working session"
  - "origin was set to 'fresh' at sign-in and never reset, so the fresh-means-refusal verdict applied to EVERY later 401 for the life of the page, not just the first load"
  - "Deleting origin.current = 'fresh' survived the whole suite; its real consequence was that a CHILD signing in after an expired restored session got a blank sign-in form — no error, no refusal, and their token never revoked"
root_cause: design_gap
resolution_type: code_fix
last_updated: 2026-08-05
related_components:
  - src/screens/staff/StaffShell.tsx (RefreshOutcome, refreshSession, origin, performRequest)
  - src/screens/staff/staffTypes.ts (StaffApiResult - error is retryable, unauthorized is terminal)
tags:
  - auth
  - error-classification
  - null-sentinel
  - gotrue
  - token-revocation
  - state-machine
  - false-negative
  - offline
---

# Collapsing refused, unreachable and server-error into one null turns a dropped wifi into a false accusation that also destroys the credential

## Problem

Two defects in the `/staff` refactor, each survivable alone, catastrophic
together.

**One: `null` stood for three different worlds.** The original
`refreshSession` returned `StaffSession | null`:

```tsx
/** Trade a refresh token for a fresh session, or null if it no longer works. */
const refreshSession = useCallback(async (refreshToken: string): Promise<StaffSession | null> => {
  try {
    const res = await fetch(/* .../auth/v1/token?grant_type=refresh_token */);
    if (!res.ok) return null;
    return sessionFromGrant(await res.json().catch(() => null));
  } catch {
    return null;
  }
}, []);
```

Three outcomes reach that `null`: a genuinely revoked refresh token (`!res.ok`
with a 400/401), a Supabase 5xx or 429 (also `!res.ok`), and a network throw (the
`catch`). The caller cannot distinguish **"we PROVED you are not renewable"**
from **"we could not ASK."** The comment says "or no longer works," which is
precisely the conflation.

**Two: a first-failure flag that never reset.** `origin` decides what an
unrenewable 401 means. It was set to `"fresh"` at sign-in and never set again, so
the fresh branch became permanent for the life of the page and applied to every
subsequent 401 — including ones arriving an hour later from a session the API had
accepted dozens of times.

**Composed**, the failure is this. A real staff member, signed in on a phone,
walks into a dead spot and taps a tab. The GET throws; the shell reads that as a
401-shaped failure, tries the refresh, the refresh also throws, `refreshSession`
returns `null`, `origin` is still `"fresh"` — so the shell shows the staff-only
refusal AND calls `signOut(active.accessToken)`, firing the still-valid token at
`/auth/v1/logout`. GoTrue's default logout scope is global: that revokes the
whole refresh-token family. A momentary loss of signal permanently destroys a
working session and accuses the user of not being staff.

The file's own header already stated the invariant this violated:

> showing the staff-only refusal there would tell a real staff member they are
> not staff.

The `restored` branch honoured it. The `fresh` branch, once it became permanent,
did not.

## Solution

**Name the outcomes.** `RefreshOutcome` replaces the nullable session, and only
auth-level statuses condemn the credential:

```tsx
/**
 * What a renewal attempt actually told us. Collapsing these three into null is
 * how a dead spot becomes "you are not staff" (see the header).
 */
type RefreshOutcome =
  | { kind: "renewed"; session: StaffSession }
  | { kind: "rejected" }    // the grant is dead: 400/401, or nothing to renew with
  | { kind: "unreachable" } // transient: network throw, 5xx, unparseable body
  | { kind: "stale" };      // the session changed underneath us
```

```tsx
} catch {
  return { kind: "unreachable" };
}
// ONLY the auth-level refusals condemn the session. A 5xx, a 429 or a
// proxy error says nothing about whether this person is staff.
if (res.status === 400 || res.status === 401 || res.status === 403) return { kind: "rejected" };
if (!res.ok) return { kind: "unreachable" };
const renewed = sessionFromGrant(await res.json().catch(() => null));
return renewed ? { kind: "renewed", session: renewed } : { kind: "unreachable" };
```

`unreachable` becomes the tab's ordinary retryable error, with the session
untouched:

```tsx
if (renewal.kind === "unreachable") {
  // Could not REACH the renewal. Retryable, and the session stands.
  return { kind: "error" };
}
```

**Make `origin` a state machine, not a boolean.** A third state, `proven`, is
set on the first 2xx from the API:

```tsx
/**
 * How much this session has PROVEN, which decides what an unrenewable 401
 * means:
 *  - `restored` — rehydrated from storage. Cannot be renewed -> it expired, so
 *    the honest answer is the sign-in form. Showing the staff-only refusal
 *    would tell a real staff member they are not staff.
 *  - `fresh` — just typed in and never yet accepted by the API. Cannot be
 *    renewed -> this account IS refused, and its token is revoked.
 *  - `proven` — has had at least one 2xx from the API, so it is staff. A
 *    later unrenewable 401 is an expiry, not a refusal. Without this, the
 *    `fresh` verdict would stand for the entire life of the page and a
 *    staff member who worked for an hour would be told they are not staff.
 */
const origin = useRef<"restored" | "fresh" | "proven">(session ? "restored" : "fresh");
```

Every successful response advances it (`if (first.kind === "json") { origin.current = "proven"; ... }`),
and only the `fresh` verdict revokes:

```tsx
if (renewal.kind === "rejected") {
  if (origin.current === "fresh") {
    // Never accepted by the API and cannot be renewed: this IS the
    // refusal. Revoke, so a child credential never lingers here.
    dropSession(active.accessToken);
    setRefused(true);
  } else {
    // Restored or already proven: expired, not refused. Drop it quietly
    // and ask for the password.
    dropSession(null);
    setSignInError(null);
    setRefused(false);
  }
  return { kind: "unauthorized" };
}
```

Note `dropSession(null)` on the expiry branch: nothing is revoked when nothing
was proven bad.

## Why This Works

The two questions the page must answer are genuinely different and were being
answered by one value. "Can we reach the auth server?" is a transport question
whose only correct response is retry. "Does the auth server say this credential
is dead?" is an authorization question, and only IT may drive an accusation or a
revoke. Splitting the return type makes the distinction unrepresentable-away —
the compiler forces the caller to handle `unreachable` separately — and the
three-state `origin` makes "how much has this session proven" monotonic, so a
verdict correct at second zero cannot leak into minute sixty.

## The one that hid in plain sight

`origin.current = "fresh"` inside `signIn` looks redundant next to the `useRef`
initializer, and deleting it **survived the entire test suite**. Its real job
covers the second sign-in on one page view: an expired *restored* session leaves
`origin` at `"restored"`, and without the reset a CHILD typing their credentials
into the staff form would be judged by the restored rules — a quiet drop to a
blank sign-in form with no error, no refusal, and a non-staff token left live
server-side. A line that is unreachable in the tests you have is not the same as
a line that is unnecessary.

## Prevention

- **A sentinel like `null` must not stand for outcomes that require different
  responses.** If the caller would branch on WHY, the type has to carry the why.
  Name the outcomes in a discriminated union and let exhaustiveness checking find
  the callers.
- **"Cannot reach the auth server" and "the auth server says no" are never the
  same answer, and only the second may accuse the user.** Classify by status
  explicitly: only 400/401/403 from the token endpoint is a rejection; a throw, a
  5xx, a 429 or an unparseable body is transport, and transport is retryable.
- **A flag that decides how to interpret a FIRST failure must not stay set after
  the first success.** Model it as a state machine (`restored -> fresh ->
  proven`), not a boolean, and advance it on every proof.
- **Before firing a revoke, ask whether the evidence proves the credential is bad
  or only that you could not check it.** GoTrue's default logout scope is global:
  it revokes the whole refresh-token family, so a revoke fired on ambiguous
  evidence is not a recoverable mistake.
- Accusatory copy deserves the same bar as a destructive action. "You are not
  staff" shown to staff is a bug even when nothing is deleted; shown together
  with a revoke, it is a support ticket that ends in a password reset.
