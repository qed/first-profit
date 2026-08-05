import {
  PITCH_BEATS,
  composePitch,
  pitchBeatValues,
  type PitchBeat,
  type PitchFields,
} from "./pitch";

export const OBJECTION_LOG_TASK_ID = "1.1.4";

export const OBJECTION_LOG_FIELD_KEYS = {
  exact: "objectionExact",
  beat: "objectionPitchBeat",
  original: "objectionOriginal",
  revision: "objectionRevision",
  applied: "objectionApplied",
  second: "objectionSecond",
  liveAnswer: "objectionLiveAnswer",
  summary: "objectionSummary",
} as const;

export const OBJECTION_LOG_PERSISTED_FIELD_KEYS = Object.values(
  OBJECTION_LOG_FIELD_KEYS,
);

export type ObjectionFields = Record<string, string | undefined>;
export type ObjectionBeatKey = PitchBeat["key"];

export interface ObjectionEvidence {
  applied: boolean;
  beat: ObjectionBeatKey | "";
  exact: string;
  liveAnswer: string;
  original: string;
  revision: string;
  second: string;
  summary: string;
}

export type ObjectionAssessmentStage =
  | "needs-objection"
  | "needs-beat"
  | "needs-revision"
  | "ready"
  | "complete";

export interface ObjectionAssessment {
  complete: boolean;
  message: string;
  readyToApply: boolean;
  stage: ObjectionAssessmentStage;
}

const BEAT_KEYS = new Set<string>(PITCH_BEATS.map((beat) => beat.key));

function normalized(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function isObjectionBeatKey(value: string | undefined): value is ObjectionBeatKey {
  return Boolean(value && BEAT_KEYS.has(value));
}

export function objectionEvidence(fields: ObjectionFields): ObjectionEvidence {
  const beatValue = fields[OBJECTION_LOG_FIELD_KEYS.beat];
  return {
    applied: fields[OBJECTION_LOG_FIELD_KEYS.applied] === "true",
    beat: isObjectionBeatKey(beatValue) ? beatValue : "",
    exact: fields[OBJECTION_LOG_FIELD_KEYS.exact]?.trim() ?? "",
    liveAnswer: fields[OBJECTION_LOG_FIELD_KEYS.liveAnswer]?.trim() ?? "",
    original: fields[OBJECTION_LOG_FIELD_KEYS.original]?.trim() ?? "",
    revision: fields[OBJECTION_LOG_FIELD_KEYS.revision]?.trim() ?? "",
    second: fields[OBJECTION_LOG_FIELD_KEYS.second]?.trim() ?? "",
    summary: fields[OBJECTION_LOG_FIELD_KEYS.summary]?.trim() ?? "",
  };
}

export function hasMeaningfulRevision(original: string, revision: string): boolean {
  const next = normalized(revision);
  return Boolean(next) && next !== normalized(original);
}

export function assessObjectionEvidence(fields: ObjectionFields): ObjectionAssessment {
  const evidence = objectionEvidence(fields);
  if (!evidence.exact) {
    return {
      complete: false,
      message: "Write the parent's objection exactly as they said it.",
      readyToApply: false,
      stage: "needs-objection",
    };
  }
  if (!evidence.beat) {
    return {
      complete: false,
      message: "Choose the part of your pitch that the objection will improve.",
      readyToApply: false,
      stage: "needs-beat",
    };
  }
  if (!hasMeaningfulRevision(evidence.original, evidence.revision)) {
    return {
      complete: false,
      message: evidence.revision
        ? "Change at least one word so the revised pitch answers the objection."
        : "Write the stronger version of that pitch section.",
      readyToApply: false,
      stage: "needs-revision",
    };
  }
  if (!evidence.applied) {
    return {
      complete: false,
      message: "Your revision is ready. Apply it to update the saved pitch.",
      readyToApply: true,
      stage: "ready",
    };
  }
  return {
    complete: true,
    message: "Objection captured and revision applied. This task is complete.",
    readyToApply: false,
    stage: "complete",
  };
}

export function applyRevisionToPitch(
  fields: PitchFields,
  beat: ObjectionBeatKey,
  revision: string,
): Record<ObjectionBeatKey | "pitch", string> {
  const values = pitchBeatValues(fields);
  values[beat] = revision.trim();
  return {
    [beat]: values[beat],
    pitch: composePitch(values),
  } as Record<ObjectionBeatKey | "pitch", string>;
}

export function buildObjectionSummary(fields: ObjectionFields): string {
  const evidence = objectionEvidence(fields);
  if (!evidence.exact || !evidence.beat || !evidence.revision) return "";
  const beatLabel = PITCH_BEATS.find((beat) => beat.key === evidence.beat)?.label ?? "Pitch";
  const before = evidence.original
    ? ` Changed ${beatLabel} from “${evidence.original}” to “${evidence.revision}”.`
    : ` Wrote a stronger ${beatLabel}: “${evidence.revision}”.`;
  const olderChallenge = evidence.second && evidence.liveAnswer
    ? ` A second objection was “${evidence.second}”; the live answer was “${evidence.liveAnswer}”.`
    : "";
  return `A parent objected: “${evidence.exact}”.${before}${olderChallenge}`;
}
