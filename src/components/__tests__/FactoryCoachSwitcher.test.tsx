// @vitest-environment jsdom
/**
 * Factory-level Unit 8 surfaces: the Next Step coach's promote CTA + grow/scale
 * walking, and the idea-switcher dialog (SET_ACTIVE_IDEA only, any phase).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../state/GameContext", async () => {
  const R = await import("react");
  const Ctx = R.createContext<unknown>(null);
  // isLoggedInStage: the real predicate, needed since the switcher moved into
  // the GlobalNav (which branches its whole bar on it).
  return {
    __ctx: Ctx,
    useGame: () => R.useContext(Ctx),
    isLoggedInStage: (s: string) => s === "app" || s === "onboard",
  };
});

// Public-site flag (Unit 6 claim hint): default OFF so every pre-Unit-6 coach
// scenario runs against the unchanged behavior; the hint describe flips it.
let publicSiteFlag = false;
vi.mock("../../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config")>();
  return { ...actual, isPublicSiteEnabled: () => publicSiteFlag };
});

import * as GameContext from "../../state/GameContext";
import { NextStepCoach } from "../../screens/Factory";
import { GlobalNav } from "../GlobalNav";
import { FloorHarness, apply, completePhase, completeStep, validatedIdea, withIdeas, withNamedIdeas } from "../../testSupport/floorHarness";
import type { WalkIntent } from "../FactoryFloor";
import type { Action, GameState } from "../../state/gameCore";

const Ctx = (GameContext as unknown as { __ctx: React.Context<unknown> }).__ctx;

afterEach(() => {
  cleanup();
  publicSiteFlag = false;
});

function mountCoach(seed: GameState) {
  const walks: WalkIntent[] = [];
  render(
    <FloorHarness seed={seed} Ctx={Ctx}>
      <NextStepCoach onWalk={(i) => walks.push(i)} />
    </FloorHarness>,
  );
  return { walks };
}

describe("NextStepCoach — promote CTA + full-path walking (Unit 8)", () => {
  it("shows 'Make it your business!' at the promotion seam and opens the promote screen", () => {
    const { walks } = mountCoach(validatedIdea(withNamedIdeas(1), 0));
    expect(screen.getByText("Make it your business!")).toBeTruthy();
    fireEvent.click(screen.getByText("Next Step"));
    expect(walks).toEqual([{ kind: "openPromote" }]);
  });

  it("walks a BUILD criterion by its room name once Sell completes (post-allowlist expansion)", () => {
    const { walks } = mountCoach(completePhase(withNamedIdeas(1), 0, "sell"));
    expect(screen.getByText("Take me to The Build Room")).toBeTruthy();
    fireEvent.click(screen.getByText("Next Step"));
    expect(walks).toEqual([{ kind: "enterCriterion", stepId: "2.1" }]);
  });

  it("walks GROW criteria for the promoted business (4.1 in the Checkout Booth)", () => {
    let s = validatedIdea(withNamedIdeas(1), 0);
    s = apply(s, { type: "PROMOTE_IDEA", ideaId: "idea-0", businessId: "biz-1", at: 1 });
    const { walks } = mountCoach(s);
    expect(screen.getByText("Take me to The Checkout Booth")).toBeTruthy();
    fireEvent.click(screen.getByText("Next Step"));
    expect(walks).toEqual([{ kind: "enterCriterion", stepId: "4.1" }]);
  });

  it("hides once the whole path is done (terminal state)", () => {
    let s = validatedIdea(withNamedIdeas(1), 0);
    s = apply(s, { type: "PROMOTE_IDEA", ideaId: "idea-0", businessId: "biz-1", at: 1 });
    for (const phase of ["grow", "scale"] as const) s = completePhase(s, 0, phase);
    mountCoach(s);
    expect(screen.queryByText("Next Step")).toBeNull();
  });

  it("hides while an overlay is open", () => {
    const s = { ...withIdeas(1), runnerOpen: true };
    mountCoach(s);
    expect(screen.queryByText("Next Step")).toBeNull();
  });
});

describe("NextStepCoach — one-shot claim hint for handle-less accounts (Unit 6)", () => {
  /** Seed with the registry read-back answering "no handle" (status none). */
  function handleLess(seed: GameState): GameState {
    return { ...seed, site: { handle: null, status: "none", projected: null } };
  }

  /** Seed stuck at "claimed": the go-live (flush→publish) never landed. */
  function stuckClaimed(seed: GameState): GameState {
    return { ...seed, site: { handle: "maya", status: "claimed", projected: null } };
  }

  /** Mount the coach plus a dispatch probe (drives the REAL reducer). */
  function mountWithDispatch(seed: GameState) {
    const walks: WalkIntent[] = [];
    let latest: { dispatch: (a: Action) => void } | null = null;
    function Probe() {
      latest = React.useContext(Ctx) as { dispatch: (a: Action) => void };
      return null;
    }
    render(
      <FloorHarness seed={seed} Ctx={Ctx}>
        <NextStepCoach onWalk={(i) => walks.push(i)} />
        <Probe />
      </FloorHarness>,
    );
    const dispatch = (a: Action) => {
      if (!latest) throw new Error("probe not mounted");
      latest.dispatch(a);
    };
    return { walks, dispatch };
  }

  it("points a handle-less account with ideas at the Your Site room via the walk channel", () => {
    publicSiteFlag = true;
    const { walks } = mountWithDispatch(handleLess(withIdeas(1)));
    expect(screen.getByText("Claim your page in Your Site")).toBeTruthy();
    fireEvent.click(screen.getByText("Next Step"));
    expect(walks).toEqual([{ kind: "openRoom", room: "website" }]);
  });

  it("is consumed ONCE the room opens (any route): the coach reverts to normal guidance", () => {
    publicSiteFlag = true;
    const { dispatch } = mountWithDispatch(handleLess(withIdeas(1)));
    expect(screen.getByText("Claim your page in Your Site")).toBeTruthy();
    // The room opens (button walk arrival or a pod tap — same reducer action);
    // the coach hides behind the overlay and the hint is consumed.
    act(() => dispatch({ type: "OPEN_ROOM", room: "website" }));
    expect(screen.queryByText("Next Step")).toBeNull();
    // Room closed WITHOUT claiming: normal next-step guidance, no re-nag.
    act(() => dispatch({ type: "CLOSE_ROOM" }));
    expect(screen.queryByText("Claim your page in Your Site")).toBeNull();
    expect(screen.getByText(/Take me to /)).toBeTruthy();
  });

  it("never fires on the neutral 'unknown' status (failed read is not a nudge)", () => {
    publicSiteFlag = true;
    const seed = {
      ...withIdeas(1),
      site: { handle: null, status: "unknown" as const, projected: null },
    };
    mountWithDispatch(seed);
    expect(screen.queryByText("Claim your page in Your Site")).toBeNull();
    expect(screen.getByText(/Take me to /)).toBeTruthy();
  });

  it("never preempts a brand-new account's first-idea guidance (no ideas yet)", () => {
    publicSiteFlag = true;
    const seed = handleLess({ ...withIdeas(0) });
    mountWithDispatch(seed);
    expect(screen.queryByText("Claim your page in Your Site")).toBeNull();
    expect(screen.getByText("Take me to The Idea Room")).toBeTruthy();
  });

  it.each(["offline", "published"] as const)(
    "never fires once the page reached a live/parent-controlled state (status %s)",
    (status) => {
      publicSiteFlag = true;
      const seed = { ...withIdeas(1), site: { handle: "maya", status, projected: null } };
      mountWithDispatch(seed);
      expect(screen.queryByText("Claim your page in Your Site")).toBeNull();
      expect(screen.queryByText(/Finish making your page live/)).toBeNull();
      expect(screen.getByText(/Take me to /)).toBeTruthy();
    },
  );

  // ── Stuck-'claimed' nudge (Unit 7 review P2): a parked completion flush
  // leaves an account at "claimed" with no route back to the room whose open
  // retries flush→publish. The same one-shot hint covers it, with its own
  // copy — never the claim copy (the account already holds a handle).
  it("fires for a stuck-'claimed' account with the go-live copy (not the claim copy)", () => {
    publicSiteFlag = true;
    const { walks } = mountWithDispatch(stuckClaimed(withIdeas(1)));
    expect(screen.getByText("Finish making your page live in Your Site")).toBeTruthy();
    expect(screen.queryByText("Claim your page in Your Site")).toBeNull();
    fireEvent.click(screen.getByText("Next Step"));
    expect(walks).toEqual([{ kind: "openRoom", room: "website" }]);
  });

  it("the claimed-state hint is consumed once the room opens, same one-shot mechanics", () => {
    publicSiteFlag = true;
    const { dispatch } = mountWithDispatch(stuckClaimed(withIdeas(1)));
    expect(screen.getByText("Finish making your page live in Your Site")).toBeTruthy();
    act(() => dispatch({ type: "OPEN_ROOM", room: "website" }));
    expect(screen.queryByText("Next Step")).toBeNull();
    act(() => dispatch({ type: "CLOSE_ROOM" }));
    expect(screen.queryByText(/Finish making your page live/)).toBeNull();
    expect(screen.getByText(/Take me to /)).toBeTruthy();
  });

  it("flag off: no hint even for a handle-less account (pre-Unit-6 behavior)", () => {
    publicSiteFlag = false;
    mountWithDispatch(handleLess(withIdeas(1)));
    expect(screen.queryByText("Claim your page in Your Site")).toBeNull();
    expect(screen.getByText(/Take me to /)).toBeTruthy();
  });
});

/**
 * The switcher stopped being a Factory modal on 2026-08-04 and became a
 * dropdown in the GlobalNav chip. These tests mount the REAL nav over the real
 * reducer (GlobalNav.test.tsx covers the menu's open/close mechanics against a
 * mocked context); what matters here is that the menu still reads live
 * cross-phase state through the same selectors the dialog used.
 */
describe("GlobalNav idea switcher — active-idea switching across phases (Unit 8)", () => {
  function mountSwitcher(seed: GameState) {
    const actions: Action[] = [];
    render(
      <FloorHarness seed={{ ...seed, stage: "app" }} Ctx={Ctx} onAction={(a) => actions.push(a)}>
        <GlobalNav />
      </FloorHarness>,
    );
    // The chip is the trigger; the menu only exists once it is open.
    fireEvent.click(screen.getByRole("button", { name: "Switch idea" }));
    return { actions };
  }

  it("lists EVERY idea with progress (not just eligible ones) and marks the current", () => {
    let s = withIdeas(2);
    s = completeStep(s, 0, "1.1");
    s = apply(s, { type: "SET_FIELD", ideaIndex: 0, key: "oneLiner", value: "Slime kits" });
    mountSwitcher(s);
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Slime kits");
    expect(items[1].textContent).toContain("Not named yet");
    // Progress labels come from the same selector the old dialog used.
    expect(items[0].textContent).toMatch(/tasks · /);
    // Idea #2 is active in this seed, so the "now" marker sits on that row.
    expect(items[1].textContent).toContain("now");
    expect(items[0].textContent).not.toContain("now");
  });

  it("choosing an idea dispatches SET_ACTIVE_IDEA only, then closes (works mid-Build)", () => {
    let s = withIdeas(2);
    s = completePhase(s, 0, "sell"); // idea 0 is in Build; idea 1 (active) in Sell
    const { actions } = mountSwitcher(s);
    fireEvent.click(screen.getAllByRole("menuitem")[0]);
    expect(actions).toEqual([{ type: "SET_ACTIVE_IDEA", ideaIndex: 0 }]);
    expect(screen.queryByRole("menu", { name: "Switch idea" })).toBeNull();
  });
});
