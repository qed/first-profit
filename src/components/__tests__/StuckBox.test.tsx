// @vitest-environment jsdom
/**
 * StuckBox ("Stuck? Tell us") render + behavior checks. The GameContext is
 * stubbed with a submitFeedback whose durable half is REAL: it enqueues into
 * the real sync outbox (fake storage) exactly like GameContext.submitFeedback
 * does, so these tests pin the row that actually lands in the queue (task id,
 * band "unknown", body) and the honest confirmation copy per outcome.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import {
  enqueueFeedback,
  readOutbox,
  FEEDBACK_BODY_MAX,
  FEEDBACK_TASK_ID_RE,
  FEEDBACK_TASK_ID_MAX,
  type FeedbackInsertRow,
} from "../../lib/sync";
import { PATH_CONTENT, STEPS } from "../../data/path";

// A real React context stands in for GameContext; useGame reads it.
vi.mock("../../state/GameContext", async () => {
  const R = await import("react");
  const Ctx = R.createContext<unknown>(null);
  return { __ctx: Ctx, useGame: () => R.useContext(Ctx) };
});

import * as GameContext from "../../state/GameContext";
import { StuckBox, taskIdFor, STUCK_COPY, COUNTER_FROM } from "../StuckBox";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

// ── Fake Storage (Map-backed) ────────────────────────────────────────────────
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

const USER = "user-1";

/**
 * A submitFeedback stub mirroring GameContext's: mints a UUID, stamps band
 * "unknown", enqueues durably into the REAL outbox, then resolves `outcome`.
 */
function makeSubmit(storage: Storage, outcome: "sent" | "queued" | "dropped" | "capped" = "sent") {
  let seq = 0;
  return vi.fn(async (taskId: string, body: string) => {
    if (outcome === "capped") return "capped" as const;
    seq += 1;
    const row: FeedbackInsertRow = {
      id: `uuid-${seq}`,
      taskId,
      band: "unknown",
      body: body.slice(0, FEEDBACK_BODY_MAX),
    };
    enqueueFeedback(USER, row, storage);
    return outcome;
  });
}

/** Any submitFeedback-shaped stub (the happy makeSubmit, a deferred, a reject). */
type SubmitStub = (taskId: string, body: string) => Promise<unknown>;

/** A submit stub whose promise resolution the test controls explicitly. */
function makeDeferredSubmit() {
  const resolvers: Array<(v: "sent" | "queued" | "dropped" | "capped") => void> = [];
  const submit = vi.fn(
    () =>
      new Promise((res) => {
        resolvers.push(res as (typeof resolvers)[number]);
      }),
  );
  return { submit, resolvers };
}

function renderBox(submit: SubmitStub, taskId = "1.1.3") {
  return render(
    <Ctx.Provider value={{ submitFeedback: submit }}>
      <StuckBox taskId={taskId} />
    </Ctx.Provider>,
  );
}

const flush = () => act(async () => Promise.resolve());

afterEach(cleanup);

describe("taskIdFor (synthesized stable task id)", () => {
  it("pins the 1:1 alignment: task index 4 of criterion 1.2 stamps 1.2.5", () => {
    expect(taskIdFor("1.2", 4)).toBe("1.2.5");
    expect(taskIdFor("1.1", 0)).toBe("1.1.1");
  });

  it("ALL-25 SYNTHESIS PIN (unit review FIX 7): every criterion x index matches the GENERATED id", () => {
    // Full play spans all 25 criteria now; the synthesis is only honest while
    // the generated ids stay 1-based positional per criterion. Assert against
    // PATH_CONTENT directly — a future id-scheme change fails here, not in a
    // silent feedback-row mismatch.
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

describe("StuckBox", () => {
  it("renders collapsed: only the text link, no textarea", () => {
    renderBox(makeSubmit(fakeStorage()));
    expect(screen.getByText(STUCK_COPY.link)).toBeTruthy();
    expect(document.querySelector("textarea")).toBeNull();
    // No em dashes anywhere in the copy (CLAUDE.md kid-copy rule).
    expect(Object.values(STUCK_COPY).join(" ")).not.toMatch(/—/);
  });

  it("expands to the textarea with the no-PII hint and send/cancel controls", () => {
    renderBox(makeSubmit(fakeStorage()));
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    expect(document.querySelector("textarea")).toBeTruthy();
    expect(screen.getByText(STUCK_COPY.hint)).toBeTruthy();
    expect(screen.getByText(STUCK_COPY.send)).toBeTruthy();
    expect(screen.getByText(STUCK_COPY.cancel)).toBeTruthy();
  });

  it("typed submit enqueues one outbox entry with the task id, band 'unknown', and the text", async () => {
    const storage = fakeStorage();
    const submit = makeSubmit(storage);
    renderBox(submit, "1.2.5");
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    fireEvent.change(document.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "I do not get this part" },
    });
    fireEvent.click(screen.getByText(STUCK_COPY.send));
    await flush();

    expect(submit).toHaveBeenCalledWith("1.2.5", "I do not get this part");
    const { feedback } = readOutbox(USER, storage);
    expect(feedback).toHaveLength(1);
    expect(feedback[0].row).toMatchObject({
      taskId: "1.2.5",
      band: "unknown",
      body: "I do not get this part",
    });
  });

  it("EMPTY submit still enqueues (a tap is signal)", async () => {
    const storage = fakeStorage();
    renderBox(makeSubmit(storage));
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    fireEvent.click(screen.getByText(STUCK_COPY.send));
    await flush();
    const { feedback } = readOutbox(USER, storage);
    expect(feedback).toHaveLength(1);
    expect(feedback[0].row.body).toBe("");
  });

  it("a double-click on Send yields exactly ONE entry (synchronous in-flight guard)", async () => {
    const storage = fakeStorage();
    const submit = makeSubmit(storage);
    renderBox(submit);
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    const send = screen.getByText(STUCK_COPY.send);
    // Two clicks in the same synchronous burst, before any re-render.
    fireEvent.click(send);
    fireEvent.click(send);
    await flush();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(readOutbox(USER, storage).feedback).toHaveLength(1);
  });

  it("re-opening later allows a second report on the SAME task (new row each time)", async () => {
    const storage = fakeStorage();
    renderBox(makeSubmit(storage));
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    fireEvent.click(screen.getByText(STUCK_COPY.send));
    await flush();
    // Confirmation shown; re-open and send again.
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    fireEvent.click(screen.getByText(STUCK_COPY.send));
    await flush();
    const { feedback } = readOutbox(USER, storage);
    expect(feedback).toHaveLength(2);
    expect(feedback[0].row.id).not.toBe(feedback[1].row.id);
  });

  it("caps over-limit input at 1000 characters and shows the near-limit counter", () => {
    renderBox(makeSubmit(fakeStorage()));
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    const area = document.querySelector("textarea") as HTMLTextAreaElement;
    expect(area.maxLength).toBe(FEEDBACK_BODY_MAX);
    // Programmatic change bypasses maxLength; the onChange slice must cap it.
    fireEvent.change(area, { target: { value: "x".repeat(FEEDBACK_BODY_MAX + 50) } });
    expect(area.value).toHaveLength(FEEDBACK_BODY_MAX);
    expect(screen.getByText("0 left")).toBeTruthy();
    // Below the threshold the counter hides.
    fireEvent.change(area, { target: { value: "x".repeat(COUNTER_FROM - 1) } });
    expect(screen.queryByText(/left$/)).toBeNull();
  });

  it("after a sent submit it auto-collapses behind the kid-voiced confirmation", async () => {
    renderBox(makeSubmit(fakeStorage(), "sent"));
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    fireEvent.click(screen.getByText(STUCK_COPY.send));
    await flush();
    expect(document.querySelector("textarea")).toBeNull(); // collapsed
    expect(screen.getByText(STUCK_COPY.sent)).toBeTruthy();
  });

  it("a parked (retryable) submit shows the honest offline copy, not a false 'sent'", async () => {
    renderBox(makeSubmit(fakeStorage(), "queued"));
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    fireEvent.click(screen.getByText(STUCK_COPY.send));
    await flush();
    expect(screen.getByText(STUCK_COPY.queued)).toBeTruthy();
    expect(screen.queryByText(STUCK_COPY.sent)).toBeNull();
  });

  it("a terminal drop shows the honest failure copy, never a saved claim", async () => {
    renderBox(makeSubmit(fakeStorage(), "dropped"));
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    fireEvent.click(screen.getByText(STUCK_COPY.send));
    await flush();
    expect(screen.getByText(STUCK_COPY.dropped)).toBeTruthy();
    expect(screen.queryByText(STUCK_COPY.sent)).toBeNull();
    expect(screen.queryByText(STUCK_COPY.queued)).toBeNull();
  });

  it("the daily-cap refusal shows the capped copy", async () => {
    renderBox(makeSubmit(fakeStorage(), "capped"));
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    fireEvent.click(screen.getByText(STUCK_COPY.send));
    await flush();
    expect(screen.getByText(STUCK_COPY.capped)).toBeTruthy();
  });

  it("a REJECTED submit promise reverts to the honest dropped copy, resets the guard, and leaks no unhandled rejection", async () => {
    const submit = vi.fn(() => Promise.reject(new Error("boom")));
    renderBox(submit);
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    fireEvent.click(screen.getByText(STUCK_COPY.send));
    await flush();
    // The optimistic message reverted to the honest failure copy.
    expect(screen.getByText(STUCK_COPY.dropped)).toBeTruthy();
    expect(screen.queryByText(STUCK_COPY.sent)).toBeNull();
    // The in-flight guard was reset: a later re-open + send works.
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    fireEvent.click(screen.getByText(STUCK_COPY.send));
    await flush();
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("unmount during an in-flight submit: handlers no-op and the 6s revert timer is never scheduled (no leak)", async () => {
    vi.useFakeTimers();
    try {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { submit, resolvers } = makeDeferredSubmit();
      const view = renderBox(submit);
      fireEvent.click(screen.getByText(STUCK_COPY.link));
      fireEvent.click(screen.getByText(STUCK_COPY.send)); // in flight
      view.unmount();
      // Baseline AFTER unmount (React's scheduler may hold its own timer);
      // the resolution below must not add the 6s revert timer on top of it.
      const baseline = vi.getTimerCount();
      await act(async () => {
        resolvers[0]("queued"); // resolves AFTER unmount
        await Promise.resolve();
      });
      // The mounted-ref guard skipped the setMessage AND never armed the timer.
      expect(vi.getTimerCount()).toBe(baseline);
      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("interleaved out-of-order resolutions: a stale earlier outcome never clobbers the latest", async () => {
    const { submit, resolvers } = makeDeferredSubmit();
    renderBox(submit);
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    fireEvent.click(screen.getByText(STUCK_COPY.send)); // submission #1 (slow, unresolved)
    // Deliberate re-open re-arms the guard; submission #2 goes out.
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    fireEvent.click(screen.getByText(STUCK_COPY.send));
    expect(submit).toHaveBeenCalledTimes(2);

    // The LATEST submission resolves first.
    await act(async () => {
      resolvers[1]("queued");
      await Promise.resolve();
    });
    expect(screen.getByText(STUCK_COPY.queued)).toBeTruthy();

    // The slow FIRST submission now resolves with a different outcome — stale,
    // its resolution must be ignored (per-submission token).
    await act(async () => {
      resolvers[0]("capped");
      await Promise.resolve();
    });
    expect(screen.getByText(STUCK_COPY.queued)).toBeTruthy();
    expect(screen.queryByText(STUCK_COPY.capped)).toBeNull();
  });

  it("collapsing via Never mind moves focus onto the link (the runner's trap never falls to body)", () => {
    renderBox(makeSubmit(fakeStorage()));
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    fireEvent.click(screen.getByText(STUCK_COPY.cancel));
    expect(document.activeElement).toBe(screen.getByText(STUCK_COPY.link));
  });

  it("collapsing via Send moves focus onto the link too", async () => {
    renderBox(makeSubmit(fakeStorage(), "sent"));
    fireEvent.click(screen.getByText(STUCK_COPY.link));
    fireEvent.click(screen.getByText(STUCK_COPY.send));
    await flush();
    expect(document.activeElement).toBe(screen.getByText(STUCK_COPY.link));
  });

  it("keeps 44px-class tap targets on the link and both buttons (390px rule)", () => {
    renderBox(makeSubmit(fakeStorage()));
    const link = screen.getByText(STUCK_COPY.link);
    expect(link.className).toContain("min-h-[44px]");
    fireEvent.click(link);
    expect(screen.getByText(STUCK_COPY.send).className).toContain("min-h-[44px]");
    expect(screen.getByText(STUCK_COPY.cancel).className).toContain("min-h-[44px]");
  });
});
