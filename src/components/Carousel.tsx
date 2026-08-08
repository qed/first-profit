/**
 * Shared carousel (fpv03 U1). The ONE carousel implementation for the v3
 * screens: S01's example carousel now, S06/S07/S09 later. Do not fork it per
 * screen; extend it here.
 *
 * Interaction contract (plan: "shared interaction patterns decided once"):
 * - One slide visible at a time; prev/next wrap around.
 * - Desktop (sm+): circular arrow buttons vertically centered at the sides.
 * - Mobile (<sm): swipe gestures plus a bottom-docked control row (the side
 *   arrows collapse into it), because there is no room outside the content at
 *   ~390px and tap targets must stay >=44px, DOTS INCLUDED (each dot is a
 *   44px hit area around a small visual pill).
 * - Swipe only fires when the gesture is clearly horizontal (|dx| must
 *   dominate |dy|), so a diagonal page-scroll drag never hijacks the slide.
 * - Dots follow the ARIA tabs keyboard pattern: roving tabindex plus
 *   ArrowLeft/ArrowRight (wrapping) moving both focus and selection.
 * - No auto-advance. Position is announced via an aria-live region.
 * - `onIndexChange` (optional) lets a parent observe the active slide, for
 *   consumers that wire per-slide actions (S07 "Choose this look") or render
 *   "N of M" outside (S09). Internal state stays uncontrolled.
 *
 * Mobile-first per CLAUDE.md: base classes are the mobile layout, `sm:` layers
 * the side-arrow presentation on top. No new breakpoint tiers.
 */
import { useRef, useState, type ReactNode } from "react";

const SWIPE_THRESHOLD_PX = 48;
/** |dx| must beat |dy| by this ratio to count as a horizontal swipe. */
const SWIPE_AXIS_DOMINANCE = 1.5;

function ArrowButton({
  direction,
  onClick,
  className = "",
}: {
  direction: "prev" | "next";
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "Previous" : "Next"}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-[hsl(40_14%_86%)] bg-white text-lg text-ink shadow-[0_1px_3px_rgba(30,24,16,0.08)] transition-transform hover:-translate-y-0.5 active:translate-y-0 ${className}`}
    >
      {direction === "prev" ? "←" : "→"}
    </button>
  );
}

export function Carousel({
  slides,
  ariaLabel,
  className = "",
  onIndexChange,
}: {
  slides: ReactNode[];
  ariaLabel: string;
  className?: string;
  onIndexChange?: (index: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const dotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const count = slides.length;

  const show = (next: number) => {
    setIndex(next);
    onIndexChange?.(next);
  };
  const go = (delta: number) => show((index + delta + count) % count);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // A mostly-vertical drag is the page scrolling, not a swipe.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_DOMINANCE) return;
    go(dx < 0 ? 1 : -1);
  };

  /** ARIA tabs keyboard pattern on the dot list: arrows move focus AND
   * selection, wrapping at the ends. */
  const onDotKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : -1) + count) % count;
    show(next);
    dotRefs.current[next]?.focus();
  };

  if (count === 0) return null;

  return (
    // `relative` so the sr-only live region positions inside this section,
    // never at document coordinates (sr-only-escapes-scroll-container learning).
    <section aria-label={ariaLabel} className={`relative ${className}`}>
      <div className="relative">
        {/* Desktop side arrows: outside the content on sm+, hidden on mobile
            where the bottom-docked row takes over. */}
        <ArrowButton
          direction="prev"
          onClick={() => go(-1)}
          className="absolute -left-14 top-1/2 z-10 hidden -translate-y-1/2 sm:inline-flex lg:-left-16"
        />
        <ArrowButton
          direction="next"
          onClick={() => go(1)}
          className="absolute -right-14 top-1/2 z-10 hidden -translate-y-1/2 sm:inline-flex lg:-right-16"
        />
        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {slides[index]}
        </div>
      </div>

      {/* Control row: dots always; arrows join the row below sm. Each dot is
          a >=44px button (CLAUDE.md tap-target rule) around a small pill. */}
      <div className="mt-4 flex items-center justify-center gap-1">
        <ArrowButton direction="prev" onClick={() => go(-1)} className="mr-2 sm:hidden" />
        <span
          className="flex items-center"
          role="tablist"
          aria-label={`${ariaLabel} position`}
          onKeyDown={onDotKeyDown}
        >
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              ref={(el) => {
                dotRefs.current[i] = el;
              }}
              tabIndex={i === index ? 0 : -1}
              aria-selected={i === index}
              aria-label={`Go to item ${i + 1} of ${count}`}
              onClick={() => show(i)}
              className="flex h-11 min-w-[28px] items-center justify-center px-0.5"
            >
              <span
                aria-hidden
                className={`h-2.5 rounded-full transition-all ${
                  i === index ? "w-7 bg-scale" : "w-2.5 bg-[hsl(40_10%_78%)]"
                }`}
              />
            </button>
          ))}
        </span>
        <ArrowButton direction="next" onClick={() => go(1)} className="ml-2 sm:hidden" />
      </div>
      <p aria-live="polite" className="sr-only">
        Item {index + 1} of {count}
      </p>
    </section>
  );
}
