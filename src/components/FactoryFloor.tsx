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
import type { RoomId } from "../data/path";
import { AvatarSprite } from "./Avatar";
import { MobilePath } from "./MobilePath";
import { PhasesFloor } from "./PhasesFloor";
import { SellFloor } from "./SellFloor";

const DESKTOP_QUERY = "(min-width: 1024px)";

/** What a card tap wants to happen once the avatar has walked over. */
export type WalkIntent =
  | { kind: "openSellFloor" }
  | { kind: "openRoom"; room: RoomId }
  | { kind: "enterCriterion"; stepId: string }
  | { kind: "openIdea"; ideaIndex: number }
  | { kind: "createIdea" };

export type FloorView = "phases" | "sell";

export interface FloorProps {
  walkTo: WalkIntent | null;
  onArrived: (intent: WalkIntent) => void;
  /** Route taps through the parent's walkTo so an in-flight walk survives the
   * desktop/mobile variant swapping at the lg breakpoint. */
  onWalk: (intent: WalkIntent) => void;
  floorView: FloorView;
  /** Immediate (no-walk) return to the phases view; a parent-level setter. */
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

function DesktopFloor({ walkTo, onArrived, onWalk, floorView, onBack }: FloorProps) {
  const { profile } = useGame();
  const [pos, setPos] = useState({ x: 50, y: 94 });
  const timer = useRef<number | null>(null);

  // Drive the walk from the parent's intent (survives the breakpoint swap).
  useEffect(() => {
    if (!walkTo) return;
    // Cosmetic: glide toward the middle of the floor, then fire the intent.
    setPos({ x: 50, y: 46 });
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
  };

  return (
    <div
      className="fp-grid relative h-full w-full overflow-hidden rounded-[22px] border-2 border-[hsl(14_78%_54%/0.5)] bg-[hsl(38_40%_92%)]"
      onClick={onFloorClick}
      role="application"
      aria-label="First Profit factory floor"
    >
      {/* Content scrolls within the floor panel. Clicks on empty area bubble to
          onFloorClick (cosmetic avatar walk); card buttons handle their own tap. */}
      <div className="absolute inset-0 overflow-y-auto p-7 pb-14">
        {floorView === "phases" ? <PhasesFloor onWalk={onWalk} /> : <SellFloor onWalk={onWalk} onBack={onBack} />}
      </div>

      <div
        className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full"
        style={{ left: `${pos.x}%`, top: `${pos.y}%`, transition: "left .8s cubic-bezier(.22,1,.36,1), top .8s cubic-bezier(.22,1,.36,1)" }}
      >
        <AvatarSprite name={profile.firstName || profile.handle || "Founder"} />
      </div>

      <p className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[hsl(25_34%_20%/0.55)] px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[hsl(40_55%_97%)]">
        {HINT}
      </p>
    </div>
  );
}
