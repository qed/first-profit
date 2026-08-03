/**
 * Pure band/school-year tests (Unit 3). The arithmetic cases are PINNED to the
 * documented examples in The120's app/api/fp/grade/grade-rules.ts so the two
 * mirrors can never drift silently: born 2015 is grade 6 in October 2026
 * (school year 2026-27) and grade 5 on 2026-08-31 (still school year 2025-26).
 */
import { describe, expect, it } from "vitest";
import {
  bandForFeedback,
  bandForGrade,
  birthYearBounds,
  displayBand,
  gradeFromBirthYear,
  schoolYearStartYear,
} from "../band";

describe("bandForGrade (mirror of T120 progress-core)", () => {
  it("maps 3-5 / 6-8 / 9-12 and refuses everything else", () => {
    expect(bandForGrade(3)).toBe("g3_5");
    expect(bandForGrade(4)).toBe("g3_5");
    expect(bandForGrade(5)).toBe("g3_5");
    expect(bandForGrade(6)).toBe("g6_8");
    expect(bandForGrade(8)).toBe("g6_8");
    expect(bandForGrade(9)).toBe("g9_12");
    expect(bandForGrade(12)).toBe("g9_12");
    // Out of program: refuse, never clamp.
    expect(bandForGrade(2)).toBeNull();
    expect(bandForGrade(13)).toBeNull();
    expect(bandForGrade(0)).toBeNull();
    expect(bandForGrade(null)).toBeNull();
  });
});

describe("displayBand vs bandForFeedback (the two defaults are different on purpose)", () => {
  it("displayBand: unknown grade renders the middle band (R10)", () => {
    expect(displayBand(null)).toBe("g6_8");
    expect(displayBand(13)).toBe("g6_8"); // aged out -> still a readable default
    expect(displayBand(4)).toBe("g3_5");
    expect(displayBand(10)).toBe("g9_12");
  });

  it("bandForFeedback: unknown grade stamps the honest 'unknown' (Unit 2 contract)", () => {
    expect(bandForFeedback(null)).toBe("unknown");
    expect(bandForFeedback(2)).toBe("unknown");
    expect(bandForFeedback(4)).toBe("g3_5");
    expect(bandForFeedback(7)).toBe("g6_8");
    expect(bandForFeedback(11)).toBe("g9_12");
  });
});

describe("school-year arithmetic (Sep 1 UTC boundary, pinned to T120's rule)", () => {
  it("schoolYearStartYear: Aug 31 belongs to the PRIOR school year, Sep 1 starts the new one", () => {
    expect(schoolYearStartYear(new Date("2026-08-31T23:59:59.999Z"))).toBe(2025);
    expect(schoolYearStartYear(new Date("2026-09-01T00:00:00.000Z"))).toBe(2026);
    expect(schoolYearStartYear(new Date("2026-12-31T12:00:00Z"))).toBe(2026);
    expect(schoolYearStartYear(new Date("2027-01-01T00:00:00Z"))).toBe(2026);
  });

  it("gradeFromBirthYear: born 2015 -> grade 6 in Oct 2026, grade 5 on 2026-08-31 (the pinned examples)", () => {
    expect(gradeFromBirthYear(2015, new Date("2026-10-15T12:00:00Z"))).toBe(6);
    expect(gradeFromBirthYear(2015, new Date("2026-08-31T23:59:59.999Z"))).toBe(5);
    expect(gradeFromBirthYear(2015, new Date("2026-09-01T00:00:00.000Z"))).toBe(6);
  });

  it("gradeFromBirthYear is UNCLAMPED (display code decides banding)", () => {
    expect(gradeFromBirthYear(2024, new Date("2026-10-01T00:00:00Z"))).toBe(-3);
    expect(gradeFromBirthYear(2000, new Date("2026-10-01T00:00:00Z"))).toBe(21);
  });
});

describe("birthYearBounds (select range derived from the 3-12 grade discipline)", () => {
  it("moves with the school year: grade 3 = newest, grade 12 = oldest", () => {
    // School year 2026-27 (Oct 2026): grade 3 <-> 2018, grade 12 <-> 2009.
    expect(birthYearBounds(new Date("2026-10-01T00:00:00Z"))).toEqual({ newest: 2018, oldest: 2009 });
    // Still school year 2025-26 on Aug 31: both bounds shift back a year.
    expect(birthYearBounds(new Date("2026-08-31T00:00:00Z"))).toEqual({ newest: 2017, oldest: 2008 });
  });

  it("every year in the range derives a grade the server's 3-12 write gate accepts", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const { newest, oldest } = birthYearBounds(now);
    for (let y = oldest; y <= newest; y++) {
      const grade = gradeFromBirthYear(y, now);
      expect(grade).toBeGreaterThanOrEqual(3);
      expect(grade).toBeLessThanOrEqual(12);
    }
    // One past either bound falls outside the discipline.
    expect(gradeFromBirthYear(newest + 1, now)).toBeLessThan(3);
    expect(gradeFromBirthYear(oldest - 1, now)).toBeGreaterThan(12);
  });
});
