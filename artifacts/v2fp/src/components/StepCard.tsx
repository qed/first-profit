import React from 'react';
import { motion } from 'framer-motion';
import { CheckIcon, LockIcon, SparklesIcon } from 'lucide-react';
import { phaseById, type Step } from '../data/path';
import { useGame } from '../state/GameContext';
import { Chip } from './ui';

export function StepCard({ step, highlight }: {step: Step;highlight?: boolean;}) {
  const { isTaskDone, toggleTask, stepProgress, artifacts } = useGame();
  const phase = phaseById(step.phase);
  const { done, total } = stepProgress(step.id);
  const complete = done === total;

  return (
    <motion.article
      layout
      className={[
      'rounded-2xl border-2 bg-parchment p-5 transition-colors',
      highlight ? 'border-go shadow-[0_0_0_4px_rgba(31,158,77,0.15)]' : 'border-ink/10'].
      join(' ')}>
      
      <div className="flex flex-wrap items-center gap-2">
        <Chip color={phase.color} tint={phase.tint}>
          {phase.index}. {phase.name}
        </Chip>
        <span className="font-mono text-[11px] text-graphite">Criterion {step.id}</span>
        {complete ?
        <Chip color="#1F9E4D" tint="rgba(31,158,77,0.12)">
            <CheckIcon className="h-3 w-3" /> Passed
          </Chip> :

        <Chip>
            {done}/{total} tasks
          </Chip>
        }
        {highlight ?
        <Chip color="#1F9E4D" tint="rgba(31,158,77,0.12)">
            <SparklesIcon className="h-3 w-3" /> You are here
          </Chip> :
        null}
      </div>

      <h3 className="mt-3 font-display text-xl font-bold leading-snug">{step.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-graphite">{step.brief}</p>

      <ul className="mt-4 space-y-1.5">
        {step.tasks.map((task) => {
          const checked = isTaskDone(task.id);
          const locked = Boolean(task.auto) && !artifacts[task.auto!];
          return (
            <li key={task.id}>
              <button
                type="button"
                disabled={Boolean(task.auto)}
                onClick={() => toggleTask(task.id)}
                className={[
                'flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                task.auto ? 'cursor-default' : 'hover:bg-ink/5'].
                join(' ')}>
                
                <span
                  className={[
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2',
                  checked ? 'border-go bg-go text-white' : 'border-ink/25 bg-white'].
                  join(' ')}
                  aria-hidden>
                  
                  {checked ? <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                  {!checked && locked ? <LockIcon className="h-3 w-3 text-graphite" /> : null}
                </span>
                <span className={checked ? 'text-graphite line-through' : 'text-ink'}>
                  {task.label}
                  {task.auto ?
                  <em className="ml-2 font-mono text-[10px] not-italic uppercase tracking-wider text-graphite">
                      auto
                    </em> :
                  null}
                </span>
              </button>
            </li>);

        })}
      </ul>

      <p className="mt-3 rounded-xl bg-ink/5 px-3.5 py-2.5 text-xs leading-relaxed text-graphite">
        <strong className="font-semibold text-ink">Criterion passes when:</strong> {step.doneWhen}
      </p>
    </motion.article>);

}