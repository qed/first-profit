import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRightIcon,
  CheckIcon,
  GlobeIcon,
  LockIcon,
  SparklesIcon } from
'lucide-react';
import { PHASES } from '../data/path';
import { useGame } from '../state/GameContext';

const slide = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 }
};

export function Onboarding() {
  const { startJourney } = useGame();
  const [screen, setScreen] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [age, setAge] = useState('13');
  const handle = firstName.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'you';
  const total = 5;

  const next = () => setScreen((s) => Math.min(s + 1, total - 1));

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-paper p-4">
      <div className="w-full max-w-xl">
        <div className="mb-5 flex items-center justify-between">
          <span className="flex items-end gap-[3px]" aria-hidden>
            <span className="h-3 w-[5px] rounded-sm bg-gold" />
            <span className="h-5 w-[5px] rounded-sm bg-ember" />
            <span className="h-7 w-[5px] rounded-sm bg-ocean" />
            <span className="h-9 w-[5px] rounded-sm bg-ink" />
          </span>
          <div className="flex gap-1.5" aria-hidden>
            {Array.from({ length: total }).map((_, i) =>
            <span
              key={i}
              className="h-1.5 w-8 rounded-full transition-colors"
              style={{ backgroundColor: i <= screen ? '#E0562A' : 'rgba(26,23,18,0.15)' }} />

            )}
          </div>
        </div>

        <div className="rounded-3xl border-2 border-ink/15 bg-parchment p-7 shadow-pod">
          <AnimatePresence mode="wait">
            {screen === 0 ?
            <motion.div key="s0" {...slide}>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ember">
                  First Profit
                </p>
                <h1 className="mt-2 font-display text-4xl font-black leading-[1.05]">
                  Your first $1,000 starts with one sentence.
                </h1>
                <p className="mt-4 text-sm leading-relaxed text-graphite">
                  Not a business plan. Not an app. One sentence about one thing you could sell
                  this week — and one grown-up who is not related to you.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-graphite">
                  We will do it in five small tasks. Roughly fifteen minutes each. You will not
                  see the whole factory until you need it.
                </p>
                <Cta onClick={next}>Let's go</Cta>
              </motion.div> :
            null}

            {screen === 1 ?
            <motion.div key="s1" {...slide}>
                <h2 className="font-display text-3xl font-black leading-tight">
                  First — who are you?
                </h2>
                <p className="mt-2 text-sm text-graphite">
                  Just a first name and an age. That is all we put on the internet.
                </p>
                <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_7rem]">
                  <TextField
                  label="First name"
                  value={firstName}
                  onChange={setFirstName}
                  placeholder="Alex"
                  autoFocus />
                
                  <TextField label="Age" value={age} onChange={setAge} placeholder="13" />
                </div>
                <div className="mt-5 flex items-center gap-2 rounded-2xl border-2 border-dashed border-ink/15 bg-white px-4 py-3">
                  <GlobeIcon className="h-4 w-4 shrink-0 text-graphite" />
                  <p className="font-mono text-xs text-graphite">
                    firstprofit.school/
                    <span className="font-bold text-ink">{handle}</span>
                  </p>
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-go">
                    available
                  </span>
                </div>
                <Cta onClick={next} disabled={!firstName.trim() || !age.trim()}>
                  Claim my page
                </Cta>
              </motion.div> :
            null}

            {screen === 2 ?
            <motion.div key="s2" {...slide}>
                <SiteReveal firstName={firstName.trim()} age={age} handle={handle} />
                <Cta onClick={next}>My money booth next</Cta>
              </motion.div> :
            null}

            {screen === 3 ?
            <motion.div key="s3" {...slide}>
                <h2 className="font-display text-3xl font-black leading-tight">
                  You can take real money today.
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-graphite">
                  Every founder starts with one offer already switched on: people who believe in
                  you can back you, and they get double their money back as credit in your store.
                </p>
                <div className="mt-5 rounded-2xl border-2 border-ink/15 bg-white p-5 text-center">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-graphite">
                    Your first offer
                  </p>
                  <p className="mt-1.5 font-display text-2xl font-black leading-tight">
                    Invest in me
                  </p>
                  <p className="mt-1 text-sm text-graphite">
                    Get <strong className="text-ink">$20 in store credit</strong> for every $10 you
                    spend here.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2">
                    {[10, 25, 50].map((amount) =>
                  <span
                    key={amount}
                    className="rounded-xl border-2 border-ink/15 px-3 py-2 font-mono text-xs">
                    
                        ${amount} → ${amount * 2}
                      </span>
                  )}
                  </div>
                </div>
                <ul className="mt-4 space-y-2 text-xs text-graphite">
                  {[
                'Money is taken by Stripe through the First Profit account — a parent never has to wire up a merchant account.',
                'Every payment is tagged to your page, so it lands in your ledger and your $1,000 bar.',
                'Payouts are released to your parent-controlled account. Store credit is your promise to deliver later.'].
                map((line) =>
                <li key={line} className="flex gap-2">
                      <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-go" />
                      {line}
                    </li>
                )}
                </ul>
                <Cta onClick={next}>Show me The Path</Cta>
              </motion.div> :
            null}

            {screen === 4 ?
            <motion.div key="s4" {...slide}>
                <h2 className="font-display text-3xl font-black leading-tight">
                  One room. One task at a time.
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-graphite">
                  First Profit is five phases and 25 criteria — but you do not meet them all
                  today. You start in the Idea Room. Everything else on the factory floor stays
                  shut until you have earned it.
                </p>
                <ol className="mt-5 space-y-2">
                  {PHASES.map((phase, i) =>
                <li
                  key={phase.id}
                  className="flex items-center gap-3 rounded-xl border-2 px-3.5 py-2.5"
                  style={{
                    borderColor: i === 0 ? phase.color : 'rgba(26,23,18,0.1)',
                    backgroundColor: i === 0 ? phase.tint : 'transparent'
                  }}>
                  
                      <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg font-mono text-[11px] font-bold text-white"
                    style={{ backgroundColor: i === 0 ? phase.color : '#B7AF9E' }}>
                    
                        {phase.index}
                      </span>
                      <span className="flex-1">
                        <span className="block font-display text-base font-bold leading-tight">
                          {phase.name}
                        </span>
                        <span className="block text-xs text-graphite">{phase.promise}</span>
                      </span>
                      {i === 0 ?
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ember">
                          You start here
                        </span> :

                  <LockIcon className="h-4 w-4 text-graphite/60" />
                  }
                    </li>
                )}
                </ol>
                <div className="mt-5 rounded-2xl bg-go/10 px-4 py-3.5">
                  <p className="flex items-center gap-2 font-display text-base font-bold text-go">
                    <SparklesIcon className="h-4 w-4" /> Your first task
                  </p>
                  <p className="mt-1 text-sm text-graphite">
                    Pick one thing you could sell this week and write a single sentence about it.
                    Ten minutes. The big green <strong>Next Step</strong> button will walk you
                    there.
                  </p>
                </div>
                <Cta
                onClick={() =>
                startJourney({
                  firstName: firstName.trim(),
                  age: Number(age) || 13,
                  handle
                })
                }>
                
                  Start task 1 of 5
                </Cta>
              </motion.div> :
            null}
          </AnimatePresence>
        </div>
      </div>
    </main>);

}

function Cta({
  children,
  onClick,
  disabled




}: {children: React.ReactNode;onClick: () => void;disabled?: boolean;}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-go px-5 py-4 font-display text-lg font-bold text-white shadow-[0_6px_0_#166534] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-graphite disabled:shadow-none">
      
      {children} <ArrowRightIcon className="h-5 w-5" />
    </button>);

}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus






}: {label: string;value: string;onChange: (v: string) => void;placeholder: string;autoFocus?: boolean;}) {
  const id = `ob-${label.toLowerCase()}`;
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-graphite">
        {label}
      </span>
      <input
        id={id}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-ink/15 bg-white px-4 py-3 font-display text-xl font-bold text-ink placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-graphite/40 focus:border-ink/50 focus:outline-none" />
      
    </label>);

}

function SiteReveal({
  firstName,
  age,
  handle




}: {firstName: string;age: string;handle: string;}) {
  const sentence = `Hi, I'm ${firstName} and I'm ${age} years old. This is the future site of my first $1,000 profit company.`;
  const [typed, setTyped] = useState('');

  useEffect(() => {
    let i = 0;
    const id = window.setInterval(() => {
      i += 2;
      setTyped(sentence.slice(0, i));
      if (i >= sentence.length) window.clearInterval(id);
    }, 18);
    return () => window.clearInterval(id);
  }, [sentence]);

  return (
    <div>
      <h2 className="font-display text-3xl font-black leading-tight">
        {firstName}, you have a website.
      </h2>
      <p className="mt-2 text-sm text-graphite">
        It is live right now, and it says exactly one true thing. You will fill in the rest as the
        business becomes real.
      </p>
      <div className="mt-5 overflow-hidden rounded-2xl border-2 border-ink/15 bg-white">
        <div className="flex items-center gap-2 border-b-2 border-ink/10 bg-ink/5 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-ember" />
          <span className="h-2.5 w-2.5 rounded-full bg-gold" />
          <span className="h-2.5 w-2.5 rounded-full bg-go" />
          <span className="ml-2 rounded-md bg-white px-2 py-0.5 font-mono text-[10px] text-graphite">
            firstprofit.school/{handle}
          </span>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="mx-auto max-w-sm font-display text-xl font-bold leading-snug">
            {typed}
            <span className="ml-0.5 inline-block h-5 w-[2px] translate-y-0.5 animate-pulse bg-ember" />
          </p>
        </div>
      </div>
    </div>);

}