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

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

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

describe("Celebration beyond the Sell room map (FIX-4 coverage)", () => {
  function seedCelebrating(celebrate: string): GameState {
    return {
      ...initialState(),
      stage: "app",
      ideas: [{ fields: {}, done: {} }],
      activeIdea: 0,
      celebrate,
    };
  }

  it("at 1.5 (phase boundary: next is 2.1) the 'New on The Path' block hides, no crash", () => {
    render(<Harness seed={seedCelebrating("1.5")} />);
    expect(screen.getByText("Criterion passed")).toBeTruthy();
    expect(screen.getByText("25 supervised outreach attempts")).toBeTruthy();
    expect(screen.getByText("+100 XP")).toBeTruthy();
    // 2.1 has no SELL_ROOMS entry -> the unlock block simply hides.
    expect(screen.queryByText("New on The Path")).toBeNull();
  });

  it("at 5.5 (terminal criterion: no next id at all) it renders cleanly", () => {
    render(<Harness seed={seedCelebrating("5.5")} />);
    expect(screen.getByText("Criterion passed")).toBeTruthy();
    expect(screen.getByText("Pitch next year, on stage")).toBeTruthy();
    expect(screen.getByText("+200 XP")).toBeTruthy();
    expect(screen.queryByText("New on The Path")).toBeNull();
    // Dismiss works from the terminal state too.
    fireEvent.click(screen.getByText("Keep going →"));
    expect(screen.queryByText("Criterion passed")).toBeNull();
  });
});
