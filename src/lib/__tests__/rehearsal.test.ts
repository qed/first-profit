import { describe, expect, it } from "vitest";
import {
  REHEARSAL_CLEAN_RUNS_KEY,
  REHEARSAL_MAX_MS,
  cleanRunCount,
  displayedRunSeconds,
  isUnderRehearsalLimit,
  reviewRehearsalRun,
} from "../rehearsal";

describe("Rehearsal Studio model", () => {
  it("reads saved streaks defensively and clamps them to the three-run target", () => {
    expect(cleanRunCount({})).toBe(0);
    expect(cleanRunCount({ [REHEARSAL_CLEAN_RUNS_KEY]: "not-a-number" })).toBe(0);
    expect(cleanRunCount({ [REHEARSAL_CLEAN_RUNS_KEY]: "-4" })).toBe(0);
    expect(cleanRunCount({ [REHEARSAL_CLEAN_RUNS_KEY]: "2" })).toBe(2);
    expect(cleanRunCount({ [REHEARSAL_CLEAN_RUNS_KEY]: "12" })).toBe(3);
  });

  it("requires a take to finish strictly before the one-minute limit", () => {
    expect(isUnderRehearsalLimit(59_999)).toBe(true);
    expect(isUnderRehearsalLimit(REHEARSAL_MAX_MS)).toBe(false);
    expect(isUnderRehearsalLimit(0)).toBe(false);
    expect(displayedRunSeconds(59_999)).toBe(59);
  });

  it("builds consecutive progress and a useful Founder File summary", () => {
    const first = reviewRehearsalRun(0, true, 42_500);
    expect(first.cleanRuns).toBe(1);
    expect(first.complete).toBe(false);
    expect(first.summary).toContain("1 consecutive note-free pitch run");
    expect(first.summary).toContain("42 seconds");

    const third = reviewRehearsalRun(2, true, 51_800);
    expect(third.cleanRuns).toBe(3);
    expect(third.complete).toBe(true);
    expect(third.summary).toContain("three consecutive note-free pitch runs");
    expect(third.summary).toContain("51 seconds");
  });

  it("resets the streak after an honest not-yet review or an over-limit take", () => {
    expect(reviewRehearsalRun(2, false, 40_000).cleanRuns).toBe(0);
    expect(reviewRehearsalRun(2, true, REHEARSAL_MAX_MS).cleanRuns).toBe(0);
  });
});
