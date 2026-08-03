---
title: "Client mirrors of server validation should mirror FORMAT rules, never the moderation corpus — kid-facing UX rides server verdicts"
date: 2026-08-03
category: best-practices
module: public-site-client
problem_type: best_practice
component: frontend
applies_when:
  - "A client wants instant inline feedback for input the server screens against a curated blocklist"
  - "The product ships to children (or any audience the corpus itself would harm)"
severity: medium
last_updated: 2026-08-03
related_components:
  - src/lib/handleRules.ts (format-only mirror: pattern, length, normalization)
  - src/screens/Onboarding.tsx (badge/notice driven by server verdicts)
  - the120 app/fp/lib/fp-public-site-rules.ts (the authoritative rules module)
tags:
  - blocklist
  - client-bundle
  - echo-the-server
  - kid-safety
  - validation
---

# Client mirrors of server validation should mirror FORMAT rules, never the moderation corpus

## Context

Unit 5's first cut mirrored the120's full handle blocklist (slurs and profanity as
plain string literals) into the client bundle for instant pre-submit screening. Review
flagged it: in a kids' product, anyone can read the corpus in devtools/view-source,
and shipping it hands over the exact evasion surface. The import wasn't even flag-
gated, so the list shipped while the feature was dark.

## Guidance

Split the mirror by what each half costs to expose:

- **Format rules (safe to mirror):** charset regex, length bounds, normalization
  (lowercase/clamp). These are already observable from behavior, cost nothing to
  reveal, and enable instant local UX (disable the CTA, normalize as-you-type).
- **Moderation corpus (never mirror):** the term lists stay server-side only. The
  inline UX rides the SERVER's verdicts instead — a debounced availability check
  returns `invalid` as-you-type, and the claim endpoint returns a structured
  `invalid` refusal, both rendering the same kid-friendly message. Latency cost: one
  debounce round-trip on the rare blocked input. Exposure cost: zero.

## Why This Matters

The corpus is content-moderation IP and, in a children's product, harmful content in
its own right. It also invites drift: a client copy of the term list needs parity
maintenance forever, while a verdict consumer never drifts. This is the echo-the-
server lesson applied to moderation: the client receives conclusions, not the rules'
raw material.

## When to Apply

Any time a client "needs" a local copy of server screening: ask what the copy reveals
if pasted into devtools. Regexes and caps — mirror freely (byte-pinned). Term lists,
scoring weights, heuristics — consume verdicts.
