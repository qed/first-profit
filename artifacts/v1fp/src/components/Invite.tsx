import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2Icon, Loader2Icon, SendIcon } from 'lucide-react';

type Status = 'idle' | 'loading' | 'success' | 'error';

export function Invite() {
  const [email, setEmail] = useState('');
  const [headache, setHeadache] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    window.setTimeout(() => setStatus('success'), 900);
  };

  return (
    <section id="invite" className="w-full border-t border-rule bg-ink px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto grid w-full max-w-5xl gap-10 md:grid-cols-[1.1fr_1fr] md:gap-14">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-marker">
            One family at a time
          </span>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-paper sm:text-4xl">
            Family #7 of 10 is being set up right now.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-paper/70">
            AZEAP isn&rsquo;t launching to everyone. Ten families this term, set up personally, each
            one asked what still annoys them. Tell us your worst scheduling week and you&rsquo;ll get
            an invite when a slot opens.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-paper/70">
            {[
            'Free while it is only ten families',
            'Your kids’ names never leave your account',
            'A real reply, usually between 4pm and bedtime'].
            map((line) =>
            <li key={line} className="flex items-start gap-2">
                <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
                {line}
              </li>
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-rule bg-paper p-5 shadow-planner sm:p-6">
          {status === 'success' ?
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex h-full min-h-[240px] flex-col items-center justify-center text-center">
            
              <CheckCircle2Icon className="h-9 w-9 text-mint" />
              <h3 className="mt-4 font-display text-xl font-semibold text-ink">
                You&rsquo;re on the list
              </h3>
              <p className="mt-2 text-sm text-subtle">
                You&rsquo;re number 11. Which is awkward, but Milo will email you the moment a slot
                opens.
              </p>
              <p className="mt-3 font-hand text-xl text-tomato">thank you!!! — M</p>
            </motion.div> :

          <form onSubmit={handleSubmit} noValidate>
              <h3 className="font-display text-xl font-semibold text-ink">Request an invite</h3>
              <div className="mt-4">
                <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-[0.1em] text-subtle">
                  Your email
                </label>
                <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === 'error') setStatus('idle');
                }}
                placeholder="you@family.com"
                aria-invalid={status === 'error'}
                aria-describedby={status === 'error' ? 'email-error' : undefined}
                className={`mt-1.5 w-full rounded-md border bg-white px-3 py-2.5 text-sm text-ink placeholder:text-subtle/60 ${
                status === 'error' ? 'border-tomato' : 'border-rule'}`
                } />
              
                {status === 'error' &&
              <p id="email-error" className="mt-1.5 text-xs text-tomato">
                    That email looks made up. Try again?
                  </p>
              }
              </div>

              <div className="mt-4">
                <label
                htmlFor="headache"
                className="block text-xs font-semibold uppercase tracking-[0.1em] text-subtle">
                
                  Worst part of your week <span className="normal-case tracking-normal">(optional)</span>
                </label>
                <textarea
                id="headache"
                value={headache}
                onChange={(e) => setHeadache(e.target.value)}
                rows={3}
                placeholder="Tuesdays. Two kids, one car, opposite ends of town."
                className="mt-1.5 w-full resize-none rounded-md border border-rule bg-white px-3 py-2.5 text-sm text-ink placeholder:text-subtle/60" />
              
              </div>

              <button
              type="submit"
              disabled={status === 'loading'}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-tomato px-5 py-3 text-sm font-semibold text-white shadow-sticker transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-70">
              
                {status === 'loading' ?
              <>
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    Sending&hellip;
                  </> :

              <>
                    <SendIcon className="h-4 w-4" />
                    Ask for a slot
                  </>
              }
              </button>
              <p className="mt-3 text-center text-[11px] text-subtle">
                No spam. Milo doesn&rsquo;t know how to send spam yet.
              </p>
            </form>
          }
        </div>
      </div>
    </section>);

}