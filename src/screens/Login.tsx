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
import { useGame } from "../state/GameContext";

const GENERIC_ERROR =
  "Hmm, that username and password do not match. Check the spelling and try again, or ask your grown-up.";

export function Login() {
  const { login, dispatch } = useGame();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(false);
    setLoading(true);
    const ok = await login(identifier.trim(), password);
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
        <button
          type="button"
          onClick={() => dispatch({ type: "SET_STAGE", stage: "landing" })}
          className="mb-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 font-mono text-xs uppercase tracking-wider text-ink/60 hover:text-ink"
        >
          <span aria-hidden>←</span> Back
        </button>

        <div className="rounded-3xl border border-[hsl(40_14%_89%)] bg-white p-6 shadow-card sm:p-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-sell">First Profit</p>
          <h1 className="mt-2 font-display text-3xl font-black leading-tight">Welcome back, founder.</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            Log in with the username and password your grown-up set up for you.
          </p>

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
              <input
                id="fp-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error}
                aria-describedby={error ? "fp-login-error" : undefined}
                className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[hsl(40_10%_80%)] bg-[hsl(40_30%_99%)] px-4 font-display text-lg font-bold text-ink outline-none focus:border-sell focus:ring-2 focus:ring-sell/30"
              />
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
        </div>

        <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-wider text-ink/50">
          A grown-up sets up every account
        </p>
      </div>
    </main>
  );
}
