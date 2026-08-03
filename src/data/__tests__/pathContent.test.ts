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
  assembleSteps,
  doneWhenForBand,
  parseTask,
  stepById,
  taskBodyForBand,
  taskById,
  taskTitleForBand,
  type ArtifactKey,
} from "../path";

const BRIEF_PATH = path.resolve(
  process.cwd(),
  "src/docs/first-profit-home-study-curriculum-brief.md",
);

/** The120's copy of the same brief, when that checkout exists on this machine. */
const SIBLING_BRIEF_PATH =
  "C:\\Users\\pkupe\\aardvark\\120-The120\\artifacts\\First Profit\\first-profit-home-study-curriculum-brief.md";

const normalize = (text: string) => text.replace(/\r\n/g, "\n");
const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

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

  it("notes (warning only) when The120's brief copy diverges from ours", () => {
    if (!existsSync(SIBLING_BRIEF_PATH)) return;
    const ours = sha256(normalize(briefSource));
    const theirs = sha256(normalize(readFileSync(SIBLING_BRIEF_PATH, "utf8")));
    if (ours !== theirs) {
      // Deliberately a warning, not a failure: this repo's brief is canonical
      // for the SPA, but a meaning-changing divergence must be coordinated
      // with The120's version-pinning policy. Surface it loudly in test output.
      console.warn(
        `[pathContent] WARNING: the curriculum brief differs between repos.\n` +
          `  first-profit (canonical for the SPA): sha256 ${ours}\n` +
          `  120-The120:                           sha256 ${theirs}\n` +
          `  Coordinate the edit with The120's version pinning before shipping.`,
      );
    }
    expect(true).toBe(true);
  });
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
