/**
 * Unit 5 — stable-key progress migration (MERGE-on-load union).
 *
 * Pins the behavior of `fromSaveDoc`'s legacy `${stepId}#${index}` → task-id
 * ("1.1.3") migration BEFORE the implementation exists (test-first per the
 * plan): fixture docs cover fresh, legacy-complete, mixed, unmappable,
 * malformed, idempotent, stale-tab, and future-remap shapes. The real Cedric
 * prod-doc SHAPE is a fixture. Migration marks state only — it must never
 * dispatch actions or fire celebrations (remap-inherits-side-effects learning).
 */
import { describe, expect, it } from "vitest";
import { stepById } from "../../data/path";
import {
  LEGACY_KEY_REMAP,
  TASK_REMAP,
  legacyKeyForTaskId,
  resolveTaskId,
  taskIdAt,
} from "../../data/taskRemap";
import {
  type GameState,
  type SaveDoc,
  fromSaveDoc,
  initialState,
  isCriterionDone,
  isTaskDone,
  reducer,
  taskKey,
  toSaveDoc,
} from "../gameCore";

/** Look up a step, throwing if absent. */
function getStep(id: string) {
  const step = stepById(id);
  if (!step) throw new Error(`no step ${id}`);
  return step;
}

/** Legacy done map: every task of a criterion complete under `${stepId}#${i}` keys. */
function legacyDoneFor(stepId: string, upTo?: number): Record<string, boolean> {
  const count = upTo ?? getStep(stepId).tasks.length;
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [taskKey(stepId, i), true]),
  );
}

/** A minimal well-formed v1 doc around the given ideas. */
function docWith(ideas: unknown[]): Record<string, unknown> {
  return {
    docVersion: 1,
    ideas,
    activeIdea: 0,
    siteHeadline: "",
    onboardingComplete: true,
  };
}

/** Parse a doc, throwing on refusal (keeps tests free of ok-guards). */
function parse(raw: unknown, remap?: Readonly<Record<string, string | null>>): SaveDoc {
  const result = fromSaveDoc(raw, remap);
  if (!result.ok) throw new Error(`doc refused: ${result.reason}`);
  return result.doc;
}

function hydrate(doc: SaveDoc): GameState {
  return reducer(initialState(), { type: "HYDRATE", doc });
}

/**
 * The real Cedric save SHAPE (prod data, 2026-08): 1.1 fully done plus 1.2
 * tasks 0-3 done, all under legacy keys; fields oneLiner + productName.
 */
function cedricDoc(): Record<string, unknown> {
  return docWith([
    {
      fields: { oneLiner: "Cold drinks for hot people", productName: "Lemonade" },
      done: { ...legacyDoneFor("1.1"), ...legacyDoneFor("1.2", 4) },
    },
  ]);
}

// ── The remap table itself ───────────────────────────────────────────────

describe("taskRemap: the explicit legacy-key table", () => {
  it("is EXACTLY the ten hand-authored 1.1/1.2 entries (never a blanket index+1)", () => {
    expect(LEGACY_KEY_REMAP).toEqual({
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
    });
  });

  it("every entry's target is the task actually AT that position in the generated content", () => {
    for (const [legacyKey, target] of Object.entries(LEGACY_KEY_REMAP)) {
      const [stepId, index] = legacyKey.split("#");
      expect(taskIdAt(stepId, Number(index))).toBe(target);
    }
  });

  it("the future-edit remap table ships empty (machinery only, no edits yet)", () => {
    expect(TASK_REMAP).toEqual({});
  });

  it("legacyKeyForTaskId inverts the table (dual-write's reverse lookup)", () => {
    expect(legacyKeyForTaskId("1.1.3")).toBe("1.1#2");
    expect(legacyKeyForTaskId("1.2.5")).toBe("1.2#4");
    expect(legacyKeyForTaskId("1.3.1")).toBeUndefined();
  });

  it("taskIdAt resolves positions from the generated content and is range-safe", () => {
    expect(taskIdAt("1.1", 0)).toBe("1.1.1");
    expect(taskIdAt("1.2", 4)).toBe("1.2.5");
    expect(taskIdAt("1.3", 2)).toBe("1.3.3");
    expect(taskIdAt("1.1", 99)).toBeUndefined();
    expect(taskIdAt("nope", 0)).toBeUndefined();
  });

  it("resolveTaskId follows a remap chain, treats retired (null) as terminal, and guards cycles", () => {
    expect(resolveTaskId("1.1.1")).toBe("1.1.1"); // no entry: itself
    expect(resolveTaskId("1.1.1", { "1.1.1": "1.1.9" })).toBe("1.1.9");
    expect(resolveTaskId("1.1.1", { "1.1.1": "1.1.8", "1.1.8": "1.1.9" })).toBe("1.1.9");
    expect(resolveTaskId("1.1.1", { "1.1.1": null })).toBe("1.1.1"); // retired: stays put
    expect(resolveTaskId("1.1.1", { "1.1.1": "1.1.2", "1.1.2": "1.1.1" })).toBe("1.1.1"); // cycle
  });
});

// ── fromSaveDoc MERGE-on-load (union) ────────────────────────────────────

describe("fromSaveDoc migration: merge-on-load union", () => {
  it("a fresh doc loads clean: no new-shape maps are invented", () => {
    const doc = parse(docWith([{ fields: {}, done: {} }]));
    expect(doc.ideas[0]).not.toHaveProperty("doneByTask");
    expect(doc.ideas[0]).not.toHaveProperty("doneAtByTask");
  });

  it("a legacy-complete 1.1 doc migrates to doneByTask 1.1.1–1.1.5, legacy fields retained untouched", () => {
    const doc = parse(docWith([{ fields: {}, done: legacyDoneFor("1.1") }]));
    expect(doc.ideas[0].doneByTask).toEqual({
      "1.1.1": true,
      "1.1.2": true,
      "1.1.3": true,
      "1.1.4": true,
      "1.1.5": true,
    });
    // Old tabs keep working: the legacy map is retained, never rewritten.
    expect(doc.ideas[0].done).toEqual(legacyDoneFor("1.1"));
  });

  it("loading a migrated legacy-complete doc keeps the criterion complete and fires NO celebration", () => {
    const s = hydrate(parse(docWith([{ fields: {}, done: legacyDoneFor("1.1") }])));
    expect(isCriterionDone(s, 0, "1.1")).toBe(true);
    expect(s.celebrate).toBeNull(); // migration marks state, never dispatches
    expect(s.runnerOpen).toBe(false);
  });

  it("legacy doneAt timestamps migrate through the SAME remap (1.1#2 → doneAt on 1.1.3)", () => {
    const doc = parse(
      docWith([
        {
          fields: {},
          done: { [taskKey("1.1", 2)]: true },
          doneAt: { [taskKey("1.1", 2)]: 1_754_000_000_000 },
        },
      ]),
    );
    expect(doc.ideas[0].doneByTask).toEqual({ "1.1.3": true });
    expect(doc.ideas[0].doneAtByTask).toEqual({ "1.1.3": 1_754_000_000_000 });
    expect(doc.ideas[0].doneAt).toEqual({ [taskKey("1.1", 2)]: 1_754_000_000_000 });
  });

  it("mixed old+new shapes UNION: nothing lost from either side", () => {
    const doc = parse(
      docWith([
        {
          fields: {},
          done: { [taskKey("1.1", 0)]: true }, // old tab wrote this
          doneByTask: { "1.1.2": true }, // new tab wrote this
        },
      ]),
    );
    expect(doc.ideas[0].doneByTask).toEqual({ "1.1.2": true, "1.1.1": true });
    expect(doc.ideas[0].done).toEqual({ [taskKey("1.1", 0)]: true });
  });

  it("on a timestamp conflict for the same task, the new shape wins (union only ever ADDS)", () => {
    const doc = parse(
      docWith([
        {
          fields: {},
          done: { [taskKey("1.1", 0)]: true },
          doneAt: { [taskKey("1.1", 0)]: 2222 },
          doneByTask: { "1.1.1": true },
          doneAtByTask: { "1.1.1": 1111 },
        },
      ]),
    );
    expect(doc.ideas[0].doneAtByTask).toEqual({ "1.1.1": 1111 });
  });

  it("an unmappable legacy key (1.3#3) is preserved raw — NOT mapped to 1.3.4 (no blanket index+1)", () => {
    const doc = parse(docWith([{ fields: {}, done: { "1.3#3": true } }]));
    // Preserved raw, never dropped:
    expect(doc.ideas[0].done["1.3#3"]).toBe(true);
    // Never invented into the new shape — the condensed lists don't align
    // positionally (old 1.3#3 is the brief's 1.3.5, not 1.3.4):
    expect(doc.ideas[0].doneByTask?.["1.3.4"]).toBeUndefined();
    expect(doc.ideas[0].doneByTask ?? {}).toEqual({});
    // And it never flips 1.3's criterion completion.
    const s = hydrate(doc);
    expect(isCriterionDone(s, 0, "1.3")).toBe(false);
  });

  it("malformed new-shape leaves are dropped by coercion without failing the load", () => {
    const doc = parse(
      docWith([
        {
          fields: {},
          done: { [taskKey("1.1", 0)]: true, bad: "yes" },
          doneByTask: { "1.1.2": true, "1.1.3": "true", "1.1.4": 1, x: null },
          doneAtByTask: { "1.1.2": 500, neg: -1, str: "yesterday", nul: null },
        },
      ]),
    );
    expect(doc.ideas[0].doneByTask).toEqual({ "1.1.2": true, "1.1.1": true });
    expect(doc.ideas[0].doneAtByTask).toEqual({ "1.1.2": 500 });
    expect(doc.ideas[0].done).toEqual({ [taskKey("1.1", 0)]: true });
  });

  it("double-migration is idempotent and byte-stable", () => {
    const first = parse(cedricDoc());
    const second = parse(JSON.parse(JSON.stringify(first)));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("save → reload round-trips stable (both shapes emitted, re-load changes nothing)", () => {
    let s = hydrate(parse(cedricDoc()));
    s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.2", index: 4, at: 1000 });
    const saved = toSaveDoc(s);
    const reloaded = toSaveDoc(hydrate(parse(JSON.parse(JSON.stringify(saved)))));
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(saved));
  });

  it("stale-tab round trip: an old tab stripping the new fields loses nothing legacy-representable", () => {
    // New code completes tasks (dual-write) and saves.
    let s = hydrate(parse(docWith([{ fields: {}, done: {} }])));
    s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.1", index: 0, at: 111 });
    s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.1", index: 1, at: 222 });
    const saved = JSON.parse(JSON.stringify(toSaveDoc(s))) as Record<string, unknown>;
    // An OLD tab hydrates this doc, strips the fields it doesn't know, and saves.
    const oldShaped = {
      ...saved,
      ideas: (saved.ideas as Record<string, unknown>[]).map(
        ({ doneByTask: _d, doneAtByTask: _a, ...rest }) => rest,
      ),
    };
    // The next new-code load re-unions every legacy-representable completion.
    const recovered = parse(oldShaped);
    expect(recovered.ideas[0].doneByTask).toEqual({ "1.1.1": true, "1.1.2": true });
    expect(recovered.ideas[0].doneAtByTask).toEqual({ "1.1.1": 111, "1.1.2": 222 });
  });

  it("a future remap entry (A→B) moves the completion exactly once across repeated loads", () => {
    const remap = { "1.1.1": "1.1.9" } as const;
    const raw = docWith([
      {
        fields: {},
        done: {},
        doneByTask: { "1.1.1": true },
        doneAtByTask: { "1.1.1": 777 },
      },
    ]);
    const first = parse(raw, remap);
    expect(first.ideas[0].doneByTask).toEqual({ "1.1.9": true });
    expect(first.ideas[0].doneAtByTask).toEqual({ "1.1.9": 777 });
    // Repeated loads: stable, moved exactly once (A never resurrects).
    const second = parse(JSON.parse(JSON.stringify(first)), remap);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("a legacy key whose target is later remapped routes THROUGH the chain (1.1#0 → 1.1.1 → 1.1.9)", () => {
    const remap = { "1.1.1": "1.1.9" } as const;
    const doc = parse(docWith([{ fields: {}, done: { [taskKey("1.1", 0)]: true } }]), remap);
    expect(doc.ideas[0].doneByTask).toEqual({ "1.1.9": true });
    expect(doc.ideas[0].doneByTask?.["1.1.1"]).toBeUndefined();
  });

  it("a retired entry (A→null) leaves the completion preserved in place, never dropped", () => {
    const remap = { "1.1.1": null } as const;
    const doc = parse(
      docWith([{ fields: {}, done: {}, doneByTask: { "1.1.1": true } }]),
      remap,
    );
    expect(doc.ideas[0].doneByTask).toEqual({ "1.1.1": true });
  });

  it("the Cedric doc shape migrates with every completion intact and 1.2 still open", () => {
    const doc = parse(cedricDoc());
    expect(doc.ideas[0].fields).toEqual({
      oneLiner: "Cold drinks for hot people",
      productName: "Lemonade",
    });
    expect(doc.ideas[0].doneByTask).toEqual({
      "1.1.1": true,
      "1.1.2": true,
      "1.1.3": true,
      "1.1.4": true,
      "1.1.5": true,
      "1.2.1": true,
      "1.2.2": true,
      "1.2.3": true,
      "1.2.4": true,
    });
    const s = hydrate(doc);
    expect(isCriterionDone(s, 0, "1.1")).toBe(true);
    expect(isCriterionDone(s, 0, "1.2")).toBe(false);
    expect(isTaskDone(s, 0, "1.2", 3)).toBe(true);
    expect(isTaskDone(s, 0, "1.2", 4)).toBe(false);
    expect(s.celebrate).toBeNull();
  });
});

// ── Read/write paths (dual-write during the transition) ──────────────────

describe("dual-write read/write paths", () => {
  function withOneIdea(): GameState {
    return reducer(
      reducer(initialState(), { type: "CREATE_IDEA" }),
      { type: "CLOSE_RUNNER" },
    );
  }

  it("COMPLETE_TASK writes BOTH shapes: legacy done + doneByTask, doneAt + doneAtByTask", () => {
    const s = reducer(withOneIdea(), {
      type: "COMPLETE_TASK",
      ideaIndex: 0,
      stepId: "1.1",
      index: 2,
      at: 1_754_000_000_000,
    });
    expect(s.ideas[0].done[taskKey("1.1", 2)]).toBe(true);
    expect(s.ideas[0].doneByTask?.["1.1.3"]).toBe(true);
    expect(s.ideas[0].doneAt?.[taskKey("1.1", 2)]).toBe(1_754_000_000_000);
    expect(s.ideas[0].doneAtByTask?.["1.1.3"]).toBe(1_754_000_000_000);
  });

  it("isTaskDone reads doneByTask FIRST: a doc completed only under new keys still reads done", () => {
    const s = hydrate(
      parse(docWith([{ fields: {}, done: {}, doneByTask: { "1.1.1": true } }])),
    );
    expect(isTaskDone(s, 0, "1.1", 0)).toBe(true);
    expect(isTaskDone(s, 0, "1.1", 1)).toBe(false);
  });

  it("isTaskDone falls back to legacy done (belt and braces)", () => {
    // A state whose idea carries ONLY the legacy key (e.g. built by an old tab
    // in memory, pre-migration).
    let s = withOneIdea();
    s = {
      ...s,
      ideas: [{ fields: {}, done: { [taskKey("1.1", 0)]: true } }],
    };
    expect(isTaskDone(s, 0, "1.1", 0)).toBe(true);
  });

  it("toSaveDoc emits both shapes after a dual-written completion", () => {
    const s = reducer(withOneIdea(), {
      type: "COMPLETE_TASK",
      ideaIndex: 0,
      stepId: "1.1",
      index: 0,
      at: 42,
    });
    const doc = toSaveDoc(s);
    expect(doc.ideas[0].done).toEqual({ [taskKey("1.1", 0)]: true });
    expect(doc.ideas[0].doneByTask).toEqual({ "1.1.1": true });
    expect(doc.ideas[0].doneAt).toEqual({ [taskKey("1.1", 0)]: 42 });
    expect(doc.ideas[0].doneAtByTask).toEqual({ "1.1.1": 42 });
  });

  it("the 1.2 real-sale auto-complete marks through the SAME dual-write path", () => {
    let s = withOneIdea();
    for (let i = 0; i < getStep("1.1").tasks.length; i++) {
      s = reducer(s, { type: "COMPLETE_TASK", ideaIndex: 0, stepId: "1.1", index: i });
    }
    s = reducer(s, {
      type: "ADD_LEDGER",
      id: "sale-1",
      kind: "sale",
      payer: "Neighbor",
      amountCents: 500,
      createdAt: "2026-08-03T12:00:00.000Z",
    });
    const last = getStep("1.2").tasks.length - 1;
    expect(s.ideas[0].done[taskKey("1.2", last)]).toBe(true);
    expect(s.ideas[0].doneByTask?.["1.2.5"]).toBe(true);
    expect(s.ideas[0].doneAtByTask?.["1.2.5"]).toBe(Date.parse("2026-08-03T12:00:00.000Z"));
  });

  it("HYDRATE sources the new maps and never wipes them (split-storage learning)", () => {
    const doc = parse(
      docWith([
        {
          fields: {},
          done: { [taskKey("1.1", 0)]: true },
          doneAt: { [taskKey("1.1", 0)]: 9 },
        },
      ]),
    );
    const s = hydrate(doc);
    expect(s.ideas[0].doneByTask).toEqual({ "1.1.1": true });
    expect(s.ideas[0].doneAtByTask).toEqual({ "1.1.1": 9 });
    // And a save straight after hydrate keeps both shapes.
    const resaved = toSaveDoc(s);
    expect(resaved.ideas[0].doneByTask).toEqual({ "1.1.1": true });
  });

  it("RESET_SESSION clears the new maps with the ideas (shared-device safety)", () => {
    const s = reducer(withOneIdea(), {
      type: "COMPLETE_TASK",
      ideaIndex: 0,
      stepId: "1.1",
      index: 0,
      at: 1,
    });
    const reset = reducer(s, { type: "RESET_SESSION" });
    expect(reset.ideas).toEqual([]);
  });
});
