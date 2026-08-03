// @vitest-environment jsdom
/**
 * The promotion screen (Unit 8 Tier C2): eligible-idea listing, the explicit
 * confirm flow through promoteIdea, graceful refusal handling, and the overlay
 * conventions (Escape, focus). Drives the REAL reducer + engine semantics.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../state/GameContext", async () => {
  const R = await import("react");
  const Ctx = R.createContext<unknown>(null);
  return { __ctx: Ctx, useGame: () => R.useContext(Ctx) };
});

import * as GameContext from "../../state/GameContext";
import { PromoteBusiness } from "../PromoteBusiness";
import { FloorHarness, apply, validatedIdea, withIdeas } from "../../testSupport/floorHarness";
import type { Action, GameState } from "../../state/gameCore";

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

describe("PromoteBusiness — double-confirm guard + returned truth (unit review FIX 6)", () => {
  /** TWO Validate-complete, named ideas (both rows offer a confirm). */
  function twoEligibleSeed(): GameState {
    let s = withIdeas(2);
    s = validatedIdea(s, 0);
    s = validatedIdea(s, 1);
    s = apply(s, { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "Slime kits" });
    s = apply(s, { type: "SET_FIELD", ideaIndex: 1, key: "oneLiner", value: "Dog walking" });
    return s;
  }

  function mountWithActions(seed: GameState) {
    const actions: Action[] = [];
    const utils = render(
      <FloorHarness seed={seed} Ctx={Ctx} onAction={(a) => actions.push(a)}>
        <PromoteBusiness open onClose={() => {}} />
      </FloorHarness>,
    );
    return { actions, ...utils };
  }

  it("rapid double-confirm on the SAME row promotes exactly once", () => {
    const { actions } = mountWithActions(twoEligibleSeed());
    const [first] = screen.getAllByText("Make this my business") as HTMLButtonElement[];
    const button = first.closest("button") as HTMLButtonElement;
    // Same event-loop burst: the synchronous confirmingRef guard is the only
    // thing standing between these two clicks (state has not re-rendered yet).
    act(() => {
      button.click();
      button.click();
    });
    expect(actions.filter((a) => a.type === "PROMOTE_IDEA").length).toBe(1);
    expect(screen.getByText("Slime kits is now your business")).toBeTruthy();
  });

  it("rapid CROSS-ROW double-confirm: the second is refused and the confirmation names the FIRST (post-dispatch truth)", () => {
    const { actions } = mountWithActions(twoEligibleSeed());
    const buttons = (screen.getAllByText("Make this my business") as HTMLElement[]).map(
      (el) => el.closest("button") as HTMLButtonElement,
    );
    expect(buttons.length).toBe(2);
    act(() => {
      buttons[0].click();
      buttons[1].click(); // dead: sync guard fires before any dispatch
    });
    const promotes = actions.filter((a) => a.type === "PROMOTE_IDEA");
    expect(promotes.length).toBe(1);
    expect((promotes[0] as { ideaId: string }).ideaId).toBe("idea-0");
    // The celebrate-lite heading is derived from the ACTIVE business in live
    // state (the returned truth), so it names idea #1 — never the raced row.
    expect(screen.getByText("Slime kits is now your business")).toBeTruthy();
    expect(screen.queryByText("Dog walking is now your business")).toBeNull();
  });

  it("after one confirm fires, every confirm button is disabled for the session", () => {
    // A FORCED refusal keeps the list view up so the buttons stay visible.
    const refused = vi.fn().mockReturnValue(false);
    mount(twoEligibleSeed(), { promoteIdea: refused });
    const button = screen.getAllByText("Make this my business")[0].closest("button") as HTMLButtonElement;
    fireEvent.click(button);
    expect(refused).toHaveBeenCalledTimes(1);
    for (const el of screen.getAllByText("Make this my business")) {
      expect((el.closest("button") as HTMLButtonElement).disabled).toBe(true);
    }
    // A further click dispatches nothing more.
    fireEvent.click(button);
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it("a refusal never shows the celebrate-lite confirmation (refusal boolean honored)", () => {
    const refused = vi.fn().mockReturnValue(false);
    mount(twoEligibleSeed(), { promoteIdea: refused });
    fireEvent.click(screen.getAllByText("Make this my business")[0]);
    expect(screen.queryByText(/is now your business/)).toBeNull();
    expect(screen.getByText("Make it your business")).toBeTruthy();
  });
});
