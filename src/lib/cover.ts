import { useEffect, useState } from "react";

/**
 * THE COVER URL GATE (new-user-flow-v3, Unit 7; R12).
 *
 * The child's comic cover arrives on the sign-in response as a self-contained
 * `data:image/svg+xml;base64,…` URL — The120 sends the PICTURE, not an address
 * for one. There is exactly ONE cover per child: it is rendered once, during
 * their parent's signup, stored on the child's row, and served verbatim by both
 * of The120's sign-in doors. Shipping the bytes therefore costs no second
 * network hop, needs no cover endpoint to CORS-allow, and creates no public
 * per-child URL to leak a kid's first name to anyone who guessed an id.
 *
 * (An earlier design had The120 RE-DERIVE the picture at sign-in from the
 * child's name. It produced a visibly different cover from the one the family
 * approved at signup — different palette, no age badge, generic captions —
 * because the age and story answers it also varied on do not survive
 * provisioning. This app's contract did not change when that was fixed, which
 * is the useful part: `coverUrl` was always "the bytes to show".)
 *
 * ⚠ IT IS ONLY EVER AN `<img src>`. The bytes are an SVG DOCUMENT, and SVG is
 * live markup: inlined into the DOM (`dangerouslySetInnerHTML`, an inline
 * `<svg>`) it would be a script-execution sink. In an `<img>` the browser parses
 * it sandboxed — no script, no external fetch — which is exactly the rendering
 * context The120's compositor XML-escapes its untrusted interpolations for. If
 * this app ever renders a cover any other way, that escaping argument has to be
 * re-made from scratch.
 *
 * ── WHY ITS OWN MODULE, NOT PART OF ../lib/auth ──
 * Both the sign-in doors (auth.ts) and the profile-cache restore
 * (state/GameContext.tsx) must run the SAME gate — a value that becomes an
 * `<img src>` clears one check whichever direction it arrived from, and
 * localStorage is writable by anything on this origin, so the cache is not a
 * trusted source just because we wrote it. A shared leaf module also keeps this
 * gate out of the modules that tests routinely `vi.mock`.
 */

/**
 * The ONE cover-URL form this app will put in an `<img src>`, pinned as a
 * literal prefix rather than parsed.
 *
 * A WHITELIST, and that is the point: it admits the single shape The120's
 * `deriveCoverSessionFields` produces and nothing else, so the rendering context
 * stays the one the server escaped for. `javascript:` does not execute from
 * `<img src>` in any current browser, but an `http(s):` cover would silently
 * turn a self-contained picture into a third-party request from a child's
 * browser, and an `svg+xml,`/`svg+xml;utf8,` variant would put the URL parser
 * over untrusted text alongside the XML parser. Neither is worth admitting for
 * a decoration.
 *
 * If The120 ever serves blob-backed covers over HTTPS, this constant — and the
 * reasoning above it — is what has to change, deliberately.
 */
export const COVER_DATA_URL_PREFIX = "data:image/svg+xml;base64,";

/**
 * THE SIZE CEILING — the second half of the gate, and the half that is about
 * this app rather than about the bytes.
 *
 * The real artifact is a ~2 KB comic-cover SVG. 256 KB is two orders of
 * magnitude of headroom, and it exists because `coverUrl` does not merely get
 * rendered: it is WRITTEN TO localStorage in the profile cache. localStorage is
 * a small, shared, per-origin budget (5-10 MB) holding every unsent Step Runner
 * draft and the whole sync outbox, and a `setItem` over budget throws
 * QuotaExceededError. So an unbounded cover is not a slow picture — it is a
 * decoration capable of evicting a child's unsaved work, or of making the very
 * write that preserves it fail.
 *
 * REJECT, NEVER TRUNCATE. A truncated data URL is a base64 payload that stops
 * mid-stream: the browser decodes it, fails to parse the SVG, fires `error`,
 * and the surfaces fall back to the sprite anyway — having already paid the
 * storage cost. Refusing outright reaches the same picture by a cheaper road.
 *
 * Measured in string length rather than encoded bytes: a base64 data URL is
 * ASCII by construction, so the two are the same number for anything that could
 * legitimately clear the prefix check, and length is what localStorage bills.
 */
export const COVER_URL_MAX_BYTES = 256 * 1024;

/**
 * String-or-null coercion for `coverUrl`. Only a base64 SVG data URL with a
 * payload, under the size ceiling, survives; absent (an older The120 build, a
 * pre-v3 account), null, empty, oversized, or any other scheme is null and the
 * caller falls back to the procedural sprite.
 *
 * ⚠ WHAT THIS DOES **NOT** DO, ON PURPOSE: it does not decode or validate the
 * base64 payload. The bytes are handed to an `<img>`, which is the only thing
 * qualified to decide whether they are a renderable image, and which reports
 * failure through `onError` — a channel every caller already handles via
 * `useCoverImage`. Decoding here would duplicate the browser's parser to reach
 * the same fallback more slowly. The gate's job is the RENDERING CONTEXT (this
 * must be a sandboxed, self-contained image) and the RESOURCE COST (this must
 * be small); correctness of the picture is the image decoder's job.
 */
export function asCoverUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length <= COVER_DATA_URL_PREFIX.length) return null;
  if (value.length > COVER_URL_MAX_BYTES) return null;
  if (!value.startsWith(COVER_DATA_URL_PREFIX)) return null;
  return value;
}

/**
 * String-or-null coercion for `coverStatus` — the roster's word, passed through
 * verbatim or null. NEVER interpreted into copy: nothing in this build queues a
 * redraw, so there is no pending state for a "your cover is being drawn" line to
 * be about. What renders is decided by whether a PICTURE exists.
 */
export function asCoverStatus(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/* ------------------------------------------------------- rendering contract */

/** The cover's aspect ratio (comic-cover 4:5), fixed by The120's template. Every
 *  frame derives its height from ONE width through this, so a frame can never
 *  go out of ratio by someone hand-editing one of the two numbers. */
export const COVER_ASPECT = 4 / 5;

/**
 * Own the load-failure of one cover url, and answer the only question a caller
 * has: do I draw the picture, or my own fallback?
 *
 * A hook rather than a wrapper component because EVERY caller's fallback is
 * different (the procedural sprite on the journey, a text chip in the nav) and
 * a component that returned `null` on failure would leave a hole where a
 * child's face was. The flag resets when the url changes, so a new cover — or
 * the same child signing back in — always gets a fresh attempt.
 *
 * Lives beside the gate rather than in a component file so the two halves of
 * "how this app is allowed to show a cover" stay in one place.
 */
export function useCoverImage(coverUrl: string | null | undefined): {
  show: boolean;
  onError: () => void;
} {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [coverUrl]);
  return { show: Boolean(coverUrl) && !failed, onError: () => setFailed(true) };
}
