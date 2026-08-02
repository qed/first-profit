import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  WavesIcon,
  Music2Icon,
  TrophyIcon,
  PaletteIcon,
  BookOpenIcon,
  CakeIcon,
  MedalIcon,
  SparklesIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
  MoveIcon } from
'lucide-react';
import { ACTIVITIES, DAYS, KID_STYLES, type Activity, type Slot } from './demoData';
import { EffortMeter } from './EffortMeter';

const ICONS = {
  swim: WavesIcon,
  piano: Music2Icon,
  football: TrophyIcon,
  art: PaletteIcon,
  tutor: BookOpenIcon,
  party: CakeIcon,
  meet: MedalIcon
} as const;

type SlotMap = Record<string, Slot>;

const toMap = (key: 'chaos' | 'sorted'): SlotMap =>
ACTIVITIES.reduce<SlotMap>((acc, activity) => {
  acc[activity.id] = { ...activity[key] };
  return acc;
}, {});

const EFFORT_LABELS = ['Almost zero', 'One argument', 'Two arguments', 'Full meltdown'];

export function DemoPlanner() {
  const [slots, setSlots] = useState<SlotMap>(() => toMap('chaos'));
  const [isSorted, setIsSorted] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const conflicts = useMemo(() => {
    const seen = new Map<string, string[]>();
    ACTIVITIES.forEach((activity) => {
      const slot = slots[activity.id];
      const key = `${slot.day}-${slot.mins}`;
      seen.set(key, [...(seen.get(key) ?? []), activity.id]);
    });
    const clashing = new Set<string>();
    seen.forEach((ids) => {
      if (ids.length > 1) ids.forEach((id) => clashing.add(id));
    });
    return clashing;
  }, [slots]);

  const conflictCount = useMemo(() => {
    const groups = new Set<string>();
    conflicts.forEach((id) => {
      const slot = slots[id];
      groups.add(`${slot.day}-${slot.mins}`);
    });
    return groups.size;
  }, [conflicts, slots]);

  const effort = conflictCount === 0 ? 4 : Math.min(96, 30 + conflictCount * 22);
  const effortLabel = EFFORT_LABELS[Math.min(conflictCount, 3)];

  const byDay = useMemo(
    () =>
    DAYS.map((_, dayIndex) =>
    ACTIVITIES.filter((a) => slots[a.id].day === dayIndex).sort(
      (a, b) => slots[a.id].mins - slots[b.id].mins
    )
    ),
    [slots]
  );

  const sortItOut = () => {
    setSlots(toMap('sorted'));
    setIsSorted(true);
    setSelected(null);
  };

  const reset = () => {
    setSlots(toMap('chaos'));
    setIsSorted(false);
    setSelected(null);
  };

  const moveTo = (dayIndex: number) => {
    if (!selected) return;
    setSlots((prev) => ({ ...prev, [selected]: { ...prev[selected], day: dayIndex } }));
    setSelected(null);
  };

  return (
    <section id="demo" className="w-full px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tomato">
              The demo (no email required)
            </span>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">
              This is a real family&rsquo;s week. Go on, fix it.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-subtle">
              Below is the Okafor family&rsquo;s week as their calendar actually looks. Tap a card and
              drop it on another day, or let AZEAP do the whole thing.
            </p>
          </div>

          <div className="w-full max-w-xs shrink-0 rounded-lg border border-rule bg-white p-4 shadow-planner">
            <EffortMeter value={effort} label={effortLabel} />
            <div className="mt-3 flex items-center gap-2 text-xs text-subtle">
              {conflictCount > 0 ?
              <>
                  <TriangleAlertIcon className="h-4 w-4 shrink-0 text-tomato" />
                  {conflictCount} double-booking{conflictCount > 1 ? 's' : ''} this week
                </> :

              <>
                  <SparklesIcon className="h-4 w-4 shrink-0 text-mint" />
                  Nobody has to be in two places at once
                </>
              }
            </div>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={sortItOut}
            className="inline-flex items-center gap-2 rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-paper shadow-sticker transition-transform hover:-translate-y-0.5">
            
            <SparklesIcon className="h-4 w-4 text-marker" />
            Sort my week out
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-md border border-ink/20 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink/50">
            
            <RotateCcwIcon className="h-4 w-4" />
            Back to real life
          </button>
          <p className="font-hand text-lg text-tomato/90" aria-live="polite">
            {selected ?
            'now tap a day to move it →' :
            isSorted ?
            'that took 0.4 seconds and no group chat' :
            'tap any card to pick it up'}
          </p>
        </div>

        <div className="mt-6 overflow-x-auto pb-3">
          <div className="paper-grid grid min-w-[860px] grid-cols-7 gap-2 rounded-lg border border-rule bg-white/70 p-2.5 shadow-planner">
            {DAYS.map((day, dayIndex) => {
              const items = byDay[dayIndex];
              const isTarget = Boolean(selected) && !items.some((a) => a.id === selected);
              return (
                <div key={day} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => moveTo(dayIndex)}
                    disabled={!isTarget}
                    aria-label={selected ? `Move activity to ${day}` : day}
                    className={`mb-2 flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                    isTarget ?
                    'border-dashed border-tomato bg-tomato/5 text-tomato' :
                    'border-transparent text-ink'} ${
                    !selected ? 'cursor-default' : ''}`}>
                    
                    <span className="font-display text-sm font-semibold">{day}</span>
                    {isTarget ?
                    <MoveIcon className="h-3.5 w-3.5" /> :

                    <span className="text-[10px] text-subtle">{items.length || ''}</span>
                    }
                  </button>

                  <div className="flex min-h-[190px] flex-col gap-2">
                    <AnimatePresence initial={false}>
                      {items.map((activity) =>
                      <ActivityCard
                        key={activity.id}
                        activity={activity}
                        slot={slots[activity.id]}
                        hasConflict={conflicts.has(activity.id)}
                        isSelected={selected === activity.id}
                        onSelect={() =>
                        setSelected((cur) => cur === activity.id ? null : activity.id)
                        } />

                      )}
                    </AnimatePresence>

                    {items.length === 0 &&
                    <motion.div
                      layout
                      className="flex flex-1 items-center justify-center rounded-md border border-dashed border-rule px-2 py-4 text-center">
                      
                        <span className="font-hand text-base leading-tight text-mint">
                          nothing booked
                        </span>
                      </motion.div>
                    }
                  </div>
                </div>);

            })}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
          { value: isSorted ? '0' : '3', label: 'double-bookings' },
          { value: isSorted ? '3' : '0', label: 'carpools arranged' },
          { value: isSorted ? '4' : '0', label: 'fewer car trips' },
          { value: isSorted ? '2' : '0', label: 'free evenings' }].
          map((stat) =>
          <div key={stat.label} className="rounded-md border border-rule bg-white px-3 py-3">
              <div className="font-display text-2xl font-bold text-ink">{stat.value}</div>
              <div className="text-xs text-subtle">{stat.label}</div>
            </div>
          )}
        </div>
      </div>
    </section>);

}

type ActivityCardProps = {
  activity: Activity;
  slot: Slot;
  hasConflict: boolean;
  isSelected: boolean;
  onSelect: () => void;
};

function ActivityCard({ activity, slot, hasConflict, isSelected, onSelect }: ActivityCardProps) {
  const Icon = ICONS[activity.icon];
  const kid = KID_STYLES[activity.kid];

  return (
    <motion.button
      type="button"
      layout
      layoutId={activity.id}
      onClick={onSelect}
      aria-pressed={isSelected}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className={`w-full rounded-md border bg-white p-2.5 text-left shadow-sm transition-colors ${
      hasConflict ? 'border-tomato/70 bg-tomato/[0.04]' : 'border-rule'} ${
      isSelected ? 'ring-2 ring-tomato ring-offset-1' : ''}`}>
      
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink/70" strokeWidth={2} />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold leading-tight text-ink">
            {activity.title}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${kid.dot}`} />
            <span className="text-[11px] text-subtle">
              {activity.kid} · {slot.time}
            </span>
          </div>
        </div>
      </div>
      {slot.note &&
      <p
        className={`mt-1.5 font-hand text-[15px] leading-tight ${
        hasConflict || slot.warn ? 'text-tomato' : 'text-mint'}`
        }>
        
          {slot.note}
        </p>
      }
      {hasConflict && !slot.note &&
      <p className="mt-1.5 font-hand text-[15px] leading-tight text-tomato">two places at once</p>
      }
    </motion.button>);

}