import React, { useState } from 'react';
import { HammerIcon, ScissorsIcon } from 'lucide-react';
import { useGame } from '../../state/GameContext';
import { Btn, Field, Panel } from '../ui';

interface Feature {
  id: number;
  label: string;
  keep: boolean;
}

const SEED: Feature[] = [
{ id: 1, label: 'One bracelet in your team colours', keep: true },
{ id: 2, label: 'A page that explains it and takes an order', keep: true },
{ id: 3, label: 'Custom name stitching', keep: false },
{ id: 4, label: 'Subscription box', keep: false },
{ id: 5, label: 'An app', keep: false }];


export function BuildPanel() {
  const { company } = useGame();
  const [features, setFeatures] = useState<Feature[]>(SEED);
  const [draft, setDraft] = useState('');
  const [version, setVersion] = useState(0);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [note, setNote] = useState('');

  const kept = features.filter((f) => f.keep);

  return (
    <>
      <Panel title="The Scope Cutter" hint="Smallest thing that works" accent="#2F5D8C">
        <p className="text-sm leading-relaxed text-graphite">
          Keep exactly what one customer needs to get value once. Cut everything else — it can
          come back in v2 if a real person asks for it.
        </p>
        <ul className="mt-4 space-y-2">
          {features.map((feature) =>
          <li key={feature.id}>
              <button
              type="button"
              onClick={() =>
              setFeatures((prev) =>
              prev.map((f) => f.id === feature.id ? { ...f, keep: !f.keep } : f)
              )
              }
              className={[
              'flex w-full items-center justify-between gap-3 rounded-xl border-2 px-3.5 py-2.5 text-left text-sm transition-colors',
              feature.keep ?
              'border-ocean bg-ocean/10' :
              'border-ink/10 bg-white text-graphite line-through'].
              join(' ')}>
              
                <span>{feature.label}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider">
                  {feature.keep ? 'in v1' : 'cut'}
                </span>
              </button>
            </li>
          )}
        </ul>
        <div className="mt-4 flex items-end gap-2">
          <div className="flex-1">
            <Field
              label="Add an idea to the pile"
              value={draft}
              onChange={setDraft}
              placeholder="Gift wrapping" />
            
          </div>
          <Btn
            tone="quiet"
            disabled={!draft.trim()}
            onClick={() => {
              setFeatures((prev) => [
              ...prev,
              { id: Date.now(), label: draft.trim(), keep: false }]
              );
              setDraft('');
            }}>
            
            <span className="flex items-center gap-2">
              <ScissorsIcon className="h-4 w-4" /> Add
            </span>
          </Btn>
        </div>
        <p className="mt-4 rounded-xl bg-ocean/10 px-3.5 py-2.5 text-xs text-ocean">
          v1 of {company.name} = {kept.length} thing{kept.length === 1 ? '' : 's'}.{' '}
          {kept.length > 2 ?
          'That is still too big for a first ship. Cut one more.' :
          'That is shippable this week.'}
        </p>
      </Panel>

      <Panel title="The Ship Log" hint={version ? `Live: v${version}` : 'Nothing shipped yet'}>
        <div className="flex flex-wrap gap-2">
          <Btn tone="ember" disabled={version >= 1} onClick={() => setVersion(1)}>
            <span className="flex items-center gap-2">
              <HammerIcon className="h-4 w-4" /> Ship v1
            </span>
          </Btn>
          <Btn
            tone="ink"
            disabled={version < 1 || feedback.length < 3 || version >= 2}
            onClick={() => setVersion(2)}>
            
            Ship v2 from feedback
          </Btn>
        </div>
        <div className="mt-4">
          <Field
            label={`Real user feedback (${feedback.length}/3)`}
            value={note}
            onChange={setNote}
            placeholder="“I could not tell what size it was.”" />
          
          <div className="mt-2">
            <Btn
              tone="quiet"
              disabled={!note.trim()}
              onClick={() => {
                setFeedback((prev) => [...prev, note.trim()]);
                setNote('');
              }}>
              
              Log feedback
            </Btn>
          </div>
        </div>
        {feedback.length ?
        <ul className="mt-4 space-y-2">
            {feedback.map((item, i) =>
          <li
            key={i}
            className="rounded-xl border-2 border-ink/10 bg-white px-3.5 py-2 text-sm">
            
                {item}
              </li>
          )}
          </ul> :
        null}
        {version >= 2 ?
        <p className="mt-4 rounded-xl bg-go/10 px-3.5 py-2.5 text-xs text-go">
            v2 is live and every change traces back to a real user. Tell them what changed.
          </p> :
        null}
      </Panel>
    </>);

}