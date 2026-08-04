// @vitest-environment jsdom
/**
 * Your Site room (your-site-room-simplification, 2026-08-03): the room no
 * longer simulates a website. These tests pin the per-state render table
 * (published link / offline plain text / claimed going-live / none claim UI /
 * unknown neutral), the Coming Soon note's normative presence, the flag-off
 * note-only render, the go-live retry sequencing (and its hard boundary:
 * NEVER for offline), the in-room claim → publish flow, and the absence of
 * every removed simulated-site string.
 *
 * DELETED BY DESIGN: the legacy flag-off byte-pin block ("renders the
 * pre-Unit-6 mock exactly"). The requirements doc explicitly retires the
 * "flag-off byte-identical legacy room" stability contract — flag-off now
 * renders ONLY the Coming Soon note. This is a designed removal, not a
 * regression (docs/brainstorms/2026-08-03-your-site-room-simplification-
 * requirements.md, decision 6).
 *
 * Harness: GameContext is mocked as a plain context; a stateful Harness stands
 * in for the provider, mimicking exactly the slice adoptions GameContext
 * performs (claim success → status "claimed"; publish success → "published")
 * so the room is exercised against realistic slice transitions.
 *
 * MOBILE GATE (CLAUDE.md ~390px): the room renders inside RoomDialog's
 * full-screen-below-sm overlay (unchanged here); the structure assertions
 * below pin the >=44px tap targets on the open-site link and claim chips and
 * the truncation classes on the URL text, so nothing can overflow a ~390px
 * viewport.
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

/** Seed shape: `projected` optional (defaults null). */
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

function Harness({ initialSite }: { initialSite: SiteSeed }) {
  const [site, setSiteState] = React.useState(withProjected(initialSite));
  setSite = (s) => setSiteState(withProjected(s));
  const value = {
    profile: { firstName: "Maya", handle: "", siteHeadline: "", grade: null },
    ideas: [] as unknown[],
    activeIdea: 0,
    site,
    dispatch: dispatchSpy,
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

function mount(initialSite: SiteSeed) {
  return render(<Harness initialSite={initialSite} />);
}

/** All anchors pointing at a public site URL. */
function siteLinks(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll("a")).filter((a) =>
    (a.getAttribute("href") ?? "").startsWith("https://firstprofit.school/"),
  );
}

const COMING_SOON = "Changing your First Profit website is coming soon.";

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
  it("renders the open-site link: constructed href, new tab, rel-hardened", () => {
    mount({ handle: "maya", status: "published" });
    const links = siteLinks();
    expect(links).toHaveLength(1);
    const a = links[0];
    expect(a.getAttribute("href")).toBe("https://firstprofit.school/maya");
    expect(a.getAttribute("target")).toBe("_blank");
    const rel = a.getAttribute("rel") ?? "";
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
  });

  it("the link's accessible name says it opens in a new tab (not just the glyph)", () => {
    mount({ handle: "maya", status: "published" });
    const a = screen.getByRole("link", { name: /opens in a new tab/i });
    expect(a.getAttribute("href")).toBe("https://firstprofit.school/maya");
    // The glyph itself is decorative, hidden from the accessible name.
    const glyph = a.querySelector('[aria-hidden="true"]');
    expect(glyph?.textContent).toBe("↗");
  });

  it("keeps the >=44px tap target and truncating URL text (mobile gate, ~390px)", () => {
    mount({ handle: "maya", status: "published" });
    const a = siteLinks()[0];
    expect(a.className).toContain("min-h-[44px]");
    expect(a.className).toContain("max-w-full");
    const urlSpan = Array.from(a.querySelectorAll("span")).find((s) =>
      (s.textContent ?? "").includes("firstprofit.school/maya"),
    );
    expect(urlSpan).toBeTruthy();
    expect(urlSpan?.className).toContain("truncate");
    expect(urlSpan?.className).toContain("min-w-0");
  });

  it("shows the Coming Soon note", () => {
    mount({ handle: "maya", status: "published" });
    expect(screen.getByText(COMING_SOON)).toBeTruthy();
  });

  it("does not run the go-live retry (nothing to publish)", async () => {
    mount({ handle: "maya", status: "published" });
    await drain();
    expect(publishSite).not.toHaveBeenCalled();
  });
});

// ── Offline (parent-unpublished OR operator-locked, undistinguished) ─────────

describe("offline", () => {
  it("plain-text URL (no clickable link), the reason caption, and the note", () => {
    mount({ handle: "maya", status: "offline" });
    expect(siteLinks()).toHaveLength(0);
    expect(document.querySelectorAll("a")).toHaveLength(0);
    const url = screen.getByText("firstprofit.school/maya");
    expect(url.tagName).toBe("P");
    expect(url.className).toContain("truncate");
    expect(
      screen.getByText(
        "Your page is offline right now. A grown-up turned it off, and a grown-up can turn it back on. Your edits still save for when it comes back.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(COMING_SOON)).toBeTruthy();
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
  it("shows the going-live caption + the note, no link, no claim UI", async () => {
    flushNow.mockResolvedValue("parked");
    mount({ handle: "maya", status: "claimed" });
    expect(
      screen.getByText(
        "Your page isn't live yet. It goes live as soon as your latest work reaches us. Check back in a minute.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(COMING_SOON)).toBeTruthy();
    expect(siteLinks()).toHaveLength(0);
    expect(screen.queryByText("Claim my page →")).toBeNull();
    await drain();
  });

  it("retries flush→publish on room open and flips to the published body on success", async () => {
    mount({ handle: "maya", status: "claimed" });
    await waitFor(() => expect(publishSite).toHaveBeenCalledTimes(1));
    expect(flushNow).toHaveBeenCalledTimes(1);
    // Publish only AFTER the flush landed.
    expect(flushNow.mock.invocationCallOrder[0]).toBeLessThan(
      publishSite.mock.invocationCallOrder[0],
    );
    // The mimicked slice adoption flips the room to the published body.
    await waitFor(() => expect(siteLinks()).toHaveLength(1));
    expect(siteLinks()[0].getAttribute("href")).toBe("https://firstprofit.school/maya");
  });

  it("a parked flush does NOT publish and keeps the honest going-live state", async () => {
    flushNow.mockResolvedValue("parked");
    mount({ handle: "maya", status: "claimed" });
    await drain();
    expect(flushNow).toHaveBeenCalledTimes(1);
    expect(publishSite).not.toHaveBeenCalled();
    expect(siteLinks()).toHaveLength(0);
  });

  it("retries at most once per room open (no publish-failure loop)", async () => {
    publishSite.mockResolvedValue({ ok: false, reason: "outage" });
    mount({ handle: "maya", status: "claimed" });
    await drain();
    expect(publishSite).toHaveBeenCalledTimes(1);
  });
});

// ── Unclaimed (in-room claim for existing accounts) ──────────────────────────

describe("unclaimed (none)", () => {
  it("shows the claim UI and its caption: no link, no note, nothing simulated", () => {
    mount({ handle: null, status: "none" });
    expect(siteLinks()).toHaveLength(0);
    expect(
      screen.getByText("Claim your page name below and your page goes live on the real internet."),
    ).toBeTruthy();
    expect(screen.getByText("Claim your page name")).toBeTruthy();
    expect(screen.getByText("Claim my page →")).toBeTruthy();
    // Placeholder URL text in the shared block is allowed; nothing simulated.
    expect(document.body.textContent).not.toContain("school/you");
    // The note is published/offline/claimed only (per the render table).
    expect(screen.queryByText(COMING_SOON)).toBeNull();
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

  it("successful in-room claim → immediate flush→publish → room flips to the published body (claim IS go-live)", async () => {
    mount({ handle: null, status: "none" });
    fireEvent.click(screen.getByText("Claim my page →"));
    await waitFor(() => expect(claimSite).toHaveBeenCalledWith("maya"));
    await waitFor(() => expect(publishSite).toHaveBeenCalledTimes(1));
    // Order: claim, then flush, then publish (the go-live sequencing).
    expect(claimSite.mock.invocationCallOrder[0]).toBeLessThan(flushNow.mock.invocationCallOrder[0]);
    expect(flushNow.mock.invocationCallOrder[0]).toBeLessThan(
      publishSite.mock.invocationCallOrder[0],
    );
    // The room now renders the real open-site link and the claim UI is gone.
    await waitFor(() => expect(siteLinks()).toHaveLength(1));
    expect(screen.queryByText("Claim my page →")).toBeNull();
    expect(screen.getByText(COMING_SOON)).toBeTruthy();
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

// ── Status fetch failure → neutral (never a false link) ──────────────────────

describe("unknown (failed status read)", () => {
  it("renders the neutral caption ONLY: no link, no claim UI, no note", () => {
    mount({ handle: null, status: "unknown" });
    expect(siteLinks()).toHaveLength(0);
    expect(screen.queryByText("Claim my page →")).toBeNull();
    expect(
      screen.getByText("We can't check on your page right now, so no link yet. Your edits still save."),
    ).toBeTruthy();
    expect(screen.queryByText(COMING_SOON)).toBeNull();
  });
});

// ── Shared room behavior (flag on) ───────────────────────────────────────────

describe("room open", () => {
  it("room open refreshes the site status (bounded staleness for parent unpublish)", () => {
    mount({ handle: "maya", status: "published" });
    expect(refreshSiteStatus).toHaveBeenCalledTimes(1);
  });
});

// ── The simulated site is gone (every state, both flags) ─────────────────────

describe("removed simulated-site content appears NOWHERE", () => {
  const REMOVED_STRINGS = [
    "Edits publish instantly",
    "Your parent",
    "Back me",
    "● live",
    "firstprofit.school/you",
    "Your headline",
    "Visit your site",
  ];
  const STATES: SiteSeed[] = [
    { handle: "maya", status: "published" },
    { handle: "maya", status: "offline" },
    { handle: "maya", status: "claimed" },
    { handle: null, status: "none" },
    { handle: null, status: "unknown" },
  ];

  it.each(STATES.map((s) => [s.status, s] as const))(
    "flag on, %s: no mock frame, no editor, no parent-visibility copy",
    async (_status, seed) => {
      flushNow.mockResolvedValue("parked"); // keep claimed from flipping live
      mount(seed);
      const text = document.body.textContent ?? "";
      for (const removed of REMOVED_STRINGS) {
        expect(text).not.toContain(removed);
      }
      // No headline input (or any text input outside the claim block).
      expect(screen.queryByLabelText("Your headline")).toBeNull();
      await drain();
    },
  );

  it("flag off: none of the removed strings either", () => {
    publicSiteFlag = false;
    mount({ handle: null, status: "none" });
    const text = document.body.textContent ?? "";
    for (const removed of REMOVED_STRINGS) {
      expect(text).not.toContain(removed);
    }
  });
});

// ── Flag off: the Coming Soon note ONLY ──────────────────────────────────────
// (The legacy byte-pin block that lived here is deleted by design; see the
// module doc comment.)

describe("flag off", () => {
  it("renders ONLY the Coming Soon note: no claim UI, no link, no mock, no network", async () => {
    publicSiteFlag = false;
    mount({ handle: null, status: "none" });
    expect(screen.getByText(COMING_SOON)).toBeTruthy();
    // No claim UI even though the slice would show `none` with the flag on.
    expect(screen.queryByText("Claim my page →")).toBeNull();
    expect(screen.queryByLabelText("Page name")).toBeNull();
    // No links, no inputs, nothing simulated.
    expect(document.querySelectorAll("a")).toHaveLength(0);
    expect(document.querySelectorAll("input")).toHaveLength(0);
    // Zero network / registry traffic.
    await drain();
    expect(refreshSiteStatus).not.toHaveBeenCalled();
    expect(checkHandleAvailability).not.toHaveBeenCalled();
    expect(publishSite).not.toHaveBeenCalled();
    expect(flushNow).not.toHaveBeenCalled();
  });
});

// ── Go-live sequencing under mid-flight state changes (review P0/P1) ─────────

describe("go-live sequencing under mid-flight state changes", () => {
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
    // The room shows the honest offline body.
    expect(siteLinks()).toHaveLength(0);
    expect(screen.getByText("firstprofit.school/maya").tagName).toBe("P");
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
