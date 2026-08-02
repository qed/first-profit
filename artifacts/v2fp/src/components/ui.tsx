import React from 'react';

export function Panel({
  title,
  hint,
  children,
  accent = '#1A1712'





}: {title: string;hint?: string;children: React.ReactNode;accent?: string;}) {
  return (
    <section className="rounded-2xl border-2 border-ink/10 bg-parchment shadow-card">
      <header className="flex items-baseline justify-between gap-3 border-b-2 border-dashed border-ink/10 px-5 py-3">
        <h3 className="font-display text-lg font-bold" style={{ color: accent }}>
          {title}
        </h3>
        {hint ?
        <p className="font-mono text-[11px] uppercase tracking-wider text-graphite">{hint}</p> :
        null}
      </header>
      <div className="p-5">{children}</div>
    </section>);

}

export function Btn({
  children,
  onClick,
  tone = 'ink',
  disabled,
  full,
  type = 'button'







}: {children: React.ReactNode;onClick?: () => void;tone?: 'ink' | 'ember' | 'go' | 'quiet';disabled?: boolean;full?: boolean;type?: 'button' | 'submit';}) {
  const tones: Record<string, string> = {
    ink: 'bg-ink text-paper hover:bg-graphite',
    ember: 'bg-ember text-white hover:bg-[#c9481f]',
    go: 'bg-go text-white hover:bg-[#17803d]',
    quiet: 'bg-transparent text-ink border-2 border-ink/20 hover:border-ink/50'
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={[
      'rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
      'focus:outline-none focus-visible:ring-4 focus-visible:ring-ink/20',
      'disabled:cursor-not-allowed disabled:opacity-40',
      full ? 'w-full' : '',
      tones[tone]].
      join(' ')}>
      
      {children}
    </button>);

}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  long,
  suffix,
  type = 'text'








}: {label: string;value: string;onChange: (v: string) => void;placeholder?: string;long?: boolean;suffix?: string;type?: 'text' | 'number';}) {
  const id = `f-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const shared =
  'w-full rounded-xl border-2 border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-graphite/50 focus:border-ink/50 focus:outline-none';
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-graphite">
        {label}
      </span>
      {long ?
      <textarea
        id={id}
        rows={3}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={shared} /> :


      <div className="relative">
          <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={shared} />
        
          {suffix ?
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-graphite">
              {suffix}
            </span> :
        null}
        </div>
      }
    </label>);

}

export function Meter({
  value,
  max,
  color = '#1F9E4D',
  label





}: {value: number;max: number;color?: string;label?: string;}) {
  const pct = Math.min(100, Math.round(value / Math.max(max, 1) * 100));
  return (
    <div>
      {label ?
      <div className="mb-1 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-wider text-graphite">
          <span>{label}</span>
          <span>{pct}%</span>
        </div> :
      null}
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-ink/10"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'progress'}>
        
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }} />
        
      </div>
    </div>);

}

export function Chip({
  children,
  color = '#1A1712',
  tint = 'rgba(26,23,18,0.07)'




}: {children: React.ReactNode;color?: string;tint?: string;}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider"
      style={{ color, backgroundColor: tint }}>
      
      {children}
    </span>);

}