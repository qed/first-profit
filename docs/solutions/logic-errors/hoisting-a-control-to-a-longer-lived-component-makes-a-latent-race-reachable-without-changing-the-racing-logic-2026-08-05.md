---
title: "Hoisting a control to a longer-lived component makes a latent race reachable without changing a line of the racing logic"
module: fp-staff-shell
date: 2026-08-05
problem_type: logic_error
component: state-management
severity: high
symptoms:
  - "Signing out while a staff refresh was in flight let the grant resolve and RESURRECT the session: adoptSession wrote a fresh valid token back into sessionStorage and the page re-authenticated itself after the user had ended it"
  - "The /auth/v1/logout fired at sign-out revoked the OLD refresh-token family, not the resurrected one, so the live session left behind on a shared family tablet was one nothing had revoked"
  - "A deliberate sign-out during the first load after a fresh sign-in landed on the staff-only REFUSAL screen (reproduced: REFUSAL SHOWN? true / SIGNIN SHOWN? false)"
  - "A response from a dead session could write into the NEXT session's cache: the cache object dereferences cacheRef.current at CALL time, so replacing the Map did not orphan an in-flight writer"
root_cause: race_condition
resolution_type: code_fix
last_updated: 2026-08-05
related_components:
  - src/screens/staff/StaffShell.tsx (THE EPOCH RULE, renewOnce, performRequest, the cache ticket)
  - src/screens/staff/staffTypes.ts (StaffCacheTicket - epoch + per-key generation)
  - src/screens/__tests__/StaffShellRaces.test.tsx (the held-response window tests)
tags:
  - race-condition
  - component-lifetime
  - epoch
  - generation-token
  - session-resurrection
  - refactoring
  - shared-device
  - reachability
---

# Hoisting a control to a longer-lived component makes a latent race reachable without changing a line of the racing logic

## Problem

Unit 3 refactored `/staff` from a single-view screen into a two-tab shell
(`src/screens/staff/StaffShell.tsx` plus `staffSession.ts`, `singleFlight.ts`,
`staffTypes.ts` and the tab components). The renewal logic came across
essentially verbatim: sample the current session, await a refresh grant, adopt
the result. The old screen did exactly that in `loadSuggestions`:

```tsx
// 401. Renew once if we have anything to renew with, then re-judge.
const renewed = active.refreshToken ? await refreshSession(active.refreshToken) : null;
if (!renewed) { /* ... */ }

adoptSession(renewed);
const second = await getRows(renewed.accessToken);
```

Nothing in that sequence checks, after the `await`, whether the session it was
started for still exists. So the race — sign out during the grant, and the grant
resurrects the session you just ended — was present in the ORIGINAL code too. It
had simply never been reachable, and the reason is pure component lifetime:

```tsx
// old src/screens/StaffSuggestions.tsx
const loadSuggestions = useCallback(async (active: StaffSession, restored = false) => {
  setView({ name: "loading" });          // <- the list view unmounts HERE
  const first = await getRows(active.accessToken);
```

The Sign out button rendered ONLY inside the settled `list` view, at the bottom
of the file after the `loading`, `loadError`, `refused` and `signin` early
returns. `loadSuggestions` sets the view to `loading` before its first fetch, so
for the entire fetch-plus-renew window the Sign out button was not on the page.
There was no moment at which a user could click it. The race existed; the input
that triggers it did not.

Unit 3 hoisted the tab bar and Sign out into the shell, where they stay mounted
while a tab renders its own loading state inside the panel below:

```tsx
<button
  type="button"
  onClick={() => {
    dropSession(token);
    setRefused(false);
  }}
  className={/* ... */}
>
  {STAFF_COPY.signOut}
</button>
```

Same renewal logic. Newly clickable during every async window it now overlaps.

Three consequences, all verified with held-open responses in
`src/screens/__tests__/StaffShellRaces.test.tsx`:

1. **Session resurrection.** Sign out mid-refresh; the grant resolves;
   `adoptSession` writes a fresh, valid session into `sessionStorage` and the
   page re-authenticates itself. On a shared family tablet the next person finds
   a live staff session the previous user believed they had ended — and the
   best-effort `/auth/v1/logout` fired at sign-out revoked the OLD token family,
   not the one the grant just minted.
2. **A late response writing into the NEXT session's cache.** The cache object
   is memoized once and its methods dereference `cacheRef.current` at CALL time,
   so `cacheRef.current = new Map()` swaps the container without orphaning a
   writer that is about to call `write`. One staff member's cohort data could
   land under another's credential.
3. **A deliberate sign-out shown as a refusal.** Sign out during the first load
   after a fresh sign-in, and the 401 that comes back belongs to a session the
   user already ended — but `origin` was still `"fresh"`, so the shell announced
   "This page is for First Profit staff."

## Solution

One mechanism covers all three: a **session epoch**, bumped wherever the live
session changes identity, captured before every await and re-checked after it.

```tsx
/** Bumped whenever the live session changes identity. See THE EPOCH RULE. */
const epoch = useRef(0);
```

`dropSession` bumps it (and is the single owner of the cache reset), and `signIn`
bumps it on a successful grant. Every post-await mutation is gated:

```tsx
const outcome = await refreshFlight.current.run(() => refreshSession(refreshToken));

if (epoch.current !== startEpoch) {
  // The session died while the grant was in flight (sign-out, refusal, a
  // new sign-in). Adopting now would resurrect it — and the logout that
  // ran at drop time revoked the OLD family, not this one, so revoke the
  // resurrected token too rather than leaving it live server-side.
  if (outcome.kind === "renewed") revoke(outcome.session.accessToken);
  return { kind: "stale" };
}
if (outcome.kind === "renewed") adoptSession(outcome.session);
```

and in `performRequest`, a stale epoch returns `unauthorized` WITHOUT setting
`refused` — the tab stops, the shell has already moved to the sign-in form, and
no accusation is rendered:

```tsx
const renewal = await renewOnce(active.accessToken, startEpoch);
if (renewal.kind === "stale" || epoch.current !== startEpoch) {
  return { kind: "unauthorized" };
}
```

Cache writes go through a ticket taken BEFORE the fetch, carrying the epoch and a
per-key generation, so the cache itself refuses the stale write rather than
trusting the caller to remember:

```tsx
begin: (key: string): StaffCacheTicket => {
  generationCounter.current += 1;
  const generation = generationCounter.current;
  cacheGenerationRef.current.set(key, generation);
  return { key, generation, epoch: epoch.current };
},
write: (ticket: StaffCacheTicket, value: unknown) => {
  // A dead session's response must never land in the next one's cache,
  // and a slower earlier fetch must never overwrite a faster later one.
  if (ticket.epoch !== epoch.current) return false;
  if (cacheGenerationRef.current.get(ticket.key) !== ticket.generation) return false;
  cacheRef.current.set(ticket.key, value);
  return true;
},
```

## Why This Works

The epoch is the session's identity across suspension points. Checking it
immediately before each side effect converts "the session I started under is
still live" from a start-of-function assumption into a precondition re-verified
at every write — the same shape as the sync engine's generation token
(`docs/solutions/security-issues/async-writer-closes-over-per-session-key-but-reads-live-shared-state-guard-with-a-generation-token-2026-08-01.md`),
applied to auth rather than saves. The per-key generation handles the orthogonal
clock: two fetches for the same key WITHIN one session, where the epoch is equal
and only start order distinguishes them.

## The generalisation

A diff review asks "did the logic change?" and here the honest answer was no.
`renewOnce` is `loadSuggestions`'s renewal half with better names. What changed
was WHICH COMPONENTS ARE MOUNTED during an async window — and that property
appears in neither file's diff, because it is not a property of either file. It
emerges from the relationship between two components' lifetimes: the button's and
the loading state's. The old code was safe by an accident of render structure
that no comment recorded and no test asserted.

So: **when you hoist a control (or a piece of state) to a longer-lived
component, you have widened the set of moments at which it can be operated.**
Every async window it now overlaps is a new race, whether or not you touched the
async code. The refactor did not introduce a bug; it removed the accidental
guard that had been hiding one.

## Prevention

- When hoisting a control to a longer-lived parent, **enumerate the async windows
  it can now overlap that it previously could not.** For each one, ask what the
  in-flight operation will do when it resolves into the world that control just
  created. "The logic is unchanged" is not an answer to that question.
- **Any state mutation after an `await` needs a guard proving the world it was
  started for still exists.** An epoch/generation ref captured before the await
  and re-checked after is the cheap general form; a boolean `stopped` flag
  checked once at entry is not.
- **Invalidating a container does not invalidate in-flight writers.** Replacing
  `cacheRef.current` with a new `Map` leaves any closure that reads
  `cacheRef.current` at call time pointing at the NEW map. Make the write itself
  present evidence (a ticket) that the container refuses.
- **Test the WINDOW, not just the settled states.** Hold a response open with a
  deferred promise, interact (sign out, switch tabs, sign in as someone else),
  then release it. Sequential await-and-assert tests structurally cannot reach
  any of these states — and would have passed on the original screen too.
- When safety depends on a render-structure accident ("that button is not mounted
  during the fetch"), it is not safety. Either write the guard or write the test
  that fails when the structure changes.
