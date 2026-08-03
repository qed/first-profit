/**
 * Curriculum brief markdown → typed path content (Unit 4 of the full-path plan).
 *
 * Adapted from The120's `app/fp/content/parse-curriculum.ts` + `types.ts` +
 * `manifest.ts`, which parse THIS SAME brief. Kept as one repo-local module so
 * the build script (`scripts/build-path-content.ts`), the generated module's
 * types, and the drift test all share a single source of truth.
 *
 * The failure mode that matters here is a SILENT under-parse: a task quietly
 * missing, a variant quietly empty. Nothing at runtime would notice, and the
 * first symptom would be a child reading the wrong instruction. So every
 * structural expectation throws rather than skips, and the counts are asserted
 * against the manifest below.
 */

export type PhaseKey = "SELL" | "BUILD" | "VALIDATE" | "GROW" | "SCALE";

/** Grade bands, matching the program's book tracks. */
export type Band = "g3_5" | "g6_8" | "g9_12";

export const BANDS: readonly Band[] = ["g3_5", "g6_8", "g9_12"] as const;

/**
 * One unit task, row-like and DB-ready (R4): every field is a scalar or a small
 * JSON leaf, liftable to a table row keyed by `id`.
 *
 * Band variants are PARTIAL overlays on a shared body. The curriculum uses five
 * source shapes, not the three a naive parser expects:
 *   `- **3–5:** …`          a single band
 *   `- **6–8/9–12:** …`     one line covering two bands
 *   `- **6–8:** As written.` a SENTINEL meaning "identical to the base text",
 *                            not a variant — storing the literal string would
 *                            show a Grade 7 child the words "As written." where
 *                            their instruction belongs
 *   `- All bands: …`        guidance for every band, sometimes carrying an
 *                           inline addendum ("as written; **9–12** adds …")
 *   (line absent)           identical across bands, per the curriculum's rule
 */
export type UnitTask = {
  /** `phase.criterion.task`, e.g. "1.2.4". Stable across program versions. */
  id: string;
  /** Sequence within the criterion, 1-based. */
  seq: number;
  title: string;
  body: string;
  /** The binary line a verifying adult answers yes or no to. */
  doneWhen: string;
  /** Per-band overrides. Absent means "identical across bands". */
  bandVariants: Partial<Record<Band, string>>;
  /**
   * An `All bands:` note. Kept separate rather than copied into all three
   * variants, because these frequently contain an inline band addendum;
   * splitting that into per-band text would fabricate wording the curriculum
   * never wrote.
   */
  allBandsNote?: string;
  /** True when this task's Done-when line closes its criterion. */
  completesCriterion: boolean;
};

export type ContentCriterion = {
  /** `phase.criterion`, e.g. "1.2". */
  id: string;
  seq: number;
  /** The published pass criterion, as the curriculum states it. */
  passCriterion: string;
  tasks: UnitTask[];
};

export type ContentPhase = {
  /** "01".."05", zero-padded as the curriculum renders it. */
  num: string;
  key: PhaseKey;
  /** The phase's one-verb promise line from the brief. */
  subtitle: string;
  seq: number;
  criteria: ContentCriterion[];
};

export type PathContent = {
  versionId: string;
  phases: ContentPhase[];
};

/**
 * Declared totals for the brief. The parse is asserted against these; a
 * mismatch fails loudly rather than shipping a silently short package.
 * NOTE: tasks per criterion is VARIABLE (2.3 has six, 3.4 has four) — never
 * assume five.
 */
export const PATH_MANIFEST = {
  versionId: "2026-27",
  phases: 5,
  criteria: 25,
  tasks: 125,
  // Not uniform: Build carries an extra task, Validate one fewer.
  tasksPerPhase: [25, 26, 24, 25, 25] as readonly number[],
} as const;

/* ── line shapes ───────────────────────────────────────────────────────────
 * Note the two different dashes: headers use an EM dash (—, U+2014) while band
 * ranges use an EN dash (–, U+2013). Mixing them up silently matches nothing.
 */

const PHASE_RE = /^# Phase (\d{2}) · ([A-Z]+) — \*(.+?)\*\s*$/;
const CRITERION_RE = /^## Criterion (\d+\.\d+) — (.+?)\s*$/;
const TASK_RE = /^\*\*(\d+\.\d+\.\d+) — (.+?)\*\*\s*(.*)$/;
const DONE_WHEN_RE = /^\*Done when:\*\s*(.+?)\s*$/;

/**
 * A band bullet. Captures the range label so combined forms survive:
 *   `- **3–5:** …`  `- **6–8/9–12:** …`  `- **3–5/6–8:** …`
 */
const BAND_RE = /^- \*\*([0-9–/]+):\*\*\s*(.+?)\s*$/;

/** `- All bands: …` — guidance for every band, kept as a note. */
const ALL_BANDS_RE = /^- All bands:\s*(.+?)\s*$/i;

/** "As written." is a SENTINEL meaning "identical to the base text". */
const AS_WRITTEN_RE = /^as written\.?$/i;

/**
 * Structural marker on the Done-when line of a criterion's final task.
 * Matches on the PREFIX, not an exact sentence: 24 read "**This completes the
 * criterion.**" and the program's very last task (5.5.5) reads "**This
 * completes the criterion — and First Profit.**".
 */
const COMPLETES_RE = /\s*\*\*This completes the criterion\b[^*]*\*\*\s*$/;

const BAND_LABELS: Record<string, Band> = {
  "3–5": "g3_5",
  "6–8": "g6_8",
  "9–12": "g9_12",
};

const PHASE_KEYS: readonly PhaseKey[] = [
  "SELL",
  "BUILD",
  "VALIDATE",
  "GROW",
  "SCALE",
];

/** Maps a bullet's range label ("6–8/9–12") to the bands it applies to. */
function bandsForLabel(label: string, taskId: string): Band[] {
  return label.split("/").map((part) => {
    const band = BAND_LABELS[part.trim()];
    if (!band) {
      throw new Error(
        `Task ${taskId}: unrecognised band label "${part}" in "${label}". ` +
          `Known labels: ${Object.keys(BAND_LABELS).join(", ")}.`,
      );
    }
    return band;
  });
}

type TaskDraft = {
  id: string;
  title: string;
  bodyParts: string[];
  doneWhen?: string;
  bandVariants: Partial<Record<Band, string>>;
  allBandsNote?: string;
  completesCriterion: boolean;
};

function finishTask(draft: TaskDraft, seq: number): UnitTask {
  if (!draft.doneWhen) {
    throw new Error(
      `Task ${draft.id} has no "*Done when:*" line. Every task ends in a ` +
        `binary line a verifying adult answers yes or no to — a task without ` +
        `one cannot be verified and must not ship.`,
    );
  }
  const body = draft.bodyParts.join(" ").replace(/\s+/g, " ").trim();
  if (!body) {
    throw new Error(`Task ${draft.id} has an empty body.`);
  }
  return {
    id: draft.id,
    seq,
    title: draft.title,
    body,
    doneWhen: draft.doneWhen,
    bandVariants: draft.bandVariants,
    ...(draft.allBandsNote ? { allBandsNote: draft.allBandsNote } : {}),
    completesCriterion: draft.completesCriterion,
  };
}

/**
 * Parse the home-study curriculum brief.
 *
 * @param source raw markdown (CRLF or LF — both are normalised)
 * @param versionId the program version this content belongs to, e.g. "2026-27"
 */
export function parseCurriculum(source: string, versionId: string): PathContent {
  const lines = source.replace(/\r\n/g, "\n").split("\n");

  const phases: ContentPhase[] = [];
  let phase: ContentPhase | undefined;
  let criterion: ContentCriterion | undefined;
  let draft: TaskDraft | undefined;

  const flushTask = () => {
    if (!draft || !criterion) return;
    criterion.tasks.push(finishTask(draft, criterion.tasks.length + 1));
    draft = undefined;
  };

  const flushCriterion = () => {
    flushTask();
    if (criterion && phase) {
      if (criterion.tasks.length === 0) {
        throw new Error(`Criterion ${criterion.id} parsed with zero tasks.`);
      }
      phase.criteria.push(criterion);
    }
    criterion = undefined;
  };

  const flushPhase = () => {
    flushCriterion();
    if (phase) phases.push(phase);
    phase = undefined;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    const phaseMatch = PHASE_RE.exec(line);
    if (phaseMatch) {
      flushPhase();
      const [, num, key, subtitle] = phaseMatch;
      const seq = phases.length + 1;
      const expectedKey = PHASE_KEYS[seq - 1];
      if (key !== expectedKey) {
        throw new Error(
          `Phase ${num}: expected key ${expectedKey} at position ${seq}, got ${key}.`,
        );
      }
      phase = { num, key, subtitle: subtitle.trim(), seq, criteria: [] };
      continue;
    }

    // A malformed phase header would otherwise fall through silently, its
    // criteria would attach to the previous phase, and the failure would
    // surface much later as a confusing out-of-sequence error.
    if (line.startsWith("# Phase")) {
      throw new Error(
        `Malformed phase header: "${line}". Expected "# Phase 0N · KEY — *subtitle*" ` +
          `(em dash U+2014, middot separator).`,
      );
    }

    const criterionMatch = CRITERION_RE.exec(line);
    if (criterionMatch) {
      if (!phase) {
        throw new Error(
          `Criterion ${criterionMatch[1]} appears before any phase header.`,
        );
      }
      flushCriterion();
      const [, id, passCriterion] = criterionMatch;
      const expectedId = `${phase.seq}.${phase.criteria.length + 1}`;
      if (id !== expectedId) {
        throw new Error(
          `Criterion out of sequence: expected ${expectedId}, got ${id}. ` +
            `Criteria are numbered in the order the published pass criteria appear.`,
        );
      }
      criterion = { id, seq: phase.criteria.length + 1, passCriterion, tasks: [] };
      continue;
    }

    // A malformed criterion header still has to be caught — otherwise its
    // tasks silently attach to the previous criterion and the totals still add
    // up to 125.
    if (line.startsWith("## Criterion")) {
      throw new Error(
        `Malformed criterion header: "${line}". Expected "## Criterion N.N — <pass criterion>".`,
      );
    }

    const taskMatch = TASK_RE.exec(line);
    if (taskMatch) {
      if (!criterion) {
        throw new Error(`Task ${taskMatch[1]} appears outside any criterion.`);
      }
      flushTask();
      const [, id, title, rest] = taskMatch;
      const expectedId = `${criterion.id}.${criterion.tasks.length + 1}`;
      if (id !== expectedId) {
        throw new Error(`Task out of sequence: expected ${expectedId}, got ${id}.`);
      }
      draft = {
        id,
        title: title.trim(),
        bodyParts: rest ? [rest.trim()] : [],
        bandVariants: {},
        completesCriterion: false,
      };
      continue;
    }

    if (!draft) continue;

    const doneMatch = DONE_WHEN_RE.exec(line);
    if (doneMatch) {
      const text = doneMatch[1];
      draft.completesCriterion = COMPLETES_RE.test(text);
      draft.doneWhen = text.replace(COMPLETES_RE, "").trim();
      continue;
    }

    const allBandsMatch = ALL_BANDS_RE.exec(line);
    if (allBandsMatch) {
      draft.allBandsNote = allBandsMatch[1].trim();
      continue;
    }

    const bandMatch = BAND_RE.exec(line);
    if (bandMatch) {
      const [, label, text] = bandMatch;
      const value = text.trim();
      // The sentinel means inheritance; an empty bullet is a source typo.
      // Either way, leaving the band ABSENT is what makes the band accessor
      // fall through to the base text — storing "" would look like a variant
      // to every downstream `bandVariants` check.
      if (!value || AS_WRITTEN_RE.test(value)) continue;
      for (const band of bandsForLabel(label, draft.id)) {
        draft.bandVariants[band] = value;
      }
      continue;
    }

    // Continuation prose for the current task, before its Done-when line.
    if (line && !line.startsWith("-") && !draft.doneWhen) {
      draft.bodyParts.push(line.trim());
    }
  }

  flushPhase();

  if (phases.length === 0) {
    throw new Error(
      "No phases parsed. Check the source is the curriculum brief and that " +
        "phase headers read '# Phase 0N · KEY — *subtitle*' with an em dash.",
    );
  }

  return { versionId, phases };
}

/**
 * Assert parsed content against the manifest. Throws with the specific
 * mismatch — a silently short package is the failure mode that matters, and it
 * is invisible at runtime.
 */
export function assertMatchesManifest(
  content: PathContent,
  manifest: typeof PATH_MANIFEST = PATH_MANIFEST,
): void {
  const where = `path content ${content.versionId}`;

  if (content.phases.length !== manifest.phases) {
    throw new Error(
      `${where}: expected ${manifest.phases} phases, parsed ${content.phases.length}.`,
    );
  }

  const criteria = content.phases.flatMap((p) => p.criteria);
  if (criteria.length !== manifest.criteria) {
    throw new Error(
      `${where}: expected ${manifest.criteria} criteria, parsed ${criteria.length}.`,
    );
  }

  const tasks = criteria.flatMap((c) => c.tasks);
  if (tasks.length !== manifest.tasks) {
    throw new Error(
      `${where}: expected ${manifest.tasks} tasks, parsed ${tasks.length}.`,
    );
  }

  const perPhase = content.phases.map((p) =>
    p.criteria.reduce((n, c) => n + c.tasks.length, 0),
  );
  const expected = manifest.tasksPerPhase;
  if (
    perPhase.length !== expected.length ||
    perPhase.some((n, i) => n !== expected[i])
  ) {
    throw new Error(
      `${where}: per-phase task counts ${perPhase.join("/")} do not match the ` +
        `manifest's ${expected.join("/")}. A total-only check would have passed ` +
        `this — tasks per criterion is variable (2.3 has six, 3.4 has four).`,
    );
  }

  /*
   * Field-level checks. Cardinality alone is not enough: counts prove the
   * package is the right SIZE, not that it says the right THING.
   */

  for (const criterion of criteria) {
    const closers = criterion.tasks.filter((t) => t.completesCriterion);
    if (closers.length !== 1) {
      throw new Error(
        `${where}: criterion ${criterion.id} has ${closers.length} tasks marked ` +
          `completesCriterion; exactly one must close each criterion.`,
      );
    }
  }

  for (const task of tasks) {
    if (/\*\*/.test(task.doneWhen)) {
      throw new Error(
        `${where}: task ${task.id}'s Done-when line still contains markdown ` +
          `bold markers: "${task.doneWhen}". This is the line a verifying adult ` +
          `reads — it must be prose, not source.`,
      );
    }
    if (!task.doneWhen.trim() || !task.title.trim() || !task.body.trim()) {
      throw new Error(
        `${where}: task ${task.id} has an empty title, body, or Done-when line.`,
      );
    }
    // Kid-facing checklist discipline: task TITLES are the strings the app
    // renders as checklist labels today, and kid-facing content carries no em
    // dashes. (Bodies/Done-when lines keep the brief's editorial punctuation;
    // they are not yet rendered and their treatment is a later unit's call.)
    if (task.title.includes("—")) {
      throw new Error(
        `${where}: task ${task.id}'s title contains an em dash: "${task.title}". ` +
          `Titles are kid-facing checklist labels — reword the brief.`,
      );
    }
  }
}

/**
 * The band-specific line for a task, or undefined when the task is identical
 * across bands (the common case — variants exist on roughly half of them).
 */
export function resolveVariant(task: UnitTask, band: Band): string | undefined {
  return task.bandVariants[band];
}
