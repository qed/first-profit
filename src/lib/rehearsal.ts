/**
 * Persistent, non-media state for task 1.1.3's Rehearsal Studio.
 *
 * Audio blobs deliberately never enter this model. They remain inside the
 * mounted tool, backed by a short-lived ObjectURL, and are revoked when the
 * take expires or the tool unmounts. Only the learner's clean-run progress and
 * a concise Founder File summary use the existing save/sync path.
 */

export const REHEARSAL_TASK_ID = "1.1.3";
export const REHEARSAL_CLEAN_RUNS_KEY = "rehearsalCleanRuns";
export const REHEARSAL_LAST_SECONDS_KEY = "rehearsalLastSeconds";
export const REHEARSAL_SUMMARY_KEY = "rehearsalSummary";
export const REHEARSAL_PERSISTED_FIELD_KEYS = [
  REHEARSAL_CLEAN_RUNS_KEY,
  REHEARSAL_LAST_SECONDS_KEY,
  REHEARSAL_SUMMARY_KEY,
] as const;

export const REHEARSAL_TARGET_RUNS = 3;
export const REHEARSAL_MAX_MS = 60_000;
export const REHEARSAL_TAKE_TTL_MS = 15 * 60_000;

export type RehearsalFields = Record<string, string | undefined>;

export interface RehearsalReview {
  cleanRuns: number;
  complete: boolean;
  latestSeconds: number;
  summary: string;
}

export function cleanRunCount(fields: RehearsalFields): number {
  const parsed = Number.parseInt(fields[REHEARSAL_CLEAN_RUNS_KEY] ?? "0", 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(REHEARSAL_TARGET_RUNS, Math.max(0, parsed));
}

export function displayedRunSeconds(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.max(1, Math.floor(durationMs / 1000));
}

export function isUnderRehearsalLimit(durationMs: number): boolean {
  return Number.isFinite(durationMs) && durationMs > 0 && durationMs < REHEARSAL_MAX_MS;
}

/** Apply the learner's honest review. A miss resets the consecutive streak. */
export function reviewRehearsalRun(
  currentCleanRuns: number,
  noteFree: boolean,
  durationMs: number,
): RehearsalReview {
  const latestSeconds = displayedRunSeconds(durationMs);
  const countsAsClean = noteFree && isUnderRehearsalLimit(durationMs);
  const cleanRuns = countsAsClean
    ? Math.min(REHEARSAL_TARGET_RUNS, Math.max(0, currentCleanRuns) + 1)
    : 0;
  const complete = cleanRuns >= REHEARSAL_TARGET_RUNS;

  if (!countsAsClean) {
    return {
      cleanRuns,
      complete,
      latestSeconds,
      summary: `Practiced the 60-second pitch and identified another run to improve (${latestSeconds}s).`,
    };
  }

  const runWord = cleanRuns === 1 ? "run" : "runs";
  return {
    cleanRuns,
    complete,
    latestSeconds,
    summary: complete
      ? `Completed three consecutive note-free pitch runs under one minute; the latest was ${latestSeconds} seconds.`
      : `Completed ${cleanRuns} consecutive note-free pitch ${runWord} under one minute; the latest was ${latestSeconds} seconds.`,
  };
}
