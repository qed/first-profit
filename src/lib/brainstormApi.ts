import { getSupabase } from "./supabase";
import {
  BUSINESS_TYPES,
  parseStartingIdeas,
  type BrainstormInputs,
  type StartingIdea,
} from "./ideaBrainstorm";

interface BrainstormApiBody {
  source?: unknown;
  ideas?: unknown;
}

/**
 * Ask the same-origin server function for AI ideas. The DeepSeek key remains
 * server-only; the caller sends the current Supabase access token so anonymous
 * visitors cannot spend provider credit.
 */
export async function requestAiStartingIdeas(
  inputs: BrainstormInputs,
  round: number,
  fetchImpl: typeof fetch = fetch,
): Promise<StartingIdea[]> {
  const { data } = await getSupabase().auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("brainstorm-unavailable");

  const response = await fetchImpl("/api/brainstorm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ inputs, round }),
    signal: AbortSignal.timeout(17000),
  });
  if (!response.ok) throw new Error("brainstorm-unavailable");

  const body = (await response.json()) as BrainstormApiBody;
  if (body.source !== "ai" || !Array.isArray(body.ideas) || body.ideas.length !== 5) {
    throw new Error("brainstorm-unavailable");
  }
  const ideas = parseStartingIdeas(JSON.stringify(body.ideas));
  if (
    ideas.length !== 5 ||
    new Set(ideas.map((idea) => idea.id)).size !== 5 ||
    ideas.some(
      (idea) =>
        idea.businessType !== inputs.businessType ||
        idea.oneLiner.length > 140 ||
        !BUSINESS_TYPES.some((option) => option.key === idea.businessType),
    )
  ) {
    throw new Error("brainstorm-unavailable");
  }
  return ideas;
}
