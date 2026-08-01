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

/* ───────────────────────────── Signup (Slice B Unit 9) ────────────────────────
 *
 * The parent Start Building flow talks to the SAME The120 backend as loginChild,
 * with the same fetch+shape discipline: every non-2xx / malformed body / network
 * fault collapses to a flat failure and NEVER throws to the UI. Four POSTs and
 * one GET, in sequence across an email round-trip:
 *
 *   startSignup   → POST /api/fp/signup          (no session; sends verify mail)
 *   verifySignup  → POST /api/fp/signup/verify   (returns + ADOPTS parent session)
 *   recordSignupConsent → POST /api/fp/signup/consent (parent Bearer → consent row)
 *   createSignupChild → POST /api/fp/signup/child (parent Bearer → childId)
 *   fetchConsentPolicy → GET /api/fp/signup/consent-policy (rendered policy)
 *
 * The verify step is what authorizes the cross-origin consent + child mint (Plan
 * Revision 1): it adopts the parent session via setSession, and both
 * recordSignupConsent and createSignupChild send that session's access token as
 * `Authorization: Bearer`. Consent MUST land before the mint (the child route is
 * consent-gated; without the consent row the mint fails `consent_required`).
 */

/** The child age bands, mirroring the backend `child_age_band` enum. */
export type SignupAgeBand = "under_13" | "13_to_15" | "16_plus";
export type SignupCredentialChoice = "existing_credential" | "provision_workspace";

export interface StartSignupInput {
  parentName: string;
  parentEmail: string;
  parentPassword: string;
  childFirstName: string;
  childAgeBand: SignupAgeBand;
  /** ISO yyyy-mm-dd; optional (the age band is the required signal). */
  childDob?: string;
  jurisdiction: string;
  credentialChoice: SignupCredentialChoice;
}

export type StartSignupResult =
  // `attemptId` is the opaque handle the child-mint step needs; it may be null if
  // an older backend build does not surface it yet (child-mint then can't run).
  | { ok: true; attemptId: string | null }
  // `existingAccount` is the backend's deliberate R10 enumeration signal — a
  // returning parent the UI can route to login, distinct from a generic failure.
  | { ok: false; existingAccount: boolean };

interface StartSignupResponseBody {
  ok?: unknown;
  status?: unknown;
  attemptId?: unknown;
}

/**
 * Begin a signup: create the parent account (random password, no session) and
 * send the verification email. Returns the attempt id to carry through the wait.
 * The backend returns ONE generic 401 for every refusal EXCEPT the documented
 * `existing_account` 200 signal, which is surfaced here so the UI can route a
 * returning parent to login.
 */
export async function startSignup(input: StartSignupInput): Promise<StartSignupResult> {
  try {
    const { t120ApiUrl } = getConfig();
    const body: Record<string, unknown> = {
      parentName: input.parentName,
      parentEmail: input.parentEmail,
      parentPassword: input.parentPassword,
      childFirstName: input.childFirstName,
      childAgeBand: input.childAgeBand,
      jurisdiction: input.jurisdiction,
      credentialChoice: input.credentialChoice,
    };
    if (input.childDob) body.childDob = input.childDob;

    const res = await fetch(`${t120ApiUrl.replace(/\/$/, "")}/api/fp/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // The existing-account signal rides a 200; every other refusal is a 401 with a
    // generic body. Parse the body either way and branch on its `status`.
    let parsed: StartSignupResponseBody | null = null;
    try {
      parsed = (await res.json()) as StartSignupResponseBody;
    } catch {
      parsed = null;
    }

    if (parsed && parsed.status === "existing_account") {
      return { ok: false, existingAccount: true };
    }
    if (res.ok && parsed && parsed.ok === true && parsed.status === "verification_pending") {
      const attemptId = asString(parsed.attemptId);
      return { ok: true, attemptId: attemptId || null };
    }
    return { ok: false, existingAccount: false };
  } catch {
    return { ok: false, existingAccount: false };
  }
}

export interface VerifySignupInput {
  /** Present for a real emailed link; the backend also accepts a tokenless
   *  is_test path, but the SPA always carries the token from the return link. */
  token?: string;
  email: string;
  parentPassword: string;
}

export type VerifySignupResult = { ok: true } | { ok: false };

interface VerifyResponseBody {
  access_token?: unknown;
  refresh_token?: unknown;
}

/**
 * Complete email verification and ADOPT the returned parent session (Rev 1). On
 * a 200 with usable tokens, `setSession` makes the SPA the authenticated parent
 * so the cross-origin child-mint call can carry the Bearer access token. Every
 * other outcome (bad/expired token, wrong password, network fault) is a flat
 * `{ ok: false }` — the route already flattens all reasons to one generic 401.
 */
export async function verifySignup(input: VerifySignupInput): Promise<VerifySignupResult> {
  try {
    const { t120ApiUrl } = getConfig();
    const body: Record<string, unknown> = {
      email: input.email,
      password: input.parentPassword,
    };
    if (input.token) body.token = input.token;

    const res = await fetch(`${t120ApiUrl.replace(/\/$/, "")}/api/fp/signup/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false };

    const parsed = (await res.json()) as VerifyResponseBody;
    const accessToken = asString(parsed.access_token);
    const refreshToken = asString(parsed.refresh_token);
    if (!accessToken || !refreshToken) return { ok: false };

    const supabase = getSupabase();
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export interface CreateSignupChildInput {
  attemptId: string;
  childFirstName: string;
  credentialChoice: SignupCredentialChoice;
  /** Path (a) only; omitted on the provision path (its credential is the
   *  provisioned Workspace account, not a parent-set password). */
  childPassword?: string;
}

export type CreateSignupChildResult = { ok: true; childId: string } | { ok: false };

interface CreateChildResponseBody {
  ok?: unknown;
  childId?: unknown;
}

/**
 * Mint the child under the ADOPTED parent session (Rev 1): the request carries
 * that session's access token as `Authorization: Bearer`, which RLS-authorizes
 * the child-row insert. Requires verifySignup to have run first (so a parent
 * session exists); with no session, or any non-2xx / malformed body, returns a
 * flat `{ ok: false }`.
 */
export async function createSignupChild(
  input: CreateSignupChildInput,
): Promise<CreateSignupChildResult> {
  try {
    const { t120ApiUrl } = getConfig();
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return { ok: false };

    const body: Record<string, unknown> = {
      attemptId: input.attemptId,
      childFirstName: input.childFirstName,
      credentialChoice: input.credentialChoice,
    };
    // Path (a) sends the parent-set child password; path (b) sends none.
    if (input.credentialChoice === "existing_credential" && input.childPassword) {
      body.childPassword = input.childPassword;
    }

    const res = await fetch(`${t120ApiUrl.replace(/\/$/, "")}/api/fp/signup/child`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false };

    const parsed = (await res.json()) as CreateChildResponseBody;
    const childId = asString(parsed.childId);
    if (parsed.ok !== true || !childId) return { ok: false };
    return { ok: true, childId };
  } catch {
    return { ok: false };
  }
}

export interface RecordSignupConsentInput {
  attemptId: string;
  /** The version + hash the client's bundle RENDERED (bind-to-rendered proof) —
   *  echoed EXACTLY as fetched from the backend's consent policy. */
  echoedVersion: string;
  echoedHash: string;
  method: string;
  childAgeBand: SignupAgeBand;
  /** ISO yyyy-mm-dd; optional (the age band is the required legal signal). */
  childDob?: string;
  jurisdiction: string;
}

/**
 * Record verifiable parental consent under the ADOPTED parent session (Unit 9
 * review, FIX 1): the request carries that session's access token as
 * `Authorization: Bearer`, mirroring createSignupChild. This is the consent-record
 * seam WITHOUT which every real child mint fails `consent_required` — it must run
 * AFTER verifySignup (so the parent session exists) and BEFORE createSignupChild.
 *
 * Flat `{ ok }` result, NEVER throws. A duplicate (a retried consent) is
 * idempotent success on the backend, so it surfaces here as `{ ok: true }`. Any
 * non-2xx / malformed body / missing session / network fault is `{ ok: false }`.
 */
export async function recordSignupConsent(
  input: RecordSignupConsentInput,
): Promise<{ ok: boolean }> {
  try {
    const { t120ApiUrl } = getConfig();
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return { ok: false };

    const body: Record<string, unknown> = {
      attemptId: input.attemptId,
      echoedVersion: input.echoedVersion,
      echoedHash: input.echoedHash,
      method: input.method,
      childAgeBand: input.childAgeBand,
      jurisdiction: input.jurisdiction,
    };
    if (input.childDob) body.childDob = input.childDob;

    const res = await fetch(`${t120ApiUrl.replace(/\/$/, "")}/api/fp/signup/consent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false };

    const parsed = (await res.json()) as { ok?: unknown };
    return { ok: parsed.ok === true };
  } catch {
    return { ok: false };
  }
}

/** The rendered consent policy fetched from the backend (source of truth). */
export interface FetchedConsentPolicy {
  namespace: string;
  version: string;
  hash: string;
  method: string;
  text: string;
}

interface ConsentPolicyResponseBody {
  namespace?: unknown;
  version?: unknown;
  hash?: unknown;
  method?: unknown;
  text?: unknown;
}

/**
 * Fetch the rendered consent policy (version + text + hash + namespace + method)
 * so the client displays and echoes exactly what the server records (consent
 * binds to the rendered text). Returns null on any failure; the caller falls
 * back to the byte-aligned local default. Never throws.
 */
export async function fetchConsentPolicy(): Promise<FetchedConsentPolicy | null> {
  try {
    const { t120ApiUrl } = getConfig();
    const res = await fetch(`${t120ApiUrl.replace(/\/$/, "")}/api/fp/signup/consent-policy`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;

    const parsed = (await res.json()) as ConsentPolicyResponseBody;
    const namespace = asString(parsed.namespace);
    const version = asString(parsed.version);
    const hash = asString(parsed.hash);
    const method = asString(parsed.method);
    const text = asString(parsed.text);
    // A usable policy needs the binding trio (version + hash + text); a partial
    // body must fall back to the local default, not echo a half-formed policy.
    if (!namespace || !version || !hash || !method || !text) return null;
    return { namespace, version, hash, method, text };
  } catch {
    return null;
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
