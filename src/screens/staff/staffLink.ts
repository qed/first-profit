/**
 * /admin boot-URL reader (Change #9), mirroring the verify-return deep-link
 * precedent (src/screens/signup/verifyLink.ts): `firstprofit.school/admin` is a
 * reserved route that falls through to the SPA; App reads the path ONCE at boot
 * and renders the staff AdminSuggestions screen (logged-out capable) INSTEAD of
 * the normal stage routing — outside the game shell entirely (no GlobalNav).
 *
 * Unlike the verify token, the path is NOT stripped from the address bar: it is
 * not a one-time secret, it IS the page's identity — a refresh should land on
 * the admin screen again.
 *
 * Pure over an injected `location` (defaults to `window.location`) so it is
 * testable without a real browser.
 */

interface LocationLike {
  pathname: string;
}

/** True when the boot URL is the reserved staff route `/admin` (trailing slash ok). */
export function isAdminPath(loc: LocationLike | null = defaultLocation()): boolean {
  if (!loc) return false;
  return /^\/admin\/?$/.test(loc.pathname || "");
}

function defaultLocation(): LocationLike | null {
  if (typeof window === "undefined" || !window.location) return null;
  return { pathname: window.location.pathname };
}
