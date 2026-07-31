import React from 'react';
import { CheckIcon, LockIcon } from 'lucide-react';
import type { Room } from '../data/rooms';
import type { Phase } from '../data/path';

/**
 * Shared inner markup for a pod: phase badge, sign/lock/check row, name,
 * tagline, and progress dots. The desktop floor pod and the mobile path card
 * both render this inside their own positioning/sizing button wrappers.
 */
export function PodCardContent({
  room,
  unlocked,
  done,
  total,
  phase
}: {room: Room;unlocked: boolean;done: number;total: number;phase: Phase;}) {
  return (
    <>
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
            {Array.from({ length: total }).map((_, i) =>
          <span
            key={i}
            className="h-1.5 flex-1 rounded-full"
            style={{
              backgroundColor: i < done ? phase.color : 'rgba(26,23,18,0.12)'
            }} />

          )}
          </span> :
        null}
      </span>
    </>);

}
