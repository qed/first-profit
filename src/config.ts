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
