/**
 * StaffSuggestions — the suggestions TAB of the staff page (Change #9).
 *
 * Unit 3 (the two-tab staff shell) split this screen in half: the session, the
 * sign-in form, the refusal and the refresh-once-then-judge rule moved to
 * StaffShell.tsx, which is what `/staff` mounts. What is left here is exactly
 * one tab's worth of behaviour — GET the suggestions, parse defensively, and
 * own the data view-states (loading / loadError / list / empty).
 *
 * `unauthorized` from `request` is TERMINAL and already judged by the shell
 * (sign-in form or refusal, whichever is honest); this tab simply stops, and is
 * about to be unmounted. `error` covers both a failed GET and a refresh the
 * shell could not reach — retryable, session intact.
 *
 * Rows are cached in the SHELL, keyed, so switching to the Watchtower tab and
 * back does not refetch — and any sign-out or refusal drops that cache with the
 * session. The cache TICKET is taken before the fetch so a superseded response
 * (or one belonging to a session that has since ended) cannot land.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { STAFF_COPY } from "./staffCopy";
import { parseSuggestions, type StaffSuggestion } from "./parseSuggestions";
import { STAFF_PANEL_TITLE_ID, type StaffTabProps } from "./staffTypes";

/** The shell-cache slot this tab owns. */
export const SUGGESTIONS_CACHE_KEY = "suggestions";
const SUGGESTIONS_PATH = "/api/fp/suggestions";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type TabView =
  | { name: "loading" }
  | { name: "loadError" }
  | { name: "list"; rows: StaffSuggestion[] };

/** The panel's h2 — rendered in EVERY view-state, so the region the shell
 *  focuses on a tab switch is named whether it is loading, failed or full. */
function PanelHeading({ count }: { count: number | null }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
      <h2 id={STAFF_PANEL_TITLE_ID} className="text-lg font-bold text-[hsl(25_34%_20%)]">
        {STAFF_COPY.suggestionsTitle}
        {count === null ? null : (
          <span className="text-sm font-normal text-ink/60"> ({count})</span>
        )}
      </h2>
    </div>
  );
}

export function StaffSuggestions({ request, cache }: StaffTabProps) {
  // A cached list renders immediately — a tab switch is not a refetch. With no
  // cache the first paint is "loading", never a flash of the empty state.
  const [view, setView] = useState<TabView>(() => {
    const cached = cache.read<StaffSuggestion[]>(SUGGESTIONS_CACHE_KEY);
    return cached ? { name: "list", rows: cached } : { name: "loading" };
  });

  const load = useCallback(async () => {
    setView({ name: "loading" });
    const ticket = cache.begin(SUGGESTIONS_CACHE_KEY);
    const res = await request(SUGGESTIONS_PATH);
    if (res.kind === "unauthorized" || res.kind === "aborted") return; // the shell owns these
    if (res.kind === "error") {
      setView({ name: "loadError" });
      return;
    }
    const rows = parseSuggestions(res.data);
    // A refused write means this response was superseded or its session ended:
    // showing it would contradict what the cache (and the shell) now hold.
    if (!cache.write(ticket, rows)) return;
    setView({ name: "list", rows });
  }, [request, cache]);

  // First mount only. Guarded by a ref so React 18 StrictMode's double-invoked
  // effect fires ONE load; a remount mid-flight JOINS the shell's in-flight
  // request rather than starting a second one.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (cache.read<StaffSuggestion[]>(SUGGESTIONS_CACHE_KEY) === undefined) void load();
  }, [cache, load]);

  if (view.name === "loading") {
    return (
      <>
        <PanelHeading count={null} />
        <p role="status" className="mt-4 text-sm text-ink/60">
          {STAFF_COPY.suggestionsLoading}
        </p>
      </>
    );
  }

  if (view.name === "loadError") {
    return (
      <>
        <PanelHeading count={null} />
        <p role="alert" className="mt-4 text-sm font-semibold text-wax">
          {STAFF_COPY.suggestionsLoadFailed}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.2)] px-5 text-sm font-bold text-[hsl(25_34%_20%)] focus:outline-none focus-visible:ring-2 focus-visible:ring-build/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(38_46%_95%)]"
        >
          {STAFF_COPY.retry}
        </button>
      </>
    );
  }

  // The list: simple cards, desktop-first but wrapping cleanly at 390px.
  const rows = view.rows;
  return (
    <>
      <PanelHeading count={rows.length} />
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink/60">{STAFF_COPY.suggestionsEmpty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((s) => (
            <li
              key={s.id}
              className="rounded-2xl border-2 border-[hsl(25_34%_20%/0.1)] bg-white p-4"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wide text-ink/60">
                <span
                  className={`rounded-md px-1.5 py-0.5 font-bold text-white ${
                    s.kind === "app" ? "bg-build" : "bg-verified"
                  }`}
                >
                  {s.kind}
                </span>
                <span data-testid="fp-staff-task-id">task {s.taskId}</span>
                <span data-testid="fp-staff-username" className="break-all">
                  {s.username}
                </span>
                <span>{formatDate(s.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[hsl(25_34%_20%)]">
                {s.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
