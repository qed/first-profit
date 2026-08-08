---
title: Swapping a never-throwing check for a config-validated helper at render scope upgrades "missing env" from feature-off to blank page
date: 2026-08-08
module: config
component: GlobalNav / Landing (fpv03 U1 CTA cutover)
tags: [config, env-vars, render-scope, error-boundary, url-derivation, cta, fallback]
problem_type: logic_error
severity: P1 (caught in review before ship)
---

# Problem

fpv03 U1 replaced the landing CTAs' flag check `isSignupEnabled()` (which by
deliberate design NEVER throws; a missing flag just means "off") with
`getStartFunnelUrl()`, which called `getConfig()` — a function that THROWS a
hard Error naming the first missing required env var. Both call sites were at
render scope (`href={getStartFunnelUrl()}` in GlobalNav's landing branch; a
`const href = ...` at the top of Landing), and the app has no ErrorBoundary.

Net effect: any environment missing/blanking ANY of the three required vars
would have gone from "CTA routes to login" (the old degraded state) to a fully
blank white public landing page. Nothing in the suite could catch it, because
every consumer test stubbed the helper (`vi.mock("../../config")`) or bypassed
it with a prop — the throw path was structurally untestable.

This is the render-scope sibling of
[a-module-load-throw-is-scoped-by-the-import-graph-...-2026-08-05.md](a-module-load-throw-is-scoped-by-the-import-graph-not-by-the-modules-purpose-an-assertion-protecting-a-staff-tool-blanks-the-app-for-every-learner-2026-08-05.md):
that one is "don't throw at module load"; this one is "a render-scope call
inherits whatever throw behavior its callee has, and swapping the callee can
silently change the failure mode of the whole page."

# Symptoms

None in normal operation — the failure only appears in an env-less or
misconfigured deploy (Vercel preview without vars, a var blanked by mistake),
exactly the environments least covered by testing. Caught by adversarial
review comparing the OLD callee's failure contract (never throws, documented
in its docstring) against the NEW callee's (throws by design).

# What Didn't Work

- Relying on the test suite: all consumers mocked the helper or injected a
  prop, so no test ever executed the real `getConfig()` path from a component.
- "The var is already required elsewhere" reasoning: true, but the LANDING
  page previously rendered fine without config being touched; the swap moved
  the validation earlier into a public page's render path.

# Solution

Make the URL helper part of the page's availability contract: it never
throws, and degrades to the canonical production URL.

```ts
export const FALLBACK_START_FUNNEL_URL = "https://the120.school/start";

export function getStartFunnelUrl(env?: EnvLike): string {
  try {
    return new URL("/start", getConfig(env).t120ApiUrl).toString();
  } catch {
    return FALLBACK_START_FUNNEL_URL;
  }
}
```

Plus direct unit tests on the REAL function (not the mock) covering the
URL-join semantics and both throw sources:

- `new URL("/start", base)` resolves at the ORIGIN ROOT: a base with a path
  (`https://host/api`) still yields `https://host/start` — document whether
  that is the intent (here it is: the funnel lives at the origin).
- Missing required var (getConfig throws) → fallback.
- Schemeless base (`new URL` throws TypeError) → fallback; note getConfig
  validates presence only, NOT URL well-formedness.

# Why This Works

The failure contract is now owned by the helper, not inherited from
`getConfig`. A config problem degrades to a still-correct production link
instead of a render throw, and the contract is pinned by tests that exercise
the real implementation, closing the "every consumer stubs it" blind spot.

# Prevention

1. When swapping a callee in a render path, diff the FAILURE CONTRACTS, not
   just the signatures: "what does each do when its inputs are missing or
   malformed?" A docstring like "never throws / deliberately skips
   validation" on the old callee is a contract the replacement must either
   honor or consciously change.
2. Any helper called at render scope on a public, logged-out page must be
   never-throw (or the tree needs an ErrorBoundary — this app has none).
3. If every test of a function's consumers mocks that function, the function
   needs its own direct tests. "All consumers stub it" means zero coverage of
   the real path.
4. `new URL(path-starting-with-slash, base)` drops the base's path segment.
   Assert the intended behavior in a test whenever deriving cross-origin URLs
   from an env var.
