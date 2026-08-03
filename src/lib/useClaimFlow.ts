/**
 * Shared claim state machine (real-public-site plan, Units 5+6; extracted per
 * Unit 6 review P2): the container wiring behind the shared ClaimBlock UI
 * (src/components/claim/ClaimBlock.tsx), consumed by BOTH claim surfaces —
 * onboarding screen 2 (src/screens/Onboarding.tsx) and the Your Site room's
 * in-room claim (src/components/rooms/YourSite.tsx). One implementation of:
 *
 *  - R15 input normalization (auto-lowercase, invalid chars dropped, clamped)
 *    via src/lib/handleRules.ts; the input always displays the candidate the
 *    server would see.
 *  - R1 debounced live availability with an explicit pending badge, a
 *    monotonic SEQUENCE GUARD (only the latest-started check may write the
 *    badge — a slow stale response is dropped), and silence on a failed check
 *    (never blocks typing; the claim re-validates server-side at submit). The
 *    fetch itself is not aborted (no AbortController — accepted residual: at
 *    most one ~350ms-debounced request completes wasted).
 *  - The claim submit with a synchronous IN-FLIGHT REF (double-tap → ONE
 *    request; the client-minted-idempotency-key learning — a React-state
 *    `disabled` flag updates a render too late) and the designed refusal
 *    branches: R3 race retry (taken + refreshed suggestions), the server's
 *    R23/format `invalid` verdict (the client ships no term list), outage,
 *    and already-claimed (registry re-read, NEVER a second claim).
 *
 * The post-claim continuation stays with the container via `onClaimed`
 * (onboarding advances to screen 3; the room does nothing — the site slice
 * adoption drives its render). Cross-session safety is the PROVIDER's job:
 * GameContext's claimSite is generation-guarded, so a claim resolving after
 * logout answers a neutral outage and never mutates state. The local
 * setState calls in the `finally` are unmount-safe in React 18 (a no-op
 * without warnings), so this hook needs no unmount bookkeeping of its own.
 *
 * The hook itself is flag-agnostic: `active` gates the availability checks,
 * and both containers only mount/submit while VITE_ENABLE_PUBLIC_SITE is on.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { checkHandleAvailability } from "./auth";
import type { ClaimHandleResult } from "./auth";
import { HANDLE_MIN_CHARS, isValidHandle, normalizeHandleInput } from "./handleRules";
import type { ClaimBadge, ClaimNotice } from "../components/claim/ClaimBlock";

/** Debounce for the as-you-type availability check (R1). */
const AVAILABILITY_DEBOUNCE_MS = 350;

export interface UseClaimFlowOptions {
  /** The claim/read-back surface (structurally GameApi's; mocks satisfy it). */
  game: {
    claimSite: (handle: string) => Promise<ClaimHandleResult>;
    refreshSiteStatus: () => Promise<void>;
  };
  /** Seeds the handle preview while the learner has not typed one (R15's
   *  first-name nudge; normalized before display). */
  firstName: string;
  /** Availability checks run only while true (the claim surface is showing
   *  and no handle is held). Every flip bumps the sequence guard, so any
   *  in-flight response from a previous state is unconditionally stale. */
  active: boolean;
  /** Post-claim continuation: fired on a successful claim AND on the
   *  already-claimed adoption branch (both mean "this account holds a
   *  handle; move on"). */
  onClaimed: () => void;
}

export interface ClaimFlow {
  /** The normalized candidate handle the UI shows and the CTA submits. */
  handleValue: string;
  onHandleChange: (value: string) => void;
  badge: ClaimBadge;
  suggestions: string[];
  onPickSuggestion: (handle: string) => void;
  notice: ClaimNotice;
  claiming: boolean;
  /** The real claim (CTA + one-tap suggestion picks route through this). */
  claimNow: (rawHandle: string) => Promise<void>;
}

export function useClaimFlow({ game, firstName, active, onClaimed }: UseClaimFlowOptions): ClaimFlow {
  /** The learner's explicit handle edit, or null while untouched (the input
   *  then previews the normalized first-name slug per R15's nudge). */
  const [handleTyped, setHandleTyped] = useState<string | null>(null);
  const [badge, setBadge] = useState<ClaimBadge>("none");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [notice, setNotice] = useState<ClaimNotice>(null);
  const [claiming, setClaiming] = useState(false);
  /** Synchronous in-flight guard (see module doc). */
  const claimInFlightRef = useRef(false);
  /** Monotonic sequence for availability responses (see module doc). */
  const checkSeqRef = useRef(0);
  // Latest-props mirrors so claimNow stays identity-stable across renders
  // while always acting on the current wiring/continuation.
  const gameRef = useRef(game);
  gameRef.current = game;
  const onClaimedRef = useRef(onClaimed);
  onClaimedRef.current = onClaimed;

  const handleValue = handleTyped ?? normalizeHandleInput(firstName);

  // ── Debounced live availability (R1): pending badge immediately, one
  // cancellable check per settled input, failed check → silent.
  useEffect(() => {
    // Every effect run — INCLUDING the inactive early return — bumps the
    // sequence, so any response still in flight from a previous run is
    // unconditionally stale.
    const seq = ++checkSeqRef.current;
    if (!active) return;
    const handle = handleValue;
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
  }, [active, handleValue]);

  const onHandleChange = useCallback((value: string) => {
    // R15: auto-lowercase, invalid characters dropped, length clamped.
    setHandleTyped(normalizeHandleInput(value));
    setNotice(null);
  }, []);

  const claimNow = useCallback(async (rawHandle: string) => {
    if (claimInFlightRef.current) return; // second tap in the burst: drop
    const handle = normalizeHandleInput(rawHandle);
    if (handle.length < HANDLE_MIN_CHARS || !isValidHandle(handle)) {
      setBadge("short");
      return;
    }
    // R23 screening happens SERVER-side on this request (blocklist + reserved
    // words); the `invalid` refusal below renders the kid-friendly inline
    // message. The client deliberately holds no term list.
    claimInFlightRef.current = true;
    setClaiming(true);
    setNotice(null);
    try {
      const result = await gameRef.current.claimSite(handle);
      if (result.ok) {
        // The provider already adopted the canonical handle into the slice;
        // the container decides what happens next.
        onClaimedRef.current();
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
          // format-invalid — deliberately not distinguished).
          setBadge("invalid");
          setNotice("invalid");
          break;
        case "already-claimed":
          // The account holds a handle this slice had not adopted yet (a
          // stale read-back). Adopt via the registry read — never a second
          // claim — and continue. AWAITED before the continuation (Unit 7
          // review P3): onboarding's screen 3 renders the slice's handle, so
          // firing the continuation before the refresh lands would flash the
          // fabricated first-name fallback until the real handle arrives.
          // refreshSiteStatus never throws (fetchSiteStatus is flat-failure
          // by contract and the provider belt-and-braces catches), so the
          // continuation below always runs.
          await gameRef.current.refreshSiteStatus();
          onClaimedRef.current();
          break;
        case "outage":
          setNotice("outage");
          break;
      }
    } finally {
      // Unmount-safe (React 18: setState on an unmounted component is a
      // warning-free no-op); session safety lives in the provider's
      // generation guard, not here (see module doc).
      claimInFlightRef.current = false;
      setClaiming(false);
    }
  }, []);

  const onPickSuggestion = useCallback(
    (suggestion: string) => {
      // One-tap pick claims immediately (R2); the input adopts the pick so a
      // lost race keeps it as the editable starting point.
      setHandleTyped(normalizeHandleInput(suggestion));
      void claimNow(suggestion);
    },
    [claimNow],
  );

  return {
    handleValue,
    onHandleChange,
    badge,
    suggestions,
    onPickSuggestion,
    notice,
    claiming,
    claimNow,
  };
}
