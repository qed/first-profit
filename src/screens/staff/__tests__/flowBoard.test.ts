import { describe, expect, it } from "vitest";

import {
  MAX_CYCLE_TIME_MS,
  MIN_CHILDREN_PER_MEDIAN,
  REQUESTED_TASK_IDS_BUDGET,
  REQUESTED_TASK_IDS_CAP,
  STALLED_AFTER_MS,
  anonymousUnits,
  computeFlowRows,
  computeFlowTotals,
  criterionWindow,
  drillDown,
  normalizeCohort,
  placeUnit,
  requestedTaskIds,
  taskIdsForCriterion,
  type FlowRow,
  type FlowTotals,
  type FlowUnit,
  type FlowWindow,
  type NamedFlowUnit,
  type NormalizedCohort,
  type WireBusiness,
  type WireChild,
  type WireIdea,
  type WireProgressResponse,
} from "../flowBoard";
import {
  CRITERION_SEQUENCE,
  criterionIdsForPhase,
  phaseOfCriterion,
} from "../../../state/gameCore";

/* ------------------------------------------------------------- fixtures */

const DAY = 86400e3;
/** One fixed instant for `fetchedAt` and `now` — the module never reads a clock. */
const NOW = Date.UTC(2026, 7, 5, 12, 0, 0);

type Entry = [taskId: string, at: number | null];

function stableMaps(entries: readonly Entry[]): {
  doneByTask: Record<string, boolean>;
  doneAtByTask: Record<string, number>;
} {
  const doneByTask: Record<string, boolean> = {};
  const doneAtByTask: Record<string, number> = {};
  for (const [taskId, at] of entries) {
    doneByTask[taskId] = true;
    if (at !== null) doneAtByTask[taskId] = at;
  }
  return { doneByTask, doneAtByTask };
}

function wireIdea(
  index: number,
  id: string | null,
  entries: readonly Entry[],
  overrides: Partial<WireIdea> = {},
): WireIdea {
  const maps = stableMaps(entries);
  const stamps = Object.values(maps.doneAtByTask);
  return {
    index,
    id,
    done: {},
    doneAt: {},
    ...maps,
    lastCompletionAt: stamps.length > 0 ? Math.max(...stamps) : null,
    recencyClamped: false,
    hasCompletionsOutsideRequest: false,
    ...overrides,
  };
}

function wireBusiness(
  id: string,
  ideaId: string | null,
  entries: readonly Entry[],
  overrides: Partial<WireBusiness> = {},
): WireBusiness {
  const maps = stableMaps(entries);
  const stamps = Object.values(maps.doneAtByTask);
  return {
    id,
    ideaId,
    archived: false,
    ...maps,
    lastCompletionAt: stamps.length > 0 ? Math.max(...stamps) : null,
    recencyClamped: false,
    hasCompletionsOutsideRequest: false,
    ...overrides,
  };
}

function wireChild(
  username: string,
  ideas: readonly WireIdea[],
  overrides: Partial<WireChild> = {},
): WireChild {
  return {
    username,
    truncated: false,
    docUnreadable: false,
    ideas: [...ideas],
    businesses: [],
    ...overrides,
  };
}

function response(...children: readonly WireChild[]): WireProgressResponse {
  return { children };
}

interface Board {
  cohort: NormalizedCohort;
  named: NamedFlowUnit[];
  units: FlowUnit[];
  rows: FlowRow[];
  rowBy: (taskId: string) => FlowRow;
  totals: FlowTotals;
}

/**
 * Normalize + compute. By default it also asserts THROUGHPUT MONOTONICITY — the
 * board's one invariant that can actually fail — so every fixture in this file
 * is checked against it unless it deliberately models an out-of-order doc.
 */
function board(
  payload: WireProgressResponse,
  window: FlowWindow,
  options: { nowMs?: number; fetchedAt?: number; expectMonotonic?: boolean } = {},
): Board {
  const { nowMs = NOW, fetchedAt = NOW, expectMonotonic = true } = options;
  const cohort = normalizeCohort(payload, fetchedAt);
  const units = anonymousUnits(cohort);
  const rows = computeFlowRows(units, window, nowMs);
  const totals = computeFlowTotals(units, window, nowMs);
  if (expectMonotonic) {
    expect(totals.firstNonMonotonicTaskId).toBeNull();
    expect(totals.throughputMonotonic).toBe(true);
  }
  const rowBy = (taskId: string): FlowRow => {
    const row = rows.find((candidate) => candidate.taskId === taskId);
    if (!row) throw new Error(`no row for ${taskId}`);
    return row;
  };
  return { cohort, named: cohort.units, units, rows, rowBy, totals };
}

const SELL_1_2 = criterionWindow("sell", "1.2");
const SELL_1_1 = criterionWindow("sell", "1.1");
const GROW_ID = criterionIdsForPhase("grow")[0];
const GROW = criterionWindow("grow", GROW_ID);
const GROW_ENTRY = GROW.entryPredecessorId ?? "";
const GROW_T0 = GROW.taskIds[0];
const GROW_T1 = GROW.taskIds[1];

/* -------------------------------------------------------- window + ids */

describe("criterionWindow", () => {
  it("gives the criterion's tasks in order with per-task predecessors", () => {
    expect(SELL_1_2.taskIds).toEqual(["1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5"]);
    expect(SELL_1_2.entryPredecessorId).toBe("1.1.5");
    expect(SELL_1_2.predecessorByTask.get("1.2.1")).toBe("1.1.5");
    expect(SELL_1_2.predecessorByTask.get("1.2.4")).toBe("1.2.3");
  });

  it("gives the very first task of the whole sequence a NULL predecessor", () => {
    expect(SELL_1_1.entryPredecessorId).toBeNull();
    expect(SELL_1_1.predecessorByTask.get("1.1.1")).toBeNull();
    expect(SELL_1_1.predecessorByTask.get("1.1.2")).toBe("1.1.1");
  });

  it("distinguishes an UNKNOWN criterion from a phase MISMATCH, by message", () => {
    // Both branches must be reachable — an unknown id has no phase at all, so
    // an ordering that checks the mismatch first makes this message dead code.
    expect(() => criterionWindow("sell", "9.9")).toThrow("flowBoard: unknown criterion 9.9");
    expect(() => criterionWindow("build", "1.2")).toThrow(
      "flowBoard: criterion 1.2 is not in phase build",
    );
  });
});

describe("taskIdsForCriterion", () => {
  it("scopes on the criterion id plus a TRAILING DOT, so 1.10 cannot leak into 1.1", () => {
    // Every criterion id is single-digit today, so dropping the dot changes
    // NOTHING against the real content — the invariant would be incidental
    // rather than pinned. A synthetic order with a tenth criterion makes it
    // load-bearing: `"1.10.1".startsWith("1.1")` is true, `.startsWith("1.1.")`
    // is not, and a dotless prefix would pull 1.10's tasks into 1.1's window.
    const synthetic = ["1.1.1", "1.1.2", "1.10.1", "1.10.2", "1.2.1"];
    expect(taskIdsForCriterion("1.1", synthetic)).toEqual(["1.1.1", "1.1.2"]);
    expect(taskIdsForCriterion("1.10", synthetic)).toEqual(["1.10.1", "1.10.2"]);
    expect(taskIdsForCriterion("1.2", synthetic)).toEqual(["1.2.1"]);
  });

  it("reads the real curriculum order by default — the window is built from it", () => {
    expect(taskIdsForCriterion("1.2")).toEqual(SELL_1_2.taskIds);
  });
});

describe("requestedTaskIds", () => {
  it("carries exactly ONE id from outside the criterion — the predecessor", () => {
    const ids = requestedTaskIds("build", "2.1");
    expect(new Set(ids).size).toBe(ids.length);
    const outside = ids.filter((id) => !id.startsWith("2.1"));
    expect(outside).toEqual([criterionWindow("build", "2.1").entryPredecessorId]);
  });

  it("omits the predecessor for the very first criterion — nothing outside 1.1", () => {
    // The contrast with the case above is the test: 1.2 carries 1.1.5, 1.1
    // carries nothing, because there is no earlier task in the sequence.
    const first = requestedTaskIds("sell", "1.1");
    expect(first.filter((id) => !id.startsWith("1.1"))).toEqual([]);
    expect(requestedTaskIds("sell", "1.2").filter((id) => id.startsWith("1.1"))).not.toEqual(
      [],
    );
    expect(first).toContain("1.1.1");
    expect(first).toContain("1.1.5");
  });

  it("names each id's LEGACY spelling, so legacy-only progress is not filtered away", () => {
    const ids = requestedTaskIds("sell", "1.2");
    expect(ids).toContain("1.1.5");
    expect(ids).toContain("1.1#4");
    expect(ids).toContain("1.2.1");
    expect(ids).toContain("1.2#0");
    // nothing past 1.2 has a legacy spelling
    expect(requestedTaskIds("build", "2.1").some((id) => id.includes("#"))).toBe(false);
  });

  it("names REMAPPED OLD ids too — the same argument as the legacy aliases", () => {
    // Without this, a child whose progress still sits under 1.2.2 after a
    // {1.2.2 → 1.2.3} edit has that key dropped by the endpoint's exact-string
    // filter, and migrateIdeaProgress never gets to move it.
    const withoutRemap = requestedTaskIds("sell", "1.2");
    expect(withoutRemap).not.toContain("1.2.2-old");
    const withRemap = requestedTaskIds("sell", "1.2", { "1.2.2-old": "1.2.2" });
    expect(withRemap).toContain("1.2.2-old");
    expect(withRemap).toContain("1.2.2");
    expect(new Set(withRemap).size).toBe(withRemap.length);
  });

  it("stays well under the server's 32-id cap for EVERY criterion", () => {
    expect(REQUESTED_TASK_IDS_BUDGET).toBeLessThan(REQUESTED_TASK_IDS_CAP);
    for (const criterionId of CRITERION_SEQUENCE) {
      const phaseId = phaseOfCriterion(criterionId);
      expect(phaseId).toBeDefined();
      if (!phaseId) continue;
      const ids = requestedTaskIds(phaseId, criterionId);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.length).toBeLessThanOrEqual(REQUESTED_TASK_IDS_BUDGET);
    }
  });

  it("is importable without side effects — no module-load throw", async () => {
    // App.tsx imports StaffShell statically and Unit 5 pulls this module in
    // behind it, so a top-level throw here would blank the app for every
    // LEARNER, not just staff. The budget guard is this suite plus the build
    // preflight, never module evaluation.
    await expect(import("../flowBoard")).resolves.toBeDefined();
  });
});

/* ------------------------------------------------------------ constants */

describe("named constants", () => {
  it("are pinned so changing one is a deliberate edit", () => {
    expect(STALLED_AFTER_MS).toBe(30 * 86400e3);
    expect(MAX_CYCLE_TIME_MS).toBe(365 * 86400e3);
    expect(MIN_CHILDREN_PER_MEDIAN).toBe(2);
  });
});

/* ------------------------------------------- the invariant that can fail */

describe("throughput monotonicity — the board's real invariant", () => {
  it("holds on an ordinary cohort", () => {
    const payload = response(
      wireChild("ada", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 9 * DAY],
          ["1.2.1", NOW - 8 * DAY],
          ["1.2.2", NOW - 7 * DAY],
        ]),
      ]),
      wireChild("bo", [
        wireIdea(0, "i-2", [
          ["1.1.5", NOW - 6 * DAY],
          ["1.2.1", NOW - 5 * DAY],
        ]),
      ]),
    );
    const { totals, rows } = board(payload, SELL_1_2);
    expect(rows.map((row) => row.throughput)).toEqual([2, 1, 0, 0, 0]);
    expect(totals.throughputMonotonic).toBe(true);
  });

  it("FAILS on a physically impossible row shape, naming the offending task", () => {
    // An out-of-order doc: 1.2.3 complete while 1.2.1 and 1.2.2 are not. Nothing
    // else on the board surfaces this — the WIP columns still add up.
    const payload = response(
      wireChild("skipper", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 5 * DAY],
          ["1.2.3", NOW - 4 * DAY],
        ]),
      ]),
    );
    const { totals, rows } = board(payload, SELL_1_2, { expectMonotonic: false });
    expect(rows.map((row) => row.throughput)).toEqual([0, 0, 1, 0, 0]);
    expect(totals.throughputMonotonic).toBe(false);
    expect(totals.firstNonMonotonicTaskId).toBe("1.2.3");
  });

  it("holds on an empty cohort", () => {
    const { totals, rows } = board(response(), SELL_1_2);
    expect(totals.throughputMonotonic).toBe(true);
    expect(totals.firstNonMonotonicTaskId).toBeNull();
    expect(rows).toHaveLength(SELL_1_2.taskIds.length);
    for (const row of rows) {
      expect(row.throughput).toBe(0);
      expect(row.active).toBe(0);
      expect(row.stalled).toBe(0);
      expect(row.cycleTimeMedianMs).toBeNull();
      expect(row.medianSuppressed).toBe(false);
    }
    expect(totals.liveUnits).toBe(0);
  });
});

/* ------------------------------------------------------- the happy path */

describe("computeFlowRows — happy path across a criterion", () => {
  it("counts IDEAS, not children, and lands each idea on exactly one task", () => {
    const payload = response(
      wireChild("ada", [
        wireIdea(0, "i-a1", [
          ["1.1.5", NOW - 10 * DAY],
          ["1.2.1", NOW - 9 * DAY],
          ["1.2.2", NOW - 8 * DAY],
        ]),
        wireIdea(1, "i-a2", [
          ["1.1.5", NOW - 6 * DAY],
          ["1.2.1", NOW - 5 * DAY],
          ["1.2.2", NOW - 4 * DAY],
        ]),
      ]),
      wireChild("bo", [
        wireIdea(0, "i-b1", [
          ["1.1.5", NOW - 3 * DAY],
          ["1.2.1", NOW - 1 * DAY],
        ]),
      ]),
    );
    const { rowBy, totals } = board(payload, SELL_1_2);

    expect(rowBy("1.2.1").throughput).toBe(3);
    expect(rowBy("1.2.2").throughput).toBe(2); // a kid with two ideas counts twice
    expect(rowBy("1.2.3").throughput).toBe(0);

    expect(rowBy("1.2.2").active).toBe(1); // bo's idea sits on 1.2.2
    expect(rowBy("1.2.3").active).toBe(2); // ada's two ideas sit on 1.2.3
    expect(totals.active).toBe(3);
    expect(totals.stalled).toBe(0);
    expect(totals.before).toBe(0);
    expect(totals.after).toBe(0);
    expect(totals.liveUnits).toBe(3);
  });

  it("computes the median from THIS task's stamp minus its PREDECESSOR's", () => {
    const payload = response(
      wireChild("ada", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 20 * DAY],
          ["1.2.1", NOW - 19 * DAY], // 1 day
        ]),
      ]),
      wireChild("bo", [
        wireIdea(0, "i-2", [
          ["1.1.5", NOW - 20 * DAY],
          ["1.2.1", NOW - 18 * DAY], // 2 days
        ]),
      ]),
      wireChild("cy", [
        wireIdea(0, "i-3", [
          ["1.1.5", NOW - 20 * DAY],
          ["1.2.1", NOW - 10 * DAY], // 10 days
        ]),
      ]),
    );
    const { rowBy } = board(payload, SELL_1_2);
    expect(rowBy("1.2.1").cycleTimeMedianMs).toBe(2 * DAY);
    expect(rowBy("1.2.1").sampleSize).toBe(3);
    expect(rowBy("1.2.1").sampleChildCount).toBe(3);
    expect(rowBy("1.2.1").maxSamplesFromOneChild).toBe(1);
  });
});

/* ------------------------------------------------------------- medians */

describe("median cycle time", () => {
  /** One child per delta, so each contributes exactly one per-child median. */
  function deltasOn121(deltasDays: readonly number[]): FlowRow {
    const children = deltasDays.map((days, index) =>
      wireChild(`kid-${index}`, [
        wireIdea(0, `i-${index}`, [
          ["1.1.5", NOW - 200 * DAY],
          ["1.2.1", NOW - 200 * DAY + days * DAY],
        ]),
      ]),
    );
    return board(response(...children), SELL_1_2).rowBy("1.2.1");
  }

  it("odd sample → the middle value", () => {
    const row = deltasOn121([1, 2, 10]);
    expect(row.cycleTimeMedianMs).toBe(2 * DAY);
    expect(row.sampleSize).toBe(3);
    expect(row.medianSuppressed).toBe(false);
  });

  it("even sample → the mean of the two middles", () => {
    const row = deltasOn121([1, 2, 3, 10]);
    expect(row.cycleTimeMedianMs).toBe(2.5 * DAY);
    expect(row.sampleSize).toBe(4);
  });

  it("one wild outlier barely moves the median (this is why it is not a mean)", () => {
    expect(deltasOn121([1, 2, 3, 1000]).cycleTimeMedianMs).toBe(2.5 * DAY);
  });

  it("empty sample → null, NOT suppressed — the two states are distinct", () => {
    const row = deltasOn121([]);
    expect(row.cycleTimeMedianMs).toBeNull();
    expect(row.sampleSize).toBe(0);
    expect(row.medianSuppressed).toBe(false);
  });

  it("ONE child → SUPPRESSED, not published: that median is one child's timing", () => {
    const row = deltasOn121([5]);
    expect(row.sampleSize).toBe(1);
    expect(row.sampleChildCount).toBe(1);
    expect(row.cycleTimeMedianMs).toBeNull();
    expect(row.medianSuppressed).toBe(true);
    // and MIN_CHILDREN_PER_MEDIAN children is enough
    const two = deltasOn121([5, 7]);
    expect(two.sampleChildCount).toBe(MIN_CHILDREN_PER_MEDIAN);
    expect(two.cycleTimeMedianMs).toBe(6 * DAY);
    expect(two.medianSuppressed).toBe(false);
  });

  it("one child with MANY ideas cannot move the median — per-child medians first", () => {
    // 5 honest children at 2 days, plus one child with 6 ideas at 45 days.
    // A raw pooled median would be 45 days (6 of 11 samples); collapsing each
    // child to one value makes the attacker one voice among six.
    const honest = [0, 1, 2, 3, 4].map((index) =>
      wireChild(`honest-${index}`, [
        wireIdea(0, `h-${index}`, [
          ["1.1.5", NOW - 100 * DAY],
          ["1.2.1", NOW - 98 * DAY], // 2 days
        ]),
      ]),
    );
    const attacker = wireChild(
      "prolific",
      [0, 1, 2, 3, 4, 5].map((index) =>
        wireIdea(index, `p-${index}`, [
          ["1.1.5", NOW - 100 * DAY],
          ["1.2.1", NOW - 55 * DAY], // 45 days
        ]),
      ),
    );
    const { rowBy, cohort } = board(response(...honest, attacker), SELL_1_2);
    const row = rowBy("1.2.1");
    expect(row.cycleTimeMedianMs).toBe(2 * DAY);
    // the raw shape is still reported, because a fix does not make the caveat useless
    expect(row.sampleSize).toBe(11);
    expect(row.sampleChildCount).toBe(6);
    expect(row.maxSamplesFromOneChild).toBe(6);
    expect(cohort.maxUnitsPerChild).toBe(6);
  });

  it("the FIRST task of the whole sequence is ALWAYS null (no predecessor exists)", () => {
    const payload = response(
      wireChild("ada", [wireIdea(0, "i-1", [["1.1.1", NOW - 5 * DAY]])]),
      wireChild("bo", [wireIdea(0, "i-2", [["1.1.1", NOW - 4 * DAY]])]),
    );
    const { rowBy } = board(payload, SELL_1_1);
    expect(rowBy("1.1.1").predecessorTaskId).toBeNull();
    expect(rowBy("1.1.1").cycleTimeMedianMs).toBeNull();
    expect(rowBy("1.1.1").sampleSize).toBe(0);
    expect(rowBy("1.1.1").medianSuppressed).toBe(false);
    expect(rowBy("1.1.1").throughput).toBe(2); // still counted as throughput
  });

  it("an untimestamped completion counts in throughput but is NOT a zero sample", () => {
    const payload = response(
      wireChild("ada", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 10 * DAY],
          ["1.2.1", null], // done, no stamp
        ]),
      ]),
    );
    const { rowBy } = board(payload, SELL_1_2);
    expect(rowBy("1.2.1").throughput).toBe(1);
    expect(rowBy("1.2.1").sampleSize).toBe(0);
    expect(rowBy("1.2.1").droppedSamples).toBe(0); // not even a candidate pair
    expect(rowBy("1.2.1").cycleTimeMedianMs).toBeNull();
    // and it still advances the next-incomplete walk
    expect(rowBy("1.2.2").active + rowBy("1.2.2").stalled).toBe(1);
  });

  it("a NEGATIVE elapsed (clock skew) is dropped and counted, never clamped to zero", () => {
    const payload = response(
      wireChild("skewed", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 5 * DAY],
          ["1.2.1", NOW - 6 * DAY], // stamped BEFORE its predecessor
        ]),
      ]),
      wireChild("ok-a", [
        wireIdea(0, "i-2", [
          ["1.1.5", NOW - 10 * DAY],
          ["1.2.1", NOW - 6 * DAY], // 4 days
        ]),
      ]),
      wireChild("ok-b", [
        wireIdea(0, "i-3", [
          ["1.1.5", NOW - 10 * DAY],
          ["1.2.1", NOW - 6 * DAY], // 4 days
        ]),
      ]),
    );
    const { rowBy } = board(payload, SELL_1_2);
    expect(rowBy("1.2.1").sampleSize).toBe(2);
    expect(rowBy("1.2.1").droppedSamples).toBe(1);
    expect(rowBy("1.2.1").cycleTimeMedianMs).toBe(4 * DAY);
  });

  it("a ZERO elapsed is an unusable pair, not a zero-duration cycle", () => {
    // Eight honest children at 10 days plus one attacker whose nine ideas stamp
    // a task and its predecessor at the same instant collapsed the median to 0.
    const honest = [0, 1, 2, 3, 4, 5, 6, 7].map((index) =>
      wireChild(`honest-${index}`, [
        wireIdea(0, `h-${index}`, [
          ["1.1.5", NOW - 100 * DAY],
          ["1.2.1", NOW - 90 * DAY], // 10 days
        ]),
      ]),
    );
    const attacker = wireChild(
      "zeroes",
      [0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) =>
        wireIdea(index, `z-${index}`, [
          ["1.1.5", NOW - 50 * DAY],
          ["1.2.1", NOW - 50 * DAY], // identical stamps
        ]),
      ),
    );
    const { rowBy } = board(response(...honest, attacker), SELL_1_2);
    const row = rowBy("1.2.1");
    expect(row.cycleTimeMedianMs).toBe(10 * DAY);
    expect(row.droppedSamples).toBe(9);
    expect(row.sampleChildCount).toBe(8); // the attacker contributes no median
  });

  it("an ABSURD POSITIVE elapsed (backwards-set clock) is dropped, not believed", () => {
    // clampStamp bounds only the FUTURE side, so an ancient predecessor beside a
    // correct successor sails through every other guard.
    const payload = response(
      wireChild("backwards-a", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 1200 * DAY],
          ["1.2.1", NOW - 1 * DAY],
        ]),
      ]),
      wireChild("backwards-b", [
        wireIdea(0, "i-2", [
          ["1.1.5", NOW - 1300 * DAY],
          ["1.2.1", NOW - 2 * DAY],
        ]),
      ]),
    );
    const { rowBy } = board(payload, SELL_1_2);
    const row = rowBy("1.2.1");
    expect(row.cycleTimeMedianMs).toBeNull();
    expect(row.sampleSize).toBe(0);
    expect(row.droppedSamples).toBe(2);
    // the boundary: exactly MAX_CYCLE_TIME_MS is kept, one ms past it is not
    const atCap = response(
      wireChild("a", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - MAX_CYCLE_TIME_MS],
          ["1.2.1", NOW],
        ]),
      ]),
      wireChild("b", [
        wireIdea(0, "i-2", [
          ["1.1.5", NOW - MAX_CYCLE_TIME_MS],
          ["1.2.1", NOW],
        ]),
      ]),
    );
    expect(board(atCap, SELL_1_2).rowBy("1.2.1").cycleTimeMedianMs).toBe(MAX_CYCLE_TIME_MS);
  });

  it("a future stamp is clamped to fetchedAt before the subtraction", () => {
    const payload = response(
      wireChild("ahead-a", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 1 * DAY],
          ["1.2.1", NOW + 10 * DAY],
        ]),
      ]),
      wireChild("ahead-b", [
        wireIdea(0, "i-2", [
          ["1.1.5", NOW - 1 * DAY],
          ["1.2.1", NOW + 99 * DAY],
        ]),
      ]),
    );
    const { rowBy } = board(payload, SELL_1_2);
    expect(rowBy("1.2.1").cycleTimeMedianMs).toBe(1 * DAY);
  });
});

/* ---------------------------------------------------------- the WIP split */

describe("the active/stalled split", () => {
  function twoOnSameTask(secondIdleDays: number): FlowRow {
    const payload = response(
      wireChild("fresh", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 40 * DAY],
          ["1.2.1", NOW - 2 * DAY],
        ]),
      ]),
      wireChild("quiet", [
        wireIdea(0, "i-2", [
          ["1.1.5", NOW - 200 * DAY],
          ["1.2.1", NOW - secondIdleDays * DAY],
        ]),
      ]),
    );
    return board(payload, SELL_1_2).rowBy("1.2.2");
  }

  it("splits two ideas on the same task by recency", () => {
    const row = twoOnSameTask(45);
    expect(row.active).toBe(1);
    expect(row.stalled).toBe(1);
  });

  it("29 days is ACTIVE and 31 days is STALLED — the boundary, against the constant", () => {
    expect(twoOnSameTask(29).active).toBe(2);
    expect(twoOnSameTask(29).stalled).toBe(0);
    expect(twoOnSameTask(31).active).toBe(1);
    expect(twoOnSameTask(31).stalled).toBe(1);

    // pinned against STALLED_AFTER_MS itself, not a literal: exactly at the
    // threshold is stalled, one millisecond inside it is active
    const unit: FlowUnit = {
      childIndex: 0,
      origin: "idea",
      completions: new Map([["1.1.5", NOW - STALLED_AFTER_MS]]),
      lastCompletionAt: NOW - STALLED_AFTER_MS,
      recencyClamped: false,
      recencyCorroborated: true,
      hasCompletionsOutsideRequest: false,
      fromTruncatedDoc: false,
    };
    expect(placeUnit(unit, SELL_1_2, NOW)).toEqual({
      where: "row",
      taskId: "1.2.1",
      bucket: "stalled",
      reason: "idle",
    });
    expect(
      placeUnit({ ...unit, lastCompletionAt: NOW - STALLED_AFTER_MS + 1 }, SELL_1_2, NOW),
    ).toEqual({ where: "row", taskId: "1.2.1", bucket: "active", reason: null });
  });

  it("a year-old idea never appears in active — the column cannot drift upward", () => {
    const row = twoOnSameTask(365);
    expect(row.active).toBe(1);
    expect(row.stalled).toBe(1);
  });

  it("real completions but a NULL lastCompletionAt counts as STALLED, not active", () => {
    const payload = response(
      wireChild("timeless", [
        wireIdea(
          0,
          "i-1",
          [
            ["1.1.5", null],
            ["1.2.1", null],
          ],
          { lastCompletionAt: null },
        ),
      ]),
    );
    const { rowBy, totals } = board(payload, SELL_1_2);
    expect(rowBy("1.2.2").stalled).toBe(1);
    expect(rowBy("1.2.2").active).toBe(0);
    expect(rowBy("1.2.2").uncorroborated).toBe(0); // "no-stamp", a different reason
    expect(totals.stalled).toBe(1);
  });

  it("recencyClamped is NOT credited as active — stalled, and counted as clamped", () => {
    const payload = response(
      wireChild("forward-clock", [
        wireIdea(
          0,
          "i-1",
          [
            ["1.1.5", NOW - 40 * DAY],
            ["1.2.1", NOW - 1 * DAY],
          ],
          // the server clamped a future stamp: recency is THIS request's clock
          { lastCompletionAt: NOW, recencyClamped: true },
        ),
      ]),
    );
    const { rowBy } = board(payload, SELL_1_2);
    expect(rowBy("1.2.2").active).toBe(0);
    expect(rowBy("1.2.2").stalled).toBe(1);
    // `clamped` is a diagnostic SUBSET of stalled: it is counted inside that
    // number, not beside it, so the reported columns stay two.
    expect(rowBy("1.2.2").clamped).toBe(1);
    expect(rowBy("1.2.2").clamped).toBeLessThanOrEqual(rowBy("1.2.2").stalled);
  });

  it("recency from a LATER criterion keeps an idea out of stalled", () => {
    const payload = response(
      wireChild("ahead", [
        wireIdea(
          0,
          "i-1",
          [
            ["1.1.5", NOW - 90 * DAY],
            ["1.2.1", NOW - 88 * DAY],
          ],
          { lastCompletionAt: NOW - 1 * DAY, hasCompletionsOutsideRequest: true },
        ),
      ]),
    );
    const { rowBy, cohort } = board(payload, SELL_1_2);
    expect(rowBy("1.2.2").active).toBe(1);
    expect(rowBy("1.2.2").stalled).toBe(0);
    // aggregated, so the UI never iterates the NAMED array to caveat this
    expect(cohort.unitsWithCompletionsOutsideRequest).toBe(1);
  });

  it("UNCORROBORATED recency is not activity — a bare stamp mints no completion", () => {
    // doneAtByTask entry with no doneByTask: no completion, but the server's
    // lastCompletionAt (deliberately not done-gated) still reads fresh.
    const payload = response(
      wireChild("bare-stamp", [
        {
          index: 0,
          id: "i-1",
          done: {},
          doneAt: {},
          doneByTask: { "1.1.5": true, "1.2.1": true },
          doneAtByTask: { "1.1.5": NOW - 400 * DAY, "1.2.1": NOW - 399 * DAY, "1.2.2": NOW },
          lastCompletionAt: NOW,
          recencyClamped: false,
          hasCompletionsOutsideRequest: false,
        },
      ]),
    );
    const { rowBy, cohort } = board(payload, SELL_1_2);
    expect(rowBy("1.2.2").throughput).toBe(0); // the bare stamp is not a completion
    expect(rowBy("1.2.2").active).toBe(0);
    expect(rowBy("1.2.2").stalled).toBe(1);
    expect(rowBy("1.2.2").uncorroborated).toBe(1);
    expect(cohort.unitsWithUncorroboratedRecency).toBe(1);
  });

  it("the clamped/uncorroborated diagnostics read ZERO on rows with neither", () => {
    // Both are SUBSET counts of `stalled`, and every other assertion on them is
    // made on a row whose sole occupant IS the thing being counted — which an
    // unconditional increment satisfies just as well. Pinning the zero is what
    // makes them subsets rather than aliases for `stalled`.
    const payload = response(
      wireChild("fresh", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 3 * DAY],
          ["1.2.1", NOW - 2 * DAY],
        ]),
      ]),
      wireChild("timeless", [wireIdea(0, "i-2", [["1.1.5", null]])]),
    );
    const { rowBy } = board(payload, SELL_1_2);
    // an ACTIVE occupant
    expect(rowBy("1.2.2").active).toBe(1);
    expect(rowBy("1.2.2").stalled).toBe(0);
    expect(rowBy("1.2.2").clamped).toBe(0);
    expect(rowBy("1.2.2").uncorroborated).toBe(0);
    // a STALLED occupant, stalled for neither reason — "no-stamp"
    expect(rowBy("1.2.1").stalled).toBe(1);
    expect(rowBy("1.2.1").clamped).toBe(0);
    expect(rowBy("1.2.1").uncorroborated).toBe(0);
  });

  it("a NEGATIVE or non-finite lastCompletionAt is no recency at all, not a huge idle", () => {
    // clampStamp bounds the future side and REJECTS the impossible side. Keeping
    // -1 would still bucket as stalled — via elapsed arithmetic on a garbage
    // number rather than via the null rule — so the bucket alone proves nothing
    // and the reason does.
    function withRecency(lastCompletionAt: number): NormalizedCohort {
      return normalizeCohort(
        response(
          wireChild("garbage", [
            wireIdea(
              0,
              "i-1",
              [
                ["1.1.5", NOW - 10 * DAY],
                ["1.2.1", NOW - 9 * DAY],
              ],
              { lastCompletionAt },
            ),
          ]),
        ),
        NOW,
      );
    }
    for (const value of [-1, Number.NaN]) {
      const cohort = withRecency(value);
      expect(cohort.units[0].lastCompletionAt).toBeNull();
      expect(placeUnit(anonymousUnits(cohort)[0], SELL_1_2, NOW)).toEqual({
        where: "row",
        taskId: "1.2.2",
        bucket: "stalled",
        reason: "no-stamp",
      });
    }
  });

  it("uses nowMs, not fetchedAt, for the recency test", () => {
    const payload = response(
      wireChild("ada", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 20 * DAY],
          ["1.2.1", NOW - 10 * DAY],
        ]),
      ]),
    );
    expect(board(payload, SELL_1_2).rowBy("1.2.2").active).toBe(1);
    // same payload, read 25 days later without refetching → 35 days idle
    const later = board(payload, SELL_1_2, { nowMs: NOW + 25 * DAY, fetchedAt: NOW });
    expect(later.rowBy("1.2.2").active).toBe(0);
    expect(later.rowBy("1.2.2").stalled).toBe(1);
  });
});

/* --------------------------------------------------- before / after window */

describe("units outside the visible window", () => {
  it("an idea that has not reached the criterion is counted BEFORE, never dropped", () => {
    const payload = response(
      wireChild("early", [wireIdea(0, "i-1", [])]),
      wireChild("mid", [wireIdea(0, "i-2", [["1.1.1", NOW - 2 * DAY]])]),
    );
    const { totals, rows } = board(payload, SELL_1_2);
    expect(totals.before).toBe(2);
    expect(totals.active + totals.stalled).toBe(0);
    for (const row of rows) {
      expect(row.active).toBe(0);
      expect(row.stalled).toBe(0);
    }
  });

  it("an idea past every visible task is counted AFTER", () => {
    const payload = response(
      wireChild("done", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 9 * DAY],
          ["1.2.1", NOW - 8 * DAY],
          ["1.2.2", NOW - 7 * DAY],
          ["1.2.3", NOW - 6 * DAY],
          ["1.2.4", NOW - 5 * DAY],
          ["1.2.5", NOW - 4 * DAY],
        ]),
      ]),
    );
    const { totals } = board(payload, SELL_1_2);
    expect(totals.after).toBe(1);
    expect(totals.active + totals.stalled + totals.before).toBe(0);
  });

  it("IN-WINDOW EVIDENCE beats a missing entry predecessor", () => {
    // Complete through 1.2.1-1.2.5 but MISSING 1.1.5 — reachable without a
    // hostile doc, since the server's entry cap can drop the one predecessor key
    // while keeping the in-window ones. The old gate reported this unit as both
    // "has not reached 1.2" and "got through 1.2.5".
    const payload = response(
      wireChild("gap", [
        wireIdea(0, "i-1", [
          ["1.2.1", NOW - 8 * DAY],
          ["1.2.2", NOW - 7 * DAY],
          ["1.2.3", NOW - 6 * DAY],
          ["1.2.4", NOW - 5 * DAY],
          ["1.2.5", NOW - 4 * DAY],
        ]),
      ]),
    );
    const { totals, rowBy } = board(payload, SELL_1_2);
    expect(rowBy("1.2.5").throughput).toBe(1);
    expect(totals.after).toBe(1);
    expect(totals.before).toBe(0);
  });

  it("a PARTIAL in-window unit missing the predecessor lands on its earliest gap", () => {
    const payload = response(
      wireChild("gap", [
        wireIdea(0, "i-1", [
          ["1.2.1", NOW - 8 * DAY],
          ["1.2.2", NOW - 7 * DAY],
        ]),
      ]),
    );
    const { totals, rowBy } = board(payload, SELL_1_2);
    expect(rowBy("1.2.3").active).toBe(1);
    expect(totals.before).toBe(0);
  });

  it("an idea with no completions sits on the FIRST task when that is the sequence start", () => {
    const payload = response(wireChild("new", [wireIdea(0, "i-1", [])]));
    const { rowBy, totals } = board(payload, SELL_1_1);
    expect(rowBy("1.1.1").stalled).toBe(1); // no stamps at all → stalled
    expect(totals.before).toBe(0);
  });

  it("an out-of-order idea lands on the EARLIER gap, not the later one", () => {
    const payload = response(
      wireChild("skipper", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 5 * DAY],
          ["1.2.3", NOW - 4 * DAY],
        ]),
      ]),
    );
    const { rowBy } = board(payload, SELL_1_2, { expectMonotonic: false });
    expect(rowBy("1.2.1").active).toBe(1);
    expect(rowBy("1.2.3").active).toBe(0);
    expect(rowBy("1.2.3").throughput).toBe(1);
  });

  it("reports before/after/active/stalled as a reconciling footer", () => {
    // NOT validation — placeUnit is total, so this identity holds by
    // construction. It is asserted once, here, as the footer contract Unit 5
    // renders, and nowhere else.
    const payload = response(
      wireChild("a", [wireIdea(0, "i-1", [])]),
      wireChild("b", [
        wireIdea(0, "i-2", [
          ["1.1.5", NOW - 3 * DAY],
          ["1.2.1", NOW - 2 * DAY],
        ]),
      ]),
    );
    const { totals } = board(payload, SELL_1_2);
    expect(totals.active + totals.stalled + totals.before + totals.after).toBe(
      totals.liveUnits,
    );
    expect(totals.liveUnits).toBe(2);
  });
});

/* ------------------------------------------- abnormal / erased children */

describe("children that contribute no units are COUNTED, never merely absent", () => {
  it("docUnreadable children contribute NO units and are counted separately", () => {
    const payload = response(
      wireChild("unreadable", [wireIdea(0, "i-x", [["1.1.5", NOW - 1 * DAY]])], {
        docUnreadable: true,
      }),
      wireChild("fine", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 2 * DAY],
          ["1.2.1", NOW - 1 * DAY],
        ]),
      ]),
    );
    const { totals, cohort, rowBy } = board(payload, SELL_1_2);
    expect(cohort.unreadableChildren).toBe(1);
    expect(cohort.childCount).toBe(2);
    expect(totals.liveUnits).toBe(1);
    expect(rowBy("1.2.1").throughput).toBe(1);
    expect(totals.before).toBe(0);
  });

  it("truncated children ARE counted, flagged on the unit and at cohort level", () => {
    const payload = response(
      wireChild(
        "big-doc",
        [
          wireIdea(0, "i-1", [
            ["1.1.5", NOW - 3 * DAY],
            ["1.2.1", NOW - 2 * DAY],
          ]),
        ],
        { truncated: true },
      ),
    );
    const { totals, cohort, rowBy } = board(payload, SELL_1_2);
    expect(cohort.truncatedChildren).toBe(1);
    expect(cohort.units[0].fromTruncatedDoc).toBe(true);
    expect(rowBy("1.2.1").throughput).toBe(1);
    expect(totals.liveUnits).toBe(1);
  });

  it("NON-CONTIGUOUS idea indices reveal ideas the server silently skipped", () => {
    // Indices 0 and 3 arriving means entries 1 and 2 were dropped as malformed.
    // Without this detector they are absent from throughput, the WIP columns and
    // the stalled roster, with no footprint anywhere.
    const payload = response(
      wireChild("gappy", [
        wireIdea(0, "i-1", [["1.1.5", NOW - 3 * DAY]]),
        wireIdea(3, "i-4", [["1.1.5", NOW - 2 * DAY]]),
      ]),
      wireChild("intact", [
        wireIdea(0, "i-a", [["1.1.5", NOW - 3 * DAY]]),
        wireIdea(1, "i-b", [["1.1.5", NOW - 2 * DAY]]),
      ]),
    );
    const { cohort } = board(payload, SELL_1_2);
    expect(cohort.childrenWithSkippedIdeas).toBe(1);
    expect(cohort.units).toHaveLength(4);
  });

  it("an UNREADABLE doc is counted once, as unreadable, even when also truncated", () => {
    // Both flags on one child, and the order of the two counters is the whole
    // test: the child contributes no units, so counting it as truncated as well
    // would put a caveat about "some ideas were dropped" beside a child whose
    // ideas were never read at all.
    const payload = response(
      wireChild("both-flags", [wireIdea(0, "i-x", [["1.1.5", NOW - 1 * DAY]])], {
        docUnreadable: true,
        truncated: true,
      }),
    );
    const { cohort, totals } = board(payload, SELL_1_2);
    expect(cohort.unreadableChildren).toBe(1);
    expect(cohort.truncatedChildren).toBe(0);
    expect(cohort.childrenWithNoUnits).toBe(0); // it is unreadable, not empty
    expect(cohort.childrenWithSkippedIdeas).toBe(0);
    expect(cohort.maxUnitsPerChild).toBe(0);
    expect(totals.liveUnits).toBe(0);
    expect(cohort.childCount).toBe(1);
  });

  it("maxUnitsPerChild is a MAX across children, not a cohort total", () => {
    // Its whole job is caveating the WIP columns, which one child holding many
    // ideas can inflate. As a running sum it would exceed the threshold on every
    // healthy cohort and mean nothing.
    const payload = response(
      wireChild("prolific", [
        wireIdea(0, "p-1", [["1.1.5", NOW - 3 * DAY]]),
        wireIdea(1, "p-2", [["1.1.5", NOW - 2 * DAY]]),
        wireIdea(2, "p-3", [["1.1.5", NOW - 1 * DAY]]),
      ]),
      wireChild("single", [wireIdea(0, "s-1", [["1.1.5", NOW - 1 * DAY]])]),
    );
    const { cohort } = board(payload, SELL_1_2);
    expect(cohort.units).toHaveLength(4);
    expect(cohort.childCount).toBe(2);
    expect(cohort.maxUnitsPerChild).toBe(3);
  });

  it("a readable child with an EMPTY ideas array is counted, not silently erased", () => {
    const payload = response(
      wireChild("empty", []),
      wireChild("also-empty", []),
      wireChild("real", [wireIdea(0, "i-1", [["1.1.5", NOW - 1 * DAY]])]),
    );
    const { cohort, totals } = board(payload, SELL_1_2);
    expect(cohort.childrenWithNoUnits).toBe(2);
    expect(cohort.childCount).toBe(3);
    expect(totals.liveUnits).toBe(1);
  });
});

/* ------------------------------------------------- business-side recency */

describe("promoted businesses", () => {
  function growPayload(withBusiness: boolean): WireProgressResponse {
    const idea = wireIdea(0, "idea-1", [[GROW_ENTRY, NOW - 200 * DAY]]);
    const businesses: WireBusiness[] = withBusiness
      ? [wireBusiness("biz-1", "idea-1", [[GROW_T0, NOW - 1 * DAY]])]
      : [];
    return response(wireChild("grower", [idea], { businesses }));
  }

  it("an idea working in Grow reads as ACTIVE, not stalled", () => {
    const { rowBy, totals } = board(growPayload(true), GROW);
    expect(totals.liveUnits).toBe(1); // the business folded into its idea
    expect(rowBy(GROW_T0).throughput).toBe(1);
    expect(rowBy(GROW_T1).active).toBe(1);
    expect(rowBy(GROW_T1).stalled).toBe(0);
  });

  it("without the business the same idea reads as stalled — the control", () => {
    const { rowBy } = board(growPayload(false), GROW);
    expect(rowBy(GROW_T0).stalled).toBe(1);
    expect(rowBy(GROW_T0).active).toBe(0);
  });

  it("a DANGLING business carrying ONLY Phase 4-5 keys is placed, not stranded", () => {
    // A real Business record has no idea-side completions at all, so it can
    // never satisfy an idea-side entry predecessor. Gating it produced a board
    // showing completions on this criterion and NOBODY working it.
    const payload = response(
      wireChild("orphan", [wireIdea(0, "idea-1", [[GROW_ENTRY, NOW - 5 * DAY]])], {
        businesses: [wireBusiness("biz-1", "idea-GONE", [[GROW_T0, NOW - 3 * DAY]])],
      }),
    );
    const { totals, rowBy, cohort } = board(payload, GROW);
    expect(totals.liveUnits).toBe(2);
    expect(cohort.units.map((unit) => unit.origin).sort()).toEqual(["business", "idea"]);
    expect(rowBy(GROW_T0).throughput).toBe(1);
    // the business sits on the NEXT grow task; the idea sits on the first
    expect(rowBy(GROW_T1).active).toBe(1);
    expect(rowBy(GROW_T0).active).toBe(1);
    expect(totals.before).toBe(0);
  });

  it("a business with NO in-window completions is placed by the walk, never 'before'", () => {
    // The isolating case for the origin rule: this business has been working in
    // a LATER grow criterion, so the task-id filter leaves its in-window map
    // empty and the in-window-evidence escape cannot help it. An idea-side entry
    // predecessor (`3.5.5`) belongs to its parent idea, a different unit, so a
    // business can never legitimately be "before" a Phase 4-5 criterion — it
    // sits on the first grow task it has not completed.
    const payload = response(
      wireChild("later-grow", [], {
        businesses: [
          wireBusiness("biz-1", null, [], {
            lastCompletionAt: NOW - 1 * DAY,
            hasCompletionsOutsideRequest: true,
          }),
        ],
      }),
    );
    const { totals, rowBy, cohort } = board(payload, GROW);
    expect(cohort.units[0].origin).toBe("business");
    expect(totals.before).toBe(0);
    expect(rowBy(GROW_T0).active).toBe(1);
  });

  it("an ARCHIVED business folds its COMPLETIONS but never its RECENCY", () => {
    // Otherwise one retired record with a fresh stamp revives a 400-day-dead
    // idea into `active` and out of every intervention path.
    const dead = wireIdea(0, "idea-1", [[GROW_ENTRY, NOW - 400 * DAY]]);
    const payload = response(
      wireChild("archived", [dead], {
        businesses: [
          wireBusiness("biz-1", "idea-1", [[GROW_T0, NOW - 1 * DAY]], { archived: true }),
        ],
      }),
    );
    const { rowBy, totals } = board(payload, GROW);
    expect(rowBy(GROW_T0).throughput).toBe(1); // the progress happened
    expect(rowBy(GROW_T1).active).toBe(0); // but it is not evidence of activity
    expect(rowBy(GROW_T1).stalled).toBe(1);
    expect(totals.liveUnits).toBe(1);
  });

  it("an archived business with no idea gets no recency credit either", () => {
    const payload = response(
      wireChild("orphan-archived", [], {
        businesses: [
          wireBusiness("biz-1", null, [[GROW_T0, NOW - 1 * DAY]], { archived: true }),
        ],
      }),
    );
    const { rowBy } = board(payload, GROW);
    expect(rowBy(GROW_T1).stalled).toBe(1);
    expect(rowBy(GROW_T1).active).toBe(0);
  });

  it("a business's recencyClamped poisons the folded idea — deliberately conservative", () => {
    const payload = response(
      wireChild("forward-clock", [wireIdea(0, "idea-1", [[GROW_ENTRY, NOW - 5 * DAY]])], {
        businesses: [
          wireBusiness("biz-1", "idea-1", [[GROW_T0, NOW - 1 * DAY]], {
            lastCompletionAt: NOW,
            recencyClamped: true,
          }),
        ],
      }),
    );
    const { rowBy } = board(payload, GROW);
    expect(rowBy(GROW_T1).active).toBe(0);
    expect(rowBy(GROW_T1).stalled).toBe(1);
    expect(rowBy(GROW_T1).clamped).toBe(1);
  });

  it("TWO businesses folding into one idea both contribute, newest recency wins", () => {
    const payload = response(
      wireChild("serial", [wireIdea(0, "idea-1", [[GROW_ENTRY, NOW - 300 * DAY]])], {
        businesses: [
          wireBusiness("biz-old", "idea-1", [[GROW_T0, NOW - 200 * DAY]]),
          wireBusiness("biz-new", "idea-1", [[GROW_T1, NOW - 1 * DAY]]),
        ],
      }),
    );
    const { rowBy, totals } = board(payload, GROW);
    expect(totals.liveUnits).toBe(1);
    expect(rowBy(GROW_T0).throughput).toBe(1);
    expect(rowBy(GROW_T1).throughput).toBe(1);
    expect(rowBy(GROW.taskIds[2]).active).toBe(1); // fresh, from the newer record
  });

  it("a DORMANT business never drags an actively-worked idea into stalled", () => {
    // The fold takes the LATER of the two recencies, in BOTH directions. Every
    // other business fixture has the business newer than its idea, so a fold
    // that simply OVERWROTE with the business's stamp would look correct — and
    // would flip a child working today into stalled on the strength of a
    // business record nobody has touched in 200 days.
    const payload = response(
      wireChild("still-working", [wireIdea(0, "idea-1", [[GROW_ENTRY, NOW - 1 * DAY]])], {
        businesses: [wireBusiness("biz-1", "idea-1", [[GROW_T0, NOW - 200 * DAY]])],
      }),
    );
    const { rowBy, cohort, totals } = board(payload, GROW);
    expect(totals.liveUnits).toBe(1);
    expect(cohort.units[0].lastCompletionAt).toBe(NOW - 1 * DAY); // the IDEA's, not the business's
    expect(rowBy(GROW_T1).active).toBe(1);
    expect(rowBy(GROW_T1).stalled).toBe(0);
  });

  it("on a same-task collision the IDEA's stamp wins, and the cycle time follows", () => {
    // Not a membership question: both sides carry GROW_T0, and which stamp
    // survives is the difference between a 1-day and a 9-day cycle time. The
    // idea's map is the older, authoritative record.
    function collider(username: string): WireChild {
      return wireChild(
        username,
        [
          wireIdea(0, "idea-1", [
            [GROW_ENTRY, NOW - 10 * DAY],
            [GROW_T0, NOW - 9 * DAY],
          ]),
        ],
        { businesses: [wireBusiness("biz-1", "idea-1", [[GROW_T0, NOW - 1 * DAY]])] },
      );
    }
    const { rowBy, cohort } = board(response(collider("a"), collider("b")), GROW);
    expect(cohort.units[0].completions.get(GROW_T0)).toBe(NOW - 9 * DAY);
    expect(rowBy(GROW_T0).cycleTimeMedianMs).toBe(1 * DAY);
    expect(rowBy(GROW_T0).sampleSize).toBe(2);
  });

  it("an archived business's recencyClamped does not propagate either", () => {
    // The archived split drops the WHOLE recency half of the fold, the clamped
    // flag included. Folding the flag alone would park a healthy, actively-
    // worked idea in `clamped` on the strength of a retired record.
    const payload = response(
      wireChild("archived-clock", [wireIdea(0, "idea-1", [[GROW_ENTRY, NOW - 2 * DAY]])], {
        businesses: [
          wireBusiness("biz-1", "idea-1", [[GROW_T0, NOW - 1 * DAY]], {
            archived: true,
            lastCompletionAt: NOW,
            recencyClamped: true,
          }),
        ],
      }),
    );
    const { rowBy, cohort } = board(payload, GROW);
    expect(cohort.units[0].recencyClamped).toBe(false);
    expect(rowBy(GROW_T0).throughput).toBe(1); // completions still fold
    expect(rowBy(GROW_T1).active).toBe(1);
    expect(rowBy(GROW_T1).clamped).toBe(0);
  });

  it("a business folds into the FIRST idea carrying its id, never the last", () => {
    // Duplicate idea ids stay distinct units, so `ideaId` is ambiguous and the
    // tie-break decides which unit absorbs the Phase 4-5 progress — and
    // therefore which of the two shows as working and which as parked.
    const payload = response(
      wireChild("dupes", [
        wireIdea(0, "dup", [[GROW_ENTRY, NOW - 5 * DAY]]),
        wireIdea(1, "dup", [[GROW_ENTRY, NOW - 4 * DAY]]),
      ], {
        businesses: [wireBusiness("biz-1", "dup", [[GROW_T0, NOW - 1 * DAY]])],
      }),
    );
    const { cohort, totals } = board(payload, GROW);
    expect(totals.liveUnits).toBe(2); // the business folded, it is not a third unit
    expect(cohort.units[0].completions.has(GROW_T0)).toBe(true);
    expect(cohort.units[1].completions.has(GROW_T0)).toBe(false);
    expect(cohort.units[0].lastCompletionAt).toBe(NOW - 1 * DAY);
    expect(cohort.units[1].lastCompletionAt).toBe(NOW - 4 * DAY);
  });

  it("a business's hasCompletionsOutsideRequest propagates onto the idea it folds into", () => {
    // The business has been working in a LATER grow criterion: no in-window
    // completions, just the flag and a fresh stamp. Losing the flag in the fold
    // makes the recency uncorroborated and files an active child under stalled.
    const payload = response(
      wireChild("ahead", [wireIdea(0, "idea-1", [[GROW_ENTRY, NOW - 90 * DAY]])], {
        businesses: [
          wireBusiness("biz-1", "idea-1", [], {
            lastCompletionAt: NOW - 1 * DAY,
            hasCompletionsOutsideRequest: true,
          }),
        ],
      }),
    );
    const { rowBy, cohort } = board(payload, GROW);
    expect(cohort.units[0].hasCompletionsOutsideRequest).toBe(true);
    expect(cohort.unitsWithCompletionsOutsideRequest).toBe(1);
    expect(cohort.unitsWithUncorroboratedRecency).toBe(0);
    expect(rowBy(GROW_T0).active).toBe(1);
    expect(rowBy(GROW_T0).stalled).toBe(0);
  });

  it("the flag is per-unit and defaults FALSE — it is read off the wire, not assumed", () => {
    const payload = response(
      wireChild("plain", [wireIdea(0, "idea-1", [[GROW_ENTRY, NOW - 1 * DAY]])]),
      wireChild("flagged", [
        wireIdea(0, "idea-2", [[GROW_ENTRY, NOW - 1 * DAY]], {
          hasCompletionsOutsideRequest: true,
        }),
      ]),
    );
    const { cohort } = board(payload, GROW);
    expect(cohort.units.map((unit) => unit.hasCompletionsOutsideRequest)).toEqual([
      false,
      true,
    ]);
    expect(cohort.unitsWithCompletionsOutsideRequest).toBe(1);
  });
});

/* -------------------------------------------------- legacy keys + remaps */

describe("normalization through the shared gameCore union helper", () => {
  function legacyChild(username: string, offsetDays: number): WireChild {
    return wireChild(username, [
      {
        index: 0,
        id: `i-${username}`,
        done: { "1.1#0": true, "1.1#1": true },
        doneAt: {
          "1.1#0": NOW - (5 + offsetDays) * DAY,
          "1.1#1": NOW - (4 + offsetDays) * DAY,
        },
        doneByTask: {},
        doneAtByTask: {},
        lastCompletionAt: NOW - (4 + offsetDays) * DAY,
        recencyClamped: false,
        hasCompletionsOutsideRequest: false,
      },
    ]);
  }

  it("folds legacy ${stepId}#${index} completions into their stable ids", () => {
    const { rowBy } = board(response(legacyChild("a", 0), legacyChild("b", 1)), SELL_1_1);
    expect(rowBy("1.1.1").throughput).toBe(2);
    expect(rowBy("1.1.2").throughput).toBe(2);
    expect(rowBy("1.1.2").cycleTimeMedianMs).toBe(1 * DAY);
    expect(rowBy("1.1.3").active).toBe(2);
  });

  it("a doneAt entry without its done:true never mints a completion", () => {
    const payload = response(
      wireChild("orphan-stamp", [
        {
          index: 0,
          id: "i-1",
          done: { "1.1#0": true },
          doneAt: { "1.1#0": NOW - 5 * DAY, "1.1#1": NOW - 4 * DAY },
          doneByTask: {},
          doneAtByTask: { "1.1.3": NOW - 3 * DAY },
          lastCompletionAt: NOW - 3 * DAY,
          recencyClamped: false,
          hasCompletionsOutsideRequest: false,
        },
      ]),
    );
    const { rowBy } = board(payload, SELL_1_1);
    expect(rowBy("1.1.1").throughput).toBe(1);
    expect(rowBy("1.1.2").throughput).toBe(0);
    expect(rowBy("1.1.3").throughput).toBe(0);
    expect(rowBy("1.1.2").stalled).toBe(1);
    expect(rowBy("1.1.2").uncorroborated).toBe(1); // the bare 1.1.3 stamp
  });

  it("an EXPLICIT done:false beside a stamp mints no completion — absence is not the test", () => {
    // Distinct from the orphan-stamp case above, which OMITS the key.
    // migrateIdeaProgress spreads `{ ...idea.doneByTask }`, so an explicit
    // `false` survives into the migrated map; only a strict `=== true` gate
    // rejects it. An `!== undefined` gate would admit it and mint a phantom
    // completion — with a stamp, so it would also mint a phantom cycle time.
    const payload = response(
      wireChild("explicit-false", [
        {
          index: 0,
          id: "i-1",
          done: {},
          doneAt: {},
          doneByTask: { "1.1.5": true, "1.2.1": false },
          doneAtByTask: { "1.1.5": NOW - 10 * DAY, "1.2.1": NOW - 9 * DAY },
          lastCompletionAt: NOW - 9 * DAY,
          recencyClamped: false,
          hasCompletionsOutsideRequest: false,
        },
      ]),
    );
    const { rowBy, cohort } = board(payload, SELL_1_2);
    expect(cohort.units[0].completions.has("1.2.1")).toBe(false);
    expect(rowBy("1.2.1").throughput).toBe(0);
    expect(rowBy("1.2.1").sampleSize).toBe(0);
    expect(rowBy("1.2.1").droppedSamples).toBe(0);
    // and the unit is still parked on 1.2.1, not waved through it
    expect(rowBy("1.2.1").stalled).toBe(1);
  });

  it("on a legacy/stable collision the NEW shape's stamp wins", () => {
    function both(username: string): WireChild {
      return wireChild(username, [
        {
          index: 0,
          id: `i-${username}`,
          done: { "1.1#0": true },
          doneAt: { "1.1#0": NOW - 50 * DAY },
          doneByTask: { "1.1.1": true, "1.1.2": true },
          doneAtByTask: { "1.1.1": NOW - 10 * DAY, "1.1.2": NOW - 9 * DAY },
          lastCompletionAt: NOW - 9 * DAY,
          recencyClamped: false,
          hasCompletionsOutsideRequest: false,
        },
      ]);
    }
    const { rowBy } = board(response(both("a"), both("b")), SELL_1_1);
    // 1.1.2 - 1.1.1 = 1 day; had the legacy stamp won, it would be 41 days
    expect(rowBy("1.1.2").cycleTimeMedianMs).toBe(1 * DAY);
  });

  it("with a populated TASK_REMAP, old-id completions count under the NEW id", () => {
    const payload = response(
      wireChild("remapped", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 10 * DAY],
          ["1.2.1", NOW - 9 * DAY],
          ["1.2.2", NOW - 8 * DAY], // retargeted to 1.2.3 by the injected table
        ]),
      ]),
    );
    const cohort = normalizeCohort(payload, NOW, { "1.2.2": "1.2.3" });
    const units = anonymousUnits(cohort);
    const rows = computeFlowRows(units, SELL_1_2, NOW);
    const rowBy = (id: string): FlowRow => {
      const row = rows.find((candidate) => candidate.taskId === id);
      if (!row) throw new Error(id);
      return row;
    };
    expect(rowBy("1.2.2").throughput).toBe(0);
    expect(rowBy("1.2.3").throughput).toBe(1);
    expect(rowBy("1.2.2").active).toBe(1); // the walk stops at the now-incomplete 1.2.2
  });

  it("mints legacy-idea-{index} from the PRESERVED index, keeping duplicates distinct", () => {
    const payload = response(
      wireChild("dupes", [
        wireIdea(0, null, [["1.1.1", NOW - 3 * DAY]]),
        wireIdea(1, "same-id", [["1.1.1", NOW - 2 * DAY]]),
        wireIdea(2, "same-id", [["1.1.1", NOW - 1 * DAY]]),
      ]),
    );
    const { rowBy, totals, named } = board(payload, SELL_1_1);
    expect(totals.liveUnits).toBe(3); // duplicate ids stay two units
    expect(rowBy("1.1.1").throughput).toBe(3);
    expect(named[0].key).toContain("legacy-idea-0");
    expect(new Set(named.map((unit) => unit.key)).size).toBe(3);
  });
});

/* ------------------------------------------------------- survivorship */

describe("survivorship bias in the median (a documented property, pinned)", () => {
  it("counts only completers — the slow abandoners show up in stalled instead", () => {
    const payload = response(
      ...[1, 2, 3].map((days, index) =>
        wireChild(`fast-${index}`, [
          wireIdea(0, `f-${index}`, [
            ["1.1.5", NOW - 100 * DAY],
            ["1.2.1", NOW - 100 * DAY + days * DAY],
          ]),
        ]),
      ),
      ...[0, 1].map((index) =>
        wireChild(`slow-${index}`, [
          wireIdea(0, `s-${index}`, [["1.1.5", NOW - 200 * DAY]]),
        ]),
      ),
    );
    const { rowBy } = board(payload, SELL_1_2);
    const row = rowBy("1.2.1");
    expect(row.cycleTimeMedianMs).toBe(2 * DAY); // completers only
    expect(row.sampleSize).toBe(3);
    expect(row.stalled).toBe(2); // the non-completers, invisible to the median
  });
});

/* ---------------------------------------------------------- privacy */

describe("privacy", () => {
  const payload = response(
    wireChild("zzz-distinctive-alpha", [
      wireIdea(0, "i-1", [
        ["1.1.5", NOW - 3 * DAY],
        ["1.2.1", NOW - 2 * DAY],
      ]),
    ]),
    wireChild("zzz-distinctive-beta", [wireIdea(0, "i-2", [["1.1.5", NOW - 3 * DAY]])]),
  );

  it("no username appears anywhere in the serialized rows or totals", () => {
    const { rows, totals } = board(payload, SELL_1_2);
    expect(JSON.stringify({ rows, totals })).not.toContain("zzz-distinctive");
  });

  it("anonymousUnits actually STRIPS the name — the type alone would not", () => {
    // NamedFlowUnit extends FlowUnit, so passing the named array satisfies the
    // aggregate signature while carrying every username into that array's scope.
    const cohort = normalizeCohort(payload, NOW);
    const units = anonymousUnits(cohort);
    expect(units).toHaveLength(2);
    expect(JSON.stringify(units)).not.toContain("zzz-distinctive");
    for (const unit of units) {
      expect(Object.keys(unit)).not.toContain("username");
      expect(Object.keys(unit)).not.toContain("key");
    }
    // and the named array still has them, for the drill-down
    expect(cohort.units.every((unit) => unit.username.startsWith("zzz"))).toBe(true);
  });
});

/* ------------------------------------------------------------ drill-down */

describe("drillDown", () => {
  const payload = response(
    wireChild("carol", [
      wireIdea(0, "c-1", [
        ["1.1.5", NOW - 5 * DAY],
        ["1.2.1", NOW - 2 * DAY],
      ]),
    ]),
    wireChild("alice", [
      wireIdea(0, "a-1", [
        ["1.1.5", NOW - 5 * DAY],
        ["1.2.1", NOW - 3 * DAY],
      ]),
      wireIdea(1, "a-2", [
        ["1.1.5", NOW - 5 * DAY],
        ["1.2.1", NOW - 4 * DAY],
      ]),
    ]),
    wireChild("bob", [
      wireIdea(0, "b-1", [
        ["1.1.5", NOW - 300 * DAY],
        ["1.2.1", NOW - 200 * DAY],
      ]),
    ]),
  );

  it("names who is in a bucket, sorted deterministically, counts reconciling", () => {
    const { named, rowBy } = board(payload, SELL_1_2);
    const active = drillDown(named, SELL_1_2, "1.2.2", "active", NOW);
    expect(active.map((entry) => entry.username)).toEqual(["alice", "carol"]);
    expect(active.find((entry) => entry.username === "alice")?.units).toBe(2);
    expect(active.reduce((sum, entry) => sum + entry.units, 0)).toBe(rowBy("1.2.2").active);

    const stalled = drillDown(named, SELL_1_2, "1.2.2", "stalled", NOW);
    expect(stalled).toEqual([{ username: "bob", units: 1 }]);
    expect(stalled.reduce((sum, entry) => sum + entry.units, 0)).toBe(
      rowBy("1.2.2").stalled,
    );
  });

  it("is stable regardless of payload order", () => {
    const { named } = board(payload, SELL_1_2);
    expect(drillDown([...named].reverse(), SELL_1_2, "1.2.2", "active", NOW)).toEqual(
      drillDown(named, SELL_1_2, "1.2.2", "active", NOW),
    );
  });

  it("returns nothing for a task nobody is sitting on", () => {
    const { named } = board(payload, SELL_1_2);
    expect(drillDown(named, SELL_1_2, "1.2.5", "active", NOW)).toEqual([]);
  });
});

/* -------------------------------------------------------- non-monotonicity */

describe("deleted ideas", () => {
  it("are simply reflected as smaller numbers — nothing asserts monotonicity", () => {
    const twoIdeas = response(
      wireChild("ada", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 5 * DAY],
          ["1.2.1", NOW - 4 * DAY],
        ]),
        wireIdea(1, "i-2", [
          ["1.1.5", NOW - 5 * DAY],
          ["1.2.1", NOW - 4 * DAY],
        ]),
      ]),
    );
    const oneIdea = response(
      wireChild("ada", [
        wireIdea(0, "i-1", [
          ["1.1.5", NOW - 5 * DAY],
          ["1.2.1", NOW - 4 * DAY],
        ]),
      ]),
    );
    expect(board(twoIdeas, SELL_1_2).rowBy("1.2.1").throughput).toBe(2);
    expect(board(oneIdea, SELL_1_2).rowBy("1.2.1").throughput).toBe(1);
  });
});
