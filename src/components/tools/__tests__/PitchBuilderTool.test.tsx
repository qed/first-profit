// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PITCH_BEATS, type PitchFields } from "../../../lib/pitch";
import { PitchBuilderTool } from "../PitchBuilderTool";

function words(count: number, prefix = "word"): string {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(" ");
}

function ControlledTool({ initial = {} }: { initial?: PitchFields }) {
  const [fields, setFields] = React.useState<PitchFields>(initial);
  return (
    <>
      <PitchBuilderTool
        fields={fields}
        onFieldChange={(key, value) => setFields((current) => ({ ...current, [key]: value }))}
      />
      <output aria-label="Saved combined pitch">{fields.pitch}</output>
    </>
  );
}

function moveToNextScreen() {
  const button = screen.getByRole("button", {
    name: /Continue to|Review the full pitch/,
  });
  fireEvent.click(button);
}

function moveToReview() {
  for (let index = 0; index < PITCH_BEATS.length; index += 1) {
    moveToNextScreen();
  }
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PitchBuilderTool", () => {
  it("shows one focused beat at a time with visible progress", () => {
    render(<ControlledTool />);

    expect(screen.getByLabelText("1. Hook")).toBeTruthy();
    expect(screen.queryByLabelText("2. What it is")).toBeNull();
    expect(screen.getByLabelText("Step 1 of 5: Hook")).toBeTruthy();
    expect(document.body.textContent).toContain("Suggested share · 20 words · 10s");

    moveToNextScreen();
    expect(screen.getByLabelText("2. What it is")).toBeTruthy();
    expect(screen.queryByLabelText("1. Hook")).toBeNull();
    expect(screen.getByLabelText("Step 2 of 5: What it is")).toBeTruthy();
  });

  it("persists every beat and assesses the complete pitch on the review screen", () => {
    render(<ControlledTool />);

    PITCH_BEATS.forEach((beat, index) => {
      fireEvent.change(screen.getByLabelText(beat.label), {
        target: { value: words(beat.targetWords, `beat${index}`) },
      });
      moveToNextScreen();
    });

    expect(screen.getByText("Review the full pitch")).toBeTruthy();
    expect(screen.getAllByText("120 words").length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/On pace for one minute at about 60 seconds/);
    expect(screen.getByLabelText("Saved combined pitch").textContent).toContain("beat0");
    expect(screen.getByLabelText("Saved combined pitch").textContent).toContain("beat3");
  });

  it("does not treat one word over a beat guide as an error", () => {
    render(<ControlledTool />);
    fireEvent.change(screen.getByLabelText("1. Hook"), {
      target: { value: words(21) },
    });

    expect(screen.getByLabelText("Beat space guide").textContent).toContain(
      "A comfortable share of the minute",
    );
    expect(screen.getByLabelText("Beat space guide").textContent).not.toMatch(
      /wrong|not yet|cut/i,
    );
  });

  it("shows a saved legacy pitch and migrates every beat on request", () => {
    const onFieldChange = vi.fn();
    render(<PitchBuilderTool fields={{ pitch: words(100) }} onFieldChange={onFieldChange} />);

    expect(screen.getByText("Your saved pitch is here.")).toBeTruthy();
    expect((screen.getByLabelText("1. Hook") as HTMLTextAreaElement).value).toBe(words(20));
    fireEvent.click(screen.getByRole("button", { name: "Save as four beats" }));
    expect(onFieldChange).toHaveBeenCalledTimes(5);
    expect(PITCH_BEATS.every((beat) => onFieldChange.mock.calls.some(([key]) => key === beat.key))).toBe(true);
    expect(onFieldChange.mock.calls[onFieldChange.mock.calls.length - 1]?.[0]).toBe("pitch");
  });

  it("lets the founder jump from review back to any beat", () => {
    render(<ControlledTool />);
    moveToReview();
    fireEvent.click(screen.getByRole("button", { name: "Edit 2. What it is" }));
    expect(screen.getByLabelText("2. What it is")).toBeTruthy();
  });

  it("runs and resets the one-minute read-aloud timer on the review screen", () => {
    vi.useFakeTimers();
    render(<ControlledTool />);
    moveToReview();

    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer").textContent).toBe("0:59");
    expect(screen.getByRole("button", { name: "Pause run" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset timer" }));
    expect(screen.getByRole("timer").textContent).toBe("1:00");
  });

  it("stops at zero with a clear time-up state and can start again", () => {
    vi.useFakeTimers();
    render(<ControlledTool />);
    moveToReview();

    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("timer").textContent).toBe("0:00");
    expect(screen.getByText("Time's up")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.getByRole("timer").textContent).toBe("1:00");
    expect(screen.getByRole("button", { name: "Pause run" })).toBeTruthy();
  });
});
