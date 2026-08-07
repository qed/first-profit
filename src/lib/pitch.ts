/**
 * The 1.1.2 structured 60-second pitch model.
 *
 * The curriculum permits up to 150 words. The tool aims for 120 words at a
 * steady two words per second, divided across the four beats from the owner
 * reference. The estimate is coaching, never completion evidence: the task's
 * real pass bar remains reading the pitch aloud in under 60 seconds.
 */

export const PITCH_TASK_ID = "1.1.2";
export const PITCH_WORD_TARGET = 120;
export const PITCH_WORD_READY_MIN = 100;
export const PITCH_WORD_MAX = 150;
export const PITCH_WORDS_PER_MINUTE = 120;

export interface PitchBeat {
  key: "pitchHook" | "pitchWhat" | "pitchWhy" | "pitchAsk";
  label: string;
  prompt: string;
  placeholder: string;
  targetWords: number;
  targetSeconds: number;
}

export const PITCH_BEATS: readonly PitchBeat[] = [
  {
    key: "pitchHook",
    label: "1. Hook",
    prompt: "One line that makes them look up.",
    placeholder: "Ever wished your favorite collection told the story of your neighborhood?",
    targetWords: 20,
    targetSeconds: 10,
  },
  {
    key: "pitchWhat",
    label: "2. What it is",
    prompt: "Explain what you make or do in plain language.",
    placeholder: "I make collectible cards about local people, places, and moments worth remembering.",
    targetWords: 30,
    targetSeconds: 15,
  },
  {
    key: "pitchWhy",
    label: "3. Why it is good",
    prompt: "Explain the problem it solves and the benefit.",
    placeholder: "They make community history fun to discover, trade, and share instead of leaving it forgotten.",
    targetWords: 40,
    targetSeconds: 20,
  },
  {
    key: "pitchAsk",
    label: "4. The ask",
    prompt: "Tell them exactly what to do.",
    placeholder: "Choose your first pack today and tell me which local story should become the next card.",
    targetWords: 30,
    targetSeconds: 15,
  },
] as const;

export const PITCH_BEAT_KEYS = PITCH_BEATS.map((beat) => beat.key);
export const PITCH_PERSISTED_FIELD_KEYS = [...PITCH_BEAT_KEYS, "pitch"] as const;

export type PitchFields = Record<string, string | undefined>;
export type PitchBeatValues = Record<PitchBeat["key"], string>;

export function countPitchWords(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0;
}

export function estimatePitchSeconds(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return Math.ceil((wordCount / PITCH_WORDS_PER_MINUTE) * 60);
}

/** Divide an old single-block pitch without changing or dropping its words. */
export function splitLegacyPitch(pitch: string): PitchBeatValues {
  const words = pitch.trim().match(/\S+/g) ?? [];
  let cursor = 0;
  const values = {} as PitchBeatValues;

  PITCH_BEATS.forEach((beat, index) => {
    const isLast = index === PITCH_BEATS.length - 1;
    const end = isLast ? words.length : cursor + beat.targetWords;
    values[beat.key] = words.slice(cursor, end).join(" ");
    cursor = end;
  });

  return values;
}

export function hasStructuredPitch(fields: PitchFields): boolean {
  return PITCH_BEATS.some((beat) => Boolean(fields[beat.key]?.trim()));
}

/**
 * Resolve controlled editor values. Legacy accounts see their saved `pitch`
 * divided by the target boundaries, but no save data changes until they edit.
 */
export function pitchBeatValues(fields: PitchFields): PitchBeatValues {
  if (!hasStructuredPitch(fields) && fields.pitch?.trim()) {
    return splitLegacyPitch(fields.pitch);
  }

  return Object.fromEntries(
    PITCH_BEATS.map((beat) => [beat.key, fields[beat.key] ?? ""]),
  ) as PitchBeatValues;
}

export function composePitch(values: PitchFields): string {
  return PITCH_BEATS.map((beat) => values[beat.key]?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

/** Prefer the structured draft, then fall back to the legacy single block. */
export function pitchTextForFields(fields: PitchFields): string {
  const structured = composePitch(fields);
  return structured || fields.pitch?.trim() || "";
}

export type PitchAssessmentTone = "empty" | "incomplete" | "ready" | "roomy";

export interface PitchAssessment {
  complete: boolean;
  estimatedSeconds: number;
  message: string;
  tone: PitchAssessmentTone;
  totalWords: number;
}

export function assessPitch(values: PitchFields): PitchAssessment {
  const totalWords = countPitchWords(composePitch(values));
  const estimatedSeconds = estimatePitchSeconds(totalWords);
  const complete = PITCH_BEATS.every((beat) => Boolean(values[beat.key]?.trim()));

  if (totalWords === 0) {
    return {
      complete,
      estimatedSeconds,
      message: "Start with the hook. Your target is 120 words across four beats.",
      tone: "empty",
      totalWords,
    };
  }

  if (totalWords > PITCH_WORD_MAX) {
    return {
      complete,
      estimatedSeconds,
      message: `This is a generous draft at about ${estimatedSeconds} seconds. The task guide tops out at 150 words, so read it aloud and keep the strongest lines when you revise.`,
      tone: "roomy",
      totalWords,
    };
  }

  if (!complete) {
    return {
      complete,
      estimatedSeconds,
      message: `About ${estimatedSeconds} seconds so far. Complete all four beats, then read it aloud.`,
      tone: "incomplete",
      totalWords,
    };
  }

  if (totalWords < PITCH_WORD_READY_MIN) {
    const room = PITCH_WORD_TARGET - totalWords;
    return {
      complete,
      estimatedSeconds,
      message: `All four beats are here at about ${estimatedSeconds} seconds. You have room for ${room} more target ${room === 1 ? "word" : "words"} if they make the pitch stronger.`,
      tone: "incomplete",
      totalWords,
    };
  }

  if (totalWords > 135) {
    return {
      complete,
      estimatedSeconds,
      message: `This is a fuller draft at about ${estimatedSeconds} seconds. Nothing is wrong. If the read feels rushed, trade a few words from the least important beat.`,
      tone: "roomy",
      totalWords,
    };
  }

  if (estimatedSeconds > 60) {
    return {
      complete,
      estimatedSeconds,
      message: `A little fuller than the 120-word guide at about ${estimatedSeconds} seconds. Read it aloud before deciding whether anything needs to go.`,
      tone: "ready",
      totalWords,
    };
  }

  return {
    complete,
    estimatedSeconds,
    message: `On pace for one minute at about ${estimatedSeconds} seconds. Read it aloud to verify.`,
    tone: "ready",
    totalWords,
  };
}
