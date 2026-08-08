// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Band } from "../../../data/path";
import {
  ASK_TRACKER_FIELD_KEYS,
  askTrackerRowFieldKey,
  type AskTrackerFields,
} from "../../../lib/askTracker";
import { PRICE_PICKER_FIELD_KEYS } from "../../../lib/pricePicker";
import { TEN_LIST_SIZE, tenListRowFieldKey } from "../../../lib/tenList";
import { AskTrackerTool } from "../AskTrackerTool";

function initialProspects(): AskTrackerFields {
  const fields: AskTrackerFields = {
    [PRICE_PICKER_FIELD_KEYS.unit]: "One illustrated card pack",
    [PRICE_PICKER_FIELD_KEYS.price]: "18",
  };
  for (let index = 0; index < TEN_LIST_SIZE; index += 1) {
    fields[tenListRowFieldKey(index, "name")] = `Prospect ${index + 1}`;
  }
  return fields;
}

function ControlledTool({
  band = "g6_8",
  initial = initialProspects(),
  onTaskComplete,
}: {
  band?: Band;
  initial?: AskTrackerFields;
  onTaskComplete?: () => void;
}) {
  const [fields, setFields] = React.useState(initial);
  return (
    <>
      <AskTrackerTool band={band} fields={fields} onFieldChange={(key, value) => setFields((current) => ({ ...current, [key]: value }))} onTaskComplete={onTaskComplete} />
      <output aria-label="Saved ask summary">{fields[ASK_TRACKER_FIELD_KEYS.summary] ?? ""}</output>
      <output aria-label="Saved ask confirmation">{fields[ASK_TRACKER_FIELD_KEYS.confirmed] ?? ""}</output>
    </>
  );
}

afterEach(cleanup);

describe("AskTrackerTool", () => {
  it("requires the ten-person list before outcomes can be logged", () => {
    render(<ControlledTool initial={{}} />);
    expect(screen.getByText(/Return to Ten-List Builder/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Outcome for Prospect 1" })).toBeNull();
  });

  it("adapts the parent safety role by grade band", () => {
    const younger = render(<ControlledTool band="g3_5" />);
    expect(screen.getAllByText(/physically present at every ask/).length).toBeGreaterThan(0);
    younger.unmount();
    render(<ControlledTool band="g9_12" />);
    expect(screen.getAllByText(/parent verified the completed ask log/).length).toBeGreaterThan(0);
  });

  it("counts nos as progress while waiting for a paid yes", () => {
    render(<ControlledTool />);
    const first = within(screen.getByRole("group", { name: "Outcome for Prospect 1" }));
    fireEvent.click(first.getByRole("button", { name: "No" }));
    expect(screen.getByLabelText("Ask totals").textContent).toContain("1Asks logged");
    expect(screen.getByLabelText("Ask totals").textContent).toContain("1Nos");
    expect(screen.getByRole("status", { name: "Ask Tracker status" }).textContent).toContain("Keep asking safely");
  });

  it("carries the offer into a paid yes and saves the completed record", () => {
    const onTaskComplete = vi.fn();
    render(<ControlledTool onTaskComplete={onTaskComplete} />);
    const second = within(screen.getByRole("group", { name: "Outcome for Prospect 2" }));
    fireEvent.click(second.getByRole("button", { name: "Yes — paid" }));
    expect((screen.getByLabelText("What they bought") as HTMLInputElement).value).toBe("One illustrated card pack");
    expect((screen.getByLabelText("Amount paid") as HTMLInputElement).value).toBe("18");
    fireEvent.click(screen.getByLabelText("This customer is not family."));
    fireEvent.click(screen.getByLabelText(/Real money was received/));
    fireEvent.click(screen.getByLabelText(/parent was present but stayed silent/));
    fireEvent.click(screen.getByRole("button", { name: "Save paid yes" }));

    expect(screen.getByText("Paid yes saved")).toBeTruthy();
    expect(screen.getByLabelText("Saved ask confirmation").textContent).toBe("true");
    expect(screen.getByLabelText("Saved ask summary").textContent).toContain("Prospect 2, One illustrated card pack, $18.00");
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });

  it("allows multiple paid yeses while keeping the first sale record", () => {
    render(<ControlledTool />);
    const second = within(screen.getByRole("group", { name: "Outcome for Prospect 2" }));
    const third = within(screen.getByRole("group", { name: "Outcome for Prospect 3" }));
    fireEvent.click(second.getByRole("button", { name: "Yes — paid" }));
    fireEvent.click(third.getByRole("button", { name: "Yes — paid" }));

    expect(second.getByRole("button", { name: "Yes — paid" }).getAttribute("aria-pressed")).toBe("true");
    expect(third.getByRole("button", { name: "Yes — paid" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("First paid yes: Prospect 2")).toBeTruthy();
    expect(screen.getByLabelText("Ask totals").textContent).toContain("2Paid yeses");
  });

  it("restores completed evidence and reports completion once", () => {
    const onTaskComplete = vi.fn();
    render(<ControlledTool initial={{
      ...initialProspects(),
      [askTrackerRowFieldKey(0, "outcome")]: "yes-paid",
      [askTrackerRowFieldKey(0, "date")]: "2026-08-06",
      [ASK_TRACKER_FIELD_KEYS.winnerIndex]: "0",
      [ASK_TRACKER_FIELD_KEYS.saleItem]: "One card pack",
      [ASK_TRACKER_FIELD_KEYS.saleAmount]: "18",
      [ASK_TRACKER_FIELD_KEYS.saleDate]: "2026-08-06",
      [ASK_TRACKER_FIELD_KEYS.nonFamilyConfirmed]: "true",
      [ASK_TRACKER_FIELD_KEYS.paymentReceivedConfirmed]: "true",
      [ASK_TRACKER_FIELD_KEYS.bandRoleConfirmed]: "true",
      [ASK_TRACKER_FIELD_KEYS.confirmed]: "true",
    }} onTaskComplete={onTaskComplete} />);
    expect(screen.getByText("Paid yes saved")).toBeTruthy();
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });
});
