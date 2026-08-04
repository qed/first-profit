/**
 * StaffSuggestions — the staff-only suggestion list at `/staff` (Change #9).
 *
 * `/staff` is a reserved route that falls through to the SPA; App routes it
 * here via the boot-URL reader (src/screens/staff/staffLink.ts, the verify-link
 * precedent) BEFORE the normal stage routing — this screen is logged-out
 * capable and deliberately OUTSIDE the game shell (no GlobalNav, no game
 * context reads beyond the shared config).
 *
 * Flow: a minimal email+password sign-in against the shared Supabase project's
 * auth (staff are auth users there), then GET {t120ApiUrl}/api/fp/suggestions
 * with the Bearer access token. Contract: 200 {ok:true, suggestions:[{id,
 * kind:'task'|'app', taskId, username, body, createdAt}]} newest-first (cap
 * 200); EVERY refusal — including a valid non-staff (child) token — is a
 * byte-identical 401, rendered as the clean staff-only refusal.
 *
 * SECURITY posture:
 *  - Sign-in uses the auth REST endpoint directly rather than the shared
 *    supabase-js client: the shared client persists sessions to localStorage
 *    under ITS key AND would clobber a child's resident game session on a
 *    shared device — both unacceptable here.
 *  - The staff session survives a page refresh via sessionStorage under this
 *    page's OWN key (STAFF_SESSION_KEY) — deliberately sessionStorage, not
 *    localStorage: it is per-tab and dies with the tab, so a staff credential
 *    can never outlive the sitting on a shared device, and it never touches
 *    the key the game client owns.
 *  - On a genuine 401 refusal the token is revoked server-side (best-effort
 *    /auth/v1/logout) and dropped from both state and storage, so a child
 *    credential never lingers on this page.
 *  - The page stamps a `robots: noindex` meta while mounted (the SPA head has
 *    no per-route server rendering, so this is the available signal).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { getConfig } from "../config";
import type { FeedbackKind } from "../lib/sync";

/** All user-facing copy in one place for review. */
export const STAFF_COPY = {
  // ONE page title, identical signed-out and signed-in: the h1 lives in the
  // shell, so every view (sign-in, loading, refusal, list) renders beneath it.
  title: "First Profit Staff Page",
  signInTitle: "Staff sign-in",
  suggestionsTitle: "Suggestions",
  email: "Email",
  password: "Password",
  showPassword: "Show password",
  hidePassword: "Hide password",
  signIn: "Sign in",
  signOut: "Sign out",
  refusal: "This page is for First Profit staff.",
  signInFailed: "Sign-in failed. Check the email and password.",
  loadFailed: "Could not load suggestions. Try again.",
  loading: "Loading suggestions…",
  empty: "No suggestions yet.",
  retry: "Retry",
} as const;

/** This page's OWN sessionStorage key — never the game client's. */
export const STAFF_SESSION_KEY = "fp.staff.session";

interface StaffSession {
  accessToken: string;
  /** Absent when the grant returned no refresh token (nothing to renew with). */
  refreshToken: string | null;
}

export interface StaffSuggestion {
  id: string;
  kind: FeedbackKind;
  taskId: string;
  username: string;
  body: string;
  createdAt: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Read the persisted staff session. Any storage failure (private mode, disabled
 *  storage, hand-mangled JSON) is indistinguishable from "not signed in". */
function readSession(): StaffSession | null {
  try {
    const raw = window.sessionStorage.getItem(STAFF_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.accessToken !== "string" || !parsed.accessToken) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : null,
    };
  } catch {
    return null;
  }
}

function writeSession(session: StaffSession): void {
  try {
    window.sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable: the session still works for this page view, it just
    // will not survive a refresh. Never a crash.
  }
}

function clearSession(): void {
  try {
    window.sessionStorage.removeItem(STAFF_SESSION_KEY);
  } catch {
    // Nothing to clear against.
  }
}

/** Pull a session out of a Supabase token-grant response (password OR refresh). */
function sessionFromGrant(data: unknown): StaffSession | null {
  if (!isRecord(data) || typeof data.access_token !== "string" || !data.access_token) return null;
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
  };
}

/** Defensive row parse: a malformed entry is skipped, never a crash. */
function parseSuggestions(raw: unknown): StaffSuggestion[] {
  if (!isRecord(raw) || raw.ok !== true || !Array.isArray(raw.suggestions)) return [];
  const rows: StaffSuggestion[] = [];
  for (const r of raw.suggestions) {
    if (
      isRecord(r) &&
      typeof r.id === "string" &&
      (r.kind === "task" || r.kind === "app") &&
      typeof r.taskId === "string" &&
      typeof r.username === "string" &&
      typeof r.body === "string" &&
      typeof r.createdAt === "string"
    ) {
      rows.push({
        id: r.id,
        kind: r.kind,
        taskId: r.taskId,
        username: r.username,
        body: r.body,
        createdAt: r.createdAt,
      });
    }
  }
  return rows;
}

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

type View =
  | { name: "signin" }
  | { name: "loading" }
  | { name: "refused" }
  | { name: "loadError" }
  | { name: "list"; rows: StaffSuggestion[] };

export function StaffSuggestions() {
  // The persisted session is read ONCE, synchronously, at first render: a
  // returning staff refresh lands straight on "loading", never flashing the
  // sign-in form it is about to replace.
  const [session, setSession] = useState<StaffSession | null>(readSession);
  const [view, setView] = useState<View>(() =>
    readSession() ? { name: "loading" } : { name: "signin" },
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const token = session?.accessToken ?? null;

  /** Adopt a session into state AND storage in one move (the only writer). */
  const adoptSession = useCallback((next: StaffSession) => {
    setSession(next);
    writeSession(next);
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

  /** Best-effort server-side revoke + local drop (refusal path + sign-out link). */
  const signOut = useCallback((accessToken: string | null) => {
    setSession(null);
    clearSession();
    if (!accessToken) return;
    try {
      const { supabaseUrl, supabaseAnonKey } = getConfig();
      void fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${accessToken}` },
      }).catch(() => {
        // Best-effort revoke; the token is already dropped locally.
      });
    } catch {
      // Config failure: nothing to revoke against; the local drop stands.
    }
  }, []);

  /** One GET. `unauthorized` is the byte-identical 401 the server returns for
   *  EVERY refusal — a non-staff token and a merely-expired one look the same
   *  here, which is exactly why the caller tries a refresh before judging. */
  const getRows = useCallback(
    async (
      accessToken: string,
    ): Promise<
      | { kind: "rows"; rows: StaffSuggestion[] }
      | { kind: "unauthorized" }
      | { kind: "error" }
    > => {
      let res: Response;
      try {
        const { t120ApiUrl } = getConfig();
        res = await fetch(`${t120ApiUrl.replace(/\/$/, "")}/api/fp/suggestions`, {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        return { kind: "error" };
      }
      if (res.status === 401) return { kind: "unauthorized" };
      if (!res.ok) return { kind: "error" };
      try {
        return { kind: "rows", rows: parseSuggestions(await res.json()) };
      } catch {
        return { kind: "error" };
      }
    },
    [],
  );

  /** Trade a refresh token for a fresh session, or null if it no longer works. */
  const refreshSession = useCallback(async (refreshToken: string): Promise<StaffSession | null> => {
    try {
      const { supabaseUrl, supabaseAnonKey } = getConfig();
      const res = await fetch(
        `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: supabaseAnonKey },
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
      );
      if (!res.ok) return null;
      return sessionFromGrant(await res.json().catch(() => null));
    } catch {
      return null;
    }
  }, []);

  /**
   * Load the list for `active`, renewing once if the token has aged out.
   *
   * `restored` marks a session rehydrated from storage rather than just typed
   * in. It only changes what an UNRECOVERABLE 401 means: a restored session
   * that cannot be renewed has simply expired, so the honest answer is the
   * sign-in form — showing the staff-only refusal there would tell a real staff
   * member they are not staff. A fresh sign-in that 401s IS the refusal.
   */
  const loadSuggestions = useCallback(
    async (active: StaffSession, restored = false) => {
      setView({ name: "loading" });
      const first = await getRows(active.accessToken);

      if (first.kind === "rows") {
        setView({ name: "list", rows: first.rows });
        return;
      }
      if (first.kind === "error") {
        setView({ name: "loadError" });
        return;
      }

      // 401. Renew once if we have anything to renew with, then re-judge.
      const renewed = active.refreshToken ? await refreshSession(active.refreshToken) : null;
      if (!renewed) {
        if (restored) {
          // Expired, not refused: drop it quietly and ask for the password.
          setSession(null);
          clearSession();
          setSignInError(null);
          setView({ name: "signin" });
        } else {
          signOut(active.accessToken);
          setView({ name: "refused" });
        }
        return;
      }

      adoptSession(renewed);
      const second = await getRows(renewed.accessToken);
      if (second.kind === "rows") {
        setView({ name: "list", rows: second.rows });
      } else if (second.kind === "error") {
        setView({ name: "loadError" });
      } else {
        // A freshly renewed token still refused: this account is not staff.
        signOut(renewed.accessToken);
        setView({ name: "refused" });
      }
    },
    [adoptSession, getRows, refreshSession, signOut],
  );

  // Boot restore: a refresh with a live session goes straight to the list.
  // Guarded by a ref so React 18 StrictMode's double-mount fires it once.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = readSession();
    if (saved) void loadSuggestions(saved, true);
  }, [loadSuggestions]);

  const signIn = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy) return;
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
        setPassword("");
        setShowPassword(false);
        adoptSession(granted);
        await loadSuggestions(granted);
      } catch {
        setSignInError(STAFF_COPY.signInFailed);
      } finally {
        setBusy(false);
      }
    },
    [busy, email, password, adoptSession, loadSuggestions],
  );

  const input =
    "mt-1 w-full min-h-[44px] rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-2.5 text-sm text-[hsl(25_34%_20%)] outline-none focus:border-build";

  const shell = (children: React.ReactNode) => (
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
  if (token === null && view.name !== "refused") {
    return shell(
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
            className="absolute inset-y-0 right-0 top-1 flex min-h-[44px] min-w-[48px] items-center justify-center rounded-r-xl text-ink/50 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-build/30"
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
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-build px-6 font-display text-sm font-bold text-white shadow-[0_3px_0_hsl(217_74%_36%)] disabled:opacity-60"
        >
          {STAFF_COPY.signIn}
        </button>
      </form>,
    );
  }

  if (view.name === "refused") {
    return shell(
      <div className="mt-6">
        <p className="text-base font-semibold text-[hsl(25_34%_20%)]">{STAFF_COPY.refusal}</p>
        <button
          type="button"
          onClick={() => {
            setView({ name: "signin" });
            setSignInError(null);
          }}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.2)] px-5 text-sm font-bold text-[hsl(25_34%_20%)]"
        >
          {STAFF_COPY.signIn}
        </button>
      </div>,
    );
  }

  if (view.name === "loading") {
    return shell(<p className="mt-6 text-sm text-ink/60">{STAFF_COPY.loading}</p>);
  }

  if (view.name === "loadError") {
    return shell(
      <div className="mt-6">
        <p className="text-sm font-semibold text-wax">{STAFF_COPY.loadFailed}</p>
        <button
          type="button"
          onClick={() => session && void loadSuggestions(session)}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.2)] px-5 text-sm font-bold text-[hsl(25_34%_20%)]"
        >
          {STAFF_COPY.retry}
        </button>
      </div>,
    );
  }

  // Signed-in list: simple cards, desktop-first but wrapping cleanly at 390px.
  const rows = view.name === "list" ? view.rows : [];
  return shell(
    <>
      {/* Signed in: the SAME h1 from the shell, with the suggestions beneath
          it — the "Suggestions" h2 sits at the same level as the sign-in
          form's h2, so the page reads identically either side of the login. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[hsl(25_34%_20%)]">
          {STAFF_COPY.suggestionsTitle}{" "}
          <span className="text-sm font-normal text-ink/60">
            ({rows.length})
          </span>
        </h2>
        <button
          type="button"
          onClick={() => {
            signOut(token);
            setView({ name: "signin" });
          }}
          className="inline-flex min-h-[44px] items-center rounded-xl px-3 text-sm font-bold text-build underline underline-offset-2"
        >
          {STAFF_COPY.signOut}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink/60">{STAFF_COPY.empty}</p>
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
    </>,
  );
}
