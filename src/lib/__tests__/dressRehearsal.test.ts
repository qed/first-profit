import { describe, expect, it } from "vitest";
import {
  DRESS_REHEARSAL_FIELD_KEYS,
  assessDressRehearsal,
  buildDressRehearsalSummary,
  isDressRehearsalSetupReady,
  type DressRehearsalFields,
} from "../dressRehearsal";

function baseFields(): DressRehearsalFields {
  return {
    [DRESS_REHEARSAL_FIELD_KEYS.paymentMethod]: "cash",
    [DRESS_REHEARSAL_FIELD_KEYS.paymentDetails]: "The child takes the bill and counts the payment aloud.",
    [DRESS_REHEARSAL_FIELD_KEYS.deliveryMethod]: "handoff",
    [DRESS_REHEARSAL_FIELD_KEYS.deliveryDetails]: "The finished card set is handed over after payment.",
  };
}

describe("dressRehearsal", () => {
  it("requires both payment and delivery plans", () => {
    expect(assessDressRehearsal("g6_8", {}).stage).toBe("needs-payment");
    expect(
      assessDressRehearsal("g6_8", {
        [DRESS_REHEARSAL_FIELD_KEYS.paymentMethod]: "cash",
        [DRESS_REHEARSAL_FIELD_KEYS.paymentDetails]: "Use the cash box.",
      }).stage,
    ).toBe("needs-delivery");
  });

  it("applies the grade-specific money role", () => {
    expect(isDressRehearsalSetupReady("g3_5", baseFields())).toBe(false);
    expect(
      assessDressRehearsal("g3_5", {
        ...baseFields(),
        [DRESS_REHEARSAL_FIELD_KEYS.parentMoneyRoleConfirmed]: "true",
      }).stage,
    ).toBe("needs-run");

    expect(isDressRehearsalSetupReady("g6_8", baseFields())).toBe(false);
    expect(
      isDressRehearsalSetupReady("g6_8", {
        ...baseFields(),
        [DRESS_REHEARSAL_FIELD_KEYS.parentMathWatchConfirmed]: "true",
      }),
    ).toBe(true);
  });

  it("requires change, receipt, and record preparation for high school", () => {
    const fields = baseFields();
    expect(assessDressRehearsal("g9_12", fields).message).toContain("change");
    fields[DRESS_REHEARSAL_FIELD_KEYS.changePlan] = "Keep a $20 float and count change back.";
    expect(assessDressRehearsal("g9_12", fields).message).toContain("receipt");
    fields[DRESS_REHEARSAL_FIELD_KEYS.receiptPlan] = "Send a written e-transfer confirmation.";
    expect(assessDressRehearsal("g9_12", fields).message).toContain("sales record");
    fields[DRESS_REHEARSAL_FIELD_KEYS.salesRecordReady] = "true";
    expect(assessDressRehearsal("g9_12", fields).stage).toBe("needs-run");
  });

  it("does not become saveable until the clean run and parent confirmation", () => {
    const fields: DressRehearsalFields = {
      ...baseFields(),
      [DRESS_REHEARSAL_FIELD_KEYS.parentMathWatchConfirmed]: "true",
      [DRESS_REHEARSAL_FIELD_KEYS.runCompleted]: "true",
      [DRESS_REHEARSAL_FIELD_KEYS.runDate]: "2026-08-06",
    };
    expect(assessDressRehearsal("g6_8", fields).stage).toBe("needs-run");
    fields[DRESS_REHEARSAL_FIELD_KEYS.cleanRunConfirmed] = "true";
    expect(assessDressRehearsal("g6_8", fields).stage).toBe("needs-parent");
    fields[DRESS_REHEARSAL_FIELD_KEYS.parentBuyerConfirmed] = "true";
    expect(assessDressRehearsal("g6_8", fields).readyToSave).toBe(true);
    fields[DRESS_REHEARSAL_FIELD_KEYS.confirmed] = "true";
    expect(assessDressRehearsal("g6_8", fields).complete).toBe(true);
  });

  it("builds a Founder File summary of the complete rehearsal", () => {
    const summary = buildDressRehearsalSummary("g9_12", {
      ...baseFields(),
      [DRESS_REHEARSAL_FIELD_KEYS.changePlan]: "Count change back from the amount paid.",
      [DRESS_REHEARSAL_FIELD_KEYS.receiptPlan]: "Write a paper receipt.",
      [DRESS_REHEARSAL_FIELD_KEYS.salesRecordReady]: "true",
      [DRESS_REHEARSAL_FIELD_KEYS.runDate]: "2026-08-06",
    });
    expect(summary).toContain("Cash box");
    expect(summary).toContain("Change plan");
    expect(summary).toContain("greeting, ask, payment, delivery, and thank-you");
  });
});
