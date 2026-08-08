// @vitest-environment jsdom
/**
 * Shared Carousel (fpv03 U1) — the ONE carousel for S01/S06/S07/S09. Proves:
 * one slide at a time; next/prev wrap; dots jump directly; swipe advances
 * (past the threshold) and short drags do not; empty slides render nothing.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Carousel } from "../Carousel";

const slides = [<p key="a">Slide A</p>, <p key="b">Slide B</p>, <p key="c">Slide C</p>];

afterEach(cleanup);

function touch(el: Element, fromX: number, toX: number) {
  fireEvent.touchStart(el, { touches: [{ clientX: fromX }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: toX }] });
}

describe("Carousel", () => {
  it("renders one slide at a time; next and prev wrap around", () => {
    render(<Carousel ariaLabel="Examples" slides={slides} />);
    expect(screen.getByText("Slide A")).toBeTruthy();
    expect(screen.queryByText("Slide B")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "Next" })[0]);
    expect(screen.getByText("Slide B")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Previous" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Previous" })[0]);
    expect(screen.getByText("Slide C")).toBeTruthy();
  });

  it("dots jump straight to a slide and mark the active one selected", () => {
    render(<Carousel ariaLabel="Examples" slides={slides} />);
    fireEvent.click(screen.getByRole("tab", { name: /item 3 of 3/i }));
    expect(screen.getByText("Slide C")).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: /item 3 of 3/i }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("swipe left advances, swipe right goes back, short drags do nothing", () => {
    render(<Carousel ariaLabel="Examples" slides={slides} />);
    const slide = screen.getByText("Slide A").parentElement as Element;
    touch(slide, 300, 100); // long left swipe -> next
    expect(screen.getByText("Slide B")).toBeTruthy();
    touch(screen.getByText("Slide B").parentElement as Element, 100, 300); // right -> back
    expect(screen.getByText("Slide A")).toBeTruthy();
    touch(screen.getByText("Slide A").parentElement as Element, 210, 200); // short drag
    expect(screen.getByText("Slide A")).toBeTruthy();
  });

  it("ignores a mostly-vertical (diagonal) drag so page scrolling never changes slides", () => {
    render(<Carousel ariaLabel="Examples" slides={slides} />);
    const slide = screen.getByText("Slide A").parentElement as Element;
    // 60px of horizontal drift during a 120px vertical scroll: not a swipe.
    fireEvent.touchStart(slide, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(slide, { changedTouches: [{ clientX: 140, clientY: 220 }] });
    expect(screen.getByText("Slide A")).toBeTruthy();
  });

  it("moves selection and focus with arrow keys on the dot tablist (wrapping)", () => {
    render(<Carousel ariaLabel="Examples" slides={slides} />);
    const tablist = screen.getByRole("tablist");
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByText("Slide B")).toBeTruthy();
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(screen.getByText("Slide C")).toBeTruthy();
    // Roving tabindex: only the active dot is in the tab order.
    const dots = screen.getAllByRole("tab");
    expect(dots.filter((d) => d.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it("notifies onIndexChange for arrows, dots, and swipes", () => {
    const seen: number[] = [];
    render(
      <Carousel ariaLabel="Examples" slides={slides} onIndexChange={(i) => seen.push(i)} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Next" })[0]);
    fireEvent.click(screen.getByRole("tab", { name: /item 1 of 3/i }));
    touch(screen.getByText("Slide A").parentElement as Element, 300, 100);
    expect(seen).toEqual([1, 0, 1]);
  });

  it("applies per-dot colors when dotColors is provided, active dot at full strength", () => {
    render(
      <Carousel
        ariaLabel="Examples"
        slides={slides}
        dotColors={["bg-sell", "bg-build", "bg-validate"]}
      />,
    );
    const pills = screen
      .getAllByRole("tab")
      .map((d) => d.querySelector("span") as HTMLSpanElement);
    expect(pills[0].className).toContain("bg-sell");
    expect(pills[0].className).not.toContain("opacity-35"); // active
    expect(pills[1].className).toContain("bg-build");
    expect(pills[1].className).toContain("opacity-35"); // inactive, muted
    expect(pills[2].className).toContain("bg-validate");
  });

  it("renders nothing with zero slides", () => {
    const { container } = render(<Carousel ariaLabel="Empty" slides={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
