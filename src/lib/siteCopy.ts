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

/**
 * Input caps for the two learner-authored public strings (R6, Unit 6).
 *
 * These mirror the render-boundary clamps that already exist in
 * `api/_lib/renderSite.ts` (HEADLINE_MAX / ONE_LINER_MAX) and the120's
 * projection trigger (truncate to 120/140): the input cap is the UX half
 * (nothing to silently truncate later), the projection/render clamps stay
 * the enforcement. Keep all three in sync when either changes.
 *
 * Content screening for these strings is deliberately SERVER-side (the
 * projection/publish layer stores blocked strings empty, so the renderer's
 * default copy shows) — the client ships no blocklist corpus (see
 * src/lib/handleRules.ts for the same decision on handles).
 */
export const SITE_HEADLINE_MAX_CHARS = 120;
export const SITE_ONE_LINER_MAX_CHARS = 140;
