---
module: signup
tags: [ux, signup, auto-login, confirmation-screen, email, generated-credential]
problem_type: ui_bug
---

# A signup that auto-logs-in on success skips its own confirmation screen — deliver must-keep info on a channel the user actually sees

## Problem

First Profit signup ends by minting the child account, then — on the happy path —
**auto-logging the child into the game**: the `Signup` container unmounts and the
factory floor renders. The flow also has a confirmation screen that shows the child's
**system-generated username** (the thing the parent needs to hand their child for
future logins).

The trap: on the successful happy path the confirmation screen **never renders** — the
auto-login unmounts the whole signup flow before it shows. The confirmation screen only
appears on the *rare* branch where the immediate child login fails (a race/replay) and
the flow falls back to "confirmation." So "we show your child's username on the
confirmation screen" is a promise the common path silently breaks — a parent who
sails through signup is auto-logged-in and never sees the username in-app.

The first draft's copy even said "we show it on the next-to-last screen and email it to
you," over-promising the in-app screen most parents won't see.

## Symptoms

- A value generated during signup (username, temporary code, account id) is "shown on
  the success screen," but users who complete the flow are redirected/auto-advanced
  past that screen and never see it.
- The in-app confirmation is only reachable on an error/fallback branch.

## Solution

Deliver any must-keep, generated-at-signup information on a channel the user reliably
sees regardless of which branch the flow takes — here, the **recap email** (sent on
child-created, always) is the source of truth for the username. Then make the copy lead
with that channel:

```diff
- "...we give your child a username to log in with. We show it on the next-to-last
-  screen and email it to you."
+ "...First Profit picks a unique username for your child and emails it to you, so you
+  always have it."
```

Keep the in-app confirmation display for the fallback branch (and associate its label
with the value for a11y — `aria-labelledby`), but do not treat it as the primary
delivery.

## Why This Works

An auto-advance-on-success flow structurally swallows its own final screen for exactly
the users who succeed. Any information that screen was "responsible" for showing has no
reliable in-app moment, so it must ride an out-of-band channel (email/SMS) that fires
on the same success event. The confirmation screen becomes a nicety for the error path,
not the delivery mechanism.

## Prevention

- **When a flow redirects/auto-advances on success, list what its final screen was
  supposed to show, and ask: "does the succeeding user actually see this?"** If the
  success path unmounts past it, move the must-keep info to a channel tied to the same
  success event (email), and scope any in-app display to the branches that actually
  render.
- **Don't let copy promise a screen the happy path skips.** Describe the reliable
  channel ("we emailed it to you"), not the incidental one.
- Applies to any generated-at-completion artifact: usernames, recovery codes, order
  numbers, invite links.
