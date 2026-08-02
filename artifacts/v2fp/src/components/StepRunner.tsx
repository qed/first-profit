import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  DoorOpenIcon,
  PartyPopperIcon,
  XIcon } from
'lucide-react';
import { STEPS, phaseById, type RoomId } from '../data/path';
import { ROOMS, roomById } from '../data/rooms';
import { useGame } from '../state/GameContext';

export function StepRunner({
  onClose,
  onOpenRoom



}: {onClose: () => void;onOpenRoom: (room: RoomId) => void;}) {
  const { nextUp, toggleTask, isTaskDone, fields, setField, stepProgress } = useGame();
  const [celebrate, setCelebrate] = useState<{title: string;xp: number;opened: RoomId[];} | null>(
    null
  );

  if (!nextUp && !celebrate) {
    return (
      <Overlay onClose={onClose}>
        <div className="p-8 text-center">
          <PartyPopperIcon className="mx-auto h-10 w-10 text-go" />
          <h2 className="mt-3 font-display text-3xl font-black">The Path is complete.</h2>
          <p className="mt-2 text-sm text-graphite">All 25 criteria passed.</p>
        </div>
      </Overlay>);

  }

  if (celebrate) {
    return (
      <Overlay onClose={onClose}>
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="p-8 text-center">
          
          <motion.div
            initial={{ rotate: -12, scale: 0.6 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 12 }}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-go text-white">
            
            <CheckIcon className="h-9 w-9" strokeWidth={3} />
          </motion.div>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.25em] text-go">
            Criterion passed
          </p>
          <h2 className="mt-2 font-display text-3xl font-black leading-tight">{celebrate.title}</h2>
          <p className="mt-2 font-mono text-sm text-graphite">+{celebrate.xp} XP</p>

          {celebrate.opened.length ?
          <div className="mt-5 rounded-2xl border-2 border-dashed border-ember/40 bg-ember/5 p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-ember">
                New on the factory floor
              </p>
              {celebrate.opened.map((id) => {
              const room = roomById(id);
              return (
                <p key={id} className="mt-1.5 font-display text-lg font-bold">
                    {room.sign} {room.name}
                  </p>);

            })}
            </div> :
          null}

          <button
            type="button"
            onClick={() => setCelebrate(null)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-go px-5 py-4 font-display text-lg font-bold text-white shadow-[0_6px_0_#166534]">
            
            Keep going <ArrowRightIcon className="h-5 w-5" />
          </button>
        </motion.div>
      </Overlay>);

  }

  const { step, task, index, total } = nextUp!;
  const phase = phaseById(step.phase);
  const phaseSteps = STEPS.filter((s) => s.phase === step.phase);
  const stepNumber = phaseSteps.findIndex((s) => s.id === step.id) + 1;
  const room = roomById(step.room);

  const markDone = () => {
    const isLast = stepProgress(step.id).done === total - 1;
    const opened = isLast ?
    ROOMS.filter((r) => r.unlockAfter === step.id).map((r) => r.id) :
    [];
    toggleTask(task.id);
    if (isLast) setCelebrate({ title: step.title, xp: step.xp, opened });
  };

  return (
    <Overlay onClose={onClose}>
      <header
        className="flex items-start justify-between gap-4 border-b-2 border-ink/10 px-6 py-4"
        style={{ backgroundColor: phase.tint }}>
        
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: phase.color }}>
            Phase {phase.index} · {phase.name} · Step {stepNumber} of {phaseSteps.length}
          </p>
          <h2 className="mt-1 font-display text-xl font-black leading-tight">{step.title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to the floor"
          className="rounded-xl border-2 border-ink/15 bg-parchment p-2 hover:border-ink/40">
          
          <XIcon className="h-4 w-4" />
        </button>
      </header>

      {/* task rail */}
      <ol className="flex gap-1.5 border-b-2 border-ink/10 px-6 py-3">
        {step.tasks.map((t, i) => {
          const done = isTaskDone(t.id);
          const active = i === index;
          return (
            <li key={t.id} className="flex-1">
              <div
                className="h-1.5 rounded-full"
                style={{
                  backgroundColor: done ? '#1F9E4D' : active ? phase.color : 'rgba(26,23,18,0.12)'
                }} />
              
              <p
                className={[
                'mt-1.5 hidden text-[10px] leading-tight sm:block',
                active ? 'font-semibold text-ink' : 'text-graphite/70'].
                join(' ')}>
                
                {t.label}
              </p>
            </li>);

        })}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div
          key={task.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="px-6 py-6">
          
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg font-mono text-xs font-bold text-white"
              style={{ backgroundColor: phase.color }}>
              
              {index + 1}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-graphite">
              Task {index + 1} of {total}
            </span>
            <span className="ml-auto flex items-center gap-1 font-mono text-[11px] text-graphite">
              <ClockIcon className="h-3.5 w-3.5" /> about {task.minutes} min
            </span>
          </div>

          <h3 className="mt-3 font-display text-3xl font-black leading-tight">{task.label}</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-graphite">{task.how}</p>

          {task.input ?
          <div className="mt-5">
              <label
              htmlFor={`runner-${task.input.key}`}
              className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-graphite">
              
                {task.input.label}
              </label>
              {task.input.long ?
            <textarea
              id={`runner-${task.input.key}`}
              rows={4}
              value={fields[task.input.key] ?? ''}
              placeholder={task.input.placeholder}
              onChange={(e) => setField(task.input!.key, e.target.value)}
              className="w-full rounded-xl border-2 border-ink/15 bg-white px-4 py-3 text-sm focus:border-ink/50 focus:outline-none" /> :


            <input
              id={`runner-${task.input.key}`}
              value={fields[task.input.key] ?? ''}
              placeholder={task.input.placeholder}
              onChange={(e) => setField(task.input!.key, e.target.value)}
              className="w-full rounded-xl border-2 border-ink/15 bg-white px-4 py-3 text-sm focus:border-ink/50 focus:outline-none" />

            }
            </div> :
          null}

          <p className="mt-5 rounded-xl bg-ink/5 px-4 py-3 text-sm leading-relaxed">
            <strong className="font-semibold">Done when:</strong>{' '}
            <span className="text-graphite">{task.doneWhen}</span>
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={markDone}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-go px-5 py-4 font-display text-lg font-bold text-white shadow-[0_6px_0_#166534] transition-transform hover:-translate-y-0.5">
              
              <CheckIcon className="h-5 w-5" strokeWidth={3} /> I did it
            </button>
            <button
              type="button"
              onClick={() => onOpenRoom(step.room)}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-ink/20 px-5 py-4 text-sm font-semibold hover:border-ink/50">
              
              <DoorOpenIcon className="h-4 w-4" /> Open {room.name}
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-graphite">
            Stuck? Everything you need for this task is inside {room.name}.
          </p>
        </motion.div>
      </AnimatePresence>
    </Overlay>);

}

function Overlay({ children, onClose }: {children: React.ReactNode;onClose: () => void;}) {
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-ink/55 p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default" />
      
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        role="dialog"
        aria-modal="true"
        className="relative max-h-full w-full max-w-2xl overflow-y-auto rounded-3xl border-2 border-ink/15 bg-parchment shadow-pod">
        
        {children}
      </motion.div>
    </div>);

}