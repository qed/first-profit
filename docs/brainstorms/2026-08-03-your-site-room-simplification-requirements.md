---
title: "Your Site room simplification: real link + editing Coming Soon"
date: 2026-08-03
status: ready-for-planning
scope: lightweight
reviewed: document-review 2026-08-03 (coherence, feasibility, product, design) — findings resolved below
---

# Your Site room simplification: real link + editing Coming Soon

## Problem

Clicking "Your Site" on the factory floor still shows the legacy mock website
(fake browser frame, `/you` URL, headline input, "Edits publish instantly. Your
parent sees everything that goes live.") whenever `VITE_ENABLE_PUBLIC_SITE` is
off — and even the flag-on room carries an in-room headline editor the product
no longer wants. The real public site exists (branch `feat/real-public-site`);
the room should stop simulating and simply link to it.

## Decisions

1. **The simulated website is deleted everywhere** — the browser-frame chrome
   (traffic-light dots), the headline/one-liner preview text, the "Back me ·
   from $10" pill, and the `/you` URL. No flag state renders simulated site
   content. (The pill was a single-file preview affordance; it retires with the
   mock.)
2. **When site status is `published`, the room body shows exactly two things:**
   - A prominent affordance to **open the child's real website in a new tab**
     (`https://firstprofit.school/<handle>`; constructed href only,
     `target="_blank"`, `rel="noopener noreferrer"`; the accessible name must
     include "opens in a new tab", not just the ↗ glyph; ≥44px tap target;
     URL text truncates with ellipsis at container width at ~390px).
   - The note: **"Changing your First Profit website is coming soon."**
     (kid-voice sentence, per review; no em dashes.)
3. **Removed outright:** the headline input box and everything that existed to
   serve it (PII nudge, server-divergence note), the line "Edits publish
   instantly. Your parent sees everything that goes live.", and ALL child-facing
   parent-visibility copy (user decision: the room says nothing about parent
   visibility; the parent surface on the120 is unaffected).
4. **Unclaimed accounts (flag ON) keep the in-room claim UI** (existing
   `ClaimBlock`/`useClaimFlow`); a successful claim still publishes (claim is
   the go-live moment) and the room then renders the published body. The
   ONBOARDING claim screen (new accounts) is untouched and out of scope.
5. **State honesty is unchanged in substance** (R19). With the frame gone, a
   simple caption block carries the state:

   | Site status | Room body |
   |---|---|
   | `published` | open-site affordance + Coming Soon note |
   | `offline` | plain-text URL + existing reason caption (no clickable link) + Coming Soon note |
   | `claimed` | "going live…" caption (existing one-shot retry stays) + Coming Soon note |
   | `none` (flag on) | in-room claim UI (placeholder URL text allowed; nothing simulated) |
   | `unknown` | neutral caption, no link, no claim UI |

   The Coming Soon note shows in every claimed-or-later state (normative, not
   optional). The claim state and published state share one container layout.
6. **Flag-off builds render ONLY the Coming Soon note** — including for
   unclaimed accounts (claiming needs the gated backend, so no claim UI without
   the flag; no link, no mock). This deliberately retires the "flag-off
   byte-identical legacy room" stability contract and its byte-pin tests —
   designed removal, not a regression.

## Accepted behavior notes

- The public page's **one-liner keeps tracking the active idea** via the Step
  Runner field and the server projection — untouched and deliberate. The PII
  nudge lives at that authoring surface (Step Runner) already, so no safety
  copy is lost by deleting the room's editor.
- With the headline editor removed, `siteHeadline` has no writer: new pages
  show the default headline sentence until site editing ships. A child who
  already saved a custom headline keeps it live on their page with no in-room
  edit path until then — accepted; the parent takedown and operator lock remain
  the safety levers.
- Pages are not identical at launch: first name and the active idea's one-liner
  personalize them; headline personalization returns with the future editing
  feature ("Coming Soon" is that commitment — keep it honest on the roadmap).

## Success criteria

- Clicking "Your Site" never shows simulated website content in any state.
- A published child can open their real page in a new tab from the room.
- No headline input anywhere in the room; the removed copy strings appear
  nowhere; no parent-visibility copy in the room.
- Existing-account claim path (flag on) still works end to end.
- Room tests updated (legacy byte-pins deleted by design); ~390px + desktop
  verified per CLAUDE.md.

## Out of scope

- The future site-editing experience itself.
- Serving layer, projection trigger, the120 endpoints, onboarding claim screen.

## Affected code (orientation, not design)

`src/components/rooms/YourSite.tsx` (both variants collapse into one),
`src/components/rooms/__tests__/YourSite.test.tsx`, possibly `src/lib/siteCopy.ts`.
`src/components/claim/ClaimBlock.tsx` and `src/lib/useClaimFlow.ts` reused as-is.
