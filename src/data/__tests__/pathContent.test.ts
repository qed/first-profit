/**
 * Path content guards (Unit 4):
 *
 *  1. DRIFT — the committed generated module must match a fresh in-process
 *     parse of the canonical brief (LF-normalized). If this fails, run
 *     `npx tsx scripts/build-path-content.ts` and commit the result.
 *     Also compares this repo's brief against The120's copy when that checkout
 *     exists on disk (warning only — the repos coordinate meaning changes via
 *     The120's version-pinning policy, not this suite).
 *  2. SHAPE — 25 criteria, 125 tasks, variable per-criterion counts, partial
 *     band-variant overlays with base-body fallback.
 *  3. HOOKS — every hand-kept hook resolves to a real task/criterion id, the
 *     real-sale target sits where gameCore's positional addressing expects it,
 *     and a bogus hook FAILS the assembly rather than silently dropping.
 *  4. PARITY — the assembled 1.1/1.2 Steps keep the exact 5+5 task shape the
 *     existing `${stepId}#${index}` done keys were minted against.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PATH_MANIFEST,
  assertMatchesManifest,
  parseCurriculum,
} from "../parseCurriculum";
import { PATH_CONTENT } from "../pathContent.generated";
import {
  ARTIFACT_HOOKS,
  FIELD_HOOKS,
  SALE_AUTO_COMPLETE_TASK_ID,
} from "../pathHooks";
import {
  STEPS,
  STEP_META,
  allBandsNoteFor,
  assembleSteps,
  doneWhenForBand,
  parseTask,
  stepById,
  taskBodyForBand,
  taskById,
  taskTitleForBand,
  type ArtifactKey,
} from "../path";
import type { PathManifest } from "../parseCurriculum";

const BRIEF_PATH = path.resolve(
  process.cwd(),
  "src/docs/first-profit-home-study-curriculum-brief.md",
);

/**
 * The120's copy of the same brief, when that checkout exists on this machine.
 * Overridable via THE120_BRIEF_PATH; otherwise guessed relative to the repo
 * root (works on any machine that keeps the two repos as siblings).
 */
const SIBLING_BRIEF_PATH =
  process.env.THE120_BRIEF_PATH ??
  path.resolve(
    process.cwd(),
    "..",
    "120-The120",
    "artifacts",
    "First Profit",
    "first-profit-home-study-curriculum-brief.md",
  );

const normalize = (text: string) => text.replace(/\r\n/g, "\n");
const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

/**
 * The comparable content of a brief: leading HTML comments are repo-local
 * plumbing (this repo's copy carries a "how to regenerate" header The120's
 * copy does not), so they are stripped before the divergence comparison.
 */
const briefContent = (text: string) =>
  normalize(text).replace(/^(\s*<!--[\s\S]*?-->\s*\n)+/, "");

const briefSource = readFileSync(BRIEF_PATH, "utf8");
const fresh = parseCurriculum(briefSource, PATH_MANIFEST.versionId);

describe("generated module tracks the brief (drift)", () => {
  it("matches a fresh parse of the canonical brief byte-for-byte", () => {
    // parseCurriculum LF-normalizes its input, so this comparison is
    // line-ending independent on both sides.
    expect(JSON.stringify(PATH_CONTENT)).toBe(JSON.stringify(fresh));
  });

  it("the committed module passes the full field-level manifest check", () => {
    expect(() => assertMatchesManifest(PATH_CONTENT)).not.toThrow();
  });

  // Sibling-brief divergence is deliberately a SOFT check: this repo's brief
  // is canonical for the SPA, but a meaning-changing divergence must be
  // coordinated with The120's version-pinning policy. Divergence therefore
  // surfaces as a SKIPPED, name-annotated test plus a console warning — never
  // a tautological pass and never a hard failure. Hashes compare CONTENT after
  // stripping leading HTML comments, so this repo's regeneration header does
  // not count as divergence.
  const siblingStatus = ((): "absent" | "in-sync" | "diverged" => {
    if (!existsSync(SIBLING_BRIEF_PATH)) return "absent";
    const ours = sha256(briefContent(briefSource));
    const theirs = sha256(briefContent(readFileSync(SIBLING_BRIEF_PATH, "utf8")));
    if (ours === theirs) return "in-sync";
    console.warn(
      `[pathContent] WARNING: the curriculum brief differs between repos.\n` +
        `  first-profit (canonical for the SPA): sha256 ${ours}\n` +
        `  120-The120 (${SIBLING_BRIEF_PATH}):   sha256 ${theirs}\n` +
        `  (both hashes taken after stripping leading HTML comments)\n` +
        `  Coordinate the edit with The120's version pinning before shipping.`,
    );
    return "diverged";
  })();

  const siblingIt = siblingStatus === "diverged" ? it.skip : it;
  siblingIt(
    `The120's brief copy matches ours (content after leading HTML comments)` +
      (siblingStatus === "diverged"
        ? " — (sibling brief DIVERGED, see warning above)"
        : siblingStatus === "absent"
          ? " — (sibling checkout absent on this machine)"
          : ""),
    () => {
      expect(siblingStatus).not.toBe("diverged");
    },
  );
});

describe("content shape", () => {
  it("carries 5 phases, 25 criteria, 125 tasks with per-phase totals 25/26/24/25/25", () => {
    expect(PATH_CONTENT.phases).toHaveLength(5);
    const criteria = PATH_CONTENT.phases.flatMap((p) => p.criteria);
    expect(criteria).toHaveLength(25);
    expect(criteria.flatMap((c) => c.tasks)).toHaveLength(125);
    expect(
      PATH_CONTENT.phases.map((p) =>
        p.criteria.reduce((n, c) => n + c.tasks.length, 0),
      ),
    ).toEqual([25, 26, 24, 25, 25]);
  });

  it("tasks per criterion is VARIABLE: 2.3 has six, 3.4 has four", () => {
    const byId = new Map(
      PATH_CONTENT.phases.flatMap((p) => p.criteria.map((c) => [c.id, c])),
    );
    expect(byId.get("2.3")?.tasks).toHaveLength(6);
    expect(byId.get("3.4")?.tasks).toHaveLength(4);
    expect(byId.get("2.3")?.tasks.at(-1)?.id).toBe("2.3.6");
    expect(byId.get("3.4")?.tasks.at(-1)?.id).toBe("3.4.4");
  });

  it("band variants are partial overlays; an unauthored band falls back to the body", () => {
    // 1.1.3 authors 3–5 and 9–12; its 6–8 line is the "As written." sentinel,
    // which must be stored as ABSENCE, not the literal string.
    const task = taskById("1.1.3");
    expect(task).toBeDefined();
    expect(task?.bandVariants.g3_5).toBeTruthy();
    expect(task?.bandVariants.g9_12).toBeTruthy();
    expect(task?.bandVariants.g6_8).toBeUndefined();

    const body = task!.body;
    expect(taskBodyForBand("1.1.3", "g6_8")).toBe(body);
    expect(taskBodyForBand("1.1.3", "g3_5")).toBe(
      `${body}\n${task!.bandVariants.g3_5}`,
    );
    expect(taskTitleForBand("1.1.3", "g3_5")).toBe(
      "Rehearse to camera until note-free",
    );
    expect(doneWhenForBand("1.1.3", "g9_12")).toBe(task!.doneWhen);
  });

  it("an All-bands note is kept as a note, not fabricated into per-band variants", () => {
    // 1.2.5: "All bands: as written; **9–12** adds …" — no variants, one note.
    const task = taskById("1.2.5");
    expect(task?.bandVariants).toEqual({});
    expect(task?.allBandsNote).toContain("as written");
  });

  it("exactly one task per criterion closes it, and 5.5.5 closes First Profit cleanly", () => {
    for (const phase of PATH_CONTENT.phases) {
      for (const criterion of phase.criteria) {
        const closers = criterion.tasks.filter((t) => t.completesCriterion);
        expect(closers.map((t) => t.id)).toEqual([
          criterion.tasks[criterion.tasks.length - 1].id,
        ]);
      }
    }
    // The one Done-when whose closing marker reads differently ("— and First
    // Profit.") must still be stripped to prose.
    expect(taskById("5.5.5")?.doneWhen).toBe(
      "the signed checklist and final page are in the Founder File.",
    );
  });

  it("task titles (the kid-facing checklist labels) carry no em dashes", () => {
    for (const phase of PATH_CONTENT.phases) {
      for (const criterion of phase.criteria) {
        for (const task of criterion.tasks) {
          expect(task.title).not.toMatch(/—/);
        }
      }
    }
  });
});

describe("hooks registry × assembly", () => {
  const hooks = {
    artifacts: ARTIFACT_HOOKS,
    saleAutoCompleteTaskId: SALE_AUTO_COMPLETE_TASK_ID,
    fields: FIELD_HOOKS,
  };

  it("the real-sale auto-complete hook targets 1.2.5, the LAST task of 1.2", () => {
    expect(SALE_AUTO_COMPLETE_TASK_ID).toBe("1.2.5");
    const step = stepById("1.2");
    expect(step).toBeDefined();
    // gameCore addresses the sale target positionally as tasks.length - 1.
    expect(step!.tasks.length - 1).toBe(4);
    expect(parseTask(step!.tasks[4]).label).toBe("Deliver, thank, and log");
  });

  it("every artifact hook lands on its task as an @artifact-prefixed string", () => {
    for (const [taskId, artifact] of Object.entries(ARTIFACT_HOOKS)) {
      const [phase, criterion, seq] = taskId.split(".").map(Number);
      const step = stepById(`${phase}.${criterion}`);
      expect(step).toBeDefined();
      const raw = step!.tasks[seq - 1];
      expect(parseTask(raw).auto).toBe(artifact);
    }
    // Same census as the hand-written path.ts: six artifact-marked tasks.
    const marked = STEPS.flatMap((s) => s.tasks).filter((t) => t.startsWith("@"));
    expect(marked).toHaveLength(Object.keys(ARTIFACT_HOOKS).length);
    expect(marked).toHaveLength(6);
  });

  it("authored input fields survive assembly: 1.1 fields pair, 2.2 legacy single field", () => {
    const oneOne = stepById("1.1");
    expect(oneOne?.fields?.map((f) => f.key)).toEqual(["productName", "oneLiner"]);
    expect(oneOne?.field).toBeUndefined();
    const twoTwo = stepById("2.2");
    expect(twoTwo?.field).toMatchObject({ key: "gapBrief", long: true });
    expect(twoTwo?.fields).toBeUndefined();
  });

  it("a hook referencing a nonexistent task id fails the assembly", () => {
    expect(() =>
      assembleSteps(PATH_CONTENT, {
        ...hooks,
        artifacts: { ...ARTIFACT_HOOKS, "9.9.9": "website" as ArtifactKey },
      }),
    ).toThrow(/nonexistent task id "9\.9\.9"/);
  });

  it("a field hook referencing a nonexistent criterion id fails the assembly", () => {
    expect(() =>
      assembleSteps(PATH_CONTENT, {
        ...hooks,
        fields: { ...FIELD_HOOKS, "7.7": [] },
      }),
    ).toThrow(/nonexistent criterion id "7\.7"/);
  });

  it("a sale target that is not the last task of its criterion fails the assembly", () => {
    expect(() =>
      assembleSteps(PATH_CONTENT, { ...hooks, saleAutoCompleteTaskId: "1.2.3" }),
    ).toThrow(/must be the LAST task/);
  });
});

describe("1.1/1.2 semantic parity (done-key stability)", () => {
  it("keeps the exact 5+5 task shape existing `${stepId}#${index}` keys were minted against", () => {
    const oneOne = stepById("1.1");
    const oneTwo = stepById("1.2");
    expect(oneOne?.tasks).toEqual([
      "Pick the product and the one-liner",
      "Write the full 60-second pitch",
      "Rehearse to camera until note-free",
      "Cold-pitch a parent and revise",
      "Deliver to a non-family adult, no notes",
    ]);
    expect(oneTwo?.tasks).toEqual([
      "Choose the offer and set the price",
      "Build the first prospect list",
      "Set up the point of sale",
      "Ask until one yes",
      "Deliver, thank, and log",
    ]);
    // No 1.1/1.2 task is @artifact-marked (their pips stay hand-driven).
    for (const raw of [...oneOne!.tasks, ...oneTwo!.tasks]) {
      expect(parseTask(raw).auto).toBeUndefined();
    }
  });

  it("assembles a Step for all 25 criteria in brief order with intact chrome", () => {
    expect(STEPS.map((s) => s.id)).toEqual([
      "1.1", "1.2", "1.3", "1.4", "1.5",
      "2.1", "2.2", "2.3", "2.4", "2.5",
      "3.1", "3.2", "3.3", "3.4", "3.5",
      "4.1", "4.2", "4.3", "4.4", "4.5",
      "5.1", "5.2", "5.3", "5.4", "5.5",
    ]);
    // Chrome (room/title/xp) is hand-kept and unchanged for the playable pair.
    expect(stepById("1.1")).toMatchObject({
      phase: "sell",
      room: "idea",
      title: "Pitch a product in 60 seconds, no notes",
      xp: 60,
    });
    expect(stepById("1.2")).toMatchObject({ room: "market", xp: 120 });
  });
});

// ── Synthetic-brief parser guards (parse-or-throw, incl. band bullets) ────

/** A minimal one-phase brief whose single task carries `taskContent` lines. */
const syntheticBrief = (taskContent: string, extraTasks = "") =>
  [
    "# Phase 01 · SELL — *Sell it.*",
    "",
    "## Criterion 1.1 — Pass criterion one.",
    "",
    "**1.1.1 — Do the thing.** Body text.",
    taskContent,
    "*Done when:* it is done. **This completes the criterion.**",
    extraTasks,
    "",
  ].join("\n");

const SYNTHETIC_MANIFEST: PathManifest = {
  versionId: "test",
  phases: 1,
  criteria: 1,
  tasks: 1,
  tasksPerPhase: [1],
  tasksPerCriterion: { "1.1": 1 },
};

describe("parseCurriculum band bullets parse-or-throw (synthetic briefs)", () => {
  it("accepts a plain-hyphen band label and normalises it to the canonical band", () => {
    const parsed = parseCurriculum(
      syntheticBrief("- **3-5:** Younger version."),
      "test",
    );
    const task = parsed.phases[0].criteria[0].tasks[0];
    expect(task.bandVariants.g3_5).toBe("Younger version.");
    expect(task.bandVariants.g6_8).toBeUndefined();
  });

  it("accepts an indented band bullet (leading whitespace tolerated)", () => {
    const parsed = parseCurriculum(
      syntheticBrief("  - **9–12:** Older version."),
      "test",
    );
    expect(parsed.phases[0].criteria[0].tasks[0].bandVariants.g9_12).toBe(
      "Older version.",
    );
    // And it must NOT leak into the body as continuation prose.
    expect(parsed.phases[0].criteria[0].tasks[0].body).toBe("Body text.");
  });

  it("accepts hyphen labels in combined ranges", () => {
    const parsed = parseCurriculum(
      syntheticBrief("- **6-8/9-12:** Shared older version."),
      "test",
    );
    const task = parsed.phases[0].criteria[0].tasks[0];
    expect(task.bandVariants.g6_8).toBe("Shared older version.");
    expect(task.bandVariants.g9_12).toBe("Shared older version.");
  });

  it("THROWS on a near-miss band bullet instead of silently dropping it", () => {
    expect(() =>
      parseCurriculum(syntheticBrief("- **Grades 3to5:** Mangled label."), "test"),
    ).toThrow(/Task 1\.1\.1: unrecognised band bullet "- \*\*Grades 3to5:\*\*/);
  });

  it("THROWS on an unknown numeric band range", () => {
    expect(() =>
      parseCurriculum(syntheticBrief("- **3–7:** No such band."), "test"),
    ).toThrow(/unrecognised band label/);
  });

  it("ignores leading HTML comments (the brief's regeneration header)", () => {
    const commented = `<!--\n  Edit me, then regenerate.\n-->\n${syntheticBrief("- **3–5:** Younger version.")}`;
    const plain = parseCurriculum(
      syntheticBrief("- **3–5:** Younger version."),
      "test",
    );
    expect(parseCurriculum(commented, "test")).toEqual(plain);
  });
});

describe("parseCurriculum defensive branches (synthetic malformed input)", () => {
  it("throws on an out-of-sequence criterion", () => {
    const source = syntheticBrief("").replace("## Criterion 1.1", "## Criterion 1.2");
    expect(() => parseCurriculum(source, "test")).toThrow(
      /Criterion out of sequence: expected 1\.1, got 1\.2/,
    );
  });

  it("throws on a task outside any criterion", () => {
    const source = [
      "# Phase 01 · SELL — *Sell it.*",
      "",
      "**1.1.1 — Do the thing.** Body text.",
      "*Done when:* it is done.",
    ].join("\n");
    expect(() => parseCurriculum(source, "test")).toThrow(
      /Task 1\.1\.1 appears outside any criterion/,
    );
  });

  it("throws on a zero-task criterion", () => {
    const source = [
      "# Phase 01 · SELL — *Sell it.*",
      "",
      "## Criterion 1.1 — Empty.",
      "",
      "## Criterion 1.2 — Also empty.",
    ].join("\n");
    expect(() => parseCurriculum(source, "test")).toThrow(
      /Criterion 1\.1 parsed with zero tasks/,
    );
  });

  it("assertMatchesManifest rejects two criterion closers", () => {
    const source = syntheticBrief(
      "",
      [
        "",
        "**1.1.2 — Do it again.** More body.",
        "*Done when:* done again. **This completes the criterion.**",
      ].join("\n"),
    );
    const parsed = parseCurriculum(source, "test");
    expect(() =>
      assertMatchesManifest(parsed, {
        ...SYNTHETIC_MANIFEST,
        tasks: 2,
        tasksPerPhase: [2],
        tasksPerCriterion: { "1.1": 2 },
      }),
    ).toThrow(/has 2 tasks marked\s+completesCriterion/);
  });

  it("assertMatchesManifest rejects residual ** in a Done-when line", () => {
    const source = syntheticBrief("").replace(
      "*Done when:* it is done. **This completes the criterion.**",
      "*Done when:* it is **really** done. **This completes the criterion.**",
    );
    const parsed = parseCurriculum(source, "test");
    expect(() => assertMatchesManifest(parsed, SYNTHETIC_MANIFEST)).toThrow(
      /still contains markdown\s+bold markers/,
    );
  });

  it("assertMatchesManifest rejects an em dash in a task title", () => {
    const source = syntheticBrief("").replace(
      "**1.1.1 — Do the thing.**",
      "**1.1.1 — Do — the thing.**",
    );
    const parsed = parseCurriculum(source, "test");
    expect(() => assertMatchesManifest(parsed, SYNTHETIC_MANIFEST)).toThrow(
      /title contains an em dash/,
    );
  });

  it("assertMatchesManifest rejects a per-criterion count mismatch (the id-shift class)", () => {
    // A task "moved" between same-phase criteria keeps every phase total
    // intact; only the per-criterion map catches it.
    const parsed = parseCurriculum(syntheticBrief(""), "test");
    expect(() =>
      assertMatchesManifest(parsed, {
        ...SYNTHETIC_MANIFEST,
        tasksPerCriterion: { "1.1": 2 },
      }),
    ).toThrow(/criterion 1\.1 carries 1 tasks, manifest\s+expects 2/);
    expect(() =>
      assertMatchesManifest(parsed, {
        ...SYNTHETIC_MANIFEST,
        tasksPerCriterion: {},
      }),
    ).toThrow(/criterion 1\.1 is not in the manifest's tasksPerCriterion map/);
  });
});

describe("manifest per-criterion counts (real brief)", () => {
  it("PATH_MANIFEST.tasksPerCriterion matches the generated content exactly", () => {
    const actual = Object.fromEntries(
      PATH_CONTENT.phases.flatMap((p) =>
        p.criteria.map((c) => [c.id, c.tasks.length]),
      ),
    );
    expect(actual).toEqual(PATH_MANIFEST.tasksPerCriterion);
    expect(Object.keys(PATH_MANIFEST.tasksPerCriterion)).toHaveLength(25);
  });
});

describe("task ids satisfy The120's acceptor contract", () => {
  it("every generated task id is dotted-numeric and ≤16 chars", () => {
    // The120's fp_task_feedback table CHECK-constrains task_id to the
    // producer's id shape; this pin keeps first-profit (the producer) inside
    // that acceptor contract so a generated id can never be rejected there.
    const ids = PATH_CONTENT.phases.flatMap((p) =>
      p.criteria.flatMap((c) => c.tasks.map((t) => t.id)),
    );
    expect(ids).toHaveLength(125);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9]+(\.[0-9]+){2}$/);
      expect(id.length).toBeLessThanOrEqual(16);
    }
  });
});

describe("STEP_META chrome coverage", () => {
  const hooks = {
    artifacts: ARTIFACT_HOOKS,
    saleAutoCompleteTaskId: SALE_AUTO_COMPLETE_TASK_ID,
    fields: FIELD_HOOKS,
  };

  it("an extra STEP_META entry (unknown criterion) fails the assembly", () => {
    expect(() =>
      assembleSteps(PATH_CONTENT, hooks, { ...STEP_META, "9.9": STEP_META["1.1"] }),
    ).toThrow(/STEP_META has chrome for unknown criterion "9\.9"/);
  });

  it("a missing STEP_META entry fails the assembly", () => {
    const { "3.3": _dropped, ...withoutOne } = STEP_META;
    expect(() => assembleSteps(PATH_CONTENT, hooks, withoutOne)).toThrow(
      /STEP_META is missing chrome for criterion "3\.3"/,
    );
  });
});

describe("band accessors", () => {
  it("allBandsNoteFor returns the note on its happy path", () => {
    expect(allBandsNoteFor("1.2.5")).toContain("as written");
  });

  it("every band accessor returns undefined for a bogus task id", () => {
    expect(taskById("0.0.0")).toBeUndefined();
    expect(taskTitleForBand("0.0.0", "g3_5")).toBeUndefined();
    expect(taskBodyForBand("0.0.0", "g6_8")).toBeUndefined();
    expect(doneWhenForBand("0.0.0", "g9_12")).toBeUndefined();
    expect(allBandsNoteFor("0.0.0")).toBeUndefined();
  });
});
