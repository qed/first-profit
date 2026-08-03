// @vitest-environment jsdom
/**
 * Factory-level Unit 8 surfaces: the Next Step coach's promote CTA + grow/scale
 * walking, and the idea-switcher dialog (SET_ACTIVE_IDEA only, any phase).
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
import { NextStepCoach, SwitcherDialog } from "../../screens/Factory";
import { FloorHarness, apply, completePhase, completeStep, validatedIdea, withIdeas } from "../../testSupport/floorHarness";
import type { WalkIntent } from "../FactoryFloor";
import type { Action, GameState } from "../../state/gameCore";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

afterEach(cleanup);

function mountCoach(seed: GameState) {
  const walks: WalkIntent[] = [];
  render(
    <FloorHarness seed={seed} Ctx={Ctx}>
      <NextStepCoach onWalk={(i) => walks.push(i)} />
    </FloorHarness>,
  );
  return { walks };
}

describe("NextStepCoach — promote CTA + full-path walking (Unit 8)", () => {
  it("shows 'Make it your business!' at the promotion seam and opens the promote screen", () => {
    const { walks } = mountCoach(validatedIdea(withIdeas(1), 0));
    expect(screen.getByText("Make it your business!")).toBeTruthy();
    fireEvent.click(screen.getByText("Next Step"));
    expect(walks).toEqual([{ kind: "openPromote" }]);
  });

  it("walks a BUILD criterion by its room name once Sell completes (post-allowlist expansion)", () => {
    const { walks } = mountCoach(completePhase(withIdeas(1), 0, "sell"));
    expect(screen.getByText("Take me to The Build Room")).toBeTruthy();
    fireEvent.click(screen.getByText("Next Step"));
    expect(walks).toEqual([{ kind: "enterCriterion", stepId: "2.1" }]);
  });

  it("walks GROW criteria for the promoted business (4.1 in the Checkout Booth)", () => {
    let s = validatedIdea(withIdeas(1), 0);
    s = apply(s, { type: "PROMOTE_IDEA", ideaId: "idea-0", businessId: "biz-1", at: 1 });
    const { walks } = mountCoach(s);
    expect(screen.getByText("Take me to The Checkout Booth")).toBeTruthy();
    fireEvent.click(screen.getByText("Next Step"));
    expect(walks).toEqual([{ kind: "enterCriterion", stepId: "4.1" }]);
  });

  it("hides once the whole path is done (terminal state)", () => {
    let s = validatedIdea(withIdeas(1), 0);
    s = apply(s, { type: "PROMOTE_IDEA", ideaId: "idea-0", businessId: "biz-1", at: 1 });
    for (const phase of ["grow", "scale"] as const) s = completePhase(s, 0, phase);
    mountCoach(s);
    expect(screen.queryByText("Next Step")).toBeNull();
  });

  it("hides while an overlay is open", () => {
    const s = { ...withIdeas(1), runnerOpen: true };
    mountCoach(s);
    expect(screen.queryByText("Next Step")).toBeNull();
  });
});

describe("SwitcherDialog — active-idea switching across phases (Unit 8)", () => {
  function mountSwitcher(seed: GameState) {
    const actions: Action[] = [];
    const closes: number[] = [];
    render(
      <FloorHarness seed={seed} Ctx={Ctx} onAction={(a) => actions.push(a)}>
        <SwitcherDialog open onClose={() => closes.push(1)} />
      </FloorHarness>,
    );
    return { actions, closes };
  }

  it("lists EVERY idea with progress (not just eligible ones) and marks the current", () => {
    let s = withIdeas(2);
    s = completeStep(s, 0, "1.1");
    s = apply(s, { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "Slime kits" });
    mountSwitcher(s);
    expect(screen.getByText("Slime kits")).toBeTruthy();
    expect(screen.getByText("Not named yet")).toBeTruthy();
    expect(screen.getByText("current")).toBeTruthy();
  });

  it("choosing an idea dispatches SET_ACTIVE_IDEA only, then closes (works mid-Build)", () => {
    let s = withIdeas(2);
    s = completePhase(s, 0, "sell"); // idea 0 is in Build; idea 1 (active) in Sell
    const { actions, closes } = mountSwitcher(s);
    fireEvent.click(screen.getByText("Idea #1"));
    expect(actions).toEqual([{ type: "SET_ACTIVE_IDEA", ideaIndex: 0 }]);
    expect(closes.length).toBe(1);
  });
});
