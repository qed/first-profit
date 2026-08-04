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
import { TOMBSTONE_CAP, reducer, toSaveDoc, type Action, type GameState } from "../../state/gameCore";
import { FloorHarness, apply, completeStep, validatedIdea, withIdeas } from "../../testSupport/floorHarness";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

afterEach(cleanup);

/** Minimal provider over the REAL reducer, with a flushNow probe (the shared
 *  FloorHarness has no flushNow; the dialog optional-calls it defensively). */
function Harness({
  seed,
  onAction,
  flushNow,
  deleteIdea,
  children,
}: {
  seed: GameState;
  onAction?: (a: Action) => void;
  flushNow?: () => Promise<string>;
  /** Override the bound deleteIdea (e.g. a forced-refusal probe). */
  deleteIdea?: (ideaId: string) => boolean;
  children: React.ReactNode;
}) {
  const [state, rawDispatch] = React.useReducer(reducer, seed);
  const dispatch: typeof rawDispatch = (action) => {
    onAction?.(action);
    rawDispatch(action);
  };
  // Bound deleteIdea mirrors GameContext's caller boundary (Change #7):
  // honest refusal boolean (any-business + cap-full), dispatch + one flush on
  // success.
  const boundDelete = (ideaId: string): boolean => {
    if (!state.ideas.some((i) => i.id === ideaId)) return false;
    if (state.businesses?.some((b) => b.ideaId === ideaId)) return false;
    if (state.deletedIdeaIds.length >= TOMBSTONE_CAP && !state.deletedIdeaIds.includes(ideaId)) {
      return false;
    }
    dispatch({ type: "DELETE_IDEA", ideaId });
    void flushNow?.();
    return true;
  };
  const value = { ...state, dispatch, flushNow, deleteIdea: deleteIdea ?? boundDelete };
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

function mountDialog(
  seed = twoIdeaSeed(),
  ideaIndex = 0,
  opts: { deleteIdea?: (ideaId: string) => boolean } = {},
) {
  const actions: Action[] = [];
  const closes: number[] = [];
  const flushNow = vi.fn().mockResolvedValue("landed");
  const utils = render(
    <Harness
      seed={seed}
      onAction={(a) => actions.push(a)}
      flushNow={flushNow}
      deleteIdea={opts.deleteIdea}
    >
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

describe("IdeaSummaryDialog — delete this idea (Change #7)", () => {
  /** Two ideas with a first name on the profile (the type-to-confirm gate). */
  function namedFamilySeed(): GameState {
    return apply(twoIdeaSeed(), {
      type: "SET_PROFILE",
      patch: { firstName: "Cedric" },
    });
  }

  const deleteTrigger = () => screen.queryByText("Delete this idea")?.closest("button") ?? null;
  const deleteButton = () => screen.queryByText("Delete")?.closest("button") ?? null;
  const confirmInput = () =>
    screen.queryByLabelText(/Type your first name to delete\.|Type DELETE to delete\./) as
      | HTMLInputElement
      | null;
  const startTypeStep = () => {
    fireEvent.click(deleteTrigger()!);
    fireEvent.click(screen.getByText("Continue"));
  };

  it("shows a quiet red trigger (44px+) in read mode; nothing dispatches until confirmed", () => {
    const { actions } = mountDialog(namedFamilySeed(), 0);
    const trigger = deleteTrigger()!;
    expect(trigger.className).toContain("min-h-[44px]");
    expect(trigger.className).toContain("hsl(4_72%_42%)"); // red text button
    expect(actions).toEqual([]);
  });

  it("is HIDDEN for the active business's promoted idea (and refusal-guarded beneath)", () => {
    let seed = validatedIdea(namedFamilySeed(), 0);
    seed = apply(seed, {
      type: "PROMOTE_IDEA",
      ideaId: seed.ideas[0].id!,
      businessId: "biz-1",
      at: 100,
    });
    mountDialog(seed, 0);
    expect(deleteTrigger()).toBeNull();
  });

  it("stays HIDDEN for an ARCHIVED business's idea (any business record protects it)", () => {
    let seed = validatedIdea(namedFamilySeed(), 0);
    seed = apply(
      seed,
      { type: "PROMOTE_IDEA", ideaId: seed.ideas[0].id!, businessId: "biz-1", at: 100 },
      { type: "ARCHIVE_BUSINESS", businessId: "biz-1", at: 200 },
    );
    mountDialog(seed, 0);
    expect(deleteTrigger()).toBeNull();
  });

  it("stays OFFERED for a non-promoted idea while a business is active", () => {
    let seed = validatedIdea(namedFamilySeed(), 0);
    seed = apply(seed, {
      type: "PROMOTE_IDEA",
      ideaId: seed.ideas[0].id!,
      businessId: "biz-1",
      at: 100,
    });
    mountDialog(seed, 1); // idea #2 is not the business
    expect(deleteTrigger()).toBeTruthy();
  });

  it("is HIDDEN for an id-less legacy idea (nothing to tombstone this session)", () => {
    const seed = apply(
      { ...namedFamilySeed(), ideas: [], activeIdea: 0 },
      { type: "CREATE_IDEA" }, // no ideaId: legacy in-memory shape
      { type: "CLOSE_RUNNER" },
    );
    mountDialog(seed, 0);
    expect(deleteTrigger()).toBeNull();
  });

  it("STEP 1: the trigger opens an inline confirm with the idea's name and Cancel/Continue", () => {
    mountDialog(namedFamilySeed(), 0);
    fireEvent.click(deleteTrigger()!);
    expect(
      screen.getByText(/Delete Slime Kits\? Everything about this idea goes away forever\. This cannot be undone\./),
    ).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("Continue")).toBeTruthy();
    expect(confirmInput()).toBeNull(); // no input yet
  });

  it("STEP 1 Cancel returns to the quiet trigger without dispatching", () => {
    const { actions } = mountDialog(namedFamilySeed(), 0);
    fireEvent.click(deleteTrigger()!);
    fireEvent.click(screen.getByText("Cancel"));
    expect(deleteTrigger()).toBeTruthy();
    expect(screen.queryByText("Continue")).toBeNull();
    expect(actions).toEqual([]);
  });

  it("STEP 2: type-to-confirm gates the red Delete button on the first name, case-insensitive + trimmed", () => {
    const { actions, flushNow } = mountDialog(namedFamilySeed(), 0);
    startTypeStep();
    const del = deleteButton()!;
    expect(del.className).toContain("min-h-[44px]");
    expect((del as HTMLButtonElement).disabled).toBe(true);
    // Wrong name keeps it disabled.
    fireEvent.change(confirmInput()!, { target: { value: "Bob" } });
    expect((deleteButton() as HTMLButtonElement).disabled).toBe(true);
    // A disabled click cannot dispatch.
    fireEvent.click(deleteButton()!);
    expect(actions).toEqual([]);
    expect(flushNow).not.toHaveBeenCalled();
    // Case-insensitive + trimmed match enables it.
    fireEvent.change(confirmInput()!, { target: { value: "  cedric " } });
    expect((deleteButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("falls back to requiring the word DELETE when the profile has no first name", () => {
    mountDialog(twoIdeaSeed(), 0); // firstName is "" in the base seed
    startTypeStep();
    expect(screen.getByLabelText("Type DELETE to delete.")).toBeTruthy();
    expect((deleteButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(confirmInput()!, { target: { value: "delete" } });
    expect((deleteButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("STEP 2 Cancel backs all the way out; reopening starts fresh (no sticky typed text)", () => {
    const { actions } = mountDialog(namedFamilySeed(), 0);
    startTypeStep();
    fireEvent.change(confirmInput()!, { target: { value: "Cedric" } });
    fireEvent.click(screen.getByText("Cancel"));
    expect(deleteTrigger()).toBeTruthy();
    startTypeStep();
    expect(confirmInput()!.value).toBe(""); // reset, not remembered
    expect((deleteButton() as HTMLButtonElement).disabled).toBe(true);
    expect(actions).toEqual([]);
  });

  it("Escape cancels the flow (closes the dialog, nothing dispatched)", () => {
    const { actions, closes, flushNow } = mountDialog(namedFamilySeed(), 0);
    startTypeStep();
    fireEvent.change(confirmInput()!, { target: { value: "Cedric" } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closes).toEqual([1]);
    expect(actions).toEqual([]);
    expect(flushNow).not.toHaveBeenCalled();
  });

  it("confirmed delete dispatches DELETE_IDEA exactly once, flushes once, and closes", () => {
    const { actions, closes, flushNow } = mountDialog(namedFamilySeed(), 0);
    startTypeStep();
    fireEvent.change(confirmInput()!, { target: { value: "cedric" } });
    fireEvent.click(deleteButton()!);
    expect(actions).toEqual([{ type: "DELETE_IDEA", ideaId: "idea-0" }]);
    expect(flushNow).toHaveBeenCalledTimes(1);
    expect(closes).toEqual([1]);
  });

  it("a REFUSAL (idea became a business's mid-flow) shows the kid-friendly note and does NOT close", () => {
    const refused = vi.fn().mockReturnValue(false);
    const { closes } = mountDialog(namedFamilySeed(), 0, { deleteIdea: refused });
    startTypeStep();
    fireEvent.change(confirmInput()!, { target: { value: "Cedric" } });
    fireEvent.click(deleteButton()!);
    expect(refused).toHaveBeenCalledWith("idea-0");
    expect(
      screen.getByText("This idea belongs to a business, so it cannot be deleted."),
    ).toBeTruthy();
    expect(closes).toEqual([]);
  });

  it("a CAP-FULL refusal shows the removed-a-lot note and does NOT close (no false success)", () => {
    const seed: GameState = {
      ...namedFamilySeed(),
      deletedIdeaIds: Array.from({ length: TOMBSTONE_CAP }, (_, i) => `old-${i}`),
    };
    const { actions, closes, flushNow } = mountDialog(seed, 0);
    startTypeStep();
    fireEvent.change(confirmInput()!, { target: { value: "Cedric" } });
    fireEvent.click(deleteButton()!);
    // The bound deleteIdea refused (cap full, id not tombstoned): nothing
    // dispatched, nothing flushed, dialog open with the honest cap note.
    expect(actions).toEqual([]);
    expect(flushNow).not.toHaveBeenCalled();
    expect(closes).toEqual([]);
    expect(
      screen.getByText("You have removed a lot of ideas. This one cannot be deleted right now."),
    ).toBeTruthy();
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

  // Captures the harness's live dispatch so a test can inject engine-side
  // actions (UNION_REMOTE) exactly as GameContext's onRebasedDoc wiring does.
  let latestDispatch: ((a: Action) => void) | null = null;
  function DispatchProbe() {
    const g = React.useContext(Ctx) as { dispatch: (a: Action) => void };
    latestDispatch = g.dispatch;
    return null;
  }

  function mountFactory(seed: GameState) {
    const actions: Action[] = [];
    const utils = render(
      <FloorHarness seed={seed} Ctx={Ctx} onAction={(a) => actions.push(a)}>
        <Factory />
        <DispatchProbe />
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

  it("an EMPTY 'New idea' slot keeps its behavior (creates an idea, no summary)", () => {
    const { actions } = mountFactory(withIdeas(1));
    openSellFloor();
    fireEvent.click(screen.getAllByRole("button", { name: "Start a new idea" })[0]);
    arrive();
    expect(actions.some((a) => a.type === "CREATE_IDEA")).toBe(true);
    expect(screen.queryByLabelText("Edit name")).toBeNull();
  });

  it("a union-driven reindex under the OPEN dialog keeps the SAME idea (identity, not index)", () => {
    const seed = apply(withIdeas(2), {
      type: "SET_FIELD",
      ideaIndex: 1,
      key: "productName",
      value: "Keeper",
    });
    mountFactory(seed);
    openSellFloor();
    fireEvent.click(screen.getByText("Idea #2").closest("button")!);
    arrive();
    expect(screen.getByTestId("fp-idea-name-bubble").textContent).toBe("Keeper");
    // Another tab deleted idea-0; its rebased doc feeds back MID-DIALOG and
    // reindexes the ideas array (idea-1 shifts to index 0).
    const remoteDoc = toSaveDoc(reducer(seed, { type: "DELETE_IDEA", ideaId: "idea-0" }));
    act(() => latestDispatch!({ type: "UNION_REMOTE", doc: remoteDoc }));
    // The dialog still shows the SAME idea (by id) — never a silent swap.
    expect(screen.getByTestId("fp-idea-name-bubble").textContent).toBe("Keeper");
    expect(screen.getByLabelText("Idea #1")).toBeTruthy(); // its resolved index is 0 now
  });

  it("the dialog CLOSES itself when ITS idea is deleted remotely", () => {
    const seed = withIdeas(2);
    mountFactory(seed);
    openSellFloor();
    fireEvent.click(screen.getByText("Idea #1").closest("button")!);
    arrive();
    expect(screen.getByLabelText("Idea #1")).toBeTruthy(); // the dialog
    const remoteDoc = toSaveDoc(reducer(seed, { type: "DELETE_IDEA", ideaId: "idea-0" }));
    act(() => latestDispatch!({ type: "UNION_REMOTE", doc: remoteDoc }));
    // Not showing/editing a DIFFERENT idea: the dialog is gone entirely (and
    // the stale open-state cleared, so the floor is interactive again).
    expect(screen.queryByLabelText("Edit name")).toBeNull();
    expect(screen.queryByLabelText("Back to the floor")).toBeNull();
  });

  it("an openIdea walk arriving AFTER a remote deletion no-ops (stale in-flight intent)", () => {
    const seed = withIdeas(2);
    mountFactory(seed);
    openSellFloor();
    fireEvent.click(screen.getByText("Idea #1").closest("button")!); // walk starts (~550ms)
    // The deletion lands while the avatar is still walking.
    const remoteDoc = toSaveDoc(reducer(seed, { type: "DELETE_IDEA", ideaId: "idea-0" }));
    act(() => latestDispatch!({ type: "UNION_REMOTE", doc: remoteDoc }));
    arrive();
    // Arrival resolved the id against live state, found nothing, opened nothing.
    expect(screen.queryByLabelText("Edit name")).toBeNull();
    expect(screen.queryByLabelText("Back to the floor")).toBeNull();
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
