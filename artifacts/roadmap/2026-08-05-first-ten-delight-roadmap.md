---
title: "First ten tasks — delight roadmap (mini-tools, Watchtower, graphic-novel engine, Image Lab)"
type: roadmap
status: draft-for-planning
date: 2026-08-05
owner: Peter
companion: artifacts/roadmap/first-profit-roadmap-2026-08-05.pptx (slide deck version)
repos: [first-profit, 120-The120]
---

# First Profit — delight roadmap for the first ten tasks

## The bet

**"Education is 90% motivation and 10% content."** First Profit already has the
content (25 criteria, ~125 unit tasks, band variants). This roadmap is about the
other 90%, with one north-star outcome: **every kid in the beta cohort reaches
their first real sale — task 1.2.5 — and loves the journey there.**

Three moves:

1. **Delight the first ten** — a purpose-built mini-tool for every one of the
   ten tasks between "pick a product" (1.1.1) and "deliver, thank and log"
   (1.2.5). No step is just a checkbox.
2. **See where they stall** — a staff "Watchtower" over the cohort's completion
   timestamps: who is charging ahead, who has been parked on a task for a week.
3. **Turn progress into story** — every completed task draws the next panel of
   that kid's own graphic novel. The to-do list becomes a book they are the
   hero of.

## Current state (verified against the repo, 2026-08-05)

- Live at firstprofit.school (Vite + React + Tailwind SPA; the120 is the
  account/API side, shared Supabase project).
- ~15 beta players; a 10-parent / 17-child cohort provisioning spec is approved
  (see `20260804 beta cohort provisioning requirements`).
- All 25 criteria have shipped UI (`BUILT_CRITERIA` in `src/data/path.ts` covers
  all of `STEPS`).
- **Task 1.1.2's Pitch Builder is ALREADY SHIPPED** —
  `src/components/tools/PitchBuilderTool.tsx` + `src/lib/pitch.ts`: four beats
  (Hook 20 words/10s, What it is 30/15, Why it's good 40/20, The ask 30/15 =
  120 words/60s), live word meters, 60s read-aloud timer, 150-word hard cap,
  legacy single-block pitch splitting.
- **Completion timestamps already exist** — `src/state/gameCore.ts` stamps
  caller-provided epoch-ms completion timestamps keyed by stable task id
  (`doneAt`, new-shape keyed by stable ids; unioned monotonically cross-tab)
  inside each child's save doc. The Watchtower needs no new client tracking.
- A staff-only surface already exists — `/staff`
  (`src/screens/StaffSuggestions.tsx`): email+password staff sign-in against
  the shared Supabase auth, Bearer-token GET to
  `{t120ApiUrl}/api/fp/suggestions`, byte-identical 401 for non-staff,
  sessionStorage-only session, noindex. The Watchtower should be a sibling tab
  on this page and copy this exact security posture.
- Content pipeline constraint: task content is generated from
  `src/docs/first-profit-home-study-curriculum-brief.md` into
  `pathContent.generated.ts`; behavior hooks live in `src/data/pathHooks.ts`
  keyed by stable task id; per-criterion chrome in `src/data/path.ts`
  (`STEP_META`). Mini-tools should attach by task id the way the Pitch Builder
  does — never by editing generated content.
- Mobile is a non-negotiable acceptance criterion: every new surface must work
  at ~390px (see CLAUDE.md).

## Scope decision: "the first ten tasks"

Criteria **1.1 (The 60-second pitch)** and **1.2 (The first real sale)** —
exactly ten unit tasks, ending at the emotional high point of real money in
hand:

| # | Task id | Task | Mini-tool |
|---|---------|------|-----------|
| 1 | 1.1.1 | Pick the product and the one-liner | **Idea Sparker** (build) |
| 2 | 1.1.2 | Write the full 60-second pitch | **Pitch Builder** (shipped — polish only) |
| 3 | 1.1.3 | Rehearse to camera until note-free | **Rehearsal Studio** (build) |
| 4 | 1.1.4 | Cold-pitch a parent and revise | **Objection Log** (light) |
| 5 | 1.1.5 | Deliver to a non-family adult, no notes | **Say-Back Card** (light) |
| 6 | 1.2.1 | Choose the offer and set the price | **Price Picker** (light) |
| 7 | 1.2.2 | Build the first prospect list | **Ten-List Builder** (light) |
| 8 | 1.2.3 | Set up the point of sale | **Dress Rehearsal** (light) |
| 9 | 1.2.4 | Ask until one yes | **Ask Tracker** (light) |
| 10 | 1.2.5 | Deliver, thank, and log | **Sale Logger** (light) |

Guiding rule for every tool: **it writes into the Founder File fields the kid
already keeps — tools structure the step, they never do it for the kid.** Band
variants (g3_5 / g6_8 / g9_12) stay authoritative; tools adapt copy, never
gates.

## Mini-tool specs

### Idea Sparker (task 1.1.1) — build

Mad-libs-style idea generator plus a "money-maker or hobby?" rubric.

- Two pick rows: **Who is it for?** (e.g. dog owners, card collectors, my
  street / community history) and **What kind of thing?** (standard physical
  good, custom-made physical good, an app). "Spark 3 ideas" generates concrete
  idea sentences from the combination (curated template bank first; LLM
  generation is a later option, not a dependency).
- Rubric — four binary checks scored into a Hobby → Money-maker meter:
  1. Would a stranger pay for it?
  2. Can you make it again this week?
  3. Does the price beat the cost?
  4. Can you name your first buyer?
- Output: writes the chosen idea into 1.1's existing authored fields (product
  name + one-liner — `FIELD_HOOKS` for criterion 1.1). The kid always keeps
  final say; generated ideas are starters, not answers.

### Pitch Builder (task 1.1.2) — shipped; polish backlog

- A celebration beat the moment the assessment turns `ready` (tone already
  computed in `assessPitch`).
- "Now rehearse it" hand-off button into the 1.1.3 Rehearsal Studio.
- One worked example pitch per age band, a tap away.
- Per-beat coach hints ("a hook is a question or a surprise").

### Rehearsal Studio (task 1.1.3) — build

Record → play back → mark clean runs.

- One tap records a take (MediaRecorder; audio first, camera optional).
- Playback immediately; a take stays playable for **15 minutes, then
  self-deletes** (Peter's spec).
- After each take: "note-free and under 60s?" — three clean runs in a row
  completes the task (mirrors the curriculum done-when: three consecutive
  note-free runs on video).
- **Privacy by design (hard requirements):** recordings never leave the device
  — captured in the browser, held in memory/ObjectURL, never uploaded, never
  written to the save doc. Only the clean-run count persists. Result: no new
  COPPA surface, no policy work, no storage bill.

### Light tools (1.1.4 → 1.2.5)

Mostly structured input fields + a celebration moment, attached via
`pathHooks.ts` field hooks per task id:

- **Objection Log (1.1.4):** capture the parent's honest objection and the one
  revision it caused (both are the done-when evidence).
- **Say-Back Card (1.1.5):** log the adult's name, date, and what they said
  back — the pass evidence.
- **Price Picker (1.2.1):** cost vs. price slider showing profit per unit as
  they drag, plus the "how the price was chosen" sentence.
- **Ten-List Builder (1.2.2):** ten names/households + a channel each, with a
  parent safety-approve toggle.
- **Dress Rehearsal (1.2.3):** script runner — greeting → ask → payment →
  delivery → thank-you — run start to finish without stopping.
- **Ask Tracker (1.2.4):** a tap per real ask, a streak indicator, one giant
  YES button when someone agrees.
- **Sale Logger (1.2.5):** who / what / amount / date + a photo — then the
  full confetti moment. (A sale-logging surface exists in the Market/ledger
  path; this is the delight pass on it.)

## Project 1 — The Watchtower (staff progress dashboard)

**Size: small. Build first.**

- The hard part is done: per-task completion timestamps already live in every
  child's save doc; `/staff` already has staff auth with the hardened 401
  posture.
- Build: one the120 API endpoint (staff-gated, mirroring
  `/api/fp/suggestions`) that returns per-child `{fp_username, band, doneAt
  map}` across the cohort, plus a **Progress tab** on the `/staff` page.
- Three views:
  1. **The funnel** — how many kids have passed each of the ten tasks; the
     drop-off step lights up. The "what do I fix next" chart.
  2. **Kid timelines** — one row per child, a dot per completion; bursts show
     momentum, long flat gaps show where a kid quietly stalled.
  3. **The stuck list** — every kid with no completion in 7+ days and the
     exact task they're parked on. The daily two-minute check.
- At 15–32 kids: no infra, no analytics vendor. Never log credentials (repo
  convention R8); usernames only, no grades/birth years in any log line.

## Project 2 — The graphic-novel engine (the big bet)

**Every kid's journey becomes their own graphic novel.** A panel per completed
unit task · a page per criterion · a chapter per phase — ~125 panels by the
capstone, drawn for *their* business, *their* product, *their* words. The kid
is the hero. This is the motivation engine: panels are made individually for
every kid, every business, every unit task.

Pipeline per panel:

1. **Task done** — a completion fires a panel job (async, server-side on
   the120).
2. **Panel brief** — prompt assembled from: the kid's business data (product,
   one-liner, pitch words, sale details), the task's story beat, the style
   bible, and the kid's hero avatar sheet.
3. **Gemini draws** — Gemini API image generation, locked to the Volume 1 art
   style, hero held consistent via character sheet + reference-image
   conditioning.
4. **Safety gate** — automated checks plus owner approval on every panel at
   first; relax to spot-checks once the prompt kit proves out.
5. **Story grows** — the panel lands on the kid's Story wall in the app. The
   reveal is the reward.

Why it works: the reveal is the reward (finish a task, the story grows);
motivation compounds (ten tasks in, they hold ten panels of proof they're the
founder in the story); parents get a printable, share-safe artifact.

**MVP scope: the first ten tasks only** — the delight goal and the novel
converge on the same ten tasks.

## Project 3 — Exemplar Volume 1 (the model book)

One complete, pre-authored graphic novel following an example founder through
the whole Sell phase — ~25 panels, finished art, a real story arc ending in a
first sale. Three jobs:

1. **Preview of the prize** — new kids read Volume 1 on day one and see what
   their own book will become. Wanting one is the hook.
2. **Style bible** — Volume 1 locks the character design language, palette,
   and panel grammar the engine must reproduce; it becomes the prompt kit.
3. **Quality bar** — a generated panel ships only if it sits comfortably next
   to a Volume 1 page. If it doesn't, the prompt fails, not the kid.

In-app presentation: each Volume 1 page renders beside the kid's own
still-empty page for the same tasks — side by side; their book fills in as the
checkboxes fall.

## Project 4 — The Image Lab (build this first)

A staff-only prompt→image test bench using the **Gemini API image generation**
(Nano Banana / Imagen family).

- Prompt template + character sheet in → grid of candidate images out, with
  keep / reject / notes per candidate.
- Drills: **consistency** (same hero across ten different panels — the
  make-or-break test), **style** (does every output sit next to Volume 1 art
  without a seam?), **kid appeal** (show candidates to the in-house jury, log
  verdicts).
- Every kept prompt becomes part of the engine's prompt kit — nothing tested
  here is throwaway.
- Cost (verify current pricing before launch; Flash-class list price ~4¢/image
  at time of writing): ~$5 for one kid's full 125-panel journey; ~$85 for the
  entire 17-kid cohort, first pass. Cost is a rounding error — the risks are
  consistency and style, which is exactly what the Lab tests.
- Keys/config: server-side only (the120 API route or a Vercel function);
  never expose the Gemini key to the SPA.

## Sequencing

**Now (weeks 1–2)**
- Watchtower v1 on `/staff` — funnel + stuck list over existing timestamps.
- Image Lab v1 — Gemini key, prompt bench, first style tests.
- Pick the Volume 1 hero, story arc, and art direction.

**Next (weeks 3–5)**
- Idea Sparker (1.1.1) and Rehearsal Studio (1.1.3) — the two missing hero
  tools.
- Light tools for 1.1.4 → 1.2.5 — mostly structured fields + celebration.
- Volume 1 pages for the first ten tasks, authored in the Lab.

**Then (weeks 6–9)**
- Panel engine MVP scoped to the first ten tasks only.
- Story wall in the app — panels reveal as tasks complete.
- Watch the Watchtower: expand tools + panels wherever kids stall.

Why this order: the Watchtower first means every later change gets measured,
and scoping the engine to ten panels means the delight goal and the novel
converge on the same ten tasks.

## Decisions to make early

- **Hero likeness:** the hero is an avatar the kid designs — never their photo
  or likeness. Panels stay fictional art about a real journey; the COPPA
  posture stays clean.
- **The review gate:** owner approves every generated panel before a kid sees
  it — at 17 kids that's minutes a day. Relax to spot-checks only once the
  prompt kit has earned it.
- **Latency is a feature:** panels don't need to appear instantly. "Your next
  panel is being drawn…" with a reveal on the next visit beats a spinner —
  anticipation is half the fun.
- **Consistency risk:** AI art drifts. Character sheet + reference-image
  conditioning + Volume 1 as the bar — and the Image Lab proves all three
  before the engine ships.

## Success criteria

- Every cohort kid clears task 10 (a first real sale) within ~30 days of
  starting.
- Time-to-first-sale is visible in the Watchtower, and each shipped tool moves
  it down.
- The stuck list runs empty more days than not.
- The tell: kids open the app to see the new panel, not to check a box.

*The to-do list stays. It just becomes a story.*
