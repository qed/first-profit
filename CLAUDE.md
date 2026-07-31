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
  `matchMedia` hook. Both honor the same `walkTo`/`onArrived` contract used by
  `src/App.tsx` and `NextStepCoach`.
- Room panels (`RoomShell`) are full-screen takeovers on mobile, floating modals from `sm` up.
- The Next Step coach docks full-width at the bottom on phones; `MobilePath` reserves
  bottom padding so it never covers the last card. Preserve that padding if you change
  either component.
- Styling is Tailwind mobile-first: base classes are the mobile styles; desktop is layered
  on with `sm:`/`lg:` variants. When fixing mobile, don't silently change desktop —
  re-assert desktop values at the appropriate breakpoint.

## Documented Solutions

`docs/solutions/` — documented solutions to past problems (bugs, patterns), organized
by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when
implementing or debugging in documented areas.
