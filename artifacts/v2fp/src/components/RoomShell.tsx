import React from 'react';
import { motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { STEPS, phaseById, type RoomId } from '../data/path';
import { roomById } from '../data/rooms';
import { useGame } from '../state/GameContext';
import { StepCard } from './StepCard';

export function RoomShell({
  roomId,
  onClose,
  children




}: {roomId: RoomId;onClose: () => void;children: React.ReactNode;}) {
  const { nextUp, isStepVisible } = useGame();
  const room = roomById(roomId);
  const phase = phaseById(room.phase);
  const all = STEPS.filter((s) => s.room === roomId);
  const steps = all.filter(isStepVisible);
  const hidden = all.length - steps.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-3 sm:p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={room.name}
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border-2 border-ink/15 bg-paper shadow-pod">
        
        <header
          className="flex items-center justify-between gap-4 border-b-2 border-ink/10 px-6 py-4"
          style={{ backgroundColor: phase.tint }}>
          
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden>
              {room.sign}
            </span>
            <div>
              <h2 className="font-display text-2xl font-black leading-tight">{room.name}</h2>
              <p className="text-xs text-graphite">{room.tagline}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl border-2 border-ink/20 bg-parchment px-3 py-2 text-sm font-semibold hover:border-ink/50">
            
            <XIcon className="h-4 w-4" /> Back to the floor
          </button>
        </header>

        <div
          className={[
          'fp-scroll grid flex-1 gap-6 overflow-y-auto p-6',
          steps.length ? 'lg:grid-cols-[1.15fr_1fr]' : ''].
          join(' ')}>
          
          <div className="space-y-5">{children}</div>
          {steps.length ?
          <aside className="space-y-4">
              <h3 className="font-mono text-[11px] uppercase tracking-wider text-graphite">
                Criteria you can pass in here
              </h3>
              {steps.map((step) =>
            <StepCard key={step.id} step={step} highlight={nextUp?.step.id === step.id} />
            )}
              {hidden ?
            <p className="rounded-2xl border-2 border-dashed border-ink/15 px-4 py-3 text-xs text-graphite">
                  {hidden} more criterion{hidden === 1 ? '' : 'a'} open up in this room later on
                  The Path.
                </p> :
            null}
            </aside> :
          null}
        </div>
      </motion.div>
    </div>);

}