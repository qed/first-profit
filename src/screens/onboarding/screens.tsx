/**
 * Shared onboarding screens 2..5, decoupled from game state.
 *
 * These are the founder-facing cards recreated from the design handoff §B-D and
 * the `First Profit Flow.dc.html` prototype (onboarding screens `D · Founder
 * profile` and `E · Onboarding` ob0/ob1/ob2). They are PURE, props-driven
 * components: each takes its navigation (advance/back handlers) and the profile
 * data it needs via props, and reaches into NO React context or game state.
 *
 * Why props (Slice B Unit 7): the logged-in first-run onboarding
 * (`src/screens/Onboarding.tsx`) drives them from `state.ob` / the game reducer,
 * but the parent signup flow (Units 8-10) reuses the exact same four screens
 * driven by signup-LOCAL state (no engine, no save, no session). Keeping the
 * markup here and the wiring at the call site lets both flows share one source
 * of truth without either owning the other's state.
 *
 * Copy rule (global product rule): NO em dashes anywhere — "·", commas, periods.
 *
 * Mobile-first (CLAUDE.md, ~390px): single column, CTAs are >=52px tall, the
 * progress bar and tier chips wrap/fit at 390px with no horizontal scroll.
 * Desktop is layered with `sm:`. The typed reveal respects `useReducedMotion`
 * (shows the full string, no timer).
 */
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { defaultSiteHeadline } from "../../lib/siteCopy";

/** Compact stepped logo mark (four ascending bars in phase colors). */
export function LogoMark() {
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

/**
 * The five phase colors, filled left-to-right as onboarding progresses.
 * Exported so the signup flow (Unit 8) can size its own progress bar from the
 * same palette without redefining the tokens.
 */
export const PHASE_COLORS = [
  "hsl(14 78% 54%)", // sell
  "hsl(217 74% 56%)", // build
  "hsl(265 52% 58%)", // validate
  "hsl(150 52% 42%)", // grow
  "hsl(41 88% 52%)", // scale
] as const;

const UNFILLED = "hsl(30 12% 12% / .15)";

/** 5-segment progress bar. `filled` = how many segments (1..5) are lit. */
export function ProgressBar({ filled }: { filled: number }) {
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

/**
 * The green Fraunces CTA with the design system's hard shadow. Exported for
 * reuse by the signup flow (Unit 8). `disabled` renders a dimmed, un-clickable
 * button (used to gate the consent step until the parent has attested).
 */
export function GreenCta({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-6 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-verified px-5 font-display text-lg font-bold text-white shadow-[0_6px_0_hsl(150_52%_26%)] transition-transform hover:-translate-y-0.5 active:translate-y-px active:shadow-[0_3px_0_hsl(150_52%_26%)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-[0_6px_0_hsl(150_52%_26%)] disabled:hover:translate-y-0"
    >
      {children}
    </button>
  );
}

/** A small back affordance (>=44px tap area), exported for reuse by signup. */
export function BackLink({ onClick }: { onClick: () => void }) {
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

/**
 * Derive the display handle from a raw handle plus a first name. Mirrors the
 * prototype fallback: an explicit handle wins, else a slugified first name, else
 * "you". Kept in one place so both screens that surface the handle agree.
 */
function deriveHandle(rawHandle: string, firstName: string): string {
  return rawHandle || firstName.trim().toLowerCase().replace(/[^a-z0-9]/g, "") || "you";
}

/**
 * Availability badge states for the REAL claim UI (Unit 5; R1). `none` renders
 * an empty (but mounted) live region — a failed availability check never
 * blocks typing, so it simply says nothing. `short` is the local
 * mid-typing state (under 3 characters), kept apart from the server's
 * `invalid` verdict so a kid mid-word never reads a punitive rejection.
 */
export type ClaimBadge =
  | "none"
  | "pending"
  | "short"
  | "available"
  | "taken"
  | "yours"
  | "invalid";

/** Inline claim notices (R3 race retry, R23 server-verdict refusal, outage). */
export type ClaimNotice = "race" | "invalid" | "outage" | null;

/**
 * The live claim wiring for screen 2 (real-public-site plan, Unit 5),
 * container-injected so this screen stays PURE. Absent → the screen renders
 * its original static preview (flag off / signup reuse), byte-identical to
 * the pre-Unit-5 markup.
 */
export interface FounderProfileClaim {
  /** The normalized handle shown in the URL input (container-owned; R15). */
  handleValue: string;
  /** Raw keystrokes out; the container normalizes and echoes back. */
  onHandleChange: (value: string) => void;
  badge: ClaimBadge;
  /** Server-authored free variants, shown when the handle is taken (R2).
   *  Rendered through React's default escaping ONLY — never as markup. */
  suggestions: string[];
  /** One-tap pick: the container claims the suggestion immediately (R2). */
  onPickSuggestion: (handle: string) => void;
  notice: ClaimNotice;
  /** The account already holds a handle (resume): URL locked, no spinner,
   *  the CTA advances WITHOUT re-claiming (R3 idempotence lives server-side,
   *  but the resume path never even asks). */
  claimed: boolean;
  /** A claim request is in flight: CTA shows busy and further taps drop. */
  claiming: boolean;
}

/** Kid-friendly badge copy + tone per state (announced via the live region). */
const CLAIM_BADGE_COPY: Record<Exclude<ClaimBadge, "none">, { text: string; tone: string }> = {
  pending: { text: "checking…", tone: "text-[hsl(25_20%_38%)]" },
  short: { text: "keep typing", tone: "text-[hsl(25_20%_38%)]" },
  available: { text: "available", tone: "text-verified" },
  yours: { text: "yours", tone: "text-verified" },
  taken: { text: "taken", tone: "text-[hsl(14_78%_44%)]" },
  invalid: { text: "can't use that one", tone: "text-[hsl(14_78%_44%)]" },
};

/** Inline notice copy: short, warm, never a dead end (R3/R19b/R23). The
 *  `invalid` copy renders the SERVER's claim refusal (format, reserved, or
 *  blocklisted — the client holds no term list; see src/lib/handleRules.ts). */
const CLAIM_NOTICE_COPY: Record<NonNullable<ClaimNotice>, string> = {
  race: "Oh no, someone just grabbed that name. Pick one that's still free, or type a new one.",
  invalid: "That name can't be used for your page. Try a different one.",
  outage: "We couldn't claim your page right now. Give it a moment and tap again.",
};

export interface FounderProfileProps {
  /** Current first name (controlled). */
  firstName: string;
  /** Raw handle (empty falls back to a slug of firstName). */
  handle: string;
  /** Called on every keystroke with the new first name. */
  onFirstNameChange: (value: string) => void;
  /** Advance to screen 3. Only fired once a non-empty first name is entered.
   *  With `claim` wiring present the container claims first and advances
   *  itself on success — this screen just reports the tap. */
  onNext: () => void;
  /** Real claim wiring (Unit 5). Absent → original static preview. */
  claim?: FounderProfileClaim;
}

/** Screen 2 · Founder profile. */
export function FounderProfile({
  firstName,
  handle,
  onFirstNameChange,
  onNext,
  claim,
}: FounderProfileProps) {
  const displayHandle = deriveHandle(handle, firstName);
  const canClaim = firstName.trim().length > 0;
  const badge = claim && claim.badge !== "none" ? CLAIM_BADGE_COPY[claim.badge] : null;

  return (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-sell">
        Step 2 of 5 · The founder
      </p>
      <h1 className="mt-2 font-display text-[28px] font-extrabold leading-[1.15] text-[hsl(25_34%_20%)]">
        This page is yours now.
      </h1>
      <label className="mt-6 block">
        <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
          First name
        </span>
        <input
          value={firstName}
          onChange={(e) => onFirstNameChange(e.target.value)}
          placeholder="Alex"
          className="w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-2.5 font-display text-[19px] font-bold text-[hsl(25_34%_20%)] outline-none focus:border-[hsl(25_34%_20%/0.4)]"
        />
      </label>

      {claim ? (
        <>
          <div className="mt-4 flex items-center gap-2 rounded-xl border-2 border-dashed border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3">
            <span aria-hidden className="text-sm">
              🌐
            </span>
            <span className="shrink-0 font-mono text-[12.5px] text-[hsl(25_20%_38%)]">
              firstprofit.school/
            </span>
            {claim.claimed ? (
              <b className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-[hsl(25_34%_20%)]">
                {claim.handleValue}
              </b>
            ) : (
              <input
                value={claim.handleValue}
                onChange={(e) => claim.onHandleChange(e.target.value)}
                aria-label="Page name"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                // Frozen while a claim is in flight: a claim must never land
                // for text the learner has already retyped past.
                disabled={claim.claiming}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[12.5px] font-bold text-[hsl(25_34%_20%)] outline-none disabled:opacity-60"
              />
            )}
            {/* The live region stays mounted across badge changes so state
                transitions are actually announced (R1 accessibility). */}
            <span
              role="status"
              aria-live="polite"
              className={`ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] ${badge ? badge.tone : ""}`}
            >
              {badge ? badge.text : ""}
            </span>
          </div>
          {claim.claimed ? (
            <p className="mt-2 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
              This page is yours. Let's keep going.
            </p>
          ) : (
            <p className="mt-2 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
              Tip: first names work best. Your page name is public, so skip your full name.
            </p>
          )}
          {claim.notice ? (
            <p className="mt-2 rounded-lg bg-[hsl(14_78%_54%/0.08)] px-3 py-2 text-[12.5px] font-semibold leading-[1.5] text-[hsl(14_78%_38%)]">
              {CLAIM_NOTICE_COPY[claim.notice]}
            </p>
          ) : null}
          {!claim.claimed && claim.suggestions.length > 0 ? (
            <div className="mt-2.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
                Still free
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {claim.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => claim.onPickSuggestion(suggestion)}
                    // Busy-consistent with the CTA/input: one claim at a time.
                    disabled={claim.claiming}
                    className="inline-flex min-h-[44px] items-center rounded-full border-2 border-[hsl(150_52%_42%/0.4)] bg-[hsl(150_52%_42%/0.08)] px-3.5 font-mono text-xs font-semibold text-[hsl(150_52%_32%)] disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-xl border-2 border-dashed border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3">
          <span aria-hidden className="text-sm">
            🌐
          </span>
          <p className="min-w-0 truncate font-mono text-[12.5px] text-[hsl(25_20%_38%)]">
            firstprofit.school/<b className="text-[hsl(25_34%_20%)]">{displayHandle}</b>
          </p>
          <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-verified">
            available
          </span>
        </div>
      )}

      <GreenCta onClick={() => canClaim && !claim?.claiming && onNext()} disabled={claim?.claiming}>
        {claim?.claiming ? "Claiming…" : claim?.claimed ? "Keep going →" : "Claim my page →"}
      </GreenCta>
    </>
  );
}

export interface WebsiteRevealProps {
  /** First name shown in the reveal (falls back to "Founder"). */
  firstName: string;
  /** Raw handle (empty falls back to a slug of firstName). */
  handle: string;
  /** Advance to screen 4. */
  onNext: () => void;
  /** Return to screen 2. */
  onBack: () => void;
  /**
   * Real publish state (Unit 5; R19). Absent → the original static "● live"
   * chip (flag off / signup preview), unchanged. "going-live" renders the
   * honest not-live-yet framing: the URL stays displayed but the chip reads
   * "going live…" and there is NO share encouragement (the page is not
   * fetchable until the completion publish lands). "live" adds the share
   * line. Either real state also shows the R20 headline soft nudge.
   */
  liveState?: "live" | "going-live";
}

/** Screen 3 · Website reveal (typed headline). */
export function WebsiteReveal({ firstName, handle, onNext, onBack, liveState }: WebsiteRevealProps) {
  const reduceMotion = useReducedMotion();
  const name = firstName.trim() || "Founder";
  const displayHandle = deriveHandle(handle, name);
  // Age is not part of the Slice A profile, so the age clause is omitted
  // (truthful, no invented field). The sentence is the shared default site
  // headline (src/lib/siteCopy.ts) — the public page renders the same one.
  const sentence = defaultSiteHeadline(name);
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
      <div className="mt-5 overflow-hidden rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white">
        <div className="flex items-center gap-1.5 border-b-2 border-[hsl(25_34%_20%/0.1)] bg-[hsl(25_34%_20%/0.05)] px-3 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sell" />
          <span className="h-2.5 w-2.5 rounded-full bg-scale" />
          <span className="h-2.5 w-2.5 rounded-full bg-grow" />
          <span className="ml-2 min-w-0 truncate rounded-md bg-white px-2.5 py-0.5 font-mono text-[10.5px] text-[hsl(25_20%_38%)]">
            firstprofit.school/{displayHandle}
          </span>
          <span
            className={`ml-auto shrink-0 font-mono text-[9.5px] uppercase tracking-[0.08em] ${
              liveState === "going-live" ? "text-[hsl(41_74%_38%)]" : "text-verified"
            }`}
          >
            {liveState === "going-live" ? "going live…" : "● live"}
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

      {liveState === "going-live" ? (
        <p className="mt-3 rounded-xl bg-[hsl(41_88%_52%/0.12)] px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
          Your page is going live. In a minute or two it will be real at that link.
        </p>
      ) : null}
      {liveState === "live" ? (
        <p className="mt-3 rounded-xl bg-[hsl(150_52%_40%/0.1)] px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
          It's real. Anyone you send that link to can see your page.
        </p>
      ) : null}
      {liveState ? (
        <p className="mt-2 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
          Tip: write your own headline in your Site room, so your page sounds like you.
        </p>
      ) : null}

      <GreenCta onClick={onNext}>My money booth next →</GreenCta>
      <BackLink onClick={onBack} />
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

export interface MoneyBoothProps {
  /** Advance to screen 5. */
  onNext: () => void;
  /** Return to screen 3. */
  onBack: () => void;
}

/** Screen 4 · Money booth. */
export function MoneyBooth({ onNext, onBack }: MoneyBoothProps) {
  return (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-verified">
        Step 4 of 5 · Stripe account
      </p>
      <h2 className="mt-2 font-display text-[30px] font-black leading-[1.1] text-[hsl(25_34%_20%)]">
        You can take real money today.
      </h2>
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
        {/* Focusable (not native-disabled) so the aria-disabled state and its
            explanation actually reach keyboard and screen-reader users; the
            click is a no-op until the real mock checkout ships in Unit 11. */}
        <button
          type="button"
          aria-disabled="true"
          title="Opens once your floor is unlocked"
          onClick={(e) => e.preventDefault()}
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

      <GreenCta onClick={onNext}>Show me The Path →</GreenCta>
      <BackLink onClick={onBack} />
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

export interface ThePathProps {
  /** Finish onboarding (seed the first idea, mark complete, enter the app). */
  onComplete: () => void;
  /** Return to screen 4. */
  onBack: () => void;
}

/** Screen 5 · The Path. Completing this finishes onboarding. */
export function ThePath({ onComplete, onBack }: ThePathProps) {
  return (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[hsl(41_74%_44%)]">
        Step 5 of 5 · The Path
      </p>
      <h2 className="mt-2 font-display text-[30px] font-black leading-[1.1] text-[hsl(25_34%_20%)]">
        One room. One task at a time.
      </h2>
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

      <GreenCta onClick={onComplete}>Start Unit Task #1 →</GreenCta>
      <BackLink onClick={onBack} />
    </>
  );
}
