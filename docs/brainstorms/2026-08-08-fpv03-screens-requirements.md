---
date: 2026-08-08
topic: fpv03-screens
---

# fpv03 — Rebuild the Pre-Factory Experience, Screen by Screen

## Problem Frame

The fpv03 prototype (screenshots in `artifacts/fpv03/export-package/screenshots/`, assets in `artifacts/fpv03/export-package/assets/`) redesigns everything a family sees before the factory floor: the public home page, parent signup, a parent dashboard, the kid's intro, and a brand-new graphic-novel layer (pick a book cover, read the book, customize the hero, build your story). The factory floor itself (fpv03's S13–S17) stays on the current code.

The build is delivered as a ship-test-continue loop: each unit is committed and pushed to production (push to main deploys to firstprofit.school), the user (Caradoc) tests it live, confirms, and only then does the next unit start. Live screens are replaced as we go — no v3 preview gate — with 10 real families / 17 kids active in prod, so each unit must leave the product fully working.

## Screen Map (source of truth: the S-XX screenshots)

| Screen | Content | Fate in this build |
|---|---|---|
| S01 fp-home (2 shots: top/bottom) | Public landing: hero, product mock, "How the game is played" carousel | Rebuild `Landing` |
| S02 parent-signup | Enrollment step 1 of 3: name/email/password + 3 app tiles | Re-skin real flow |
| S03 verify-code | 6-digit email code + account menu (Account Details / My Kids) | Re-skin real flow |
| S04 add-kid | Step 2 of 3: kid name, age, website + consents | Re-skin real flow |
| S05 dashboard-apps | Parent dashboard: First Profit (Login + login info), Gauntlet & Math Academy (coming soon) | New parent area |
| S06 first-profit-intro | Kid: "How the game is played" example carousel + "Start your story" | New kid onboarding |
| S07 pick-book-cover | Kid: 6 look presets carousel, "Choose this look" | New |
| S08 fp-dashboard | Kid home: book cover + 4 cards (Read the Book / Customize Your Story / Build Your Story / Build Your Business) | New kid home |
| S09 read-the-book | Book viewer: spreads, contents (Intro + 5 chapters mirroring the 5 phases) | New |
| S10 customize-photo | Hero customization: photo upload tab | New (consent-gated) |
| S11 customize-avatar | Hero customization: avatar builder tab (presets + detail controls) | New |
| S12 build-your-story (2 shots: home/chapter) | Chapter list with panel availability; per-chapter Q&A flow that creates panels | New |

Note: `S12-build-your-story.png` (no suffix) is a stale duplicate of S06 — ignore it; the `-home` and `-chapter` shots are the S12 source of truth.

## Requirements

**Delivery model**

- R1. The work is cut into units, each mapped to (and named after) one screenshot or a tightly-coupled group of screenshots. Proposed cut: U1 = S01, U2 = S02+S03, U3 = S04, U4 = S05 (parent dashboard + parent login), U5 = S06, U6 = S07, U7 = S08, U8 = S09, U9 = S10+S11, U10 = S12.
- R2. Each unit ends with commit + push to main (production deploy). The user tests live and explicitly confirms before the next unit starts. No unit may leave signup, login, or the factory broken for existing families.
- R3. Each shipped unit replaces the live screens it covers immediately — no version gate. Mixed v2/v3 visuals during the rollout are accepted.
- R4. Per standing project policy, every unit gets the full review + compound treatment, and every screen must pass the ~390px mobile verification before it counts as done.
- R18. Every unit defines its interim exit states: any link or CTA pointing at a v3 screen that hasn't shipped yet either routes to the existing v2 surface that serves that purpose or renders as a disabled/"coming soon" state. The funnel is never dead-ended mid-ladder — this is the mechanism that makes R2 true for units U5–U9, whose destination screens ship later.

**Public + parent surface (S01–S05)**

- R5. S01 replaces the current landing page: hero ("Your kid's first $1,000, earned for real"), product mock, "How the game is played" two-column section with the example-panel carousel, Start Building / Log In CTAs.
- R6. S02–S04 re-skin the existing, working signup flow in place — same the120 backend calls and validation behavior, new v3 look (Enrollment framing, step 1-of-3 progress, app tiles, "Add your kid, and their story starts"). No mock phase.
- R7. S05 is a real, persistent parent area: parents sign in with their signup email + password and land on the parent dashboard showing (a) First Profit with a Login button into the kid experience plus the kid's login info, (b) The Gauntlet and Math Academy as non-clickable "coming soon" tiles, and (c) the account menu (Account Details / My Kids) seen in S03/S04. The dashboard must accommodate multi-kid families (the live cohort averages ~1.7 kids/family; exact layout decided in planning). Acceptance criterion: the login surface deterministically disambiguates a parent email login from an email-shaped kid username before U4 ships.
- R8. The end of signup flows into S05 (the parent's dashboard) rather than the current one-shot credentials handoff. On return visits S05 shows the kid's username plus a parent-initiated password-reset flow — kid passwords are never stored retrievably; the one-shot reveal at creation time remains the only moment the password is shown.
- R17. The add-kid consent (S04) is updated for v3 to additionally cover collection of the kid's photo for use in their story/hero artwork (a new consent version, following the established consent-versioning practice). This ships with U3 so consent coverage exists before S10 (U9) arrives. Photo upload is enabled only for kids whose recorded consent includes the photo item, enforced server-side (not just a disabled control). Kids consented under an older version see, in place of the upload, an "Ask parent for consent" CTA that sends an email to the kid's parent and to admissions@the120.school so the First Profit team can follow up; once the parent re-consents, the upload unlocks.

**Kid onboarding + graphic-novel layer (S06–S12)**

- R9. A kid's first login leads through S06 (intro carousel) → S07 (pick book cover) → S08 (First Profit Dashboard). A *returning* kid (one who has completed the v3 first-login sequence) lands directly on S08. The 17 *existing* kids (consented and onboarded under v2, including any mid-way through the current Onboarding flow) also land on S08, skipping S06/S07; they pick their cover later via Customize Your Story. Idea creation, currently owned by the v2 Onboarding screen, moves behind the Build Your Business card: a kid with no idea who heads for the factory is routed through the existing create-idea flow (the coach's `create-idea` target precedent) before the floor.
- R10. S08 is the kid's home: book cover preview (chosen look, "The <Name> Story"), and 4 action cards — Read the Book, Customize Your Story, Build Your Story, and Build Your Business. Build Your Business is the primary card (per the story-layer purpose decision): it links to the existing factory floor code and shows the next task to complete. Existing kids get a brief one-shot orientation on their first S08 visit pointing at Build Your Business / their next task, so mid-progress kids aren't stranded by the new home.
- R19. The v3 kid screens keep the ONE-bar architecture: GlobalNav is extended with the Dashboard / Read the Book links in the app stage (keeping the idea/business chip, Sales/Profit stats, and save indicator), with its mobile collapse designed once. No second nav bar.
- R11. All story imagery is static presets in this build: the 6 cover looks and panel art ship as bundled assets. No AI image generation and no Image Lab dependency.
- R12. S09 renders the kid's book: cover in the chosen look, contents page (Introduction + Chapters 1–5 named Sell/Build/Validate/Grow/Scale), and spreads populated by the panels built so far; unbuilt sections appear as empty/upcoming pages.
- R13. S10+S11 are one Customize Your Story surface with two *top-level* tabs, matching the screenshots: "Change the Hero" and "Change the Look & Feel" (the latter re-hosts the S07 six-look cover picker so a kid can re-pick their look). Inside Change the Hero, a secondary toggle switches between "Upload a photo" (S10) and "Build an avatar" (S11). The avatar builder is functional: preset heroes, reroll, and detail controls, persisted per kid. Photo upload is functional for consent-covered kids (per R17): the photo is collected, stored, and shown as the hero photo. AI transformation of the photo into panel art comes later with the AI-art upgrade; until then panel art stays preset regardless of hero choice.
- R14. S12 Build Your Story: a chapter list (Intro + 5 chapters) showing panel availability per chapter, and a per-chapter flow where the kid answers authored questions (e.g. Intro has 6; the question set is authored as part of U10, storage location decided in planning). Answering a question creates a panel: preset art for that question + the kid's own words as the panel caption. "Re-create this panel" pre-fills the existing answer for editing — a kid can never silently lose written text. Chapters that aren't yet available render visibly locked with an unlock hint (consistent with how gated rooms are communicated on the floor), not hidden.
- R15. Intro panels are available immediately after onboarding; each chapter's panels become available as the kid progresses through the corresponding phase in the factory. Panels created in S12 are what S09's spreads display.
- R16. Story state persists per kid through the existing save/sync mechanism, but it is NOT all one merge behavior: built-panel *existence* is monotonic and can ride the union channel (like completions), while question answers/captions, avatar config, and cover look are editable latest-intent values that need explicit last-write-wins semantics (the `archiveStateAt` timestamp precedent) so a redo in one tab can't be resurrected by stale state in another. All SaveDoc additions must stay additive under the current docVersion (`fromSaveDoc` discards unknown versions — no version bump mid-rollout with live families).

## Success Criteria

- A brand-new family can go end-to-end in prod: S01 → signup → parent dashboard → kid first login → intro → pick cover → kid dashboard → build intro panels → read them in the book → enter the factory and do a task.
- The story layer pulls toward the factory, not away from it: existing kids' factory task completion does not drop after the kid-facing units ship.
- Existing families are never broken mid-rollout: kid login and factory access work after every unit ships.
- Every screen matches its screenshot's layout and copy intent at desktop and ~390px mobile.
- The user has explicitly confirmed each unit in prod before the next unit begins.

## Scope Boundaries

- Factory floor and everything past it (fpv03 S13–S17: factory map, sell floor, task detail, story wall) — out; S08 links to the existing floor.
- Login screen re-skin (fpv03 S17) — out; the current login screen stays.
- AI image generation, Image Lab wiring, "Re-create this panel" producing new art, AI transformation of an uploaded photo into hero/panel art — out (later upgrade).
- Gauntlet / Math Academy as working links — out; coming-soon tiles only.
- A launch email / outreach about the new experience — out.

## Key Decisions

- **Replace live screens as we go** (vs a gated /v3 preview): the user tests each unit at the real URL; accepted that prod mixes v2 and v3 styling during the rollout.
- **Re-skin the real signup flow** (vs UI-first with mocks): signup keeps working in prod at every step; no double build.
- **Static preset art first** (vs AI generation): removes the Image Lab go-live dependencies (REAL_CONTENT_LIVE, consent, personGeneration) from the critical path; the kid's words still make each panel personal.
- **Real parent login area for S05** (vs end-of-signup screen only): parents can return to see credentials and manage kids; accepted that this is the largest unit and needs the120 backend work for parent sessions.
- **Preset panel art + kid's caption for S12** (vs "drawing soon" placeholder): the book feels finished from day one; AI art swaps in later without changing the flow.
- **Group tightly-coupled screens** (vs strictly one unit per screen): S02+S03 and S10+S11 test as single interactions; everything else stays one screen per unit.
- **Story layer is a progress mirror that pulls kids into the factory** (vs a standalone creative product): chapters unlock only via business progress, and Build Your Business is S08's primary card. This is the north star for S08 hierarchy and for any scope call on the book screens.
- **Strict serial ladder kept, U4 verified up front** (vs parallel tracks): U1→U10 stays sequential; planning's first task is verifying the the120 parent-session surface so U4's true size is known before the ladder is committed.
- **Replace-live holds for kid units too** (challenged by review, reaffirmed): the 17 kids see the new surfaces as they ship, with R18 interim states and the R10 one-shot orientation covering the transition.
- **All ten units are must-have** (vs core/enhancer tiering): no unit is a candidate for cutting; a stall means the ladder pauses, not that scope shrinks.

## Dependencies / Assumptions

- Parent login (R7) requires the120 support for a parent email+password session usable by firstprofit.school. Signup already collects an email, password, and verify code, and S03's copy ("You will use this to sign in later") matches — but whether a parent *login* endpoint exists is unverified. **Planning must verify this first**, before the unit ladder is committed, so U4's true size is known (kid login is username+password; usernames may be email-shaped per the120#129, so the login surface must disambiguate parent vs kid).
- Chapter availability (R15) assumes phase progress is readable per kid from existing gameCore state — true for the promoted-business model, but the mapping from "phase progress" to "panels available" needs planning.
- The export-package assets are the complete art set for this build; any missing per-question panel art gets produced as static assets during the relevant unit (flagged to the user, not silently skipped).

## Outstanding Questions

### Resolve Before Planning

(none)

### Deferred to Planning

- [Affects R7][Technical] Parent sessions end to end: the120 endpoint (existing vs new); token/cookie storage, expiry, and cross-origin flow between firstprofit.school and the120; per-parent authorization scoping (a parent sees only their own kids); how the login surface distinguishes a parent email login from an email-shaped kid username; and on the client, how the parent area mounts in the no-router stage machine (new stage vs a pre-stage route per the `/staff` and `/auth/enter` precedents), how GameProvider treats a restored parent session, and how S05's Login button hands off to the kid session in the same tab (candidate: the existing `/auth/enter` handoff-code mechanism).
- [Affects R9][Technical] Exact mechanics of routing the 17 existing kids to S08 (how "has completed v3 first-login" is detected, including kids mid-way through the v2 Onboarding flow).
- [Affects R14][Technical] Where the authored question set per chapter lives (curriculum brief pipeline vs a new content module) and the per-question preset art mapping — weighing against the unit-task copy rework in flight (~2026-08-13) so questions aren't authored against copy about to change.
- [Affects R15][Technical] Exact rule mapping factory phase progress to per-chapter panel availability — including chapters whose phase isn't yet in `BUILT_CRITERIA`, kids/ideas that are never promoted, and the long-run book shape for a kid who stops at Validate — plus the page/spread math for S09 ("spread N of M", "24 pages so far").
- [Affects R16][Technical] How story state extends the SaveDoc: which fields ride the monotonic union channel vs the latest-intent last-write-wins channel in `unionCompletionMaps`/`UNION_REMOTE`, confirmed additive under docVersion 1; and whether the existing kid-erasure flow covers the new story data (photo, avatar config, answers/captions) or needs extension.
- [Affects R14][Technical] Moderation/limits for kid-authored free-text captions (length caps, PII awareness) before they render in the book, and save feedback (optimistic vs wait, spinner/confirmation) for cover pick, hero transform, panel creation, and reroll — decided once, applied consistently across units.
- [Affects R4][Technical] One shared mobile pattern for the off-canvas carousel/pagination arrows used by S01, S06, S07, S09 (e.g. swipe + bottom-docked controls), decided once rather than per unit.
- [Affects R6][Technical] Whether the S02 app-tile treatment changes any signup copy that the120 emails reference.
- [Affects R17][Technical] Mechanics of the "Ask parent for consent" email (sender, template, rate-limiting so a kid can't spam it) and how the parent's re-consent is recorded against the consent version.

## Next Steps

-> `/ce:plan` for structured implementation planning (plan the unit ladder U1–U10; each unit ships and is user-confirmed before the next).
