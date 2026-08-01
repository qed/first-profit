/**
 * Unit 8 — first-run onboarding core transitions (screens 2..5).
 *
 * The UI (Onboarding.tsx) is verified visually per CLAUDE.md at ~390px; these
 * tests pin the reducer contract the screens depend on: the `ob` screen index
 * flow, and that completing screen 5 seeds exactly one idea AND sets the
 * persisted `onboardingComplete` flag so the next login routes to `app`.
 */
import { describe, expect, it } from "vitest";
import {
  type Action,
  type GameState,
  fromSaveDoc,
  initialState,
  reducer,
  toSaveDoc,
} from "../gameCore";

function apply(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce(reducer, state);
}

describe("onboarding screen index (ob)", () => {
  it("starts at screen 2 (the founder), screen 1 pre-completed", () => {
    expect(initialState().ob).toBe(2);
  });

  it("advances 2 → 5 and can step back via SET_OB", () => {
    let s = initialState();
    for (const ob of [3, 4, 5]) {
      s = reducer(s, { type: "SET_OB", ob });
      expect(s.ob).toBe(ob);
    }
    // Back navigation is the same channel (SET_OB), so a reload-free back works.
    s = reducer(s, { type: "SET_OB", ob: 4 });
    expect(s.ob).toBe(4);
  });
});

describe("completing screen 5 (Start Unit Task #1)", () => {
  // The screen dispatches exactly this sequence.
  const complete = (s: GameState) =>
    apply(
      s,
      { type: "CREATE_IDEA" },
      { type: "SET_ONBOARDING_COMPLETE" },
      { type: "SET_STAGE", stage: "app" },
    );

  it("seeds exactly one idea, opens the runner at 1.1.1, enters app", () => {
    const s = complete(reducer(initialState(), { type: "SET_OB", ob: 5 }));
    expect(s.ideas).toHaveLength(1);
    expect(s.activeIdea).toBe(0);
    expect(s.runnerOpen).toBe(true);
    expect(s.runnerStep).toBe("1.1");
    expect(s.runnerIndex).toBe(0);
    expect(s.stage).toBe("app");
    expect(s.onboardingComplete).toBe(true);
  });

  it("marks onboardingComplete in the save doc so returns skip onboarding", () => {
    const s = complete(initialState());
    const doc = toSaveDoc(s);
    expect(doc.onboardingComplete).toBe(true);
    expect(doc.ideas).toHaveLength(1);
  });
});

describe("HYDRATE routing from a loaded save", () => {
  it("a completed save routes straight to app, never back into onboard", () => {
    const completed = apply(
      reducer(initialState(), { type: "SET_OB", ob: 5 }),
      { type: "CREATE_IDEA" },
      { type: "SET_ONBOARDING_COMPLETE" },
    );
    const parsed = fromSaveDoc(toSaveDoc(completed));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const booted = reducer(initialState(), { type: "HYDRATE", doc: parsed.doc });
    expect(booted.stage).toBe("app");
  });

  it("an incomplete save (no ideas, not complete) routes to onboard", () => {
    const parsed = fromSaveDoc(toSaveDoc(initialState()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const booted = reducer(initialState(), { type: "HYDRATE", doc: parsed.doc });
    expect(booted.stage).toBe("onboard");
  });
});

describe("SET_ONBOARDING_COMPLETE", () => {
  it("defaults to true and can be explicitly cleared", () => {
    const done = reducer(initialState(), { type: "SET_ONBOARDING_COMPLETE" });
    expect(done.onboardingComplete).toBe(true);
    const cleared = reducer(done, { type: "SET_ONBOARDING_COMPLETE", value: false });
    expect(cleared.onboardingComplete).toBe(false);
  });
});
