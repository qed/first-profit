// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Band } from "../../../data/path";
import {
  ASK_TRACKER_FIELD_KEYS,
  askTrackerRowFieldKey,
  type AskTrackerFields,
} from "../../../lib/askTracker";
import { SALE_LOGGER_FIELD_KEYS } from "../../../lib/saleLogger";
import { TEN_LIST_SIZE, tenListRowFieldKey } from "../../../lib/tenList";
import { SaleLoggerTool } from "../SaleLoggerTool";

function paidSale(): AskTrackerFields {
  const fields: AskTrackerFields = {
    [askTrackerRowFieldKey(0, "outcome")]: "yes-paid",
    [askTrackerRowFieldKey(0, "date")]: "2026-08-06",
    [ASK_TRACKER_FIELD_KEYS.winnerIndex]: "0",
    [ASK_TRACKER_FIELD_KEYS.saleItem]: "One illustrated card pack",
    [ASK_TRACKER_FIELD_KEYS.saleAmount]: "18",
    [ASK_TRACKER_FIELD_KEYS.saleDate]: "2026-08-06",
    [ASK_TRACKER_FIELD_KEYS.nonFamilyConfirmed]: "true",
    [ASK_TRACKER_FIELD_KEYS.paymentReceivedConfirmed]: "true",
    [ASK_TRACKER_FIELD_KEYS.bandRoleConfirmed]: "true",
    [ASK_TRACKER_FIELD_KEYS.confirmed]: "true",
  };
  for (let index = 0; index < TEN_LIST_SIZE; index += 1) {
    fields[tenListRowFieldKey(index, "name")] = `Prospect ${index + 1}`;
  }
  return fields;
}

function completedSale(): AskTrackerFields {
  return {
    ...paidSale(),
    [SALE_LOGGER_FIELD_KEYS.deliveryMethod]: "product-handoff",
    [SALE_LOGGER_FIELD_KEYS.deliveryDate]: "2026-08-07",
    [SALE_LOGGER_FIELD_KEYS.deliveryDetails]: "Handed over the sealed card pack.",
    [SALE_LOGGER_FIELD_KEYS.deliveredConfirmed]: "true",
    [SALE_LOGGER_FIELD_KEYS.thankedConfirmed]: "true",
    [SALE_LOGGER_FIELD_KEYS.customerSaid]: "The history facts were my favorite part.",
    [SALE_LOGGER_FIELD_KEYS.photoSubject]: "product",
    [SALE_LOGGER_FIELD_KEYS.photoFileName]: "first-sale.jpg",
    [SALE_LOGGER_FIELD_KEYS.photoFileType]: "image/jpeg",
    [SALE_LOGGER_FIELD_KEYS.photoFileSize]: "204800",
    [SALE_LOGGER_FIELD_KEYS.photoAddedConfirmed]: "true",
  };
}

function ControlledTool({ band = "g6_8", initial = paidSale(), onTaskComplete }: { band?: Band; initial?: AskTrackerFields; onTaskComplete?: () => void }) {
  const [fields, setFields] = React.useState(initial);
  return <><SaleLoggerTool band={band} fields={fields} onFieldChange={(key, value) => setFields((current) => ({ ...current, [key]: value }))} onTaskComplete={onTaskComplete} /><output aria-label="Saved sale summary">{fields[SALE_LOGGER_FIELD_KEYS.summary] ?? ""}</output><output aria-label="Saved sale confirmation">{fields[SALE_LOGGER_FIELD_KEYS.confirmed] ?? ""}</output></>;
}

afterEach(cleanup);

describe("SaleLoggerTool", () => {
  it("requires the paid Ask Tracker record", () => {
    render(<ControlledTool initial={{}} />);
    expect(screen.getByText(/Finish Ask Tracker first/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Thank the customer" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the paid sale without re-entry", () => {
    render(<ControlledTool />);
    expect(screen.getByText("Prospect 1 · $18.00")).toBeTruthy();
    expect(document.body.textContent).toContain("One illustrated card pack · 2026-08-06");
  });

  it("completes delivery, thanks, feedback, and photo evidence", () => {
    const onTaskComplete = vi.fn();
    render(<ControlledTool onTaskComplete={onTaskComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /Product handed over/ }));
    fireEvent.change(screen.getByLabelText("Delivery date"), { target: { value: "2026-08-07" } });
    fireEvent.change(screen.getByLabelText("What was delivered?"), { target: { value: "Handed over the sealed card pack." } });
    fireEvent.click(screen.getByLabelText(/customer has everything/));
    fireEvent.click(screen.getByRole("button", { name: "Thank the customer" }));
    fireEvent.click(screen.getByLabelText("I thanked the customer for buying."));
    fireEvent.change(screen.getByLabelText("Customer’s words"), { target: { value: "The local history facts were my favorite part." } });
    fireEvent.click(screen.getByRole("button", { name: "Save the sale memory" }));
    fireEvent.change(screen.getByLabelText("Choose or take sale photo"), { target: { files: [new File(["photo"], "first-sale.jpg", { type: "image/jpeg" })] } });
    expect(screen.getByText("Selected: first-sale.jpg")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /The product/ }));
    fireEvent.click(screen.getByLabelText(/kept the original photo/));
    fireEvent.click(screen.getByRole("button", { name: "Save completed sale" }));

    expect(screen.getByText("First sale fully logged")).toBeTruthy();
    expect(screen.getByText("Criterion complete")).toBeTruthy();
    expect(screen.getByLabelText("Saved sale summary").textContent).toContain("Customer said");
    expect(screen.getByLabelText("Saved sale confirmation").textContent).toBe("true");
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });

  it("requires the additional high-school reflection", () => {
    render(<ControlledTool band="g9_12" initial={completedSale()} />);
    expect(screen.getByLabelText("Next-sale change")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save completed sale" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Next-sale change"), { target: { value: "Next time I will explain the pickup time before payment." } });
    expect((screen.getByRole("button", { name: "Save completed sale" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("restores completed evidence and reports completion once", () => {
    const onTaskComplete = vi.fn();
    render(<ControlledTool initial={{ ...completedSale(), [SALE_LOGGER_FIELD_KEYS.confirmed]: "true" }} onTaskComplete={onTaskComplete} />);
    expect(screen.getByText("First sale fully logged")).toBeTruthy();
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });
});
