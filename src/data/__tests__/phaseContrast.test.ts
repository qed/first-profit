/**
 * WCAG contrast pins for the phase CTA tokens (unit review FIX 4).
 *
 * Every phase's `ctaFill` must hold >= 4.5:1 contrast against WHITE text (the
 * StepRunner primary CTA paints white text on ctaFill for non-sell phases).
 * The relative-luminance math is implemented inline per WCAG 2.x so the pin is
 * a real computation, not a hand-checked constant: a future "brighten the
 * amber" tweak fails here before it ships an unreadable button.
 */
import { describe, expect, it } from "vitest";
import { PHASES } from "../path";

/** Parse the repo's `hsl(H S% L%)` token shape (no alpha on solid fills). */
function parseHsl(token: string): { h: number; s: number; l: number } {
  const m = token.match(/^hsl\((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%\)$/);
  if (!m) throw new Error(`unparseable hsl token: ${token}`);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

/** HSL -> linear-ish sRGB triple in 0..1 (CSS Color 4 hsl-to-rgb algorithm). */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** WCAG relative luminance of an sRGB triple in 0..1. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of a color vs WHITE (luminance 1.0). */
function contrastVsWhite(token: string): number {
  const { h, s, l } = parseHsl(token);
  const lum = relativeLuminance(hslToRgb(h, s, l));
  return (1.0 + 0.05) / (lum + 0.05);
}

describe("PHASES ctaFill — computed WCAG contrast vs white text", () => {
  it("every phase's ctaFill holds >= 4.5:1 (AA normal text)", () => {
    for (const phase of PHASES) {
      const ratio = contrastVsWhite(phase.ctaFill);
      expect(ratio, `${phase.id} ctaFill ${phase.ctaFill} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("every phase's ctaShadow is darker than its ctaFill (pressed shadow reads as depth)", () => {
    for (const phase of PHASES) {
      expect(
        contrastVsWhite(phase.ctaShadow),
        `${phase.id} ctaShadow must contrast more than its fill`,
      ).toBeGreaterThan(contrastVsWhite(phase.ctaFill));
    }
  });

  it("documents the raw accents that FAIL the bar (why ctaFill exists at all)", () => {
    // The scale amber accent is the worst offender; if this ever starts
    // passing, the accent palette changed and the ctaFill split may be
    // revisited deliberately (not silently).
    const scale = PHASES.find((p) => p.id === "scale")!;
    expect(contrastVsWhite(scale.accent)).toBeLessThan(4.5);
  });
});
