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
