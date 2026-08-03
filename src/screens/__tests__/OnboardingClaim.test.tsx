// @vitest-environment jsdom
/**
 * Onboarding claim-step wiring (real-public-site plan, Unit 5) — the FLAG-ON
 * container behavior: debounced live availability, claim on the screen-2 CTA,
 * the useRef in-flight guard (double-tap → ONE request), suggestion one-tap
 * claims, the R3 race-retry branch, R23 rendered from SERVER verdicts (the
 * client ships no blocklist), claimed resume pass-through, the session-
 * generation guard on completion, and the completion sequence (CREATE_IDEA →
 * await flushNow() → publish ONLY on "landed" → SET_ONBOARDING_COMPLETE →
 * SET_STAGE app, with completion never blocked on a parked flush or failed
 * publish).
 *
 * Flag-OFF behavior is pinned by src/screens/__tests__/Onboarding.test.tsx,
 * which runs against the same container with the default (off) test env and
 * is deliberately untouched by Unit 5; this file adds the flag-off-with-
 * populated-slice case (the legacy stub has no slice at all).
 *
 * MOBILE GATE NOTE: the 390px visual pass for the claim UI was performed
 * 2026-08-03 via a temporary dev-entry harness (screenshots at 390x844 and
 * 1280x900 in the session scratchpad; harness fully reverted — src/index.tsx
 * diff-clean). The live-preview re-check against a real backend is a Unit 7
 * launch-checklist gate item.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Action } from "../../state/gameCore";

// ── Mocks (flag ON by default; GameApi + availability faked) ────────────────

let publicSiteFlag = true;
vi.mock("../../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config")>();
  return { ...actual, isPublicSiteEnabled: () => publicSiteFlag };
});

const checkHandleAvailability = vi.fn();
vi.mock("../../lib/auth", () => ({
  checkHandleAvailability: (...args: unknown[]) => checkHandleAvailability(...args),
}));

const dispatch = vi.fn();
const claimSite = vi.fn();
const publishSite = vi.fn();
const flushNow = vi.fn();
const refreshSiteStatus = vi.fn();
let obValue = 2;
let sessionGen = 1;
let siteValue: { handle: string | null; status: string } = { handle: null, status: "none" };

vi.mock("../../state/GameContext", () => ({
  useGame: () => ({
    ob: obValue,
    profile: { firstName: "Maya", handle: "", siteHeadline: "", grade: null },
    site: siteValue,
    dispatch,
    claimSite,
    publishSite,
    flushNow,
    refreshSiteStatus,
    getSessionGen: () => sessionGen,
  }),
}));

// Force reduced motion so the typed reveal renders synchronously.
vi.mock("framer-motion", () => ({ useReducedMotion: () => true }));

import { Onboarding } from "../Onboarding";

function renderAt(ob: number) {
  obValue = ob;
  return render(<Onboarding />);
}

/** A promise the test resolves by hand (pins in-flight windows). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Advance fake timers inside act (StuckBox fake-timer precedent). */
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  publicSiteFlag = true;
  sessionGen = 1;
  siteValue = { handle: null, status: "none" };
  // Default: availability answers quietly-unable-to-know (never blocks).
  checkHandleAvailability.mockResolvedValue({ ok: false });
  claimSite.mockResolvedValue({ ok: true, handle: "maya", status: "claimed" });
  flushNow.mockResolvedValue("landed");
  publishSite.mockResolvedValue({
    ok: true,
    status: "published",
    firstPublish: true,
    parentNotified: true,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("screen 2 · live availability (R1)", () => {
  it("shows pending immediately, then the verdict from the debounced check", async () => {
    vi.useFakeTimers();
    checkHandleAvailability.mockResolvedValue({ ok: true, verdict: "available", suggestions: [] });
    renderAt(2);
    // Pending state is explicit and synchronous (the name seeds "maya").
    expect(screen.getByRole("status").textContent).toBe("checking…");
    await tick(400);
    expect(screen.getByRole("status").textContent).toBe("available");
    expect(checkHandleAvailability).toHaveBeenCalledWith("maya");
  });

  it("debounces edits: only the settled handle is checked once", async () => {
    vi.useFakeTimers();
    checkHandleAvailability.mockResolvedValue({ ok: true, verdict: "available", suggestions: [] });
    renderAt(2);
    const input = screen.getByLabelText("Page name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "may" } });
    fireEvent.change(input, { target: { value: "Maya-Shop!" } });
    // Normalized display (R15): lowercased, invalid characters dropped.
    expect(input.value).toBe("maya-shop");
    await tick(400);
    expect(checkHandleAvailability).toHaveBeenCalledTimes(1);
    expect(checkHandleAvailability).toHaveBeenCalledWith("maya-shop");
  });

  it("a failed check clears the badge and never blocks typing", async () => {
    vi.useFakeTimers();
    checkHandleAvailability.mockResolvedValue({ ok: false });
    renderAt(2);
    await tick(400);
    expect(screen.getByRole("status").textContent).toBe("");
    const input = screen.getByLabelText("Page name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "mayac" } });
    expect(input.value).toBe("mayac");
  });

  it("a too-short handle shows the local keep-typing state without a network call", () => {
    renderAt(2);
    fireEvent.change(screen.getByLabelText("Page name"), { target: { value: "ma" } });
    expect(screen.getByRole("status").textContent).toBe("keep typing");
  });

  it("a blocklisted/reserved handle shows the server's invalid verdict as-you-type (R23)", async () => {
    vi.useFakeTimers();
    checkHandleAvailability.mockResolvedValue({ ok: true, verdict: "invalid", suggestions: [] });
    renderAt(2);
    await tick(400);
    expect(screen.getByRole("status").textContent).toBe("can't use that one");
  });

  it("out-of-order responses: the newer check wins, the stale one is dropped (seq guard)", async () => {
    vi.useFakeTimers();
    const d1 = deferred<{ ok: true; verdict: string; suggestions: string[] }>();
    const d2 = deferred<{ ok: true; verdict: string; suggestions: string[] }>();
    checkHandleAvailability.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    renderAt(2); // "maya" → check #1 (stale-to-be)
    await tick(400);
    fireEvent.change(screen.getByLabelText("Page name"), { target: { value: "maya-shop" } });
    await tick(400); // check #2 (newer)
    expect(checkHandleAvailability).toHaveBeenCalledTimes(2);
    // The NEWER response resolves first and wins…
    await act(async () => {
      d2.resolve({ ok: true, verdict: "available", suggestions: [] });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("status").textContent).toBe("available");
    // …then the STALE first response arrives late and must be dropped.
    await act(async () => {
      d1.resolve({ ok: true, verdict: "taken", suggestions: ["sniped"] });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("status").textContent).toBe("available");
    expect(screen.queryByText("sniped")).toBeNull();
  });
});

describe("screen 2 · claim on the CTA (R2/R3/R23)", () => {
  it("happy path: claim succeeds and advances to screen 3", async () => {
    renderAt(2);
    fireEvent.click(screen.getByText("Claim my page →"));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "SET_OB", ob: 3 }));
    expect(claimSite).toHaveBeenCalledTimes(1);
    expect(claimSite).toHaveBeenCalledWith("maya");
  });

  it("double-tap fires ONE claim request (useRef in-flight guard)", async () => {
    const gate = deferred<{ ok: true; handle: string; status: string }>();
    claimSite.mockReturnValue(gate.promise);
    renderAt(2);
    const cta = screen.getByText("Claim my page →");
    fireEvent.click(cta);
    fireEvent.click(cta);
    fireEvent.click(cta);
    expect(claimSite).toHaveBeenCalledTimes(1);
    await act(async () => {
      gate.resolve({ ok: true, handle: "maya", status: "claimed" });
      await gate.promise;
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_OB", ob: 3 });
    expect(dispatch.mock.calls.filter((c) => (c[0] as Action).type === "SET_OB")).toHaveLength(1);
  });

  it("race: taken after an available badge → inline explanation + refreshed suggestions", async () => {
    vi.useFakeTimers();
    checkHandleAvailability.mockResolvedValue({ ok: true, verdict: "available", suggestions: [] });
    claimSite.mockResolvedValue({ ok: false, reason: "taken", suggestions: ["maya-c", "mayaco"] });
    renderAt(2);
    await tick(400);
    expect(screen.getByRole("status").textContent).toBe("available");
    fireEvent.click(screen.getByText("Claim my page →"));
    await tick(0); // flush the claim's microtasks
    expect(
      screen.getByText(
        "Oh no, someone just grabbed that name. Pick one that's still free, or type a new one.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("taken");
    expect(screen.getByText("maya-c")).toBeTruthy();
    expect(screen.getByText("mayaco")).toBeTruthy();
    // No advance happened.
    expect(dispatch).not.toHaveBeenCalledWith({ type: "SET_OB", ob: 3 });
  });

  it("one-tap suggestion pick claims that suggestion", async () => {
    claimSite
      .mockResolvedValueOnce({ ok: false, reason: "taken", suggestions: ["maya-c"] })
      .mockResolvedValueOnce({ ok: true, handle: "maya-c", status: "claimed" });
    renderAt(2);
    fireEvent.click(screen.getByText("Claim my page →"));
    await waitFor(() => expect(screen.getByText("maya-c")).toBeTruthy());
    fireEvent.click(screen.getByText("maya-c"));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "SET_OB", ob: 3 }));
    expect(claimSite).toHaveBeenLastCalledWith("maya-c");
  });

  it("all suggestions sniped: manual entry still claims (no dead end)", async () => {
    claimSite
      .mockResolvedValueOnce({ ok: false, reason: "taken", suggestions: [] })
      .mockResolvedValueOnce({ ok: true, handle: "maya-lemonade", status: "claimed" });
    renderAt(2);
    fireEvent.click(screen.getByText("Claim my page →"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("taken"));
    const input = screen.getByLabelText("Page name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "maya-lemonade" } });
    fireEvent.click(screen.getByText("Claim my page →"));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "SET_OB", ob: 3 }));
    expect(claimSite).toHaveBeenLastCalledWith("maya-lemonade");
  });

  it("server 'invalid' claim refusal renders the kid-friendly message (R23 is server-side)", async () => {
    claimSite.mockResolvedValue({ ok: false, reason: "invalid" });
    renderAt(2);
    fireEvent.click(screen.getByText("Claim my page →"));
    expect(
      await screen.findByText("That name can't be used for your page. Try a different one."),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("can't use that one");
    expect(dispatch).not.toHaveBeenCalledWith({ type: "SET_OB", ob: 3 });
    expect(claimSite).toHaveBeenCalledTimes(1);
  });

  it("outage: inline retry copy, learner stays on screen 2, CTA re-armed", async () => {
    claimSite
      .mockResolvedValueOnce({ ok: false, reason: "outage" })
      .mockResolvedValueOnce({ ok: true, handle: "maya", status: "claimed" });
    renderAt(2);
    fireEvent.click(screen.getByText("Claim my page →"));
    await waitFor(() =>
      expect(
        screen.getByText("We couldn't claim your page right now. Give it a moment and tap again."),
      ).toBeTruthy(),
    );
    expect(dispatch).not.toHaveBeenCalledWith({ type: "SET_OB", ob: 3 });
    fireEvent.click(screen.getByText("Claim my page →"));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "SET_OB", ob: 3 }));
    expect(claimSite).toHaveBeenCalledTimes(2);
  });

  it("already-claimed refusal adopts via the read-back and advances (never a second claim)", async () => {
    claimSite.mockResolvedValue({ ok: false, reason: "already-claimed", handle: "maya" });
    renderAt(2);
    fireEvent.click(screen.getByText("Claim my page →"));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "SET_OB", ob: 3 }));
    expect(refreshSiteStatus).toHaveBeenCalledTimes(1);
    expect(claimSite).toHaveBeenCalledTimes(1);
  });
});

describe("screen 2 · claimed resume pass-through", () => {
  it("renders the claimed state and advances without re-claiming or re-checking", async () => {
    vi.useFakeTimers();
    siteValue = { handle: "maya", status: "claimed" };
    renderAt(2);
    expect(screen.queryByLabelText("Page name")).toBeNull();
    expect(screen.getByText("maya")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("yours");
    fireEvent.click(screen.getByText("Keep going →"));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_OB", ob: 3 });
    // Reload-after-claim never re-claims and never spins an availability check.
    await tick(500);
    expect(claimSite).not.toHaveBeenCalled();
    expect(checkHandleAvailability).not.toHaveBeenCalled();
  });
});

describe("flag off with a POPULATED site slice", () => {
  it("no claim UI, no network, original CTA behavior (complements Onboarding.test's sliceless stub)", async () => {
    vi.useFakeTimers();
    publicSiteFlag = false;
    siteValue = { handle: "maya", status: "published" };
    renderAt(2);
    expect(screen.queryByLabelText("Page name")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("available")).toBeTruthy(); // the legacy static badge
    await tick(500);
    expect(checkHandleAvailability).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Claim my page →"));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_OB", ob: 3 });
    expect(claimSite).not.toHaveBeenCalled();
  });
});

describe("claim intent is container-owned (survives screen unmount/remount)", () => {
  // NOTE: Onboarding itself has no viewport-conditional mounts (that pattern
  // lives in Factory's lg breakpoint swap); holding claim state in the
  // container is the DEFENSIVE application of the breakpoint-crossing
  // learning. This test proves the property that actually matters: the screen
  // component can unmount and remount entirely mid-claim without dropping the
  // in-flight intent — one request, one advance.
  it("an in-flight claim survives FounderProfile unmounting and resolves once", async () => {
    const gate = deferred<{ ok: true; handle: string; status: string }>();
    claimSite.mockReturnValue(gate.promise);
    const view = renderAt(2);
    fireEvent.click(screen.getByText("Claim my page →"));
    expect(screen.getByText("Claiming…")).toBeTruthy();
    // Swap the screen out (FounderProfile unmounts)…
    obValue = 4;
    view.rerender(<Onboarding />);
    expect(screen.queryByText("Claiming…")).toBeNull();
    // …and back: the in-flight claim state is intact (container-owned).
    obValue = 2;
    view.rerender(<Onboarding />);
    expect(screen.getByText("Claiming…")).toBeTruthy();
    await act(async () => {
      gate.resolve({ ok: true, handle: "maya", status: "claimed" });
      await gate.promise;
    });
    expect(claimSite).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls.filter((c) => (c[0] as Action).type === "SET_OB")).toHaveLength(1);
  });
});

describe("screen 3 · reveal honesty (R19/R20)", () => {
  it("not yet published: going-live framing, no share encouragement", () => {
    siteValue = { handle: "maya", status: "claimed" };
    renderAt(3);
    expect(screen.getByText("going live…")).toBeTruthy();
    expect(screen.getByText("firstprofit.school/maya")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Anyone you send that link to");
  });

  it("published: live chip and the share line", () => {
    siteValue = { handle: "maya", status: "published" };
    renderAt(3);
    expect(screen.getByText("● live")).toBeTruthy();
    expect(screen.getByText("It's real. Anyone you send that link to can see your page.")).toBeTruthy();
  });
});

describe("screen 5 · completion publish sequencing", () => {
  function completionDispatchOrder(type: Action["type"]): number {
    const index = dispatch.mock.calls.findIndex((c) => (c[0] as Action).type === type);
    expect(index).toBeGreaterThanOrEqual(0);
    return dispatch.mock.invocationCallOrder[index];
  }

  it("landed flush → publish → completion, in that exact order", async () => {
    siteValue = { handle: "maya", status: "claimed" };
    renderAt(5);
    fireEvent.click(screen.getByText("Start Unit Task #1 →"));
    // CREATE_IDEA is synchronous; completion arrives after flush+publish.
    expect(dispatch).toHaveBeenCalledWith({ type: "CREATE_IDEA", ideaId: expect.any(String) });
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "SET_STAGE", stage: "app" }));
    expect(flushNow).toHaveBeenCalledTimes(1);
    expect(publishSite).toHaveBeenCalledTimes(1);
    const createOrder = completionDispatchOrder("CREATE_IDEA");
    const flushOrder = flushNow.mock.invocationCallOrder[0];
    const publishOrder = publishSite.mock.invocationCallOrder[0];
    const completeOrder = completionDispatchOrder("SET_ONBOARDING_COMPLETE");
    const stageOrder = completionDispatchOrder("SET_STAGE");
    expect(createOrder).toBeLessThan(flushOrder);
    expect(flushOrder).toBeLessThan(publishOrder);
    expect(publishOrder).toBeLessThan(completeOrder);
    expect(completeOrder).toBeLessThan(stageOrder);
  });

  it.each(["parked", "cas-rescheduled"] as const)(
    "%s flush: publish is NOT called, completion still lands",
    async (outcome) => {
      siteValue = { handle: "maya", status: "claimed" };
      flushNow.mockResolvedValue(outcome);
      renderAt(5);
      fireEvent.click(screen.getByText("Start Unit Task #1 →"));
      await waitFor(() =>
        expect(dispatch).toHaveBeenCalledWith({ type: "SET_STAGE", stage: "app" }),
      );
      expect(dispatch).toHaveBeenCalledWith({ type: "SET_ONBOARDING_COMPLETE" });
      expect(publishSite).not.toHaveBeenCalled();
    },
  );

  it("failed publish never blocks completion", async () => {
    siteValue = { handle: "maya", status: "claimed" };
    publishSite.mockResolvedValue({ ok: false, reason: "outage" });
    renderAt(5);
    fireEvent.click(screen.getByText("Start Unit Task #1 →"));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "SET_STAGE", stage: "app" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_ONBOARDING_COMPLETE" });
    expect(publishSite).toHaveBeenCalledTimes(1);
  });

  it("parked completion → reveal shows 'going live…' with no share encouragement (R19 end-to-end)", async () => {
    siteValue = { handle: "maya", status: "claimed" };
    flushNow.mockResolvedValue("parked");
    const view = renderAt(5);
    fireEvent.click(screen.getByText("Start Unit Task #1 →"));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "SET_STAGE", stage: "app" }));
    expect(publishSite).not.toHaveBeenCalled();
    // The slice stays non-published, so any reveal-surface render is the
    // honest not-live state (the floor/room equivalents are Unit 6).
    obValue = 3;
    view.rerender(<Onboarding />);
    expect(screen.getByText("going live…")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Anyone you send that link to");
  });

  it("logout mid-completion: NO dispatches over the wiped session (generation guard)", async () => {
    siteValue = { handle: "maya", status: "claimed" };
    const gate = deferred<"landed">();
    flushNow.mockReturnValue(gate.promise);
    renderAt(5);
    fireEvent.click(screen.getByText("Start Unit Task #1 →"));
    expect(dispatch).toHaveBeenCalledWith({ type: "CREATE_IDEA", ideaId: expect.any(String) });
    // A logout (explicit or idle) lands while the flush is in flight: the
    // provider bumps the session generation.
    sessionGen += 1;
    await act(async () => {
      gate.resolve("landed");
      await gate.promise;
      // Drain the trailing publish/finally microtasks.
      await new Promise((r) => setTimeout(r, 20));
    });
    // Completion must NOT resurrect the app stage over the wiped session.
    expect(dispatch).not.toHaveBeenCalledWith({ type: "SET_ONBOARDING_COMPLETE" });
    expect(dispatch.mock.calls.some((c) => (c[0] as Action).type === "SET_STAGE")).toBe(false);
  });

  it("no handle claimed (edge): completion is the original synchronous sequence, no flush/publish", () => {
    siteValue = { handle: null, status: "none" };
    renderAt(5);
    fireEvent.click(screen.getByText("Start Unit Task #1 →"));
    expect(dispatch.mock.calls.map((c) => (c[0] as Action).type)).toEqual([
      "CREATE_IDEA",
      "SET_ONBOARDING_COMPLETE",
      "SET_STAGE",
    ]);
    expect(flushNow).not.toHaveBeenCalled();
    expect(publishSite).not.toHaveBeenCalled();
  });
});
