/**
 * StaffShell — the staff-only page at `/staff`, as a two-tab shell.
 *
 * `/staff` is a reserved route that falls through to the SPA; App routes here
 * via the boot-URL reader (staffLink.ts, the verify-link precedent) BEFORE the
 * normal stage routing — this screen is logged-out capable and deliberately
 * OUTSIDE the game shell (no GlobalNav, no game context reads beyond the shared
 * config).
 *
 * The shell owns EXACTLY ONE thing the tabs do not: the staff session. That
 * means sign-in, restore, the single-flight refresh, sign-out/revoke, and the
 * two AUTH view-states (sign-in form, staff-only refusal). Each tab owns its
 * own DATA view-states (loading / loadError / list / empty) and reads through
 * `request`.
 *
 * Flow: a minimal email+password sign-in against the shared Supabase project's
 * auth (staff are auth users there), then authenticated GETs against
 * {t120ApiUrl}. EVERY refusal from those endpoints — including a valid
 * non-staff (child) token — is a byte-identical 401, so the shell renews once
 * before judging what a 401 means.
 *
 * THE EPOCH RULE. Every mutation that happens after an `await` must first check
 * that the session it started under is still the live one. The epoch is bumped
 * on sign-out, on refusal and on sign-in; anything holding a stale epoch
 * discards its result silently — no session adoption (which would resurrect a
 * session the user just ended), no view change (which would show a deliberate
 * sign-out as a refusal), and no cache write (which would land one staff
 * member's cohort data under another's credential). The tab bar made this
 * reachable: sign-out used to be unmounted for the whole renewal window.
 *
 * SECURITY posture:
 *  - Sign-in uses the auth REST endpoint directly rather than the shared
 *    supabase-js client: the shared client persists sessions to localStorage
 *    under ITS key AND would clobber a child's resident game session on a
 *    shared device — both unacceptable here.
 *  - Session persistence is sessionStorage under this page's OWN key, with the
 *    grant's expiry — see staffSession.ts.
 *  - On a genuine 401 refusal the token is revoked server-side (best-effort
 *    /auth/v1/logout) and dropped from state, storage AND every tab's cache, so
 *    neither a child credential nor cohort data lingers on this page.
 *  - A refresh that could not be REACHED (network throw, 5xx) is never read as
 *    a refusal: it surfaces the tab's retryable error and leaves the session
 *    alone. Telling a staff member in a dead spot that they are not staff — and
 *    revoking their whole token family to do it — is the failure this guards.
 *  - The page stamps a `robots: noindex` meta while mounted (the SPA head has
 *    no per-route server rendering, so this is the available signal).
 *
 * Tabs are plain <button>s with `aria-pressed` on the active one — NOT an ARIA
 * tablist (two static views do not warrant roving tabindex), NOT `aria-current`
 * (that means "current page in a set of links"; these change no URL), and NOT a
 * <nav> (this page has no GlobalNav, and the suite pins that). Tab state lives
 * HERE, above any responsive conditional mount: see
 * docs/solutions/ui-bugs/breakpoint-crossing-drops-navigation-*.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { getConfig } from "../../config";
import { CRITERION_SEQUENCE } from "../../state/gameCore";
import { STAFF_COPY } from "./staffCopy";
import {
  clearSession,
  readSession,
  sessionFromGrant,
  writeSession,
  type StaffSession,
} from "./staffSession";
import { createSingleFlight } from "./singleFlight";
import { StaffSuggestions } from "./StaffSuggestions";
import { StaffWatchtower } from "./StaffWatchtower";
import { STAFF_PANEL_TITLE_ID } from "./staffTypes";
import type {
  StaffApiResult,
  StaffCache,
  StaffCacheTicket,
  StaffRequestOptions,
} from "./staffTypes";

type StaffTabId = "suggestions" | "watchtower";

const TABS: ReadonlyArray<{ id: StaffTabId; label: string }> = [
  { id: "suggestions", label: STAFF_COPY.suggestionsTitle },
  { id: "watchtower", label: STAFF_COPY.watchtowerTitle },
];

/**
 * What a renewal attempt actually told us. Collapsing these three into null is
 * how a dead spot becomes "you are not staff" (see the header).
 */
type RefreshOutcome =
  | { kind: "renewed"; session: StaffSession }
  | { kind: "rejected" } // the grant is dead: 400/401, or nothing to renew with
  | { kind: "unreachable" } // transient: network throw, 5xx, unparseable body
  | { kind: "stale" }; // the session changed underneath us

const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-build/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(38_46%_95%)]";

export function StaffShell() {
  // The persisted session is read ONCE, synchronously, at first render: a
  // returning staff refresh lands straight on the tab's own loading state,
  // never flashing the sign-in form it is about to replace.
  const [session, setSession] = useState<StaffSession | null>(readSession);
  const [refused, setRefused] = useState(false);
  const [activeTab, setActiveTab] = useState<StaffTabId>("suggestions");
  // Shell-owned so it survives a tab switch, exactly as the cache does.
  const [criterionId, setCriterionId] = useState<string>(() => CRITERION_SEQUENCE[0] ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const token = session?.accessToken ?? null;

  // Mirrors of state that async work reads: `request` must always act on the
  // CURRENT session, never the one captured when its closure was built.
  const sessionRef = useRef<StaffSession | null>(session);
  /**
   * How much this session has PROVEN, which decides what an unrenewable 401
   * means:
   *  - `restored` — rehydrated from storage. Cannot be renewed → it expired, so
   *    the honest answer is the sign-in form. Showing the staff-only refusal
   *    would tell a real staff member they are not staff.
   *  - `fresh` — just typed in and never yet accepted by the API. Cannot be
   *    renewed → this account IS refused, and its token is revoked.
   *  - `proven` — has had at least one 2xx from the API, so it is staff. A
   *    later unrenewable 401 is an expiry, not a refusal. Without this, the
   *    `fresh` verdict would stand for the entire life of the page and a
   *    staff member who worked for an hour would be told they are not staff.
   *
   * It governs BOTH unrenewable-401 branches. The second — renewal SUCCEEDS and
   * the retry is refused anyway — used to run `dropSession` + `setRefused`
   * unconditionally, so this grace covered only half the ground it argues for.
   * See the branch itself for why a rate limit lands there.
   */
  const origin = useRef<"restored" | "fresh" | "proven">(session ? "restored" : "fresh");
  /** Bumped whenever the live session changes identity. See THE EPOCH RULE. */
  const epoch = useRef(0);
  const cacheRef = useRef(new Map<string, unknown>());
  /** Latest generation ISSUED per key — a ticket that is not the latest lost. */
  const cacheGenerationRef = useRef(new Map<string, number>());
  const generationCounter = useRef(0);
  /** Shared in-flight GETs, keyed by path, so a tab remount JOINS the fetch its
   *  previous mount started instead of firing a duplicate. */
  const inFlightRef = useRef(new Map<string, Promise<StaffApiResult>>());
  const refreshFlight = useRef(createSingleFlight<RefreshOutcome>());

  /** Adopt a session into state, ref AND storage in one move (the only writer). */
  const adoptSession = useCallback((next: StaffSession) => {
    sessionRef.current = next;
    setSession(next);
    writeSession(next);
  }, []);

  /** Best-effort server-side revoke. Never awaited; never throws. */
  const revoke = useCallback((accessToken: string | null) => {
    if (!accessToken) return;
    try {
      const { supabaseUrl, supabaseAnonKey } = getConfig();
      void fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${accessToken}` },
      }).catch(() => {
        // Best-effort; the token is already dropped locally.
      });
    } catch {
      // Config failure: nothing to revoke against; the local drop stands.
    }
  }, []);

  // noindex + the page title while mounted: the SPA serves one head for every
  // route, so the reserved staff route stamps both signals itself and restores
  // the game's title on unmount.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    const previousTitle = document.title;
    document.title = STAFF_COPY.title;
    return () => {
      meta.remove();
      document.title = previousTitle;
    };
  }, []);

  /**
   * Drop the session: state, storage, in-flight reads AND every tab's cached
   * data, in one update. The SINGLE owner of the cache reset — a second
   * clear elsewhere would mask this one in tests and drift from it in fact.
   * A sign-out from ANY tab clears ALL of them, so no cohort or suggestion data
   * survives the credential that fetched it.
   */
  const dropSession = useCallback(
    (revokeToken: string | null) => {
      epoch.current += 1;
      sessionRef.current = null;
      setSession(null);
      clearSession();
      cacheRef.current = new Map();
      cacheGenerationRef.current = new Map();
      inFlightRef.current = new Map();
      revoke(revokeToken);
    },
    [revoke],
  );

  /** Trade a refresh token for a fresh session, keeping WHY it failed. */
  const refreshSession = useCallback(async (refreshToken: string): Promise<RefreshOutcome> => {
    let res: Response;
    try {
      const { supabaseUrl, supabaseAnonKey } = getConfig();
      res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: supabaseAnonKey },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      return { kind: "unreachable" };
    }
    // ONLY the auth-level refusals condemn the session. A 5xx, a 429 or a
    // proxy error says nothing about whether this person is staff.
    if (res.status === 400 || res.status === 401 || res.status === 403) return { kind: "rejected" };
    if (!res.ok) return { kind: "unreachable" };
    const renewed = sessionFromGrant(await res.json().catch(() => null));
    return renewed ? { kind: "renewed", session: renewed } : { kind: "unreachable" };
  }, []);

  /** Renew the session ONCE for everyone: concurrent 401s share one grant. */
  const renewOnce = useCallback(
    async (staleToken: string, startEpoch: number): Promise<RefreshOutcome> => {
      const current = sessionRef.current;
      if (!current || epoch.current !== startEpoch) return { kind: "stale" };
      // Someone already renewed while this caller was in flight: use theirs.
      if (current.accessToken !== staleToken) return { kind: "renewed", session: current };
      const refreshToken = current.refreshToken;
      if (!refreshToken) return { kind: "rejected" };

      const outcome = await refreshFlight.current.run(() => refreshSession(refreshToken));

      if (epoch.current !== startEpoch) {
        // The session died while the grant was in flight (sign-out, refusal, a
        // new sign-in). Adopting now would resurrect it — and the logout that
        // ran at drop time revoked the OLD family, not this one, so revoke the
        // resurrected token too rather than leaving it live server-side.
        if (outcome.kind === "renewed") revoke(outcome.session.accessToken);
        return { kind: "stale" };
      }
      if (outcome.kind === "renewed") adoptSession(outcome.session);
      return outcome;
    },
    [adoptSession, refreshSession, revoke],
  );

  const apiGet = useCallback(
    async (path: string, accessToken: string, signal?: AbortSignal): Promise<StaffApiResult> => {
      try {
        const { t120ApiUrl } = getConfig();
        const res = await fetch(`${t120ApiUrl.replace(/\/$/, "")}${path}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        });
        if (res.status === 401) return { kind: "unauthorized" };
        if (!res.ok) return { kind: "error" };
        return { kind: "json", data: await res.json() };
      } catch {
        return signal?.aborted ? { kind: "aborted" } : { kind: "error" };
      }
    },
    [],
  );

  /**
   * One authenticated GET, renewing once if the token has aged out.
   *
   * The refresh-once-then-judge rule lives here, shell-wide, because a 401 is
   * byte-identical for "expired" and "not staff" — only a renewal attempt tells
   * them apart, and only the shell knows how much this session has proven.
   */
  const performRequest = useCallback(
    async (path: string, signal?: AbortSignal): Promise<StaffApiResult> => {
      const startEpoch = epoch.current;
      const active = sessionRef.current;
      if (!active) return { kind: "unauthorized" };

      const first = await apiGet(path, active.accessToken, signal);
      if (epoch.current !== startEpoch) return { kind: "unauthorized" };
      if (first.kind === "json") {
        origin.current = "proven";
        return first;
      }
      if (first.kind !== "unauthorized") return first;

      const renewal = await renewOnce(active.accessToken, startEpoch);
      if (renewal.kind === "stale" || epoch.current !== startEpoch) {
        return { kind: "unauthorized" };
      }
      if (renewal.kind === "unreachable") {
        // Could not REACH the renewal. Retryable, and the session stands.
        return { kind: "error" };
      }
      if (renewal.kind === "rejected") {
        if (origin.current === "fresh") {
          // Never accepted by the API and cannot be renewed: this IS the
          // refusal. Revoke, so a child credential never lingers here.
          dropSession(active.accessToken);
          setRefused(true);
        } else {
          // Restored or already proven: expired, not refused. Drop it quietly
          // and ask for the password.
          dropSession(null);
          setSignInError(null);
          setRefused(false);
        }
        return { kind: "unauthorized" };
      }

      const second = await apiGet(path, renewal.session.accessToken, signal);
      if (epoch.current !== startEpoch) return { kind: "unauthorized" };
      if (second.kind === "json") {
        origin.current = "proven";
        return second;
      }
      if (second.kind !== "unauthorized") return second;
      if (origin.current === "proven") {
        /**
         * A session this API has ALREADY SERVED, whose grant just renewed
         * cleanly, and which is now refused. That is not evidence about the
         * account — it is evidence that something ELSE changed, and the
         * likeliest something is a rate limit: the120's `rate_limited` answers
         * the same byte-identical 401 as "not staff", deliberately (the limiter
         * runs before the staff gate, so a 400 there would be an oracle), and
         * the flow board spends a request per criterion selection.
         *
         * Signing a proven staff member out here was the worst available
         * response: it told them they are not staff, dropped their cohort data,
         * and REVOKED their whole token family server-side — over a throttle
         * that clears itself in fifteen minutes. Signing back in cannot help
         * either, because the new token hits the same bucket.
         *
         * So: a retryable error. The session stands, the tab shows its Retry,
         * and nothing is destroyed. A refusal must require evidence the account
         * is not staff; a rate-limited response is not that evidence, and the
         * server-side gate is what actually keeps a non-staff account out.
         *
         * Only `proven` gets this. A `fresh` session has never been accepted by
         * this API at all, so a 401 on it IS the refusal, and a `restored` one
         * keeps its existing sign-in-form path.
         */
        return { kind: "error" };
      }
      // A freshly renewed token still refused, on a session this API has never
      // accepted: this account is not staff.
      dropSession(renewal.session.accessToken);
      setRefused(true);
      return { kind: "unauthorized" };
    },
    [apiGet, dropSession, renewOnce],
  );

  /**
   * The tabs' entry point. Identical calls IN FLIGHT are shared, so a tab that
   * unmounts and remounts mid-load (switch away, switch back) joins the
   * original fetch instead of firing a second one. A request with an
   * AbortSignal is never shared: one caller's abort must not cancel another's.
   */
  const request = useCallback(
    (path: string, options?: StaffRequestOptions): Promise<StaffApiResult> => {
      const signal = options?.signal;
      if (signal) return performRequest(path, signal);
      const existing = inFlightRef.current.get(path);
      if (existing) return existing;
      const started = performRequest(path);
      const map = inFlightRef.current;
      map.set(path, started);
      const release = () => {
        if (map.get(path) === started) map.delete(path);
      };
      started.then(release, release);
      return started;
    },
    [performRequest],
  );

  // Stable identity: tabs take `cache` in effect deps, and a new object each
  // render would re-fire their loads.
  const cache = useMemo<StaffCache>(
    () => ({
      read: <T,>(key: string) => cacheRef.current.get(key) as T | undefined,
      begin: (key: string): StaffCacheTicket => {
        generationCounter.current += 1;
        const generation = generationCounter.current;
        cacheGenerationRef.current.set(key, generation);
        return { key, generation, epoch: epoch.current };
      },
      write: (ticket: StaffCacheTicket, value: unknown) => {
        // A dead session's response must never land in the next one's cache,
        // and a slower earlier fetch must never overwrite a faster later one.
        if (ticket.epoch !== epoch.current) return false;
        if (cacheGenerationRef.current.get(ticket.key) !== ticket.generation) return false;
        cacheRef.current.set(ticket.key, value);
        return true;
      },
      clear: (key: string) => {
        cacheRef.current.delete(key);
        cacheGenerationRef.current.delete(key);
      },
    }),
    [],
  );

  const signIn = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      // A REF, not the state: two submits in one tick see the same stale
      // `busy` state (and the same not-yet-disabled button), so only a
      // synchronous flag actually stops a double grant.
      if (busyRef.current) return;
      if (!email.trim() || !password) {
        // Refuse locally rather than spending a rate-limit slot on the shared
        // Supabase project for a request that cannot succeed.
        setSignInError(STAFF_COPY.signInIncomplete);
        return;
      }
      busyRef.current = true;
      setBusy(true);
      setSignInError(null);
      try {
        const { supabaseUrl, supabaseAnonKey } = getConfig();
        const res = await fetch(
          `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: supabaseAnonKey },
            body: JSON.stringify({ email: email.trim(), password }),
          },
        );
        const data: unknown = await res.json().catch(() => null);
        const granted = res.ok ? sessionFromGrant(data) : null;
        if (!granted) {
          setSignInError(STAFF_COPY.signInFailed);
          return;
        }
        // A typed-in session that the API has not accepted yet.
        origin.current = "fresh";
        epoch.current += 1;
        inFlightRef.current = new Map();
        setActiveTab("suggestions");
        adoptSession(granted);
      } catch {
        setSignInError(STAFF_COPY.signInFailed);
      } finally {
        // Always: a credential left legible in the field (worse with the eye
        // toggle on) outlives the person who typed it on a shared device.
        setPassword("");
        setShowPassword(false);
        busyRef.current = false;
        setBusy(false);
      }
    },
    [email, password, adoptSession],
  );

  // Moving focus into the panel on a tab switch is what makes the change
  // announced at all, names the region, and puts a long scrolled list's reader
  // back at the top of the panel they just opened.
  const panelRef = useRef<HTMLDivElement>(null);
  const focusPanel = useRef(false);
  useEffect(() => {
    if (!focusPanel.current) return;
    focusPanel.current = false;
    panelRef.current?.focus();
  });

  const input =
    "mt-1 w-full min-h-[44px] rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-2.5 text-sm text-[hsl(25_34%_20%)] outline-none focus:border-build";

  const page = (children: React.ReactNode) => (
    <main className="min-h-screen w-full bg-[hsl(38_46%_95%)] px-4 py-8 text-ink sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="font-display text-2xl font-black text-[hsl(25_34%_20%)]">
          {STAFF_COPY.title}
        </h1>
        {children}
      </div>
    </main>
  );

  // Signed-out (or never signed in): the minimal staff sign-in form.
  if (token === null && !refused) {
    return page(
      <form onSubmit={signIn} className="mt-6 max-w-sm">
        <h2 className="text-lg font-bold text-[hsl(25_34%_20%)]">{STAFF_COPY.signInTitle}</h2>
        <label
          htmlFor="fp-staff-email"
          className="mt-4 block text-sm font-bold text-[hsl(25_34%_20%)]"
        >
          {STAFF_COPY.email}
        </label>
        <input
          id="fp-staff-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        <label
          htmlFor="fp-staff-password"
          className="mt-3 block text-sm font-bold text-[hsl(25_34%_20%)]"
        >
          {STAFF_COPY.password}
        </label>
        {/* Show/hide toggle, same affordance as the child login (src/screens/
            Login.tsx): lucide Eye/EyeOff, 44px target, aria-pressed state. */}
        <div className="relative">
          <input
            id="fp-staff-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${input} pr-14`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? STAFF_COPY.hidePassword : STAFF_COPY.showPassword}
            aria-pressed={showPassword}
            className={`absolute inset-y-0 right-0 top-1 flex min-h-[44px] min-w-[48px] items-center justify-center rounded-r-xl text-ink/50 hover:text-ink ${focusRing}`}
          >
            {showPassword ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
          </button>
        </div>
        {signInError ? (
          <p role="alert" className="mt-3 text-sm font-semibold text-wax">
            {signInError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className={`mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-build px-6 font-display text-sm font-bold text-white shadow-[0_3px_0_hsl(217_74%_36%)] disabled:opacity-60 ${focusRing}`}
        >
          {STAFF_COPY.signIn}
        </button>
      </form>,
    );
  }

  if (refused) {
    return page(
      <div className="mt-6">
        <p className="text-base font-semibold text-[hsl(25_34%_20%)]">{STAFF_COPY.refusal}</p>
        <button
          type="button"
          onClick={() => {
            setRefused(false);
            setSignInError(null);
          }}
          className={`mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.2)] px-5 text-sm font-bold text-[hsl(25_34%_20%)] ${focusRing}`}
        >
          {STAFF_COPY.signIn}
        </button>
      </div>,
    );
  }

  const tabProps = {
    request,
    cache,
    criterionId,
    onCriterionChange: setCriterionId,
  };

  // Signed in: the tab bar + sign-out, then the active tab's panel beneath.
  // The row wraps at 390px; every control is a 44px target.
  return page(
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" data-testid="fp-staff-tabs">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  focusPanel.current = true;
                  setActiveTab(tab.id);
                }}
                aria-pressed={isActive}
                className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 font-display text-sm font-bold ${focusRing} ${
                  isActive
                    ? "bg-build text-white shadow-[0_3px_0_hsl(217_74%_36%)]"
                    : "border-2 border-[hsl(25_34%_20%/0.2)] text-[hsl(25_34%_20%)]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            dropSession(token);
            setRefused(false);
          }}
          className={`inline-flex min-h-[44px] items-center rounded-xl px-3 text-sm font-bold text-build underline underline-offset-2 ${focusRing}`}
        >
          {STAFF_COPY.signOut}
        </button>
      </div>
      <div
        ref={panelRef}
        tabIndex={-1}
        aria-labelledby={STAFF_PANEL_TITLE_ID}
        data-testid="fp-staff-panel"
        className="focus:outline-none"
      >
        {activeTab === "suggestions" ? (
          <StaffSuggestions {...tabProps} />
        ) : (
          <StaffWatchtower {...tabProps} />
        )}
      </div>
    </>,
  );
}
