/**
 * /staff boot-URL reader (Change #9), mirroring the verify-return deep-link
 * precedent (src/screens/signup/verifyLink.ts): `firstprofit.school/staff` is a
 * reserved route that falls through to the SPA; App reads the path ONCE at boot
 * and renders the StaffShell screen (logged-out capable) INSTEAD of the normal
 * stage routing — outside the game shell entirely (no GlobalNav).
 *
 * `staff` is reserved on BOTH serving layers, so a child can never claim the
 * handle and shadow this page: api/_lib/reservedHandles.ts (the claim check)
 * and the vercel.json rewrite exclusion list (the public-site fallthrough).
 *
 * Unlike the verify token, the path is NOT stripped from the address bar: it is
 * not a one-time secret, it IS the page's identity — a refresh should land on
 * the staff screen again.
 *
 * Pure over an injected `location` (defaults to `window.location`) so it is
 * testable without a real browser.
 */

interface LocationLike {
  pathname: string;
}

/** True when the boot URL is the reserved staff route `/staff` (trailing slash ok). */
export function isStaffPath(loc: LocationLike | null = defaultLocation()): boolean {
  if (!loc) return false;
  return /^\/staff\/?$/.test(loc.pathname || "");
}

/**
 * The RETIRED staff route `/admin`.
 *
 * Production redirects it at the edge (the vercel.json `redirects` entry, which
 * Vercel evaluates BEFORE rewrites), but `vite dev` never reads vercel.json and
 * a stale bookmark should land on the staff page in EVERY environment — so App
 * also treats it as the staff route and rewrites the address bar to /staff.
 */
export function isLegacyAdminPath(loc: LocationLike | null = defaultLocation()): boolean {
  if (!loc) return false;
  return /^\/admin\/?$/.test(loc.pathname || "");
}

function defaultLocation(): LocationLike | null {
  if (typeof window === "undefined" || !window.location) return null;
  return { pathname: window.location.pathname };
}
