// @vitest-environment jsdom
/**
 * Landing "Start Building" CTA cutover (Slice B Unit 10, Plan Revision 11 — "no
 * half-live window"). Proves the flag-gated routing: with signup OFF the CTA
 * routes to `login` (Slice A behavior, the safe default that keeps a merged/
 * deployed branch from cutting over on its own); with signup ON it routes to the
 * in-app `signup` stage (the deliberate go-live flip). The routing is driven off
 * the injectable `signupEnabled` prop so the flag decision is unit-testable
 * without stubbing `import.meta.env`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const dispatch = vi.fn();
vi.mock("../../state/GameContext", () => ({ useGame: () => ({ dispatch }) }));

import { Landing } from "../Landing";

afterEach(() => {
  cleanup();
  dispatch.mockClear();
});

describe("Landing Start Building CTA cutover", () => {
  it("routes to login when the signup flag is OFF (default, no half-live window)", () => {
    render(<Landing signupEnabled={false} />);
    // Every CTA on the page honors the flag, not just the first — a regression
    // gating only CTA #1 while #2/#3 leak to signup must fail this test.
    const ctas = screen.getAllByRole("button", { name: /Start Building/i });
    expect(ctas.length).toBeGreaterThan(1);
    for (const cta of ctas) {
      dispatch.mockClear();
      fireEvent.click(cta);
      expect(dispatch).toHaveBeenCalledWith({ type: "SET_STAGE", stage: "login" });
      expect(dispatch).not.toHaveBeenCalledWith({ type: "SET_STAGE", stage: "signup" });
    }
  });

  it("routes to signup when the flag is ON (post go-live cutover)", () => {
    render(<Landing signupEnabled={true} />);
    // Every CTA on the page honors the flag, not just the first.
    const ctas = screen.getAllByRole("button", { name: /Start Building/i });
    expect(ctas.length).toBeGreaterThan(1);
    for (const cta of ctas) {
      dispatch.mockClear();
      fireEvent.click(cta);
      expect(dispatch).toHaveBeenCalledWith({ type: "SET_STAGE", stage: "signup" });
    }
  });
});
