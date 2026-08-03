/**
 * Runtime configuration for the SPA.
 *
 * Env vars are read lazily (never at module scope) and validated up front so a
 * missing variable produces a clear boot-time error naming the variable —
 * never an `undefined/rest/v1` fetch URL or a silent hang on env-less
 * machines. See docs/plans/2026-07-31-001 (Unit 3) and The120's
 * env-less-build institutional learning.
 */

export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  t120ApiUrl: string;
}

/**
 * The Start Building CTA cutover flag (Slice B Unit 10, Plan Revision 11 — "no
 * half-live window"). DEFAULTS OFF: with the flag unset the Landing CTA routes to
 * `login` (Slice A behavior), so merging or deploying this branch does NOT cut
 * over to signup on its own. Flip `VITE_ENABLE_SIGNUP=true` in the deployment
 * environment ONLY after the [T120] signup backend (through Unit 11 / T120 live)
 * is verified live; that flip is the deliberate, reversible go-live step and it
 * repoints the CTA to `signup`. Read via `isSignupEnabled` (separate from the
 * required-var validation so a missing flag is simply "off", never a boot error).
 */
export const SIGNUP_FLAG_VAR = "VITE_ENABLE_SIGNUP";

/**
 * Whether the Start Building CTA should route to the `signup` stage. Reads
 * `VITE_ENABLE_SIGNUP` (defaults `env` to `import.meta.env`); true only for the
 * explicit opt-in strings "true"/"1". Intentionally does NOT run the required-var
 * validation: the flag is orthogonal to Supabase/T120 config, so an env missing
 * the flag returns false rather than throwing.
 */
export function isSignupEnabled(env?: EnvLike): boolean {
  const source: EnvLike = env ?? (import.meta.env as unknown as EnvLike);
  const raw = source[SIGNUP_FLAG_VAR];
  return raw === "true" || raw === "1";
}

/**
 * The public-site cutover flag (real-public-site plan, Unit 4), mirroring
 * `VITE_ENABLE_SIGNUP` exactly. DEFAULTS OFF: with the flag unset the site API
 * client short-circuits to flat failures without a network call and the claim/
 * publish UI affordances stay hidden, so merging or deploying this branch does
 * NOT open the public-site surface on its own. The120's claim/availability/
 * publish endpoints are ALSO gated server-side (fail-closed allowlist); flipping
 * `VITE_ENABLE_PUBLIC_SITE=true` here is the client half of the deliberate,
 * reversible go-live step in the Unit 7 launch order.
 */
export const PUBLIC_SITE_FLAG_VAR = "VITE_ENABLE_PUBLIC_SITE";

/**
 * Whether the public-site claim/publish surface is enabled client-side. Reads
 * `VITE_ENABLE_PUBLIC_SITE` (defaults `env` to `import.meta.env`); true only for
 * the explicit opt-in strings "true"/"1". Like isSignupEnabled, it deliberately
 * does NOT run the required-var validation: a missing flag is simply "off",
 * never a boot error.
 */
export function isPublicSiteEnabled(env?: EnvLike): boolean {
  const source: EnvLike = env ?? (import.meta.env as unknown as EnvLike);
  const raw = source[PUBLIC_SITE_FLAG_VAR];
  return raw === "true" || raw === "1";
}

type EnvLike = Record<string, string | undefined>;

const REQUIRED_VARS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_T120_API_URL",
] as const;

let cached: AppConfig | null = null;

/**
 * Reads config from `env` (defaults to `import.meta.env`), validating that
 * every required variable is present and non-empty. Throws an Error naming
 * the first missing variable. Memoized only for the default-env path so
 * tests can inject their own env objects freely.
 */
export function getConfig(env?: EnvLike): AppConfig {
  const usingDefaultEnv = env === undefined;
  if (usingDefaultEnv && cached) return cached;

  const source: EnvLike = env ?? (import.meta.env as unknown as EnvLike);

  for (const name of REQUIRED_VARS) {
    const value = source[name];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(
        `Missing required environment variable: ${name}. ` +
          `Set it in your .env file (see .env.example) or the deployment environment.`,
      );
    }
  }

  const config: AppConfig = {
    supabaseUrl: (source.VITE_SUPABASE_URL as string).trim(),
    supabaseAnonKey: (source.VITE_SUPABASE_ANON_KEY as string).trim(),
    t120ApiUrl: (source.VITE_T120_API_URL as string).trim(),
  };

  if (usingDefaultEnv) cached = config;
  return config;
}

/** Test helper: clears the memoized default-env config. */
export function resetConfigForTesting(): void {
  cached = null;
}
