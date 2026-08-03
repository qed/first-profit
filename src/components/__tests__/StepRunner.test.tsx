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

import * as GameContext from "../../state/GameContext";
import { StepRunner } from "../StepRunner";
import { Celebration } from "../Celebration";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

function Harness({ seed }: { seed: GameState }) {
  const [state, dispatch] = React.useReducer(reducer, seed);
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
