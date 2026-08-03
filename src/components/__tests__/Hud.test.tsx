// @vitest-environment jsdom
/**
 * Hud (unit review FIX 7): the phase chip names the ACTIVE idea's current
 * phase with that phase's counts and PHASES colors, for every phase including
 * the business phases (Grow/Scale read through the promoted business). Drives
 * the REAL reducer + engine via the shared floor harness.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../../state/GameContext", async () => {
  const R = await import("react");
  const Ctx = R.createContext<unknown>(null);
  return { __ctx: Ctx, useGame: () => R.useContext(Ctx) };
});

import * as GameContext from "../../state/GameContext";
import { Hud } from "../Hud";
import { phaseById, type PhaseId } from "../../data/path";
import {
  FloorHarness,
  apply,
  completePhase,
  completeStep,
  validatedIdea,
  withIdeas,
} from "../../testSupport/floorHarness";
import type { GameState } from "../../state/gameCore";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

afterEach(cleanup);

function mount(seed: GameState) {
  return render(
    <FloorHarness seed={seed} Ctx={Ctx}>
      <Hud />
    </FloorHarness>,
  );
}

/** jsdom normalizes inline hsl() colors; compare through the same pipe. */
function cssColor(value: string): string {
  const el = document.createElement("div");
  el.style.color = value;
  return el.style.color;
}
function cssBorderColor(value: string): string {
  const el = document.createElement("div");
  el.style.borderColor = value;
  return el.style.borderColor;
}
function cssBackground(value: string): string {
  const el = document.createElement("div");
  el.style.background = value;
  return el.style.background;
}

/** The chip container (the phase-name span's styled parent). */
function chipFor(phase: PhaseId) {
  const name = screen.getByText(phaseById(phase).name) as HTMLElement;
  return { name, chip: name.parentElement as HTMLElement };
}

function expectChip(phase: PhaseId, counts: string) {
  const ph = phaseById(phase);
  const { name, chip } = chipFor(phase);
  expect(screen.getByText(counts)).toBeTruthy();
  // Colors come from the PHASES data: border + wash on the chip, accent on
  // the number badge, phase text color on the name.
  expect(chip.style.borderColor).toBe(cssBorderColor(ph.accent));
  expect(chip.style.background).toBe(cssBackground(ph.wash));
  expect(name.style.color).toBe(cssColor(ph.text));
  const badge = screen.getByText(String(ph.index)) as HTMLElement;
  expect(badge.style.background).toBe(cssBackground(ph.accent));
}

describe("Hud — phase chip per phase (unit review FIX 7)", () => {
  it("Sell: fresh idea shows 'Sell 0/5 criteria' in sell colors", () => {
    mount(withIdeas(1));
    expectChip("sell", "0/5 criteria");
  });

  it("Sell mid-phase: one criterion done shows 1/5", () => {
    mount(completeStep(withIdeas(1), 0, "1.1"));
    expectChip("sell", "1/5 criteria");
  });

  it("Build: Sell complete rolls the chip to Build 0/5 in build colors", () => {
    mount(completePhase(withIdeas(1), 0, "sell"));
    expectChip("build", "0/5 criteria");
  });

  it("Validate: Sell + Build complete shows Validate in validate colors", () => {
    let s = withIdeas(1);
    for (const phase of ["sell", "build"] as const) s = completePhase(s, 0, phase);
    mount(s);
    expectChip("validate", "0/5 criteria");
  });

  it("Validate complete but unpromoted: the chip stays honest at Validate 5/5 (Grow is gated)", () => {
    mount(validatedIdea(withIdeas(1), 0));
    expectChip("validate", "5/5 criteria");
  });

  it("Grow (business phase): a promoted business rolls the chip to Grow in grow colors", () => {
    let s = validatedIdea(withIdeas(1), 0);
    s = apply(s, { type: "PROMOTE_IDEA", ideaId: "idea-0", businessId: "biz-1", at: 1 });
    mount(s);
    expectChip("grow", "0/5 criteria");
  });

  it("Scale (business phase): Grow complete rolls the chip to Scale in scale colors", () => {
    let s = validatedIdea(withIdeas(1), 0);
    s = apply(s, { type: "PROMOTE_IDEA", ideaId: "idea-0", businessId: "biz-1", at: 1 });
    s = completePhase(s, 0, "grow");
    mount(s);
    expectChip("scale", "0/5 criteria");
  });

  it("the ACTIVE idea drives the chip: switching to a fresh idea rolls back to Sell", () => {
    let s = completePhase(withIdeas(2), 0, "sell"); // idea #2 active + fresh
    s = apply(s, { type: "SET_ACTIVE_IDEA", ideaIndex: 0 });
    mount(s);
    expectChip("build", "0/5 criteria");
    cleanup();
    mount(apply(s, { type: "SET_ACTIVE_IDEA", ideaIndex: 1 }));
    expectChip("sell", "0/5 criteria");
  });
});
