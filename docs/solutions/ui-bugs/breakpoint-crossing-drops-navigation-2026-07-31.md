---
title: Pod-tap navigation silently dropped when viewport crosses the lg breakpoint
date: 2026-07-31
category: ui-bugs
module: factory-floor navigation (React)
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - Tapping a pod card just before rotating/resizing across 1024px opens nothing — no error, no feedback
  - Coach-driven "Next Step" walks visibly restart and take double the delay when the breakpoint is crossed mid-walk
root_cause: async_timing
resolution_type: code_fix
severity: medium
tags: [react, matchmedia, breakpoint, conditional-mount, settimeout, state-lifting, responsive]
---

# Pod-tap navigation silently dropped when viewport crosses the lg breakpoint

## Problem

`FactoryFloor` conditionally mounts one of two sibling components — `DesktopFloor` (2D floor) or `MobilePath` (vertical path) — from a `matchMedia('(min-width: 1024px)')` hook. Navigation ("walk to a pod, then open its room") was implemented as *local* state in each variant: a `setTimeout` that fires `onArrived` after the walk animation. Crossing the breakpoint mid-walk unmounted the active variant, whose cleanup effect cleared the pending timer — and for card taps the navigation intent lived nowhere else, so the tap was lost with zero feedback.

## Symptoms

- Tap a pod card on a tablet, rotate to landscape (≥1024px) within ~600ms → no room opens, avatar sits at the default position.
- Coach-driven walks survived (they route through the parent's `walkTo` state, which the freshly mounted variant re-reads) but restarted the animation and doubled the delay.

## What Didn't Work

- Relying on each variant's unmount cleanup being "safe" — it correctly prevents a stale `onArrived`, but safety-by-cancellation destroys user intent when the intent isn't stored anywhere above the unmounting component.

## Solution

Lift the navigation *intent* above the conditional mount. Card taps no longer start a local walk; they call an `onWalk` prop that sets the parent's `walkTo` state (the same channel the Next Step coach already used). Each variant's `useEffect([walkTo])` drives its own animation, and because effects run on mount, the newly mounted variant resumes any in-flight navigation automatically.

```tsx
// FactoryFloor.tsx — intent lives above the ternary
export interface FloorProps {
  walkTo: RoomId | null;
  onArrived: (room: RoomId) => void;
  onWalk: (room: RoomId) => void; // taps route up, not into local state
}
export function FactoryFloor(props: FloorProps) {
  return useIsDesktop() ? <DesktopFloor {...props} /> : <MobilePath {...props} />;
}

// In both variants: onClick={() => onWalk(room.id)}   (was: walk(room.id, true))
// App.tsx: <FactoryFloor walkTo={walkTo} onArrived={arrive} onWalk={setWalkTo} />
// App's arrive() clears walkTo only after the room actually opens.
```

## Why This Works

The parent's `walkTo` is the single source of truth for "the user wants to go to room X," and it outlives either variant. Unmounting mid-walk still cancels the local timer (no stale callbacks), but the intent survives; the replacement variant's `walkTo` effect fires on mount and completes the navigation. Clearing `walkTo` only in `arrive()` guarantees at-least-once delivery of the open action.

## Prevention

- When a component is **conditionally mounted from a media query** (or any environment signal), any user intent held in its local state dies with it. Keep in-flight intent (pending navigation, unsaved input, active selection) in the closest ancestor that survives the switch.
- Route all triggers of the same action through one state channel — this bug existed precisely because taps and the coach used different paths to the same outcome.
- Test the changed interaction while resizing across every breakpoint that swaps component trees (in this repo: 1024px for the floor, 640px for overlays).

## Related Issues

- Found by ce-review (correctness + julik-frontend-races + adversarial reviewers converging) on PR #1; fixed in commit `5abfc4a`.
- Deliberately unfixed neighbors, documented in `.context/compound-engineering/ce-review/2026-07-31-mobile-responsive/summary.md`: avatar position still resets across the breakpoint (cosmetic), walk animation restarts rather than resumes.
