/**
 * Vercel Function serving the public learner page at
 * firstprofit.school/<handle> (real-public-site plan Unit 3, R5–R10, R12,
 * R17). Thin by design: only env reads and response writes live here; segment
 * extraction + the RPC call are in `_lib/handlerSupport.ts`, every decision
 * and every byte of HTML in `_lib/decideSiteResponse.ts` / `_lib/renderSite
 * .ts` — all pure/injected and covered by the vitest suite (including this
 * handler, via `api/__tests__/site.test.ts` with a stubbed fetch).
 *
 * ROUTING (vercel.json — strict JSON, so its documentation lives here):
 * `trailingSlash: false`; rewrites in order:
 *   1. `/:handle((?!(?:signup|login|…|store)$)[A-Za-z0-9-]+)` → `/api/site`
 *      — single-segment, charset-constrained. The charset includes A-Z ON
 *      PURPOSE so mixed-case links (`/Cedric`) reach this function and get a
 *      308 to lowercase instead of silently landing on the SPA landing page
 *      (`source` matching is case-sensitive). The negative lookahead is
 *      wrapped inside the param's capture group (a Vercel requirement) and
 *      lists EXACTLY the 48 reserved handles the120 seeds — the repo copy is
 *      `api/_lib/reservedHandles.ts` (cross-referenced there to the120
 *      `app/fp/lib/fp-public-site-rules.ts` RESERVED_HANDLES and migration
 *      `supabase/migrations/20260907120000_fp_public_sites.sql`); the pin is
 *      `api/_lib/__tests__/vercelConfig.test.ts` (fails if vercel.json's
 *      alternation drifts from that module). `decideSiteRequest` also refuses
 *      reserved handles itself, so a direct /api/site call cannot bypass the
 *      exclusions. Multi-segment paths (`/signup/verify`) can never match the
 *      single-segment rule; filesystem precedence serves `/assets/*` and
 *      `/api/*` before rewrites are consulted.
 *   2. `/(.*)` → `/index.html` — the SPA catchall (previously a dashboard
 *      rule; the dashboard copy is deleted only after this file is verified
 *      live — plan Unit 7).
 *
 * ENV (server vars, NOT the client-bundle `VITE_` vars): `SUPABASE_URL` +
 * `SUPABASE_ANON_KEY`, set in the Vercel project. Missing env → 503
 * "temporarily unavailable" with no detail (see `.env.example`).
 *
 * Every response carries `X-Robots-Tag: noindex` (R17) and a per-state
 * `Cache-Control` (published: `public, s-maxage=5, stale-while-revalidate=55`;
 * everything else `no-store`). Note the SWR window cuts both ways: ordinary
 * EDITS as well as takedowns can be served stale for up to ~60s per region —
 * the Unit 7 `Vercel-Cache-Tag` purge decision covers both.
 *
 * PREVIEW-DEPLOY CHECKLIST (plan Unit 3 integration — cannot be verified
 * locally; this is the Unit 7 preview gate):
 *   [ ] Deployment Protection OFF on the preview (or bypass token in hand) —
 *       the anonymous-crawler path 401s otherwise
 *   [ ] /signup/verify?token=x still reaches the SPA
 *   [ ] /assets/* (and other built files) serve untouched
 *   [ ] unknown handle → this function's 404 page (not the SPA landing)
 *   [ ] mixed-case /Handle → 308 → lowercase
 *   [ ] /SIGNUP (uppercase reserved) → 308 → /signup → SPA (no loop)
 *   [ ] /cedric?handle=evil → verify which value Vercel's query merge feeds
 *       req.query.handle and that the page served matches expectations
 *       (extraction takes the FIRST array value — see handlerSupport.ts)
 *   [ ] a claimed+published handle renders the learner page — verify LIVE at
 *       ~390px and desktop (the local HTML render during implementation was
 *       a design check, not this deployment verification)
 *   [ ] link pasted into a real messaging app shows the learner's headline
 *   [ ] confirm which client-IP header the platform sets on live requests
 *       (WAF rate-limit keying + the120 extractClientIp assumption — the
 *       prior-plan caution says verify on a live preview, never assume)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { resolveSiteResponse, type SiteEnv } from "./_lib/decideSiteResponse";
import { callFpPublicSite, extractSegment } from "./_lib/handlerSupport";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const env: SiteEnv = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  };
  const response = await resolveSiteResponse(extractSegment(req), env, (h) =>
    callFpPublicSite(env, h),
  );

  res.setHeader("X-Robots-Tag", "noindex");
  res.setHeader("Cache-Control", response.cacheControl);
  if (response.status === 308) {
    res.setHeader("Location", response.location);
    res.status(308).end();
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(response.status).send(response.html);
}
