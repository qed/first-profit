/**
 * Generate the committed path-content module from the curriculum brief.
 *
 *   npx tsx scripts/build-path-content.ts
 *
 * Parses `src/docs/first-profit-home-study-curriculum-brief.md` (the canonical
 * source for the SPA), asserts it against PATH_MANIFEST, and writes
 * `src/data/pathContent.generated.ts` with LF line endings regardless of
 * platform (Windows checkouts here are CRLF in the working tree; the generated
 * module must stay byte-stable for the drift test and git history).
 *
 * Why a committed generated module rather than parsing at runtime:
 *   - The content is diffable in git, so a curriculum edit shows up in review.
 *   - No markdown parsing in the app bundle, and no way for a formatting quirk
 *     to break a child's session at runtime — the build fails instead.
 *
 * Mirrors The120's `scripts/build-path-content.ts`, which builds the same
 * brief for the program site. A meaning-changing edit to the brief must be
 * coordinated with The120's version-pinning policy (the drift test warns when
 * the two repos' brief copies diverge).
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  PATH_MANIFEST,
  assertMatchesManifest,
  parseCurriculum,
} from "../src/data/parseCurriculum";

const SOURCE_PATH = path.resolve(
  process.cwd(),
  "src/docs/first-profit-home-study-curriculum-brief.md",
);

const OUT_PATH = path.resolve(process.cwd(), "src/data/pathContent.generated.ts");

function main() {
  let source: string;
  try {
    source = readFileSync(SOURCE_PATH, "utf8");
  } catch {
    console.error(
      `[build-path-content] cannot read ${SOURCE_PATH}\n` +
        `The curriculum brief is the parser's only input and must be a tracked ` +
        `file — otherwise this build works on one machine and nowhere else.`,
    );
    process.exit(1);
  }

  const content = parseCurriculum(source, PATH_MANIFEST.versionId);
  assertMatchesManifest(content);

  const criteria = content.phases.flatMap((p) => p.criteria);
  const tasks = criteria.flatMap((c) => c.tasks);

  const banner = `/**
 * GENERATED — do not edit by hand.
 *
 * Source: src/docs/first-profit-home-study-curriculum-brief.md (canonical)
 * Built by: scripts/build-path-content.ts (npx tsx scripts/build-path-content.ts)
 * Version: ${PATH_MANIFEST.versionId}
 * Totals: ${PATH_MANIFEST.phases} phases, ${PATH_MANIFEST.criteria} criteria, ${PATH_MANIFEST.tasks} tasks (${PATH_MANIFEST.tasksPerPhase.join("/")})
 *
 * Behavior hooks (artifact auto-complete, the real-sale target, authored input
 * fields) do NOT live here — they live in src/data/pathHooks.ts keyed by task
 * id, so regenerating this module can never silently drop behavior.
 */`;

  const body = `${banner}

import type { PathContent } from "./parseCurriculum";

export const PATH_CONTENT: PathContent = ${JSON.stringify(content, null, 2)};

export default PATH_CONTENT;
`.replace(/\r\n/g, "\n");

  writeFileSync(OUT_PATH, body, "utf8");

  console.log(
    `[build-path-content] wrote ${path.relative(process.cwd(), OUT_PATH)}\n` +
      `  ${content.phases.length} phases · ${criteria.length} criteria · ${tasks.length} tasks\n` +
      `  per phase: ${content.phases
        .map((p) => p.criteria.reduce((n, c) => n + c.tasks.length, 0))
        .join("/")}\n` +
      `  per criterion: ${criteria.map((c) => `${c.id}:${c.tasks.length}`).join(" ")}`,
  );
}

main();
