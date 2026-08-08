// @vitest-environment jsdom
/**
 * Landing (fpv03 S01, U1). The CTA model changed at fpv03 U1 (flow M1):
 * production parent signup is the120's /start funnel, so every Start-class CTA
 * is a plain LINK to the funnel URL, not a stage dispatch. The old
 * VITE_ENABLE_SIGNUP routing no longer drives these CTAs. `startUrl` is a prop
 * so the routing is unit-testable without env stubs.
 *
 * Also proves the S01 example carousel is wired: five examples, one visible at
 * a time, next/prev advance and wrap.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../state/GameContext", () => ({ useGame: () => ({ dispatch: vi.fn() }) }));

// The default (prop-less) path is how App.tsx actually renders Landing in
// production: it must wire getStartFunnelUrl() into every CTA href.
vi.mock("../../config", () => ({
  getStartFunnelUrl: () => "https://config-derived.test/start",
}));

import { Landing } from "../Landing";

const START = "https://t120.test/start";

afterEach(() => {
  cleanup();
});

describe("Landing CTAs (fpv03 U1)", () => {
  it("every Start CTA links to the live enrollment funnel", () => {
    render(<Landing startUrl={START} />);
    const links = [
      ...screen.getAllByRole("link", { name: /Start Building/i }),
      ...screen.getAllByRole("link", { name: /Start your story/i }),
    ];
    // Hero CTA + carousel-section CTA at minimum; every one points at /start.
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe(START);
    }
    // Regression: no Start-class CTA remains a stage-dispatch button.
    expect(screen.queryByRole("button", { name: /Start Building/i })).toBeNull();
  });

  it("without the prop (the production path), CTAs use getStartFunnelUrl()", () => {
    render(<Landing />);
    for (const link of screen.getAllByRole("link", { name: /Start (Building|your story)/i })) {
      expect(link.getAttribute("href")).toBe("https://config-derived.test/start");
    }
  });
});

describe("Landing example carousel (fpv03 S01)", () => {
  it("shows one example at a time and advances with next, wrapping around", () => {
    render(<Landing startUrl={START} />);
    // First slide: the Meet-the-hero example (copy per user, 2026-08-08).
    expect(screen.getByText(/Meet the hero/i)).toBeTruthy();
    expect(screen.getByText(/Peter Parker/i)).toBeTruthy();
    expect(screen.queryByText(/The showcase pitch/i)).toBeNull();

    const next = screen.getAllByRole("button", { name: /^Next$/i })[0];
    fireEvent.click(next);
    // Story order fixed per founder feedback: slide 2 is the costs example.
    expect(screen.getByText(/Count every cost/i)).toBeTruthy();
    expect(screen.getByText(/Accountant, age 9/i)).toBeTruthy();
    expect(screen.queryByText(/Meet the hero/i)).toBeNull();

    // Wrap: 4 more nexts land back on slide 1.
    for (let i = 0; i < 4; i++) fireEvent.click(next);
    expect(screen.getByText(/Meet the hero/i)).toBeTruthy();
  });

  it("prev from the first slide wraps to the last (the showcase pitch)", () => {
    render(<Landing startUrl={START} />);
    const prev = screen.getAllByRole("button", { name: /^Previous$/i })[0];
    fireEvent.click(prev);
    expect(screen.getByText(/The showcase pitch/i)).toBeTruthy();
    expect(
      screen.getByText(/organized an event to showcase my progress/i),
    ).toBeTruthy();
  });
});
