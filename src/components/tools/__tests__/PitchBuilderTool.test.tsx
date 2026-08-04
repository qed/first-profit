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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PitchBuilderTool", () => {
  it("renders four accessible beat editors with the supplied targets", () => {
    render(<ControlledTool />);

    for (const beat of PITCH_BEATS) {
      expect(screen.getByLabelText(beat.label)).toBeTruthy();
      expect(document.body.textContent).toContain(`0 / ${beat.targetWords} words · ${beat.targetSeconds}s`);
    }
    expect(document.body.textContent).not.toMatch(/—/);
  });

  it("persists the beat and combined pitch while assessing a complete 120-word draft", () => {
    render(<ControlledTool />);

    PITCH_BEATS.forEach((beat, index) => {
      fireEvent.change(screen.getByLabelText(beat.label), {
        target: { value: words(beat.targetWords, `beat${index}`) },
      });
    });

    expect(screen.getByText("120 words")).toBeTruthy();
    expect(document.body.textContent).toMatch(/On pace for one minute at about 60 seconds/);
    expect(screen.getByLabelText("Saved combined pitch").textContent).toContain("beat0");
    expect(screen.getByLabelText("Saved combined pitch").textContent).toContain("beat3");
  });

  it("shows a saved legacy pitch divided into beats and migrates every beat on request", () => {
    const onFieldChange = vi.fn();
    render(<PitchBuilderTool fields={{ pitch: words(100) }} onFieldChange={onFieldChange} />);

    expect(screen.getByText("Your saved pitch is here.")).toBeTruthy();
    expect((screen.getByLabelText("1. Hook") as HTMLTextAreaElement).value).toBe(words(20));
    expect((screen.getByLabelText("4. The ask") as HTMLTextAreaElement).value).toBe(
      words(100).split(" ").slice(90).join(" "),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save as four beats" }));
    expect(onFieldChange).toHaveBeenCalledTimes(5);
    expect(PITCH_BEATS.every((beat) => onFieldChange.mock.calls.some(([key]) => key === beat.key))).toBe(true);
    expect(onFieldChange.mock.calls[onFieldChange.mock.calls.length - 1]?.[0]).toBe("pitch");
  });

  it("runs and resets the one-minute read-aloud timer", () => {
    vi.useFakeTimers();
    render(<ControlledTool />);

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

    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("timer").textContent).toBe("0:00");
    expect(screen.getByText("Time's up")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.getByRole("timer").textContent).toBe("1:00");
    expect(screen.getByRole("button", { name: "Pause run" })).toBeTruthy();
  });
});
