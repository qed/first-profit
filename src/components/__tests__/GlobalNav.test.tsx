// @vitest-environment jsdom
/**
 * Global persistent nav (spec: docs/superpowers/specs/
 * 2026-08-02-global-nav-design.md). Proves the two auth faces: logged out the
 * wordmark routes home and Log in routes to the login stage (hidden ON the
 * login stage); logged in the wordmark is inert and the founder chip + Log out
 * (wired to logout()) render. Tap targets >= 44px, no em dash.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const dispatch = vi.fn();
const logout = vi.fn();
let stage = "landing";
let profile: { firstName: string; handle: string } = { firstName: "", handle: "" };

vi.mock("../../state/GameContext", () => ({
  useGame: () => ({ stage, dispatch, logout, profile }),
  isLoggedInStage: (s: string) => s === "onboard" || s === "app",
}));

import { GlobalNav } from "../GlobalNav";

afterEach(() => {
  cleanup();
  dispatch.mockClear();
  logout.mockClear();
  stage = "landing";
  profile = { firstName: "", handle: "" };
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
});
