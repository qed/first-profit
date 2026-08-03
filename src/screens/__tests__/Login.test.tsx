// @vitest-environment jsdom
/**
 * Login screen "Create Account" link-out (feat: login-create-account-link).
 * Account creation lives at the120's /start; the login page links out to it so a
 * new student can reach onboarding. Proves: the link points at
 * https://the120.school/start?src=fplogin, opens in a new tab with
 * rel="noopener noreferrer" (no reverse tabnabbing), carries a >=44px tap target,
 * has no em dash, and the existing username/password login form is unaffected.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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

  it("opens in a new tab with a safe rel (no reverse tabnabbing)", () => {
    render(<Login />);
    const link = screen.getByRole("link", { name: /create an account/i });
    expect(link.getAttribute("target")).toBe("_blank");
    // target=_blank to an external origin MUST carry noopener (block window.opener
    // reverse-tabnabbing); noreferrer strips the Referer (attribution rides ?src).
    const rel = link.getAttribute("rel") ?? "";
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
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
    expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /log in/i })).toBeTruthy();
  });
});

describe("password visibility toggle", () => {
  it("starts hidden and reveals the password on toggle, then hides again", () => {
    render(<Login />);
    const input = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    expect(input.type).toBe("password");

    const toggle = screen.getByRole("button", { name: /show password/i });
    fireEvent.click(toggle);
    expect(input.type).toBe("text");
    // The same control now offers to hide, and reports its pressed state.
    const hide = screen.getByRole("button", { name: /hide password/i });
    expect(hide.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(hide);
    expect(input.type).toBe("password");
  });

  it("is a non-submitting button with a >=44px tap target", () => {
    render(<Login />);
    const toggle = screen.getByRole("button", { name: /show password/i });
    // type=button so toggling never submits the form on Enter/click.
    expect(toggle.getAttribute("type")).toBe("button");
    expect(toggle.className).toMatch(/min-h-\[44px\]/);
  });
});
