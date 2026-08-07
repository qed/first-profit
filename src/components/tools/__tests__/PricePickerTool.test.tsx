// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Band } from "../../../data/path";
import {
  PRICE_PICKER_FIELD_KEYS,
  type PricePickerFields,
} from "../../../lib/pricePicker";
import { PricePickerTool } from "../PricePickerTool";

function ControlledTool({
  band = "g6_8",
  initial = {},
  onTaskComplete,
}: {
  band?: Band;
  initial?: PricePickerFields;
  onTaskComplete?: () => void;
}) {
  const [fields, setFields] = React.useState<PricePickerFields>(initial);
  return (
    <>
      <PricePickerTool
        band={band}
        fields={fields}
        onFieldChange={(key, value) => setFields((current) => ({ ...current, [key]: value }))}
        onTaskComplete={onTaskComplete}
      />
      <output aria-label="Saved price summary">{fields[PRICE_PICKER_FIELD_KEYS.summary] ?? ""}</output>
      <output aria-label="Saved price confirmation">{fields[PRICE_PICKER_FIELD_KEYS.confirmed] ?? ""}</output>
    </>
  );
}

function fillOffer() {
  fireEvent.change(screen.getByLabelText(/Offer name/), {
    target: { value: "Custom chess pieces" },
  });
  fireEvent.change(screen.getByLabelText(/What is one unit/), {
    target: { value: "One set of eight custom pawns" },
  });
}

afterEach(cleanup);

describe("PricePickerTool", () => {
  it("adapts the pricing proof to each grade band", () => {
    const younger = render(<ControlledTool band="g3_5" />);
    expect(document.body.textContent).toContain("three possible prices");
    expect(screen.getByLabelText("Price option 1")).toBeTruthy();
    expect(screen.queryByText("Two customer alternatives")).toBeNull();
    younger.unmount();

    render(<ControlledTool band="g9_12" />);
    expect(document.body.textContent).toContain("two real alternatives");
    expect(screen.getByText("Two customer alternatives")).toBeTruthy();
    expect(screen.getByLabelText("Alternative 1")).toBeTruthy();
  });

  it("shows the profit preview and blocks a middle-grade price that does not cover cost", () => {
    render(<ControlledTool />);
    fillOffer();
    fireEvent.change(screen.getByLabelText(/Your price/), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText(/Estimated cost/), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("One clear sentence"), {
      target: { value: "This price should pay for the materials and my work." },
    });
    fireEvent.click(screen.getByLabelText(/A parent checked that this price covers/));

    expect(screen.getByText("Amount not covered")).toBeTruthy();
    expect(screen.getByText("$4")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Price Picker status" }).textContent).toContain(
      "Raise the price",
    );
    expect((screen.getByRole("button", { name: "Save price" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lets a younger student choose one parent option and saves the summary", () => {
    const onTaskComplete = vi.fn();
    render(<ControlledTool band="g3_5" onTaskComplete={onTaskComplete} />);
    fillOffer();
    for (const [label, value] of [
      ["Price option 1", "8"],
      ["Price option 2", "10"],
      ["Price option 3", "12"],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Choose $10" }));
    fireEvent.click(screen.getByLabelText(/A parent helped list these three/));
    fireEvent.change(screen.getByLabelText("One clear sentence"), {
      target: { value: "I chose ten dollars because it is fair for a whole set." },
    });

    const save = screen.getByRole("button", { name: "Save price" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    expect(screen.getByText("Price saved")).toBeTruthy();
    expect(screen.getByText("Task complete")).toBeTruthy();
    expect(screen.getByLabelText("Saved price confirmation").textContent).toBe("true");
    expect(screen.getByLabelText("Saved price summary").textContent).toContain(
      "A parent suggested $8, $10, and $12",
    );
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });

  it("requires and saves two real alternatives for high school", () => {
    const onTaskComplete = vi.fn();
    render(<ControlledTool band="g9_12" onTaskComplete={onTaskComplete} />);
    fillOffer();
    fireEvent.change(screen.getByLabelText(/Your price/), { target: { value: "35" } });
    fireEvent.change(screen.getByLabelText("Alternative 1"), {
      target: { value: "Etsy custom set" },
    });
    fireEvent.change(screen.getByLabelText("Their price", { selector: "input#fp-alternative-1-price" }), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByLabelText("Alternative 2"), {
      target: { value: "Local maker set" },
    });
    fireEvent.change(screen.getByLabelText("Their price", { selector: "input#fp-alternative-2-price" }), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("One clear sentence"), {
      target: { value: "It is below the premium option and includes more customization." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save price" }));

    expect(screen.getByLabelText("Saved price summary").textContent).toContain(
      "Compared with Etsy custom set at $42 and Local maker set at $30",
    );
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });

  it("restores completed evidence and reports completion once", () => {
    const onTaskComplete = vi.fn();
    render(
      <ControlledTool
        initial={{
          [PRICE_PICKER_FIELD_KEYS.offer]: "Custom chess pieces",
          [PRICE_PICKER_FIELD_KEYS.unit]: "One set of eight pawns",
          [PRICE_PICKER_FIELD_KEYS.price]: "30",
          [PRICE_PICKER_FIELD_KEYS.estimatedCost]: "12",
          [PRICE_PICKER_FIELD_KEYS.parentCostCheck]: "true",
          [PRICE_PICKER_FIELD_KEYS.reason]: "It covers materials and leaves room for my work.",
          [PRICE_PICKER_FIELD_KEYS.confirmed]: "true",
        }}
        onTaskComplete={onTaskComplete}
      />,
    );

    expect(screen.getByText("Price saved")).toBeTruthy();
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });
});
