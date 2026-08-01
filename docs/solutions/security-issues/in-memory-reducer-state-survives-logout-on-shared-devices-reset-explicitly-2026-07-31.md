---
module: game-state
tags: [shared-device, logout, reducer, session, hydrate, data-isolation, kids]
problem_type: security_issue
severity: high
date: 2026-07-31
---

# In-memory reducer state survives logout on a shared device — reset it explicitly, don't rely on hydrate-on-next-login

## Problem

First Profit runs on shared school Chromebooks: one browser profile, many
children in a row. Game state (a child's business ideas, task answers, and
sales/backings ledger) lives in a React `useReducer` store. Logout blanked the
`profile` (name/handle) and returned to the login screen — but never cleared
`state.ideas` or `state.ledger`. So child A's ideas and financial ledger stayed
resident in memory after A logged out, and could surface to child B.

The tempting assumption — "it's fine, child B's login will `HYDRATE` from their
save and overwrite it" — is wrong for two independent reasons.

## Symptoms

- After logout, `state.ideas` / `state.ledger` still hold the previous child's
  data; nothing in the logout path resets them.
- The `HYDRATE` action overwrote `ideas` from the loaded save doc but **did not
  touch `ledger`** — so even a *successful* next-child hydrate left the prior
  child's ledger rows in place (a partial-hydrate leak).
- The stage advanced to `onboard`/`app` synchronously on login, *before* the
  (async, network-dependent, and in this slice not-yet-built) save fetch ran —
  so any slow or failed hydrate leaves a window where the new child sees the old
  child's state.

## What Didn't Work

- **Relying on HYDRATE-on-next-login as the reset mechanism.** It only overwrites
  the slices it explicitly copies. Any state slice the save doc doesn't carry
  (here: the ledger, which lives in a separate table, not the save document) is
  never cleared, so it leaks across users. "The next load will overwrite it" is
  only true for the fields the next load actually writes.
- **Clearing just the identity fields (profile).** Blanking the name/handle hides
  *who* is logged in but leaves *their data* in the store.

## Solution

Add an explicit reset action and fire it on every session boundary, before any
stage transition — never depend on the next login to clean up.

```ts
// gameCore.ts — a reset that clears game data but leaves stage/profile
// for the caller to set (so the provider controls the transition atomically).
case "RESET_SESSION":
  return {
    ...initialState(),
    stage: state.stage,      // caller sets the real stage next
    profile: state.profile,  // caller sets/blanks profile next
  };

// HYDRATE must reset EVERY slice it is responsible for, including the ones
// the save doc does not carry:
case "HYDRATE":
  return { ...state, ideas: doc.ideas, ledger: [], /* ... */ };
```

```ts
// provider — reset at BOTH boundaries, before advancing the stage
function login(...) {
  dispatch({ type: "RESET_SESSION" });        // clear prior child first
  const r = await loginChild(...);            // then adopt the new session
  // ... wipe fp:* drafts if different user, then SET_PROFILE + SET_STAGE
}
function logout(scope) {
  await revokeSession();
  dispatch({ type: "RESET_SESSION" });        // clear on the way out too
  dispatch({ type: "SET_STAGE", stage: "landing" });
}
```

Pair it with the account-scoped draft/localStorage wipe (different-user login
wipes `fp:*`; explicit logout wipes the current user's; idle logout preserves
the same user's drafts).

## Why This Works

The store is cleared at the moment of the session boundary, synchronously, so no
stage ever renders with a prior user's data — independent of whether, when, or
whether-successfully the next hydrate runs. Resetting on *both* login-start and
logout means neither a failed logout nor a failed/slow login can leave a
populated store behind. Making `HYDRATE` responsible for every slice (including
`ledger: []`) removes the partial-overwrite leak.

## Prevention

- **On a shared-device app, treat every session boundary as a hard reset of all
  user-scoped in-memory state — reset explicitly, at the boundary, before any
  navigation.** Do not treat "the next login will overwrite it" as isolation.
- **An overwrite-style load (HYDRATE/rehydrate) must write every user-scoped
  slice it owns, including ones sourced elsewhere (a separate table, a cache).**
  Audit the state shape slice by slice: for each, ask "what clears this when the
  user changes?" Any slice with no answer is a leak.
- **Reset before the stage/route transition, not after** — an async load between
  transition and reset is a visible-leak window.
- Extends to the persistence layer too: account-namespace every cached key
  (`fp:<userId>:…`) and wipe on a different-user login, so localStorage does not
  reintroduce what the in-memory reset removed. See
  `docs/solutions/ui-bugs/breakpoint-crossing-drops-navigation-2026-07-31.md`
  for the sibling "state held in the wrong place leaks across a boundary"
  pattern on this codebase.
