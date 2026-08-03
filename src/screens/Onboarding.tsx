/**
 * First-run in-game onboarding (screens 2..5) — the LOGGED-IN founder flow.
 *
 * Slice A boundary: the parent-account step (screen 1) is ALREADY complete — an
 * existing The120 child arrives already authenticated. So this file is the
 * child's screens 2..5:
 *   2 · Founder profile   (Trail parchment card, live handle claim)
 *   3 · Website reveal     (typed browser-frame headline)
 *   4 · Money booth        (Invest-in-me offer + checkmark copy)
 *   5 · The Path           (five phase rows, Sell highlighted)
 *
 * The four screens themselves live in `./onboarding/screens` as PURE,
 * props-driven components (Slice B Unit 7) so the parent signup flow can reuse
 * them driven by signup-LOCAL state. This module is the LOGGED-IN wiring: it
 * reads `state.ob` / `state.profile` and dispatches game actions, passing the
 * navigation + profile into each screen via props. All markup/styling lives in
 * the shared module; nothing here renders founder copy directly.
 *
 * ── Real handle claim (real-public-site plan, Unit 5) ──────────────────────
 * With `VITE_ENABLE_PUBLIC_SITE` on, screen 2's "Claim my page" CTA claims for
 * REAL: debounced live availability as the input changes (R1, sequence-guarded
 * so a stale response never overwrites a newer one), server-authored
 * suggestions on `taken` (R2), the designed race-retry branch when a claim
 * loses after an "available" badge (R3), R23 screening rendered from the
 * SERVER's verdicts (availability/claim answer `invalid` for blocklisted or
 * reserved names — the client ships no term list, see src/lib/handleRules.ts),
 * and a `useRef` in-flight guard so a double-tap makes ONE request (the
 * client-minted-idempotency-key learning: a React-state `disabled` flag
 * updates a render too late). All
 * claim intent lives HERE, above every conditional screen mount, so it
 * survives resizes/breakpoint swaps (the breakpoint-crossing learning).
 * Resume: when the site slice already holds a handle, screen 2 renders the
 * claimed state and the CTA advances WITHOUT re-claiming.
 *
 * Completion (Key Technical Decision — "publish only after a LANDED flush"):
 * CREATE_IDEA → `await flushNow()` → ONLY on "landed" → `publishSite()` →
 * SET_ONBOARDING_COMPLETE → SET_STAGE app. A parked/cas-rescheduled flush or
 * a failed publish NEVER blocks completion — the learner enters the floor and
 * the reveal/room shows the honest R19 "going live…" state instead; retry
 * happens on Your Site room open (Unit 6). Flag OFF keeps the original,
 * fully synchronous completion sequence byte-for-byte.
 *
 * The 5-segment progress bar fills in the five phase colors in order
 * (sell → build → validate → grow → scale). Segment 1 is ALWAYS filled (Sell):
 * the parent step is pre-completed. On screen N (state.ob = 2..5), segments
 * 1..N are filled; the rest are ink at 15% alpha.
 *
 * State: the screen index is `state.ob` (2..5). Advance / go back with SET_OB.
 * NOTE (per plan): the save doc only tracks `onboardingComplete`, not the
 * per-screen index, so a mid-onboarding reload resumes at screen 2 (in-memory
 * progress only) — the claimed handle itself resumes from the site slice's
 * registry read-back, so a reload after a claim never re-claims.
 *
 * Copy rule (global product rule): NO em dashes anywhere — "·", commas, periods.
 *
 * Mobile-first (CLAUDE.md, ~390px): single column, the card is `max-w`-bounded
 * and full-width below it. The shared screens own the founder copy and CTAs;
 * this shell owns the parchment card, the logo row, and the progress bar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../state/GameContext";
import { isPublicSiteEnabled } from "../config";
import { checkHandleAvailability } from "../lib/auth";
import { HANDLE_MIN_CHARS, isValidHandle, normalizeHandleInput } from "../lib/handleRules";
import {
  LogoMark,
  ProgressBar,
  FounderProfile,
  WebsiteReveal,
  MoneyBooth,
  ThePath,
  type ClaimBadge,
  type ClaimNotice,
  type FounderProfileClaim,
} from "./onboarding/screens";

/** Debounce for the as-you-type availability check (R1). */
const AVAILABILITY_DEBOUNCE_MS = 350;

export function Onboarding() {
  const game = useGame();
  const { ob, profile, dispatch } = game;
  // Clamp to the valid screen range so an out-of-range `ob` never blanks the UI.
  const screen = Math.min(5, Math.max(2, ob));

  const siteEnabled = isPublicSiteEnabled();
  // The site slice (Unit 4 read-back). Defensive default: legacy flag-off
  // stubs/providers without the slice must render exactly as before.
  const site = game.site ?? { handle: null, status: "unknown" as const };
  /** The account already holds a handle: resume/claimed pass-through (R3). */
  const alreadyClaimed =
    site.handle !== null &&
    (site.status === "claimed" || site.status === "published" || site.status === "offline");

  // ── Claim-step state (all ABOVE the conditional screen mounts, so a pending
  // claim survives any resize/breakpoint swap — breakpoint-crossing learning).
  /** The learner's explicit handle edit, or null while untouched (the input
   *  then previews the normalized first-name slug per R15's nudge). */
  const [handleTyped, setHandleTyped] = useState<string | null>(null);
  const [badge, setBadge] = useState<ClaimBadge>("none");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [notice, setNotice] = useState<ClaimNotice>(null);
  const [claiming, setClaiming] = useState(false);
  /** Synchronous in-flight guard: double-tap → ONE claim request (the
   *  client-minted-idempotency-key learning — state flags render too late). */
  const claimInFlightRef = useRef(false);
  /** One-shot completion guard (screen 5 CTA). */
  const completeRef = useRef(false);
  /** Monotonic sequence for availability responses: only the latest-started
   *  check may write the badge (a slow stale response is dropped). */
  const checkSeqRef = useRef(0);

  /** The candidate handle the claim/availability paths act on. */
  const effectiveHandle = useMemo(() => {
    if (alreadyClaimed) return site.handle ?? "";
    return handleTyped ?? normalizeHandleInput(profile.firstName);
  }, [alreadyClaimed, site.handle, handleTyped, profile.firstName]);

  // ── Debounced live availability (R1): pending badge immediately, one
  // cancellable check per settled input, failed check → silent (never blocks
  // typing; the claim re-validates server-side at submit anyway). The fetch
  // itself is not aborted (no AbortController — accepted residual: at most one
  // ~350ms-debounced request completes wasted); staleness is handled entirely
  // by the sequence guard below.
  useEffect(() => {
    // Every effect run — INCLUDING the early-return branches (screen change,
    // claimed resume, flag off) — bumps the sequence, so any response still in
    // flight from a previous run is unconditionally stale.
    const seq = ++checkSeqRef.current;
    if (!siteEnabled || alreadyClaimed || screen !== 2) return;
    const handle = effectiveHandle;
    if (handle.length < HANDLE_MIN_CHARS) {
      setBadge("short");
      setSuggestions([]);
      return;
    }
    setBadge("pending");
    const timer = setTimeout(() => {
      void checkHandleAvailability(handle).then((result) => {
        if (seq !== checkSeqRef.current) return; // superseded: drop stale answer
        if (!result.ok) {
          // Failed check (offline/outage): say nothing, keep typing (R1).
          setBadge("none");
          return;
        }
        setBadge(result.verdict);
        setSuggestions(result.verdict === "taken" ? result.suggestions : []);
      });
    }, AVAILABILITY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [siteEnabled, alreadyClaimed, screen, effectiveHandle]);

  const onHandleChange = useCallback((value: string) => {
    // R15: auto-lowercase, invalid characters dropped, length clamped — the
    // input always displays the normalized candidate the server would see.
    setHandleTyped(normalizeHandleInput(value));
    setNotice(null);
  }, []);

  /** The real claim (screen 2 CTA + one-tap suggestion picks). */
  const claimNow = useCallback(
    async (rawHandle: string) => {
      if (claimInFlightRef.current) return; // second tap in the burst: drop
      const handle = normalizeHandleInput(rawHandle);
      if (handle.length < HANDLE_MIN_CHARS || !isValidHandle(handle)) {
        setBadge("short");
        return;
      }
      // R23 screening happens SERVER-side on this request (blocklist +
      // reserved words); the `invalid` refusal below renders the kid-friendly
      // inline message. The client deliberately holds no term list.
      claimInFlightRef.current = true;
      setClaiming(true);
      setNotice(null);
      try {
        const result = await game.claimSite(handle);
        if (result.ok) {
          // GameContext already adopted the canonical handle into the slice.
          dispatch({ type: "SET_OB", ob: 3 });
          return;
        }
        switch (result.reason) {
          case "taken":
            // The R3 race branch: an "available" badge lost at submit. Inline
            // explanation + the server's refreshed suggestions — never a dead
            // end; manual entry stays open.
            setBadge("taken");
            setSuggestions(result.suggestions);
            setNotice("race");
            break;
          case "invalid":
            // The server's R23/format refusal (blocklisted, reserved, or
            // format-invalid — deliberately not distinguished): badge plus the
            // full-sentence kid-friendly inline message.
            setBadge("invalid");
            setNotice("invalid");
            break;
          case "already-claimed":
            // The account holds a handle this slice had not adopted yet (a
            // stale read-back). Adopt via the registry read and advance —
            // never a second claim.
            void game.refreshSiteStatus();
            dispatch({ type: "SET_OB", ob: 3 });
            break;
          case "outage":
            setNotice("outage");
            break;
        }
      } finally {
        claimInFlightRef.current = false;
        setClaiming(false);
      }
    },
    [game, dispatch],
  );

  const onFounderNext = useCallback(() => {
    if (!siteEnabled || alreadyClaimed) {
      // Flag off: original behavior. Claimed resume: advance, no re-claim.
      dispatch({ type: "SET_OB", ob: 3 });
      return;
    }
    void claimNow(effectiveHandle);
  }, [siteEnabled, alreadyClaimed, dispatch, claimNow, effectiveHandle]);

  const onPickSuggestion = useCallback(
    (suggestion: string) => {
      // One-tap pick claims immediately (R2); the input adopts the pick so a
      // lost race keeps it as the editable starting point.
      setHandleTyped(normalizeHandleInput(suggestion));
      void claimNow(suggestion);
    },
    [claimNow],
  );

  const onComplete = useCallback(() => {
    if (completeRef.current) return;
    completeRef.current = true;
    // Seed Idea #1 (sets it active + opens the runner at 1.1.1). The idea's
    // stable id is minted at this caller boundary (gameCore stays
    // randomness-free).
    dispatch({ type: "CREATE_IDEA", ideaId: crypto.randomUUID() });
    if (!siteEnabled || !alreadyClaimed) {
      // Original synchronous completion (flag off, or no handle to publish).
      dispatch({ type: "SET_ONBOARDING_COMPLETE" });
      dispatch({ type: "SET_STAGE", stage: "app" });
      return;
    }
    // Completion publish (Key Technical Decision): flush the save NOW and
    // publish ONLY on a LANDED result — publish is the authoritative content
    // re-sync, so it must never go live over content that has not reached the
    // server. Completion itself is NEVER blocked: every path below falls
    // through to SET_ONBOARDING_COMPLETE + SET_STAGE app, and a parked flush
    // or failed publish just leaves the slice non-published (the R19 "going
    // live…" render; Unit 6 retries on room open).
    // Session guard (Unit 5 review, P1): capture the generation BEFORE the
    // first await — if a logout (explicit or idle) lands mid-flight, the
    // finally below must NOT dispatch over the wiped session (a resurrected
    // `app` stage on a shared device is the in-memory-state-survives-logout
    // bug class).
    const gen = game.getSessionGen();
    void (async () => {
      try {
        // Yield one macrotask so React commits CREATE_IDEA first: the click
        // handler's dispatch is processed when the discrete-event task ends,
        // BEFORE any timer fires, so after this await stateRef (which the
        // engine's getSnapshot reads) carries Idea #1. The other half of the
        // old timing assumption — the engine's pending mark — is handled
        // inside GameContext.flushNow, which notifies the engine
        // synchronously before flushing.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const outcome = await game.flushNow();
        if (outcome === "landed") {
          await game.publishSite();
        }
      } catch {
        // flushNow/publishSite never throw by contract; belt-and-braces so no
        // build skew can ever wedge completion.
      } finally {
        // Only the session that started this completion may finish it.
        if (game.getSessionGen() === gen) {
          dispatch({ type: "SET_ONBOARDING_COMPLETE" });
          dispatch({ type: "SET_STAGE", stage: "app" });
        }
      }
    })();
  }, [dispatch, siteEnabled, alreadyClaimed, game]);

  /** Screen 2's claim wiring — only mounted while the flag is on. */
  const claimProps: FounderProfileClaim | undefined = siteEnabled
    ? {
        handleValue: effectiveHandle,
        onHandleChange,
        badge: alreadyClaimed ? "yours" : badge,
        suggestions: alreadyClaimed ? [] : suggestions,
        onPickSuggestion,
        notice: alreadyClaimed ? null : notice,
        claimed: alreadyClaimed,
        claiming,
      }
    : undefined;

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
          {screen === 2 && (
            <FounderProfile
              firstName={profile.firstName}
              handle={profile.handle}
              onFirstNameChange={(value) =>
                dispatch({ type: "SET_PROFILE", patch: { firstName: value } })
              }
              onNext={onFounderNext}
              claim={claimProps}
            />
          )}
          {screen === 3 && (
            <WebsiteReveal
              firstName={profile.firstName}
              // The canonical claimed handle wins over the profile preview.
              handle={siteEnabled ? (site.handle ?? profile.handle) : profile.handle}
              onNext={() => dispatch({ type: "SET_OB", ob: 4 })}
              onBack={() => dispatch({ type: "SET_OB", ob: 2 })}
              // R19: never present the page as live before the completion
              // publish lands. "live" only once the slice says published.
              liveState={
                siteEnabled ? (site.status === "published" ? "live" : "going-live") : undefined
              }
            />
          )}
          {screen === 4 && (
            <MoneyBooth
              onNext={() => dispatch({ type: "SET_OB", ob: 5 })}
              onBack={() => dispatch({ type: "SET_OB", ob: 3 })}
            />
          )}
          {screen === 5 && (
            <ThePath
              onComplete={onComplete}
              onBack={() => dispatch({ type: "SET_OB", ob: 4 })}
            />
          )}
        </div>
      </div>
    </main>
  );
}
