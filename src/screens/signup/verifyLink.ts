/**
 * Verify-return deep-link reader (Slice B Unit 9).
 *
 * The backend emails `${origin}/signup/verify?token=<token>`. When the parent
 * clicks it, the SPA boots at that URL; this reads the token out of it so App can
 * route into the signup verify-return step (kept OUT of isLoggedInStage). It also
 * accepts a bare `?fpv=<token>` query on any path, so the same handler works if
 * the link ever rides a query param instead of the path.
 *
 * Pure over an injected `location` (defaults to `window.location`) so it is
 * testable without a real browser. `stripVerifyTokenFromUrl` clears the token
 * from the address bar after it is read, so a refresh never re-triggers the flow
 * and the one-time token does not linger in history.
 */

interface LocationLike {
  pathname: string;
  search: string;
}

/** The verify token from the current URL, or null if this is not a return link. */
export function readVerifyToken(loc: LocationLike | null = defaultLocation()): string | null {
  if (!loc) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(loc.search || "");
  } catch {
    return null;
  }
  // `?fpv=` works on any path; `?token=` only counts on the /signup/verify path
  // (so an unrelated `token` query elsewhere never hijacks the boot).
  const fpv = params.get("fpv");
  if (fpv && fpv.trim()) return fpv.trim();
  const isVerifyPath = /\/signup\/verify\/?$/.test(loc.pathname || "");
  if (isVerifyPath) {
    const token = params.get("token");
    if (token && token.trim()) return token.trim();
  }
  return null;
}

/** Remove the token + verify path from the address bar (no reload). */
export function stripVerifyTokenFromUrl(): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  try {
    window.history.replaceState(null, "", window.location.origin + "/");
  } catch {
    // Non-fatal: the token is already consumed in memory.
  }
}

function defaultLocation(): LocationLike | null {
  if (typeof window === "undefined" || !window.location) return null;
  return { pathname: window.location.pathname, search: window.location.search };
}
