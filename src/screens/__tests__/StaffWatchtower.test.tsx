// @vitest-environment jsdom
/**
 * Unit 5 — the Watchtower tab: the flow table and its drill-down.
 *
 * Driven through the REAL shell (session seeded in sessionStorage) so the tab is
 * exercised across the seam it actually ships behind: the shell's `request`,
 * its per-criterion cache, and its shell-owned criterion state. The tests that
 * are ABOUT the seam (a refused cache write, an `unauthorized` result, the
 * StrictMode double-invoke) mount the tab directly with a stub cache, because
 * the shell cannot be made to produce those states on demand.
 *
 * The pins that matter most here are not layout, they are MEANING:
 *  - no username reaches the DOM until a staff member drills in, and the
 *    aggregate helper is never even HANDED one;
 *  - "—", "withheld", "timings unusable" and a zero are four different facts and
 *    never collapse;
 *  - a payload element this page cannot read is COUNTED, never filtered away;
 *  - ONE CLOCK: the table and the drill-down are computed as of the same
 *    instant, so they cannot disagree across the 30-day line;
 *  - the median's survivorship caveat is asserted against the copy object, so a
 *    copy edit cannot quietly drop it;
 *  - every id in the request is percent-encoded (this is the page's first
 *    DYNAMIC path, and it goes out under a staff Bearer token).
 */
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config")>();
  return {
    ...actual,
    getConfig: () => ({
      supabaseUrl: "https://supabase.test",
      supabaseAnonKey: "anon-key",
      t120ApiUrl: "https://api.test",
    }),
  };
});

// The aggregate helper is wrapped (delegating) so ONE test can prove what the
// board actually hands it. `anonymousUnits` is a real projection, not a cast —
// passing `cohort.units` straight through type-checks and carries every
// username into the aggregate view's state.
vi.mock("../staff/flowBoard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../staff/flowBoard")>();
  return { ...actual, computeFlowRows: vi.fn(actual.computeFlowRows) };
});

import { StaffShell } from "../staff/StaffShell";
import { StaffWatchtower } from "../staff/StaffWatchtower";
import { STAFF_COPY } from "../staff/staffCopy";
import { STAFF_SESSION_KEY } from "../staff/staffSession";
import {
  computeFlowRows,
  normalizeCohort,
  requestedPhaseProbeIds,
  requestedTaskIds,
} from "../staff/flowBoard";
import { WATCHTOWER_FUNNEL_CACHE_KEY, watchtowerCacheKey } from "../staff/watchtowerCache";
import type { StaffApiResult, StaffCache } from "../staff/staffTypes";

const DAY = 86400e3;
const NOW = Date.now();

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(computeFlowRows).mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.sessionStorage.setItem(
    STAFF_SESSION_KEY,
    JSON.stringify({ accessToken: "staff-tok", refreshToken: "staff-ref" }),
  );
  window.history.replaceState(null, "", "/staff");
});

afterEach(cleanup);

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/* ------------------------------------------------------------- fixtures */

type Entry = [taskId: string, at: number | null];

function idea(index: number, id: string, entries: readonly Entry[], overrides: object = {}) {
  const doneByTask: Record<string, boolean> = {};
  const doneAtByTask: Record<string, number> = {};
  for (const [taskId, at] of entries) {
    doneByTask[taskId] = true;
    if (at !== null) doneAtByTask[taskId] = at;
  }
  const stamps = Object.values(doneAtByTask);
  return {
    index,
    id,
    done: {},
    doneAt: {},
    doneByTask,
    doneAtByTask,
    lastCompletionAt: stamps.length > 0 ? Math.max(...stamps) : null,
    recencyClamped: false,
    hasCompletionsOutsideRequest: false,
    ...overrides,
  };
}

function child(username: string, ideas: object[], overrides: object = {}) {
  return { username, truncated: false, docUnreadable: false, ideas, businesses: [], ...overrides };
}

/**
 * Criterion 1.1 (tasks 1.1.1 … 1.1.5), hand-computed:
 *
 *   task    through  median                    sitting  stalled
 *   1.1.1   6        —  (first of the whole sequence)  0        0
 *   1.1.2   3        2d over 3 children             2        1
 *   1.1.3   1        withheld (1 child)             2        0
 *   1.1.4   1        withheld (1 child)             0        0
 *   1.1.5   1        withheld (1 child)             0        0
 *
 * Totals: 4 sitting · 1 stalled · 0 before · 1 past · 6 live.
 */
const COHORT = {
  children: [
    child("ada.b", [idea(0, "i-a", [["1.1.1", NOW - 10 * DAY], ["1.1.2", NOW - 8 * DAY]])]),
    child("bo.c", [
      idea(0, "i-b", [["1.1.1", NOW - 20 * DAY], ["1.1.2", NOW - 16 * DAY]]),
      // Last completion 200 days ago: STALLED, on 1.1.2.
      idea(1, "i-b2", [["1.1.1", NOW - 200 * DAY]]),
    ]),
    child("cy.d", [
      idea(0, "i-c", [
        ["1.1.1", NOW - 40 * DAY],
        ["1.1.2", NOW - 38 * DAY],
        ["1.1.3", NOW - 30 * DAY],
        ["1.1.4", NOW - 25 * DAY],
        ["1.1.5", NOW - 20 * DAY],
      ]),
    ]),
    // TWO ideas on the same task from one child — the roster must fold them.
    child("dee.e", [
      idea(0, "i-d1", [["1.1.1", NOW - 3 * DAY]]),
      idea(1, "i-d2", [["1.1.1", NOW - 2 * DAY]]),
    ]),
    // A save the server could not read: counted as a caveat, never as a number,
    // and its username must never appear anywhere.
    child("ghost.g", [], { docUnreadable: true }),
  ],
};

const SUGGESTIONS = { ok: true, suggestions: [] };

interface Routes {
  progressFor?: (url: string) => Response | Promise<Response>;
}

function mockRoutes(routes: Routes = {}) {
  fetchMock.mockImplementation(async (url: unknown) => {
    const u = String(url);
    if (u.includes("/auth/v1/logout")) return jsonResponse(204, {});
    if (u.includes("grant_type=refresh_token")) return jsonResponse(401, {});
    if (u.includes("/api/fp/suggestions")) return jsonResponse(200, SUGGESTIONS);
    if (u.includes("/api/fp/progress")) {
      return (routes.progressFor ?? (() => jsonResponse(200, COHORT)))(u);
    }
    throw new Error(`unexpected fetch: ${u}`);
  });
}

/** Serve one body regardless of criterion. */
function serve(body: unknown) {
  mockRoutes({ progressFor: () => jsonResponse(200, body) });
}

/**
 * The cohort funnel (Change #3) hits the SAME endpoint with its own id list, so
 * every request assertion below has to say which of the two it means. The query
 * string is the discriminator — it is exactly `requestedPhaseProbeIds()`.
 */
const FUNNEL_QUERY = `tasks=${requestedPhaseProbeIds().map(encodeURIComponent).join(",")}`;
const isFunnelUrl = (u: string): boolean => u.includes(FUNNEL_QUERY);

function allProgressUrls(): string[] {
  return fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes("/api/fp/progress"));
}

/** The BOARD's requests — the funnel's are `funnelUrls()`. */
function progressUrls(): string[] {
  return allProgressUrls().filter((u) => !isFunnelUrl(u));
}

function funnelUrls(): string[] {
  return allProgressUrls().filter(isFunnelUrl);
}

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

/** Sign-in is out of scope here: the session is seeded, so the shell renders the
 *  tabs directly. Open the Watchtower and let its first load settle. */
async function openWatchtower() {
  render(<StaffShell />);
  await click(screen.getByRole("button", { name: STAFF_COPY.watchtowerTitle }));
}

function cellText(taskId: string): string[] {
  const row = screen.getByText(taskId).closest("tr");
  return Array.from(row?.querySelectorAll("td, th") ?? []).map((c) => c.textContent ?? "");
}

function caveatLines(): string[] {
  return Array.from(
    screen.getByTestId("fp-watchtower-caveats").querySelectorAll("li, p"),
  ).map((n) => n.textContent ?? "");
}

/** A minimal stand-in for the shell's cache: enough to mount the tab alone, and
 *  observable where the shell's is not. */
function stubCache(overrides: Partial<StaffCache> = {}): StaffCache & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    read: <T,>(key: string) => store.get(key) as T | undefined,
    begin: (key: string) => ({ key, generation: 1, epoch: 0 }),
    write: (ticket, value) => {
      store.set(ticket.key, value);
      return true;
    },
    clear: (key: string) => {
      store.delete(key);
    },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ tests */

describe("StaffWatchtower — the flow table", () => {
  beforeEach(() => mockRoutes());

  it("renders one row per unit task with throughput, median, sitting and stalled", async () => {
    await openWatchtower();

    const table = screen.getByTestId("fp-watchtower-table");
    expect(table.querySelectorAll("tbody tr").length).toBe(5);

    expect(cellText("1.1.1")[1]).toBe("6");
    expect(cellText("1.1.2")[1]).toBe("3");
    expect(cellText("1.1.3")[1]).toBe("1");

    // 1.1.2's median: ada 2d, bo 4d, cy 2d → per-child medians [2,4,2] → 2 days,
    // rendered as h:mm (48 hours, no minutes). The cell is the figure ALONE.
    const median = screen.getByTestId("fp-watchtower-median-1.1.2");
    expect(median.textContent).toBe("48:00");

    expect(screen.getByTestId("fp-watchtower-drill-1.1.3:active").textContent).toBe("2");
    expect(screen.getByTestId("fp-watchtower-drill-1.1.2:stalled").textContent).toBe("1");
    expect(screen.getByTestId("fp-watchtower-drill-1.1.2:active").textContent).toBe("2");
  });

  it("renders NO footer summary and no standing notes (Changes #1 and #4)", async () => {
    await openWatchtower();
    expect(screen.queryByTestId("fp-watchtower-footer")).toBeNull();
    // The caption went with them: the step is named above the table instead.
    expect(screen.getByTestId("fp-watchtower-table").querySelector("caption")).toBeNull();
    expect(screen.getByTestId("fp-watchtower-step-title").textContent).toContain("1.1");
  });

  it("the first task of the whole sequence renders “—”, with a word a screen reader can hear", async () => {
    await openWatchtower();
    const cell = screen.getByTestId("fp-watchtower-median-1.1.1");
    expect(cell.querySelector("[aria-hidden]")?.textContent).toBe(
      STAFF_COPY.watchtowerNotMeasurable,
    );
    expect(cell.querySelector(".sr-only")?.textContent).toBe(
      STAFF_COPY.watchtowerNotMeasurableSr,
    );
  });

  it("a suppressed median renders as WITHHELD — not a number and not “—”", async () => {
    await openWatchtower();
    // 1.1.3's only sample comes from one child, below MIN_CHILDREN_PER_MEDIAN.
    const cell = screen.getByTestId("fp-watchtower-median-1.1.3");
    expect(cell.textContent).toBe(STAFF_COPY.watchtowerMedianWithheld);
    expect(cell.textContent).not.toBe(STAFF_COPY.watchtowerNotMeasurable);
    expect(cell.textContent).not.toMatch(/\d/);
  });

  it("a “—” caused by DROPPED samples says so, instead of claiming nothing was measurable", async () => {
    // One child, one idea, 1.1.1 and 1.1.2 stamped at the SAME instant: a
    // sample existed and was rejected as unusable (zero elapsed).
    serve({
      children: [
        child("solo.s", [idea(0, "i-s", [["1.1.1", NOW - DAY], ["1.1.2", NOW - DAY]])]),
      ],
    });
    await openWatchtower();
    const cell = screen.getByTestId("fp-watchtower-median-1.1.2");
    expect(cell.textContent).toContain(STAFF_COPY.watchtowerNotMeasurable);
    expect(screen.getByTestId("fp-watchtower-dropped-1.1.2").textContent).toBe(
      `1 ${STAFF_COPY.watchtowerMedianDroppedLabel}`,
    );
  });

  it("a REAL median is the figure alone — no sample line, no dropped count (Change #2)", async () => {
    // The same fixture that used to prove the opposite. Two honest children
    // measure 2 days; a third pair is rejected. The owner asked for the number
    // by itself, so the rejection is no longer surfaced on THIS cell — the
    // trade-off is recorded here rather than left to be rediscovered.
    serve({
      children: [
        child("ada.b", [idea(0, "a1", [["1.1.1", NOW - 10 * DAY], ["1.1.2", NOW - 8 * DAY]])]),
        child("bo.c", [idea(0, "b1", [["1.1.1", NOW - 10 * DAY], ["1.1.2", NOW - 8 * DAY]])]),
        // Same instant on both: a sample existed and was unusable.
        child("cy.d", [idea(0, "c1", [["1.1.1", NOW - 5 * DAY], ["1.1.2", NOW - 5 * DAY]])]),
      ],
    });
    await openWatchtower();
    const cell = screen.getByTestId("fp-watchtower-median-1.1.2");
    expect(cell.textContent).toBe("48:00"); // 2 days, as h:mm — and nothing else
    expect(screen.queryByTestId("fp-watchtower-dropped-1.1.2")).toBeNull();
  });

  it("renders the median as h:mm, so sub-hour work is legible in minutes", async () => {
    // 1h20m for both children: the old formatter called this "under 1h" at 50
    // minutes and rounded to "1h" here, which is what Change #2 was about.
    const span = 80 * 60e3;
    serve({
      children: [
        child("ada.b", [idea(0, "a1", [["1.1.1", NOW - DAY], ["1.1.2", NOW - DAY + span]])]),
        child("bo.c", [idea(0, "b1", [["1.1.1", NOW - DAY], ["1.1.2", NOW - DAY + span]])]),
      ],
    });
    await openWatchtower();
    expect(screen.getByTestId("fp-watchtower-median-1.1.2").textContent).toBe("1:20");
  });

  it("shows DROPPED samples beside a WITHHELD median too", async () => {
    // The third branch: one child's median exists but is below
    // MIN_CHILDREN_PER_MEDIAN, and a second child's pair was rejected. Both
    // facts, not one.
    serve({
      children: [
        child("ada.b", [idea(0, "a1", [["1.1.1", NOW - 10 * DAY], ["1.1.2", NOW - 8 * DAY]])]),
        child("cy.d", [idea(0, "c1", [["1.1.1", NOW - 5 * DAY], ["1.1.2", NOW - 5 * DAY]])]),
      ],
    });
    await openWatchtower();
    const cell = screen.getByTestId("fp-watchtower-median-1.1.2");
    expect(cell.textContent).toContain(STAFF_COPY.watchtowerMedianWithheld);
    expect(screen.getByTestId("fp-watchtower-dropped-1.1.2").textContent).toBe(
      `1 ${STAFF_COPY.watchtowerMedianDroppedLabel}`,
    );
  });

  it("splits the stalled count into clock-ahead and unbacked, per row", async () => {
    serve({
      children: [
        // Recency is this request's clock, not the child's work.
        child("clock.c", [
          idea(0, "c1", [["1.1.1", NOW - 100 * DAY]], { recencyClamped: true }),
        ]),
        // A fresh-looking stamp no completion backs.
        child("unbacked.u", [
          idea(0, "u1", [["1.1.1", NOW - 100 * DAY]], { lastCompletionAt: NOW - DAY }),
        ]),
      ],
    });
    await openWatchtower();
    expect(screen.getByTestId("fp-watchtower-drill-1.1.2:stalled").textContent).toBe("2");
    const split = screen.getByTestId("fp-watchtower-stalled-split-1.1.2").textContent ?? "";
    expect(split).toContain(`1 ${STAFF_COPY.watchtowerStalledClamped}`);
    expect(split).toContain(`1 ${STAFF_COPY.watchtowerStalledUncorroborated}`);
  });

  it("surfaces a non-monotonic throughput: names the task, says what to do, and describes the table", async () => {
    // One idea has 1.1.2 done but not 1.1.1: more ideas through 1.1.2 than
    // through the task before it, which cannot happen.
    serve({ children: [child("odd.o", [idea(0, "i-o", [["1.1.2", NOW - DAY]])])] });
    await openWatchtower();
    const warning = screen.getByTestId("fp-watchtower-monotonic");
    expect(warning.textContent).toContain("1.1.2");
    expect(warning.textContent).toContain(STAFF_COPY.watchtowerMonotonicLead);
    expect(warning.textContent).toContain(STAFF_COPY.watchtowerMonotonicAction);
    // role="alert" is silent on first paint; the table points AT the warning.
    expect(screen.getByTestId("fp-watchtower-table").getAttribute("aria-describedby")).toBe(
      warning.id,
    );
  });

  it("a cohort with ideas but none in this step reads as EMPTY, and still shows the caveats", async () => {
    // Real children, real ideas, all of them parked in a LATER step.
    serve({
      children: [
        child("far.f", [
          idea(0, "f1", [["1.1.1", NOW - DAY]], { hasCompletionsOutsideRequest: true }),
        ]),
      ],
    });
    await openWatchtower();
    // This cohort HAS reached 1.1.1, so the board is not empty — the point of
    // the fixture is that "empty" is about the ROWS, never about "no payload".
    expect(screen.getByTestId("fp-watchtower-table")).toBeTruthy();
    expect(caveatLines().join(" ")).toContain(STAFF_COPY.watchtowerCaveatOutsideRequest);
  });

  it("a cohort of ZERO children is a fault, NOT “nobody has reached this step”", async () => {
    serve({ children: [] });
    await openWatchtower();
    expect(screen.getByTestId("fp-watchtower-no-cohort").textContent).toBe(
      STAFF_COPY.watchtowerNoCohort,
    );
    expect(screen.queryByText(STAFF_COPY.watchtowerEmpty)).toBeNull();
    expect(screen.queryByTestId("fp-watchtower-table")).toBeNull();
  });

  it("children who exist but have not started this step read as the empty state", async () => {
    // A real child with a real save and no ideas yet: the cohort is PRESENT and
    // this step is untouched — which is a different sentence from "the endpoint
    // sent us nothing", and the caveat says which.
    serve({ children: [child("quiet.q", [])] });
    await openWatchtower();
    expect(screen.getByText(STAFF_COPY.watchtowerEmpty)).toBeTruthy();
    expect(screen.queryByTestId("fp-watchtower-no-cohort")).toBeNull();
    expect(caveatLines().join("\n")).toContain(`${STAFF_COPY.watchtowerCaveatNoUnits}: 1`);
  });
});

describe("StaffWatchtower — absence is a number", () => {
  it("renders every cohort caveat the math layer emits, with the count as a number", async () => {
    serve({
      children: [
        child("ghost.g", [], { docUnreadable: true }),
        child("big.b", [idea(0, "b1", [["1.1.1", NOW - DAY]])], { truncated: true }),
        // Index GAP: the server preserves original indices, so 0 and 2 with a
        // length of 2 is evidence of an idea it skipped.
        child("gap.g", [
          idea(0, "g1", [["1.1.1", NOW - DAY]]),
          idea(2, "g3", [["1.1.1", NOW - DAY]]),
        ]),
        child("none.n", []),
        child("unbacked.u", [
          idea(0, "u1", [["1.1.1", NOW - 100 * DAY]], { lastCompletionAt: NOW - DAY }),
        ]),
        child("outside.o", [
          idea(0, "o1", [["1.1.1", NOW - DAY]], { hasCompletionsOutsideRequest: true }),
        ]),
        // Six ideas from one child, above the app's own MAX_IDEAS of 5.
        child(
          "many.m",
          [0, 1, 2, 3, 4, 5].map((n) => idea(n, `m${n}`, [["1.1.1", NOW - DAY]])),
        ),
      ],
    });
    await openWatchtower();
    const lines = caveatLines().join("\n");
    for (const label of [
      STAFF_COPY.watchtowerCaveatUnreadable,
      STAFF_COPY.watchtowerCaveatTruncated,
      STAFF_COPY.watchtowerCaveatSkippedIdeas,
      STAFF_COPY.watchtowerCaveatNoUnits,
      STAFF_COPY.watchtowerCaveatUncorroborated,
      STAFF_COPY.watchtowerCaveatOutsideRequest,
      STAFF_COPY.watchtowerCaveatWipConcentration,
    ]) {
      expect(lines).toContain(label);
    }
    expect(lines).toContain(`${STAFF_COPY.watchtowerCaveatWipConcentration}: 6`);
    // The count is a number, not the tail of a sentence.
    const bolds = Array.from(
      screen.getByTestId("fp-watchtower-caveats").querySelectorAll("span.tabular-nums"),
    ).map((n) => n.textContent);
    expect(bolds.length).toBeGreaterThan(0);
    expect(bolds.every((b) => /^\d+$/.test(b ?? ""))).toBe(true);
  });

  it("says explicitly when NOTHING is hidden, instead of hiding the section", async () => {
    serve({ children: [child("ada.b", [idea(0, "a1", [["1.1.1", NOW - DAY]])])] });
    await openWatchtower();
    expect(screen.getByTestId("fp-watchtower-caveats").textContent).toContain(
      STAFF_COPY.watchtowerCaveatNone,
    );
  });

  it("COUNTS a child it cannot read rather than deleting it from the cohort", async () => {
    serve({
      children: [
        child("ada.b", [idea(0, "a1", [["1.1.1", NOW - DAY]])]),
        // The endpoint renamed the field: a shape this page cannot read.
        { handle: "renamed.r", truncated: false, docUnreadable: false, ideas: [], businesses: [] },
      ],
    });
    await openWatchtower();
    expect(caveatLines().join("\n")).toContain(
      `${STAFF_COPY.watchtowerCaveatRejectedChildren}: 1`,
    );
    expect(document.body.textContent).not.toContain("renamed.r");
  });

  it("REFUSES a payload whose children are all unreadable — it is a fault, not a quiet cohort", async () => {
    serve({
      children: [
        { handle: "a", ideas: [], businesses: [] },
        { handle: "b", ideas: [], businesses: [] },
      ],
    });
    await openWatchtower();
    expect(screen.getByText(STAFF_COPY.watchtowerLoadFailed)).toBeTruthy();
    expect(screen.queryByTestId("fp-watchtower-table")).toBeNull();
  });

  it("ALERTS when every child's save is unreadable — the DOC_VERSION skew state", async () => {
    // These children narrow perfectly well, so `narrowProgress` returns a
    // payload and `childCount` is 2 — the zero-children alert cannot fire. The
    // likeliest cause is a DOC_VERSION bump shipped here before the120
    // redeployed, and the old board answered it with the mild "nothing here
    // yet" line plus one bullet at the bottom of the caveat block.
    serve({
      children: [
        child("ada.b", [], { docUnreadable: true }),
        child("bo.c", [], { docUnreadable: true }),
      ],
    });
    await openWatchtower();
    const alert = screen.getByTestId("fp-watchtower-all-unreadable");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toBe(STAFF_COPY.watchtowerAllUnreadable);
    expect(screen.queryByText(STAFF_COPY.watchtowerEmpty)).toBeNull();
    expect(screen.queryByTestId("fp-watchtower-no-cohort")).toBeNull();
    // and the caveat still carries the count, so the two agree
    expect(caveatLines().join("\n")).toContain(
      `${STAFF_COPY.watchtowerCaveatUnreadable}: 2`,
    );
  });

  it("does NOT fire that alert when even one child is readable", async () => {
    serve({
      children: [
        child("ada.b", [idea(0, "a1", [["1.1.1", NOW - DAY]])]),
        child("bo.c", [], { docUnreadable: true }),
      ],
    });
    await openWatchtower();
    expect(screen.queryByTestId("fp-watchtower-all-unreadable")).toBeNull();
    expect(screen.getByTestId("fp-watchtower-table")).toBeTruthy();
  });

  it("does not accuse a child of WIP concentration for a dangling business", async () => {
    // The app's cap is five IDEAS. A business whose linked idea was deleted is a
    // legitimate sixth flow unit, and testing the unit TOTAL made a lawful save
    // trip the one caveat whose job is telling staff which numbers to distrust.
    serve({
      children: [
        child(
          "lawful.l",
          [0, 1, 2, 3, 4].map((n) => idea(n, `l${n}`, [["1.1.1", NOW - DAY]])),
          {
            businesses: [
              {
                id: "biz-1",
                ideaId: "no-such-idea",
                archived: false,
                doneByTask: {},
                doneAtByTask: {},
                lastCompletionAt: NOW - DAY,
                recencyClamped: false,
                hasCompletionsOutsideRequest: false,
              },
            ],
          },
        ),
      ],
    });
    await openWatchtower();
    expect(caveatLines().join("\n")).not.toContain(
      STAFF_COPY.watchtowerCaveatWipConcentration,
    );
  });

  it("REJECTS an idea with no usable index rather than renumbering it", async () => {
    serve({
      children: [
        child("ada.b", [
          idea(0, "a1", [["1.1.1", NOW - DAY]]),
          // No index: renumbering it to 1 would both hide the gap and mint the
          // wrong `legacy-idea-{n}` id.
          { id: null, doneByTask: { "1.1.1": true }, doneAtByTask: { "1.1.1": NOW - DAY } },
        ]),
      ],
    });
    await openWatchtower();
    expect(caveatLines().join("\n")).toContain(`${STAFF_COPY.watchtowerCaveatRejectedIdeas}: 1`);
    // Counted as one idea through, not two.
    expect(cellText("1.1.1")[1]).toBe("1");
  });

  it("never mints a completion from a non-true flag", async () => {
    serve({
      children: [
        child("ada.b", [idea(0, "a1", [["1.1.1", NOW - DAY]])]),
        {
          username: "sneaky.s",
          truncated: false,
          docUnreadable: false,
          businesses: [],
          ideas: [
            {
              index: 0,
              id: "s1",
              done: {},
              doneAt: {},
              doneByTask: { "1.1.1": "yes", "1.1.2": 1 },
              doneAtByTask: { "1.1.1": NOW - DAY },
              lastCompletionAt: NOW - DAY,
              recencyClamped: false,
              hasCompletionsOutsideRequest: false,
            },
          ],
        },
      ],
    });
    await openWatchtower();
    expect(cellText("1.1.1")[1]).toBe("1");
    expect(cellText("1.1.2")[1]).toBe("0");
  });
});

describe("StaffWatchtower — privacy and the drill-down", () => {
  beforeEach(() => mockRoutes());

  it("renders NO username anywhere until a count is drilled", async () => {
    await openWatchtower();
    const text = document.body.textContent ?? "";
    for (const name of ["ada.b", "bo.c", "cy.d", "dee.e", "ghost.g"]) {
      expect(text).not.toContain(name);
    }
    expect(screen.queryAllByTestId("fp-watchtower-username")).toHaveLength(0);
  });

  it("never HANDS a username to the aggregate helper, not merely refrains from rendering it", async () => {
    await openWatchtower();
    const calls = vi.mocked(computeFlowRows).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [units] of calls) {
      for (const unit of units) {
        expect(Object.keys(unit)).not.toContain("username");
        expect(Object.keys(unit)).not.toContain("key");
      }
    }
  });

  it("drilling SITTING names exactly that bucket, and drilling again hides it", async () => {
    await openWatchtower();
    await click(screen.getByTestId("fp-watchtower-drill-1.1.3:active"));

    const names = screen
      .getAllByTestId("fp-watchtower-username")
      .map((n) => n.textContent);
    expect(names).toEqual(["ada.b", "bo.c"]);
    expect(document.body.textContent).not.toContain("cy.d");

    await click(screen.getByTestId("fp-watchtower-drill-1.1.3:active"));
    expect(screen.queryAllByTestId("fp-watchtower-username")).toHaveLength(0);
  });

  it("drilling STALLED names who to nudge", async () => {
    await openWatchtower();
    await click(screen.getByTestId("fp-watchtower-drill-1.1.2:stalled"));
    expect(
      screen.getAllByTestId("fp-watchtower-username").map((n) => n.textContent),
    ).toEqual(["bo.c"]);
  });

  it("reconciles the roster with the number that was clicked", async () => {
    await openWatchtower();
    await click(screen.getByTestId("fp-watchtower-drill-1.1.2:active"));
    const roster = screen.getByTestId("fp-watchtower-roster");
    // TWO ideas, ONE child — stated, not left as unexplained arithmetic.
    expect(screen.getByTestId("fp-watchtower-roster-count").textContent).toBe(
      `${STAFF_COPY.watchtowerDrillIdeasSuffix}: 2 · ${STAFF_COPY.watchtowerDrillChildrenSuffix}: 1`,
    );
    expect(screen.getAllByTestId("fp-watchtower-username")).toHaveLength(1);
    expect(roster.textContent).toContain("dee.e");
    expect(roster.textContent).toContain(`(2 ${STAFF_COPY.watchtowerDrillIdeasSuffix})`);
  });

  it("marks a name whose save is ABNORMAL, so the caveat count can be joined to a person", async () => {
    // The caveat block says "abnormal docs: 1"; without a marker here nobody can
    // tell WHICH of the two names it is about, and the number buys no action.
    serve({
      children: [
        child("normal.n", [idea(0, "n1", [["1.1.1", NOW - DAY]])]),
        child("abnormal.a", [idea(0, "a1", [["1.1.1", NOW - DAY]])], { truncated: true }),
      ],
    });
    await openWatchtower();
    await click(screen.getByTestId("fp-watchtower-drill-1.1.2:active"));
    const names = screen.getAllByTestId("fp-watchtower-username").map((n) => n.textContent);
    expect(names).toEqual(["abnormal.a", "normal.n"]);
    const marks = screen.getAllByTestId("fp-watchtower-roster-truncated");
    expect(marks).toHaveLength(1); // exactly one, so it is not an unconditional badge
    expect(marks[0].textContent).toContain(STAFF_COPY.watchtowerDrillTruncated);
    // and it sits on the abnormal name, not the other one
    expect(marks[0].closest("li")?.textContent).toContain("abnormal.a");
    expect(caveatLines().join("\n")).toContain(
      `${STAFF_COPY.watchtowerCaveatTruncated}: 1`,
    );
  });

  it("opening a second bucket collapses the first", async () => {
    await openWatchtower();
    await click(screen.getByTestId("fp-watchtower-drill-1.1.3:active"));
    expect(screen.getByTestId("fp-watchtower-drill-1.1.3:active").getAttribute("aria-expanded")).toBe(
      "true",
    );
    await click(screen.getByTestId("fp-watchtower-drill-1.1.2:stalled"));
    expect(screen.getAllByTestId("fp-watchtower-roster")).toHaveLength(1);
    expect(screen.getByTestId("fp-watchtower-drill-1.1.3:active").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(
      screen.getAllByTestId("fp-watchtower-username").map((n) => n.textContent),
    ).toEqual(["bo.c"]);
  });

  it("moves focus into the roster and returns it to the trigger on Escape", async () => {
    await openWatchtower();
    const trigger = screen.getByTestId("fp-watchtower-drill-1.1.3:active");
    await click(trigger);
    expect(document.activeElement).toBe(screen.getByTestId("fp-watchtower-roster"));
    // The trigger names the panel it controls.
    expect(trigger.getAttribute("aria-controls")).toBe(
      screen.getByTestId("fp-watchtower-roster").id,
    );

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("fp-watchtower-roster"), { key: "Escape" });
    });
    expect(screen.queryByTestId("fp-watchtower-roster")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("the Close button dismisses the roster and restores focus", async () => {
    await openWatchtower();
    const trigger = screen.getByTestId("fp-watchtower-drill-1.1.3:active");
    await click(trigger);
    await click(screen.getByText(STAFF_COPY.watchtowerDrillClose));
    expect(screen.queryByTestId("fp-watchtower-roster")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("throughput is NOT drillable, and neither is a zero count", async () => {
    await openWatchtower();
    // The throughput cell holds a bare number, not a control.
    const throughputCell = screen.getByText("1.1.1").closest("tr")?.querySelectorAll("td")[0];
    expect(throughputCell?.querySelector("button")).toBeNull();
    // 1.1.1 has nobody sitting or stalled: no button, nothing to disclose.
    expect(screen.queryByTestId("fp-watchtower-drill-1.1.1:active")).toBeNull();
    expect(screen.queryByTestId("fp-watchtower-drill-1.1.1:stalled")).toBeNull();
  });

  it("a criterion change collapses the roster — and it is still collapsed when the row comes BACK", async () => {
    await openWatchtower();
    await click(screen.getByTestId("fp-watchtower-drill-1.1.3:active"));
    expect(screen.getByTestId("fp-watchtower-roster")).toBeTruthy();

    await click(screen.getByRole("button", { name: /Step 1\.2/ }));
    expect(screen.queryByTestId("fp-watchtower-roster")).toBeNull();

    // Back to a CACHE HIT, so the very row that was open exists again. A
    // "collapse" that only worked because the table was replaced fails here.
    await click(screen.getByRole("button", { name: /Step 1\.1/ }));
    expect(screen.getByTestId("fp-watchtower-drill-1.1.3:active")).toBeTruthy();
    expect(screen.queryByTestId("fp-watchtower-roster")).toBeNull();
    expect(screen.queryAllByTestId("fp-watchtower-username")).toHaveLength(0);
  });
});

describe("StaffWatchtower — ONE CLOCK", () => {
  beforeEach(() => mockRoutes());

  it("computes the table AND the drill-down as of the FETCH instant, not the render instant", async () => {
    const clock = vi.spyOn(Date, "now");
    try {
      clock.mockReturnValue(NOW);
      await openWatchtower();
      expect(screen.getByTestId("fp-watchtower-drill-1.1.3:active").textContent).toBe("2");

      // 31 days pass with the tab open. Both units sitting on 1.1.3 last
      // completed 10 and 16 days before the fetch, so a fresh clock at EITHER
      // consumer moves them from sitting to stalled — and the table and the
      // roster would then contradict each other.
      clock.mockReturnValue(NOW + 31 * DAY);
      await click(screen.getByTestId("fp-watchtower-drill-1.1.3:active"));

      expect(screen.getByTestId("fp-watchtower-drill-1.1.3:active").textContent).toBe("2");
      expect(
        screen.getAllByTestId("fp-watchtower-username").map((n) => n.textContent),
      ).toEqual(["ada.b", "bo.c"]);
      expect(screen.getByTestId("fp-watchtower-roster-count").textContent).toContain(
        `${STAFF_COPY.watchtowerDrillIdeasSuffix}: 2`,
      );

      // And a RE-READ of the cached board, long after its fetch, still reads as
      // of that fetch. The round trip is what forces the row memo to RECOMPUTE
      // (the window object is rebuilt on a criterion change) — without it,
      // memoization alone would preserve the right answer and hide a fresh
      // clock at that consumer.
      await click(screen.getByRole("button", { name: /Step 1\.2/ }));
      await click(screen.getByRole("button", { name: /Step 1\.1/ }));
      expect(screen.getByTestId("fp-watchtower-drill-1.1.3:active").textContent).toBe("2");
      expect(screen.getByTestId("fp-watchtower-median-1.1.2").textContent).toBe("48:00");
    } finally {
      clock.mockRestore();
    }
  });
});

describe("StaffWatchtower — the cohort funnel (Change #3)", () => {
  it("asks for the phase probes in a SECOND request, not by widening the board's", async () => {
    mockRoutes();
    await openWatchtower();
    expect(funnelUrls()).toHaveLength(1);
    // The board's request is untouched — its budget is sized for a criterion.
    expect(progressUrls()[0]).toBe(
      `https://api.test/api/fp/progress?tasks=${requestedTaskIds("sell", "1.1")
        .map(encodeURIComponent)
        .join(",")}`,
    );
    // One probe per phase: the first task of each phase's first criterion.
    const probes = requestedPhaseProbeIds();
    expect(probes).toContain("1.1.1");
    expect(probes).toContain("2.1.1");
    expect(probes.length).toBeLessThanOrEqual(16);
  });

  it("counts IDEAS per phase and children who are in no phase at all", async () => {
    mockRoutes();
    await openWatchtower();
    // Every idea in COHORT has 1.1.1 and nothing past it, so all six sit in
    // Sell; the later phases are empty. One of the six (i-b2, 200 days quiet)
    // is stalled.
    const sell = screen.getByTestId("fp-watchtower-funnel-sell").textContent ?? "";
    expect(sell).toContain("6");
    expect(sell).toContain(`1 ${STAFF_COPY.watchtowerFunnelStalled}`);
    expect(screen.getByTestId("fp-watchtower-funnel-build").textContent).toContain("0");
    // ghost.g's save could not be read: it lands in "not started" at the owner's
    // request — and says so, because an unreadable save is a FAULT on our side,
    // not a child who never showed up.
    const notStarted = screen.getByTestId("fp-watchtower-funnel-not-started").textContent ?? "";
    expect(notStarted).toContain("1");
    expect(notStarted).toContain(`1 ${STAFF_COPY.watchtowerFunnelUnreadable}`);
  });

  it("a unit that has completed a LATER phase's probe counts in that phase", async () => {
    serve({
      children: [
        child("far.f", [idea(0, "f1", [["1.1.1", NOW - 40 * DAY], ["3.1.1", NOW - DAY]])]),
      ],
    });
    await openWatchtower();
    expect(screen.getByTestId("fp-watchtower-funnel-sell").textContent).toContain("0");
    expect(screen.getByTestId("fp-watchtower-funnel-validate").textContent).toContain("1");
  });

  it("is ABSENT, never zeroed, when its request fails", async () => {
    // A funnel of zeros is a claim about a cohort nobody could read — the same
    // mistake `watchtowerNoCohort` exists to prevent one level down. And the
    // board itself must still render: the funnel is context, not a dependency.
    mockRoutes({
      progressFor: (url) => (isFunnelUrl(url) ? jsonResponse(500, {}) : jsonResponse(200, COHORT)),
    });
    await openWatchtower();
    expect(screen.queryByTestId("fp-watchtower-funnel-sell")).toBeNull();
    expect(screen.queryByTestId("fp-watchtower-funnel-not-started")).toBeNull();
    // The phase selector itself is untouched — only the counts are missing.
    expect(screen.getByRole("button", { name: "Sell" })).toBeTruthy();
    expect(screen.getByTestId("fp-watchtower-table")).toBeTruthy();
    // And no second error banner competing with the one that matters.
    expect(screen.queryByText(STAFF_COPY.watchtowerLoadFailed)).toBeNull();
  });

  it("survives a criterion change without refetching — it is cohort-wide", async () => {
    mockRoutes();
    await openWatchtower();
    await click(screen.getByRole("button", { name: /Step 1\.2/ }));
    await click(screen.getByRole("button", { name: "Build" }));
    expect(funnelUrls()).toHaveLength(1);
    expect(screen.getByTestId("fp-watchtower-funnel-sell").textContent).toContain("6");
  });

  it("the sixth bubble is a LABEL, not a button — there is no criterion to select", async () => {
    mockRoutes();
    await openWatchtower();
    const bubble = screen.getByTestId("fp-watchtower-phase-not-started");
    expect(bubble.tagName).toBe("SPAN");
    expect(bubble.textContent).toBe(STAFF_COPY.watchtowerPhaseNotStarted);
    expect(screen.queryByRole("button", { name: STAFF_COPY.watchtowerPhaseNotStarted })).toBeNull();
  });

  it("hands the funnel NO usernames — it has no drill-down to justify them", async () => {
    mockRoutes();
    await openWatchtower();
    // The funnel payload is the full cohort, usernames and all. Nothing from it
    // may reach the DOM: the board's own no-username rule, one request over.
    expect(screen.getByTestId("fp-watchtower-funnel")).toBeTruthy();
    expect(document.body.textContent).not.toContain("ghost.g");
    expect(document.body.textContent).not.toContain("ada.b");
  });
});

describe("StaffWatchtower — copy obligations", () => {
  it("the median column is still worded as completers-only", () => {
    // The standing caveat below the table is gone (Change #4), so the COLUMN
    // HEADER is now the only place this survivorship warning lives.
    expect(STAFF_COPY.watchtowerColMedian).toMatch(/got through/i);
    expect(STAFF_COPY.watchtowerColMedian).not.toMatch(/how long this task takes/i);
  });

  it("the stalled column HEADER states the whole definition, not half of it", () => {
    // At launch the second clause is most of the column; a header that says only
    // "30+ days" sends staff to nudge a child who started yesterday. With the
    // notes removed this header carries the definition ON ITS OWN.
    expect(STAFF_COPY.watchtowerColStalled).toMatch(/30\+ days/);
    expect(STAFF_COPY.watchtowerColStalled).toMatch(/no usable timestamp/i);
  });

  it("renders NO standing explanation under the table (Change #4)", async () => {
    mockRoutes();
    await openWatchtower();
    for (const gone of [
      /NOT how long this task takes/i,
      /one row per unit task/i,
      /these are the ideas to nudge/i,
      /the cohort went live on/i,
    ]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    // The one thing under the table that is NOT an explanation stays.
    expect(screen.getByText(STAFF_COPY.watchtowerCaveatsTitle)).toBeTruthy();
  });
});

describe("StaffWatchtower — the request", () => {
  it("asks for exactly requestedTaskIds, percent-encoding every id", async () => {
    mockRoutes();
    await openWatchtower();
    const url = progressUrls()[0];
    const ids = requestedTaskIds("sell", "1.1");
    expect(url).toBe(
      `https://api.test/api/fp/progress?tasks=${ids.map(encodeURIComponent).join(",")}`,
    );
    // The real assertion: legacy spellings ride along and their "#" is encoded.
    // An unencoded one would truncate the query string at the fragment.
    expect(url).toContain("1.1%230");
    expect(url).not.toContain("#");
  });

  it("switching criterion refetches; switching back is served from the cache", async () => {
    mockRoutes();
    await openWatchtower();
    expect(progressUrls()).toHaveLength(1);

    await click(screen.getByRole("button", { name: /Step 1\.2/ }));
    expect(progressUrls()).toHaveLength(2);
    expect(progressUrls()[1]).toContain("1.2.1");

    await click(screen.getByRole("button", { name: /Step 1\.1/ }));
    expect(progressUrls()).toHaveLength(2); // cached
    expect(screen.getByTestId("fp-watchtower-table")).toBeTruthy();
  });

  it("can return to a criterion whose first request was ABANDONED mid-flight", async () => {
    // THE WEDGE. Cached 1.1 → click 1.2 (fetch starts) → click 1.1 mid-flight
    // (the 1.2 request is aborted, and 1.1 is served from cache) → click 1.2
    // again. The mount had recorded "we asked for 1.2", the cache-hit return
    // never corrected it, and the StrictMode guard then read a genuine user
    // request as a duplicate invocation: no fetch, no cached entry, no error —
    // "Loading…" forever, with no Retry, until a Refresh or a remount.
    const pending: Array<(res: Response) => void> = [];
    mockRoutes({
      progressFor: (url) => {
        // 1.2's request is the one carrying 1.2's own task ids.
        if (!url.includes("1.2.1")) return jsonResponse(200, COHORT);
        return new Promise<Response>((resolve) => pending.push(resolve));
      },
    });
    render(<StaffShell />);
    await click(screen.getByRole("button", { name: STAFF_COPY.watchtowerTitle }));
    expect(screen.getByTestId("fp-watchtower-table")).toBeTruthy();

    await click(screen.getByRole("button", { name: /Step 1\.2/ }));
    expect(pending).toHaveLength(1); // in flight, never settled
    await click(screen.getByRole("button", { name: /Step 1\.1/ }));
    expect(screen.getByTestId("fp-watchtower-table")).toBeTruthy(); // 1.1 from cache

    await click(screen.getByRole("button", { name: /Step 1\.2/ }));
    expect(pending).toHaveLength(2); // a SECOND request, not a silent no-op
    await act(async () => {
      pending[1](jsonResponse(200, COHORT));
    });
    expect(screen.getByTestId("fp-watchtower-table")).toBeTruthy();
    expect(screen.queryByText(STAFF_COPY.watchtowerLoading)).toBeNull();
  });

  it("never pairs one step's heading with another step's numbers", async () => {
    // 1.2 is served a cohort with a DIFFERENT live count, so a frame of 1.1's
    // payload under 1.2's heading is visible as a number, not just a caption.
    mockRoutes({
      progressFor: (url) =>
        url.includes("1.2.1")
          ? jsonResponse(200, { children: [child("solo.s", [idea(0, "s1", [["1.2.1", NOW - DAY]])])] })
          : jsonResponse(200, COHORT),
    });
    await openWatchtower();
    expect(cellText("1.1.1")[1]).toBe("6");

    await click(screen.getByRole("button", { name: /Step 1\.2/ }));
    // The heading and the numbers both describe 1.2 — the caption that used to
    // carry the third half of this assertion is gone (Change #1), so the row is
    // what proves the payload swapped with the heading.
    expect(screen.getByTestId("fp-watchtower-step-title").textContent).toContain("1.2");
    expect(cellText("1.2.1")[1]).toBe("1");
    expect(screen.queryByText("1.1.1")).toBeNull();
  });

  it("Refresh clears this criterion's cache entry and forces a fetch", async () => {
    mockRoutes();
    await openWatchtower();
    await click(screen.getByText(STAFF_COPY.watchtowerRefresh));
    expect(progressUrls()).toHaveLength(2);
    expect(progressUrls()[1]).toBe(progressUrls()[0]);
  });

  it("changing PHASE selects that phase's first criterion", async () => {
    mockRoutes();
    await openWatchtower();
    await click(screen.getByRole("button", { name: "Build" }));
    expect(screen.getByRole("button", { name: /Step 2\.1/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(progressUrls()[1]).toContain("2.1.1");
  });

  it("a failed first load shows a retryable error; retry refetches", async () => {
    let calls = 0;
    mockRoutes({
      // The funnel shares this endpoint and must not consume the board's turn.
      progressFor: (url) => {
        if (isFunnelUrl(url)) return jsonResponse(200, COHORT);
        calls += 1;
        return calls === 1 ? jsonResponse(500, {}) : jsonResponse(200, COHORT);
      },
    });
    await openWatchtower();
    expect(screen.getByText(STAFF_COPY.watchtowerLoadFailed)).toBeTruthy();
    expect(screen.getByText(STAFF_COPY.watchtowerLoadFailed).getAttribute("role")).toBe("alert");

    await click(screen.getByText(STAFF_COPY.retry));
    expect(screen.getByTestId("fp-watchtower-table")).toBeTruthy();
  });

  it("a failed REFRESH keeps the stale table on screen with an inline error", async () => {
    let calls = 0;
    mockRoutes({
      progressFor: (url) => {
        if (isFunnelUrl(url)) return jsonResponse(200, COHORT);
        calls += 1;
        return calls === 1 ? jsonResponse(200, COHORT) : jsonResponse(500, {});
      },
    });
    await openWatchtower();
    await click(screen.getByText(STAFF_COPY.watchtowerRefresh));
    expect(screen.getByText(STAFF_COPY.watchtowerRefreshFailed)).toBeTruthy();
    expect(screen.getByTestId("fp-watchtower-table")).toBeTruthy();
    expect(cellText("1.1.1")[1]).toBe("6");
    // And the button is usable again — a spinner that cannot stop also disables
    // the only control that could clear it.
    const button = screen.getByText(STAFF_COPY.watchtowerRefresh) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("a refresh abandoned by a criterion change never leaves the button spinning", async () => {
    const gate: Array<() => void> = [];
    mockRoutes({
      progressFor: () =>
        new Promise<Response>((resolve) => {
          gate.push(() => resolve(jsonResponse(500, {})));
        }),
    });
    render(<StaffShell />);
    await click(screen.getByRole("button", { name: STAFF_COPY.watchtowerTitle }));
    // First load in flight; let it land so there is a table to refresh.
    await act(async () => {
      gate.shift()?.();
    });
    mockRoutes();
    await click(screen.getByText(STAFF_COPY.watchtowerRefresh));
    await click(screen.getByRole("button", { name: /Step 1\.2/ }));
    const button = screen.getByText(STAFF_COPY.watchtowerRefresh) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.queryByText(STAFF_COPY.watchtowerRefreshing)).toBeNull();
  });

  it("a malformed body is a load error, never a thrown render", async () => {
    serve({ children: "nope" });
    await openWatchtower();
    expect(screen.getByText(STAFF_COPY.watchtowerLoadFailed)).toBeTruthy();
  });

  it("names the panel with its h2 in EVERY view-state", async () => {
    mockRoutes({ progressFor: () => jsonResponse(500, {}) });
    await openWatchtower();
    expect(screen.getByRole("heading", { name: STAFF_COPY.watchtowerTitle, level: 2 })).toBeTruthy();
  });
});

describe("StaffWatchtower — the shell seam", () => {
  it("fires ONE request under StrictMode's double-invoked effect", async () => {
    const request = vi.fn(
      async (_path: string): Promise<StaffApiResult> => ({ kind: "json", data: COHORT }),
    );
    await act(async () => {
      render(
        <StrictMode>
          <StaffWatchtower
            request={request}
            cache={stubCache()}
            criterionId="1.1"
            onCriterionChange={() => {}}
          />
        </StrictMode>,
      );
    });
    // TWO requests, one each: the board's and the funnel's — never four.
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.filter(([path]) => isFunnelUrl(path))).toHaveLength(1);
    expect(screen.getByTestId("fp-watchtower-table")).toBeTruthy();
  });

  it("refuses to render an entry that does not BELONG to the selected criterion", async () => {
    // The structural pin for the stale-frame bug. A behavioural test cannot see
    // it — `act()` flushes the replacing fetch before any assertion — so the
    // identity is asserted directly: an entry sitting under 1.2's cache key
    // while CLAIMING to be 1.1's must not be drawn under 1.2's heading. Only a
    // render that checks `criterionId` ON THE VALUE can refuse this.
    const cache = stubCache();
    const fetchedAt = Date.now();
    cache.store.set(watchtowerCacheKey("1.2"), {
      criterionId: "1.1",
      cohort: normalizeCohort(COHORT as never, fetchedAt),
      fetchedAt,
      rejectedChildren: 0,
      rejectedIdeas: 0,
      rejectedBusinesses: 0,
    });
    // The request never settles, so anything rendered came from that entry.
    const request = vi.fn((_path: string) => new Promise<StaffApiResult>(() => {}));
    await act(async () => {
      render(
        <StaffWatchtower
          request={request}
          cache={cache}
          criterionId="1.2"
          onCriterionChange={() => {}}
        />,
      );
    });
    expect(screen.queryByTestId("fp-watchtower-table")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(STAFF_COPY.watchtowerLoading);
  });

  it("does NOT render a payload whose cache write was refused (R12)", async () => {
    const cache = stubCache({ write: () => false });
    const request = vi.fn(
      async (_path: string): Promise<StaffApiResult> => ({ kind: "json", data: COHORT }),
    );
    await act(async () => {
      render(
        <StaffWatchtower
          request={request}
          cache={cache}
          criterionId="1.1"
          onCriterionChange={() => {}}
        />,
      );
    });
    expect(screen.queryByTestId("fp-watchtower-table")).toBeNull();
    // The refused payload carries usernames; none of them may land.
    expect(document.body.textContent).not.toContain("ada.b");
    expect(screen.getByRole("status").textContent).toBe(STAFF_COPY.watchtowerLoading);
    // The request is OVER even though nothing was rendered: a `pending` left set
    // on this branch disables Refresh — the only control that could recover.
    expect((screen.getByText(STAFF_COPY.watchtowerRefresh) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("stops silently on `unauthorized` — the shell owns that verdict", async () => {
    const request = vi.fn(
      async (_path: string): Promise<StaffApiResult> => ({ kind: "unauthorized" }),
    );
    await act(async () => {
      render(
        <StaffWatchtower
          request={request}
          cache={stubCache()}
          criterionId="1.1"
          onCriterionChange={() => {}}
        />,
      );
    });
    // No error of its own: the shell has already moved to sign-in or refusal.
    expect(screen.queryByText(STAFF_COPY.watchtowerLoadFailed)).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
    // Terminal for this request, so the spinner stops even though the tab shows
    // nothing new.
    expect((screen.getByText(STAFF_COPY.watchtowerRefresh) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("Refresh CLEARS this criterion's cache entry before refetching", async () => {
    const cache = stubCache();
    const cleared: string[] = [];
    const observed: StaffCache = {
      ...cache,
      clear: (key: string) => {
        cleared.push(key);
        cache.clear(key);
      },
    };
    const request = vi.fn(
      async (_path: string): Promise<StaffApiResult> => ({ kind: "json", data: COHORT }),
    );
    await act(async () => {
      render(
        <StaffWatchtower
          request={request}
          cache={observed}
          criterionId="1.1"
          onCriterionChange={() => {}}
        />,
      );
    });
    await click(screen.getByText(STAFF_COPY.watchtowerRefresh));
    // Refresh means "re-read the cohort": this criterion AND the funnel.
    expect(cleared).toEqual([watchtowerCacheKey("1.1"), WATCHTOWER_FUNNEL_CACHE_KEY]);
    expect(request).toHaveBeenCalledTimes(4); // 2 first-load + 2 refresh
  });

  it("falls back to the phase's first criterion rather than passing an unknown id to criterionWindow", async () => {
    const request = vi.fn(
      async (_path: string): Promise<StaffApiResult> => ({ kind: "json", data: COHORT }),
    );
    await act(async () => {
      render(
        <StaffWatchtower
          request={request}
          cache={stubCache()}
          criterionId="9.9"
          onCriterionChange={() => {}}
        />,
      );
    });
    // No throw, and the board fell back to 1.1 — the first criterion of Phase 1.
    expect(screen.getByTestId("fp-watchtower-table")).toBeTruthy();
    expect(String(request.mock.calls[0][0])).toContain("1.1.1");
    expect(screen.getByRole("button", { name: /Step 1\.1/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});

describe("StaffWatchtower — semantics and chrome", () => {
  beforeEach(() => mockRoutes());

  it("is a real table: scoped column headers and a row header per task", async () => {
    // No caption since Change #1 — `fp-watchtower-step-title` names the step
    // instead, in every view-state (see the test below).
    await openWatchtower();
    const table = screen.getByTestId("fp-watchtower-table");
    expect(table.querySelector("caption")).toBeNull();
    expect(table.querySelectorAll('thead th[scope="col"]')).toHaveLength(5);
    expect(table.querySelectorAll('tbody th[scope="row"]')).toHaveLength(5);
  });

  it("names the selected step OUTSIDE the table, so every view-state carries it", async () => {
    await openWatchtower();
    const title = screen.getByTestId("fp-watchtower-step-title").textContent ?? "";
    expect(title).toContain("1.1");
    expect(title).toContain("Pitch a product in 60 seconds, no notes");
  });

  it("uses the shell's aria-pressed idiom for both selectors, never aria-current", async () => {
    await openWatchtower();
    const sell = screen.getByRole("button", { name: "Sell" });
    expect(sell.getAttribute("aria-pressed")).toBe("true");
    expect(sell.getAttribute("aria-current")).toBeNull();
    const criterion = screen.getByRole("button", { name: /Step 1\.2/ });
    expect(criterion.getAttribute("aria-pressed")).toBe("false");
    expect(criterion.getAttribute("aria-current")).toBeNull();
  });

  it("pins the 44px-target CONVENTION on every control (class contract, not layout)", async () => {
    // jsdom has no layout, so this asserts the utility that produces the target;
    // the measured check is the browser gate recorded in the unit's report.
    await openWatchtower();
    const controls = [
      screen.getByRole("button", { name: "Sell" }),
      screen.getByRole("button", { name: /Step 1\.2/ }),
      screen.getByText(STAFF_COPY.watchtowerRefresh),
      screen.getByTestId("fp-watchtower-drill-1.1.3:active"),
    ];
    for (const control of controls) {
      expect(control.className).toContain("min-h-[44px]");
    }
  });

  it("uses ONE focus indicator, the shell's, on filled and unfilled controls alike", async () => {
    await openWatchtower();
    const filled = screen.getByRole("button", { name: "Sell" });
    const unfilled = screen.getByRole("button", { name: /Step 1\.2/ });
    const drillTrigger = screen.getByTestId("fp-watchtower-drill-1.1.3:active");
    await click(drillTrigger);
    const panel = screen.getByTestId("fp-watchtower-roster");
    for (const el of [filled, unfilled, drillTrigger, panel]) {
      expect(el.className).toContain("focus-visible:ring-build/60");
      expect(el.className).not.toContain("focus-visible:ring-build/30");
    }
    // Only a FILLED control gets the offset: on the page background an offset
    // ring reads as a detached halo.
    expect(filled.className).toContain("ring-offset-2");
    expect(unfilled.className).not.toContain("ring-offset-2");
  });

  it("the focus ring's contrast is measured, and its known shortfall is recorded", () => {
    // Mirrors src/data/__tests__/phaseContrast.test.ts: recompute, never trust a
    // remembered number. The ring is `build` at 60% over the staff page's cream.
    const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const hp = h / 60;
      const x = c * (1 - Math.abs((hp % 2) - 1));
      const [r, g, b] =
        hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
        : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
      const m = l - c / 2;
      return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
    };
    const luminance = ([r, g, b]: [number, number, number]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const over = (
      fg: [number, number, number],
      bg: [number, number, number],
      alpha: number,
    ): [number, number, number] => [
      fg[0] * alpha + bg[0] * (1 - alpha),
      fg[1] * alpha + bg[1] * (1 - alpha),
      fg[2] * alpha + bg[2] * (1 - alpha),
    ];
    const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

    const build = hslToRgb(217, 0.74, 0.56); // tailwind `build`
    const page = hslToRgb(38, 0.46, 0.95); // the staff page background
    const pageL = luminance(page);
    const at60 = ratio(luminance(over(build, page, 0.6)), pageL);
    const at30 = ratio(luminance(over(build, page, 0.3)), pageL);

    // /60 is the stronger indicator, which is why the shell's value wins.
    expect(at60).toBeGreaterThan(at30);
    expect(at60).toBeGreaterThan(2.1);
    // RECORDED, not accepted quietly: neither value clears WCAG's 3:1 minimum
    // for a non-text indicator. Raising it is a change to the shell's shared
    // token — when that lands, this bound moves to 3 and the test is the gate.
    expect(at60).toBeLessThan(3);
  });
});
