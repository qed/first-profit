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

// ── Real claim UI (real-public-site plan, Unit 5) — props-driven only ────────

function claimProps(overrides: Partial<import("../onboarding/screens").FounderProfileClaim> = {}) {
  return {
    handleValue: "maya",
    onHandleChange: vi.fn(),
    badge: "available" as const,
    suggestions: [],
    onPickSuggestion: vi.fn(),
    notice: null,
    claimed: false,
    claiming: false,
    ...overrides,
  };
}

describe("FounderProfile claim UI (props-driven)", () => {
  it("renders the badge inside an ARIA live region and keeps it mounted when empty", () => {
    const { rerender } = render(
      <FounderProfile
        firstName="Maya"
        handle=""
        onFirstNameChange={vi.fn()}
        onNext={vi.fn()}
        claim={claimProps({ badge: "pending" })}
      />,
    );
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toContain("checking…");
    rerender(
      <FounderProfile
        firstName="Maya"
        handle=""
        onFirstNameChange={vi.fn()}
        onNext={vi.fn()}
        claim={claimProps({ badge: "none" })}
      />,
    );
    // The live region survives the state change (announcements need a stable node).
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it.each([
    ["available", "available"],
    ["taken", "taken"],
    ["yours", "yours"],
    ["invalid", "can't use that one"],
    ["short", "keep typing"],
  ] as const)("badge %s renders '%s'", (badge, text) => {
    render(
      <FounderProfile
        firstName="Maya"
        handle=""
        onFirstNameChange={vi.fn()}
        onNext={vi.fn()}
        claim={claimProps({ badge })}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe(text);
  });

  it("shows the normalized handle in an editable input and reports raw keystrokes", () => {
    const onHandleChange = vi.fn();
    render(
      <FounderProfile
        firstName="Maya"
        handle=""
        onFirstNameChange={vi.fn()}
        onNext={vi.fn()}
        claim={claimProps({ handleValue: "maya-c", onHandleChange })}
      />,
    );
    const input = screen.getByLabelText("Page name") as HTMLInputElement;
    expect(input.value).toBe("maya-c");
    fireEvent.change(input, { target: { value: "Maya C!" } });
    expect(onHandleChange).toHaveBeenCalledWith("Maya C!");
  });

  it("renders suggestion chips with ~44px tap targets and one-tap pick", () => {
    const onPickSuggestion = vi.fn();
    render(
      <FounderProfile
        firstName="Maya"
        handle=""
        onFirstNameChange={vi.fn()}
        onNext={vi.fn()}
        claim={claimProps({
          badge: "taken",
          suggestions: ["maya-c", "mayaco"],
          onPickSuggestion,
        })}
      />,
    );
    expect(screen.getByText("Still free")).toBeTruthy();
    const chip = screen.getByText("maya-c").closest("button") as HTMLButtonElement;
    expect(chip.className).toContain("min-h-[44px]");
    fireEvent.click(chip);
    expect(onPickSuggestion).toHaveBeenCalledWith("maya-c");
  });

  it("renders a hostile suggestion string as inert text (React escaping only)", () => {
    render(
      <FounderProfile
        firstName="Maya"
        handle=""
        onFirstNameChange={vi.fn()}
        onNext={vi.fn()}
        claim={claimProps({
          badge: "taken",
          suggestions: ['<img src=x onerror=alert(1)>', "<b>bold</b>"],
        })}
      />,
    );
    // The strings appear as literal TEXT; no element was ever created from them.
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(screen.getByText("<b>bold</b>")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("button b")).toBeNull();
  });

  it("shows the race-retry inline copy with refreshed suggestions (no dead end)", () => {
    render(
      <FounderProfile
        firstName="Maya"
        handle=""
        onFirstNameChange={vi.fn()}
        onNext={vi.fn()}
        claim={claimProps({ badge: "taken", suggestions: ["maya-c"], notice: "race" })}
      />,
    );
    expect(
      screen.getByText(
        "Oh no, someone just grabbed that name. Pick one that's still free, or type a new one.",
      ),
    ).toBeTruthy();
    // Manual entry stays open alongside the chips.
    expect(screen.getByLabelText("Page name")).toBeTruthy();
    expect(screen.getByText("maya-c")).toBeTruthy();
  });

  it("shows the kid-friendly server-refusal (invalid) message", () => {
    // The copy renders the SERVER's `invalid` verdict (blocklist/reserved/
    // format) — the client ships no term list (Unit 5 review, P2).
    render(
      <FounderProfile
        firstName="Maya"
        handle=""
        onFirstNameChange={vi.fn()}
        onNext={vi.fn()}
        claim={claimProps({ notice: "invalid", badge: "invalid" })}
      />,
    );
    expect(
      screen.getByText("That name can't be used for your page. Try a different one."),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("can't use that one");
  });

  it("claimed resume state: URL locked, no input, no spinner, CTA advances", () => {
    const onNext = vi.fn();
    render(
      <FounderProfile
        firstName="Maya"
        handle=""
        onFirstNameChange={vi.fn()}
        onNext={onNext}
        claim={claimProps({ claimed: true, badge: "yours", handleValue: "maya" })}
      />,
    );
    expect(screen.queryByLabelText("Page name")).toBeNull();
    expect(screen.getByText("maya")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("yours");
    expect(screen.getByText("This page is yours. Let's keep going.")).toBeTruthy();
    fireEvent.click(screen.getByText("Keep going →"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("claiming state disables the CTA, the handle input, AND the suggestion chips", () => {
    const onNext = vi.fn();
    const onPickSuggestion = vi.fn();
    render(
      <FounderProfile
        firstName="Maya"
        handle=""
        onFirstNameChange={vi.fn()}
        onNext={onNext}
        claim={claimProps({
          claiming: true,
          badge: "taken",
          suggestions: ["maya-c"],
          onPickSuggestion,
        })}
      />,
    );
    const cta = screen.getByText("Claiming…").closest("button") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    fireEvent.click(cta);
    expect(onNext).not.toHaveBeenCalled();
    // The input freezes so a claim can never land for retyped text…
    expect((screen.getByLabelText("Page name") as HTMLInputElement).disabled).toBe(true);
    // …and the chips are busy-consistent with the CTA (one claim at a time).
    const chip = screen.getByText("maya-c").closest("button") as HTMLButtonElement;
    expect(chip.disabled).toBe(true);
    fireEvent.click(chip);
    expect(onPickSuggestion).not.toHaveBeenCalled();
  });

  it("shows the public-name nudge copy while editing", () => {
    render(
      <FounderProfile
        firstName="Maya"
        handle=""
        onFirstNameChange={vi.fn()}
        onNext={vi.fn()}
        claim={claimProps()}
      />,
    );
    expect(
      screen.getByText("Tip: first names work best. Your page name is public, so skip your full name."),
    ).toBeTruthy();
  });
});

describe("WebsiteReveal live states (props-driven)", () => {
  it("going-live: honest chip, URL still shown, NO share encouragement, R20 nudge", () => {
    render(
      <WebsiteReveal
        firstName="Maya"
        handle="maya"
        onNext={vi.fn()}
        onBack={vi.fn()}
        liveState="going-live"
      />,
    );
    expect(screen.getByText("going live…")).toBeTruthy();
    expect(screen.getByText("firstprofit.school/maya")).toBeTruthy();
    expect(
      screen.getByText("Your page is going live. In a minute or two it will be real at that link."),
    ).toBeTruthy();
    // No share encouragement while not live (R19).
    expect(document.body.textContent).not.toContain("Anyone you send that link to");
    expect(document.body.textContent).not.toContain("● live");
    // R20 soft nudge.
    expect(
      screen.getByText("Tip: write your own headline in your Site room, so your page sounds like you."),
    ).toBeTruthy();
  });

  it("live: real live chip plus the share line and the R20 nudge", () => {
    render(
      <WebsiteReveal
        firstName="Maya"
        handle="maya"
        onNext={vi.fn()}
        onBack={vi.fn()}
        liveState="live"
      />,
    );
    expect(screen.getByText("● live")).toBeTruthy();
    expect(screen.getByText("It's real. Anyone you send that link to can see your page.")).toBeTruthy();
    expect(
      screen.getByText("Tip: write your own headline in your Site room, so your page sounds like you."),
    ).toBeTruthy();
  });

  it("legacy (no liveState): the original static chip, no nudge, no share line", () => {
    render(<WebsiteReveal firstName="Maya" handle="maya" onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("● live")).toBeTruthy();
    expect(document.body.textContent).not.toContain("going live");
    expect(document.body.textContent).not.toContain("Tip: write your own headline");
  });
});

describe("no em dashes across the claim/live states", () => {
  it("renders no em dash in the claim UI or live states", () => {
    const nodes = [
      <FounderProfile
        key="claim"
        firstName="Maya"
        handle=""
        onFirstNameChange={vi.fn()}
        onNext={vi.fn()}
        claim={claimProps({ badge: "taken", suggestions: ["maya-c"], notice: "race" })}
      />,
      <FounderProfile
        key="claimed"
        firstName="Maya"
        handle=""
        onFirstNameChange={vi.fn()}
        onNext={vi.fn()}
        claim={claimProps({ claimed: true, badge: "yours" })}
      />,
      <WebsiteReveal
        key="going"
        firstName="Maya"
        handle="maya"
        onNext={vi.fn()}
        onBack={vi.fn()}
        liveState="going-live"
      />,
      <WebsiteReveal
        key="live"
        firstName="Maya"
        handle="maya"
        onNext={vi.fn()}
        onBack={vi.fn()}
        liveState="live"
      />,
    ];
    for (const node of nodes) {
      const { container } = render(node);
      expect(container.textContent).not.toContain("—");
      cleanup();
    }
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
