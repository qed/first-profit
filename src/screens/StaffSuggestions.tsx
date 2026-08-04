/**
 * AdminSuggestions — the staff-only suggestion list at `/admin` (Change #9).
 *
 * `/admin` is a reserved route that falls through to the SPA; App routes it
 * here via the boot-URL reader (src/screens/admin/adminLink.ts, the verify-link
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
 *  - The staff access token lives ONLY in component state (this session's
 *    memory). Sign-in uses the auth REST endpoint directly rather than the
 *    shared supabase-js client: the shared client persists sessions to
 *    localStorage AND would clobber a child's resident game session on a
 *    shared device — both unacceptable here.
 *  - On a 401 refusal the token is revoked server-side (best-effort
 *    /auth/v1/logout) and dropped, so a child credential never lingers on this
 *    page.
 *  - The page stamps a `robots: noindex` meta while mounted (the SPA head has
 *    no per-route server rendering, so this is the available signal).
 */
import { useCallback, useEffect, useState } from "react";
import { getConfig } from "../config";
import type { FeedbackKind } from "../lib/sync";

/** All user-facing copy in one place for review. */
export const ADMIN_COPY = {
  title: "First Profit — Suggestions",
  signInTitle: "Staff sign-in",
  email: "Email",
  password: "Password",
  signIn: "Sign in",
  signOut: "Sign out",
  refusal: "This page is for First Profit staff.",
  signInFailed: "Sign-in failed. Check the email and password.",
  loadFailed: "Could not load suggestions. Try again.",
  loading: "Loading suggestions…",
  empty: "No suggestions yet.",
  retry: "Retry",
} as const;

export interface AdminSuggestion {
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

/** Defensive row parse: a malformed entry is skipped, never a crash. */
function parseSuggestions(raw: unknown): AdminSuggestion[] {
  if (!isRecord(raw) || raw.ok !== true || !Array.isArray(raw.suggestions)) return [];
  const rows: AdminSuggestion[] = [];
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
  | { name: "list"; rows: AdminSuggestion[] };

export function AdminSuggestions() {
  const [view, setView] = useState<View>({ name: "signin" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The staff access token: COMPONENT STATE ONLY — never localStorage, never
  // the shared (persisting) supabase client. Gone when the tab goes.
  const [token, setToken] = useState<string | null>(null);

  // noindex while mounted: the SPA serves one head for every route, so the
  // reserved staff route stamps the robots signal itself (removed on unmount).
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  /** Best-effort server-side revoke + local drop (refusal path + sign-out link). */
  const signOut = useCallback((accessToken: string | null) => {
    setToken(null);
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

  const fetchSuggestions = useCallback(
    async (accessToken: string) => {
      setView({ name: "loading" });
      let res: Response;
      try {
        const { t120ApiUrl } = getConfig();
        res = await fetch(`${t120ApiUrl.replace(/\/$/, "")}/api/fp/suggestions`, {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        setView({ name: "loadError" });
        return;
      }
      if (res.status === 401) {
        // Byte-identical 401 for EVERY refusal (incl. a child token): show the
        // staff-only copy and sign the session out so the credential never
        // lingers on this page.
        signOut(accessToken);
        setView({ name: "refused" });
        return;
      }
      if (!res.ok) {
        setView({ name: "loadError" });
        return;
      }
      try {
        setView({ name: "list", rows: parseSuggestions(await res.json()) });
      } catch {
        setView({ name: "loadError" });
      }
    },
    [signOut],
  );

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
        const accessToken =
          res.ok && isRecord(data) && typeof data.access_token === "string"
            ? data.access_token
            : null;
        if (!accessToken) {
          setSignInError(ADMIN_COPY.signInFailed);
          return;
        }
        setPassword("");
        setToken(accessToken);
        await fetchSuggestions(accessToken);
      } catch {
        setSignInError(ADMIN_COPY.signInFailed);
      } finally {
        setBusy(false);
      }
    },
    [busy, email, password, fetchSuggestions],
  );

  const input =
    "mt-1 w-full min-h-[44px] rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-2.5 text-sm text-[hsl(25_34%_20%)] outline-none focus:border-build";

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen w-full bg-[hsl(38_46%_95%)] px-4 py-8 text-ink sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="font-display text-2xl font-black text-[hsl(25_34%_20%)]">
          {ADMIN_COPY.title}
        </h1>
        {children}
      </div>
    </main>
  );

  // Signed-out (or never signed in): the minimal staff sign-in form.
  if (token === null && view.name !== "refused") {
    return shell(
      <form onSubmit={signIn} className="mt-6 max-w-sm">
        <h2 className="text-lg font-bold text-[hsl(25_34%_20%)]">{ADMIN_COPY.signInTitle}</h2>
        <label className="mt-4 block text-sm font-bold text-[hsl(25_34%_20%)]">
          {ADMIN_COPY.email}
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
        </label>
        <label className="mt-3 block text-sm font-bold text-[hsl(25_34%_20%)]">
          {ADMIN_COPY.password}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
        </label>
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
          {ADMIN_COPY.signIn}
        </button>
      </form>,
    );
  }

  if (view.name === "refused") {
    return shell(
      <div className="mt-6">
        <p className="text-base font-semibold text-[hsl(25_34%_20%)]">{ADMIN_COPY.refusal}</p>
        <button
          type="button"
          onClick={() => {
            setView({ name: "signin" });
            setSignInError(null);
          }}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.2)] px-5 text-sm font-bold text-[hsl(25_34%_20%)]"
        >
          {ADMIN_COPY.signIn}
        </button>
      </div>,
    );
  }

  if (view.name === "loading") {
    return shell(<p className="mt-6 text-sm text-ink/60">{ADMIN_COPY.loading}</p>);
  }

  if (view.name === "loadError") {
    return shell(
      <div className="mt-6">
        <p className="text-sm font-semibold text-wax">{ADMIN_COPY.loadFailed}</p>
        <button
          type="button"
          onClick={() => token && void fetchSuggestions(token)}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.2)] px-5 text-sm font-bold text-[hsl(25_34%_20%)]"
        >
          {ADMIN_COPY.retry}
        </button>
      </div>,
    );
  }

  // Signed-in list: simple cards, desktop-first but wrapping cleanly at 390px.
  const rows = view.name === "list" ? view.rows : [];
  return shell(
    <>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink/60">
          {rows.length} suggestion{rows.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => {
            signOut(token);
            setView({ name: "signin" });
          }}
          className="inline-flex min-h-[44px] items-center rounded-xl px-3 text-sm font-bold text-build underline underline-offset-2"
        >
          {ADMIN_COPY.signOut}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink/60">{ADMIN_COPY.empty}</p>
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
                <span data-testid="fp-admin-task-id">task {s.taskId}</span>
                <span data-testid="fp-admin-username" className="break-all">
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
