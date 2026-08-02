import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckIcon, LockIcon } from 'lucide-react';
import { ROOMS, doorOf, roomById } from '../data/rooms';
import { phaseById, type RoomId } from '../data/path';
import { useGame } from '../state/GameContext';
import { Avatar } from './Avatar';

export function FactoryFloor({
  walkTo,
  onArrived



}: {walkTo: RoomId | null;onArrived: (room: RoomId) => void;}) {
  const { profile, isRoomUnlocked, roomProgress, nextUp, justUnlocked } = useGame();
  const [pos, setPos] = useState({ x: 18, y: 41 });
  const timer = useRef<number | null>(null);

  const walk = (room: RoomId, thenOpen: boolean) => {
    setPos(doorOf(roomById(room)));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (thenOpen) onArrived(room);
    }, 700);
  };

  useEffect(() => {
    if (walkTo) walk(walkTo, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkTo]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

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
      
      <div className="pointer-events-none absolute inset-x-[4%] top-[40%] h-[3px] rounded bg-ember/15" />
      <p className="pointer-events-none absolute left-1/2 top-[70%] -translate-x-1/2 font-display text-[13px] font-bold uppercase tracking-[0.35em] text-ink/10">
        The Path
      </p>

      {ROOMS.map((room) => {
        const unlocked = isRoomUnlocked(room.id);
        const { done, total } = roomProgress(room.id);
        const phase = phaseById(room.phase);
        const isNext = nextUp?.step.room === room.id;
        const isFresh = justUnlocked.includes(room.id);

        if (!unlocked) {
          return (
            <div
              key={room.id}
              className="absolute z-10 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink/15 bg-ink/[0.03] p-3 text-center"
              style={{
                left: `${room.x}%`,
                top: `${room.y}%`,
                width: `${room.w}%`,
                height: `${room.h}%`
              }}>
              
              <LockIcon className="h-4 w-4 text-graphite/50" />
              <p className="mt-1.5 font-mono text-[10px] uppercase leading-tight tracking-wider text-graphite/70">
                {room.lockedHint}
              </p>
            </div>);

        }

        return (
          <motion.button
            key={room.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              walk(room.id, true);
            }}
            initial={isFresh ? { scale: 0.8, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ y: -4 }}
            className={[
            'group absolute z-20 flex flex-col justify-between rounded-2xl border-2 border-ink/15 bg-parchment p-3 text-left shadow-pod transition-shadow hover:shadow-[0_14px_0_rgba(26,23,18,0.16)]',
            isNext ? 'ring-4 ring-go/30' : ''].
            join(' ')}
            style={{
              left: `${room.x}%`,
              top: `${room.y}%`,
              width: `${room.w}%`,
              height: `${room.h}%`
            }}>
            
            {isNext ?
            <span className="absolute -top-3 right-3 rounded-full bg-go px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                You are here
              </span> :
            null}

            <span className="flex items-start justify-between gap-2">
              <span className="text-2xl" aria-hidden>
                {room.sign}
              </span>
              {total > 0 && done === total ?
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-go text-white">
                  <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />
                </span> :
              null}
            </span>

            <span className="block">
              <span className="block font-display text-[15px] font-bold leading-tight">
                {room.name}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-graphite">
                {room.tagline}
              </span>
              {total > 0 ?
              <span className="mt-2 flex items-center gap-1" aria-hidden>
                  {Array.from({ length: total }).map((_, i) =>
                <span
                  key={i}
                  className="h-1.5 flex-1 rounded-full"
                  style={{ backgroundColor: i < done ? phase.color : 'rgba(26,23,18,0.12)' }} />

                )}
                </span> :
              null}
            </span>
          </motion.button>);

      })}

      <Avatar x={pos.x} y={pos.y} name={profile.firstName || 'You'} />

      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink/60 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-paper">
        Click the floor to walk · click a pod to go in
      </p>
    </div>);

}