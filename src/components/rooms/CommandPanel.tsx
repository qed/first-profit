import React, { useState } from 'react';
import { BookOpenIcon, TrendingUpIcon } from 'lucide-react';
import { useGame } from '../../state/GameContext';
import { Btn, Field, Meter, Panel } from '../ui';

export function CommandPanel() {
  const { company, sales, revenue, profit, weeks, addWeek, artifacts, buildArtifact, xp } =
  useGame();
  const [rev, setRev] = useState('');
  const [cost, setCost] = useState('');

  const totals = weeks.reduce(
    (acc, w) => ({ revenue: acc.revenue + w.revenue, costs: acc.costs + w.costs }),
    { revenue: 0, costs: 0 }
  );
  const peak = Math.max(1, ...weeks.map((w) => w.revenue));
  const unitProfit = Math.max(company.price - company.cost, 0.01);

  return (
    <>
      <Panel title="Company Dashboard" hint={`${company.name} · ${xp} XP`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi label="Sales logged" value={String(sales.length)} tone="#2F5D8C" />
          <Kpi label="Revenue" value={`$${revenue.toLocaleString()}`} tone="#E0562A" />
          <Kpi
            label="Profit"
            value={`$${Math.max(0, Math.round(profit)).toLocaleString()}`}
            tone="#2E7D53" />
          
        </div>
        <div className="mt-5 space-y-4">
          <Meter value={revenue} max={1000} color="#2E7D53" label="First $1,000 in sales" />
          <Meter value={profit} max={10000} color="#C98A16" label="Path to $10,000 profit" />
        </div>
        <p className="mt-4 rounded-xl bg-gold/10 px-3.5 py-2.5 text-xs leading-relaxed text-[#8a5f0c]">
          <TrendingUpIcon className="mr-1.5 inline h-3.5 w-3.5" />
          At ${unitProfit.toFixed(2)} profit per unit, $10,000 means{' '}
          {Math.ceil(10000 / unitProfit).toLocaleString()} units — about{' '}
          {Math.ceil(10000 / unitProfit / 52)} a week for a year. Raise the price or cut the cost
          and that number drops fast.
        </p>
      </Panel>

      <Panel title="Weekly P&L" hint={`${weeks.length}/4 weeks logged`} accent="#2E7D53">
        {!artifacts.ledger ?
        <Btn tone="ink" full onClick={() => buildArtifact('ledger')}>
            <span className="flex items-center justify-center gap-2">
              <BookOpenIcon className="h-4 w-4" /> Open the ledger
            </span>
          </Btn> :

        <>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Money in" value={rev} onChange={setRev} type="number" suffix="$" />
              <Field label="Money out" value={cost} onChange={setCost} type="number" suffix="$" />
              <Btn
              tone="go"
              disabled={rev === '' || cost === '' || weeks.length >= 8}
              onClick={() => {
                addWeek(Number(rev), Number(cost));
                setRev('');
                setCost('');
              }}>
              
                Log week {weeks.length + 1}
              </Btn>
            </div>

            {weeks.length ?
          <>
                <div className="mt-5 flex h-32 items-end gap-3">
                  {weeks.map((w, i) =>
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                      <div className="flex h-full w-full items-end gap-1">
                        <div
                    className="flex-1 rounded-t-md bg-moss"
                    style={{ height: `${w.revenue / peak * 100}%` }}
                    title={`Week ${i + 1} in: $${w.revenue}`} />
                  
                        <div
                    className="flex-1 rounded-t-md bg-ember/50"
                    style={{ height: `${w.costs / peak * 100}%` }}
                    title={`Week ${i + 1} out: $${w.costs}`} />
                  
                      </div>
                      <span className="font-mono text-[10px] text-graphite">W{i + 1}</span>
                    </div>
              )}
                </div>
                <div className="mt-4 flex items-center justify-between rounded-xl border-2 border-ink/10 bg-white px-3.5 py-3">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-graphite">
                    {weeks.length}-week total
                  </span>
                  <span className="font-display text-xl font-bold text-go">
                    ${(totals.revenue - totals.costs).toLocaleString()} kept
                  </span>
                </div>
              </> :

          <p className="mt-4 text-xs text-graphite">
                Four consecutive weeks. Log the ugly ones too — they are the ones the board asks
                about.
              </p>
          }
          </>
        }
      </Panel>

      <Panel title="Sales ledger" hint={`${sales.length} entries`}>
        {sales.length ?
        <ul className="divide-y divide-ink/10 rounded-xl border-2 border-ink/10 bg-white">
            {sales.map((sale) =>
          <li key={sale.id} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{sale.customer}</span>
                  <span className="ml-2 text-xs text-graphite">{sale.product}</span>
                </span>
                <span className="font-mono text-xs">
                  {sale.day} · ${sale.amount}
                </span>
              </li>
          )}
          </ul> :

        <p className="text-sm text-graphite">
            No sales yet. Take one at the Market Stall or the Checkout Booth.
          </p>
        }
      </Panel>
    </>);

}

function Kpi({ label, value, tone }: {label: string;value: string;tone: string;}) {
  return (
    <div className="rounded-2xl border-2 border-ink/10 bg-white p-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-graphite">{label}</p>
      <p className="mt-1 font-display text-3xl font-black" style={{ color: tone }}>
        {value}
      </p>
    </div>);

}