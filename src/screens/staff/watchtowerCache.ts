/**
 * The Watchtower's shell-cache keys.
 *
 * Keyed by criterion so switching CRITERION invalidates exactly its own entry
 * while switching TABS invalidates nothing — the flow board fetches one
 * criterion at a time (see the plan's Unit 4-5).
 *
 * Its own module so the tab component file exports a component and nothing else
 * (react-refresh/only-export-components).
 */
export const WATCHTOWER_CACHE_PREFIX = "watchtower:";

/** The shell-cache key for one criterion's flow-board payload. */
export function watchtowerCacheKey(criterionId: string): string {
  return `${WATCHTOWER_CACHE_PREFIX}${criterionId}`;
}

/**
 * The cohort funnel's key (Change #3). It shares the prefix — so sign-out and
 * tab-switch clearing sweep it up with everything else, and it carries a
 * username-free payload either way — but no criterion, because the funnel is
 * cohort-wide and must NOT be refetched when the criterion changes. The `:`
 * keeps it out of the criterion id space (ids are digits and dots).
 */
export const WATCHTOWER_FUNNEL_CACHE_KEY = `${WATCHTOWER_CACHE_PREFIX}:funnel`;
