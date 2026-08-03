import { describe, expect, it } from "vitest";
import { STEPS, parseTask, stepById } from "../../data/path";
import {
  CRITERION_SEQUENCE,
  DOC_VERSION,
  MAX_IDEAS,
  type Action,
  type GameState,
  activeBusiness,
  activeBusinessExists,
  businessFor,
  criterionIdsForPhase,
  fromSaveDoc,
  grossSalesSumCents,
  ideasEligibleFor,
  initialState,
  isCriterionDone,
  isIdeaEligibleFor,
  isPhaseComplete,
  isPhaseUnlocked,
  isStepUnlocked,
  isTaskDone,
  nextUpFor,
  normalizeBusinesses,
  phaseProgress,
  reducer,
  unionCompletionMaps,
  salesSumCents,
  stepPips,
  taskKey,
  toSaveDoc,
  totalXp,
  xpFor,
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

/** Complete every criterion of a phase, in order, for an idea. */
function completePhase(
  state: GameState,
  ideaIndex: number,
  phase: Parameters<typeof criterionIdsForPhase>[0],
): GameState {
  return criterionIdsForPhase(phase).reduce(
    (acc, stepId) => completeCriterion(acc, ideaIndex, stepId),
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

  it("DISMISS_CELEBRATION after 1.2 rolls onto 1.3 (the sequence continues past the old playable pair)", () => {
    let s = completeCriterion(withOneIdea(), 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" }); // now on 1.2
    s = completeCriterion(s, 0, "1.2");
    expect(s.celebrate).toBe("1.2");
    expect(s.runnerOpen).toBe(false);
    // Unit 6: 1.3 is next-up now — the path no longer dead-ends at 1.2.
    expect(nextUpFor(s, 0)).toBe("1.3");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    expect(s.celebrate).toBeNull();
    expect(s.runnerOpen).toBe(true);
    expect(s.runnerStep).toBe("1.3");
  });

  it("DISMISS_CELEBRATION at the GATED frontier (3.5 done, no business) leaves the runner closed", () => {
    let s = withOneIdea();
    s = completePhase(s, 0, "sell");
    s = completePhase(s, 0, "build");
    s = completePhase(s, 0, "validate");
    expect(s.celebrate).toBe("3.5");
    expect(s.runnerOpen).toBe(false);
    // Phase 4 waits on the business seam → no workable next step.
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

  it("a mock sale (mock:true) lands in the ledger/HUD but does NOT complete 1.2 or celebrate", () => {
    // REAL in-game state the Checkout Booth mock is reachable at: 1.1 done, 1.2
    // unlocked but NOT complete, an active idea. This is the path the mock's
    // "Invest in me -> Pay" hits — it must preserve pre-Unit-3 `backing` behavior
    // (row lands + HUD updates) without firing the real first sale.
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    for (let i = 0; i < LAST_1_2_INDEX; i++) {
      s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.2", index: i });
    }
    expect(isStepUnlocked(s, 0, "1.2")).toBe(true);
    expect(isCriterionDone(s, 0, "1.2")).toBe(false);
    const before = s.ideas[0];

    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "mock-pay",
      kind: "sale",
      mock: true,
      payer: "A backer",
      amountCents: 2500,
      createdAt: "2026-07-31T00:04:00.000Z",
    });
    // Row + HUD stat land (cosmetic success preserved)...
    expect(s.ledger).toHaveLength(1);
    expect(salesSumCents(s)).toBe(2500);
    // ...but 1.2's final pip stays dark and no first-sale celebration fires.
    expect(isTaskDone(s, 0, "1.2", LAST_1_2_INDEX)).toBe(false);
    expect(isCriterionDone(s, 0, "1.2")).toBe(false);
    expect(s.celebrate).toBeNull();
    expect(s.ideas[0]).toBe(before); // done map untouched (referentially)
  });

  it("a bare sale row defaults its fee snapshot (gross=net=amount, fee=0, provider=null)", () => {
    // Reach a state where a sale is allowed (1.1 complete) but is NOT the 1.2
    // completing sale, so we can inspect the defaulted fee fields on the row.
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-bare",
      kind: "sale",
      payer: "Helen",
      amountCents: 2500,
      createdAt: "2026-07-31T00:01:00.000Z",
    });
    const row = s.ledger[0];
    expect(row.kind).toBe("sale");
    expect(row.grossCents).toBe(2500);
    expect(row.feeCents).toBe(0);
    expect(row.netCents).toBe(2500);
    expect(row.providerId).toBeNull();
  });

  it("carries a supplied fee snapshot through onto the row", () => {
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-fee",
      kind: "sale",
      payer: "Nadia",
      amountCents: 2000,
      grossCents: 2000,
      feeCents: 88,
      netCents: 1912,
      providerId: "replit",
      createdAt: "2026-07-31T00:02:00.000Z",
    });
    expect(s.ledger[0]).toMatchObject({
      grossCents: 2000,
      feeCents: 88,
      netCents: 1912,
      providerId: "replit",
    });
    // Net (fee felt) drives salesSumCents; gross is exposed separately.
    expect(salesSumCents(s)).toBe(1912);
    expect(grossSalesSumCents(s)).toBe(2000);
  });

  it("models a REAL sale through the chosen provider (Replit): gross/fee/net/providerId snapshot", () => {
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    s = reducer(s, { type: "SET_PROVIDER", providerId: "replit", chosenAt: 1 });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-replit",
      kind: "sale",
      payer: "Nadia",
      amountCents: 2000,
      grossCents: 2000,
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    const row = s.ledger[0];
    expect(row.grossCents).toBe(2000);
    expect(row.feeCents).toBe(88); // floor(2000*290/10000)=58 + 30 flat
    expect(row.netCents).toBe(1912);
    expect(row.providerId).toBe("replit");
    // Sums: net drives salesSumCents, gross drives grossSalesSumCents.
    expect(salesSumCents(s)).toBe(1912);
    expect(grossSalesSumCents(s)).toBe(2000);
  });

  it("models a REAL sale through First Profit Pay (50%): fee 1000, net 1000 on a $20 sale", () => {
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    s = reducer(s, { type: "SET_PROVIDER", providerId: "first_profit_pay", chosenAt: 1 });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-fpp",
      kind: "sale",
      payer: "Nadia",
      amountCents: 2000,
      grossCents: 2000,
      createdAt: "2026-08-02T00:01:00.000Z",
    });
    const row = s.ledger[0];
    expect(row.feeCents).toBe(1000);
    expect(row.netCents).toBe(1000);
    expect(row.providerId).toBe("first_profit_pay");
    expect(salesSumCents(s)).toBe(1000);
  });

  it("with NO provider chosen a real sale is un-modeled (fee 0, net = gross, provider null)", () => {
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    // No SET_PROVIDER: the reducer stays safe (the UI routes to choose first).
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-noprov",
      kind: "sale",
      payer: "Helen",
      amountCents: 2000,
      grossCents: 2000,
      createdAt: "2026-08-02T00:02:00.000Z",
    });
    const row = s.ledger[0];
    expect(row.feeCents).toBe(0);
    expect(row.netCents).toBe(2000);
    expect(row.providerId).toBeNull();
    expect(salesSumCents(s)).toBe(2000);
  });

  it("a modeled REAL sale still auto-completes 1.2's last task and fires the celebration", () => {
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    for (let i = 0; i < LAST_1_2_INDEX; i++) {
      s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.2", index: i });
    }
    s = reducer(s, { type: "SET_PROVIDER", providerId: "replit", chosenAt: 1 });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-completes",
      kind: "sale",
      payer: "Nadia",
      amountCents: 2000,
      grossCents: 2000,
      createdAt: "2026-08-02T00:03:00.000Z",
    });
    expect(isTaskDone(s, 0, "1.2", LAST_1_2_INDEX)).toBe(true);
    expect(isCriterionDone(s, 0, "1.2")).toBe(true);
    expect(s.celebrate).toBe("1.2");
    // The completing sale is still fee-modeled (net felt).
    expect(s.ledger[0].feeCents).toBe(88);
    expect(salesSumCents(s)).toBe(1912);
  });

  it("DURABILITY: the modeled row carries the full gross/fee/net/provider snapshot sync persists (gross = fee + net)", () => {
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    s = reducer(s, { type: "SET_PROVIDER", providerId: "shopify", chosenAt: 1 });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-durable",
      kind: "sale",
      payer: "Nadia",
      amountCents: 1337,
      grossCents: 1337,
      createdAt: "2026-08-02T00:05:00.000Z",
    });
    const row = s.ledger[0];
    // Every field notifyLedger -> insertLedger forwards is present on the row...
    expect(row.grossCents).toBeDefined();
    expect(row.feeCents).toBeDefined();
    expect(row.netCents).toBeDefined();
    expect(row.providerId).toBe("shopify");
    // ...and the fee-snapshot invariant holds (computeFee guarantee).
    expect((row.grossCents ?? 0)).toBe((row.feeCents ?? 0) + (row.netCents ?? 0));
  });

  it("HONORS a full explicit snapshot even when a DIFFERENT provider is chosen (idempotent-replay durability)", () => {
    // Durability/idempotent-replay contract: when a caller supplies a COMPLETE
    // fee snapshot (feeCents AND netCents), the reducer takes it verbatim and
    // does NOT recompute — even if the currently chosen provider differs. This
    // is what lets a persisted row replay identically regardless of the live
    // chosenProvider. Here the chosen provider is Shopify, but the row carries a
    // First Profit Pay (50%) snapshot; the reducer must keep the FPP numbers.
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    s = reducer(s, { type: "SET_PROVIDER", providerId: "shopify", chosenAt: 1 });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-honored-snapshot",
      kind: "sale",
      payer: "Nadia",
      amountCents: 2000,
      grossCents: 2000,
      feeCents: 1000,
      netCents: 1000,
      providerId: "first_profit_pay",
      createdAt: "2026-08-02T00:06:00.000Z",
    });
    const row = s.ledger[0];
    // Supplied snapshot is honored verbatim...
    expect(row.feeCents).toBe(1000);
    expect(row.netCents).toBe(1000);
    expect(row.providerId).toBe("first_profit_pay");
    // ...and specifically was NOT recomputed via the chosen provider (Shopify:
    // floor(2000*290/10000)=58 + 30 flat = 88, net 1912, providerId 'shopify').
    expect(row.feeCents).not.toBe(88);
    expect(row.providerId).not.toBe("shopify");
    // Invariant holds on the honored snapshot.
    expect((row.grossCents ?? 0)).toBe((row.feeCents ?? 0) + (row.netCents ?? 0));
  });

  it("DISCARDS a PARTIAL snapshot (feeCents without netCents) and RECOMPUTES via the chosen provider", () => {
    // A snapshot is all-or-nothing. A partial one (feeCents supplied, netCents
    // omitted) is NOT trusted: the reducer falls through to modeling the sale
    // via the chosen provider (Replit), discarding the bogus partial fee, so
    // gross = fee + net can never be broken by a half-supplied snapshot.
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    s = reducer(s, { type: "SET_PROVIDER", providerId: "replit", chosenAt: 1 });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-partial-snapshot",
      kind: "sale",
      payer: "Nadia",
      amountCents: 2000,
      grossCents: 2000,
      feeCents: 9999, // bogus partial (no netCents) -> must be discarded
      createdAt: "2026-08-02T00:07:00.000Z",
    });
    const row = s.ledger[0];
    // Recomputed via computeFee(2000, replit) = { fee 88, net 1912 }, NOT 9999.
    expect(row.feeCents).toBe(88);
    expect(row.netCents).toBe(1912);
    expect(row.providerId).toBe("replit");
    expect(row.feeCents).not.toBe(9999);
    // Invariant restored by the recompute.
    expect((row.grossCents ?? 0)).toBe((row.feeCents ?? 0) + (row.netCents ?? 0));
  });

  it("a mock sale is never fee-modeled even with a provider chosen", () => {
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    s = reducer(s, { type: "SET_PROVIDER", providerId: "replit", chosenAt: 1 });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "mock-with-provider",
      kind: "sale",
      mock: true,
      payer: "A backer",
      amountCents: 2000,
      grossCents: 2000,
      createdAt: "2026-08-02T00:04:00.000Z",
    });
    const row = s.ledger[0];
    expect(row.feeCents).toBe(0);
    expect(row.netCents).toBe(2000);
    expect(row.providerId).toBeNull();
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
      kind: "sale",
      payer: "Sam",
      amountCents: 1000,
      createdAt: "2026-07-31T00:02:00.000Z",
    };
    const s = apply(withOneIdea(), row, row);
    expect(s.ledger).toHaveLength(1);
  });
});

describe("ADD_LEDGER partial snapshot keeps gross = fee + net (no provider)", () => {
  // PP2 whole-branch review. The un-modeled else-branch used to default
  // feeCents/netCents INDEPENDENTLY, so a PARTIAL snapshot (exactly one of
  // feeCents/netCents supplied) with NO chosenProvider (and not mock) produced an
  // incoherent row (gross != fee + net) that the fp_ledger coherence CHECK would
  // reject and the outbox would terminally drop. The fix derives the omitted half
  // from gross. `withOneIdea()` leaves 1.2 locked, so the sale simply lands as
  // ledger[0] with no completion machinery in the way.
  it("only feeCents supplied -> netCents derived as gross - fee (coherent)", () => {
    const s = reducer(withOneIdea(), {
      type: "ADD_LEDGER",
      id: "partial-fee",
      kind: "sale",
      payer: "Nadia",
      amountCents: 2000,
      grossCents: 2000,
      feeCents: 88, // netCents OMITTED, no chosenProvider
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    const row = s.ledger[0];
    expect(row.feeCents).toBe(88);
    expect(row.netCents).toBe(1912);
    expect(row.grossCents).toBe(2000);
    // gross = fee + net.
    expect(2000).toBe(88 + 1912);
    expect(row.grossCents).toBe((row.feeCents ?? 0) + (row.netCents ?? 0));
    expect(row.providerId).toBeNull();
  });

  it("only netCents supplied -> feeCents derived as gross - net (coherent)", () => {
    const s = reducer(withOneIdea(), {
      type: "ADD_LEDGER",
      id: "partial-net",
      kind: "sale",
      payer: "Helen",
      amountCents: 2000,
      grossCents: 2000,
      netCents: 1912, // feeCents OMITTED, no chosenProvider
      createdAt: "2026-08-02T00:01:00.000Z",
    });
    const row = s.ledger[0];
    expect(row.feeCents).toBe(88);
    expect(row.netCents).toBe(1912);
    expect(row.grossCents).toBe((row.feeCents ?? 0) + (row.netCents ?? 0));
    expect(row.providerId).toBeNull();
  });

  it("NEITHER fee nor net (un-modeled default) stays fee 0, net = gross, coherent", () => {
    const s = reducer(withOneIdea(), {
      type: "ADD_LEDGER",
      id: "neither",
      kind: "sale",
      payer: "Drew",
      amountCents: 2000,
      grossCents: 2000, // no fee, no net, no provider
      createdAt: "2026-08-02T00:02:00.000Z",
    });
    const row = s.ledger[0];
    expect(row.feeCents).toBe(0);
    expect(row.netCents).toBe(2000);
    expect(row.grossCents).toBe((row.feeCents ?? 0) + (row.netCents ?? 0));
    expect(row.providerId).toBeNull();
  });

  it("FULL snapshot (both halves) is honored VERBATIM even when it isn't a recompute, no provider", () => {
    // Both feeCents AND netCents supplied is a trusted full snapshot: the reducer
    // takes it as-is and never derives from gross, even with no chosenProvider and
    // even when the numbers don't reconcile to gross (existing behavior).
    const s = reducer(withOneIdea(), {
      type: "ADD_LEDGER",
      id: "full-verbatim",
      kind: "sale",
      payer: "Sam",
      amountCents: 2000,
      grossCents: 2000,
      feeCents: 100, // deliberately NOT gross - net (100 + 100 != 2000)
      netCents: 100,
      createdAt: "2026-08-02T00:03:00.000Z",
    });
    const row = s.ledger[0];
    expect(row.feeCents).toBe(100);
    expect(row.netCents).toBe(100);
    // Not re-derived from gross: proves the full-snapshot path is untouched.
    expect(row.netCents).not.toBe(1900);
    expect(row.feeCents).not.toBe(1900);
    expect(row.providerId).toBeNull();
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
    // Both criteria done for the only idea -> eligible for neither (the
    // sequence continues: 1.3 is now the eligible one instead).
    expect(ideasEligibleFor(s, "1.1")).toEqual([]);
    expect(ideasEligibleFor(s, "1.2")).toEqual([]);
    expect(ideasEligibleFor(s, "1.3")).toEqual([0]);
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
    for (const stepId of ["1.1", "1.2"]) {
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

  it("keeps walking the sequence: after 1.1 + 1.2 the fallback is 1.3, not the old dead end", () => {
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = completeCriterion(s, 0, "1.2");
    expect(nextUpFor(s, 0)).toBe("1.3");
    s = reducer(s, { type: "OPEN_RUNNER" });
    expect(s.runnerStep).toBe("1.3");
  });

  it("falls back to the sequence's FIRST criterion when nothing is workable (gated at the business seam)", () => {
    let s = withOneIdea();
    s = completePhase(s, 0, "sell");
    s = completePhase(s, 0, "build");
    s = completePhase(s, 0, "validate");
    expect(nextUpFor(s, 0)).toBeNull();
    s = reducer(s, { type: "OPEN_RUNNER" });
    expect(s.runnerStep).toBe(CRITERION_SEQUENCE[0]);
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
      kind: "sale",
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

  it("SET_PROFILE patches, SET_STAGE / SET_OB set, room toggle", () => {
    let s = initialState();
    s = reducer(s, { type: "SET_PROFILE", patch: { firstName: "Cedric" } });
    s = reducer(s, { type: "SET_PROFILE", patch: { handle: "cedric" } });
    expect(s.profile).toEqual({ firstName: "Cedric", handle: "cedric", siteHeadline: "", grade: null });
    s = reducer(s, { type: "SET_STAGE", stage: "app" });
    expect(s.stage).toBe("app");
    s = reducer(s, { type: "SET_OB", ob: 4 });
    expect(s.ob).toBe(4);
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

describe("signup stage (Slice B Unit 7)", () => {
  it("boot and landing can route INTO signup via SET_STAGE", () => {
    const fromBoot = reducer(initialState(), { type: "SET_STAGE", stage: "signup" });
    expect(fromBoot.stage).toBe("signup");
    const landing = reducer(initialState(), { type: "SET_STAGE", stage: "landing" });
    const fromLanding = reducer(landing, { type: "SET_STAGE", stage: "signup" });
    expect(fromLanding.stage).toBe("signup");
  });

  it("signup can route on to login or onboard/app as the flow needs", () => {
    const signup = reducer(initialState(), { type: "SET_STAGE", stage: "signup" });
    expect(reducer(signup, { type: "SET_STAGE", stage: "login" }).stage).toBe("login");
    expect(reducer(signup, { type: "SET_STAGE", stage: "onboard" }).stage).toBe("onboard");
    expect(reducer(signup, { type: "SET_STAGE", stage: "app" }).stage).toBe("app");
  });

  it("SET_STAGE to signup touches nothing but the stage", () => {
    const s = withOneIdea();
    const after = reducer(s, { type: "SET_STAGE", stage: "signup" });
    expect(after.stage).toBe("signup");
    expect(after.ideas).toBe(s.ideas);
    expect(after.profile).toBe(s.profile);
    expect(after.ledger).toBe(s.ledger);
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

  it("phaseProgress('sell') counts across the WHOLE Sell phase using real content task counts", () => {
    const total = criterionIdsForPhase("sell").reduce(
      (sum, id) => sum + getStep(id).tasks.length,
      0,
    );
    let s = withOneIdea();
    expect(phaseProgress(s, 0, "sell")).toEqual({ done: 0, total });
    s = completeCriterion(s, 0, "1.1");
    expect(phaseProgress(s, 0, "sell")).toEqual({ done: getStep("1.1").tasks.length, total });
  });
});

describe("selectors: ledger sums (net vs gross)", () => {
  it("empty ledger sums to 0 for both net and gross", () => {
    expect(salesSumCents(withOneIdea())).toBe(0);
    expect(grossSalesSumCents(withOneIdea())).toBe(0);
  });

  it("salesSumCents sums net (fee felt); grossSalesSumCents sums gross", () => {
    // A 50% fee halves the net contribution, while gross is unchanged.
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "s1",
      kind: "sale",
      payer: "A",
      amountCents: 2000,
      grossCents: 2000,
      feeCents: 1000,
      netCents: 1000,
      providerId: "first_profit_pay",
      createdAt: "2026-07-31T00:05:00.000Z",
    });
    // A bare sale with no snapshot counts at gross for BOTH sums (net default).
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "s2",
      kind: "sale",
      payer: "B",
      amountCents: 1500,
      createdAt: "2026-07-31T00:06:00.000Z",
    });
    expect(salesSumCents(s)).toBe(1000 + 1500);
    expect(grossSalesSumCents(s)).toBe(2000 + 1500);
  });

  it("counts a legacy amount-only row (no fee fields) at gross for both sums", () => {
    // Mirrors a sync.ts loadLedger legacy default arriving via SET_LEDGER.
    let s = withOneIdea();
    s = reducer(s, {
      type: "SET_LEDGER",
      ledger: [
        { id: "legacy", kind: "sale", payer: "C", amountCents: 900, createdAt: "2026-07-31T00:07:00.000Z" },
      ],
    });
    expect(salesSumCents(s)).toBe(900);
    expect(grossSalesSumCents(s)).toBe(900);
  });
});

describe("SET_PROVIDER (chosen payment provider)", () => {
  it("records the provider id + chosenAt", () => {
    const s = reducer(withOneIdea(), {
      type: "SET_PROVIDER",
      providerId: "replit",
      chosenAt: 1_722_000_000_000,
    });
    expect(s.chosenProvider).toEqual({ providerId: "replit", chosenAt: 1_722_000_000_000 });
  });

  it("a switch replaces the provider with a fresh chosenAt (no history rewrite)", () => {
    let s = withOneIdea();
    s = reducer(s, { type: "SET_PROVIDER", providerId: "first_profit_pay", chosenAt: 1 });
    s = reducer(s, { type: "SET_PROVIDER", providerId: "shopify", chosenAt: 2 });
    expect(s.chosenProvider).toEqual({ providerId: "shopify", chosenAt: 2 });
  });

  it("initial state has no chosen provider", () => {
    expect(initialState().chosenProvider).toBeNull();
  });

  it("RESET_SESSION clears the chosen provider (shared-device safety)", () => {
    let s = withOneIdea();
    s = reducer(s, { type: "SET_PROVIDER", providerId: "replit", chosenAt: 1 });
    const reset = reducer(s, { type: "RESET_SESSION" });
    expect(reset.chosenProvider).toBeNull();
  });
});

describe("provider switch (PP2 Unit 6, R24.6)", () => {
  it("switching to the SAME provider is a no-op (same state ref, no chosenAt churn)", () => {
    let s = withOneIdea();
    s = reducer(s, { type: "SET_PROVIDER", providerId: "replit", chosenAt: 1 });
    // Re-picking the same id must not churn chosenAt or produce a new object: the
    // CheckoutBooth coach keys off a real old!=new switch, so a same-id re-pick
    // must have no effect for it to react to.
    const again = reducer(s, { type: "SET_PROVIDER", providerId: "replit", chosenAt: 999 });
    expect(again).toBe(s); // referential no-op
    expect(again.chosenProvider).toEqual({ providerId: "replit", chosenAt: 1 });
  });

  it("a real switch (different id) replaces the provider and stamps a fresh chosenAt", () => {
    let s = withOneIdea();
    s = reducer(s, { type: "SET_PROVIDER", providerId: "first_profit_pay", chosenAt: 1 });
    const switched = reducer(s, { type: "SET_PROVIDER", providerId: "replit", chosenAt: 2 });
    expect(switched).not.toBe(s);
    expect(switched.chosenProvider).toEqual({ providerId: "replit", chosenAt: 2 });
  });

  it("a switch does NOT recompute past ledger rows: prior sale keeps its 50% snapshot, new sale uses replit", () => {
    let s = withOneIdea();
    // On First Profit Pay: a $20 sale is taxed at 50% (fee 1000, net 1000).
    s = reducer(s, { type: "SET_PROVIDER", providerId: "first_profit_pay", chosenAt: 1 });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-fpp",
      kind: "sale",
      payer: "Ada",
      amountCents: 2000,
      grossCents: 2000,
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    // Switch to Replit, then log another $20 sale: 2.9% + 30c = fee 88, net 1912.
    s = reducer(s, { type: "SET_PROVIDER", providerId: "replit", chosenAt: 2 });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-replit",
      kind: "sale",
      payer: "Ben",
      amountCents: 2000,
      grossCents: 2000,
      createdAt: "2026-08-02T00:01:00.000Z",
    });

    const prior = s.ledger.find((r) => r.id === "sale-fpp");
    const fresh = s.ledger.find((r) => r.id === "sale-replit");
    // The prior First Profit Pay row is UNTOUCHED by the switch.
    expect(prior).toMatchObject({ grossCents: 2000, feeCents: 1000, netCents: 1000, providerId: "first_profit_pay" });
    // The new row uses the new provider's fee.
    expect(fresh).toMatchObject({ grossCents: 2000, feeCents: 88, netCents: 1912, providerId: "replit" });
  });

  it("durability (R24.6 proof): after a switch AND a save round-trip + ledger reload, prior rows keep their old fee and chosenProvider is the new one", () => {
    let s = withOneIdea();
    s = reducer(s, { type: "SET_PROVIDER", providerId: "first_profit_pay", chosenAt: 1 });
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-fpp",
      kind: "sale",
      payer: "Ada",
      amountCents: 2000,
      grossCents: 2000,
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    s = reducer(s, { type: "SET_PROVIDER", providerId: "replit", chosenAt: 2 });

    // The ledger rows are what fp_ledger would have persisted (per-row snapshots).
    const persistedLedger = s.ledger.map((r) => ({ ...r }));

    // Save round-trip: toSaveDoc/fromSaveDoc/HYDRATE. HYDRATE clears the ledger
    // (it lives in fp_ledger, not the save doc); the chosenProvider rides the doc.
    const doc = toSaveDoc(s);
    const parsed = fromSaveDoc(JSON.parse(JSON.stringify(doc)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    let reloaded = reducer(initialState(), { type: "HYDRATE", doc: parsed.doc });
    expect(reloaded.ledger).toEqual([]); // cleared by HYDRATE
    // The Unit-2 sync mapping re-fills the session ledger from fp_ledger.
    reloaded = reducer(reloaded, { type: "SET_LEDGER", ledger: persistedLedger });

    // chosenProvider is the NEW provider after reload.
    expect(reloaded.chosenProvider).toEqual({ providerId: "replit", chosenAt: 2 });
    // The pre-switch 50% row STILL carries its old fee/provider snapshot.
    const prior = reloaded.ledger.find((r) => r.id === "sale-fpp");
    expect(prior).toMatchObject({ grossCents: 2000, feeCents: 1000, netCents: 1000, providerId: "first_profit_pay" });
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
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "l1",
      kind: "sale",
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

    // Caller-controlled fields are preserved for the provider to overwrite —
    // EXCEPT grade, which is per-account child data (asserted separately below).
    expect(reset.stage).toBe("app");
    expect(reset.profile).toEqual({ firstName: "Ada", handle: "ada", siteHeadline: "", grade: null });

    // The reducer remains usable afterwards.
    const revived = reducer(reset, { type: "CREATE_IDEA" });
    expect(revived.ideas).toHaveLength(1);
  });
});

describe("profile.grade (Unit 3: roster-derived, session-scoped)", () => {
  it("initialState carries grade null; SET_PROFILE adopts and clears it", () => {
    let s = initialState();
    expect(s.profile.grade).toBeNull();
    s = reducer(s, { type: "SET_PROFILE", patch: { grade: 7 } });
    expect(s.profile.grade).toBe(7);
    s = reducer(s, { type: "SET_PROFILE", patch: { grade: null } });
    expect(s.profile.grade).toBeNull();
  });

  it("RESET_SESSION nulls grade even though the rest of the profile survives", () => {
    let s = initialState();
    s = reducer(s, { type: "SET_PROFILE", patch: { firstName: "Ada", handle: "ada", grade: 4 } });
    const reset = reducer(s, { type: "RESET_SESSION" });
    expect(reset.profile.firstName).toBe("Ada");
    expect(reset.profile.handle).toBe("ada");
    expect(reset.profile.grade).toBeNull();
  });

  it("grade is NOT persisted: toSaveDoc has no grade field and HYDRATE leaves it alone", () => {
    let s = initialState();
    s = reducer(s, { type: "SET_PROFILE", patch: { grade: 9 } });
    const doc = toSaveDoc(s);
    expect(JSON.stringify(doc)).not.toContain("grade");
    // HYDRATE (a save load) must not touch the session's adopted grade.
    const hydrated = reducer(s, { type: "HYDRATE", doc });
    expect(hydrated.profile.grade).toBe(9);
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

describe("SET_LEDGER (server read-back fill)", () => {
  it("replaces the whole session ledger and drives the sum selectors", () => {
    let s = withOneIdea();
    const rows = [
      { id: "s1", kind: "sale" as const, payer: "A", amountCents: 1500, createdAt: "2026-07-31T00:00:00.000Z" },
      { id: "s2", kind: "sale" as const, payer: "B", amountCents: 2500, createdAt: "2026-07-31T00:01:00.000Z" },
    ];
    s = reducer(s, { type: "SET_LEDGER", ledger: rows });
    expect(s.ledger).toEqual(rows);
    // Both rows are bare (no fee snapshot) so net counts at gross.
    expect(salesSumCents(s)).toBe(4000);
    expect(grossSalesSumCents(s)).toBe(4000);

    // REPLACES (not appends): a later fill with fewer rows wins outright.
    s = reducer(s, { type: "SET_LEDGER", ledger: [] });
    expect(s.ledger).toEqual([]);
    expect(salesSumCents(s)).toBe(0);
  });
});

describe("fromSaveDoc leaf coercion", () => {
  it("keeps only string field values and boolean done flags (same docVersion)", () => {
    const parsed = fromSaveDoc({
      docVersion: DOC_VERSION,
      ideas: [
        {
          fields: { oneLiner: "keep", num: 42, nil: null, nested: { x: 1 } },
          done: { "1.1#0": true, "1.1#1": "yes", "1.1#2": 1, "1.1#3": null },
        },
      ],
      activeIdea: 0,
      siteHeadline: "",
      onboardingComplete: false,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Wrong-typed leaves are dropped, so nothing malformed can reach .trim()/a
    // controlled input.
    expect(parsed.doc.ideas[0].fields).toEqual({ oneLiner: "keep" });
    expect(parsed.doc.ideas[0].done).toEqual({ "1.1#0": true });
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
      kind: "sale",
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
    // These ideas were created WITHOUT caller-minted ids (legacy dispatch), so
    // the load minted the deterministic `legacy-idea-{index}` ids (Unit 7);
    // everything else round-trips untouched.
    expect(hydrated.ideas).toEqual(
      s.ideas.map((idea, i) => ({ ...idea, id: `legacy-idea-${i}` })),
    );
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

describe("chosenProvider persistence (additive-optional, NO DOC_VERSION bump)", () => {
  it("toSaveDoc/fromSaveDoc/HYDRATE round-trips a chosen provider", () => {
    let s = withOneIdea();
    s = reducer(s, { type: "SET_PROVIDER", providerId: "replit", chosenAt: 1_722_000_000_000 });

    const doc = toSaveDoc(s);
    expect(doc.docVersion).toBe(DOC_VERSION); // still 1: additive-optional field
    expect(doc.chosenProvider).toEqual({ providerId: "replit", chosenAt: 1_722_000_000_000 });

    const parsed = fromSaveDoc(JSON.parse(JSON.stringify(doc)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const hydrated = reducer(initialState(), { type: "HYDRATE", doc: parsed.doc });
    expect(hydrated.chosenProvider).toEqual({ providerId: "replit", chosenAt: 1_722_000_000_000 });
  });

  it("an existing v1 doc WITHOUT chosenProvider loads with null, NOT discarded, DOC_VERSION unchanged", () => {
    // The pre-PP2 save shape: no chosenProvider key at all.
    const legacyDoc = {
      docVersion: 1,
      ideas: [{ fields: {}, done: {} }],
      activeIdea: 0,
      siteHeadline: "",
      onboardingComplete: true,
    };
    const parsed = fromSaveDoc(legacyDoc);
    expect(parsed.ok).toBe(true); // NOT discarded
    if (!parsed.ok) return;
    expect(parsed.doc.docVersion).toBe(1); // no bump
    expect(parsed.doc.chosenProvider).toBeNull(); // defaulted

    const hydrated = reducer(initialState(), { type: "HYDRATE", doc: parsed.doc });
    expect(hydrated.chosenProvider).toBeNull();
  });

  it("DOC_VERSION stays 1 (a bump would discard in-flight outbox entries)", () => {
    expect(DOC_VERSION).toBe(1);
  });

  it("a malformed chosenProvider (bad id / missing chosenAt) defaults to null, doc still ok", () => {
    const parsed = fromSaveDoc({
      docVersion: 1,
      ideas: [],
      activeIdea: 0,
      siteHeadline: "",
      onboardingComplete: false,
      chosenProvider: { providerId: "not_a_provider", chosenAt: 5 },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.doc.chosenProvider).toBeNull();
  });

  it("a valid providerId with a non-finite/negative/missing chosenAt defaults to null (no half-broken object)", () => {
    // NaN is the dangerous one: JSON.stringify(NaN) === 'null', so a persisted
    // NaN chosenAt would round-trip to a dropped field on the next load. Guard
    // rejects it (and Infinity / negative / missing) so the whole leaf is null.
    const base = {
      docVersion: 1,
      ideas: [],
      activeIdea: 0,
      siteHeadline: "",
      onboardingComplete: false,
    };
    for (const chosenAt of [NaN, Infinity, -Infinity, -1] as unknown[]) {
      const parsed = fromSaveDoc({
        ...base,
        chosenProvider: { providerId: "replit", chosenAt },
      });
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.doc.chosenProvider).toBeNull();
    }
    // Missing chosenAt entirely -> also null (not { providerId, chosenAt: undefined }).
    const missing = fromSaveDoc({ ...base, chosenProvider: { providerId: "replit" } });
    expect(missing.ok).toBe(true);
    if (!missing.ok) return;
    expect(missing.doc.chosenProvider).toBeNull();
    // Sanity: a valid finite chosenAt (including 0) DOES survive.
    const ok = fromSaveDoc({ ...base, chosenProvider: { providerId: "replit", chosenAt: 0 } });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.doc.chosenProvider).toEqual({ providerId: "replit", chosenAt: 0 });
  });
});

describe("path.ts sanity (handoff copy rules)", () => {
  it("1.1 is worth 60 XP and 1.2 is worth 120 XP", () => {
    expect(getStep("1.1").xp).toBe(60);
    expect(getStep("1.2").xp).toBe(120);
  });

  it("1.1/1.2 copy carries no em dashes", () => {
    for (const stepId of ["1.1", "1.2"]) {
      const step = getStep(stepId);
      const copy = [step.title, step.brief, step.doneWhen, step.coach, ...step.tasks].join(" ");
      expect(copy).not.toContain("—");
    }
  });

  it("STEPS export is intact", () => {
    expect(STEPS.length).toBeGreaterThan(0);
  });
});

describe("doneAt completion timestamps (additive-optional, NO DOC_VERSION bump)", () => {
  it("COMPLETE_TASK with a caller-stamped `at` records doneAt under the legacy taskKey", () => {
    const s = reducer(withOneIdea(), {
      type: "COMPLETE_TASK",
      ideaIndex: 0,
      stepId: "1.1",
      index: 0,
      at: 1_754_000_000_000,
    });
    expect(s.ideas[0].done[taskKey("1.1", 0)]).toBe(true);
    expect(s.ideas[0].doneAt?.[taskKey("1.1", 0)]).toBe(1_754_000_000_000);
  });

  it("COMPLETE_TASK without `at` (legacy caller) completes with NO doneAt entry", () => {
    const s = reducer(withOneIdea(), { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.1", index: 0 });
    expect(s.ideas[0].done[taskKey("1.1", 0)]).toBe(true);
    expect(s.ideas[0].doneAt?.[taskKey("1.1", 0)]).toBeUndefined();
  });

  it("a malformed stamp (NaN / negative) is rejected, never persisted to poison the next load", () => {
    let s = reducer(withOneIdea(), {
      type: "COMPLETE_TASK",
      ideaIndex: 0,
      stepId: "1.1",
      index: 0,
      at: Number.NaN,
    });
    s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.1", index: 1, at: -5 });
    expect(s.ideas[0].done[taskKey("1.1", 0)]).toBe(true);
    expect(s.ideas[0].doneAt?.[taskKey("1.1", 0)]).toBeUndefined();
    expect(s.ideas[0].doneAt?.[taskKey("1.1", 1)]).toBeUndefined();
  });

  it("re-completing an already-done task keeps the ORIGINAL timestamp (idempotent)", () => {
    const first = reducer(withOneIdea(), {
      type: "COMPLETE_TASK",
      ideaIndex: 0,
      stepId: "1.1",
      index: 0,
      at: 1000,
    });
    const again = reducer(first, {
      type: "COMPLETE_TASK",
      ideaIndex: 0,
      stepId: "1.1",
      index: 0,
      at: 9999,
    });
    expect(again).toBe(first); // referential no-op
    expect(again.ideas[0].doneAt?.[taskKey("1.1", 0)]).toBe(1000);
  });

  it("the 1.2 real-sale auto-complete stamps doneAt from the row's createdAt", () => {
    let s = withOneIdea();
    for (let i = 0; i < getStep("1.1").tasks.length; i++) {
      s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.1", index: i });
    }
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-1",
      kind: "sale",
      payer: "Mom",
      amountCents: 500,
      createdAt: "2026-08-03T12:00:00.000Z",
    });
    const key = taskKey("1.2", LAST_1_2_INDEX);
    expect(s.ideas[0].done[key]).toBe(true);
    expect(s.ideas[0].doneAt?.[key]).toBe(Date.parse("2026-08-03T12:00:00.000Z"));
  });

  it("toSaveDoc -> fromSaveDoc -> HYDRATE round-trips doneAt (HYDRATE must not wipe it)", () => {
    const s = reducer(withOneIdea(), {
      type: "COMPLETE_TASK",
      ideaIndex: 0,
      stepId: "1.1",
      index: 2,
      at: 1_754_000_123_456,
    });
    const doc = toSaveDoc(s);
    const parsed = fromSaveDoc(JSON.parse(JSON.stringify(doc)));
    if (!parsed.ok) throw new Error("round-trip refused");
    expect(parsed.doc.ideas[0].doneAt).toEqual({ [taskKey("1.1", 2)]: 1_754_000_123_456 });
    // Split-storage learning: HYDRATE re-sources every persisted slice.
    const hydrated = reducer(initialState(), { type: "HYDRATE", doc: parsed.doc });
    expect(hydrated.ideas[0].doneAt).toEqual({ [taskKey("1.1", 2)]: 1_754_000_123_456 });
  });

  it("an OLD doc without doneAt loads clean (absent stays absent; still DOC_VERSION 1)", () => {
    expect(DOC_VERSION).toBe(1); // additive change only — a bump would discard outboxes
    const legacyDoc = {
      docVersion: 1,
      ideas: [{ fields: { oneLiner: "x" }, done: { [taskKey("1.1", 0)]: true } }],
      activeIdea: 0,
      siteHeadline: "",
      onboardingComplete: true,
    };
    const parsed = fromSaveDoc(legacyDoc);
    if (!parsed.ok) throw new Error("legacy doc refused");
    expect(parsed.doc.ideas[0].doneAt).toBeUndefined();
    expect(parsed.doc.ideas[0].done[taskKey("1.1", 0)]).toBe(true);
    // And an untimestamped doc stays byte-stable through a save round-trip.
    const hydrated = reducer(initialState(), { type: "HYDRATE", doc: parsed.doc });
    expect(toSaveDoc(hydrated).ideas[0]).not.toHaveProperty("doneAt");
  });

  it("fromSaveDoc drops malformed doneAt leaves (non-number / NaN-shaped) but keeps good ones", () => {
    const parsed = fromSaveDoc({
      docVersion: 1,
      ideas: [
        {
          fields: {},
          done: {},
          doneAt: { good: 123, str: "yesterday", neg: -1, nul: null },
        },
      ],
      activeIdea: 0,
      siteHeadline: "",
      onboardingComplete: false,
    });
    if (!parsed.ok) throw new Error("doc refused");
    expect(parsed.doc.ideas[0].doneAt).toEqual({ good: 123 });
  });

  it("RESET_SESSION clears doneAt with the rest of the ideas (shared-device safety)", () => {
    const s = reducer(withOneIdea(), {
      type: "COMPLETE_TASK",
      ideaIndex: 0,
      stepId: "1.1",
      index: 0,
      at: 1000,
    });
    const reset = reducer(s, { type: "RESET_SESSION" });
    expect(reset.ideas).toEqual([]);
  });
});

describe("generic phase engine (Unit 6): full 25-criterion sequence", () => {
  it("exposes the full ordered sequence from the generated content", () => {
    expect(CRITERION_SEQUENCE).toHaveLength(25);
    expect(CRITERION_SEQUENCE[0]).toBe("1.1");
    expect(CRITERION_SEQUENCE[24]).toBe("5.5");
    expect(criterionIdsForPhase("sell")).toEqual(["1.1", "1.2", "1.3", "1.4", "1.5"]);
    expect(criterionIdsForPhase("scale")).toEqual(["5.1", "5.2", "5.3", "5.4", "5.5"]);
  });

  it("honors VARIABLE task counts from the content (2.3 has six tasks, 3.4 has four)", () => {
    expect(getStep("2.3").tasks).toHaveLength(6);
    expect(getStep("3.4").tasks).toHaveLength(4);
    // stepPips follows the content's count, never a x5 assumption.
    const s = withOneIdea();
    expect(stepPips(s, 0, "2.3")).toHaveLength(6);
    expect(stepPips(s, 0, "3.4")).toHaveLength(4);
  });

  it("2.3 only completes on its SIXTH task (five done is not enough)", () => {
    let s = withOneIdea();
    for (let i = 0; i < 5; i++) {
      s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "2.3", index: i });
    }
    expect(isCriterionDone(s, 0, "2.3")).toBe(false);
    s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "2.3", index: 5 });
    expect(isCriterionDone(s, 0, "2.3")).toBe(true);
  });

  it("per-idea isolation, REVERSE direction: advancing idea B leaves idea A untouched", () => {
    let s = apply(
      initialState(),
      { type: "CREATE_IDEA" },
      { type: "CLOSE_RUNNER" },
      { type: "CREATE_IDEA" },
      { type: "CLOSE_RUNNER" },
    );
    const ideaABefore = s.ideas[0];
    s = completePhase(s, 1, "sell"); // advance idea B (index 1) only
    expect(isPhaseComplete(s, 1, "sell")).toBe(true);
    expect(isStepUnlocked(s, 1, "2.1")).toBe(true);
    // Idea A: referentially untouched, still at its own 1.1 frontier.
    expect(s.ideas[0]).toBe(ideaABefore);
    expect(s.ideas[0].done).toEqual({});
    expect(nextUpFor(s, 0)).toBe("1.1");
    expect(isPhaseComplete(s, 0, "sell")).toBe(false);
    expect(isStepUnlocked(s, 0, "2.1")).toBe(false);
  });

  it("completing 1.5 (finishing phase 1) for idea A unlocks 2.1 for A ONLY", () => {
    let s = apply(
      initialState(),
      { type: "CREATE_IDEA" },
      { type: "CLOSE_RUNNER" },
      { type: "CREATE_IDEA" },
      { type: "CLOSE_RUNNER" },
    );
    s = completePhase(s, 0, "sell");
    expect(isPhaseComplete(s, 0, "sell")).toBe(true);
    expect(isPhaseUnlocked(s, 0, "build")).toBe(true);
    expect(isStepUnlocked(s, 0, "2.1")).toBe(true);
    expect(nextUpFor(s, 0)).toBe("2.1");
    // Idea B is still at its own frontier: 2.1 locked, next-up 1.1.
    expect(isPhaseUnlocked(s, 1, "build")).toBe(false);
    expect(isStepUnlocked(s, 1, "2.1")).toBe(false);
    expect(nextUpFor(s, 1)).toBe("1.1");
  });

  it("nextUpFor walks the sequence 1.1 -> 3.5 in order per idea with no dead end", () => {
    let s = withOneIdea();
    const playable = CRITERION_SEQUENCE.slice(0, 15); // phases 1-3
    for (const stepId of playable) {
      expect(nextUpFor(s, 0)).toBe(stepId);
      expect(isStepUnlocked(s, 0, stepId)).toBe(true);
      s = completeCriterion(s, 0, stepId);
    }
    // 3.5 done: phase 4 waits on the business seam, so next-up is null.
    expect(nextUpFor(s, 0)).toBeNull();
  });

  it("phase 4 stays LOCKED without a promoted business even with 3.5 complete", () => {
    let s = withOneIdea();
    s = completePhase(s, 0, "sell");
    s = completePhase(s, 0, "build");
    s = completePhase(s, 0, "validate");
    expect(isPhaseComplete(s, 0, "validate")).toBe(true);
    // No PROMOTE_IDEA has run, so the business gate is closed.
    expect(activeBusinessExists(s)).toBe(false);
    expect(isPhaseUnlocked(s, 0, "grow")).toBe(false);
    expect(isPhaseUnlocked(s, 0, "scale")).toBe(false);
    expect(isStepUnlocked(s, 0, "4.1")).toBe(false);
    expect(isIdeaEligibleFor(s, 0, "4.1")).toBe(false);
    expect(ideasEligibleFor(s, "4.1")).toEqual([]);
  });

  it("a criterion deeper in a LOCKED phase is also locked (5.3, 4.2)", () => {
    let s = withOneIdea();
    s = completePhase(s, 0, "sell");
    s = completePhase(s, 0, "build");
    s = completePhase(s, 0, "validate");
    expect(isStepUnlocked(s, 0, "4.2")).toBe(false);
    expect(isStepUnlocked(s, 0, "5.3")).toBe(false);
  });

  it("criteria unlock linearly WITHIN phase 2: 2.2 needs 2.1 done, not just the phase", () => {
    let s = withOneIdea();
    s = completePhase(s, 0, "sell");
    expect(isStepUnlocked(s, 0, "2.1")).toBe(true);
    expect(isStepUnlocked(s, 0, "2.2")).toBe(false);
    s = completeCriterion(s, 0, "2.1");
    expect(isStepUnlocked(s, 0, "2.2")).toBe(true);
    expect(nextUpFor(s, 0)).toBe("2.2");
  });

  it("the real-sale auto-complete still targets 1.2's LAST task via the hooks id (dual-write intact)", () => {
    let s = withOneIdea();
    s = completeCriterion(s, 0, "1.1");
    s = reducer(s, { type: "DISMISS_CELEBRATION" });
    for (let i = 0; i < LAST_1_2_INDEX; i++) {
      s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.2", index: i });
    }
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-hooked",
      kind: "sale",
      payer: "Nadia",
      amountCents: 1000,
      createdAt: "2026-08-03T00:00:00.000Z",
    });
    // Positional (legacy) AND stable-id (Unit 5 dual-write) shapes both land.
    expect(isTaskDone(s, 0, "1.2", LAST_1_2_INDEX)).toBe(true);
    expect(s.ideas[0].done[taskKey("1.2", LAST_1_2_INDEX)]).toBe(true);
    expect(s.ideas[0].doneByTask?.["1.2.5"]).toBe(true);
    expect(isCriterionDone(s, 0, "1.2")).toBe(true);
    expect(s.celebrate).toBe("1.2");
  });

  it("XP derives from completed criteria across the sequence (STEP_META values)", () => {
    let s = withOneIdea();
    expect(xpFor(s, 0)).toBe(0);
    s = completeCriterion(s, 0, "1.1");
    expect(xpFor(s, 0)).toBe(60);
    s = completePhase(s, 0, "sell");
    // Phase 1 total: 60 + 120 + 70 + 80 + 100.
    expect(xpFor(s, 0)).toBe(430);
    s = completeCriterion(s, 0, "2.1");
    expect(xpFor(s, 0)).toBe(430 + 140);
  });

  it("totalXp sums across ideas", () => {
    let s = apply(
      initialState(),
      { type: "CREATE_IDEA" },
      { type: "CLOSE_RUNNER" },
      { type: "CREATE_IDEA" },
      { type: "CLOSE_RUNNER" },
    );
    s = completeCriterion(s, 0, "1.1");
    s = completeCriterion(s, 1, "1.1");
    s = completeCriterion(s, 1, "1.2");
    expect(xpFor(s, 0)).toBe(60);
    expect(xpFor(s, 1)).toBe(180);
    expect(totalXp(s)).toBe(240);
  });

  it("phaseProgress is scoped to one phase with content-driven totals", () => {
    let s = withOneIdea();
    expect(phaseProgress(s, 0, "sell").total).toBe(25);
    expect(phaseProgress(s, 0, "build").total).toBe(26);
    expect(phaseProgress(s, 0, "validate").total).toBe(24);
    s = completeCriterion(s, 0, "1.1");
    expect(phaseProgress(s, 0, "sell")).toEqual({ done: 5, total: 25 });
    expect(phaseProgress(s, 0, "build")).toEqual({ done: 0, total: 26 });
  });

  it("an ACTIVE business unlocks 4.1 through the gate (the Unit 7 red/green target, now via PROMOTE_IDEA)", () => {
    let s = apply(initialState(), { type: "CREATE_IDEA", ideaId: "idea-a" }, { type: "CLOSE_RUNNER" });
    s = completePhase(s, 0, "sell");
    s = completePhase(s, 0, "build");
    s = completePhase(s, 0, "validate");
    // The seam is now a real action: PROMOTE_IDEA produces the exact green
    // state this test pinned before Unit 7 by direct construction.
    const promoted = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 111 });
    expect(promoted.businesses).toEqual([
      { id: "biz-1", ideaId: "idea-a", archived: false, promotedAt: 111 },
    ]);
    expect(activeBusinessExists(promoted)).toBe(true);
    expect(activeBusiness(promoted)?.id).toBe("biz-1");
    expect(businessFor(promoted, "idea-a")?.id).toBe("biz-1");
    expect(isPhaseUnlocked(promoted, 0, "grow")).toBe(true);
    expect(isStepUnlocked(promoted, 0, "4.1")).toBe(true);
    expect(nextUpFor(promoted, 0)).toBe("4.1");
  });

  it("an ARCHIVED-only business list keeps phases 4-5 locked", () => {
    let s = withOneIdea();
    s = completePhase(s, 0, "sell");
    s = completePhase(s, 0, "build");
    s = completePhase(s, 0, "validate");
    const archived: GameState = { ...s, businesses: [{ id: "biz-1", archived: true }] };
    expect(activeBusinessExists(archived)).toBe(false);
    expect(isPhaseUnlocked(archived, 0, "grow")).toBe(false);
    expect(isStepUnlocked(archived, 0, "4.1")).toBe(false);
    expect(nextUpFor(archived, 0)).toBeNull();
    // Unarchiving (Unit 7's UNARCHIVE) re-opens the gate.
    const unarchived: GameState = { ...s, businesses: [{ id: "biz-1", archived: false }] };
    expect(activeBusinessExists(unarchived)).toBe(true);
    expect(isStepUnlocked(unarchived, 0, "4.1")).toBe(true);
  });

  it("an ABSENT businesses field stays locked (existing saves unchanged)", () => {
    let s = withOneIdea();
    s = completePhase(s, 0, "sell");
    s = completePhase(s, 0, "build");
    s = completePhase(s, 0, "validate");
    expect(s.businesses).toBeUndefined();
    expect(activeBusinessExists(s)).toBe(false);
    expect(isStepUnlocked(s, 0, "4.1")).toBe(false);
    // An empty list is also "no business".
    expect(activeBusinessExists({ ...s, businesses: [] })).toBe(false);
  });

  it("a SCRIPTED fresh save can be driven 1.1 -> 3.5 with no dead end (verification gate)", () => {
    // Drive the reducer exactly as the UI would: open the runner via next-up,
    // complete every task, dismiss every celebration, repeat to 3.5.
    let s = withOneIdea();
    let guard = 0;
    for (;;) {
      const stepId = nextUpFor(s, 0);
      if (!stepId) break;
      if (++guard > 25) throw new Error("engine loop did not terminate");
      s = reducer(s, { type: "OPEN_RUNNER" });
      expect(s.runnerStep).toBe(stepId);
      s = completeCriterion(s, 0, stepId);
      expect(s.celebrate).toBe(stepId);
      s = reducer(s, { type: "DISMISS_CELEBRATION" });
    }
    // The walk ends exactly at the business gate with phases 1-3 complete.
    expect(isPhaseComplete(s, 0, "sell")).toBe(true);
    expect(isPhaseComplete(s, 0, "build")).toBe(true);
    expect(isPhaseComplete(s, 0, "validate")).toBe(true);
    expect(guard).toBe(15);
  });
});

describe("businesses seam persistence (additive-optional, NO DOC_VERSION bump)", () => {
  it("toSaveDoc/fromSaveDoc/HYDRATE round-trips a businesses list", () => {
    const s: GameState = {
      ...withOneIdea(),
      businesses: [
        { id: "biz-1", ideaId: "idea-0" },
        { id: "biz-2", archived: true },
      ],
    };
    const doc = toSaveDoc(s);
    expect(doc.docVersion).toBe(DOC_VERSION); // still 1: additive-optional field
    expect(doc.businesses).toEqual([
      { id: "biz-1", ideaId: "idea-0" },
      { id: "biz-2", archived: true },
    ]);
    const parsed = fromSaveDoc(JSON.parse(JSON.stringify(doc)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const hydrated = reducer(initialState(), { type: "HYDRATE", doc: parsed.doc });
    expect(hydrated.businesses).toEqual(s.businesses);
    expect(activeBusinessExists(hydrated)).toBe(true);
  });

  it("ABSENT stays absent through the whole round-trip (existing docs byte-stable)", () => {
    const s = withOneIdea();
    expect(s.businesses).toBeUndefined();
    const doc = toSaveDoc(s);
    expect(doc).not.toHaveProperty("businesses");
    const parsed = fromSaveDoc(JSON.parse(JSON.stringify(doc)));
    if (!parsed.ok) throw new Error("round-trip refused");
    expect(parsed.doc).not.toHaveProperty("businesses");
    const hydrated = reducer(initialState(), { type: "HYDRATE", doc: parsed.doc });
    expect(hydrated.businesses).toBeUndefined();
    expect(toSaveDoc(hydrated)).not.toHaveProperty("businesses");
  });

  it("coerces defensively: malformed entries/leaves are dropped, never fail the load", () => {
    const parsed = fromSaveDoc({
      docVersion: DOC_VERSION,
      ideas: [],
      activeIdea: 0,
      siteHeadline: "",
      onboardingComplete: false,
      businesses: [
        { id: "keep", ideaId: 42, archived: "yes" }, // bad leaves dropped, id kept
        { id: 7 }, // no string id -> dropped
        "junk",
        null,
        { id: "ok", archived: true },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.doc.businesses).toEqual([{ id: "keep" }, { id: "ok", archived: true }]);
    // A non-array field stays ABSENT rather than inventing [].
    const bad = fromSaveDoc({
      docVersion: DOC_VERSION,
      ideas: [],
      activeIdea: 0,
      siteHeadline: "",
      onboardingComplete: false,
      businesses: "corrupt",
    });
    if (!bad.ok) throw new Error("doc refused");
    expect(bad.doc).not.toHaveProperty("businesses");
  });

  it("RESET_SESSION clears any resident businesses (shared-device safety)", () => {
    const s: GameState = { ...withOneIdea(), businesses: [{ id: "biz-1" }] };
    const reset = reducer(s, { type: "RESET_SESSION" });
    expect(reset.businesses).toBeUndefined();
    expect(activeBusinessExists(reset)).toBe(false);
  });

  it("HYDRATE from a doc WITHOUT businesses clears a resident list", () => {
    const s: GameState = { ...withOneIdea(), businesses: [{ id: "stale" }] };
    const doc = toSaveDoc(withOneIdea());
    const hydrated = reducer(s, { type: "HYDRATE", doc });
    expect(hydrated.businesses).toBeUndefined();
    expect(activeBusinessExists(hydrated)).toBe(false);
  });

  it("round-trips the Unit 7 business leaves: promotedAt + per-business completion maps", () => {
    const s: GameState = {
      ...withOneIdea(),
      businesses: [
        {
          id: "biz-1",
          ideaId: "idea-a",
          archived: true,
          promotedAt: 111,
          doneByTask: { "4.1.1": true },
          doneAtByTask: { "4.1.1": 222 },
        },
      ],
    };
    const doc = toSaveDoc(s);
    expect(doc.docVersion).toBe(DOC_VERSION); // still additive-optional
    const parsed = fromSaveDoc(JSON.parse(JSON.stringify(doc)));
    if (!parsed.ok) throw new Error("round-trip refused");
    const hydrated = reducer(initialState(), { type: "HYDRATE", doc: parsed.doc });
    expect(hydrated.businesses).toEqual(s.businesses);
    // Deep-copied, never aliased: mutating state maps must not touch the doc.
    expect(hydrated.businesses?.[0].doneByTask).not.toBe(s.businesses?.[0].doneByTask);
  });

  it("coerces the new business leaves defensively (NaN promotedAt and bad map leaves dropped)", () => {
    const parsed = fromSaveDoc({
      docVersion: DOC_VERSION,
      ideas: [],
      activeIdea: 0,
      siteHeadline: "",
      onboardingComplete: false,
      businesses: [
        {
          id: "biz-1",
          promotedAt: Number.NaN, // JSON round-trips as null; must be dropped
          doneByTask: { "4.1.1": true, "4.1.2": "yes", x: 1 },
          doneAtByTask: { "4.1.1": 500, neg: -1, str: "now" },
        },
      ],
    });
    if (!parsed.ok) throw new Error("doc refused");
    expect(parsed.doc.businesses).toEqual([
      { id: "biz-1", doneByTask: { "4.1.1": true }, doneAtByTask: { "4.1.1": 500 } },
    ]);
  });
});

// ── Unit 7: idea ids + explicit promotion ────────────────────────────────────

/** One caller-minted-id idea driven through phases 1-3 (Validate complete). */
function withValidatedIdea(ideaId = "idea-a"): GameState {
  let s = apply(initialState(), { type: "CREATE_IDEA", ideaId }, { type: "CLOSE_RUNNER" });
  s = completePhase(s, 0, "sell");
  s = completePhase(s, 0, "build");
  s = completePhase(s, 0, "validate");
  return reducer(s, { type: "DISMISS_CELEBRATION" });
}

describe("idea ids (Unit 7: caller-minted new, deterministic legacy)", () => {
  it("CREATE_IDEA stores the caller-minted id; without one the idea has NO id key", () => {
    const minted = reducer(initialState(), { type: "CREATE_IDEA", ideaId: "uuid-1" });
    expect(minted.ideas[0]).toEqual({ id: "uuid-1", fields: {}, done: {} });
    const legacy = reducer(initialState(), { type: "CREATE_IDEA" });
    expect(legacy.ideas[0]).toEqual({ fields: {}, done: {} });
    expect(legacy.ideas[0]).not.toHaveProperty("id");
  });

  it("legacy ideas get DETERMINISTIC ids on load: two independent loads mint identical ids", () => {
    // Determinism is load-bearing: two tabs loading the same legacy doc must
    // agree on the ids, or the rebase-union would fork the idea's identity.
    const legacyDoc = {
      docVersion: DOC_VERSION,
      ideas: [
        { fields: {}, done: {} },
        { fields: { oneLiner: "second" }, done: {} },
      ],
      activeIdea: 0,
      siteHeadline: "",
      onboardingComplete: true,
    };
    const a = fromSaveDoc(JSON.parse(JSON.stringify(legacyDoc)));
    const b = fromSaveDoc(JSON.parse(JSON.stringify(legacyDoc)));
    if (!a.ok || !b.ok) throw new Error("legacy doc refused");
    expect(a.doc.ideas.map((i) => i.id)).toEqual(["legacy-idea-0", "legacy-idea-1"]);
    expect(b.doc.ideas.map((i) => i.id)).toEqual(a.doc.ideas.map((i) => i.id));
  });

  it("an idea that already HAS an id keeps it through load and HYDRATE (never re-minted)", () => {
    let s = apply(initialState(), { type: "CREATE_IDEA", ideaId: "uuid-keep" }, { type: "CLOSE_RUNNER" });
    s = reducer(s, { type: "CREATE_IDEA" }); // legacy sibling, no id
    const parsed = fromSaveDoc(JSON.parse(JSON.stringify(toSaveDoc(s))));
    if (!parsed.ok) throw new Error("round-trip refused");
    expect(parsed.doc.ideas.map((i) => i.id)).toEqual(["uuid-keep", "legacy-idea-1"]);
    const hydrated = reducer(initialState(), { type: "HYDRATE", doc: parsed.doc });
    expect(hydrated.ideas.map((i) => i.id)).toEqual(["uuid-keep", "legacy-idea-1"]);
  });
});

describe("PROMOTE_IDEA / ARCHIVE_BUSINESS / UNARCHIVE_BUSINESS (Unit 7)", () => {
  it("REFUSES promotion before Validate is complete (state unchanged)", () => {
    let s = apply(initialState(), { type: "CREATE_IDEA", ideaId: "idea-a" }, { type: "CLOSE_RUNNER" });
    s = completePhase(s, 0, "sell");
    const refused = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    expect(refused).toBe(s);
    expect(activeBusinessExists(refused)).toBe(false);
  });

  it("REFUSES promotion of an unknown ideaId and a duplicate businessId", () => {
    const s = withValidatedIdea("idea-a");
    expect(reducer(s, { type: "PROMOTE_IDEA", ideaId: "nope", businessId: "biz-1", at: 1 })).toBe(s);
    const promoted = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    const archived = reducer(promoted, { type: "ARCHIVE_BUSINESS", businessId: "biz-1" });
    // Replayed/duplicate business id: refused even though no business is active.
    expect(reducer(archived, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 2 })).toBe(archived);
  });

  it("REFUSES promotion while another business is ACTIVE (archive first)", () => {
    let s = apply(
      initialState(),
      { type: "CREATE_IDEA", ideaId: "idea-a" },
      { type: "CLOSE_RUNNER" },
      { type: "CREATE_IDEA", ideaId: "idea-b" },
      { type: "CLOSE_RUNNER" },
    );
    for (const phase of ["sell", "build", "validate"] as const) {
      s = completePhase(s, 0, phase);
      s = completePhase(s, 1, phase);
    }
    s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    expect(activeBusiness(s)?.id).toBe("biz-1");
    const refused = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-b", businessId: "biz-2", at: 2 });
    expect(refused).toBe(s);
  });

  it("a malformed `at` still promotes, just without a promotedAt stamp", () => {
    const s = withValidatedIdea();
    const promoted = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: Number.NaN });
    expect(promoted.businesses).toEqual([{ id: "biz-1", ideaId: "idea-a", archived: false }]);
  });

  it("phase-4 COMPLETE_TASK writes the ACTIVE BUSINESS's maps — never the idea's", () => {
    let s = withValidatedIdea();
    s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "4.1", index: 0, at: 500 });
    const business = activeBusiness(s);
    expect(business?.doneByTask).toEqual({ "4.1.1": true });
    expect(business?.doneAtByTask).toEqual({ "4.1.1": 500 });
    expect(isTaskDone(s, 0, "4.1", 0)).toBe(true);
    // The idea carries NO trace of the grow task, in either shape.
    expect(s.ideas[0].doneByTask?.["4.1.1"]).toBeUndefined();
    expect(s.ideas[0].done[taskKey("4.1", 0)]).toBeUndefined();
    // Completing the criterion fires the celebration exactly like phases 1-3.
    const step = getStep("4.1");
    for (let i = 1; i < step.tasks.length; i++) {
      s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "4.1", index: i });
    }
    expect(isCriterionDone(s, 0, "4.1")).toBe(true);
    expect(s.celebrate).toBe("4.1");
    expect(nextUpFor(s, 0)).toBe("4.2");
  });

  it("phase-4 COMPLETE_TASK with NO active business is a no-op (nothing to write)", () => {
    const s = withValidatedIdea();
    expect(reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "4.1", index: 0 })).toBe(s);
    const archived: GameState = { ...s, businesses: [{ id: "biz-1", archived: true }] };
    expect(reducer(archived, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "4.1", index: 0 })).toBe(archived);
  });

  it("ARCHIVE locks 4-5 again but PRESERVES the record and its progress; UNARCHIVE resumes it", () => {
    let s = withValidatedIdea();
    s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "4.1", index: 0, at: 500 });
    s = reducer(s, { type: "ARCHIVE_BUSINESS", businessId: "biz-1" });
    // Locked again: no active business, 4.1 unreadable and unworkable.
    expect(activeBusinessExists(s)).toBe(false);
    expect(isStepUnlocked(s, 0, "4.1")).toBe(false);
    expect(isTaskDone(s, 0, "4.1", 0)).toBe(false);
    expect(nextUpFor(s, 0)).toBeNull();
    // The record and its maps survive the archive untouched.
    expect(s.businesses).toEqual([
      {
        id: "biz-1",
        ideaId: "idea-a",
        archived: true,
        promotedAt: 1,
        doneByTask: { "4.1.1": true },
        doneAtByTask: { "4.1.1": 500 },
      },
    ]);
    // Unarchive resumes the SAME record's preserved progress.
    s = reducer(s, { type: "UNARCHIVE_BUSINESS", businessId: "biz-1" });
    expect(activeBusiness(s)?.id).toBe("biz-1");
    expect(isTaskDone(s, 0, "4.1", 0)).toBe(true);
    expect(isStepUnlocked(s, 0, "4.1")).toBe(true);
  });

  it("ARCHIVE/UNARCHIVE are refusal-safe: unknown id, double archive, unarchive beside an active business", () => {
    let s = withValidatedIdea();
    expect(reducer(s, { type: "ARCHIVE_BUSINESS", businessId: "nope" })).toBe(s);
    expect(reducer(s, { type: "UNARCHIVE_BUSINESS", businessId: "nope" })).toBe(s);
    s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    // Unarchiving an ACTIVE business is a no-op (nothing to restore).
    expect(reducer(s, { type: "UNARCHIVE_BUSINESS", businessId: "biz-1" })).toBe(s);
    const archived = reducer(s, { type: "ARCHIVE_BUSINESS", businessId: "biz-1" });
    expect(reducer(archived, { type: "ARCHIVE_BUSINESS", businessId: "biz-1" })).toBe(archived);
    // A second business promoted and active: biz-1 cannot be unarchived beside it.
    const second = reducer(archived, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-2", at: 2 });
    expect(activeBusiness(second)?.id).toBe("biz-2");
    expect(reducer(second, { type: "UNARCHIVE_BUSINESS", businessId: "biz-1" })).toBe(second);
  });

  it("a LATER promotion starts a NEW record — Grow progress is never inherited (origin decision)", () => {
    let s = withValidatedIdea();
    s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "4.1", index: 0, at: 500 });
    s = reducer(s, { type: "ARCHIVE_BUSINESS", businessId: "biz-1" });
    s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-2", at: 2 });
    // Both records intact (archive + re-promote leaves the history whole)…
    expect(s.businesses?.map((b) => b.id)).toEqual(["biz-1", "biz-2"]);
    // …and the fresh record starts EMPTY: 4.1.1 is not done on the new business.
    expect(activeBusiness(s)?.id).toBe("biz-2");
    expect(isTaskDone(s, 0, "4.1", 0)).toBe(false);
    expect(activeBusiness(s)?.doneByTask).toBeUndefined();
    // businessFor answers the CURRENT (latest) record for the idea.
    expect(businessFor(s, "idea-a")?.id).toBe("biz-2");
  });

  it("other ideas remain playable through phases 1-3 AFTER a promotion (origin decision)", () => {
    let s = apply(
      initialState(),
      { type: "CREATE_IDEA", ideaId: "idea-a" },
      { type: "CLOSE_RUNNER" },
      { type: "CREATE_IDEA", ideaId: "idea-b" },
      { type: "CLOSE_RUNNER" },
    );
    for (const phase of ["sell", "build", "validate"] as const) s = completePhase(s, 0, phase);
    s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    // Idea B still plays 1.1 exactly as before the promotion.
    expect(isIdeaEligibleFor(s, 1, "1.1")).toBe(true);
    expect(ideasEligibleFor(s, "1.1")).toEqual([1]);
    expect(nextUpFor(s, 1)).toBe("1.1");
    s = completeCriterion(s, 1, "1.1");
    expect(isCriterionDone(s, 1, "1.1")).toBe(true);
    expect(nextUpFor(s, 1)).toBe("1.2");
  });

  it("a promoted business round-trips with its progress (save/load/HYDRATE)", () => {
    let s = withValidatedIdea();
    s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "4.1", index: 0, at: 500 });
    const parsed = fromSaveDoc(JSON.parse(JSON.stringify(toSaveDoc(s))));
    if (!parsed.ok) throw new Error("round-trip refused");
    const hydrated = reducer(initialState(), { type: "HYDRATE", doc: parsed.doc });
    expect(hydrated.businesses).toEqual(s.businesses);
    expect(isTaskDone(hydrated, 0, "4.1", 0)).toBe(true);
    expect(isStepUnlocked(hydrated, 0, "4.1")).toBe(true);
  });

  it("RESET_SESSION clears businesses minted by PROMOTE_IDEA (shared-device safety)", () => {
    let s = withValidatedIdea();
    s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    const reset = reducer(s, { type: "RESET_SESSION" });
    expect(reset.businesses).toBeUndefined();
    expect(activeBusinessExists(reset)).toBe(false);
  });

  it("VERIFICATION GATE: a scripted fresh save drives 1.1 -> 5.5 including the promotion, no dead end", () => {
    let s = apply(initialState(), { type: "CREATE_IDEA", ideaId: "idea-a" }, { type: "CLOSE_RUNNER" });
    let criteria = 0;
    let promotions = 0;
    for (;;) {
      const stepId = nextUpFor(s, 0);
      if (!stepId) {
        if (isPhaseComplete(s, 0, "scale")) break; // 5.5 done: the path's end
        // Gated frontier: this must be the promotion moment, exactly once.
        if (++promotions > 1) throw new Error("promotion gate hit twice");
        s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
        if (!activeBusinessExists(s)) throw new Error("promotion refused mid-walk");
        continue;
      }
      if (++criteria > 25) throw new Error("engine loop did not terminate");
      s = completeCriterion(s, 0, stepId);
      expect(s.celebrate).toBe(stepId);
      s = reducer(s, { type: "DISMISS_CELEBRATION" });
    }
    expect(criteria).toBe(25);
    expect(promotions).toBe(1);
    expect(isPhaseComplete(s, 0, "grow")).toBe(true);
    expect(isPhaseComplete(s, 0, "scale")).toBe(true);
    // Every grow/scale completion lives on the business, none on the idea.
    const businessDone = activeBusiness(s)?.doneByTask ?? {};
    expect(Object.keys(businessDone).every((k) => /^[45]\./.test(k))).toBe(true);
    expect(Object.keys(s.ideas[0].doneByTask ?? {}).some((k) => /^[45]\./.test(k))).toBe(false);
  });
});

// ── Unit 7 review fixes: idea-scoped Grow/Scale, archiveStateAt, UNION_REMOTE ─

/** Two caller-minted-id ideas both driven through Validate. */
function withTwoValidatedIdeas(): GameState {
  let s = apply(
    initialState(),
    { type: "CREATE_IDEA", ideaId: "idea-a" },
    { type: "CLOSE_RUNNER" },
    { type: "CREATE_IDEA", ideaId: "idea-b" },
    { type: "CLOSE_RUNNER" },
  );
  for (const phase of ["sell", "build", "validate"] as const) {
    s = completePhase(s, 0, phase);
    s = completePhase(s, 1, phase);
  }
  return reducer(s, { type: "DISMISS_CELEBRATION" });
}

describe("Grow/Scale are scoped to the PROMOTED idea (FIX 4)", () => {
  it("a second Validate-complete idea reports phase 4 LOCKED while another idea's business is active", () => {
    let s = withTwoValidatedIdeas();
    s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    // The promoted idea proceeds…
    expect(isPhaseUnlocked(s, 0, "grow")).toBe(true);
    expect(isStepUnlocked(s, 0, "4.1")).toBe(true);
    expect(nextUpFor(s, 0)).toBe("4.1");
    // …the OTHER validated idea stays locked out of 4-5 entirely.
    expect(isPhaseUnlocked(s, 1, "grow")).toBe(false);
    expect(isPhaseUnlocked(s, 1, "scale")).toBe(false);
    expect(isStepUnlocked(s, 1, "4.1")).toBe(false);
    expect(isIdeaEligibleFor(s, 1, "4.1")).toBe(false);
    expect(ideasEligibleFor(s, "4.1")).toEqual([0]);
    expect(nextUpFor(s, 1)).toBeNull();
  });

  it("COMPLETE_TASK addressed through the NON-promoted idea is a no-op (never credits the business)", () => {
    let s = withTwoValidatedIdeas();
    s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    const refused = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 1, stepId: "4.1", index: 0, at: 5 });
    expect(refused).toBe(s); // exact same state reference: a true no-op
    expect(activeBusiness(refused)?.doneByTask).toBeUndefined();
    // The promoted idea's dispatch writes the business as before.
    const done = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "4.1", index: 0, at: 5 });
    expect(activeBusiness(done)?.doneByTask).toEqual({ "4.1.1": true });
    // And the business's progress is only READABLE through the promoted idea.
    expect(isTaskDone(done, 0, "4.1", 0)).toBe(true);
    expect(isTaskDone(done, 1, "4.1", 0)).toBe(false);
  });
});

describe("archiveStateAt (FIX 2a: last-action-wins stamp)", () => {
  it("ARCHIVE_BUSINESS and UNARCHIVE_BUSINESS stamp the caller-provided `at`", () => {
    let s = withValidatedIdea();
    s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    expect(activeBusiness(s)?.archiveStateAt).toBeUndefined(); // promotion never stamps it
    s = reducer(s, { type: "ARCHIVE_BUSINESS", businessId: "biz-1", at: 500 });
    expect(s.businesses?.[0]).toMatchObject({ archived: true, archiveStateAt: 500 });
    s = reducer(s, { type: "UNARCHIVE_BUSINESS", businessId: "biz-1", at: 600 });
    expect(s.businesses?.[0]).toMatchObject({ archived: false, archiveStateAt: 600 });
  });

  it("a missing/malformed `at` still archives, just without a stamp (legacy dispatchers)", () => {
    let s = withValidatedIdea();
    s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    const noStamp = reducer(s, { type: "ARCHIVE_BUSINESS", businessId: "biz-1" });
    expect(noStamp.businesses?.[0].archived).toBe(true);
    expect(noStamp.businesses?.[0]).not.toHaveProperty("archiveStateAt");
    const badStamp = reducer(s, { type: "ARCHIVE_BUSINESS", businessId: "biz-1", at: Number.NaN });
    expect(badStamp.businesses?.[0]).not.toHaveProperty("archiveStateAt");
  });

  it("archiveStateAt round-trips the save doc (coerced like every timestamp leaf)", () => {
    let s = withValidatedIdea();
    s = reducer(s, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-1", at: 1 });
    s = reducer(s, { type: "ARCHIVE_BUSINESS", businessId: "biz-1", at: 500 });
    const parsed = fromSaveDoc(JSON.parse(JSON.stringify(toSaveDoc(s))));
    if (!parsed.ok) throw new Error("round-trip refused");
    expect(parsed.doc.businesses?.[0].archiveStateAt).toBe(500);
    // A malformed persisted stamp is dropped, never poisons the record.
    const bad = fromSaveDoc({
      docVersion: DOC_VERSION,
      ideas: [],
      activeIdea: 0,
      siteHeadline: "",
      onboardingComplete: false,
      businesses: [{ id: "biz-1", archived: true, archiveStateAt: -5 }],
    });
    if (!bad.ok) throw new Error("doc refused");
    expect(bad.doc.businesses?.[0]).toEqual({ id: "biz-1", archived: true });
  });
});

describe("normalizeBusinesses (FIX 2b: the one-active invariant, derived)", () => {
  it("archives every active business except the EARLIEST promoted (id tiebreak), stamping nothing", () => {
    const normalized = normalizeBusinesses([
      { id: "biz-late", archived: false, promotedAt: 500 },
      { id: "biz-early", archived: false, promotedAt: 300 },
      { id: "biz-old", archived: true, archiveStateAt: 10 },
    ]);
    expect(normalized).toEqual([
      { id: "biz-late", archived: true, promotedAt: 500 }, // derived: no archiveStateAt
      { id: "biz-early", archived: false, promotedAt: 300 },
      { id: "biz-old", archived: true, archiveStateAt: 10 },
    ]);
    // Deterministic tiebreaks: missing promotedAt sorts last; equal stamps use the id.
    const tie = normalizeBusinesses([
      { id: "biz-b", archived: false, promotedAt: 7 },
      { id: "biz-a", archived: false, promotedAt: 7 },
      { id: "biz-unstamped", archived: false },
    ]);
    expect(tie.filter((b) => !b.archived).map((b) => b.id)).toEqual(["biz-a"]);
  });

  it("returns the SAME list reference when the invariant already holds", () => {
    const ok = [{ id: "biz-1", archived: false }, { id: "biz-2", archived: true }];
    expect(normalizeBusinesses(ok)).toBe(ok);
  });

  it("fromSaveDoc normalizes a two-active doc so activeBusiness is deterministic", () => {
    const parsed = fromSaveDoc({
      docVersion: DOC_VERSION,
      ideas: [],
      activeIdea: 0,
      siteHeadline: "",
      onboardingComplete: false,
      businesses: [
        { id: "biz-late", archived: false, promotedAt: 500 },
        { id: "biz-early", archived: false, promotedAt: 300 },
      ],
    });
    if (!parsed.ok) throw new Error("doc refused");
    const hydrated = reducer(initialState(), { type: "HYDRATE", doc: parsed.doc });
    expect(activeBusiness(hydrated)?.id).toBe("biz-early");
    expect(hydrated.businesses?.filter((b) => !b.archived)).toHaveLength(1);
  });
});

describe("businessFor resolves the LATEST-promoted record regardless of list order", () => {
  it("a union-reshuffled list (newest record NOT last) still answers the current record", () => {
    const s: GameState = {
      ...withOneIdea(),
      businesses: [
        { id: "biz-2", ideaId: "idea-a", archived: false, promotedAt: 2 },
        { id: "biz-1", ideaId: "idea-a", archived: true, promotedAt: 1 },
      ],
    };
    expect(businessFor(s, "idea-a")?.id).toBe("biz-2");
  });
});

describe("UNION_REMOTE (FIX 1: the rebased doc feeds back into live state)", () => {
  it("two divergent timelines CONVERGE: the union shows both businesses and both completions, one active", () => {
    // Common base: two validated ideas. Tab A promotes idea-a and works Grow;
    // tab B (concurrently, from the same base) promotes idea-b EARLIER.
    const base = withTwoValidatedIdeas();
    let tabA = reducer(base, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-A", at: 100 });
    tabA = reducer(tabA, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "4.1", index: 0, at: 111 });
    let tabB = reducer(base, { type: "PROMOTE_IDEA", ideaId: "idea-b", businessId: "biz-B", at: 50 });
    tabB = reducer(tabB, { type: "COMPLETE_TASK", ideaIndex: 1, stepId: "4.1", index: 0, at: 55 });

    // Tab A receives tab B's rebased doc (what the sync engine committed).
    const converged = reducer(tabA, { type: "UNION_REMOTE", doc: toSaveDoc(tabB) });
    // BOTH business records exist; exactly ONE is active (earliest promotedAt).
    expect(converged.businesses?.map((b) => b.id).sort()).toEqual(["biz-A", "biz-B"]);
    expect(converged.businesses?.filter((b) => !b.archived).map((b) => b.id)).toEqual(["biz-B"]);
    // Both timelines' Grow completions survive on their own records.
    const bizA = converged.businesses?.find((b) => b.id === "biz-A");
    const bizB = converged.businesses?.find((b) => b.id === "biz-B");
    expect(bizA?.doneByTask).toEqual({ "4.1.1": true });
    expect(bizB?.doneByTask).toEqual({ "4.1.1": true });
    // The union is order-symmetric on the winner: tab B ∪ tab A agrees.
    const convergedB = reducer(tabB, { type: "UNION_REMOTE", doc: toSaveDoc(tabA) });
    expect(convergedB.businesses?.filter((b) => !b.archived).map((b) => b.id)).toEqual(["biz-B"]);
  });

  it("unions a concurrent tab's idea completions WITHOUT touching latest-intent fields", () => {
    let local = apply(initialState(), { type: "CREATE_IDEA", ideaId: "idea-a" }, { type: "CLOSE_RUNNER" });
    local = reducer(local, { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "my text" });
    local = reducer(local, { type: "SET_PROVIDER", providerId: "shopify", chosenAt: 1 });
    // The remote doc completed 1.1 for the same idea and holds different intent.
    let remote = apply(initialState(), { type: "CREATE_IDEA", ideaId: "idea-a" }, { type: "CLOSE_RUNNER" });
    remote = completeCriterion(remote, 0, "1.1");
    const remoteDoc = { ...toSaveDoc(remote), siteHeadline: "remote headline" };

    const merged = reducer(local, { type: "UNION_REMOTE", doc: remoteDoc });
    expect(isCriterionDone(merged, 0, "1.1")).toBe(true); // completion unioned in
    expect(merged.ideas[0].fields.oneLiner).toBe("my text"); // local intent kept
    expect(merged.profile.siteHeadline).toBe(local.profile.siteHeadline); // untouched
    expect(merged.chosenProvider).toEqual({ providerId: "shopify", chosenAt: 1 });
    expect(merged.activeIdea).toBe(local.activeIdea);
  });

  it("NEVER closes the runner or fires a celebration mid-session (marks state only)", () => {
    // The child is mid-1.1 in the runner; the remote doc has 1.1 fully done.
    const local = apply(initialState(), { type: "CREATE_IDEA", ideaId: "idea-a" });
    expect(local.runnerOpen).toBe(true);
    expect(local.runnerStep).toBe("1.1");
    let remote = apply(initialState(), { type: "CREATE_IDEA", ideaId: "idea-a" }, { type: "CLOSE_RUNNER" });
    remote = completeCriterion(remote, 0, "1.1");

    const merged = reducer(local, { type: "UNION_REMOTE", doc: toSaveDoc(remote) });
    // 1.1 is now done in live state, but nothing UI-visible fired: like the
    // load migration, the union marks state without dispatching behavior.
    expect(isCriterionDone(merged, 0, "1.1")).toBe(true);
    expect(merged.celebrate).toBeNull();
    expect(merged.runnerOpen).toBe(true);
    expect(merged.runnerStep).toBe("1.1");
    expect(merged.runnerIndex).toBe(local.runnerIndex);
  });

  it("appends a remote-only idea (divergent creation) without disturbing the local list", () => {
    const local = apply(initialState(), { type: "CREATE_IDEA", ideaId: "idea-a" }, { type: "CLOSE_RUNNER" });
    let remote = apply(initialState(), { type: "CREATE_IDEA", ideaId: "idea-z" }, { type: "CLOSE_RUNNER" });
    remote = reducer(remote, { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "their idea" });
    const merged = reducer(local, { type: "UNION_REMOTE", doc: toSaveDoc(remote) });
    expect(merged.ideas.map((i) => i.id)).toEqual(["idea-a", "idea-z"]);
    expect(merged.ideas[1].fields.oneLiner).toBe("their idea");
    expect(merged.activeIdea).toBe(0); // local intent untouched by the append
  });

  it("matches the exported unionCompletionMaps semantics exactly (shared contract)", () => {
    const base = withTwoValidatedIdeas();
    const tabA = reducer(base, { type: "PROMOTE_IDEA", ideaId: "idea-a", businessId: "biz-A", at: 100 });
    const tabB = reducer(base, { type: "PROMOTE_IDEA", ideaId: "idea-b", businessId: "biz-B", at: 50 });
    const viaReducer = reducer(tabA, { type: "UNION_REMOTE", doc: toSaveDoc(tabB) });
    const viaUnion = unionCompletionMaps(toSaveDoc(tabA), toSaveDoc(tabB));
    expect(toSaveDoc(viaReducer)).toEqual(viaUnion);
  });
});
