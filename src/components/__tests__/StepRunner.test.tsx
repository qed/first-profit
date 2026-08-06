// @vitest-environment jsdom
/**
 * Step Runner + Celebration render checks. These drive the REAL gameCore reducer
 * (not a stub) through a minimal test provider so the UI is verified end to end:
 * typing into a criterion field mirrors to the account-scoped draft cache, and
 * completing the last task of a criterion swaps the runner for the celebration
 * that lists the next unlocked room. The live 390px pixel pass is Unit 12.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  reducer,
  initialState,
  taskKey,
  isTaskDone as isTaskDoneFn,
  type GameState,
} from "../../state/gameCore";

// A real React context stands in for GameContext; useGame reads it.
vi.mock("../../state/GameContext", async () => {
  const R = await import("react");
  const Ctx = R.createContext<unknown>(null);
  return { __ctx: Ctx, useGame: () => R.useContext(Ctx) };
});

// Deterministic draft cache keyed to a fixed user (exercises the R6 mirror).
vi.mock("../../lib/draftCache", () => {
  const store = new Map<string, string>();
  return {
    getLastUserId: () => "user-1",
    getDraft: (userId: string, name: string) => {
      const raw = store.get(`${userId}:${name}`);
      return raw === undefined ? undefined : JSON.parse(raw);
    },
    setDraft: (userId: string, name: string, value: unknown) => {
      store.set(`${userId}:${name}`, JSON.stringify(value));
    },
  };
});

// Public-site flag (Unit 6 one-liner public-string treatment): default OFF so
// every pre-Unit-6 scenario runs against the unchanged runner; the public-
// string describe flips it per test.
let publicSiteFlag = false;
vi.mock("../../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config")>();
  return { ...actual, isPublicSiteEnabled: () => publicSiteFlag };
});

import * as GameContext from "../../state/GameContext";
import { StepRunner, taskIdFor } from "../StepRunner";
import { MORE_TOOLS_COPY } from "../MoreToolsModal";
import { Celebration } from "../Celebration";
import { PATH_CONTENT, phaseById, STEPS, taskById, taskTitleForBand } from "../../data/path";
import type { Band } from "../../data/path";
import { FEEDBACK_TASK_ID_RE, FEEDBACK_TASK_ID_MAX } from "../../lib/sync";
import { OBJECTION_LOG_FIELD_KEYS } from "../../lib/objectionLog";
import { SAY_BACK_FIELD_KEYS } from "../../lib/sayBack";
import { PRICE_PICKER_FIELD_KEYS } from "../../lib/pricePicker";
import {
  TEN_LIST_FIELD_KEYS,
  TEN_LIST_SIZE,
  tenListRowFieldKey,
} from "../../lib/tenList";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

/** jsdom normalizes inline hsl() to rgba(); compare through the same pipe. */
function cssBackground(value: string): string {
  const el = document.createElement("div");
  el.style.background = value;
  return el.style.background;
}

function Harness({
  seed,
  onAction,
  band = "g6_8",
  flushNow,
  submitFeedback,
}: {
  seed: GameState;
  onAction?: (a: unknown) => void;
  /** The session band GameContext derives from the grade (displayBand). */
  band?: Band;
  /** GameApi.flushNow stand-in (Unit 6 one-liner commit → immediate flush). */
  flushNow?: () => Promise<string>;
  /** GameApi.submitFeedback stand-in (the More-tools modal's send channel). */
  submitFeedback?: (taskId: string, body: string) => Promise<unknown>;
}) {
  const [state, rawDispatch] = React.useReducer(reducer, seed);
  const dispatch: typeof rawDispatch = (action) => {
    onAction?.(action);
    rawDispatch(action);
  };
  const value = {
    ...state,
    dispatch,
    band,
    flushNow,
    submitFeedback: submitFeedback ?? (async () => "sent" as const),
    isTaskDone: (ideaIndex: number, stepId: string, index: number) =>
      isTaskDoneFn(state, ideaIndex, stepId, index),
  };
  return (
    <Ctx.Provider value={value}>
      <StepRunner />
      <Celebration />
    </Ctx.Provider>
  );
}

/** State with idea #0 at 1.1's final task, first four tasks already done. */
function seedAtLastTaskOf11(): GameState {
  const s = initialState();
  const done: Record<string, boolean> = {};
  for (let i = 0; i < 4; i++) done[taskKey("1.1", i)] = true;
  return {
    ...s,
    stage: "app",
    ideas: [{ fields: {}, done }],
    activeIdea: 0,
    runnerOpen: true,
    runnerStep: "1.1",
    runnerIndex: 4,
  };
}

/** State at the pilot tool's task, with task 1 already complete. */
function seedAtPitchTask(fields: Record<string, string> = {}): GameState {
  const s = initialState();
  return {
    ...s,
    stage: "app",
    ideas: [{ fields, done: { [taskKey("1.1", 0)]: true } }],
    activeIdea: 0,
    runnerOpen: true,
    runnerStep: "1.1",
    runnerIndex: 1,
  };
}

/** State at the 1.1.1 brainstorming tool. */
function seedAtIdeaTask(fields: Record<string, string> = {}): GameState {
  const s = initialState();
  return {
    ...s,
    stage: "app",
    ideas: [{ fields, done: {} }],
    activeIdea: 0,
    runnerOpen: true,
    runnerStep: "1.1",
    runnerIndex: 0,
  };
}

/** State at the 1.1.3 Rehearsal Studio task. */
function seedAtRehearsalTask(fields: Record<string, string> = {}): GameState {
  const s = initialState();
  return {
    ...s,
    stage: "app",
    ideas: [{
      fields,
      done: {
        [taskKey("1.1", 0)]: true,
        [taskKey("1.1", 1)]: true,
      },
    }],
    activeIdea: 0,
    runnerOpen: true,
    runnerStep: "1.1",
    runnerIndex: 2,
  };
}

/** State at the 1.1.4 Objection Log task. */
function seedAtObjectionTask(fields: Record<string, string> = {}): GameState {
  const s = initialState();
  return {
    ...s,
    stage: "app",
    ideas: [{
      fields,
      done: {
        [taskKey("1.1", 0)]: true,
        [taskKey("1.1", 1)]: true,
        [taskKey("1.1", 2)]: true,
      },
    }],
    activeIdea: 0,
    runnerOpen: true,
    runnerStep: "1.1",
    runnerIndex: 3,
  };
}

/** State at the first Sales Room task, the 1.2.1 Price Picker. */
function seedAtPriceTask(fields: Record<string, string> = {}): GameState {
  const s = initialState();
  return {
    ...s,
    stage: "app",
    ideas: [{ fields, done: {} }],
    activeIdea: 0,
    runnerOpen: true,
    runnerStep: "1.2",
    runnerIndex: 0,
  };
}

/** State at the 1.2.2 Ten-List Builder, with the price task complete. */
function seedAtTenListTask(fields: Record<string, string> = {}): GameState {
  const s = initialState();
  return {
    ...s,
    stage: "app",
    ideas: [{ fields, done: { [taskKey("1.2", 0)]: true } }],
    activeIdea: 0,
    runnerOpen: true,
    runnerStep: "1.2",
    runnerIndex: 1,
  };
}

afterEach(() => {
  cleanup();
  publicSiteFlag = false;
});

/**
 * The runner is a sectioned VIEW as of 2026-08-04 (Overview / Instructions /
 * Inputs / Tools in a left nav), so content that used to be on one long scroll
 * now lives behind a section button. Every test that reads task words or
 * fields opens its section first. Overview is the default on open.
 */
/**
 * The room header states the whole address as number blocks (2026-08-04):
 * [phase] Criterion [n] Task [n] + the criterion headline. Returns the three
 * numbers in order so tests can assert position on The Path directly.
 */
function headerBlocks() {
  const header = document.querySelector("header") as HTMLElement;
  return Array.from(header.querySelectorAll("span[style*='background']")).map(
    (el) => (el.textContent || "").trim(),
  );
}

function headerPhaseBlock() {
  const header = document.querySelector("header") as HTMLElement;
  return header.querySelector("span[style*='background']") as HTMLElement;
}

function openSection(label: "Overview" | "Instructions" | "Inputs" | "Tools") {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("StepRunner", () => {
  it("shows the criterion header, task rail count, and done-when for 1.1", () => {
    render(<Harness seed={seedAtLastTaskOf11()} />);
    // The header states the whole address: phase 1, criterion 1, task 5.
    expect(headerBlocks()).toEqual(["1", "1", "5"]);
    expect(screen.getByText("Criterion")).toBeTruthy();
    expect(screen.getByText("Task")).toBeTruthy();
    // ...plus the UNIT TASK's title, which is the view's accessible name and
    // changes task to task (the criterion title was static across all five).
    expect(document.getElementById("fp-runner-title")?.textContent).toBe(
      taskTitleForBand("1.1.5", "g6_8"),
    );
    openSection("Instructions");
    expect(screen.getByText("Done when")).toBeTruthy();
    // Real path.ts copy, em-dash free.
    expect(document.body.textContent).not.toMatch(/—/);
  });

  it("the left nav switches sections and routes task 1.1.5 to Say-Back Card", () => {
    render(<Harness seed={seedAtLastTaskOf11()} />);
    // The four sections exist as a nav, and the view is NOT a floating card.
    const nav = screen.getByRole("navigation", { name: "Task sections" });
    expect(nav).toBeTruthy();
    for (const label of ["Overview", "Instructions", "Inputs", "Tools"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    // Overview by default: a "Summary" headline over the TASK's description,
    // and Instructions' content is not mounted.
    expect(screen.getByText("Summary")).toBeTruthy();
    expect(document.body.textContent).toContain(taskById("1.1.5")!.body);
    expect(screen.queryByText("Done when")).toBeNull();

    openSection("Tools");
    expect(screen.getByText("Say-Back Card")).toBeTruthy();
    expect(screen.queryByText("Tools to help you complete the unit task will go here.")).toBeNull();
    // Switching sections shows one at a time.
    expect(screen.queryByText("Summary")).toBeNull();

    // This task (index 4) has no authored fields, so Inputs says so plainly —
    // as a HEADLINE, like every other section (owner spec 2026-08-04).
    openSection("Inputs");
    const inputsHeading = screen.getByText("Steps to finish");
    expect(inputsHeading.tagName).toBe("H3");
    expect(inputsHeading.className).toContain("font-black");
    const noInputs = screen.getByText(/nothing to type in/i);
    expect(noInputs.tagName).toBe("P");
    expect(noInputs.className).toContain("font-normal");
    expect(noInputs.className).toContain("text-[22px]"); // same size as the heading
    // The task-specific tool returns when we switch back.
    openSection("Tools");
    expect(screen.getByText("Say-Back Card")).toBeTruthy();
    expect(screen.queryByText(/Tools to help you complete/)).toBeNull();
  });

  it("routes task 1.1.2 Tools to the pitch builder and persists structured + combined fields", () => {
    const actions: unknown[] = [];
    render(<Harness seed={seedAtPitchTask()} onAction={(action) => actions.push(action)} />);

    openSection("Tools");
    expect(screen.getByText("60-Second Pitch Builder")).toBeTruthy();
    expect(screen.queryByText("Tools to help you complete the unit task will go here.")).toBeNull();
    expect(document.querySelector("[data-runner-avatar]")).toBeNull();

    fireEvent.change(screen.getByLabelText("1. Hook"), {
      target: { value: "What if your neighborhood stories could fit in your pocket?" },
    });

    expect(actions).toContainEqual({
      type: "SET_FIELD",
      ideaIndex: 0,
      key: "pitchHook",
      value: "What if your neighborhood stories could fit in your pocket?",
    });
    expect(actions).toContainEqual({
      type: "SET_FIELD",
      ideaIndex: 0,
      key: "pitch",
      value: "What if your neighborhood stories could fit in your pocket?",
    });

    // Tool controls respond immediately to mouse clicks and do not use the
    // room's move-first delay, which would park the avatar over the timer.
    fireEvent.click(screen.getByRole("button", { name: "Start run" }), { detail: 1 });
    expect(screen.getByRole("button", { name: "Pause run" })).toBeTruthy();
  });

  it("routes task 1.1.1 Tools to the idea lab and writes its brainstorm inputs through SET_FIELD", () => {
    const actions: unknown[] = [];
    render(<Harness seed={seedAtIdeaTask()} onAction={(action) => actions.push(action)} />);

    openSection("Tools");
    expect(screen.getByText("Business Idea Spark Lab")).toBeTruthy();
    expect(screen.queryByText("Tools to help you complete the unit task will go here.")).toBeNull();
    expect(document.querySelector("[data-runner-avatar]")).toBeNull();

    fireEvent.change(screen.getByLabelText("Favorite board game"), {
      target: { value: "Chess" },
    });
    expect(actions).toContainEqual({
      type: "SET_FIELD",
      ideaIndex: 0,
      key: "brainstormBoardGame",
      value: "Chess",
    });
  });

  it("routes task 1.1.3 Tools to Rehearsal Studio and completes restored three-run evidence", () => {
    const actions: unknown[] = [];
    render(
      <Harness
        seed={seedAtRehearsalTask({ rehearsalCleanRuns: "3" })}
        onAction={(action) => actions.push(action)}
      />,
    );

    openSection("Tools");
    expect(screen.getByText("Rehearsal Studio")).toBeTruthy();
    expect(screen.queryByText("Tools to help you complete the unit task will go here.")).toBeNull();
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "COMPLETE_TASK",
          ideaIndex: 0,
          stepId: "1.1",
          index: 2,
        }),
      ]),
    );
    expect(screen.getByText("Next task →")).toBeTruthy();
  });

  it("routes task 1.1.4 Tools to Objection Log with band copy and restored evidence", () => {
    const actions: unknown[] = [];
    render(
      <Harness
        band="g9_12"
        seed={seedAtObjectionTask({
          [OBJECTION_LOG_FIELD_KEYS.exact]: "Why is it worth the price?",
          [OBJECTION_LOG_FIELD_KEYS.beat]: "pitchWhy",
          [OBJECTION_LOG_FIELD_KEYS.original]: "It is fun.",
          [OBJECTION_LOG_FIELD_KEYS.revision]: "It turns local history into a collectible game.",
          [OBJECTION_LOG_FIELD_KEYS.applied]: "true",
        })}
        onAction={(action) => actions.push(action)}
      />,
    );

    openSection("Tools");
    expect(screen.getByText("Objection Log")).toBeTruthy();
    expect(screen.getByText("Answer a second objection live")).toBeTruthy();
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "COMPLETE_TASK",
          ideaIndex: 0,
          stepId: "1.1",
          index: 3,
        }),
      ]),
    );
    expect(screen.getByText("Next task →")).toBeTruthy();
  });

  it("completes restored Say-Back Card evidence and opens the criterion celebration", () => {
    const actions: unknown[] = [];
    const seed = seedAtLastTaskOf11();
    render(
      <Harness
        seed={{
          ...seed,
          ideas: [{
            ...seed.ideas[0],
            fields: {
              [SAY_BACK_FIELD_KEYS.adultName]: "Coach Lee",
              [SAY_BACK_FIELD_KEYS.date]: "2026-08-06",
              [SAY_BACK_FIELD_KEYS.productWords]: "Custom cards about local history",
              [SAY_BACK_FIELD_KEYS.askWords]: "Choose a first pack",
              [SAY_BACK_FIELD_KEYS.productMatch]: "yes",
              [SAY_BACK_FIELD_KEYS.askMatch]: "yes",
              [SAY_BACK_FIELD_KEYS.witnessed]: "true",
              [SAY_BACK_FIELD_KEYS.reviewed]: "true",
              [SAY_BACK_FIELD_KEYS.outcome]: "matched",
            },
          }],
        }}
        onAction={(action) => actions.push(action)}
      />,
    );

    openSection("Tools");
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "COMPLETE_TASK",
          ideaIndex: 0,
          stepId: "1.1",
          index: 4,
        }),
      ]),
    );
    expect(screen.getByText("Criterion passed")).toBeTruthy();
    expect(screen.getByText("1.2 · The Sales Room")).toBeTruthy();
  });

  it("routes task 1.2.1 to Price Picker, restores its evidence, and completes the task", () => {
    const actions: unknown[] = [];
    render(
      <Harness
        seed={seedAtPriceTask({
          [PRICE_PICKER_FIELD_KEYS.offer]: "Custom chess pieces",
          [PRICE_PICKER_FIELD_KEYS.unit]: "One set of eight custom pawns",
          [PRICE_PICKER_FIELD_KEYS.price]: "30",
          [PRICE_PICKER_FIELD_KEYS.estimatedCost]: "12",
          [PRICE_PICKER_FIELD_KEYS.parentCostCheck]: "true",
          [PRICE_PICKER_FIELD_KEYS.reason]: "It covers materials and leaves room for my work.",
          [PRICE_PICKER_FIELD_KEYS.confirmed]: "true",
        })}
        onAction={(action) => actions.push(action)}
      />,
    );

    openSection("Tools");
    expect(screen.getByText("Price Picker")).toBeTruthy();
    expect(screen.queryByText("Tools to help you complete the unit task will go here.")).toBeNull();
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "COMPLETE_TASK",
          ideaIndex: 0,
          stepId: "1.2",
          index: 0,
        }),
      ]),
    );
    expect(screen.getByText("Next task →")).toBeTruthy();
  });

  it("routes task 1.2.2 to Ten-List Builder, restores its evidence, and completes the task", () => {
    const actions: unknown[] = [];
    const fields: Record<string, string> = {
      [TEN_LIST_FIELD_KEYS.parentApproved]: "true",
      [TEN_LIST_FIELD_KEYS.confirmed]: "true",
    };
    for (let index = 0; index < TEN_LIST_SIZE; index += 1) {
      fields[tenListRowFieldKey(index, "name")] = `Prospect ${index + 1}`;
      fields[tenListRowFieldKey(index, "channel")] = "parent-message";
      if (index < 3) fields[tenListRowFieldKey(index, "outside")] = "true";
    }

    render(
      <Harness
        seed={seedAtTenListTask(fields)}
        onAction={(action) => actions.push(action)}
      />,
    );

    openSection("Tools");
    expect(screen.getByText("Ten-List Builder")).toBeTruthy();
    expect(screen.queryByText("Tools to help you complete the unit task will go here.")).toBeNull();
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "COMPLETE_TASK",
          ideaIndex: 0,
          stepId: "1.2",
          index: 1,
        }),
      ]),
    );
    expect(screen.getByText("Next task →")).toBeTruthy();
  });

  it("fills the FLOOR box, not the viewport, and is not a floating modal card", () => {
    render(<Harness seed={seedAtLastTaskOf11()} />);
    const view = screen.getByRole("dialog");
    // Change 16: absolute inside Factory's floor region — NOT fixed to the
    // viewport — so the GlobalNav above it stays visible and usable.
    expect(view.className).toContain("absolute inset-0");
    expect(view.className).not.toMatch(/\bfixed\b/);
    // Change 30: BELOW the nav bar (z-50), so the bar's dropdowns open over
    // the room; still above the floor's dock and GradeAsk (both z-40).
    expect(view.className).toContain("z-[45]");
    // It wears the floor's own rounded red border, so it lands inside it.
    expect(view.className).toContain("rounded-[22px]");
    expect(view.className).toContain("border-[hsl(14_78%_54%/0.5)]");
    // Not a modal: the nav is deliberately still reachable.
    expect(view.getAttribute("aria-modal")).toBeNull();
    // No scrim wrapper and no rounded floating card at sm.
    expect(view.className).not.toMatch(/sm:max-w-/);
    expect(view.className).not.toMatch(/sm:rounded-3xl/);
    expect(view.parentElement?.className ?? "").not.toMatch(/bg-\[hsl\(25_34%_20%\/0\.55\)\]/);
    // The ✕ still returns you to the room behind it.
    expect(screen.getByLabelText("Close")).toBeTruthy();
  });

  it("renders the productName + oneLiner inputs on task 1 and mirrors keystrokes into the reducer", () => {
    const s = seedAtLastTaskOf11();
    render(<Harness seed={{ ...s, runnerIndex: 0, ideas: [{ fields: {}, done: {} }] }} />);
    openSection("Inputs");
    const nameInput = screen.getByLabelText("Product name") as HTMLInputElement;
    const linerInput = screen.getByLabelText("Your one-liner") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Bracelets" } });
    fireEvent.change(linerInput, { target: { value: "My idea" } });
    expect((screen.getByLabelText("Product name") as HTMLInputElement).value).toBe("Bracelets");
    expect((screen.getByLabelText("Your one-liner") as HTMLInputElement).value).toBe("My idea");
  });

  it("doIt dispatches COMPLETE_TASK with a NUMERIC caller-stamped `at` (R13 stall queryability)", () => {
    const actions: unknown[] = [];
    render(<Harness seed={seedAtLastTaskOf11()} onAction={(a) => actions.push(a)} />);
    fireEvent.click(screen.getByText("✓ I did it"));
    const complete = actions.find(
      (a): a is { type: string; ideaIndex: number; stepId: string; index: number; at: unknown } =>
        (a as { type?: string }).type === "COMPLETE_TASK",
    );
    expect(complete).toBeDefined();
    if (!complete) throw new Error("COMPLETE_TASK was not dispatched");
    expect(complete).toMatchObject({ ideaIndex: 0, stepId: "1.1", index: 4 });
    expect(typeof complete.at).toBe("number");
    expect(Number.isFinite(complete.at as number)).toBe(true);
  });

  it("carries NONE of the retired affordances (Change #8): no Back to the floor, no Idea-Room link, no Stuck", () => {
    render(<Harness seed={seedAtLastTaskOf11()} />);
    expect(document.body.textContent).not.toMatch(/Back to the floor/i);
    expect(document.body.textContent).not.toMatch(/Everything you need for this task/i);
    expect(document.body.textContent).not.toMatch(/Stuck/i);
    // The header ✕ is the one close control.
    expect(screen.getByLabelText("Close")).toBeTruthy();
  });

  it("renders the action row: More tools please BOTTOM-LEFT in logo blue, green CTA right", () => {
    render(<Harness seed={seedAtLastTaskOf11()} />);
    const more = screen.getByText("More tools please") as HTMLElement;
    const cta = screen.getByText("✓ I did it") as HTMLElement;
    // Same row, but More tools is pushed to the LEFT edge by mr-auto so the
    // beta-feedback route is unmissable (2026-08-04).
    const row = more.parentElement as HTMLElement;
    expect(row).toBe(cta.parentElement);
    expect(more.className).toContain("mr-auto");
    // Filled with the First Profit logo blue (`build`) + white text.
    expect(more.className).toContain("bg-build");
    expect(more.className).toContain("text-white");
    expect(more.className).not.toContain("border-2");
    // Both stay kid-tappable at 390px.
    expect(more.className).toContain("min-h-[44px]");
    expect(cta.className).toContain("min-h-[44px]");
    expect(cta.className).toContain("bg-verified");
    // The CTA no longer stretches to hero width.
    expect(cta.className).not.toContain("flex-1");
  });

  it("the task rail is navigation: each segment jumps the runner to that task", () => {
    const actions: { type: string; index?: number; stepId?: string }[] = [];
    render(
      <Harness seed={seedAtLastTaskOf11()} onAction={(a) => actions.push(a as typeof actions[number])} />,
    );
    const rail = screen.getAllByRole("button", { name: /^Task \d+ of \d+: / });
    expect(rail.length).toBeGreaterThan(1);
    // The current task's segment is marked and inert.
    const current = rail.find((b) => b.getAttribute("aria-current") === "step")!;
    expect(current).toBeTruthy();
    fireEvent.click(current);
    expect(actions.some((a) => a.type === "OPEN_RUNNER")).toBe(false);
    // Any OTHER segment jumps straight to that index, completing nothing.
    const other = rail.findIndex((b) => b !== current);
    fireEvent.click(rail[other]);
    expect(actions).toContainEqual({ type: "OPEN_RUNNER", stepId: "1.1", index: other });
    expect(actions.some((a) => a.type === "COMPLETE_TASK")).toBe(false);
  });

  it("renders PHASE-AWARE header chrome on a Build criterion (2.1)", () => {
    const s = initialState();
    const seed: GameState = {
      ...s,
      stage: "app",
      ideas: [{ fields: {}, done: {} }],
      activeIdea: 0,
      runnerOpen: true,
      runnerStep: "2.1",
      runnerIndex: 0,
    };
    render(<Harness seed={seed} />);
    expect(headerBlocks()).toEqual(["2", "1", "1"]);
    expect(document.getElementById("fp-runner-title")?.textContent).toBe(
      taskTitleForBand("2.1.1", "g6_8"),
    );
  });

  it("the task rail shows SIX segments on 2.3 (variable task counts honored)", () => {
    const s = initialState();
    const seed: GameState = {
      ...s,
      stage: "app",
      ideas: [{ fields: {}, done: {} }],
      activeIdea: 0,
      runnerOpen: true,
      runnerStep: "2.3",
      runnerIndex: 0,
    };
    const { container } = render(<Harness seed={seed} />);
    // Criterion position derives from the phase's ordered ids, not the raw id digit.
    expect(headerBlocks()).toEqual(["2", "3", "1"]);
    // One rail segment bar per REAL task: 2.3 carries six.
    expect(container.querySelectorAll(".h-1\\.5").length).toBe(6);
  });



  it("themes the runner chrome in PHASE COLORS on a Build criterion (2.1)", () => {
    const s = initialState();
    const seed: GameState = {
      ...s,
      stage: "app",
      ideas: [{ fields: {}, done: {} }],
      activeIdea: 0,
      runnerOpen: true,
      runnerStep: "2.1",
      runnerIndex: 0,
    };
    const { container } = render(<Harness seed={seed} />);
    const build = phaseById("build");
    // Header wash + label text carry the Build hsl chrome from PHASES (jsdom
    // normalizes hsl to rgba, so compare via the same normalization).
    // The header carries NO background of its own now; the phase color lives
    // in its numbered phase block instead.
    const header = container.querySelector("header") as HTMLElement;
    expect(header.style.background).toBe("");
    expect(headerPhaseBlock().style.background).toBe(cssBackground(build.accent));
    expect(headerPhaseBlock().className).toContain("text-white");
    // The primary CTA takes the Build ctaFill (non-sell phases only) — the
    // WCAG-safe deepened fill, never the raw accent (unit review FIX 4).
    const cta = screen.getByText("✓ I did it") as HTMLElement;
    expect(cta.style.background).toBe(cssBackground(build.ctaFill));
    const shadowProbe = document.createElement("div");
    shadowProbe.style.boxShadow = `0 3px 0 ${build.ctaShadow}`;
    expect(cta.style.boxShadow).toBe(shadowProbe.style.boxShadow);
  });

  it("keeps the SELL runner exactly as before Unit 8 (verified-green CTA, sell wash)", () => {
    const { container } = render(<Harness seed={seedAtLastTaskOf11()} />);
    const header = container.querySelector("header") as HTMLElement;
    expect(header.style.background).toBe("");
    // Sell's phase block carries the sell accent, white text.
    expect(headerPhaseBlock().style.background).toBe(cssBackground(phaseById("sell").accent));
    expect(headerPhaseBlock().className).toContain("text-white");
    // Sell's CTA keeps the bg-verified class with NO inline phase override.
    const cta = screen.getByText("✓ I did it") as HTMLElement;
    expect(cta.className).toContain("bg-verified");
    expect(cta.style.background).toBe("");
  });

  it("a MOUSE click walks the avatar first, then runs the action; keyboard runs at once", () => {
    vi.useFakeTimers();
    try {
      render(<Harness seed={seedAtLastTaskOf11()} />);

      // A real pointer click (detail 1) defers: the section has NOT switched
      // yet, because the avatar is still walking to the pointer.
      fireEvent.click(screen.getByRole("button", { name: "Instructions" }), { detail: 1 });
      expect(screen.queryByText("Done when")).toBeNull();
      // ...and it lands once the walk is over.
      act(() => void vi.advanceTimersByTime(400));
      expect(screen.getByText("Done when")).toBeTruthy();

      // Keyboard / programmatic activation (detail 0) is immediate: a keyboard
      // user must never wait out an animation they did not aim.
      fireEvent.click(screen.getByRole("button", { name: "Overview" }));
      expect(screen.getByText("Summary")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("phase 5 (scale) takes INK text on its header block, where white is unreadable", () => {
    // Scale's accent is amber: white on it is 1.97:1. It is the ONE phase
    // block that flips to ink (owner spec 2026-08-04).
    const s = initialState();
    const seed: GameState = {
      ...s,
      stage: "app",
      ideas: [{ fields: {}, done: {} }],
      activeIdea: 0,
      runnerOpen: true,
      runnerStep: "5.1",
      runnerIndex: 0,
    };
    render(<Harness seed={seed} />);
    expect(headerBlocks()[0]).toBe("5");
    expect(headerPhaseBlock().style.background).toBe(cssBackground(phaseById("scale").accent));
    expect(headerPhaseBlock().className).toContain("text-[hsl(25_34%_20%)]");
    expect(headerPhaseBlock().className).not.toContain("text-white");
  });

  it("renders BAND-RESOLVED copy: the same task shows different words for g3_5 vs g9_12", () => {
    // 1.1.1 carries authored variants for all three bands (generated content).
    const task = taskById("1.1.1")!;
    const g35 = task.bandVariants.g3_5!;
    const g912 = task.bandVariants.g9_12!;
    expect(g35).toBe(
      "Parent scribes; child chooses the product and says the sentence unprompted.",
    );
    expect(g912).toBe(
      "Child also writes one sentence on who the *wrong* customer is and why.",
    );
    const seed: GameState = {
      ...seedAtLastTaskOf11(),
      runnerIndex: 0,
      ideas: [{ fields: {}, done: {} }],
    };

    const younger = render(<Harness seed={seed} band="g3_5" />);
    openSection("Instructions");
    // Shared body + the g3_5 variant line; never the g9_12 line.
    expect(document.body.textContent).toContain(task.body);
    expect(document.body.textContent).toContain(g35);
    expect(document.body.textContent).not.toContain("wrong customer");
    // The per-TASK done-when (generated), not the criterion-level STEP_META line.
    expect(document.body.textContent).toContain(task.doneWhen);
    younger.unmount();

    render(<Harness seed={seed} band="g9_12" />);
    openSection("Instructions");
    // Same task, different visible copy: emphasis markers render stripped.
    expect(document.body.textContent).toContain(
      "Child also writes one sentence on who the wrong customer is and why.",
    );
    expect(document.body.textContent).not.toContain(g35);
    expect(document.body.textContent).toContain(task.doneWhen);
  });

  it("renders the per-task done-when and banded title on a band WITHOUT a variant (fallback = shared body)", () => {
    // 1.1.3 has g3_5 and g9_12 variants but NO g6_8 one: the middle band
    // (also the unknown-grade display default) reads the shared body alone.
    const task = taskById("1.1.3")!;
    expect(task.bandVariants.g6_8).toBeUndefined();
    const seed: GameState = {
      ...seedAtLastTaskOf11(),
      runnerIndex: 2,
      ideas: [{ fields: {}, done: {} }],
    };
    render(<Harness seed={seed} band="g6_8" />);
    openSection("Instructions");
    // The banded title renders three times by design: the rail segment, the
    // room header (change 28), and the Instructions h3.
    expect(screen.getAllByText("Rehearse to camera until note-free").length).toBe(3);
    expect(document.body.textContent).toContain(task.body);
    expect(document.body.textContent).toContain(task.doneWhen);
    expect(document.body.textContent).not.toContain(task.bandVariants.g3_5!);
    expect(document.body.textContent).not.toContain(task.bandVariants.g9_12!);
  });

  it("shows a substantive All bands note (emphasis stripped) on 1.2.5", () => {
    const seed: GameState = {
      ...seedAtLastTaskOf11(),
      runnerStep: "1.2",
      runnerIndex: 4,
      ideas: [{ fields: {}, done: {} }],
    };
    render(<Harness seed={seed} />);
    openSection("Instructions");
    expect(document.body.textContent).toContain(
      "All bands: as written; 9–12 adds one sentence on what they'd change about the sale process.",
    );
  });

  it("completing the last task swaps the runner for the celebration listing 1.2", () => {
    render(<Harness seed={seedAtLastTaskOf11()} />);
    fireEvent.click(screen.getByText("✓ I did it"));
    // Celebration replaces the runner.
    expect(screen.getByText("Criterion passed")).toBeTruthy();
    expect(screen.getByText("Pitch a product in 60 seconds, no notes")).toBeTruthy();
    expect(screen.getByText("+60 XP")).toBeTruthy();
    expect(screen.getByText("1.2 · The Sales Room")).toBeTruthy();
    // Only one modal: the runner's action button is gone.
    expect(screen.queryByText("✓ I did it")).toBeNull();
  });

  it("review mode on a DONE middle task: the compact CTA reads Next task and advances the index", () => {
    const s = seedAtLastTaskOf11();
    // Task index 0 is already done; the runner sits on it in review.
    const actions: unknown[] = [];
    render(
      <Harness seed={{ ...s, runnerIndex: 0 }} onAction={(a) => actions.push(a)} />,
    );
    const next = screen.getByText("Next task →") as HTMLElement;
    expect(next.className).toContain("min-h-[44px]");
    fireEvent.click(next);
    expect(actions).toContainEqual({ type: "OPEN_RUNNER", stepId: "1.1", index: 1 });
    // The header's task block is the counter now.
    expect(headerBlocks()).toEqual(["1", "1", "2"]);
  });

  it("review mode on the DONE last task: ✓ Done is LIVE and returns to the floor", () => {
    // 2026-08-04: finishing a room used to leave a greyed-out dead end here.
    const s = seedAtLastTaskOf11();
    const done = { ...s.ideas[0].done, [taskKey("1.1", 4)]: true };
    const actions: unknown[] = [];
    render(
      <Harness seed={{ ...s, ideas: [{ fields: {}, done }] }} onAction={(a) => actions.push(a)} />,
    );
    const doneBtn = screen.getByText("✓ Done") as HTMLButtonElement;
    expect(doneBtn.disabled).toBe(false);
    expect(doneBtn.className).toContain("min-h-[44px]");
    expect(doneBtn.className).not.toContain("opacity-60");
    fireEvent.click(doneBtn);
    // Same exit the ✕ fires, and it completes nothing on the way out.
    expect(actions).toContainEqual({ type: "CLOSE_RUNNER" });
    expect(actions.some((a) => (a as { type: string }).type === "COMPLETE_TASK")).toBe(false);
  });
});

describe("taskIdFor (synthesized stable task id, moved from the retired StuckBox)", () => {
  it("pins the 1:1 alignment: task index 4 of criterion 1.2 stamps 1.2.5", () => {
    expect(taskIdFor("1.2", 4)).toBe("1.2.5");
    expect(taskIdFor("1.1", 0)).toBe("1.1.1");
  });

  it("ALL-25 SYNTHESIS PIN: every criterion x index matches the GENERATED id", () => {
    // The synthesis is only honest while the generated ids stay 1-based
    // positional per criterion. Assert against PATH_CONTENT directly — a
    // future id-scheme change fails here, not in a silent feedback-row
    // mismatch.
    const criteria = PATH_CONTENT.phases.flatMap((phase) => phase.criteria);
    expect(criteria.length).toBe(25);
    for (const criterion of criteria) {
      expect(criterion.tasks.length).toBeGreaterThan(0);
      criterion.tasks.forEach((task, index) => {
        expect(taskIdFor(criterion.id, index)).toBe(task.id);
      });
    }
  });

  it("SWEEP: every (stepId x task index) id satisfies the DB CHECK mirror", () => {
    // Every id the producer can mint across the full sequence must nest inside
    // the acceptor pair (regex + 16-char bound).
    for (const step of STEPS) {
      expect(step.tasks.length).toBeGreaterThan(0);
      for (let i = 0; i < step.tasks.length; i++) {
        const id = taskIdFor(step.id, i);
        expect(id).toMatch(FEEDBACK_TASK_ID_RE);
        expect(id.length).toBeLessThanOrEqual(FEEDBACK_TASK_ID_MAX);
      }
    }
  });
});

describe("More tools please modal (Change #8)", () => {
  const flush = () => act(async () => Promise.resolve());

  function openModal(submit?: (taskId: string, body: string) => Promise<unknown>) {
    const view = render(<Harness seed={seedAtLastTaskOf11()} submitFeedback={submit} />);
    fireEvent.click(screen.getByText("More tools please"));
    return view;
  }

  it("opens from the runner as its OWN clean modal: title, unit task id + title, the question; the runner is hidden", () => {
    openModal();
    expect(screen.getByText(MORE_TOOLS_COPY.title)).toBeTruthy();
    // The unit task id (x.x.x) and the band-resolved task title.
    expect(screen.getByText(`Unit task ${taskIdFor("1.1", 4)}`)).toBeTruthy();
    expect(screen.getByLabelText(MORE_TOOLS_COPY.question)).toBeTruthy();
    // 1.1.5's band-resolved title (the same accessor the runner shows) renders
    // in the modal header.
    expect(document.body.textContent).toContain(taskTitleForBand("1.1.5", "g6_8")!);
    // The runner is not rendered underneath (completely separate overlay).
    expect(screen.queryByText("✓ I did it")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Task sections" })).toBeNull();
    // Kid copy stays em-dash free.
    expect(Object.values(MORE_TOOLS_COPY).join(" ")).not.toMatch(/—/);
  });

  it("Send submits ONCE through submitFeedback with the task id and text, then shows the thanks state", async () => {
    const submit = vi.fn(async () => "sent" as const);
    openModal(submit);
    fireEvent.change(screen.getByLabelText(MORE_TOOLS_COPY.question), {
      target: { value: "A picture example would help" },
    });
    const send = screen.getByText(MORE_TOOLS_COPY.send);
    // Two clicks in one synchronous burst: the in-flight guard permits one row.
    fireEvent.click(send);
    fireEvent.click(send);
    await flush();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("1.1.5", "A picture example would help");
    expect(screen.getByText(MORE_TOOLS_COPY.sent)).toBeTruthy();
  });

  it("a parked (offline) outcome refines the thanks copy honestly", async () => {
    openModal(vi.fn(async () => "queued" as const));
    fireEvent.click(screen.getByText(MORE_TOOLS_COPY.send));
    await flush();
    expect(screen.getByText(MORE_TOOLS_COPY.queued)).toBeTruthy();
  });

  it("the X returns to the runner at the SAME task WITHOUT sending", () => {
    const submit = vi.fn(async () => "sent" as const);
    openModal(submit);
    fireEvent.click(screen.getByLabelText(MORE_TOOLS_COPY.close));
    expect(submit).not.toHaveBeenCalled();
    // The runner is back exactly as it was: same task index, CTA present.
    expect(headerBlocks()).toEqual(["1", "1", "5"]);
    expect(screen.getByText("✓ I did it")).toBeTruthy();
    expect(screen.queryByText(MORE_TOOLS_COPY.title)).toBeNull();
  });

  it("Escape mirrors the X: back to the runner, nothing sent, runner stays open", () => {
    const submit = vi.fn(async () => "sent" as const);
    openModal(submit);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByText(MORE_TOOLS_COPY.title)).toBeNull();
    // The Escape closed only the modal, never the runner underneath.
    expect(headerBlocks()).toEqual(["1", "1", "5"]);
  });
});

describe("Celebration after 1.2", () => {
  it("lists 1.3 · The Learning Room when 1.2 is passed", () => {
    const s = initialState();
    // 1.1 fully done, 1.2 done except its last task; runner on 1.2's last task.
    const done: Record<string, boolean> = {};
    for (let i = 0; i < 5; i++) done[taskKey("1.1", i)] = true;
    for (let i = 0; i < 4; i++) done[taskKey("1.2", i)] = true;
    const seed: GameState = {
      ...s,
      stage: "app",
      ideas: [{ fields: {}, done }],
      activeIdea: 0,
      runnerOpen: true,
      runnerStep: "1.2",
      runnerIndex: 4,
    };
    render(<Harness seed={seed} />);
    fireEvent.click(screen.getByText("✓ I did it"));
    expect(screen.getByText("Criterion passed")).toBeTruthy();
    expect(screen.getByText("Make a real sale")).toBeTruthy();
    expect(screen.getByText("+120 XP")).toBeTruthy();
    expect(screen.getByText("1.3 · The Learning Room")).toBeTruthy();
  });
});

describe("Celebration across phase boundaries (Unit 8)", () => {
  /** Legacy-key done map covering every task of the given criteria (the
   *  engine's isTaskDone falls back to the legacy map for phases 1-3). */
  function doneFor(...stepIds: string[]): Record<string, boolean> {
    const done: Record<string, boolean> = {};
    for (const stepId of stepIds) {
      const step = STEPS.find((s) => s.id === stepId)!;
      for (let i = 0; i < step.tasks.length; i++) done[taskKey(stepId, i)] = true;
    }
    return done;
  }

  /** Celebrating `celebrate` with all criteria up TO AND INCLUDING it done —
   *  honest progress, matching what the reducer produces in real play (the
   *  FIX 3 gating hides the next-room block for dishonest synthetic states). */
  function seedCelebrating(celebrate: string): GameState {
    const upTo = STEPS.slice(0, STEPS.findIndex((s) => s.id === celebrate) + 1).map((s) => s.id);
    return {
      ...initialState(),
      stage: "app",
      ideas: [{ fields: {}, done: doneFor(...upTo) }],
      activeIdea: 0,
      celebrate,
    };
  }

  it("at 1.5 (phase boundary) it names the phase moment and 2.1 · The Build Room (BUG-009)", () => {
    render(<Harness seed={seedCelebrating("1.5")} />);
    // The boundary criterion celebrates the PHASE, not just the criterion.
    expect(screen.getByText("Phase 1 · Sell complete")).toBeTruthy();
    expect(screen.queryByText("Criterion passed")).toBeNull();
    expect(screen.getByText("25 supervised outreach attempts")).toBeTruthy();
    expect(screen.getByText("+100 XP")).toBeTruthy();
    // Unit 8: the block generalizes across the boundary via Step.roomName —
    // labeled as the NEXT phase beginning.
    expect(screen.getByText("Phase 2 · Build begins")).toBeTruthy();
    expect(screen.queryByText("New on The Path")).toBeNull();
    expect(screen.getByText("2.1 · The Build Room")).toBeTruthy();
  });

  it("at 2.5 (Build -> Validate boundary) it names 3.1 · The Loop Bench", () => {
    render(<Harness seed={seedCelebrating("2.5")} />);
    expect(screen.getByText("Phase 2 · Build complete")).toBeTruthy();
    expect(screen.getByText("Phase 3 · Validate begins")).toBeTruthy();
    expect(screen.getByText("3.1 · The Loop Bench")).toBeTruthy();
  });

  it("at 3.5 with NO business it points at PROMOTION, not a room", () => {
    render(<Harness seed={seedCelebrating("3.5")} />);
    expect(screen.getByText("Criterion passed")).toBeTruthy();
    expect(screen.queryByText("New on The Path")).toBeNull();
    expect(screen.getByText(/Make it your business/)).toBeTruthy();
    expect(screen.getByText(/Promote it to open Phase 4/)).toBeTruthy();
  });

  it("at 3.5 WITH an active business it names 4.1 · The Checkout Booth", () => {
    const seed = seedCelebrating("3.5");
    seed.ideas = [{ ...seed.ideas[0], id: "idea-a" }];
    seed.businesses = [{ id: "biz-1", ideaId: "idea-a", archived: false }];
    render(<Harness seed={seed} />);
    expect(screen.queryByText(/Promote it to open/)).toBeNull();
    expect(screen.getByText("4.1 · The Checkout Booth")).toBeTruthy();
  });

  it("at 5.5 the TERMINAL state uses the Celebration chrome with terminal copy, no next-step CTA", () => {
    render(<Harness seed={seedCelebrating("5.5")} />);
    expect(screen.getByText("Path complete")).toBeTruthy();
    expect(screen.getByText("You built the whole path")).toBeTruthy();
    expect(screen.getByText("+200 XP")).toBeTruthy();
    expect(screen.queryByText("New on The Path")).toBeNull();
    expect(screen.queryByText("Keep going →")).toBeNull();
    // No em dashes in the terminal copy (house rule).
    expect(document.body.textContent).not.toMatch(/—/);
    // Dismiss works from the terminal state too.
    fireEvent.click(screen.getByText("Back to the floor"));
    expect(screen.queryByText("Path complete")).toBeNull();
  });
});

describe("one-liner public-string treatment (real-public-site Unit 6)", () => {
  /** Runner open at 1.1 task 1 (the productName + oneLiner authoring task). */
  function seedAtFirstTaskOf11(): GameState {
    return {
      ...initialState(),
      stage: "app",
      ideas: [{ fields: {}, done: {} }],
      activeIdea: 0,
      runnerOpen: true,
      runnerStep: "1.1",
      runnerIndex: 0,
    };
  }

  it("flag ON: the one-liner caps at 140 and commit (blur) forces an immediate flush", () => {
    publicSiteFlag = true;
    const flushNow = vi.fn().mockResolvedValue("landed");
    render(<Harness seed={seedAtFirstTaskOf11()} flushNow={flushNow} />);
    openSection("Inputs");
    const liner = screen.getByLabelText("Your one-liner") as HTMLInputElement;
    expect(liner.getAttribute("maxlength")).toBe("140");
    fireEvent.change(liner, { target: { value: "Friendship bracelets for recess trades" } });
    fireEvent.blur(liner);
    expect(flushNow).toHaveBeenCalledTimes(1);
    // The public-page nudge copy sits by the field (R23 accepted-limit note).
    expect(document.body.textContent).toContain(
      "This goes on your public page. No phone numbers, addresses, or last names.",
    );
  });

  it("flag ON: non-public fields keep the generic cap and never flush on blur", () => {
    publicSiteFlag = true;
    const flushNow = vi.fn().mockResolvedValue("landed");
    render(<Harness seed={seedAtFirstTaskOf11()} flushNow={flushNow} />);
    openSection("Inputs");
    const name = screen.getByLabelText("Product name") as HTMLInputElement;
    expect(name.getAttribute("maxlength")).toBe("2000");
    fireEvent.change(name, { target: { value: "Bracelets" } });
    fireEvent.blur(name);
    expect(flushNow).not.toHaveBeenCalled();
  });

  it("flag OFF: the one-liner behaves exactly as before (2000 cap, no flush, no nudge)", () => {
    publicSiteFlag = false;
    const flushNow = vi.fn().mockResolvedValue("landed");
    render(<Harness seed={seedAtFirstTaskOf11()} flushNow={flushNow} />);
    openSection("Inputs");
    const liner = screen.getByLabelText("Your one-liner") as HTMLInputElement;
    expect(liner.getAttribute("maxlength")).toBe("2000");
    fireEvent.blur(liner);
    expect(flushNow).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("This goes on your public page.");
  });
});
