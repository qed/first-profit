/**
 * singleFlight — one in-flight promise, shared by every concurrent caller.
 *
 * Used by the staff shell for the token refresh. What it actually buys, stated
 * narrowly because this is easy to overclaim:
 *
 *  - It de-duplicates CONCURRENT IN-PAGE requests. Two reads inside this one
 *    page (Unit 5's Watchtower fetching beside a Suggestions load, or a
 *    criterion switch racing a retry) that both meet an aged access token
 *    collapse to ONE grant, and both end up on the SAME renewed session rather
 *    than one holding a token the other has already rotated past. Until Unit 5
 *    the shell mounts one tab at a time and its loads are sequential, so today
 *    this is a guarantee held in reserve, not one being exercised in anger.
 *  - It is NOT what prevents token-family revocation in the ordinary case:
 *    GoTrue's refresh-token REUSE INTERVAL already tolerates near-simultaneous
 *    duplicate refreshes.
 *  - It cannot coordinate ACROSS browser tabs, and does not try to. A duplicated
 *    or second tab is a separate JS realm with its own module instance and its
 *    own copy of sessionStorage; no in-page mechanism reaches it, so a delayed
 *    reuse there can still revoke the family. That costs a re-login; accepted
 *    for v1 and explicitly out of scope.
 *
 * The slot clears when the promise settles, so a LATER refresh starts fresh —
 * this de-duplicates concurrency, it never caches a result.
 */
export interface SingleFlight<T> {
  /** Join the in-flight run if there is one, otherwise start `begin`. */
  run(begin: () => Promise<T>): Promise<T>;
  /** True while a run is in flight (tests and assertions; no production reads). */
  isPending(): boolean;
}

export function createSingleFlight<T>(): SingleFlight<T> {
  let pending: Promise<T> | null = null;
  return {
    run(begin) {
      if (pending) return pending;
      const started = begin();
      pending = started;
      const release = () => {
        if (pending === started) pending = null;
      };
      // Settle either way; a rejection must not wedge the slot shut.
      started.then(release, release);
      return started;
    },
    isPending() {
      return pending !== null;
    },
  };
}
