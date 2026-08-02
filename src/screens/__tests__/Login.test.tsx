// @vitest-environment jsdom
/**
 * Login screen "Create Account" link-out (feat: login-create-account-link).
 * Account creation lives at the120's /start; the login page links out to it so a
 * new student can reach onboarding. Proves: the link points at
 * https://the120.school/start?src=fplogin, is a same-tab external anchor (no
 * target=_blank), carries a >=44px tap target, has no em dash, and the existing
 * username/password login form is unaffected.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const login = vi.fn();
const dispatch = vi.fn();
vi.mock("../../state/GameContext", () => ({ useGame: () => ({ login, dispatch }) }));

import { Login } from "../Login";

afterEach(() => {
  cleanup();
  login.mockClear();
  dispatch.mockClear();
});

describe("Login Create Account link-out", () => {
  it("links to the120 /start with src=fplogin", () => {
    render(<Login />);
    const link = screen.getByRole("link", { name: /create an account/i });
    expect(link.getAttribute("href")).toBe("https://the120.school/start?src=fplogin");
  });

  it("is a same-tab external anchor (no target=_blank)", () => {
    render(<Login />);
    const link = screen.getByRole("link", { name: /create an account/i });
    expect(link.getAttribute("target")).toBeNull();
  });

  it("carries a >=44px tap target and no em dash", () => {
    render(<Login />);
    const link = screen.getByRole("link", { name: /create an account/i });
    expect(link.className).toMatch(/min-h-\[44px\]/);
    // No em dash anywhere on the login screen (global product copy rule), not just
    // in the create-account paragraph.
    expect(document.body.textContent ?? "").not.toMatch(/—/);
  });

  it("leaves the login form intact (username, password, Log in)", () => {
    render(<Login />);
    // getByLabelText / getByRole throw when absent, so resolving them asserts presence.
    expect(screen.getByLabelText(/username/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /log in/i })).toBeTruthy();
  });
});
