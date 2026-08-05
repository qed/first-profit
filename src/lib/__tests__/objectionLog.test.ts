import { describe, expect, it } from "vitest";
import {
  OBJECTION_LOG_FIELD_KEYS,
  applyRevisionToPitch,
  assessObjectionEvidence,
  buildObjectionSummary,
  hasMeaningfulRevision,
  objectionEvidence,
} from "../objectionLog";

describe("objection log model", () => {
  it("normalizes persisted evidence defensively", () => {
    expect(objectionEvidence({
      [OBJECTION_LOG_FIELD_KEYS.exact]: "  Why would I need it?  ",
      [OBJECTION_LOG_FIELD_KEYS.beat]: "not-a-beat",
      [OBJECTION_LOG_FIELD_KEYS.applied]: "yes",
    })).toEqual(expect.objectContaining({
      applied: false,
      beat: "",
      exact: "Why would I need it?",
    }));
  });

  it("requires an objection, a pitch beat, and genuinely changed wording", () => {
    expect(assessObjectionEvidence({}).stage).toBe("needs-objection");
    expect(assessObjectionEvidence({
      [OBJECTION_LOG_FIELD_KEYS.exact]: "Why would I need it?",
    }).stage).toBe("needs-beat");
    expect(hasMeaningfulRevision("A useful card set", "  a   useful CARD set ")).toBe(false);
    expect(assessObjectionEvidence({
      [OBJECTION_LOG_FIELD_KEYS.exact]: "Why would I need it?",
      [OBJECTION_LOG_FIELD_KEYS.beat]: "pitchWhy",
      [OBJECTION_LOG_FIELD_KEYS.original]: "It is fun.",
      [OBJECTION_LOG_FIELD_KEYS.revision]: "It is fun.",
    }).stage).toBe("needs-revision");
  });

  it("applies one revised beat without losing the rest of the pitch", () => {
    const applied = applyRevisionToPitch({
      pitchHook: "A surprising hook.",
      pitchWhat: "Custom cards.",
      pitchWhy: "They are fun.",
      pitchAsk: "Choose a pack.",
    }, "pitchWhy", "They turn local history into a game.");

    expect(applied.pitchWhy).toBe("They turn local history into a game.");
    expect(applied.pitch).toContain("A surprising hook.");
    expect(applied.pitch).toContain("They turn local history into a game.");
    expect(applied.pitch).toContain("Choose a pack.");
  });

  it("builds Founder File evidence and completes only after apply", () => {
    const fields = {
      [OBJECTION_LOG_FIELD_KEYS.exact]: "Why is it better than a normal card?",
      [OBJECTION_LOG_FIELD_KEYS.beat]: "pitchWhy",
      [OBJECTION_LOG_FIELD_KEYS.original]: "It is fun.",
      [OBJECTION_LOG_FIELD_KEYS.revision]: "Each card tells a true neighborhood story.",
      [OBJECTION_LOG_FIELD_KEYS.second]: "Who made the stories?",
      [OBJECTION_LOG_FIELD_KEYS.liveAnswer]: "I research each one with a local adult.",
    };

    expect(assessObjectionEvidence(fields)).toEqual(expect.objectContaining({
      complete: false,
      readyToApply: true,
      stage: "ready",
    }));
    expect(assessObjectionEvidence({
      ...fields,
      [OBJECTION_LOG_FIELD_KEYS.applied]: "true",
    }).complete).toBe(true);
    expect(buildObjectionSummary(fields)).toContain("A second objection");
  });
});
