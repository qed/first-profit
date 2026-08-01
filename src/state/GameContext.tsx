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
  useState,
} from "react";
import {
  reducer,
  initialState,
  toSaveDoc,
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
import {
  resolveProfileId,
  resetProfileIdCache,
  loadSave,
  loadLedger,
  createSyncEngine,
  type SyncEngine,
  type SyncStatus,
} from "../lib/sync";

/** ~45 minutes of no interaction triggers an idle logout. */
const IDLE_TIMEOUT_MS = 45 * 60 * 1000;

export interface GameApi extends GameState {
  dispatch: React.Dispatch<Action>;

  /** Write-through save status the HUD can surface (idle/saving/saved/pending/error). */
  syncStatus: SyncStatus;

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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  // A ref mirror of the stage so long-lived listeners (idle timer, activity)
  // read the live value without re-subscribing on every keystroke.
  const stageRef = useRef(state.stage);
  stageRef.current = state.stage;

  // Live mirror of state for the framework-agnostic sync engine to read on demand.
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Sync engine plumbing ──────────────────────────────────────────────────
  // The engine is created per logged-in session (its outbox is user-scoped). The
  // reducer/UI stays optimistic; the engine writes through asynchronously.
  const engineRef = useRef<SyncEngine | null>(null);
  // The CAS base revision the next snapshot write races against.
  const revisionRef = useRef(0);
  // Ledger ids already handed to the engine (so a re-render never double-inserts).
  const knownLedgerIdsRef = useRef<Set<string>>(new Set());
  // Last serialized save doc, to detect a persist-worthy change vs a UI toggle.
  const lastSaveDocRef = useRef<string | null>(null);

  const stopEngine = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    lastSaveDocRef.current = null;
    knownLedgerIdsRef.current = new Set();
    setSyncStatus("idle");
  }, []);

  const startEngine = useCallback(
    (userId: string) => {
      stopEngine();
      lastSaveDocRef.current = null;
      knownLedgerIdsRef.current = new Set();
      const engine = createSyncEngine({
        userId,
        getSnapshot: () => ({
          doc: toSaveDoc(stateRef.current),
          revision: revisionRef.current,
        }),
        setRevision: (r) => {
          revisionRef.current = r;
        },
        onStatus: setSyncStatus,
        onReauthNeeded: () => {
          // An expired session mid-play: surface the login stage (never crash).
          dispatch({ type: "SET_STAGE", stage: "login" });
        },
      });
      engineRef.current = engine;
      // start() resolves the profile, wires online/hide listeners, and replays
      // any outbox left from a prior session. Fire-and-forget; failures are
      // swallowed inside the engine.
      void engine.start();
    },
    [stopEngine],
  );

  /**
   * Shared post-auth hydration: resolve the caller's profile (RLS "own row"),
   * load the save, and route. An empty/new save (no ideas and onboarding not
   * complete) routes to `onboard`; otherwise HYDRATE lets the reducer route
   * onboard/app from `onboardingComplete`. Non-crashing on load failure: fall
   * back to a fresh onboard so a logged-in child is never stranded.
   */
  const hydrateAndRoute = useCallback(
    async (userId: string) => {
      try {
        const profileId = await resolveProfileId();
        if (!profileId) {
          // No profile row visible (RLS) — start fresh rather than strand.
          revisionRef.current = 0;
          dispatch({ type: "SET_STAGE", stage: "onboard" });
          startEngine(userId);
          return;
        }
        const [{ doc, revision }, ledger] = await Promise.all([
          loadSave(profileId),
          loadLedger(profileId),
        ]);
        revisionRef.current = revision;
        if (doc && (doc.onboardingComplete || doc.ideas.length > 0)) {
          dispatch({ type: "HYDRATE", doc });
        } else {
          dispatch({ type: "SET_STAGE", stage: "onboard" });
        }
        startEngine(userId);
        // Fill the session ledger from the server. HYDRATE always clears it to []
        // so a session boundary starts empty; SET_LEDGER now repopulates it from
        // fp_ledger so Sales/backing totals + LedgerList survive a reload/re-login.
        // Seed the engine's "known ledger ids" from these rows FIRST so the
        // reducer-change subscription treats them as already-persisted and never
        // re-inserts the just-loaded rows (the insert path is also idempotent by
        // id via 23505-as-success, but this avoids the needless round-trips).
        if (ledger.length > 0) {
          for (const row of ledger) knownLedgerIdsRef.current.add(row.id);
          dispatch({ type: "SET_LEDGER", ledger });
        }
      } catch {
        // Any load failure: stay logged in, start fresh at onboarding.
        revisionRef.current = 0;
        dispatch({ type: "SET_STAGE", stage: "onboard" });
        startEngine(userId);
      }
    },
    [startEngine],
  );

  // ── Boot: resolve any persisted session, then route. ────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userId = await getCurrentUserId();
        if (cancelled) return;
        if (!userId) {
          dispatch({ type: "SET_STAGE", stage: "landing" });
          return;
        }
        // A restored session: resolve the profile, load the save, and route
        // (HYDRATE or onboard). This also starts the sync engine + outbox replay.
        await hydrateAndRoute(userId);
      } catch {
        // An unresolvable session must never strand the app on the boot spinner.
        // Treat it as logged-out and fall through to the landing stage.
        if (!cancelled) dispatch({ type: "SET_STAGE", stage: "landing" });
      }
    })();
    return () => {
      cancelled = true;
    };
    // hydrateAndRoute is stable (its callback chain has empty/stable deps), so
    // this boot effect still runs exactly once.
  }, [hydrateAndRoute]);

  // ── Subscribe reducer changes to the sync layer. ──────────────────────────
  // After each state change: persist any newly-added ledger row immediately, and
  // schedule a debounced snapshot when the persistent save doc actually changed
  // (a UI-only toggle like opening a room must not trigger a write).
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isLoggedInStage(state.stage)) return;

    for (const row of state.ledger) {
      if (!knownLedgerIdsRef.current.has(row.id)) {
        knownLedgerIdsRef.current.add(row.id);
        engine.notifyLedger({
          id: row.id,
          kind: row.kind,
          payer: row.payer,
          amountCents: row.amountCents,
        });
      }
    }

    const serialized = JSON.stringify(toSaveDoc(state));
    if (lastSaveDocRef.current === null) {
      // First observation after hydrate/start: seed the baseline without a write.
      lastSaveDocRef.current = serialized;
    } else if (lastSaveDocRef.current !== serialized) {
      lastSaveDocRef.current = serialized;
      engine.notifySnapshotChange();
    }
  }, [state]);

  // Tear the engine down on unmount (clears timers + online/hide listeners).
  useEffect(() => stopEngine, [stopEngine]);

  // ── Login ────────────────────────────────────────────────────────────────
  const login = useCallback(
    async (identifier: string, password: string): Promise<boolean> => {
      // Clear any resident per-account state up front so no path can advance the
      // stage with a previous child's ideas/ledger resident on a shared device.
      dispatch({ type: "RESET_SESSION" });
      // A new session may be a different child → a different profile. Drop the
      // cached profile id so resolveProfileId re-reads under the new session.
      resetProfileIdCache();

      const result = await loginChild(identifier, password);
      if (!result.ok) return false;

      try {
        // Same-user vs different-user: wipe ALL fp:* drafts/outbox before
        // hydrating when a different child logs in on this device. The user id
        // comes from loginChild's setSession result — no second session lookup.
        const { userId } = result;
        if (userId) {
          const last = getLastUserId();
          if (last && last !== userId) {
            wipeAllFpKeys();
          }
          setLastUserId(userId);
        }

        const profile: ChildProfile = result.profile;
        dispatch({
          type: "SET_PROFILE",
          patch: { firstName: profile.firstName, handle: profile.handle },
        });

        // Resolve the profile (RLS "own row"), load the save, HYDRATE or route to
        // onboard, and start the sync engine. Same-user re-login restores the
        // account-scoped drafts/outbox that the engine replays on start.
        if (userId) {
          await hydrateAndRoute(userId);
        } else {
          // Missing user id (should not happen after setSession) — route safely.
          dispatch({ type: "SET_STAGE", stage: "onboard" });
        }
        return true;
      } catch {
        // A storage or dispatch failure post-auth must surface as a clean login
        // failure so the screen can reset loading and show the generic error.
        return false;
      }
    },
    [hydrateAndRoute],
  );

  // ── Logout (explicit + idle share a core, differ on draft handling). ──────
  const runLogout = useCallback(
    async (scope: "idle" | "explicit") => {
      const userId = await getCurrentUserId();
      // Tear down the sync engine (timers + online/hide listeners) before the
      // session is revoked, so no post-logout write races out.
      stopEngine();
      resetProfileIdCache();
      await authLogout(scope);
      if (scope === "explicit" && userId) {
        // Explicit logout purges this user's drafts + outbox. Idle logout does
        // NOT — origin R6 keeps the same user's Step Runner input for re-login.
        wipeAllForUser(userId);
      }
      // Clear resident ideas/ledger/UI on BOTH scopes so a shared device never
      // carries one child's business/financial state past logout.
      dispatch({ type: "RESET_SESSION" });
      dispatch({ type: "SET_PROFILE", patch: { firstName: "", handle: "", siteHeadline: "" } });
      dispatch({ type: "SET_STAGE", stage: scope === "explicit" ? "landing" : "login" });
    },
    [stopEngine],
  );

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
    // `visibilitychange` fires on `document`. Count only a RETURN to a visible
    // tab as activity — backgrounding the tab must not reset the idle clock.
    const onVisibility = () => {
      if (document.visibilityState === "visible") reset();
    };
    document.addEventListener("visibilitychange", onVisibility);
    reset();

    return () => {
      clearTimeout(timer);
      for (const ev of windowEvents) window.removeEventListener(ev, reset);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [state.stage, runLogout]);

  const value = useMemo<GameApi>(
    () => ({
      ...state,
      dispatch,
      syncStatus,
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
    [state, syncStatus, login, logout],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameApi {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside GameProvider");
  return ctx;
}
