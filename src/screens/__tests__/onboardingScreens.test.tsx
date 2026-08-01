// @vitest-environment jsdom
/**
 * Shared onboarding screens (Slice B Unit 7) — proves each of screens 2..5
 * renders and navigates from PROPS ALONE, with NO game context / no useGame
 * mock. This is the decoupling guarantee that lets the parent signup flow
 * (Units 8-10) reuse the same four screens driven by signup-local state.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  FounderProfile,
  WebsiteReveal,
  MoneyBooth,
  ThePath,
} from "../onboarding/screens";

// Force reduced motion so the typed reveal renders the full string synchronously.
vi.mock("framer-motion", () => ({ useReducedMotion: () => true }));

afterEach(cleanup);

describe("FounderProfile (props-driven)", () => {
  it("renders founder copy + a derived handle preview from props", () => {
    render(
      <FounderProfile firstName="Maya" handle="" onFirstNameChange={vi.fn()} onNext={vi.fn()} />,
    );
    expect(screen.getByText("Step 2 of 5 · The founder")).toBeTruthy();
    // Empty handle falls back to a slug of the first name.
    expect(screen.getByText("maya")).toBeTruthy();
    expect(screen.getByText("available")).toBeTruthy();
  });

  it("prefers an explicit handle over the name slug", () => {
    render(
      <FounderProfile
        firstName="Maya"
        handle="mayamakes"
        onFirstNameChange={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText("mayamakes")).toBeTruthy();
  });

  it("calls onFirstNameChange on input and onNext when a name is present", () => {
    const onFirstNameChange = vi.fn();
    const onNext = vi.fn();
    render(
      <FounderProfile
        firstName="Maya"
        handle=""
        onFirstNameChange={onFirstNameChange}
        onNext={onNext}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Alex"), { target: { value: "Mayo" } });
    expect(onFirstNameChange).toHaveBeenCalledWith("Mayo");
    fireEvent.click(screen.getByText("Claim my page →"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("does NOT advance when the first name is empty (guarded onNext)", () => {
    const onNext = vi.fn();
    render(
      <FounderProfile firstName="   " handle="" onFirstNameChange={vi.fn()} onNext={onNext} />,
    );
    fireEvent.click(screen.getByText("Claim my page →"));
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe("WebsiteReveal (props-driven)", () => {
  it("renders the headline from props and omits any age clause", () => {
    render(<WebsiteReveal firstName="Maya" handle="maya" onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("Step 3 of 5 · Website")).toBeTruthy();
    expect(screen.getByText("Maya, you have a website.")).toBeTruthy();
    expect(
      screen.getByText(/Hi, I'm Maya\. This is the future site of my first \$1,000 profit company\./),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/years old/);
  });

  it("navigates forward and back via props", () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<WebsiteReveal firstName="Maya" handle="maya" onNext={onNext} onBack={onBack} />);
    fireEvent.click(screen.getByText("My money booth next →"));
    expect(onNext).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("← Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("falls back to 'Founder' when the first name is blank", () => {
    render(<WebsiteReveal firstName="  " handle="" onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("Founder, you have a website.")).toBeTruthy();
  });
});

describe("MoneyBooth (props-driven)", () => {
  it("renders the exact checkmark copy and tier chips", () => {
    render(<MoneyBooth onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("Step 4 of 5 · Stripe account")).toBeTruthy();
    expect(
      screen.getByText(
        "Money is taken by Stripe through the First Profit account. At any time, you can take over how money flows.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("$10 → $20")).toBeTruthy();
    const checkout = screen.getByText("See your live checkout ↗") as HTMLButtonElement;
    expect(checkout.getAttribute("aria-disabled")).toBe("true");
    expect(checkout.disabled).toBe(false);
  });

  it("navigates forward and back via props", () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<MoneyBooth onNext={onNext} onBack={onBack} />);
    fireEvent.click(screen.getByText("Show me The Path →"));
    expect(onNext).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("← Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("ThePath (props-driven)", () => {
  it("renders the five phase rows and fires onComplete / onBack via props", () => {
    const onComplete = vi.fn();
    const onBack = vi.fn();
    render(<ThePath onComplete={onComplete} onBack={onBack} />);
    expect(screen.getByText("Step 5 of 5 · The Path")).toBeTruthy();
    expect(screen.getByText("You start here")).toBeTruthy();
    fireEvent.click(screen.getByText("Start Unit Task #1 →"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("← Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("no em dashes across the shared screens", () => {
  it("renders no em dash in any of the four screens", () => {
    const screens = [
      <FounderProfile key="2" firstName="Maya" handle="" onFirstNameChange={vi.fn()} onNext={vi.fn()} />,
      <WebsiteReveal key="3" firstName="Maya" handle="maya" onNext={vi.fn()} onBack={vi.fn()} />,
      <MoneyBooth key="4" onNext={vi.fn()} onBack={vi.fn()} />,
      <ThePath key="5" onComplete={vi.fn()} onBack={vi.fn()} />,
    ];
    for (const node of screens) {
      const { container } = render(node);
      expect(container.textContent).not.toContain("—");
      cleanup();
    }
  });
});
