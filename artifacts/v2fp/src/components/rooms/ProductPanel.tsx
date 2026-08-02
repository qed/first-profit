import React, { useState } from 'react';
import { BoxIcon, MailIcon, DownloadIcon, HandshakeIcon, FlaskConicalIcon } from 'lucide-react';
import { useGame } from '../../state/GameContext';
import { Btn, Field, Panel } from '../ui';

const METHODS = [
{ id: 'email' as const, label: 'Email it', icon: MailIcon, note: 'Best for anything digital.' },
{
  id: 'download' as const,
  label: 'Instant download',
  icon: DownloadIcon,
  note: 'Runs while you sleep.'
},
{
  id: 'handoff' as const,
  label: 'Hand it over',
  icon: HandshakeIcon,
  note: 'Parent present, every time.'
}];


export function ProductPanel() {
  const { company, updateCompany, artifacts, buildArtifact, sales } = useGame();
  const [loops, setLoops] = useState<{guess: string;result: string;}[]>([]);
  const [guess, setGuess] = useState('');
  const [result, setResult] = useState('');
  const margin = company.price - company.cost;
  const multiple = company.cost > 0 ? (company.price / company.cost).toFixed(1) : '—';

  return (
    <>
      <Panel title="Unit Economics Bench" hint="One page, in your own words" accent="#6B4E8C">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Cost to make one"
            value={String(company.cost)}
            onChange={(v) => updateCompany({ cost: Number(v) || 0 })}
            type="number"
            suffix="$" />
          
          <Field
            label="Price you charge"
            value={String(company.price)}
            onChange={(v) => updateCompany({ price: Number(v) || 0 })}
            type="number"
            suffix="$" />
          
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Profit per unit" value={`$${margin.toFixed(2)}`} tone="#2E7D53" />
          <Stat label="Price is cost ×" value={multiple} tone="#6B4E8C" />
          <Stat
            label="Units to $1,000"
            value={margin > 0 ? String(Math.ceil(1000 / margin)) : '∞'}
            tone="#E0562A" />
          
        </div>
        <p className="mt-4 rounded-xl bg-ink/5 px-3.5 py-2.5 text-xs leading-relaxed text-graphite">
          {margin <= 0 ?
          'You are paying people to take your product. Raise the price or cut the cost.' :
          company.price / Math.max(company.cost, 0.01) < 3 ?
          'Aim for a price at least three times your cost — your time counts as a cost too.' :
          'Healthy margin. Now say this page out loud to your coach without reading it.'}
        </p>
      </Panel>

      <Panel title="The Delivery Bay" hint={artifacts.delivery ? 'Running' : 'Not set up'}>
        <div className="grid gap-2 sm:grid-cols-3">
          {METHODS.map((method) => {
            const Icon = method.icon;
            const active = company.delivery === method.id;
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => updateCompany({ delivery: method.id })}
                className={[
                'rounded-xl border-2 p-3 text-left transition-colors',
                active ? 'border-ink bg-ink/5' : 'border-ink/10 bg-white hover:border-ink/30'].
                join(' ')}>
                
                <Icon className="h-5 w-5" />
                <p className="mt-2 text-sm font-semibold">{method.label}</p>
                <p className="text-[11px] text-graphite">{method.note}</p>
              </button>);

          })}
        </div>
        <div className="mt-4">
          <Field
            label="What the customer gets, exactly"
            value={company.deliveryNote}
            onChange={(v) => updateCompany({ deliveryNote: v })}
            long />
          
        </div>
        <div className="mt-3">
          <Btn tone="go" full disabled={artifacts.delivery} onClick={() => buildArtifact('delivery')}>
            <span className="flex items-center justify-center gap-2">
              <BoxIcon className="h-4 w-4" />
              {artifacts.delivery ? 'Delivery system is running' : 'Turn on the delivery system'}
            </span>
          </Btn>
        </div>
        {artifacts.delivery ?
        <p className="mt-3 rounded-xl bg-go/10 px-3.5 py-2.5 text-xs text-go">
            {sales.length} order{sales.length === 1 ? '' : 's'} fulfilled this way. Someone else
            could run it from your written instructions — that is the whole point.
          </p> :
        null}
      </Panel>

      <Panel title="The Loop Bench" hint={`${loops.length}/2 validation loops`} accent="#6B4E8C">
        <div className="space-y-3">
          <Field
            label="Hypothesis — what you think will happen"
            value={guess}
            onChange={setGuess}
            placeholder="If I show the team colours first, more people stop to look." />
          
          <Field
            label="Outcome — what actually happened"
            value={result}
            onChange={setResult}
            placeholder="7 of 10 stopped, but only 2 asked the price." />
          
          <Btn
            tone="ink"
            disabled={!guess.trim() || !result.trim()}
            onClick={() => {
              setLoops((prev) => [...prev, { guess: guess.trim(), result: result.trim() }]);
              setGuess('');
              setResult('');
            }}>
            
            <span className="flex items-center gap-2">
              <FlaskConicalIcon className="h-4 w-4" /> Close the loop
            </span>
          </Btn>
        </div>
        {loops.length ?
        <ol className="mt-4 space-y-2">
            {loops.map((loop, i) =>
          <li key={i} className="rounded-xl border-2 border-ink/10 bg-white px-3.5 py-2.5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-graphite">
                  Loop {i + 1}
                </p>
                <p className="mt-1 text-sm">{loop.guess}</p>
                <p className="mt-0.5 text-xs text-graphite">→ {loop.result}</p>
              </li>
          )}
          </ol> :
        null}
      </Panel>
    </>);

}

function Stat({ label, value, tone }: {label: string;value: string;tone: string;}) {
  return (
    <div className="rounded-xl border-2 border-ink/10 bg-white p-3 text-center">
      <p className="font-mono text-[10px] uppercase tracking-wider text-graphite">{label}</p>
      <p className="mt-1 font-display text-2xl font-black" style={{ color: tone }}>
        {value}
      </p>
    </div>);

}