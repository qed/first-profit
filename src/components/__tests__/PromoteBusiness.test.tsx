// @vitest-environment jsdom
/**
 * The promotion screen (Unit 8 Tier C2): eligible-idea listing, the explicit
 * confirm flow through promoteIdea, graceful refusal handling, and the overlay
 * conventions (Escape, focus). Drives the REAL reducer + engine semantics.
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
import { PromoteBusiness } from "../PromoteBusiness";
import { FloorHarness, apply, validatedIdea, withIdeas } from "../../testSupport/floorHarness";
import type { GameState } from "../../state/gameCore";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

function mount(
  seed: GameState,
  opts: { open?: boolean; promoteIdea?: (i: number) => boolean } = {},
) {
  const closes: number[] = [];
  const utils = render(
    <FloorHarness seed={seed} Ctx={Ctx} promoteIdea={opts.promoteIdea}>
      <PromoteBusiness open={opts.open ?? true} onClose={() => closes.push(1)} />
    </FloorHarness>,
  );
  return { closes, ...utils };
}

afterEach(cleanup);

function namedValidatedSeed(): GameState {
  let s = withIdeas(2);
  s = validatedIdea(s, 0);
  s = apply(s, { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "Slime kits" });
  s = apply(s, { type: "SET_FIELD", ideaIndex: 1, key: "oneLiner", value: "Dog walking" });
  return s;
}

describe("PromoteBusiness", () => {
  it("renders nothing while closed", () => {
    mount(namedValidatedSeed(), { open: false });
    expect(screen.queryByText("Make it your business")).toBeNull();
  });

  it("lists ONLY Validate-complete ideas (idea 1 mid-Sell is absent)", () => {
    mount(namedValidatedSeed());
    expect(screen.getByText("Make it your business")).toBeTruthy();
    expect(screen.getByText("Slime kits")).toBeTruthy();
    expect(screen.queryByText("Dog walking")).toBeNull();
    expect(screen.getAllByText("Make this my business").length).toBe(1);
  });

  it("lists NO ideas while a business is already active", () => {
    let s = namedValidatedSeed();
    s = apply(s, { type: "PROMOTE_IDEA", ideaId: "idea-0", businessId: "biz-1", at: 1 });
    mount(s);
    expect(screen.queryByText("Make this my business")).toBeNull();
    expect(screen.getByText(/Finish Validate with one of your ideas first/)).toBeTruthy();
  });

  it("explicit confirm promotes, activates the idea, and shows the celebrate-lite confirmation", () => {
    mount(namedValidatedSeed());
    fireEvent.click(screen.getByText("Make this my business"));
    // Celebrate-lite: kid-voiced confirmation + the grow handoff CTA.
    expect(screen.getByText("It is official")).toBeTruthy();
    expect(screen.getByText("Slime kits is now your business")).toBeTruthy();
    const cta = screen.getByText(/grow it/);
    fireEvent.click(cta);
    // Closing hands back to the floor (coach targets 4.1 from live state).
  });

  it("keeps the confirmation up when the parent re-renders with a FRESH onClose (Factory pattern)", () => {
    // Regression (found in the pixel pass): Factory recreates onClose every
    // render; if the open-effect depends on it, the promotion dispatch's
    // re-render wipes the celebrate-lite state back to the list.
    function FactoryLike() {
      GameContext.useGame(); // consume context so a dispatch re-renders us
      return <PromoteBusiness open onClose={() => {}} />;
    }
    render(
      <FloorHarness seed={namedValidatedSeed()} Ctx={Ctx}>
        <FactoryLike />
      </FloorHarness>,
    );
    fireEvent.click(screen.getByText("Make this my business"));
    expect(screen.getByText("It is official")).toBeTruthy();
    expect(screen.getByText("Slime kits is now your business")).toBeTruthy();
  });

  it("handles a promoteIdea REFUSAL gracefully (re-renders, never errors at the kid)", () => {
    const refused = vi.fn().mockReturnValue(false);
    mount(namedValidatedSeed(), { promoteIdea: refused });
    fireEvent.click(screen.getByText("Make this my business"));
    expect(refused).toHaveBeenCalledWith(0);
    // No confirmation, no crash; the list view is still up.
    expect(screen.queryByText("It is official")).toBeNull();
    expect(screen.getByText("Make it your business")).toBeTruthy();
  });

  it("cancel ('Not yet') and Escape both close without promoting", () => {
    const first = mount(namedValidatedSeed());
    fireEvent.click(screen.getByText("Not yet"));
    expect(first.closes.length).toBe(1);
    first.unmount();
    const second = mount(namedValidatedSeed());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(second.closes.length).toBe(1);
  });

  it("focuses the dialog on open (focus trap seam) and uses no em dashes", () => {
    mount(namedValidatedSeed());
    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(dialog);
    expect(document.body.textContent).not.toMatch(/—/);
  });
});
