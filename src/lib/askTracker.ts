import type { Band } from "../data/path";
import { parseMoney } from "./pricePicker";
import {
  TEN_LIST_SIZE,
  tenListRowFieldKey,
} from "./tenList";

export const ASK_TRACKER_TASK_ID = "1.2.4";

export const ASK_TRACKER_FIELD_KEYS = {
  winnerIndex: "askTrackerWinnerIndex",
  saleItem: "askTrackerSaleItem",
  saleAmount: "askTrackerSaleAmount",
  saleDate: "askTrackerSaleDate",
  nonFamilyConfirmed: "askTrackerNonFamilyConfirmed",
  paymentReceivedConfirmed: "askTrackerPaymentReceivedConfirmed",
  bandRoleConfirmed: "askTrackerBandRoleConfirmed",
  confirmed: "askTrackerConfirmed",
  summary: "askTrackerSummary",
} as const;

export const ASK_TRACKER_OUTCOMES = [
  { value: "no", label: "No" },
  { value: "later", label: "Not yet" },
  { value: "yes-paid", label: "Yes — paid" },
] as const;

export type AskTrackerRowPart = "outcome" | "date" | "note";

export function askTrackerRowFieldKey(
  index: number,
  part: AskTrackerRowPart,
): string {
  const suffix = part.charAt(0).toUpperCase() + part.slice(1);
  return `askTrackerAsk${index + 1}${suffix}`;
}

export const ASK_TRACKER_PERSISTED_FIELD_KEYS = [
  ...Object.values(ASK_TRACKER_FIELD_KEYS),
  ...Array.from({ length: TEN_LIST_SIZE }, (_, index) => [
    askTrackerRowFieldKey(index, "outcome"),
    askTrackerRowFieldKey(index, "date"),
    askTrackerRowFieldKey(index, "note"),
  ]).flat(),
];

export type AskTrackerFields = Record<string, string | undefined>;

export interface AskTrackerRow {
  date: string;
  index: number;
  name: string;
  note: string;
  outcome: string;
}

export interface AskTrackerEvidence {
  asksLogged: number;
  bandRoleConfirmed: boolean;
  confirmed: boolean;
  laterCount: number;
  noCount: number;
  nonFamilyConfirmed: boolean;
  paidYesCount: number;
  paymentReceivedConfirmed: boolean;
  prospectsReady: boolean;
  rows: AskTrackerRow[];
  saleAmount: number | null;
  saleDate: string;
  saleItem: string;
  summary: string;
  winner: AskTrackerRow | null;
}

export type AskTrackerAssessmentStage =
  | "needs-prospects"
  | "needs-asks"
  | "needs-yes"
  | "needs-sale"
  | "needs-confirmation"
  | "needs-band-proof"
  | "ready"
  | "complete";

export interface AskTrackerAssessment {
  complete: boolean;
  message: string;
  readyToSave: boolean;
  stage: AskTrackerAssessmentStage;
}

function cleanText(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function validOutcome(value: string): string {
  return ASK_TRACKER_OUTCOMES.some((option) => option.value === value)
    ? value
    : "";
}

export function askTrackerEvidence(fields: AskTrackerFields): AskTrackerEvidence {
  const rows = Array.from({ length: TEN_LIST_SIZE }, (_, index) => ({
    date: cleanText(fields[askTrackerRowFieldKey(index, "date")]),
    index,
    name: cleanText(fields[tenListRowFieldKey(index, "name")]),
    note: cleanText(fields[askTrackerRowFieldKey(index, "note")]),
    outcome: validOutcome(
      cleanText(fields[askTrackerRowFieldKey(index, "outcome")]),
    ),
  }));
  const selectedWinner = Number.parseInt(
    fields[ASK_TRACKER_FIELD_KEYS.winnerIndex] ?? "",
    10,
  );
  const winner =
    rows.find(
      (row) => row.index === selectedWinner && row.outcome === "yes-paid",
    ) ?? rows.find((row) => row.outcome === "yes-paid") ?? null;

  return {
    asksLogged: rows.filter((row) => Boolean(row.outcome)).length,
    bandRoleConfirmed:
      fields[ASK_TRACKER_FIELD_KEYS.bandRoleConfirmed] === "true",
    confirmed: fields[ASK_TRACKER_FIELD_KEYS.confirmed] === "true",
    laterCount: rows.filter((row) => row.outcome === "later").length,
    noCount: rows.filter((row) => row.outcome === "no").length,
    nonFamilyConfirmed:
      fields[ASK_TRACKER_FIELD_KEYS.nonFamilyConfirmed] === "true",
    paidYesCount: rows.filter((row) => row.outcome === "yes-paid").length,
    paymentReceivedConfirmed:
      fields[ASK_TRACKER_FIELD_KEYS.paymentReceivedConfirmed] === "true",
    prospectsReady: rows.every((row) => Boolean(row.name)),
    rows,
    saleAmount: parseMoney(fields[ASK_TRACKER_FIELD_KEYS.saleAmount]),
    saleDate: cleanText(fields[ASK_TRACKER_FIELD_KEYS.saleDate]),
    saleItem: cleanText(fields[ASK_TRACKER_FIELD_KEYS.saleItem]),
    summary: cleanText(fields[ASK_TRACKER_FIELD_KEYS.summary]),
    winner,
  };
}

export function askTrackerBandRole(band: Band): string {
  if (band === "g3_5") {
    return "A parent was physically present at every ask, and the child spoke the ask.";
  }
  if (band === "g6_8") {
    return "A parent was present but stayed silent unless safety required help.";
  }
  return "The student ran the asks, and a parent verified the completed ask log afterward.";
}

export function assessAskTracker(
  band: Band,
  fields: AskTrackerFields,
): AskTrackerAssessment {
  const evidence = askTrackerEvidence(fields);
  if (!evidence.prospectsReady) {
    return {
      complete: false,
      message: "Finish and save all ten prospects in Ten-List Builder first.",
      readyToSave: false,
      stage: "needs-prospects",
    };
  }
  if (evidence.asksLogged === 0) {
    return {
      complete: false,
      message: "Make the first real ask, then log what happened.",
      readyToSave: false,
      stage: "needs-asks",
    };
  }
  if (!evidence.winner) {
    return {
      complete: false,
      message: `${evidence.asksLogged} real ${evidence.asksLogged === 1 ? "ask is" : "asks are"} logged. Keep asking safely until one customer says yes and pays.`,
      readyToSave: false,
      stage: "needs-yes",
    };
  }
  if (
    !evidence.winner.date ||
    !evidence.saleDate ||
    !evidence.saleItem ||
    evidence.saleAmount === null ||
    evidence.saleAmount <= 0
  ) {
    return {
      complete: false,
      message: "Complete the paid sale record: who, what, amount, and date.",
      readyToSave: false,
      stage: "needs-sale",
    };
  }
  if (!evidence.nonFamilyConfirmed || !evidence.paymentReceivedConfirmed) {
    return {
      complete: false,
      message: "Confirm that the customer is not family and that real money was received.",
      readyToSave: false,
      stage: "needs-confirmation",
    };
  }
  if (!evidence.bandRoleConfirmed) {
    return {
      complete: false,
      message: askTrackerBandRole(band),
      readyToSave: false,
      stage: "needs-band-proof",
    };
  }
  if (!evidence.confirmed) {
    return {
      complete: false,
      message: "The paid yes and ask history are ready for the Founder File.",
      readyToSave: true,
      stage: "ready",
    };
  }
  return {
    complete: true,
    message: `First paid yes saved: ${evidence.winner.name} paid $${evidence.saleAmount?.toFixed(2)}.`,
    readyToSave: false,
    stage: "complete",
  };
}

export function buildAskTrackerSummary(
  band: Band,
  fields: AskTrackerFields,
): string {
  const evidence = askTrackerEvidence(fields);
  if (
    !evidence.winner ||
    !evidence.saleDate ||
    !evidence.saleItem ||
    evidence.saleAmount === null ||
    evidence.saleAmount <= 0
  ) {
    return "";
  }
  const outcomes = [
    `${evidence.asksLogged} ${evidence.asksLogged === 1 ? "ask" : "asks"} logged`,
    `${evidence.noCount} no${evidence.noCount === 1 ? "" : "s"}`,
    `${evidence.laterCount} not yet`,
  ].join(", ");
  return `Ask Tracker: ${outcomes}, ${evidence.paidYesCount} paid ${evidence.paidYesCount === 1 ? "yes" : "yeses"}. First paid yes: ${evidence.winner.name}, ${evidence.saleItem}, $${evidence.saleAmount.toFixed(2)}, ${evidence.saleDate}. ${askTrackerBandRole(band)}`;
}
