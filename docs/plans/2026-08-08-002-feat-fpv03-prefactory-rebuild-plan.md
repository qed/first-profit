---
title: "feat: fpv03 pre-factory rebuild (S01–S12, ship-per-unit)"
type: feat
status: active
date: 2026-08-08
origin: docs/brainstorms/2026-08-08-fpv03-screens-requirements.md
---

# feat: fpv03 pre-factory rebuild (S01–S12, ship-per-unit)

**Target repos:** `first-profit` (this repo — U1, U5–U10) and `120-The120` (U2–U4, plus consent/photo/email backend for U9). Paths below are repo-relative; the120 paths are prefixed `[the120]`.

## Overview

Rebuild everything a family sees before the factory floor to match the fpv03 prototype (`artifacts/fpv03/export-package/`): public landing, parent enrollment, parent dashboard, kid first-run, and a new graphic-novel layer (cover picker, book viewer, hero customization with consent-gated photo upload, chapter Q&A panel builder). Twelve units (U1–U6, U7a, U7b, U8, U9a, U9b, U10 — same total scope as the origin's ten, with the two highest-risk units split for safer checkpoints), shipped serially: each unit ends with commit + push to production, the user tests live and confirms, then the next unit starts. The factory floor itself is untouched; S08's Build Your Business card links into it.

## Problem Frame

See origin: `docs/brainstorms/2026-08-08-fpv03-screens-requirements.md` (reviewed 2026-08-08 by the full document-review panel; all findings resolved). Live prod has 10 families / 17 kids; no unit may break signup, login, or the factory, and the funnel must never dead-end mid-ladder (R18 interim exit states).

## Requirements Trace

Requirements R1–R19 in the origin document. Highlights this plan must satisfy:

- R2/R18: ship-per-unit with user confirmation; interim exit states for links to unshipped screens.
- R3: each unit replaces live screens immediately — no preview gate; mixed v2/v3 visuals during rollout are accepted.
- R5–R8, R17: landing + enrollment re-skin, real parent area (username + reset, never retrievable passwords), new consent version covering photo collection.
- R9/R10: kid first-run S06→S07→S08; existing kids straight to S08 with one-shot orientation; idea creation moves behind Build Your Business.
- R11–R15: static preset art; book viewer; hero customization (photo consent-gated with "Ask parent" CTA); chapter Q&A with preset art + kid captions; phase-gated chapter availability.
- R16: story state additive under docVersion 1, split monotonic vs latest-intent-LWW.
- R19: GlobalNav stays the ONE bar, extended with Dashboard / Read the Book.
- R4: full review + compound per unit; ~390px mobile verification per screen (and assert `documentElement.scrollWidth <= innerWidth` at 320px, per documented solution).

## Scope Boundaries

- Factory floor and beyond (fpv03 S13–S17) — untouched. Kid login screen re-skin — out.
- AI image generation / Image Lab wiring / photo-to-art transformation — out (static preset art only).
- Gauntlet / Math Academy as working links — out (coming-soon tiles).
- Launch email/outreach — out.

## Context & Research

### Key architectural facts (verified 2026-08-08)

- **first-profit** is a no-router stage machine (`src/App.tsx`: boot | landing | login | signup | onboard | app) with pre-stage route precedents `/staff` and `/auth/enter`. GlobalNav mounts once above the stage render and publishes `--fp-nav-h`.
- **Production signup is the120.school/start** (v3 flow: enrollment → 6-digit emailed code that mints a cookie session → add kid → parent dashboard). The S02 mock's "Welcome from The 120" and S03's code entry match that flow exactly. first-profit's in-repo `signup` stage stays gated OFF and is not part of this build.
- **the120 already has** parent email+password sign-in with forgot-password (`[the120] app/dashboard/SignIn.tsx`, `app/lib/auth/actions/reset.ts`), the kid roster under RLS (`app/dashboard/data.ts`), parent-initiated kid password reset (`app/lib/v3-signup/kid-credentials-core.ts`, UI `app/dashboard/KidCredentials.tsx`), and the handoff mint → `firstprofit.school/auth/enter` redeem (`app/api/fp/handoff/*`). Kid passwords are hashed-only. **U4 is therefore a restyle + small additions, not new auth surface.**
- **Consent** is a single hashed text blob with versioning (`[the120] app/api/fp/signup/consent-rules.ts`), a photo anchor `FP_PHOTO_CONSENT_MIN_VERSION` (currently `2026-08-05.1`, stale — the 2026-08-07.1 copy dropped the photo disclosure), and a per-child photo-consent revocation tombstone (migration `20260914120000`).
- **Email**: Resend stack with suppression and reply-to admissions@the120.school (`[the120] app/lib/email.ts`, `app/lib/fp/parent-email/*`).
- **SaveDoc** (`src/state/gameCore.ts`): `DOC_VERSION = 1` is pinned (the120's public-site trigger gates on it — never bump). New fields must be additive and walk the checklist: optional on type → `toSaveDoc` (absent-stays-absent) → `fromSaveDoc` coercion → `HYDRATE` → merge rule. `unionCompletionMaps` passes local fields through and unions only explicitly-handled slices — a monotonic field missing its union line fails SILENTLY (the rebasing tab keeps its own, possibly absent, value and discards the sibling tab's write). Every new monotonic field's merge test must assert the server-doc value survives a rebase where the local doc lacks it, not merely that the field round-trips. `archiveStateAt` is the one LWW precedent (caller-stamped at the GameContext boundary, larger stamp wins, local wins on tie).
- **Routing hazard**: new top-level paths must join `api/_lib/reservedHandles.ts` + the `vercel.json` alternation or the `/<handle>` rewrite swallows them (not needed under the the120-hosted parent-area decision, but applies to any future first-profit route).
- **Fraunces serif is already loaded** (`font-display`); v3's look needs no new fonts. fpv03 art is not yet wired — import via `src/assets/` (Vite hashing), not `public/`.
- **No CI**: the deploy gate is `npm run build` (path-content preflight + vite build). Tests don't run on deploy — each unit's verification includes running `npm test` locally before push.

### Institutional learnings that bind this plan (docs/solutions/)

- `logic-errors/cas-full-doc-replace-is-last-writer-wins-union-monotonic-sub-state-at-rebase-2026-08-03.md` — classify every new SaveDoc field before it ships; mixed-build tabs erase fields the old build's union doesn't know.
- `security-issues/collapsing-refused-unreachable-and-server-error-into-one-null-...-2026-08-05.md` + `logic-errors/hoisting-a-control-to-a-longer-lived-component-...-2026-08-05.md` — three-outcome session results, epoch guards after awaits (applies to any new async surface; parent sessions stay on the120, which already implements this).
- `security-issues/async-writer-closes-over-per-session-key-...-2026-08-01.md` + `in-memory-reducer-state-survives-logout-...-2026-07-31.md` — every new state slice joins `RESET_SESSION` and hydrate; new debounced writers respect the session generation token.
- `logic-errors/a-client-that-authors-and-hashes-consent-text-itself-...-2026-08-01.md` — the client echoes the server's consent artifact verbatim; the photo gate keys on a fetched version, never a client constant.
- `logic-errors/client-minted-idempotency-key-does-not-prevent-double-submit-2026-08-01.md` — synchronous `useRef` in-flight guard on every new submit surface.
- `integration-issues/additive-column-plus-unconditional-write-...-2026-08-02.md` — the120 migrations deploy before code; PGRST204/42703 classified park-and-retry.
- `logic-errors/split-storage-append-only-table-is-write-only-...-2026-08-01.md` — photo storage outside the SaveDoc must ship its read-back path + round-trip test in the same unit.
- `ui-bugs/breakpoint-crossing-drops-navigation-2026-07-31.md`, `completion-event-must-close-the-underlying-dialog-...`, `a-visually-hidden-span-escapes-...`, `a-color-token-safe-in-one-usage-fails-in-another-...` — lifted intent across breakpoint variants; one modal at a time; 320px scrollWidth assertion; computed WCAG tests for new token pairs.
- `logic-errors/a-module-load-throw-is-scoped-by-the-import-graph-...-2026-08-05.md` — S12's content module validates in the build preflight, never via module-scope throw.
- `best-practices/retire-a-feature-by-removing-all-its-surfaces-and-grepping-its-identifiers-to-zero-2026-08-02.md` — the Onboarding-stage retirement (U7) is a full retirement checklist.
- `security-issues/r20-fp-child-session-reach-...-2026-08-01.md` — new tables/storage (photos) need an R20-style amendment (U9).

*Flow references (C2, C3, I2, M2, …) cite the flow-analysis findings from planning research (2026-08-08); each is restated inline where used — no external doc needed to act on them.*

## Key Technical Decisions

- **Shared interaction patterns decided once (U1), reused everywhere**: a reusable `Carousel` component (swipe + bottom-docked controls at mobile) consumed by S01/S06/S07/S09, and one loading/pending treatment for every SaveDoc-write or the120-endpoint submit (disabled button + inline pending label while in flight) applied to cover pick, avatar transform, photo upload, panel create, and the Ask-parent CTA.
- **A mechanical ship gate replaces the honor system**: U1 adds an `npm run ship` script (vitest + build preflight, refuses on red) / pre-push hook in BOTH repos — with no CI, this is the only enforced test gate across twelve prod pushes.
- **Stale-tab reload groundwork ships at U5, before any story field exists**: the client compares a served build id during sync and forces a stale tab to reload before it can rebase — closing the window where a pre-deploy tab's CAS rebase erases story fields it doesn't know (the new-build merge tests cannot defend against the OLD build's writes).
- **Parent surfaces live on the120.school** (user decision, 2026-08-08): U2–U4 restyle `/start` and `/dashboard` to the v3 look. No new cross-origin auth surface; the existing mint→redeem handoff (new-tab pattern, matching the shipped `/auth/enter` recovery copy) is the parent→kid login. first-profit's only U4 change is a "Parent? Sign in here" link on `/login`.
- **S05 credentials = username + parent-initiated reset** (user decision): kid passwords stay hashed-only; the reset flow already exists.
- **Photo consent rides the existing version-anchor + revocation-tombstone mechanism**: a new consent version whose text discloses photo collection; the shipped verdict rule is "a consent acceptance NEWER than the tombstone, at version ≥ anchor" (`consent-rules.ts` — NOT the shorthand "no tombstone"), enforced server-side. Declining photo use must not block signup (a distinct line/checkbox on S04 mapping to the tombstone when declined) — and the decline tombstone must be stamped so it wins against the same signup's acceptance (ordering invariant, integration-tested with real DB write ordering, not hand-picked fixture timestamps). "Ask parent for consent" CTA shows for ANY kid lacking photo coverage, old or new consent vintage. The anchor moves directly to the new U3 version, and a guard test fails the build if any consent version ≥ the anchor lacks the photo-disclosure text (this exact regression already happened once with 2026-08-07.1).
- **Story state field classification (decides every later unit; see table below)**: monotonic → union channel; editable → latest-intent with per-field LWW stamps following `archiveStateAt`. All additive under docVersion 1.
- **S12's question set is a plain typed content module** in `src/data/` validated by the build preflight — NOT the curriculum-brief pipeline (it's per-kid story content, not path content), and no module-scope throws.
- **Chapter availability is a high-water mark, never revoked**: once a chapter's panels unlock (phase progress across ideas/business), they stay unlocked; panels never regress to locked (flow finding I5).
- **First-run marker written at S07 completion**: S08 tolerates its absence (no-cover default look + nudge on Customize card) rather than bouncing kids back through S06 (flow finding C3). All 17 existing kids launch in the no-cover state.
- **GlobalNav Dashboard link ships with U7; Read the Book link with U8** — the nav can never route into an unshipped screen (BUILT_CRITERIA lesson applied to the story layer).

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**New SaveDoc story fields (all optional, additive under docVersion 1):**

| Field (sketch) | Kind | Merge rule | Written by |
|---|---|---|---|
| `storyIntroSeen` | flag | monotonic (union) | U5 (S06 completion) |
| `firstRunComplete` | flag | monotonic (union) | U6 (S07 completion) |
| `coverLook` + `coverLookAt` | editable | LWW stamp (archiveStateAt shape) | U6 |
| `dashboardOrientationSeen` | flag | monotonic (union) | U7a |
| `heroConfig` (avatar/photo choice) + `heroConfigAt` | editable | LWW stamp | U9a |
| `storyPanels` map: panelId → `{createdAt}` | existence | monotonic (union) | U10 |
| per-panel `answer` + `answerAt` | editable | per-panel LWW stamp | U10 |

Every field walks: type → `toSaveDoc` → `fromSaveDoc` coercion → `HYDRATE` → `RESET_SESSION` → (monotonic ones) explicit lines in `unionCompletionMaps` AND `UNION_REMOTE`'s reducer case. Photo bytes live in the120 storage (not the SaveDoc); the SaveDoc holds only the hero *choice*.

**Kid routing after U7 (replaces the onboard stage):**

```
hydrate → app stage always;
  S08 is the app-stage home surface (Factory mounts behind Build Your Business)
  no ideas → Build Your Business routes through create-idea (coach `create` target precedent)
  !firstRunComplete && no prior v2 progress → S06 → S07 → S08
  existing kid (v2 progress, no marker) → S08 + one-shot orientation
```

## Implementation Units

Serial ladder; each unit = implement → full `ce:review` + `ce:compound` → commit → push (prod) → **user tests live and confirms** → next unit. the120 units deploy migrations before code.

- [ ] **Unit 1 (U1): S01 fp-home — landing rebuild** *(first-profit)*

**Goal:** Replace the current landing with the v3 home (hero "Your kid's first $1,000, earned for real", product mock, How-the-game-is-played two-column carousel, Start Building / Log In CTAs).

**Requirements:** R5, R18, R4.

**Dependencies:** None.

**Files:**
- Modify: `src/screens/Landing.tsx`, `src/components/GlobalNav.tsx` (logged-out CTA targets only)
- Create: `src/assets/fpv03/` (hero webp, example panel art, look thumbnails as needed), `src/components/landing/*` if sections warrant extraction
- Test: `src/screens/__tests__/Landing.test.tsx` (create), extend `src/data/__tests__/phaseContrast.test.ts`-style computed-contrast coverage for new token pairs

**Approach:**
- Start Building pins to the live funnel `https://the120.school/start`; Log In → existing `/login` stage (flow M1). Revisit CTA copy at U4 if the parent link changes.
- Build the reusable `src/components/Carousel.tsx` here (swipe + bottom-docked controls at mobile) — U5/U6/U8 import it, not re-implement it.
- Add the `npm run ship` gate (vitest + build preflight, refuses on red) to BOTH repos in this unit — it gates every later push.
- Assets via Vite `src/assets` imports (hashing + size accounting), not `public/`.

**Test scenarios:**
- Happy path: landing renders hero, carousel advances/wraps via controls; Start Building href points at the live funnel; Log In enters the login stage.
- Edge case: 320px viewport — `documentElement.scrollWidth <= innerWidth` (jsdom-approximated + manual check); carousel controls remain ≥44px tap targets.
- Error path: none (static screen).

**Verification:** Prod landing matches S01 top/bottom shots at desktop and ~390px; signup funnel reachable end-to-end from the CTA; existing kid login unaffected.

- [ ] **Unit 2 (U2): S02+S03 enrollment + verify restyle** *(the120)*

**Goal:** Restyle the live `/start` enrollment step (parent details + three app tiles) and the 6-digit code screen to the v3 look. Same server actions, same validation, same rate limits.

**Requirements:** R6, R2.

**Dependencies:** U1 (visual language established).

**Files:**
- Modify: `[the120] app/start/*` (enrollment + verify step components/styles)
- Test: existing the120 start-flow tests extended for changed markup contracts (no behavior change)

**Approach:** Pure re-skin — do not touch `v3-signup-core.ts` sequencing, consent echo, or cookie-session mint. App tiles (Gauntlet / Math Academy / First Profit) are static imagery from the export package.

**Test scenarios:**
- Happy path: full signup step 1 → code entry → continue succeeds against unchanged actions.
- Error paths (must survive re-skin): wrong code, expired code, resend, use-a-different-email — all reachable and styled.
- Edge: mobile ~390px pass for both screens.

**Verification:** A real test-family signup completes in prod through the restyled screens; verify email arrives; no change to backend behavior.

- [ ] **Unit 3 (U3): S04 add-kid restyle + photo-consent version** *(the120)*

**Goal:** Restyle the add-kid step ("Add your kid, and their story starts") and ship the new consent version whose text covers photo collection, with a visible photo line that can be declined without blocking signup.

**Requirements:** R6, R17.

**Dependencies:** U2.

**Files:**
- Modify: `[the120] app/start/*` (add-kid step), `[the120] app/api/fp/signup/consent-rules.ts` (append new version + text; move `FP_PHOTO_CONSENT_MIN_VERSION` anchor to it)
- Test: `[the120]` consent-rules tests (version list, anchor, hash), add-kid flow test covering declined-photo → tombstone recorded, signup still completes

**Approach:**
- Consent stays one hashed blob (client echoes server artifact verbatim — never authors text). Declining the photo line records the per-child revocation tombstone (existing migration `20260914120000` column) rather than forking the blob.
- Ordering invariant (Key Technical Decisions): the decline tombstone must beat the same signup's acceptance under the shipped "acceptance newer than tombstone" verdict rule — integration-tested with real DB write ordering.
- The anchor test in `[the120]` consent-rules tests moves with the anchor (it currently pins 2026-08-05.1); add the guard test failing any version ≥ anchor that lacks the photo-disclosure text.
- Export consent-coverage fixtures (new+accepted, new+declined, old-2026-08-07.1) generated from the120 code for U9b's first-profit integration tests — U3 owns fixture generation.
- Deploy order: this is copy/constants, no migration needed; if any column is added after all, migration first, PGRST204/42703 park-and-retry.

**Test scenarios:**
- Happy path: consent with photo accepted → recorded version = new anchor, no tombstone; kid provisioned.
- Happy path: photo declined → tombstone recorded; signup completes; consent version still recorded.
- Error path: stale echoed version (policy bumped mid-flow) → existing refetch-and-compare re-attest loop still works with the new version.
- Integration: server-side photo-consent check (`version ≥ anchor && no tombstone`) returns covered/not-covered correctly for: new-consent+accepted, new-consent+declined, old-consent (2026-08-07.1) families.

**Verification:** New signup in prod records the new version; the 10 existing families remain "not covered" for photos; existing consent drift tests green in both repos (first-profit's bundled default `src/screens/signup/consentPolicy.ts` updated in the same window if its flag-off screen would drift).

- [ ] **Unit 4 (U4): S05 parent dashboard restyle + login cross-links** *(the120 + tiny first-profit change)*

**Goal:** Restyle `/dashboard` to the v3 parent dashboard: per-kid First Profit card (Login button = existing handoff mint; login info = username + the existing password-reset flow), Gauntlet / Math Academy coming-soon tiles, account menu (Account Details / My Kids). Multi-kid = one card per kid. This unit also OWNS R8's behavior change: a fresh signup terminates on this dashboard (session already minted by the code step), with the one-shot kid-password reveal surfaced there exactly once — the legacy one-shot credentials screen is retired.

**Requirements:** R7, R8, R2.

**Dependencies:** U3.

**Files:**
- Modify: `[the120] app/dashboard/DashboardApp.tsx`, `app/dashboard/KidCredentials.tsx`, `app/dashboard/SignIn.tsx` (v3 styling), `app/start/actions.ts` call sites if the end-of-signup landing copy changes
- Modify: `src/screens/Login.tsx` (first-profit) — add "Parent? Sign in here" link → the120 dashboard sign-in (flow C4; keeps `/login` child-only, no credential-shape guessing)
- Test: `[the120]` dashboard tests (multi-kid rendering, reset flow unchanged); `src/screens/__tests__/Login.test.tsx` link presence

**Approach:**
- No new endpoints. The handoff keeps the shipped new-tab pattern (parent tab stays parked on the dashboard — flow C5 resolution (b)).
- Kid password is never displayed post-creation (R8): card shows username + "Reset password" (existing `kid-credentials-core.ts`).
- R7's parent-vs-kid disambiguation acceptance criterion is satisfied structurally: two distinct surfaces, cross-linked, no shared login form.

**Test scenarios:**
- Happy path: parent signs in at the120 → sees all their kids' cards with usernames; Login button opens firstprofit `/auth/enter` and lands in that kid's session.
- Happy path: password reset issues a new kid password and shows it once.
- Edge: two-kid family renders two cards; handoff from each logs into the right kid (generation-token learnings: fast kid-switch must not cross-write saves).
- Error path: parent forgot-password flow reachable from the restyled SignIn.
- Integration: firstprofit `/login` shows the parent link; a parent email+password typed into the kid login still gets the generic kid-worded error (enumeration discipline unchanged).

**Verification:** Cedric test family: parent can return, see kids, reset a password, and hand off into a kid session in prod. A fresh signup ends on the dashboard (not the legacy one-shot screen), with the password revealed exactly once.

- [ ] **Unit 5 (U5): S06 kid intro carousel** *(first-profit)*

**Goal:** First-login kid intro ("How the game is played", 5-example carousel, "Start your story"). Interim exit: continues into the existing v2 Onboarding flow (flow C2) until U6/U7 replace it.

**Requirements:** R9 (first leg), R18.

**Dependencies:** U1 (carousel pattern).

**Files:**
- Create: `src/screens/story/IntroCarousel.tsx` (+ `__tests__/IntroCarousel.test.tsx`)
- Modify: `src/screens/Onboarding.tsx` (mount S06 ahead of the existing screens for first-run kids), `src/state/gameCore.ts` + `src/state/GameContext.tsx` (additive `storyIntroSeen` flag: type, toSaveDoc, fromSaveDoc, HYDRATE, RESET_SESSION, union lines)
- Test: gameCore SaveDoc round-trip tests extended

**Approach:**
- S06 renders inside the existing onboard stage as its new first screen — no stage-machine change yet. `storyIntroSeen` (monotonic) prevents re-showing. Panel art from `src/assets/fpv03/`. Carousel = the U1 shared component.
- Interim copy softened (user decision): the closing CTA reads "your story starts soon"-style copy while the exit is v2 Onboarding; the mock's "Start your story" copy is restored at U7a when S08 exists.
- **Stale-tab reload groundwork ships here** (Key Technical Decisions): sync compares a served build id and forces a stale tab to reload before it can rebase — this must land before ANY story field exists in prod saves. Files: `src/lib/sync.ts` + a build-id source (e.g. injected at build time), with tests.

**Test scenarios:**
- Happy path: fresh kid sees S06 once, exits into the existing onboarding; flag persists; reload skips S06.
- Edge: existing kid with progress never sees S06 (flag not required — v2-progress check).
- Integration: SaveDoc round-trip (toSaveDoc→fromSaveDoc) preserves the flag; old-build union (field absent) doesn't erase it on rebase (mixed-build test per the CAS learning).
- Edge: mid-carousel tab close → next login re-enters S06 (no resume pointer; flow M6).

**Verification:** New test kid in prod gets intro → onboarding → factory unbroken; existing kids unaffected.

- [ ] **Unit 6 (U6): S07 cover picker** *(first-profit)*

**Goal:** "Pick your book cover" — six look presets, persisted choice, first-run marker. Interim exit: continues into v2 Onboarding remainder.

**Requirements:** R9, R16, R18.

**Dependencies:** U5.

**Files:**
- Create: `src/screens/story/CoverPicker.tsx` (+ tests), `src/data/storyLooks.ts` (six looks: id, name, tagline, asset)
- Modify: `src/screens/Onboarding.tsx` (S07 after S06), `src/state/gameCore.ts`/`GameContext.tsx` (additive `coverLook`+`coverLookAt` LWW, `firstRunComplete` monotonic — full checklist)
- Test: gameCore merge tests (LWW both directions, tie → local; monotonic union)

**Approach:** LWW stamp minted at the GameContext boundary (`Date.now()` — gameCore stays clock-free), coerced finite ≥0 on load, exactly the `archiveStateAt` shape. Submit guarded by a synchronous in-flight ref AND the shared pending treatment (disabled + inline pending label). Carousel = the U1 shared component. Interim copy stays softened until U7a (as in U5).

**Test scenarios:**
- Happy path: pick look → choice persists across reload; book title shows "The <Name> Story".
- Edge: re-pick later (via U9's Look & Feel tab) updates look + stamp.
- Integration: two-tab conflict — later stamp wins in both directions; tie keeps local. Old-build tab rebase doesn't erase the choice.
- Edge: kid who saw S06 pre-U6 and exited to v2 onboarding gets S07 on next first-run pass or lands on S08 in the no-cover state (flow C3) — no bounce loop.

**Verification:** Cover choice survives reload + cross-tab in prod; new-kid funnel intact.

- [ ] **Unit 7a (U7a): S08 kid dashboard ships; onboard stage goes dormant** *(first-profit)*

**Goal:** S08 becomes the kid home: cover preview, four cards, one-shot orientation for existing kids, GlobalNav Dashboard link, idea creation behind Build Your Business. The v2 Onboarding screen stays in the tree as a dead-but-compilable fallback — retirement is U7b, after live confirmation.

**Requirements:** R9, R10, R18, R19 (Dashboard link), R2.

**Dependencies:** U6.

**Files:**
- Create: `src/screens/story/KidDashboard.tsx` (+ tests)
- Modify: `src/App.tsx` + `src/state/GameContext.tsx` (re-point every `SET_STAGE: "onboard"` dispatch — enumerate all hydrate call sites incl. fresh-profile, RLS-miss, load-failure fallback, and `/auth/enter` success routing; flow I4), `src/state/gameCore.ts` (`dashboardOrientationSeen` monotonic), `src/screens/Factory.tsx` (mounts behind Build Your Business), `src/components/GlobalNav.tsx` (Dashboard link, wrap-at-390px preserved), `src/state/floorSelectors.ts` usage for next-task copy on the card; re-host `src/screens/story/IntroCarousel.tsx` + `CoverPicker.tsx` as the app-stage first-run sequence (S06→S07 ahead of S08) since the onboard stage no longer runs
- Test: routing tests for all five re-pointed call sites; `KidDashboard` card-state tests

**Approach:**
- S08 lives in the app stage as the home surface; Factory renders when the kid enters Build Your Business (walk intent unchanged). Zero-idea kids route through the existing `create` coach-target flow (CREATE_IDEA with caller-minted UUID). Restore the mock's "Start your story" copy in S06/S07 (softened interim copy ends here).
- `onboardingComplete` handling (required SaveDoc field — cannot be removed under docVersion 1): the field stays in the type/`toSaveDoc`/`fromSaveDoc` for doc-shape compatibility and is forced true on save by the new build; HYDRATE stops branching on it. Mixed-build note: an old cached tab still branches on it, which is why it must read true.
- Interim card map (R18, flow M2): Read the Book → "coming soon" (until U8); Customize Your Story → hosts the shipped S07 picker as look-only, with the Change-the-Hero tab "coming soon" (until U9a); Build Your Story → "coming soon" (until U10). "Coming soon" everywhere — locked-with-unlock-hint styling is reserved exclusively for real phase-gated availability inside S12, never for unshipped features (a locked card falsely signals the kid can unlock it by playing).
- "Build Your Business primary" follows the mock's uniform 2x2 grid — primacy is expressed by position, the live next-task line, and the orientation pointing at it, NOT by a visual treatment that deviates from the screenshot.
- No-cover default state: default look + nudge on the Customize card (all 17 kids launch here). Orientation: one-shot, persisted monotonically.
- Load-failure fallback that used to "start fresh at onboarding" now lands on S08 with empty state.
- Second-idea path (flow M5): confirm the GlobalNav chip dropdown still offers idea switching/creation; note in review if a Build Your Business branch is needed.

**Test scenarios:**
- Happy path: existing kid logs in → S08 + orientation once → Build Your Business → factory with progress intact.
- Happy path: fresh kid completes S06→S07 → S08; zero-idea kid tapping Build Your Business gets the create-idea flow, then criterion 1.1 runner.
- Edge: no-cover kid sees default look + nudge; orientation not re-shown after reload or on a second device (monotonic union).
- Error path: save-load failure lands on S08 empty state, not a crash.
- Integration: `/auth/enter` handoff for a fresh kid routes to the first-run sequence (not the dormant stage); for an existing kid routes to S08. All five re-pointed call sites covered by tests.
- Edge: old-shape doc with `onboardingComplete: false` still lands on S08 under the new build; the new build saves it as true.
- Edge: GlobalNav with the new link still wraps correctly at 390px.

**Verification:** All 17 kids' logins land on S08 and can reach the factory; new-family end-to-end works. Check the Watchtower flow board in the days after ship — a visible stall at S08 (kids not entering tasks) triggers the orientation/heads-up contingency. Rollback rehearsed: previous Vercel deployment verified promotable.

- [ ] **Unit 7b (U7b): onboard-stage retirement** *(first-profit)*

**Goal:** After U7a is confirmed across real kid logins, retire the v2 Onboarding surfaces completely.

**Requirements:** R9 (cleanup), R2.

**Dependencies:** U7a confirmed live.

**Files:**
- Delete/retire: `src/screens/Onboarding.tsx` + `src/screens/onboarding/screens.tsx` per the retirement checklist — relocate the shared exports consumed by `src/screens/signup/screens.tsx` first (`PHASE_COLORS`, `BackLink`, `GreenCta`), remove the `onboard` stage from the stage union and its remaining mounts, reducer actions (`SET_OB`), state fields, and tests
- Test: compile + full suite green; routing tests unchanged

**Approach:** Grep onboarding identifiers to zero — EXCEPT the persisted `onboardingComplete` SaveDoc field, which stays for doc-shape compatibility (documented exclusion). Don't remap retired actions onto live ones.

**Test scenarios:**
- Test expectation: behavior-neutral cleanup — full suite green, plus one regression test that the app compiles/routes with the stage union shrunk.

**Verification:** Grep (excluding the SaveDoc field) returns zero; prod smoke: kid login, fresh-kid first-run, factory entry all work.

- [ ] **Unit 8 (U8): S09 book viewer** *(first-profit)*

**Goal:** "Read the Book": cover in the chosen look, contents page (Intro + 5 chapters), spreads from built panels, empty/upcoming pages for unbuilt sections. GlobalNav Read the Book link ships here (flow M3).

**Requirements:** R12, R19 (Read the Book link), R18.

**Dependencies:** U7a (U7b may land before or after U8 — it is behavior-neutral cleanup).

**Files:**
- Create: `src/screens/story/BookViewer.tsx`, `src/data/storyBook.ts` (spread/page math from panels + chapter structure) (+ tests for both)
- Modify: `src/components/GlobalNav.tsx`, `src/screens/story/KidDashboard.tsx` (enable Read the Book card)
- Test: `src/data/__tests__/storyBook.test.ts` (page math), viewer tests

**Approach:**
- Pure derivation: book = f(coverLook, storyPanels, chapter availability). Launch state is the all-empty book for every kid (U10 hasn't shipped) — empty-spread copy anticipates it: "your panels appear as you build your story" (flow M2).
- Spread math ("Spread N of M", "24 pages so far") lives in the pure data module with exhaustive unit tests; the viewer is thin.
- Prev/next controls follow the U1 mobile carousel pattern; only one overlay/dialog at a time (documented dialog-chain rule).

**Test scenarios:**
- Happy path: contents lists Introduction + the 5 phase-named chapters with correct page numbers; navigation clamps at both ends.
- Edge: zero panels → cover + contents + upcoming pages only; page count correct at 0, 1, and max panels; odd/even panel counts pad spreads correctly.
- Edge: no-cover kid sees the default look cover.
- Integration: panel added (simulated state) appears on the right spread without remount.

**Verification:** Book renders in prod for a real kid (empty state) and matches S09 at desktop + ~390px.

- [ ] **Unit 9a (U9a): Customize Your Story — surface + avatar builder** *(first-profit)*

**Goal:** The two-level Customize surface (R13): top-level "Change the Hero" / "Change the Look & Feel" tabs; inside Hero, the photo-vs-avatar toggle. Avatar builder fully functional; the photo side renders the mock's dropzone with the consent-gated states stubbed to "coming soon" until U9b.

**Requirements:** R13 (avatar half), R16.

**Dependencies:** U7a (dashboard card), U6 (picker component).

**Files:**
- Create: `src/screens/story/Customize.tsx`, `src/screens/story/AvatarBuilder.tsx` (+ tests)
- Modify: `src/state/gameCore.ts`/`GameContext.tsx` (`heroConfig`+`heroConfigAt` LWW — full checklist), `src/screens/story/KidDashboard.tsx` (enable the hero tab; card copy "Hero: starter avatar")
- Test: gameCore merge tests (heroConfig LWW), Customize tab/IA tests

**Approach:**
- Draft-vs-commit (design finding): reroll/detail-control changes update local component state only ("YOUR AVATAR · UPDATES LIVE" preview); `heroConfig`+`heroConfigAt` are written, and the LWW stamp minted, solely on "Transform this into the hero". Un-transformed drafts are discarded on navigation without a confirm (matching the no-resume-pointer precedent). Transform uses the shared pending treatment.
- Look & Feel tab re-hosts the U6 picker component (one implementation, two mounts).
- Two-level tabs at ~390px: stack the top tabs and the pill toggle vertically; verify no horizontal scroll at 320px.

**Test scenarios:**
- Happy path: browse presets/reroll (no SaveDoc writes) → Transform → heroConfig persists, hero shows on S08 card.
- Edge: navigate away mid-draft → draft discarded, committed hero unchanged; two-tab Transform conflict → later stamp wins.
- Integration: RESET_SESSION clears hero state on logout (shared-device learning); old-build tab rebase doesn't erase a committed hero (stale-tab reload + merge test).

**Verification:** In prod: an existing kid builds and commits an avatar, sees it on S08; Look & Feel re-pick works; photo tab shows its coming-soon state.

- [ ] **Unit 9b (U9b): photo pipeline + consent-request flow** *(the120 + first-profit)*

**Goal:** Photo upload live for consent-covered kids; "Ask parent for consent" CTA for everyone else; the parent-side re-consent action that makes coverage attainable. This is the plan's security unit — reviewed as such.

**Requirements:** R13 (photo half), R17.

**Dependencies:** U9a, U3 (consent version + fixtures).

**Files:**
- Create `[the120]`: photo storage (private bucket + table row per kid photo; **migration first**), kid-bearer CORS upload/read endpoints, `app/api/fp/consent-request/` kid-bearer endpoint + Resend template (to parent + admissions@the120.school, house rate-limit budget, suppression respected), **the parent-dashboard re-consent server action** (a named deliverable, not an accessory: records a fresh full-blob attestation for an existing child under the parent cookie session, echo-the-server discipline, superseding the tombstone under the "acceptance newer than tombstone" rule — it is the only path by which any current family becomes photo-covered)
- Create: `src/screens/story/PhotoUpload.tsx`, `src/lib/storyPhoto.ts` (upload/read-back client) (+ tests)
- Modify `[the120]`: `scripts/erase-fp-family.ts` (photo objects join the service-role deletion ordering; FK ON DELETE behavior stated in the migration)
- Test: `[the120]` endpoint tests (consent-covered/uncovered/tombstoned via U3's fixtures, rate limit, origin allowlist, direct-bypass rejection); first-profit round-trip test (upload → read-back → renders after reload — split-storage learning)
- Docs: `[the120] docs/security/` R20-style amendment — bucket access model, kid-session reach, erase ordering

**Approach (security requirements, explicit):**
- Upload validation server-side: image MIME allowlist, byte-size cap, re-encode server-side (which also strips EXIF/GPS metadata), served back with a fixed image content-type — never inline-able as HTML/SVG.
- Bucket access model pinned NOW, not in the amendment: zero storage policies (service-role-only, the Image Lab posture) — direct anon-key storage calls cannot reach photo objects; all access goes through the consent-checked endpoints. Reads via short-lived signed URLs so revocation isn't undermined by a long-lived reference.
- Revocation deletes: recording a photo-consent tombstone actively deletes the stored photo object (not just access-gating) — for a minor's photo, revocation means deletion. Test scenario included.
- Consent verdict rule everywhere: "acceptance newer than tombstone at version ≥ anchor" (the real consent-rules.ts semantics), never the "no tombstone" shorthand.
- Consent state client-side: refetch when the surface opens/regains focus + explicit "My parent said yes — check again" button (flow I2). Ask-parent CTA states: idle → sending (pending treatment) → sent confirmation → cooldown.
- Upload UX states (design finding): client-side type/size validation messaging, upload-progress indicator, preview with remove-and-reselect before commit.
- Reuse the existing the120 kid-bearer origin-allowlist/rate-limit helpers (`app/lib/fp/rate-limit-rules.ts`, login-rules origin allowlist) — no parallel auth plumbing.

**Test scenarios:**
- Happy path: covered kid uploads → re-encoded object stored, renders after reload via signed URL; uncovered kid sees Ask-parent CTA; tap sends one email (double-submit ref guard) → sent state.
- Error paths: non-image / oversized upload rejected server-side with client messaging; upload rejected for uncovered kid even when UI bypassed (direct endpoint test); email rate-limit → cooldown copy.
- Edge: parent re-consents (dashboard action) → tombstone superseded → kid's "check again"/refocus unlocks upload without re-login; re-revocation deletes the stored object (verified gone from the bucket).
- Integration: consent verdict against U3's real fixtures for all vintages; EXIF-bearing fixture upload → stored object has no metadata; erase-fp-family run removes photo rows + objects for a test family.

**Verification:** In prod: Ask-parent email arrives at parent + admissions; a re-consented test family uploads and sees the photo after reload; revocation removes it. R20 amendment merged; erase runbook updated.

- [ ] **Unit 10 (U10): S12 Build Your Story (chapter Q&A panel builder)** *(first-profit)*

**Goal:** Chapter list (Intro + 5 chapters, availability per phase progress, locked states) and the per-chapter Q&A flow: answer → panel created (preset art + kid's caption); Re-create pre-fills for editing; panels feed the U8 book.

**Requirements:** R14, R15, R16, R11.

**Dependencies:** U8 (book renders panels), U7a.

**Files:**
- Create: `src/screens/story/StoryBuilder.tsx`, `src/screens/story/ChapterFlow.tsx` (+ tests), `src/data/storyQuestions.ts` (typed authored module: chapters → questions → preset-art refs), `scripts/check-story-content.ts` (its OWN small preflight step added to the `npm run build` chain alongside `check-path-content.ts` — the two content systems' build gates stay independent; no module-scope throw)
- Modify: `src/state/gameCore.ts`/`GameContext.tsx` (`storyPanels` monotonic map + per-panel `answer`/`answerAt` LWW — full checklist incl. explicit `unionCompletionMaps` + `UNION_REMOTE` lines), `src/data/storyBook.ts` (consume panels), `src/screens/story/KidDashboard.tsx` (enable card, "N new panels available")
- Test: gameCore merge tests (panel existence union, caption LWW, mixed-build no-erase), preflight validation test, chapter-availability tests

**Approach:**
- Availability: high-water mark from `isPhaseUnlocked`/phase progress across ideas + promoted business; Intro always available post-first-run; never revoked once panels exist (flow I5). Locked chapters render dimmed + "Unlocks in <Phase>" (R14).
- Question set authored fresh against the post-rework task copy (unit-task rework lands ~2026-08-13 — author U10's content after it, per origin deferred question). Missing per-question preset art is produced as static assets and flagged in the unit summary, never silently skipped.
- Answer inputs join the per-user draft-key mechanism so idle-logout preserves half-typed answers; explicit logout wipes them (flow I3, shared-device policy).
- Panel creation closes the question flow and updates the chapter list in one reducer action (dialog-chain rule).

**Test scenarios:**
- Happy path: answer Intro Q1 → panel exists with preset art + caption; book shows it; "1 of 6 answered" progress correct.
- Happy path: Re-create pre-fills the prior answer; edit updates caption + stamp; art unchanged.
- Edge: locked chapter is visible, dimmed, non-enterable, names its phase; unlocking phase progress makes it available; availability never regresses (high-water mark test with archived business).
- Edge: idle logout mid-answer → draft restored on re-login; explicit logout → cleared.
- Integration: two-tab caption edit → later stamp wins; panel created in tab A survives tab B's rebase (union). Old-build tab doesn't erase panels (mixed-build test).
- Error path: preflight fails the build on a malformed question module (missing art ref, duplicate id).

**Verification:** In prod: a kid builds Intro panels, reads them in the book, chapter gating matches their factory progress; existing kids' data intact; full end-to-end origin success criterion holds. Watchtower check in the following days: factory task completion for the live cohort has not dropped (the origin's story-pulls-toward-factory criterion).

## System-Wide Impact

- **Interaction graph:** hydrate routing (five `SET_STAGE "onboard"` call sites), `/auth/enter` success routing, GlobalNav (two new links + logged-out CTA), NextStepCoach's `create` target (now reached from S08), the sync engine's union allowlist (new monotonic fields), the120 `/start` terminal step and `/dashboard`.
- **Error propagation:** all new the120 endpoints follow the one-generic-401 + rate-limit house pattern; upload/consent failures surface as retryable UI states; save failures land on S08 empty state, never a retired stage.
- **State lifecycle risks:** mixed-build rollout window on every first-profit unit (old tab unions unknown fields → erase risk) — mitigated by the additive checklist + mixed-build tests per unit; RESET_SESSION coverage for every new slice; generation tokens on new async writers (photo upload, panel save).
- **API surface parity:** the kid login screen gains only a parent link; the parent area stays same-origin on the120 (no new CORS auth). The photo/consent-request endpoints are the only new cross-origin surfaces (kid bearer, origin allowlist, rate-limited).
- **Integration coverage:** cross-repo consent fixtures (U3 matrix consumed by U9 tests), handoff → routing tests (U7), photo round-trip (U9), book-from-panels (U8/U10).
- **Unchanged invariants:** `DOC_VERSION = 1` (the120 public-site trigger + outbox pinned to it); factory floor, phase engine, BUILT_CRITERIA, promoted-business model untouched; child login endpoint behavior unchanged; consent echo-the-server discipline unchanged; the ONE-bar GlobalNav contract (extended, not duplicated).

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Stale pre-deploy tab erases just-shipped SaveDoc fields on CAS rebase (new-build tests cannot prevent the OLD build's writes) | Stale-tab build-id reload check ships at U5, before any story field exists; plus additive checklist + explicit union/LWW rules per field and per-unit merge tests asserting the server-doc value survives a rebase where local lacks it |
| U3 consent version bump breaks live signup | Echo-the-server discipline untouched; stale-version re-attest loop tested; first-profit's bundled default policy constants updated in the same window |
| the120 units and first-profit units drift (cross-repo contract) | Consent-coverage fixtures generated from the120 code consumed by first-profit tests; migrations always deploy before code; PGRST204/42703 park-and-retry |
| Onboard-stage retirement misses a call site → kid stuck/crash | Enumerated call-site list with a test each; retirement checklist with grep-to-zero |
| Panel art shortfall (6 shipped images vs 6 intro questions + 5 chapters) | U10 produces missing static art; shortfall flagged in the unit summary, never silently skipped |
| Unit-task copy rework (~2026-08-13) invalidates S12 questions | U10's content authored after the rework lands (it is the last unit; confirm rework status at U10 start) |
| Kid-triggered consent email abused | House rate-limit budget + suppression at the mailer boundary; CTA cooldown state |
| No CI — tests don't gate deploys | `npm run ship` gate (vitest + preflight, refuses on red) installed in BOTH repos at U1 converts the honor system into a mechanical gate; story-content preflight added as its own build step at U10 |
| Photo consent gate fails open via tombstone-vs-acceptance ordering | U3 ordering invariant + integration test with real DB write ordering; verdict rule stated as "acceptance newer than tombstone", never the "no tombstone" shorthand |
| U7a routing bug dead-ends all kid logins | Onboard stage kept dormant (not deleted) until U7b; five call sites test-covered; rollback (Vercel promote-previous) rehearsed as part of U7a's definition of done |

## Documentation / Operational Notes

- R20-style security amendment for the photo bucket/table + kid-session reach (U9).
- Per project policy, every unit gets `ce:review` + `ce:compound`; new solution docs expected especially from U7 (stage retirement) and U9/U10 (merge semantics).
- Heads-up note to the 10 beta families about the new kid home is deliberately out of scope (origin decision) — revisit at U7 if orientation proves insufficient.

## Open Questions

### Resolved During Planning

- Parent-login endpoint existence: **verified — exists on the120** (same-origin); parent area hosts there (user decision).
- S03 code-vs-link verify: the live the120 `/start` flow already uses a 6-digit code; no backend change hidden in U2.
- Photo consent mechanics: rides the existing version-anchor + tombstone mechanism; declining never blocks signup.
- Story-state merge split: per the field table (monotonic union vs LWW stamps), all additive under docVersion 1.
- S12 question storage: plain typed module in `src/data/` validated by the build preflight (not the curriculum pipeline).
- Chapter availability: high-water mark, never revoked.
- GlobalNav: extended (Dashboard @ U7, Read the Book @ U8); no second bar.

### Deferred to Implementation

- Exact S08 no-cover default look choice and orientation copy — visual calls made against the mock during U7a.
- Second-idea creation entry point post-retirement (chip dropdown vs Build Your Business branch) — confirm during U7a against real nav behavior.
- Whether the U9b re-consent supersede semantics conflict with the CRM-side "a revocation is never resurrected" philosophy — check the crm_core migration comment during U9b and document the fp-photo-specific rule.
- Per-question preset-art mapping and any art production — during U10, flagged not silent.
- Exact spread/page math constants ("24 pages so far") — locked by `storyBook.ts` tests during U8.

## Sources & References

- **Origin document:** docs/brainstorms/2026-08-08-fpv03-screens-requirements.md
- Design source of truth: `artifacts/fpv03/export-package/` (screenshots + assets; `S12-build-your-story.png` is stale — use the `-home`/`-chapter` shots)
- first-profit: `src/App.tsx`, `src/state/gameCore.ts`, `src/state/GameContext.tsx`, `src/lib/sync.ts`, `src/components/GlobalNav.tsx`, `src/state/floorSelectors.ts`, `src/data/path.ts`, `src/screens/signup/consentPolicy.ts`
- the120: `app/start/`, `app/dashboard/`, `app/api/fp/signup/consent-rules.ts`, `app/api/fp/handoff/`, `app/lib/v3-signup/kid-credentials-core.ts`, `app/lib/email.ts`, `app/lib/fp/rate-limit-rules.ts`
- Institutional learnings: see Context & Research (docs/solutions/ entries listed there)
