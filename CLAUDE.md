# First Profit — Project Instructions

First Profit is a game-like business simulator (Vite + React + Tailwind), live at
https://firstprofit.school. Learners frequently use it on phones.

## Mobile quality is a non-negotiable acceptance criterion

Every UI change MUST look good and work well on mobile before it is considered done.

- Target viewport: **~390px wide** (iPhone-class portrait). No horizontal scrolling,
  no clipped or overlapping content, tap targets at least ~44px.
- **Verification step (required):** after any UI change, view every changed screen at a
  ~390px viewport (browser devtools device mode, a headless-browser screenshot, or a real
  phone) — and re-check desktop — before claiming the work is complete.
- Two breakpoints govern the layout: the floor switches from vertical path to the 2D
  desktop floor at `lg` (1024px); overlays (room panels, coach) switch from full-screen/
  docked to floating at `sm` (640px). Tablets therefore get the vertical path with
  floating overlays. Do not add further layout tiers.

## Responsive architecture (how mobile is implemented here)

- `src/components/FactoryFloor.tsx` renders the desktop 2D floor at `lg`+ and delegates to
  `src/components/MobilePath.tsx` (vertical path of pod cards) below `lg`, via a
  `matchMedia` hook. Both honor the same `walkTo`/`onWalk`/`onArrived` lifted-intent
  contract owned by `src/screens/Factory.tsx` (the intent lives above the conditional
  mount so a walk survives the breakpoint swap; see the documented solution below).
- Overlays (the Step Runner, criterion Celebration, room dialogs, and the mock checkout,
  all mounted at `src/screens/Factory.tsx` above the floor) are full-screen takeovers on
  mobile and floating dialogs from `sm` up. Their open-state lives in the `gameCore`
  reducer, which is above the breakpoint mount, so they survive the swap too.
- The fpv2 floor uses click-to-walk plus a bottom hint pill and the HUD for guidance; there
  is no separate "Next Step coach" component (a v1 concept the fpv2 design superseded).
  `MobilePath` still reserves bottom padding (`pb-80`) so a bottom-docked HUD/overlay never
  covers the last card. Preserve that padding if you change either component.
- Styling is Tailwind mobile-first: base classes are the mobile styles; desktop is layered
  on with `sm:`/`lg:` variants. When fixing mobile, don't silently change desktop —
  re-assert desktop values at the appropriate breakpoint.

## Content pipeline (path/task content)

- `src/docs/first-profit-home-study-curriculum-brief.md` is the **source of truth** for
  all step/task content. It compiles to the committed `src/data/pathContent.generated.ts`
  via `npm run build:path-content` (parse-or-throw parser in `src/data/parseCurriculum.ts`);
  a drift test and the `npm run build` preflight (`scripts/check-path-content.ts`, run
  before vite, so Vercel can never deploy a stale or broken regeneration) both fail if the
  brief and the generated module fall out of sync. Never hand-edit the generated module.
- Behavior lives in `src/data/pathHooks.ts` (artifact auto-complete, the real-sale target,
  authored input fields), keyed by stable task id — regenerating content can never
  silently drop behavior, and `src/data/path.ts` asserts every hook resolves.
- Editorial rule: a **copy tweak** to the brief keeps the task id; a **meaning change or
  structural edit** mints a new id and needs BOTH a `src/data/pathHooks.ts` retarget of any
  hooks on the old id AND a `src/data/taskRemap.ts` `TASK_REMAP` entry (old id → new id, or
  old id → null to retire) so saved child progress moves with the edit — the build preflight
  refuses a remap table that is stale against the content
  (see docs/plans/2026-08-03-001-feat-full-path-cohort-readiness-plan.md).

## Documented Solutions

`docs/solutions/` — documented solutions to past problems (bugs, patterns), organized
by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when
implementing or debugging in documented areas.
