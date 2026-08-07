import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("../supabase", () => ({
  getSupabase: () => ({ auth: { getSession } }),
}));

import { requestAiStartingIdeas } from "../brainstormApi";
import { generateStartingIdeas, type BrainstormInputs } from "../ideaBrainstorm";

const INPUTS: BrainstormInputs = {
  boardGame: "Chess",
  animal: "Dogs",
  sport: "Soccer",
  activity: "Drawing",
  businessType: "physical",
  audience: "fans",
  customization: "local",
  customTwist: "",
};

beforeEach(() => {
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: "learner-token" } } });
});

describe("requestAiStartingIdeas", () => {
  it("sends the learner session to the same-origin endpoint and accepts five ideas", async () => {
    const ideas = generateStartingIdeas(INPUTS, 1).map((idea, index) => ({
      ...idea,
      id: `ai-1-${index + 1}`,
    }));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ source: "ai", ideas }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(requestAiStartingIdeas(INPUTS, 1, fetchMock)).resolves.toEqual(ideas);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/brainstorm");
    expect(init.headers.Authorization).toBe("Bearer learner-token");
    expect(JSON.parse(String(init.body))).toEqual({ inputs: INPUTS, round: 1 });
  });

  it("does not call the endpoint without a current session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchMock = vi.fn();
    await expect(requestAiStartingIdeas(INPUTS, 1, fetchMock)).rejects.toThrow(
      "brainstorm-unavailable",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed or incomplete server output so the UI can use its fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ source: "ai", ideas: [{ id: "only-one" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(requestAiStartingIdeas(INPUTS, 1, fetchMock)).rejects.toThrow(
      "brainstorm-unavailable",
    );
  });
});
