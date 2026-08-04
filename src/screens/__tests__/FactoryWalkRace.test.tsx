// @vitest-environment jsdom
/**
 * Factory walk-race proofing + overlay guard (unit review FIX 1 + FIX 5).
 *
 * Mounts the REAL Factory screen (matchMedia stubbed to the mobile variant,
 * fake timers driving the 550ms arrival) against the real reducer, and pins:
 *  - arrival always computes against LIVE state (ref-backed onArrived), so an
 *    intent whose eligibility evaporated mid-walk dispatches NOTHING;
 *  - onBack cancels an in-flight walk (walkTo → null clears the variant timer);
 *  - an explicit idea switch cancels an in-flight walk (the kid's choice wins
 *    over a pending arrival);
 *  - the coach's walk still lands normally (the happy path is unchanged);
 *  - while the promote overlay is open the coach hides and the floor container
 *    is `inert` — and a SWITCH never inerts anything.
 *
 * The switcher is a GlobalNav DROPDOWN since 2026-08-04, so nothing about it
 * mounts inside Factory any more. What crosses the boundary is the App-owned
 * `switchSignal` counter, and these tests thread it exactly as App does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../state/GameContext", async () => {
  const R = await import("react");
  const Ctx = R.createContext<unknown>(null);
  return { __ctx: Ctx, useGame: () => R.useContext(Ctx) };
});

import * as GameContext from "../../state/GameContext";
import { Factory } from "../Factory";
import { FloorHarness, completeStep, validatedIdea, withIdeas, withNamedIdeas } from "../../testSupport/floorHarness";
import { stepById } from "../../data/path";
import type { Action, GameState } from "../../state/gameCore";
import type { GameApi } from "../../state/GameContext";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no matchMedia; stub the mobile variant (matches: false < lg).
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Grabs the live context value (for mid-walk external dispatches). */
function Probe({ into }: { into: { current: GameApi | null } }) {
  into.current = (GameContext as unknown as { useGame: () => GameApi }).useGame();
  return null;
}

function mountFactory(seed: GameState) {
  const actions: Action[] = [];
  const api: { current: GameApi | null } = { current: null };
  // Switch wiring, exactly as App threads it since the switcher became a nav
  // DROPDOWN (2026-08-04): the menu itself lives in the GlobalNav, ABOVE
  // Factory, and the only thing crossing into Factory is the bumped counter it
  // watches to cancel an in-flight walk.
  const nav: { switchTo: (ideaIndex: number) => void } = { switchTo: () => undefined };
  function NavHostedFactory() {
    const [signal, setSignal] = React.useState(0);
    const game = (GameContext as unknown as { useGame: () => GameApi }).useGame();
    // What GlobalNav's menuitem does on click, in the same order: notify the
    // walk-canceller, then dispatch the switch.
    nav.switchTo = (ideaIndex: number) => {
      setSignal((n) => n + 1);
      game.dispatch({ type: "SET_ACTIVE_IDEA", ideaIndex });
    };
    return <Factory switchSignal={signal} />;
  }
  const utils = render(
    <FloorHarness seed={seed} Ctx={Ctx} onAction={(a) => actions.push(a)}>
      <Probe into={api} />
      <NavHostedFactory />
    </FloorHarness>,
  );
  const switchToIdea = (ideaIndex: number) => act(() => nav.switchTo(ideaIndex));
  return { actions, api, switchToIdea, ...utils };
}

const arrive = () => act(() => void vi.advanceTimersByTime(600));

/** Tap the Sell phase card and let the walk arrive (floorView → sell). */
function openSellFloor() {
  const sellCard = screen
    .getAllByText("Sell")
    .map((el) => el.closest("button"))
    .find((b): b is HTMLButtonElement => Boolean(b))!;
  fireEvent.click(sellCard);
  arrive();
  expect(screen.getByText("← The Path")).toBeTruthy();
}

describe("Factory — walk-race proofing (unit review FIX 1)", () => {
  it("back during a walk cancels it: nothing opens after the timer would have fired", () => {
    const { actions } = mountFactory(withIdeas(1));
    openSellFloor();
    // Tap 1.1's card — a walk is now pending.
    fireEvent.click(screen.getByText("The Idea Room").closest("button")!);
    // Back BEFORE arrival: cancels the walk and returns to the phases view.
    fireEvent.click(screen.getByText("← The Path"));
    arrive();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions.some((a) => a.type === "OPEN_RUNNER")).toBe(false);
    // And we are back on the phases view.
    expect(screen.getByText("The Path")).toBeTruthy();
  });

  it("an explicit idea switch mid-walk cancels the pending arrival (the switch wins)", () => {
    // Idea #1 finished 1.1 (eligible for 1.2); idea #2 is active and fresh.
    const seed = completeStep(withIdeas(2), 0, "1.1");
    const { actions, switchToIdea } = mountFactory(seed);
    openSellFloor();
    // The 1.2 card is locked for the ACTIVE idea but tappable for idea #1.
    fireEvent.click(screen.getByText("The Sales Room").closest("button")!);
    // Mid-walk: switch to idea #1 from the nav dropdown. The bumped signal
    // cancels the in-flight walk before the switch dispatches.
    switchToIdea(0);
    const before = actions.length;
    arrive();
    // The pending arrival never fired: no runner, no picker, no extra dispatch.
    expect(actions.slice(before).length).toBe(0);
    expect(actions.filter((a) => a.type === "SET_ACTIVE_IDEA")).toEqual([
      { type: "SET_ACTIVE_IDEA", ideaIndex: 0 },
    ]);
    expect(actions.some((a) => a.type === "OPEN_RUNNER")).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("arrival computes against LIVE state: progress made mid-walk shifts the entry task", () => {
    // Idea #1 finished 1.1 (the only idea eligible for 1.2); idea #2 active.
    const seed = completeStep(withIdeas(2), 0, "1.1");
    const { actions, api } = mountFactory(seed);
    openSellFloor();
    fireEvent.click(screen.getByText("The Sales Room").closest("button")!);
    // Mid-walk, idea #1 completes the first two 1.2 tasks externally (e.g. a
    // cross-tab union): by arrival time the frontier has moved.
    act(() => {
      for (const i of [0, 1]) {
        api.current!.dispatch({ type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.2", index: i });
      }
    });
    const before = actions.length;
    arrive();
    // A stale-closure arrival would open at the pre-completion frontier
    // (index 0); the live computation opens at the moved frontier (index 2).
    const after = actions.slice(before);
    expect(after.some((a) => a.type === "OPEN_RUNNER" && a.stepId === "1.2" && a.index === 2)).toBe(true);
    expect(after.some((a) => a.type === "OPEN_RUNNER" && a.index === 0)).toBe(false);
  });

  it("arrival at a criterion completed mid-walk opens it in REVIEW mode, not a dead tap", () => {
    // Review-entry rule (ideasEnterableFor): a done room stays reachable so
    // authored fields (1.1 productName/oneLiner) are never orphaned — arrival
    // opens task 1 with idempotent completion, never a silent no-op.
    const seed = completeStep(withIdeas(2), 0, "1.1");
    const { actions, api } = mountFactory(seed);
    openSellFloor();
    fireEvent.click(screen.getByText("The Sales Room").closest("button")!);
    const tasks = stepById("1.2")!.tasks.length;
    act(() => {
      for (let i = 0; i < tasks; i++) {
        api.current!.dispatch({ type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.2", index: i });
      }
    });
    const before = actions.length;
    arrive();
    const after = actions.slice(before);
    expect(after.some((a) => a.type === "OPEN_RUNNER" && a.stepId === "1.2" && a.index === 0)).toBe(true);
  });

  it("the coach walk still lands: arrival opens the runner for the coach's target", () => {
    mountFactory(withIdeas(1));
    fireEvent.click(screen.getByText("Next Step"));
    arrive();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Pitch a product in 60 seconds, no notes");
  });
});

describe("Factory — overlay guard (unit review FIX 5)", () => {
  it("promote open: the coach hides and the floor container is inert", () => {
    const { container } = mountFactory(validatedIdea(withNamedIdeas(1), 0));
    // The coach's promote CTA opens the PromoteBusiness overlay via the walk.
    fireEvent.click(screen.getByText("Next Step"));
    arrive();
    expect(screen.getByText("Make it your business")).toBeTruthy();
    expect(screen.queryByText("Next Step")).toBeNull();
    const inertEl = container.querySelector("[inert]");
    expect(inertEl).toBeTruthy();
    // The floor content lives INSIDE the inert container (tab-order sealed).
    expect(inertEl!.textContent).toContain("The Path");
    // The overlay itself is OUTSIDE it (still focusable).
    expect(inertEl!.textContent).not.toContain("Make it your business");
  });

  it("switching ideas never inerts the floor: the dropdown is nav chrome, not an overlay", () => {
    // The switcher used to be a Factory modal, so opening it hid the coach and
    // sealed the floor. As a nav dropdown it takes nothing over: the floor
    // stays live and the coach stays put across a switch.
    const { container, switchToIdea } = mountFactory(withIdeas(2));
    expect(screen.getByText("Next Step")).toBeTruthy();
    expect(container.querySelector("[inert]")).toBeNull();

    switchToIdea(1);
    expect(screen.getByText("Next Step")).toBeTruthy();
    expect(container.querySelector("[inert]")).toBeNull();
    // And no switcher modal is left anywhere in the Factory tree.
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
