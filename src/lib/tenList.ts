import type { Band } from "../data/path";

export const TEN_LIST_TASK_ID = "1.2.2";
export const TEN_LIST_SIZE = 10;

export const TEN_LIST_CHANNELS = [
  { value: "in-person", label: "In person with a parent nearby" },
  { value: "parent-message", label: "Parent sends a message" },
  { value: "school-club", label: "School, team, or club" },
  { value: "community-event", label: "Community event or market" },
] as const;

export type TenListChannel = (typeof TEN_LIST_CHANNELS)[number]["value"];
export type TenListRowField = "name" | "channel" | "outside" | "reason";

export const TEN_LIST_FIELD_KEYS = {
  knownCircleConfirmed: "tenListKnownCircleConfirmed",
  parentApproved: "tenListParentApproved",
  confirmed: "tenListConfirmed",
  summary: "tenListSummary",
} as const;

export function tenListRowFieldKey(
  index: number,
  field: TenListRowField,
): string {
  return `tenListProspect${index + 1}${field[0].toUpperCase()}${field.slice(1)}`;
}

export const TEN_LIST_PERSISTED_FIELD_KEYS = [
  ...Array.from({ length: TEN_LIST_SIZE }, (_, index) => [
    tenListRowFieldKey(index, "name"),
    tenListRowFieldKey(index, "channel"),
    tenListRowFieldKey(index, "outside"),
    tenListRowFieldKey(index, "reason"),
  ]).flat(),
  ...Object.values(TEN_LIST_FIELD_KEYS),
];

export type TenListFields = Record<string, string | undefined>;

export interface TenListProspect {
  channel: TenListChannel | "";
  name: string;
  outside: boolean;
  reason: string;
}

export interface TenListEvidence {
  confirmed: boolean;
  knownCircleConfirmed: boolean;
  parentApproved: boolean;
  prospects: TenListProspect[];
  summary: string;
}

export type TenListAssessmentStage =
  | "needs-prospects"
  | "needs-privacy"
  | "needs-channels"
  | "needs-band-mix"
  | "needs-reasons"
  | "needs-parent"
  | "ready"
  | "complete";

export interface TenListAssessment {
  complete: boolean;
  message: string;
  readyToSave: boolean;
  stage: TenListAssessmentStage;
}

const CHANNEL_VALUES = new Set<string>(
  TEN_LIST_CHANNELS.map((channel) => channel.value),
);

function cleanText(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function channelValue(value: string | undefined): TenListChannel | "" {
  return value && CHANNEL_VALUES.has(value) ? value as TenListChannel : "";
}

export function containsPrivateContactInfo(value: string): boolean {
  const text = value.trim().toLocaleLowerCase();
  return (
    /\bhttps?:\/\//.test(text) ||
    /\bwww\./.test(text) ||
    /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/.test(text) ||
    /(?:\d[\s().-]*){7,}/.test(text)
  );
}

export function tenListEvidence(fields: TenListFields): TenListEvidence {
  return {
    confirmed: fields[TEN_LIST_FIELD_KEYS.confirmed] === "true",
    knownCircleConfirmed:
      fields[TEN_LIST_FIELD_KEYS.knownCircleConfirmed] === "true",
    parentApproved: fields[TEN_LIST_FIELD_KEYS.parentApproved] === "true",
    prospects: Array.from({ length: TEN_LIST_SIZE }, (_, index) => ({
      channel: channelValue(fields[tenListRowFieldKey(index, "channel")]),
      name: cleanText(fields[tenListRowFieldKey(index, "name")]),
      outside: fields[tenListRowFieldKey(index, "outside")] === "true",
      reason: cleanText(fields[tenListRowFieldKey(index, "reason")]),
    })),
    summary: cleanText(fields[TEN_LIST_FIELD_KEYS.summary]),
  };
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function requiredOutsideCount(band: Band): number {
  if (band === "g9_12") return 5;
  if (band === "g6_8") return 3;
  return 0;
}

export function assessTenList(
  band: Band,
  fields: TenListFields,
): TenListAssessment {
  const evidence = tenListEvidence(fields);
  const named = evidence.prospects.filter((prospect) => prospect.name);
  if (named.length < TEN_LIST_SIZE) {
    return {
      complete: false,
      message: `Add ${TEN_LIST_SIZE - named.length} more non-family ${TEN_LIST_SIZE - named.length === 1 ? "prospect" : "prospects"}.`,
      readyToSave: false,
      stage: "needs-prospects",
    };
  }

  const names = named.map((prospect) => normalized(prospect.name));
  if (new Set(names).size < TEN_LIST_SIZE) {
    return {
      complete: false,
      message: "Each row must name a different person or household.",
      readyToSave: false,
      stage: "needs-prospects",
    };
  }

  if (
    evidence.prospects.some(
      (prospect) =>
        containsPrivateContactInfo(prospect.name) ||
        containsPrivateContactInfo(prospect.reason),
    )
  ) {
    return {
      complete: false,
      message: "Remove contact details. Use only a first name, household label, or role.",
      readyToSave: false,
      stage: "needs-privacy",
    };
  }

  const missingChannels = evidence.prospects.filter(
    (prospect) => !prospect.channel,
  ).length;
  if (missingChannels > 0) {
    return {
      complete: false,
      message: `Choose a safe contact channel for ${missingChannels} ${missingChannels === 1 ? "prospect" : "prospects"}.`,
      readyToSave: false,
      stage: "needs-channels",
    };
  }

  if (band === "g3_5" && !evidence.knownCircleConfirmed) {
    return {
      complete: false,
      message: "A parent must confirm that all ten prospects are in the family's known circle.",
      readyToSave: false,
      stage: "needs-band-mix",
    };
  }

  const outside = evidence.prospects.filter((prospect) => prospect.outside).length;
  const requiredOutside = requiredOutsideCount(band);
  if (outside < requiredOutside) {
    return {
      complete: false,
      message: `Mark ${requiredOutside - outside} more ${requiredOutside - outside === 1 ? "prospect" : "prospects"} from outside the family's immediate circle.`,
      readyToSave: false,
      stage: "needs-band-mix",
    };
  }

  if (band === "g9_12") {
    const missingReasons = evidence.prospects.filter(
      (prospect) => !prospect.reason,
    ).length;
    if (missingReasons > 0) {
      return {
        complete: false,
        message: `Add ${missingReasons} more ${missingReasons === 1 ? "reason" : "reasons"} explaining why a prospect might buy.`,
        readyToSave: false,
        stage: "needs-reasons",
      };
    }
  }

  if (!evidence.parentApproved) {
    return {
      complete: false,
      message: "A parent must review all ten prospects and approve the outreach plan.",
      readyToSave: false,
      stage: "needs-parent",
    };
  }

  if (!evidence.confirmed) {
    return {
      complete: false,
      message: "Ten prospects and their safe contact channels are ready for the Founder File.",
      readyToSave: true,
      stage: "ready",
    };
  }

  return {
    complete: true,
    message: "The parent-approved prospect list is saved. You are ready to plan the sale.",
    readyToSave: false,
    stage: "complete",
  };
}

function channelLabel(channel: TenListChannel): string {
  return TEN_LIST_CHANNELS.find((option) => option.value === channel)?.label ?? channel;
}

export function buildTenListSummary(
  band: Band,
  fields: TenListFields,
): string {
  const evidence = tenListEvidence(fields);
  if (evidence.prospects.some((prospect) => !prospect.name || !prospect.channel)) {
    return "";
  }

  const entries = evidence.prospects.map((prospect, index) => {
    if (!prospect.channel) return "";
    const circle = band === "g3_5"
      ? "known circle"
      : prospect.outside
        ? "outside immediate circle"
        : "known circle";
    const reason = band === "g9_12" && prospect.reason
      ? `; might buy because ${prospect.reason}`
      : "";
    return `${index + 1}. ${prospect.name}: ${channelLabel(prospect.channel)}; ${circle}${reason}`;
  });
  return `Parent-approved first prospect list. ${entries.join(" | ")}.`;
}
