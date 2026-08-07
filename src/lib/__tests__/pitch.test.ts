import { describe, expect, it } from "vitest";
import {
  PITCH_BEATS,
  assessPitch,
  composePitch,
  countPitchWords,
  estimatePitchSeconds,
  pitchTextForFields,
  splitLegacyPitch,
  type PitchBeatValues,
} from "../pitch";

function words(count: number, prefix = "word"): string {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join(" ");
}

function completePitch(counts = [20, 30, 40, 30]): PitchBeatValues {
  return Object.fromEntries(
    PITCH_BEATS.map((beat, index) => [beat.key, words(counts[index], beat.key)]),
  ) as PitchBeatValues;
}

describe("60-second pitch model", () => {
  it("counts words and estimates delivery at 120 words per minute", () => {
    expect(countPitchWords("  one\n two   three ")).toBe(3);
    expect(countPitchWords("   ")).toBe(0);
    expect(estimatePitchSeconds(120)).toBe(60);
    expect(estimatePitchSeconds(121)).toBe(61);
  });

  it("splits a legacy pitch at the four target boundaries without losing words", () => {
    const legacy = words(100);
    const split = splitLegacyPitch(legacy);

    expect(PITCH_BEATS.map((beat) => countPitchWords(split[beat.key]))).toEqual([20, 30, 40, 10]);
    expect(composePitch(split).replace(/\s+/g, " ")).toBe(legacy);
  });

  it("marks a complete 120-word pitch as on pace and treats 121 words as flexible", () => {
    const ready = assessPitch(completePitch());
    expect(ready).toMatchObject({ complete: true, estimatedSeconds: 60, tone: "ready", totalWords: 120 });
    expect(ready.message).toMatch(/On pace for one minute/);

    const long = assessPitch(completePitch([21, 30, 40, 30]));
    expect(long).toMatchObject({ complete: true, estimatedSeconds: 61, tone: "ready", totalWords: 121 });
    expect(long.message).toMatch(/read it aloud before deciding/i);
  });

  it("coaches a very short four-beat pitch to use the available time", () => {
    const short = assessPitch(completePitch([10, 10, 10, 10]));
    expect(short).toMatchObject({ complete: true, estimatedSeconds: 20, tone: "incomplete", totalWords: 40 });
    expect(short.message).toMatch(/room for 80 more target words/);
  });

  it("keeps the curriculum's 150-word maximum distinct from the one-minute target", () => {
    const overMax = assessPitch(completePitch([51, 30, 40, 30]));
    expect(overMax).toMatchObject({ tone: "roomy", totalWords: 151 });
    expect(overMax.message).toMatch(/task guide tops out at 150 words/);
  });

  it("coaches a fuller legal draft without calling it wrong", () => {
    const full = assessPitch(completePitch([30, 35, 45, 30]));
    expect(full).toMatchObject({ tone: "roomy", totalWords: 140 });
    expect(full.message).toMatch(/Nothing is wrong/);
  });

  it("uses structured beats in the Idea Room while preserving legacy fallback", () => {
    expect(pitchTextForFields({ pitch: "Legacy pitch" })).toBe("Legacy pitch");
    expect(
      pitchTextForFields({ pitch: "Legacy pitch", pitchHook: "New hook", pitchAsk: "New ask" }),
    ).toBe("New hook\n\nNew ask");
  });
});
