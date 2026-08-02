import React from 'react';
import { motion } from 'framer-motion';
import { ArrowDownIcon, CarFrontIcon, BackpackIcon, CalendarDaysIcon, CheckIcon } from 'lucide-react';

const CARDS = [
{
  title: 'The Week',
  icon: CalendarDaysIcon,
  tilt: '-rotate-2',
  accent: 'bg-sky',
  lines: ['Swim — Mon 4:15', 'Piano — Tue 4:15', 'Thu — nothing, on purpose'],
  note: 'no more double-booking'
},
{
  title: 'The Carpool',
  icon: CarFrontIcon,
  tilt: 'rotate-1',
  accent: 'bg-mint',
  lines: ['Priya drives Mon', 'You drive Sat', 'Dey family: swim meet'],
  note: 'asks the other parents for you'
},
{
  title: 'The Gear',
  icon: BackpackIcon,
  tilt: 'rotate-[3deg]',
  accent: 'bg-marker',
  lines: ['Shin guards ✓', 'Goggles ✓', 'Snack that is not a snack ✓'],
  note: 'the shin guards are in the car'
}];


export function Hero() {
  return (
    <section id="top" className="relative w-full overflow-hidden px-5 pb-4 pt-12 sm:px-8 sm:pt-16">
      <div className="mx-auto w-full max-w-4xl text-center">
        <span className="inline-flex -rotate-1 items-center gap-2 rounded-full border border-ink/15 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle shadow-sticker">
          <span className="h-1.5 w-1.5 rounded-full bg-tomato" />
          Almost Zero Effort Activity Planner
        </span>

        <h1 className="mt-6 font-display text-[2.1rem] font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl md:text-[3.5rem]">
          Your kids&rsquo; activities, planned
          <br className="hidden sm:block" /> before your coffee goes{' '}
          <span className="marker-underline italic">cold</span>.
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-subtle sm:text-lg">
          You didn&rsquo;t sign up to run a small logistics company. AZEAP takes the swim class, the
          piano lesson, the carpool no one volunteered for, and the shin guards — and quietly sorts
          them out.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="#demo"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-md bg-tomato px-6 py-3 text-sm font-semibold text-white shadow-sticker transition-transform hover:-translate-y-0.5 sm:w-auto">
            
            Poke at the demo planner
            <ArrowDownIcon className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
          </a>
          <a
            href="#invite"
            className="inline-flex w-full items-center justify-center rounded-md border border-ink/20 bg-white px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink/50 sm:w-auto">
            
            Get an invite
          </a>
        </div>

        <p className="mt-4 text-xs text-subtle">
          No credit card. No app to download. No &ldquo;book a demo with our team.&rdquo; There is no
          team.
        </p>
      </div>

      <div className="mx-auto mt-12 grid w-full max-w-5xl grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-4">
        {CARDS.map((card, i) =>
        <motion.article
          key={card.title}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.45, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
          className={`${card.tilt} group relative rounded-lg border border-rule bg-white p-4 shadow-planner transition-transform duration-300 hover:rotate-0 hover:-translate-y-1`}>
          
            <span
            aria-hidden="true"
            className={`absolute -top-2 left-6 h-4 w-16 -rotate-2 rounded-sm ${card.accent} opacity-80`} />
          
            <div className="flex items-center gap-2 border-b border-dashed border-rule pb-2.5">
              <card.icon className="h-4 w-4 text-tomato" strokeWidth={2} />
              <h2 className="font-display text-base font-semibold text-ink">{card.title}</h2>
            </div>
            <ul className="mt-3 space-y-2">
              {card.lines.map((line) =>
            <li key={line} className="flex items-start gap-2 text-[13px] leading-snug text-ink/80">
                  <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint" strokeWidth={3} />
                  {line}
                </li>
            )}
            </ul>
            <p className="mt-3 font-hand text-base leading-tight text-tomato/90">{card.note}</p>
          </motion.article>
        )}
      </div>
    </section>);

}