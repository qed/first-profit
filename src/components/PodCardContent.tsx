/**
 * Shared fpv2 floor cards — the presentational building blocks used by BOTH the
 * desktop 2D floor and the mobile vertical path (so the two breakpoint variants
 * stay pixel-identical at the card level). These are dumb: the parent computes
 * every label/flag (via gameCore + floorSelectors) and passes it in.
 *
 * Design source: design_handoff_v1_user_flow/README.md §H + the prototype markup
 * in "First Profit Flow.dc.html". Colors are the handoff phase tokens.
 *
 * Prototype divergence (noted for review): the prototype hard-codes "5 task pips"
 * / "n/5 unit tasks" per criterion, but the shipped path.ts data has 5 tasks for
 * 1.1 and 4 for 1.2. Pips + denominators here are DATA-DRIVEN (from the real task
 * counts) so every pip is reachable and a criterion reads done at full, not 4/5.
 */
import React from "react";

/** The five phase accent colors (handoff Design Tokens), by phase index 1..5. */
export const PHASE_UI = [
  { name: "Sell", promise: "Learn to confidently sell anything.", color: "hsl(14 78% 54%)", faded: "hsl(14 78% 54% / .3)" },
  { name: "Build", promise: "Ship a real thing people can buy.", color: "hsl(217 74% 56%)", faded: "hsl(217 74% 56% / .3)" },
  { name: "Validate", promise: "Prove it works before you scale it.", color: "hsl(265 52% 58%)", faded: "hsl(265 52% 58% / .3)" },
  { name: "Grow", promise: "Get to your first $1,000 in sales.", color: "hsl(150 52% 42%)", faded: "hsl(150 52% 42% / .3)" },
  { name: "Scale", promise: "Build the plan to $10,000 in profit.", color: "hsl(41 88% 52%)", faded: "hsl(41 88% 52% / .3)" },
] as const;

const SELL = PHASE_UI[0].color;
const INK = "hsl(25 34% 20%)";
const INK_SOFT = "hsl(25 20% 38%)";
const CARD_SHADOW = "0 6px 0 rgba(120,80,40,.1)";

/** A row of progress pips filled left-to-right. */
export function Pips({ pips, color }: { pips: boolean[]; color: string }) {
  return (
    <span className="flex gap-[3px]" aria-hidden>
      {pips.map((on, i) => (
        <span
          key={i}
          className="h-[5px] flex-1 rounded-full"
          style={{ background: on ? color : "hsl(25 34% 20% / .12)" }}
        />
      ))}
    </span>
  );
}

const cardBase =
  "flex flex-col gap-2.5 rounded-[14px] border-2 bg-[hsl(40_55%_97%)] p-3.5 text-left transition-transform hover:-translate-y-[3px] active:translate-y-0";

// ── Row 1 · The Path ────────────────────────────────────────────────────────

export function PhaseCard({
  index,
  unlocked,
  done,
  pips,
  onClick,
}: {
  index: number;
  unlocked: boolean;
  done: number;
  pips: boolean[];
  onClick?: () => void;
}) {
  const ph = PHASE_UI[index - 1];
  if (unlocked) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cardBase} min-h-[44px]`}
        style={{ borderColor: ph.color, boxShadow: CARD_SHADOW }}
      >
        <span className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-[7px] font-mono text-[11.5px] font-bold text-white"
              style={{ background: ph.color }}
            >
              {index}
            </span>
            <span className="font-display text-base font-extrabold" style={{ color: INK }}>
              {ph.name}
            </span>
          </span>
          <span className="text-xs font-semibold" style={{ color: ph.color }}>
            →
          </span>
        </span>
        <span className="block">
          <Pips pips={pips} color={ph.color} />
          <span className="mt-1.5 block font-mono text-[9.5px]" style={{ color: INK_SOFT }}>
            {done}/5 criteria
          </span>
        </span>
      </button>
    );
  }
  return (
    <div
      className="flex flex-col gap-2.5 rounded-[14px] border-2 border-dashed bg-[hsl(25_34%_20%/0.02)] p-3.5"
      style={{ borderColor: ph.faded }}
    >
      <span className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-[7px] font-mono text-[11.5px] font-bold text-white"
          style={{ background: ph.faded }}
        >
          {index}
        </span>
        <span className="font-display text-base font-extrabold" style={{ color: "hsl(25 34% 20% / .45)" }}>
          {ph.name}
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="text-[10px] opacity-45">
          🔒
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.06em]" style={{ color: "hsl(25 20% 38% / .75)" }}>
          Complete {PHASE_UI[index - 2]?.name ?? PHASE_UI[0].name} first
        </span>
      </span>
    </div>
  );
}

// ── Row 2 · The Company ─────────────────────────────────────────────────────

export function CompanyCard({
  emoji,
  name,
  url,
  onClick,
}: {
  emoji: string;
  name: string;
  url: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cardBase} min-h-[44px] gap-2 border-[hsl(25_34%_20%/0.15)]`}
      style={{ boxShadow: CARD_SHADOW }}
    >
      <span className="flex items-center justify-between">
        <span className="text-lg" aria-hidden>
          {emoji}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: "hsl(150 52% 40%)" }}>
          ● live
        </span>
      </span>
      <span className="block">
        <span className="block font-display text-[14.5px] font-bold" style={{ color: INK }}>
          {name}
        </span>
        <span className="mt-1 block break-all font-mono text-[9px]" style={{ color: INK_SOFT }}>
          {url}
        </span>
      </span>
    </button>
  );
}

/** Dashed placeholder slot ("＋ Built on The Path" / faint idea slot). */
export function DashedSlot({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <div
      className="flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed bg-[hsl(25_34%_20%/0.02)] p-3.5"
      style={{ borderColor: accent ? "hsl(14 78% 54% / .4)" : "hsl(25 34% 20% / .12)" }}
    >
      <span className="text-sm opacity-35" aria-hidden>
        ＋
      </span>
      <span
        className="text-center font-mono text-[9px] uppercase tracking-[0.06em]"
        style={{ color: accent ? "hsl(14 78% 44%)" : "hsl(25 20% 38% / .6)" }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Row 3 · The Products (read-only) ────────────────────────────────────────

export function ProductCard({ num, name, progress }: { num: number; name: string; progress: string }) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-[14px] border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] p-3"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <span className="font-mono text-[11px] font-bold" style={{ color: "hsl(14 78% 44%)" }}>
        Idea #{num}
      </span>
      <span className="block text-[11.5px] leading-[1.4]" style={{ color: INK }}>
        {name}
      </span>
      <span className="block font-mono text-[9px]" style={{ color: INK_SOFT }}>
        {progress}
      </span>
    </div>
  );
}

export function ProductEmpty({ num }: { num: number }) {
  return (
    <div className="flex min-h-[84px] items-center justify-center rounded-[14px] border-2 border-dashed border-[hsl(25_34%_20%/0.1)] bg-[hsl(25_34%_20%/0.015)] p-3">
      <span className="font-mono text-[9px] uppercase tracking-[0.06em]" style={{ color: "hsl(25 20% 38% / .5)" }}>
        Idea #{num}
      </span>
    </div>
  );
}

// ── Sell floor · room cards ─────────────────────────────────────────────────

export function SellRoomCard({
  sign,
  room,
  id,
  title,
  unlocked,
  complete,
  isNext,
  pips,
  meta,
  hint,
  onClick,
}: {
  sign: string;
  room: string;
  id: string;
  title: string;
  unlocked: boolean;
  complete: boolean;
  isNext: boolean;
  pips: boolean[];
  meta: string;
  hint: string;
  onClick?: () => void;
}) {
  if (!unlocked) {
    return (
      <div className="flex flex-col gap-2.5 rounded-[14px] border-2 border-dashed border-[hsl(25_34%_20%/0.15)] bg-[hsl(25_34%_20%/0.02)] p-3.5">
        <span className="text-lg opacity-35" aria-hidden>
          {sign}
        </span>
        <span className="block">
          <span className="block font-display text-[14.5px] font-bold leading-tight" style={{ color: "hsl(25 34% 20% / .45)" }}>
            {room}
          </span>
          <span className="mt-1 block text-[10.5px] leading-[1.4]" style={{ color: "hsl(25 20% 38% / .6)" }}>
            <b className="font-mono">{id}</b> · {title}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="text-[10px] opacity-45">
            🔒
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.06em]" style={{ color: "hsl(25 20% 38% / .75)" }}>
            {hint}
          </span>
        </span>
      </div>
    );
  }
  const border = isNext ? "hsl(150 52% 40%)" : complete ? "hsl(14 78% 54% / .5)" : "hsl(25 34% 20% / .15)";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cardBase} relative min-h-[44px]`}
      style={{ borderColor: border, boxShadow: CARD_SHADOW }}
    >
      {isNext ? (
        <span
          className="absolute -top-2.5 right-2.5 rounded-full px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-white"
          style={{ background: "hsl(150 52% 40%)" }}
        >
          You are here
        </span>
      ) : null}
      <span className="flex items-center justify-between">
        <span className="text-lg" aria-hidden>
          {sign}
        </span>
        {complete ? (
          <span
            className="fp-stamp flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white"
            style={{ background: "hsl(4 62% 46%)", animation: "fp-stamp .55s cubic-bezier(.34,1.56,.64,1) both" }}
          >
            ✓
          </span>
        ) : null}
      </span>
      <span className="block">
        <span className="block font-display text-[14.5px] font-bold leading-tight" style={{ color: INK }}>
          {room}
        </span>
        <span className="mt-1 block text-[10.5px] leading-[1.4]" style={{ color: INK_SOFT }}>
          <b className="font-mono" style={{ color: "hsl(14 78% 44%)" }}>
            {id}
          </b>{" "}
          · {title}
        </span>
      </span>
      <span className="block">
        <Pips pips={pips} color={SELL} />
        <span className="mt-1.5 block font-mono text-[9px]" style={{ color: INK_SOFT }}>
          {meta}
        </span>
      </span>
    </button>
  );
}

// ── Sell floor · Your Ideas slots ───────────────────────────────────────────

export function IdeaSlot({
  kind,
  num,
  name,
  progress,
  current,
  onClick,
}: {
  kind: "filled" | "create" | "future";
  num: number;
  name?: string;
  progress?: string;
  current?: boolean;
  onClick?: () => void;
}) {
  if (kind === "create") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed bg-[hsl(14_78%_54%/0.04)] p-3 transition-transform hover:-translate-y-[3px]"
        style={{ borderColor: "hsl(14 78% 54% / .4)" }}
      >
        <span className="text-[15px]" style={{ color: "hsl(14 78% 44%)" }} aria-hidden>
          ＋
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.06em]" style={{ color: "hsl(14 78% 44%)" }}>
          Start Idea #{num}
        </span>
      </button>
    );
  }
  if (kind === "future") {
    return <ProductEmpty num={num} />;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[84px] flex-col gap-1.5 rounded-[14px] border-2 bg-[hsl(40_55%_97%)] p-3 text-left transition-transform hover:-translate-y-[3px]"
      style={{ borderColor: current ? "hsl(14 78% 54%)" : "hsl(25 34% 20% / .15)", boxShadow: CARD_SHADOW }}
    >
      <span className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-bold" style={{ color: "hsl(14 78% 44%)" }}>
          Idea #{num}
        </span>
        {current ? (
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.06em]"
            style={{ background: "hsl(14 78% 54% / .12)", color: "hsl(14 78% 44%)" }}
          >
            current
          </span>
        ) : null}
      </span>
      <span className="block text-[11.5px] leading-[1.4]" style={{ color: INK }}>
        {name}
      </span>
      <span className="block font-mono text-[9px]" style={{ color: INK_SOFT }}>
        {progress}
      </span>
    </button>
  );
}

/** Section heading used by both floor views. */
export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <p className="font-display text-[17px] font-extrabold" style={{ color: INK }}>
        {children}
      </p>
      {sub ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: INK_SOFT }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}
