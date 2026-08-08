import { describe, expect, it } from "vitest";
import {
  ASK_TRACKER_FIELD_KEYS,
  askTrackerRowFieldKey,
  assessAskTracker,
  buildAskTrackerSummary,
  type AskTrackerFields,
} from "../askTracker";
import { TEN_LIST_SIZE, tenListRowFieldKey } from "../tenList";

function prospects(): AskTrackerFields {
  const fields: AskTrackerFields = {};
  for (let index = 0; index < TEN_LIST_SIZE; index += 1) {
    fields[tenListRowFieldKey(index, "name")] = `Prospect ${index + 1}`;
  }
  return fields;
}

function paidSale(): AskTrackerFields {
  return {
    ...prospects(),
    [askTrackerRowFieldKey(0, "outcome")]: "yes-paid",
    [askTrackerRowFieldKey(0, "date")]: "2026-08-06",
    [ASK_TRACKER_FIELD_KEYS.winnerIndex]: "0",
    [ASK_TRACKER_FIELD_KEYS.saleItem]: "One custom card pack",
    [ASK_TRACKER_FIELD_KEYS.saleAmount]: "18",
    [ASK_TRACKER_FIELD_KEYS.saleDate]: "2026-08-06",
  };
}

describe("askTracker", () => {
  it("requires the saved ten-person prospect list", () => {
    expect(assessAskTracker("g6_8", {}).stage).toBe("needs-prospects");
    expect(assessAskTracker("g6_8", prospects()).stage).toBe("needs-asks");
  });

  it("counts real asks while encouraging the next safe ask", () => {
    const fields = prospects();
    fields[askTrackerRowFieldKey(0, "outcome")] = "no";
    fields[askTrackerRowFieldKey(0, "date")] = "2026-08-06";
    fields[askTrackerRowFieldKey(1, "outcome")] = "later";
    fields[askTrackerRowFieldKey(1, "date")] = "2026-08-06";
    const assessment = assessAskTracker("g6_8", fields);
    expect(assessment.stage).toBe("needs-yes");
    expect(assessment.message).toContain("2 real asks");
  });

  it("counts multiple paid yeses while preserving the selected first sale", () => {
    const fields = paidSale();
    fields[askTrackerRowFieldKey(1, "outcome")] = "yes-paid";
    fields[askTrackerRowFieldKey(1, "date")] = "2026-08-07";
    const summary = buildAskTrackerSummary("g6_8", fields);
    expect(summary).toContain("2 paid yeses");
    expect(summary).toContain("First paid yes: Prospect 1");
  });

  it("requires real payment and a non-family customer", () => {
    const fields = paidSale();
    expect(assessAskTracker("g6_8", fields).stage).toBe("needs-confirmation");
    fields[ASK_TRACKER_FIELD_KEYS.nonFamilyConfirmed] = "true";
    fields[ASK_TRACKER_FIELD_KEYS.paymentReceivedConfirmed] = "true";
    expect(assessAskTracker("g6_8", fields).stage).toBe("needs-band-proof");
  });

  it("requires the grade-band parent role before saving", () => {
    const fields: AskTrackerFields = {
      ...paidSale(),
      [ASK_TRACKER_FIELD_KEYS.nonFamilyConfirmed]: "true",
      [ASK_TRACKER_FIELD_KEYS.paymentReceivedConfirmed]: "true",
      [ASK_TRACKER_FIELD_KEYS.bandRoleConfirmed]: "true",
    };
    expect(assessAskTracker("g3_5", fields).readyToSave).toBe(true);
    fields[ASK_TRACKER_FIELD_KEYS.confirmed] = "true";
    expect(assessAskTracker("g3_5", fields).complete).toBe(true);
  });

  it("builds a structured Founder File summary", () => {
    const fields = {
      ...paidSale(),
      [askTrackerRowFieldKey(1, "outcome")]: "no",
      [askTrackerRowFieldKey(1, "date")]: "2026-08-05",
    };
    const summary = buildAskTrackerSummary("g9_12", fields);
    expect(summary).toContain("2 asks logged, 1 no");
    expect(summary).toContain("Prospect 1, One custom card pack, $18.00");
    expect(summary).toContain("parent verified");
  });
});
