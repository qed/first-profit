// @vitest-environment jsdom
/**
 * The Path overview (Unit 8): the phase 2-5 cards are REAL — unlock/done/pips
 * from the engine for the ACTIVE idea, phase-floor entry intents, the locked
 * dashed treatment with gate copy, and the Grow promotion affordance. Idea
 * identity lives in the GlobalNav's chip now, not on the floor.
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
import { PhasesFloor } from "../PhasesFloor";
import { FloorHarness, apply, completePhase, validatedIdea, withIdeas } from "../../testSupport/floorHarness";
import type { WalkIntent } from "../FactoryFloor";
import type { GameState } from "../../state/gameCore";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

function mount(seed: GameState) {
  const walks: WalkIntent[] = [];
  const utils = render(
    <FloorHarness seed={seed} Ctx={Ctx}>
      <PhasesFloor onWalk={(i) => walks.push(i)} />
    </FloorHarness>,
  );
  return { walks, ...utils };
}

afterEach(cleanup);

describe("PhasesFloor — real phase cards (Unit 8)", () => {
  it("renders all five phases; only Sell unlocked on a fresh idea, others dashed-locked", () => {
    const { walks } = mount(withIdeas(1));
    for (const name of ["Sell", "Build", "Validate", "Grow", "Scale"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.getByText("Complete Sell first")).toBeTruthy();
    expect(screen.getByText("Complete Build first")).toBeTruthy();
    expect(screen.getByText("Complete Validate first")).toBeTruthy();
    expect(screen.getByText("Complete Grow first")).toBeTruthy();
    // Tapping the unlocked Sell card opens ITS criterion floor.
    fireEvent.click(screen.getByText("Sell").closest("button") as HTMLButtonElement);
    expect(walks).toEqual([{ kind: "openPhaseFloor", phase: "sell" }]);
  });

  it("a saved idea's Products card is a button that opens the idea summary (openIdea intent)", () => {
    const { walks } = mount(withIdeas(2));
    const card = screen.getByRole("button", { name: /Open Idea #2/i });
    fireEvent.click(card);
    expect(walks).toEqual([{ kind: "openIdea", ideaIndex: 1 }]);
  });

  it("empty Products slots stay inert (no button, no intent)", () => {
    mount(withIdeas(1));
    expect(screen.queryByRole("button", { name: /Open Idea #3/i })).toBeNull();
  });

  it("unlocks Build for the ACTIVE idea once its Sell phase completes; tap opens the Build floor", () => {
    const { walks } = mount(completePhase(withIdeas(1), 0, "sell"));
    expect(screen.queryByText("Complete Sell first")).toBeNull();
    fireEvent.click(screen.getByText("Build").closest("button") as HTMLButtonElement);
    expect(walks).toEqual([{ kind: "openPhaseFloor", phase: "build" }]);
    // Sell reads complete: 5/5 criteria.
    expect(screen.getByText("5/5 criteria")).toBeTruthy();
  });

  it("keeps phases locked for the ACTIVE idea even when another idea is further (active-idea IA)", () => {
    let s = withIdeas(2);
    s = completePhase(s, 0, "sell");
    s = apply(s, { type: "SET_ACTIVE_IDEA", ideaIndex: 1 });
    mount(s);
    expect(screen.getByText("Complete Sell first")).toBeTruthy(); // idea 1's view
  });

  it("makes the locked Grow card a PROMOTION affordance when an idea is validated and unpromoted", () => {
    const { walks } = mount(validatedIdea(withIdeas(1), 0));
    const hint = screen.getByText("Promote an idea first");
    const card = hint.closest("button");
    expect(card).toBeTruthy(); // tappable despite staying dashed-locked
    fireEvent.click(card as HTMLButtonElement);
    expect(walks).toEqual([{ kind: "openPromote" }]);
  });

  it("points the active idea's locked Grow at the switcher when the business is a DIFFERENT idea", () => {
    let s = withIdeas(2);
    s = validatedIdea(s, 0);
    s = apply(s, { type: "PROMOTE_IDEA", ideaId: "idea-0", businessId: "biz-1", at: 1 });
    s = apply(s, { type: "SET_ACTIVE_IDEA", ideaIndex: 1 });
    mount(s);
    expect(screen.getByText("Your business is a different idea")).toBeTruthy();
  });

  it("renders no idea-switcher chip (idea identity lives in the GlobalNav)", () => {
    mount(withIdeas(2));
    expect(screen.queryByLabelText("Switch idea")).toBeNull();
  });

  it("uses no em dashes anywhere", () => {
    mount(validatedIdea(withIdeas(1), 0));
    expect(document.body.textContent).not.toMatch(/—/);
  });
});
