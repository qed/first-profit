// THE GUARD FOR THE STRIP-BEFORE-ANYTHING INVARIANT (v3 Unit 6 review, FIX 4).
//
// The handoff code is stripped from the URL by a SIDE-EFFECT IMPORT
// (`src/screens/auth/bootEnterLink.ts`) placed above every other JS import in
// `src/index.tsx`. That placement is the whole mechanism: ES module bodies
// evaluate depth-first in SOURCE ORDER, so anything imported after it — the
// entire App tree, and any analytics/error-reporting module a future
// contributor bolts on — can only ever observe the already-stripped URL.
//
// The invariant is therefore a property of the SOURCE ORDER, and a source-level
// test is the honest way to pin it: a runtime test in jsdom could not tell a
// hoisted call from a properly ordered one (both "work" when nothing in the
// tree happens to read `location` at module scope — which is exactly why the
// old bug was invisible). This test fails the moment someone reorders the
// imports, converts the side-effect import to a named one, or deletes it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const indexSrc = readFileSync(path.resolve(process.cwd(), "src/index.tsx"), "utf8");

/** Every `import ... from "x"` / `import "x"` specifier, in source order. */
function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/^\s*import\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/gm)].map(
    (m) => m[1] ?? "",
  );
}

/** A specifier whose module body is JS we control or that could read the URL.
 *  CSS/font stylesheet imports are excluded: they contribute no JS. */
function isJsModule(spec: string): boolean {
  return !/\.css$/.test(spec) && !spec.startsWith("@fontsource");
}

const BOOT = "./screens/auth/bootEnterLink";

describe("src/index.tsx boot order", () => {
  it("imports the enter-link strip, as a bare side-effect import", () => {
    expect(importSpecifiers(indexSrc)).toContain(BOOT);
    // Bare form only: a named import would still hoist, but the point is that
    // the MODULE BODY runs — keep the form that says so.
    expect(indexSrc).toMatch(
      new RegExp(`^\\s*import\\s+["']${BOOT.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}["']`, "m"),
    );
  });

  it("puts it BEFORE every other JS import — the whole guarantee", () => {
    const js = importSpecifiers(indexSrc).filter(isJsModule);
    expect(js.length).toBeGreaterThan(1); // react-dom + App at minimum
    expect(js[0]).toBe(BOOT);
  });

  it("does NOT call consumeEnterLink as a statement (imports hoist above it)", () => {
    // The original bug: `consumeEnterLink()` on line ~23 with `import { App }`
    // above it. A statement here can never be first; only an import can.
    // (Comments are stripped: the file's prose names the old call on purpose.)
    const code = indexSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
    expect(code).not.toMatch(/consumeEnterLink\s*\(/);
  });

  it("the boot module's only job is to run the strip at module scope", () => {
    const bootSrc = readFileSync(
      path.resolve(process.cwd(), "src/screens/auth/bootEnterLink.ts"),
      "utf8",
    );
    const code = bootSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
    expect(code).toMatch(/import\s*\{\s*consumeEnterLink\s*\}\s*from\s*["']\.\/enterLink["']/);
    expect(code).toMatch(/^\s*consumeEnterLink\(\);\s*$/m);
    // No exports: nothing may import this for a value and thereby pull it into
    // the App tree at a different point in the order.
    expect(code).not.toMatch(/\bexport\b/);
  });
});
