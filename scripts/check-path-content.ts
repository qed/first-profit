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
 *      manifest assert and the full `assembleSteps` hook/chrome validation);
 *   4. REMAP — the task-id remap tables (`src/data/taskRemap.ts`) are stale
 *      against the content: a LEGACY_KEY_REMAP entry no longer points at the
 *      task actually at its position, or a TASK_REMAP entry targets a task id
 *      that does not exist / itself / a retired id. A stale table silently
 *      credits the wrong task on migration, so it must never deploy.
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

  // 4: remap-table alignment. Dynamic import (taskRemap pulls in the generated
  // module) so steps 1–3 report first. Pure in-memory table checks — fast.
  const { LEGACY_KEY_REMAP, TASK_REMAP, taskIdAt } = await import("../src/data/taskRemap");
  const { PATH_CONTENT } = await import("../src/data/pathContent.generated");
  const allTaskIds = new Set(
    PATH_CONTENT.phases.flatMap((phase) =>
      phase.criteria.flatMap((criterion) => criterion.tasks.map((task) => task.id)),
    ),
  );
  const remapErrors: string[] = [];

  // 4a: every legacy entry still points at the task actually AT that position.
  for (const [legacyKey, target] of Object.entries(LEGACY_KEY_REMAP)) {
    const [stepId, indexText] = legacyKey.split("#");
    const actual = taskIdAt(stepId, Number(indexText));
    if (actual !== target) {
      remapErrors.push(
        `LEGACY_KEY_REMAP["${legacyKey}"] = "${target}" but the task at that ` +
          `position is ${actual ? `"${actual}"` : "absent"} — the table is stale ` +
          `against the generated content.`,
      );
    }
  }

  // 4b: TASK_REMAP key/target sanity.
  for (const [key, target] of Object.entries(TASK_REMAP)) {
    if (target === null) continue; // retired: progress preserved in place — valid.
    if (key === target) {
      remapErrors.push(`TASK_REMAP["${key}"] targets itself — a no-op entry is a mistake.`);
    }
    if (!allTaskIds.has(target)) {
      remapErrors.push(
        `TASK_REMAP["${key}"] = "${target}" but no such task id exists in the ` +
          `generated content (targets must be live ids or null).`,
      );
    }
    // Overlap hazard: routing progress ONTO an id that is itself retired-null
    // elsewhere strands it on a dead id (resolveTaskId stops at the null).
    if (TASK_REMAP[target] === null) {
      remapErrors.push(
        `TASK_REMAP["${key}"] = "${target}" but "${target}" is itself retired ` +
          `(null) — progress would be routed onto a dead id.`,
      );
    }
  }

  // 5: REQUEST BUDGET — the staff Watchtower asks the120's /api/fp/progress for
  // one criterion's task ids plus their other spellings, and that endpoint
  // refuses past PROGRESS_MAX_REQUESTED_TASK_IDS. A content edit that grows a
  // criterion (or a fat TASK_REMAP) would push a request past the cap and 400 in
  // production, visible only to whoever next opened the tab. Checked HERE
  // because this is where content edits are already gated — flowBoard.ts
  // deliberately does NOT throw at module load: App.tsx imports the staff shell
  // statically, so a top-level throw would blank the app for every learner.
  const { REQUESTED_TASK_IDS_BUDGET, REQUESTED_TASK_IDS_CAP, requestedTaskIds } = await import(
    "../src/screens/staff/flowBoard"
  );
  const { CRITERION_SEQUENCE, phaseOfCriterion } = await import("../src/state/gameCore");
  const budgetErrors: string[] = [];
  for (const criterionId of CRITERION_SEQUENCE) {
    const phaseId = phaseOfCriterion(criterionId);
    if (!phaseId) continue;
    const count = requestedTaskIds(phaseId, criterionId).length;
    if (count > REQUESTED_TASK_IDS_BUDGET) {
      budgetErrors.push(
        `criterion ${criterionId} needs ${count} task ids, over the ` +
          `${REQUESTED_TASK_IDS_BUDGET} budget (endpoint cap ${REQUESTED_TASK_IDS_CAP}).`,
      );
    }
  }
  if (budgetErrors.length > 0) {
    console.error(
      `[check-path-content] WATCHTOWER: ${budgetErrors.length} criterion request(s) ` +
        `over budget:\n` +
        budgetErrors.map((message) => `  - ${message}`).join("\n"),
    );
    process.exit(1);
  }

  if (remapErrors.length > 0) {
    console.error(
      `[check-path-content] REMAP: ${remapErrors.length} stale/broken remap ` +
        `table entr${remapErrors.length === 1 ? "y" : "ies"} in src/data/taskRemap.ts:\n` +
        remapErrors.map((message) => `  - ${message}`).join("\n"),
    );
    process.exit(1);
  }

  console.log(
    `[check-path-content] OK — brief ↔ generated module in sync, manifest, ` +
      `assembly (${STEPS.length} steps) and remap tables ` +
      `(${Object.keys(LEGACY_KEY_REMAP).length} legacy + ` +
      `${Object.keys(TASK_REMAP).length} remap entries) pass.`,
  );
}

main().catch((error) => {
  console.error(
    `[check-path-content] FAILED — refusing to build/deploy broken path content.\n`,
    error,
  );
  process.exit(1);
});
