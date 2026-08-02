# Handoff: First Profit v1 User Flow

## Overview
The complete v1 tester flow for First Profit, Home Study Edition: a parent-facing landing page through account creation, kid onboarding (website + Stripe checkout reveal), and the in-app "factory floor" game where the child works Phase 1 (Sell) criteria 1.1 and 1.2 — 10 unit tasks — across up to five parallel product ideas.

The reference prototype lives in `First Profit Flow.dc.html` (a self-running HTML design component; open in a browser). The existing app codebase this extends is the `v2fp` Vite/React/Tailwind app (Magic Patterns export); reuse its stack, `GameContext` state pattern, and framer-motion conventions.

## About the Design Files
The bundled HTML file is a **design reference created in HTML** — a prototype showing intended look and behavior, not production code to copy. Recreate these screens in the target codebase's environment (React + Tailwind + framer-motion, per v2fp) using its established patterns. `v2fp/src` already contains close equivalents of several pieces (Onboarding, StepRunner, Hud, GameContext, path data) — evolve those rather than starting fresh.

## Fidelity
**High-fidelity.** Colors, type, spacing, and copy are final. Recreate pixel-perfectly with the design tokens below (they come from the First Profit design system).

## Flow (in order)

### A. Landing page (parents, `/`)
- HQ skin: warm paper `hsl(40 30% 99%)`, ink text.
- Nav: logo mark + "FIRST PROFIT" wordmark; right: "Home Study Edition · v1 tester preview" caption + dark "Start Building" button.
- Hero, 2 columns (1.1fr / 0.9fr, 56px gap): eyebrow "For families · ages 8 to 16" (Spline Sans Mono, uppercase, Sell terracotta); H1 Fraunces 800 56px "Your kid's first $1,000, earned for real."; body copy; green CTA "Start Building →" (Fraunces 700 18px, `hsl(150 52% 40%)`, hard shadow `0 6px 0 hsl(150 52% 26%)`); mono caption "Free while we test · a parent sets up every account".
- Hero right: browser-frame mockup (rotate -1.5deg) of firstprofit.school/cedric showing a miniature of the AZEAP site (kid's real product: paper `#FDFBF3`, AZEAP logo, headline "Your kids' activities, planned before your coffee goes cold.", three tilted planner cards). Floating card below-right (rotate 2deg): "Payment received / Helen Rosenfeld subscribed · $25 / month".
- Dark section (`hsl(30 12% 12%)`): "The Path · five phases, 25 criteria, 125 unit tasks" eyebrow in gold; 5 phase cards, each with 4px top border in its phase color.
- "Day one takes ten minutes." 3-step cards (claim page / money booth / one task at a time) + parent-role banner ("Your role: coach and verifier.").
- Parchment CTA band: "The game is the real business. The app keeps score." + Start Building.
- **No em dashes anywhere in copy** (global rule for the whole product).

### B–D. Signup (5-screen sequence with 5-segment progress bar)
The progress bar segments fill with the five logo colors in order (Sell terracotta → Build blue → Validate violet → Grow green → Scale gold); unfilled = `hsl(30 12% 12% / .15)`.
1. **Parent account** (HQ white card): "Step 1 of 5 · The grown-up", name/email/password, guardian-consent note (left gold border), dark submit "Create parent account →". Validation: name, email with @, password ≥ 8 chars.
2. **Founder profile** (Trail parchment card): "Step 2 of 5 · The founder", first name + age (Fraunces bold inputs), live handle preview `firstprofit.school/<handle>` with "available" tag; green "Claim my page →". Handle = lowercased alphanumeric first name.
3. **Website** ("Step 3 of 5 · Website", violet label): "<Name>, you have a website." Browser frame types out (18ms/2-char interval) "Hi, I'm <name> and I'm <age> years old. This is the future site of my first $1,000 profit company." with blinking terracotta caret. CTA "My money booth next →".
4. **Stripe account** ("Step 4 of 5 · Stripe account", green label): "You can take real money today." Offer card "Invest in me" with three tier chips colored Sell/Build/Validate ($10 → $20, $25 → $50, $50 → $100) and "See your live checkout ↗" (opens mock Stripe checkout). Three green checkmark lines (exact copy in prototype; first: "Money is taken by Stripe through the First Profit account. At any time, you can take over how money flows."; third: "Payouts are released to the parent regularly. Store credit sits in the website app connected to the email address that made the purchase."). CTA "Show me The Path →".
5. **The Path** ("Step 5 of 5 · The Path", gold label): "One room. One task at a time." Five phase rows, Sell highlighted "You start here", others locked. Green "first task" callout. CTA "Start Unit Task #1 →".

### G. Mock Stripe checkout (overlay, also reachable in-app)
Stripe-style two-pane dialog at `pay.firstprofit.school/<handle>`: left = product summary (avatar, "Back <name>", $ amount, credit line, $10/$25/$50 amount picker, payout disclaimer), right = card form (name on card editable; test card 4242… fields read-only), blue "Pay $N.00" button, "Test mode · powered by Stripe · no real charge". Success state: stamp-in checkmark, "<payer> backed <name>.", credit issued line; payment lands in ledger + Sales stat.

### H. The app — Factory Floor
- HUD (parchment rounded bar): logo + wordmark; phase chip (Sell, "n/5 criteria"); right stats **Sales** ($ backing total), **Profit** ($ sales total "of $1,000"), founder-name chip. No XP, no website link.
- Floor: rounded panel, `hsl(38 40% 92%)`, 48px square grid lines (`rgba(26,23,18,.05)`), border animates to the phase color when inside a phase.
- **Avatar**: the v2fp SVG character (orange cap, blue body, legs, ellipse shadow, name tag pill above, 2s bob animation). Starts bottom-center (50%, 94%). Click floor to walk (700–800ms cubic-bezier(.22,1,.36,1) position transition); clicking a card walks to it first (~550ms) then opens. Bottom hint pill: "Click the floor to walk · click a room to enter it".
- Floor has three rows of same-sized compact cards (5-col grid, 12px gap):
  1. **The Path** — five phase cards (Sell…Scale). Unlocked (Sell): solid 2px border in phase color, number badge, name, 5 progress pips, "n/5 criteria", "→". Locked: dashed border in phase color at 30% alpha, lock + "Complete <previous phase> first".
  2. **The Company** — artifact cards: 🌐 Your Site (firstprofit.school/<handle>) and 💳 The Checkout Booth (pay.firstprofit.school/<handle>), both "● live", opening their room dialogs; plus dashed "＋ Built on The Path" placeholder slots.
  3. **The Products** — read-only summary cards (NOT clickable, no hover) of the ideas: "Idea #N", one-liner (truncated 42 chars, else "Not named yet"), "n/10 tasks · next 1.1.4" or "· ready for Build". Empty slots: dashed "Idea #N".

### Sell phase floor (click Sell card)
- Header row: "← The Path" back pill; "Phase 1 · Sell"; "Learn to confidently sell anything."
- **Five room cards** (sequential unlock, same compact size):
  - 💡 The Idea Room — 1.1 · Pitch a product in 60 seconds, no notes
  - 🛒 The Sales Room — 1.2 · Make a real sale
  - 🎓 The Learning Room — 1.3 · Hear "no" 3 times and learn from the conversations
  - 🏷️ The Pricing Room — 1.4 · Explain cost, price and profit on one page
  - 📣 The Outreach Room — 1.5 · 25 supervised outreach attempts
  Unlocked card: sign emoji, room name (Fraunces 700), "id · title" line, 5 task pips, "n/5 unit tasks · Idea #N". Green border + "You are here" tag on the next-up room; wax stamp (rotate -6deg, spring scale-in) when complete. Locked: dashed, "Complete 1.x first". 1.3–1.5 are unbuilt in v1: meta "Coming in the next build", not clickable.
- **Your Ideas row** (below rooms): up to 5 ideas. Filled slot: "Idea #N" + "current" chip when active (terracotta border), one-liner, "n/10 tasks · next <taskId>". Next empty slot: terracotta dashed "＋ Start Idea #N" (the ONLY place a new idea can be created). Later slots: faint dashed.

### Multi-idea model (core v1 mechanic)
- Up to 5 ideas; each has its own `fields` (task text answers) and `done` (task completion) maps. Idea #1 exists from onboarding.
- The **active idea** is the last one chosen; the Next Step button and all room progress/pips reflect it.
- Clicking a room: gather ideas eligible for that criterion (previous criterion complete, this one not). One eligible → set active, open runner. Multiple → "Which idea?" picker dialog (list of "Idea #N · one-liner"). None → no-op.
- Clicking an idea slot: set active; open runner at its next task (or just set active if it finished Sell).
- Creating an idea: appends `{fields:{}, done:{}}`, sets active, opens runner at 1.1.1.

### Step Runner (task dialog)
- Header (Sell tint): "Phase 1 · Sell · Criterion N of 5 · Idea #N" + criterion title; ✕ closes.
- Task rail: 5 segments (green done / terracotta active / faint todo) with task labels.
- Body: numbered chip, "Task N of 5", "⏱ about N min"; task label (Fraunces 900 26px); "how" paragraph; optional input (single-line or 4-row textarea, saved per idea); "Done when" callout (terracotta left border).
- Buttons: green "✓ I did it" (marks done, advances) and outline "Back to the Floor" (closes runner).
- Completing a criterion → celebration dialog: wax-stamp check (`hsl(4 62% 46%)`, rotate -6deg, spring), "Criterion passed", title, "+N XP", "New on The Path" box listing what unlocked ("1.2 · The Sales Room" after 1.1; "1.3 · The Learning Room" after 1.2), green "Keep going →".

### Rooms (dialogs)
- **Your Site**: browser frame with live headline (editable input below, "Edits publish instantly."), active idea's one-liner if written, "Back me · from $10" pill.
- **The Checkout Booth**: "Invest in me" product card + "Open the live checkout ↗" (mock Stripe) + Ledger list (🤝 backings gold-tinted, 💵 sales green-tinted; empty state "Empty so far. The first row is the whole point of Phase 1.").
- **The Sales Room** (market): "Log a sale" form (customer + amount) → adds to ledger, auto-completes task 1.2.5 for the active idea (triggers 1.2 celebration when it's the last task).
- **The Idea Room**: read-only cards of the active idea's one-liner and 60-second pitch ("Not written yet. Task N of The Path writes this.").

## Task data (1.1 + 1.2, kid voice — exact copy in prototype logic)
From `v2fp/src/data/path.ts` STEPS 1.1 and 1.2, with em dashes replaced by commas/periods. Inputs: 1.1.1 `oneLiner`, 1.1.2 `pitch` (long), 1.1.4 `objection`, 1.1.5 `firstAudience`, 1.2.1 `offer`. 1.1 = 60 XP, 1.2 = 120 XP.

## State Management
Extend v2fp `GameContext`:
- `stage`: landing | parent | child | onboard | app; `ob` screen index.
- `profile` (parent name/email; child firstName/age/handle), `ideas: {fields, done}[]` (max 5), `activeIdea`, `sales[]` (kind: sale | backing), `pickFor` (criterion id for idea picker), `runnerOpen`, `celebrate`, `room`, checkout overlay state, avatar position.
- Derived: nextUpFor(idea), isStepDone(stepId, idea), backing/revenue sums, per-idea progress.

## Design Tokens (First Profit design system)
- Phase accents: Sell `hsl(14 78% 54%)`, Build `hsl(217 74% 56%)`, Validate `hsl(265 52% 58%)`, Grow `hsl(150 52% 42%)`, Scale `hsl(41 88% 52%)`.
- HQ neutrals: canvas `hsl(0 0% 100%)`, surface `hsl(40 30% 99%)`, sunken `hsl(40 24% 96%)`, border `hsl(40 14% 89%)` / strong `hsl(40 10% 80%)`, ink `hsl(30 12% 12%)`, ink-soft `hsl(30 8% 34%)`, ink-muted `hsl(30 6% 52%)`.
- Trail neutrals: canvas `hsl(38 46% 95%)`, surface `hsl(40 55% 97%)`, ink `hsl(25 34% 20%)`, ink-soft `hsl(25 20% 38%)`.
- Ceremony: wax `hsl(4 62% 46%)`, gold leaf `hsl(41 74% 50%)`. Verified green `hsl(150 52% 40%)`.
- Type: Fraunces (display, optical sizing), Inter (UI), Spline Sans Mono (numbers/labels/task IDs), Caveat (only inside the AZEAP site mockup). Google Fonts.
- Trail shadows: `0 2px 0 rgba(120,80,40,.12), 0 8px 24px rgba(120,80,40,.14)`; card lift `0 6px 0 rgba(120,80,40,.1)`; green CTA hard shadow `0 6px 0 hsl(150 52% 26%)`.
- Radii: cards 14–18px, dialogs 20–24px, pills full. Motion: rise-in 300–400ms cubic-bezier(.22,1,.36,1); wax stamp ~550ms cubic-bezier(.34,1.56,.64,1) with -6deg rest rotation; avatar bob 2s.
- Verification color rule: "Not Yet" is amber, never red.

## Assets
- `assets/logo-mark.svg` — five ascending steps in the phase colors (from the design system).
- `assets/logo-lockup.svg` — lockup for light surfaces.
- Avatar SVG character: inline in the prototype (from v2fp `Avatar.tsx`).

## Screenshots
`screenshots/` (note: the logo mark SVG renders blank in some captures — see it live in the prototype):
01 landing hero · 02 parent account · 03 founder profile · 04 website reveal (typed) · 05 Stripe/money-booth screen · 06 mock Stripe checkout · 07 The Path onboarding screen · 08 factory floor (Path/Company/Products rows) · 09 Sell floor (5 rooms + Your Ideas) · 10 Step Runner (task 1.1.1) · 11 Your Site room dialog.

## Files
- `First Profit Flow.dc.html` — the full interactive prototype (all screens + logic).
- `assets/logo-mark.svg`, `assets/logo-lockup.svg`.
- Reference code: `uploads/v2fp/` (app scaffold to extend), `uploads/v1fp/` (AZEAP site used in the landing mockup).
