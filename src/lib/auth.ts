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
 * and explicit logout call `supabase.auth.signOut({ scope: "local" })` —
 * revoking THIS device's refresh token server-side, not merely flipping a
 * flag (and never globally: one device's logout must not expire the account's
 * other sessions — BUG-003) — and purge `sb-*` session keys. The CALLER decides draft handling (explicit wipes, idle preserves);
 * `logout` just reports which scope ran so the provider can route it.
 */
import { getConfig, isPublicSiteEnabled } from "../config";
import { asCoverStatus, asCoverUrl } from "./cover";
import { getSupabase } from "./supabase";

export interface ChildProfile {
  handle: string;
  firstName: string;
}

/**
 * Everything the SPA adopts from a successful sign-in, whichever door it came
 * through. Both doors — the password login and the one-time handoff exchange —
 * return a BYTE-SHAPE-IDENTICAL 200 body (the120 `login-rules.ts` `FpSessionBody`
 * is the single source for both), so they parse to the same value and feed the
 * same `adoptSession` in GameContext.
 */
export interface ChildSession {
  profile: ChildProfile;
  userId: string | null;
  /**
   * The child's grade from the sign-in response (Unit 3; R9): the roster's
   * read-time derivation, or null when the roster doesn't know. Number-or-
   * null coercion only — an older backend build without the field, or a
   * malformed value, is null (the ask-once flow handles null).
   */
  grade: number | null;
  /**
   * The child's comic cover (new-user-flow-v3, Unit 7; R12), or null.
   *
   * ── HOW THIS APP RECEIVES A COVER, AND WHY THAT FORM ──
   * The120 sends the PICTURE, not an address for one: a self-contained
   * `data:image/svg+xml;base64,…` URL read straight off the child's row. There
   * is exactly ONE cover per child — rendered once during their parent's signup
   * and stored — so both of The120's sign-in doors hand over the same bytes and
   * this app never has to ask for them. No second network hop, no cover
   * endpoint to CORS-allow, and no public per-child URL that would leak a kid's
   * first name to anyone who guessed an id.
   *
   * ⚠ IT IS ONLY EVER AN `<img src>`. The bytes are an SVG DOCUMENT, and SVG is
   * live markup: inlined into the DOM it would be a script-execution sink. In
   * an `<img>` the browser parses it sandboxed — no script, no external fetch —
   * which is exactly the context The120's compositor escapes its untrusted
   * interpolations for. `asCoverUrl` (./cover) refuses anything that is not
   * that form, so a compromised or confused response cannot change the
   * rendering context out from under that reasoning.
   *
   * OPTIONAL ON THE WIRE: absent for every account predating v3, and absent
   * from ANY response The120 served before its own Unit 7 deploy. Absent → null
   * → the procedural sprite. Never an error, never a placeholder.
   */
  coverUrl: string | null;
  /**
   * The roster's raw cover status word, or null. Carried so the app can tell
   * "no cover" from "a cover exists that this door cannot hand over" — NOT so
   * it can render progress copy. Nothing in this build queues a redraw, so
   * there is no pending state to narrate.
   */
  coverStatus: string | null;
}

export type LoginResult = ({ ok: true } & ChildSession) | { ok: false };

/**
 * Why a scope: `idle` and `explicit` route DRAFT handling in the provider;
 * `signin` is the session boundary a new sign-in attempt opens BEFORE its
 * network call (v3 Unit 6 review, FIX 5) — same revoke + purge, no draft
 * decision of its own. It exists so the warn below names what actually ran.
 */
export type LogoutScope = "idle" | "explicit" | "signin";

/* ───────────────────────────── Bounded transport ─────────────────────────────
 *
 * A bare `fetch` has NO timeout. On the sign-in doors that is not a slow
 * request, it is a STRANDED FAMILY (v3 Unit 6 review, FIX 2): the handoff
 * landing shows "Signing you in…" with the boot deliberately parked, and a
 * response that never finishes (captive portal, dead middlebox, a body that
 * stalls mid-stream) leaves that spinner up forever with no way out but a
 * reload nobody told them to do.
 *
 * So both doors go through `fetchWithTimeout`. An abort rejects the fetch,
 * which the callers' existing `catch` already flattens to `{ ok: false }` —
 * meaning a HANG and a REFUSAL are byte-identical to the UI, which is exactly
 * the contract those screens are built for. No HTTP dependency; AbortController
 * is available in every browser we support and in jsdom.
 */

/** Ceiling for a sign-in round trip. Generous enough for a bad phone network,
 *  short enough that a stuck exchange still reaches the recovery screen while
 *  the family is still looking at it. */
export const SIGNIN_TIMEOUT_MS = 12_000;

/** `fetch` with a hard deadline. Rejects (AbortError) on timeout — callers
 *  treat that identically to any other transport fault. Always clears the
 *  timer, success or failure, so no stray handle keeps the tab awake. */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve a promise or give up after `ms`. Used for calls we cannot abort
 *  (supabase-js exposes no signal) where hanging is worse than not knowing. */
async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("deadline")), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

interface LoginResponseBody {
  access_token?: unknown;
  refresh_token?: unknown;
  profile?: { handle?: unknown; firstName?: unknown };
  grade?: unknown;
  coverUrl?: unknown;
  coverStatus?: unknown;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Number-or-null coercion for the login `grade` field: only a finite integer
 *  survives; anything else (absent, null, string, NaN) is null. */
function asGrade(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}


/**
 * Parse a sign-in door's response and ADOPT the session it carries. Shared by
 * `loginChild` and `redeemSignInToken` because the two doors answer the same
 * 200 body by construction (the120 `FpSessionBody`) — one parser means the
 * handoff can never drift into accepting a shape the login path would refuse.
 * Any non-200 / missing token / failed `setSession` is a flat `{ ok: false }`.
 */
async function adoptSessionResponse(res: {
  ok: boolean;
  json: () => Promise<unknown>;
}): Promise<LoginResult> {
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
    grade: asGrade(body.grade),
    // OPTIONAL ON THE WIRE (v3 Unit 7). A response from a The120 build that
    // predates the cover — which is EVERY response until its deploy lands, and
    // this repo's deploy may land first — simply has neither key, and both
    // coercions answer null. No branch, no version check, no error.
    coverUrl: asCoverUrl(body.coverUrl),
    coverStatus: asCoverStatus(body.coverStatus),
  };
}

/**
 * Authenticate a child through The120's login route and adopt the session.
 * Returns `{ ok: true, profile }` only when the route returns 200 with usable
 * tokens AND `setSession` succeeds; every other outcome is `{ ok: false }`.
 */
export async function loginChild(identifier: string, password: string): Promise<LoginResult> {
  try {
    const { t120ApiUrl } = getConfig();
    const res = await fetchWithTimeout(
      `${t120ApiUrl.replace(/\/$/, "")}/api/fp/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      },
      SIGNIN_TIMEOUT_MS,
    );
    return await adoptSessionResponse(res);
  } catch {
    // Network failure, non-JSON body, etc. — the route already flattens every
    // reason to one generic failure; mirror that here. Never surface details.
    return { ok: false };
  }
}

/* ────────────────── Handoff sign-in (new-user-flow-v3, Unit 6) ───────────────
 *
 * The120's account-ready screen opens `firstprofit.school/auth/enter#code=<c>`
 * in a new tab. This is the SECOND sign-in door: exchange that one-time code
 * for the same token pair the login route returns.
 *
 * Contract (the120 `app/api/fp/handoff/exchange`, built + verified in Unit 5):
 *  - `POST {"code":"…"}`, `Content-Type: application/json`, `mode: "cors"`,
 *    NO credentials — the browser's Origin (firstprofit.school, or localhost in
 *    dev) is what the route allowlists, so a cookie would only be a CSRF
 *    surface with no upside.
 *  - 200 is byte-shape-identical to `/api/fp/login`'s success body, so it goes
 *    straight through the SAME `adoptSessionResponse`.
 *  - EVERY non-200 is DELIBERATELY indistinguishable: 401 bodies are byte-
 *    identical for unknown / already-consumed / expired, and 403 means the
 *    Origin was refused. There is no reason to parse, so this never tries —
 *    and NO retry can help (single-use, 120s TTL, server owns the burn).
 */

export type RedeemSignInTokenResult = LoginResult;

/**
 * Redeem a one-time handoff code for a child session. Flat `{ ok: false }` on
 * every refusal (401/403 alike), transport fault, TIMEOUT, malformed body, or
 * failed `setSession`; NEVER throws, and NEVER hangs (SIGNIN_TIMEOUT_MS). The
 * caller must treat failure as TERMINAL — see `src/screens/auth/Enter.tsx` for
 * the required recovery surface.
 */
export async function redeemSignInToken(code: string): Promise<RedeemSignInTokenResult> {
  try {
    const { t120ApiUrl } = getConfig();
    const res = await fetchWithTimeout(
      `${t120ApiUrl.replace(/\/$/, "")}/api/fp/handoff/exchange`,
      {
        method: "POST",
        mode: "cors",
        // Explicit, not incidental: the exchange authenticates by Origin + the
        // one-time code only. Never send ambient credentials cross-origin.
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      },
      SIGNIN_TIMEOUT_MS,
    );
    return await adoptSessionResponse(res);
  } catch {
    return { ok: false };
  }
}

export type SubmitBirthYearResult = { ok: true; grade: number } | { ok: false };

/**
 * The ask-once birth-year write-back (Unit 3; R9/R10): POST `{birthYear}` to
 * The120's `/api/fp/grade` under the CURRENT session's access token (the
 * child's Bearer token, mirroring createSignupChild's session read). On a 200
 * with `{ok:true, grade}` the server has written the roster and returns the
 * derived grade so the caller can adopt the band without a re-login.
 *
 * SERVER-AUTHORITATIVE, FILL-ONLY (contract alignment with The120): when the
 * roster grade is ALREADY set, the route performs NO write and returns the
 * EXISTING roster grade — which may DIFFER from what this birth year derives.
 * The returned grade is therefore authoritative in every case: the caller
 * (GameContext.submitGradeAnswer) must adopt `grade` from the response as-is,
 * never re-derive locally on an `ok:true`.
 *
 * Flat-failure discipline like loginChild: the route answers ONE generic 401
 * for every refusal (bad token, implausible year, rate limited), so every
 * non-2xx / malformed body / missing session / network fault collapses to
 * `{ ok: false }` and NEVER throws. The route is rate limited (5 per 15 min
 * per user) — this function makes exactly one attempt; any retry is the
 * caller's explicit, bounded choice.
 *
 * NEVER logs the birth year or the grade (child data rides the same
 * never-log rule as credentials).
 */
export async function submitBirthYear(birthYear: number): Promise<SubmitBirthYearResult> {
  try {
    const { t120ApiUrl } = getConfig();
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return { ok: false };

    const res = await fetch(`${t120ApiUrl.replace(/\/$/, "")}/api/fp/grade`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ birthYear }),
    });
    if (!res.ok) return { ok: false };

    const parsed = (await res.json()) as { ok?: unknown; grade?: unknown };
    if (parsed.ok !== true || typeof parsed.grade !== "number" || !Number.isInteger(parsed.grade)) {
      return { ok: false };
    }
    return { ok: true, grade: parsed.grade };
  } catch {
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

export interface StartSignupInput {
  parentName: string;
  parentEmail: string;
  parentPassword: string;
  childFirstName: string;
  childAgeBand: SignupAgeBand;
  /** ISO yyyy-mm-dd; optional (the age band is the required signal). */
  childDob?: string;
  jurisdiction: string;
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
  /** The parent-set child password (single path, U15; always required). */
  childPassword: string;
}

// `username` is the globally-unique fp_username the mint claimed (U12) — the
// child's login key, surfaced so the confirmation can show it to the parent.
export type CreateSignupChildResult =
  | { ok: true; childId: string; username: string }
  | { ok: false };

interface CreateChildResponseBody {
  ok?: unknown;
  childId?: unknown;
  username?: unknown;
}

/**
 * Mint the child under the ADOPTED parent session (Rev 1): the request carries
 * that session's access token as `Authorization: Bearer`, which RLS-authorizes
 * the child-row insert. Requires verifySignup to have run first (so a parent
 * session exists); with no session, or any non-2xx / malformed body, returns a
 * flat `{ ok: false }`. On success it surfaces the generated `fp_username` the
 * child logs in with (U15), which may be empty on an idempotent replay.
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
      childPassword: input.childPassword,
    };

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
    return { ok: true, childId, username: asString(parsed.username) };
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

/* ─────────────────── Public site (real-public-site plan, Unit 4) ─────────────
 *
 * Client for The120's /api/fp/site* registry surface: the self-read (the
 * split-storage READ-BACK hydrate and the Your Site room consume), availability,
 * the atomic claim, and the explicit go-live publish. The exact serialized
 * response vocabulary is PINNED in src/lib/__tests__/siteApi.test.ts against
 * the contract blocks in the the120 route headers:
 *   app/api/fp/site/route.ts, availability/route.ts, claim/route.ts,
 *   publish/route.ts (+ site-rules.ts for the one generic 401 refusal).
 *
 * Discipline (same as loginChild/submitBirthYear):
 *  - NEVER throws; every transport fault / malformed body / non-200 collapses
 *    to the function's flat failure. The server's designed branches (taken /
 *    yours / invalid / already-claimed / locked / outage) ride HTTP 200 with a
 *    structured body and are surfaced as typed `{ok:false, reason}` results;
 *    the one generic 401 (auth/gate/rate — deliberately indistinguishable) is
 *    never told apart from an outage.
 *  - Requests carry the CURRENT session's access token as `Authorization:
 *    Bearer` (the submitBirthYear/createSignupChild pattern) — no cookie
 *    fallback, CSRF-resistant by construction.
 *  - FEATURE FLAG: while `VITE_ENABLE_PUBLIC_SITE` is off (isPublicSiteEnabled
 *    false) availability/claim/publish short-circuit to their flat failure
 *    WITHOUT a network call or a session read — the client half of the Unit 7
 *    gate. fetchSiteStatus is deliberately NOT flag-gated: the server's
 *    self-read is ungated (own-row status read-back only), so a published row
 *    must reach the Your Site room even in a flag-off build.
 *  - claim/publish keep their `reason` vocabulary pinned to the server
 *    contract: the flag-off short-circuit and every transport/auth failure
 *    surface as reason "outage" (the UI's outage treatment — "try again in a
 *    bit" — is right for all of them). The optional CLIENT-LOCAL `cause`
 *    field (SiteFailureCause) records which collapse happened for Unit 5/6
 *    telemetry/UX; it is never part of the wire contract.
 */

/** The self-read/claim status ladder the server may answer (site-rules.ts
 *  deriveSiteStatus). `offline` covers parent-unpublished AND operator-locked
 *  without distinguishing them to the child. */
const SITE_API_STATUSES = ["none", "claimed", "published", "offline"] as const;
export type SiteApiStatus = (typeof SITE_API_STATUSES)[number];

function asSiteApiStatus(value: unknown): SiteApiStatus | null {
  return typeof value === "string" &&
    (SITE_API_STATUSES as readonly string[]).includes(value)
    ? (value as SiteApiStatus)
    : null;
}

const HANDLE_VERDICTS = ["available", "taken", "yours", "invalid"] as const;
export type HandleVerdict = (typeof HANDLE_VERDICTS)[number];

/** Keep only string entries — a malformed suggestion must never reach the UI. */
function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** The current session's access token, or null (never throws). */
async function currentAccessToken(): Promise<string | null> {
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** The self-read's projected (server-sanitized) own-row content — exactly
 *  what the public page renders (the120 route.ts contract, Unit 7). */
export interface SiteProjectedContent {
  headline: string;
  oneLiner: string;
}

export type FetchSiteStatusResult =
  | { ok: true; handle: string | null; status: SiteApiStatus; projected: SiteProjectedContent | null }
  | { ok: false };

/** Parse the self-read's `projected` field: an object with two strings, else
 *  null (absent field, older backend build, or malformed shape — the caller
 *  renders "no projection known", never a fabricated one). */
function asProjected(value: unknown): SiteProjectedContent | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as { headline?: unknown; oneLiner?: unknown };
  if (typeof v.headline !== "string" || typeof v.oneLiner !== "string") return null;
  return { headline: v.headline, oneLiner: v.oneLiner };
}

/**
 * The account's OWN registry-row status (GET /api/fp/site) — the read-back the
 * hydrate path and the Your Site room consume. The endpoint is deliberately
 * ungated server-side (it reveals only the caller's own row and answers `none`
 * while the feature is dark), so this client is NOT flag-gated either: a child
 * whose row is already published must see their real link even in a flag-off
 * build (the Unit 4 blanket short-circuit was caution, deliberately narrowed —
 * only availability/claim/publish stay flag-gated). A flat `{ok:false}`
 * (outage / refusal / network) means "unknown" to the caller —
 * NEVER a fake handle or status: a non-`none` status without a string handle
 * is refused rather than half-adopted.
 */
export async function fetchSiteStatus(): Promise<FetchSiteStatusResult> {
  try {
    const { t120ApiUrl } = getConfig();
    const accessToken = await currentAccessToken();
    if (!accessToken) return { ok: false };

    const res = await fetch(`${t120ApiUrl.replace(/\/$/, "")}/api/fp/site`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { ok: false };

    const parsed = (await res.json()) as {
      ok?: unknown;
      handle?: unknown;
      status?: unknown;
      projected?: unknown;
    };
    if (parsed.ok !== true) return { ok: false };
    const status = asSiteApiStatus(parsed.status);
    if (!status) return { ok: false };
    const handle = typeof parsed.handle === "string" && parsed.handle ? parsed.handle : null;
    // A claimed/published/offline row ALWAYS has a handle; a body that claims
    // otherwise is malformed — refuse it rather than surface a handle-less
    // "published" (the never-a-fake-handle rule).
    if (status !== "none" && handle === null) return { ok: false };
    return { ok: true, handle, status, projected: asProjected(parsed.projected) };
  } catch {
    return { ok: false };
  }
}

export type CheckHandleAvailabilityResult =
  | { ok: true; verdict: HandleVerdict; suggestions: string[] }
  | { ok: false };

/**
 * Availability of a candidate handle (POST /api/fp/site/availability). The
 * server runs the FULL pipeline (normalize → format → reserved → blocklist →
 * taken) and is the only authority (the echo-the-server learning — this client
 * never re-validates); `yours` means the account's own handle. Suggestions
 * ride only the `taken` verdict. Flat `{ok:false}` for outage/refusal/network.
 */
export async function checkHandleAvailability(
  handle: string,
): Promise<CheckHandleAvailabilityResult> {
  try {
    if (!isPublicSiteEnabled()) return { ok: false };
    const { t120ApiUrl } = getConfig();
    const accessToken = await currentAccessToken();
    if (!accessToken) return { ok: false };

    const res = await fetch(`${t120ApiUrl.replace(/\/$/, "")}/api/fp/site/availability`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ handle }),
    });
    if (!res.ok) return { ok: false };

    const parsed = (await res.json()) as {
      ok?: unknown;
      verdict?: unknown;
      suggestions?: unknown;
    };
    if (parsed.ok !== true) return { ok: false };
    const verdict =
      typeof parsed.verdict === "string" &&
      (HANDLE_VERDICTS as readonly string[]).includes(parsed.verdict)
        ? (parsed.verdict as HandleVerdict)
        : null;
    if (!verdict) return { ok: false };
    return { ok: true, verdict, suggestions: asStringArray(parsed.suggestions) };
  } catch {
    return { ok: false };
  }
}

/**
 * CLIENT-LOCAL diagnostic for an `outage`-shaped failure (Unit 4 review, P2).
 * NOT part of the wire contract: never sent to the120, never pinned against
 * its routes — the wire `reason` vocabulary stays exactly the server's. Purely
 * for Unit 5/6 telemetry/UX decisions (e.g. "flag-off" should hide the
 * affordance, "transport" may retry, "server" waits):
 *  - "flag-off":   VITE_ENABLE_PUBLIC_SITE is off (client short-circuit).
 *  - "no-session": no resolvable access token (nothing was sent).
 *  - "transport":  we could not talk or parse — fetch threw / body unreadable.
 *  - "server":     the server answered and it was not success — a non-200
 *                  refusal (incl. the generic 401), a structured outage, an
 *                  unknown reason, or a malformed 200 payload.
 */
export type SiteFailureCause = "flag-off" | "no-session" | "transport" | "server";

export type ClaimHandleResult =
  | { ok: true; handle: string; status: SiteApiStatus }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "taken"; suggestions: string[] }
  | { ok: false; reason: "already-claimed"; handle: string }
  | { ok: false; reason: "outage"; cause?: SiteFailureCause };

function claimOutage(cause: SiteFailureCause): ClaimHandleResult {
  return { ok: false, reason: "outage", cause };
}

/**
 * Claim a handle for this account (POST /api/fp/site/claim). The arbiter is
 * the server's DB unique constraint; a lost race is the DESIGNED `taken`
 * branch with fresh suggestions, re-claiming your own handle is idempotent
 * success, and a second different handle answers `already-claimed` with the
 * held handle (no renames in v1). On success the response carries the
 * CANONICAL (normalized) handle + the row's status. Everything transport-
 * shaped — flag off, no session, the generic 401, network faults, malformed
 * bodies, unknown reasons — collapses to reason "outage".
 */
export async function claimHandle(handle: string): Promise<ClaimHandleResult> {
  try {
    if (!isPublicSiteEnabled()) return claimOutage("flag-off");
    const { t120ApiUrl } = getConfig();
    const accessToken = await currentAccessToken();
    if (!accessToken) return claimOutage("no-session");

    const res = await fetch(`${t120ApiUrl.replace(/\/$/, "")}/api/fp/site/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ handle }),
    });
    if (!res.ok) return claimOutage("server");

    const parsed = (await res.json()) as {
      ok?: unknown;
      handle?: unknown;
      status?: unknown;
      reason?: unknown;
      suggestions?: unknown;
    };
    if (parsed.ok === true) {
      const status = asSiteApiStatus(parsed.status);
      if (typeof parsed.handle === "string" && parsed.handle && status) {
        return { ok: true, handle: parsed.handle, status };
      }
      // ok:true with a malformed payload must never mint a fake success.
      return claimOutage("server");
    }
    switch (parsed.reason) {
      case "invalid":
        return { ok: false, reason: "invalid" };
      case "taken":
        return { ok: false, reason: "taken", suggestions: asStringArray(parsed.suggestions) };
      case "already-claimed":
        return typeof parsed.handle === "string" && parsed.handle
          ? { ok: false, reason: "already-claimed", handle: parsed.handle }
          : claimOutage("server");
      default:
        return claimOutage("server");
    }
  } catch {
    return claimOutage("transport");
  }
}

export type PublishSiteResult =
  | { ok: true; status: "published"; firstPublish: boolean; parentNotified: boolean }
  | { ok: false; reason: "no-site" | "locked" }
  // `cause` is the client-local diagnostic (see SiteFailureCause): optional,
  // never on the wire, set by this module on every outage-shaped collapse.
  | { ok: false; reason: "outage"; cause?: SiteFailureCause };

function publishOutage(cause: SiteFailureCause): PublishSiteResult {
  return { ok: false, reason: "outage", cause };
}

/**
 * The explicit go-live call (POST /api/fp/site/publish, no body) — never
 * inferred from save-doc writes (Key Technical Decision). Idempotent server-
 * side via first_published_at; the response says whether THIS call was the
 * first publish and whether the parent notification went out. `locked` means
 * operator-locked: nothing became visible, no email — the caller renders the
 * offline state. SEQUENCING is the caller's job: publish only after a LANDED
 * `flushNow()` (GameContext), so the content the server re-syncs is current.
 */
export async function publishSite(): Promise<PublishSiteResult> {
  try {
    if (!isPublicSiteEnabled()) return publishOutage("flag-off");
    const { t120ApiUrl } = getConfig();
    const accessToken = await currentAccessToken();
    if (!accessToken) return publishOutage("no-session");

    const res = await fetch(`${t120ApiUrl.replace(/\/$/, "")}/api/fp/site/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return publishOutage("server");

    const parsed = (await res.json()) as {
      ok?: unknown;
      status?: unknown;
      reason?: unknown;
      firstPublish?: unknown;
      parentNotified?: unknown;
    };
    if (parsed.ok === true && parsed.status === "published") {
      return {
        ok: true,
        status: "published",
        firstPublish: parsed.firstPublish === true,
        parentNotified: parsed.parentNotified === true,
      };
    }
    if (parsed.ok === false && parsed.reason === "no-site") {
      return { ok: false, reason: "no-site" };
    }
    if (parsed.ok === false && parsed.reason === "locked") {
      return { ok: false, reason: "locked" };
    }
    return publishOutage("server");
  } catch {
    return publishOutage("transport");
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

/** Ceiling on the server-side revoke. supabase-js takes no abort signal, so a
 *  dead network would otherwise hang `logout` — and, since v3 Unit 6 routes the
 *  sign-in session boundary through here, would hang SIGN-IN. Past the deadline
 *  we still purge locally and move on; the warn below records the residual. */
const SIGN_OUT_TIMEOUT_MS = 6_000;

/**
 * Revoke the session server-side and purge `sb-*` keys. Returns the scope so the
 * provider can route draft handling (explicit → wipe drafts, idle → preserve;
 * `signin` makes no draft decision — see beginSessionBoundary in GameContext).
 */
export async function logout(scope: LogoutScope): Promise<LogoutScope> {
  const supabase = getSupabase();
  try {
    // Scope 'local': revoke THIS device's session server-side (still a real
    // revoke, never just a flag flip) without killing the account's other
    // sessions. The default 'global' scope let one tab's idle logout — or the
    // pre-signin boundary on any machine — force-expire every device signed
    // into the same kid, which surfaced as "kicked mid-session" (BUG-003,
    // Aug 2026). Mirrors the120 login route's never-global revoke rule.
    await withDeadline(supabase.auth.signOut({ scope: "local" }), SIGN_OUT_TIMEOUT_MS);
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
