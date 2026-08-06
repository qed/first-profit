// @vitest-environment jsdom
/**
 * Onboarding DOM render checks. The live 390px pixel pass is auth + save gated
 * (Unit 12 E2E with a real The120 account); these render the REAL component with
 * a stubbed provider to pin the exact prototype copy, the em-dash-free rule, and
 * the screen-5 completion dispatch sequence.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Action } from "../../state/gameCore";

const dispatch = vi.fn();
let obValue = 2;

vi.mock("../../state/GameContext", () => ({
  useGame: () => ({
    ob: obValue,
    profile: { firstName: "Maya", handle: "maya", siteHeadline: "" },
    dispatch,
  }),
}));

// Force reduced motion so the typed reveal renders the full string synchronously.
vi.mock("framer-motion", () => ({ useReducedMotion: () => true }));

import { Onboarding } from "../Onboarding";

function renderAt(ob: number) {
  obValue = ob;
  dispatch.mockClear();
  return render(<Onboarding />);
}

afterEach(cleanup);

describe("Onboarding screens", () => {
  it("screen 2 shows the founder step with a read-only handle preview", () => {
    renderAt(2);
    expect(screen.getByText("Step 2 of 5 · The founder")).toBeTruthy();
    expect(screen.getByText("maya")).toBeTruthy();
    expect(screen.getByText("available")).toBeTruthy();
    fireEvent.click(screen.getByText("Claim my page →"));
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_OB", ob: 3 });
  });

  it("screen 3 reveals the website headline (age clause omitted, no invented field)", () => {
    renderAt(3);
    expect(screen.getByText("Step 3 of 5 · Website")).toBeTruthy();
    expect(screen.getByText("Maya, you have a website.")).toBeTruthy();
    // Reduced motion => full sentence, and it must NOT claim an age we do not have.
    expect(
      screen.getByText(/Hi, I'm Maya\. This is the future site of my first \$1,000 profit company\./),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/years old/);
  });

  it("screen 4 shows the exact money-booth checkmark copy", () => {
    renderAt(4);
    expect(screen.getByText("Step 4 of 5 · Stripe account")).toBeTruthy();
    expect(
      screen.getByText(
        "Money is taken by Stripe through the First Profit account. At any time, you can take over how money flows.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Payouts are released to the parent regularly. Store credit sits in the website app connected to the email address that made the purchase.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("$10 → $20")).toBeTruthy();
    // The checkout pointer is a plain caption, never a button-shaped
    // affordance (BUG-004: an inert "button" reads as broken).
    const checkout = screen.getByText("Your live checkout unlocks on your factory floor.");
    expect(checkout.tagName).toBe("P");
  });

  it("screen 5 completion seeds Idea #1, marks onboarding complete, enters app", () => {
    renderAt(5);
    expect(screen.getByText("Step 5 of 5 · The Path")).toBeTruthy();
    expect(screen.getByText("You start here")).toBeTruthy();
    fireEvent.click(screen.getByText("Start Unit Task #1 →"));
    const dispatched = dispatch.mock.calls.map((c) => c[0] as Action);
    expect(dispatched).toEqual([
      // The idea's stable id is minted at the dispatch boundary (Unit 7).
      { type: "CREATE_IDEA", ideaId: expect.any(String) },
      { type: "SET_ONBOARDING_COMPLETE" },
      { type: "SET_STAGE", stage: "app" },
    ]);
  });

  it("has no em dashes anywhere across the four screens", () => {
    for (const ob of [2, 3, 4, 5]) {
      const { container } = renderAt(ob);
      expect(container.textContent).not.toContain("—");
      cleanup();
    }
  });
});

/**
 * Unit 5 flag-off proof: with VITE_ENABLE_PUBLIC_SITE off (the default test
 * env, and this file's provider stub carries NO site slice at all), the claim
 * UI never mounts and onboarding renders exactly the pre-Unit-5 markup. The
 * flag-ON behavior lives in OnboardingClaim.test.tsx.
 */
describe("public-site flag off: no claim UI", () => {
  it("screen 2 renders the static preview, no handle input, no live region", () => {
    renderAt(2);
    expect(screen.queryByLabelText("Page name")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("available")).toBeTruthy();
  });

  it("screen 3 keeps the static live chip with no going-live copy and no nudge", () => {
    renderAt(3);
    expect(screen.getByText("● live")).toBeTruthy();
    expect(document.body.textContent).not.toContain("going live");
    expect(document.body.textContent).not.toContain("Tip: write your own headline");
  });
});
