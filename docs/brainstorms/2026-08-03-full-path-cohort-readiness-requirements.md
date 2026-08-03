---
date: 2026-08-03
topic: full-path-cohort-readiness
---

# Full Path to Scale + Cohort Feedback Readiness

## Problem Frame

First Profit is about to go to a real test cohort of 15-20 kids whose job is to
walk the path and report where they get stuck. Today only criteria 1.1 and 1.2
are playable; the other 23 criteria exist in `src/data/path.ts` as locked cards
with condensed task lists (85 tasks in-app vs the brief's 125). The owner needs
(a) the entire curriculum from `src/docs/first-profit-home-study-curriculum-brief.md`
playable end to end through Scale, (b) a content structure that can later be
lifted behind an admin login for per-step editing, and (c) a way to capture each
kid's per-task feedback so the iteration loop runs on precise data instead of
reconstructed anecdotes.

**Current storage (verified):** curriculum content is a hardcoded TS data module
(`src/data/path.ts`) compiled into the bundle; child progress lives separately in
Supabase `fp_player_saves` as done-flags keyed `stepId#taskIndex` plus typed
field answers. There is no curriculum database and no admin surface.

## Requirements

**Curriculum content**
- R1. Sync all 25 criteria in `src/data/path.ts` to the brief: every criterion
  carries its full 5 unit tasks (125 total), each with its title and its own
  per-task "done when" from the brief.
- R2. Task text (title/instruction and done-when) is GRADE-banded per the
  brief's Grades 3-5 / 6-8 / 9-12 bands (the brief's Grade-Band Model — these
  are school-grade bands, not ages). Where the brief says "all bands: as
  written", one text serves all bands.
- R3. Every task has a stable identifier that survives content edits (insert,
  reorder, reword), so a child's saved progress never silently remaps to a
  different task. Progress keying migrates off raw indexes. Behavior hooks
  attached to tasks — the real-sale auto-complete on 1.2's log-the-sale task
  (`ADD_LEDGER` in `src/state/gameCore.ts`) and the `@artifact` auto-complete
  markers parsed by `parseTask` — are carried as structured attributes addressed
  by stable task id and survive the content resync and migration.
- R4. The content structure is DB-ready: shaped so it can later be lifted
  row-for-row into a database table and edited individually from a future admin
  section without redesigning it. No admin UI or database move in this build.

**Path progression**
- R5. A child can progress from 1.1 through 5.5 with no dead end. Within
  phases 1-3, criteria unlock in order PER IDEA and every new idea starts at
  1.1. Phase 4 unlocks for the CHILD once an idea completes Validate AND is
  promoted (R7); phases 4-5 criteria then unlock in order for the business.
- R6. Phases 1-3 (Sell, Build, Validate) track progress PER IDEA — kids
  experiment with multiple ideas over the multi-year program, and each idea
  carries its own Sell/Build/Validate state. The full per-idea model ships in
  THIS build (while zero saves depend on the schema), including the UI needed
  to live with it: a task screen always shows which idea it belongs to, and the
  child can switch ideas in Build/Validate as they can in Sell today. The Path
  progress display reflects per-idea state rather than one shared row.
- R7. Phases 4-5 (Grow, Scale) track the child's BUSINESS. When an idea
  completes Validate, the child EXPLICITLY promotes it to "the business" (a
  real moment in the game, not a silent flag). One active business at a time;
  a business can be archived and another validated idea promoted later, so the
  save stores businesses as a list with one active. Other ideas remain playable
  through phases 1-3 after a promotion.
- R8. Existing cohort progress (completed 1.1/1.2 tasks, typed answers) carries
  forward intact. Because R1 replaces the task lists themselves, the content
  sync DELIVERS an explicit old-index → new-stable-id mapping for 1.1/1.2;
  unmappable flags are preserved raw but not displayed, and no child is ever
  un-completed on a criterion they had completed. Editorial rule for future
  edits: a copy tweak keeps the task id; an edit that changes what the task
  asks for ships as a NEW id (the old id is retired, its progress preserved
  but not counted toward the new task).

**Grade banding**
- R9. The app resolves each child's band DIRECTLY from the roster grade when
  set; otherwise it asks once in-app (grade, or age converted via
  grade = age - 5) and persists the answer back to the roster so parents/admin
  see the same value. Never convert grade to age for band matching — the bands
  are grade bands. Persist BIRTH YEAR (or the answer plus a captured-at date),
  never a bare grade/age snapshot, and derive the current grade at read time —
  a stored snapshot goes stale every school year of a multi-year program.
- R10. Until the grade is known, task text defaults to the middle band
  (Grades 6-8). The band affects displayed text only, never gating or progress.

**Cohort feedback capture**
- R11. Every task screen offers a lightweight "Stuck? Tell us" affordance. A
  submission records the child, the stable task id, the grade band shown, and
  the child's free text. A submission that cannot reach the server is durably
  queued and retried (reuse the existing sync outbox pattern in
  `src/lib/sync.ts` — the stuck moment correlates with flaky connections).
- R12. Feedback is readable by the owner without an admin UI (direct table
  access / export is acceptable for this cohort). That access stays owner-only
  via the existing service credentials and is scoped to the cohort period;
  exported copies are treated as sensitive.
- R13. Kids who are stuck often don't type: a submission with EMPTY text is
  still recorded and counted (the tap is signal), and per-task completion
  timestamps are captured so silent stalls ("time stuck on a task", "last task
  before going dark") are queryable without any child typing a word.
- R14. Child-data safeguards ship with capture: the feedback box carries a
  kid-worded "no names or addresses" hint and a max length; feedback rows join
  the same deletion path as player saves; and the signup consent text is
  verified (and extended if needed) to cover grade + feedback collection
  BEFORE cohort start.

## Delivery Sequencing

The feedback instrument (R11-R14) ships FIRST and independently — it works on
today's two playable criteria, and stuck-reports must flow from the cohort's
day one. Path content then lands phase-by-phase ahead of the cohort's frontier
(kids spend weeks in Phase 1 before Phase 4-5 text matters); "full path through
Scale" is the end state, not the gate for cohort start. The full path releases
to ALL users — there is no cohort gating; the current user base IS the cohort.

## Success Criteria

- A tester account can be driven from a fresh start to 5.5 marked complete
  without touching code or hitting a locked dead end.
- Any task screen's text matches the brief for that task and the child's grade
  band.
- The owner can edit one task's copy and ship it while the cohort is mid-path
  without any child's progress shifting to a different task.
- When a cohort kid reports being stuck, the owner can see which task, which
  child, and their words in one query.
- Before cohort start, at least one REAL child account (the existing test
  family) submits a stuck report from a real device that lands queryable with
  the correct task id and band, with the band resolved via the roster path.

## Scope Boundaries

- No admin login, admin UI, or database-backed content in this build — the
  structure only has to make that lift mechanical later.
- No per-task age-band PARENT guidance in the kid UI (the 3-5/6-8/9-12 parent
  coaching lines stay out; only the kid-facing task text is banded).
- No new room dialogs for phases 2-5; the Step Runner is the playing surface
  everywhere, and rooms without a built dialog stay inert.
- No feedback moderation, replies, or notifications — capture and read only.
- Completion tracking / verification workflows from the brief's final section
  (parent sign-off, evidence uploads) are out of scope.

## Key Decisions

- **Content stays in code, shaped for the DB**: the cohort iterates via
  owner-driven edits and ~1-minute deploys, so a database now would add runtime
  and migration cost before any admin exists to benefit. Stable ids and a
  row-like shape make the later lift mechanical.
- **Sell/Build/Validate per idea; Grow/Scale one business**: matches the 3+ year
  program reality — kids run several experiments before one idea earns growing
  and scaling.
- **Age band from roster grade, ask-once fallback**: the roster is the durable
  home for age; most current children have no grade set, so the app must be able
  to ask and write back.
- **In-app per-task feedback ships with the path**: the cohort's entire purpose
  is stuck-point discovery; capturing it pre-tagged with task id and band is the
  instrument the experiment runs on.
- **Feedback ships first** (review outcome): the instrument must not wait on
  the largest work item; content follows phase-by-phase ahead of the cohort.
- **Explicit, reversible business promotion** (review outcome): promotion is a
  chosen moment; businesses are a list with one active so a year-2 pivot never
  needs schema surgery on live saves.
- **Full per-idea model now** (review outcome): the per-idea schema lands while
  zero saves depend on it — migrating live multi-year saves later would cost
  far more than building the switcher UI early.

## Dependencies / Assumptions

- The brief (`src/docs/first-profit-home-study-curriculum-brief.md`) is the
  content source of truth, including today's 1.2.4/1.2.5 split. The current
  85-task in-app lists were early prototype condensations, not a deliberate
  pedagogy decision — the owner's prior correction of 1.2 to match the brief
  set the precedent that the brief's granularity governs.
- Writing age back to the roster and storing feedback rows require The120-side
  work (table/columns + policies) — the SPA cannot write those stores directly
  today. Assumed acceptable as part of this effort.
- The current save-doc schema can carry per-idea state for phases 1-3 and
  business state for 4-5 (schema evolution is planning's problem, but R8 makes
  compatibility non-negotiable).

## Outstanding Questions

### Deferred to Planning
- [Affects R3][Technical] Stable-id scheme and the migration of existing
  `stepId#index` done-flags onto it.
- [Affects R7][Design] The promotion screen's shape (decided: an explicit
  choice moment; planning proposes the smallest honest version of it) and how
  a promoted idea is presented afterward in Your Ideas.
- [Affects R9][Technical] Where the ask-once grade answer is stored, how it
  writes back to the roster through The120, and the RLS/authorization scope of
  that child-triggered write (same treatment as R11's feedback table).
- [Affects R9][Design] The ask-once interaction: non-blocking (never gates
  play), and the write-back retries silently on failure.
- [Affects R11][Technical] Feedback table shape, RLS, and rate limiting
  (children write only their own rows), plus a max length on the free text and
  escaped rendering wherever it is later displayed.
- [Affects R11][Design] The affordance's placement in the full-screen mobile
  Step Runner (~390px, 44px tap targets) and its loading / success / failure
  states.
- [Affects R1][Needs research] A handful of brief tasks reference artifacts
  (photos, one-pagers, recordings) — confirm each maps to a plain checklist task
  with a text field at most, consistent with how 1.1/1.2 handle artifacts today.

## Next Steps

-> `/ce:plan` for structured implementation planning
