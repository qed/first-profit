---
date: 2026-08-05
topic: watchtower-staff-progress-dashboard
---

# The Watchtower — staff progress dashboard

Source: `artifacts/roadmap/2026-08-05-first-ten-delight-roadmap.md` (Project 1,
"build first"). Spans both repos: a staff-gated API endpoint on the120 and a
Progress tab on First Profit's `/staff` page.

## Problem Frame

The beta cohort (10 families / 17 kids, live in prod since 2026-08-04) is
working through the path, but staff have no view of who is charging ahead and
who has quietly stalled. The north-star outcome — every kid reaches their
first real sale (task 1.2.5) within ~30 days — cannot be managed without
seeing where kids drop off. The data already exists: every child's save doc
stamps per-task completion timestamps (`doneAtByTask`, epoch-ms keyed by
stable task id, per idea). The Watchtower turns those timestamps into a daily
two-minute staff check.

## Requirements

**Data access (the120 endpoint)**

- R1. A staff-gated the120 API endpoint returns cohort progress: one entry
  per child with `fp_username`, band, and each of the child's ideas with its
  label and per-task completion maps — the stable-id `doneByTask`/
  `doneAtByTask` maps AND the legacy `done`/`doneAt` maps (raw keys, where
  present; booleans included because pre-timestamp completions exist and a
  timestamp without `done:true` never mints a completion) — plus each of
  the child's businesses (`ideaId` + its `doneByTask`/`doneAtByTask` maps),
  since Phase 4–5 progress lives on the Business record. The client unions
  legacy keys through the existing taskRemap machinery (the merge-on-load
  logic in `src/state/gameCore.ts`) before computing views; "not started"
  is reserved for children with no completion evidence in ANY map.
- R1a. The endpoint enumerates from `children` (all rows with an
  `fp_username`), left-joining profile → save — the reverse direction of the
  suggestions route's batched-lookup pattern — so a provisioned child who has
  never signed in (no save row) still appears, with zero ideas, rendered
  "not started". Idea label = `fields.productName`, falling back to
  `fields.oneLiner`, trimmed; both may be missing/empty (client renders a
  placeholder, matching `floorSelectors`' existing fallback). The label is
  child-authored free text, so R3's never-log rule extends to it.
- R1b. Known test/staff accounts (e.g. the Cedric test family) are excluded
  server-side so they never skew the funnel or squat on the stuck list —
  exclusion mechanism (denylist of child ids/usernames vs. an `is_test`
  flag) is a planning decision.
- R2. The endpoint copies the exact security posture of
  `/api/fp/suggestions`: CORS origin allowlist, rate-limit strike before any
  DB I/O, two-half staff gate (JWT role claim + active `staff` row),
  byte-identical 401 for every refusal, service-role reads, `no-store`.
  The allowed-staff-roles set is deliberately re-derived for this endpoint
  (not blindly copied from `SUGGESTIONS_ALLOWED_STAFF_ROLES`), since this
  surface exposes materially richer child data than feedback rows.
- R3. Log lines never contain credentials, save-doc contents, usernames, or
  grades/birth years (repo convention R8) — usernames appear only in the
  authenticated response body. Each successful staff access logs a
  value-free audit breadcrumb (staff user id + timestamp only), since one
  call returns the whole cohort's behavioral timeline.

**Progress tab — shell (`/staff` on First Profit)**

- R4. The Watchtower is a sibling tab beside Suggestions on the existing
  `/staff` page, behind the same staff sign-in/session (sessionStorage-only,
  noindex, refresh-once-then-judge 401 handling).

**Progress tab — views**

- R5. **The funnel** — for each of the ten tasks 1.1.1 → 1.2.5, how many
  kids have passed it (kid-level: a task counts if completed on any of the
  kid's ideas). The biggest drop-off step is visually highlighted.
- R6. **Kid timelines** — one row per idea, grouped under the kid, with a
  dot per task completion positioned by timestamp, covering ALL tasks (not
  just the first ten), so bursts and flat gaps are visible at a glance.
- R7. **The stuck list** — every kid whose most recent completion (across
  all ideas, all tasks) is 7+ days old, showing the exact next task they are
  parked on. Kids with zero completions appear as "not started". A kid whose
  done map covers every task (or for whom the next-up walk yields no task)
  is excluded from the stuck list and shown as "path complete", not stalled.

**Progress tab — behavior and states**

- R9. The three views share one loading/error/empty boundary over the single
  response, following the explicit view-state model of
  `src/screens/StaffSuggestions.tsx` (signin/loading/refused/loadError/list,
  each with its own copy). An empty cohort renders an explicit empty state,
  never a blank view.
- R10. Interaction defaults: the stuck list sorts most-stalled first (the
  most urgent case is on top); timeline dots reveal their task + date via
  tap-to-expand (no hover-only affordances — the daily check happens on a
  phone); kid timelines are collapsed by default (one summary row per kid,
  expanding to per-idea rows) so the view stays usable at 32+ kids; the
  funnel's drop-off highlight is the max per-step drop, labeled in text,
  never conveyed by color alone.
- R11. Each view has a semantic text/table equivalent of its visual encoding
  (the funnel and timelines are readable without visual perception —
  matching the plain-markup style of the existing Suggestions cards).
- R12. The fetched cohort data lives only in component state — never written
  to localStorage/sessionStorage or any persistent client storage (the
  staff token's sessionStorage-only discipline extends to the data).

**Progress tab — responsiveness**

- R8. All three views work at a ~390px viewport as well as desktop
  (CLAUDE.md acceptance criterion; the existing `/staff` shell already wraps
  at 390px).

## Success Criteria

- Staff can answer "which task is bleeding kids?" (funnel) and "who needs a
  nudge today?" (stuck list) in under two minutes, daily.
- Time-to-first-sale per kid is readable from the timelines, so each shipped
  mini-tool's effect on it can be observed (roadmap success criterion).
- No new client-side tracking, storage, or schema — the feature reads only
  what the save docs already contain.

## Scope Boundaries

- No analytics vendor, no infra, no aggregation tables — 17–32 kids means
  computing views client-side from one response is fine.
- No parent-facing or kid-facing view; staff only.
- No write operations — the Watchtower is read-only over save docs.
- No notification/alerting (email, push) on stalls — the daily manual check
  is the v1 loop.
- Grades/birth years are not displayed; band (g3_5/g6_8/g9_12) is.
- Accepted tradeoffs, named explicitly: (1) the response is a full-cohort
  unpaginated export — a leaked staff token exfiltrates the whole cohort's
  timeline in one call; acceptable at 17–32 kids behind the staff gate +
  audit breadcrumb. (2) No per-cohort/per-family scoping — every allowed
  staff role sees all provisioned children. Both are scale-dependent
  shortcuts to revisit if the program grows past this cohort.

## Key Decisions

- **Kid-level funnel and stuck list, per-idea timelines**: the funnel answers
  the cohort success criterion ("how many kids cleared task N"), so it rolls
  up to the kid (any idea counts); the stuck list likewise judges the kid's
  latest completion across ideas. Timelines stay per-idea (grouped under the
  kid) so idea switches and restarts remain visible. (User decision,
  2026-08-05.)
- **All three views ship in v1**: the endpoint returns the same data either
  way; timelines are modest extra UI. (User decision, 2026-08-05.)
- **Funnel scoped to the first ten tasks; stuck list and timelines cover all
  tasks**: a kid working past task 10 must never show as falsely stalled.
  (User decision, 2026-08-05.)
- **Test/staff accounts excluded server-side** (R1b): at n=17 even a few
  fake rows distort the funnel and permanently occupy the stuck list. (User
  decision, 2026-08-05.)
- **Roadmap success wording kept**: "each shipped tool moves time-to-first-
  sale down" is retained as a directional read, accepting that n=17 with no
  control group cannot rigorously attribute per-tool effects. (User
  decision, 2026-08-05.)
- **Sibling tab on `/staff`, mirroring the suggestions posture**: verified
  the pattern end-to-end (`src/screens/StaffSuggestions.tsx` client,
  `app/api/fp/suggestions/route.ts` server in the120); the Watchtower reuses
  both rather than inventing a new surface.
- **Server extracts, client computes**: the endpoint defensively walks each
  save doc and returns only the per-idea AND per-business completion maps
  (+ idea label), not raw docs — minimal data exposure; the
  funnel/stuck/timeline math and the legacy-key remap live in the client
  where the task-order domain knowledge (`CRITERION_SEQUENCE`, taskRemap,
  generated path content) already exists. The server stays free of task-id
  domain knowledge.

## Dependencies / Assumptions

- Verified: per-task timestamps exist server-side today in
  `fp_player_saves.doc` (jsonb) as `doneAtByTask` on each idea and on the
  `Business` record for Phase 4–5 (both covered by R1). The first ten tasks
  are all idea-scoped, so idea maps alone cover the funnel.
- Old docs may carry timestamps only under legacy `${stepId}#${index}` keys
  (the stable-id migration runs client-side in `fromSaveDoc`); R1's legacy
  pass-through + client remap covers this. Planning may alternatively verify
  every cohort doc is already stable-id-shaped and simplify the extract —
  record that verification if taken.
- Verified: band is derivable server-side from `children.grade` (the
  `/api/fp/grade` route's progress-core already does this).
- Assumption: cohort = all provisioned FP children (no explicit cohort
  membership flag needed at this scale).
- Malformed or partial docs must never crash the view; a child with no
  completion evidence in any map (per R1) renders as "not started".

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Technical] Exact response shape and how the server-side
  defensive doc walk handles malformed/legacy docs (mirror the
  skip-never-crash parse style of `parseSuggestions`).
- [Affects R6][Technical] Timeline rendering approach at 390px (horizontal
  time axis vs. compact recency encoding) — pick during design/build with a
  screenshot check.
- [Affects R7][Technical] Where "next task they're parked on" comes from —
  client derives it by walking `CRITERION_SEQUENCE`/task order against the
  kid's done map (the next-up logic in `gameCore` is the reference).
- [Affects R1b][Technical] Exclusion mechanism for test accounts: denylist
  vs. `is_test` flag on `children`.
- [Affects R2][Technical] Size the new endpoint's rate-limit budgets so a
  normal daily check (two authenticated GETs per `/staff` visit: suggestions
  + watchtower) plus a retry never trips the byte-identical 401.
- [Affects R6][Technical] Completion timestamps are client-minted (device
  clock); a defensive clamp when rendering timeline dots avoids a skewed
  clock scrambling ordering.
- [Affects R9][Technical] Refetch vs. session-cache when switching between
  the Suggestions and Progress tabs.

## Next Steps

-> /ce:plan for structured implementation planning
