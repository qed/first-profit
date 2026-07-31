import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckIcon, LockIcon } from 'lucide-react';
import { ROOMS } from '../data/rooms';
import { phaseById, type RoomId } from '../data/path';
import { useGame } from '../state/GameContext';
import { AvatarSprite } from './Avatar';

/**
 * Below the `lg` breakpoint the 2D factory floor becomes this scrollable
 * vertical path: the same pods in phase order as full-width cards, with the
 * founder avatar hopping to whichever card is current.
 */
export function MobilePath({
  walkTo,
  onArrived
}: {walkTo: RoomId | null;onArrived: (room: RoomId) => void;}) {
  const { company, isRoomUnlocked, roomProgress, nextStep } = useGame();
  const [current, setCurrent] = useState<RoomId>(() => nextStep?.room ?? 'idea');
  const timer = useRef<number | null>(null);
  const cards = useRef<Partial<Record<RoomId, HTMLLIElement | null>>>({});

  const walk = (room: RoomId, thenOpen: boolean) => {
    setCurrent(room);
    cards.current[room]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (thenOpen) onArrived(room);
    }, 600);
  };

  useEffect(() => {
    if (walkTo) walk(walkTo, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkTo]);

  useEffect(() => () => {if (timer.current) window.clearTimeout(timer.current);}, []);

  return (
    <div className="fp-grid relative h-full w-full rounded-3xl border-2 border-ink/10 bg-[#F1EADC] px-4 pt-6">
      <p className="pointer-events-none text-center font-display text-[13px] font-bold uppercase tracking-[0.35em] text-ink/15">
        The Path
      </p>

      {/* pb reserves space so the fixed Next Step coach never covers the last card */}
      <ol className="mx-auto mt-4 flex w-full max-w-xl flex-col pb-80">
        {ROOMS.map((room, i) => {
          const unlocked = isRoomUnlocked(room.id);
          const { done, total } = roomProgress(room.id);
          const phase = phaseById(room.phase);
          const isNext = nextStep?.room === room.id;
          return (
            <li
              key={room.id}
              ref={(el) => {cards.current[room.id] = el;}}
              className="relative">

              {i > 0 ?
              <span
                className="mx-auto block h-6 w-[3px] rounded"
                style={{ backgroundColor: unlocked ? `${phase.color}33` : 'rgba(26,23,18,0.08)' }}
                aria-hidden /> :

              null}

              {current === room.id ?
              <motion.div
                layoutId="path-avatar"
                transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                className="pointer-events-none absolute -top-10 right-5 z-10 scale-90">

                  <AvatarSprite name={company.founder} />
                </motion.div> :
              null}

              <motion.button
                type="button"
                disabled={!unlocked}
                onClick={() => walk(room.id, true)}
                whileTap={unlocked ? { scale: 0.98 } : undefined}
                className={[
                'relative flex min-h-[5.5rem] w-full flex-col justify-between gap-2 rounded-2xl border-2 p-4 pt-5 text-left transition-shadow',
                unlocked ?
                'border-ink/15 bg-parchment shadow-pod' :
                'cursor-not-allowed border-dashed border-ink/15 bg-ink/[0.04]',
                isNext ? 'ring-4 ring-go/30' : ''].
                join(' ')}>

                <span
                  className="absolute -top-3 left-3 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
                  style={{ backgroundColor: unlocked ? phase.color : '#9A9384' }}>

                  {unlocked ? `Phase ${phase.index}` : 'Locked'}
                </span>

                <span className="flex items-start justify-between gap-2">
                  <span className="text-2xl" aria-hidden>
                    {unlocked ? room.sign : '🔒'}
                  </span>
                  {done === total && total > 0 ?
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-go text-white">
                      <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} />
                    </span> :
                  null}
                  {!unlocked ? <LockIcon className="h-4 w-4 text-graphite" /> : null}
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
                      {Array.from({ length: total }).map((_, j) =>
                    <span
                      key={j}
                      className="h-1.5 flex-1 rounded-full"
                      style={{
                        backgroundColor: j < done ? phase.color : 'rgba(26,23,18,0.12)'
                      }} />

                    )}
                    </span> :
                  null}
                </span>
              </motion.button>
            </li>);

        })}
      </ol>
    </div>);

}
