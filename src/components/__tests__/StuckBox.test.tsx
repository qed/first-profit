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
  type FeedbackInsertRow,
} from "../../lib/sync";

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

function renderBox(submit: ReturnType<typeof makeSubmit>, taskId = "1.1.3") {
  return render(
    <Ctx.Provider value={{ submitFeedback: submit }}>
      <StuckBox taskId={taskId} />
    </Ctx.Provider>,
  );
}

const flush = () => act(async () => Promise.resolve());

afterEach(cleanup);

describe("taskIdFor (Phase A synthesized task id)", () => {
  it("pins the 1:1 alignment: task index 4 of criterion 1.2 stamps 1.2.5", () => {
    expect(taskIdFor("1.2", 4)).toBe("1.2.5");
    expect(taskIdFor("1.1", 0)).toBe("1.1.1");
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

  it("keeps 44px-class tap targets on the link and both buttons (390px rule)", () => {
    renderBox(makeSubmit(fakeStorage()));
    const link = screen.getByText(STUCK_COPY.link);
    expect(link.className).toContain("min-h-[44px]");
    fireEvent.click(link);
    expect(screen.getByText(STUCK_COPY.send).className).toContain("min-h-[44px]");
    expect(screen.getByText(STUCK_COPY.cancel).className).toContain("min-h-[44px]");
  });
});
