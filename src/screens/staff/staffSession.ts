/**
 * The staff session: its storage key, its shape, and the only readers/writers.
 *
 * Pure over `window.sessionStorage` (staffLink.ts pure-helper style) so the
 * shell owns policy and this module owns nothing but persistence.
 *
 * SECURITY posture:
 *  - sessionStorage, NOT localStorage: it is scoped to ONE tab, it is not
 *    shared with the other tabs of this origin, and it never touches the key
 *    the game client owns. What it does NOT promise is death at tab close —
 *    "reopen closed tab", crash recovery and mobile session restore all
 *    rehydrate it verbatim, so it must not be described as a guaranteed
 *    end-of-sitting wipe.
 *  - Because of that, a grant's expiry is STORED, and `readSession` refuses to
 *    rehydrate a session that is both expired AND unrenewable. An expired
 *    access token WITH a refresh token still restores: renewing it is the
 *    normal hourly path, and refusing there would sign staff out every hour.
 *  - This page's OWN key, never the shared supabase-js client's.
 */

/** This page's OWN sessionStorage key — never the game client's. */
export const STAFF_SESSION_KEY = "fp.staff.session";

export interface StaffSession {
  accessToken: string;
  /** Absent when the grant returned no refresh token (nothing to renew with). */
  refreshToken: string | null;
  /** Epoch ms the ACCESS token expires, when the grant said so. */
  expiresAt?: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Read the persisted staff session. Any storage failure (private mode,
 * disabled storage, hand-mangled JSON) is indistinguishable from "not signed
 * in" — as is a session that has expired with no way to renew it.
 */
export function readSession(now: number = Date.now()): StaffSession | null {
  try {
    const raw = window.sessionStorage.getItem(STAFF_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.accessToken !== "string" || !parsed.accessToken) {
      return null;
    }
    const refreshToken = typeof parsed.refreshToken === "string" ? parsed.refreshToken : null;
    const expiresAt =
      typeof parsed.expiresAt === "number" && Number.isFinite(parsed.expiresAt)
        ? parsed.expiresAt
        : undefined;
    // Dead AND unrenewable: nothing here can ever produce a working request.
    if (expiresAt !== undefined && expiresAt <= now && !refreshToken) return null;
    const session: StaffSession = { accessToken: parsed.accessToken, refreshToken };
    if (expiresAt !== undefined) session.expiresAt = expiresAt;
    return session;
  } catch {
    return null;
  }
}

export function writeSession(session: StaffSession): void {
  try {
    window.sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable: the session still works for this page view, it just
    // will not survive a refresh. Never a crash.
  }
}

export function clearSession(): void {
  try {
    window.sessionStorage.removeItem(STAFF_SESSION_KEY);
  } catch {
    // Nothing to clear against.
  }
}

/**
 * Pull a session out of a Supabase token-grant response (password OR refresh).
 *
 * GoTrue sends `expires_at` (epoch SECONDS) and/or `expires_in` (seconds from
 * now); either is enough. When neither is present the key is OMITTED rather
 * than stored as null, so the persisted shape stays exactly what it was before
 * expiries were recorded.
 */
export function sessionFromGrant(data: unknown, now: number = Date.now()): StaffSession | null {
  if (!isRecord(data) || typeof data.access_token !== "string" || !data.access_token) return null;
  const session: StaffSession = {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
  };
  if (typeof data.expires_at === "number" && Number.isFinite(data.expires_at)) {
    session.expiresAt = data.expires_at * 1000;
  } else if (typeof data.expires_in === "number" && Number.isFinite(data.expires_in)) {
    session.expiresAt = now + data.expires_in * 1000;
  }
  return session;
}
