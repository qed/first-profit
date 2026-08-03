// @vitest-environment jsdom
/**
 * GradeAsk (ask-once birth-year card) render + behavior checks. The
 * GameContext is stubbed with the same real-React-context trick as the
 * StuckBox suite; the provider-side semantics (adoption, generation guard,
 * one-shot retry) are pinned in GameContextGrade.test.tsx — here we pin the
 * card's own contract: when it shows, the select's range, the answer/skip
 * flows, and that a write-back failure looks EXACTLY like success to the kid.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { birthYearBounds } from "../../lib/band";

// A real React context stands in for GameContext; useGame reads it.
vi.mock("../../state/GameContext", async () => {
  const R = await import("react");
  const Ctx = R.createContext<unknown>(null);
  return { __ctx: Ctx, useGame: () => R.useContext(Ctx) };
});

import * as GameContext from "../../state/GameContext";
import { GradeAsk, GRADE_ASK_COPY, THANKS_MS, birthYearOptions } from "../GradeAsk";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

/** The minimal slice of GameApi the card reads, with overridable leaves. */
function ctxValue(overrides: Record<string, unknown> = {}) {
  return {
    stage: "app",
    grade: null,
    gradeAskDone: false,
    skipGradeAsk: vi.fn(),
    submitGradeAnswer: vi.fn().mockResolvedValue({ ok: true }),
    runnerOpen: false,
    room: null,
    celebrate: null,
    pickFor: null,
    ...overrides,
  };
}

function renderCard(overrides: Record<string, unknown> = {}) {
  const value = ctxValue(overrides);
  const utils = render(
    <Ctx.Provider value={value}>
      <GradeAsk />
    </Ctx.Provider>,
  );
  return { ...utils, value };
}

const flush = () => act(async () => Promise.resolve());

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("birthYearOptions", () => {
  it("lists the bounds range newest first (school year 2026-27: 2018 down to 2009)", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const years = birthYearOptions(now);
    expect(years[0]).toBe(birthYearBounds(now).newest);
    expect(years[years.length - 1]).toBe(birthYearBounds(now).oldest);
    expect(years).toEqual([2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009]);
  });
});

describe("GradeAsk visibility", () => {
  it("shows when stage is app, grade is null, and the ask is not done", () => {
    renderCard();
    expect(screen.getByText(GRADE_ASK_COPY.title)).toBeTruthy();
    // Kid copy carries no em dashes (CLAUDE.md rule).
    expect(Object.values(GRADE_ASK_COPY).join(" ")).not.toMatch(/—/);
  });

  it("hidden when the grade is already known", () => {
    renderCard({ grade: 6 });
    expect(screen.queryByText(GRADE_ASK_COPY.title)).toBeNull();
  });

  it("hidden once answered or skipped this session (gradeAskDone)", () => {
    renderCard({ gradeAskDone: true });
    expect(screen.queryByText(GRADE_ASK_COPY.title)).toBeNull();
  });

  it("hidden outside the app stage and while an overlay is open", () => {
    renderCard({ stage: "onboard" });
    expect(screen.queryByText(GRADE_ASK_COPY.title)).toBeNull();
    cleanup();
    renderCard({ runnerOpen: true });
    expect(screen.queryByText(GRADE_ASK_COPY.title)).toBeNull();
    cleanup();
    renderCard({ room: "idea" });
    expect(screen.queryByText(GRADE_ASK_COPY.title)).toBeNull();
  });

  it("hidden on Factory's lifted anyOverlayOpen (promote/switcher, unit review FIX 5)", () => {
    const value = ctxValue();
    render(
      <Ctx.Provider value={value}>
        <GradeAsk overlayOpen />
      </Ctx.Provider>,
    );
    expect(screen.queryByText(GRADE_ASK_COPY.title)).toBeNull();
  });
});

describe("GradeAsk answer flow", () => {
  it("Save is disabled until a year is picked; picking one enables it", () => {
    renderCard();
    const save = screen.getByText(GRADE_ASK_COPY.save) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(GRADE_ASK_COPY.yearLabel), { target: { value: "2015" } });
    expect(save.disabled).toBe(false);
  });

  it("Save posts the chosen year, shows the thanks note, then collapses", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { value } = renderCard();
    fireEvent.change(screen.getByLabelText(GRADE_ASK_COPY.yearLabel), { target: { value: "2015" } });
    fireEvent.click(screen.getByText(GRADE_ASK_COPY.save));
    await flush();

    expect(value.submitGradeAnswer).toHaveBeenCalledTimes(1);
    expect(value.submitGradeAnswer).toHaveBeenCalledWith(2015);
    expect(screen.getByText(GRADE_ASK_COPY.thanks)).toBeTruthy();
    expect(screen.queryByText(GRADE_ASK_COPY.title)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(THANKS_MS + 1);
    });
    expect(screen.queryByText(GRADE_ASK_COPY.thanks)).toBeNull();
  });

  it("a WRITE-BACK FAILURE looks exactly like success to the kid (thanks, no error)", async () => {
    const { value } = renderCard({
      submitGradeAnswer: vi.fn().mockResolvedValue({ ok: false }),
    });
    fireEvent.change(screen.getByLabelText(GRADE_ASK_COPY.yearLabel), { target: { value: "2012" } });
    fireEvent.click(screen.getByText(GRADE_ASK_COPY.save));
    await flush();

    expect(value.submitGradeAnswer).toHaveBeenCalledWith(2012);
    // The provider adopted the client-derived band and armed its one-shot
    // retry; the card never blocks or errors at the kid.
    expect(screen.getByText(GRADE_ASK_COPY.thanks)).toBeTruthy();
  });

  it("a double-tap on Save posts exactly ONE answer (the route is rate limited)", async () => {
    let resolveAnswer: ((v: { ok: boolean }) => void) | null = null;
    const submitGradeAnswer = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((res) => {
          resolveAnswer = res;
        }),
    );
    renderCard({ submitGradeAnswer });
    fireEvent.change(screen.getByLabelText(GRADE_ASK_COPY.yearLabel), { target: { value: "2014" } });
    const save = screen.getByText(GRADE_ASK_COPY.save);
    fireEvent.click(save);
    fireEvent.click(save);
    await flush();
    expect(submitGradeAnswer).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveAnswer?.({ ok: true });
      await Promise.resolve();
    });
  });
});

describe("GradeAsk save/skip race (unit review FIX 1)", () => {
  it("Skip is disabled while a save is in flight (the two are mutually exclusive)", async () => {
    let resolveAnswer: ((v: { ok: boolean }) => void) | null = null;
    const submitGradeAnswer = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((res) => {
          resolveAnswer = res;
        }),
    );
    renderCard({ submitGradeAnswer });
    fireEvent.change(screen.getByLabelText(GRADE_ASK_COPY.yearLabel), { target: { value: "2015" } });
    const skip = screen.getByText(GRADE_ASK_COPY.skip) as HTMLButtonElement;
    expect(skip.disabled).toBe(false);
    fireEvent.click(screen.getByText(GRADE_ASK_COPY.save));
    expect(skip.disabled).toBe(true);
    await act(async () => {
      resolveAnswer?.({ ok: true });
      await Promise.resolve();
    });
  });

  it("a skip that lands during an in-flight save STAYS dismissed when the save resolves (no thanks flash)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let resolveAnswer: ((v: { ok: boolean }) => void) | null = null;
    const submitGradeAnswer = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((res) => {
          resolveAnswer = res;
        }),
    );
    const { value } = renderCard({ submitGradeAnswer });
    fireEvent.change(screen.getByLabelText(GRADE_ASK_COPY.yearLabel), { target: { value: "2015" } });

    // Defense-in-depth: the disable protects the common case, but a real
    // browser can deliver a tap that was queued BEFORE the disable painted.
    // Model that by landing both clicks in one batch — the skip handler runs
    // before the `saving` render commits, exactly the ghost-tap interleaving —
    // so the phase-machine guard must hold on its own.
    await act(async () => {
      fireEvent.click(screen.getByText(GRADE_ASK_COPY.save));
      fireEvent.click(screen.getByText(GRADE_ASK_COPY.skip));
    });
    expect(value.skipGradeAsk).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(GRADE_ASK_COPY.title)).toBeNull();

    // The in-flight save resolves LATE: the card must stay dismissed — no
    // thanks flash, no resurrection timer. The answer itself still posted
    // (the provider adopts the grade regardless; pinned in GameContextGrade).
    await act(async () => {
      resolveAnswer?.({ ok: true });
      await Promise.resolve();
    });
    expect(submitGradeAnswer).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(GRADE_ASK_COPY.thanks)).toBeNull();
    expect(screen.queryByText(GRADE_ASK_COPY.title)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("GradeAsk unmount mid-save (unit review FIX 2)", () => {
  it("a save resolving after unmount sets no state and leaves NO timer armed", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let resolveAnswer: ((v: { ok: boolean }) => void) | null = null;
    const submitGradeAnswer = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((res) => {
          resolveAnswer = res;
        }),
    );
    const { unmount } = renderCard({ submitGradeAnswer });
    fireEvent.change(screen.getByLabelText(GRADE_ASK_COPY.yearLabel), { target: { value: "2014" } });
    fireEvent.click(screen.getByText(GRADE_ASK_COPY.save));

    // Logout unmounts the card while the save is still in flight.
    unmount();

    // The stale continuation must be inert: no THANKS_MS timer may be armed
    // (an armed one would never be cleared — the cleanup already ran).
    await act(async () => {
      resolveAnswer?.({ ok: true });
      await Promise.resolve();
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("GradeAsk skip flow", () => {
  it("Skip calls skipGradeAsk, never posts, and removes the card", async () => {
    const { value } = renderCard();
    fireEvent.click(screen.getByText(GRADE_ASK_COPY.skip));
    await flush();

    expect(value.skipGradeAsk).toHaveBeenCalledTimes(1);
    expect(value.submitGradeAnswer).not.toHaveBeenCalled();
    expect(screen.queryByText(GRADE_ASK_COPY.title)).toBeNull();
    expect(screen.queryByText(GRADE_ASK_COPY.thanks)).toBeNull();
  });
});
