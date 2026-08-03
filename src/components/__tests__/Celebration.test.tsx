// @vitest-environment jsdom
/**
 * The criterion-passed Celebration (unit review FIX 3): the next-step block is
 * HONEST — it only promises the next room when the celebrated (active) idea
 * can actually proceed into it, business gate included. Covers: the normal
 * next-room block, a phase-cross, the promotion pointer, the second-idea
 * blocked copy (another idea owns the business), and the terminal 5.5 state.
 * Drives the REAL reducer + engine via the shared floor harness.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../state/GameContext", async () => {
  const R = await import("react");
  const Ctx = R.createContext<unknown>(null);
  return { __ctx: Ctx, useGame: () => R.useContext(Ctx) };
});

import * as GameContext from "../../state/GameContext";
import { Celebration } from "../Celebration";
import { stepById } from "../../data/path";
import {
  FloorHarness,
  apply,
  completePhase,
  completeStep,
  validatedIdea,
  withIdeas,
} from "../../testSupport/floorHarness";
import type { Action, GameState } from "../../state/gameCore";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

afterEach(cleanup);

function mount(seed: GameState) {
  const actions: Action[] = [];
  render(
    <FloorHarness seed={seed} Ctx={Ctx} onAction={(a) => actions.push(a)}>
      <Celebration />
    </FloorHarness>,
  );
  return { actions };
}

/** Complete every task of `stepId` WITHOUT dismissing: leaves celebrate set. */
function finishInto(state: GameState, ideaIndex: number, stepId: string): GameState {
  const step = stepById(stepId)!;
  return step.tasks.reduce(
    (s, _t, index) => apply(s, { type: "COMPLETE_TASK", ideaIndex, stepId, index }),
    state,
  );
}

describe("Celebration — honest next-step (unit review FIX 3)", () => {
  it("normal next-room: passing 1.1 promises 1.2 · The Sales Room", () => {
    const seed = finishInto(withIdeas(1), 0, "1.1");
    expect(seed.celebrate).toBe("1.1");
    mount(seed);
    expect(screen.getByText("Criterion passed")).toBeTruthy();
    expect(screen.getByText("New on The Path")).toBeTruthy();
    expect(screen.getByText("1.2 · The Sales Room")).toBeTruthy();
  });

  it("phase-cross: passing 1.5 promises 2.1 · The Build Room (Build unlocked)", () => {
    let s = withIdeas(1);
    for (const id of ["1.1", "1.2", "1.3", "1.4"]) s = completeStep(s, 0, id);
    s = finishInto(s, 0, "1.5");
    expect(s.celebrate).toBe("1.5");
    mount(s);
    expect(screen.getByText("2.1 · The Build Room")).toBeTruthy();
  });

  it("promotion pointer: passing 3.5 with NO business points at promotion, not 4.1", () => {
    let s = withIdeas(1);
    for (const phase of ["sell", "build"] as const) s = completePhase(s, 0, phase);
    for (const id of ["3.1", "3.2", "3.3", "3.4"]) s = completeStep(s, 0, id);
    s = finishInto(s, 0, "3.5");
    expect(s.celebrate).toBe("3.5");
    mount(s);
    expect(screen.getByText("🏢 Make it your business")).toBeTruthy();
    expect(screen.queryByText("New on The Path")).toBeNull();
    expect(screen.queryByText(/4\.1/)).toBeNull();
  });

  it("second-idea blocked: passing 3.5 while ANOTHER idea owns the business shows the honest waits-here copy, never 4.1", () => {
    // Idea #1 is the promoted business; idea #2 (active) then finishes Validate.
    let s = withIdeas(2);
    s = validatedIdea(s, 0);
    s = apply(s, { type: "PROMOTE_IDEA", ideaId: "idea-0", businessId: "biz-1", at: 1 });
    for (const phase of ["sell", "build"] as const) s = completePhase(s, 1, phase);
    for (const id of ["3.1", "3.2", "3.3", "3.4"]) s = completeStep(s, 1, id);
    s = finishInto(s, 1, "3.5");
    expect(s.celebrate).toBe("3.5");
    expect(s.activeIdea).toBe(1);
    mount(s);
    expect(screen.getByText("Your business is a different idea")).toBeTruthy();
    expect(screen.getByText(/This one waits here/)).toBeTruthy();
    // No false promises: neither the next-room block nor the promote pointer.
    expect(screen.queryByText("New on The Path")).toBeNull();
    expect(screen.queryByText(/4\.1/)).toBeNull();
    expect(screen.queryByText("🏢 Make it your business")).toBeNull();
  });

  it("terminal 5.5: path-complete chrome, no next-step block, Back to the floor dismisses", () => {
    let s = validatedIdea(withIdeas(1), 0);
    s = apply(s, { type: "PROMOTE_IDEA", ideaId: "idea-0", businessId: "biz-1", at: 1 });
    s = completePhase(s, 0, "grow");
    for (const id of ["5.1", "5.2", "5.3", "5.4"]) s = completeStep(s, 0, id);
    s = finishInto(s, 0, "5.5");
    expect(s.celebrate).toBe("5.5");
    const { actions } = mount(s);
    expect(screen.getByText("Path complete")).toBeTruthy();
    expect(screen.getByText("You built the whole path")).toBeTruthy();
    expect(screen.queryByText("New on The Path")).toBeNull();
    expect(screen.queryByText("🏢 Make it your business")).toBeNull();
    fireEvent.click(screen.getByText("Back to the floor"));
    expect(actions).toContainEqual({ type: "DISMISS_CELEBRATION" });
  });

  it("uses no em dashes in any celebration copy", () => {
    const seed = finishInto(withIdeas(1), 0, "1.1");
    mount(seed);
    expect(document.body.textContent).not.toMatch(/—/);
  });
});
