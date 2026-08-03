/** Logo mark: five ascending steps, one per phase color (adapted from
 * assets/logo-mark.svg). Inline so it inherits `height` from the className.
 * Shared by the global nav and the landing screen. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 -6 300 276"
      className={className}
      role="img"
      aria-label="First Profit logo mark, five ascending steps, one per phase"
    >
      <path d="M18 260 L58 260 L58 196 L18 210 Z" fill="hsl(14 78% 54%)" />
      <path d="M18 210 L58 196 L44 184 L4 198 Z" fill="hsl(14 80% 67%)" />
      <path d="M74 260 L114 260 L114 148 L74 162 Z" fill="hsl(217 74% 56%)" />
      <path d="M74 162 L114 148 L100 136 L60 150 Z" fill="hsl(217 78% 69%)" />
      <path d="M130 260 L170 260 L170 100 L130 114 Z" fill="hsl(265 52% 58%)" />
      <path d="M130 114 L170 100 L156 88 L116 102 Z" fill="hsl(265 56% 70%)" />
      <path d="M186 260 L226 260 L226 52 L186 66 Z" fill="hsl(150 52% 42%)" />
      <path d="M186 66 L226 52 L212 40 L172 54 Z" fill="hsl(150 45% 56%)" />
      <path d="M242 260 L282 260 L282 10 L242 24 Z" fill="hsl(41 88% 52%)" />
      <path d="M242 24 L282 10 L268 -2 L228 12 Z" fill="hsl(45 92% 65%)" />
    </svg>
  );
}
