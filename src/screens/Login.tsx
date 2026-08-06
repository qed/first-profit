/**
 * Child login screen in the HQ visual language (white card, Fraunces headings).
 *
 * One generic, kid-friendly error for EVERY failure (R4 enumeration
 * resistance): we never tell a child whether the username or the password was
 * the problem. No em dashes anywhere (global product copy rule).
 *
 * Mobile-first at ~390px: single-column card, tap targets >= 44px; desktop is
 * re-asserted with `sm:` variants (centered, slightly wider card).
 */
import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useGame } from "../state/GameContext";

const GENERIC_ERROR =
  "Hmm, that username and password do not match. Check the spelling and try again, or ask your grown-up.";

// Account creation lives at the120's /start onboarding (fpv2 is game + login only).
// This is the120's MARKETING/web origin, deliberately distinct from the API origin
// in src/config.ts (VITE_T120_API_URL, used only for /api/fp/* calls). `src=fplogin`
// attributes signups that originated from the First Profit login.
const CREATE_ACCOUNT_URL = "https://the120.school/start?src=fplogin";

export function Login() {
  const { login } = useGame();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(false);
    setLoading(true);
    // Trim BOTH credentials: a password pasted from the family's credentials
    // sheet almost always carries a trailing space or newline, which fails
    // auth while the same password typed by hand works (BUG-002). Parent-set
    // passwords are min-length-gated only, so an intentionally space-edged
    // password is pathological; the paste failure was constant.
    const ok = await login(identifier.trim(), password.trim());
    // On success the provider advances the stage and this screen unmounts; we
    // only need to handle the failure branch here.
    if (!ok) {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-[hsl(40_30%_99%)] px-4 py-8 text-ink">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-[hsl(40_14%_89%)] bg-white p-6 shadow-card sm:p-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-sell">First Profit</p>
          <h1 className="mt-2 font-display text-3xl font-black leading-tight">Welcome back, founder.</h1>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="fp-identifier" className="block font-mono text-[11px] uppercase tracking-wider text-ink/60">
                Username
              </label>
              <input
                id="fp-identifier"
                name="identifier"
                type="text"
                inputMode="text"
                placeholder="e.g. alex"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                aria-invalid={error}
                aria-describedby={error ? "fp-login-error" : undefined}
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[hsl(40_10%_80%)] bg-[hsl(40_30%_99%)] px-4 font-display text-lg font-bold text-ink outline-none focus:border-sell focus:ring-2 focus:ring-sell/30"
              />
            </div>

            <div>
              <label htmlFor="fp-password" className="block font-mono text-[11px] uppercase tracking-wider text-ink/60">
                Password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="fp-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error}
                  aria-describedby={error ? "fp-login-error" : undefined}
                  className="min-h-[48px] w-full rounded-xl border border-[hsl(40_10%_80%)] bg-[hsl(40_30%_99%)] pl-4 pr-14 font-display text-lg font-bold text-ink outline-none focus:border-sell focus:ring-2 focus:ring-sell/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex min-h-[44px] min-w-[48px] items-center justify-center rounded-r-xl text-ink/50 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-sell/30"
                >
                  {showPassword ? <EyeOff size={22} aria-hidden /> : <Eye size={22} aria-hidden />}
                </button>
              </div>
            </div>

            {error ? (
              <p
                id="fp-login-error"
                role="alert"
                className="rounded-xl border-l-4 border-goldleaf bg-goldleaf/10 px-3.5 py-3 text-sm leading-relaxed text-ink"
              >
                {GENERIC_ERROR}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-verified px-5 font-display text-lg font-bold text-white shadow-[0_6px_0_hsl(150_52%_26%)] transition active:translate-y-0.5 active:shadow-[0_3px_0_hsl(150_52%_26%)] disabled:opacity-70"
            >
              {loading ? "Logging in..." : "Log in"}
            </button>
          </form>

          <p className="mt-5 border-t border-[hsl(40_14%_89%)] pt-4 text-center text-sm leading-relaxed text-ink/70">
            New to First Profit?{" "}
            <a
              href={CREATE_ACCOUNT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center font-bold text-sell underline decoration-2 underline-offset-2 hover:text-sell/80"
            >
              Create an account
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
