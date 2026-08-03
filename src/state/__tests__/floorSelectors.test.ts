import { describe, expect, it } from "vitest";
import { criterionIdsForPhase, initialState, reducer, type Action, type GameState } from "../gameCore";
import { stepById, type PhaseId } from "../../data/path";
import {
  currentPhaseFor,
  ideaProgressLabel,
  ideaSummaryName,
  nextCoachTarget,
  nextTaskId,
  phaseTaskTotal,
  phaseTasksDone,
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

/** Complete every criterion of a phase, in order, for one idea. */
function completePhase(state: GameState, ideaIndex: number, phase: PhaseId): GameState {
  return criterionIdsForPhase(phase).reduce(
    (s, stepId) => completeStep(s, ideaIndex, stepId),
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

  it("keeps walking the Sell phase past 1.2 (Unit 6: no more two-criterion dead end)", () => {
    let s = withIdeas(1);
    s = completeStep(s, 0, "1.1");
    s = completeStep(s, 0, "1.2");
    expect(nextTaskId(s, 0)).toBe("1.3.1");
    expect(ideaProgressLabel(s, 0)).toBe(`10/${phaseTaskTotal("sell")} tasks · next 1.3.1`);
  });

  it("rolls onto phase 2 with phase-scoped counts once Sell is complete", () => {
    const s = completePhase(withIdeas(1), 0, "sell");
    expect(currentPhaseFor(s, 0)).toBe("build");
    expect(nextTaskId(s, 0)).toBe("2.1.1");
    expect(ideaProgressLabel(s, 0)).toBe(`0/${phaseTaskTotal("build")} tasks · next 2.1.1`);
  });

  it("reports 'ready for Grow' at the gated frontier (phases 1-3 done, no business)", () => {
    let s = withIdeas(1);
    s = completePhase(s, 0, "sell");
    s = completePhase(s, 0, "build");
    s = completePhase(s, 0, "validate");
    expect(nextTaskId(s, 0)).toBeNull();
    expect(currentPhaseFor(s, 0)).toBe("validate");
    const total = phaseTaskTotal("validate");
    expect(ideaProgressLabel(s, 0)).toBe(`${total}/${total} tasks · ready for Grow`);
  });

  it("phase task totals come from the content (variable counts, per-phase totals)", () => {
    expect(phaseTaskTotal("sell")).toBe(25);
    expect(phaseTaskTotal("build")).toBe(26);
    expect(phaseTaskTotal("validate")).toBe(24);
    expect(phaseTaskTotal("grow")).toBe(25);
    expect(phaseTaskTotal("scale")).toBe(25);
    const s = completeStep(withIdeas(1), 0, "1.1");
    expect(phaseTasksDone(s, 0, "sell")).toBe(5);
    expect(phaseTasksDone(s, 0, "build")).toBe(0);
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

describe("floorSelectors — Next Step coach target", () => {
  it("sends a founder with no ideas to create one (the Idea Room)", () => {
    expect(nextCoachTarget(initialState())).toEqual({ kind: "create" });
  });

  it("points a fresh idea at 1.1 in the Idea Room", () => {
    expect(nextCoachTarget(withIdeas(1))).toEqual({ kind: "criterion", stepId: "1.1", room: "idea" });
  });

  it("advances to 1.2 (the market) once 1.1 is done", () => {
    const s = completeStep(withIdeas(1), 0, "1.1");
    expect(nextCoachTarget(s)).toEqual({ kind: "criterion", stepId: "1.2", room: "market" });
  });

  it("prefers the ACTIVE idea's next criterion over other ideas", () => {
    // Two ideas: idea 0 has finished 1.1; idea 1 (active after CREATE_IDEA) has not.
    let s = withIdeas(2);
    s = completeStep(s, 0, "1.1");
    expect(s.activeIdea).toBe(1);
    expect(nextCoachTarget(s)).toEqual({ kind: "criterion", stepId: "1.1", room: "idea" });
  });

  it("keeps walking the ACTIVE idea's sequence past 1.2 (Unit 6)", () => {
    let s = withIdeas(2);
    s = completeStep(completeStep(s, 1, "1.1"), 1, "1.2"); // active idea 1 through 1.2
    expect(nextCoachTarget(s)).toEqual({ kind: "criterion", stepId: "1.3", room: "market" });
  });

  it("crosses the phase boundary: Sell complete -> 2.1 in the Build Room", () => {
    const s = completePhase(withIdeas(1), 0, "sell");
    expect(nextCoachTarget(s)).toEqual({ kind: "criterion", stepId: "2.1", room: "build" });
  });

  it("targets the PROMOTION seam once the active idea completes phase 3 (business gate)", () => {
    let s = withIdeas(1);
    s = completePhase(s, 0, "sell");
    s = completePhase(s, 0, "build");
    s = completePhase(s, 0, "validate");
    // Unit 8 consumes this target (the promotion screen); the coach hides on it
    // for now rather than pointing at the locked Grow phase.
    expect(nextCoachTarget(s)).toEqual({ kind: "promote", ideaIndex: 0 });
  });

  it("the promotion seam WINS over another idea's remaining work for the active idea", () => {
    let s = withIdeas(2);
    // Active idea (1) validated end-to-end; idea 0 untouched.
    s = completePhase(s, 1, "sell");
    s = completePhase(s, 1, "build");
    s = completePhase(s, 1, "validate");
    expect(s.activeIdea).toBe(1);
    expect(nextCoachTarget(s)).toEqual({ kind: "promote", ideaIndex: 1 });
  });
});

describe("floorSelectors — locked-phase entry is a no-op (Unit 6)", () => {
  it("roomEntryFor no-ops on a phase-4 criterion while the business gate is closed", () => {
    let s = withIdeas(1);
    s = completePhase(s, 0, "sell");
    s = completePhase(s, 0, "build");
    s = completePhase(s, 0, "validate");
    expect(roomEntryFor(s, "4.1")).toEqual({ action: "noop" });
    expect(roomEntryFor(s, "5.1")).toEqual({ action: "noop" });
  });

  it("roomEntryFor no-ops on a phase-2 criterion before phase 1 is complete", () => {
    expect(roomEntryFor(withIdeas(1), "2.1")).toEqual({ action: "noop" });
  });

  it("roomEntryFor enters a phase-2 criterion once phase 1 is complete", () => {
    const s = completePhase(withIdeas(1), 0, "sell");
    expect(roomEntryFor(s, "2.1")).toEqual({ action: "enter", ideaIndex: 0, index: 0 });
  });
});
