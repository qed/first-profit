import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckIcon, ClockIcon, GraduationCapIcon } from 'lucide-react';
import { WORKSHOPS } from '../../data/workshops';
import { phaseById } from '../../data/path';
import { useGame } from '../../state/GameContext';
import { Btn, Panel } from '../ui';

export function WorkshopPanel() {
  const { workshopsDone, completeWorkshop, currentPhase } = useGame();
  const [open, setOpen] = useState<string | null>(WORKSHOPS[0].id);
  const currentIndex = phaseById(currentPhase).index;

  return (
    <Panel
      title="Workshop Timetable"
      hint={`${workshopsDone.length}/${WORKSHOPS.length} skills earned`}>
      
      <p className="mb-4 text-sm leading-relaxed text-graphite">
        Short workshops, one skill each. Sit one whenever you are stuck — they map onto the same
        five phases of The Path.
      </p>
      <ul className="space-y-2.5">
        {WORKSHOPS.map((workshop) => {
          const phase = phaseById(workshop.phase);
          const done = workshopsDone.includes(workshop.id);
          const locked = phase.index > currentIndex + 1;
          const isOpen = open === workshop.id;
          return (
            <li
              key={workshop.id}
              className={[
              'overflow-hidden rounded-2xl border-2 bg-white',
              done ? 'border-go/40' : 'border-ink/10'].
              join(' ')}>
              
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : workshop.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink/[0.03]">
                
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: done ? '#1F9E4D' : phase.color }}>
                  
                  {done ?
                  <CheckIcon className="h-4 w-4" strokeWidth={3} /> :

                  <GraduationCapIcon className="h-4 w-4" />
                  }
                </span>
                <span className="flex-1">
                  <span className="block font-display text-base font-bold leading-tight">
                    {workshop.title}
                  </span>
                  <span className="block text-xs text-graphite">{workshop.promise}</span>
                </span>
                <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-graphite">
                  <ClockIcon className="h-3 w-3" /> {workshop.minutes}m
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen ?
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden">
                  
                    <div className="border-t-2 border-dashed border-ink/10 px-4 py-4">
                      <ol className="space-y-2">
                        {workshop.beats.map((beat, i) =>
                      <li key={i} className="flex gap-3 text-sm">
                            <span
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold text-white"
                          style={{ backgroundColor: phase.color }}>
                          
                              {i + 1}
                            </span>
                            <span className="text-graphite">{beat}</span>
                          </li>
                      )}
                      </ol>
                      <p
                      className="mt-3 rounded-xl px-3.5 py-2.5 text-xs font-medium"
                      style={{ backgroundColor: phase.tint, color: phase.color }}>
                      
                        Takeaway · {workshop.takeaway}
                      </p>
                      <div className="mt-3">
                        <Btn
                        tone={done ? 'quiet' : 'ember'}
                        disabled={done || locked}
                        onClick={() => completeWorkshop(workshop.id)}>
                        
                          {done ?
                        'Skill earned' :
                        locked ?
                        `Unlocks in Phase ${phase.index}` :
                        'Mark workshop complete'}
                        </Btn>
                      </div>
                    </div>
                  </motion.div> :
                null}
              </AnimatePresence>
            </li>);

        })}
      </ul>
    </Panel>);

}