import React, { useState } from 'react';
import { CheckIcon, CopyIcon, GlobeIcon, LockIcon, PlusIcon } from 'lucide-react';
import { useGame } from '../../state/GameContext';
import { Btn, Field, Panel } from '../ui';

const COLORWAYS: {id: 'ember' | 'ocean' | 'moss' | 'plum';hex: string;name: string;}[] = [
{ id: 'ember', hex: '#E0562A', name: 'Ember' },
{ id: 'ocean', hex: '#2F5D8C', name: 'Ocean' },
{ id: 'moss', hex: '#2E7D53', name: 'Moss' },
{ id: 'plum', hex: '#6B4E8C', name: 'Plum' }];


export function WebsitePanel() {
  const {
    profile,
    company,
    updateCompany,
    fields,
    siteUrl,
    backers,
    currentPhase,
    isStepDone
  } = useGame();
  const [copied, setCopied] = useState(false);
  const [posts, setPosts] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const brand = COLORWAYS.find((c) => c.id === company.colorway)?.hex ?? '#E0562A';

  const canAddProduct = isStepDone('1.2');
  const canAddContent = currentPhase === 'validate' || currentPhase === 'grow' || currentPhase === 'scale';

  return (
    <>
      <Panel title="Your page is live" hint="Since day one" accent={brand}>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-ink/15 bg-white px-3.5 py-2.5">
          <GlobeIcon className="h-4 w-4 text-graphite" />
          <span className="font-mono text-sm">{siteUrl}</span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-go">
            <span className="h-1.5 w-1.5 rounded-full bg-go" /> live
          </span>
          <button
            type="button"
            onClick={() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }}
            className="flex items-center gap-1.5 rounded-lg border-2 border-ink/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider hover:border-ink/40">
            
            {copied ? <CheckIcon className="h-3 w-3 text-go" /> : <CopyIcon className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>

        {/* the actual page */}
        <div className="mt-4 overflow-hidden rounded-2xl border-2 border-ink/15 bg-white">
          <div className="flex items-center gap-2 border-b-2 border-ink/10 bg-ink/5 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-ember" />
            <span className="h-2.5 w-2.5 rounded-full bg-gold" />
            <span className="h-2.5 w-2.5 rounded-full bg-go" />
            <span className="ml-2 rounded-md bg-white px-2 py-0.5 font-mono text-[10px] text-graphite">
              {siteUrl}
            </span>
          </div>
          <div className="px-6 py-8 text-center">
            <p
              className="font-mono text-[10px] font-bold uppercase tracking-[0.3em]"
              style={{ color: brand }}>
              
              {profile.firstName}
            </p>
            <p className="mx-auto mt-3 max-w-md font-display text-xl font-bold leading-snug">
              {company.headline}
            </p>

            {fields.oneLiner?.trim() ?
            <p className="mx-auto mt-4 max-w-sm text-sm text-graphite">{fields.oneLiner}</p> :
            null}

            {canAddProduct && company.product !== 'Invest in me' ?
            <span
              className="mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: brand }}>
              
                {company.cta} · ${company.price}
              </span> :

            <span
              className="mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: brand }}>
              
                Invest in me · $10 gets you $20 credit
              </span>
            }

            {backers.length ?
            <div className="mt-6 border-t-2 border-dashed border-ink/10 pt-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-graphite">
                  Backed by
                </p>
                <p className="mt-1.5 text-sm text-ink">
                  {backers.map((b) => b.name).join(' · ')}
                </p>
              </div> :
            null}

            {posts.length ?
            <ul className="mt-6 space-y-1.5 text-left">
                {posts.map((post, i) =>
              <li key={i} className="rounded-lg bg-ink/5 px-3 py-2 text-xs">
                    {post}
                  </li>
              )}
              </ul> :
            null}
          </div>
        </div>
      </Panel>

      <Panel title="Make it yours" hint="A little at a time">
        <div className="grid gap-4">
          <Field
            label="The one sentence on your page"
            value={company.headline}
            onChange={(v) => updateCompany({ headline: v })}
            long />
          
          <div>
            <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-graphite">
              Your colour
            </span>
            <div className="flex gap-2">
              {COLORWAYS.map((c) =>
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                onClick={() => updateCompany({ colorway: c.id })}
                className={[
                'h-10 flex-1 rounded-xl border-2 transition-transform',
                company.colorway === c.id ?
                'scale-105 border-ink' :
                'border-transparent hover:scale-105'].
                join(' ')}
                style={{ backgroundColor: c.hex }} />

              )}
            </div>
          </div>
        </div>

        <ul className="mt-5 space-y-2">
          <SectionRow
            label="Your product and its price"
            unlocked={canAddProduct}
            hint="Unlocks after your first real sale">
            
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <Field
                label="Product"
                value={company.product}
                onChange={(v) => updateCompany({ product: v })} />
              
              <Field
                label="Price"
                value={String(company.price)}
                onChange={(v) => updateCompany({ price: Number(v) || 0 })}
                type="number"
                suffix="$" />
              
            </div>
          </SectionRow>

          <SectionRow
            label="Posts that pull strangers in"
            unlocked={canAddContent}
            hint="Unlocks in Phase 3 · Validate">
            
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field
                  label="Post title"
                  value={draft}
                  onChange={setDraft}
                  placeholder="How I made 30 bracelets in one weekend" />
                
              </div>
              <Btn
                tone="ink"
                disabled={!draft.trim()}
                onClick={() => {
                  setPosts((prev) => [...prev, draft.trim()]);
                  setDraft('');
                }}>
                
                Publish
              </Btn>
            </div>
            {posts.length ?
            <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-graphite">
                {posts.length} published · {12 + posts.length * 9} external views
              </p> :
            null}
          </SectionRow>
        </ul>
      </Panel>
    </>);

}

function SectionRow({
  label,
  hint,
  unlocked,
  children





}: {label: string;hint: string;unlocked: boolean;children: React.ReactNode;}) {
  const [open, setOpen] = useState(false);
  if (!unlocked) {
    return (
      <li className="flex items-center gap-3 rounded-xl border-2 border-dashed border-ink/15 px-3.5 py-3 text-sm text-graphite">
        <LockIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{label}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider">{hint}</span>
      </li>);

  }
  return (
    <li className="rounded-xl border-2 border-ink/10 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-sm font-semibold">
        
        <PlusIcon className="h-4 w-4" />
        {label}
      </button>
      {open ? <div className="border-t-2 border-dashed border-ink/10 p-3.5">{children}</div> : null}
    </li>);

}