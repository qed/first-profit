import type { Band } from "../data/path";

export const DRESS_REHEARSAL_TASK_ID = "1.2.3";

export const DRESS_REHEARSAL_FIELD_KEYS = {
  paymentMethod: "dressRehearsalPaymentMethod",
  paymentDetails: "dressRehearsalPaymentDetails",
  deliveryMethod: "dressRehearsalDeliveryMethod",
  deliveryDetails: "dressRehearsalDeliveryDetails",
  parentMoneyRoleConfirmed: "dressRehearsalParentMoneyRoleConfirmed",
  parentMathWatchConfirmed: "dressRehearsalParentMathWatchConfirmed",
  changePlan: "dressRehearsalChangePlan",
  receiptPlan: "dressRehearsalReceiptPlan",
  salesRecordReady: "dressRehearsalSalesRecordReady",
  runCompleted: "dressRehearsalRunCompleted",
  cleanRunConfirmed: "dressRehearsalCleanRunConfirmed",
  parentBuyerConfirmed: "dressRehearsalParentBuyerConfirmed",
  runDate: "dressRehearsalRunDate",
  confirmed: "dressRehearsalConfirmed",
  summary: "dressRehearsalSummary",
} as const;

export const DRESS_REHEARSAL_PERSISTED_FIELD_KEYS = Object.values(
  DRESS_REHEARSAL_FIELD_KEYS,
);

export const DRESS_REHEARSAL_PAYMENT_METHODS = [
  { value: "cash", label: "Cash box" },
  { value: "etransfer", label: "Parent-held e-transfer" },
  { value: "card", label: "Card reader" },
  { value: "other", label: "Another safe method" },
] as const;

export const DRESS_REHEARSAL_DELIVERY_METHODS = [
  { value: "handoff", label: "Hand it over now" },
  { value: "pickup", label: "Customer pickup" },
  { value: "dropoff", label: "Parent-approved drop-off" },
  { value: "digital", label: "Digital delivery" },
  { value: "scheduled", label: "Schedule the service" },
] as const;

export type DressRehearsalFields = Record<string, string | undefined>;

export interface DressRehearsalEvidence {
  changePlan: string;
  cleanRunConfirmed: boolean;
  confirmed: boolean;
  deliveryDetails: string;
  deliveryMethod: string;
  parentBuyerConfirmed: boolean;
  parentMathWatchConfirmed: boolean;
  parentMoneyRoleConfirmed: boolean;
  paymentDetails: string;
  paymentMethod: string;
  receiptPlan: string;
  runCompleted: boolean;
  runDate: string;
  salesRecordReady: boolean;
  summary: string;
}

export type DressRehearsalAssessmentStage =
  | "needs-payment"
  | "needs-delivery"
  | "needs-band-proof"
  | "needs-run"
  | "needs-parent"
  | "ready"
  | "complete";

export interface DressRehearsalAssessment {
  complete: boolean;
  message: string;
  readyToSave: boolean;
  stage: DressRehearsalAssessmentStage;
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

export function dressRehearsalEvidence(
  fields: DressRehearsalFields,
): DressRehearsalEvidence {
  return {
    changePlan: cleanText(fields[DRESS_REHEARSAL_FIELD_KEYS.changePlan]),
    cleanRunConfirmed:
      fields[DRESS_REHEARSAL_FIELD_KEYS.cleanRunConfirmed] === "true",
    confirmed: fields[DRESS_REHEARSAL_FIELD_KEYS.confirmed] === "true",
    deliveryDetails: cleanText(
      fields[DRESS_REHEARSAL_FIELD_KEYS.deliveryDetails],
    ),
    deliveryMethod: cleanText(
      fields[DRESS_REHEARSAL_FIELD_KEYS.deliveryMethod],
    ),
    parentBuyerConfirmed:
      fields[DRESS_REHEARSAL_FIELD_KEYS.parentBuyerConfirmed] === "true",
    parentMathWatchConfirmed:
      fields[DRESS_REHEARSAL_FIELD_KEYS.parentMathWatchConfirmed] === "true",
    parentMoneyRoleConfirmed:
      fields[DRESS_REHEARSAL_FIELD_KEYS.parentMoneyRoleConfirmed] === "true",
    paymentDetails: cleanText(
      fields[DRESS_REHEARSAL_FIELD_KEYS.paymentDetails],
    ),
    paymentMethod: cleanText(
      fields[DRESS_REHEARSAL_FIELD_KEYS.paymentMethod],
    ),
    receiptPlan: cleanText(fields[DRESS_REHEARSAL_FIELD_KEYS.receiptPlan]),
    runCompleted: fields[DRESS_REHEARSAL_FIELD_KEYS.runCompleted] === "true",
    runDate: cleanText(fields[DRESS_REHEARSAL_FIELD_KEYS.runDate]),
    salesRecordReady:
      fields[DRESS_REHEARSAL_FIELD_KEYS.salesRecordReady] === "true",
    summary: cleanText(fields[DRESS_REHEARSAL_FIELD_KEYS.summary]),
  };
}

function bandProofMessage(
  band: Band,
  evidence: DressRehearsalEvidence,
): string | null {
  if (band === "g3_5" && !evidence.parentMoneyRoleConfirmed) {
    return "Confirm that a parent will handle the money mechanics while the child handles the rest.";
  }
  if (band === "g6_8" && !evidence.parentMathWatchConfirmed) {
    return "Confirm that the child will handle the money while a parent watches the math.";
  }
  if (band === "g9_12") {
    if (!evidence.changePlan) {
      return "Write how you will handle change, including when no change is needed.";
    }
    if (!evidence.receiptPlan) {
      return "Write how the customer will receive a receipt or payment confirmation.";
    }
    if (!evidence.salesRecordReady) {
      return "Prepare the simple sales record you will use after a real sale.";
    }
  }
  return null;
}

export function isDressRehearsalSetupReady(
  band: Band,
  fields: DressRehearsalFields,
): boolean {
  const evidence = dressRehearsalEvidence(fields);
  return Boolean(
    isChoice(evidence.paymentMethod, DRESS_REHEARSAL_PAYMENT_METHODS) &&
      evidence.paymentDetails &&
      isChoice(evidence.deliveryMethod, DRESS_REHEARSAL_DELIVERY_METHODS) &&
      evidence.deliveryDetails &&
      !bandProofMessage(band, evidence),
  );
}

export function assessDressRehearsal(
  band: Band,
  fields: DressRehearsalFields,
): DressRehearsalAssessment {
  const evidence = dressRehearsalEvidence(fields);
  if (
    !isChoice(evidence.paymentMethod, DRESS_REHEARSAL_PAYMENT_METHODS) ||
    !evidence.paymentDetails
  ) {
    return {
      complete: false,
      message: "Choose how the customer will pay and write who handles each part.",
      readyToSave: false,
      stage: "needs-payment",
    };
  }
  if (
    !isChoice(evidence.deliveryMethod, DRESS_REHEARSAL_DELIVERY_METHODS) ||
    !evidence.deliveryDetails
  ) {
    return {
      complete: false,
      message: "Choose how the customer receives the product or service and explain the handoff.",
      readyToSave: false,
      stage: "needs-delivery",
    };
  }

  const proofMessage = bandProofMessage(band, evidence);
  if (proofMessage) {
    return {
      complete: false,
      message: proofMessage,
      readyToSave: false,
      stage: "needs-band-proof",
    };
  }
  if (
    !evidence.runCompleted ||
    !evidence.cleanRunConfirmed ||
    !evidence.runDate
  ) {
    return {
      complete: false,
      message: evidence.runCompleted
        ? "Confirm that all five rehearsal steps happened without stopping."
        : "Run the full rehearsal: greeting, ask, payment, delivery, and thank-you.",
      readyToSave: false,
      stage: "needs-run",
    };
  }
  if (!evidence.parentBuyerConfirmed) {
    return {
      complete: false,
      message: "The parent who played the buyer must confirm the clean run.",
      readyToSave: false,
      stage: "needs-parent",
    };
  }
  if (!evidence.confirmed) {
    return {
      complete: false,
      message: "Your point-of-sale plan and clean rehearsal are ready for the Founder File.",
      readyToSave: true,
      stage: "ready",
    };
  }
  return {
    complete: true,
    message: "The full buyer rehearsal is saved from greeting through thank-you.",
    readyToSave: false,
    stage: "complete",
  };
}

export function buildDressRehearsalSummary(
  band: Band,
  fields: DressRehearsalFields,
): string {
  const evidence = dressRehearsalEvidence(fields);
  if (!isDressRehearsalSetupReady(band, fields) || !evidence.runDate) return "";

  const payment = choiceLabel(
    evidence.paymentMethod,
    DRESS_REHEARSAL_PAYMENT_METHODS,
  );
  const delivery = choiceLabel(
    evidence.deliveryMethod,
    DRESS_REHEARSAL_DELIVERY_METHODS,
  );
  let role = "";
  if (band === "g3_5") {
    role = " A parent handles the money mechanics; the child handles the other four moments.";
  } else if (band === "g6_8") {
    role = " The child handles the money while a parent watches the math.";
  } else {
    role = ` Change plan: ${evidence.changePlan} Receipt plan: ${evidence.receiptPlan} A simple sales record is ready.`;
  }

  return `Point of sale: ${payment} — ${evidence.paymentDetails} Delivery: ${delivery} — ${evidence.deliveryDetails}${role} Clean dress rehearsal completed with a parent buyer on ${evidence.runDate}: greeting, ask, payment, delivery, and thank-you.`;
}
