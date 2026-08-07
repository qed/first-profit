/** Authenticated, server-only DeepSeek proxy for the 1.1.1 Idea Spark Lab. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  callDeepSeekBrainstorm,
  consumeBrainstormQuota,
  validateBrainstormRequest,
  verifySupabaseUser,
} from "./_lib/brainstormSupport.js";

function authorizationHeader(req: VercelRequest): string | undefined {
  const value = req.headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 12_000) {
    res.status(413).json({ error: "invalid_request" });
    return;
  }

  const validated = validateBrainstormRequest(req.body);
  if (!validated.ok) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  if (process.env.DEEPSEEK_BRAINSTORM_ENABLED !== "true") {
    res.status(503).json({ error: "temporarily_unavailable" });
    return;
  }

  const auth = await verifySupabaseUser(
    {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    },
    authorizationHeader(req),
  );
  if (!auth.ok) {
    if (auth.reason === "configuration" || auth.reason === "network") {
      console.error(`brainstorm: auth unavailable (${auth.reason})`);
      res.status(503).json({ error: "temporarily_unavailable" });
      return;
    }
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const quota = consumeBrainstormQuota(auth.userId);
  if (!quota.allowed) {
    res.setHeader("Retry-After", String(quota.retryAfterSeconds));
    res.status(429).json({ error: "try_again_later" });
    return;
  }

  const result = await callDeepSeekBrainstorm(
    {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL,
      model: process.env.DEEPSEEK_MODEL,
    },
    validated.request,
  );
  if (!result.ok) {
    if (result.reason === "configuration") {
      console.error("brainstorm: provider configuration unavailable");
    }
    res.status(result.reason === "configuration" ? 503 : 502).json({
      error: "temporarily_unavailable",
    });
    return;
  }

  res.status(200).json({ source: "ai", ideas: result.ideas });
}
