import { describe, expect, it } from "vitest";
import { STEPS, parseTask, stepById } from "../../data/path";
import {
  DOC_VERSION,
  MAX_IDEAS,
  PLAYABLE_STEPS,
  type Action,
  type GameState,
  fromSaveDoc,
  grossSalesSumCents,
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
    expect(s.profile).toEqual({ firstName: "Cedric", handle: "cedric", siteHeadline: "" });
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

  it("sellProgress counts across 1.1 + 1.2 using real path.ts task counts", () => {
    const total = getStep("1.1").tasks.length + getStep("1.2").tasks.length;
    let s = withOneIdea();
    expect(sellProgress(s, 0)).toEqual({ done: 0, total });
    s = completeCriterion(s, 0, "1.1");
    expect(sellProgress(s, 0)).toEqual({ done: getStep("1.1").tasks.length, total });
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
