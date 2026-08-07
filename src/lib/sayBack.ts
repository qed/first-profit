export const SAY_BACK_TASK_ID = "1.1.5";

export const SAY_BACK_FIELD_KEYS = {
  adultName: "sayBackAdultName",
  date: "sayBackDate",
  productWords: "sayBackProductWords",
  askWords: "sayBackAskWords",
  productMatch: "sayBackProductMatch",
  askMatch: "sayBackAskMatch",
  witnessed: "sayBackWitnessed",
  reviewed: "sayBackReviewed",
  outcome: "sayBackOutcome",
  summary: "sayBackSummary",
} as const;

export const SAY_BACK_PERSISTED_FIELD_KEYS = Object.values(SAY_BACK_FIELD_KEYS);

export type SayBackFields = Record<string, string | undefined>;
export type SayBackMatch = "yes" | "no" | "";
export type SayBackOutcome =
  | "matched"
  | "product-unclear"
  | "ask-unclear"
  | "both-unclear"
  | "";

export interface SayBackEvidence {
  adultName: string;
  askMatch: SayBackMatch;
  askWords: string;
  date: string;
  outcome: SayBackOutcome;
  productMatch: SayBackMatch;
  productWords: string;
  reviewed: boolean;
  summary: string;
  witnessed: boolean;
}

export type SayBackAssessmentStage =
  | "needs-listener"
  | "needs-say-back"
  | "needs-review"
  | "needs-witness"
  | "ready"
  | "not-yet"
  | "complete";

export interface SayBackAssessment {
  complete: boolean;
  message: string;
  readyToVerify: boolean;
  stage: SayBackAssessmentStage;
}

function matchValue(value: string | undefined): SayBackMatch {
  return value === "yes" || value === "no" ? value : "";
}

function outcomeValue(value: string | undefined): SayBackOutcome {
  return value === "matched" ||
    value === "product-unclear" ||
    value === "ask-unclear" ||
    value === "both-unclear"
    ? value
    : "";
}

export function sayBackEvidence(fields: SayBackFields): SayBackEvidence {
  return {
    adultName: fields[SAY_BACK_FIELD_KEYS.adultName]?.trim() ?? "",
    askMatch: matchValue(fields[SAY_BACK_FIELD_KEYS.askMatch]),
    askWords: fields[SAY_BACK_FIELD_KEYS.askWords]?.trim() ?? "",
    date: fields[SAY_BACK_FIELD_KEYS.date]?.trim() ?? "",
    outcome: outcomeValue(fields[SAY_BACK_FIELD_KEYS.outcome]),
    productMatch: matchValue(fields[SAY_BACK_FIELD_KEYS.productMatch]),
    productWords: fields[SAY_BACK_FIELD_KEYS.productWords]?.trim() ?? "",
    reviewed: fields[SAY_BACK_FIELD_KEYS.reviewed] === "true",
    summary: fields[SAY_BACK_FIELD_KEYS.summary]?.trim() ?? "",
    witnessed: fields[SAY_BACK_FIELD_KEYS.witnessed] === "true",
  };
}

export function sayBackOutcome(fields: SayBackFields): SayBackOutcome {
  const evidence = sayBackEvidence(fields);
  if (!evidence.productMatch || !evidence.askMatch) return "";
  if (evidence.productMatch === "yes" && evidence.askMatch === "yes") return "matched";
  if (evidence.productMatch === "no" && evidence.askMatch === "no") return "both-unclear";
  return evidence.productMatch === "no" ? "product-unclear" : "ask-unclear";
}

export function assessSayBackEvidence(fields: SayBackFields): SayBackAssessment {
  const evidence = sayBackEvidence(fields);
  if (!evidence.adultName || !evidence.date) {
    return {
      complete: false,
      message: "Add the non-family adult's first name or role and the pitch date.",
      readyToVerify: false,
      stage: "needs-listener",
    };
  }
  if (!evidence.productWords || !evidence.askWords) {
    return {
      complete: false,
      message: "Write what the adult thought the product was and what they thought you asked them to do.",
      readyToVerify: false,
      stage: "needs-say-back",
    };
  }
  if (!evidence.productMatch || !evidence.askMatch) {
    return {
      complete: false,
      message: "Compare both answers with your pitch and mark whether each one matched.",
      readyToVerify: false,
      stage: "needs-review",
    };
  }
  if (!evidence.witnessed) {
    return {
      complete: false,
      message: "A parent must confirm they witnessed the pitch and that the listener was not family.",
      readyToVerify: false,
      stage: "needs-witness",
    };
  }
  if (!evidence.reviewed) {
    return {
      complete: false,
      message: "Everything is logged. Verify this say-back to save the result.",
      readyToVerify: true,
      stage: "ready",
    };
  }

  const outcome = sayBackOutcome(fields);
  if (outcome === "matched") {
    return {
      complete: true,
      message: "The adult understood both the product and the ask. Criterion 1.1 is complete.",
      readyToVerify: false,
      stage: "complete",
    };
  }

  const unclear = outcome === "both-unclear"
    ? "the product and the ask"
    : outcome === "product-unclear"
      ? "what the product is"
      : "the ask";
  return {
    complete: false,
    message: `Useful test. The adult did not clearly understand ${unclear} yet. Improve that part and try the pitch again.`,
    readyToVerify: false,
    stage: "not-yet",
  };
}

export function buildSayBackSummary(fields: SayBackFields): string {
  const evidence = sayBackEvidence(fields);
  const outcome = sayBackOutcome(fields);
  if (
    !evidence.adultName ||
    !evidence.date ||
    !evidence.productWords ||
    !evidence.askWords ||
    !outcome
  ) return "";

  const result = outcome === "matched"
    ? "Both matched the pitch."
    : outcome === "both-unclear"
      ? "Neither the product nor the ask matched clearly yet."
      : outcome === "product-unclear"
        ? "The ask matched, but the product was not clear yet."
        : "The product matched, but the ask was not clear yet.";
  return `On ${evidence.date}, ${evidence.adultName} said the product was “${evidence.productWords}” and the ask was “${evidence.askWords}”. A parent witnessed the pitch. ${result}`;
}
