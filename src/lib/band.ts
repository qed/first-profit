/**
 * Grade-band resolution — the pure client mirror of The120's band semantics
 * (full-path cohort readiness plan, Unit 3; R9, R10).
 *
 * Two servers of truth are mirrored here, byte-for-byte in behavior:
 *
 *  - `bandForGrade` mirrors `[T120] app/fp/lib/progress-core.ts`: grades 3-5 /
 *    6-8 / 9-12 map to the three band tracks; anything else (including null)
 *    is `null` — this map refuses to guess.
 *  - `gradeFromBirthYear` / `schoolYearStartYear` mirror
 *    `[T120] app/api/fp/grade/grade-rules.ts`: the school year starts
 *    SEPTEMBER 1 (UTC), and a child is assumed to enter kindergarten (grade 0)
 *    in the calendar year they turn 5, so for a school year starting in
 *    calendar year Y: grade = (Y - birthYear) - 5. UNCLAMPED — display code
 *    (bandForGrade) already answers null outside the bands.
 *
 * The client needs the arithmetic mirror for exactly one reason: when the
 * ask-once birth-year write-back fails (offline, rate limited), the band is
 * applied LOCALLY for the session from the same rule the server would have
 * used, so the kid's experience never depends on the write landing (R10:
 * band never gates play).
 *
 * Two distinct defaults exist on purpose (R10 + the Unit 2 feedback contract):
 *  - `displayBand`: unknown grade DISPLAYS as the middle band (g6_8).
 *  - `bandForFeedback`: unknown grade STAMPS feedback rows "unknown", so the
 *    owner's band analysis is never biased by defaulted display text.
 *
 * Pure module: no React, no Date.now() — callers pass `now` in.
 */

/** The three grade-band tracks, mirroring The120's `Band` type. */
export type Band = "g3_5" | "g6_8" | "g9_12";

/**
 * The band derived from a grade. 3-5 / 6-8 / 9-12; a grade outside that range
 * — or a null grade — returns `null` (mirror of T120's bandForGrade).
 */
export function bandForGrade(grade: number | null): Band | null {
  if (grade === null) return null;
  if (grade >= 3 && grade <= 5) return "g3_5";
  if (grade >= 6 && grade <= 8) return "g6_8";
  if (grade >= 9 && grade <= 12) return "g9_12";
  return null;
}

/**
 * The band task TEXT renders in: the resolved band, or the middle band while
 * the grade is unknown (R10's display default — a reasonable reading level,
 * never a gate).
 */
export function displayBand(grade: number | null): Band {
  return bandForGrade(grade) ?? "g6_8";
}

/**
 * The band a FEEDBACK row is stamped with: the resolved band, or the honest
 * "unknown" while the grade is unknown (per the Unit 2 fp_task_feedback
 * contract — a defaulted display band must never masquerade as a known one
 * in the owner's analysis).
 */
export function bandForFeedback(grade: number | null): Band | "unknown" {
  return bandForGrade(grade) ?? "unknown";
}

/* ── School-year arithmetic (client mirror of [T120] grade-rules.ts) ────── */

/**
 * The calendar year the CURRENT school year started in (Sep 1 UTC boundary):
 * September-December → this year; January-August → last year.
 */
export function schoolYearStartYear(now: Date): number {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 8 ? year : year - 1;
}

/**
 * Current grade from a birth year under the Sep-1 / kindergarten-at-5 rule.
 * Pure arithmetic, NO clamping — same contract as the server's
 * gradeFromBirthYear (display code decides banding).
 */
export function gradeFromBirthYear(birthYear: number, now: Date): number {
  return schoolYearStartYear(now) - birthYear - 5;
}

/**
 * The plausible birth-year window for the ask-once <select>, DERIVED from the
 * program's grade discipline (3-12) exactly as the server's write gate derives
 * it: grade 3 ⇔ startYear-8 (the newest plausible year), grade 12 ⇔
 * startYear-17 (the oldest). Both bounds move with the school year, so the
 * select can never offer a year the server would refuse.
 */
export function birthYearBounds(now: Date): { newest: number; oldest: number } {
  const startYear = schoolYearStartYear(now);
  return { newest: startYear - 8, oldest: startYear - 17 };
}
