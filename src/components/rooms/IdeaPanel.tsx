import React, { useEffect, useRef, useState } from 'react';
import { MicIcon, RotateCcwIcon, SquareIcon } from 'lucide-react';
import { useGame } from '../../state/GameContext';
import { Btn, Field, Panel } from '../ui';

const BEATS = [
{ label: 'Hook', seconds: 10, hint: 'One line that makes them look up.' },
{ label: 'What it is', seconds: 15, hint: 'Say the thing plainly.' },
{ label: 'Why it is good', seconds: 20, hint: 'The problem it kills.' },
{ label: 'The ask', seconds: 15, hint: 'Tell them exactly what to do.' }];


export function IdeaPanel() {
  const { company, updateCompany, fields } = useGame();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = window.setInterval(() => setElapsed((e) => Math.min(e + 1, 60)), 1000);
    }
    return () => {
      if (ref.current) window.clearInterval(ref.current);
    };
  }, [running]);

  useEffect(() => {
    if (elapsed >= 60) setRunning(false);
  }, [elapsed]);

  let cursor = 0;
  const activeBeat = BEATS.findIndex((beat) => {
    cursor += beat.seconds;
    return elapsed < cursor;
  });

  return (
    <>
      <Panel title="The Idea Forge" hint="Name it before you build it">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Founder"
            value={company.founder}
            onChange={(v) => updateCompany({ founder: v })} />
          
          <Field
            label="Company name"
            value={company.name}
            onChange={(v) => updateCompany({ name: v })} />
          
          <div className="sm:col-span-2">
            <Field
              label="What you sell"
              value={company.product}
              onChange={(v) => updateCompany({ product: v })} />
            
          </div>
        </div>
        <div className="mt-4 rounded-2xl border-2 border-dashed border-ink/15 bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-graphite">
            Your one-liner
          </p>
          <p className="mt-1.5 font-display text-lg font-bold leading-snug">
            {fields.oneLiner?.trim() ?
            fields.oneLiner :
            'Write it in criterion 1.1 — it shows up here, on your website, and in your pitch.'}
          </p>
        </div>
      </Panel>

      <Panel title="60-Second Pitch Rehearsal" hint="Four beats, no notes">
        <div className="flex items-center gap-4">
          <div className="font-display text-5xl font-black tabular-nums">
            {String(Math.floor((60 - elapsed) / 60)).padStart(1, '0')}:
            {String((60 - elapsed) % 60).padStart(2, '0')}
          </div>
          <div className="flex gap-2">
            <Btn tone={running ? 'ink' : 'ember'} onClick={() => setRunning((r) => !r)}>
              {running ?
              <span className="flex items-center gap-2">
                  <SquareIcon className="h-4 w-4" /> Stop
                </span> :

              <span className="flex items-center gap-2">
                  <MicIcon className="h-4 w-4" /> Start run
                </span>
              }
            </Btn>
            <Btn
              tone="quiet"
              onClick={() => {
                setRunning(false);
                setElapsed(0);
              }}>
              
              <span className="flex items-center gap-2">
                <RotateCcwIcon className="h-4 w-4" /> Reset
              </span>
            </Btn>
          </div>
        </div>
        <ol className="mt-4 space-y-2">
          {BEATS.map((beat, i) =>
          <li
            key={beat.label}
            className={[
            'flex items-center justify-between rounded-xl border-2 px-3.5 py-2.5 text-sm transition-colors',
            i === activeBeat && running ?
            'border-ember bg-ember/10' :
            'border-ink/10 bg-white'].
            join(' ')}>
            
              <span>
                <strong className="font-semibold">{beat.label}</strong>
                <span className="ml-2 text-graphite">{beat.hint}</span>
              </span>
              <span className="font-mono text-xs text-graphite">{beat.seconds}s</span>
            </li>
          )}
        </ol>
      </Panel>
    </>);

}