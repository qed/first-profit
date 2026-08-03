---
title: "Oracle-free server refusals: detect the one self-correctable cause client-side by re-fetch-and-compare"
module: fp-signup
date: 2026-08-03
problem_type: process_gap
component: frontend_stimulus
severity: medium
applies_when: "A server deliberately returns one generic refusal for every failure reason, but one of those reasons is something the USER could fix if only they knew"
tags: [anti-enumeration, generic-401, consent, stale-state, retry-convergence, refetch-compare, signup]
---

# Oracle-free server refusals: detect the self-correctable cause by re-fetch-and-compare

## Context

The signup consent endpoint refuses every failure (missing, stale,
version_mismatch, not_verified, parent_mismatch, outage) with a byte-identical
generic 401 — deliberately, to close enumeration oracles. But ONE of those
causes is self-correctable by the user: a consent policy that bumped between
page load and submit. With no signal, the parent's retry re-sent the same stale
echo and failed identically forever — a dead end built out of good security.

## Guidance

- Keep the server oracle-free. Do NOT add a reason code to fix the UX.
- Instead, on refusal, have the client re-fetch the PUBLIC input it echoed
  (here: the consent policy version/hash) and compare against what it just
  sent. A mismatch means "the world moved under you" — the one cause the user
  can fix. Route them back through the affected step with the FRESH data
  (re-attest against the new text; never pre-check the box, never echo a
  version the user did not see rendered).
- Scope the re-fetch so it cannot become a new oracle: it must key on GLOBAL
  state only (never per-account data), and it must be unreachable from the
  enumeration-sensitive step — pin that boundary with a regression test
  asserting the re-fetch is never called on a step-1 failure.
- Fall through to the plain generic error whenever the re-fetch fails, returns
  a partial body, or matches what was echoed. Every error branch needs an
  escape route ("Start again") — no error state may strand the user.

## Why This Matters

Misclassification is possible (an unrelated refusal coinciding with a policy
bump shows the re-attest screen once) but CONVERGES: the retry echoes the fresh
version, so the second refusal's re-fetch matches and falls through to the
generic branch. The design trades one bounded wrong-message round for closing
the infinite stale-retry loop, with zero change to the server's security
posture. The general shape: when a server flattens reasons on purpose, the
client can still recover the self-correctable cause by comparing its own echo
against fresh public state — inference from data it is entitled to, not a leak.

## When to Apply

- Any deliberately-generic refusal (login, signup, consent, coupon, quota)
  where one failure cause is stale-client-state the user could fix.
- Any versioned attestation echo (consent, ToS, pricing): the echo's legal
  meaning is "what was shown", so the recovery path must re-render before it
  re-echoes.

## Examples

feat/signup-stale-consent-retry (f1e2e88 + 4fd8a9a): `finishSignup` re-fetches
the policy on consent failure, returns `{ok:false, staleConsent:true, policy}`
on mismatch; the Signup screen re-attests against the fresh text and resubmits.
Tests pin convergence, the null/partial re-fetch fall-throughs, and that the
re-fetch never fires off a verifySignup failure.
