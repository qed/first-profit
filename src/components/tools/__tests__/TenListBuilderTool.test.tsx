// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Band } from "../../../data/path";
import {
  TEN_LIST_FIELD_KEYS,
  TEN_LIST_SIZE,
  tenListRowFieldKey,
  type TenListFields,
} from "../../../lib/tenList";
import { TenListBuilderTool } from "../TenListBuilderTool";

function ControlledTool({
  band = "g6_8",
  initial = {},
  onTaskComplete,
}: {
  band?: Band;
  initial?: TenListFields;
  onTaskComplete?: () => void;
}) {
  const [fields, setFields] = React.useState<TenListFields>(initial);
  return (
    <>
      <TenListBuilderTool
        band={band}
        fields={fields}
        onFieldChange={(key, value) => setFields((current) => ({ ...current, [key]: value }))}
        onTaskComplete={onTaskComplete}
      />
      <output aria-label="Saved ten-list summary">{fields[TEN_LIST_FIELD_KEYS.summary] ?? ""}</output>
      <output aria-label="Saved ten-list confirmation">{fields[TEN_LIST_FIELD_KEYS.confirmed] ?? ""}</output>
    </>
  );
}

function completeFields(band: Band): TenListFields {
  const fields: TenListFields = {};
  for (let index = 0; index < TEN_LIST_SIZE; index += 1) {
    fields[tenListRowFieldKey(index, "name")] = `Prospect ${index + 1}`;
    fields[tenListRowFieldKey(index, "channel")] = index % 2 === 0 ? "in-person" : "parent-message";
    if (band !== "g3_5" && index < (band === "g9_12" ? 5 : 3)) {
      fields[tenListRowFieldKey(index, "outside")] = "true";
    }
    if (band === "g9_12") {
      fields[tenListRowFieldKey(index, "reason")] = `Reason prospect ${index + 1} might buy`;
    }
  }
  if (band === "g3_5") fields[TEN_LIST_FIELD_KEYS.knownCircleConfirmed] = "true";
  fields[TEN_LIST_FIELD_KEYS.parentApproved] = "true";
  return fields;
}

function fillTenRows() {
  for (let index = 0; index < TEN_LIST_SIZE; index += 1) {
    fireEvent.change(screen.getByLabelText(`Prospect ${index + 1} name or household`), {
      target: { value: `Prospect ${index + 1}` },
    });
    fireEvent.change(screen.getByLabelText(`Safe way to reach prospect ${index + 1}`), {
      target: { value: index % 2 === 0 ? "in-person" : "parent-message" },
    });
  }
}

afterEach(cleanup);

describe("TenListBuilderTool", () => {
  it("adapts the prospect challenge to each grade band", () => {
    const younger = render(<ControlledTool band="g3_5" />);
    expect(document.body.textContent).toContain("people your family already knows");
    expect(screen.getByLabelText(/all ten prospects are non-family/)).toBeTruthy();
    expect(screen.queryByText(/Outside circle/)).toBeNull();
    younger.unmount();

    const middle = render(<ControlledTool band="g6_8" />);
    expect(screen.getByText("Outside circle 0 / 3")).toBeTruthy();
    expect(screen.getAllByLabelText("Outside my family's immediate circle")).toHaveLength(10);
    middle.unmount();

    render(<ControlledTool band="g9_12" />);
    expect(screen.getByText("Outside circle 0 / 5")).toBeTruthy();
    expect(screen.getByLabelText("Why might prospect 1 buy?")).toBeTruthy();
  });

  it("rejects private contact information in a prospect row", () => {
    const fields = completeFields("g6_8");
    fields[tenListRowFieldKey(0, "name")] = "buyer@example.com";
    render(<ControlledTool initial={fields} />);

    expect(screen.getByRole("status", { name: "Ten-List Builder status" }).textContent).toContain("Remove contact details");
    expect(screen.getByText("Remove contact info")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save ten-list" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("requires the middle-grade outside-circle mix and parent approval", () => {
    const fields = completeFields("g6_8");
    fields[tenListRowFieldKey(2, "outside")] = "";
    fields[TEN_LIST_FIELD_KEYS.parentApproved] = "";
    render(<ControlledTool initial={fields} />);

    expect(screen.getByText("Outside circle 2 / 3")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Ten-List Builder status" }).textContent).toContain("Mark 1 more prospect");
  });

  it("requires a reason for every high-school prospect", () => {
    const fields = completeFields("g9_12");
    fields[tenListRowFieldKey(9, "reason")] = "";
    render(<ControlledTool band="g9_12" initial={fields} />);

    expect(screen.getByRole("status", { name: "Ten-List Builder status" }).textContent).toContain("Add 1 more reason");
  });

  it("saves a parent-approved list and completes the task", () => {
    const onTaskComplete = vi.fn();
    render(<ControlledTool band="g3_5" onTaskComplete={onTaskComplete} />);
    fillTenRows();
    fireEvent.click(screen.getByLabelText(/all ten prospects are non-family/));
    fireEvent.click(screen.getByLabelText(/reviewed all ten prospects/));

    const save = screen.getByRole("button", { name: "Save ten-list" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    expect(screen.getByText("Prospect list saved")).toBeTruthy();
    expect(screen.getByText("List complete")).toBeTruthy();
    expect(screen.getByLabelText("Saved ten-list confirmation").textContent).toBe("true");
    expect(screen.getByLabelText("Saved ten-list summary").textContent).toContain("Parent-approved first prospect list");
    expect(screen.getByLabelText("Saved ten-list summary").textContent).toContain("10. Prospect 10");
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });

  it("restores completed evidence and reports completion once", () => {
    const onTaskComplete = vi.fn();
    const initial = {
      ...completeFields("g6_8"),
      [TEN_LIST_FIELD_KEYS.confirmed]: "true",
    };
    render(<ControlledTool initial={initial} onTaskComplete={onTaskComplete} />);

    expect(screen.getByText("Prospect list saved")).toBeTruthy();
    expect(onTaskComplete).toHaveBeenCalledTimes(1);
  });
});
