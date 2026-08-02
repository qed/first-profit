import React, { useState } from 'react';
import {
  BanknoteIcon,
  CheckIcon,
  CreditCardIcon,
  LockIcon,
  ShieldCheckIcon } from
'lucide-react';
import { useGame } from '../../state/GameContext';
import { Btn, Field, Meter, Panel } from '../ui';

const PRESETS = [10, 25, 50, 100];

export function CheckoutPanel() {
  const {
    profile,
    company,
    updateCompany,
    siteUrl,
    addBacker,
    addSale,
    backers,
    backing,
    creditIssued,
    revenue,
    isStepDone
  } = useGame();

  const [amount, setAmount] = useState(10);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'paid'>('idle');
  const fee = +(amount * 0.029 + 0.3).toFixed(2);
  const toFounder = +(amount - fee).toFixed(2);
  const canSellProduct = isStepDone('1.2');

  const pay = () => {
    setStatus('processing');
    window.setTimeout(() => {
      addBacker({ name: name.trim() || 'Anonymous backer', amount, note: note.trim() });
      setStatus('paid');
      window.setTimeout(() => {
        setStatus('idle');
        setName('');
        setNote('');
      }, 2200);
    }, 1000);
  };

  return (
    <>
      <Panel title="Offer 1 · Invest in me" hint="Live from day one" accent="#635BFF">
        <p className="text-sm leading-relaxed text-graphite">
          Anyone who believes in you can back you today — before you have a product, a logo or a
          clue. They get <strong className="text-ink">$20 of store credit for every $10</strong>{' '}
          they spend, redeemable against anything you sell later. It is your first real
          transaction, and your first real promise.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Kpi label="Backed so far" value={`$${backing}`} tone="#635BFF" />
          <Kpi label="Backers" value={String(backers.length)} tone="#2F5D8C" />
          <Kpi label="Credit you owe" value={`$${creditIssued}`} tone="#E0562A" />
        </div>
      </Panel>

      <Panel title="Live checkout page" hint={`${siteUrl}/back-me`}>
        <div className="mx-auto max-w-sm overflow-hidden rounded-2xl border-2 border-ink/15 bg-white">
          <div className="border-b-2 border-ink/10 px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-graphite">
              First Profit Inc. · on behalf of {profile.firstName || 'your founder'}
            </p>
            <p className="mt-1.5 font-display text-lg font-bold leading-tight">
              Invest in {profile.firstName || 'me'}
            </p>
            <p className="mt-1 text-xs text-graphite">
              Get $20 in store credit for every $10 you spend here.
            </p>
          </div>

          <div className="space-y-3 px-5 py-4">
            <div>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-graphite">
                Amount
              </p>
              <div className="grid grid-cols-4 gap-2">
                {PRESETS.map((preset) =>
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(preset)}
                  className={[
                  'rounded-lg border-2 py-2 text-sm font-semibold transition-colors',
                  amount === preset ?
                  'border-[#635BFF] bg-[#635BFF]/10 text-[#635BFF]' :
                  'border-ink/15 hover:border-ink/40'].
                  join(' ')}>
                  
                    ${preset}
                  </button>
                )}
              </div>
              <p className="mt-2 rounded-lg bg-go/10 px-3 py-2 text-center text-xs font-semibold text-go">
                They get ${amount * 2} in store credit
              </p>
            </div>

            <Field label="Backer name" value={name} onChange={setName} placeholder="Aunt Priya" />
            <Field
              label="Message to the founder (optional)"
              value={note}
              onChange={setNote}
              placeholder="Go get 'em." />
            
            <MockInput label="Card information" value="4242 4242 4242 4242" icon />
            <div className="grid grid-cols-2 gap-3">
              <MockInput label="Expiry" value="04 / 29" />
              <MockInput label="CVC" value="123" />
            </div>

            <button
              type="button"
              disabled={status !== 'idle'}
              onClick={pay}
              className="w-full rounded-xl bg-[#635BFF] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#5147e0] disabled:opacity-60">
              
              {status === 'processing' ?
              'Processing…' :
              status === 'paid' ?
              'Payment received ✓' :
              `Pay $${amount}`}
            </button>
            <p className="flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-graphite">
              <LockIcon className="h-3 w-3" /> Secured by Stripe · First Profit is the merchant of
              record
            </p>
          </div>
        </div>

        {status === 'paid' ?
        <div className="mx-auto mt-4 max-w-sm rounded-2xl border-2 border-go bg-go/5 p-4 text-center">
            <CheckIcon className="mx-auto h-6 w-6 text-go" strokeWidth={3} />
            <p className="mt-1.5 font-display text-lg font-bold">
              ${amount} in. ${amount * 2} credit issued.
            </p>
            <p className="mt-1 text-xs text-graphite">
              Receipt emailed. The backer is now on your page.
            </p>
          </div> :
        null}
      </Panel>

      <Panel title="Where the money goes" hint="Parent-safe by design" accent="#2E7D53">
        <ol className="space-y-2">
          {[
          {
            icon: CreditCardIcon,
            title: 'Backer pays on your page',
            body: `$${amount} charged by Stripe. No account setup for you or your parent.`
          },
          {
            icon: ShieldCheckIcon,
            title: 'First Profit holds it',
            body: `Stripe fee $${fee.toFixed(2)} comes off. $${toFounder.toFixed(
              2
            )} is tagged to ${siteUrl}.`
          },
          {
            icon: BanknoteIcon,
            title: 'Paid out to your parent account',
            body: 'Released on the 1st of each month, with a statement showing every backer.'
          }].
          map((row) => {
            const Icon = row.icon;
            return (
              <li
                key={row.title}
                className="flex gap-3 rounded-xl border-2 border-ink/10 bg-white px-3.5 py-3">
                
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-moss" />
                <span>
                  <span className="block text-sm font-semibold">{row.title}</span>
                  <span className="block text-xs text-graphite">{row.body}</span>
                </span>
              </li>);

          })}
        </ol>
      </Panel>

      {backers.length ?
      <Panel title="Your backers" hint={`$${creditIssued} of credit outstanding`}>
          <ul className="divide-y divide-ink/10 rounded-xl border-2 border-ink/10 bg-white">
            {backers.map((backer) =>
          <li key={backer.id} className="px-3.5 py-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{backer.name}</span>
                  <span className="font-mono text-xs">
                    ${backer.amount} → ${backer.credit} credit
                  </span>
                </div>
                {backer.note ?
            <p className="mt-0.5 text-xs italic text-graphite">“{backer.note}”</p> :
            null}
              </li>
          )}
          </ul>
        </Panel> :
      null}

      <Panel
        title="Offer 2 · Sell your product"
        hint={canSellProduct ? 'Unlocked' : 'Unlocks after your first sale'}>
        
        {canSellProduct ?
        <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
              label="Price per unit"
              value={String(company.price)}
              onChange={(v) => updateCompany({ price: Number(v) || 0 })}
              type="number"
              suffix="$" />
            
              <Field
              label="Cost to make one"
              value={String(company.cost)}
              onChange={(v) => updateCompany({ cost: Number(v) || 0 })}
              type="number"
              suffix="$" />
            
            </div>
            <div className="mt-4">
              <Btn
              tone="go"
              full
              onClick={() =>
              addSale({
                customer: `Customer ${Math.floor(Math.random() * 90) + 10}`,
                product: company.product,
                amount: company.price,
                day: new Date().toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric'
                })
              })
              }>
              
                Take a product payment
              </Btn>
            </div>
            <div className="mt-4">
              <Meter value={revenue} max={1000} label={`$${revenue} of your first $1,000`} />
            </div>
          </> :

        <p className="flex items-center gap-2 text-sm text-graphite">
            <LockIcon className="h-4 w-4" /> Make one real sale in the Market Stall and this booth
            starts selling your product too.
          </p>
        }
      </Panel>
    </>);

}

function Kpi({ label, value, tone }: {label: string;value: string;tone: string;}) {
  return (
    <div className="rounded-xl border-2 border-ink/10 bg-white p-3 text-center">
      <p className="font-mono text-[10px] uppercase tracking-wider text-graphite">{label}</p>
      <p className="mt-1 font-display text-2xl font-black" style={{ color: tone }}>
        {value}
      </p>
    </div>);

}

function MockInput({ label, value, icon }: {label: string;value: string;icon?: boolean;}) {
  return (
    <div>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-graphite">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border-2 border-ink/10 bg-ink/[0.03] px-3 py-2 text-sm text-graphite">
        {icon ? <CreditCardIcon className="h-4 w-4" /> : null}
        {value}
      </div>
    </div>);

}