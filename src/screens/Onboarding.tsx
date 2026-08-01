/**
 * First-run in-game onboarding (screens 2..5) — recreated from the design
 * handoff §B-D and the `First Profit Flow.dc.html` prototype (onboarding
 * screens `D · Founder profile` and `E · Onboarding` ob0/ob1/ob2).
 *
 * Slice A boundary: the parent-account step (screen 1) is ALREADY complete — an
 * existing The120 child arrives already authenticated. So this file is the
 * child's screens 2..5:
 *   2 · Founder profile   (Trail parchment card, live handle preview)
 *   3 · Website reveal     (typed browser-frame headline)
 *   4 · Money booth        (Invest-in-me offer + checkmark copy)
 *   5 · The Path           (five phase rows, Sell highlighted)
 *
 * The 5-segment progress bar fills in the five phase colors in order
 * (sell → build → validate → grow → scale). Segment 1 is ALWAYS filled (Sell):
 * the parent step is pre-completed. On screen N (state.ob = 2..5), segments
 * 1..N are filled; the rest are ink at 15% alpha.
 *
 * State: the screen index is `state.ob` (2..5). Advance / go back with SET_OB.
 * NOTE (per plan): the save doc only tracks `onboardingComplete`, not the
 * per-screen index, so a mid-onboarding reload resumes at screen 2 (in-memory
 * progress only). Completing screen 5 seeds Idea #1 (CREATE_IDEA), sets
 * onboardingComplete (SET_ONBOARDING_COMPLETE — persisted, so the NEXT login's
 * HYDRATE routes straight to `app`), and enters the `app` stage.
 *
 * Slice A has no `age` field on the child profile, so the website-reveal
 * sentence omits the prototype's age clause (kept truthful, no invented field).
 *
 * Copy rule (global product rule): NO em dashes anywhere — "·", commas, periods.
 *
 * Mobile-first (CLAUDE.md, ~390px): single column, the card is `max-w`-bounded
 * and full-width below it, CTAs are >=52px tall, the progress bar and tier chips
 * wrap/fit at 390px with no horizontal scroll. Desktop is layered with `sm:`.
 * The typed reveal respects `useReducedMotion` (shows the full string, no timer).
 */
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useGame } from "../state/GameContext";

/** Compact stepped logo mark (four ascending bars in phase colors). */
function LogoMark() {
  return (
    <span className="flex h-7 shrink-0 items-end gap-[3px]" aria-label="First Profit" role="img">
      <span className="h-3 w-[5px] rounded-sm bg-sell" />
      <span className="h-4 w-[5px] rounded-sm bg-build" />
      <span className="h-5 w-[5px] rounded-sm bg-validate" />
      <span className="h-6 w-[5px] rounded-sm bg-grow" />
      <span className="h-7 w-[5px] rounded-sm bg-scale" />
    </span>
  );
}

/** The five phase colors, filled left-to-right as onboarding progresses. */
const PHASE_COLORS = [
  "hsl(14 78% 54%)", // sell
  "hsl(217 74% 56%)", // build
  "hsl(265 52% 58%)", // validate
  "hsl(150 52% 42%)", // grow
  "hsl(41 88% 52%)", // scale
] as const;

const UNFILLED = "hsl(30 12% 12% / .15)";

/** 5-segment progress bar. `filled` = how many segments (1..5) are lit. */
function ProgressBar({ filled }: { filled: number }) {
  return (
    <div className="flex gap-1.5" aria-label={`Step ${filled} of 5`} role="img">
      {PHASE_COLORS.map((color, i) => (
        <span
          key={i}
          className="h-1.5 w-6 rounded-full transition-colors sm:w-7"
          style={{ background: i < filled ? color : UNFILLED }}
        />
      ))}
    </div>
  );
}

/** The green Fraunces CTA with the design system's hard shadow. */
function GreenCta({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-verified px-5 font-display text-lg font-bold text-white shadow-[0_6px_0_hsl(150_52%_26%)] transition-transform hover:-translate-y-0.5 active:translate-y-px active:shadow-[0_3px_0_hsl(150_52%_26%)]"
    >
      {children}
    </button>
  );
}

/** A small back affordance (>=44px tap area) for screens 3..5. */
function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <div className="mt-3.5 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex min-h-[44px] items-center px-3 font-mono text-xs text-[hsl(30_6%_52%)] hover:text-ink"
      >
        ← Back
      </button>
    </div>
  );
}

/** Screen 2 · Founder profile. */
function FounderProfile() {
  const { profile, dispatch } = useGame();
  const firstName = profile.firstName;
  const handle = profile.handle || firstName.trim().toLowerCase().replace(/[^a-z0-9]/g, "") || "you";
  const canClaim = firstName.trim().length > 0;

  return (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-sell">
        Step 2 of 5 · The founder
      </p>
      <h1 className="mt-2 font-display text-[28px] font-extrabold leading-[1.15] text-[hsl(25_34%_20%)]">
        This page is yours now.
      </h1>
      <p className="mt-2 text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
        Founder: just a first name. That is all we ever put on the internet.
      </p>

      <label className="mt-6 block">
        <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
          First name
        </span>
        <input
          value={firstName}
          onChange={(e) => dispatch({ type: "SET_PROFILE", patch: { firstName: e.target.value } })}
          placeholder="Alex"
          className="w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-2.5 font-display text-[19px] font-bold text-[hsl(25_34%_20%)] outline-none focus:border-[hsl(25_34%_20%/0.4)]"
        />
      </label>

      <div className="mt-4 flex items-center gap-2 rounded-xl border-2 border-dashed border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3">
        <span aria-hidden className="text-sm">
          🌐
        </span>
        <p className="min-w-0 truncate font-mono text-[12.5px] text-[hsl(25_20%_38%)]">
          firstprofit.school/<b className="text-[hsl(25_34%_20%)]">{handle}</b>
        </p>
        <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-verified">
          available
        </span>
      </div>

      <GreenCta onClick={() => canClaim && dispatch({ type: "SET_OB", ob: 3 })}>
        Claim my page →
      </GreenCta>
    </>
  );
}

/** Screen 3 · Website reveal (typed headline). */
function WebsiteReveal() {
  const { profile, dispatch } = useGame();
  const reduceMotion = useReducedMotion();
  const name = profile.firstName.trim() || "Founder";
  const handle = profile.handle || name.toLowerCase().replace(/[^a-z0-9]/g, "") || "you";
  // Age is not part of the Slice A profile, so the age clause is omitted
  // (truthful, no invented field). The rest matches the prototype verbatim.
  const sentence = `Hi, I'm ${name}. This is the future site of my first $1,000 profit company.`;
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (reduceMotion) {
      setTyped(sentence);
      return;
    }
    setTyped("");
    let i = 0;
    // ~18ms per 2 characters, matching the prototype's reveal cadence.
    const timer = setInterval(() => {
      i += 2;
      setTyped(sentence.slice(0, i));
      if (i >= sentence.length) clearInterval(timer);
    }, 18);
    return () => clearInterval(timer);
  }, [sentence, reduceMotion]);

  return (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-validate">
        Step 3 of 5 · Website
      </p>
      <h2 className="mt-2 font-display text-[30px] font-black leading-[1.1] text-[hsl(25_34%_20%)]">
        {name}, you have a website.
      </h2>
      <p className="mt-2 text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
        It is live right now, and it says exactly one true thing. You will fill in the rest as the
        business becomes real.
      </p>

      <div className="mt-5 overflow-hidden rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white">
        <div className="flex items-center gap-1.5 border-b-2 border-[hsl(25_34%_20%/0.1)] bg-[hsl(25_34%_20%/0.05)] px-3 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sell" />
          <span className="h-2.5 w-2.5 rounded-full bg-scale" />
          <span className="h-2.5 w-2.5 rounded-full bg-grow" />
          <span className="ml-2 min-w-0 truncate rounded-md bg-white px-2.5 py-0.5 font-mono text-[10.5px] text-[hsl(25_20%_38%)]">
            firstprofit.school/{handle}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[9.5px] uppercase tracking-[0.08em] text-verified">
            ● live
          </span>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="mx-auto max-w-[38ch] font-display text-xl font-bold leading-[1.4] text-[hsl(25_34%_20%)]">
            {typed}
            <span
              className="ml-0.5 inline-block h-[19px] w-0.5 translate-y-[3px] bg-sell"
              style={reduceMotion ? undefined : { animation: "fp-caret-blink 1s step-end infinite" }}
              aria-hidden
            />
          </p>
        </div>
      </div>

      <GreenCta onClick={() => dispatch({ type: "SET_OB", ob: 4 })}>My money booth next →</GreenCta>
      <BackLink onClick={() => dispatch({ type: "SET_OB", ob: 2 })} />
    </>
  );
}

const TIER_CHIPS = [
  { label: "$10 → $20", border: "hsl(14 78% 54% / .4)", bg: "hsl(14 78% 54% / .08)", color: "hsl(14 78% 44%)" },
  { label: "$25 → $50", border: "hsl(217 74% 56% / .4)", bg: "hsl(217 74% 56% / .08)", color: "hsl(217 74% 46%)" },
  { label: "$50 → $100", border: "hsl(265 52% 58% / .4)", bg: "hsl(265 52% 58% / .08)", color: "hsl(265 52% 48%)" },
] as const;

const CHECKMARKS = [
  "Money is taken by Stripe through the First Profit account. At any time, you can take over how money flows.",
  "Every payment is tagged to your page, so it lands in your ledger and your $1,000 bar.",
  "Payouts are released to the parent regularly. Store credit sits in the website app connected to the email address that made the purchase.",
] as const;

/** Screen 4 · Money booth. */
function MoneyBooth() {
  const { dispatch } = useGame();
  return (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-verified">
        Step 4 of 5 · Stripe account
      </p>
      <h2 className="mt-2 font-display text-[30px] font-black leading-[1.1] text-[hsl(25_34%_20%)]">
        You can take real money today.
      </h2>
      <p className="mt-2 text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
        Every founder starts with one offer already switched on: people who believe in you can back
        you, and they get double their money as credit in your store.
      </p>

      <div className="mt-4 rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white p-5 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(25_20%_38%)]">
          Your first offer
        </p>
        <p className="mt-1 font-display text-2xl font-black text-[hsl(25_34%_20%)]">Invest in me</p>
        <p className="mt-1 text-[13.5px] text-[hsl(25_20%_38%)]">
          Get <b className="text-[hsl(25_34%_20%)]">$20 in store credit</b> for every $10 you spend
          here.
        </p>
        <div className="mt-3.5 flex flex-wrap justify-center gap-2">
          {TIER_CHIPS.map((chip) => (
            <span
              key={chip.label}
              className="rounded-[10px] border-2 px-3 py-2 font-mono text-xs font-semibold"
              style={{ borderColor: chip.border, background: chip.bg, color: chip.color }}
            >
              {chip.label}
            </span>
          ))}
        </div>
        {/* Slice A: the real mock checkout is Unit 11. This is a visual
            affordance only (disabled), never a broken link. */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Opens once your floor is unlocked"
          className="mt-3.5 inline-flex min-h-[44px] cursor-default items-center rounded-full border border-[hsl(25_34%_20%/0.25)] bg-[hsl(40_55%_97%)] px-[18px] font-semibold text-[13px] text-[hsl(25_34%_20%)] opacity-70"
        >
          See your live checkout ↗
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {CHECKMARKS.map((line) => (
          <p key={line} className="flex gap-2 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
            <span className="shrink-0 text-verified" aria-hidden>
              ✓
            </span>
            {line}
          </p>
        ))}
      </div>

      <GreenCta onClick={() => dispatch({ type: "SET_OB", ob: 5 })}>Show me The Path →</GreenCta>
      <BackLink onClick={() => dispatch({ type: "SET_OB", ob: 3 })} />
    </>
  );
}

const PATH_PHASES = [
  { index: 1, name: "Sell", promise: "Learn to confidently sell anything.", color: "hsl(14 78% 54%)", tint: "hsl(14 78% 54% / .09)" },
  { index: 2, name: "Build", promise: "Ship a real thing people can buy.", color: "hsl(217 74% 56%)", tint: "hsl(217 74% 56% / .09)" },
  { index: 3, name: "Validate", promise: "Prove it works before you scale it.", color: "hsl(265 52% 58%)", tint: "hsl(265 52% 58% / .09)" },
  { index: 4, name: "Grow", promise: "Get to your first $1,000 in sales.", color: "hsl(150 52% 42%)", tint: "hsl(150 52% 42% / .09)" },
  { index: 5, name: "Scale", promise: "Build the plan to $10,000 in profit.", color: "hsl(41 88% 52%)", tint: "hsl(41 88% 52% / .09)" },
] as const;

/** Screen 5 · The Path. Completing this finishes onboarding. */
function ThePath() {
  const { dispatch } = useGame();

  const start = () => {
    // Seed Idea #1 (sets it active + opens the runner at 1.1.1), mark onboarding
    // complete (persisted so the next login skips onboarding), enter the floor.
    dispatch({ type: "CREATE_IDEA" });
    dispatch({ type: "SET_ONBOARDING_COMPLETE" });
    dispatch({ type: "SET_STAGE", stage: "app" });
  };

  return (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[hsl(41_74%_44%)]">
        Step 5 of 5 · The Path
      </p>
      <h2 className="mt-2 font-display text-[30px] font-black leading-[1.1] text-[hsl(25_34%_20%)]">
        One room. One task at a time.
      </h2>
      <p className="mt-2 text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
        First Profit is five phases and 25 criteria, but you do not meet them all today. You start in
        the Idea Room. Everything else on the factory floor stays shut until you have earned it.
      </p>

      <div className="mt-[18px] flex flex-col gap-2">
        {PATH_PHASES.map((ph, i) => {
          const isSell = i === 0;
          return (
            <div
              key={ph.name}
              className="flex items-center gap-3 rounded-xl border-2 px-3.5 py-2.5"
              style={{
                borderColor: isSell ? ph.color : "hsl(25 34% 20% / .1)",
                background: isSell ? ph.tint : "transparent",
              }}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold text-white"
                style={{ background: isSell ? ph.color : "hsl(25 12% 68%)" }}
              >
                {ph.index}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-base font-bold text-[hsl(25_34%_20%)]">
                  {ph.name}
                </span>
                <span className="block text-xs text-[hsl(25_20%_38%)]">{ph.promise}</span>
              </span>
              <span
                className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{ color: isSell ? "hsl(14 78% 44%)" : "hsl(25 20% 38% / .6)" }}
              >
                {isSell ? "You start here" : "🔒"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl bg-[hsl(150_52%_40%/0.1)] px-4 py-3.5">
        <p className="font-display text-[15.5px] font-bold text-[hsl(150_52%_32%)]">
          ✦ Your first task
        </p>
        <p className="mt-1 text-[13.5px] leading-[1.55] text-[hsl(25_20%_38%)]">
          Pick one thing you could sell this week and write a single sentence about it. Ten minutes.
          The big green <b>Next Step</b> button will walk you there.
        </p>
      </div>

      <GreenCta onClick={start}>Start Unit Task #1 →</GreenCta>
      <BackLink onClick={() => dispatch({ type: "SET_OB", ob: 4 })} />
    </>
  );
}

export function Onboarding() {
  const { ob } = useGame();
  // Clamp to the valid screen range so an out-of-range `ob` never blanks the UI.
  const screen = Math.min(5, Math.max(2, ob));

  return (
    <main className="flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-[hsl(38_46%_95%)] px-4 py-8 text-ink">
      {/* Caret keyframes are scoped here so the reveal needs no global CSS. */}
      <style>{"@keyframes fp-caret-blink{0%,100%{opacity:1}50%{opacity:0}}"}</style>
      <div className="w-full max-w-[560px]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <LogoMark />
          <ProgressBar filled={screen} />
        </div>
        <div className="rounded-3xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] p-6 shadow-[0_2px_0_rgba(120,80,40,0.12),0_8px_24px_rgba(120,80,40,0.14)] sm:p-8">
          {screen === 2 && <FounderProfile />}
          {screen === 3 && <WebsiteReveal />}
          {screen === 4 && <MoneyBooth />}
          {screen === 5 && <ThePath />}
        </div>
      </div>
    </main>
  );
}
