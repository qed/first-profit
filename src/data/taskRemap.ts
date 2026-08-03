/**
 * Task-id remap machinery (Unit 5) — the explicit tables that carry a child's
 * saved progress across content edits, consumed by gameCore's migrate-on-load
 * (`fromSaveDoc`). Built once here, reused for every future structural edit.
 *
 * ── EDITORIAL RULE (origin doc R3/R8 — binding for all future edits) ──────
 * - A COPY TWEAK to the brief (rewording that does not change what the task
 *   asks for) KEEPS the task id. No entry here.
 * - A MEANING CHANGE, or a structural edit (insert / reorder / split), mints a
 *   NEW id and MUST ship with an entry in `TASK_REMAP`:
 *     old id → new id   — the child's completion MOVES to the new task, or
 *     old id → null     — the old id is RETIRED: its progress is preserved
 *                         raw (never dropped, never displayed, never counted
 *                         toward any new task).
 *
 * THE TABLE IS BEHAVIOR (remap-inherits-side-effects learning): moving a
 * completion can flip a criterion complete. The migration path only MARKS
 * state — it never dispatches actions and never fires celebrations.
 */
import { PATH_CONTENT } from "./pathContent.generated";

/**
 * The initial index-key migration: legacy `${stepId}#${index}` progress keys →
 * stable task ids. EXACTLY these ten hand-authored entries — the only keys
 * that can legitimately exist under PLAYABLE_STEPS ("1.1"/"1.2"), verified
 * aligned position-for-position against both the old hand-written task lists
 * and the brief's numbered tasks.
 *
 * ALL other legacy keys are unmappable and stay preserved-raw in the legacy
 * `done` map. This is deliberately NOT a blanket `index+1` rule: the old
 * condensed task lists beyond 1.2 do NOT align positionally with the brief
 * (e.g. old `1.3#3` is the brief's 1.3.5, not 1.3.4), so inventing a mapping
 * there would silently credit the wrong task.
 */
export const LEGACY_KEY_REMAP: Readonly<Record<string, string>> = {
  "1.1#0": "1.1.1",
  "1.1#1": "1.1.2",
  "1.1#2": "1.1.3",
  "1.1#3": "1.1.4",
  "1.1#4": "1.1.5",
  "1.2#0": "1.2.1",
  "1.2#1": "1.2.2",
  "1.2#2": "1.2.3",
  "1.2#3": "1.2.4",
  "1.2#4": "1.2.5",
};

/** A remap target: the new task id, or null when the old id is retired. */
export type RemapTarget = string | null;

/**
 * Task-id → task-id remap for future meaning changes / structural edits (see
 * the editorial rule above). SHIPS EMPTY: the machinery exists and is
 * exercised by tests; the first real entry arrives with the first real edit.
 */
export const TASK_REMAP: Readonly<Record<string, RemapTarget>> = {};

/**
 * Resolve a task id through the remap table: follow old→new chains to the
 * live id. A retired entry (null) and an absent entry both resolve to the id
 * itself (retired progress stays preserved in place). Cycle-guarded so a bad
 * table can never hang a load.
 */
export function resolveTaskId(
  id: string,
  remap: Readonly<Record<string, RemapTarget>> = TASK_REMAP,
): string {
  let current = id;
  const seen = new Set<string>([current]);
  for (;;) {
    const next = remap[current];
    if (typeof next !== "string") return current; // no entry, or retired
    if (seen.has(next)) return id; // cyclic table: refuse to move at all
    seen.add(next);
    current = next;
  }
}

// ── Positional lookups against the generated content ─────────────────────

const TASK_IDS_BY_CRITERION: ReadonlyMap<string, readonly string[]> = new Map(
  PATH_CONTENT.phases.flatMap((phase) =>
    phase.criteria.map(
      (criterion) => [criterion.id, criterion.tasks.map((task) => task.id)] as const,
    ),
  ),
);

/**
 * The stable task id at a positional (stepId, index) address, from the
 * generated content. This is how the reducer's positional COMPLETE_TASK
 * dual-writes the new key.
 */
export function taskIdAt(stepId: string, index: number): string | undefined {
  return TASK_IDS_BY_CRITERION.get(stepId)?.[index];
}

const LEGACY_KEY_BY_TASK_ID: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LEGACY_KEY_REMAP).map(([legacyKey, taskId]) => [taskId, legacyKey]),
);

/**
 * The legacy `${stepId}#${index}` key a task id maps back to, if any — the
 * dual-write's reverse lookup (only tasks with a legacy representation keep
 * writing the legacy map during the transition).
 */
export function legacyKeyForTaskId(taskId: string): string | undefined {
  return LEGACY_KEY_BY_TASK_ID[taskId];
}
