import type { Band } from "../data/path";

export const PRICE_PICKER_TASK_ID = "1.2.1";

export const PRICE_PICKER_FIELD_KEYS = {
  offer: "pricePickerOffer",
  unit: "pricePickerUnit",
  price: "pricePickerPrice",
  estimatedCost: "pricePickerEstimatedCost",
  optionOne: "pricePickerOptionOne",
  optionTwo: "pricePickerOptionTwo",
  optionThree: "pricePickerOptionThree",
  parentOptions: "pricePickerParentOptions",
  parentCostCheck: "pricePickerParentCostCheck",
  alternativeOne: "pricePickerAlternativeOne",
  alternativeOnePrice: "pricePickerAlternativeOnePrice",
  alternativeTwo: "pricePickerAlternativeTwo",
  alternativeTwoPrice: "pricePickerAlternativeTwoPrice",
  reason: "pricePickerReason",
  confirmed: "pricePickerConfirmed",
  summary: "pricePickerSummary",
} as const;

export const PRICE_PICKER_PERSISTED_FIELD_KEYS = Object.values(
  PRICE_PICKER_FIELD_KEYS,
);

export type PricePickerFields = Record<string, string | undefined>;

export interface PricePickerEvidence {
  alternativeOne: string;
  alternativeOnePrice: number | null;
  alternativeTwo: string;
  alternativeTwoPrice: number | null;
  confirmed: boolean;
  estimatedCost: number | null;
  offer: string;
  optionOne: number | null;
  optionThree: number | null;
  optionTwo: number | null;
  parentCostCheck: boolean;
  parentOptions: boolean;
  price: number | null;
  reason: string;
  summary: string;
  unit: string;
}

export type PricePickerAssessmentStage =
  | "needs-offer"
  | "needs-price"
  | "needs-band-proof"
  | "needs-reason"
  | "ready"
  | "complete";

export interface PricePickerAssessment {
  complete: boolean;
  message: string;
  readyToSave: boolean;
  stage: PricePickerAssessmentStage;
}

function cleanText(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function parseMoney(value: string | undefined): number | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function formatMoney(amount: number): string {
  const number = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `$${number}`;
}

export function estimatedProfit(price: number | null, cost: number | null): number | null {
  if (price === null || cost === null) return null;
  return Math.round((price - cost + Number.EPSILON) * 100) / 100;
}

export function pricePickerEvidence(fields: PricePickerFields): PricePickerEvidence {
  return {
    alternativeOne: cleanText(fields[PRICE_PICKER_FIELD_KEYS.alternativeOne]),
    alternativeOnePrice: parseMoney(fields[PRICE_PICKER_FIELD_KEYS.alternativeOnePrice]),
    alternativeTwo: cleanText(fields[PRICE_PICKER_FIELD_KEYS.alternativeTwo]),
    alternativeTwoPrice: parseMoney(fields[PRICE_PICKER_FIELD_KEYS.alternativeTwoPrice]),
    confirmed: fields[PRICE_PICKER_FIELD_KEYS.confirmed] === "true",
    estimatedCost: parseMoney(fields[PRICE_PICKER_FIELD_KEYS.estimatedCost]),
    offer: cleanText(fields[PRICE_PICKER_FIELD_KEYS.offer]),
    optionOne: parseMoney(fields[PRICE_PICKER_FIELD_KEYS.optionOne]),
    optionThree: parseMoney(fields[PRICE_PICKER_FIELD_KEYS.optionThree]),
    optionTwo: parseMoney(fields[PRICE_PICKER_FIELD_KEYS.optionTwo]),
    parentCostCheck: fields[PRICE_PICKER_FIELD_KEYS.parentCostCheck] === "true",
    parentOptions: fields[PRICE_PICKER_FIELD_KEYS.parentOptions] === "true",
    price: parseMoney(fields[PRICE_PICKER_FIELD_KEYS.price]),
    reason: cleanText(fields[PRICE_PICKER_FIELD_KEYS.reason]),
    summary: cleanText(fields[PRICE_PICKER_FIELD_KEYS.summary]),
    unit: cleanText(fields[PRICE_PICKER_FIELD_KEYS.unit]),
  };
}

function positive(amount: number | null): amount is number {
  return amount !== null && amount > 0;
}

function sameAmount(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100);
}

function assessBandProof(
  band: Band,
  evidence: PricePickerEvidence,
): string | null {
  if (band === "g3_5") {
    const options = [evidence.optionOne, evidence.optionTwo, evidence.optionThree];
    if (!options.every(positive)) {
      return "Ask a parent to list three possible prices.";
    }
    if (new Set(options.map((option) => Math.round(option * 100))).size < 3) {
      return "Make the three price choices different from one another.";
    }
    const chosenPrice = evidence.price;
    if (
      !positive(chosenPrice) ||
      !options.some((option) => positive(option) && sameAmount(option, chosenPrice))
    ) {
      return "Choose one of the three prices.";
    }
    if (!evidence.parentOptions) {
      return "A parent must confirm they helped list the three price choices.";
    }
    return null;
  }

  if (band === "g6_8") {
    if (evidence.estimatedCost === null) {
      return "Add the best current estimate of what one unit costs.";
    }
    if (evidence.price !== null && evidence.price < evidence.estimatedCost) {
      return "Raise the price or lower the cost estimate so the price covers one unit.";
    }
    if (!evidence.parentCostCheck) {
      return "A parent must check that the proposed price covers the estimated cost.";
    }
    return null;
  }

  if (
    !evidence.alternativeOne ||
    !positive(evidence.alternativeOnePrice) ||
    !evidence.alternativeTwo ||
    !positive(evidence.alternativeTwoPrice)
  ) {
    return "Name two real alternatives and the price of each one.";
  }
  if (
    evidence.alternativeOne.toLocaleLowerCase() ===
    evidence.alternativeTwo.toLocaleLowerCase()
  ) {
    return "Use two different customer alternatives.";
  }
  return null;
}

export function assessPricePicker(
  band: Band,
  fields: PricePickerFields,
): PricePickerAssessment {
  const evidence = pricePickerEvidence(fields);
  if (!evidence.offer || !evidence.unit) {
    return {
      complete: false,
      message: "Write what you are selling and what one unit includes.",
      readyToSave: false,
      stage: "needs-offer",
    };
  }
  if (!positive(evidence.price)) {
    return {
      complete: false,
      message: band === "g3_5"
        ? "Enter three price choices, then pick one."
        : "Set a price greater than zero for one unit.",
      readyToSave: false,
      stage: "needs-price",
    };
  }

  const bandMessage = assessBandProof(band, evidence);
  if (bandMessage) {
    return {
      complete: false,
      message: bandMessage,
      readyToSave: false,
      stage: "needs-band-proof",
    };
  }

  if (!evidence.reason) {
    return {
      complete: false,
      message: "Finish one sentence explaining how you chose this price.",
      readyToSave: false,
      stage: "needs-reason",
    };
  }
  if (!evidence.confirmed) {
    return {
      complete: false,
      message: "Your offer, unit, price, and reason are ready for the Founder File.",
      readyToSave: true,
      stage: "ready",
    };
  }
  return {
    complete: true,
    message: `${formatMoney(evidence.price)} is saved as the price for one unit.`,
    readyToSave: false,
    stage: "complete",
  };
}

export function buildPricePickerSummary(
  band: Band,
  fields: PricePickerFields,
): string {
  const evidence = pricePickerEvidence(fields);
  if (!evidence.offer || !evidence.unit || !positive(evidence.price) || !evidence.reason) {
    return "";
  }

  const opening = `${evidence.offer}: one unit is ${evidence.unit}, priced at ${formatMoney(evidence.price)}.`;
  let comparison = "";
  if (
    band === "g3_5" &&
    positive(evidence.optionOne) &&
    positive(evidence.optionTwo) &&
    positive(evidence.optionThree)
  ) {
    comparison = ` A parent suggested ${formatMoney(evidence.optionOne)}, ${formatMoney(evidence.optionTwo)}, and ${formatMoney(evidence.optionThree)}.`;
  } else if (band === "g6_8" && evidence.estimatedCost !== null) {
    const profit = estimatedProfit(evidence.price, evidence.estimatedCost) ?? 0;
    comparison = ` Estimated cost is ${formatMoney(evidence.estimatedCost)}, leaving ${formatMoney(profit)} per unit before later cost checks.`;
  } else if (
    band === "g9_12" &&
    evidence.alternativeOne &&
    positive(evidence.alternativeOnePrice) &&
    evidence.alternativeTwo &&
    positive(evidence.alternativeTwoPrice)
  ) {
    comparison = ` Compared with ${evidence.alternativeOne} at ${formatMoney(evidence.alternativeOnePrice)} and ${evidence.alternativeTwo} at ${formatMoney(evidence.alternativeTwoPrice)}.`;
  }

  return `${opening}${comparison} Price reason: ${evidence.reason}`;
}
