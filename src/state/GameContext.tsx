/**
 * fpv2 GameContext provider (Unit 5 rewrite).
 *
 * Wraps the pure `gameCore` reducer in React and layers the auth/session
 * lifecycle on top: login through The120's route, explicit + idle logout, an
 * inactivity timeout, and account-scoped draft handling.
 *
 * Draft policy (Key Technical Decision: "logout revokes, not just hides — but
 * idle and explicit logout differ"):
 *  - different-user login → wipe ALL `fp:*` keys before hydrating.
 *  - explicit logout      → wipe the current user's `fp:<uid>:*` keys.
 *  - idle logout          → PRESERVE the same user's drafts (restore on re-login).
 *
 * Boot (Key Technical Decision: "No router / boot stage"): start at `boot`,
 * resolve any persisted Supabase session on mount, then route to `landing`
 * (no session) or `app` (session present). The real save-driven onboard/app
 * decision is Unit 6 — see the marked HYDRATE seam below.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import {
  reducer,
  initialState,
  backingSumCents as backingSumCentsFn,
  salesSumCents as salesSumCentsFn,
  nextUpFor as nextUpForFn,
  isTaskDone as isTaskDoneFn,
  isCriterionDone as isCriterionDoneFn,
  sellProgress as sellProgressFn,
  isStepUnlocked as isStepUnlockedFn,
  ideasEligibleFor as ideasEligibleForFn,
  type GameState,
  type Action,
} from "./gameCore";
import {
  loginChild,
  logout as authLogout,
  getCurrentUserId,
  type ChildProfile,
} from "../lib/auth";
import { wipeAllForUser, wipeAllFpKeys, getLastUserId, setLastUserId } from "../lib/draftCache";

/** ~45 minutes of no interaction triggers an idle logout. */
const IDLE_TIMEOUT_MS = 45 * 60 * 1000;

export interface GameApi extends GameState {
  dispatch: React.Dispatch<Action>;

  // Bound selectors (current state pre-applied).
  nextUpFor: (ideaIndex: number) => string | null;
  isTaskDone: (ideaIndex: number, stepId: string, index: number) => boolean;
  isCriterionDone: (ideaIndex: number, stepId: string) => boolean;
  sellProgress: (ideaIndex: number) => { done: number; total: number };
  isStepUnlocked: (ideaIndex: number, stepId: string) => boolean;
  ideasEligibleFor: (stepId: string) => number[];
  backingSumCents: () => number;
  salesSumCents: () => number;

  // Auth / session actions.
  login: (identifier: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const GameContext = createContext<GameApi | null>(null);

function isLoggedInStage(stage: GameState["stage"]): boolean {
  return stage === "app" || stage === "onboard";
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // A ref mirror of the stage so long-lived listeners (idle timer, activity)
  // read the live value without re-subscribing on every keystroke.
  const stageRef = useRef(state.stage);
  stageRef.current = state.stage;

  // ── Boot: resolve any persisted session, then route. ────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = await getCurrentUserId();
      if (cancelled) return;
      if (!userId) {
        dispatch({ type: "SET_STAGE", stage: "landing" });
        return;
      }
      // A session exists. Unit 6 will fetch the save and decide onboard vs app
      // from onboardingComplete.
      // TODO(Unit 6): fetch fp_player_saves and HYDRATE (dispatch { type:
      //   "HYDRATE", doc }); the reducer already routes to onboard/app from
      //   doc.onboardingComplete. Until then a restored session defaults to app.
      dispatch({ type: "SET_STAGE", stage: "app" });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Login ────────────────────────────────────────────────────────────────
  const login = useCallback(async (identifier: string, password: string): Promise<boolean> => {
    const result = await loginChild(identifier, password);
    if (!result.ok) return false;

    // Same-user vs different-user: wipe ALL fp:* drafts/outbox before hydrating
    // when a different child logs in on this device.
    const userId = await getCurrentUserId();
    if (userId) {
      const last = getLastUserId();
      if (last && last !== userId) {
        wipeAllFpKeys();
      }
      setLastUserId(userId);
    }

    const profile: ChildProfile = result.profile;
    dispatch({ type: "SET_PROFILE", patch: { firstName: profile.firstName, handle: profile.handle } });

    // TODO(Unit 6): fetch fp_player_saves for this profile and HYDRATE — the
    //   reducer routes to onboard/app from doc.onboardingComplete, and the
    //   sync layer restores same-user drafts/outbox from the account cache.
    //   Until then: no save exists yet, so onboarding is incomplete → onboard.
    dispatch({ type: "SET_STAGE", stage: "onboard" });
    return true;
  }, []);

  // ── Logout (explicit + idle share a core, differ on draft handling). ──────
  const runLogout = useCallback(async (scope: "idle" | "explicit") => {
    const userId = await getCurrentUserId();
    await authLogout(scope);
    if (scope === "explicit" && userId) {
      // Explicit logout purges this user's drafts + outbox. Idle logout does
      // NOT — origin R6 keeps the same user's Step Runner input for re-login.
      wipeAllForUser(userId);
    }
    dispatch({ type: "SET_PROFILE", patch: { firstName: "", handle: "", siteHeadline: "" } });
    dispatch({ type: "SET_STAGE", stage: scope === "explicit" ? "landing" : "login" });
  }, []);

  const logout = useCallback(async () => {
    await runLogout("explicit");
  }, [runLogout]);

  // ── Idle timeout: revoke after ~45 min of no interaction while logged in. ──
  useEffect(() => {
    if (!isLoggedInStage(state.stage)) return;

    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (isLoggedInStage(stageRef.current)) {
          void runLogout("idle");
        }
      }, IDLE_TIMEOUT_MS);
    };

    const windowEvents: (keyof WindowEventMap)[] = ["mousedown", "keydown", "touchstart"];
    for (const ev of windowEvents) window.addEventListener(ev, reset, { passive: true });
    // `visibilitychange` fires on `document`, not `window`.
    document.addEventListener("visibilitychange", reset);
    reset();

    return () => {
      clearTimeout(timer);
      for (const ev of windowEvents) window.removeEventListener(ev, reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [state.stage, runLogout]);

  const value = useMemo<GameApi>(
    () => ({
      ...state,
      dispatch,
      nextUpFor: (ideaIndex) => nextUpForFn(state, ideaIndex),
      isTaskDone: (ideaIndex, stepId, index) => isTaskDoneFn(state, ideaIndex, stepId, index),
      isCriterionDone: (ideaIndex, stepId) => isCriterionDoneFn(state, ideaIndex, stepId),
      sellProgress: (ideaIndex) => sellProgressFn(state, ideaIndex),
      isStepUnlocked: (ideaIndex, stepId) => isStepUnlockedFn(state, ideaIndex, stepId),
      ideasEligibleFor: (stepId) => ideasEligibleForFn(state, stepId),
      backingSumCents: () => backingSumCentsFn(state),
      salesSumCents: () => salesSumCentsFn(state),
      login,
      logout,
    }),
    [state, login, logout],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameApi {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside GameProvider");
  return ctx;
}
