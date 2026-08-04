// @vitest-environment jsdom
/**
 * The idea summary dialog (2026-08-03 rule 2; edit-in-place rework): a FILLED
 * "Your Ideas" slot opens a READ-MODE summary — name + one-liner as wrapping
 * text bubbles with per-section pencil edit buttons — and Save (which exists
 * only while a draft is dirty) is the ONLY writer. Direct dialog tests drive
 * the REAL reducer through a minimal provider; the Factory-level tests mount
 * the REAL screen (matchMedia stubbed mobile, fake timers driving the 550ms
 * walk arrival) and pin the intent routing end to end, including the rule-1
 * interaction: naming an idea in the dialog moves the coach off 1.1.1.
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
  const utils = render(
    <Harness seed={seed} onAction={(a) => actions.push(a)} flushNow={flushNow}>
      <IdeaSummaryDialog ideaIndex={ideaIndex} onClose={() => closes.push(1)} />
    </Harness>,
  );
  return { actions, closes, flushNow, ...utils };
}

const editNameButton = () => screen.getByLabelText("Edit name");
const editIdeaButton = () => screen.getByLabelText("Edit idea");
const nameInput = () => screen.getByLabelText("Product name") as HTMLInputElement;
const linerInput = () => screen.getByLabelText("Your one-liner") as HTMLTextAreaElement;
const saveButton = () => screen.queryByText("Save")?.closest("button") ?? null;

describe("IdeaSummaryDialog — read mode (the default)", () => {
  it("renders the idea's name and one-liner as fully-wrapping text bubbles, no inputs", () => {
    const seed = twoIdeaSeed();
    expect(seed.activeIdea).toBe(1); // idea #2 is active; the dialog shows #1
    mountDialog(seed, 0);
    const nameBubble = screen.getByTestId("fp-idea-name-bubble");
    const linerBubble = screen.getByTestId("fp-idea-liner-bubble");
    expect(nameBubble.textContent).toBe("Slime Kits");
    expect(linerBubble.textContent).toBe("DIY slime kits for sleepovers");
    for (const bubble of [nameBubble, linerBubble]) {
      expect(bubble.className).toContain("break-words");
      expect(bubble.className).toContain("whitespace-normal");
    }
    expect(screen.queryByLabelText("Product name")).toBeNull(); // no input yet
    expect(screen.queryByLabelText("Your one-liner")).toBeNull();
    expect(screen.getByText(/0\/25 tasks · next 1\.1\.1/)).toBeTruthy(); // progress line
  });

  it("shows muted kid placeholders for an unnamed idea, with the edit buttons present", () => {
    mountDialog(withIdeas(1), 0);
    expect(screen.getByTestId("fp-idea-name-bubble").textContent).toBe("Not named yet");
    expect(screen.getByTestId("fp-idea-liner-bubble").textContent).toBe("No description yet");
    expect(editNameButton()).toBeTruthy();
    expect(editIdeaButton()).toBeTruthy();
  });

  it("has NO Save control while nothing is dirty — the X is the only exit", () => {
    mountDialog();
    expect(saveButton()).toBeNull();
    expect(screen.getByLabelText("Back to the floor")).toBeTruthy();
  });

  it("kid-voice chrome: 44px+ edit/close targets, no em dashes", () => {
    mountDialog();
    for (const button of [editNameButton(), editIdeaButton(), screen.getByLabelText("Back to the floor")]) {
      expect(button.className).toContain("h-11");
      expect(button.className).toContain("w-11");
    }
    expect(document.body.textContent).not.toMatch(/—/);
  });

  it("renders nothing for an out-of-range idea index", () => {
    mountDialog(twoIdeaSeed(), 9);
    expect(screen.queryByLabelText("Edit name")).toBeNull();
  });
});

describe("IdeaSummaryDialog — per-section edit mode", () => {
  it("'Edit name' flips ONLY the name section into a prefilled capped input", () => {
    mountDialog();
    fireEvent.click(editNameButton());
    expect(nameInput().value).toBe("Slime Kits");
    expect(nameInput().maxLength).toBe(IDEA_NAME_MAX_CHARS);
    expect(IDEA_NAME_MAX_CHARS).toBe(60);
    // The one-liner section stays in read mode.
    expect(screen.queryByLabelText("Your one-liner")).toBeNull();
    expect(screen.getByTestId("fp-idea-liner-bubble").textContent).toBe("DIY slime kits for sleepovers");
    expect(screen.queryByLabelText("Edit name")).toBeNull(); // its own icon is gone
  });

  it("'Edit idea' flips ONLY the one-liner section into a prefilled capped textarea", () => {
    mountDialog();
    fireEvent.click(editIdeaButton());
    expect(linerInput().value).toBe("DIY slime kits for sleepovers");
    expect(linerInput().maxLength).toBe(SITE_ONE_LINER_MAX_CHARS);
    expect(screen.queryByLabelText("Product name")).toBeNull();
    expect(screen.getByTestId("fp-idea-name-bubble").textContent).toBe("Slime Kits");
  });

  it("entering edit mode alone (no change) still shows NO Save control", () => {
    mountDialog();
    fireEvent.click(editNameButton());
    fireEvent.click(editIdeaButton());
    expect(saveButton()).toBeNull();
  });

  it("blur commits NOTHING (Save is the only writer)", () => {
    const { actions, flushNow } = mountDialog();
    fireEvent.click(editNameButton());
    fireEvent.change(nameInput(), { target: { value: "Mega Slime Kits" } });
    fireEvent.blur(nameInput());
    expect(actions).toEqual([]);
    expect(flushNow).not.toHaveBeenCalled();
    // The draft survives the blur and the Save CTA is up (dirty).
    expect(nameInput().value).toBe("Mega Slime Kits");
    expect(saveButton()).toBeTruthy();
  });
});

describe("IdeaSummaryDialog — dirty-gated Save", () => {
  it("Save appears once a draft differs and disappears when the draft matches again", () => {
    mountDialog();
    fireEvent.click(editNameButton());
    expect(saveButton()).toBeNull();
    fireEvent.change(nameInput(), { target: { value: "Mega Slime Kits" } });
    expect(saveButton()).toBeTruthy();
    fireEvent.change(nameInput(), { target: { value: "Slime Kits" } }); // back to stored
    expect(saveButton()).toBeNull();
  });

  it("Save is the house green button, 48px+, docked bottom-right", () => {
    mountDialog();
    fireEvent.click(editNameButton());
    fireEvent.change(nameInput(), { target: { value: "Mega Slime Kits" } });
    const save = saveButton()!;
    expect(save.className).toContain("min-h-[48px]");
    expect(save.className).toContain("bg-verified");
    expect(save.parentElement!.className).toContain("justify-end");
  });

  it("Save commits ONLY the changed field with the EXPLICIT ideaIndex, one flush, back to read mode", () => {
    const { actions, flushNow } = mountDialog(twoIdeaSeed(), 0);
    fireEvent.click(editNameButton());
    fireEvent.change(nameInput(), { target: { value: "Mega Slime Kits" } });
    fireEvent.click(saveButton()!);
    expect(actions).toEqual([
      { type: "SET_FIELD", ideaIndex: 0, key: "productName", value: "Mega Slime Kits" },
    ]);
    expect(flushNow).toHaveBeenCalledTimes(1);
    // Back to read mode, updated bubble, CTA gone.
    expect(screen.queryByLabelText("Product name")).toBeNull();
    expect(screen.getByTestId("fp-idea-name-bubble").textContent).toBe("Mega Slime Kits");
    expect(saveButton()).toBeNull();
  });

  it("Save commits BOTH fields when both sections changed, still exactly one flush", () => {
    const { actions, flushNow } = mountDialog(twoIdeaSeed(), 0);
    fireEvent.click(editNameButton());
    fireEvent.change(nameInput(), { target: { value: "Glitter Slime" } });
    fireEvent.click(editIdeaButton());
    fireEvent.change(linerInput(), { target: { value: "Glitter slime, made to order" } });
    fireEvent.click(saveButton()!);
    expect(actions).toEqual([
      { type: "SET_FIELD", ideaIndex: 0, key: "productName", value: "Glitter Slime" },
      { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "Glitter slime, made to order" },
    ]);
    expect(flushNow).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("fp-idea-name-bubble").textContent).toBe("Glitter Slime");
    expect(screen.getByTestId("fp-idea-liner-bubble").textContent).toBe("Glitter slime, made to order");
  });
});

describe("IdeaSummaryDialog — close discards drafts (X and Escape alike)", () => {
  it("X closes while dirty WITHOUT dispatching or flushing (drafts are local only)", () => {
    const { actions, closes, flushNow } = mountDialog();
    fireEvent.click(editNameButton());
    fireEvent.change(nameInput(), { target: { value: "Never saved" } });
    fireEvent.click(screen.getByLabelText("Back to the floor"));
    expect(closes).toEqual([1]);
    expect(actions).toEqual([]);
    expect(flushNow).not.toHaveBeenCalled();
  });

  it("Escape matches the X semantics", () => {
    const { actions, closes } = mountDialog();
    fireEvent.click(editIdeaButton());
    fireEvent.change(linerInput(), { target: { value: "Never saved either" } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closes).toEqual([1]);
    expect(actions).toEqual([]);
  });

  it("reopening after a discarded edit shows the STORED values fresh", () => {
    const { unmount } = mountDialog();
    fireEvent.click(editNameButton());
    fireEvent.change(nameInput(), { target: { value: "Never saved" } });
    unmount(); // Factory unmounts the dialog on close (keyed remount per open)
    mountDialog();
    expect(screen.getByTestId("fp-idea-name-bubble").textContent).toBe("Slime Kits");
    expect(screen.queryByText("Never saved")).toBeNull();
    expect(saveButton()).toBeNull();
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

  it("a FILLED slot opens the read-mode summary dialog, never the runner", () => {
    const { actions } = mountFactory(withIdeas(1));
    openSellFloor();
    fireEvent.click(screen.getByText("Idea #1").closest("button")!);
    arrive();
    expect(screen.getByLabelText("Idea #1")).toBeTruthy(); // the dialog itself
    expect(screen.getByLabelText("Edit name")).toBeTruthy(); // read mode
    expect(screen.queryByText("Save")).toBeNull(); // nothing dirty yet
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
    expect(screen.queryByLabelText("Edit name")).toBeNull();
  });

  it("naming an idea via icon → type → Save moves the coach off 1.1.1 (rule 1 + rule 2)", () => {
    // Idea finished 1.1 but is UNNAMED: rule 1 keeps the coach on 1.1.
    const { actions } = mountFactory(completeStep(withIdeas(1), 0, "1.1"));
    expect(screen.getByText("Take me to The Idea Room")).toBeTruthy();
    openSellFloor();
    fireEvent.click(screen.getByText("Idea #1").closest("button")!);
    arrive();
    fireEvent.click(screen.getByLabelText("Edit name"));
    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Slime Kits" } });
    fireEvent.click(screen.getByLabelText("Edit idea"));
    fireEvent.change(screen.getByLabelText("Your one-liner"), {
      target: { value: "DIY slime kits for sleepovers" },
    });
    fireEvent.click(screen.getByText("Save"));
    // Both fields committed for the explicit idea; back to read mode.
    expect(
      actions.filter((a) => a.type === "SET_FIELD").map((a) => (a as { key: string }).key).sort(),
    ).toEqual(["oneLiner", "productName"]);
    expect(screen.getByTestId("fp-idea-name-bubble").textContent).toBe("Slime Kits");
    // Close the dialog: the selectors re-derived, so the coach now targets the
    // real frontier (1.2, the Sales Room).
    fireEvent.click(screen.getByLabelText("Back to the floor"));
    expect(screen.getByText("Take me to The Sales Room")).toBeTruthy();
  });
});
