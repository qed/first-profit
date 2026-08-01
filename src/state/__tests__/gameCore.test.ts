import { describe, expect, it } from "vitest";
import { STEPS, parseTask, stepById } from "../../data/path";
import {
  DOC_VERSION,
  MAX_IDEAS,
  PLAYABLE_STEPS,
  type Action,
  type GameState,
  backingSumCents,
  fromSaveDoc,
  ideasEligibleFor,
  initialState,
  isCriterionDone,
  isIdeaEligibleFor,
  isStepUnlocked,
  isTaskDone,
  nextUpFor,
  reducer,
  salesSumCents,
  sellProgress,
  stepPips,
  taskKey,
  toSaveDoc,
} from "../gameCore";

/** Apply a sequence of actions to a starting state. */
function apply(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce(reducer, state);
}

/** Look up a step, throwing if absent (keeps tests free of non-null assertions). */
function getStep(id: string) {
  const step = stepById(id);
  if (!step) throw new Error(`no step ${id}`);
  return step;
}

/** A state with a single onboarding-seeded idea (idea #0), runner reset. */
function withOneIdea(): GameState {
  return apply(initialState(), { type: "CREATE_IDEA" }, { type: "CLOSE_RUNNER" });
}

/** Complete every task of a criterion for an idea. */
function completeCriterion(state: GameState, ideaIndex: number, stepId: string): GameState {
  const step = stepById(stepId);
  if (!step) throw new Error(`no step ${stepId}`);
  return step.tasks.reduce(
    (acc, _task, index) => reducer(acc, { type: "COMPLETE_TASK", ideaIndex, stepId, index }),
    state,
  );
}

const LAST_1_2_INDEX = getStep("1.2").tasks.length - 1;

describe("initialState", () => {
  it("boots with no ideas and the current doc version", () => {
    const s = initialState();
    expect(s.stage).toBe("boot");
    expect(s.ideas).toEqual([]);
    expect(s.ledger).toEqual([]);
    expect(s.docVersion).toBe(DOC_VERSION);
    expect(s.onboardingComplete).toBe(false);
  });
});

describe("CREATE_IDEA", () => {
  it("appends {fields:{},done:{}}, sets it active, opens the runner at 1.1.1", () => {
    const s = reducer(initialState(), { type: "CREATE_IDEA" });
    expect(s.ideas).toHaveLength(1);
    expect(s.ideas[0]).toEqual({ fields: {}, done: {} });
    expect(s.activeIdea).toBe(0);
    expect(s.runnerOpen).toBe(true);
    expect(s.runnerStep).toBe("1.1");
    expect(s.runnerIndex).toBe(0);
  });

  it("creating idea #2 appends, sets it active, and re-opens the runner at 1.1.1", () => {
    const s = apply(
      initialState(),
      { type: "CREATE_IDEA" },
      { type: "CLOSE_RUNNER" },
      { type: "CREATE_IDEA" },
    );
    expect(s.ideas).toHaveLength(2);
    expect(s.ideas[1]).toEqual({ fields: {}, done: {} });
    expect(s.activeIdea).toBe(1);
    expect(s.runnerOpen).toBe(true);
    expect(s.runnerStep).toBe("1.1");
  });

  it("refuses a 6th idea and leaves state untouched", () => {
    let s = initialState();
    for (let i = 0; i < MAX_IDEAS; i++) s = reducer(s, { type: "CREATE_IDEA" });
    expect(s.ideas).toHaveLength(MAX_IDEAS);
    const sixth = reducer(s, { type: "CREATE_IDEA" });
    expect(sixth).toBe(s);
    expect(sixth.ideas).toHaveLength(MAX_IDEAS);
  });
});

describe("completing 1.1", () => {
  it("marks the criterion done, unlocks 1.2, and fires the celebration", () => {
    let s = withOneIdea();
    const step = getStep("1.1");
    // Celebration only on the final task, not before.
    for (let i = 0; i < step.tasks.length - 1; i++) {
      s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.1", index: i });
      expect(s.celebrate).toBeNull();
      expect(isCriterionDone(s, 0, "1.1")).toBe(false);
    }
    s = reducer(s, {
      type: "COMPLETE_TASK",
      ideaIndex: 0,
      stepId: "1.1",
      index: step.tasks.length - 1,
    });
    expect(isCriterionDone(s, 0, "1.1")).toBe(true);
    expect(s.celebrate).toBe("1.1");
    // 1.2 is now the next-up criterion and its room is unlocked.
    expect(nextUpFor(s, 0)).toBe("1.2");
    expect(isStepUnlocked(s, 0, "1.2")).toBe(true);
  });

  it("stores task completion under the `${stepId}#${index}` key", () => {
    const s = reducer(withOneIdea(), {
      type: "COMPLETE_TASK",
      ideaIndex: 0,
      stepId: "1.1",
      index: 2,
    });
    expect(s.ideas[0].done[taskKey("1.1", 2)]).toBe(true);
    expect(isTaskDone(s, 0, "1.1", 2)).toBe(true);
  });
});

describe("celebration takes over from the runner (no dual modal / terminal trap)", () => {
  it("completing a criterion's last task closes the runner and sets celebrate", () => {
    const s = completeCriterion(withOneIdea(), 0, "1.1");
    expect(s.celebrate).toBe("1.1");
    // Runner must be closed so the celebration is the only fixed modal on screen.
    expect(s.runnerOpen).toBe(false);
  });

  it("DISMISS_CELEBRATION re-opens the runner on the next step's first incomplete task", () => {
    let s = completeCriterion(withOneIdea(), 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    expect(s.celebrate).toBeNull();
    expect(s.runnerOpen).toBe(true);
    expect(s.runnerStep).toBe("1.2");
    expect(s.runnerIndex).toBe(0);
  });

  it("DISMISS_CELEBRATION on the FINAL criterion leaves the runner closed (back to floor)", () => {
    let s = completeCriterion(withOneIdea(), 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" }); // now on 1.2
    s = completeCriterion(s, 0, "1.2"); // finish the last playable criterion
    expect(s.celebrate).toBe("1.2");
    expect(s.runnerOpen).toBe(false);
    expect(nextUpFor(s, 0)).toBeNull();
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    expect(s.celebrate).toBeNull();
    // No next step → do NOT drop the user back into the runner on a done task.
    expect(s.runnerOpen).toBe(false);
  });
});

describe("ADD_LEDGER", () => {
  it("a sale adds a kind:'sale' row and auto-completes the last task of 1.2", () => {
    // Reach 1.2 with its first tasks done, last task pending.
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    for (let i = 0; i < LAST_1_2_INDEX; i++) {
      s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.2", index: i });
    }
    expect(isCriterionDone(s, 0, "1.2")).toBe(false);

    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-1",
      kind: "sale",
      payer: "Nadia",
      amountCents: 1500,
      createdAt: "2026-07-31T00:00:00.000Z",
    });
    expect(s.ledger).toHaveLength(1);
    expect(s.ledger[0].kind).toBe("sale");
    // Last task of 1.2 is now complete and the 1.2 celebration fired.
    expect(isTaskDone(s, 0, "1.2", LAST_1_2_INDEX)).toBe(true);
    expect(isCriterionDone(s, 0, "1.2")).toBe(true);
    expect(s.celebrate).toBe("1.2");
    expect(salesSumCents(s)).toBe(1500);
  });

  it("a checkout backing adds a kind:'backing' row and completes no task", () => {
    const s = reducer(withOneIdea(), {
      type: "ADD_LEDGER",
      id: "back-1",
      kind: "backing",
      payer: "Helen",
      amountCents: 2500,
      createdAt: "2026-07-31T00:01:00.000Z",
    });
    expect(s.ledger).toHaveLength(1);
    expect(s.ledger[0].kind).toBe("backing");
    expect(backingSumCents(s)).toBe(2500);
    expect(isCriterionDone(s, 0, "1.2")).toBe(false);
  });

  it("a sale before 1.2 is unlocked appends the row but completes no task", () => {
    // withOneIdea has 1.1 incomplete, so 1.2 is locked for idea #0.
    const s = withOneIdea();
    expect(isStepUnlocked(s, 0, "1.2")).toBe(false);
    const after = reducer(s, {
      type: "ADD_LEDGER",
      id: "stray-sale",
      kind: "sale",
      payer: "Drew",
      amountCents: 900,
      createdAt: "2026-07-31T00:03:00.000Z",
    });
    // Ledger row lands, but the idea's done map is untouched (referentially).
    expect(after.ledger).toHaveLength(1);
    expect(after.ideas[0]).toBe(s.ideas[0]);
    expect(after.ideas[0].done).toEqual({});
    expect(isTaskDone(after, 0, "1.2", LAST_1_2_INDEX)).toBe(false);
    expect(after.celebrate).toBeNull();
  });

  it("is idempotent on ledger id (retried inserts do not double-append)", () => {
    const row: Extract<Action, { type: "ADD_LEDGER" }> = {
      type: "ADD_LEDGER",
      id: "dup",
      kind: "backing",
      payer: "Sam",
      amountCents: 1000,
      createdAt: "2026-07-31T00:02:00.000Z",
    };
    const s = apply(withOneIdea(), row, row);
    expect(s.ledger).toHaveLength(1);
  });
});

describe("idea eligibility (room click)", () => {
  it("one eligible idea -> auto-select set of size 1", () => {
    const s = withOneIdea();
    expect(ideasEligibleFor(s, "1.1")).toEqual([0]);
  });

  it("two eligible ideas -> picker set of size 2", () => {
    const s = apply(
      initialState(),
      { type: "CREATE_IDEA" },
      { type: "CLOSE_RUNNER" },
      { type: "CREATE_IDEA" },
      { type: "CLOSE_RUNNER" },
    );
    expect(ideasEligibleFor(s, "1.1")).toEqual([0, 1]);
  });

  it("no eligible idea -> empty set (no-op)", () => {
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = completeCriterion(s, 0, "1.2");
    // Both playable criteria done -> eligible for neither.
    expect(ideasEligibleFor(s, "1.1")).toEqual([]);
    expect(ideasEligibleFor(s, "1.2")).toEqual([]);
  });

  it("1.2 is only eligible once 1.1 is complete for that idea", () => {
    let s = withOneIdea();
    expect(isIdeaEligibleFor(s, 0, "1.2")).toBe(false);
    s = completeCriterion(s, 0, "1.1");
    expect(isIdeaEligibleFor(s, 0, "1.2")).toBe(true);
  });
});

describe("@artifact auto-complete convention", () => {
  it("no 1.1/1.2 task is @artifact-prefixed, so plain done drives completion", () => {
    for (const stepId of PLAYABLE_STEPS) {
      const step = getStep(stepId);
      for (const raw of step.tasks) {
        expect(parseTask(raw).auto).toBeUndefined();
      }
    }
  });
});

describe("stale-event tolerance (out-of-range idea index)", () => {
  it("COMPLETE_TASK on a non-existent idea is ignored", () => {
    const s = withOneIdea();
    const after = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 5, stepId: "1.1", index: 0 });
    expect(after).toBe(s);
  });

  it("SET_FIELD on a non-existent idea is ignored", () => {
    const s = withOneIdea();
    const after = reducer(s, { type: "SET_FIELD", ideaIndex: 9, key: "oneLiner", value: "x" });
    expect(after).toBe(s);
  });

  it("SET_ACTIVE_IDEA to a non-existent idea is ignored", () => {
    const s = withOneIdea();
    const after = reducer(s, { type: "SET_ACTIVE_IDEA", ideaIndex: 3 });
    expect(after).toBe(s);
  });

  it("COMPLETE_TASK with an out-of-range task index is a referential no-op", () => {
    const s = withOneIdea();
    const tooHigh = reducer(s, {
      type: "COMPLETE_TASK",
      ideaIndex: 0,
      stepId: "1.1",
      index: getStep("1.1").tasks.length,
    });
    expect(tooHigh).toBe(s);
    const negative = reducer(s, {
      type: "COMPLETE_TASK",
      ideaIndex: 0,
      stepId: "1.1",
      index: -1,
    });
    expect(negative).toBe(s);
  });

  it("COMPLETE_TASK with an unknown stepId is a referential no-op", () => {
    const s = withOneIdea();
    const after = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "9.9", index: 0 });
    expect(after).toBe(s);
  });
});

describe("OPEN_RUNNER", () => {
  it("honors an explicit stepId and index", () => {
    const s = reducer(withOneIdea(), { type: "OPEN_RUNNER", stepId: "1.2", index: 3 });
    expect(s.runnerOpen).toBe(true);
    expect(s.runnerStep).toBe("1.2");
    expect(s.runnerIndex).toBe(3);
  });

  it("falls back to nextUpFor when no stepId is given and a criterion is incomplete", () => {
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "OPEN_RUNNER" });
    expect(s.runnerStep).toBe("1.2");
    expect(s.runnerIndex).toBe(0);
  });

  it("falls back to the first playable criterion when all criteria are done", () => {
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = completeCriterion(s, 0, "1.2");
    expect(nextUpFor(s, 0)).toBeNull();
    s = reducer(s, { type: "OPEN_RUNNER" });
    expect(s.runnerStep).toBe(PLAYABLE_STEPS[0]);
  });
});

describe("immutability", () => {
  it("COMPLETE_TASK / SET_FIELD / ADD_LEDGER do not mutate the prior object graph", () => {
    const s = withOneIdea();
    const ideaSnapshot = structuredClone(s.ideas[0]);
    const priorIdeaRef = s.ideas[0];

    const afterComplete = reducer(s, {
      type: "COMPLETE_TASK",
      ideaIndex: 0,
      stepId: "1.1",
      index: 0,
    });
    expect(s.ideas[0]).toEqual(ideaSnapshot);
    expect(s.ideas[0]).toBe(priorIdeaRef);
    expect(afterComplete.ideas[0]).not.toBe(priorIdeaRef);

    const afterField = reducer(s, {
      type: "SET_FIELD",
      ideaIndex: 0,
      key: "oneLiner",
      value: "hi",
    });
    expect(s.ideas[0]).toEqual(ideaSnapshot);
    expect(afterField.ideas[0]).not.toBe(priorIdeaRef);

    const ledgerSnapshot = structuredClone(s.ledger);
    const afterLedger = reducer(s, {
      type: "ADD_LEDGER",
      id: "imm-1",
      kind: "backing",
      payer: "Q",
      amountCents: 100,
      createdAt: "2026-07-31T00:04:00.000Z",
    });
    expect(s.ledger).toEqual(ledgerSnapshot);
    expect(afterLedger.ledger).not.toBe(s.ledger);
  });
});

describe("field + misc reducer actions", () => {
  it("SET_FIELD writes idea-scoped answers", () => {
    const s = reducer(withOneIdea(), {
      type: "SET_FIELD",
      ideaIndex: 0,
      key: "oneLiner",
      value: "Friendship bracelets",
    });
    expect(s.ideas[0].fields.oneLiner).toBe("Friendship bracelets");
  });

  it("SET_PROFILE patches, SET_STAGE / SET_OB set, avatar + checkout + room toggle", () => {
    let s = initialState();
    s = reducer(s, { type: "SET_PROFILE", patch: { firstName: "Cedric" } });
    s = reducer(s, { type: "SET_PROFILE", patch: { handle: "cedric" } });
    expect(s.profile).toEqual({ firstName: "Cedric", handle: "cedric", siteHeadline: "" });
    s = reducer(s, { type: "SET_STAGE", stage: "app" });
    expect(s.stage).toBe("app");
    s = reducer(s, { type: "SET_OB", ob: 4 });
    expect(s.ob).toBe(4);
    s = reducer(s, { type: "SET_AVATAR", x: 20, y: 30 });
    expect(s.avatar).toEqual({ x: 20, y: 30 });
    s = reducer(s, { type: "OPEN_CHECKOUT" });
    expect(s.checkoutOpen).toBe(true);
    s = reducer(s, { type: "CLOSE_CHECKOUT" });
    expect(s.checkoutOpen).toBe(false);
    s = reducer(s, { type: "OPEN_ROOM", room: "idea" });
    expect(s.room).toBe("idea");
    s = reducer(s, { type: "CLOSE_ROOM" });
    expect(s.room).toBeNull();
    s = reducer(s, { type: "SET_PICK_FOR", pickFor: "1.1" });
    expect(s.pickFor).toBe("1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    expect(s.celebrate).toBeNull();
  });
});

describe("selectors: pips and progress", () => {
  it("stepPips reflects per-task completion", () => {
    let s = withOneIdea();
    s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.1", index: 0 });
    const pips = stepPips(s, 0, "1.1");
    expect(pips).toHaveLength(getStep("1.1").tasks.length);
    expect(pips[0]).toBe(true);
    expect(pips[1]).toBe(false);
  });

  it("sellProgress counts across 1.1 + 1.2 using real path.ts task counts", () => {
    const total = getStep("1.1").tasks.length + getStep("1.2").tasks.length;
    let s = withOneIdea();
    expect(sellProgress(s, 0)).toEqual({ done: 0, total });
    s = completeCriterion(s, 0, "1.1");
    expect(sellProgress(s, 0)).toEqual({ done: getStep("1.1").tasks.length, total });
  });
});

describe("selectors: ledger sums", () => {
  it("count only their own kind, and empty ledger sums to 0", () => {
    expect(backingSumCents(withOneIdea())).toBe(0);
    expect(salesSumCents(withOneIdea())).toBe(0);

    // Reach a state where a sale is allowed (1.1 complete) so both kinds land.
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "b1",
      kind: "backing",
      payer: "A",
      amountCents: 2500,
      createdAt: "2026-07-31T00:05:00.000Z",
    });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "s1",
      kind: "sale",
      payer: "B",
      amountCents: 1500,
      createdAt: "2026-07-31T00:06:00.000Z",
    });
    expect(backingSumCents(s)).toBe(2500);
    expect(salesSumCents(s)).toBe(1500);
  });
});

describe("RESET_SESSION (shared-device state clear)", () => {
  it("clears ideas, ledger, and UI but keeps stage + profile, and stays usable", () => {
    let s = withOneIdea();
    s = reducer(s, { type: "SET_STAGE", stage: "app" });
    s = reducer(s, { type: "SET_PROFILE", patch: { firstName: "Ada", handle: "ada" } });
    s = reducer(s, { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "Bracelets" });
    s = reducer(s, { type: "OPEN_ROOM", room: "market" });
    s = reducer(s, { type: "OPEN_RUNNER", stepId: "1.1", index: 2 });
    s = reducer(s, { type: "OPEN_CHECKOUT" });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "l1",
      kind: "backing",
      payer: "Pat",
      amountCents: 2500,
      createdAt: "2026-07-31T00:00:00.000Z",
    });

    const reset = reducer(s, { type: "RESET_SESSION" });

    // Business/financial + UI state is gone.
    expect(reset.ideas).toEqual([]);
    expect(reset.ledger).toEqual([]);
    expect(reset.activeIdea).toBe(0);
    expect(reset.pickFor).toBeNull();
    expect(reset.runnerOpen).toBe(false);
    expect(reset.runnerStep).toBeNull();
    expect(reset.runnerIndex).toBe(0);
    expect(reset.celebrate).toBeNull();
    expect(reset.room).toBeNull();
    expect(reset.checkoutOpen).toBe(false);
    expect(reset.avatar).toEqual(initialState().avatar);

    // Caller-controlled fields are preserved for the provider to overwrite.
    expect(reset.stage).toBe("app");
    expect(reset.profile).toEqual({ firstName: "Ada", handle: "ada", siteHeadline: "" });

    // The reducer remains usable afterwards.
    const revived = reducer(reset, { type: "CREATE_IDEA" });
    expect(revived.ideas).toHaveLength(1);
  });
});

describe("HYDRATE resets the session ledger", () => {
  it("empties an existing ledger even when hydrating onto populated state", () => {
    let s = withOneIdea();
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "l1",
      kind: "sale",
      payer: "Prior child",
      amountCents: 5000,
      createdAt: "2026-07-31T00:00:00.000Z",
    });
    expect(s.ledger).toHaveLength(1);

    const doc = toSaveDoc(withOneIdea());
    const hydrated = reducer(s, { type: "HYDRATE", doc });
    expect(hydrated.ledger).toEqual([]);
  });
});

describe("serialization round-trip", () => {
  it("initial -> acts -> toSaveDoc -> fromSaveDoc -> HYDRATE preserves persistent state", () => {
    let s = withOneIdea();
    s = reducer(s, {
      type: "SET_FIELD",
      ideaIndex: 0,
      key: "oneLiner",
      value: "Custom bracelets",
    });
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    s = reducer(s, { type: "SET_PROFILE", patch: { siteHeadline: "My first company" } });
    s = reducer(s, { type: "CREATE_IDEA" });
    s = reducer(s, { type: "SET_STAGE", stage: "app" });
    // A ledger row that must NOT appear in the save doc.
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "l1",
      kind: "backing",
      payer: "Pat",
      amountCents: 1000,
      createdAt: "2026-07-31T00:00:00.000Z",
    });

    const doc = toSaveDoc(s);
    expect(doc).not.toHaveProperty("ledger");
    expect(doc.docVersion).toBe(DOC_VERSION);

    const parsed = fromSaveDoc(JSON.parse(JSON.stringify(doc)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const hydrated = reducer(initialState(), { type: "HYDRATE", doc: parsed.doc });
    expect(hydrated.ideas).toEqual(s.ideas);
    expect(hydrated.activeIdea).toBe(s.activeIdea);
    expect(hydrated.profile.siteHeadline).toBe("My first company");
    expect(hydrated.onboardingComplete).toBe(s.onboardingComplete);
    // Ledger is session-only, not restored from the save doc.
    expect(hydrated.ledger).toEqual([]);
    // Incomplete onboarding routes to the onboarding stage.
    expect(hydrated.onboardingComplete).toBe(false);
    expect(hydrated.stage).toBe("onboard");
    // Completed onboarding routes straight to the app.
    const done = reducer(initialState(), {
      type: "HYDRATE",
      doc: { ...parsed.doc, onboardingComplete: true },
    });
    expect(done.stage).toBe("app");
  });

  it("signals discard for an unknown or absent docVersion", () => {
    expect(fromSaveDoc({ docVersion: 99, ideas: [], activeIdea: 0 })).toEqual({
      ok: false,
      reason: "unknown-version",
    });
    expect(fromSaveDoc({ ideas: [], activeIdea: 0 }).ok).toBe(false);
    expect(fromSaveDoc(null).ok).toBe(false);
    expect(fromSaveDoc("nonsense").ok).toBe(false);
  });
});

describe("path.ts sanity (handoff copy rules)", () => {
  it("1.1 is worth 60 XP and 1.2 is worth 120 XP", () => {
    expect(getStep("1.1").xp).toBe(60);
    expect(getStep("1.2").xp).toBe(120);
  });

  it("1.1/1.2 copy carries no em dashes", () => {
    for (const stepId of PLAYABLE_STEPS) {
      const step = getStep(stepId);
      const copy = [step.title, step.brief, step.doneWhen, step.coach, ...step.tasks].join(" ");
      expect(copy).not.toContain("—");
    }
  });

  it("STEPS export is intact", () => {
    expect(STEPS.length).toBeGreaterThan(0);
  });
});
