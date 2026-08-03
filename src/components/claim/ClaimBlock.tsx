/**
 * Shared claim UI (real-public-site plan, Units 5+6; extracted per Unit 6
 * review P2): the URL input row with its live badge, the tip/claimed line,
 * the inline notice, and the still-free suggestion chips — plus the GreenCta
 * both claim surfaces submit with. ONE source of truth consumed by onboarding
 * screen 2 (src/screens/onboarding/screens.tsx, which re-exports these for
 * back-compat) and the Your Site room's in-room claim
 * (src/components/rooms/YourSite.tsx). The companion state machine lives in
 * src/lib/useClaimFlow.ts.
 *
 * DOM is byte-identical to the original screen-2 markup (the component
 * boundary adds no elements).
 *
 * Copy rule (global product rule): NO em dashes anywhere — "·", commas,
 * periods.
 *
 * Mobile (CLAUDE.md ~390px): suggestion chips and the CTA keep their >=44px
 * tap targets; the input is keyboard-focusable with a visible label.
 */

/**
 * Availability badge states for the REAL claim UI (R1). `none` renders an
 * empty (but mounted) live region — a failed availability check never blocks
 * typing, so it simply says nothing. `short` is the local mid-typing state
 * (under 3 characters), kept apart from the server's `invalid` verdict so a
 * kid mid-word never reads a punitive rejection.
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
 * The live claim wiring, container-injected so the rendering components stay
 * PURE. Named for its first consumer (onboarding's FounderProfile screen);
 * the Your Site room passes the identical shape.
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

/**
 * The green Fraunces CTA with the design system's hard shadow. Shared by the
 * onboarding screens, the signup flow, and the in-room claim. `disabled`
 * renders a dimmed, un-clickable button.
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

/** The claim block: URL input row + badge + tip + notice + suggestions. */
export function ClaimBlock({ claim }: { claim: FounderProfileClaim }) {
  const badge = claim.badge !== "none" ? CLAIM_BADGE_COPY[claim.badge] : null;
  return (
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
  );
}
