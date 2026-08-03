/**
 * Repo-local pin for vercel.json (plan Unit 3). vercel.json must be strict
 * JSON (no comments), so this test IS its enforced documentation:
 *
 * - the handle rewrite's negative-lookahead exclusions must list EXACTLY the
 *   48 reserved handles in `api/_lib/reservedHandles.ts` (the one first-profit
 *   copy, itself cross-referenced to the120's RESERVED_HANDLES source of
 *   truth and the `fp_reserved_handles` migration seed — see that module).
 * - rewrite ORDER is load-bearing: handle rule first, SPA catchall second
 *   (first match wins; no fall-through after a rewrite matches).
 * - the charset includes A-Z on purpose (Vercel `source` is case-sensitive):
 *   mixed-case links must reach /api/site for the 308-to-lowercase, not fall
 *   to the SPA landing page.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RESERVED_HANDLES } from "../reservedHandles";

interface Rewrite {
  source: string;
  destination: string;
}

interface VercelConfig {
  trailingSlash: boolean;
  rewrites: Rewrite[];
}

const config = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "vercel.json"), "utf8"),
) as VercelConfig;

/** The `:handle(...)` param pattern from the rewrite source, as a usable
 *  RegExp anchored the way path-to-regexp anchors a full single segment. */
function handleSegmentRegExp(source: string): RegExp {
  const open = source.indexOf("(");
  expect(open).toBeGreaterThan(-1);
  const pattern = source.slice(open + 1, source.lastIndexOf(")"));
  return new RegExp(`^(?:${pattern})$`);
}

describe("vercel.json", () => {
  it("disables trailing slashes and orders rewrites handle-first, catchall-second", () => {
    expect(config.trailingSlash).toBe(false);
    expect(config.rewrites).toHaveLength(2);
    expect(config.rewrites[0].source.startsWith("/:handle(")).toBe(true);
    expect(config.rewrites[0].destination).toBe("/api/site");
    expect(config.rewrites[1]).toEqual({ source: "/(.*)", destination: "/index.html" });
  });

  it("excludes exactly the 48-handle reserved seed (the120 fp-public-site-rules.ts)", () => {
    expect(RESERVED_HANDLES).toHaveLength(48);
    const source = config.rewrites[0].source;
    const match = /\(\?!\(\?:([^)]+)\)\$\)/.exec(source);
    expect(match).not.toBeNull();
    const excluded = (match as RegExpExecArray)[1].split("|");
    expect(new Set(excluded)).toEqual(new Set(RESERVED_HANDLES));
    expect(excluded).toHaveLength(48);
  });

  it("routes handles (including mixed case) to the function and reserved/multi-segment paths past it", () => {
    const segment = handleSegmentRegExp(config.rewrites[0].source);
    // Claimable-shaped segments reach /api/site.
    expect(segment.test("cedric")).toBe(true);
    expect(segment.test("abc-123")).toBe(true);
    // Mixed case MUST reach the function for the 308-to-lowercase.
    expect(segment.test("Cedric")).toBe(true);
    // Reserved single-segment routes fall through to the SPA catchall.
    for (const reserved of RESERVED_HANDLES) {
      expect(segment.test(reserved)).toBe(false);
    }
    // A reserved word as a PREFIX of a longer handle is not excluded.
    expect(segment.test("signup2")).toBe(true);
    expect(segment.test("loginella")).toBe(true);
    // Non-charset segments never match the handle rule.
    expect(segment.test("signup/verify")).toBe(false);
    expect(segment.test("cedric.js")).toBe(false);
    expect(segment.test("c%20d")).toBe(false);
  });
});
