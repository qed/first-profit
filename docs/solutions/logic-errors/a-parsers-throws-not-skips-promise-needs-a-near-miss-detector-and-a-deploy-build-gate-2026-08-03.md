---
title: "A parser's throws-not-skips promise needs a near-miss detector, and with no CI the deploy build must be the gate"
module: fp-content-pipeline
date: 2026-08-03
problem_type: logic_error
component: development_workflow
severity: high
symptoms:
  - "A band bullet with a plain hyphen (3-5) instead of an en dash, or one space of indentation, silently vanished or was mis-filed as task body prose - no exception, no manifest violation, no test failure"
  - "A corrupted or stale generated content module could deploy to production because nothing between commit and Vercel build runs the drift/manifest checks"
root_cause: logic_error
resolution_type: code_fix
tags: [parser, near-miss, silent-drop, content-pipeline, generated-module, build-gate, vercel, no-ci, manifest]
---

# A parser's throws-not-skips promise needs a near-miss detector — and with no CI, the deploy build must be the gate

## Problem

The curriculum-brief parser (`src/data/parseCurriculum.ts`, Unit 4 of the
full-path plan) promised "every structural expectation throws rather than
skips." Review (feat/path-content-engine, 619c11b → a21b2b2) proved the promise
had a hole, and the repo had no gate that would catch the resulting bad content
before it deployed.

## Symptoms

- The strict regexes (BAND_RE et al.) matched only perfectly-formed lines; any
  line that failed them fell to a catch-all "append to body" / "ignore" branch.
  A future brief edit with a hyphen for an en dash, or a markdown editor's
  auto-indent, would silently drop a band variant or file it as body prose —
  the first symptom being a child reading the wrong instruction.
- `npm test` was the only thing that ran the drift/manifest checks, and the
  repo has no CI: Vercel deploys whatever `npm run build` accepts, and vite
  knows nothing about content invariants.

## What Didn't Work

- Trusting strict regexes alone: strictness makes GOOD lines parse reliably,
  but says nothing about what happens to ALMOST-good lines — the catch-all
  branch decided that, silently.
- Spot-check fixtures: shape tests validated counts and two sample tasks;
  band-variant content loss changes neither.

## Solution

1. **Near-miss detector**: after the known-shape matchers, any line that LOOKS
   structural (here: starts with `- **` under a task) but matched no known
   pattern THROWS, naming the task and the offending line. Tolerance (accept
   hyphen or en dash, tolerate indentation) narrows the near-miss set;
   the detector catches the rest.
2. **Deploy-build gate**: a fast preflight (`scripts/check-path-content.ts`:
   re-parse → byte-compare the committed generated module → manifest assert →
   assembly assert) wired as the FIRST step of the npm `build` script. Vercel
   runs `npm run build`, so a commit with stale/corrupted content can no longer
   deploy — the deploy pipeline itself became the missing CI gate (<2s cost).
3. **Manifest granularity**: per-criterion task counts joined the manifest, so
   a task silently migrating between same-phase criteria (which preserves every
   aggregate total) fails loudly too.

## Why This Works

A parse-or-throw contract is only as strong as its weakest fall-through: the
near-miss detector converts the unbounded space of "almost right" inputs from
silent misfiling into loud failure, which is the only safe default for content
kids will read. And an invariant that only a test run enforces does not protect
production in a repo without CI — attaching it to the one command the deploy
platform always runs (the build) makes enforcement structural instead of
disciplinary.

## Prevention

- When writing any strict-regex line parser with a catch-all branch, enumerate
  what reaches the catch-all and add a near-miss throw for anything that
  resembles a structural marker. Test with deliberately-almost-right input
  (hyphen/en-dash swaps, stray indent), not only well-formed fixtures.
- In a repo with no CI, ask of every commit-time invariant: what actually runs
  it before production? If the answer is "developer discipline", wire it into
  the build script the deploy platform executes.
- Manifests over aggregates: pin counts at the finest grain that ids depend on
  (per criterion here), not just totals — totals are invariant under exactly
  the edits that shift id meaning.
- Related: The120's
  `docs/solutions/logic-errors/aggregate-invariants-not-fixture-spot-checks-for-parsed-content-2026-07-21.md`
  (this doc extends it with the near-miss and build-gate halves) and this
  repo's Content pipeline section in CLAUDE.md.
