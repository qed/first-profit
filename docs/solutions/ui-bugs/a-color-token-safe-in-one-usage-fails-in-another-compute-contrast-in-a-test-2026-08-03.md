---
name: a-color-token-safe-in-one-usage-fails-in-another-compute-contrast-in-a-test
module: fp-phase-ui
date: 2026-08-03
problem_type: ui_bug
component: frontend_stimulus
severity: medium
symptoms:
  - "Phase accent tokens read perfectly as tinted text on a 9%-alpha wash, then rendered near-unreadable (1.97:1) as a solid fill under white text on the Scale phase's primary button"
  - "The most-tapped button of 12 of 25 criteria shipped below WCAG AA with every test green"
root_cause: logic_error
resolution_type: code_fix
tags: [wcag, contrast, color-tokens, accessibility, design-tokens, phase-colors, computed-test]
---

# A color token safe in one usage fails in another — compute contrast in a test

## Problem

The phase palette (`PHASES` accents) had one proven usage: tinted TEXT on a
near-white wash, where every value passes trivially. Unit 8 reused the same
accents as SOLID BUTTON FILLS under white text — a different contrast equation
entirely. Scale's amber computed to 1.97:1 against white; Grow 3.19:1; Build
4.09:1. Nothing failed: no test knew contrast existed.

## Symptoms

See frontmatter. Caught only by an adversarial review that computed the
ratios; the pixel screenshots "looked fine" at a glance.

## What Didn't Work

- Trusting a palette because it is already shipped: tokens are safe per
  USAGE-PAIR (foreground x background), not per color.
- Eyeballing screenshots: 3:1 and 4.5:1 look similar in a thumbnail.

## Solution

Per-usage tokens plus a computed test (e7a16f4): `ctaFill`/`ctaShadow` were
added per phase, with lightness deepened until white-on-fill computes >= 4.5:1
(scale needed 32% lightness; the "obvious" 34% computed 4.20 and was rejected
BY THE TEST). `phaseContrast.test.ts` implements WCAG relative luminance
inline and asserts every phase's ctaFill >= 4.5 against white — and pins that
the RAW accent fails, so nobody "simplifies" the tokens back.

## Prevention

- When a token set gains a NEW usage-pair (text-on-X becomes X-under-text,
  fills, borders on new grounds), treat it as new design work: compute the
  ratio, don't inherit trust.
- Contrast is arithmetic — put it in a unit test (relative luminance is ~15
  lines). A computed assertion converts accessibility from a review lens into
  a build gate.
- Pin the counterexample too: asserting the old value FAILS stops regressions
  disguised as cleanups.
