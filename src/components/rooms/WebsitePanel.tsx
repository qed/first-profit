import React, { useState } from 'react';
import { GlobeIcon, RocketIcon } from 'lucide-react';
import { useGame } from '../../state/GameContext';
import { Btn, Field, Panel } from '../ui';

const COLORWAYS: {id: 'ember' | 'ocean' | 'moss' | 'plum';hex: string;name: string;}[] = [
{ id: 'ember', hex: '#E0562A', name: 'Ember' },
{ id: 'ocean', hex: '#2F5D8C', name: 'Ocean' },
{ id: 'moss', hex: '#2E7D53', name: 'Moss' },
{ id: 'plum', hex: '#6B4E8C', name: 'Plum' }];


export function WebsitePanel() {
  const { company, updateCompany, artifacts, buildArtifact, fields } = useGame();
  const [posts, setPosts] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const brand = COLORWAYS.find((c) => c.id === company.colorway)?.hex ?? '#E0562A';
  const slug = company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return (
    <>
      <Panel title="The Website Studio" hint={artifacts.website ? 'Live' : 'Draft'} accent={brand}>
        <div className="grid gap-4">
          <Field
            label="Headline"
            value={company.headline}
            onChange={(v) => updateCompany({ headline: v })} />
          
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Button label"
              value={company.cta}
              onChange={(v) => updateCompany({ cta: v })} />
            
            <div>
              <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-graphite">
                Brand colour
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
                  'border-ink scale-105' :
                  'border-transparent hover:scale-105'].
                  join(' ')}
                  style={{ backgroundColor: c.hex }} />

                )}
              </div>
            </div>
          </div>
        </div>

        {/* live preview */}
        <div className="mt-5 overflow-hidden rounded-2xl border-2 border-ink/15 bg-white">
          <div className="flex items-center gap-2 border-b-2 border-ink/10 bg-ink/5 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-ember" />
            <span className="h-2.5 w-2.5 rounded-full bg-gold" />
            <span className="h-2.5 w-2.5 rounded-full bg-go" />
            <span className="ml-2 flex items-center gap-1.5 rounded-md bg-white px-2 py-0.5 font-mono text-[10px] text-graphite">
              <GlobeIcon className="h-3 w-3" /> {slug || 'your-company'}.firstprofit.site
            </span>
          </div>
          <div className="p-6 text-center">
            <p
              className="font-mono text-[10px] font-bold uppercase tracking-[0.3em]"
              style={{ color: brand }}>
              
              {company.name}
            </p>
            <h4 className="mx-auto mt-2 max-w-md font-display text-2xl font-black leading-tight">
              {company.headline}
            </h4>
            <p className="mx-auto mt-2 max-w-sm text-sm text-graphite">
              {fields.oneLiner?.trim() || company.product}
            </p>
            <span
              className="mt-4 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: brand }}>
              
              {company.cta} · ${company.price}
            </span>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {['What it is', 'How to order', 'When you get it'].map((t) =>
              <div key={t} className="rounded-xl bg-ink/5 px-2 py-3 text-[11px] text-graphite">
                  {t}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <Btn tone="go" full disabled={artifacts.website} onClick={() => buildArtifact('website')}>
            <span className="flex items-center justify-center gap-2">
              <RocketIcon className="h-4 w-4" />
              {artifacts.website ? 'Published — your URL is live' : 'Publish to a live URL'}
            </span>
          </Btn>
        </div>
      </Panel>

      <Panel title="Content that pulls strangers in" hint={`${posts.length}/2 published`}>
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
            disabled={!draft.trim() || !artifacts.website}
            onClick={() => {
              setPosts((prev) => [...prev, draft.trim()]);
              setDraft('');
            }}>
            
            Publish
          </Btn>
        </div>
        {!artifacts.website ?
        <p className="mt-3 text-xs text-graphite">Publish the site first — content needs a home.</p> :
        null}
        <ul className="mt-4 space-y-2">
          {posts.map((post, i) =>
          <li
            key={i}
            className="flex items-center justify-between rounded-xl border-2 border-ink/10 bg-white px-3.5 py-2.5 text-sm">
            
              <span>{post}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-graphite">
                {12 + i * 9} external views
              </span>
            </li>
          )}
        </ul>
      </Panel>
    </>);

}