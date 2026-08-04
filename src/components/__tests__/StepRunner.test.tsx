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

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

/** jsdom normalizes inline hsl() to rgba(); compare through the same pipe. */
function cssBackground(value: string): string {
  const el = document.createElement("div");
  el.style.background = value;
  return el.style.background;
}
function cssColor(value: string): string {
  const el = document.createElement("div");
  el.style.color = value;
  return el.style.color;
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

afterEach(() => {
  cleanup();
  publicSiteFlag = false;
});

describe("StepRunner", () => {
  it("shows the criterion header, task rail count, and done-when for 1.1", () => {
    render(<Harness seed={seedAtLastTaskOf11()} />);
    expect(screen.getByText("Phase 1 · Sell · Criterion 1 of 5 · Idea #1")).toBeTruthy();
    expect(screen.getByText("Task 5 of 5")).toBeTruthy();
    expect(screen.getByText("Done when")).toBeTruthy();
    // Real path.ts copy, em-dash free.
    expect(document.body.textContent).not.toMatch(/—/);
  });

  it("renders the productName + oneLiner inputs on task 1 and mirrors keystrokes into the reducer", () => {
    const s = seedAtLastTaskOf11();
    render(<Harness seed={{ ...s, runnerIndex: 0, ideas: [{ fields: {}, done: {} }] }} />);
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

  it("renders the compact bottom-right action row: More tools please beside the green CTA, both >= 44px", () => {
    render(<Harness seed={seedAtLastTaskOf11()} />);
    const more = screen.getByText("More tools please") as HTMLElement;
    const cta = screen.getByText("✓ I did it") as HTMLElement;
    // Same right-aligned row.
    const row = more.parentElement as HTMLElement;
    expect(row).toBe(cta.parentElement);
    expect(row.className).toContain("justify-end");
    // Compact but still kid-tappable (390px rule), quiet vs filled styles.
    expect(more.className).toContain("min-h-[44px]");
    expect(more.className).toContain("border-2");
    expect(cta.className).toContain("min-h-[44px]");
    expect(cta.className).toContain("bg-verified");
    // The CTA no longer stretches to hero width.
    expect(cta.className).not.toContain("flex-1");
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
    expect(screen.getByText("Phase 2 · Build · Criterion 1 of 5 · Idea #1")).toBeTruthy();
    expect(screen.getByText("Ship the smallest thing that works")).toBeTruthy();
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
    expect(screen.getByText("Phase 2 · Build · Criterion 3 of 5 · Idea #1")).toBeTruthy();
    expect(screen.getByText("Task 1 of 6")).toBeTruthy();
    // One rail segment bar per REAL task: 2.3 carries six.
    expect(container.querySelectorAll(".h-1\\.5").length).toBe(6);
  });

  it("shows the idea one-liner in the header once authored (idea context, Unit 8)", () => {
    const s = seedAtLastTaskOf11();
    render(
      <Harness
        seed={{ ...s, ideas: [{ fields: { oneLiner: "Bracelets" }, done: s.ideas[0].done }] }}
      />,
    );
    expect(screen.getByText("Phase 1 · Sell · Criterion 1 of 5 · Idea #1 · Bracelets")).toBeTruthy();
  });

  it("shows the BUSINESS name in the header on a Grow criterion (4.1)", () => {
    const s = initialState();
    const seed: GameState = {
      ...s,
      stage: "app",
      ideas: [{ id: "idea-a", fields: { oneLiner: "Slime kits" }, done: {} }],
      activeIdea: 0,
      businesses: [{ id: "biz-1", ideaId: "idea-a", archived: false }],
      runnerOpen: true,
      runnerStep: "4.1",
      runnerIndex: 0,
    };
    render(<Harness seed={seed} />);
    expect(
      screen.getByText("Phase 4 · Grow · Criterion 1 of 5 · Your business · Slime kits"),
    ).toBeTruthy();
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
    const header = container.querySelector("header") as HTMLElement;
    expect(header.style.background).toBe(cssBackground(build.wash));
    const label = screen.getByText(/Phase 2 · Build · Criterion 1 of 5/) as HTMLElement;
    expect(label.style.color).toBe(cssColor(build.text));
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
    // The exact pre-Unit-8 header wash: hsl(14 78% 54% / 0.09).
    expect(header.style.background).toBe(cssBackground("hsl(14 78% 54% / 0.09)"));
    expect(header.style.background).toBe(cssBackground(phaseById("sell").wash));
    // Sell's CTA keeps the bg-verified class with NO inline phase override.
    const cta = screen.getByText("✓ I did it") as HTMLElement;
    expect(cta.className).toContain("bg-verified");
    expect(cta.style.background).toBe("");
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
    // Shared body + the g3_5 variant line; never the g9_12 line.
    expect(document.body.textContent).toContain(task.body);
    expect(document.body.textContent).toContain(g35);
    expect(document.body.textContent).not.toContain("wrong customer");
    // The per-TASK done-when (generated), not the criterion-level STEP_META line.
    expect(document.body.textContent).toContain(task.doneWhen);
    younger.unmount();

    render(<Harness seed={seed} band="g9_12" />);
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
    // The banded title renders twice by design: the rail segment AND the h3.
    expect(screen.getAllByText("Rehearse to camera until note-free").length).toBe(2);
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
    expect(screen.getByText("Task 2 of 5")).toBeTruthy();
  });

  it("review mode on the DONE last task: the compact CTA is the disabled ✓ Done", () => {
    const s = seedAtLastTaskOf11();
    const done = { ...s.ideas[0].done, [taskKey("1.1", 4)]: true };
    render(<Harness seed={{ ...s, ideas: [{ fields: {}, done }] }} />);
    const doneBtn = screen.getByText("✓ Done") as HTMLButtonElement;
    expect(doneBtn.disabled).toBe(true);
    expect(doneBtn.className).toContain("min-h-[44px]");
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
    expect(screen.queryByText("Task 5 of 5")).toBeNull();
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
    expect(screen.getByText("Task 5 of 5")).toBeTruthy();
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
    expect(screen.getByText("Task 5 of 5")).toBeTruthy();
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

  it("at 1.5 (phase boundary) the next-step block names 2.1 · The Build Room", () => {
    render(<Harness seed={seedCelebrating("1.5")} />);
    expect(screen.getByText("Criterion passed")).toBeTruthy();
    expect(screen.getByText("25 supervised outreach attempts")).toBeTruthy();
    expect(screen.getByText("+100 XP")).toBeTruthy();
    // Unit 8: the block generalizes across the boundary via Step.roomName.
    expect(screen.getByText("New on The Path")).toBeTruthy();
    expect(screen.getByText("2.1 · The Build Room")).toBeTruthy();
  });

  it("at 2.5 (Build -> Validate boundary) it names 3.1 · The Loop Bench", () => {
    render(<Harness seed={seedCelebrating("2.5")} />);
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
    const liner = screen.getByLabelText("Your one-liner") as HTMLInputElement;
    expect(liner.getAttribute("maxlength")).toBe("2000");
    fireEvent.blur(liner);
    expect(flushNow).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("This goes on your public page.");
  });
});
