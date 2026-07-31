import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ROOMS, doorOf, roomById } from '../data/rooms';
import { phaseById, type RoomId } from '../data/path';
import { useGame } from '../state/GameContext';
import { Avatar } from './Avatar';
import { MobilePath } from './MobilePath';
import { PodCardContent } from './PodCardContent';

const DESKTOP_QUERY = '(min-width: 1024px)';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export interface FloorProps {
  walkTo: RoomId | null;
  onArrived: (room: RoomId) => void;
  /** Route pod taps through the parent's walkTo state so an in-flight walk
   * survives the desktop/mobile variant swapping at the lg breakpoint. */
  onWalk: (room: RoomId) => void;
}

export function FactoryFloor(props: FloorProps) {
  return useIsDesktop() ? <DesktopFloor {...props} /> : <MobilePath {...props} />;
}

function DesktopFloor({ walkTo, onArrived, onWalk }: FloorProps) {
  const { company, isRoomUnlocked, roomProgress, nextStep } = useGame();
  const [pos, setPos] = useState({ x: 50, y: 52 });
  const timer = useRef<number | null>(null);

  const walk = (room: RoomId, thenOpen: boolean) => {
    const target = doorOf(roomById(room));
    setPos(target);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (thenOpen) onArrived(room);
    }, 750);
  };

  useEffect(() => {
    if (walkTo) walk(walkTo, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkTo]);

  useEffect(() => () => {if (timer.current) window.clearTimeout(timer.current);}, []);

  const onFloorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({
      x: (e.clientX - rect.left) / rect.width * 100,
      y: (e.clientY - rect.top) / rect.height * 100
    });
  };

  return (
    <div
      className="fp-grid relative h-full w-full overflow-hidden rounded-3xl border-2 border-ink/10 bg-[#F1EADC]"
      onClick={onFloorClick}
      role="application"
      aria-label="First Profit factory floor">
      
      {/* floor markings */}
      <div className="pointer-events-none absolute inset-x-[4%] top-[40%] h-[3px] rounded bg-ember/20" />
      <div className="pointer-events-none absolute inset-y-[6%] left-[33.5%] w-[3px] rounded bg-ocean/15" />
      <div className="pointer-events-none absolute inset-y-[6%] right-[33.5%] w-[3px] rounded bg-ocean/15" />
      <p className="pointer-events-none absolute left-1/2 top-[68%] -translate-x-1/2 font-display text-[13px] font-bold uppercase tracking-[0.35em] text-ink/15">
        The Path
      </p>

      {ROOMS.map((room) => {
        const unlocked = isRoomUnlocked(room.id);
        const { done, total } = roomProgress(room.id);
        const phase = phaseById(room.phase);
        const isNext = nextStep?.room === room.id;
        return (
          <motion.button
            key={room.id}
            type="button"
            disabled={!unlocked}
            onClick={(e) => {
              e.stopPropagation();
              onWalk(room.id);
            }}
            whileHover={unlocked ? { y: -4 } : undefined}
            className={[
            'group absolute z-20 flex flex-col justify-between rounded-2xl border-2 p-3 text-left transition-shadow',
            unlocked ?
            'border-ink/15 bg-parchment shadow-pod hover:shadow-[0_14px_0_rgba(26,23,18,0.16)]' :
            'cursor-not-allowed border-dashed border-ink/15 bg-ink/[0.04]',
            isNext ? 'ring-4 ring-go/30' : ''].
            join(' ')}
            style={{
              left: `${room.x}%`,
              top: `${room.y}%`,
              width: `${room.w}%`,
              height: `${room.h}%`
            }}>

            <PodCardContent
              room={room}
              unlocked={unlocked}
              done={done}
              total={total}
              phase={phase} />

          </motion.button>);

      })}

      <Avatar x={pos.x} y={pos.y} name={company.founder} />

      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink/70 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-paper">
        Click the floor to walk · click a pod to go in
      </p>
    </div>);

}