// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Band } from "../../../data/path";
import {
  OBJECTION_LOG_FIELD_KEYS,
  type ObjectionFields,
} from "../../../lib/objectionLog";
import { ObjectionLogTool } from "../ObjectionLogTool";

function ControlledTool({
  band = "g6_8",
  initial = {},
  onTaskComplete,
}: {
  band?: Band;
  initial?: ObjectionFields;
  onTaskComplete?: () => void;
}) {
  const [fields, setFields] = React.useState<ObjectionFields>(initial);
  return (
    <>
      <ObjectionLogTool
        band={band}
        fields={fields}
        onFieldChange={(key, value) => setFields((current) => ({ ...current, [key]: value }))}
        onTaskComplete={onTaskComplete}
      />
      <output aria-label="Saved pitch why">{fields.pitchWhy ?? ""}</output>
      <output aria-label="Saved composed pitch">{fields.pitch ?? ""}</output>
      <output aria-label="Saved objection summary">{fields[OBJECTION_LOG_FIELD_KEYS.summary] ?? ""}</output>
    </>
  );
}

afterEach(cleanup);

describe("ObjectionLogTool", () => {
  it("captures the exact objection and reveals parent prompts without filling evidence", () => {
    render(<ControlledTool />);

    fireEvent.click(screen.getByRole("button", { name: "Need a parent prompt?" }));
    expect(screen.getByText("“Why would I need that?”")).toBeTruthy();
    expect((screen.getByLabelText("The objection, in their exact words") as HTMLTextAreaElement).value).toBe("");

    fireEvent.change(screen.getByLabelText("The objection, in their exact words"), {
      target: { value: "Why is this better than a normal card?" },
    });
    expect(screen.getByRole("status", { name: "Objection Log status" }).textContent).toContain(
      "Choose the part",
    );
  });

  it("revises one beat, updates the saved pitch, creates evidence, and completes", () => {
    const onTaskComplete = vi.fn();
    render(
      <ControlledTool
        initial={{
          pitchHook: "What story is hiding on your street?",
          pitchWhat: "I make custom neighborhood cards.",
          pitchWhy: "They are fun.",
          pitchAsk: "Choose your first pack.",
        }}
        onTaskComplete={onTaskComplete}
      />,
    );

    fireEvent.change(screen.getByLabelText("The objection, in their exact words"), {
      target: { value: "Why would I need these?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /3\. Why it is good/ }));
    const revision = screen.getByLabelText("Stronger version") as HTMLTextAreaElement;
    expect(revision.value).toBe("They are fun.");
    expect((screen.getByRole("button", { name: "Apply revision" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(revision, {
      target: { value: "They turn neighborhood history into a game you can collect." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply revision" }));

    expect(screen.getByLabelText("Saved pitch why").textContent).toBe(
      "They turn neighborhood history into a game you can collect.",
    );
    expect(screen.getByLabelText("Saved composed pitch").textContent).toContain(
      "What story is hiding on your street?",
    );
    expect(screen.getByLabelText("Saved objection summary").textContent).toContain(
      "Why would I need these?",
    );
    expect(screen.getByText("Revision locked in")).toBeTruthy();
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });

  it("shows the older-student live-answer challenge without making it a gate", () => {
    render(<ControlledTool band="g9_12" />);

    expect(screen.getByText("Answer a second objection live")).toBeTruthy();
    expect(screen.getByLabelText("Second objection")).toBeTruthy();
    expect(screen.getByLabelText("What you answered out loud")).toBeTruthy();
    expect(document.body.textContent).toContain("does not block completion");
  });

  it("adapts the coaching copy for younger learners", () => {
    render(<ControlledTool band="g3_5" />);
    expect(document.body.textContent).toContain("Your parent can type exactly what you say");
  });

  it("restores completed evidence and reports task completion once", () => {
    const onTaskComplete = vi.fn();
    render(
      <ControlledTool
        initial={{
          [OBJECTION_LOG_FIELD_KEYS.exact]: "Why is it worth it?",
          [OBJECTION_LOG_FIELD_KEYS.beat]: "pitchAsk",
          [OBJECTION_LOG_FIELD_KEYS.original]: "Buy one.",
          [OBJECTION_LOG_FIELD_KEYS.revision]: "Choose one pack and get a custom card.",
          [OBJECTION_LOG_FIELD_KEYS.applied]: "true",
        }}
        onTaskComplete={onTaskComplete}
      />,
    );

    expect(screen.getByText("Revision locked in")).toBeTruthy();
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });

  it("keeps completion while an older learner adds the optional live challenge", () => {
    const onTaskComplete = vi.fn();
    render(
      <ControlledTool
        band="g9_12"
        initial={{
          [OBJECTION_LOG_FIELD_KEYS.exact]: "Why is it worth it?",
          [OBJECTION_LOG_FIELD_KEYS.beat]: "pitchAsk",
          [OBJECTION_LOG_FIELD_KEYS.original]: "Buy one.",
          [OBJECTION_LOG_FIELD_KEYS.revision]: "Choose one pack and get a custom card.",
          [OBJECTION_LOG_FIELD_KEYS.applied]: "true",
        }}
        onTaskComplete={onTaskComplete}
      />,
    );

    fireEvent.change(screen.getByLabelText("Second objection"), {
      target: { value: "Who checks the stories?" },
    });
    fireEvent.change(screen.getByLabelText("What you answered out loud"), {
      target: { value: "I confirm each one with a local adult." },
    });

    expect(screen.getByText("Revision locked in")).toBeTruthy();
    expect(screen.getByLabelText("Saved objection summary").textContent).toContain(
      "Who checks the stories?",
    );
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });
});
