// @vitest-environment jsdom
/**
 * Global persistent nav (spec: docs/superpowers/specs/
 * 2026-08-02-global-nav-design.md). Proves the two auth faces: logged out the
 * wordmark routes home and Log in routes to the login stage (hidden ON the
 * login stage); logged in the wordmark is inert and the founder chip is an
 * Account dropdown holding Log out (wired to logout()); the standalone Log out
 * button is gone from the bar. Tap targets >= 44px, no em dash.
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
/** Two ideas: the state where the chip becomes the switcher dropdown. */
function twoIdeaGame(over: Record<string, unknown> = {}) {
  return appGame({
    ideas: [
      { id: "idea-0", fields: { productName: "Slime Kits" }, done: {} },
      { id: "idea-1", fields: { productName: "Dog Walking" }, done: {} },
    ],
    ...over,
  });
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
  it("shows the founder chip as a menu button wired to logout() via the dropdown", () => {
    stage = "app";
    profile = { firstName: "Cedric", handle: "cedric" };
    render(<GlobalNav />);
    const chip = screen.getByRole("button", { name: /cedric/i });
    expect(chip.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole("menuitem", { name: /log out/i }));
    expect(logout).toHaveBeenCalled();
  });

  it("renders the wordmark inert (no accidental exit from the game)", () => {
    stage = "app";
    render(<GlobalNav />);
    expect(screen.queryByRole("button", { name: /home page/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /log in/i })).toBeNull();
  });

  it("keeps the onboard stage free of the game section (Account dropdown only)", () => {
    stage = "onboard";
    profile = { firstName: "Cedric", handle: "cedric" };
    render(<GlobalNav />);
    const chip = screen.getByRole("button", { name: /cedric/i });
    expect(chip.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(chip);
    expect(screen.getByRole("menuitem", { name: /log out/i })).toBeTruthy();
    expect(screen.queryByText("Sales")).toBeNull();
    expect(screen.queryByText("Profit")).toBeNull();
    expect(screen.queryByText("Slime Kits")).toBeNull();
  });
});

describe("GlobalNav Account dropdown", () => {
  function renderAppNav() {
    stage = "app";
    profile = { firstName: "Cedric", handle: "cedric" };
    render(<GlobalNav />);
    return screen.getByRole("button", { name: /cedric/i });
  }

  it("starts closed: no Log out anywhere, chip aria-expanded false", () => {
    const chip = renderAppNav();
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/log out/i)).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("removes the standalone Log out button from the bar", () => {
    renderAppNav();
    expect(screen.queryByRole("button", { name: /log out/i })).toBeNull();
  });

  it("click opens the menu with the Account title and a Log out menuitem", () => {
    const chip = renderAppNav();
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByRole("menu")).toBeTruthy();
    const item = screen.getByRole("menuitem", { name: /log out/i });
    expect(item.className).toMatch(/min-h-\[44px\]/);
  });

  it("a second chip click toggles the menu closed", () => {
    const chip = renderAppNav();
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });

  it("choosing Log out calls logout and closes the menu", () => {
    const chip = renderAppNav();
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole("menuitem", { name: /log out/i }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("a click outside closes the menu", () => {
    const chip = renderAppNav();
    fireEvent.click(chip);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape closes the menu and returns focus to the chip", () => {
    const chip = renderAppNav();
    fireEvent.click(chip);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(chip);
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

  it("the chip opens an in-nav DROPDOWN MENU (not a modal) listing every idea", () => {
    stage = "app";
    game = twoIdeaGame();
    render(<GlobalNav />);
    const chip = screen.getByRole("button", { name: "Switch idea" });
    // Closed to start: a menu, not a dialog, and nothing rendered yet.
    expect(chip.getAttribute("aria-haspopup")).toBe("menu");
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu", { name: "Switch idea" })).toBeNull();

    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu", { name: "Switch idea" });
    // One menuitem per idea, and NO modal/dialog anywhere in the tree.
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(menu.closest("[role='dialog']")).toBeNull();
    expect(document.querySelector("[aria-modal='true']")).toBeNull();
  });

  it("choosing an idea dispatches SET_ACTIVE_IDEA, fires onSwitched, and closes the menu", () => {
    stage = "app";
    game = twoIdeaGame();
    const onSwitched = vi.fn();
    render(<GlobalNav onSwitched={onSwitched} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch idea" }));
    fireEvent.click(screen.getAllByRole("menuitem")[1]);

    expect(dispatch).toHaveBeenCalledWith({ type: "SET_ACTIVE_IDEA", ideaIndex: 1 });
    // onSwitched is Factory's walk-cancel signal; it must fire on every switch.
    expect(onSwitched).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu", { name: "Switch idea" })).toBeNull();
  });

  it("Escape closes the switcher menu and returns focus to the chip", () => {
    stage = "app";
    game = twoIdeaGame();
    render(<GlobalNav />);
    const chip = screen.getByRole("button", { name: "Switch idea" });
    fireEvent.click(chip);
    expect(screen.getByRole("menu", { name: "Switch idea" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Switch idea" })).toBeNull();
    expect(document.activeElement).toBe(chip);
  });

  it("an outside mousedown closes the switcher menu", () => {
    stage = "app";
    game = twoIdeaGame();
    render(<GlobalNav />);
    fireEvent.click(screen.getByRole("button", { name: "Switch idea" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu", { name: "Switch idea" })).toBeNull();
  });

  it("the idea name is First Profit BLUE (the build token) in both chip states", () => {
    stage = "app";
    // Single idea: plain text, blue.
    render(<GlobalNav />);
    expect((screen.getByText("Slime Kits").parentElement as HTMLElement).className).toMatch(
      /text-build/,
    );
    cleanup();
    // Multi idea: the dropdown trigger, same blue.
    game = twoIdeaGame();
    render(<GlobalNav />);
    expect(screen.getByRole("button", { name: "Switch idea" }).className).toMatch(/text-build/);
  });

  it("the bar sits ABOVE the unit task room so its dropdowns open over it", () => {
    // Change 30. `sticky` + z-index makes the bar its own stacking context, so
    // the menus' z-50 is relative to the BAR: the bar's own z is what decides
    // whether a dropdown clears the room (z-45). Full-screen takeovers stay
    // higher still (z-55/z-60), so they keep covering the bar.
    stage = "app";
    const { container } = render(<GlobalNav />);
    const bar = container.querySelector("nav") as HTMLElement;
    expect(bar.className).toContain("z-50");
    expect(bar.className).toContain("sticky");
  });

  it("the founder chip is GREEN with no bubble: no pill background, border, or rounding", () => {
    stage = "app";
    profile = { firstName: "Cedric", handle: "cedric" };
    render(<GlobalNav />);
    const chip = screen.getByRole("button", { name: /cedric/i });
    expect(chip.className).toMatch(/text-grow/);
    // The tinted red pill is gone entirely.
    expect(chip.className).not.toMatch(/bg-\[/);
    expect(chip.className).not.toMatch(/rounded-full/);
    expect(chip.className).not.toMatch(/hsl\(14_78%/);
    // Still a 44px tap target without the bubble.
    expect(chip.className).toMatch(/min-h-\[44px\]/);
  });

  it("Sales and Profit sit at the FAR RIGHT, after the founder chip", () => {
    stage = "app";
    profile = { firstName: "Cedric", handle: "cedric" };
    game = twoIdeaGame();
    render(<GlobalNav />);
    /** True when `a` comes before `b` in document order. */
    const precedes = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    const ideaChip = screen.getByRole("button", { name: "Switch idea" });
    const founder = screen.getByRole("button", { name: /cedric/i });
    const sales = screen.getByText("Sales");
    const profit = screen.getByText("Profit");
    // idea chip … founder chip … Sales … Profit, money last in the bar.
    expect(precedes(ideaChip, founder)).toBe(true);
    expect(precedes(founder, sales)).toBe(true);
    expect(precedes(sales, profit)).toBe(true);
  });

  it("the chip is NOT a button with a single idea (nothing to switch to)", () => {
    stage = "app";
    render(<GlobalNav />);
    expect(screen.queryByRole("button", { name: "Switch idea" })).toBeNull();
    expect(screen.getByText("Slime Kits")).toBeTruthy(); // inert span
  });

  it("the multi-idea chip is bold plain text advertising a menu with a chevron, no pill", () => {
    stage = "app";
    game = twoIdeaGame();
    render(<GlobalNav />);
    const chip = screen.getByRole("button", { name: "Switch idea" });
    expect(chip.getAttribute("aria-haspopup")).toBe("menu");
    expect(chip.querySelector("svg")).toBeTruthy(); // the ChevronDown affordance
    expect(chip.className).toMatch(/font-bold/);
    expect(chip.className).not.toMatch(/bg-\[/); // old tinted pill background gone
    expect(chip.className).not.toMatch(/border/);
    expect(chip.className).not.toMatch(/rounded/);
  });

  it("the single-idea name is plain bold text with no chevron and no pill", () => {
    stage = "app";
    render(<GlobalNav />);
    const chip = screen.getByText("Slime Kits").parentElement as HTMLElement;
    expect(chip.tagName).toBe("SPAN");
    expect(chip.className).toMatch(/font-bold/);
    expect(chip.className).not.toMatch(/bg-\[/);
    expect(chip.className).not.toMatch(/border/);
    expect(chip.className).not.toMatch(/rounded/);
    expect(chip.querySelector("svg")).toBeNull();
  });

  it("hides the chip entirely with zero ideas", () => {
    stage = "app";
    game = appGame({ ideas: [] });
    render(<GlobalNav />);
    expect(screen.queryByText("Not named yet")).toBeNull();
    expect(screen.getByText("Sales")).toBeTruthy();
  });

  it("keeps the Account dropdown beside the game section", () => {
    stage = "app";
    profile = { firstName: "Cedric", handle: "cedric" };
    render(<GlobalNav />);
    fireEvent.click(screen.getByRole("button", { name: /cedric/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /log out/i }));
    expect(logout).toHaveBeenCalled();
  });

  it("keeps >=44px tap targets and no em dash in the app stage", () => {
    stage = "app";
    game = twoIdeaGame();
    render(<GlobalNav />);
    for (const b of screen.getAllByRole("button")) {
      expect(b.className).toMatch(/min-h-\[44px\]/);
    }
    // The menu's own rows are tap targets too once it is open.
    fireEvent.click(screen.getByRole("button", { name: "Switch idea" }));
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.className).toMatch(/min-h-\[44px\]/);
    }
    expect(document.body.textContent ?? "").not.toMatch(/—/);
  });
});
