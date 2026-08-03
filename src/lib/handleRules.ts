/**
 * Client-side handle FORMAT rules — the minimal UX mirror of The120's
 * authority module (the120 repo, `app/fp/lib/fp-public-site-rules.ts`).
 *
 * The server runs the FULL pipeline (normalize → format → reserved → blocklist
 * → taken/unique-claim) on every availability check and claim, and it is the
 * ONLY authority (the echo-the-server learning: the client receives
 * rules/results, never re-authors them). This module mirrors ONLY the
 * harmless format half, for one UX job:
 *
 *  R15 input normalization: the claim input auto-lowercases and DROPS invalid
 *  characters as the learner types (never punitive keystroke rejection), and
 *  clamps to the max length.
 *
 * DELIBERATELY NOT MIRRORED (Unit 5 review, P2): the R23 blocklist term set.
 * Shipping the curated slur/profanity list inside a kids' client bundle is
 * its own harm, and the server already drives the inline UX without it — the
 * debounced availability check answers `invalid` for blocklisted/reserved
 * handles as the learner types, and the claim endpoint refuses with reason
 * `invalid` at submit; the screens render the kid-friendly copy from those
 * verdicts. Zero local term list, one less echo-the-server violation.
 *
 * Divergence between this mirror and the server can only ever cost an extra
 * round-trip (the server refuses); it can never mint a wrong claim. Keep the
 * pattern/caps aligned with the120's module when either side changes.
 */

/** The claimable-handle shape (byte-for-byte the server/DB acceptor). */
export const HANDLE_PATTERN = "^[a-z0-9-]{3,20}$";

export const HANDLE_MIN_CHARS = 3;
export const HANDLE_MAX_CHARS = 20;

const HANDLE_RE = new RegExp(HANDLE_PATTERN);

/** Charset/length acceptance for an already-normalized candidate. */
export function isValidHandle(value: string): boolean {
  return HANDLE_RE.test(value);
}

/**
 * As-you-type normalization (R15): NFKC-fold, lowercase, DROP every character
 * outside the handle charset (spaces, punctuation, emoji — dropped, not
 * rejected), clamp to the max length. Applied on every input change so the
 * displayed value is always the normalized candidate the server would see.
 */
export function normalizeHandleInput(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, HANDLE_MAX_CHARS);
}
