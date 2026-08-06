/**
 * StaffWatchtower — the flow board (plan Unit 5).
 *
 * A bird's-eye QUEUE view over the curriculum, one step at a time: per unit
 * task, how many ideas got THROUGH it, how long that took for the ones that did,
 * and how many are SITTING on it right now (split into active and stalled). All
 * of the math lives in flowBoard.ts; this file is selectors, view-states, one
 * table and one drill-down.
 *
 * ── The hard boundary: no individual child on the main page ──
 * Owner's rule, not a preference. The table is fed `anonymousUnits(cohort)` —
 * a real projection that drops the usernames, so no name is even in scope where
 * the aggregate renders. The NAMED array is read by exactly one call, `drillDown`,
 * and only after a staff member opens an active or stalled count. Usernames are
 * in the payload from the first load, so this is a RENDERING discipline: the test
 * asserts they are absent from the DOM, not merely invisible.
 *
 * ── ABSENCE IS A NUMBER, never a filter ──
 * `flowBoard.ts` states the rule for the cohort it normalizes: "a child who
 * contributes no flow units is COUNTED, never merely absent. An absent child is
 * indistinguishable from a child who has not started, which makes erasure —
 * accidental or deliberate — free." THIS FILE'S NARROWING OBEYS THE SAME RULE.
 * Every child, idea and business the wire narrowing rejects is COUNTED and
 * rendered as a caveat; a payload whose children are ALL unreadable is a load
 * ERROR, not an empty cohort. A silent element-level drop is the worst failure
 * available here, because every number stays internally consistent while being a
 * fraction of the truth. For the same reason `childCount === 0` gets its own
 * state: "the endpoint sent no children" is not "nobody has started".
 *
 * ── ONE CLOCK ──
 * `computeFlowRows`, `computeFlowTotals` and `drillDown` each re-run the
 * placement walk, so they must be told the same instant or the table and the
 * drill-down can disagree across the 30-day boundary. This screen uses the
 * FETCH instant (`shown.fetchedAt`) as that one clock rather than a fresh
 * `Date.now()` per render: it is a single value for every consumer, it is stable
 * across re-renders (so opening a drill-down an hour later cannot contradict the
 * table it opened from), and it is exactly the instant the "Last updated" line
 * already tells the reader the board is from.
 *
 * ── The rendered payload is CHOSEN BY IDENTITY, not by an effect ──
 * A criterion change re-renders the heading and the window immediately, but a
 * passive effect runs only after commit — so an entry with no criterion identity
 * gave one committed frame of the NEW step's caption over the OLD step's numbers.
 * It looks plausible rather than broken (the previous step's units are not gated
 * out of the next one), and `act()` hides it from every test. So `CohortEntry`
 * carries its `criterionId` and the render picks the entry that MATCHES the
 * current selection; anything else is "no data yet".
 *
 * ── The request path is the first DYNAMIC one on this page ──
 * Every other caller of `request` passes a constant. This one interpolates
 * content-derived ids, so each id is `encodeURIComponent`-ed before it joins the
 * query string: a criterion id that ever carried a `&` or a `#` would otherwise
 * alter the request that goes out under the staff Bearer token.
 *
 * ── Guard rail on the selection ──
 * `criterionWindow` THROWS on an unknown criterion or a phase mismatch (a loud
 * failure beats a silently empty board). The selected criterion is shell state
 * and could in future be restored or URL-sourced, so it is narrowed to a real
 * criterion of a real phase HERE, before it can reach that function.
 * KNOWN GAP (recorded, out of scope for this unit): there is NO ErrorBoundary
 * anywhere in `src`, and `criterionWindow` is called from a render-phase
 * `useMemo` — so a content state it rejects (a criterion with zero tasks) would
 * white-screen the whole SPA rather than this tab. The narrowing above makes
 * that unreachable from a selection; it is not a substitute for a boundary.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PHASES, parseTask, stepById, type PhaseId } from "../../data/path";
import { taskIdAt } from "../../data/taskRemap";
import {
  CRITERION_SEQUENCE,
  MAX_IDEAS,
  criterionIdsForPhase,
  phaseOfCriterion,
} from "../../state/gameCore";
import { STAFF_COPY } from "./staffCopy";
import { STAFF_PANEL_TITLE_ID, type StaffTabProps } from "./staffTypes";
import { watchtowerCacheKey } from "./watchtowerCache";
import {
  anonymousUnits,
  computeFlowRows,
  computeFlowTotals,
  criterionWindow,
  drillDown,
  normalizeCohort,
  requestedTaskIds,
  type FlowBucket,
  type FlowRow,
  type NormalizedCohort,
  type WireBusiness,
  type WireChild,
  type WireIdea,
  type WireProgressResponse,
} from "./flowBoard";

const PROGRESS_PATH = "/api/fp/progress";

/** Referenced by `aria-describedby` from the median column header and the table
 *  itself, so the caveat and the warning are attached to what they qualify. */
const MEDIAN_NOTE_ID = "fp-watchtower-median-note";
const MONOTONIC_ALERT_ID = "fp-watchtower-monotonic";
/** One roster is open at a time, so one id is enough for `aria-controls`. */
const ROSTER_ID = "fp-watchtower-roster-panel";

/**
 * Unit 3's focus indicator, reused verbatim. `/60`, not `/30` — a second,
 * fainter indicator on the same page is both a divergence and the worse of the
 * two (computed 1.43:1 against this background versus 2.12:1). Neither clears
 * the 3:1 non-text minimum; that shortfall is pre-existing and shared with the
 * shell, and closing it is a change to the shell's token, not to this tab.
 */
const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-build/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(38_46%_95%)]";
/** Unfilled controls sit ON the page background, so an offset ring reads as a
 *  detached halo; they take the same ring without the offset. */
const focusRingFlat = "focus:outline-none focus-visible:ring-2 focus-visible:ring-build/60";

/* ------------------------------------------------------- defensive narrowing */

/**
 * The payload arrives from another repo and another deploy. `normalizeCohort`
 * trusts its argument's SHAPE (it iterates `ideas`, reads `idea.index`), so the
 * shape is proven here first.
 *
 * Rejections are COUNTED, never silently filtered — see the header. `null` means
 * the payload as a whole is unusable — a malformed root, or children present and
 * every one of them rejected BY THIS SHAPE NARROWING — and the tab shows its
 * retryable load error.
 *
 * Note what that is NOT: a child whose SAVE the server could not read
 * (`docUnreadable`) narrows perfectly well and is counted, so a cohort of those
 * returns a payload, not null. That state gets its own alert at the render (see
 * `allUnreadable`) — an earlier version of this comment claimed null covered it,
 * which is how "every child unreadable" ended up with no loud state at all.
 */
interface NarrowedPayload {
  response: WireProgressResponse;
  rejectedChildren: number;
  rejectedIdeas: number;
  rejectedBusinesses: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Prototype-polluting keys are dropped rather than carried into a map the
 *  migration helper will iterate. The server strips them too; a client that
 *  relies on that is a client that breaks when the server changes. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function boolMap(value: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!isObject(value)) return out;
  for (const [key, entry] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key) || entry !== true) continue;
    out[key] = true;
  }
  return out;
}

function numberMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObject(value)) return out;
  for (const [key, entry] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) continue;
    if (typeof entry === "number" && Number.isFinite(entry)) out[key] = entry;
  }
  return out;
}

function optionalStamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * An idea WITHOUT a usable `index` is REJECTED, not renumbered.
 *
 * Substituting the array position would be fail-open in two ways that both
 * produce wrong numbers with no symptom:
 *  - `normalizeCohort` detects server-skipped ideas as `max(index) + 1 >
 *    ideas.length`. Renumbering makes that comparison permanently false, so if
 *    the120 ever stops emitting `index`, `childrenWithSkippedIdeas` reads 0
 *    forever and the skip caveat quietly dies.
 *  - For an id-less idea, `normalizeCohort` mints `legacy-idea-${index}` from
 *    that number. A fabricated index breaks the link a Business record's
 *    `ideaId` names, so the business stops folding, becomes its own flow unit,
 *    and inflates both `liveUnits` and a WIP count.
 * Rejecting keeps the index gap intact — which is exactly the evidence the skip
 * detector reads — and adds our own counted caveat on top.
 */
function narrowIdea(value: unknown): WireIdea | null {
  if (!isObject(value)) return null;
  const index = value.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) return null;
  return {
    index,
    id: typeof value.id === "string" ? value.id : null,
    done: boolMap(value.done),
    doneAt: numberMap(value.doneAt),
    doneByTask: boolMap(value.doneByTask),
    doneAtByTask: numberMap(value.doneAtByTask),
    lastCompletionAt: optionalStamp(value.lastCompletionAt),
    // Absent on a server that predates the field: `optionalStamp` yields null,
    // and `isRecencyCorroborated` falls back to its stricter in-window test.
    lastCorroboratedCompletionAt: optionalStamp(value.lastCorroboratedCompletionAt),
    recencyClamped: value.recencyClamped === true,
    hasCompletionsOutsideRequest: value.hasCompletionsOutsideRequest === true,
  };
}

function narrowBusiness(value: unknown): WireBusiness | null {
  if (!isObject(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    ideaId: typeof value.ideaId === "string" ? value.ideaId : null,
    archived: value.archived === true,
    doneByTask: boolMap(value.doneByTask),
    doneAtByTask: numberMap(value.doneAtByTask),
    lastCompletionAt: optionalStamp(value.lastCompletionAt),
    lastCorroboratedCompletionAt: optionalStamp(value.lastCorroboratedCompletionAt),
    recencyClamped: value.recencyClamped === true,
    hasCompletionsOutsideRequest: value.hasCompletionsOutsideRequest === true,
  };
}

interface NarrowedChild {
  child: WireChild;
  rejectedIdeas: number;
  rejectedBusinesses: number;
}

function narrowChild(value: unknown): NarrowedChild | null {
  if (!isObject(value) || typeof value.username !== "string") return null;
  const rawIdeas = Array.isArray(value.ideas) ? value.ideas : [];
  const rawBusinesses = Array.isArray(value.businesses) ? value.businesses : [];
  const ideas = rawIdeas.map(narrowIdea).filter((idea): idea is WireIdea => idea !== null);
  const businesses = rawBusinesses
    .map(narrowBusiness)
    .filter((business): business is WireBusiness => business !== null);
  return {
    child: {
      username: value.username,
      truncated: value.truncated === true,
      docUnreadable: value.docUnreadable === true,
      ideas,
      businesses,
    },
    rejectedIdeas: rawIdeas.length - ideas.length,
    rejectedBusinesses: rawBusinesses.length - businesses.length,
  };
}

/**
 * @internal Exported as a TEST SEAM for the cross-repo fixture
 * (`__tests__/wireFixture.test.ts`), which feeds it a body produced by the120's
 * real `shapeProgress`. Nothing else outside this file may call it.
 */
export function narrowProgress(data: unknown): NarrowedPayload | null {
  if (!isObject(data) || !Array.isArray(data.children)) return null;
  const children: WireChild[] = [];
  let rejectedChildren = 0;
  let rejectedIdeas = 0;
  let rejectedBusinesses = 0;
  for (const raw of data.children) {
    const narrowed = narrowChild(raw);
    if (!narrowed) {
      rejectedChildren++;
      continue;
    }
    children.push(narrowed.child);
    rejectedIdeas += narrowed.rejectedIdeas;
    rejectedBusinesses += narrowed.rejectedBusinesses;
  }
  // Children were sent and NONE survived: that is a contract break, not a
  // cohort. Rendering zeros here would report a healthy quiet cohort.
  if (data.children.length > 0 && children.length === 0) return null;
  return { response: { children }, rejectedChildren, rejectedIdeas, rejectedBusinesses };
}

/* ------------------------------------------------------------- formatting */

/**
 * Durations, COARSELY. The stamps behind them come from a child's own device
 * clock, so a figure to the minute would assert a precision the data does not
 * have. Every string comes from `STAFF_COPY`.
 */
function formatDuration(ms: number): string {
  const hours = ms / 3600e3;
  if (hours < 1) return STAFF_COPY.watchtowerDurationUnderHour;
  if (hours < 48) return `${Math.round(hours)}${STAFF_COPY.watchtowerDurationHourSuffix}`;
  return `${Math.round(hours / 24)}${STAFF_COPY.watchtowerDurationDaySuffix}`;
}

function formatStamp(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------- view state */

/**
 * One criterion's board. `criterionId` is part of the VALUE, not just the cache
 * key, so the render can prove the payload belongs to the selection it is about
 * to draw a heading for.
 */
interface CohortEntry {
  criterionId: string;
  cohort: NormalizedCohort;
  fetchedAt: number;
  rejectedChildren: number;
  rejectedIdeas: number;
  rejectedBusinesses: number;
}

/** Which kind of request is in flight / which kind last failed. One state each,
 *  cleared on EVERY terminal branch — a spinner that cannot stop is worse than
 *  no spinner, because it also disables the only control that could fix it. */
type RequestKind = "first" | "refresh";

interface DrillTarget {
  taskId: string;
  bucket: FlowBucket;
}

const drillKey = (taskId: string, bucket: FlowBucket): string => `${taskId}:${bucket}`;

/** The panel's h2 — rendered in EVERY view-state, so the region the shell
 *  focuses on a tab switch is named whether it is loading, failed or full. */
function PanelHeading() {
  return (
    <h2 id={STAFF_PANEL_TITLE_ID} className="text-lg font-bold text-[hsl(25_34%_20%)]">
      {STAFF_COPY.watchtowerTitle}
    </h2>
  );
}

/** A number a screen reader should read as a number, with the em dash's hidden
 *  word for the cells that have no number to give. */
function NotMeasurable() {
  // `relative` is LOAD-BEARING, not decoration. `sr-only` is
  // `position: absolute`, and with no positioned ancestor its containing block
  // is the initial one — so it escapes the table's `overflow-x` clip and lands
  // at its static position in DOCUMENT coordinates, which is ~390px into a table
  // that is 640px wide. Measured at 320px: it pushed
  // `documentElement.scrollWidth` to 390 and scrolled the PAGE sideways, from a
  // 1px visually-hidden span. This wrapper gives it a containing block INSIDE
  // the scroller, where it is clipped like everything else.
  return (
    <span className="relative">
      <span aria-hidden="true">{STAFF_COPY.watchtowerNotMeasurable}</span>
      <span className="sr-only">{STAFF_COPY.watchtowerNotMeasurableSr}</span>
    </span>
  );
}

export function StaffWatchtower({ request, cache, criterionId, onCriterionChange }: StaffTabProps) {
  // ── Narrow the selection BEFORE it can reach criterionWindow (which throws).
  const phaseId: PhaseId = phaseOfCriterion(criterionId) ?? PHASES[0].id;
  const criteriaForPhase = criterionIdsForPhase(phaseId);
  const criterion = criteriaForPhase.includes(criterionId)
    ? criterionId
    : (criteriaForPhase[0] ?? CRITERION_SEQUENCE[0]);

  /** A re-render token AND the last entry this tab committed. The RENDER reads
   *  the cache (below); this exists so a successful write repaints. */
  const [entry, setEntry] = useState<CohortEntry | null>(null);
  const [pending, setPending] = useState<RequestKind | null>(null);
  const [failure, setFailure] = useState<RequestKind | null>(null);
  const [drill, setDrill] = useState<DrillTarget | null>(null);

  const inFlight = useRef<AbortController | null>(null);
  /** Which criterion this mount has already asked for. React 18's StrictMode
   *  double-invokes effects; this is what makes that ONE request. */
  const askedFor = useRef<string | null>(null);
  const drillTriggers = useRef(new Map<string, HTMLButtonElement | null>());
  const drillPanel = useRef<HTMLDivElement | null>(null);
  const drillJustOpened = useRef(false);

  const runFetch = useCallback(
    async (phase: PhaseId, target: string, kind: RequestKind) => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setPending(kind);
      setFailure(null);
      const key = watchtowerCacheKey(target);
      const ticket = cache.begin(key);
      // Every id encoded; the commas that separate them are ours, not theirs.
      const ids = requestedTaskIds(phase, target).map(encodeURIComponent).join(",");
      const result = await request(`${PROGRESS_PATH}?tasks=${ids}`, { signal: controller.signal });
      // A newer request owns `pending` now — this one must touch NOTHING.
      if (controller.signal.aborted) return;
      // Past here every path is terminal for this request, so the spinner stops
      // exactly once, before any branching can forget to.
      setPending(null);
      // `unauthorized` is terminal and already judged by the shell; `aborted`
      // means someone else's decision. Neither is this tab's error to show.
      if (result.kind === "unauthorized" || result.kind === "aborted") return;
      const narrowed = result.kind === "json" ? narrowProgress(result.data) : null;
      if (narrowed === null) {
        setFailure(kind);
        return;
      }
      const fetchedAt = Date.now();
      const next: CohortEntry = {
        criterionId: target,
        cohort: normalizeCohort(narrowed.response, fetchedAt),
        fetchedAt,
        rejectedChildren: narrowed.rejectedChildren,
        rejectedIdeas: narrowed.rejectedIdeas,
        rejectedBusinesses: narrowed.rejectedBusinesses,
      };
      // A refused write means this response was superseded or its session ended
      // (R12). It must not be rendered EITHER — that payload carries usernames,
      // and the cache is what the shell clears on sign-out.
      if (!cache.write(ticket, next)) return;
      setEntry(next);
    },
    [cache, request],
  );

  // One effect owns "does the selected criterion need fetching". What is SHOWN
  // is derived during render instead, so no committed frame can pair this
  // step's heading with the last step's numbers.
  useEffect(() => {
    setDrill(null); // an open roster must never survive a criterion change
    const previous = askedFor.current;
    if (previous !== null && previous !== criterion) {
      // A genuine criterion change: whatever is in flight is for the old one.
      inFlight.current?.abort();
      inFlight.current = null;
      setPending(null);
      setFailure(null);
    }
    // RECORD THE ASK BEFORE THE CACHE-HIT RETURN. `askedFor` answers "has this
    // mount already dealt with this criterion?", and a cache hit deals with it
    // just as completely as a fetch does. Returning early without stamping it
    // left the ref naming a criterion whose request had been ABORTED, and the
    // `previous === criterion` guard below then read that as StrictMode's second
    // invocation: cached 1.1 → 1.2 (fetch starts) → 1.1 mid-flight (aborts it,
    // cache hit, ref still "1.2") → 1.2 again (guard returns, no fetch). The
    // entry is 1.1's, the cache has no 1.2, so nothing renders — a permanent
    // "Loading…" with no error and no Retry, recoverable only by Refresh or a
    // remount. The guard must mean "we asked and that ask is still live", and
    // stamping every criterion this effect handles is what makes it mean that.
    askedFor.current = criterion;
    if (cache.read<CohortEntry>(watchtowerCacheKey(criterion)) !== undefined) return;
    if (previous === criterion) return; // StrictMode's second invocation
    void runFetch(phaseId, criterion, "first");
  }, [cache, criterion, phaseId, runFetch]);

  const refresh = useCallback(() => {
    // `clear` first: a manual refresh cannot overwrite with a value it has not
    // fetched yet, so the stale entry must go before the request starts.
    cache.clear(watchtowerCacheKey(criterion));
    setDrill(null);
    void runFetch(phaseId, criterion, "refresh");
  }, [cache, criterion, phaseId, runFetch]);

  const retry = useCallback(() => {
    askedFor.current = criterion;
    void runFetch(phaseId, criterion, "first");
  }, [criterion, phaseId, runFetch]);

  // Focus moves INTO an opened roster so the disclosure is operable and
  // announced without a mouse.
  useEffect(() => {
    if (!drillJustOpened.current) return;
    drillJustOpened.current = false;
    // preventScroll: the panel lives inside the table's horizontal scroller, and
    // the default scroll-into-view yanks that scroller sideways — at 390px it
    // dragged the whole table off its first two columns. The panel is pinned to
    // the visible edge (see the sticky wrapper below), so it needs no scrolling.
    drillPanel.current?.focus({ preventScroll: true });
  });

  /**
   * Close a roster and put focus somewhere deliberate.
   *
   * Only when focus is INSIDE the panel does it need moving — a click on a
   * criterion chip or Refresh has already moved it, and yanking it back would be
   * the bug rather than the fix. When it does need moving, the trigger is the
   * honest destination; if the trigger is gone (its row no longer exists) the
   * panel heading region is, so `<body>` is never the answer.
   */
  const closeDrill = useCallback((target: DrillTarget | null) => {
    const panel = drillPanel.current;
    const focusWasInside = panel !== null && panel.contains(document.activeElement);
    setDrill(null);
    if (!focusWasInside) return;
    const trigger = target ? drillTriggers.current.get(drillKey(target.taskId, target.bucket)) : null;
    if (trigger && trigger.isConnected) {
      trigger.focus();
      return;
    }
    document.querySelector<HTMLElement>('[data-testid="fp-staff-panel"]')?.focus();
  }, []);

  const window_ = useMemo(() => criterionWindow(phaseId, criterion), [phaseId, criterion]);
  const step = stepById(criterion);
  const taskLabels = useMemo(() => {
    const labels = new Map<string, string>();
    const tasks = step?.tasks ?? [];
    for (let index = 0; index < tasks.length; index++) {
      const id = taskIdAt(criterion, index);
      if (id) labels.set(id, parseTask(tasks[index]).label);
    }
    return labels;
  }, [criterion, step]);

  // ── What is SHOWN: the entry that BELONGS to this criterion, or nothing.
  // `entry` is preferred over the cache so a manual refresh (which CLEARS the
  // cache before it fetches) keeps the stale table on screen, and a REFUSED
  // cache write leaves the previous board standing rather than rendering a
  // payload the session no longer owns.
  const cached = cache.read<CohortEntry>(watchtowerCacheKey(criterion));
  const shown =
    entry && entry.criterionId === criterion
      ? entry
      : cached && cached.criterionId === criterion
        ? cached
        : null;

  // THE ONE CLOCK — see the header. Every walk below is told this same instant.
  const nowMs = shown?.fetchedAt ?? 0;
  const units = useMemo(() => (shown ? anonymousUnits(shown.cohort) : []), [shown]);
  const rows = useMemo(
    () => (shown ? computeFlowRows(units, window_, nowMs) : []),
    [shown, units, window_, nowMs],
  );
  const totals = useMemo(
    () => (shown ? computeFlowTotals(units, window_, nowMs) : null),
    [shown, units, window_, nowMs],
  );
  // The named array is read HERE and nowhere else on this screen.
  const roster = useMemo(
    () =>
      shown && drill ? drillDown(shown.cohort.units, window_, drill.taskId, drill.bucket, nowMs) : [],
    [shown, drill, window_, nowMs],
  );

  const stepTitle = step?.title ?? "";

  const selectors = (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-xs font-bold uppercase tracking-wide text-ink/60">
          {STAFF_COPY.watchtowerPhaseLabel}
        </span>
        {PHASES.map((phase) => {
          const isActive = phase.id === phaseId;
          return (
            <button
              key={phase.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                const first = criterionIdsForPhase(phase.id)[0];
                if (first) onCriterionChange(first);
              }}
              className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-3 font-display text-sm font-bold ${
                isActive
                  ? `bg-build text-white shadow-[0_3px_0_hsl(217_74%_36%)] ${focusRing}`
                  : `border-2 border-[hsl(25_34%_20%/0.2)] text-[hsl(25_34%_20%)] ${focusRingFlat}`
              }`}
            >
              {phase.name}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-xs font-bold uppercase tracking-wide text-ink/60">
          {STAFF_COPY.watchtowerCriterionLabel}
        </span>
        {criteriaForPhase.map((id) => {
          const isActive = id === criterion;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isActive}
              aria-label={`${STAFF_COPY.watchtowerCriterionLabel} ${id} — ${stepById(id)?.title ?? ""}`}
              onClick={() => onCriterionChange(id)}
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl px-3 font-mono text-sm font-bold ${
                isActive
                  ? `bg-build text-white shadow-[0_3px_0_hsl(217_74%_36%)] ${focusRing}`
                  : `border-2 border-[hsl(25_34%_20%/0.2)] text-[hsl(25_34%_20%)] ${focusRingFlat}`
              }`}
            >
              {id}
            </button>
          );
        })}
      </div>
      {/* The selected step's TITLE, outside the table — the empty and error
          states have no caption to carry it, and "1.3" alone names nothing. */}
      <p data-testid="fp-watchtower-step-title" className="text-sm text-ink/70">
        <span className="font-mono">{criterion}</span> — {stepTitle}
      </p>
    </div>
  );

  const header = (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <PanelHeading />
        <div className="flex flex-wrap items-center gap-2">
          {shown ? (
            <span className="text-xs text-ink/60">
              {STAFF_COPY.watchtowerLastUpdated} {formatStamp(shown.fetchedAt)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={refresh}
            disabled={pending !== null}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.2)] px-4 text-sm font-bold text-[hsl(25_34%_20%)] disabled:opacity-60 ${focusRingFlat}`}
          >
            {pending === "refresh" ? STAFF_COPY.watchtowerRefreshing : STAFF_COPY.watchtowerRefresh}
          </button>
        </div>
      </div>
      {selectors}
    </>
  );

  if (!shown) {
    // A first load that FAILED is the only error state with nothing to fall back
    // on; anything else with no data yet is simply loading.
    if (failure !== null && pending === null) {
      return (
        <>
          {header}
          <p role="alert" className="mt-4 text-sm font-semibold text-wax">
            {STAFF_COPY.watchtowerLoadFailed}
          </p>
          <button
            type="button"
            onClick={retry}
            className={`mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.2)] px-5 text-sm font-bold text-[hsl(25_34%_20%)] ${focusRingFlat}`}
          >
            {STAFF_COPY.retry}
          </button>
        </>
      );
    }
    return (
      <>
        {header}
        <p role="status" className="mt-4 text-sm text-ink/60">
          {STAFF_COPY.watchtowerLoading}
        </p>
      </>
    );
  }

  const cohort = shown.cohort;
  // "label: N", never "N children …" — the count trails the phrase so one child
  // and seven children read equally well with no pluralisation rule.
  const caveats = (
    [
      [STAFF_COPY.watchtowerCaveatUnreadable, cohort.unreadableChildren],
      [STAFF_COPY.watchtowerCaveatTruncated, cohort.truncatedChildren],
      [STAFF_COPY.watchtowerCaveatSkippedIdeas, cohort.childrenWithSkippedIdeas],
      [STAFF_COPY.watchtowerCaveatNoUnits, cohort.childrenWithNoUnits],
      [STAFF_COPY.watchtowerCaveatUncorroborated, cohort.unitsWithUncorroboratedRecency],
      [STAFF_COPY.watchtowerCaveatOutsideRequest, cohort.unitsWithCompletionsOutsideRequest],
      // Concentration: the median is defended structurally (per-child first), the
      // WIP columns are not. This line is their only defence.
      // The TRIGGER is the idea-unit count, the NUMBER shown is every unit: a
      // dangling business is a legitimate flow unit, so testing the total
      // accused a child with the app's full five ideas plus one dangling
      // business of distorting the cohort. A false alarm on the one line whose
      // job is saying which numbers to distrust is worse than no line.
      [
        STAFF_COPY.watchtowerCaveatWipConcentration,
        cohort.maxIdeaUnitsPerChild > MAX_IDEAS ? cohort.maxUnitsPerChild : 0,
      ],
      [STAFF_COPY.watchtowerCaveatRejectedChildren, shown.rejectedChildren],
      [STAFF_COPY.watchtowerCaveatRejectedIdeas, shown.rejectedIdeas],
      [STAFF_COPY.watchtowerCaveatRejectedBusinesses, shown.rejectedBusinesses],
    ] as ReadonlyArray<readonly [string, number]>
  ).filter(([, count]) => count > 0);

  const noCohort = cohort.childCount === 0;
  /**
   * Children came back and NONE of their saves could be read.
   *
   * Its own alert for the same reason `childCount === 0` has one. The two
   * `DOC_VERSION` constants — first-profit's and the120's
   * `PROGRESS_DOC_VERSION` — are two constants in two repos behind two deploys
   * with no parity gate, so shipping a bump here before the120 redeploys makes
   * every child read `docUnreadable`. `noCohort` is FALSE in that state
   * (childCount > 0), so the loud line never fired and the board showed the mild
   * "nothing here yet" with the real cause as one bullet at the bottom of the
   * caveat block, below the fold on a phone.
   */
  const allUnreadable = !noCohort && cohort.unreadableChildren === cohort.childCount;
  const nothingHere =
    !noCohort &&
    !allUnreadable &&
    rows.every((row) => row.throughput === 0 && row.active === 0 && row.stalled === 0);

  const caveatBlock = (
    // Rendered even when EMPTY: "nothing is hidden" and "we did not check" must
    // not look the same, and a section that disappears makes them identical.
    <section
      data-testid="fp-watchtower-caveats"
      className="mt-4 rounded-2xl border-2 border-[hsl(25_34%_20%/0.1)] bg-white p-4"
    >
      <h3 className="text-sm font-bold text-[hsl(25_34%_20%)]">
        {STAFF_COPY.watchtowerCaveatsTitle}
      </h3>
      {caveats.length === 0 ? (
        <p className="mt-2 text-sm text-ink/80">{STAFF_COPY.watchtowerCaveatNone}</p>
      ) : (
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ink/80">
          {caveats.map(([label, count]) => (
            <li key={label}>
              {label}:{" "}
              <span className="font-bold tabular-nums text-[hsl(25_34%_20%)]">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  /** An active/stalled cell: a 44px button when there is anyone to name, plain
   *  text when the count is zero (there is nothing to disclose). */
  const countCell = (row: FlowRow, bucket: FlowBucket) => {
    const count = bucket === "active" ? row.active : row.stalled;
    const label =
      bucket === "active" ? STAFF_COPY.watchtowerColActive : STAFF_COPY.watchtowerColStalled;
    // At launch the stalled column is almost entirely these two, and the split is
    // what tells staff "three broken clocks", not "three quiet children".
    const split =
      bucket === "stalled" && (row.clamped > 0 || row.uncorroborated > 0) ? (
        <span
          className="mt-1 block text-xs font-normal text-ink/60"
          data-testid={`fp-watchtower-stalled-split-${row.taskId}`}
        >
          {row.clamped > 0 ? `${row.clamped} ${STAFF_COPY.watchtowerStalledClamped}` : null}
          {row.clamped > 0 && row.uncorroborated > 0 ? " · " : null}
          {row.uncorroborated > 0
            ? `${row.uncorroborated} ${STAFF_COPY.watchtowerStalledUncorroborated}`
            : null}
        </span>
      ) : null;

    if (count === 0) {
      return (
        <td className="px-3 py-3 text-right align-top tabular-nums text-ink/60">
          <span className="inline-flex min-h-[44px] items-center justify-end">0</span>
          {split}
        </td>
      );
    }
    const key = drillKey(row.taskId, bucket);
    const isOpen = drill !== null && drillKey(drill.taskId, drill.bucket) === key;
    return (
      <td className="px-3 py-3 text-right align-top tabular-nums">
        <button
          type="button"
          ref={(node) => {
            drillTriggers.current.set(key, node);
          }}
          aria-expanded={isOpen}
          aria-controls={ROSTER_ID}
          aria-label={`${count} — ${label} — ${row.taskId} — ${STAFF_COPY.watchtowerDrillOpen}`}
          data-testid={`fp-watchtower-drill-${key}`}
          onClick={() => {
            if (isOpen) {
              closeDrill({ taskId: row.taskId, bucket });
              return;
            }
            drillJustOpened.current = true;
            setDrill({ taskId: row.taskId, bucket }); // one open at a time, by construction
          }}
          className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border-2 border-build/40 px-3 font-bold text-build underline underline-offset-2 ${focusRingFlat}`}
        >
          {count}
        </button>
        {split}
      </td>
    );
  };

  const medianCell = (row: FlowRow) => {
    /**
     * Rejected measurements, rendered in EVERY branch.
     *
     * It used to render only beside the "—", which is the branch where it
     * matters least: there, the reader can already see nothing was measurable.
     * A row where 3 of 8 pairs were usable renders "n=3 · 3 children · 2 days"
     * and looks CLEAN — the five rejected measurements are invisible, and they
     * are themselves the signal worth acting on (a cohort of broken clocks
     * reads as a fast, confident median over the survivors).
     */
    const dropped =
      row.droppedSamples > 0 ? (
        <span
          className="block text-xs text-ink/60"
          data-testid={`fp-watchtower-dropped-${row.taskId}`}
        >
          {row.droppedSamples} {STAFF_COPY.watchtowerMedianDroppedLabel}
        </span>
      ) : null;

    if (row.medianSuppressed) {
      return (
        <span data-testid={`fp-watchtower-median-${row.taskId}`}>
          {STAFF_COPY.watchtowerMedianWithheld}
          {dropped}
        </span>
      );
    }
    if (row.cycleTimeMedianMs === null) {
      return (
        <span data-testid={`fp-watchtower-median-${row.taskId}`}>
          <NotMeasurable />
          {/* Samples EXISTED and every one was unusable — a different fact from
              "nothing to measure", and the none-note describes the wrong cause. */}
          {dropped}
        </span>
      );
    }
    return (
      <span data-testid={`fp-watchtower-median-${row.taskId}`}>
        <span className="tabular-nums">{formatDuration(row.cycleTimeMedianMs)}</span>
        <span className="block text-xs text-ink/60">
          {STAFF_COPY.watchtowerSampleLead}
          {row.sampleSize} · {row.sampleChildCount} {STAFF_COPY.watchtowerSampleChildren}
          {row.maxSamplesFromOneChild > 1
            ? ` · ${STAFF_COPY.watchtowerSampleMaxOneChildLead} ${row.maxSamplesFromOneChild} ${STAFF_COPY.watchtowerSampleMaxOneChildTail}`
            : null}
        </span>
        {dropped}
      </span>
    );
  };

  const drilledCount =
    drill === null
      ? 0
      : (rows.find((row) => row.taskId === drill.taskId)?.[
          drill.bucket === "active" ? "active" : "stalled"
        ] ?? 0);

  const table = (
    // Wide content scrolls inside ITS OWN container; the page never scrolls
    // sideways at 390px.
    <div className="mt-4 overflow-x-auto rounded-2xl border-2 border-[hsl(25_34%_20%/0.1)] bg-white">
      <table
        data-testid="fp-watchtower-table"
        // The alert is what invalidates this table, so the table points at it —
        // role="alert" is silent on first paint, and a warning nobody hears
        // beside numbers they trust is worse than no warning.
        aria-describedby={totals && !totals.throughputMonotonic ? MONOTONIC_ALERT_ID : undefined}
        className="w-full min-w-[40rem] border-collapse text-left text-sm"
      >
        <caption className="px-3 pt-3 text-left text-sm text-ink/70">
          {/* The caption box is as wide as the SCROLLER's content (40rem), so at
              390px its text would lay out 640px wide and read only by scrolling.
              Constrained to the viewport and pinned to the visible edge. */}
          <span className="sticky left-0 block w-[calc(100vw-3.5rem)] sm:w-auto">
            {STAFF_COPY.watchtowerCaptionLead} {criterion} — {stepTitle}.{" "}
            {STAFF_COPY.watchtowerCaptionTail} {STAFF_COPY.watchtowerCaptionMedianShort}
          </span>
        </caption>
        <thead>
          <tr className="border-b-2 border-[hsl(25_34%_20%/0.1)]">
            <th scope="col" className="px-3 py-3 font-bold text-[hsl(25_34%_20%)]">
              {STAFF_COPY.watchtowerColTask}
            </th>
            <th scope="col" className="px-3 py-3 text-right font-bold text-[hsl(25_34%_20%)]">
              {STAFF_COPY.watchtowerColThroughput}
            </th>
            <th
              scope="col"
              aria-describedby={MEDIAN_NOTE_ID}
              className="px-3 py-3 text-right font-bold text-[hsl(25_34%_20%)]"
            >
              {STAFF_COPY.watchtowerColMedian}
            </th>
            <th scope="col" className="px-3 py-3 text-right font-bold text-[hsl(25_34%_20%)]">
              {STAFF_COPY.watchtowerColActive}
            </th>
            <th scope="col" className="px-3 py-3 text-right font-bold text-[hsl(25_34%_20%)]">
              {STAFF_COPY.watchtowerColStalled}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isOpen = drill !== null && drill.taskId === row.taskId;
            return (
              <Fragment key={row.taskId}>
                <tr className="border-b border-[hsl(25_34%_20%/0.08)]">
                  <th
                    scope="row"
                    className="px-3 py-3 text-left align-top font-normal text-[hsl(25_34%_20%)]"
                  >
                    <span className="font-mono text-xs text-ink/60">{row.taskId}</span>
                    <span className="block font-bold">{taskLabels.get(row.taskId) ?? ""}</span>
                  </th>
                  <td className="px-3 py-3 text-right align-top tabular-nums">{row.throughput}</td>
                  <td className="px-3 py-3 text-right align-top">{medianCell(row)}</td>
                  {countCell(row, "active")}
                  {countCell(row, "stalled")}
                </tr>
                {isOpen && drill ? (
                  <tr>
                    <td colSpan={5} className="bg-[hsl(38_46%_95%)] p-0">
                      {/* The roster is a full-width row of a table that is WIDER
                          than a phone, so left un-pinned it opens off-screen.
                          `sticky left-0` plus a viewport-bounded width keeps it
                          readable at 390px whatever the table's scroll offset;
                          from `sm` the table fits and it reverts to the cell. */}
                      <div
                        id={ROSTER_ID}
                        ref={drillPanel}
                        tabIndex={-1}
                        role="region"
                        aria-label={`${
                          drill.bucket === "active"
                            ? STAFF_COPY.watchtowerDrillActiveTitle
                            : STAFF_COPY.watchtowerDrillStalledTitle
                        } — ${drill.taskId}`}
                        data-testid="fp-watchtower-roster"
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.stopPropagation();
                            closeDrill(drill);
                          }
                        }}
                        className={`sticky left-0 w-[calc(100vw-3.5rem)] px-3 py-3 sm:w-auto ${focusRingFlat}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-[hsl(25_34%_20%)]">
                            {drill.bucket === "active"
                              ? STAFF_COPY.watchtowerDrillActiveTitle
                              : STAFF_COPY.watchtowerDrillStalledTitle}{" "}
                            <span className="font-mono text-xs text-ink/60">{drill.taskId}</span>
                          </h3>
                          <button
                            type="button"
                            onClick={() => closeDrill(drill)}
                            className={`inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.2)] px-4 text-sm font-bold text-[hsl(25_34%_20%)] ${focusRingFlat}`}
                          >
                            {STAFF_COPY.watchtowerDrillClose}
                          </button>
                        </div>
                        {/* The roster collapses per child, so N ideas can be
                            fewer names. Both numbers, so the arithmetic is
                            stated rather than left to be noticed. */}
                        <p
                          data-testid="fp-watchtower-roster-count"
                          className="mt-1 text-xs text-ink/60"
                        >
                          {/* Label-then-count, the same convention the caveats
                              use: "1 ideas" needs a pluralisation rule, "ideas:
                              1" needs none and reads the same at any count. */}
                          {STAFF_COPY.watchtowerDrillIdeasSuffix}: {drilledCount} ·{" "}
                          {STAFF_COPY.watchtowerDrillChildrenSuffix}: {roster.length}
                        </p>
                        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[hsl(25_34%_20%)]">
                          {roster.map((person) => (
                            <li key={person.username} className="break-all">
                              {/* Child-authored text: rendered as TEXT, never as
                                  markup and never into an href. */}
                              <span data-testid="fp-watchtower-username">{person.username}</span>
                              {/* `break-normal` on the ANNOTATIONS only: the
                                  li carries `break-all` so a long child-authored
                                  username cannot overflow, but that inherits and
                                  breaks these English labels mid-word ("(abn /
                                  ormal save)"). The username keeps break-all. */}
                              {person.units > 1 ? (
                                <span className="break-normal text-ink/60">
                                  {" "}
                                  ({person.units} {STAFF_COPY.watchtowerDrillIdeasSuffix})
                                </span>
                              ) : null}
                              {/* The join between "abnormal docs: N" in the
                                  caveat block and the names in this roster.
                                  Without it the count is unactionable: staff
                                  see how many and never which. */}
                              {person.fromTruncatedDoc ? (
                                <span
                                  className="break-normal text-wax"
                                  data-testid="fp-watchtower-roster-truncated"
                                >
                                  {" "}
                                  ({STAFF_COPY.watchtowerDrillTruncated})
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      {header}
      {failure === "refresh" ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-wax">
          {STAFF_COPY.watchtowerRefreshFailed}
        </p>
      ) : null}
      {totals && !totals.throughputMonotonic && totals.firstNonMonotonicTaskId ? (
        <p
          role="alert"
          id={MONOTONIC_ALERT_ID}
          data-testid="fp-watchtower-monotonic"
          className="mt-4 rounded-2xl border-2 border-wax/40 bg-white p-3 text-sm font-semibold text-wax"
        >
          {STAFF_COPY.watchtowerMonotonicLead}{" "}
          <span className="font-mono">{totals.firstNonMonotonicTaskId}</span>{" "}
          {STAFF_COPY.watchtowerMonotonicTail} {STAFF_COPY.watchtowerMonotonicAction}
        </p>
      ) : null}
      {noCohort ? (
        <p role="alert" data-testid="fp-watchtower-no-cohort" className="mt-4 text-sm text-wax">
          {STAFF_COPY.watchtowerNoCohort}
        </p>
      ) : allUnreadable ? (
        <p
          role="alert"
          data-testid="fp-watchtower-all-unreadable"
          className="mt-4 text-sm text-wax"
        >
          {STAFF_COPY.watchtowerAllUnreadable}
        </p>
      ) : nothingHere ? (
        <p className="mt-4 text-sm text-ink/70">{STAFF_COPY.watchtowerEmpty}</p>
      ) : (
        table
      )}
      {totals ? (
        <p className="mt-3 text-sm text-ink/70" data-testid="fp-watchtower-footer">
          {totals.active} {STAFF_COPY.watchtowerFooterActive} · {totals.stalled}{" "}
          {STAFF_COPY.watchtowerFooterStalled} · {totals.before}{" "}
          {STAFF_COPY.watchtowerFooterBefore} · {totals.after} {STAFF_COPY.watchtowerFooterAfter} ·{" "}
          {totals.liveUnits} {STAFF_COPY.watchtowerFooterLive}
        </p>
      ) : null}
      {/* The notes are INLINE and always rendered, not tooltips: the median's
          caveat is the difference between reading this board right and reading
          it exactly backwards, and a tooltip is invisible on a phone. */}
      <div className="mt-4 flex flex-col gap-2 text-sm text-ink/70">
        <p id={MEDIAN_NOTE_ID}>{STAFF_COPY.watchtowerMedianCaveat}</p>
        <p>{STAFF_COPY.watchtowerMedianNoneNote}</p>
        <p>{STAFF_COPY.watchtowerMedianWithheldNote}</p>
        <p>{STAFF_COPY.watchtowerMedianDroppedNote}</p>
        <p>{STAFF_COPY.watchtowerStalledNote}</p>
        <p>{STAFF_COPY.watchtowerStalledSplitNote}</p>
        <p>{STAFF_COPY.watchtowerStalledLaunchNote}</p>
      </div>
      {caveatBlock}
    </>
  );
}
