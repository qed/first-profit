/**
 * Pure decision logic for the public-site serving function (plan Unit 3) —
 * consumed by the thin `api/site.ts` handler and tested without the Vercel
 * runtime. Flat error handling: nothing here throws; every path resolves to a
 * complete `SiteResponse`, so the SPA catchall can NEVER be fallen through to
 * and a visitor can never see a stack trace.
 *
 * Discipline (institutional): misreporting existence is worse than being
 * unavailable — not-found (404) is returned ONLY on a definitive empty RPC
 * result; RPC errors, unexpected shapes (including a multi-row anomaly), and
 * missing env all render the "temporarily unavailable" page with 503 and NO
 * cache, never a 404 and never any error/env detail. Failures are logged
 * server-side via the injected `logError` (message text only — never body
 * content, env values, or keys).
 *
 * Redirect safety: the 308 `Location` is constructed EXCLUSIVELY as
 * "/" + the already-charset-validated lowercase handle — never echoed from the
 * request URL, so no open-redirect or CRLF shape can ever reach the header.
 */

import { RESERVED_HANDLE_SET } from "./reservedHandles";
import {
  renderNotFoundPage,
  renderOfflinePage,
  renderPublishedPage,
  renderUnavailablePage,
} from "./renderSite";

/** Same shape as the DB CHECK / fp_public_site() argument validator (the120
 *  fp-public-site-rules.ts HANDLE_PATTERN). An invalid segment 404s WITHOUT
 *  an RPC call. */
const HANDLE_RE = /^[a-z0-9-]{3,20}$/;

export const PUBLISHED_CACHE_CONTROL =
  "public, s-maxage=5, stale-while-revalidate=55";
/** Everything that is not a published page: a cached 404 at the
 *  onboarding-reveal moment would defeat "live within seconds" (R11). */
export const NO_STORE = "no-store";

/** Discriminated on `status` so invalid states are unrepresentable: an HTML
 *  response always has html and never a location; a redirect always has its
 *  location and never a body (review fix 4). */
export type SiteResponse =
  | { status: 200 | 404 | 503; html: string; cacheControl: string }
  | { status: 308; location: string; cacheControl: string };

function notFoundResponse(): SiteResponse {
  return { status: 404, html: renderNotFoundPage(), cacheControl: NO_STORE };
}

function unavailableResponse(): SiteResponse {
  return { status: 503, html: renderUnavailablePage(), cacheControl: NO_STORE };
}

export type RequestDecision =
  | { kind: "respond"; response: SiteResponse }
  | { kind: "lookup"; handle: string };

/**
 * Normalize + validate the path segment BEFORE any I/O:
 * - not a string / empty / bad charset / length outside 3–20 → not-found,
 *   no RPC call (hostile segments can also never produce a redirect);
 * - mixed case or a stray trailing slash (direct function invocation —
 *   `trailingSlash: false` already redirects at the platform edge) → 308 to
 *   the one canonical form, Location built only from the validated handle.
 *   This is deliberately checked BEFORE the reserved-word check, so an
 *   uppercase reserved path (`/SIGNUP`) round-trips 308 → `/signup` → the
 *   SPA catchall (the rewrite's exclusions are case-sensitive and only skip
 *   the lowercase forms). Loop-free by construction: the redirect target is
 *   lowercase, which this function never redirects again;
 * - reserved handle (defense-in-depth for direct /api/site calls — the
 *   rewrite already excludes these) → not-found without an RPC call;
 * - canonical lowercase handle → lookup.
 */
export function decideSiteRequest(rawSegment: unknown): RequestDecision {
  if (typeof rawSegment !== "string") {
    return { kind: "respond", response: notFoundResponse() };
  }
  const stripped = rawSegment.endsWith("/")
    ? rawSegment.slice(0, -1)
    : rawSegment;
  const handle = stripped.toLowerCase();
  if (!HANDLE_RE.test(handle)) {
    return { kind: "respond", response: notFoundResponse() };
  }
  if (rawSegment !== handle) {
    return {
      kind: "respond",
      response: { status: 308, location: `/${handle}`, cacheControl: NO_STORE },
    };
  }
  if (RESERVED_HANDLE_SET.has(handle)) {
    return { kind: "respond", response: notFoundResponse() };
  }
  return { kind: "lookup", handle };
}

/**
 * Map the PostgREST rows from `fp_public_site(p_handle)` to a response.
 * Contract (verified against the120 migration 20260907120000_fp_public_sites
 * .sql): AT MOST one row {state:'published', first_name, headline, one_liner}
 * | {state:'offline', nulls} | ZERO rows (unknown handle OR
 * claimed-never-published — byte-identical by design, both render not-found).
 * Anything else — including MORE than one row (handle is UNIQUE; a multi-row
 * result means the contract is broken, not that the page is gone) — is NOT a
 * definitive absence → 503, never 404.
 */
export function decideRpcOutcome(body: unknown): SiteResponse {
  if (!Array.isArray(body)) return unavailableResponse();
  if (body.length === 0) return notFoundResponse();
  if (body.length > 1) return unavailableResponse();
  const row: unknown = body[0];
  if (typeof row !== "object" || row === null) return unavailableResponse();
  const record = row as Record<string, unknown>;
  if (record.state === "published") {
    return {
      status: 200,
      html: renderPublishedPage({
        firstName: typeof record.first_name === "string" ? record.first_name : null,
        headline: typeof record.headline === "string" ? record.headline : null,
        oneLiner: typeof record.one_liner === "string" ? record.one_liner : null,
      }),
      cacheControl: PUBLISHED_CACHE_CONTROL,
    };
  }
  if (record.state === "offline") {
    return { status: 404, html: renderOfflinePage(), cacheControl: NO_STORE };
  }
  return unavailableResponse();
}

/* ------------------------------------------------------------ orchestrator */

export interface SiteEnv {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
}

export interface SiteRpcResult {
  ok: boolean;
  body: unknown;
}

export type SiteRpc = (handle: string) => Promise<SiteRpcResult>;

/** Server-side failure logger. Receives a short message ONLY — callers must
 *  never pass response bodies, env values, or keys. */
export type LogError = (message: string) => void;

/**
 * The whole request decision, pure over an injected RPC. The env check runs
 * BEFORE the RPC (missing config → the same 503 as an RPC failure, with no
 * env values or detail in the body — the renderer takes no arguments there,
 * so leakage is structurally impossible). A throwing RPC is caught here and
 * logged (message only); `api/site.ts` never needs its own try/catch.
 */
export async function resolveSiteResponse(
  rawSegment: unknown,
  env: SiteEnv,
  rpc: SiteRpc,
  logError: LogError = console.error,
): Promise<SiteResponse> {
  const decision = decideSiteRequest(rawSegment);
  if (decision.kind === "respond") return decision.response;
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    logError(
      "fp_public_site: missing server env (SUPABASE_URL and/or SUPABASE_ANON_KEY)",
    );
    return unavailableResponse();
  }
  try {
    const result = await rpc(decision.handle);
    if (!result.ok) return unavailableResponse();
    return decideRpcOutcome(result.body);
  } catch (err) {
    logError(
      `fp_public_site: RPC threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return unavailableResponse();
  }
}
