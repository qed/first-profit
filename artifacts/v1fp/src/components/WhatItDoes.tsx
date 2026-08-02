import React from 'react';
import { motion } from 'framer-motion';
import { MessagesSquareIcon, ClockIcon, ShirtIcon, BellRingIcon } from 'lucide-react';

const ITEMS = [
{
  icon: MessagesSquareIcon,
  title: 'Asks the other parents so you don’t have to',
  body: 'AZEAP works out who lives near you, who is already driving that way, and sends the awkward "any chance you could take Ada?" message. You approve it with one tap.',
  note: 'this is the part grown-ups hate most'
},
{
  icon: ClockIcon,
  title: 'Stacks the week so you drive less',
  body: 'Two activities on the same side of town get put back to back. Two kids in one place get put on the same day. The result is fewer trips and at least one evening where nothing happens.',
  note: 'Wednesdays are sacred now'
},
{
  icon: ShirtIcon,
  title: 'Remembers the kit, the snack, the form',
  body: 'Every activity carries its own list — shin guards, goggles, £2 in coins, the permission slip due Friday. It reminds you the night before, not as you pull into the car park.',
  note: 'goggles are always the problem'
},
{
  icon: BellRingIcon,
  title: 'Tells you when a plan breaks',
  body: 'Practice cancelled, coach running late, party moved to Sunday. AZEAP catches the change, reshuffles the day and tells you what is different. No 47-message group chat.',
  note: 'mum cried happy tears at this one'
}];


export function WhatItDoes() {
  return (
    <section id="what" className="w-full border-t border-rule bg-white px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto w-full max-w-5xl">
        <div className="max-w-2xl">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tomato">
            Four planners in a trench coat
          </span>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">
            What the &ldquo;almost zero effort&rdquo; part actually means
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-subtle">
            You still have to say yes to things. That is the &ldquo;almost.&rdquo; Everything after
            that is the software&rsquo;s problem.
          </p>
        </div>

        <ol className="mt-10 grid grid-cols-1 gap-x-10 gap-y-9 md:grid-cols-2">
          {ITEMS.map((item, i) =>
          <motion.li
            key={item.title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.4, delay: i % 2 * 0.06 }}
            className="relative border-t border-rule pt-5">
            
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-ink/10 bg-paper">
                  <item.icon className="h-4 w-4 text-tomato" strokeWidth={2} />
                </span>
                <span className="font-hand text-lg text-subtle">0{i + 1}</span>
              </div>
              <h3 className="mt-3 font-display text-xl font-semibold leading-snug text-ink">
                {item.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-subtle">{item.body}</p>
              <p className="mt-2.5 font-hand text-lg leading-tight text-mint">{item.note}</p>
            </motion.li>
          )}
        </ol>
      </div>
    </section>);

}