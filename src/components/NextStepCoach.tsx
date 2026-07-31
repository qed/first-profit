import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRightIcon, ChevronDownIcon, PartyPopperIcon } from 'lucide-react';
import { phaseById } from '../data/path';
import { roomById } from '../data/rooms';
import { useGame } from '../state/GameContext';

export function NextStepCoach({ onGo }: {onGo: (room: string) => void;}) {
  const { nextStep, stepProgress } = useGame();
  const [open, setOpen] = useState(true);

  if (!nextStep) {
    return (
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-2xl border-2 border-go bg-parchment px-5 py-4 shadow-pod">
        <PartyPopperIcon className="h-6 w-6 text-go" />
        <div>
          <p className="font-display text-base font-bold">The Path is complete.</p>
          <p className="text-xs text-graphite">25 criteria passed. Time for the Capstone.</p>
        </div>
      </div>);

  }

  const phase = phaseById(nextStep.phase);
  const room = roomById(nextStep.room);
  const { done, total } = stepProgress(nextStep.id);

  return (
    <div className="fixed bottom-6 right-6 z-40 w-[min(92vw,26rem)]">
      <AnimatePresence initial={false}>
        {open ?
        <motion.div
          key="panel"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="mb-3 rounded-2xl border-2 border-ink/15 bg-parchment p-4 shadow-pod">
          
            <div className="flex items-start justify-between gap-3">
              <span
              className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white"
              style={{ backgroundColor: phase.color }}>
              
                Phase {phase.index} · {phase.name}
              </span>
              <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Hide the guide"
              className="rounded-lg p-1 text-graphite hover:bg-ink/5">
              
                <ChevronDownIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2.5 font-display text-lg font-bold leading-snug">{nextStep.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-graphite">{nextStep.coach}</p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-graphite">
              {room.name} · {done}/{total} tasks done
            </p>
          </motion.div> :
        null}
      </AnimatePresence>

      <div className="flex gap-2">
        {!open ?
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-2xl border-2 border-ink/15 bg-parchment px-4 font-mono text-[11px] uppercase tracking-wider text-graphite hover:border-ink/40">
          
            Guide
          </button> :
        null}
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => onGo(nextStep.room)}
          className="flex flex-1 items-center justify-between gap-3 rounded-2xl bg-go px-6 py-5 text-left text-white shadow-[0_8px_0_#166534] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-go/40">
          
          <span>
            <span className="block font-display text-2xl font-black leading-none">Next Step</span>
            <span className="mt-1 block font-mono text-[10px] uppercase tracking-wider text-white/80">
              Take me to {room.name}
            </span>
          </span>
          <ArrowRightIcon className="h-7 w-7" strokeWidth={2.5} />
        </motion.button>
      </div>
    </div>);

}