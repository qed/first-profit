/**
 * The factory floor, fpv2 (handoff §H). Keeps the matchMedia(1024px) desktop /
 * mobile swap and the lifted-intent contract from
 * docs/solutions/ui-bugs/breakpoint-crossing-drops-navigation:
 *
 *   - `walkTo` (a WalkIntent) is owned by the parent (screens/Factory), ABOVE the
 *     conditional mount. Card taps call `onWalk` → parent sets `walkTo`. Each
 *     variant's `useEffect([walkTo])` drives its own walk animation and, on
 *     arrival, calls `onArrived(intent)`. The parent runs the real action and
 *     clears `walkTo` only in `onArrived` (at-least-once). Crossing lg unmounts
 *     the active variant and cancels its local timer, but the intent survives in
 *     the parent, so the freshly-mounted variant's effect resumes it on mount.
 *   - `floorView` (phases | sell) also lives in the parent — it must survive the
 *     breakpoint swap too, so it is NOT variant-local state.
 *   - Dialog / runner / picker open-state lives in the gameCore reducer (in the
 *     provider, above everything), so those survive the swap for free.
 */
import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/GameContext";
import type { PhaseId, RoomId } from "../data/path";
import { AvatarSprite } from "./Avatar";
import { MobilePath } from "./MobilePath";
import { PhasesFloor } from "./PhasesFloor";
import { CriterionFloor } from "./CriterionFloor";

const DESKTOP_QUERY = "(min-width: 1024px)";

/** What a card tap wants to happen once the avatar has walked over. */
export type WalkIntent =
  | { kind: "openPhaseFloor"; phase: PhaseId }
  | { kind: "openRoom"; room: RoomId }
  | { kind: "enterCriterion"; stepId: string }
  /** Open the idea summary dialog. Carries the idea's stable ID, not an index
   *  (Change #7 review P1): a cross-tab deletion can reindex the ideas array
   *  while the ~550ms walk is in flight, and an index-addressed intent would
   *  silently arrive on a DIFFERENT idea. Arrival resolves the id against
   *  live state and no-ops when it is gone. */
  | { kind: "openIdea"; ideaId: string }
  | { kind: "createIdea" }
  /** Open the PromoteBusiness screen (Unit 8 Tier C2) — coach CTA + Grow card. */
  | { kind: "openPromote" };

/** Which sub-floor is showing: the Path overview or one phase's criterion floor. */
export type FloorView = "phases" | PhaseId;

export interface FloorProps {
  walkTo: WalkIntent | null;
  onArrived: (intent: WalkIntent) => void;
  /** Route taps through the parent's walkTo so an in-flight walk survives the
   * desktop/mobile variant swapping at the lg breakpoint. */
  onWalk: (intent: WalkIntent) => void;
  floorView: FloorView;
  /** Immediate (no-walk) return to the phases view; a parent-level setter
   *  (which ALSO cancels any in-flight walk — unit review FIX 1b). */
  onBack: () => void;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

export function FactoryFloor(props: FloorProps) {
  return useIsDesktop() ? <DesktopFloor {...props} /> : <MobilePath {...props} />;
}

const HINT = "Click the floor to walk · click a room to enter it";

/**
 * How far above the floor's bottom border the avatar stands after a Next Step
 * coach walk (owner spec 2026-08-04). The coach button is docked down there,
 * so the avatar meets it rather than stopping in the middle of the room.
 */
const COACH_STOP_ABOVE_BOTTOM_PX = 120;

function DesktopFloor({ walkTo, onArrived, onWalk, floorView, onBack }: FloorProps) {
  const { profile } = useGame();
  const [pos, setPos] = useState({ x: 50, y: 94 });
  const timer = useRef<number | null>(null);
  // Counts floor clicks, so a walk can tell "the learner clicked somewhere on
  // this floor" (walk there) from "the walk came from outside" (walk to the
  // coach's spot). Refs, not state: this must not cause a render of its own.
  const clickSeq = useRef(0);
  const walkedSeq = useRef(0);
  const floorRef = useRef<HTMLDivElement>(null);

  /**
   * Where the avatar stands for a coach-driven walk, as a `top` percentage.
   * The sprite is `-translate-y-full`, so `top` places its FEET — this returns
   * the percentage that puts them COACH_STOP_ABOVE_BOTTOM_PX above the floor's
   * bottom border. Derived from the live height because the floor resizes with
   * the viewport; the constant fallback covers a not-yet-measured mount (jsdom
   * reports 0), and it is the same ~82% the pixel math lands on at a typical
   * desktop floor height.
   */
  const coachStopPercent = () => {
    const h = floorRef.current?.clientHeight ?? 0;
    if (h <= COACH_STOP_ABOVE_BOTTOM_PX) return 82;
    return ((h - COACH_STOP_ABOVE_BOTTOM_PX) / h) * 100;
  };

  // Drive the walk from the parent's intent (survives the breakpoint swap).
  // walkTo → null is CANCELLATION (unit review FIX 1b): the dep change makes
  // the cleanup below clear the pending arrival timer, so the intent never
  // fires; the early return then arms nothing new.
  useEffect(() => {
    if (!walkTo) return;
    // WALK TO THE THING YOU CLICKED (owner spec 2026-08-04). A card tap
    // bubbles to onFloorClick below, which has already pointed the avatar at
    // the click, so this effect must NOT drag it back anywhere. When a walk
    // starts WITHOUT a floor click — the docked Next Step coach and the nav
    // sit outside this container — there is nothing on the floor to walk to,
    // so the avatar heads to the coach's own corner of the room: bottom
    // center, standing COACH_STOP_ABOVE_BOTTOM_PX above the bottom border.
    // The click counter is how we tell the two apart.
    if (clickSeq.current === walkedSeq.current) setPos({ x: 50, y: coachStopPercent() });
    walkedSeq.current = clickSeq.current;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onArrived(walkTo), 550);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkTo]);

  const onFloorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
    clickSeq.current += 1;
  };

  return (
    <div
      ref={floorRef}
      className="fp-grid relative h-full w-full overflow-hidden rounded-[22px] border-2 border-[hsl(14_78%_54%/0.5)] bg-[hsl(38_40%_92%)]"
      onClick={onFloorClick}
      role="application"
      aria-label="First Profit factory floor"
    >
      {/* Content scrolls within the floor panel. Clicks on empty area bubble to
          onFloorClick (cosmetic avatar walk); card buttons handle their own tap. */}
      <div className="absolute inset-0 overflow-y-auto p-7 pb-14">
        {floorView === "phases" ? (
          <PhasesFloor onWalk={onWalk} />
        ) : (
          <CriterionFloor phase={floorView} onWalk={onWalk} onBack={onBack} />
        )}
      </div>

      <div
        className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full"
        // .5s, deliberately SHORTER than the 550ms arrival timer above, so the
        // avatar visibly finishes its walk before the action fires (owner spec
        // 2026-08-04: move first, then open). It used to be .8s, which opened
        // the dialog while the sprite was still sliding.
        style={{ left: `${pos.x}%`, top: `${pos.y}%`, transition: "left .5s cubic-bezier(.22,1,.36,1), top .5s cubic-bezier(.22,1,.36,1)" }}
      >
        {/* The walking avatar carries the child's comic cover too (v3 Unit 7) —
            this is the lg+ twin of MobilePath's top-of-journey sprite, and the
            two must not disagree about who the kid is across the breakpoint. */}
        <AvatarSprite
          name={profile.firstName || profile.handle || "Founder"}
          coverUrl={profile.coverUrl}
        />
      </div>

      <p className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[hsl(25_34%_20%/0.55)] px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[hsl(40_55%_97%)]">
        {HINT}
      </p>
    </div>
  );
}
