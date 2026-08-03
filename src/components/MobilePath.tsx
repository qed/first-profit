/**
 * The <lg factory floor: the same Path / Company / Products rows and Sell
 * sub-floor as the desktop 2D floor, stacked vertically for phones. It honors
 * the SAME walkTo / onWalk / onArrived / floorView contract as DesktopFloor
 * (see FactoryFloor.tsx) — taps route up to the parent's intent so an in-flight
 * walk survives the lg breakpoint swap; the parent clears walkTo in onArrived.
 *
 * Bottom padding (pb-80) is preserved so a future bottom-docked Next Step coach /
 * HUD never covers the last card (the repo convention from CLAUDE.md).
 */
import { useEffect, useRef } from "react";
import { useGame } from "../state/GameContext";
import { AvatarSprite } from "./Avatar";
import { PhasesFloor } from "./PhasesFloor";
import { CriterionFloor } from "./CriterionFloor";
import type { FloorProps } from "./FactoryFloor";

export function MobilePath({ walkTo, onArrived, onWalk, floorView, onBack, onOpenSwitcher }: FloorProps) {
  const { profile } = useGame();
  const timer = useRef<number | null>(null);

  // Resume/complete any in-flight walk from the parent's intent. On this variant
  // the avatar is a fixed top sprite (cosmetic); the durable part is the intent.
  useEffect(() => {
    if (!walkTo) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onArrived(walkTo), 550);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkTo]);

  return (
    <div className="fp-grid h-full w-full overflow-y-auto rounded-[22px] border-2 border-[hsl(14_78%_54%/0.5)] bg-[hsl(38_40%_92%)]">
      <div className="flex justify-center pt-4">
        <AvatarSprite name={profile.firstName || profile.handle || "Founder"} />
      </div>
      {/* pb-80 keeps the bottom-docked Next Step coach clear of the last card
          (repo convention from CLAUDE.md — preserve this padding). */}
      <div className="px-4 pb-80 pt-2">
        {floorView === "phases" ? (
          <PhasesFloor onWalk={onWalk} onOpenSwitcher={onOpenSwitcher} />
        ) : (
          <CriterionFloor phase={floorView} onWalk={onWalk} onBack={onBack} onOpenSwitcher={onOpenSwitcher} />
        )}
      </div>
    </div>
  );
}
