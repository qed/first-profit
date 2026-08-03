---
title: "feat: Full path to Scale + cohort feedback readiness"
type: feat
status: active
date: 2026-08-03
origin: docs/brainstorms/2026-08-03-full-path-cohort-readiness-requirements.md
---

# feat: Full Path to Scale + Cohort Feedback Readiness

**Target repos:** most units land in `first-profit`. Unit 1 lands entirely in
the sibling repo `120-The120`; Unit 3 spans both repos. Paths in that repo are
marked `[T120]`.

## Overview

Make all 25 criteria of the First Profit curriculum playable end to end
(1.1 → 5.5), with task content generated from the canonical brief (125 tasks,
grade-banded text, stable ids), per-idea progress through Sell/Build/Validate,
an explicitly promoted and archivable business for Grow/Scale, and a per-task
"Stuck? Tell us" feedback instrument that ships FIRST so the 15-20 kid cohort's
stuck-points are captured from day one.

## Problem Frame

The owner is sending First Profit to a 15-20 kid test cohort whose job is to
walk the path and report where they get stuck (see origin:
`docs/brainstorms/2026-08-03-full-path-cohort-readiness-requirements.md`).
Today only 1.1/1.2 are playable; `src/data/path.ts` carries condensed 85-task
lists; progress is keyed by fragile array indexes; the app knows no grade; and
there is no feedback capture. The origin doc fixed the product decisions —
this plan fixes the how.

## Requirements Trace

From the origin document (ids preserved):
- R1/R2: 125 tasks with per-task done-when, grade-banded (Grades 3-5/6-8/9-12) — Units 4, 5
- R3: stable task ids + behavior hooks survive resync — Units 4, 5
- R4: DB-ready content shape (row-like, liftable to a table) — Unit 4
- R5/R6/R7: full-path progression; per-idea phases 1-3; promoted archivable business — Units 6, 7, 8
- R8: existing 1.1/1.2 progress carries forward via an explicit mapping — Unit 5
- R9/R10: grade-band resolution (roster grade, ask-once birth-year fallback, middle-band default) — Unit 3
- R11/R13: offline-durable stuck reports, empty tap counts, completion timestamps — Units 1, 2
- R12/R14: owner-readable feedback with kid-data safeguards — Units 1, 2
- Delivery sequencing: feedback instrument ships before the content/path work — phase order below

## Scope Boundaries

Carried from the origin doc: no admin UI or database-backed content in this
build; no parent-guidance age-band lines in the kid UI; no new room dialogs for
phases 2-5 (the Step Runner is the playing surface); no feedback moderation or
replies; no parent sign-off / evidence-upload verification workflows. The full
path releases to all users — no cohort gating. Verifying/extending the signup
consent text (R14) is an owner task tracked here but executed on The120's
consent policy, not in this repo's code.

## Context & Research

### Relevant Code and Patterns

- **The target content model already exists in The120**:
  `[T120] app/fp/content/generated/program-2026-27.ts` — 25 criteria, 125 tasks
  with ids (`"1.1.1"`), per-task title/body, `bandVariants {g3_5,g6_8,g9_12}`,
  `allBandsNote`, built by `[T120] scripts/build-path-content.ts` +
  `[T120] app/fp/content/parse-curriculum.ts` from the same brief, guarded by a
  generated-drift test. Mirror this build-from-brief approach.
- **Child-scoped table template**:
  `[T120] supabase/migrations/20260827120000_fp_player_tables.sql` — default-deny,
  per-command policies with explicit WITH CHECK, ownership via
  `fp_player_profiles.user_id = auth.uid()`, append-only trigger, size-cap
  CHECKs, FK index for the RLS subquery. The feedback table copies this shape.
- **Additive-column playbook**: `[T120] supabase/migrations/20260901120000_fp_ledger_fee_columns.sql`
  (deploy ordering: migration + schema reload BEFORE the client that writes).
- **Durable writes**: `src/lib/sync.ts` ledger outbox — enqueue-then-insert,
  client-minted UUID, `23505` = success, retryable vs terminal classification
  (`PGRST204`/`42703` retryable), keepalive flush, session-generation guard.
  The feedback writer reuses this machinery, not a new one.
- **Save doc idiom**: `src/state/gameCore.ts` — `DOC_VERSION 1`, additive-optional
  fields ONLY (the `chosenProvider` precedent); `fromSaveDoc` discards unknown
  versions; `OUTBOX_VERSION` rides in lockstep. The progress rekeying must be
  additive at v1, never a version bump.
- **Playability threading**: `PLAYABLE_STEPS` in `src/state/gameCore.ts` plus
  hardcoded Phase-1 assumptions in `src/state/floorSelectors.ts`,
  `src/components/Hud.tsx`, `src/components/PhasesFloor.tsx`,
  `src/components/SellFloor.tsx`, `src/components/StepRunner.tsx`,
  `src/components/Celebration.tsx`, `src/components/PodCardContent.tsx`.
- **FP API route template**: `[T120] app/api/fp/login/` (pure rules + thin route,
  CORS allowlist, one generic refusal, attested IP, atomic rate limiter in
  `[T120] app/fp/lib/rate-limit-store.ts`). Grade endpoints copy this.
- **Grade semantics**: `[T120] app/fp/lib/progress-core.ts` `bandForGrade(grade)`
  → `g3_5 | g6_8 | g9_12 | null`; `children.grade int` nullable +
  `children.birth_year` exist since the initial schema; grade is validated 3-12
  via `gradeVerdict` (`[T120] app/lib/funnel/child-rules`), never clamped.
- **Login profile surface**: `src/lib/auth.ts` → `/api/fp/login` returns only
  `{handle, firstName}`; the route already joins `children` server-side and can
  surface `grade`.

### Institutional Learnings

- `docs/solutions/logic-errors/a-reducer-that-derives-and-persists-a-value-must-honor-a-full-snapshot-on-replay-recompute-when-absent-and-discard-a-partial-2026-08-02.md`
  — the rekeying migration must define full/absent/partial semantics explicitly.
- `docs/solutions/logic-errors/remapping-a-retired-discriminant-value-to-a-live-one-inherits-its-side-effects-not-behavior-neutral-2026-08-02.md`
  — the old-index → new-id map is behavior (it can trigger celebrations); test it as such.
- `docs/solutions/integration-issues/additive-column-plus-unconditional-write-a-missing-column-error-classifies-terminal-and-drops-the-row-park-it-2026-08-02.md`
  — feedback writes must classify schema-cache errors as parkable; DB ships first.
- `docs/solutions/security-issues/async-writer-closes-over-per-session-key-but-reads-live-shared-state-guard-with-a-generation-token-2026-08-01.md`
  and `docs/solutions/security-issues/in-memory-reducer-state-survives-logout-on-shared-devices-reset-explicitly-2026-07-31.md`
  — grade + feedback slices join the generation-guard and logout reset.
- `docs/solutions/logic-errors/split-storage-append-only-table-is-write-only-until-you-add-an-explicit-read-back-2026-08-01.md`
  — HYDRATE must source (or deliberately not clear) every new persisted slice.
- `docs/solutions/security-issues/r20-fp-child-session-reach-across-the-shared-supabase-project-accepted-exposure-2026-08-01.md`
  — update the R20 exposure record for the feedback table + grade surface.
- `docs/solutions/ui-bugs/breakpoint-crossing-drops-navigation-2026-07-31.md`
  — any new overlay/affordance keeps intent above the `lg` conditional mount.
- `[T120] docs/solutions/security-issues/rls-with-check-pins-values-not-columns-column-scope-the-grant-to-protect-created-at-2026-07-31.md`
  — column-scope the INSERT grant on the feedback table.
- `[T120] docs/solutions/best-practices/in-memory-rate-limiter-toctou-race-and-fifo-eviction-clears-lockout-2026-07-22.md`
  + `composite-rate-limit-key-string-join-collides-on-ipv6-and-unstripped-delimiters-2026-07-31.md`
  — reuse the atomic limiter with encoded composite keys for the grade route.
- `[T120] docs/solutions/workflow-issues/split-phase-migrations-pre-deploy-schema-post-deploy-purge-separate-files-rerun-2026-07-14.md`
  + `migration-version-collision-with-applied-but-unmerged-other-lane-query-schema-migrations-before-authoring-2026-07-28.md`
  — migration authoring/apply discipline; stale tabs keep running old code.

## Key Technical Decisions

- **Generate path content from the brief, don't hand-author**: a build script in
  this repo (mirroring The120's `parse-curriculum.ts`) parses
  `src/docs/first-profit-home-study-curriculum-brief.md` into a committed,
  typed `src/data/pathContent.generated.ts`. The shape matches
  `[T120] app/fp/content/types.ts`: per-task `{id, title, body, doneWhen,
  bandVariants: Partial<Record<Band,string>>, allBandsNote?}` — band variants
  are PARTIAL overlays on a shared body (many tasks author only some bands);
  the band accessor returns body + the variant for the child's band, falling
  back to the body alone when no variant exists. Task counts per criterion are
  VARIABLE (2.3 has six, 3.4 has four; 125 total) — the engine always derives
  counts/last-task from the data, never from a ×5 assumption. A drift test
  regenerates and diffs (LF-normalized), and also hashes the sibling repo's
  brief copy when present — this repo's brief is canonical for the SPA, and a
  meaning-changing edit must be coordinated with The120's version-pinning
  policy, not just this repo's remap table. Behavior
  hooks (`@artifact` markers, the real-sale auto-complete target, per-step
  authored input fields) live in a small hand-maintained
  `src/data/pathHooks.ts` keyed by stable task id — content edits can never
  silently drop behavior (R3). This shape is row-like and DB-ready (R4).
- **Stable id = the brief's task number, frozen + remap table**: task id
  `"1.1.1"` is minted at first publication. Copy edits keep the id. A meaning
  change or structural edit (insert/reorder) ships with an entry in an explicit
  remap table (old id → new id | retired) consumed by the same migrate-on-load
  path as the initial index migration — the machinery is built once (Unit 5)
  and reused for every future structural edit. This satisfies R3's intent
  without inventing opaque slugs the brief can't carry.
- **Additive save-doc evolution at DOC_VERSION 1, migrate-on-load**: the doc
  gains optional fields (`doneByTask` keyed by task id with completion
  timestamps, `ideaMeta` ids, `businesses` list). `fromSaveDoc` migrates legacy
  `done` index keys through the mapping exactly once per load; the legacy field
  is retained (never rewritten destructively) so old tabs writing old-shaped
  docs cannot corrupt anything. No DOC_VERSION bump → no outbox discard (R8).
- **Feedback writes go direct to PostgREST under RLS** (no new API route),
  mirroring the ledger: client-minted UUID, append-only table, per-child
  ownership policy, length CHECK, and a per-child daily-cap trigger for abuse
  bounding. Reuses the sync outbox for durability. Rationale: 15-20 kids, the
  ledger precedent proves the shape, and no server logic is needed to accept a
  row.
- **Grade reaches the client via the login response; ask-once posts to a new
  route**: `/api/fp/login` adds `grade` (already joined server-side); a new
  `[T120] POST /api/fp/grade` accepts a birth year, validates the derived
  grade with the existing `gradeVerdict` discipline, writes
  `children.birth_year` (+ derived `grade`) via service role, rate-limited via
  the shared limiter. Band derivation (`bandForGrade` semantics) is mirrored
  in a pure client module; default band `g6_8` until known (R9/R10).
- **One generic phase engine replaces Phase-1 hardcoding**: selectors take the
  full criterion sequence from the generated content; `PLAYABLE_STEPS` is
  retired rather than extended. Phase colors/names come from the existing
  `PHASES` data (single source; the duplicated `PHASE_UI` map is removed).
- **Businesses are a list with one active** (origin decision): promotion is an
  explicit reducer action + small screen; archive keeps Grow/Scale history on
  the business record; ideas gain stable ids (additive) so promotion references
  an idea id, not an array index.

## Open Questions

### Resolved During Planning

- Where does banded content come from?: generated from the brief (see decisions)
  — The120 already proved the parse on this exact document.
- Id scheme vs insert/reorder: frozen task numbers + remap table beats opaque
  slugs (the brief carries the numbers; the remap machinery must exist anyway
  for the 85→125 sync).
- Rate limiting for direct PostgREST feedback writes: DB-side daily-cap
  trigger (the in-memory API limiter can't see PostgREST writes).
- Does 1.2's sale auto-complete survive?: yes — the hook moves to
  `pathHooks.ts` addressed by task id `1.2.5`.

### Deferred to Implementation

- Exact generated-module field names and the parser's tolerance rules for brief
  formatting quirks — settled against the real document during Unit 4.
- The promotion screen's final copy/layout (origin defers to "smallest honest
  version") — designed in Unit 8 within the existing overlay conventions.
- ~~Row-per-idea vs switcher~~ RESOLVED (review): the Path shows the ACTIVE
  idea's progress with a compact idea-switcher chip (tap → the existing picker
  pattern); inactive ideas are one tap away. Keeps the 390px path at today's
  density.
- Exact XP/celebration behavior at phase boundaries (Celebration currently
  computes `1.{n+1}`) — generalized in Unit 8 with the phase engine.
- Archive/unarchive UI (Unit 8 note): DELIBERATELY DEFERRED. The reducer fully
  supports `ARCHIVE_BUSINESS`/`UNARCHIVE_BUSINESS` (with confirm-worthy
  semantics, timestamps, and the cross-tab union), but no floor affordance
  ships yet — the cohort has one business per family and no observed need to
  swap it; the UI lands when a real need appears rather than as speculative
  chrome.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for
> review, not implementation specification. The implementing agent should treat
> it as context, not code to reproduce.*

```
brief (md, canonical)
   └─ build script (repo-local, mirrors T120 parse-curriculum)
        └─ src/data/pathContent.generated.ts     ← 25 criteria, 125 tasks
             (per-criterion counts VARY — 2.3 has six, 3.4 has four;
              per-phase totals [25,26,24,25,25] per T120's manifest)
             { id "3.2.4", title, body, doneWhen,
               bandVariants: Partial<{g3_5,g6_8,g9_12}>, allBandsNote? }
        + src/data/pathHooks.ts (hand-kept)      ← {"1.2.5": saleAutoComplete,
                                                    "2.1.3": "@website", field defs...}
             └─ phase engine (gameCore selectors, full sequence)
                  ├─ per-idea progress: doneByTask[ideaId]["3.2.4"] = {at}
                  ├─ businesses: [{id, ideaId, archived?}], one active
                  └─ UI: PhaseFloor(phase) generic, StepRunner chrome by phase,
                         Celebration crosses boundaries

feedback:  StepRunner ─ StuckBox ──► outbox (sync.ts) ──► fp_task_feedback (RLS)
grade:     login response.grade ─► band; else AskOnce ─► POST /api/fp/grade ─► roster
```

## Implementation Units

Phased per the origin's delivery sequencing: Phase A (instrument) ships before
Phase B (content engine) before Phase C (full-path play). Every UI unit is
verified at ~390px and desktop per CLAUDE.md before it is complete.

### Phase A — the feedback instrument (ships first)

- [ ] **Unit 1: `fp_task_feedback` table + policies `[T120]`**

**Goal:** A child-writable, append-only feedback table the SPA can insert into
under RLS, readable by the owner via service credentials.

**Requirements:** R11, R12, R14

**Dependencies:** None. Must deploy before Unit 2's client writes.

**Files:**
- Create: `supabase/migrations/<next-free-version>_fp_task_feedback.sql` `[T120]`
- Test: `app/fp/lib/__tests__/` probe additions per the RLS-integration convention `[T120]`

**Approach:**
- Copy the `fp_player_tables` shape: default-deny, INSERT-only policy for the
  child (ownership via `fp_player_profiles`), no child SELECT/UPDATE/DELETE,
  column-scoped INSERT grant (server-managed `created_at`/defaults protected),
  append-only trigger.
- Columns: client-minted uuid PK, `profile_id`, `task_id text` (CHECK matching
  the task-number shape), `band text` (CHECK in g3_5/g6_8/g9_12/unknown),
  `body text` (CHECK length ≤ 1000; EMPTY ALLOWED — a tap is signal), `created_at`.
- Per-child daily-cap trigger (e.g. 50 rows/day) — the API limiter cannot see
  PostgREST writes.
- Retention (review decision): feedback rows expire ~12 months after creation,
  independent of account deletion — a documented purge ritual (or scheduled
  job) in the migration header, plus an accepted-risk note (R20 style) that
  the UI hint + length cap are the only pre-storage PII mitigations for this
  owner-read cohort instrument.
- Deletion path: FK ON DELETE CASCADE from `fp_player_profiles` so feedback
  dies with the profile (R14). NOTE: this diverges from BOTH the ledger AND
  `fp_player_saves` (both RESTRICT) — the migration header states this
  divergence and why, so the deletion runbook stays honest.

**Patterns to follow:** `supabase/migrations/20260827120000_fp_player_tables.sql`;
WITH-CHECK/column-grant learning; migration authoring ritual (query
`schema_migrations` for the next free version first).

**Test scenarios:**
- Happy path: child session inserts own row with task id + band + body → accepted.
- Happy path: empty `body` accepted (tap-only signal).
- Error path: child inserts a row for another profile_id → RLS refusal.
- Error path: child SELECTs the table → refusal (no read policy).
- Error path: body over length CHECK → refusal; malformed task_id → refusal.
- Edge case: 51st row in a day → daily-cap trigger refusal.
- Integration: service-role read returns rows joined to profile/child for the owner's query.

**Verification:** RLS probes pass against a real (staging or prod) schema; the
owner can run the one query from the origin's success criterion.

- [ ] **Unit 2: StuckBox in the Step Runner + durable submission + completion timestamps**

**Goal:** Every task screen carries the "Stuck? Tell us" affordance; submissions
survive offline/tab-death; per-task completion timestamps make silent stalls queryable.

**Requirements:** R11, R13, R14

**Dependencies:** Unit 1 deployed. The consent-text verification (R14) is a
SHIP BLOCKER for this unit's production release, not a Unit 9 checklist item —
new child-data collection must not go live before consent covers it.

**Files:**
- Create: `src/components/StuckBox.tsx`, `src/components/__tests__/StuckBox.test.tsx`
- Modify: `src/components/StepRunner.tsx`, `src/lib/sync.ts`,
  `src/state/gameCore.ts` (completion timestamps), `src/lib/draftCache.ts` only if
  a new namespace is needed
- Test: `src/lib/__tests__/sync.test.ts`, `src/state/__tests__/gameCore.test.ts`

**Approach:**
- StuckBox: collapsed text-link affordance under the task body ("Stuck? Tell
  us →"); expands to a short textarea with the kid-worded "no names or
  addresses" hint, max length 1000 (with a char counter appearing near the
  limit), submit allowed with empty text; after a successful submit it
  auto-collapses behind a brief kid-voiced confirmation; re-submitting on the
  same task is allowed (each submission is a new row). 44px+ targets;
  full-screen-safe at 390px, never competing with the task's primary CTA zone.
- Task id stamped in Phase A: the synthesized id `stepId.{index+1}` — valid
  ONLY because Phase A play is limited to 1.1/1.2, whose 5-task lists align
  1:1 with the brief (a pinned test asserts `1.2#4` stamps `1.2.5`).
- Band stamped: `unknown` whenever the band is defaulted rather than resolved
  from an actual grade; `g6_8` appears in data only when derived from a real
  grade (keeps the owner's band analysis unbiased).
- Submission rides a new outbox kind beside ledger entries: client-minted UUID,
  enqueue-then-insert, `23505` success, retryable/terminal classification,
  generation-guarded, drained by the existing replay + keepalive paths. The
  retryable set for this kind ADDS missing-TABLE codes (`PGRST205`, `42P01`)
  — a missing table is transient-by-deploy exactly like a missing column, and
  without this every report sent before the migration lands would be DROPPED,
  not parked.
- Client-side mirrors of the server limits (1000 chars, daily cap) make
  terminal refusals unreachable in normal use; if a terminal drop still
  happens, the UI shows an honest "couldn't send this one" — "saved, will send
  later" is reserved for genuinely parked (retryable) entries.
- `COMPLETE_TASK` records a timestamp additively (`doneAt` map beside `done`,
  keyed by the SAME legacy `${stepId}#${index}` scheme as `done` until Unit 5
  remaps both), carried in the save doc as an optional field (no version
  bump), sourced on HYDRATE per the read-back learning.

**Execution note:** Ship this unit (with Unit 1 and 3) to production before the
cohort starts; do not gate it on Phases B/C.

**Patterns to follow:** ledger outbox in `src/lib/sync.ts`; double-submit
in-flight guard learning; breakpoint/lifted-intent conventions.

**Test scenarios:**
- Happy path: type text, submit → outbox entry with task id + band + text; drains to an insert.
- Happy path: empty-text submit → recorded (tap-is-signal), same pipeline.
- Edge case: double-click submit → one row (in-flight guard + idempotent UUID).
- Error path: insert fails retryable (network, PGRST204) → entry parked, replay drains it later.
- Error path: insert fails terminal (RLS 42501 persists after reauth path) → classified per existing rules, never blocks other outbox entries.
- Integration: logout/login as a different child mid-flight → generation guard prevents cross-child writes; per-account outbox namespaces hold.
- Happy path: completing a task stores a timestamp; save doc round-trips it; old docs without `doneAt` load cleanly.
- Mobile: at 390px the affordance doesn't cover task actions and keeps ≥44px targets (screenshot verification).

**Verification:** Origin success criterion — a real child device submits a
stuck report that lands queryable with correct task id and band; airplane-mode
submit lands after reconnect.

- [ ] **Unit 3: Grade to the client — login field, ask-once capture, band plumbing**

**Goal:** The app knows each child's grade band; unknown resolves to `g6_8`;
the ask-once answer persists to the roster.

**Requirements:** R9, R10; feeds the band recorded by R11.

**Dependencies:** Unit 1/2 can ship without it (band records `unknown`), but
target landing it in Phase A with them. The consent-text verification (R14)
is a ship blocker for this unit's production release too (birth-year
collection is new child data).

**Files:**
- Modify `[T120]`: `app/api/fp/login/route.ts` + `profile-core.ts` (surface `grade`)
- Create `[T120]`: `app/api/fp/grade/route.ts`, `app/api/fp/grade/grade-rules.ts`,
  `app/api/fp/grade/__tests__/grade-rules.test.ts`
- Create: `src/lib/band.ts`, `src/lib/__tests__/band.test.ts`,
  `src/components/GradeAsk.tsx`, `src/components/__tests__/GradeAsk.test.tsx`
- Modify: `src/lib/auth.ts` (profile carries grade), `src/state/gameCore.ts`
  (band in profile state, logout reset), `src/screens/Factory.tsx` or the
  onboarding tail (mount point for the ask)

**Approach:**
- Login response adds `grade: number|null`, COMPUTED AT READ TIME from
  `children.birth_year` when set (honoring origin R9's derive-at-read rule so
  the value never goes stale across school years), falling back to a stored
  `children.grade` for roster children whose grade was set directly. Note
  `birth_year` is `text not null default ''` in the schema — empty string is
  the unset sentinel, not NULL.
- `POST /api/fp/grade`: authenticated child session (Bearer, mirroring signup
  child routes). The target roster row is ALWAYS resolved server-side from the
  session's identity — never taken from the request body (the write uses the
  service role, so this route is the only IDOR guard). Accepts a birth year;
  the derived grade (school-year arithmetic in one pure function) is validated
  3-12 via the `gradeVerdict` discipline (refuse, never clamp); writes
  `children.birth_year` via service role; coerce-not-raise posture on any
  roster trigger; atomic rate limiter with encoded composite key;
  CORS/no-oracle conventions copied from the login route. `birth_year` and the
  derived grade NEVER appear in application logs (same rule as the login
  route's never-log-credentials convention).
- Deploy order within this unit: the `[T120]` route ships first, then the SPA
  changes — reversed, the client calls a nonexistent route.
- Client: `bandForGrade` mirror in `src/lib/band.ts` (g3_5/g6_8/g9_12, null →
  display default g6_8; feedback rows still stamp `unknown` per Unit 2).
  GradeAsk is a non-modal inline card on the floor (mounted in
  `src/screens/Factory.tsx`, above the breakpoint conditional per the
  lifted-intent rule) with a simple birth-year select — never gates play;
  skip = default band; retries write-back silently. Shown only when login
  returned `grade: null` and no answer is stored.
- Band is display-plumbing only — it selects task text and stamps feedback
  rows; it never gates progress (R10).

**Patterns to follow:** `app/api/fp/login/` route anatomy `[T120]`;
`bandForGrade` in `app/fp/lib/progress-core.ts` `[T120]`; generation-token and
logout-reset learnings for the new client slice.

**Test scenarios:**
- Happy path: login returns grade 4 → band g3_5 text selected everywhere; no ask shown.
- Happy path: grade null → ask appears once; answering persists (mock route) and band updates live.
- Edge case: skip/dismiss the ask → band g6_8, ask does not reappear this session; reappears next session while roster grade is null.
- Error path: grade route offline → answer applied locally for the session, write-back retried silently, play never blocked.
- Error path `[T120]`: birth year yielding grade <3 or >12 → generic refusal, nothing written; rate limit exceeded → generic refusal.
- Edge case: band derivation at the school-year boundary (pure-function cases pinned).
- Integration: feedback rows submitted before an answer carry `unknown`/default band; after, the resolved band.

**Verification:** Cedric-family real-device check: roster-driven band resolves
end to end (origin success criterion); a null-grade child sees the ask exactly
once per the rules above.

### Phase B — the content engine

- [ ] **Unit 4: Brief parser + generated content module + hooks registry**

**Goal:** `path.ts`'s hand-written 85-task content is replaced by a
brief-generated 125-task module with band variants and stable ids, plus a
hand-kept hooks registry carrying all behavior.

**Requirements:** R1, R2, R3, R4

**Dependencies:** None (can proceed in parallel with Phase A).

**Files:**
- Create: `scripts/build-path-content.ts`, `src/data/pathContent.generated.ts`
  (committed output), `src/data/pathHooks.ts`,
  `src/data/__tests__/pathContent.test.ts` (drift + shape guards)
- Modify: `src/data/path.ts` (becomes the assembly point: generated content ×
  hooks → the `Step`/task API the app consumes; `PHASES` stays)

**Approach:**
- Mirror The120's parser against the SAME brief file; emit criteria with
  per-task `{id, title, doneWhen, bands{g3_5,g6_8,g9_12}}`; "All bands: as
  written" collapses to one text per R2.
- Hooks registry keyed by task id: `@artifact` auto-complete markers, the
  1.2.5 sale auto-complete, per-criterion authored input fields (1.1's
  productName/oneLiner, 2.2's gapBrief). Assembly asserts every hook's task id
  exists — a broken reference fails the build, not the child.
- Keep the exported `Step`/`stepById`/`parseTask` API stable where cheap so
  Phase C rewires consumers incrementally; extend with band-aware text
  accessors taking the current band.
- Row-like generated shape = the future DB lift (R4).

**Execution note:** Drift test first: parse → regenerate → byte-diff, so brief
edits always flow through the script.

**Patterns to follow:** `[T120] app/fp/content/parse-curriculum.ts`,
`build-path-content.ts`, `generated-drift.test.ts`; charset-nesting learning if
any id CHECK/regex is added.

**Test scenarios:**
- Happy path: parser yields exactly 25 criteria and 125 tasks with per-phase totals [25,26,24,25,25] (counts per criterion variable — 2.3 six, 3.4 four), mirroring T120's manifest assertion.
- Happy path: band variant present for authored bands; absent bands fall back to the base body (e.g. a task authoring only g3_5 + g9_12 serves g6_8 the body alone).
- Happy path: task 1.2.5 exists titled per the brief; hooks assembly attaches the sale auto-complete to it.
- Edge case: brief formatting quirks (bold markers, em-dash variants) parse or fail loudly — no silent truncation.
- Error path: hook referencing a nonexistent task id → build/test failure.
- Integration: existing 1.1/1.2 authored-field behavior (StepRunner inputs) unchanged after assembly swap.

**Verification:** SEMANTIC parity for 1.1/1.2 — same task count, same order,
same hooks/fields behavior, same done-state mapping. Surface wording changes
to the brief's canonical text and that is INTENDED (path.ts's current strings
paraphrase the brief); the drift test pins brief ↔ module.

- [ ] **Unit 5: Stable-key progress — `doneByTask` migration + remap machinery**

**Goal:** Progress keys move from `${stepId}#${index}` to task ids with a
one-time migrate-on-load, preserving every existing completion; the same
machinery consumes future remap tables.

**Requirements:** R3, R8

**Dependencies:** Unit 4 (task ids exist).

**Files:**
- Modify: `src/state/gameCore.ts` (SaveDoc optional `doneByTask`/`doneAt` by
  task id; `fromSaveDoc` migration; `isTaskDone`/`COMPLETE_TASK` read/write new
  keys), `src/lib/sync.ts` only if outbox entries carry keys
- Create: `src/data/taskRemap.ts` (the explicit old→new table; the initial set
  is EXACTLY the ten hand-authored entries `1.1#0..4 → 1.1.1..5` and
  `1.2#0..4 → 1.2.1..5` — the only keys that can legitimately exist under
  `PLAYABLE_STEPS`, verified aligned against both lists. ALL other legacy keys
  route to preserved-raw: the condensed lists beyond 1.2 do NOT align
  positionally with the brief — e.g. path.ts `1.3#3` is the brief's 1.3.5,
  not 1.3.4 — so no blanket `index+1` rule)
- Test: `src/state/__tests__/gameCore.test.ts`, `src/state/__tests__/migration.test.ts` (new)

**Approach:**
- Migrate-on-load inside `fromSaveDoc`: legacy `done` AND `doneAt` keys pass
  through the remap table into `doneByTask`/`doneAt`-by-id; legacy fields are
  retained untouched in the doc (old tabs keep working; the migration is
  idempotent and re-runnable).
- MERGE-on-load (union), not trust-on-load: completions are monotonic (a task
  never un-completes), so migration always UNIONS legacy-mapped completions
  into the new maps. This closes the stale-tab hole: an old tab that hydrates
  a migrated doc strips the new fields and saves without them, but its legacy
  `done` still carries every old-representable completion — the next
  new-code load re-unions. Completions done ONLY under new keys while an old
  tab overwrites are the residual exposure; the transition window is one tab
  cycle and the risk table carries it honestly.
- The remap table is behavior (it can flip criterion completion): migrating a
  completed 1.2 must not re-fire celebrations or the sale auto-complete —
  migration marks state, it never dispatches actions.
- Editorial rule from the origin doc documented at the top of `taskRemap.ts`:
  copy tweak = same id; meaning change = new id + remap entry (old retired).

**Execution note:** Test-first — pin the migration behavior with fixture docs
(fresh, legacy-complete, mixed, malformed) before touching `fromSaveDoc`.

**Patterns to follow:** additive-optional `chosenProvider` precedent;
remap-inherits-side-effects learning; DOC_VERSION/OUTBOX_VERSION lockstep note.

**Test scenarios:**
- Happy path: legacy doc with 1.1 fully done → `doneByTask` shows 1.1.1-1.1.5 done, criterion still complete, no celebration fired by loading.
- Happy path: fresh doc → no migration work, clean shape.
- Edge case: doc with both shapes (new-shape tab + old-shape tab interleaved) → new shape wins, nothing lost.
- Edge case: legacy key for an index that no longer exists → preserved raw, not displayed, criterion completion unaffected.
- Error path: malformed keys → dropped by coercion without failing the load.
- Integration: save → reload round-trip keeps both shapes stable byte-wise (idempotent).
- Integration: a future remap entry (A→B) moves completion to B exactly once across repeated loads.
- Error path: a legacy `1.3#3` key does NOT become `1.3.4` (preserved raw — the condensed lists don't align positionally).
- Integration: a Phase A `doneAt` timestamp for `1.1#2` lands on `doneAt["1.1.3"]`.
- Integration: stale-tab round trip — new-code save, old-code hydrate + save (new fields stripped), new-code load → legacy-representable completions all recovered by the union.

**Verification:** The Cedric save (real prod data) loads with all current
completions intact and the app on the new keys; origin criterion "edit copy
mid-cohort without progress shifting" demonstrated by a no-op reword deploy.

### Phase C — full-path playability (two delivery tiers)

Tier C1 (Units 6 + Unit 8's phases-1-3 surface) ships as the cohort nears
Phase 2 — per-idea engine, Build/Validate floors, idea switcher. Tier C2
(Unit 7 + Unit 8's promotion/Grow/Scale surface) lands separately, well before
any kid finishes Validate. If gameCore coupling makes the Unit 8 split
impractical, the implementer documents why and collapses to one release.

- [ ] **Unit 6: Generic phase engine in gameCore + selectors**

**Goal:** Retire `PLAYABLE_STEPS`; unlock/progress/next-up logic runs over the
full 25-criterion sequence, per idea for phases 1-3.

**Requirements:** R5, R6

**Dependencies:** Units 4, 5.

**Files:**
- Modify: `src/state/gameCore.ts` (sequence from generated content;
  `isStepUnlocked`/`nextUpFor`/`sellProgress` → phase-aware, per-idea),
  `src/state/floorSelectors.ts` (`nextCoachTarget`, `roomEntryFor`,
  progress labels phase-aware)
- Test: `src/state/__tests__/gameCore.test.ts`, `src/state/__tests__/floorSelectors.test.ts`

**Approach:**
- Criteria unlock linearly within a phase per idea; a phase (2, 3) unlocks for
  an idea when that idea completed the previous phase's five criteria; phases
  4-5 gate on the active business (Unit 7).
- The 1.2 sale auto-complete keeps working via the hooks registry (task-id
  addressed).
- XP totals and progress labels derive from the full sequence.

**Test scenarios:**
- Happy path: completing 1.5 for idea A unlocks 2.1 for idea A only; idea B still locked at its own frontier.
- Happy path: nextUpFor walks 1.1→3.5 in order per idea.
- Edge case: last criterion of phase 3 complete → next-up is promotion (not 4.1) until a business exists.
- Error path: criterion of a locked phase can't open via any entry path (roomEntryFor noop).
- Integration: real-sale ledger event still completes 1.2.5 for the active idea only when 1.2 is unlocked.

**Verification:** A scripted fresh save can be driven 1.1→3.5 in tests with no
dead end.

- [ ] **Unit 7: Idea ids, business list, explicit promotion**

**Goal:** Ideas carry stable ids; a validated idea can be explicitly promoted
to the (single active, archivable) business; Grow/Scale progress hangs off the
business.

**Requirements:** R5, R7

**Dependencies:** Unit 6.

**Files:**
- Modify: `src/state/gameCore.ts` (additive `id` on Idea, `businesses` list in
  state + SaveDoc, `PROMOTE_IDEA`/`ARCHIVE_BUSINESS` actions, phase 4-5
  progress keyed to business), `src/state/GameContext.tsx` (expose)
- Test: `src/state/__tests__/gameCore.test.ts`

**Approach:**
- Additive SaveDoc fields only; legacy ideas get minted ids on load (Unit 5's
  migration hook). `activeIdea` index stays for UI compatibility; promotion
  references idea id.
- One active business invariant enforced in the reducer; archive preserves the
  business row and its 4-5 progress; a later promotion starts a NEW business
  record (no progress inheritance). An `UNARCHIVE_BUSINESS` action restores an
  archived business as active when no other is active — kids mis-tap, and
  weeks of Grow/Scale progress must never be a one-way door. Archive itself
  requires an explicit confirm.
- Other ideas remain playable through phases 1-3 after promotion (origin
  decision).

**Test scenarios:**
- Happy path: idea completes 3.5 → PROMOTE_IDEA creates active business; 4.1 unlocks.
- Happy path: archive active business → 4-5 locked again until another validated idea promotes; archived record retains progress.
- Edge case: promoting while another business is active → refused (archive first).
- Edge case: promoting an idea that hasn't completed Validate → refused.
- Error path: legacy doc without businesses field loads clean (empty list).
- Integration: save round-trip preserves businesses + per-business done keys.

**Verification:** Reducer test drive 1.1→5.5 including promotion; archive +
re-promote leaves both business records intact.

- [ ] **Unit 8: UI generalization — floors, runner chrome, celebration, promotion screen, idea context**

**Goal:** The floor, HUD, Step Runner, and Celebration speak all five phases;
the child always sees which idea/business they're working on and can switch;
promotion is a real moment.

**Requirements:** R5, R6, R7; origin UI decisions.

**Dependencies:** Units 6, 7.

**Files:**
- Modify: `src/components/PhasesFloor.tsx` (unlock states + per-phase entry),
  `src/components/SellFloor.tsx` → generalized criterion floor per phase (or a
  parameterized sibling), `src/components/Hud.tsx` (current phase chip/colors),
  `src/components/StepRunner.tsx` (phase-aware header/colors/idea context line),
  `src/components/Celebration.tsx` (next-step across phase boundaries),
  `src/components/PodCardContent.tsx` (drop duplicated PHASE_UI, use PHASES),
  `src/screens/Factory.tsx` (promotion screen mount, idea switcher wiring)
- Create: `src/components/PromoteBusiness.tsx` + test
- Test: existing component test files + `src/components/__tests__/PromoteBusiness.test.tsx`

**Approach:**
- One criterion-floor component parameterized by phase (color/tint from
  `PHASES`); rooms without dialogs stay inert cards, StepRunner is the surface.
- StepRunner header shows phase name/criterion and the idea (or business) it
  belongs to; the existing picker pattern extends to Build/Validate entry.
- Floor IA (review decision): the Path renders the ACTIVE idea's progress
  with a compact idea-switcher chip (tap → picker); no row-per-idea stacking.
- Celebration's next-step map derives from the sequence (no `1.{n+1}` math).
- Promotion screen: smallest honest version — shown when (a) an idea completes
  3.5 (validated) AND (b) no active business exists; it persists as the
  next-up target until promoted or dismissed. Explicit confirm/cancel; the
  reducer refusal states (active business exists, idea not validated) are
  unreachable from this screen by construction (it only offers eligible
  ideas). Follows overlay conventions (full-screen <sm, floating ≥sm; state
  above the breakpoint mount).
- Locked criteria/phases extend the EXISTING locked-card treatment (the
  dashed "COMPLETE X FIRST" cards on today's floor) — no new locked visual
  language.
- Path completion (5.5 done): reuse the Celebration chrome with a distinct
  terminal message — no next-step CTA; the moment is designed, not invented
  ad hoc.
- Preserve `MobilePath` pb-80 and the lifted-intent contract throughout.

**Test scenarios:**
- Happy path: each phase floor renders its 5 criteria with that phase's colors; locked phases show locked states.
- Happy path: StepRunner on 3.2 shows Validate chrome + idea name; on 4.1 shows business name.
- Edge case: celebration after 1.5 points into phase 2; after 3.5 points at promotion; after 5.5 terminal state.
- Integration: switching idea mid-Build routes the runner to that idea's frontier (picker flow).
- Mobile: 390px screenshots of every changed surface — floors at full 25-criterion density, runner, promotion screen; zero horizontal overflow (CLAUDE.md gate).

**Verification:** Origin criterion — a tester account driven 1.1→5.5 through
the real UI on production with no dead end, verified at 390px and desktop.

- [ ] **Unit 9: Rollout, R20 update, and field verification**

**Goal:** Ship-order discipline holds, security records stay true, and the
origin's field-facing success criteria are demonstrated.

**Requirements:** R12, R14; origin success criteria.

**Dependencies:** All prior units.

**Files:**
- Modify: `docs/solutions/security-issues/r20-fp-child-session-reach-across-the-shared-supabase-project-accepted-exposure-2026-08-01.md`
  (feedback table + grade surface), `CLAUDE.md` only if the phase-engine
  architecture note needs a line
- Create: none expected

**Approach:**
- Deploy order enforced across units: T120 migrations + schema reload → T120
  routes → SPA (per the additive-column learning).
- Owner tasks tracked to done: consent-text verification/extension before
  cohort start (R14); the direct-access credential scope note (R12).
- Field checks: real-device stuck report (Unit 2 criterion), roster-band
  resolution (Unit 3 criterion), Cedric save intact (Unit 5 criterion).

**Test expectation: none** — process/documentation unit; verification is the
checklist above.

**Verification:** Every origin success criterion checked off against
production; R20 record reflects the new surfaces.

## System-Wide Impact

- **Interaction graph:** ADD_LEDGER's sale auto-complete now routes through the
  hooks registry; Celebration, Hud, coach target, and progress labels all
  re-derive from the phase engine — their tests are the parity net.
- **Error propagation:** feedback and grade writes inherit the outbox's
  retryable/terminal classification; grade route failures never block play
  (band defaults).
- **State lifecycle risks:** the save doc gains optional fields only; stale
  tabs writing legacy shapes remain safe (migration is idempotent,
  legacy-preserving). Outbox version untouched.
- **API surface parity:** `/api/fp/login` response grows `grade` — additive,
  old clients unaffected. New `/api/fp/grade` follows the fp route conventions.
- **Integration coverage:** cross-repo seams (RLS inserts, login grade, grade
  write-back) each carry an integration scenario in their unit; the child-session
  reach change is re-recorded in R20.
- **Unchanged invariants:** login/auth flow, signup flow, provider/ledger
  behavior (fees, revision CAS), the two-breakpoint layout system, and the
  256KiB doc cap all remain as-is; content for 1.1/1.2 renders from the new
  module but reads identically to today.

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Save-key migration corrupts real cohort progress | Med | High | Migrate-on-load with legacy fields preserved; fixture-first tests incl. the real Cedric doc shape; idempotency test; no DOC_VERSION bump |
| Brief parse drifts from the document (silent content loss) | Med | Med | Committed generated module + byte-diff drift test; loud parser failures |
| Behavior hooks dropped in the content swap | Low | High | Hooks registry keyed by task id with build-time existence assertion; explicit tests for 1.2.5 auto-complete and @artifact tasks |
| Feedback writes bypass rate limiting (direct PostgREST) | Med | Low | DB daily-cap trigger + length CHECK + append-only + RLS; 15-20 known kids |
| The120 work slips and blocks the cohort | Med | High | Phase A is small and independent; feedback client parks rows until the table exists (retryable classification) |
| Stale tab strips new save fields and overwrites | High | Med | Merge-on-load UNION recovers all legacy-representable completions; residual exposure is only new-key-only completions during one tab cycle; re-run field checks after tabs cycle (split-phase learning) |
| 25-criterion floor overwhelms 390px layout | Med | Med | Unit 8's density screenshots are a completion gate; two-tier breakpoint rule preserved |

## Documentation / Operational Notes

- Deploy order per phase: T120 migration (+ PostgREST schema reload) → T120
  routes → SPA build. Never the reverse.
- Owner pre-cohort checklist: consent text covers grade + feedback (extend if
  not); feedback read query saved; band spot-check on a roster child.
- After Phase C ships, the memory/CLAUDE.md note about "phases 2-5 locked" and
  the plan docs referencing `PLAYABLE_STEPS` are stale — update in Unit 9.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-08-03-full-path-cohort-readiness-requirements.md](../brainstorms/2026-08-03-full-path-cohort-readiness-requirements.md)
- Canonical content: `src/docs/first-profit-home-study-curriculum-brief.md`
- The120 content pipeline: `[T120] scripts/build-path-content.ts`,
  `app/fp/content/parse-curriculum.ts`, `app/fp/content/generated/program-2026-27.ts`
- Child-table template: `[T120] supabase/migrations/20260827120000_fp_player_tables.sql`
- Outbox/sync: `src/lib/sync.ts`; save doc: `src/state/gameCore.ts`
