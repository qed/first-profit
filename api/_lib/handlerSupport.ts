/**
 * Testable support for the thin `api/site.ts` handler (Unit 3 review fix 2):
 * request-segment extraction (pure over a minimal request shape) and the
 * PostgREST RPC call (global fetch; failures logged via the injected
 * `logError` with status/snippet ONLY — never body-into-response, never env
 * values or keys). No Vercel type imports here so the whole module runs under
 * plain vitest node.
 */

import type { LogError, SiteEnv, SiteRpcResult } from "./decideSiteResponse.js";

/** The minimal slice of VercelRequest this module reads. */
export interface RequestLike {
  url?: string;
  query?: Record<string, string | string[] | undefined>;
}

/**
 * The handle segment as the rewrite delivers it (named params arrive as query
 * string). Extraction is deterministic and documented (review fix 1):
 * - `req.query.handle` string → used as-is;
 * - `req.query.handle` ARRAY (a visitor URL like `/cedric?handle=evil` makes
 *   Vercel merge the rewrite's param with the visitor's own query param) →
 *   the FIRST value, deterministically. Whichever value wins either merge
 *   order, it is UNTRUSTED input: it still has to pass `decideSiteRequest`'s
 *   full charset/length/reserved validation before any RPC, and nothing
 *   extracted here is ever echoed into a header. The residual (a crafted
 *   link serving another VALID handle's page under a mismatched path) is
 *   pinned on the preview checklist in api/site.ts;
 * - otherwise fall back to the single path segment (direct invocations);
 *   multi-segment or undecodable paths → null (→ not-found, no RPC).
 */
export function extractSegment(req: RequestLike): unknown {
  const fromQuery = req.query?.handle;
  if (typeof fromQuery === "string" && fromQuery.length > 0) return fromQuery;
  if (Array.isArray(fromQuery) && typeof fromQuery[0] === "string" && fromQuery[0].length > 0) {
    return fromQuery[0];
  }
  const path = (req.url ?? "").split("?")[0];
  const segments = path.split("/").filter(Boolean);
  if (segments.length !== 1) return null;
  try {
    return decodeURIComponent(segments[0]);
  } catch {
    return null;
  }
}

/** PostgREST RPC: POST {SUPABASE_URL}/rest/v1/rpc/fp_public_site with the
 *  anon key. Network/HTTP/parse failures resolve `{ok:false}` or throw into
 *  `resolveSiteResponse`'s catch — the visitor always gets the clean 503
 *  page; the operator gets a console.error with status + snippet. */
export async function callFpPublicSite(
  env: SiteEnv,
  handle: string,
  logError: LogError = console.error,
): Promise<SiteRpcResult> {
  const base = (env.supabaseUrl ?? "").replace(/\/+$/, "");
  const key = env.supabaseAnonKey ?? "";
  const res = await fetch(`${base}/rest/v1/rpc/fp_public_site`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ p_handle: handle }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    let snippet = "";
    try {
      snippet = (await res.text()).slice(0, 200);
    } catch {
      snippet = "<unreadable body>";
    }
    logError(`fp_public_site: RPC HTTP ${res.status}: ${snippet}`);
    return { ok: false, body: null };
  }
  return { ok: true, body: await res.json() };
}
