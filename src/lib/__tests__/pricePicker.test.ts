import { describe, expect, it } from "vitest";
import {
  PRICE_PICKER_FIELD_KEYS as K,
  assessPricePicker,
  buildPricePickerSummary,
  estimatedProfit,
  parseMoney,
  pricePickerEvidence,
} from "../pricePicker";

describe("pricePicker", () => {
  it("normalizes money and rejects negative or invalid amounts", () => {
    expect(parseMoney("12.345")).toBe(12.35);
    expect(parseMoney("0")).toBe(0);
    expect(parseMoney("-1")).toBeNull();
    expect(parseMoney("twelve")).toBeNull();
    expect(estimatedProfit(15, 6.25)).toBe(8.75);
  });

  it("normalizes persisted evidence", () => {
    expect(pricePickerEvidence({
      [K.offer]: "  Chess   pieces ",
      [K.unit]: " one set ",
      [K.price]: "35.5",
      [K.parentCostCheck]: "true",
    })).toMatchObject({
      offer: "Chess pieces",
      unit: "one set",
      price: 35.5,
      parentCostCheck: true,
    });
  });

  it("requires three distinct parent options and a selected choice for grades 3 to 5", () => {
    const base = {
      [K.offer]: "Neighborhood cards",
      [K.unit]: "one pack of ten cards",
      [K.price]: "10",
      [K.optionOne]: "8",
      [K.optionTwo]: "10",
      [K.optionThree]: "10",
      [K.parentOptions]: "true",
      [K.reason]: "Ten dollars feels fair for a whole pack.",
    };
    expect(assessPricePicker("g3_5", base)).toMatchObject({
      complete: false,
      stage: "needs-band-proof",
    });
    expect(assessPricePicker("g3_5", { ...base, [K.optionThree]: "12" })).toMatchObject({
      readyToSave: true,
      stage: "ready",
    });
  });

  it("requires a cost-covering price and parent check for grades 6 to 8", () => {
    const base = {
      [K.offer]: "Custom chess pieces",
      [K.unit]: "one set of eight pawns",
      [K.price]: "20",
      [K.estimatedCost]: "24",
      [K.parentCostCheck]: "true",
      [K.reason]: "It covers materials and leaves room for my work.",
    };
    expect(assessPricePicker("g6_8", base).message).toContain("covers one unit");
    expect(assessPricePicker("g6_8", { ...base, [K.price]: "30" })).toMatchObject({
      readyToSave: true,
      stage: "ready",
    });
  });

  it("requires two different real alternatives for grades 9 to 12", () => {
    const base = {
      [K.offer]: "Custom chess pieces",
      [K.unit]: "one set of eight pawns",
      [K.price]: "35",
      [K.alternativeOne]: "Etsy custom pawn set",
      [K.alternativeOnePrice]: "42",
      [K.alternativeTwo]: "Etsy custom pawn set",
      [K.alternativeTwoPrice]: "30",
      [K.reason]: "It is below the premium option but includes customization.",
    };
    expect(assessPricePicker("g9_12", base).message).toContain("two different");
    expect(assessPricePicker("g9_12", {
      ...base,
      [K.alternativeTwo]: "Local maker set",
    })).toMatchObject({ readyToSave: true, stage: "ready" });
  });

  it("only completes after explicit confirmation and builds the Founder File summary", () => {
    const fields = {
      [K.offer]: "Custom chess pieces",
      [K.unit]: "one set of eight pawns",
      [K.price]: "30",
      [K.estimatedCost]: "12.5",
      [K.parentCostCheck]: "true",
      [K.reason]: "It covers the materials and pays me for careful finishing.",
      [K.confirmed]: "true",
    };
    expect(assessPricePicker("g6_8", fields)).toMatchObject({
      complete: true,
      stage: "complete",
    });
    expect(buildPricePickerSummary("g6_8", fields)).toBe(
      "Custom chess pieces: one unit is one set of eight pawns, priced at $30. Estimated cost is $12.50, leaving $17.50 per unit before later cost checks. Price reason: It covers the materials and pays me for careful finishing.",
    );
  });
});
