---
title: "feat: Watchtower — staff flow board (throughput, cycle time, WIP)"
type: feat
status: active
date: 2026-08-05
revised: 2026-08-05
origin: docs/brainstorms/2026-08-05-watchtower-requirements.md
---

# feat: Watchtower — staff flow board (throughput, cycle time, WIP)

**Target repos:** `first-profit` (this repo — SPA Watchtower tab) and `120-The120`
(the API endpoint). Paths below are repo-relative; the120 paths are prefixed
`the120:`.

> ## ⚠️ REVISION NOTE — 2026-08-05: the design changed
>
> This plan was first written as a **per-child dashboard** (kid-level funnel,
> per-idea timelines, stuck list). The owner changed the design on 2026-08-05,
> AFTER Unit 1 shipped (commit `4b1ad98`) and Unit 2 was built and reviewed by
> six personas but not committed. Owner's words:
>
> > "I don't need to see every child and every row for every child. I need to
> > see unit task by unit task how many ideas went through that unit task, how
> > long it took to get through that unit task and how many ideas are now
> > sitting on that unit task. That's the Watchtower — a bird's eye view of what's
> > happening in the system. This is a simple table that should definitely fit.
> > We can then show only one phase at a time and one step / criterion at a time
> > so we are looking at only 5 unit tasks at any point. We should never be
> > showing the individual progress of individual children in the main page of
> > this view."
>
> **The Watchtower is a FLOW/QUEUE board — throughput, cycle time, and WIP per
> unit task — not a per-child export.** The unit of analysis is the IDEA, not
> the child.
>
> **What this means for work already done:**
> - **Unit 1 (`progress-rules.ts`, committed `4b1ad98`) largely SURVIVES.** The
>   defensive save-doc walk, original-index preservation, fail-closed narrowing,
>   prototype-key hygiene, timestamp clamping, docVersion gating, per-child caps,
>   the byte-identical refusal, the staff-role constant and the rate-limit keys
>   are all still correct and still needed. It needs two edits: drop `band` and
>   the child-authored `label` from the wire shape, and add filtering of the
>   returned maps to an explicit, caller-supplied task-id list.
> - **Unit 2 (route, built but UNCOMMITTED) survives structurally.** Auth gate
>   order, CORS, byte-identical 401 + header parity, rate limiting, `.range()`
>   paging, ORDER BY determinism, the one-clock rule and the audit breadcrumb are
>   all still correct. It needs the `families` read removed entirely and a
>   task-id-list parameter added.
> - **Units 3–5 are RE-SCOPED.** The kid-level funnel, per-idea timelines and
>   stuck list are SUPERSEDED as main-page surfaces. Unit 3 (shell/tabs) is
>   mostly unchanged; Units 4–5 become aggregate table math and the table UI
>   plus a named drill-down.
> - **The Unit 2 review findings are NOT invalidated.** They are carried into
>   the revised Unit 2 as required fixes.
>
> Sections not touched by the redesign — Context & Research, Institutional
> Learnings, the security posture, Sources — are deliberately left as written.

## Overview

A staff-only Watchtower tab on `/staff` showing a **flow board over the
curriculum**: one row per unit task, scoped to a single phase and a single
criterion at a time (~5 rows on screen), with three numbers per row —
**throughput** (how many ideas have completed that task), **median cycle time**
(how long an idea took to get from the previous task to this one), and **WIP,
split into ACTIVE and STALLED** (how many ideas are sitting on that task right
now, and how many of those have gone 30+ days without a completion). Backed by
a new staff-gated `GET /api/fp/progress` endpoint on the120 that walks each
child's save doc server-side and returns anonymised per-idea completion maps,
filtered to an explicit list of task ids the client asks for. No new client
tracking, no schema change.

The main table is **aggregate only — it never shows an individual child's
progress**. A named drill-down (clicking an active or stalled count) reveals
which usernames are in that bucket; that is the only surface where a name
appears, and drilling the stalled count is how staff find who to nudge.

## Problem Frame

Staff have no bird's-eye view of how work flows through the curriculum: which
unit task is the bottleneck, how long each one takes, and where ideas are piling
up right now. The north-star outcome (every kid reaches a first real sale within
~30 days) is a FLOW outcome — it is managed by finding the slow and clogged
steps, not by reading 17 individual timelines. The data already exists in
`fp_player_saves.doc` (per-task epoch-ms timestamps). See origin:
`docs/brainstorms/2026-08-05-watchtower-requirements.md` — note the origin doc
predates the 2026-08-05 redesign; where it and this plan disagree on VIEWS
(R5–R7), this plan governs.

## Requirements Trace

From the origin doc, as reinterpreted by the 2026-08-05 redesign:

- **Carried unchanged:** R1a (enumeration from `children`, left-joining
  profile → save, so a never-signed-in child still appears), R2 (security
  posture + re-derived role set), R3 (never-log + audit breadcrumb), R4
  (sibling tab), R8 (390px), R9 (view states), R11 (text fallbacks), R12 (no
  persistent client storage of cohort data).
- **R1 narrowed:** the wire shape drops `band` and the child-authored idea
  `label`; it keeps `username` (needed only by the drill-down) and the four
  completion maps, **filtered to an explicit list of task ids supplied by the
  caller** — the ~5 tasks on screen plus the one predecessor task.
- **R1b withdrawn:** no test-account exclusion in v1 (see Key Technical
  Decisions — `families.is_test` is a CRM flag, not an FP-enrolment flag).
- **R5–R7 SUPERSEDED** by the flow board: the kid-level funnel, per-idea
  timelines and stuck list are replaced by throughput / median cycle time / WIP
  per unit task. The underlying questions survive — "which task is bleeding
  kids?" is now "which task has the worst cycle time and the deepest queue?" —
  but no per-child row appears on the main page.
- **R10 reinterpreted:** interaction defaults now govern the phase/criterion
  selectors and the WIP drill-down rather than timeline dots and stuck-list
  sorting.

## Scope Boundaries

Carried from the origin doc: staff-only; read-only; no analytics infra; no
notifications; no grades/birth-years displayed. Revised by the 2026-08-05
redesign:

- **No per-child main-page surface.** Individual progress appears ONLY inside
  the WIP drill-down, and only as a username list. This is a hard boundary, not
  a v1 shortcut.
- **No band, no idea label anywhere.** Both leave the wire shape — band because
  no view segments by it, the label because it is child-authored free text
  (moderation surface + amplification vector).
- **One criterion per request, expressed as an explicit task-id list.** The
  endpoint returns only the ids the caller names, capped at 32; there is no
  whole-curriculum export. This replaces the origin doc's "full-cohort
  unpaginated response" accepted tradeoff — the payload is now proportional to
  ~6 task ids, not all 125.
- **No test-account exclusion.** All provisioned FP children count.
- Still out of scope: no `fp_ledger` reads; no rename of "suggestions"
  surfaces; no change to child-facing code paths.

## Context & Research

### Relevant Code and Patterns

- `the120: app/api/fp/suggestions/route.ts` + `suggestions-rules.ts` — the
  template: thin impure route + pure rules module ("no Next, no Supabase —
  only decisions"), CORS via `../login/login-rules` (`buildAllowedOrigins`,
  `checkOrigin`, `extractClientIp`), bearer/sub via `../grade/grade-rules`,
  atomic `checkAndRecordRateLimit` on user+IP buckets BEFORE DB I/O
  (release only on outage), two-half staff gate, byte-identical 401 minted
  once at module load from `SIGN_IN_FAILED_MESSAGE`, batched id-set reads
  (never PostgREST embeds — the fake-supabase harness can exercise them),
  value-free logs.
- `the120: app/api/fp/suggestions/__tests__/` — route tests via the
  fake-supabase harness (`app/api/fp/signup/__tests__/helpers/fake-supabase.ts`,
  fault injection keyed `"<op>:<table>"`); rules tests include a
  role-vocabulary parity test that parses the crm_core migration SQL and a
  byte-identical-refusal pinning test.
- `the120: app/fp/lib/fp-save-doc-guard-rules.ts` — the most complete
  defensive doc walker (ideas array cap, per-idea `fields`/`done`/`doneAt`/
  `doneByTask`/`doneAtByTask`, top-level `businesses`); the walking style to
  mirror.
- `the120: app/fp/lib/progress-core.ts` (`bandForGrade`) and
  `app/api/fp/grade/grade-rules.ts` (`resolveChildGrade` — birth-year wins
  over stored grade): band derivation authority. *(No longer used — band left
  the wire shape in the 2026-08-05 redesign. Kept here as the authority to
  consult if band ever returns.)*
- `src/screens/StaffSuggestions.tsx` + `src/screens/__tests__/StaffSuggestions.test.tsx`
  — the staff page state machine (signin/loading/refused/loadError/list),
  sessionStorage-only session, refresh-once-then-judge, noindex; test anatomy
  (jsdom pragma, real App mounted at `/staff`, seams mocked).
- `src/state/gameCore.ts` — doc shape authority: `Idea` (`fields.productName`
  / `fields.oneLiner`, legacy `done`/`doneAt` keyed `${stepId}#${index}`,
  stable `doneByTask`/`doneAtByTask`), `Business` (`ideaId?`, stable maps
  only), `CRITERION_SEQUENCE`, `fromSaveDoc`'s union rules (new shape wins;
  a timestamp without `done:true` never mints a completion;
  `legacy-idea-{index}` id minting).
- `src/data/taskRemap.ts` — `LEGACY_KEY_REMAP` (exactly ten entries,
  `1.1#0`…`1.2#4` → `1.1.1`…`1.2.5`); `TASK_REMAP` ships empty.
- `src/state/floorSelectors.ts` — idea label derivation precedent (but its
  helpers take `GameState`; the dashboard needs field-level equivalents).

### Institutional Learnings (docs/solutions/, both repos)

- PostgREST silently caps unranged selects at 1000 rows — paginate every
  cross-children read with `.range()` and refuse rather than truncate
  (`the120: docs/solutions/integration-issues/postgrest-max-rows-1000-*`).
- Keep refusal shape AND timing uniform; record the IP strike before any
  early return (`constant-response-is-not-constant-*`).
- Reuse the atomic check-and-record limiter; encode composite key segments
  (`in-memory-rate-limiter-toctou-*`, `composite-rate-limit-key-*`).
- Parse service-role rows (`doc` jsonb included) through a pure fail-closed
  narrowing module (`fail-closed-type-guard-*`).
- Assert the staff gate is actually wired — an enforcement test, not just a
  helper (`guard-function-with-no-callers-*`).
- Don't infer activity from `updated_at` (no-op re-writes refresh it); use
  in-doc completion timestamps, expect client-clock skew
  (`a-periodic-re-drive-*`).
- Completion maps are monotonic-union state; a doc read mid-convergence may
  transiently lack completions (`cas-full-doc-replace-*`).
- Breakpoint-crossing drops state local to a conditionally-mounted variant —
  keep tab/view state above any responsive conditional mount
  (`first-profit: docs/solutions/ui-bugs/breakpoint-crossing-drops-navigation-*`).

## Key Technical Decisions

### The flow model (2026-08-05 redesign)

- **The unit of analysis is the IDEA, not the child** (owner decision,
  2026-08-05). Every metric counts ideas: ideas that completed a task, ideas
  that are sitting on a task, the elapsed time an idea took between tasks. A
  child with three ideas contributes three units of flow. This is what makes
  the board a queue view rather than a roster.
- **Cycle time = per-idea elapsed from the PREVIOUS unit task's completion to
  THIS unit task's completion; report the MEDIAN** (owner decision,
  2026-08-05). The median is deliberate: at n=17 kids the mean is hostage to a
  single kid who left the tab open over a weekend. **KNOWN GAP (deferred):** the
  `Idea` interface in `first-profit src/state/gameCore.ts` carries NO creation
  timestamp — verified, it holds only `id`, `fields`, `done`, `doneAt`,
  `doneByTask`, `doneAtByTask`. The FIRST task in the whole sequence therefore
  has no predecessor stamp and its cycle time renders as **"—"**, permanently,
  for every idea. Adding an idea `createdAt` at creation time would close this
  for ideas created after that ships (it can never be backfilled). Recorded as a
  deferred item, NOT in this scope.
- **WIP ("sitting on") = the idea's NEXT INCOMPLETE task IS this task** (owner
  decision, 2026-08-05). Every live idea sits on exactly one task, so **the WIP
  column across the WHOLE curriculum sums to the number of live ideas** — a free
  correctness signal. Call it out in the UI and pin it in tests: if the visible
  criterion's WIP counts plus the counts outside the view do not total the live
  idea count, the next-incomplete walk is wrong. (Within a single criterion view
  the column sums to "ideas parked in this criterion", which is itself the
  useful queue-depth number.) **This column then SPLITS into active and stalled
  — see the WIP-split decision below**, which preserves the sum property.
- **The client aggregates; the server ships anonymised per-idea completion
  maps** (owner decision, 2026-08-05). The SPA already owns every piece of
  task-order domain knowledge — `CRITERION_SEQUENCE`, `TASK_REMAP`,
  `LEGACY_KEY_REMAP`, the generated path content. Aggregating server-side would
  duplicate all of it into the120 and create a permanent cross-repo drift risk
  (the ordering could disagree between repos with no test able to see both).
  The server stays a defensive extractor.
- **The wire shape DROPS `band` and the child-authored `label`** (owner
  decision, 2026-08-05). No view segments by band, so band is pure exposure.
  The label is child-authored free text: shipping it to a staff screen creates a
  moderation surface and an amplification vector for whatever a kid typed, for
  zero flow value. It KEEPS `username`, because of the next decision.
- **A named drill-down, and only there** (owner decision, 2026-08-05): the main
  table is aggregate-only, but clicking a task's **active or stalled** count
  reveals WHICH usernames are in that bucket — that is how "who needs a nudge
  today?" survives the redesign (drilling STALLED is the direct replacement for
  reading the old stuck list). **The client must never render a username until
  the user drills in.** Usernames are in the payload from the first load (no
  second request), so this is a rendering discipline the component tests must
  pin. **Scope decision (2026-08-05): the drill-down covers the active and
  stalled counts ONLY, not throughput.** Extending it to "who completed this
  task" is a deliberate future option, not an oversight — throughput is a
  historical count with no action attached to it, so naming those children buys
  exposure without buying a decision.
- **No test-family exclusion in v1** (owner decision, 2026-08-05) — drop the
  `families.is_test` join entirely. **This is the most important lesson in the
  revision.** `is_test` is a **CRM/nurture-visibility flag, not an FP-enrolment
  flag**: `the120: app/crm/lib/test-family-filter.ts` declares itself "the ONE
  place" that rule lives, `signup-core.ts` uses it to suppress parent email, and
  `the120: scripts/provision-fp-cohort.ts:19` records that provisioning "NEVER
  stamps families.is_test — Owner decision (2026-08-04): these are real". Wiring
  the Watchtower to it would have created a silent trap: someone stamping
  `is_test` on a REAL beta family purely to stop nurture mail would have
  silently deleted those children from the dashboard, with no error and no way
  to notice. Two independent meanings must not share one column. If test-row
  skew ever becomes a real problem, the fix is an explicit FP-scoped marker,
  not a re-use of this one.
- **The request carries an EXPLICIT LIST of task ids** (owner decision,
  2026-08-05; refined 2026-08-05 from an earlier criterion-prefix design). The
  client sends exactly the ids it wants — the ~5 tasks on screen PLUS the one
  predecessor task id — and the server returns stamps for exactly those ids and
  nothing else.

  **Why the list beats prefix-filtering, which this replaces.** The earlier
  design had the server filter by criterion prefix (`"1.1.1"` belongs to
  `"1.1"`) and infer each idea's predecessor as "the highest-stamped key outside
  the criterion". That inference is UNSOUND: verified in
  `first-profit src/state/gameCore.ts`, `COMPLETE_TASK` → `markTaskDone` has NO
  predecessor guard — ordering is enforced by the UI's unlock logic, not by the
  data, and the save doc is child-writable directly via PostgREST. Out-of-order
  stamps are therefore POSSIBLE in the data, and "highest stamp outside" would
  silently pick the wrong predecessor and produce a wrong cycle time with no
  symptom. The explicit list is better on every axis: the predecessor is EXACT
  because the client reads it from `CRITERION_SEQUENCE`; the server needs no
  prefix logic and still holds ZERO sequence knowledge (it honours a list); the
  payload is ~6 values per idea; and it degrades safely when tasks are completed
  out of order.

  **Guards (the id list is REQUEST INPUT and therefore untrusted):** cap the
  number of requested ids — 32, generous for a 5-task view — and refuse past it,
  so a caller cannot ask for the whole curriculum and reconstruct the old
  full-cohort export. Validate that every id is well-formed before use. The list
  must NEVER reach a log line (R3 covers credentials and doc contents; this
  extends it to caller-supplied ids). A malformed, oversized or duplicated list
  is handled by the **same 400-class exception already recorded for the
  criterion parameter** — it must not widen the byte-identical-401 refusal
  contract, and the two parameter-validation paths must behave identically so
  there is one rule, not two.
- **WIP splits into ACTIVE and STALLED** (owner decision, 2026-08-05). An idea
  abandoned months ago would otherwise sit in a WIP count forever and drift
  every number upward. So: an idea whose most recent completion is **30+ days
  old counts as STALLED, not sitting**, and the board shows BOTH numbers per
  unit task — "sitting (active)" and "stalled".
  - The sum-check becomes **`active + stalled == live ideas`** — still fully
    self-checking. This remains the free correctness signal on the
    next-incomplete walk; splitting the column does not weaken it, because every
    live idea still lands in exactly one bucket on exactly one task.
  - **The stalled column is the deliberate surviving trace of the old stuck-list
    concept.** The redesign removed the stuck list as a per-child surface; this
    is where that signal lives on, in aggregate. Drilling a stalled count (see
    the drill-down decision above) is how staff find who to nudge — the stuck
    list's actual job, now reached through the flow board instead of a separate
    view.
  - **30 days is a named, test-pinned constant**, not a literal at a call site.

### Carried forward from the original plan

- **Endpoint: `GET /api/fp/progress`**, files
  `the120: app/api/fp/progress/{route.ts, progress-rules.ts}` — file-for-file
  mirror of the suggestions split, own rate-limit namespace
  (`fp-progress:`), own page-cap posture.
- **Rate-limit budgets** (resolves the origin doc's sizing question): start
  from the suggestions numbers for user and IP buckets — a normal daily
  check is two authenticated GETs per `/staff` visit (suggestions +
  progress) plus at most one retry, which fits those windows with an order
  of magnitude of headroom; the unit test pins the budget constants so any
  future tightening is a deliberate edit. The limiter doubles as the
  endpoint's server-side cooldown (no client polling exists to pace it).
- **`PROGRESS_ALLOWED_STAFF_ROLES` is its own constant with its own parity
  test, currently `["admin"]`** — identical membership to suggestions today.
  This satisfies R2's "deliberately re-derived" while keeping the client's
  401-means-not-staff semantics coherent across tabs (flow analysis showed a
  per-endpoint role divergence would force a per-tab "no access" state and
  break the shared signout-on-refusal logic). If the sets ever diverge, the
  client work is a per-tab refusal state — deferred until real divergence.
- **Server sends raw maps, client owns semantics**: per idea, all four maps
  (`done`, `doneAt`, `doneByTask`, `doneAtByTask`) pass through raw
  (defensively narrowed); per business, both stable maps. The client applies
  the union/remap rules and all view math — the server stays free of
  task-id domain knowledge (origin decision, confirmed against
  `fromSaveDoc`'s exact union rules). **Revised 2026-08-05:** the maps are now
  filtered to the caller's EXPLICIT TASK-ID LIST before they go on the wire (see
  above); honouring a list is set membership, not sequence knowledge, so the
  domain-free property holds — more cleanly than the prefix design it replaces,
  which encoded the id-naming scheme into the server.
- **The union rule is EXPORTED from gameCore, not replicated** (review
  decision, 2026-08-05): extract `fromSaveDoc`'s per-idea map-union +
  done-gating + `resolveTaskId` routing into an exported pure helper in
  `src/state/gameCore.ts` (or `src/data/taskRemap.ts`) and import it in the
  dashboard — the `unionCompletionMaps` "lives in gameCore, re-exported by
  sync.ts" precedent. Behavior-neutral refactor covered by gameCore's
  existing tests; removes the plan's former top drift risk by construction.
- **Legacy-machinery pre-flight** (review decision, 2026-08-05): before
  implementing the legacy pass-through, run ONE service-role query over cohort
  save docs for legacy `${stepId}#${index}` keys and
  `done:true`-without-timestamp completions. The cohort went live 2026-08-04,
  after the stable-id migration, so docs are plausibly all clean. If clean: drop
  the legacy wire pass-through and the untimestamped-completion handling — and
  RECORD the verification in this plan. If not clean: build as planned.
  **Revised 2026-08-05:** in the flow board an untimestamped completion is
  worse than a cosmetic footnote — it counts toward throughput and WIP but
  CANNOT contribute a cycle time (there is no stamp to subtract), so it must be
  excluded from the median rather than counted as zero. That makes the
  pre-flight more valuable, not less: a clean cohort deletes a whole class of
  math.
- **Band is DROPPED from the wire shape** (owner decision, 2026-08-05 — see
  above). `bandForChildRow` in the shipped `progress-rules.ts` becomes dead
  code; delete it, along with the `resolveChildGrade`/`bandForGrade` imports and
  their tests, unless something else in the module still needs them. Note the
  original decision (band = `resolveChildGrade` → `bandForGrade`, birth-year
  wins) was correct on its own terms — it is removed because no view segments by
  band, not because it was wrong.
- **Test-account exclusion is REMOVED, not deferred** (owner decision,
  2026-08-05 — full rationale above). The `families` read, the parent→family
  join, the fail-open join policy, the `merged_into_id` handling and the
  `.not("is_test","is",true)` idiom all leave Unit 2. The harness work to
  support `not(col,"is",<bool>)` is no longer required by this feature (keep it
  if already landed and independently tested; it is a fine harness improvement).
- **Session machinery moves to a shared staff shell** with single-flight
  refresh. Precise rationale (corrected in review): GoTrue's refresh-token
  reuse interval already tolerates NEAR-simultaneous duplicate refreshes;
  the shell's single owner + one in-flight refresh promise prevents the
  concurrent-401 double-refresh case cheaply and keeps both tabs consistent.
  Known residual (recorded, not solved): duplicating the browser tab copies
  sessionStorage into a separate JS realm no in-page mechanism can
  coordinate — a delayed reuse there can revoke the token family and sign
  both windows out. Nuisance-level (re-login), accepted for v1.
- **Cohort data cached in the shell, keyed to the session, dropped on any
  signout/refusal** (satisfies R12 + the flow analysis sign-out finding);
  manual refresh button rather than polling — no client interval, and the
  route still has its own server-side cooldown via the rate limiter.
- **All duration math in epoch ms** (DST-free), with future-skewed stamps
  clamped to fetch time before any subtraction. A clamped pair can yield a
  NEGATIVE elapsed (this task stamped earlier than its predecessor — clock skew
  across devices, or an out-of-order save); such a pair is DROPPED from the
  median sample rather than clamped to zero, and the row reports the sample
  size so a thin median is visible as thin. Note that out-of-order saves are
  genuinely possible (`markTaskDone` has no predecessor guard), so this is a
  real path, not a paranoid one.
- **The median is SURVIVORSHIP-BIASED, and that must be stated wherever it is
  read** (recorded 2026-08-05). Cycle time is computed only over ideas that
  ACTUALLY COMPLETED the task. Ideas deleted or abandoned before completing it
  contribute nothing — and the slowest ideas are the likeliest to be abandoned,
  so **the median systematically UNDERSTATES real difficulty**. The stalled
  column is the partial counterweight (it counts precisely the ideas the median
  cannot see) and must be read alongside it. This is a property of the metric,
  not a defect to fix; the obligation it creates falls on the COPY — Unit 5 must
  never present the median as "how long this task takes" without that context.
- **Untimestamped completions** (`done:true`, no stamp — pre-timestamp play):
  they COUNT toward throughput and toward the next-incomplete walk (so WIP is
  right), but they contribute NO cycle-time sample — neither as this task's
  stamp nor as the next task's predecessor. Never counted as a zero-duration
  sample; that would silently drag the median down.
- **Next incomplete task is computed PER IDEA** (revised 2026-08-05 — the old
  "derive the kid's next task from the idea with the most recent completion"
  rule is superseded). Each idea walks the task order independently and lands on
  exactly one task; that is what makes the WIP column sum correctly.
- **Idea deletion is accepted non-monotonicity**: `DELETE_IDEA` erases
  progress; throughput counts can drop day-over-day and the WIP total shrinks;
  staff copy must not imply monotonicity. A business with a dangling/absent
  `ideaId` contributes its Phase 4–5 completions to no idea's flow — it is
  counted as its own flow unit (an idea-less business row's tasks are outside
  Phase 1–3 criteria anyway, so it only ever affects late-phase views).
- **Id hygiene replicated client-side**: the dashboard does not run
  `fromSaveDoc`, so it mints `legacy-idea-{index}` for id-less ideas
  identically and, on duplicate ids, renders both rows keyed by index —
  never merges or drops.

## Open Questions

### Resolved During Planning

- Role set divergence vs. shared: own constant, same membership (above).
- Refetch vs. cache on tab switch: shell-cached per session + manual
  refresh (above), now keyed by selected criterion.
- Boolean maps in the response: yes (a throughput count computed from
  timestamps alone would miss pre-timestamp completions).
- Rate-limit sizing (origin doc question): suggestions-level budgets give
  order-of-magnitude headroom over the two-GETs-plus-retry daily check;
  constants pinned by test (see Key Technical Decisions).
- Union-rule ownership: exported gameCore helper, not replication (user
  decision, 2026-08-05).
- Legacy machinery: verify-first pre-flight with conditional simplification
  (user decision, 2026-08-05).

### Resolved by the 2026-08-05 redesign

- Unit of analysis: the IDEA (owner decision).
- Cycle time definition + median, and the missing-`createdAt` gap (owner
  decision; the gap is deferred, not solved).
- WIP definition = next-incomplete-task, and its sum-check property (owner
  decision).
- Where aggregation happens: client (owner decision).
- Band and idea label: removed from the wire (owner decision).
- Test-family exclusion: removed entirely (owner decision).
- Request scoping: the client sends an EXPLICIT task-id list (~5 tasks + the one
  predecessor); the server honours the list and holds no sequence knowledge
  (owner decision; refined from an earlier prefix-filter design after verifying
  that `markTaskDone` has no predecessor guard, so out-of-order stamps are
  possible and an inferred predecessor would be unsound).
- WIP splits into ACTIVE and STALLED at a test-pinned 30-day threshold; the
  sum-check becomes `active + stalled == live ideas` (owner decision).
- The stalled column is the surviving trace of the old stuck list; drilling it
  is how staff find who to nudge (owner decision).
- Survivorship bias in the median is a recorded property with a copy
  obligation, not a defect to engineer away (recorded).
- **Phase/criterion selector stays TWO-LEVEL** — phase first, then
  step/criterion — matching the owner's "one phase at a time and one
  step/criterion at a time" (decision, 2026-08-05). Resolves the earlier
  ambiguity about whether a flat criterion picker would do.
- **The drill-down is scoped to the active and stalled counts ONLY**, not
  throughput (decision, 2026-08-05). Extending it later is a deliberate future
  option, not an oversight.
- View composition: SUPERSEDED — no longer a stacked three-view page. One table,
  one phase and one criterion at a time.

### Deferred to Implementation

- Exact response-size posture: the explicit id list bounds this by construction
  (≤32 ids × ideas, ~6 values per idea in practice), but still confirm real
  payload size in tests and enforce the aggregate byte budget (Unit 2 finding).
- Whether the selector DEFAULTS to "the criterion with the deepest queue" or
  simply to the first criterion of Phase 1 — the two-level STRUCTURE is settled
  (above); only the default landing spot is open. Recommend the first criterion
  of Phase 1 for v1 (deterministic, testable, no hidden ranking); revisit once
  staff have used it.
- Copy for all new staff-facing strings (follows `STAFF_COPY` one-object
  convention), including how "—" for an absent cycle time is explained inline
  so it does not read as a bug.
- The legacy pre-flight query result (determines whether Units 1/4/5 carry
  or shed the legacy/untimestamped machinery — record the outcome in this
  plan either way).
- Whether `fromSaveDoc` compacts malformed idea entries the same way the
  server walk would (settles the index-minting question; the server
  preserving original indices sidesteps it regardless).
- **Deferred beyond this plan:** adding `createdAt` to `Idea` in
  `src/state/gameCore.ts` so the FIRST task in the sequence can report a cycle
  time. Forward-only — it can never be backfilled for existing ideas. Not in
  this scope; recorded so the "—" in row 1 is understood as a known gap with a
  known fix, not an unexplained blank.

**A note on size:** the roadmap labels this project "small"; the five-unit,
two-repo footprint here is driven by house style (rules/route split,
fake-supabase route tests, pure-helper view math, the PP2 full-review
convention), not scope growth — the deliverable is still one endpoint + one
tab. The redesign made it SMALLER: one table replaces three views, and the
`families` join, band derivation and label plumbing are all deleted.

## Implementation Units

- [x] **Unit 1: `progress-rules.ts` — pure contract + doc walk (the120)**
  — **SHIPPED (commit `4b1ad98`), REVISION REQUIRED (see Unit 1R)**

**Goal:** Every decision the endpoint makes, as a pure module: role
constant, rate-limit keys, refusal shape, and the fail-closed save-doc walk
producing the wire shape.

**Requirements:** R1, R1a, R2 (pure halves), R3 (username never in any
thrown/logged string).

**Dependencies:** None.

**Files:**
- Created: `the120: app/api/fp/progress/progress-rules.ts`
- Test: `the120: app/api/fp/progress/__tests__/progress-rules.test.ts`

**What shipped and SURVIVES the redesign — do not re-litigate:**
`PROGRESS_ALLOWED_STAFF_ROLES` + `isAllowedProgressStaffRole` with the
migration-SQL parity test; `deriveProgressRateLimitKeys` (`fp-progress:`
namespace, encoded segments, total over its inputs); `shapeProgressRefusal`
with the module-load byte-identical body and the pinning test; the fail-closed
`walkSaveDoc`/`walkIdeas`/`walkBusinesses` defensive walk mirroring
`fp-save-doc-guard-rules.ts`; **original-index preservation** for skipped
malformed idea entries (`placeholderIdea`) — load-bearing for client-side
`legacy-idea-{index}` minting and `Business.ideaId` links; prototype-key
hygiene (`isUnsafeMapKey`); timestamp clamping to
`PROGRESS_MAX_TIMESTAMP_MS`; `PROGRESS_DOC_VERSION` gating; the per-child caps
(`PROGRESS_IDEAS_CAP`, `PROGRESS_BUSINESSES_CAP`, `PROGRESS_MAP_ENTRIES_CAP`)
and the truncation budget.

- [ ] **Unit 1R: `progress-rules.ts` revision — anonymise + criterion filter (the120)**

**Goal:** Bring the shipped rules module to the flow-board wire shape: no band,
no label, and maps filtered to an explicit, validated, caller-supplied task-id
list.

**Requirements:** R1 (narrowed), R3.

**Dependencies:** None (Unit 1 is committed).

**Files:**
- Modify: `the120: app/api/fp/progress/progress-rules.ts`
- Modify: `the120: app/api/fp/progress/__tests__/progress-rules.test.ts`

**Approach:**
- Remove `band` from `ProgressChild` and delete `bandForChildRow` together with
  the `resolveChildGrade`/`bandForGrade` imports and their tests — unless another
  caller appears in a grep of the120; there should be none.
- Remove `label` from `ProgressIdea`; delete `deriveIdeaLabel`,
  `PROGRESS_LABEL_MAX_CHARS` and `trimmedOrNull` if nothing else uses them. Keep
  the idea `id` and the preserved original index. Wire shape becomes per child
  `{ username, ideas: [{ id, index, done, doneAt, doneByTask, doneAtByTask }],
  businesses: [{ id, ideaId, doneByTask, doneAtByTask }] }`.
- Add `filterMapsToTaskIds(maps, taskIds)`: a PURE, sequence-free SET-MEMBERSHIP
  filter. It keeps exactly the requested ids and drops everything else. It holds
  no notion of criteria, prefixes, ordering, or "predecessor" — the client
  already put the predecessor id in the list, so the server cannot get it wrong.
  Match legacy keys (`${stepId}#${index}`) by exact string too; the client sends
  whichever form it wants.
  - Also emit, per idea, `lastCompletionAt`: the maximum stamp across the idea's
    WHOLE map, computed BEFORE filtering. This is a single number (not a task
    id) and is required for the active/stalled split — the 30-day recency test
    must consider completions outside the requested window, or an idea working
    happily in a later criterion would be misread as stalled. One number is a
    deliberately minimal disclosure compared to shipping the unfiltered map.
  - Emit `hasCompletionsOutsideRequest` (boolean) so the client can account for
    ideas parked outside the visible window in the sum-check without receiving
    their task ids.
- Add `deriveRequestedTaskIds(raw)` (pure) replacing the earlier
  `deriveCriterionId`, which is **no longer needed server-side** — the server no
  longer reasons about criteria at all. It parses the caller's list and returns
  null (a refusal) unless ALL hold: it is a non-empty array of strings; length
  ≤ `PROGRESS_MAX_REQUESTED_TASK_IDS` (**32** — generous for a 5-task view, and
  the guard that stops a caller reconstructing the old full-cohort export by
  asking for all 125); every id is well-formed against a conservative pattern
  and within `PROGRESS_MAP_KEY_MAX_CHARS`; no duplicates. **The list is REQUEST
  INPUT and therefore untrusted**: it must never appear in a log line (extends
  R3 beyond credentials and doc contents to caller-supplied ids), and it must be
  de-duplicated before use so a caller cannot inflate work with 32 copies of one
  id.
  (The 30-day active/stalled threshold is NOT defined here — the split is
  computed entirely client-side, so its constant lives in Unit 4. The server's
  only contribution is `lastCompletionAt`. Deliberately not duplicated across
  repos: a threshold defined twice is a threshold that will drift.)
- Add a **key-length cap** to the narrowers (open review finding): a map key
  longer than `PROGRESS_MAP_KEY_MAX_CHARS` (propose 64 — real ids are ~7 chars)
  is dropped and counts against the truncation budget. A child can otherwise pad
  keys to kilobytes each and evade the per-entry caps.

**Patterns to follow:** the module's own existing header-comment discipline and
narrowing style; `fail-closed-type-guard` solution doc.

**Test scenarios:**
- Happy path: doc with tasks across three criteria + a 6-id list requested →
  exactly those 6 ids survive, including the predecessor id from the PRECEDING
  criterion; every other key is dropped.
- **Soundness regression (the reason this design replaced prefix-filtering):**
  an idea with an OUT-OF-ORDER stamp — a later task stamped earlier than the
  requested predecessor — still returns the requested predecessor's own stamp,
  not the highest one. Assert against a fixture the old heuristic would have
  gotten wrong.
- Edge: requested ids with no completions for an idea → empty maps, idea still
  present with `lastCompletionAt` set from OUTSIDE the window (an idea working in
  a later criterion must not vanish and must not look stalled).
- Edge: `lastCompletionAt` is computed before filtering — a doc whose only
  stamps are outside the requested list still reports a real recency, not null.
- Edge: legacy `1.1#0` requested explicitly → retained raw.
- Edge: `deriveRequestedTaskIds` rejects — empty array; non-array; array
  containing a non-string; 33 ids (one past the cap); duplicates; an id of
  `"__proto__"`; a 10KB id; `"1.2.3 "` with whitespace; `"1.2.3%00"`. Accepts a
  valid 1-id and a valid 32-id list (both cap boundaries pinned).
- Privacy: a refusal produced from a bad id list carries no echo of the input —
  assert the thrown/returned value never contains any submitted id.
- Edge: map key of 5000 chars → dropped, truncation budget flagged.
- Regression: no field named `band` or `label` appears anywhere in the shaped
  output — assert by deep key-walk over a fixture, not by eyeballing the type,
  so a future re-add fails loudly.
- Retained: every existing Unit 1 test still passes except those asserting band
  and label, which are deleted with their features.

**Verification:** Rules tests pass; module imports nothing from Next or
Supabase; `grep -r bandForChildRow` in the120 returns no callers.

- [ ] **Unit 2: `GET /api/fp/progress?tasks=<id,id,…>` route (the120)**
  — **BUILT BUT UNCOMMITTED; survives structurally, revise before committing**

**Goal:** The staff-gated, task-scoped endpoint, wired exactly like
suggestions, reading children → profiles → saves with pagination and logging
the audit breadcrumb.

**Requirements:** R1 (narrowed), R1a, R2, R3.

**Dependencies:** Unit 1R.

**Files:**
- Modify (uncommitted work in tree): `the120: app/api/fp/progress/route.ts`
- Modify: `the120: app/api/fp/progress/__tests__/route.test.ts`
- Modify: `the120: app/api/fp/signup/__tests__/helpers/fake-supabase.ts` (+ its
  new `fake-supabase.test.ts`)

**What is already built and SURVIVES — do not rebuild:** the suggestions gate
order (OPTIONS/origin → bearer → unverified sub → atomic strikes on both
buckets before DB I/O → `getUser` → claim half → staff row half → reads →
shape → 200), the whole-body try/catch into the byte-identical 401, CORS header
parity across refusals, `.range()` paging with refuse-on-cap, deterministic
`ORDER BY`, the one-clock rule, and the value-free audit breadcrumb
(`[fp/progress] served <staffUserId> at <iso>`; known limit: Vercel log
retention is short, so this satisfies R3's letter but is not long-term
forensics).

**Changes required by the redesign:**
- **Remove the `families` read and the entire test-family exclusion** — the
  parent→family join, the fail-open policy, `merged_into_id` handling, the
  `.not("is_test","is",true)` filter, and their tests (see Key Technical
  Decisions for why this is deletion, not deferral). Reads reduce to:
  `children` where `fp_username` not null → `fp_player_profiles` by child-id
  set → `fp_player_saves` by profile-id set.
- **Accept and validate `?tasks=`** (a comma-separated id list) via Unit 1R's
  `deriveRequestedTaskIds`. A missing, malformed, duplicated or oversized list
  (>32 ids) is a **400 with a generic body**, not the byte-identical 401 — it is
  a client bug, not an authorization signal, and conflating them makes the
  endpoint undebuggable. Validate it AFTER the staff gate so an unauthenticated
  caller cannot probe which ids exist (no oracle), and BEFORE any DB read so a
  bad request costs nothing. **This is the SAME 400-class exception already
  recorded for parameter validation — there is one rule for all request-input
  refusals, not two.** The 400 body is generic and MUST NOT echo any submitted
  id; the ids must not reach any log line (they are untrusted request input).
- **Response shape follows Unit 1R** (no band, no label, maps filtered to the
  requested ids, plus `lastCompletionAt` and
  `hasCompletionsOutsideRequest` per idea).

**Required fixes from the six-persona review of the built route** — all still
valid after the redesign; every one must land before this unit is committed:
1. **Row-cap refusal must not release rate-limit strikes.** It is a
   deterministic refusal, not an outage. Widen the read result to distinguish
   `outage` from `too_many_rows` and release strikes only on `outage`. (Found
   independently by three reviewers.)
2. **No timeouts on any DB call.** The repo already has `withFwTimeout` in
   `the120: app/fp/lib/fw-call.ts`, and `app/crm/lib/auth.ts` documents this
   exact hazard. Wrap every read; add an explicit `maxDuration` to the route.
3. **`readAllPages` derives `from` from the page INDEX**, so a server max-rows
   SMALLER than the page size silently truncates AND skips rows. Empirically
   reproduced: maxRows 500 + 1200 children returned 200 with 500 children. Fix:
   derive `from` from `rows.length`.
4. **The "PROGRESS_PAGE_SIZE measured against production" comment is an
   INHERITED claim**, not a measurement this work performed. Reword to attribute
   the 2026-07-24 solution doc and state it as an assumption.
5. **`PROGRESS_MAX_ROWS` boundary is inconsistent:** `readAllPages` refuses AT
   the cap, `readByIdSet` accepts exactly the cap. Make them agree and match the
   docstring.
6. **Per-child caps do not bound the AGGREGATE response.** Add a cohort byte
   budget. Less critical now that requests are criterion-scoped, but still
   required — the caps are per child and the cohort is unbounded.
7. **Prefer keyset paging** (`.gt('id', lastSeenId)`) over offset paging: offset
   paging can skip or duplicate rows across pages on a live table, and every
   order key here is already unique.
8. **Move the constants to the rules module.** `PROGRESS_PAGE_SIZE`,
   `PROGRESS_MAX_PAGES`, `PROGRESS_MAX_ROWS`, `PROGRESS_ID_CHUNK` currently live
   in the route; house convention puts caps in the `*-rules` module (the sibling
   puts `SUGGESTIONS_PAGE_CAP` in the rules file).

**Harness extension (explicit work item):** `.range(from,to)` with a
configurable max-rows cap (so refuse-on-cap and finding 3 are testable), plus
its own tests. `not(col,"is",<bool>)` is **no longer needed by this feature**
(the `families` read is gone) — keep it only if already landed and independently
tested. Two harness-fidelity gaps to record and address:
- The fake returns **insertion order** for unordered selects, which is gentler
  than Postgres — an untested `.order()` therefore passes locally and could
  scramble in prod.
- The fake returns an **empty page past the end**, where real PostgREST may
  return **416 / PGRST103**. The route requests exactly that page whenever a
  count is an exact multiple of the page size — a live-cohort landmine. Teach
  the harness to emit the 416 shape and handle it in the route.

**Execution note:** Test-first for each new behavior; the `tasks` parameter
and the eight fixes above each want a failing test before the change.

**Patterns to follow:** `suggestions/route.ts` (gate order, CORS headers,
log discipline), `suggestions/__tests__/route.test.ts` (harness anatomy:
mock admin → `fakeClient(store)`, mock parent-token getUser, mock
rate-limit store, dynamic-import route).

**Test scenarios:**
- Happy path: staff token + `?tasks=1.1.5,1.2.1,1.2.2,1.2.3,1.2.4,1.2.5` +
  seeded store → 200 with shaped body, maps containing exactly those ids;
  includes a never-signed-in child (children row, no save row) with empty ideas.
- Happy path: response contains NO `band` and NO `label` key at any depth, and
  no task id the caller did not request.
- Error paths: missing token, undecodable sub, non-staff child token,
  inactive staff row, disallowed row role → all byte-identical 401; bad
  origin → 403 with no CORS echo; OPTIONS → 204 for allowed origin.
- Error path: missing/malformed/duplicated `tasks` from an AUTHENTICATED staff
  caller → 400, generic body, zero DB reads. From an UNAUTHENTICATED caller →
  the same byte-identical 401 as any other refusal (no oracle).
- **Error path (exfiltration guard): 33 task ids → 400, zero DB reads.** This is
  the control that prevents a caller reconstructing the old full-cohort export;
  pin the boundary (32 accepted, 33 refused) so relaxing the cap is a deliberate
  edit.
- Error path: the 400 body echoes NO submitted id, and no log line emitted on
  any path contains a submitted id — assert over captured console output, not by
  inspection.
- Error path: rate-limited (either bucket) → same 401; DB outage on each
  read site → 401 + strikes RELEASED (fault injection per table).
- Error path (review fix 1): row-cap exceeded → 401 and strikes NOT released;
  assert the release function was not called, distinctly from the outage case.
- Error path (review fix 2): a read that never settles → the timeout fires and
  the route refuses rather than hanging to the platform limit.
- Edge (review fix 3): harness max-rows SMALLER than the page size → the route
  refuses; assert it never returns 200 with a short cohort. This is the
  regression test for the reproduced skip-and-truncate bug.
- Edge (review fix 5): exactly `PROGRESS_MAX_ROWS` rows → both read paths agree,
  and agree with the docstring.
- Edge (review fix 6): a cohort whose shaped body exceeds the byte budget →
  refuses rather than serving.
- Edge: strike recorded before any refusal early-return (assert limiter
  called before admin reads on the not-staff path).
- Integration: staff-gate enforcement test — the route refuses when the
  claim half passes but the row half fails, and vice versa (the
  "guard-with-no-callers" lesson).
- **Test-suite gaps to close (from review — each currently lets a mutant live):**
  - id-chunking is never exercised with MATCHING rows: seed more than
    `PROGRESS_ID_CHUNK` ids with real matches (two chunking mutants survive today).
  - the aggregate cap is dead code to the suite — exercise it (covered above).
  - rate-limit bucket KEYS and BUDGETS are unpinned: swapping the user and IP
    configs currently passes. Pin both key strings and both budgets.
  - `releaseStrikes` releasing only ONE bucket currently passes. Assert both.
  - deleting all four `.order()` calls currently passes. Pin determinism —
    which requires the harness ordering-fidelity fix above to be meaningful.
  - header parity omits three refusal reasons — assert parity across ALL of them.
  - the outer catch-all is untested — inject a throw from the shaping layer and
    assert the byte-identical 401.
  - page-past-the-end returning 416/PGRST103 (harness fidelity item above).

**Verification:** Route tests pass in the120's vitest allowlist (path
`app/api/fp/progress/__tests__/` is inside the existing
`app/api/**/__tests__/**` include); no log line contains a username, token, or
caller-supplied task id; mutation spot-check — the eight listed mutants no
longer survive.

- [ ] **Unit 3: Staff shell refactor — shared session + tabs (first-profit)**
  — **SURVIVES the redesign essentially unchanged**

**Goal:** `/staff` becomes a two-tab shell (Suggestions | Watchtower) with ONE
session owner and single-flight refresh; Suggestions behavior is unchanged.

**Redesign delta:** only two things change. The tab is labelled **Watchtower**
rather than Progress, and the shell's cohort cache is keyed by
`(session, criterion)` rather than being a single blob — switching criterion is
a new fetch, switching TABS is not. Everything else in this unit was designed
against the session/auth boundary, which the redesign does not touch.

**Requirements:** R4, R9 (auth-level states), R12 (data dropped on signout).

**Dependencies:** None (parallel with Units 1–2).

**Files:**
- Create: `src/screens/staff/StaffShell.tsx` (or extract within
  `StaffSuggestions.tsx` if smaller — implementer's call; keep
  `STAFF_SESSION_KEY` and copy semantics identical)
- Modify: `src/screens/StaffSuggestions.tsx`, `src/App.tsx` (route target
  if the shell becomes the mount)
- Test: `src/screens/__tests__/StaffSuggestions.test.tsx` (update),
  `src/screens/__tests__/StaffShell.test.tsx` (new)

**Approach:**
- Lift session state, `readSession`/`adoptSession`/`signOut`,
  `refreshSession`, and the refresh-once-then-judge logic into the shell.
  Refresh is single-flight: one in-flight promise shared by consumers
  (Supabase rotates refresh tokens; a duplicate grant revokes the family).
- Auth view-states (signin/refused/loading-restore) live in the shell;
  each tab owns its data view-states (loading/loadError/list/empty).
- Tab state lives in the shell (above any responsive conditional mount —
  the breakpoint-crossing lesson). Tabs are plain `<button>`s with
  `aria-current` on the active tab, 44px targets, wrapping at 390px — NOT a
  full ARIA tablist (two static views don't warrant roving tabindex), and
  NOT a `<nav>` element (the existing suite pins
  `document.querySelector("nav")` null to assert no GlobalNav).
- **Existing test-pin guidance** (the suite pins structural facts the shell
  moves): treat as CONTRACT and keep passing — the no-GlobalNav assertion
  (retarget to GlobalNav specifically if the tab markup ever needs `<nav>`),
  the ONE-h1 shell title, the restored-session straight-to-loading render,
  and the refusal/revoke semantics. Treat as INCIDENTAL and rewrite freely —
  which component owns `STAFF_COPY` strings and where state hooks live.
  Expect moderate churn; do not contort shell markup to satisfy stale pins.
- Signout (either origin: link or 401-refusal) clears session AND all
  tab-cached data — every criterion entry in the cache, not just the visible
  one — in the same update.
- The restored-session distinction (expired-restored → signin;
  fresh-signin-401 → refusal) is preserved shell-wide.

**Patterns to follow:** existing `StaffSuggestions.tsx` state machine and
copy conventions; `staffLink.ts` pure-helper style.

**Test scenarios:**
- Happy path: sign in → Suggestions tab renders as today (existing test
  suite still passes with minimal churn); switch to Watchtower → suggestions
  data retained, no second sign-in.
- Edge: aged token on tab switch → exactly one refresh grant fired (assert
  fetch call count on the token endpoint), both tabs usable after.
- Error path: refresh fails on restored session → signin form (not
  refusal); fresh sign-in that 401s → refusal; refusal clears sessionStorage
  and cached tab data.
- Edge: signout from the Watchtower tab → Suggestions cache AND every cached
  criterion cleared; sessionStorage empty; revoke endpoint called best-effort.
- Integration: noindex meta + title stamped once by the shell, restored on
  unmount.

**Verification:** All existing StaffSuggestions tests pass (updated only for
the shell seam); new shell tests pass; manual check — sign-in survives a
refresh, `/admin` redirect still lands on the shell. **Mandatory viewport check
per CLAUDE.md: view the signed-in tab bar and BOTH tab panels at ~390px AND on
desktop before this unit is done — no horizontal scroll, 44px targets, the tab
row and sign-out wrapping cleanly.** (Stated explicitly here because this unit
ships the first new staff chrome; Unit 5's block already carries the same gate,
and a gate that only some units name is a gate that gets skipped.)

- [ ] **Unit 4: Flow-board math — pure helpers (first-profit)**
  — **RE-SCOPED. The old deliverables (kid funnel, per-idea timelines, stuck
  list) are SUPERSEDED; do not build them.**

**Goal:** All table computation as pure functions over the wire shape:
normalize → per-task throughput, median cycle time, WIP, and the drill-down
roster.

**Requirements:** R1 (wire shape), R10 (ordering), plus the flow definitions in
Key Technical Decisions.

**Dependencies:** Unit 1R (wire shape agreed; can proceed from this plan's shape
in parallel).

**Files:**
- Create: `src/screens/staff/flowBoard.ts`
- Test: `src/screens/staff/__tests__/flowBoard.test.ts`

**Approach:**
- `normalizeIdeas(wire, fetchedAt)`: flatten the per-child payload into a flat
  list of **flow units — one per idea** (plus one per idea-less business),
  each carrying `{ username, ideaKey, completions: Map<taskId, {done, at|null}>,
  lastCompletionAt, hasCompletionsOutsideRequest }`. `username` rides along for
  the drill-down
  ONLY and must never be read by an aggregate function — enforce by giving the
  aggregate helpers a parameter type that omits it, so a stray read is a type
  error rather than a review catch. Per idea, apply the union helper EXPORTED
  from gameCore (see Key Technical Decisions — extract, don't replicate): legacy
  keys through `LEGACY_KEY_REMAP`, then EVERY stable key (including remap
  outputs) through `resolveTaskId`/`TASK_REMAP`; new shape wins on collision; a
  timestamp without its `done:true` never mints a completion; untimestamped
  `done:true` is a completion with unknown time. Mint `legacy-idea-{index}` for
  id-less ideas using the server's PRESERVED original index (Unit 1's
  placeholder behavior is load-bearing here); duplicate ids stay distinct, keyed
  by index. Clamp stamps > `fetchedAt` to `fetchedAt`.
- `criterionTaskIds(phaseId, criterionId)`: the ~5 task ids of the selected
  criterion, IN ORDER, read from `CRITERION_SEQUENCE` / the generated path
  content — never hardcoded — together with each task's PREDECESSOR task id
  (the previous task in the criterion, or, for the first task, the last task of
  the preceding criterion — or `null` for the very first task of the whole
  sequence, which is the permanent "—" case).
- `requestedTaskIds(phaseId, criterionId)`: **the exact id list the client sends
  to the endpoint** — the criterion's ~5 ids PLUS the one predecessor id from
  the preceding criterion, de-duplicated, `null` predecessor omitted. This is
  where the client's `CRITERION_SEQUENCE` knowledge is converted into request
  input, and it is the reason the server needs none. Assert its length stays
  well under the server's 32-id cap (a criterion large enough to approach the
  cap is a content change that must fail loudly here, not silently 400 in prod).
- `computeFlowRows(units, taskIds, order)` → one row per task id:
  - **`throughput`**: count of flow units whose completion map marks this task
    done (timestamped or not).
  - **`cycleTimeMedianMs` + `sampleSize`**: for each unit that has a stamp for
    BOTH this task and its predecessor, `thisAt - predecessorAt`; drop negative
    results (skew/out-of-order) and drop units missing either stamp; median over
    what remains (mean of the two middles on even n). `null` when the sample is
    empty — the row renders "—". The very first task of the sequence is
    ALWAYS `null` (no predecessor exists; see the deferred `createdAt` gap).
  - **`active` and `stalled`** (the WIP split — owner decision, 2026-08-05):
    count of flow units whose NEXT INCOMPLETE task is exactly this task,
    partitioned by recency. Computed by walking the task order per unit and
    stopping at the first task not marked done; the unit then lands in `stalled`
    if `now - lastCompletionAt >= STALLED_AFTER_MS`, else in `active`. A unit
    whose next-incomplete task lies outside the visible criterion contributes to
    no visible row. Rationale: without the split, an idea abandoned months ago
    sits in a WIP count forever and every number drifts upward.
  - **`STALLED_AFTER_MS = 30 * 86400e3`** — a NAMED, exported, test-pinned
    constant in this module, never a literal at a call site. Defined here only
    (the server does not know the threshold; it supplies `lastCompletionAt` and
    nothing more), so it cannot drift across repos.
  - A unit with NO stamps at all (`lastCompletionAt` null — only untimestamped
    completions, or none) counts as **stalled**: it has no evidence of recent
    activity, and calling it active would let the exact population the old
    "recency unknown" state existed to catch hide inside the healthy number.
  - **`activeUsernames` / `stalledUsernames`**: the usernames behind each count,
    sorted stably. Returned as SEPARATE fields the table must not render — the
    drill-down reads them.
- `flowTotals(rows, units)`: exposes the self-check — `sum(active) +
  sum(stalled)` over the visible rows, the count of units parked before this
  criterion, and the count parked after
  (`hasCompletionsOutsideRequest`), which must total the live unit count.
  **`active + stalled == live ideas` across the whole curriculum: the split
  preserves the sum property, because every live idea still lands in exactly one
  bucket on exactly one task.** This is a free correctness signal on the
  next-incomplete walk; surface it in the UI as a quiet footer line and pin it
  in tests.

**Execution note:** Implement test-first — the scenario list below is the
specification.

**Patterns to follow:** pure-module + dedicated-test house style
(`staffLink.ts`, `gameCore.ts` helpers); read `CRITERION_SEQUENCE` and task
ids from `src/state/gameCore.ts` / `src/data/path.ts` rather than
duplicating order.

**Test scenarios:**
- Happy path: three ideas across two kids with stable-id completions in
  criterion `1.2` → throughput counts each IDEA (not each kid — a kid with two
  ideas past a task counts twice); each idea lands in exactly one of
  active/stalled on exactly one task; median cycle time matches a hand-computed
  value.
- Happy path: `sum(active) + sum(stalled) + before + after === unit count` for
  several fixtures, including one where every idea is past the criterion and one
  where none has started it.
- Happy path (the split): two ideas on the same task, one with a completion
  2 days ago and one 45 days ago → `active: 1, stalled: 1`. Moving the second to
  29 days ago flips it to active — **assert at both sides of the boundary
  (29 days vs. 31 days) and against the named constant, not a literal**, so
  changing the threshold is a one-line deliberate edit.
- Edge (the split's whole purpose): an idea whose last completion is a year old
  never appears in `active`, and the active column therefore does not drift
  upward as the cohort ages.
- Edge: idea with `lastCompletionAt` null (no stamps at all) → counted STALLED,
  not active.
- Edge: an idea whose recent work is in a LATER criterion → its
  `lastCompletionAt` (computed server-side before filtering) keeps it out of
  `stalled` even though the visible window shows no recent stamp. Regression
  test for the "only look at the requested window" mistake.
- Edge: `requestedTaskIds` returns the criterion's ids plus exactly one
  predecessor, de-duplicated, and omits the predecessor for the very first
  criterion; its length is well under 32.
- Edge: even-sized cycle-time sample → median is the mean of the two middles;
  n=1 → that value, `sampleSize: 1`.
- Edge: one wildly slow outlier → median barely moves (this is the reason for
  median; pin it so a future switch to mean fails).
- Edge: the FIRST task of the whole sequence → `cycleTimeMedianMs: null`
  regardless of data. Regression-pins the known `createdAt` gap.
- Edge: unit with `done:true` and NO stamp for this task → counted in
  throughput, advances the next-incomplete walk, contributes NO cycle sample —
  and is NOT counted as a zero-duration sample.
- Edge: predecessor stamped LATER than this task (clock skew) → negative
  elapsed dropped from the sample, not clamped to zero; `sampleSize` reflects
  the drop.
- Edge: future timestamp → clamped to `fetchedAt` before subtraction.
- Edge: legacy-only idea (`1.1#0`…) → remapped to `1.1.1`…; collision with a
  stable key → stable wins; `doneAt` entry without `done:true` → ignored.
- Edge: with a non-empty remap table injected (`resolveTaskId` takes a `remap`
  parameter for exactly this) → old-id completions count under the new id.
- Edge: idea with no completions at all → sits on the criterion's first task
  only if that is the first task of the sequence; otherwise it is counted in
  "parked before this criterion", never silently dropped.
- **Survivorship (documentation of the metric, asserted so it cannot be
  "fixed" by accident):** a fixture where the slowest ideas never complete the
  task → the median reflects ONLY the completers and is visibly lower than the
  true difficulty, while those ideas appear in `stalled`. Pin the relationship
  so a future change that silently folds non-completers into the median (as
  zero, or as elapsed-so-far) fails.
- Edge: duplicate idea ids within one child → two distinct flow units.
- Edge: empty cohort → all rows present with zeros, medians null, no crash.
- Privacy: `computeFlowRows`' aggregate outputs contain no username; a fixture
  with distinctive usernames is asserted absent from the serialized row output.
- Regression: deleted-idea shrinkage is simply reflected — no assertion of
  monotonicity anywhere.

**Verification:** Full scenario suite green; helpers import no React and no
fetch — pure data in, view models out; `active + stalled + before + after`
holds on every fixture; `STALLED_AFTER_MS` appears exactly once in the codebase.

- [ ] **Unit 5: Watchtower tab UI — the flow table + drill-down (first-profit)**
  — **RE-SCOPED. Three stacked views are SUPERSEDED by one table.**

**Goal:** Render the Unit 4 rows as ONE table inside the Unit 3 shell, scoped by
phase and criterion selectors, with a named WIP drill-down — mobile-first,
text-first, celebration-free staff chrome.

**Requirements:** R8 (390px), R9 (view states), R10 (interaction defaults),
R11 (text equivalents), R12 (no persistent storage), plus the "no individual
progress on the main page" boundary.

**Dependencies:** Units 3 and 4.

**Files:**
- Create: `src/screens/staff/StaffWatchtower.tsx`
- Modify: `src/screens/staff/StaffShell.tsx` (mount the tab), staff copy object
- Test: `src/screens/__tests__/StaffWatchtower.test.tsx`

**Approach:**
- **Composition: ONE table, no sub-navigation stack.** **A TWO-LEVEL selector**
  above it — phase, then step/criterion (criterion options depend on the
  selected phase) — matching the owner's "one phase at a time and one
  step/criterion at a time" (decision, 2026-08-05; a flat criterion picker was
  considered and rejected) — and ~5 rows below. Default to the first criterion
  of Phase 1 (deterministic; see Open Questions). Selector state lives in the
  tab but the FETCHED DATA lives in the shell cache keyed by criterion (Unit 3),
  so switching back to a visited criterion is instant.
- **Columns:** Unit task (id + short name) · Ideas through (throughput) ·
  Median time (cycle time, with sample size) · **Sitting here (active)** ·
  **Stalled (30d+)**. A quiet footer line shows the sum-check: "N active ·
  S stalled · M before · K after · T ideas live." This is the free correctness
  signal from Unit 4 — if it ever fails to add up, staff see it before a test
  does.
- **The stalled column carries a short inline explanation of what it means**
  ("no completion in 30+ days") — it is the surviving form of the old stuck
  list, and staff must read it as "these need a nudge", not as a second WIP
  number.
- **Cycle-time rendering:** a null median renders "—" with an inline
  explanation on first render (not a tooltip) so it reads as "not measurable
  here", never as a bug. Format durations coarsely (hours/days), never to the
  second — false precision over a client-minted clock. Show `n=` beside the
  median so a two-sample median is visibly thin.
- **Copy obligation — survivorship (required, not optional):** the median is
  computed only over ideas that COMPLETED the task; ideas abandoned before
  completing it are invisible to it, and since the slowest are the likeliest to
  be abandoned, **the median understates real difficulty**. The column heading
  and its accompanying note must therefore say something closer to "median time
  for ideas that got through" than "how long this task takes", and must point at
  the stalled column as the counterweight. This is a correctness-of-reading
  requirement: a staff member who reads the median as the true task duration
  will draw the wrong conclusion about which task to fix.
- **The drill-down is the ONLY place a username appears.** The **active and
  stalled** cells are `<button>`s; activating one discloses that bucket's
  username list inline beneath the row (not a modal — a modal at 390px hides the
  table it explains). Drilling STALLED is the direct replacement for reading the
  old stuck list. **Throughput is deliberately NOT drillable** (decision,
  2026-08-05) — it is a historical count with no action attached, so naming
  those children would buy exposure without buying a decision; extending it
  later is a deliberate option, not an oversight.
  Collapsed by default, one open at a time, `aria-expanded` on the trigger.
  **Hard requirement: usernames must not be in the DOM until the drill-down is
  opened** — they are in the payload, so this is a rendering discipline, and the
  test asserts absence from the document before the click, not just invisibility.
- Refresh interaction states: button disabled with an in-progress indicator
  while fetching; on failure KEEP the stale table visible with an inline
  error + retry (never blank a previously-rendered table); show a
  "last updated" timestamp beside the button so staleness is visible.
- View states per R9: loading / loadError / table / empty over the single
  response (loadError applies to the FIRST load of a criterion; refresh failures
  degrade per the bullet above). A criterion where every count is zero renders
  an explicit "no ideas have reached this criterion yet" state, not an empty
  grid.
- **The table IS the text equivalent (R11)** — this is a happy consequence of
  the redesign: real `<table>` markup with `<th scope="col">`, no bar charts, no
  color-only encoding. If any emphasis (e.g. the deepest queue) is added, it
  carries a text marker too.
- At 390px: the table must not scroll the PAGE horizontally. Preferred approach
  is a responsive stacked-row layout below `sm` (each task becomes a labelled
  card of three stats) reverting to a true table from `sm` up; if a real table
  is kept at 390px it must scroll inside its own `overflow-x: auto` container.
  Decide with the screenshot gate, not in advance. 44px tap targets on both
  selectors and every drillable count.
- All copy in the staff copy object; usernames rendered only in the drill-down,
  never logged.

**Patterns to follow:** `StaffSuggestions.tsx` card/markup/Tailwind
conventions (mobile-first base classes, `sm:`/`lg:` layering); CLAUDE.md
responsive rules.

**Test scenarios:**
- Happy path: shaped response → five rows with expected throughput, median,
  active and stalled counts (assert against Unit 4 fixtures); footer sum-check
  line correct.
- **Privacy: before any drill-down, NO username from the fixture appears
  anywhere in the document.** Click an active count → exactly that bucket's
  usernames appear; click again → gone. Click a stalled count → that bucket's
  usernames. Open a second cell → the first collapses.
- **Throughput is not drillable:** the throughput cell is not a button, is not
  styled as one, and clicking it discloses nothing.
- Edge: active or stalled count of 0 → that cell is not an interactive button
  (nothing to disclose) and is not styled as one.
- Copy: the median column's heading/note qualifies it as covering only ideas
  that completed the task, and references the stalled column — asserted against
  the copy object so the caveat cannot be dropped in a copy edit.
- Edge: median null → "—" plus the inline explanation; median with n=1 → value
  plus a visible sample size.
- Edge: change criterion → new fetch, loading state, table replaced; change back
  → served from cache with no second fetch; Refresh forces a fetch.
- Edge: change phase → criterion selector repopulates and selects that phase's
  first criterion.
- Edge: empty/zero criterion → explicit empty state; fetch failure → loadError
  with retry; retry refetches; failure AFTER a successful load keeps the stale
  table plus an inline error.
- Error path: 401 mid-session on this tab → shell's refresh-once-then-judge
  runs; unrecoverable → shell-level signin/refusal, ALL cached criteria cleared.
- Integration: switching tabs and back does not refetch; signout clears the
  rendered table and the drill-down.

**Verification:** Component tests pass; **mandatory viewport check per
CLAUDE.md** — screenshot the table (now FIVE columns; verify the extra stalled
column does not force horizontal page scroll), both selectors, and an OPEN
drill-down at ~390px AND desktop (no horizontal page scroll, 44px targets, no
clipped columns, coach-free staff chrome) before claiming done. Re-check desktop
after any mobile fix.

## System-Wide Impact

- **Interaction graph:** `/staff` boot path (`App.tsx` pre-stage route) now
  mounts a shell; the `/admin` → `/staff` redirect and reserved-handle
  posture are untouched. No game-shell surface changes.
- **Error propagation:** all AUTHORIZATION refusals collapse to the one 401 —
  the client must never branch on refusal content (it can't). The criterion
  400 is the one new, deliberate exception: it is a client-bug signal, only
  reachable by an authenticated staff caller, and the client treats it as a
  loadError (a bad request is a code defect, never a sign-out). One rule covers
  ALL request-input validation — there is not a separate contract per parameter.
  DB outages read as loadError with retry, not refusal.
- **Data exposure profile (changed by the redesign):** the wire no longer
  carries band or child-authored labels, and each request carries at most 32
  named task ids (~6 in practice) rather than all 125 — a leaked staff token now
  exfiltrates one criterion's anonymised-except-username flow slice per call
  rather than the whole cohort timeline in one shot, and the id cap is the
  enforcement point. The origin doc's "full-cohort unpaginated export" accepted
  tradeoff is materially reduced, not merely restated. Residual: the id list is
  caller-controlled, so exfiltration by iteration is still possible for an
  attacker holding a valid staff token — the rate limiter and the audit
  breadcrumb, not the cap, are what bound that.
- **New untrusted input surface:** the endpoint previously took no meaningful
  parameters. It now accepts a caller-supplied id list, which must be validated
  before use, never logged, and never echoed in a refusal.
- **State lifecycle risks:** duplicate refresh-token use (solved by
  single-flight); cohort data lingering after signout (solved by
  shell-owned cache, now multi-criterion — clearing must iterate); an open
  drill-down surviving a criterion change (must collapse); mid-convergence
  docs may transiently under-report — acceptable, next refresh heals, and
  under-reporting shifts an idea's WIP one task earlier rather than losing it.
- **API surface parity:** none — no other consumer of the new endpoint; the
  suggestions contract is unchanged. The `tasks` parameter is required from
  day one, so there is no back-compat window to manage.
- **Removed coupling:** the endpoint no longer reads `families`, so the CRM
  `is_test` flag and the Watchtower are fully decoupled — a CRM-side change to
  test-family semantics can no longer alter what staff see here.
- **Integration coverage:** staff-gate wiring test (Unit 2); shell
  single-refresh test (Unit 3); the WIP sum-check (Unit 4); cache-vs-refetch,
  signout-clears-data, and username-absent-before-drill-down (Unit 5).
- **Unchanged invariants:** child-facing routes, save-doc write paths, RLS
  grants, and the suggestions endpoint are untouched; the new endpoint is
  read-only service-role SELECTs.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Union/remap semantics drift between dashboard and gameCore | Removed by construction: the rule is a single exported gameCore helper both consumers import |
| Task-ORDER knowledge drifting between repos | Removed by construction: the client sends an explicit id list and the server honours it; all sequence knowledge stays in the SPA (owner decision, 2026-08-05) |
| **Wrong predecessor → silently wrong cycle time** | Removed by construction: the client names the predecessor id exactly, from `CRITERION_SEQUENCE`. The rejected prefix design inferred it as "highest stamp outside the criterion", which is unsound because `markTaskDone` has no predecessor guard and out-of-order stamps are possible. Regression-tested in Unit 1R |
| Caller reconstructs the full-cohort export via a huge id list | 32-id cap, boundary-pinned, refused before any DB read (Unit 2). Ids are untrusted request input: never logged, never echoed |
| Abandoned ideas inflate WIP forever | Active/stalled split at a test-pinned 30-day threshold; the active number stops drifting upward as the cohort ages (owner decision, 2026-08-05) |
| **Median read as "how long this task takes"** | It is survivorship-biased — only completers are in the sample, and the slowest ideas are the likeliest to be abandoned, so it UNDERSTATES difficulty. Mitigation is copy, not code: Unit 5 must qualify the column and point at the stalled count as the counterweight; Unit 4 pins the relationship so it cannot be "fixed" into the median by accident |
| PostgREST silent truncation skews every count | `.range()` paging + refuse past hard cap; keyset paging; the `from`-from-index bug fixed and regression-tested; harness taught the 416/PGRST103 shape (Unit 2 required fixes) |
| Row-cap refusal burns rate-limit strikes on a deterministic refusal | Distinguish `outage` from `too_many_rows`; release strikes only on outage (Unit 2 fix 1) |
| Unbounded DB call hangs the function | `withFwTimeout` on every read + explicit `maxDuration` (Unit 2 fix 2) |
| Concurrent-refresh 401 race in the shell | Single-flight refresh, test-asserted. Residual (accepted): a DUPLICATED browser tab copies sessionStorage into a realm no in-page mechanism coordinates — delayed reuse can revoke the family; nuisance re-login |
| **A CRM flag silently deleting real children from the dashboard** | Removed by construction: the `families.is_test` join is gone. `is_test` is a nurture-visibility flag, not an FP-enrolment flag; two meanings must not share one column (owner decision, 2026-08-05). Residual (accepted): test rows, if any are ever created, count in the flow numbers |
| Usernames leaking onto the aggregate page | Type-level separation in Unit 4 (aggregate helpers cannot see `username`) + a Unit 5 test asserting absence from the DOM before drill-down |
| Median computed from a sample of 1–2 read as authoritative | `sampleSize` returned by Unit 4 and rendered beside every median; coarse duration formatting avoids false precision |
| Cycle time for the first task permanently "—" | Known gap: `Idea` has no `createdAt` (verified). Rendered with an inline explanation, regression-pinned in Unit 4, and recorded as a deferred forward-only fix — not silently blank |
| Client clock skew corrupts durations | Clamp future stamps to fetch time; DROP negative elapsed from the sample rather than clamping to zero (Unit 4) |
| WIP walk wrong (an idea placed on the wrong task) | The sum-check: `active + stalled + before + after` must equal live ideas. The split preserves the property. Pinned in Unit 4 tests and shown in the UI footer — a free, always-on correctness signal (owner decision, 2026-08-05) |
| Table unusable at 390px | Stacked-card-below-`sm` approach with the mandatory screenshot gate (Unit 5) |
| Legacy machinery built for an empty population | Pre-flight service-role query; machinery dropped (and recorded) if cohort docs are clean |
| Rework churn from the redesign itself | Bounded and recorded in the revision note: Unit 1 keeps its walk and gains a filter, Unit 2 keeps its gates and sheds a join, Unit 3 is untouched in substance. Only Units 4–5 are genuinely rewritten, and they were not yet started |

## Documentation / Operational Notes

- No schema migration expected, and after the 2026-08-05 redesign no data
  verification either — the `families.is_test` check is withdrawn along with the
  join. The only remaining data question is the legacy pre-flight query, which
  is read-only. If any data fix is ever needed, apply via the Management API
  playbook
  (`the120: docs/solutions/integration-issues/supabase-cli-stale-db-password-*`).
- **PP2 convention applies unchanged: full `ce:review` + `ce:compound` on EVERY
  unit and EVERY commit, 100%, no exceptions.** Unit 1 has had its review;
  Unit 2's six-persona review produced the findings listed in that unit and
  needs a re-review after the redesign changes land. Units 1R, 3, 4 and 5 each
  get their own full cycle.
- Worth a `ce:compound` entry when this ships: **"a flag with two meanings is a
  silent-deletion bug waiting to happen"** — the `families.is_test` near-miss
  (decision 7) is the most transferable lesson in this project.

## Sources & References

- **Origin document:** `docs/brainstorms/2026-08-05-watchtower-requirements.md`
- Roadmap: `artifacts/roadmap/2026-08-05-first-ten-delight-roadmap.md`
  (Project 1)
- Template code: `the120: app/api/fp/suggestions/` (route + rules + tests),
  `src/screens/StaffSuggestions.tsx`
- Doc-shape authority: `src/state/gameCore.ts`, `src/data/taskRemap.ts`
- Prior plan precedent: `docs/plans/2026-08-03-001-feat-full-path-cohort-readiness-plan.md`
