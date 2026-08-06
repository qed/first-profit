import { describe, expect, it } from "vitest";
import {
  SAY_BACK_FIELD_KEYS,
  assessSayBackEvidence,
  buildSayBackSummary,
  sayBackEvidence,
  sayBackOutcome,
} from "../sayBack";

function baseFields() {
  return {
    [SAY_BACK_FIELD_KEYS.adultName]: "Coach Lee",
    [SAY_BACK_FIELD_KEYS.date]: "2026-08-06",
    [SAY_BACK_FIELD_KEYS.productWords]: "Custom cards about local history",
    [SAY_BACK_FIELD_KEYS.askWords]: "Choose a first card pack",
    [SAY_BACK_FIELD_KEYS.productMatch]: "yes",
    [SAY_BACK_FIELD_KEYS.askMatch]: "yes",
    [SAY_BACK_FIELD_KEYS.witnessed]: "true",
  };
}

describe("say-back evidence model", () => {
  it("normalizes persisted values and rejects unknown choices", () => {
    expect(sayBackEvidence({
      [SAY_BACK_FIELD_KEYS.adultName]: "  Coach Lee  ",
      [SAY_BACK_FIELD_KEYS.productMatch]: "maybe",
      [SAY_BACK_FIELD_KEYS.witnessed]: "yes",
    })).toEqual(expect.objectContaining({
      adultName: "Coach Lee",
      productMatch: "",
      witnessed: false,
    }));
  });

  it("walks through listener, say-back, review, and witness requirements", () => {
    expect(assessSayBackEvidence({}).stage).toBe("needs-listener");
    expect(assessSayBackEvidence({
      [SAY_BACK_FIELD_KEYS.adultName]: "Coach Lee",
      [SAY_BACK_FIELD_KEYS.date]: "2026-08-06",
    }).stage).toBe("needs-say-back");
    expect(assessSayBackEvidence({
      ...baseFields(),
      [SAY_BACK_FIELD_KEYS.askMatch]: "",
    }).stage).toBe("needs-review");
    expect(assessSayBackEvidence({
      ...baseFields(),
      [SAY_BACK_FIELD_KEYS.witnessed]: "",
    }).stage).toBe("needs-witness");
  });

  it("completes only after a witnessed matching result is explicitly verified", () => {
    expect(assessSayBackEvidence(baseFields())).toEqual(expect.objectContaining({
      complete: false,
      readyToVerify: true,
      stage: "ready",
    }));
    expect(assessSayBackEvidence({
      ...baseFields(),
      [SAY_BACK_FIELD_KEYS.reviewed]: "true",
    })).toEqual(expect.objectContaining({
      complete: true,
      stage: "complete",
    }));
  });

  it("identifies unclear sections and creates a Founder File summary", () => {
    const fields = {
      ...baseFields(),
      [SAY_BACK_FIELD_KEYS.productMatch]: "no",
      [SAY_BACK_FIELD_KEYS.reviewed]: "true",
    };
    expect(sayBackOutcome(fields)).toBe("product-unclear");
    expect(assessSayBackEvidence(fields).message).toContain("what the product is");
    expect(buildSayBackSummary(fields)).toContain("The ask matched");
    expect(buildSayBackSummary(fields)).toContain("Coach Lee");
  });
});
