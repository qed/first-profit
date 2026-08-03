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
  grossSalesSumCents as grossSalesSumCentsFn,
  salesSumCents as salesSumCentsFn,
  nextUpFor as nextUpForFn,
  isTaskDone as isTaskDoneFn,
  isCriterionDone as isCriterionDoneFn,
  isStepUnlocked as isStepUnlockedFn,
  ideasEnterableFor as ideasEnterableForFn,
  activeBusiness as activeBusinessFn,
  isPhaseComplete as isPhaseCompleteFn,
  type GameState,
  type Action,
} from "./gameCore";
import {
  loginChild,
  logout as authLogout,
  getCurrentUserId,
  submitBirthYear,
  fetchSiteStatus,
  claimHandle as claimHandleApi,
  publishSite as publishSiteApi,
  type ChildProfile,
  type ClaimHandleResult,
  type PublishSiteResult,
} from "../lib/auth";
import { bandForFeedback, displayBand, gradeFromBirthYear, type Band } from "../lib/band";
import { getDraft, setDraft, wipeAllForUser, wipeAllFpKeys, getLastUserId, setLastUserId } from "../lib/draftCache";
import {
  resolveProfileId,
  resetProfileIdCache,
  loadSave,
  loadLedger,
  createSyncEngine,
  enqueueFeedback,
  isValidFeedbackRow,
  feedbackCountForDay,
  bumpFeedbackCountForDay,
  utcDayToday,
  flushOutboxForPriorUser,
  FEEDBACK_DAILY_CAP,
  FEEDBACK_BODY_MAX,
  type FeedbackBand,
  type FeedbackSendOutcome,
  type FlushOutcome,
  type SyncEngine,
  type SyncStatus,
} from "../lib/sync";

/** ~45 minutes of no interaction triggers an idle logout. */
const IDLE_TIMEOUT_MS = 45 * 60 * 1000;

/** Draft-cache name for the login roster patch (firstName/handle/grade), so a
 *  restored session's hydrate can re-adopt it (login is otherwise its only
 *  writer and the profile never rides the save doc). */
const PROFILE_CACHE_DRAFT = "profileCache";

/**
 * The honest fate of a "Stuck? Tell us" submission, for the StuckBox UI:
 * `sent`/`queued`/`dropped`/`capped` from the sync engine (`capped` = the
 * server's FP429 daily-cap refusal), with `capped` also produced locally when
 * the mirror of the DB's 50-per-day cap refuses before anything is enqueued.
 */
export type FeedbackSubmitOutcome = FeedbackSendOutcome | "capped";

export interface GameApi extends GameState {
  dispatch: React.Dispatch<Action>;

  /** Write-through save status the HUD can surface (idle/saving/saved/pending/error). */
  syncStatus: SyncStatus;

  // Bound selectors (current state pre-applied).
  nextUpFor: (ideaIndex: number) => string | null;
  isTaskDone: (ideaIndex: number, stepId: string, index: number) => boolean;
  isCriterionDone: (ideaIndex: number, stepId: string) => boolean;
  isStepUnlocked: (ideaIndex: number, stepId: string) => boolean;
  /** Room-enterable ideas for a criterion: in-progress first, else completed
   *  ideas in review mode (one rule with roomEntryFor — see ideasEnterableFor). */
  ideasEligibleFor: (stepId: string) => number[];
  grossSalesSumCents: () => number;
  salesSumCents: () => number;

  // ── Business promotion (Unit 7; origin R7) ───────────────────────────────
  // Ids/timestamps are minted HERE at the caller boundary (crypto.randomUUID /
  // Date.now — gameCore stays clock- and randomness-free). Each is a no-op
  // when the reducer's refusal conditions hold; Unit 8's promotion screen only
  // offers eligible ideas, so the refusals are unreachable from the UI.
  /**
   * Promote the idea at `ideaIndex` to THE business (mints the business id).
   * Returns false when the promotion is REFUSED (unknown/id-less idea, Validate
   * incomplete, or a business already active) so the UI can react — e.g. keep
   * a promotion screen open — instead of assuming the dispatch landed; true
   * means the PROMOTE_IDEA action was dispatched with the minted id/timestamp.
   */
  promoteIdea: (ideaIndex: number) => boolean;
  /** Archive the currently active business (record + 4-5 progress preserved;
   *  stamps archiveStateAt = Date.now() for the cross-tab archived union). */
  archiveBusiness: () => void;
  /** Restore an archived business — refused while another business is active.
   *  Stamps archiveStateAt = Date.now() like archiveBusiness. */
  unarchiveBusiness: (businessId: string) => void;

  // ── Public site (real-public-site plan, Unit 4) ─────────────────────────
  // The site slice itself rides `...state` (GameState.site). Every handler
  // below captures the session generation BEFORE its await and discards a
  // stale-generation response without mutating state (the async-writer-
  // generation-token learning: a claim/publish/read that resolves after a
  // logout/login on a shared device must never write the next child's slice).
  /**
   * Re-read the account's site registry state (the split-storage read-back —
   * The120's authenticated self-read). Called by hydrate; the Your Site room
   * calls it on open (Unit 6) so a parent unpublish reaches a playing child
   * with bounded staleness. A failed read adopts `unknown` (neutral render,
   * never a fake handle, never a false "live").
   */
  refreshSiteStatus: () => Promise<void>;
  /**
   * Claim a handle for this account. On success the slice adopts the canonical
   * handle + status; the designed refusals (invalid / taken+suggestions /
   * already-claimed / outage) pass through for the claim UI. A stale-generation
   * response is discarded and answered as outage (never another child's state).
   */
  claimSite: (handle: string) => Promise<ClaimHandleResult>;
  /**
   * The explicit go-live call. SEQUENCING (Key Technical Decision): callers
   * must `await flushNow()` and see "landed" BEFORE calling this, so the
   * server's authoritative content re-sync reads current data; on any other
   * flush outcome show the R19 not-live-yet state instead. On success the
   * slice flips to `published`; a `locked` refusal flips it to `offline`.
   */
  publishSite: () => Promise<PublishSiteResult>;
  /**
   * Force the pending snapshot flush NOW (no 3s debounce wait) and surface the
   * engine's honest outcome — landed / parked / cas-rescheduled — by
   * delegating to the sync engine's flushPending. With no live engine the
   * answer is "parked" (nothing can land). Marks the current snapshot pending
   * synchronously first (see the implementation) so a caller who dispatched in
   * the same task can never be answered a false "landed" via the engine's
   * nothing-pending fast path. Called on headline/one-liner commit and before
   * publish (R11 / "edit→refresh within seconds").
   */
  flushNow: () => Promise<FlushOutcome>;
  /**
   * The live session generation (bumped by every login/logout). Long-running
   * async UI flows (Unit 5's completion publish) capture it BEFORE their first
   * await and compare after: a mismatch means the session ended mid-flight and
   * NO further dispatch may run — the async-writer-generation-token learning
   * applied at the screen layer (a completion that outlives a logout must not
   * resurrect the app stage over the wiped session on a shared device).
   */
  getSessionGen: () => number;

  // Auth / session actions.
  login: (identifier: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;

  /**
   * Submit a "Stuck? Tell us" report for a task. Empty body allowed (a tap is
   * signal). When `band` is omitted it resolves from the session's grade via
   * bandForFeedback — the real band when the grade is known, the honest
   * "unknown" when it is not (never the defaulted display band, which would
   * bias the owner's band analysis).
   */
  submitFeedback: (taskId: string, body: string, band?: FeedbackBand) => Promise<FeedbackSubmitOutcome>;

  // ── Grade / band (Unit 3; R9/R10) ────────────────────────────────────────
  /** The session's grade (roster-derived, adopted at login / ask-once), or null. */
  grade: number | null;
  /** The band task text renders in: resolved from grade, g6_8 while unknown. */
  band: Band;
  /**
   * True once the ask-once card was answered OR skipped THIS session.
   * IN-MEMORY ONLY, on purpose: a skip must not reappear this session but MUST
   * reappear next session while the roster grade is still null (the plan's
   * ask-once semantics), and an ANSWER needs no local marker at all — the next
   * login returns the roster grade, so the `grade === null` gate never fires
   * again. Persisting this flag (draftCache) would wrongly silence the ask
   * forever after a single skip.
   */
  gradeAskDone: boolean;
  /** Skip the ask for this session (default band applies; see gradeAskDone). */
  skipGradeAsk: () => void;
  /**
   * Answer the ask-once birth-year question. Posts the write-back; on success
   * adopts the server's derived grade. On a generic failure it still adopts
   * the CLIENT-derived grade for this session (same school-year arithmetic,
   * band never gates play) and silently retries the write-back exactly ONCE on
   * the next window focus. Makes ONE network attempt per call — the route is
   * rate limited, so any further retry is the caller's explicit choice.
   */
  submitGradeAnswer: (birthYear: number) => Promise<{ ok: boolean }>;
}

const GameContext = createContext<GameApi | null>(null);

/**
 * The stages that own an authenticated session: an engine, a save, and the idle
 * clock. ONLY `app` and `onboard` qualify. The logged-OUT stages — `boot`,
 * `landing`, `login`, and `signup` — must all return false here: a signing-up
 * parent has no engine, no save, and no session yet, so the engine/save/tick
 * effects (the reducer->sync subscription and the idle timeout) must NOT fire
 * during `signup`, exactly as they don't for `landing`/`login`. Exported for
 * direct unit testing of this gate.
 */
export function isLoggedInStage(stage: GameState["stage"]): boolean {
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

  // ── Grade / band plumbing (Unit 3; R9/R10) ────────────────────────────────
  // Ask-once bookkeeping: IN-MEMORY only, reset at every session boundary (see
  // the GameApi.gradeAskDone doc for why it is deliberately not persisted).
  const [gradeAskDone, setGradeAskDone] = useState(false);
  // Session generation for the grade's async writers (the async-writer-
  // generation-token learning): login and logout bump it; any grade write that
  // awaited across a session change discards its result instead of stamping a
  // stale answer onto the next child's session.
  const sessionGenRef = useRef(0);
  // The one-shot silent write-back retry armed by a failed ask-once answer.
  const gradeRetryRef = useRef<{ birthYear: number; gen: number } | null>(null);

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
        onRebasedDoc: (mergedDoc) => {
          // A CAS-rebased save COMMITTED: union the merged doc's monotonic
          // state (completions/businesses/appended ideas) back into live state
          // so this tab converges with the concurrent session instead of
          // split-braining until reload. The engine only invokes this while
          // its session generation is live (stopEngine supersedes it), and
          // UNION_REMOTE marks state only — it never touches the runner,
          // celebrations, or latest-intent fields.
          dispatch({ type: "UNION_REMOTE", doc: mergedDoc });
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

  // ── Public site slice plumbing (Unit 4) ──────────────────────────────────
  // All site handlers capture sessionGenRef BEFORE their await and bail without
  // dispatching when the generation moved (login/logout bump it): a response
  // that raced a session boundary is DISCARDED — never adopted into the next
  // child's slice (async-writer-generation-token learning).
  // Per-call monotonic sequence for refreshSiteStatus (Unit 4 review, P1):
  // the session-generation guard alone cannot order two overlapping reads in
  // ONE session (hydrate's fire-and-forget + a room-open refresh) — resolved
  // out of order, a stale 'none'/'unknown' would overwrite a newer
  // 'published'. Each call takes a sequence number; only the LATEST-started
  // call may dispatch. claimSite/publishSite ALSO bump it when they adopt a
  // newer status (Unit 6 review, P2): a refresh that was in flight when a
  // claim/publish landed carries pre-claim state, and resolving late it would
  // clobber 'claimed'/'published' — the bump makes it unconditionally stale.
  const siteFetchSeqRef = useRef(0);
  // In-flight memo for publish (Unit 6 review, P1): concurrent callers (a
  // room-remount race, onboarding completion beside a room retry) share ONE
  // request/outcome instead of double-POSTing — same shape as the sync
  // engine's flushPending reentrancy guard. Publish is idempotent server-side
  // via first_published_at; this just keeps the client honest too.
  const publishInFlightRef = useRef<Promise<PublishSiteResult> | null>(null);

  const refreshSiteStatus = useCallback(async (): Promise<void> => {
    const gen = sessionGenRef.current;
    const seq = ++siteFetchSeqRef.current;
    // fetchSiteStatus never throws by contract, but this is a fire-and-forget
    // seam (`void refreshSiteStatus()` in hydrate) — belt-and-braces so no
    // build skew can ever turn it into an unhandled rejection.
    const result = await fetchSiteStatus().catch(() => ({ ok: false }) as const);
    if (gen !== sessionGenRef.current) return; // stale session: discard
    if (seq !== siteFetchSeqRef.current) return; // a newer refresh started: drop
    if (result.ok) {
      // The refresh path is the ONE explicit projected writer (object or
      // null); claim/publish omit the field and the reducer preserves.
      dispatch({
        type: "SET_SITE",
        handle: result.handle,
        status: result.status,
        projected: result.projected,
      });
    } else {
      // Failed read (outage/refusal/offline/flag off): the honest `unknown` —
      // neutral render, never a fake handle, never a false "live". Also
      // OVERWRITES a previously-good slice on a room-open refresh failure, so
      // the room can never keep showing "live" on data it could not confirm.
      dispatch({ type: "SET_SITE", handle: null, status: "unknown", projected: null });
    }
  }, []);

  const claimSite = useCallback(async (handle: string): Promise<ClaimHandleResult> => {
    const gen = sessionGenRef.current;
    const result = await claimHandleApi(handle);
    if (gen !== sessionGenRef.current) {
      // Stale session: discard without mutating state, and never leak the
      // prior session's claim outcome into whatever is mounted now — the
      // caller that awaited this is gone; answer the neutral outage shape.
      return { ok: false, reason: "outage" };
    }
    if (result.ok) {
      // Invalidate any in-flight status read (Unit 6 review, P2): it was
      // issued before this claim and would clobber the fresher slice.
      siteFetchSeqRef.current++;
      dispatch({ type: "SET_SITE", handle: result.handle, status: result.status });
    }
    return result;
  }, []);

  const publishSiteNow = useCallback((): Promise<PublishSiteResult> => {
    // Reentrancy memo (Unit 6 review, P1): while a publish is in flight,
    // every caller awaits the SAME promise — one network request, one shared
    // outcome (see publishInFlightRef).
    const inFlight = publishInFlightRef.current;
    if (inFlight) return inFlight;
    const run = (async (): Promise<PublishSiteResult> => {
      const gen = sessionGenRef.current;
      // Capture the handle BEFORE the await (Unit 4 review, P3): a slice
      // rewrite mid-flight (a racing refresh/claim in the Unit 5/6 flows) must
      // not be read back through stateRef after the network round-trip — the
      // dispatch below stamps the handle this publish was issued for.
      const handleAtCall = stateRef.current.site.handle;
      const result = await publishSiteApi();
      if (gen !== sessionGenRef.current) return { ok: false, reason: "outage" };
      if (result.ok) {
        // Invalidate any in-flight status read (Unit 6 review, P2), as in
        // claimSite: a pre-publish refresh must not clobber 'published'.
        siteFetchSeqRef.current++;
        dispatch({ type: "SET_SITE", handle: handleAtCall, status: "published" });
      } else if (result.reason === "locked") {
        // Operator-locked: nothing became visible — the slice reflects offline
        // so no surface can render "live" while locked (R19's never-mislead).
        siteFetchSeqRef.current++;
        dispatch({ type: "SET_SITE", handle: handleAtCall, status: "offline" });
      }
      return result;
    })();
    const memo = run.finally(() => {
      publishInFlightRef.current = null;
    });
    publishInFlightRef.current = memo;
    return memo;
  }, []);

  const flushNow = useCallback(async (): Promise<FlushOutcome> => {
    const engine = engineRef.current;
    // No live engine (logged out / torn down): nothing can land.
    if (!engine) return "parked";
    // Mark the current snapshot pending SYNCHRONOUSLY before flushing (Unit 5
    // review, P1): callers may invoke flushNow in the same task as a dispatch,
    // before the passive [state] subscription effect has notified the engine.
    // Without this, flushOnce's nothing-pending fast path could answer
    // "landed" for content the engine never read. notifySnapshotChange only
    // marks pending + schedules; the flush below reads the doc LIVE via
    // getSnapshot(stateRef), so the extra mark is at worst an idempotent save
    // of unchanged content — never a wrong doc. (stateRef currency across a
    // just-dispatched update remains the caller's job: yield to let React
    // commit first — see Onboarding's completion sequence.)
    engine.notifySnapshotChange();
    // Deliberately NO sessionGenRef guard here: the engine owns its own
    // generation internally (stop() supersedes it, and a superseded flush
    // answers "parked") — a second guard would only shadow that contract.
    return engine.flushPending();
  }, []);

  /** Live session generation for screen-layer async guards (see GameApi doc). */
  const getSessionGen = useCallback((): number => sessionGenRef.current, []);

  /**
   * Shared post-auth hydration: resolve the caller's profile (RLS "own row"),
   * load the save, and route. An empty/new save (no ideas and onboarding not
   * complete) routes to `onboard`; otherwise HYDRATE lets the reducer route
   * onboard/app from `onboardingComplete`. Non-crashing on load failure: fall
   * back to a fresh onboard so a logged-in child is never stranded.
   */
  const hydrateAndRoute = useCallback(
    async (userId: string) => {
      // Site slice read-back (Unit 4; split-storage learning): the registry
      // state is fetched alongside the save load, fire-and-forget — a slow or
      // failed read can neither delay routing nor crash hydrate (failure lands
      // as `unknown`), and the generation guard inside discards a response
      // that outlives this session.
      void refreshSiteStatus();
      // Profile restore (the roster patch is otherwise login-only, so a page
      // reload with a RESTORED session used to degrade the founder chip and
      // avatar label to "Founder"): re-adopt the account-scoped cache written
      // at login. fp:-prefixed, so a different child's login wipes it; a
      // roster rename stays stale only until that child's next real login.
      const cachedProfile = getDraft<{ firstName?: unknown; handle?: unknown; grade?: unknown }>(
        userId,
        PROFILE_CACHE_DRAFT,
      );
      if (cachedProfile && typeof cachedProfile === "object") {
        const firstName = typeof cachedProfile.firstName === "string" ? cachedProfile.firstName : "";
        const handle = typeof cachedProfile.handle === "string" ? cachedProfile.handle : "";
        const grade = typeof cachedProfile.grade === "number" ? cachedProfile.grade : null;
        if (firstName || handle) {
          dispatch({ type: "SET_PROFILE", patch: { firstName, handle, grade } });
        }
      }
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
        // fp_ledger so Sales/net totals + LedgerList survive a reload/re-login.
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
    [startEngine, refreshSiteStatus],
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
          // Forward the per-sale fee snapshot so persistence writes the fee
          // columns (sync.ts insertLedger). Undefined until Unit 3/5 wire the
          // reducer's fee modeling; insertLedger defaults a missing value.
          grossCents: row.grossCents,
          feeCents: row.feeCents,
          netCents: row.netCents,
          providerId: row.providerId,
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
      // New session boundary: invalidate any in-flight grade writer, disarm the
      // one-shot write-back retry, and re-arm the ask-once card.
      sessionGenRef.current += 1;
      gradeRetryRef.current = null;
      setGradeAskDone(false);
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
            // Best-effort keepalive flush of the PRIOR child's queued outbox
            // (unsent stuck reports / sales) BEFORE the wipe destroys it. Its
            // storage reads are synchronous (complete before wipeAllFpKeys
            // below); the network part is fire-and-forget and never blocks or
            // fails this login. This narrows — but cannot eliminate — the
            // cross-child loss window: an offline switch or an unusable token
            // still loses the queue; that residual is accepted (documented on
            // flushOutboxForPriorUser).
            void flushOutboxForPriorUser(last);
            wipeAllFpKeys();
          }
          setLastUserId(userId);
        }

        const profile: ChildProfile = result.profile;
        dispatch({
          type: "SET_PROFILE",
          // Adopt the roster's read-time grade alongside the profile (Unit 3;
          // R9): a number means the band resolves immediately and the ask-once
          // card never shows; null arms the ask.
          patch: { firstName: profile.firstName, handle: profile.handle, grade: result.grade ?? null },
        });
        // Cache the roster patch (account-scoped, fp:-prefixed) so a RESTORED
        // session's hydrate can re-adopt it — without this, a page reload
        // degrades the founder chip/avatar label to "Founder".
        if (userId) {
          setDraft(userId, PROFILE_CACHE_DRAFT, {
            firstName: profile.firstName,
            handle: profile.handle,
            grade: result.grade ?? null,
          });
        }

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
      // Session boundary: invalidate in-flight grade writers, disarm the
      // one-shot retry, and reset the ask-once flag (in-memory-state-survives-
      // logout learning — grade/ask state must never outlive the session).
      sessionGenRef.current += 1;
      gradeRetryRef.current = null;
      setGradeAskDone(false);
      await authLogout(scope);
      if (scope === "explicit" && userId) {
        // Explicit logout purges this user's drafts + outbox. Idle logout does
        // NOT — origin R6 keeps the same user's Step Runner input for re-login.
        wipeAllForUser(userId);
      }
      // Clear resident ideas/ledger/UI on BOTH scopes so a shared device never
      // carries one child's business/financial state past logout.
      dispatch({ type: "RESET_SESSION" });
      dispatch({
        type: "SET_PROFILE",
        patch: { firstName: "", handle: "", siteHeadline: "", grade: null },
      });
      dispatch({ type: "SET_STAGE", stage: scope === "explicit" ? "landing" : "login" });
    },
    [stopEngine],
  );

  const logout = useCallback(async () => {
    await runLogout("explicit");
  }, [runLogout]);

  // ── Ask-once grade answer (Unit 3; R9/R10) ────────────────────────────────
  const skipGradeAsk = useCallback(() => {
    // Skip = the display default band for this session. In-memory flag only:
    // the ask reappears next session while the roster grade stays null.
    setGradeAskDone(true);
  }, []);

  const submitGradeAnswer = useCallback(async (birthYear: number): Promise<{ ok: boolean }> => {
    // Capture the session generation BEFORE the await (async-writer learning):
    // if login/logout changes the session while the write is in flight, the
    // result is discarded — never adopted into another child's session.
    const gen = sessionGenRef.current;
    const result = await submitBirthYear(birthYear);
    if (gen !== sessionGenRef.current) return { ok: false };

    setGradeAskDone(true);
    if (result.ok) {
      dispatch({ type: "SET_PROFILE", patch: { grade: result.grade } });
      return { ok: true };
    }
    // Generic failure (offline, rate limited, expired token): apply the band
    // LOCALLY for this session from the same school-year arithmetic the server
    // uses — the kid's experience never depends on the write landing — and arm
    // ONE silent write-back retry for the next window focus. No retry loops:
    // the route is rate limited (5 per 15 min per user).
    dispatch({ type: "SET_PROFILE", patch: { grade: gradeFromBirthYear(birthYear, new Date()) } });
    gradeRetryRef.current = { birthYear, gen };
    return { ok: false };
  }, []);

  // The one-shot silent write-back retry: on the next return to a visible /
  // focused window, re-post a failed ask-once answer exactly once. The pending
  // entry is consumed BEFORE the attempt (never re-armed → never a retry
  // storm against the rate limiter), and both the attempt and the adoption are
  // generation-guarded so a logout/login in between discards it.
  useEffect(() => {
    const retry = () => {
      const pending = gradeRetryRef.current;
      if (!pending) return;
      gradeRetryRef.current = null; // consumed: this retry happens ONCE
      if (pending.gen !== sessionGenRef.current) return;
      void submitBirthYear(pending.birthYear).then((result) => {
        if (result.ok && pending.gen === sessionGenRef.current) {
          dispatch({ type: "SET_PROFILE", patch: { grade: result.grade } });
        }
        // A second failure is accepted silently: the local band already
        // applies, and the roster ask simply reappears next session.
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // ── "Stuck? Tell us" feedback submission ─────────────────────────────────
  // Date.now()/crypto.randomUUID stay at this caller boundary (gameCore and
  // sync stay clock-free). The row is validated against the client-side CHECK
  // mirrors before enqueue; the local daily counter mirrors the DB's 50/day cap
  // so the trigger's terminal refusal is unreachable in normal use.
  const submitFeedback = useCallback(
    async (
      taskId: string,
      body: string,
      band?: FeedbackBand,
    ): Promise<FeedbackSubmitOutcome> => {
      // Band seam (Unit 3): when the caller does not pass one, stamp the
      // session's resolved band — bandForFeedback answers the real band when
      // the grade is known and the honest "unknown" when it is not (NEVER the
      // defaulted display band; that would bias the owner's band analysis).
      const stampedBand: FeedbackBand = band ?? bandForFeedback(stateRef.current.profile.grade);
      const userId = getLastUserId();
      if (!userId) return "dropped";
      // UTC day via the shared derivation (mirrors the DB trigger's date_trunc).
      const day = utcDayToday();
      if (feedbackCountForDay(userId, day) >= FEEDBACK_DAILY_CAP) return "capped";
      const row = {
        id: crypto.randomUUID(),
        taskId,
        band: stampedBand,
        body: body.slice(0, FEEDBACK_BODY_MAX),
      };
      // Validate BEFORE the day-counter bump so a row that would be refused at
      // enqueue (bad task id / band through the seam) never consumes any of the
      // day budget. The counter bump then happens only after the row is
      // accepted for enqueue, BEFORE the network attempt — the counter is a
      // best-effort local mirror; the DB trigger stays authoritative.
      if (!isValidFeedbackRow(row)) return "dropped";
      const engine = engineRef.current;
      if (engine) {
        bumpFeedbackCountForDay(userId, day);
        // The engine resolves the honest outcome, including the server's FP429
        // 'capped' (which also re-pins the local counter to the cap).
        return engine.notifyFeedback(row);
      }
      // No live engine (should not happen while the runner is open): enqueue
      // durably; the next session's replay drains it. Honest copy: queued. A
      // refused outbox write (storage quota) is 'dropped' and does NOT bump.
      if (!enqueueFeedback(userId, row)) return "dropped";
      bumpFeedbackCountForDay(userId, day);
      return "queued";
    },
    [],
  );

  // ── Business promotion (Unit 7) ───────────────────────────────────────────
  // The id/timestamp minting boundary (crypto.randomUUID / Date.now stay out
  // of gameCore). Reads go through stateRef so the callbacks stay stable.
  const promoteIdea = useCallback((ideaIndex: number): boolean => {
    // Mirror the reducer's refusal conditions against live state so the caller
    // gets an honest boolean (dispatch itself has no return channel). A false
    // is a guaranteed no-op; a true dispatches with a freshly minted UUID —
    // duplicate-businessId refusal is unreachable for a fresh random id.
    const s = stateRef.current;
    // Legacy in-memory ideas without an id cannot be promoted this session;
    // the next load mints their deterministic id (see gameCore fromSaveDoc).
    const ideaId = s.ideas[ideaIndex]?.id;
    if (!ideaId) return false;
    if (!isPhaseCompleteFn(s, ideaIndex, "validate")) return false;
    if (activeBusinessFn(s)) return false;
    dispatch({
      type: "PROMOTE_IDEA",
      ideaId,
      businessId: crypto.randomUUID(),
      at: Date.now(),
    });
    return true;
  }, []);

  const archiveBusiness = useCallback(() => {
    const active = activeBusinessFn(stateRef.current);
    if (!active) return;
    dispatch({ type: "ARCHIVE_BUSINESS", businessId: active.id, at: Date.now() });
  }, []);

  const unarchiveBusiness = useCallback((businessId: string) => {
    dispatch({ type: "UNARCHIVE_BUSINESS", businessId, at: Date.now() });
  }, []);

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
      isStepUnlocked: (ideaIndex, stepId) => isStepUnlockedFn(state, ideaIndex, stepId),
      ideasEligibleFor: (stepId) => ideasEnterableForFn(state, stepId),
      grossSalesSumCents: () => grossSalesSumCentsFn(state),
      salesSumCents: () => salesSumCentsFn(state),
      promoteIdea,
      archiveBusiness,
      unarchiveBusiness,
      refreshSiteStatus,
      claimSite,
      publishSite: publishSiteNow,
      flushNow,
      getSessionGen,
      login,
      logout,
      submitFeedback,
      grade: state.profile.grade,
      band: displayBand(state.profile.grade),
      gradeAskDone,
      skipGradeAsk,
      submitGradeAnswer,
    }),
    [
      state,
      syncStatus,
      promoteIdea,
      archiveBusiness,
      unarchiveBusiness,
      refreshSiteStatus,
      claimSite,
      publishSiteNow,
      flushNow,
      getSessionGen,
      login,
      logout,
      submitFeedback,
      gradeAskDone,
      skipGradeAsk,
      submitGradeAnswer,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameApi {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside GameProvider");
  return ctx;
}
