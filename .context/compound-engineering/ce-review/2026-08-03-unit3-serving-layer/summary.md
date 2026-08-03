# ce:review run — Unit 3: serving layer (first-profit)

Date: 2026-08-03 · Mode: autofix (fix-all-real-findings) · Scope: vercel.json + api/** + config edits on feat/real-public-site
Plan: docs/plans/2026-08-03-002-feat-real-public-site-plan.md

## Reviewers (6 bundles)
correctness, security, adversarial, reliability+perf, testing, kieran-typescript+maintainability, standards+learnings.

## Verdict: Ready pending the live-preview gate (all code findings fixed)

## Findings → all FIXED
- P2 query-collision: /cedric?handle=evil array/scalar ambiguity — deterministic extraction (array→first), documented untrusted, preview-checklist case added.
- P2 handler untested — extraction+RPC factored to api/_lib/handlerSupport.ts; new api/__tests__/site.test.ts (14 tests: headers, 308, all failure classes).
- P2 zero failure logging — injectable logError; status+snippet logged, bodies stay clean (tested).
- P2 SiteResponse now a real discriminated union (308 variant carries location, others html).
- P2 default-headline triplication — shared src/lib/siteCopy.ts imported by renderSite + YourSite + onboarding screens.
- P3s: multi-row RPC → 503; reserved 46-list moved to api/_lib/reservedHandles.ts (decideSiteRequest defense-in-depth + vercelConfig.test pins vercel.json against the module); 'SIGNUP' → 308 → /signup round-trip pinned as intentional; composed default headline clamped ≤120 with name budget.
- Docs honesty: ~390px live-preview item explicitly NOT checked (local render was a design check only); SWR-delays-edits note added.

## Security: no findings (single publicText escape gate held under adversarial probes). Enumeration via distinct 404 copy (offline vs never-claimed) is the designed R9d behavior.

## Accepted residuals / deferred to Unit 7 preview gate
- Rewrite semantics (path-to-regexp fidelity, query merge, /signup/verify, assets, link previews, Deployment Protection) — provable only on a deployment; full checklist in api/site.ts header.
- CDN cache-key query-string variance (utm params) — bounded by 5s TTL.
- No functions.maxDuration pinned (5s RPC timeout under platform default) — note for Unit 7.
- R20 amendment must mention the serving function as a new anon-key consumer (Unit 7, hard gate).
- 46-list sync the120⟷vercel.json remains manual across repos; repo-local hop is test-pinned.

## Compound pass
Run; learning intentionally deferred: the serving-layer/“first serverless route beside a SPA catchall” solution doc is scheduled post live-preview verification (plan Unit 7 + Documentation notes) — authoring it before the rewrite behavior is verified live would codify unverified claims. Unit 7 owes the doc.

Verification after fixes: full suite 872 passed (49 files); tsc clean; npm run build (preflight+vite) passes; eslint api clean.
