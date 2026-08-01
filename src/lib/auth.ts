/**
 * Auth / session layer over the lazy Supabase singleton.
 *
 * Thin glue only — the GameContext provider orchestrates draft handling and
 * stage routing. This module never logs tokens or passwords.
 *
 * Login contract (Key Technical Decision: "Login route returns tokens; SPA
 * adopts them"): POST `{identifier, password}` to The120's `/api/fp/login`;
 * on 200, adopt the returned session with `supabase.auth.setSession(...)`.
 * The route returns ONE generic failure for every refusal, so this layer makes
 * no attempt to distinguish reasons — any non-200 / network error / malformed
 * body is a flat `{ ok: false }`.
 *
 * Logout (Key Technical Decision: "logout revokes, not just hides"): both idle
 * and explicit logout call `supabase.auth.signOut()` — revoking the refresh
 * token server-side, not merely flipping a flag — and purge `sb-*` session
 * keys. The CALLER decides draft handling (explicit wipes, idle preserves);
 * `logout` just reports which scope ran so the provider can route it.
 */
import { getConfig } from "../config";
import { getSupabase } from "./supabase";

export interface ChildProfile {
  handle: string;
  firstName: string;
}

export type LoginResult =
  | { ok: true; profile: ChildProfile; userId: string | null }
  | { ok: false };

export type LogoutScope = "idle" | "explicit";

interface LoginResponseBody {
  access_token?: unknown;
  refresh_token?: unknown;
  profile?: { handle?: unknown; firstName?: unknown };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Authenticate a child through The120's login route and adopt the session.
 * Returns `{ ok: true, profile }` only when the route returns 200 with usable
 * tokens AND `setSession` succeeds; every other outcome is `{ ok: false }`.
 */
export async function loginChild(identifier: string, password: string): Promise<LoginResult> {
  try {
    const { t120ApiUrl } = getConfig();
    const res = await fetch(`${t120ApiUrl.replace(/\/$/, "")}/api/fp/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });

    if (!res.ok) return { ok: false };

    const body = (await res.json()) as LoginResponseBody;
    const accessToken = asString(body.access_token);
    const refreshToken = asString(body.refresh_token);
    if (!accessToken || !refreshToken) return { ok: false };

    const supabase = getSupabase();
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) return { ok: false };

    return {
      ok: true,
      userId: data.user?.id ?? null,
      profile: {
        handle: asString(body.profile?.handle),
        firstName: asString(body.profile?.firstName),
      },
    };
  } catch {
    // Network failure, non-JSON body, etc. — the route already flattens every
    // reason to one generic failure; mirror that here. Never surface details.
    return { ok: false };
  }
}

/** Remove any residual `sb-*` Supabase session keys from localStorage. */
function purgeSupabaseStorageKeys(): void {
  if (typeof window === "undefined") return;
  const store = window.localStorage;
  const stale: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key !== null && key.startsWith("sb-")) stale.push(key);
  }
  for (const key of stale) store.removeItem(key);
}

/**
 * Revoke the session server-side and purge `sb-*` keys. Returns the scope so the
 * provider can route draft handling (explicit → wipe drafts, idle → preserve).
 */
export async function logout(scope: LogoutScope): Promise<LogoutScope> {
  const supabase = getSupabase();
  try {
    await supabase.auth.signOut();
  } catch {
    // Server-side revocation failed (network hiccup, etc.). Surface it — a
    // refresh token that was NOT revoked is a real shared-device risk — but do
    // not strand the UI: we still purge local session keys and route on.
    // Token-free warning only; never log the session or its contents.
    console.warn(`[fp:auth] logout (${scope}): server-side session revocation failed; purged local keys only.`);
  }
  purgeSupabaseStorageKeys();
  return scope;
}

/** The current authenticated user's id, resolved from the persisted session. */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}
