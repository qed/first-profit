// @vitest-environment jsdom
/**
 * The generalized criterion floor (Unit 8): phase parameterization, locked
 * states (the existing dashed treatment), phase colors from PHASES, and the
 * business context on the Grow/Scale floors. Drives the REAL reducer + engine.
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
import { CriterionFloor } from "../CriterionFloor";
import { phaseById } from "../../data/path";
import { roomEntryFor } from "../../state/floorSelectors";
import { FloorHarness, completePhase, completeStep, validatedIdea, withIdeas, apply } from "../../testSupport/floorHarness";
import type { WalkIntent } from "../FactoryFloor";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

function mount(seed = withIdeas(1), phase: Parameters<typeof phaseById>[0] = "build") {
  const walks: WalkIntent[] = [];
  const opened: string[] = [];
  const utils = render(
    <FloorHarness seed={seed} Ctx={Ctx}>
      <CriterionFloor
        phase={phase}
        onWalk={(i) => walks.push(i)}
        onBack={() => opened.push("back")}
        onOpenSwitcher={() => opened.push("switcher")}
      />
    </FloorHarness>,
  );
  return { walks, opened, ...utils };
}

afterEach(cleanup);

describe("CriterionFloor — phase parameterization", () => {
  it("renders the Build floor header 'Phase 2 · Build' with the phase promise and all five rooms", () => {
    const seed = completePhase(withIdeas(1), 0, "sell");
    mount(seed, "build");
    expect(screen.getByText("Phase 2 · Build")).toBeTruthy();
    expect(screen.getByText("Ship a real thing people can buy.")).toBeTruthy();
    for (const id of ["2.1", "2.2", "2.3", "2.4", "2.5"]) {
      expect(screen.getByText(id)).toBeTruthy();
    }
    expect(screen.getAllByText("The Build Room").length).toBe(2); // 2.1 + 2.4
    expect(screen.getByText("The Demo Stage")).toBeTruthy();
  });

  it("colors the header label with the phase's text color from PHASES", () => {
    mount(completePhase(withIdeas(1), 0, "sell"), "validate");
    const label = screen.getByText("Phase 3 · Validate") as HTMLElement;
    const probe = document.createElement("div");
    probe.style.color = phaseById("validate").text;
    expect(label.style.color).toBe(probe.style.color);
  });

  it("marks the frontier criterion 'You are here' and locks the rest with 'Complete X first'", () => {
    const seed = completePhase(withIdeas(1), 0, "sell");
    mount(seed, "build");
    expect(screen.getByText("You are here")).toBeTruthy(); // 2.1
    expect(screen.getByText("Complete 2.1 first")).toBeTruthy();
    expect(screen.getByText("Complete 2.4 first")).toBeTruthy();
  });

  it("locks the WHOLE floor when the phase is locked (first card names the phase gate)", () => {
    mount(withIdeas(1), "build"); // sell not complete
    expect(screen.getByText("Complete Sell first")).toBeTruthy();
    expect(screen.queryByText("You are here")).toBeNull();
  });

  it("shows the Your Ideas row on the SELL floor only", () => {
    const first = mount(withIdeas(1), "sell");
    expect(screen.getByText("Your Ideas")).toBeTruthy();
    expect(screen.getByText("Start Idea #2")).toBeTruthy();
    first.unmount();
    mount(withIdeas(1), "build");
    expect(screen.queryByText("Your Ideas")).toBeNull();
  });

  it("emits enterCriterion walk intents from unlocked cards", () => {
    const seed = completePhase(withIdeas(1), 0, "sell");
    const { walks } = mount(seed, "build");
    fireEvent.click(screen.getAllByText("The Build Room")[0].closest("button") as HTMLButtonElement);
    expect(walks).toEqual([{ kind: "enterCriterion", stepId: "2.1" }]);
  });

  it("shows the idea-switcher chip on phases 1-3 and routes its tap up", () => {
    const seed = apply(
      completePhase(withIdeas(1), 0, "sell"),
      { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "Slime kits" },
    );
    const { opened } = mount(seed, "build");
    const chip = screen.getByLabelText("Switch idea");
    expect(chip.textContent).toContain("Idea #1");
    expect(chip.textContent).toContain("Slime kits");
    fireEvent.click(chip);
    expect(opened).toEqual(["switcher"]);
  });
});

describe("CriterionFloor — Grow/Scale business context (Tier C2)", () => {
  function promotedSeed() {
    let s = validatedIdea(withIdeas(1), 0);
    s = apply(s, {
      type: "SET_FIELD",
      ideaIndex: 0,
      key: "oneLiner",
      value: "Slime kits",
    });
    s = apply(s, { type: "PROMOTE_IDEA", ideaId: "idea-0", businessId: "biz-1", at: 1 });
    return s;
  }

  it("renders the business chip (promoted idea's one-liner) instead of the idea switcher", () => {
    mount(promotedSeed(), "grow");
    expect(screen.getByText(/Your business · Slime kits/)).toBeTruthy();
    expect(screen.queryByLabelText("Switch idea")).toBeNull();
    // Card meta carries the business name too.
    expect(screen.getAllByText(/unit tasks · Slime kits/).length).toBeGreaterThan(0);
  });

  it("unlocks 4.1 for the promoted business and walks progress through the business record", () => {
    let s = promotedSeed();
    mount(s, "grow");
    expect(screen.getByText("You are here")).toBeTruthy(); // 4.1 workable
    cleanup();
    s = completeStep(s, 0, "4.1");
    mount(s, "grow");
    expect(screen.getByText("Complete 4.2 first")).toBeTruthy(); // 4.3 locked behind 4.2
  });

  it("keeps Grow locked with 'Promote an idea first' when validated but unpromoted", () => {
    mount(validatedIdea(withIdeas(1), 0), "grow");
    expect(screen.getByText("Promote an idea first")).toBeTruthy();
    expect(screen.queryByText("You are here")).toBeNull();
  });

  it("locks Scale behind Grow for the promoted business", () => {
    mount(promotedSeed(), "scale");
    expect(screen.getByText("Complete Grow first")).toBeTruthy();
  });

  it("uses no em dashes anywhere on the floor", () => {
    mount(promotedSeed(), "grow");
    expect(document.body.textContent).not.toMatch(/—/);
  });
});

describe("CriterionFloor — honest cards for the ACTIVE idea (unit review FIX 2)", () => {
  /** Idea #1 finished 1.1 (eligible for 1.2); idea #2 is ACTIVE and fresh. */
  function twoIdeaSeed() {
    return completeStep(withIdeas(2), 0, "1.1");
  }

  it("a card the ACTIVE idea cannot play renders LOCKED even when another idea could", () => {
    mount(twoIdeaSeed(), "sell");
    const card = screen.getByText("The Sales Room").closest("button, div") as HTMLElement;
    // Dashed locked treatment, not the unlocked card chrome.
    expect(card.className).toContain("border-dashed");
    // Pips/meta on the unlocked cards stay the ACTIVE idea's (locked cards
    // render the hint instead of a meta line).
    expect(screen.getAllByText(/unit tasks · Idea #2/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/unit tasks · Idea #1/)).toBeNull();
  });

  it("active-locked/other-eligible: honest cross-idea hint, and the tap routes to the eligible idea's entry", () => {
    const seed = twoIdeaSeed();
    const { walks } = mount(seed, "sell");
    expect(screen.getByText("Idea #1 can play this")).toBeTruthy();
    const button = screen.getByText("The Sales Room").closest("button") as HTMLButtonElement;
    expect(button).toBeTruthy(); // locked-but-TAPPABLE (the explicit redirect)
    fireEvent.click(button);
    expect(walks).toEqual([{ kind: "enterCriterion", stepId: "1.2" }]);
    // The intent resolves through roomEntryFor exactly as Factory will run it:
    // ONE eligible idea → enter for idea #1 (index 0), never a silent no-op.
    expect(roomEntryFor(seed, "1.2")).toEqual({ action: "enter", ideaIndex: 0, index: 0 });
  });

  it("a card locked for EVERY idea keeps the plain locked hint and stays inert", () => {
    mount(twoIdeaSeed(), "sell");
    // 1.3 is locked for both ideas (neither finished 1.2).
    const card = screen.getByText("The Learning Room").closest("div") as HTMLElement;
    expect(card.querySelector("button")).toBeNull();
    expect(screen.getByText("Complete 1.2 first")).toBeTruthy();
  });

  it("the active idea's own unlocked frontier still renders unlocked ('You are here')", () => {
    mount(twoIdeaSeed(), "sell");
    // 1.1 is the ACTIVE idea #2's frontier: unlocked + marked.
    expect(screen.getByText("You are here")).toBeTruthy();
    const idea1Card = screen.getByText("The Idea Room").closest("button") as HTMLElement;
    expect(idea1Card.className).not.toContain("border-dashed");
  });
});
