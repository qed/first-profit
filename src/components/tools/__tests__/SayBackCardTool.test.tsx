// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Band } from "../../../data/path";
import {
  SAY_BACK_FIELD_KEYS,
  type SayBackFields,
} from "../../../lib/sayBack";
import { SayBackCardTool } from "../SayBackCardTool";

function ControlledTool({
  band = "g6_8",
  initial = {},
  onTaskComplete,
}: {
  band?: Band;
  initial?: SayBackFields;
  onTaskComplete?: () => void;
}) {
  const [fields, setFields] = React.useState<SayBackFields>(initial);
  return (
    <>
      <SayBackCardTool
        band={band}
        fields={fields}
        onFieldChange={(key, value) => setFields((current) => ({ ...current, [key]: value }))}
        onTaskComplete={onTaskComplete}
      />
      <output aria-label="Saved say-back outcome">{fields[SAY_BACK_FIELD_KEYS.outcome] ?? ""}</output>
      <output aria-label="Saved say-back summary">{fields[SAY_BACK_FIELD_KEYS.summary] ?? ""}</output>
    </>
  );
}

function fillListenerAndSayBack() {
  fireEvent.change(screen.getByLabelText(/Adult's first name or role/), {
    target: { value: "Coach Lee" },
  });
  fireEvent.change(screen.getByLabelText(/Date of the pitch/), {
    target: { value: "2026-08-06" },
  });
  fireEvent.change(screen.getByLabelText("What did they think you sell?"), {
    target: { value: "Custom cards about neighborhood history" },
  });
  fireEvent.change(screen.getByLabelText("What did they think you asked?"), {
    target: { value: "Choose a first card pack" },
  });
}

afterEach(cleanup);

describe("SayBackCardTool", () => {
  it("adapts the listener guidance by grade band and limits personal data", () => {
    const younger = render(<ControlledTool band="g3_5" />);
    expect(document.body.textContent).toContain("familiar adult who is not family");
    expect(document.body.textContent).toContain("Do not add contact information");
    younger.unmount();

    render(<ControlledTool band="g9_12" />);
    expect(document.body.textContent).toContain("never pitched to before");
  });

  it("keeps verification locked until both matches and the parent witness are recorded", () => {
    render(<ControlledTool />);
    fillListenerAndSayBack();

    const verify = screen.getByRole("button", { name: "Verify say-back" }) as HTMLButtonElement;
    expect(verify.disabled).toBe(true);
    const yesButtons = screen.getAllByRole("button", { name: "Yes, it matched" });
    fireEvent.click(yesButtons[0]);
    fireEvent.click(yesButtons[1]);
    expect(screen.getByRole("status", { name: "Say-Back Card status" }).textContent).toContain(
      "A parent must confirm",
    );
    expect(verify.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText(/A parent witnessed the live pitch/));
    expect(verify.disabled).toBe(false);
  });

  it("saves matching evidence, creates the Founder File summary, and completes", () => {
    const onTaskComplete = vi.fn();
    render(<ControlledTool onTaskComplete={onTaskComplete} />);
    fillListenerAndSayBack();
    const yesButtons = screen.getAllByRole("button", { name: "Yes, it matched" });
    fireEvent.click(yesButtons[0]);
    fireEvent.click(yesButtons[1]);
    fireEvent.click(screen.getByLabelText(/A parent witnessed the live pitch/));
    fireEvent.click(screen.getByRole("button", { name: "Verify say-back" }));

    expect(screen.getByText("Clarity confirmed")).toBeTruthy();
    expect(screen.getByText("Criterion complete")).toBeTruthy();
    expect(screen.getByLabelText("Saved say-back outcome").textContent).toBe("matched");
    expect(screen.getByLabelText("Saved say-back summary").textContent).toContain("Coach Lee");
    expect(screen.getByLabelText("Saved say-back summary").textContent).toContain(
      "Both matched the pitch",
    );
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });

  it("saves a useful failed result without completing and clears only the attempt for retry", () => {
    const onTaskComplete = vi.fn();
    render(<ControlledTool onTaskComplete={onTaskComplete} />);
    fillListenerAndSayBack();
    fireEvent.click(screen.getAllByRole("button", { name: "Not yet" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Yes, it matched" })[1]);
    fireEvent.click(screen.getByLabelText(/A parent witnessed the live pitch/));
    fireEvent.click(screen.getByRole("button", { name: "Verify say-back" }));

    expect(screen.getByText("Useful result, not yet")).toBeTruthy();
    expect(screen.getByLabelText("Saved say-back outcome").textContent).toBe("product-unclear");
    expect(onTaskComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Try the pitch again" }));
    expect((screen.getByLabelText("What did they think you sell?") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByLabelText(/Adult's first name or role/) as HTMLInputElement).value).toBe("Coach Lee");
    expect(screen.getByLabelText("Saved say-back outcome").textContent).toBe("");
  });

  it("restores completed evidence and reports completion once", () => {
    const onTaskComplete = vi.fn();
    render(
      <ControlledTool
        initial={{
          [SAY_BACK_FIELD_KEYS.adultName]: "Coach Lee",
          [SAY_BACK_FIELD_KEYS.date]: "2026-08-06",
          [SAY_BACK_FIELD_KEYS.productWords]: "Custom local-history cards",
          [SAY_BACK_FIELD_KEYS.askWords]: "Choose a first pack",
          [SAY_BACK_FIELD_KEYS.productMatch]: "yes",
          [SAY_BACK_FIELD_KEYS.askMatch]: "yes",
          [SAY_BACK_FIELD_KEYS.witnessed]: "true",
          [SAY_BACK_FIELD_KEYS.reviewed]: "true",
          [SAY_BACK_FIELD_KEYS.outcome]: "matched",
        }}
        onTaskComplete={onTaskComplete}
      />,
    );

    expect(screen.getByText("Clarity confirmed")).toBeTruthy();
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });
});
