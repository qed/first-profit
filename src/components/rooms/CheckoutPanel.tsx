import React, { useState } from 'react';
import { CreditCardIcon, LockIcon, ShieldCheckIcon } from 'lucide-react';
import { useGame } from '../../state/GameContext';
import { Btn, Field, Meter, Panel } from '../ui';

const NAMES = ['Ana R.', 'Coach Mel', 'Mr. Whitfield', 'Priya S.', 'The Nguyens', 'Sam B.'];

export function CheckoutPanel() {
  const { company, updateCompany, artifacts, buildArtifact, addSale, sales, revenue } = useGame();
  const [status, setStatus] = useState<'idle' | 'processing' | 'paid'>('idle');
  const fee = +(company.price * 0.029 + 0.3).toFixed(2);
  const net = +(company.price - fee - company.cost).toFixed(2);

  const runPayment = () => {
    setStatus('processing');
    window.setTimeout(() => {
      addSale({
        customer: NAMES[sales.length % NAMES.length],
        product: company.product,
        amount: company.price,
        day: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      });
      setStatus('paid');
      window.setTimeout(() => setStatus('idle'), 1600);
    }, 900);
  };

  return (
    <>
      <Panel title="The Checkout Booth" hint={artifacts.checkout ? 'Live' : 'Not connected'}>
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
        <dl className="mt-4 divide-y divide-ink/10 rounded-xl border-2 border-ink/10 bg-white text-sm">
          <Row label="Customer pays" value={`$${company.price.toFixed(2)}`} />
          <Row label="Processing fee (2.9% + 30¢)" value={`−$${fee.toFixed(2)}`} muted />
          <Row label="Cost of goods" value={`−$${company.cost.toFixed(2)}`} muted />
          <Row label="You keep" value={`$${net.toFixed(2)}`} strong />
        </dl>
        <div className="mt-4">
          <Btn
            tone="ink"
            full
            disabled={artifacts.checkout}
            onClick={() => buildArtifact('checkout')}>
            
            <span className="flex items-center justify-center gap-2">
              <ShieldCheckIcon className="h-4 w-4" />
              {artifacts.checkout ?
              'Stripe connected (parent-held account)' :
              'Connect Stripe with a parent'}
            </span>
          </Btn>
        </div>
      </Panel>

      <Panel title="Live checkout page" hint="What your customer sees" accent="#635BFF">
        <div className="mx-auto max-w-sm overflow-hidden rounded-2xl border-2 border-ink/15 bg-white">
          <div className="border-b-2 border-ink/10 px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-graphite">
              {company.name}
            </p>
            <p className="mt-1 text-sm font-semibold">{company.product}</p>
            <p className="mt-2 font-display text-3xl font-black">${company.price.toFixed(2)}</p>
          </div>
          <div className="space-y-3 px-5 py-4">
            <MockInput label="Email" value="parent@email.com" />
            <MockInput label="Card information" value="4242 4242 4242 4242" icon />
            <div className="grid grid-cols-2 gap-3">
              <MockInput label="Expiry" value="04 / 29" />
              <MockInput label="CVC" value="123" />
            </div>
            <button
              type="button"
              disabled={!artifacts.checkout || status !== 'idle'}
              onClick={runPayment}
              className="w-full rounded-xl bg-[#635BFF] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#5147e0] disabled:opacity-40">
              
              {status === 'processing' ?
              'Processing…' :
              status === 'paid' ?
              'Payment received ✓' :
              `Pay $${company.price.toFixed(2)}`}
            </button>
            <p className="flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-graphite">
              <LockIcon className="h-3 w-3" /> Secured by Stripe
            </p>
          </div>
        </div>
        {!artifacts.checkout ?
        <p className="mt-3 text-center text-xs text-graphite">
            Connect Stripe above to take a test payment.
          </p> :
        null}
      </Panel>

      <Panel title="Toward your first $1,000" hint={`${sales.length} sales`} accent="#2E7D53">
        <Meter value={revenue} max={1000} label={`$${revenue} of $1,000`} />
        <p className="mt-3 text-xs leading-relaxed text-graphite">
          At ${company.price} a unit you need {Math.max(0, Math.ceil((1000 - revenue) / Math.max(company.price, 1)))}{' '}
          more sales. Ten asks per sale means about{' '}
          {Math.max(0, Math.ceil((1000 - revenue) / Math.max(company.price, 1)) * 10)} more asks.
        </p>
      </Panel>
    </>);

}

function Row({
  label,
  value,
  muted,
  strong





}: {label: string;value: string;muted?: boolean;strong?: boolean;}) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5">
      <dt className={muted ? 'text-graphite' : ''}>{label}</dt>
      <dd className={strong ? 'font-display text-lg font-bold text-go' : 'font-mono text-xs'}>
        {value}
      </dd>
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