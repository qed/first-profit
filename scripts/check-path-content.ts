/**
 * DEPLOY GATE — path-content preflight, the FIRST step of `npm run build`.
 *
 *   npx tsx scripts/check-path-content.ts
 *
 * This repo has no CI: Vercel runs `npm run build` on every push to main, so
 * wiring this check ahead of `vite build` is what guarantees a broken or stale
 * content commit can never deploy to firstprofit.school. It fails fast (well
 * under 2s) when:
 *
 *   1. DRIFT — the committed `src/data/pathContent.generated.ts` does not
 *      byte-match a fresh parse+render of the canonical brief
 *      (fix: `npm run build:path-content`, commit the result);
 *   2. MANIFEST — the parsed content violates PATH_MANIFEST (counts, per-phase
 *      and per-criterion totals, closers, field-level checks);
 *   3. ASSEMBLY — the hooks registry or STEP_META chrome no longer lines up
 *      with the content (importing `src/data/path.ts` runs both the runtime
 *      manifest assert and the full `assembleSteps` hook/chrome validation).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PATH_MANIFEST,
  assertMatchesManifest,
  parseCurriculum,
} from "../src/data/parseCurriculum";
import {
  OUT_PATH,
  SOURCE_PATH,
  renderPathContentModule,
} from "./build-path-content";

const normalize = (text: string) => text.replace(/\r\n/g, "\n");

async function main() {
  // 1 + 2: fresh parse of the brief, manifest assert, byte-compare.
  const source = readFileSync(SOURCE_PATH, "utf8");
  const content = parseCurriculum(source, PATH_MANIFEST.versionId);
  assertMatchesManifest(content);

  const expected = renderPathContentModule(content);
  const committed = normalize(readFileSync(OUT_PATH, "utf8"));
  if (committed !== expected) {
    console.error(
      `[check-path-content] DRIFT: ${path.relative(process.cwd(), OUT_PATH)} ` +
        `does not match a fresh parse of the brief.\n` +
        `  Run \`npm run build:path-content\` and commit the regenerated module.`,
    );
    process.exit(1);
  }

  // 3: importing path.ts executes assertMatchesManifest(PATH_CONTENT) and the
  // full assembleSteps() over the real hooks and STEP_META — any broken
  // hook/chrome reference throws here. Dynamic import so steps 1–2 report
  // first even if the committed module itself cannot load.
  const { STEPS } = await import("../src/data/path");
  if (STEPS.length !== PATH_MANIFEST.criteria) {
    throw new Error(
      `[check-path-content] assembled ${STEPS.length} steps, expected ${PATH_MANIFEST.criteria}.`,
    );
  }

  console.log(
    `[check-path-content] OK — brief ↔ generated module in sync, manifest and ` +
      `assembly (${STEPS.length} steps) pass.`,
  );
}

main().catch((error) => {
  console.error(
    `[check-path-content] FAILED — refusing to build/deploy broken path content.\n`,
    error,
  );
  process.exit(1);
});
