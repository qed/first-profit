// @vitest-environment jsdom
/**
 * The idea summary dialog (2026-08-03 rule 2): tapping a FILLED "Your Ideas"
 * slot opens a summary (name + one-liner editable, progress line) instead of
 * path entry. Direct dialog tests drive the REAL reducer through a minimal
 * provider; the Factory-level tests mount the REAL screen (matchMedia stubbed
 * mobile, fake timers driving the 550ms walk arrival) and pin the intent
 * routing end to end, including the rule-1 interaction: naming an idea in the
 * dialog moves the coach off 1.1.1.
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
import { Factory, IdeaSummaryDialog, IDEA_NAME_MAX_CHARS } from "../../screens/Factory";
import { SITE_ONE_LINER_MAX_CHARS } from "../../lib/siteCopy";
import { reducer, type Action, type GameState } from "../../state/gameCore";
import { FloorHarness, apply, completeStep, withIdeas } from "../../testSupport/floorHarness";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

afterEach(cleanup);

/** Minimal provider over the REAL reducer, with a flushNow probe (the shared
 *  FloorHarness has no flushNow; the dialog optional-calls it defensively). */
function Harness({
  seed,
  onAction,
  flushNow,
  children,
}: {
  seed: GameState;
  onAction?: (a: Action) => void;
  flushNow?: () => Promise<string>;
  children: React.ReactNode;
}) {
  const [state, rawDispatch] = React.useReducer(reducer, seed);
  const dispatch: typeof rawDispatch = (action) => {
    onAction?.(action);
    rawDispatch(action);
  };
  const value = { ...state, dispatch, flushNow };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Two ideas; idea #1 (index 0) named, idea #2 active and fresh. */
function twoIdeaSeed(): GameState {
  return apply(
    withIdeas(2),
    { type: "SET_FIELD", ideaIndex: 0, key: "productName", value: "Slime Kits" },
    { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "DIY slime kits for sleepovers" },
  );
}

function mountDialog(seed = twoIdeaSeed(), ideaIndex = 0) {
  const actions: Action[] = [];
  const closes: number[] = [];
  const flushNow = vi.fn().mockResolvedValue("landed");
  render(
    <Harness seed={seed} onAction={(a) => actions.push(a)} flushNow={flushNow}>
      <IdeaSummaryDialog ideaIndex={ideaIndex} onClose={() => closes.push(1)} />
    </Harness>,
  );
  return { actions, closes, flushNow };
}

const nameInput = () => screen.getByLabelText("Product name") as HTMLInputElement;
const linerInput = () => screen.getByLabelText("Your one-liner") as HTMLInputElement;

describe("IdeaSummaryDialog — content", () => {
  it("shows the RIGHT idea's name, one-liner, and progress line (not the active idea's)", () => {
    const seed = twoIdeaSeed();
    expect(seed.activeIdea).toBe(1); // idea #2 is active; the dialog shows #1
    mountDialog(seed, 0);
    expect(screen.getByText("Idea #1")).toBeTruthy();
    expect(nameInput().value).toBe("Slime Kits");
    expect(linerInput().value).toBe("DIY slime kits for sleepovers");
    expect(screen.getByText(/0\/25 tasks · next 1\.1\.1/)).toBeTruthy();
  });

  it("caps the name at IDEA_NAME_MAX_CHARS (60) and the one-liner at SITE_ONE_LINER_MAX_CHARS (140)", () => {
    mountDialog();
    expect(IDEA_NAME_MAX_CHARS).toBe(60);
    expect(nameInput().maxLength).toBe(IDEA_NAME_MAX_CHARS);
    expect(linerInput().maxLength).toBe(SITE_ONE_LINER_MAX_CHARS);
  });

  it("kid-voice chrome: a single primary save action, 44px+ targets, no em dashes", () => {
    mountDialog();
    const save = screen.getByText("Save my idea").closest("button")!;
    expect(save.className).toContain("min-h-[48px]");
    const close = screen.getByLabelText("Back to the floor");
    expect(close.className).toContain("h-11");
    expect(close.className).toContain("w-11");
    expect(nameInput().className).toContain("min-h-[44px]");
    expect(linerInput().className).toContain("min-h-[44px]");
    expect(document.body.textContent).not.toMatch(/—/);
  });

  it("renders nothing for an out-of-range idea index", () => {
    mountDialog(twoIdeaSeed(), 9);
    expect(screen.queryByText("Save my idea")).toBeNull();
  });
});

describe("IdeaSummaryDialog — edits commit with the EXPLICIT idea index", () => {
  it("blur after a name edit dispatches SET_FIELD for THAT idea and flushes once", () => {
    const { actions, flushNow } = mountDialog(twoIdeaSeed(), 0);
    fireEvent.change(nameInput(), { target: { value: "Mega Slime Kits" } });
    expect(actions).toEqual([]); // drafts are local until commit
    fireEvent.blur(nameInput());
    expect(actions).toEqual([
      { type: "SET_FIELD", ideaIndex: 0, key: "productName", value: "Mega Slime Kits" },
    ]);
    expect(flushNow).toHaveBeenCalledTimes(1);
  });

  it("blur after a one-liner edit commits the oneLiner key and flushes", () => {
    const { actions, flushNow } = mountDialog(twoIdeaSeed(), 0);
    fireEvent.change(linerInput(), { target: { value: "Slime kits for parties" } });
    fireEvent.blur(linerInput());
    expect(actions).toEqual([
      { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "Slime kits for parties" },
    ]);
    expect(flushNow).toHaveBeenCalledTimes(1);
  });

  it("blur with NO change dispatches nothing and never flushes", () => {
    const { actions, flushNow } = mountDialog();
    fireEvent.blur(nameInput());
    fireEvent.blur(linerInput());
    expect(actions).toEqual([]);
    expect(flushNow).not.toHaveBeenCalled();
  });

  it("'Save my idea' commits BOTH pending edits, flushes once, and closes", () => {
    const { actions, closes, flushNow } = mountDialog(twoIdeaSeed(), 0);
    fireEvent.change(nameInput(), { target: { value: "Glitter Slime" } });
    fireEvent.change(linerInput(), { target: { value: "Glitter slime, made to order" } });
    fireEvent.click(screen.getByText("Save my idea"));
    expect(actions).toEqual([
      { type: "SET_FIELD", ideaIndex: 0, key: "productName", value: "Glitter Slime" },
      { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "Glitter slime, made to order" },
    ]);
    expect(flushNow).toHaveBeenCalledTimes(1);
    expect(closes).toEqual([1]);
  });

  it("'Save my idea' with nothing changed just closes (no dispatch, no flush)", () => {
    const { actions, closes, flushNow } = mountDialog();
    fireEvent.click(screen.getByText("Save my idea"));
    expect(actions).toEqual([]);
    expect(flushNow).not.toHaveBeenCalled();
    expect(closes).toEqual([1]);
  });

  it("Escape closes the dialog", () => {
    const { closes } = mountDialog();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closes).toEqual([1]);
  });
});

describe("Factory — Your Ideas slots route to the summary dialog (rule 2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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

  function mountFactory(seed: GameState) {
    const actions: Action[] = [];
    const utils = render(
      <FloorHarness seed={seed} Ctx={Ctx} onAction={(a) => actions.push(a)}>
        <Factory />
      </FloorHarness>,
    );
    return { actions, ...utils };
  }

  const arrive = () => act(() => void vi.advanceTimersByTime(600));

  function openSellFloor() {
    const sellCard = screen
      .getAllByText("Sell")
      .map((el) => el.closest("button"))
      .find((b): b is HTMLButtonElement => Boolean(b))!;
    fireEvent.click(sellCard);
    arrive();
    expect(screen.getByText("← The Path")).toBeTruthy();
  }

  it("a FILLED slot opens the summary dialog, never the runner", () => {
    const { actions } = mountFactory(withIdeas(1));
    openSellFloor();
    fireEvent.click(screen.getByText("Idea #1").closest("button")!);
    arrive();
    expect(screen.getByText("Save my idea")).toBeTruthy();
    expect(screen.getByLabelText("Idea #1")).toBeTruthy(); // the dialog itself
    expect(actions.some((a) => a.type === "OPEN_RUNNER")).toBe(false);
    // The dialog is a real overlay: the coach hides and the floor goes inert.
    expect(screen.queryByText("Next Step")).toBeNull();
  });

  it("an EMPTY 'Start Idea' slot keeps its behavior (creates an idea, no summary)", () => {
    const { actions } = mountFactory(withIdeas(1));
    openSellFloor();
    fireEvent.click(screen.getByText("Start Idea #2").closest("button")!);
    arrive();
    expect(actions.some((a) => a.type === "CREATE_IDEA")).toBe(true);
    expect(screen.queryByText("Save my idea")).toBeNull();
  });

  it("naming an idea in the dialog moves the coach off 1.1.1 (rule 1 + rule 2 together)", () => {
    // Idea finished 1.1 but is UNNAMED: rule 1 keeps the coach on 1.1.
    const { actions } = mountFactory(completeStep(withIdeas(1), 0, "1.1"));
    expect(screen.getByText("Take me to The Idea Room")).toBeTruthy();
    openSellFloor();
    fireEvent.click(screen.getByText("Idea #1").closest("button")!);
    arrive();
    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Slime Kits" } });
    fireEvent.change(screen.getByLabelText("Your one-liner"), {
      target: { value: "DIY slime kits for sleepovers" },
    });
    fireEvent.click(screen.getByText("Save my idea"));
    // Both fields committed for the explicit idea; the selectors re-derive and
    // the coach now targets the real frontier (1.2, the Sales Room).
    expect(
      actions.filter((a) => a.type === "SET_FIELD").map((a) => (a as { key: string }).key).sort(),
    ).toEqual(["oneLiner", "productName"]);
    expect(screen.queryByText("Save my idea")).toBeNull();
    expect(screen.getByText("Take me to The Sales Room")).toBeTruthy();
  });
});
