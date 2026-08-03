// @vitest-environment jsdom
/**
 * Step Runner + Celebration render checks. These drive the REAL gameCore reducer
 * (not a stub) through a minimal test provider so the UI is verified end to end:
 * typing into a criterion field mirrors to the account-scoped draft cache, and
 * completing the last task of a criterion swaps the runner for the celebration
 * that lists the next unlocked room. The live 390px pixel pass is Unit 12.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  reducer,
  initialState,
  taskKey,
  isTaskDone as isTaskDoneFn,
  type GameState,
} from "../../state/gameCore";

// A real React context stands in for GameContext; useGame reads it.
vi.mock("../../state/GameContext", async () => {
  const R = await import("react");
  const Ctx = R.createContext<unknown>(null);
  return { __ctx: Ctx, useGame: () => R.useContext(Ctx) };
});

// Deterministic draft cache keyed to a fixed user (exercises the R6 mirror).
vi.mock("../../lib/draftCache", () => {
  const store = new Map<string, string>();
  return {
    getLastUserId: () => "user-1",
    getDraft: (userId: string, name: string) => {
      const raw = store.get(`${userId}:${name}`);
      return raw === undefined ? undefined : JSON.parse(raw);
    },
    setDraft: (userId: string, name: string, value: unknown) => {
      store.set(`${userId}:${name}`, JSON.stringify(value));
    },
  };
});

// Replace StuckBox with a prop-probe stub (its own behavior has its own suite);
// taskIdFor stays REAL so StepRunner's synthesized task id is pinned here.
vi.mock("../StuckBox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../StuckBox")>();
  return {
    ...actual,
    StuckBox: ({ taskId }: { taskId: string }) => (
      <div data-testid="fp-stuckbox" data-taskid={taskId} />
    ),
  };
});

import * as GameContext from "../../state/GameContext";
import { StepRunner } from "../StepRunner";
import { Celebration } from "../Celebration";
import { taskIdFor } from "../StuckBox";
import { phaseById, STEPS } from "../../data/path";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

/** jsdom normalizes inline hsl() to rgba(); compare through the same pipe. */
function cssBackground(value: string): string {
  const el = document.createElement("div");
  el.style.background = value;
  return el.style.background;
}
function cssColor(value: string): string {
  const el = document.createElement("div");
  el.style.color = value;
  return el.style.color;
}

function Harness({ seed, onAction }: { seed: GameState; onAction?: (a: unknown) => void }) {
  const [state, rawDispatch] = React.useReducer(reducer, seed);
  const dispatch: typeof rawDispatch = (action) => {
    onAction?.(action);
    rawDispatch(action);
  };
  const value = {
    ...state,
    dispatch,
    isTaskDone: (ideaIndex: number, stepId: string, index: number) =>
      isTaskDoneFn(state, ideaIndex, stepId, index),
  };
  return (
    <Ctx.Provider value={value}>
      <StepRunner />
      <Celebration />
    </Ctx.Provider>
  );
}

/** State with idea #0 at 1.1's final task, first four tasks already done. */
function seedAtLastTaskOf11(): GameState {
  const s = initialState();
  const done: Record<string, boolean> = {};
  for (let i = 0; i < 4; i++) done[taskKey("1.1", i)] = true;
  return {
    ...s,
    stage: "app",
    ideas: [{ fields: {}, done }],
    activeIdea: 0,
    runnerOpen: true,
    runnerStep: "1.1",
    runnerIndex: 4,
  };
}

afterEach(cleanup);

describe("StepRunner", () => {
  it("shows the criterion header, task rail count, and done-when for 1.1", () => {
    render(<Harness seed={seedAtLastTaskOf11()} />);
    expect(screen.getByText("Phase 1 · Sell · Criterion 1 of 5 · Idea #1")).toBeTruthy();
    expect(screen.getByText("Task 5 of 5")).toBeTruthy();
    expect(screen.getByText("Done when")).toBeTruthy();
    // Real path.ts copy, em-dash free.
    expect(document.body.textContent).not.toMatch(/—/);
  });

  it("renders the productName + oneLiner inputs on task 1 and mirrors keystrokes into the reducer", () => {
    const s = seedAtLastTaskOf11();
    render(<Harness seed={{ ...s, runnerIndex: 0, ideas: [{ fields: {}, done: {} }] }} />);
    const nameInput = screen.getByLabelText("Product name") as HTMLInputElement;
    const linerInput = screen.getByLabelText("Your one-liner") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Bracelets" } });
    fireEvent.change(linerInput, { target: { value: "My idea" } });
    expect((screen.getByLabelText("Product name") as HTMLInputElement).value).toBe("Bracelets");
    expect((screen.getByLabelText("Your one-liner") as HTMLInputElement).value).toBe("My idea");
  });

  it("doIt dispatches COMPLETE_TASK with a NUMERIC caller-stamped `at` (R13 stall queryability)", () => {
    const actions: unknown[] = [];
    render(<Harness seed={seedAtLastTaskOf11()} onAction={(a) => actions.push(a)} />);
    fireEvent.click(screen.getByText("✓ I did it"));
    const complete = actions.find(
      (a): a is { type: string; ideaIndex: number; stepId: string; index: number; at: unknown } =>
        (a as { type?: string }).type === "COMPLETE_TASK",
    );
    expect(complete).toBeDefined();
    if (!complete) throw new Error("COMPLETE_TASK was not dispatched");
    expect(complete).toMatchObject({ ideaIndex: 0, stepId: "1.1", index: 4 });
    expect(typeof complete.at).toBe("number");
    expect(Number.isFinite(complete.at as number)).toBe(true);
  });

  it("renders StuckBox with taskId = taskIdFor(runnerStep, idx)", () => {
    // 1.1 at task index 4 -> "1.1.5".
    const first = render(<Harness seed={seedAtLastTaskOf11()} />);
    expect(screen.getByTestId("fp-stuckbox").getAttribute("data-taskid")).toBe(
      taskIdFor("1.1", 4),
    );
    first.unmount();

    // 1.2 at task index 2 -> "1.2.3".
    const s = seedAtLastTaskOf11();
    render(<Harness seed={{ ...s, runnerStep: "1.2", runnerIndex: 2 }} />);
    expect(screen.getByTestId("fp-stuckbox").getAttribute("data-taskid")).toBe(
      taskIdFor("1.2", 2),
    );
  });

  it("renders PHASE-AWARE header chrome on a Build criterion (2.1)", () => {
    const s = initialState();
    const seed: GameState = {
      ...s,
      stage: "app",
      ideas: [{ fields: {}, done: {} }],
      activeIdea: 0,
      runnerOpen: true,
      runnerStep: "2.1",
      runnerIndex: 0,
    };
    render(<Harness seed={seed} />);
    expect(screen.getByText("Phase 2 · Build · Criterion 1 of 5 · Idea #1")).toBeTruthy();
    expect(screen.getByText("Ship the smallest thing that works")).toBeTruthy();
  });

  it("the task rail shows SIX segments on 2.3 (variable task counts honored)", () => {
    const s = initialState();
    const seed: GameState = {
      ...s,
      stage: "app",
      ideas: [{ fields: {}, done: {} }],
      activeIdea: 0,
      runnerOpen: true,
      runnerStep: "2.3",
      runnerIndex: 0,
    };
    const { container } = render(<Harness seed={seed} />);
    // Criterion position derives from the phase's ordered ids, not the raw id digit.
    expect(screen.getByText("Phase 2 · Build · Criterion 3 of 5 · Idea #1")).toBeTruthy();
    expect(screen.getByText("Task 1 of 6")).toBeTruthy();
    // One rail segment bar per REAL task: 2.3 carries six.
    expect(container.querySelectorAll(".h-1\\.5").length).toBe(6);
  });

  it("shows the idea one-liner in the header once authored (idea context, Unit 8)", () => {
    const s = seedAtLastTaskOf11();
    render(
      <Harness
        seed={{ ...s, ideas: [{ fields: { oneLiner: "Bracelets" }, done: s.ideas[0].done }] }}
      />,
    );
    expect(screen.getByText("Phase 1 · Sell · Criterion 1 of 5 · Idea #1 · Bracelets")).toBeTruthy();
  });

  it("shows the BUSINESS name in the header on a Grow criterion (4.1)", () => {
    const s = initialState();
    const seed: GameState = {
      ...s,
      stage: "app",
      ideas: [{ id: "idea-a", fields: { oneLiner: "Slime kits" }, done: {} }],
      activeIdea: 0,
      businesses: [{ id: "biz-1", ideaId: "idea-a", archived: false }],
      runnerOpen: true,
      runnerStep: "4.1",
      runnerIndex: 0,
    };
    render(<Harness seed={seed} />);
    expect(
      screen.getByText("Phase 4 · Grow · Criterion 1 of 5 · Your business · Slime kits"),
    ).toBeTruthy();
  });

  it("themes the runner chrome in PHASE COLORS on a Build criterion (2.1)", () => {
    const s = initialState();
    const seed: GameState = {
      ...s,
      stage: "app",
      ideas: [{ fields: {}, done: {} }],
      activeIdea: 0,
      runnerOpen: true,
      runnerStep: "2.1",
      runnerIndex: 0,
    };
    const { container } = render(<Harness seed={seed} />);
    const build = phaseById("build");
    // Header wash + label text carry the Build hsl chrome from PHASES (jsdom
    // normalizes hsl to rgba, so compare via the same normalization).
    const header = container.querySelector("header") as HTMLElement;
    expect(header.style.background).toBe(cssBackground(build.wash));
    const label = screen.getByText(/Phase 2 · Build · Criterion 1 of 5/) as HTMLElement;
    expect(label.style.color).toBe(cssColor(build.text));
    // The primary CTA takes the Build ctaFill (non-sell phases only) — the
    // WCAG-safe deepened fill, never the raw accent (unit review FIX 4).
    const cta = screen.getByText("✓ I did it") as HTMLElement;
    expect(cta.style.background).toBe(cssBackground(build.ctaFill));
    const shadowProbe = document.createElement("div");
    shadowProbe.style.boxShadow = `0 5px 0 ${build.ctaShadow}`;
    expect(cta.style.boxShadow).toBe(shadowProbe.style.boxShadow);
  });

  it("keeps the SELL runner exactly as before Unit 8 (verified-green CTA, sell wash)", () => {
    const { container } = render(<Harness seed={seedAtLastTaskOf11()} />);
    const header = container.querySelector("header") as HTMLElement;
    // The exact pre-Unit-8 header wash: hsl(14 78% 54% / 0.09).
    expect(header.style.background).toBe(cssBackground("hsl(14 78% 54% / 0.09)"));
    expect(header.style.background).toBe(cssBackground(phaseById("sell").wash));
    // Sell's CTA keeps the bg-verified class with NO inline phase override.
    const cta = screen.getByText("✓ I did it") as HTMLElement;
    expect(cta.className).toContain("bg-verified");
    expect(cta.style.background).toBe("");
  });

  it("completing the last task swaps the runner for the celebration listing 1.2", () => {
    render(<Harness seed={seedAtLastTaskOf11()} />);
    fireEvent.click(screen.getByText("✓ I did it"));
    // Celebration replaces the runner.
    expect(screen.getByText("Criterion passed")).toBeTruthy();
    expect(screen.getByText("Pitch a product in 60 seconds, no notes")).toBeTruthy();
    expect(screen.getByText("+60 XP")).toBeTruthy();
    expect(screen.getByText("1.2 · The Sales Room")).toBeTruthy();
    // Only one modal: the runner's action button is gone.
    expect(screen.queryByText("✓ I did it")).toBeNull();
  });
});

describe("Celebration after 1.2", () => {
  it("lists 1.3 · The Learning Room when 1.2 is passed", () => {
    const s = initialState();
    // 1.1 fully done, 1.2 done except its last task; runner on 1.2's last task.
    const done: Record<string, boolean> = {};
    for (let i = 0; i < 5; i++) done[taskKey("1.1", i)] = true;
    for (let i = 0; i < 4; i++) done[taskKey("1.2", i)] = true;
    const seed: GameState = {
      ...s,
      stage: "app",
      ideas: [{ fields: {}, done }],
      activeIdea: 0,
      runnerOpen: true,
      runnerStep: "1.2",
      runnerIndex: 4,
    };
    render(<Harness seed={seed} />);
    fireEvent.click(screen.getByText("✓ I did it"));
    expect(screen.getByText("Criterion passed")).toBeTruthy();
    expect(screen.getByText("Make a real sale")).toBeTruthy();
    expect(screen.getByText("+120 XP")).toBeTruthy();
    expect(screen.getByText("1.3 · The Learning Room")).toBeTruthy();
  });
});

describe("Celebration across phase boundaries (Unit 8)", () => {
  /** Legacy-key done map covering every task of the given criteria (the
   *  engine's isTaskDone falls back to the legacy map for phases 1-3). */
  function doneFor(...stepIds: string[]): Record<string, boolean> {
    const done: Record<string, boolean> = {};
    for (const stepId of stepIds) {
      const step = STEPS.find((s) => s.id === stepId)!;
      for (let i = 0; i < step.tasks.length; i++) done[taskKey(stepId, i)] = true;
    }
    return done;
  }

  /** Celebrating `celebrate` with all criteria up TO AND INCLUDING it done —
   *  honest progress, matching what the reducer produces in real play (the
   *  FIX 3 gating hides the next-room block for dishonest synthetic states). */
  function seedCelebrating(celebrate: string): GameState {
    const upTo = STEPS.slice(0, STEPS.findIndex((s) => s.id === celebrate) + 1).map((s) => s.id);
    return {
      ...initialState(),
      stage: "app",
      ideas: [{ fields: {}, done: doneFor(...upTo) }],
      activeIdea: 0,
      celebrate,
    };
  }

  it("at 1.5 (phase boundary) the next-step block names 2.1 · The Build Room", () => {
    render(<Harness seed={seedCelebrating("1.5")} />);
    expect(screen.getByText("Criterion passed")).toBeTruthy();
    expect(screen.getByText("25 supervised outreach attempts")).toBeTruthy();
    expect(screen.getByText("+100 XP")).toBeTruthy();
    // Unit 8: the block generalizes across the boundary via Step.roomName.
    expect(screen.getByText("New on The Path")).toBeTruthy();
    expect(screen.getByText("2.1 · The Build Room")).toBeTruthy();
  });

  it("at 2.5 (Build -> Validate boundary) it names 3.1 · The Loop Bench", () => {
    render(<Harness seed={seedCelebrating("2.5")} />);
    expect(screen.getByText("3.1 · The Loop Bench")).toBeTruthy();
  });

  it("at 3.5 with NO business it points at PROMOTION, not a room", () => {
    render(<Harness seed={seedCelebrating("3.5")} />);
    expect(screen.getByText("Criterion passed")).toBeTruthy();
    expect(screen.queryByText("New on The Path")).toBeNull();
    expect(screen.getByText(/Make it your business/)).toBeTruthy();
    expect(screen.getByText(/Promote it to open Phase 4/)).toBeTruthy();
  });

  it("at 3.5 WITH an active business it names 4.1 · The Checkout Booth", () => {
    const seed = seedCelebrating("3.5");
    seed.ideas = [{ ...seed.ideas[0], id: "idea-a" }];
    seed.businesses = [{ id: "biz-1", ideaId: "idea-a", archived: false }];
    render(<Harness seed={seed} />);
    expect(screen.queryByText(/Promote it to open/)).toBeNull();
    expect(screen.getByText("4.1 · The Checkout Booth")).toBeTruthy();
  });

  it("at 5.5 the TERMINAL state uses the Celebration chrome with terminal copy, no next-step CTA", () => {
    render(<Harness seed={seedCelebrating("5.5")} />);
    expect(screen.getByText("Path complete")).toBeTruthy();
    expect(screen.getByText("You built the whole path")).toBeTruthy();
    expect(screen.getByText("+200 XP")).toBeTruthy();
    expect(screen.queryByText("New on The Path")).toBeNull();
    expect(screen.queryByText("Keep going →")).toBeNull();
    // No em dashes in the terminal copy (house rule).
    expect(document.body.textContent).not.toMatch(/—/);
    // Dismiss works from the terminal state too.
    fireEvent.click(screen.getByText("Back to the floor"));
    expect(screen.queryByText("Path complete")).toBeNull();
  });
});
