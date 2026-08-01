import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** The bobbing founder figure with name tag, without any positioning. */
export function AvatarSprite({ name }: {name: string;}) {
  // Respect prefers-reduced-motion: hold the figure static instead of bobbing.
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
      transition={reduceMotion ? undefined : { repeat: Infinity, duration: 2, ease: 'easeInOut' }}
      className="flex flex-col items-center">

      {/* max-w + truncate so a long child-entered first name can never push past
          the 390px viewport (no-horizontal-scroll is a hard rule). */}
      <span className="mb-1 block max-w-[7.5rem] truncate rounded-full bg-ink px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-paper">
        {name}
      </span>
      <svg width="34" height="46" viewBox="0 0 34 46" aria-hidden>
        <ellipse cx="17" cy="44" rx="11" ry="2.5" fill="rgba(26,23,18,0.18)" />
        <rect x="8" y="20" width="18" height="19" rx="7" fill="#2F5D8C" />
        <rect x="12" y="36" width="4" height="8" rx="2" fill="#1A1712" />
        <rect x="18" y="36" width="4" height="8" rx="2" fill="#1A1712" />
        <circle cx="17" cy="12" r="9" fill="#F0C89A" />
        <path d="M8 11a9 9 0 0 1 18 0v-1a9 9 0 0 0-18 0z" fill="#E0562A" />
        <path d="M7 11h20a1.5 1.5 0 0 1 0 3H7a1.5 1.5 0 0 1 0-3z" fill="#E0562A" />
        <circle cx="14" cy="13" r="1.3" fill="#1A1712" />
        <circle cx="20" cy="13" r="1.3" fill="#1A1712" />
      </svg>
    </motion.div>);

}

export function Avatar({ x, y, name }: {x: number;y: number;name: string;}) {
  return (
    <motion.div
      className="pointer-events-none absolute z-30"
      style={{ left: 0, top: 0 }}
      animate={{ left: `${x}%`, top: `${y}%` }}
      transition={{ type: 'spring', stiffness: 60, damping: 16 }}>

      <div className="-translate-x-1/2 -translate-y-full">
        <AvatarSprite name={name} />
      </div>
    </motion.div>);

}
