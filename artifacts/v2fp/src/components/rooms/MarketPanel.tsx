import React, { useState } from 'react';
import { HandCoinsIcon, PlusIcon, ThumbsDownIcon } from 'lucide-react';
import { useGame } from '../../state/GameContext';
import { Btn, Field, Meter, Panel } from '../ui';

export function MarketPanel() {
  const {
    company,
    outreach,
    contacts,
    bumpOutreach,
    bumpContacts,
    nos,
    logNo,
    addSale,
    sales
  } = useGame();
  const [reason, setReason] = useState('');
  const [lesson, setLesson] = useState('');
  const [customer, setCustomer] = useState('');
  const [amount, setAmount] = useState(String(company.price));

  return (
    <>
      <Panel title="The Tally Board" hint="Volume is the whole trick">
        <div className="grid gap-4 sm:grid-cols-2">
          <TallyCard
            label="Supervised outreach attempts"
            value={outreach}
            target={25}
            color="#E0562A"
            onAdd={() => bumpOutreach(1)} />
          
          <TallyCard
            label="Potential customers contacted"
            value={contacts}
            target={40}
            color="#2F5D8C"
            onAdd={() => bumpContacts(1)} />
          
        </div>
        <p className="mt-4 text-xs leading-relaxed text-graphite">
          A knock counts whether they buy or not. Log it the same day — a parent has to be with
          you for every in-person ask.
        </p>
      </Panel>

      <Panel title="Log a real sale" hint={`${sales.length} sales so far`} accent="#2E7D53">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
          <Field
            label="Customer (non-family)"
            value={customer}
            onChange={setCustomer}
            placeholder="Mrs. Okafor next door" />
          
          <Field label="Amount" value={amount} onChange={setAmount} type="number" suffix="$" />
          <Btn
            tone="go"
            disabled={!customer.trim() || Number(amount) <= 0}
            onClick={() => {
              addSale({
                customer: customer.trim(),
                product: company.product,
                amount: Number(amount),
                day: new Date().toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric'
                })
              });
              setCustomer('');
            }}>
            
            <span className="flex items-center gap-2">
              <HandCoinsIcon className="h-4 w-4" /> Money in hand
            </span>
          </Btn>
        </div>
        {sales.length ?
        <ul className="mt-4 divide-y divide-ink/10 rounded-xl border-2 border-ink/10 bg-white">
            {sales.slice(0, 4).map((sale) =>
          <li key={sale.id} className="flex items-center justify-between px-3.5 py-2 text-sm">
                <span className="font-medium">{sale.customer}</span>
                <span className="font-mono text-xs text-graphite">
                  {sale.day} · ${sale.amount}
                </span>
              </li>
          )}
          </ul> :
        null}
      </Panel>

      <Panel title="The No Ledger" hint={`${nos.length}/3 nos logged`} accent="#6B4E8C">
        <div className="space-y-3">
          <Field
            label="What they said"
            value={reason}
            onChange={setReason}
            placeholder="Too expensive for a bracelet." />
          
          <Field
            label="What it taught you"
            value={lesson}
            onChange={setLesson}
            placeholder="Lead with the team colours, not the price." />
          
          <Btn
            tone="ink"
            disabled={!reason.trim() || !lesson.trim()}
            onClick={() => {
              logNo(reason.trim(), lesson.trim());
              setReason('');
              setLesson('');
            }}>
            
            <span className="flex items-center gap-2">
              <ThumbsDownIcon className="h-4 w-4" /> Log this no
            </span>
          </Btn>
        </div>
        {nos.length ?
        <ol className="mt-4 space-y-2">
            {nos.map((entry, i) =>
          <li key={i} className="rounded-xl border-2 border-ink/10 bg-white px-3.5 py-2.5">
                <p className="text-sm font-medium">“{entry.reason}”</p>
                <p className="mt-0.5 text-xs text-graphite">→ {entry.lesson}</p>
              </li>
          )}
          </ol> :
        null}
      </Panel>
    </>);

}

function TallyCard({
  label,
  value,
  target,
  color,
  onAdd






}: {label: string;value: number;target: number;color: string;onAdd: () => void;}) {
  return (
    <div className="rounded-2xl border-2 border-ink/10 bg-white p-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-graphite">{label}</p>
      <p className="mt-1 font-display text-4xl font-black tabular-nums" style={{ color }}>
        {value}
        <span className="ml-1 text-lg text-graphite">/ {target}</span>
      </p>
      <div className="my-3">
        <Meter value={value} max={target} color={color} />
      </div>
      <Btn tone="quiet" full onClick={onAdd}>
        <span className="flex items-center justify-center gap-2">
          <PlusIcon className="h-4 w-4" /> Log one
        </span>
      </Btn>
    </div>);

}