import { describe, expect, it } from "vitest";
import {
  CRITERION_SEQUENCE,
  criterionIdsForPhase,
  initialState,
  nextUpFor,
  reducer,
  type Action,
  type GameState,
} from "../gameCore";
import { BUILT_CRITERIA, stepById, type PhaseId } from "../../data/path";
import {
  currentPhaseFor,
  ideaNeedsNaming,
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

/**
 * An OPEN content-readiness allowlist (every criterion "built"), injected into
 * nextCoachTarget/roomEntryFor where a test exercises the ENGINE's full-sequence
 * behavior rather than today's shipped UI. Since Unit 8 shipped all 25 surfaces
 * this equals the default; kept so the engine tests stay independent of the
 * shipped list.
 */
const ALL_BUILT: ReadonlySet<string> = new Set(CRITERION_SEQUENCE);

/**
 * A RESTRICTED allowlist (the pre-Unit-8 shipped pair), injected where a test
 * pins the readiness-GATE machinery itself: the gate must keep working so a
 * future criterion whose content lands before its surface can be pulled back
 * out of BUILT_CRITERIA.
 */
const ONLY_11_12: ReadonlySet<string> = new Set(["1.1", "1.2"]);

/** Base state with N onboarding-seeded ideas (runner closed for clarity). */
function withIdeas(n: number): GameState {
  let s = initialState();
  for (let i = 0; i < n; i++) s = apply(s, { type: "CREATE_IDEA" }, { type: "CLOSE_RUNNER" });
  return s;
}

/** Give one idea BOTH naming fields (productName + oneLiner), so the naming
 *  redirect (unnamed idea → 1.1.1) stays out of the way of what a test pins. */
function nameIdea(state: GameState, ideaIndex: number): GameState {
  return apply(
    state,
    { type: "SET_FIELD", ideaIndex, key: "productName", value: `Product ${ideaIndex + 1}` },
    { type: "SET_FIELD", ideaIndex, key: "oneLiner", value: `One-liner ${ideaIndex + 1}` },
  );
}

/** Base state with N ideas, every one fully named. */
function withNamedIdeas(n: number): GameState {
  let s = withIdeas(n);
  for (let i = 0; i < n; i++) s = nameIdea(s, i);
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

  it("shows the PRODUCT NAME first and foremost once authored (1.1 productName field)", () => {
    const s = apply(
      withIdeas(1),
      { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "Custom bracelets for recess trades" },
      { type: "SET_FIELD", ideaIndex: 0, key: "productName", value: "Recess Bracelets" },
    );
    expect(ideaSummaryName(s, 0)).toBe("Recess Bracelets");
  });

  it("falls back to the one-liner when the product name is blank/whitespace", () => {
    const s = apply(
      withIdeas(1),
      { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "Bracelets" },
      { type: "SET_FIELD", ideaIndex: 0, key: "productName", value: "   " },
    );
    expect(ideaSummaryName(s, 0)).toBe("Bracelets");
  });

  it("truncates a long product name at 42 chars like the one-liner", () => {
    const s = apply(withIdeas(1), { type: "SET_FIELD", ideaIndex: 0, key: "productName", value: "b".repeat(60) });
    const name = ideaSummaryName(s, 0);
    expect(name.endsWith("…")).toBe(true);
    expect(name.length).toBe(43);
  });
});

describe("floorSelectors — progress + next task id", () => {
  it("points at the first task of 1.1 for a brand-new idea", () => {
    expect(nextTaskId(withIdeas(1), 0)).toBe("1.1.1");
  });

  it("advances the next-task id as tasks complete", () => {
    const s = apply(withNamedIdeas(1), { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.1", index: 0 });
    expect(nextTaskId(s, 0)).toBe("1.1.2");
  });

  it("keeps walking the Sell phase past 1.2 (Unit 6: no more two-criterion dead end)", () => {
    let s = withNamedIdeas(1);
    s = completeStep(s, 0, "1.1");
    s = completeStep(s, 0, "1.2");
    expect(nextTaskId(s, 0)).toBe("1.3.1");
    expect(ideaProgressLabel(s, 0)).toBe(`10/${phaseTaskTotal("sell")} tasks · next 1.3.1`);
  });

  it("rolls onto phase 2 with phase-scoped counts once Sell is complete", () => {
    const s = completePhase(withNamedIdeas(1), 0, "sell");
    expect(currentPhaseFor(s, 0)).toBe("build");
    expect(nextTaskId(s, 0)).toBe("2.1.1");
    expect(ideaProgressLabel(s, 0)).toBe(`0/${phaseTaskTotal("build")} tasks · next 2.1.1`);
  });

  it("reports 'ready for Grow' at the gated frontier (phases 1-3 done, no business)", () => {
    let s = withNamedIdeas(1);
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
    const s = apply(withNamedIdeas(1), { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.1", index: 0 });
    expect(roomEntryFor(s, "1.1")).toEqual({ action: "enter", ideaIndex: 0, index: 1 });
  });

  it("excludes an idea that already finished the criterion", () => {
    let s = withNamedIdeas(2);
    s = completeStep(s, 0, "1.1"); // idea 0 done 1.1 → eligible for 1.2, not 1.1
    // For 1.1: only idea 1 is still eligible → direct enter of idea 1.
    expect(roomEntryFor(s, "1.1")).toEqual({ action: "enter", ideaIndex: 1, index: 0 });
    // For 1.2: only idea 0 is eligible (unlocked, not done).
    expect(roomEntryFor(s, "1.2")).toEqual({ action: "enter", ideaIndex: 0, index: 0 });
  });

  it("re-enters a COMPLETED criterion in review mode (task 1) when no idea is in progress", () => {
    // Completing 1.1 must never orphan the authored productName/oneLiner fields.
    const s = completeStep(withNamedIdeas(1), 0, "1.1");
    expect(roomEntryFor(s, "1.1")).toEqual({ action: "enter", ideaIndex: 0, index: 0 });
  });

  it("keeps in-progress priority: a done idea never displaces one mid-criterion", () => {
    let s = withNamedIdeas(2);
    s = completeStep(s, 0, "1.1");
    s = apply(s, { type: "COMPLETE_TASK", ideaIndex: 1, stepId: "1.1", index: 0 });
    // Idea 1 is mid-1.1 → direct enter of idea 1 at its frontier, exactly as before.
    expect(roomEntryFor(s, "1.1")).toEqual({ action: "enter", ideaIndex: 1, index: 1 });
  });

  it("offers the picker when several DONE ideas could review a criterion", () => {
    let s = withNamedIdeas(2);
    s = completeStep(s, 0, "1.1");
    s = completeStep(s, 1, "1.1");
    expect(roomEntryFor(s, "1.1")).toEqual({ action: "pick", eligible: [0, 1] });
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
    const s = completeStep(withNamedIdeas(1), 0, "1.1");
    expect(nextCoachTarget(s)).toEqual({ kind: "criterion", stepId: "1.2", room: "market" });
  });

  it("prefers the ACTIVE idea's next criterion over other ideas", () => {
    // Two ideas: idea 0 has finished 1.1; idea 1 (active after CREATE_IDEA) has not.
    let s = withNamedIdeas(2);
    s = completeStep(s, 0, "1.1");
    expect(s.activeIdea).toBe(1);
    expect(nextCoachTarget(s)).toEqual({ kind: "criterion", stepId: "1.1", room: "idea" });
  });

  it("STOPS at an unbuilt frontier under a RESTRICTED allowlist (gate machinery pinned)", () => {
    let s = withNamedIdeas(2);
    s = completeStep(completeStep(s, 1, "1.1"), 1, "1.2"); // active idea 1 through 1.2
    // The ENGINE's frontier for the active idea is 1.3 (the curriculum walks on)...
    expect(nextUpFor(s, 1)).toBe("1.3");
    // ...and under the pre-Unit-8 restricted list the coach does NOT point
    // there: it falls back to the other idea's BUILT work. The gate must keep
    // working so a criterion can be pulled back out of BUILT_CRITERIA.
    expect(nextCoachTarget(s, ONLY_11_12)).toEqual({ kind: "criterion", stepId: "1.1", room: "idea" });
    // The shipped default (all 25 built since Unit 8) walks straight on.
    expect(nextCoachTarget(s)).toEqual({ kind: "criterion", stepId: "1.3", room: "market" });
  });

  it("hides entirely at an unbuilt frontier with no other built work (restricted allowlist)", () => {
    const s = completeStep(completeStep(withNamedIdeas(1), 0, "1.1"), 0, "1.2");
    expect(nextUpFor(s, 0)).toBe("1.3"); // engine walks
    expect(nextCoachTarget(s, ONLY_11_12)).toBeNull(); // coach stops at the built frontier
    expect(nextCoachTarget(s)).toEqual({ kind: "criterion", stepId: "1.3", room: "market" });
  });

  it("crosses the phase boundary UNDER THE DEFAULT ALLOWLIST: Sell complete -> 2.1 in the Build Room", () => {
    const s = completePhase(withNamedIdeas(1), 0, "sell");
    expect(nextUpFor(s, 0)).toBe("2.1");
    // Unit 8: 2.1 is a shipped surface, so the DEFAULT coach targets it; the
    // restricted list still hides it (gate proof).
    expect(nextCoachTarget(s)).toEqual({ kind: "criterion", stepId: "2.1", room: "build" });
    expect(nextCoachTarget(s, ONLY_11_12)).toBeNull();
    expect(nextCoachTarget(s, ALL_BUILT)).toEqual({ kind: "criterion", stepId: "2.1", room: "build" });
  });

  it("the default allowlist is BUILT_CRITERIA (ALL 25 criteria since Unit 8)", () => {
    expect([...BUILT_CRITERIA].sort()).toEqual([...CRITERION_SEQUENCE].sort());
    expect(BUILT_CRITERIA.size).toBe(25);
  });

  it("targets the PROMOTION seam once the active idea completes phase 3 (business gate)", () => {
    let s = withNamedIdeas(1);
    s = completePhase(s, 0, "sell");
    s = completePhase(s, 0, "build");
    s = completePhase(s, 0, "validate");
    // Unit 8 consumes this target (the promotion screen); the coach hides on it
    // for now rather than pointing at the locked Grow phase.
    expect(nextCoachTarget(s)).toEqual({ kind: "promote", ideaIndex: 0 });
  });

  it("the promotion seam WINS over another idea's remaining work for the active idea", () => {
    let s = withNamedIdeas(2);
    // Active idea (1) validated end-to-end; idea 0 untouched.
    s = completePhase(s, 1, "sell");
    s = completePhase(s, 1, "build");
    s = completePhase(s, 1, "validate");
    expect(s.activeIdea).toBe(1);
    expect(nextCoachTarget(s)).toEqual({ kind: "promote", ideaIndex: 1 });
  });

  it("the promote target CARRIES the eligible idea's stable id (Unit 7)", () => {
    let s = apply(initialState(), { type: "CREATE_IDEA", ideaId: "idea-a" }, { type: "CLOSE_RUNNER" });
    s = nameIdea(s, 0);
    s = completePhase(s, 0, "sell");
    s = completePhase(s, 0, "build");
    s = completePhase(s, 0, "validate");
    expect(nextCoachTarget(s)).toEqual({ kind: "promote", ideaIndex: 0, ideaId: "idea-a" });
  });
});

describe("floorSelectors — locked-phase entry is a no-op (Unit 6)", () => {
  // These pin the ENGINE's phase gating, so they inject the OPEN allowlist —
  // otherwise the readiness gate would mask what is being tested.
  it("roomEntryFor no-ops on a phase-4 criterion while the business gate is closed", () => {
    let s = withIdeas(1);
    s = completePhase(s, 0, "sell");
    s = completePhase(s, 0, "build");
    s = completePhase(s, 0, "validate");
    expect(roomEntryFor(s, "4.1", ALL_BUILT)).toEqual({ action: "noop" });
    expect(roomEntryFor(s, "5.1", ALL_BUILT)).toEqual({ action: "noop" });
  });

  it("roomEntryFor no-ops on a phase-2 criterion before phase 1 is complete", () => {
    expect(roomEntryFor(withIdeas(1), "2.1", ALL_BUILT)).toEqual({ action: "noop" });
  });

  it("roomEntryFor enters a phase-2 criterion once phase 1 is complete (open allowlist)", () => {
    const s = completePhase(withIdeas(1), 0, "sell");
    expect(roomEntryFor(s, "2.1", ALL_BUILT)).toEqual({ action: "enter", ideaIndex: 0, index: 0 });
  });
});

describe("floorSelectors — content-readiness gate on room entry (BUILT_CRITERIA)", () => {
  it("an ELIGIBLE criterion no-ops under a RESTRICTED allowlist (gate machinery pinned)", () => {
    let s = withIdeas(1);
    s = completeStep(s, 0, "1.1");
    s = completeStep(s, 0, "1.2");
    // The engine says 1.3 is workable; a restricted list still gates the entry
    // (the gate must survive Unit 8 so a surface can be un-shipped again).
    expect(nextUpFor(s, 0)).toBe("1.3");
    expect(roomEntryFor(s, "1.3", ONLY_11_12)).toEqual({ action: "noop" });
    // The shipped default (all 25 built) enters — proof the gate (not the
    // engine) produced the noop above.
    expect(roomEntryFor(s, "1.3")).toEqual({ action: "enter", ideaIndex: 0, index: 0 });
  });

  it("a SCRIPTED walk drives every room entry 1.1 -> 3.5 through roomEntryFor under an open allowlist", () => {
    // FIX-4 coverage: the exact selector the floor uses to open the runner is
    // exercised across the deep sequence (samples span 1.3-3.5 with variable
    // task counts: 2.3 has six tasks, 3.4 has four), not just the built pair.
    let s = withNamedIdeas(1);
    let guard = 0;
    const entered: string[] = [];
    for (;;) {
      const stepId = nextUpFor(s, 0);
      if (!stepId) break;
      if (++guard > 25) throw new Error("walk did not terminate");
      const entry = roomEntryFor(s, stepId, ALL_BUILT);
      expect(entry).toEqual({ action: "enter", ideaIndex: 0, index: 0 });
      entered.push(stepId);
      s = completeStep(s, 0, stepId);
      s = apply(s, { type: "DISMISS_CELEBRATION" });
    }
    // The walk covered all of phases 1-3 and stopped at the business gate.
    expect(entered).toEqual(CRITERION_SEQUENCE.slice(0, 15));
    for (const sample of ["1.3", "1.5", "2.3", "3.4", "3.5"]) {
      expect(entered).toContain(sample);
    }
  });
});

describe("floorSelectors — naming redirect (an unnamed idea always routes to 1.1.1)", () => {
  it("ideaNeedsNaming: true while EITHER field is missing, false once both are set", () => {
    let s = withIdeas(1);
    expect(ideaNeedsNaming(s, 0)).toBe(true);
    s = apply(s, { type: "SET_FIELD", ideaIndex: 0, key: "productName", value: "Recess Bracelets" });
    expect(ideaNeedsNaming(s, 0)).toBe(true); // one-liner still missing
    s = apply(s, { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "Bracelets for recess" });
    expect(ideaNeedsNaming(s, 0)).toBe(false);
  });

  it("trimmed-empty fields count as missing (whitespace is not a name)", () => {
    const s = apply(
      withNamedIdeas(1),
      { type: "SET_FIELD", ideaIndex: 0, key: "productName", value: "   " },
    );
    expect(ideaNeedsNaming(s, 0)).toBe(true);
    expect(nextTaskId(s, 0)).toBe("1.1.1");
  });

  it("is false for an absent idea (no phantom redirects)", () => {
    expect(ideaNeedsNaming(withIdeas(1), 9)).toBe(false);
    expect(ideaNeedsNaming(initialState(), 0)).toBe(false);
  });

  it("nextTaskId pins 1.1.1 for an unnamed idea EVEN WITH 1.1 complete", () => {
    const s = completeStep(withIdeas(1), 0, "1.1");
    expect(nextUpFor(s, 0)).toBe("1.2"); // the ENGINE frontier is untouched
    expect(nextTaskId(s, 0)).toBe("1.1.1"); // the floor redirect wins
  });

  it("nextTaskId pins 1.1.1 for an unnamed idea deep in Sell; naming releases the frontier", () => {
    let s = completeStep(completeStep(withIdeas(1), 0, "1.1"), 0, "1.2");
    expect(nextTaskId(s, 0)).toBe("1.1.1");
    s = nameIdea(s, 0);
    expect(nextTaskId(s, 0)).toBe("1.3.1"); // normal frontier the moment both fields exist
  });

  it("nextTaskId pins 1.1.1 even at the gated business seam (unnamed validated idea)", () => {
    let s = withIdeas(1);
    for (const phase of ["sell", "build", "validate"] as const) s = completePhase(s, 0, phase);
    expect(nextTaskId(s, 0)).toBe("1.1.1"); // named variant reports null (pinned above)
  });

  it("ideaProgressLabel counts Sell and says 'next 1.1.1' for an unnamed idea with 1.1 done", () => {
    const s = completeStep(withIdeas(1), 0, "1.1");
    expect(ideaProgressLabel(s, 0)).toBe(`5/${phaseTaskTotal("sell")} tasks · next 1.1.1`);
    // Named, the same idea reads the normal frontier label.
    expect(ideaProgressLabel(nameIdea(s, 0), 0)).toBe(`5/${phaseTaskTotal("sell")} tasks · next 1.2.1`);
  });

  it("nextCoachTarget sends an unnamed idea to 1.1 (Idea Room) even with 1.1 complete", () => {
    const s = completeStep(withIdeas(1), 0, "1.1");
    expect(nextCoachTarget(s)).toEqual({ kind: "criterion", stepId: "1.1", room: "idea" });
    expect(nextCoachTarget(nameIdea(s, 0))).toEqual({ kind: "criterion", stepId: "1.2", room: "market" });
  });

  it("the naming redirect WINS over the promotion seam for an unnamed validated idea", () => {
    let s = withIdeas(1);
    for (const phase of ["sell", "build", "validate"] as const) s = completePhase(s, 0, phase);
    expect(nextCoachTarget(s)).toEqual({ kind: "criterion", stepId: "1.1", room: "idea" });
    expect(nextCoachTarget(nameIdea(s, 0))).toEqual({ kind: "promote", ideaIndex: 0 });
  });

  it("the coach redirect honors the content-readiness gate like every target", () => {
    const s = completeStep(withIdeas(1), 0, "1.1");
    // 1.1 built (restricted pair) → redirect target; nothing built → no target.
    expect(nextCoachTarget(s, ONLY_11_12)).toEqual({ kind: "criterion", stepId: "1.1", room: "idea" });
    expect(nextCoachTarget(s, new Set())).toBeNull();
  });

  it("roomEntryFor(1.1) enters the ONE unnamed idea at task index 0, even when its 1.1 is done", () => {
    let s = completeStep(withNamedIdeas(2), 0, "1.1");
    // Un-name idea 0 (it finished 1.1 but lost its one-liner to an edit).
    s = apply(s, { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "" });
    expect(roomEntryFor(s, "1.1")).toEqual({ action: "enter", ideaIndex: 0, index: 0 });
  });

  it("roomEntryFor(1.1) offers the picker when SEVERAL ideas still need naming", () => {
    const s = completeStep(withIdeas(2), 0, "1.1"); // both unnamed, one done
    expect(roomEntryFor(s, "1.1")).toEqual({ action: "pick", eligible: [0, 1] });
  });

  it("roomEntryFor for criteria other than 1.1 is untouched by the redirect", () => {
    const s = completeStep(withIdeas(1), 0, "1.1"); // unnamed, eligible for 1.2
    expect(roomEntryFor(s, "1.2")).toEqual({ action: "enter", ideaIndex: 0, index: 0 });
  });
});
