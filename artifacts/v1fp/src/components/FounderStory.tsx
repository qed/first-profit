import React from 'react';
import { motion } from 'framer-motion';

export function FounderStory() {
  return (
    <section id="founder" className="w-full px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto grid w-full max-w-5xl items-center gap-10 md:grid-cols-2 md:gap-14">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5 }}
          className="relative">
          
          <div className="-rotate-1 overflow-hidden rounded-lg border border-rule bg-white p-2.5 shadow-planner">
            <img
              src="/5ef861c3-6505-4d2a-b714-74b9675879c4.jpg"
              alt="Illustration of the nine-year-old founder drawing a weekly calendar grid at a desk covered in sticky notes, pens and a laptop."
              className="w-full rounded-md"
              loading="lazy" />
            
            <p className="px-1 pb-1 pt-2.5 font-hand text-lg leading-tight text-subtle">
              version 1 of AZEAP. it was a big piece of paper.
            </p>
          </div>
          <span className="absolute -right-3 -top-4 rotate-6 rounded-sm bg-marker px-3 py-1.5 font-hand text-lg font-semibold text-ink shadow-sticker">
            Founder, age 9
          </span>
        </motion.div>

        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tomato">
            The kid who made this
          </span>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">
            &ldquo;My parents spent my whole football match on their phones. Sorting out my football
            match.&rdquo;
          </h2>
          <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-subtle">
            <p>
              Hi. I&rsquo;m Milo, I&rsquo;m 9, and I built AZEAP because grown-ups are extremely bad
              at planning. Not their fault — there are six group chats and one of them is called
              &ldquo;Swim (NEW).&rdquo;
            </p>
            <p>
              I drew the first version on a big piece of paper on my dad&rsquo;s desk. Then I made it
              a real thing with an AI, and my mum handles the boring legal bits. I am not trying to
              build a giant company yet. I am trying to get{' '}
              <span className="marker-underline font-semibold text-ink">ten families</span> to
              actually use it, one at a time, and I ask each one what annoyed them.
            </p>
            <p>
              If it works, my parents get their Saturday back and I get to be at my own football
              match with them watching. That&rsquo;s the whole business plan.
            </p>
          </div>
          <p className="mt-6 font-hand text-2xl text-ink">— Milo, founder, age 9</p>
          <p className="mt-1 text-xs text-subtle">Bedtime: 8:30pm. Support hours: after school.</p>
        </div>
      </div>
    </section>);

}