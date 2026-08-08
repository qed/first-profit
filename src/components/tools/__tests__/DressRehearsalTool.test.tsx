// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Band } from "../../../data/path";
import {
  DRESS_REHEARSAL_FIELD_KEYS,
  type DressRehearsalFields,
} from "../../../lib/dressRehearsal";
import { PRICE_PICKER_FIELD_KEYS } from "../../../lib/pricePicker";
import { DressRehearsalTool } from "../DressRehearsalTool";

function ControlledTool({
  band = "g6_8",
  initial = {},
  onTaskComplete,
}: {
  band?: Band;
  initial?: DressRehearsalFields;
  onTaskComplete?: () => void;
}) {
  const [fields, setFields] = React.useState<DressRehearsalFields>(initial);
  return (
    <>
      <DressRehearsalTool
        band={band}
        fields={fields}
        onFieldChange={(key, value) =>
          setFields((current) => ({ ...current, [key]: value }))
        }
        onTaskComplete={onTaskComplete}
      />
      <output aria-label="Saved rehearsal summary">
        {fields[DRESS_REHEARSAL_FIELD_KEYS.summary] ?? ""}
      </output>
      <output aria-label="Saved rehearsal confirmation">
        {fields[DRESS_REHEARSAL_FIELD_KEYS.confirmed] ?? ""}
      </output>
    </>
  );
}

function fillStandardSetup() {
  fireEvent.click(screen.getByRole("button", { name: /Cash box/ }));
  fireEvent.change(screen.getByLabelText("Payment handoff plan"), {
    target: { value: "The child accepts the cash and counts it aloud." },
  });
  fireEvent.click(screen.getByRole("button", { name: /Hand it over now/ }));
  fireEvent.change(screen.getByLabelText("Delivery handoff plan"), {
    target: { value: "The finished card set is handed over after payment." },
  });
}

afterEach(cleanup);

describe("DressRehearsalTool", () => {
  it("shows the saved offer and price from Price Picker", () => {
    render(
      <ControlledTool
        initial={{
          [PRICE_PICKER_FIELD_KEYS.offer]: "Custom neighborhood cards",
          [PRICE_PICKER_FIELD_KEYS.unit]: "One pack of twelve cards",
          [PRICE_PICKER_FIELD_KEYS.price]: "18",
        }}
      />,
    );
    expect(document.body.textContent).toContain(
      "Custom neighborhood cards · $18 · One pack of twelve cards",
    );
  });

  it("adapts the money preparation to each grade band", () => {
    const younger = render(<ControlledTool band="g3_5" />);
    expect(document.body.textContent).toContain("parent handles the cash");
    expect(screen.getByLabelText(/parent agrees to handle the money/)).toBeTruthy();
    younger.unmount();

    render(<ControlledTool band="g9_12" />);
    expect(screen.getByLabelText("Change plan")).toBeTruthy();
    expect(screen.getByLabelText("Receipt or confirmation plan")).toBeTruthy();
    expect(screen.getByLabelText(/simple sales record is ready/)).toBeTruthy();
  });

  it("keeps the full rehearsal locked until the setup is ready", () => {
    render(<ControlledTool />);
    expect(
      (screen.getByRole("button", { name: "Run the sale" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fillStandardSetup();
    fireEvent.click(
      screen.getByLabelText(/parent agrees to watch the payment math/),
    );
    expect(
      (screen.getByRole("button", { name: "Run the sale" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Run the sale" }));
    expect(screen.getByRole("button", { name: "Start full run" })).toBeTruthy();
  });

  it("guides all five moments and saves a parent-confirmed clean run", () => {
    const onTaskComplete = vi.fn();
    render(<ControlledTool onTaskComplete={onTaskComplete} />);
    fillStandardSetup();
    fireEvent.click(
      screen.getByLabelText(/parent agrees to watch the payment math/),
    );
    fireEvent.click(screen.getByRole("button", { name: "Run the sale" }));
    fireEvent.click(screen.getByRole("button", { name: "Start full run" }));

    for (const moment of ["greeting", "ask", "payment", "delivery", "thank-you"]) {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(`Complete ${moment}`) }),
      );
    }

    fireEvent.click(
      screen.getByLabelText(/We completed greeting, ask, payment, delivery/),
    );
    fireEvent.click(
      screen.getByLabelText(/parent who played the buyer confirms/),
    );

    const save = screen.getByRole("button", {
      name: "Save rehearsal",
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    expect(screen.getByText("Rehearsal saved")).toBeTruthy();
    expect(screen.getByText("Step 3 of 3 · Confirm the run")).toBeTruthy();
    expect(screen.getByText("Task complete")).toBeTruthy();
    expect(screen.getByLabelText("Saved rehearsal confirmation").textContent).toBe(
      "true",
    );
    expect(screen.getByLabelText("Saved rehearsal summary").textContent).toContain(
      "greeting, ask, payment, delivery, and thank-you",
    );
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });

  it("restores completed evidence and reports completion once", () => {
    const onTaskComplete = vi.fn();
    render(
      <ControlledTool
        initial={{
          [DRESS_REHEARSAL_FIELD_KEYS.paymentMethod]: "cash",
          [DRESS_REHEARSAL_FIELD_KEYS.paymentDetails]: "The child counts the cash.",
          [DRESS_REHEARSAL_FIELD_KEYS.deliveryMethod]: "handoff",
          [DRESS_REHEARSAL_FIELD_KEYS.deliveryDetails]: "Hand over the finished set.",
          [DRESS_REHEARSAL_FIELD_KEYS.parentMathWatchConfirmed]: "true",
          [DRESS_REHEARSAL_FIELD_KEYS.runCompleted]: "true",
          [DRESS_REHEARSAL_FIELD_KEYS.cleanRunConfirmed]: "true",
          [DRESS_REHEARSAL_FIELD_KEYS.parentBuyerConfirmed]: "true",
          [DRESS_REHEARSAL_FIELD_KEYS.runDate]: "2026-08-06",
          [DRESS_REHEARSAL_FIELD_KEYS.confirmed]: "true",
        }}
        onTaskComplete={onTaskComplete}
      />,
    );

    expect(screen.getByText("Rehearsal saved")).toBeTruthy();
    expect(screen.getByText("Step 3 of 3 · Confirm the run")).toBeTruthy();
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });
});
