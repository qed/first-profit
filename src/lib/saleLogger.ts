import type { Band } from "../data/path";
import {
  ASK_TRACKER_FIELD_KEYS,
  askTrackerEvidence,
  type AskTrackerFields,
} from "./askTracker";

export const SALE_LOGGER_TASK_ID = "1.2.5";

export const SALE_LOGGER_FIELD_KEYS = {
  deliveryMethod: "saleLoggerDeliveryMethod",
  deliveryDate: "saleLoggerDeliveryDate",
  deliveryDetails: "saleLoggerDeliveryDetails",
  deliveredConfirmed: "saleLoggerDeliveredConfirmed",
  thankedConfirmed: "saleLoggerThankedConfirmed",
  customerSaid: "saleLoggerCustomerSaid",
  photoSubject: "saleLoggerPhotoSubject",
  photoFileName: "saleLoggerPhotoFileName",
  photoFileType: "saleLoggerPhotoFileType",
  photoFileSize: "saleLoggerPhotoFileSize",
  photoAddedConfirmed: "saleLoggerPhotoAddedConfirmed",
  highSchoolChange: "saleLoggerHighSchoolChange",
  confirmed: "saleLoggerConfirmed",
  summary: "saleLoggerSummary",
} as const;

export const SALE_LOGGER_PERSISTED_FIELD_KEYS = Object.values(
  SALE_LOGGER_FIELD_KEYS,
);

export const SALE_LOGGER_DELIVERY_METHODS = [
  { value: "product-handoff", label: "Product handed over" },
  { value: "service-complete", label: "Service completed" },
  { value: "digital-sent", label: "Digital item sent" },
  { value: "other", label: "Another completed delivery" },
] as const;

export const SALE_LOGGER_PHOTO_SUBJECTS = [
  { value: "product", label: "The product" },
  { value: "booth", label: "The booth or setup" },
  { value: "handoff", label: "The handoff" },
] as const;

export type SaleLoggerFields = AskTrackerFields;

export interface SaleLoggerEvidence {
  confirmed: boolean;
  customerSaid: string;
  deliveredConfirmed: boolean;
  deliveryDate: string;
  deliveryDetails: string;
  deliveryMethod: string;
  highSchoolChange: string;
  paidSaleReady: boolean;
  photoAddedConfirmed: boolean;
  photoFileName: string;
  photoFileSize: string;
  photoFileType: string;
  photoSubject: string;
  summary: string;
  thankedConfirmed: boolean;
}

export type SaleLoggerAssessmentStage =
  | "needs-sale"
  | "needs-delivery"
  | "needs-thanks"
  | "needs-feedback"
  | "needs-photo"
  | "needs-reflection"
  | "ready"
  | "complete";

export interface SaleLoggerAssessment {
  complete: boolean;
  message: string;
  readyToSave: boolean;
  stage: SaleLoggerAssessmentStage;
}

function cleanText(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function isChoice(
  value: string,
  choices: readonly { value: string }[],
): boolean {
  return choices.some((choice) => choice.value === value);
}

function choiceLabel(
  value: string,
  choices: readonly { value: string; label: string }[],
): string {
  return choices.find((choice) => choice.value === value)?.label ?? value;
}

export function saleLoggerEvidence(fields: SaleLoggerFields): SaleLoggerEvidence {
  const ask = askTrackerEvidence(fields);
  return {
    confirmed: fields[SALE_LOGGER_FIELD_KEYS.confirmed] === "true",
    customerSaid: cleanText(fields[SALE_LOGGER_FIELD_KEYS.customerSaid]),
    deliveredConfirmed:
      fields[SALE_LOGGER_FIELD_KEYS.deliveredConfirmed] === "true",
    deliveryDate: cleanText(fields[SALE_LOGGER_FIELD_KEYS.deliveryDate]),
    deliveryDetails: cleanText(
      fields[SALE_LOGGER_FIELD_KEYS.deliveryDetails],
    ),
    deliveryMethod: cleanText(
      fields[SALE_LOGGER_FIELD_KEYS.deliveryMethod],
    ),
    highSchoolChange: cleanText(
      fields[SALE_LOGGER_FIELD_KEYS.highSchoolChange],
    ),
    paidSaleReady: Boolean(
      fields[ASK_TRACKER_FIELD_KEYS.confirmed] === "true" &&
        ask.winner &&
        ask.saleItem &&
        ask.saleAmount !== null &&
        ask.saleAmount > 0 &&
        ask.saleDate &&
        ask.nonFamilyConfirmed &&
        ask.paymentReceivedConfirmed,
    ),
    photoAddedConfirmed:
      fields[SALE_LOGGER_FIELD_KEYS.photoAddedConfirmed] === "true",
    photoFileName: cleanText(fields[SALE_LOGGER_FIELD_KEYS.photoFileName]),
    photoFileSize: cleanText(fields[SALE_LOGGER_FIELD_KEYS.photoFileSize]),
    photoFileType: cleanText(fields[SALE_LOGGER_FIELD_KEYS.photoFileType]),
    photoSubject: cleanText(fields[SALE_LOGGER_FIELD_KEYS.photoSubject]),
    summary: cleanText(fields[SALE_LOGGER_FIELD_KEYS.summary]),
    thankedConfirmed:
      fields[SALE_LOGGER_FIELD_KEYS.thankedConfirmed] === "true",
  };
}

export function assessSaleLogger(
  band: Band,
  fields: SaleLoggerFields,
): SaleLoggerAssessment {
  const evidence = saleLoggerEvidence(fields);
  if (!evidence.paidSaleReady) {
    return {
      complete: false,
      message: "Finish and save the paid customer in Ask Tracker first.",
      readyToSave: false,
      stage: "needs-sale",
    };
  }
  if (
    !isChoice(evidence.deliveryMethod, SALE_LOGGER_DELIVERY_METHODS) ||
    !evidence.deliveryDate ||
    !evidence.deliveryDetails ||
    !evidence.deliveredConfirmed
  ) {
    return {
      complete: false,
      message: "Log how and when the customer received everything they paid for.",
      readyToSave: false,
      stage: "needs-delivery",
    };
  }
  if (!evidence.thankedConfirmed) {
    return {
      complete: false,
      message: "Thank the customer, then confirm that it happened.",
      readyToSave: false,
      stage: "needs-thanks",
    };
  }
  if (!evidence.customerSaid) {
    return {
      complete: false,
      message: "Write what the customer said after receiving the product or service.",
      readyToSave: false,
      stage: "needs-feedback",
    };
  }
  if (
    !isChoice(evidence.photoSubject, SALE_LOGGER_PHOTO_SUBJECTS) ||
    !evidence.photoFileName ||
    !evidence.photoAddedConfirmed
  ) {
    return {
      complete: false,
      message: "Choose or take a product, booth, or handoff photo and keep the original ready for the Founder File.",
      readyToSave: false,
      stage: "needs-photo",
    };
  }
  if (band === "g9_12" && !evidence.highSchoolChange) {
    return {
      complete: false,
      message: "Add one sentence about what you would change in the next sale.",
      readyToSave: false,
      stage: "needs-reflection",
    };
  }
  if (!evidence.confirmed) {
    return {
      complete: false,
      message: "The delivered sale, feedback, and photo evidence are ready for the Founder File.",
      readyToSave: true,
      stage: "ready",
    };
  }
  return {
    complete: true,
    message: "The first sale is delivered, thanked, and fully logged.",
    readyToSave: false,
    stage: "complete",
  };
}

export function buildSaleLoggerSummary(
  band: Band,
  fields: SaleLoggerFields,
): string {
  const evidence = saleLoggerEvidence(fields);
  const ask = askTrackerEvidence(fields);
  if (!evidence.paidSaleReady || !ask.winner) return "";
  const delivery = choiceLabel(
    evidence.deliveryMethod,
    SALE_LOGGER_DELIVERY_METHODS,
  );
  const photo = choiceLabel(
    evidence.photoSubject,
    SALE_LOGGER_PHOTO_SUBJECTS,
  );
  const reflection =
    band === "g9_12" && evidence.highSchoolChange
      ? ` Next-sale change: ${evidence.highSchoolChange}`
      : "";
  return `Completed sale: ${ask.winner.name} bought ${ask.saleItem} for $${ask.saleAmount?.toFixed(2)} on ${ask.saleDate}. Delivery completed ${evidence.deliveryDate}: ${delivery} — ${evidence.deliveryDetails} Customer thanked. Customer said: “${evidence.customerSaid}” Photo evidence prepared: ${photo} (${evidence.photoFileName}); original retained for the Founder File.${reflection}`;
}
