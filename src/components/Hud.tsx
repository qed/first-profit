import React from 'react';
import { PHASES, phaseById } from '../data/path';
import { useGame } from '../state/GameContext';
import { Chip } from './ui';

export function Hud() {
  const { company, currentPhase, phaseProgress, xp, revenue, profit } = useGame();
  const active = phaseById(currentPhase);

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl border-2 border-ink/10 bg-parchment px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 items-end gap-[3px]" aria-hidden>
          <span className="h-3 w-[5px] rounded-sm bg-gold" />
          <span className="h-5 w-[5px] rounded-sm bg-ember" />
          <span className="h-7 w-[5px] rounded-sm bg-ocean" />
          <span className="h-9 w-[5px] rounded-sm bg-ink" />
        </span>
        <div>
          <p className="font-display text-base font-black uppercase tracking-tight leading-none">
            First Profit
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-graphite">
            {company.founder} · {company.name}
          </p>
        </div>
      </div>

      <nav
        aria-label="The Path"
        className="order-3 flex w-full items-center justify-between gap-1 lg:order-none lg:w-auto lg:justify-start lg:gap-1.5">
        {PHASES.map((phase) => {
          const { done, total } = phaseProgress(phase.id);
          const isActive = phase.id === currentPhase;
          const isPassed = done === total;
          return (
            <div
              key={phase.id}
              className={[
              'flex items-center gap-1.5 rounded-xl border-2 px-1.5 py-1.5 lg:gap-2 lg:px-2.5',
              isActive ? 'border-ink/25' : 'border-transparent'].
              join(' ')}
              style={{ backgroundColor: isActive || isPassed ? phase.tint : 'transparent' }}
              title={phase.promise}>
              
              <span
                className="flex h-5 w-5 items-center justify-center rounded-md font-mono text-[10px] font-bold text-white"
                style={{ backgroundColor: isPassed || isActive ? phase.color : '#B7AF9E' }}>
                
                {phase.index}
              </span>
              <span className="hidden text-xs font-semibold sm:inline" style={{ color: phase.color }}>
                {phase.name}
              </span>
              <span className="font-mono text-[10px] text-graphite">
                {done}/{total}
              </span>
            </div>);

        })}
      </nav>

      <div className="ml-auto flex items-center gap-4">
        <Stat label="Sales" value={`$${revenue.toLocaleString()}`} sub="of $1,000" />
        <Stat label="Profit" value={`$${Math.max(0, Math.round(profit)).toLocaleString()}`} sub="of $10,000" />
        <Chip color={active.color} tint={active.tint}>
          {xp} XP
        </Chip>
      </div>
    </header>);

}

function Stat({ label, value, sub }: {label: string;value: string;sub: string;}) {
  return (
    <div className="text-right">
      <p className="font-mono text-[10px] uppercase tracking-wider text-graphite">{label}</p>
      <p className="font-display text-lg font-bold leading-none">{value}</p>
      <p className="font-mono text-[10px] text-graphite">{sub}</p>
    </div>);

}