import { motion, useReducedMotion } from 'framer-motion';
import { COVER_ASPECT, useCoverImage } from '../lib/cover';

/**
 * THE FIRST <img> IN THIS CODEBASE (new-user-flow-v3, Unit 7; R12).
 *
 * Everything drawn here used to be inline SVG, which cannot fail to load. An
 * image can, so this module is written around the failure rather than around
 * the happy path — see `useCoverImage`.
 *
 * ── WHAT THE COVER IS ──
 * A `data:image/svg+xml;base64,…` URL adopted from the sign-in response
 * (`src/lib/auth.ts` — `asCoverUrl` is the one gate that decides what may reach
 * an `src` here). It is a complete SVG DOCUMENT, so it is rendered ONLY as an
 * image: an `<img>` parses SVG sandboxed, with no script execution and no
 * external fetches, which is the context The120's compositor escapes its
 * untrusted interpolations for. NEVER inline these bytes into the DOM.
 *
 * ── THERE IS NO "BEING DRAWN" STATE, DELIBERATELY ──
 * A kid either has a picture or has the sprite. Nothing in this product queues
 * a redraw, so there is no pending work for a spinner or a "your cover is being
 * drawn" line to be about, and a template cover settled at `final` IS finished.
 * Copy that promises work nobody performs is the failure mode this omission
 * exists to avoid.
 */

/**
 * The cover as a small framed portrait.
 *
 * `width`/`height` are EXPLICIT attributes AND inline styles, not just classes:
 * they reserve the box before the bytes decode so nothing reflows, which matters
 * most on the 390px path where the avatar sits above every card. `object-cover`
 * because the source is authored 4:5 but a future non-template cover must be
 * cropped, never stretched. `w`/`h` are derived from ONE number so the frame can
 * never go out of ratio by hand-editing one of them.
 */
export function CoverPortrait({
  src,
  name,
  width,
  onError,
  className = ''
}: {
  src: string;
  name: string;
  width: number;
  onError: () => void;
  className?: string;
}) {
  const height = Math.round(width / COVER_ASPECT);
  return (
    <img
      src={src}
      // The picture IS the child, and their name is already rendered beside it
      // on every surface — so the alt names the object, not the person again.
      alt={`${name}'s comic cover`}
      width={width}
      height={height}
      style={{ width, height }}
      className={`shrink-0 rounded-[4px] border-2 border-ink bg-paper object-cover ${className}`}
      onError={onError}
      draggable={false} />);


}

/** The bobbing founder figure with name tag, without any positioning.
 *  `coverUrl` (v3 Unit 7) puts the child's comic cover where the procedural
 *  figure goes — but only while it actually loads. */
export function AvatarSprite({ name, coverUrl }: {name: string;coverUrl?: string | null;}) {
  // Respect prefers-reduced-motion: hold the figure static instead of bobbing.
  const reduceMotion = useReducedMotion();
  const cover = useCoverImage(coverUrl);
  return (
    <motion.div
      animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
      transition={reduceMotion ? undefined : { repeat: Infinity, duration: 2, ease: 'easeInOut' }}
      className="flex flex-col items-center">

      {/* max-w + truncate so a long child-entered first name can never push past
          the 390px viewport (no-horizontal-scroll is a hard rule). */}
      <span className="mb-1 block max-w-[7.5rem] truncate rounded-full bg-ink px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-paper">
        {name}
      </span>
      {cover.show && coverUrl ?
      // 44px wide → 55 tall. Barely larger than the 34x46 sprite it replaces,
      // so no surface has to re-reserve space for it at any breakpoint.
      <CoverPortrait src={coverUrl} name={name} width={44} onError={cover.onError} /> :

      <svg width="34" height="46" viewBox="0 0 34 46" aria-hidden>
          <ellipse cx="17" cy="44" rx="11" ry="2.5" fill="rgba(26,23,18,0.18)" />
          <rect x="8" y="20" width="18" height="19" rx="7" fill="#2F5D8C" />
          <rect x="12" y="36" width="4" height="8" rx="2" fill="#1A1712" />
          <rect x="18" y="36" width="4" height="8" rx="2" fill="#1A1712" />
          <circle cx="17" cy="12" r="9" fill="#F0C89A" />
          <path d="M8 11a9 9 0 0 1 18 0v-1a9 9 0 0 0-18 0z" fill="#E0562A" />
          <path d="M7 11h20a1.5 1.5 0 0 1 0 3H7a1.5 1.5 0 0 1 0-3z" fill="#E0562A" />
          <circle cx="14" cy="13" r="1.3" fill="#1A1712" />
          <circle cx="20" cy="13" r="1.3" fill="#1A1712" />
        </svg>
      }
    </motion.div>);

}

export function Avatar({ x, y, name, coverUrl }: {x: number;y: number;name: string;coverUrl?: string | null;}) {
  return (
    <motion.div
      className="pointer-events-none absolute z-30"
      style={{ left: 0, top: 0 }}
      animate={{ left: `${x}%`, top: `${y}%` }}
      transition={{ type: 'spring', stiffness: 60, damping: 16 }}>

      <div className="-translate-x-1/2 -translate-y-full">
        <AvatarSprite name={name} coverUrl={coverUrl} />
      </div>
    </motion.div>);

}
