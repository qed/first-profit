// @vitest-environment jsdom
/**
 * Change #9 — the blue "Improve First Profit" CTA + app-kind suggestion modal.
 *
 * Factory-level tests mount the REAL screen (matchMedia stubbed mobile, fake
 * timers driving the 550ms walk arrival, the IdeaSummaryDialog precedent) and
 * pin: the CTA docks in the SAME bottom-right dock as the green Next Step
 * coach (stacked above it) on BOTH floor views (phases overview and a
 * criterion floor), hides with the coach while any overlay is open, and opens
 * the modal. Modal tests pin the EXACT question copy, the send path
 * (submitFeedback ONCE with kind 'app' and a CHECK-valid x.x.x task id), and
 * that X / Escape close WITHOUT sending. appFeedbackTaskId's fallback chain is
 * pinned directly.
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
import { Factory } from "../../screens/Factory";
import { ImproveAppModal, IMPROVE_APP_COPY, appFeedbackTaskId } from "../ImproveAppModal";
import { FEEDBACK_TASK_ID_RE } from "../../lib/sync";
import { type GameState } from "../../state/gameCore";
import {
  FloorHarness,
  validatedIdea,
  withIdeas,
  withNamedIdeas,
} from "../../testSupport/floorHarness";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

const QUESTION =
  "What could we improve about First Profit? Any part, the game, the content, the tools. Anything is fair game.";

afterEach(cleanup);

// ── appFeedbackTaskId (the x.x.x stamp for app-kind rows) ────────────────────
describe("appFeedbackTaskId", () => {
  it("stamps the active idea's next unit task (fresh idea -> 1.1.1 via the naming redirect)", () => {
    expect(appFeedbackTaskId(withIdeas(1))).toBe("1.1.1");
  });

  it("advances with progress (named idea mid-path)", () => {
    const s = withNamedIdeas(1);
    const id = appFeedbackTaskId(s);
    expect(id).toMatch(FEEDBACK_TASK_ID_RE);
    expect(id).toBe("1.1.1"); // nothing done yet
  });

  it("falls back to the runner's open task when the path is gated (nextTaskId null)", () => {
    // Validate-complete, no business: the frontier phase is gated -> null.
    const gated = validatedIdea(withNamedIdeas(1), 0);
    const withRunner: GameState = {
      ...gated,
      runnerOpen: true,
      runnerStep: "2.3",
      runnerIndex: 1,
    };
    expect(appFeedbackTaskId(withRunner)).toBe("2.3.2");
  });

  it("falls back to the constant '1.1.1' when gated and no runner is open — always CHECK-valid", () => {
    const gated = validatedIdea(withNamedIdeas(1), 0);
    expect(gated.runnerOpen).toBe(false);
    expect(appFeedbackTaskId(gated)).toBe("1.1.1");
    expect(appFeedbackTaskId(gated)).toMatch(FEEDBACK_TASK_ID_RE);
  });
});

// ── The modal itself ─────────────────────────────────────────────────────────
describe("ImproveAppModal", () => {
  function mountModal(seed = withIdeas(1)) {
    const closes: number[] = [];
    const submit = vi.fn().mockResolvedValue("sent");
    const utils = render(
      <FloorHarness seed={seed} Ctx={Ctx} submitFeedback={submit}>
        <ImproveAppModal onClose={() => closes.push(1)} />
      </FloorHarness>,
    );
    return { closes, submit, ...utils };
  }

  it("renders the title and the EXACT question copy with a single textarea and a >=44px Send", () => {
    mountModal();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(IMPROVE_APP_COPY.title)).toBeTruthy();
    // The question label, byte-exact (spec copy).
    expect(IMPROVE_APP_COPY.question).toBe(QUESTION);
    const label = screen.getByText(QUESTION);
    expect(label.tagName).toBe("LABEL");
    expect(screen.getByLabelText(QUESTION).tagName).toBe("TEXTAREA");
    const send = screen.getByText(IMPROVE_APP_COPY.send).closest("button")!;
    expect(send.className).toContain("min-h-[44px]");
    expect(send.className).toContain("bg-build");
  });

  it("Send submits ONCE through submitFeedback with kind 'app' and a real-looking x.x.x task id, then thanks", async () => {
    const { submit } = mountModal(withIdeas(1));
    fireEvent.change(screen.getByLabelText(QUESTION), {
      target: { value: "add more rooms" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText(IMPROVE_APP_COPY.send));
      fireEvent.click(screen.getByText(IMPROVE_APP_COPY.send)); // double-tap burst
    });
    expect(submit).toHaveBeenCalledTimes(1);
    const [taskId, body, band, kind] = submit.mock.calls[0];
    expect(taskId).toMatch(FEEDBACK_TASK_ID_RE);
    expect(taskId).toBe("1.1.1"); // fresh idea -> naming redirect
    expect(body).toBe("add more rooms");
    expect(band).toBeUndefined(); // band resolves at the GameContext boundary
    expect(kind).toBe("app");
    expect(screen.getByText(IMPROVE_APP_COPY.sent)).toBeTruthy();
  });

  it("the X closes WITHOUT sending", () => {
    const { closes, submit } = mountModal();
    fireEvent.change(screen.getByLabelText(QUESTION), { target: { value: "draft words" } });
    fireEvent.click(screen.getByLabelText(IMPROVE_APP_COPY.close));
    expect(closes).toHaveLength(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it("Escape closes WITHOUT sending", () => {
    const { closes, submit } = mountModal();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closes).toHaveLength(1);
    expect(submit).not.toHaveBeenCalled();
  });
});

// ── Factory-level: the docked CTA on both floor views ────────────────────────
describe("Factory — the blue Improve CTA docks above the coach on every floor view", () => {
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

  function mountFactory(seed: GameState, submit = vi.fn().mockResolvedValue("sent")) {
    render(
      <FloorHarness seed={seed} Ctx={Ctx} submitFeedback={submit}>
        <Factory />
      </FloorHarness>,
    );
    return { submit };
  }

  const arrive = () => act(() => void vi.advanceTimersByTime(600));

  const ctaButton = () => screen.getByTestId("fp-improve-cta") as HTMLButtonElement;

  function openSellFloor() {
    const sellCard = screen
      .getAllByText("Sell")
      .map((el) => el.closest("button"))
      .find((b): b is HTMLButtonElement => Boolean(b))!;
    fireEvent.click(sellCard);
    arrive();
    expect(screen.getByText("← The Path")).toBeTruthy();
  }

  it("PHASES OVERVIEW: blue CTA in the SAME dock as the green coach, lower-left with the coach's 52px chrome, blue bg + white text", () => {
    mountFactory(withIdeas(1));
    const cta = ctaButton();
    expect(cta.className).toContain("bg-build");
    expect(cta.className).toContain("text-white");
    // Same size as the green coach: 52px chrome, rounded-2xl, hard 6px shadow.
    expect(cta.className).toContain("min-h-[52px]");
    expect(cta.className).toContain("rounded-2xl");
    expect(cta.className).toContain("shadow-[0_6px_0_hsl(217_74%_36%)]");
    const coach = screen.getByText("Next Step").closest("button")!;
    // Same dock container: blue at the lower-left, coach pushed to the
    // lower-right by its own ml-auto; flex-wrap keeps them from overlapping
    // on narrow viewports.
    const dock = cta.parentElement!;
    expect(dock).toBe(coach.parentElement);
    expect(dock.className).toContain("bottom-7");
    expect(dock.className).toContain("flex-wrap");
    expect(dock.className).toContain("items-end");
    expect(dock.className).toContain("gap-2");
    expect(coach.className).toContain("ml-auto");
    // Blue comes FIRST in the row (left of the green coach).
    const children = Array.from(dock.children);
    expect(children.indexOf(cta)).toBeLessThan(children.indexOf(coach));
  });

  it("PHASES OVERVIEW: clicking the CTA opens the modal with the exact question; the CTA and coach hide while it is open", () => {
    mountFactory(withIdeas(1));
    fireEvent.click(ctaButton());
    expect(screen.getByText(QUESTION)).toBeTruthy();
    // The modal is a real overlay: both docked buttons hide (overlayOpen rule).
    expect(screen.queryByTestId("fp-improve-cta")).toBeNull();
    expect(screen.queryByText("Next Step")).toBeNull();
    // X returns to the floor; the CTA comes back.
    fireEvent.click(screen.getByLabelText(IMPROVE_APP_COPY.close));
    expect(screen.queryByText(QUESTION)).toBeNull();
    expect(screen.getByTestId("fp-improve-cta")).toBeTruthy();
  });

  it("CRITERION FLOOR: the CTA is still docked and opens the modal; Send fires kind 'app' with the active idea's task id", async () => {
    const { submit } = mountFactory(withIdeas(1));
    openSellFloor();
    expect(screen.getByTestId("fp-improve-cta")).toBeTruthy();
    fireEvent.click(ctaButton());
    fireEvent.change(screen.getByLabelText(QUESTION), { target: { value: "more games" } });
    await act(async () => {
      fireEvent.click(screen.getByText(IMPROVE_APP_COPY.send));
    });
    expect(submit).toHaveBeenCalledTimes(1);
    const [taskId, body, , kind] = submit.mock.calls[0];
    expect(taskId).toBe("1.1.1");
    expect(body).toBe("more games");
    expect(kind).toBe("app");
  });
});
