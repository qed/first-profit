import React from 'react';

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="relative flex h-8 w-8 -rotate-3 items-center justify-center rounded-[6px] border border-ink/80 bg-marker shadow-sticker">
        
        <span className="absolute inset-x-1 top-[6px] h-[1px] bg-ink/30" />
        <span className="absolute inset-x-1 top-[14px] h-[1px] bg-ink/30" />
        <span className="absolute inset-x-1 top-[22px] h-[1px] bg-ink/30" />
        <span className="relative font-hand text-lg font-bold leading-none text-ink">A</span>
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-lg font-bold tracking-tight text-ink">AZEAP</span>
        <span className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-subtle">
          Almost zero effort
        </span>
      </span>
    </span>);

}