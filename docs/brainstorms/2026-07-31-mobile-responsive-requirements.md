---
date: 2026-07-31
topic: mobile-responsive
---

# Mobile-Friendly Experience + Repo-Level Mobile Standard

## Problem Frame

First Profit (live at firstprofit.school) is a game-like business simulator whose core screen is a 2D "factory floor" with eight absolutely-positioned pods the player's avatar walks between. The floor has no responsive treatment (`src/components/FactoryFloor.tsx`), so on phones the pods are cramped and hard to tap. Learners will often open the site on their phone; the mobile experience should feel intentional, not shrunken. Additionally, the repo should carry a durable instruction so every future change — by any agent or contributor — keeps mobile quality, not just this one pass.

## Requirements

**Mobile Experience**
- R1. Below the desktop breakpoint (`lg`, 1024px), replace the 2D factory floor with a scrollable vertical "path": the same eight pods in phase order, full-width tappable cards. Tablets (640–1024px) get a wider, centered version of the same vertical path — no third layout. Desktop keeps the existing spatial floor unchanged.
- R2. All room panels (`src/components/rooms/*`), the HUD, the intro modal, and the Next Step coach must be comfortably readable and usable on a ~390px-wide viewport: no horizontal scrolling, no clipped content, tap targets at least ~44px. Landscape phones are expected to work via the same responsive rules, not a separate design.
- R3. The game feel carries over to mobile — the vertical path should read as the same game, not a stripped-down list. Concretely, each path card keeps its phase-color badge, sign emoji, progress dots, and all four pod states (locked with dashed border + lock icon, in-progress, complete with green check, and the "next step" ring highlight). The avatar renders beside the current card and hops to the target card on navigation.
- R5. On mobile, the HUD collapses to a compact two-row layout (identity + stats row, then icon-only phase pips) instead of the single desktop row.
- R6. On mobile, tapping a pod card opens its room panel as a full-screen takeover with a sticky, always-visible close button; desktop keeps the existing overlay.
- R7. The Next Step coach's "Go" button scrolls the target card into view, then opens it (same walk-then-open contract as desktop). The path reserves bottom padding so the collapsed coach never covers the last card.

**Repo Memory**
- R4. Add a repo-level instruction file (e.g., `CLAUDE.md`) stating that every UI change must look good and work well on mobile (~390px) as a non-negotiable acceptance criterion, including a concrete verification step (check the changed screens at a mobile viewport before considering work done).

## Success Criteria

- The full game loop (view floor/path → open a pod → complete steps → close panel → follow Next Step coach) is playable end-to-end on a phone-sized viewport with no horizontal scroll or overlapping/unreadable UI.
- Desktop experience is visually unchanged.
- The repo instruction file exists, and a future change request in this repo would surface the mobile rule without the user restating it.

## Scope Boundaries

- No native app, PWA install flow, or offline support.
- No touch-gesture extras (drag, swipe navigation) beyond taps and scrolling.
- No redesign of the desktop floor layout.

## Key Decisions

- Vertical path on mobile (vs. shrinking or panning the 2D floor): chosen for readable text and reliable tap targets; the "journey" metaphor survives as a path. Desktop keeps the spatial floor.
- Breakpoint at `lg` (1024px): tablets get the vertical path rather than a squeezed spatial floor, avoiding a third layout to maintain.
- Room panels are full-screen takeovers on mobile: nested accordions and footer CTAs (e.g., WorkshopPanel) need the full viewport; a scaled modal would fight for space.
- Repo memory lives in a repo-committed instruction file, not personal agent memory, so it travels with the code to any machine, teammate, or agent.

## Outstanding Questions

### Deferred to Planning
- [Affects R1][Technical] Whether the vertical path is a conditional render of new markup or a restyled variant of `FactoryFloor`, and whether it reuses the existing `walkTo`/`onArrived` prop contract so `App.tsx` and `NextStepCoach` need no changes.
- [Affects R3][Technical] Exact avatar hop animation on the vertical layout (framer-motion layout animation vs. positional tween).

## Next Steps
-> /ce:plan for structured implementation planning
