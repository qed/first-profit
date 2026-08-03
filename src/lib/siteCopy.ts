/**
 * Shared public-site copy (real-public-site plan Unit 3 review, fix 5).
 *
 * The default site headline previously lived hand-typed in three places
 * (the in-game Your Site room, the onboarding website reveal, and the public
 * page renderer in api/_lib/renderSite.ts). R12 requires the public page to
 * show "the same default headline used in-game", so the sentence lives HERE
 * once and everyone imports it. Pure string module — no React, no env — so
 * both the SPA bundle and the Vercel Function can import it.
 *
 * Callers pass an already-defaulted display name (e.g. "Founder" when the
 * profile has none); this function does not trim, clamp, or escape — the
 * public renderer applies its own render-boundary clamp + escaping.
 */
export function defaultSiteHeadline(firstName: string): string {
  return `Hi, I'm ${firstName}. This is the future site of my first $1,000 profit company.`;
}
