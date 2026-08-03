// @vitest-environment jsdom
/**
 * Global persistent nav (spec: docs/superpowers/specs/
 * 2026-08-02-global-nav-design.md). Proves the two auth faces: logged out the
 * wordmark routes home and Log in routes to the login stage (hidden ON the
 * login stage); logged in the wordmark is inert and the founder chip + Log out
 * (wired to logout()) render. Tap targets >= 44px, no em dash.
 *
 * App stage (UI consolidation: the ONE bar, Hud deleted): the right side adds
 * the game section — the active idea/business chip (productName preferred,
 * building emoji when the active idea IS the promoted business, switcher
 * button only with >1 idea), the Sales / Profit stats (no "Net of fees", no
 * "of $1,000", no phase/criteria chip), and the save indicator.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const dispatch = vi.fn();
const logout = vi.fn();
let stage = "landing";
let profile: { firstName: string; handle: string } = { firstName: "", handle: "" };

/** Game-section fields the app stage consumes (harmless extras elsewhere). */
function appGame(over: Record<string, unknown> = {}) {
  return {
    ideas: [{ id: "idea-0", fields: { productName: "Slime Kits", oneLiner: "Goo by mail" }, done: {} }],
    activeIdea: 0,
    businesses: [],
    grossSalesSumCents: () => 123456,
    salesSumCents: () => 111199,
    syncStatus: "idle",
    ...over,
  };
}
let game: Record<string, unknown> = appGame();

vi.mock("../../state/GameContext", () => ({
  useGame: () => ({ stage, dispatch, logout, profile, ...game }),
  isLoggedInStage: (s: string) => s === "onboard" || s === "app",
}));

import { GlobalNav } from "../GlobalNav";

afterEach(() => {
  cleanup();
  dispatch.mockClear();
  logout.mockClear();
  stage = "landing";
  profile = { firstName: "", handle: "" };
  game = appGame();
});

describe("GlobalNav logged out", () => {
  it("wordmark routes to landing and Log in routes to login", () => {
    stage = "signup";
    render(<GlobalNav />);
    fireEvent.click(screen.getByRole("button", { name: /home page/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_STAGE", stage: "landing" });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_STAGE", stage: "login" });
  });

  it("shows Start Building only on the landing stage, routed via the signup flag", () => {
    stage = "landing";
    render(<GlobalNav />);
    fireEvent.click(screen.getByRole("button", { name: /start building/i }));
    // Flag defaults OFF in tests, so the CTA routes to login (Slice A behavior).
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_STAGE", stage: "login" });
  });

  it("hides Start Building off the landing stage", () => {
    stage = "signup";
    render(<GlobalNav />);
    expect(screen.queryByRole("button", { name: /start building/i })).toBeNull();
  });

  it("hides Log in on the login stage itself", () => {
    stage = "login";
    render(<GlobalNav />);
    expect(screen.queryByRole("button", { name: /log in/i })).toBeNull();
  });

  it("carries >=44px tap targets and no em dash", () => {
    render(<GlobalNav />);
    for (const b of screen.getAllByRole("button")) {
      expect(b.className).toMatch(/min-h-\[44px\]/);
    }
    expect(document.body.textContent ?? "").not.toMatch(/—/);
  });
});

describe("GlobalNav logged in", () => {
  it("shows the founder chip and wires Log out to logout()", () => {
    stage = "app";
    profile = { firstName: "Cedric", handle: "cedric" };
    render(<GlobalNav />);
    expect(screen.getByText("Cedric")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(logout).toHaveBeenCalled();
  });

  it("renders the wordmark inert (no accidental exit from the game)", () => {
    stage = "app";
    render(<GlobalNav />);
    expect(screen.queryByRole("button", { name: /home page/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /log in/i })).toBeNull();
  });

  it("keeps the onboard stage free of the game section (founder chip + Log out only)", () => {
    stage = "onboard";
    profile = { firstName: "Cedric", handle: "cedric" };
    render(<GlobalNav />);
    expect(screen.getByText("Cedric")).toBeTruthy();
    expect(screen.getByRole("button", { name: /log out/i })).toBeTruthy();
    expect(screen.queryByText("Sales")).toBeNull();
    expect(screen.queryByText("Profit")).toBeNull();
    expect(screen.queryByText("Slime Kits")).toBeNull();
  });
});

describe("GlobalNav app stage — the one bar's game section", () => {
  it("shows the active idea's display name, preferring the authored productName", () => {
    stage = "app";
    render(<GlobalNav />);
    expect(screen.getByText("Slime Kits")).toBeTruthy();
    expect(screen.queryByText("Goo by mail")).toBeNull();
  });

  it("prefixes the building emoji when the active idea IS the promoted business", () => {
    stage = "app";
    game = appGame({ businesses: [{ id: "biz-1", ideaId: "idea-0", archived: false }] });
    render(<GlobalNav />);
    expect(screen.getByText("🏢")).toBeTruthy();
    expect(screen.getByText("Slime Kits")).toBeTruthy();
  });

  it("shows no building emoji when the business is a DIFFERENT idea", () => {
    stage = "app";
    game = appGame({
      ideas: [
        { id: "idea-0", fields: { productName: "Slime Kits" }, done: {} },
        { id: "idea-1", fields: {}, done: {} },
      ],
      activeIdea: 1,
      businesses: [{ id: "biz-1", ideaId: "idea-0", archived: false }],
    });
    render(<GlobalNav />);
    expect(screen.queryByText("🏢")).toBeNull();
  });

  it("renders Sales and Profit whole-dollar values; no Hud leftovers", () => {
    stage = "app";
    render(<GlobalNav />);
    expect(screen.getByText("Sales")).toBeTruthy();
    expect(screen.getByText("$1,234")).toBeTruthy(); // gross 123456 cents
    expect(screen.getByText("Profit")).toBeTruthy();
    expect(screen.getByText("$1,111")).toBeTruthy(); // net 111199 cents
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/Net of fees/);
    expect(text).not.toMatch(/of \$1,000/);
    expect(text).not.toMatch(/criteria/);
  });

  it("shows the save indicator from syncStatus", () => {
    stage = "app";
    game = appGame({ syncStatus: "saved" });
    render(<GlobalNav />);
    expect(screen.getByRole("status").textContent).toBe("Saved");
  });

  it("the chip is a Switch idea button that fires onOpenSwitcher when ideas > 1", () => {
    stage = "app";
    game = appGame({
      ideas: [
        { id: "idea-0", fields: { productName: "Slime Kits" }, done: {} },
        { id: "idea-1", fields: {}, done: {} },
      ],
    });
    const onOpenSwitcher = vi.fn();
    render(<GlobalNav onOpenSwitcher={onOpenSwitcher} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch idea" }));
    expect(onOpenSwitcher).toHaveBeenCalledTimes(1);
  });

  it("the chip is NOT a button with a single idea (nothing to switch to)", () => {
    stage = "app";
    render(<GlobalNav />);
    expect(screen.queryByRole("button", { name: "Switch idea" })).toBeNull();
    expect(screen.getByText("Slime Kits")).toBeTruthy(); // inert span
  });

  it("hides the chip entirely with zero ideas", () => {
    stage = "app";
    game = appGame({ ideas: [] });
    render(<GlobalNav />);
    expect(screen.queryByText("Not named yet")).toBeNull();
    expect(screen.getByText("Sales")).toBeTruthy();
  });

  it("keeps the founder chip and Log out beside the game section", () => {
    stage = "app";
    profile = { firstName: "Cedric", handle: "cedric" };
    render(<GlobalNav />);
    expect(screen.getByText("Cedric")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(logout).toHaveBeenCalled();
  });

  it("keeps >=44px tap targets and no em dash in the app stage", () => {
    stage = "app";
    game = appGame({
      ideas: [
        { id: "idea-0", fields: { productName: "Slime Kits" }, done: {} },
        { id: "idea-1", fields: {}, done: {} },
      ],
    });
    render(<GlobalNav onOpenSwitcher={vi.fn()} />);
    for (const b of screen.getAllByRole("button")) {
      expect(b.className).toMatch(/min-h-\[44px\]/);
    }
    expect(document.body.textContent ?? "").not.toMatch(/—/);
  });
});
