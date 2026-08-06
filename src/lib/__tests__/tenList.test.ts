import { describe, expect, it } from "vitest";
import {
  TEN_LIST_CHANNELS,
  TEN_LIST_FIELD_KEYS as K,
  TEN_LIST_SIZE,
  assessTenList,
  buildTenListSummary,
  containsPrivateContactInfo,
  requiredOutsideCount,
  tenListEvidence,
  tenListRowFieldKey,
} from "../tenList";

function completeRows() {
  const fields: Record<string, string> = {};
  for (let index = 0; index < TEN_LIST_SIZE; index += 1) {
    fields[tenListRowFieldKey(index, "name")] = `Prospect ${index + 1}`;
    fields[tenListRowFieldKey(index, "channel")] = TEN_LIST_CHANNELS[index % TEN_LIST_CHANNELS.length].value;
  }
  return fields;
}

describe("tenList", () => {
  it("creates stable row keys and normalizes saved rows", () => {
    expect(tenListRowFieldKey(0, "name")).toBe("tenListProspect1Name");
    const evidence = tenListEvidence({
      [tenListRowFieldKey(0, "name")]: "  Coach   Lee ",
      [tenListRowFieldKey(0, "channel")]: "school-club",
      [tenListRowFieldKey(0, "outside")]: "true",
    });
    expect(evidence.prospects[0]).toMatchObject({
      name: "Coach Lee",
      channel: "school-club",
      outside: true,
    });
  });

  it("detects email, phone, and web contact information", () => {
    expect(containsPrivateContactInfo("coach@example.com")).toBe(true);
    expect(containsPrivateContactInfo("Call 416-555-0199")).toBe(true);
    expect(containsPrivateContactInfo("https://example.com/person")).toBe(true);
    expect(containsPrivateContactInfo("Coach Lee")).toBe(false);
  });

  it("requires ten unique names and safe channels", () => {
    const incomplete = completeRows();
    delete incomplete[tenListRowFieldKey(9, "name")];
    expect(assessTenList("g6_8", incomplete)).toMatchObject({
      stage: "needs-prospects",
    });

    const privateFields = completeRows();
    privateFields[tenListRowFieldKey(4, "name")] = "buyer@example.com";
    expect(assessTenList("g6_8", privateFields)).toMatchObject({
      stage: "needs-privacy",
    });
  });

  it("applies each grade band's circle requirement", () => {
    expect(requiredOutsideCount("g3_5")).toBe(0);
    expect(requiredOutsideCount("g6_8")).toBe(3);
    expect(requiredOutsideCount("g9_12")).toBe(5);

    const younger: Record<string, string> = { ...completeRows(), [K.parentApproved]: "true" };
    expect(assessTenList("g3_5", younger).message).toContain("known circle");

    const middle: Record<string, string> = { ...completeRows(), [K.parentApproved]: "true" };
    for (let index = 0; index < 2; index += 1) {
      middle[tenListRowFieldKey(index, "outside")] = "true";
    }
    expect(assessTenList("g6_8", middle).message).toContain("1 more prospect");
  });

  it("requires a reason for every high-school prospect", () => {
    const fields = completeRows();
    for (let index = 0; index < TEN_LIST_SIZE; index += 1) {
      if (index < 5) fields[tenListRowFieldKey(index, "outside")] = "true";
      if (index < 9) fields[tenListRowFieldKey(index, "reason")] = "They collect strategy games";
    }
    expect(assessTenList("g9_12", fields)).toMatchObject({
      stage: "needs-reasons",
    });
  });

  it("completes only after parent approval and explicit save", () => {
    const fields = {
      ...completeRows(),
      [K.knownCircleConfirmed]: "true",
      [K.parentApproved]: "true",
      [K.confirmed]: "true",
    };
    expect(assessTenList("g3_5", fields)).toMatchObject({
      complete: true,
      stage: "complete",
    });
    expect(buildTenListSummary("g3_5", fields)).toContain(
      "1. Prospect 1: In person with a parent nearby; known circle",
    );
  });
});
