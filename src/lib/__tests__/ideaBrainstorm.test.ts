import { describe, expect, it } from "vitest";
import {
  MONEY_IDEA_RUBRIC,
  assessMoneyIdea,
  generateStartingIdeas,
  missingBrainstormInputs,
  parseRubricScores,
  parseStartingIdeas,
  type BrainstormInputs,
} from "../ideaBrainstorm";
import { SITE_ONE_LINER_MAX_CHARS } from "../siteCopy";

const completeInputs: BrainstormInputs = {
  boardGame: "chess",
  animal: "dogs",
  sport: "soccer",
  activity: "drawing",
  businessType: "physical",
  audience: "fans",
  customization: "local",
  customTwist: "",
};

describe("idea brainstorm model", () => {
  it("requires a spark, business type, buyer, and custom twist", () => {
    expect(
      missingBrainstormInputs({
        boardGame: "",
        animal: "",
        sport: "",
        activity: "",
        businessType: "",
        audience: "",
        customization: "",
        customTwist: "",
      }),
    ).toEqual(["one thing you like", "a business type", "a possible buyer", "a custom twist"]);
    expect(missingBrainstormInputs(completeInputs)).toEqual([]);
  });

  it("creates five distinct, testable ideas from the learner's inputs", () => {
    const ideas = generateStartingIdeas(completeInputs, 2);
    expect(ideas).toHaveLength(5);
    expect(new Set(ideas.map((idea) => idea.name)).size).toBe(5);
    expect(ideas.every((idea) => idea.businessType === "physical")).toBe(true);
    expect(ideas.every((idea) => idea.buyer === "fans and collectors")).toBe(true);
    expect(ideas.every((idea) => idea.firstTest.length > 20)).toBe(true);
    expect(ideas.some((idea) => /dogs/i.test(idea.oneLiner))).toBe(true);
    expect(ideas.some((idea) => /soccer/i.test(idea.oneLiner))).toBe(true);
  });

  it("uses a learner-authored custom twist when one is supplied", () => {
    const ideas = generateStartingIdeas(
      { ...completeInputs, customization: "", customTwist: "custom neighborhood histories" },
      1,
    );
    expect(ideas.every((idea) => idea.oneLiner.includes("custom neighborhood histories"))).toBe(true);
  });

  it("keeps every generated one-liner inside the public-page limit", () => {
    const ideas = generateStartingIdeas(
      {
        ...completeInputs,
        boardGame: "An extremely elaborate board game interest with a very long learner-entered name",
        customTwist: "a highly personalized neighborhood history featuring many places and people",
      },
      1,
    );
    expect(ideas.every((idea) => idea.oneLiner.length <= SITE_ONE_LINER_MAX_CHARS)).toBe(true);
  });

  it("round-trips valid saved ideas and ignores broken saved data", () => {
    const ideas = generateStartingIdeas(completeInputs, 1);
    expect(parseStartingIdeas(JSON.stringify(ideas))).toEqual(ideas);
    expect(parseStartingIdeas("not json")).toEqual([]);
    expect(parseStartingIdeas(JSON.stringify([{ id: "missing-fields" }]))).toEqual([]);
  });

  it("moves from hobby to money-making potential across the five checks", () => {
    expect(assessMoneyIdea(undefined).label).toBe("Not scored yet");
    expect(assessMoneyIdea([]).label).toBe("Nice hobby for now");
    expect(assessMoneyIdea(MONEY_IDEA_RUBRIC.slice(0, 3).map((item) => item.key)).label).toBe(
      "Promising idea",
    );
    expect(assessMoneyIdea(MONEY_IDEA_RUBRIC.map((item) => item.key)).label).toBe(
      "Strong money-making potential",
    );
  });

  it("keeps only valid rubric keys from saved data", () => {
    expect(parseRubricScores(JSON.stringify({ idea: ["buyer", "made-up", "profit"] }))).toEqual({
      idea: ["buyer", "profit"],
    });
    expect(parseRubricScores("broken")).toEqual({});
  });
});
