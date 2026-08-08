import { describe, expect, it } from "vitest";
import {
  ASK_TRACKER_FIELD_KEYS,
  askTrackerRowFieldKey,
  type AskTrackerFields,
} from "../askTracker";
import {
  SALE_LOGGER_FIELD_KEYS,
  assessSaleLogger,
  buildSaleLoggerSummary,
} from "../saleLogger";
import { TEN_LIST_SIZE, tenListRowFieldKey } from "../tenList";

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

function deliveredSale(): AskTrackerFields {
  return {
    ...paidSale(),
    [SALE_LOGGER_FIELD_KEYS.deliveryMethod]: "product-handoff",
    [SALE_LOGGER_FIELD_KEYS.deliveryDate]: "2026-08-07",
    [SALE_LOGGER_FIELD_KEYS.deliveryDetails]: "Handed over the sealed card pack.",
    [SALE_LOGGER_FIELD_KEYS.deliveredConfirmed]: "true",
    [SALE_LOGGER_FIELD_KEYS.thankedConfirmed]: "true",
    [SALE_LOGGER_FIELD_KEYS.customerSaid]: "The local history facts were my favorite part.",
    [SALE_LOGGER_FIELD_KEYS.photoSubject]: "product",
    [SALE_LOGGER_FIELD_KEYS.photoFileName]: "first-sale.jpg",
    [SALE_LOGGER_FIELD_KEYS.photoFileType]: "image/jpeg",
    [SALE_LOGGER_FIELD_KEYS.photoFileSize]: "204800",
    [SALE_LOGGER_FIELD_KEYS.photoAddedConfirmed]: "true",
  };
}

describe("saleLogger", () => {
  it("requires a completed paid yes from Ask Tracker", () => {
    expect(assessSaleLogger("g6_8", {}).stage).toBe("needs-sale");
    expect(assessSaleLogger("g6_8", paidSale()).stage).toBe("needs-delivery");
  });

  it("requires delivery, thanks, feedback, and photo evidence in order", () => {
    const fields = paidSale();
    fields[SALE_LOGGER_FIELD_KEYS.deliveryMethod] = "product-handoff";
    fields[SALE_LOGGER_FIELD_KEYS.deliveryDate] = "2026-08-07";
    fields[SALE_LOGGER_FIELD_KEYS.deliveryDetails] = "Handed over the pack.";
    fields[SALE_LOGGER_FIELD_KEYS.deliveredConfirmed] = "true";
    expect(assessSaleLogger("g6_8", fields).stage).toBe("needs-thanks");
    fields[SALE_LOGGER_FIELD_KEYS.thankedConfirmed] = "true";
    expect(assessSaleLogger("g6_8", fields).stage).toBe("needs-feedback");
    fields[SALE_LOGGER_FIELD_KEYS.customerSaid] = "I love the illustrations.";
    expect(assessSaleLogger("g6_8", fields).stage).toBe("needs-photo");
  });

  it("requires a next-sale reflection for high school", () => {
    const fields = deliveredSale();
    expect(assessSaleLogger("g9_12", fields).stage).toBe("needs-reflection");
    fields[SALE_LOGGER_FIELD_KEYS.highSchoolChange] = "Next time I will show the delivery date before taking payment.";
    expect(assessSaleLogger("g9_12", fields).readyToSave).toBe(true);
  });

  it("completes younger bands without the high-school reflection", () => {
    const fields = deliveredSale();
    expect(assessSaleLogger("g3_5", fields).readyToSave).toBe(true);
    fields[SALE_LOGGER_FIELD_KEYS.confirmed] = "true";
    expect(assessSaleLogger("g3_5", fields).complete).toBe(true);
  });

  it("builds the final structured sale record", () => {
    const summary = buildSaleLoggerSummary("g9_12", {
      ...deliveredSale(),
      [SALE_LOGGER_FIELD_KEYS.highSchoolChange]: "Bring more small bills for change.",
    });
    expect(summary).toContain("Prospect 1 bought One illustrated card pack for $18.00");
    expect(summary).toContain("Customer said");
    expect(summary).toContain("Photo evidence prepared: The product (first-sale.jpg)");
    expect(summary).toContain("Next-sale change");
  });
});
