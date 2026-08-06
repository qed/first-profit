/**
 * The contract between the staff shell and its tabs.
 *
 * Lives in its own module because the shell imports both tab components and
 * both tabs import this contract back: type-only imports erase, but the cycle
 * becomes real the moment a tab needs a shared VALUE, so the seam is a separate
 * file from the start.
 */

/**
 * The id of the panel heading. The shell's panel wrapper points its
 * `aria-labelledby` at this, and EVERY tab renders an <h2> carrying it in
 * EVERY view-state — a loading or errored panel is still a named region.
 */
export const STAFF_PANEL_TITLE_ID = "fp-staff-panel-title";

/**
 * The outcome of one authenticated GET, as a tab sees it.
 *
 *  - `json`         — a 2xx body, unparsed. The tab narrows it.
 *  - `error`        — transient: a non-401 HTTP failure, a network throw, an
 *                     unparseable body, OR a refresh the shell could not REACH.
 *                     The tab shows its load-error state with Retry; the
 *                     session is untouched.
 *  - `unauthorized` — TERMINAL and already handled by the shell (it has moved
 *                     to the sign-in form or the refusal, or the session was
 *                     dropped underneath this request). The tab must simply
 *                     stop: it is about to be unmounted, and it must not write
 *                     to the cache.
 *  - `aborted`      — the caller's AbortSignal fired. No state should change.
 */
export type StaffApiResult =
  | { kind: "json"; data: unknown }
  | { kind: "unauthorized" }
  | { kind: "error" }
  | { kind: "aborted" };

/**
 * A claim on one cache key, taken BEFORE the fetch and handed back to `write`.
 *
 * It carries the session epoch and a per-key generation, which is what lets the
 * cache refuse two different stale writes: one from a superseded fetch (a
 * slower earlier request landing after a faster later one) and one from a dead
 * session (a response arriving after sign-out, which must never land in the
 * next staff member's cache).
 */
export interface StaffCacheTicket {
  readonly key: string;
  readonly generation: number;
  readonly epoch: number;
}

/**
 * The shell's per-session data cache, shared by the tabs.
 *
 * Keyed strings, not one blob: the Watchtower's entries are keyed by criterion
 * (see watchtowerCacheKey) so switching criterion is a new fetch while
 * switching TABS is not. The whole map is dropped on any sign-out or refusal —
 * cohort data never outlives the session that fetched it (R12).
 */
export interface StaffCache {
  read: <T>(key: string) => T | undefined;
  /** Claim `key` for a fetch about to start. */
  begin: (key: string) => StaffCacheTicket;
  /** Commit against a ticket. Returns false when the ticket is superseded. */
  write: (ticket: StaffCacheTicket, value: unknown) => boolean;
  /** Forget `key` — what a manual refresh needs, since it cannot overwrite
   *  with a value it has not fetched yet. */
  clear: (key: string) => void;
}

export interface StaffRequestOptions {
  /**
   * Cancels the request. Note that a signalled request is NOT shared with
   * other callers — one caller's abort must not cancel another's read — so
   * pass a signal only where cancellation actually matters (Unit 5's criterion
   * switching), and omit it to get in-flight sharing.
   */
  signal?: AbortSignal;
}

export type StaffRequest = (
  path: string,
  options?: StaffRequestOptions,
) => Promise<StaffApiResult>;

export interface StaffTabProps {
  request: StaffRequest;
  cache: StaffCache;
  /** The selected criterion. Shell-owned so it survives a tab switch — the
   *  cached data does, and state that dies while its data lives is the
   *  confusing combination. */
  criterionId: string;
  onCriterionChange: (criterionId: string) => void;
}
