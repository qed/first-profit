---
date: 2026-08-03
topic: real-public-site
---

# Real Public Site at firstprofit.school/&lt;handle&gt;

## Problem Frame

Onboarding promises every learner "a live website at firstprofit.school/their-name," and the Your Site room says "Edits publish instantly" — but nothing is actually served at that URL. The handle "available" badge is fake, and visiting `firstprofit.school/cedric` just boots the SPA to the landing page. The promise is the product's most tangible hook, and today it is a mock.

This work makes the promise true: when a learner claims a handle in onboarding, a real, shareable web page exists at that URL, shows the text from that step, and updates as they edit it from inside the game — a page they can share with family and friends and improve over time.

## Requirements

**Handle claiming**

- R1. Onboarding checks handle availability for real as the learner types; the "available" badge reflects the actual registry, never a fake value. The badge has an explicit pending state while a check is in flight; a failed check never blocks typing (the claim is re-validated server-side at submit). Badge state changes are announced accessibly (ARIA live region or equivalent).
- R2. If the desired handle is taken, onboarding suggests available variants (e.g. `cedric-c`, `cedricco`) the learner can pick with one tap. Manual entry always remains available, so exhausted suggestions never dead-end the flow.
- R3. Claiming the handle in onboarding reserves it uniquely for that account (first come, first served). No rename path in v1; longer-term permanence/reclaim policy is deliberately left open. If a claim is rejected at submit because someone else won the race after the badge showed "available," onboarding shows an inline explanation and refreshed suggestions — never a dead end.
- R4. Reserved words can never be claimed. The list is generous and append-only: all current app paths (`signup`, `login`, `api`, …), plausible future top-level routes (`pricing`, `shop`, `teachers`, `about`, …), brand terms, and abuse/impersonation terms. Because handles share the domain root with app routes, this list is treated as security-relevant infrastructure — curated, with a rationale per entry, not an ungoverned dump.
- R15. Handle format is constrained: lowercase `a–z`, digits, hyphens, bounded length (~3–20 chars). The input normalizes as the learner types (auto-lowercase, invalid characters dropped) rather than rejecting keystrokes punitively. Onboarding copy nudges toward first-name-style handles and away from full legal names (the handle is public and unrenamable in v1, so it is itself published content).
- R16. The public handle is a NEW, distinct field — deliberately decoupled from the the120 login username, which is a credential and is never published or hinted at by the public URL. Onboarding is the authoritative claim moment for new accounts; pre-existing accounts (e.g. the Cedric test family) have no public handle until they claim one through the same claim step at their next login. This removes any seeding/backfill of legacy usernames (which may be email-shaped and format-invalid) into the registry.

**Public page**

- R5. `firstprofit.school/<handle>` serves a real public page for a claimed handle, viewable logged-out, on any device, mobile-first (~390px per project standard). Handles live at the domain root (as promised throughout the product); R4's over-reservation is the accepted cost of that choice.
- R6. The v1 page shows: the learner's first name, their site headline, and the active idea's one-liner — omitted entirely when not yet written, matching the in-game preview (`src/components/rooms/YourSite.tsx` renders it conditionally). Headline and one-liner have enforced length caps (headline ≤ 120 chars, one-liner ≤ 140 chars) applied both at the input and at the publish/render boundary, so pre-existing saved content or non-UI writes cannot break the ~390px layout.
- R7. The page carries a "Built with First Profit" footer linking to the First Profit landing page (every shared link doubles as a growth loop). No other navigation into the app from the public page, and no visitor-facing report affordance in v1 (parent notification per R21 is the discovery path — an explicit accepted tradeoff).
- R8. The "Back me · from $10" pill does NOT appear on the public page in v1 (it remains in the in-game preview only).
- R9. Page states are fully enumerated: (a) unknown/unclaimed handle → friendly not-found page saying no founder has claimed this page yet, inviting the visitor to start their own via the landing page; (b) claimed but never yet published (learner abandoned onboarding before the completion flush) → the same not-found state, since nothing has ever been published; (c) claimed and published but content fetch fails → a distinct "temporarily unavailable" state, never not-found; (d) unpublished by parent/operator → a neutral "this page is offline" state (not the not-found copy, which would be false and imply the handle is claimable). Existing app deep links (e.g. `/signup/verify`) keep working.
- R10. Sharing the link in a messaging app shows a preview with the learner's headline (page-specific title/description), so the shared link looks like *their* site, not a generic app card. This is a hard v1 requirement — the share moment is the feature — and it constrains the serving architecture to one that can emit per-page meta tags.
- R17. Public pages are marked `noindex` in v1: excluded from major search-engine indexes. Direct-link fetching, messaging-platform preview caches, and non-cooperating archivers remain possible and are accepted residual exposure for v1 — the claim is "not discoverable via search," not "never cached anywhere."
- R18. The public page and the availability-check endpoint are new unauthenticated surfaces; both get basic abuse protection (rate limiting / bot mitigation) so handles and child content cannot be enumerated or mass-scraped. Mechanism is planning's choice. Because the handle is decoupled from the login username (R16), the availability endpoint is not a credential oracle.

**Editing and publishing**

- R11. Edits to any string that appears on the public page (headline, active idea one-liner) publish automatically — no parent-approval gate in v1. Publishing has a stated freshness bound rather than a literal "instant": committing such an edit (and completing onboarding) triggers an immediate flush of the pending save, so the public page reflects it within seconds under normal conditions.
- R12. The public page reflects the latest successfully saved content within the R11 freshness bound; the same default headline used in-game ("Hi, I'm {name}…") renders when the learner hasn't customized it yet.
- R19. The learner must never believe a change is live when it isn't — since the next thing they do is share the link. Two distinct visible states, on every surface that edits a public string: (a) publish failure (offline, server error) → "not published yet / retrying"; (b) blocklist rejection (R23) → an immediate, kid-friendly inline message at commit time; the prior valid value stays published, and the rejection is never surfaced as a retry (it would never succeed) nor allowed to wedge the save-doc outbox behind a poison entry.
- R20. (Soft, not load-bearing for launch.) Before the flow presents the URL as share-ready (onboarding reveal, Your Site room), the learner is encouraged — not forced — to write their own headline, so shared pages don't all show the identical default template.
- R24. The publish write path verifies the authenticated session owns the target handle/account — an explicit ownership check independent of claim-time uniqueness (R3), so no account can write another child's public page across the two-backend join.

**Parent visibility and safety net**

- R21. The parent can see their child's public URL and current page content from the parent's own account surface, and receives a notification (email) when the child's page first goes live — keeping the existing "Your parent sees everything that goes live" promise true in effect, not just in letter.
- R22. The parent (and an internal operator) can unpublish the page at any time: an unpublished page renders the neutral offline state (R9d) while the handle stays reserved; republishing is equally simple, and the Your Site room visibly reflects the unpublished state to the learner (no editing into the void, no confused sharing). Operator access is authenticated admin capability with unpublish/republish actions audit-logged. Account deletion removes the page (handle disposition on deletion is an open policy question). Known limit: messaging-platform preview caches may retain the old title/description after unpublish — accepted residual, consistent with R17's honest scoping.
- R23. A lightweight blocklist screens the three learner-authored public strings (handle, headline, one-liner) at write time for profanity and obvious abuse terms; rejection UX per R19b. This is a guardrail, not a moderation system — no review queue, no ML moderation in v1. Known limit, accepted deliberately: a blocklist cannot catch self-disclosure of personal information (last name, school, city, phone) — input copy near these fields nudges against personal details, and the R21 notification + R22 kill switch are the backstop.

**In-game integration**

- R13. Clicking the Your Site pod in The Company still opens the Your Site room; the room gains a "Visit your site ↗" affordance (the browser-frame URL bar becomes a real link) that opens `firstprofit.school/<handle>` in a new tab. While R19's "not published yet" state or R22's unpublished state is active, the room signals it (so a learner doesn't open a tab expecting content that isn't live).
- R14. The onboarding website-reveal step (screen 3) reflects reality: the page it shows genuinely exists at that URL by the time onboarding completes (onboarding completion flushes the save per R11).

## Success Criteria

- A brand-new learner finishes onboarding, texts their URL to a family member, and that person sees the learner's page — first name and headline (their own if the R20 nudge landed, else the default), plus the one-liner once written — on their phone with a proper link preview.
- The learner changes their headline in the Your Site room, refreshes the public page, and sees the new headline within seconds.
- Two learners cannot end up with the same handle; a taken handle is visibly taken during onboarding with a usable suggestion, and a lost claim race resolves inside the flow.
- A parent is notified when their child's page first goes live, can find the page from their own account, and can take it offline in one action — after which the public URL shows the neutral offline state and the child's room reflects it.
- `firstprofit.school/signup`, `/login`, and other app paths behave exactly as before.

## Scope Boundaries

- No payments on the public page: no "Back me" button, no checkout, no backer counts (payment work is in flight separately).
- No parent approval/preview gate before publishes, and no moderation queue or ML content review, in v1 — the safety net is notification + visibility + kill switch + blocklist (R21–R23).
- No visitor-facing report affordance on the page in v1 (explicit tradeoff; parent notification is the discovery path).
- No page customization beyond the headline (no themes, images, colors, extra sections). "Improve over time" in v1 means the headline and the idea one-liner evolving as they progress.
- No custom domains, no search indexing (R17), no SEO work, and no learner-visible analytics/visit counts (a page showing 0 views is demotivating). Minimal internal telemetry (page visits, footer clicks) is permitted at planning's discretion so the share-moment hypothesis is measurable.
- No handle renames in v1; no handle marketplace or expiry. Long-term permanence/reclaim policy is deliberately undecided.

## Key Decisions

- **Instant publish with a safety net (not an approval gate)**: edits go live immediately; the parent is notified at first publish, can always see the page, and can take it down; a blocklist screens the three public strings. Rationale: keeps the magic and keeps the "Your parent sees everything that goes live" copy true; the curriculum brief's parent-control posture is honored via notification + kill switch rather than a gate. Revisit if the editable surface grows.
- **Public handle is a new field, decoupled from the login credential**: the120 usernames are login secrets (username+password, no email) and are never published; the URL handle is claimed separately in onboarding. Existing accounts claim at first login — no legacy seeding.
- **Root-namespace URLs, over-reserved**: `firstprofit.school/<handle>` as promised throughout the product, with a generous append-only reserved list. Honest framing: the list reduces the probability of a future route colliding with a claimed handle; it does not bound the cost when prediction fails, and the route-vs-handle resolution policy is deliberately open (reclaim mechanism or burying the route — decided if/when it happens). Subdomains and `/s/` prefixes were considered and rejected as weakening the promise already printed across the product.
- **Link previews are v1-hard (R10)**: a generic app card at the share moment would be the mock all over again; the serving architecture must support per-page meta tags.
- **noindex in v1 (R17)**: shareable ≠ searchable; scoped honestly to search-engine exclusion, with preview caches accepted as residual exposure.
- **No Back me on the public page in v1**: nothing on the real page should be fake or dead-ended; payments arrive when real checkout ships.
- **Live availability check + suggestions** over auto-assignment or ID-suffixed URLs: preserves the "claim your name" moment and clean shareable URLs.
- **Room + visit link** over pod-opens-site-directly: keeps headline editing discoverable; the new-tab visit lives inside the room's browser frame.

## Dependencies / Assumptions

- `siteHeadline` and the idea one-liner persist server-side via the save-doc sync layer (`src/state/gameCore.ts` `toSaveDoc`); `handle` and `firstName` do NOT — `firstName` comes from the the120 auth profile at login (`src/lib/auth.ts`), and the public handle is a new field (R16) whose home (the120 vs. Supabase registry) is planning's choice. The public projection must join identity fields with save-doc content — and the save doc itself must stay private.
- Publish latency is governed by the sync engine (`src/lib/sync.ts`: 3s debounce, 30s ceiling, offline outbox); R11's flush-on-commit works within that machinery, and R19's rejection handling must respect its retryable-vs-terminal error model.
- Parent notification (R21) depends on the120, which owns parent accounts and email; delivery mechanics are planning's choice.
- The current SPA-catchall rewrite lives in Vercel dashboard config (no `vercel.json` in repo); R5/R9/R10 depend on locating and versioning it.
- **Launch gate (not planning-blocking):** the child-privacy/COPPA posture — publishing first name + handle + business one-liner logged-out under the R21–R23 safety net — is an unvalidated assumption that must be confirmed as a policy check before the feature goes live.

## Outstanding Questions

### Resolve Before Planning

(none)

### Deferred to Planning

- [Affects R5, R10][Technical] Serving architecture for the public page, constrained to options that can emit per-page meta tags (SSR route, edge function, or prerender layer — a pure client-rendered SPA route cannot satisfy R10).
- [Affects R1–R4, R16][Technical] Where the handle registry (the new public-handle field) lives — the120 vs. Supabase unique-constraint table — and how claims are made atomic.
- [Affects R11, R12, R24][Technical] The public read path (read-time fetch vs. published projection updated on save; a DB-side projection avoids a second client write path) and how it joins identity + content across the two backends with the ownership check.
- [Affects R19, R23][Technical] Where blocklist screening executes (client pre-write, server-side, or projection-time) given the save-doc outbox's retryable-vs-terminal error model; blocked attempts should be logged for abuse-pattern visibility.
- [Affects R18][Technical] Concrete rate-limit/bot-mitigation mechanism for the two unauthenticated surfaces.
- [Affects R4, R23][Needs research] The concrete reserved-word list and blocklist term set, including a named owner for ongoing maintenance.
- [Affects R21, R22][Technical] Where the parent-facing view/notify/unpublish controls live (the120 parent surface vs. FP) and the notification delivery mechanism.
- [Affects R22][Product, later] Handle disposition when an account is deleted (freed vs. retired).

## Next Steps

-> `/ce:plan` for structured implementation planning
