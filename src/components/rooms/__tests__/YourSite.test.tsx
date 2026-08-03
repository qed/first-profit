// @vitest-environment jsdom
/**
 * Your Site room (real-public-site plan, Unit 6) — the three real URL-bar
 * states (published link / offline disabled / unclaimed claim UI), the honest
 * neutral render on a failed status read, headline cap + commit→flush, the
 * room-open registry refresh, the claimed-not-published go-live retry (and its
 * hard boundary: NEVER for offline), the in-room claim → publish flow, and the
 * flag-off byte-stability of the legacy mock room.
 *
 * Harness: GameContext is mocked as a plain context; a stateful Harness stands
 * in for the provider, mimicking exactly the slice adoptions GameContext
 * performs (claim success → status "claimed"; publish success → "published")
 * so the room is exercised against realistic slice transitions.
 *
 * MOBILE GATE (CLAUDE.md ~390px): the room renders inside RoomDialog's
 * full-screen-below-sm overlay (unchanged by this unit); the structure
 * assertions below pin the >=44px tap targets on the claim chips and visit
 * affordances. The live 390px pixel pass against a real backend is a Unit 7
 * launch-checklist item (same posture as Unit 5's claim UI).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SiteState } from "../../../state/gameCore";

// ── Mocks ────────────────────────────────────────────────────────────────────

let publicSiteFlag = true;
vi.mock("../../../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../config")>();
  return { ...actual, isPublicSiteEnabled: () => publicSiteFlag };
});

const checkHandleAvailability = vi.fn();
vi.mock("../../../lib/auth", () => ({
  checkHandleAvailability: (...args: unknown[]) => checkHandleAvailability(...args),
}));

vi.mock("../../../state/GameContext", async () => {
  const R = await import("react");
  const Ctx = R.createContext<unknown>(null);
  return { __ctx: Ctx, useGame: () => R.useContext(Ctx) };
});

import * as GameContext from "../../../state/GameContext";
import { YourSite } from "../YourSite";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

const dispatchSpy = vi.fn();
const refreshSiteStatus = vi.fn();
const flushNow = vi.fn();
const publishSite = vi.fn();
const claimSite = vi.fn();

/** Seed shape: `projected` optional (defaults null) so the many pre-Unit-7
 *  literals stay untouched; the divergence tests pass it explicitly. */
type SiteSeed = Omit<SiteState, "projected"> & { projected?: SiteState["projected"] };
const withProjected = (s: SiteSeed): SiteState => ({ projected: null, ...s });

/** The harness's live slice setter (mimics GameContext SET_SITE adoption). */
let setSite: (s: SiteSeed) => void = () => {
  throw new Error("harness not mounted");
};

/** Drain pending microtasks (mock resolutions) inside act. */
async function drain() {
  await act(async () => {
    await Promise.resolve();
  });
}

function Harness({
  initialSite,
  headline = "",
}: {
  initialSite: SiteSeed;
  headline?: string;
}) {
  const [site, setSiteState] = React.useState(withProjected(initialSite));
  const [siteHeadline, setHeadline] = React.useState(headline);
  setSite = (s) => setSiteState(withProjected(s));
  const value = {
    profile: { firstName: "Maya", handle: "", siteHeadline, grade: null },
    ideas: [] as unknown[],
    activeIdea: 0,
    site,
    dispatch: (a: { type: string; patch?: { siteHeadline?: string } }) => {
      dispatchSpy(a);
      if (a.type === "SET_PROFILE" && a.patch?.siteHeadline !== undefined) {
        setHeadline(a.patch.siteHeadline);
      }
    },
    refreshSiteStatus,
    flushNow,
    publishSite,
    claimSite,
    getSessionGen: () => 1,
  };
  return (
    <Ctx.Provider value={value}>
      <YourSite />
    </Ctx.Provider>
  );
}

function mount(initialSite: SiteSeed, headline = "") {
  return render(<Harness initialSite={initialSite} headline={headline} />);
}

function headlineInput(): HTMLInputElement {
  return screen.getByLabelText("Your headline") as HTMLInputElement;
}

/** All anchors pointing at a public site URL. */
function siteLinks(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll("a")).filter((a) =>
    (a.getAttribute("href") ?? "").startsWith("https://firstprofit.school/"),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  publicSiteFlag = true;
  checkHandleAvailability.mockResolvedValue({ ok: false });
  flushNow.mockResolvedValue("landed");
  // Mimic GameContext: publish success adopts status "published".
  publishSite.mockImplementation(async () => {
    act(() => setSite({ handle: "maya", status: "published" }));
    return { ok: true, status: "published", firstPublish: true, parentNotified: true };
  });
  // Mimic GameContext: claim success adopts the canonical handle + "claimed".
  claimSite.mockImplementation(async (handle: string) => {
    act(() => setSite({ handle, status: "claimed" }));
    return { ok: true, handle, status: "claimed" };
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ── Published ────────────────────────────────────────────────────────────────

describe("published", () => {
  it("the URL bar is a real link with target=_blank and rel noopener noreferrer", () => {
    mount({ handle: "maya", status: "published" });
    const links = siteLinks();
    expect(links.length).toBeGreaterThanOrEqual(1);
    for (const a of links) {
      expect(a.getAttribute("href")).toBe("https://firstprofit.school/maya");
      expect(a.getAttribute("target")).toBe("_blank");
      const rel = a.getAttribute("rel") ?? "";
      expect(rel).toContain("noopener");
      expect(rel).toContain("noreferrer");
    }
    expect(screen.getByText("● live")).toBeTruthy();
    // The visit affordance keeps the >=44px tap target (mobile gate).
    expect(screen.getByText("Visit your site ↗").className).toContain("min-h-[44px]");
  });

  it("does not run the go-live retry (nothing to publish)", async () => {
    mount({ handle: "maya", status: "published" });
    await drain();
    expect(publishSite).not.toHaveBeenCalled();
  });
});

// ── Offline (parent-unpublished OR operator-locked, undistinguished) ─────────

describe("offline", () => {
  it("plain-text URL, disabled visit affordance with a visible reason, never 'live'", () => {
    mount({ handle: "maya", status: "offline" });
    expect(siteLinks()).toHaveLength(0);
    expect(screen.getByText("firstprofit.school/maya")).toBeTruthy();
    expect(screen.getByText("offline")).toBeTruthy();
    expect(screen.queryByText("● live")).toBeNull();
    // The reason is VISIBLE (not a warn-on-click) and the affordance disabled.
    const visit = screen.getByText("Visit your site ↗");
    expect(visit.getAttribute("aria-disabled")).toBe("true");
    expect(
      screen.getByText(
        "Your page is offline right now. A grown-up turned it off, and a grown-up can turn it back on. Your edits still save for when it comes back.",
      ),
    ).toBeTruthy();
  });

  it("editing still saves (SET_PROFILE + commit flush) while offline", () => {
    mount({ handle: "maya", status: "offline" });
    fireEvent.change(headlineInput(), { target: { value: "Maya's slime lab" } });
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: "SET_PROFILE",
      patch: { siteHeadline: "Maya's slime lab" },
    });
    fireEvent.blur(headlineInput());
    expect(flushNow).toHaveBeenCalledTimes(1);
  });

  it("NEVER auto-retries publish for offline (a parent takedown is not auto-reversed)", async () => {
    mount({ handle: "maya", status: "offline" });
    await drain();
    expect(publishSite).not.toHaveBeenCalled();
    expect(flushNow).not.toHaveBeenCalled();
  });
});

// ── Claimed but not yet published (R19 parked state) ─────────────────────────

describe("claimed (not yet published)", () => {
  it("retries flush→publish on room open and flips live on success", async () => {
    mount({ handle: "maya", status: "claimed" });
    await waitFor(() => expect(publishSite).toHaveBeenCalledTimes(1));
    expect(flushNow).toHaveBeenCalledTimes(1);
    // Publish only AFTER the flush landed.
    expect(flushNow.mock.invocationCallOrder[0]).toBeLessThan(
      publishSite.mock.invocationCallOrder[0],
    );
    // The mimicked slice adoption flips the room to the live state.
    await waitFor(() => expect(screen.getByText("● live")).toBeTruthy());
    expect(siteLinks().length).toBeGreaterThanOrEqual(1);
  });

  it("a parked flush does NOT publish and keeps the honest going-live state", async () => {
    flushNow.mockResolvedValue("parked");
    mount({ handle: "maya", status: "claimed" });
    await drain();
    expect(flushNow).toHaveBeenCalledTimes(1);
    expect(publishSite).not.toHaveBeenCalled();
    expect(screen.getByText("going live…")).toBeTruthy();
    expect(screen.queryByText("● live")).toBeNull();
    expect(siteLinks()).toHaveLength(0);
    // The visit affordance is disabled with the visible reason.
    expect(screen.getByText("Visit your site ↗").getAttribute("aria-disabled")).toBe("true");
  });

  it("retries at most once per room open (no publish-failure loop)", async () => {
    publishSite.mockResolvedValue({ ok: false, reason: "outage" });
    mount({ handle: "maya", status: "claimed" });
    await drain();
    expect(publishSite).toHaveBeenCalledTimes(1);
  });
});

// ── Unclaimed (in-room claim for existing accounts) ──────────────────────────

describe("unclaimed", () => {
  it("shows the placeholder bar + claim UI: no fake URL, no dead link, no 'live'", () => {
    mount({ handle: null, status: "none" });
    expect(screen.getByText("firstprofit.school/ …")).toBeTruthy();
    expect(document.body.textContent).not.toContain("school/you");
    expect(siteLinks()).toHaveLength(0);
    expect(screen.queryByText("● live")).toBeNull();
    expect(screen.getByText("Claim your page name")).toBeTruthy();
    expect(screen.getByText("Claim my page →")).toBeTruthy();
    // The claim input is the shared onboarding block (keyboard-focusable).
    const input = screen.getByLabelText("Page name") as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it("live availability runs through the shared block (badge from the server verdict)", async () => {
    vi.useFakeTimers();
    checkHandleAvailability.mockResolvedValue({ ok: true, verdict: "available", suggestions: [] });
    mount({ handle: null, status: "none" });
    expect(screen.getByRole("status").textContent).toBe("checking…");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(screen.getByRole("status").textContent).toBe("available");
    expect(checkHandleAvailability).toHaveBeenCalledWith("maya");
  });

  it("successful in-room claim → immediate flush→publish → room flips live (claim IS go-live)", async () => {
    mount({ handle: null, status: "none" });
    fireEvent.click(screen.getByText("Claim my page →"));
    await waitFor(() => expect(claimSite).toHaveBeenCalledWith("maya"));
    await waitFor(() => expect(publishSite).toHaveBeenCalledTimes(1));
    // Order: claim, then flush, then publish (the go-live sequencing).
    expect(claimSite.mock.invocationCallOrder[0]).toBeLessThan(flushNow.mock.invocationCallOrder[0]);
    expect(flushNow.mock.invocationCallOrder[0]).toBeLessThan(
      publishSite.mock.invocationCallOrder[0],
    );
    // The room now renders the live link and the claim UI is gone.
    await waitFor(() => expect(screen.getByText("● live")).toBeTruthy());
    expect(siteLinks().length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Claim my page →")).toBeNull();
  });

  it("a taken claim shows the race notice + suggestion chips with >=44px targets", async () => {
    claimSite.mockResolvedValue({ ok: false, reason: "taken", suggestions: ["maya-c", "mayaco"] });
    mount({ handle: null, status: "none" });
    fireEvent.click(screen.getByText("Claim my page →"));
    await waitFor(() =>
      expect(
        screen.getByText(
          "Oh no, someone just grabbed that name. Pick one that's still free, or type a new one.",
        ),
      ).toBeTruthy(),
    );
    const chip = screen.getByText("maya-c").closest("button");
    if (!chip) throw new Error("suggestion chip not found");
    expect(chip.className).toContain("min-h-[44px]");
    expect(publishSite).not.toHaveBeenCalled();
  });

  it("one-tap suggestion pick claims that suggestion", async () => {
    claimSite
      .mockResolvedValueOnce({ ok: false, reason: "taken", suggestions: ["maya-c"] })
      .mockImplementationOnce(async (handle: string) => {
        act(() => setSite({ handle, status: "claimed" }));
        return { ok: true, handle, status: "claimed" };
      });
    mount({ handle: null, status: "none" });
    fireEvent.click(screen.getByText("Claim my page →"));
    await waitFor(() => expect(screen.getByText("maya-c")).toBeTruthy());
    fireEvent.click(screen.getByText("maya-c"));
    await waitFor(() => expect(claimSite).toHaveBeenLastCalledWith("maya-c"));
  });

  it("double-tap on the claim CTA fires ONE request (in-flight ref guard)", async () => {
    let resolveClaim!: (v: unknown) => void;
    claimSite.mockReturnValue(new Promise((r) => (resolveClaim = r)));
    mount({ handle: null, status: "none" });
    const cta = screen.getByText("Claim my page →");
    fireEvent.click(cta);
    fireEvent.click(cta);
    expect(claimSite).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveClaim({ ok: false, reason: "outage" });
    });
  });
});

// ── Status fetch failure → neutral (never a false "live") ────────────────────

describe("unknown (failed status read)", () => {
  it("renders neutrally: no link, no 'live', no claim UI, editing still saves", () => {
    mount({ handle: null, status: "unknown" });
    expect(siteLinks()).toHaveLength(0);
    expect(screen.queryByText("● live")).toBeNull();
    expect(screen.queryByText("Claim my page →")).toBeNull();
    expect(
      screen.getByText("We can't check on your page right now, so no link yet. Your edits still save."),
    ).toBeTruthy();
    fireEvent.change(headlineInput(), { target: { value: "Still editing" } });
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: "SET_PROFILE",
      patch: { siteHeadline: "Still editing" },
    });
  });
});

// ── Shared room behavior (flag on) ───────────────────────────────────────────

describe("room open + headline editor", () => {
  it("room open refreshes the site status (bounded staleness for parent unpublish)", () => {
    mount({ handle: "maya", status: "published" });
    expect(refreshSiteStatus).toHaveBeenCalledTimes(1);
  });

  it("headline input caps at 120 and commit (blur) forces an immediate flush", () => {
    mount({ handle: "maya", status: "published" });
    expect(headlineInput().getAttribute("maxlength")).toBe("120");
    fireEvent.change(headlineInput(), { target: { value: "New headline" } });
    fireEvent.blur(headlineInput());
    expect(flushNow).toHaveBeenCalledTimes(1);
  });

  it("shows the PII nudge and the active-idea one-liner note", () => {
    mount({ handle: "maya", status: "published" });
    expect(
      screen.getByText(
        "Your page is public. Don't put your phone number, address, school, or last name on it.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Your page shows your headline plus the one-liner from the idea you are working on right now. Switch ideas and the page follows.",
      ),
    ).toBeTruthy();
  });
});

// ── Honest-divergence note (Unit 7 review): blocked text stored empty ────────

describe("blocked-text divergence note", () => {
  const NOTE = "Part of your page text can't be shown on your public page. Try different words.";

  it("shows the note when the typed headline is non-empty but the server's projected headline is EMPTY", () => {
    mount(
      { handle: "maya", status: "published", projected: { headline: "", oneLiner: "" } },
      "f-u-c-k the rules",
    );
    expect(screen.getByText(NOTE)).toBeTruthy();
    // The softened parity copy no longer claims the preview IS what goes live.
    expect(screen.queryByText(/Your parent sees everything that goes live/)).toBeNull();
  });

  it("no note when the projected content matches the typed text", () => {
    mount(
      {
        handle: "maya",
        status: "published",
        projected: { headline: "Dog walking for busy neighbors", oneLiner: "" },
      },
      "Dog walking for busy neighbors",
    );
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it("no note without projection data (null): a block is never inferred from data we do not have", () => {
    mount({ handle: "maya", status: "published", projected: null }, "f-u-c-k the rules");
    expect(screen.queryByText(NOTE)).toBeNull();
    // And an untyped (empty) local headline never trips it either.
    cleanup();
    mount({ handle: "maya", status: "published", projected: { headline: "", oneLiner: "" } }, "");
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});

// ── Flag off: the legacy mock room, byte-stable ──────────────────────────────

describe("flag off", () => {
  it("renders the pre-Unit-6 mock exactly: fake /you URL, '● live', no cap, no network", async () => {
    publicSiteFlag = false;
    mount({ handle: null, status: "none" });
    // The mock frame with the profile-handle fallback and hardcoded chip.
    expect(screen.getByText("firstprofit.school/you")).toBeTruthy();
    expect(screen.getByText("● live")).toBeTruthy();
    expect(screen.getByText("Edits publish instantly. Your parent sees everything that goes live.")).toBeTruthy();
    // No claim UI, no visit affordance, no real link.
    expect(screen.queryByText("Claim my page →")).toBeNull();
    expect(screen.queryByText("Visit your site ↗")).toBeNull();
    expect(siteLinks()).toHaveLength(0);
    // No input cap and no commit flush (legacy behavior untouched).
    expect(headlineInput().getAttribute("maxlength")).toBeNull();
    fireEvent.blur(headlineInput());
    expect(flushNow).not.toHaveBeenCalled();
    // Zero network / registry traffic.
    await drain();
    expect(refreshSiteStatus).not.toHaveBeenCalled();
    expect(checkHandleAvailability).not.toHaveBeenCalled();
    expect(publishSite).not.toHaveBeenCalled();
  });
});

// ── Unit 6 review fixes: live re-checks around the go-live await ─────────────

describe("go-live sequencing under mid-flight state changes (review P0/P1)", () => {
  it("a parent takedown resolving mid-flush BLOCKS the publish (live status re-check)", async () => {
    let resolveFlush!: (v: string) => void;
    flushNow.mockReturnValue(new Promise((r) => (resolveFlush = r)));
    mount({ handle: "maya", status: "claimed" });
    await waitFor(() => expect(flushNow).toHaveBeenCalledTimes(1));
    // The room-open refresh answers 'offline' (parent takedown) while the
    // flush is still in flight...
    act(() => setSite({ handle: "maya", status: "offline" }));
    // ...then the flush lands. Publishing now would auto-reverse the takedown.
    await act(async () => {
      resolveFlush("landed");
    });
    expect(publishSite).not.toHaveBeenCalled();
    expect(screen.getByText("offline")).toBeTruthy();
    expect(screen.queryByText("● live")).toBeNull();
  });

  it("closing the room mid-flush cancels the orphaned continuation (no publish)", async () => {
    let resolveFlush!: (v: string) => void;
    flushNow.mockReturnValue(new Promise((r) => (resolveFlush = r)));
    const view = mount({ handle: "maya", status: "claimed" });
    await waitFor(() => expect(flushNow).toHaveBeenCalledTimes(1));
    view.unmount(); // room closed while the flush hangs
    await act(async () => {
      resolveFlush("landed");
    });
    // The orphaned continuation must not publish; a reopen runs its own
    // fresh attempt (and the provider's in-flight memo dedupes overlap).
    expect(publishSite).not.toHaveBeenCalled();
  });
});

// ── Unit 6 review P3 batch ───────────────────────────────────────────────────

describe("review P3 pins", () => {
  it("the disabled visit affordance is keyboard-inert: a BUTTON with no href, so Enter/Space cannot navigate", () => {
    mount({ handle: "maya", status: "offline" });
    const visit = screen.getByText("Visit your site ↗");
    expect(visit.tagName).toBe("BUTTON");
    expect(visit.getAttribute("href")).toBeNull();
    expect(visit.closest("a")).toBeNull();
    // Keyboard activation on a button dispatches click; the handler is a
    // preventDefault no-op and there is no URL anywhere to navigate to.
    fireEvent.keyDown(visit, { key: "Enter" });
    fireEvent.keyUp(visit, { key: "Enter" });
    fireEvent.keyDown(visit, { key: " " });
    fireEvent.keyUp(visit, { key: " " });
    fireEvent.click(visit);
    expect(siteLinks()).toHaveLength(0);
  });

  it("closing without blur skips the best-effort flush; the edit is already saved (normal debounce fallback)", () => {
    const view = mount({ handle: "maya", status: "published" });
    fireEvent.change(headlineInput(), { target: { value: "Changed then closed" } });
    // ✕/Escape closes (unmounts) the room without a blur event firing.
    view.unmount();
    expect(flushNow).not.toHaveBeenCalled();
    // Nothing is lost: the value went into the reducer per keystroke and
    // lands on the sync engine's normal 3s debounce (documented fallback).
    expect(dispatchSpy).toHaveBeenCalledWith({
      type: "SET_PROFILE",
      patch: { siteHeadline: "Changed then closed" },
    });
  });
});
