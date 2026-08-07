/**
 * Handoff sign-in deep-link reader (new-user-flow-v3, Unit 6).
 *
 * The120's account-ready screen opens a NEW TAB at
 * `https://firstprofit.school/auth/enter#code=<url-encoded one-time code>`.
 * This module is the first thing in the boot that touches that URL.
 *
 * WHY A FRAGMENT, AND WHY STRIP IT FIRST
 * The code rides the fragment because fragments are never sent to the server
 * and are excluded from the `Referer` header — so the only place it can leak is
 * OUR OWN page: the address bar, `document.referrer` of anything we load, the
 * back-stack, and any analytics / error-reporting / third-party script that
 * reads `location.href`. `consumeEnterLink()` therefore runs from
 * `src/screens/auth/bootEnterLink.ts`, a side-effect module imported ABOVE
 * every other JS import in `src/index.tsx`. That ORDER is the mechanism (a
 * bare call in index.tsx would not be: imports hoist above statements, so the
 * whole App tree would already have evaluated with the live code in the URL —
 * Unit 6 review, FIX 4). Module bodies evaluate depth-first in source order, so
 * the strip precedes the stage machine, every effect, and anything else in this
 * app that could observe the URL. Pinned by
 * `src/screens/auth/__tests__/bootOrder.test.ts`.
 *
 * The strip uses `history.replaceState`, NEVER `location.hash = ""`:
 *  - `location.hash = ""` PUSHES a new history entry, leaving the tokened URL
 *    one Back press away (and re-triggering a redeem loop on that Back).
 *  - `replaceState` overwrites the CURRENT entry, so the tokened URL is not
 *    reachable at all — which is what "one-time" has to mean in the address bar
 *    too, not just on the server.
 *
 * The read is path-scoped to `/auth/enter`: a stray `#code=` fragment anywhere
 * else in the app must never hijack the boot (the `verifyLink.ts` precedent,
 * where `?token=` only counts on `/signup/verify`).
 *
 * Pure over an injected location/history so it is testable without a browser.
 */

interface LocationLike {
  pathname: string;
  search: string;
  hash: string;
}

interface HistoryLike {
  replaceState: (data: unknown, unused: string, url: string) => void;
}

/** What the boot learned from the URL, before anything else could read it. */
export interface EnterLinkBoot {
  /** The decoded one-time code, or null (absent / malformed / wrong path). */
  code: string | null;
  /**
   * True when the SPA booted at `/auth/enter` AT ALL — including a refresh
   * AFTER the code was stripped or burned. The router uses this to show the
   * recovery screen instead of silently dropping the family on the landing
   * page with no explanation of what just failed.
   */
  fromEnterRoute: boolean;
}

const NO_ENTER_LINK: EnterLinkBoot = { code: null, fromEnterRoute: false };

/** `/auth/enter`, with or without the trailing slash. */
export function isEnterPath(pathname: string): boolean {
  return /^\/auth\/enter\/?$/.test(pathname);
}

/**
 * Read the code out of a `#code=…` fragment. Hand-parsed rather than run
 * through `URLSearchParams`, which decodes `+` as a SPACE — that would silently
 * corrupt any code whose encoding contains one. Split, match, then
 * `decodeURIComponent` exactly once; malformed percent-encoding is null, never
 * a throw.
 */
export function readEnterCode(loc: LocationLike | null): string | null {
  if (!loc || !isEnterPath(loc.pathname || "")) return null;
  const hash = (loc.hash || "").replace(/^#/, "");
  if (!hash) return null;
  for (const part of hash.split("&")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) !== "code") continue;
    const raw = part.slice(eq + 1);
    if (!raw) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      // Malformed percent-encoding: a code we cannot reconstruct is no code.
      return null;
    }
    const trimmed = decoded.trim();
    return trimmed || null;
  }
  return null;
}

/**
 * Rewrite the current history entry to the bare origin — dropping the code AND
 * the `/auth/enter` path, so neither a refresh nor a Back press can re-enter
 * the redeem. Non-fatal on failure: the code is already held in memory.
 */
function stripEnterLinkFromUrl(hist: HistoryLike | null, origin: string): void {
  if (!hist?.replaceState) return;
  try {
    hist.replaceState(null, "", `${origin}/`);
  } catch {
    /* nothing more to do — the URL is cosmetic once the code is in memory */
  }
}

/** Pure core, exported for tests: read, then strip. */
export function consumeEnterLinkFrom(
  loc: LocationLike | null,
  hist: HistoryLike | null,
  origin: string,
): EnterLinkBoot {
  if (!loc) return NO_ENTER_LINK;
  const fromEnterRoute = isEnterPath(loc.pathname || "");
  const code = readEnterCode(loc);
  // Strip whenever we booted at the handoff route, code or not: the route is a
  // one-shot entry point, and leaving it in the address bar invites a refresh
  // into a retry loop against a code the server has already burned.
  if (fromEnterRoute) stripEnterLinkFromUrl(hist, origin);
  return { code, fromEnterRoute };
}

let consumed: EnterLinkBoot | null = null;

/**
 * Read + strip the handoff link ONCE per page load, memoized. Called as early
 * in the boot as the module system allows — from `bootEnterLink.ts`, imported
 * first in `src/index.tsx`; every later reader uses `peekEnterLink()`.
 */
export function consumeEnterLink(): EnterLinkBoot {
  if (consumed) return consumed;
  if (typeof window === "undefined" || !window.location) {
    consumed = NO_ENTER_LINK;
    return consumed;
  }
  consumed = consumeEnterLinkFrom(
    {
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    },
    window.history ?? null,
    window.location.origin,
  );
  return consumed;
}

/**
 * What `consumeEnterLink` found, without re-reading the URL (which by then no
 * longer holds the code). Returns the empty result if the boot never consumed —
 * so a test or a non-browser render is never handed a phantom handoff.
 */
export function peekEnterLink(): EnterLinkBoot {
  return consumed ?? NO_ENTER_LINK;
}

/** Test-only: forget the memoized boot read. */
export function resetEnterLinkForTests(): void {
  consumed = null;
}
