import React from 'react';
import { GlobeIcon } from 'lucide-react';
import { PHASES, phaseById } from '../data/path';
import { useGame } from '../state/GameContext';

export function Hud() {
  const { profile, currentPhase, phaseProgress, xp, revenue, backing, siteUrl, openRoom } =
  useGame();
  const active = phaseById(currentPhase);
  const { done, total } = phaseProgress(currentPhase);

  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-3xl border-2 border-ink/10 bg-parchment px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-8 items-end gap-[3px]" aria-hidden>
          <span className="h-2.5 w-[5px] rounded-sm bg-gold" />
          <span className="h-4 w-[5px] rounded-sm bg-ember" />
          <span className="h-6 w-[5px] rounded-sm bg-ocean" />
          <span className="h-8 w-[5px] rounded-sm bg-ink" />
        </span>
        <div>
          <p className="font-display text-base font-black uppercase leading-none tracking-tight">
            First Profit
          </p>
          <button
            type="button"
            onClick={() => openRoom('website')}
            className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-graphite hover:text-ink">
            
            <GlobeIcon className="h-3 w-3" /> {siteUrl}
          </button>
        </div>
      </div>

      {/* current phase, plus quiet pips for what is still shut */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2 rounded-xl border-2 px-3 py-1.5"
          style={{ backgroundColor: active.tint, borderColor: active.color }}>
          
          <span
            className="flex h-5 w-5 items-center justify-center rounded-md font-mono text-[10px] font-bold text-white"
            style={{ backgroundColor: active.color }}>
            
            {active.index}
          </span>
          <span className="text-xs font-semibold" style={{ color: active.color }}>
            {active.name}
          </span>
          <span className="font-mono text-[10px] text-graphite">
            {done}/{total} criteria
          </span>
        </div>
        <div className="hidden items-center gap-1 sm:flex" aria-hidden>
          {PHASES.filter((p) => p.index > active.index).map((p) =>
          <span
            key={p.id}
            title={`${p.name} — locked`}
            className="h-1.5 w-6 rounded-full bg-ink/12" />

          )}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <Stat label="Backed" value={`$${backing}`} />
        <Stat label="Sales" value={`$${revenue}`} sub="of $1,000" />
        <span
          className="rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: active.color, backgroundColor: active.tint }}>
          
          {profile.firstName || 'Founder'} · {xp} XP
        </span>
      </div>
    </header>);

}

function Stat({ label, value, sub }: {label: string;value: string;sub?: string;}) {
  return (
    <div className="text-right">
      <p className="font-mono text-[10px] uppercase tracking-wider text-graphite">{label}</p>
      <p className="font-display text-lg font-bold leading-none">{value}</p>
      {sub ? <p className="font-mono text-[10px] text-graphite">{sub}</p> : null}
    </div>);

}