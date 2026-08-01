// @vitest-environment jsdom
//
// The shared modal focus trap (Units 10-11 a11y review): Tab off the last
// focusable element wraps to the first, and Shift+Tab off the first wraps to the
// last, so a keyboard user cannot tab out of an aria-modal dialog.
import { describe, it, expect, afterEach } from "vitest";
import React, { useRef } from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { useFocusTrap } from "../useFocusTrap";

function Dialog({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} tabIndex={-1} data-testid="panel">
      {useFocusTrap(ref, active)}
      <button data-testid="first">first</button>
      <button data-testid="mid">mid</button>
      <button data-testid="last">last</button>
    </div>
  );
}

afterEach(() => cleanup());

describe("useFocusTrap", () => {
  it("Tab off the last focusable wraps to the first", () => {
    const { getByTestId } = render(<Dialog active />);
    const panel = getByTestId("panel");
    const first = getByTestId("first");
    const last = getByTestId("last");
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(panel, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("Shift+Tab off the first focusable wraps to the last", () => {
    const { getByTestId } = render(<Dialog active />);
    const panel = getByTestId("panel");
    const first = getByTestId("first");
    const last = getByTestId("last");
    first.focus();
    fireEvent.keyDown(panel, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("does nothing when inactive", () => {
    const { getByTestId } = render(<Dialog active={false} />);
    const panel = getByTestId("panel");
    const last = getByTestId("last");
    last.focus();
    fireEvent.keyDown(panel, { key: "Tab" });
    // No trap wired → focus stays where the browser default would leave it (jsdom
    // does not advance focus on synthetic Tab), i.e. still on last.
    expect(document.activeElement).toBe(last);
  });
});
