import { describe, expect, it } from "vitest";
import { initialState, reducer, type Action, type GameState } from "../gameCore";
import { stepById } from "../../data/path";
import {
  ideaProgressLabel,
  ideaSummaryName,
  nextTaskId,
  playableTaskTotal,
  roomEntryFor,
} from "../floorSelectors";

function apply(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce(reducer, state);
}

/** Base state with N onboarding-seeded ideas (runner closed for clarity). */
function withIdeas(n: number): GameState {
  let s = initialState();
  for (let i = 0; i < n; i++) s = apply(s, { type: "CREATE_IDEA" }, { type: "CLOSE_RUNNER" });
  return s;
}

/** Mark every task of a step done for one idea. */
function completeStep(state: GameState, ideaIndex: number, stepId: string): GameState {
  const step = stepById(stepId);
  if (!step) throw new Error(`no step ${stepId}`);
  return step.tasks.reduce(
    (s, _t, index) => reducer(s, { type: "COMPLETE_TASK", ideaIndex, stepId, index }),
    state,
  );
}

describe("floorSelectors — idea summaries", () => {
  it("returns 'Not named yet' before a one-liner is written", () => {
    expect(ideaSummaryName(withIdeas(1), 0)).toBe("Not named yet");
  });

  it("truncates a long one-liner at 42 chars with an ellipsis", () => {
    const long = "a".repeat(60);
    const s = apply(withIdeas(1), { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: long });
    const name = ideaSummaryName(s, 0);
    expect(name.endsWith("…")).toBe(true);
    expect(name.length).toBe(43); // 42 chars + ellipsis
  });

  it("shows a short one-liner verbatim", () => {
    const s = apply(withIdeas(1), { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "Bracelets" });
    expect(ideaSummaryName(s, 0)).toBe("Bracelets");
  });
});

describe("floorSelectors — progress + next task id", () => {
  it("points at the first task of 1.1 for a brand-new idea", () => {
    expect(nextTaskId(withIdeas(1), 0)).toBe("1.1.1");
  });

  it("advances the next-task id as tasks complete", () => {
    const s = apply(withIdeas(1), { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.1", index: 0 });
    expect(nextTaskId(s, 0)).toBe("1.1.2");
  });

  it("reports 'ready for Build' once both playable criteria are done", () => {
    let s = withIdeas(1);
    s = completeStep(s, 0, "1.1");
    s = completeStep(s, 0, "1.2");
    expect(nextTaskId(s, 0)).toBeNull();
    expect(ideaProgressLabel(s, 0)).toBe(`${playableTaskTotal()}/${playableTaskTotal()} tasks · ready for Build`);
  });
});

describe("floorSelectors — room-entry routing (core multi-idea mechanic)", () => {
  it("no-op when no idea is eligible for a criterion", () => {
    // 1.2 with zero ideas having completed 1.1 → nobody eligible.
    expect(roomEntryFor(withIdeas(1), "1.2")).toEqual({ action: "noop" });
  });

  it("enters directly when exactly one idea is eligible", () => {
    const entry = roomEntryFor(withIdeas(1), "1.1");
    expect(entry).toEqual({ action: "enter", ideaIndex: 0, index: 0 });
  });

  it("routes to the picker when multiple ideas are eligible", () => {
    const entry = roomEntryFor(withIdeas(3), "1.1");
    expect(entry).toEqual({ action: "pick", eligible: [0, 1, 2] });
  });

  it("enters at the first incomplete task index within the criterion", () => {
    const s = apply(withIdeas(1), { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.1", index: 0 });
    expect(roomEntryFor(s, "1.1")).toEqual({ action: "enter", ideaIndex: 0, index: 1 });
  });

  it("excludes an idea that already finished the criterion", () => {
    let s = withIdeas(2);
    s = completeStep(s, 0, "1.1"); // idea 0 done 1.1 → eligible for 1.2, not 1.1
    // For 1.1: only idea 1 is still eligible → direct enter of idea 1.
    expect(roomEntryFor(s, "1.1")).toEqual({ action: "enter", ideaIndex: 1, index: 0 });
    // For 1.2: only idea 0 is eligible (unlocked, not done).
    expect(roomEntryFor(s, "1.2")).toEqual({ action: "enter", ideaIndex: 0, index: 0 });
  });
});
