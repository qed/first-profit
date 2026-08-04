/**
 * Your Site room body (your-site-room-simplification, 2026-08-03): the room
 * no longer simulates a website. The mock browser frame, headline editor, and
 * all parent-visibility copy are deleted in every flag state; the room simply
 * reflects the real site's state and, when live, links to it.
 *
 * ── Flag gate (VITE_ENABLE_PUBLIC_SITE) ─────────────────────────────────────
 * The status-driven room renders in EVERY build: the server's self-read
 * (GET /api/fp/site) is deliberately ungated (own-row read-back only), so a
 * child whose row is already published sees their real link even when the
 * flag is off. The flag gates ONLY the claim UI (claiming and publishing need
 * the gated backend): flag off + status `none` renders just the Coming Soon
 * note, no claim UI. Every other state renders identically in both builds:
 *
 *   published → an open-your-site link (constructed href, new tab,
 *               rel-hardened, >=44px tap target, URL text truncates) + the
 *               Coming Soon note.
 *   offline   → parent-unpublished OR operator-locked (deliberately
 *               undistinguished to the child): plain-text URL, the honest
 *               reason caption, no clickable link + the note.
 *   claimed   → "going live…" caption (R19's not-live-yet state) + the note.
 *               Opening the room RETRIES flush→publish for exactly this
 *               state (never for offline: a parent takedown must not be
 *               auto-reversed).
 *   none      → the in-room claim UI — the SAME claim block as onboarding
 *               screen 2 (shared ClaimBlock/useClaimFlow), wired here for
 *               existing accounts (R16). A successful in-room claim flows
 *               straight into publish (claim IS the go-live moment for
 *               existing accounts).
 *   unknown   → the status fetch failed: neutral caption only — no link, no
 *               claim UI (we cannot know a claim is safe), no note.
 *
 * Room open calls refreshSiteStatus() (the deferred half of the split-storage
 * read-back): a parent unpublish reaches a playing child with staleness
 * bounded by their next room open, not their next login.
 *
 * The public page's one-liner keeps tracking the active idea via the Step
 * Runner field (where the PII nudge lives); site editing returns as a future
 * feature — the Coming Soon note is that commitment.
 *
 * Copy rule (global product rule): kid-voice, NO em dashes anywhere.
 */
import { useEffect, useRef } from "react";
import { isPublicSiteEnabled } from "../../config";
import { useClaimFlow } from "../../lib/useClaimFlow";
import { ClaimBlock, GreenCta } from "../claim/ClaimBlock";
import { useGame } from "../../state/GameContext";
import type { SiteStatus } from "../../state/gameCore";

export function YourSite() {
  // The status-driven room renders in every build (the self-read is ungated
  // server-side); the flag only decides whether the `none` state offers the
  // claim UI — see roomViewFor.
  return <RealYourSite />;
}

/** The one commitment the room makes about editing (normative copy). */
const COMING_SOON_NOTE = "Changing your First Profit website is coming soon.";

function ComingSoonNote() {
  return (
    <p className="text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">{COMING_SOON_NOTE}</p>
  );
}

/* ─────────────────────────────────────────── the status-driven room (real) */

/** Kid-friendly state copy. NO em dashes (global product rule). */
const STATE_COPY = {
  offline:
    "Your page is offline right now. A grown-up turned it off, and a grown-up can turn it back on. Your edits still save for when it comes back.",
  claimed:
    "Your page isn't live yet. It goes live as soon as your latest work reaches us. Check back in a minute.",
  unknown:
    "We can't check on your page right now, so no link yet. Your edits still save.",
  none: "Claim your page name below and your page goes live on the real internet.",
} as const;

/**
 * Everything the room varies by site status, derived in ONE exhaustive switch
 * so a future sixth SiteStatus fails the build here instead of silently
 * falling into some ternary's else-branch.
 */
interface RoomView {
  /** The honest state caption, or none (published needs no caption). */
  caption: string | null;
  /** URL affordance: a real open-site link, plain (non-clickable) text, or none. */
  url: "link" | "plain" | "none";
  /** Render the in-room claim UI (unclaimed accounts only). */
  showClaim: boolean;
  /** The Coming Soon note shows in every claimed-or-later state (normative). */
  showNote: boolean;
}

function roomViewFor(status: SiteStatus): RoomView {
  switch (status) {
    case "published":
      return { caption: null, url: "link", showClaim: false, showNote: true };
    case "offline":
      return { caption: STATE_COPY.offline, url: "plain", showClaim: false, showNote: true };
    case "claimed":
      return { caption: STATE_COPY.claimed, url: "none", showClaim: false, showNote: true };
    case "none":
      // The ONE flag-sensitive state: claiming needs the gated backend, so a
      // flag-off build offers no claim UI — just the Coming Soon note (the
      // claim caption would lie without the claim block below it). The flag is
      // baked into the bundle (never flips at runtime), so this branch is
      // render-stable.
      return isPublicSiteEnabled()
        ? { caption: STATE_COPY.none, url: "none", showClaim: true, showNote: false }
        : { caption: null, url: "none", showClaim: false, showNote: true };
    case "unknown":
      return { caption: STATE_COPY.unknown, url: "none", showClaim: false, showNote: false };
    default: {
      // Exhaustiveness: a new SiteStatus must be handled above.
      const unhandled: never = status;
      return unhandled;
    }
  }
}

function RealYourSite() {
  const game = useGame();
  const { profile, refreshSiteStatus, flushNow, publishSite } = game;
  // Defensive default (mirrors Onboarding): a legacy stub/provider without the
  // slice renders the neutral unknown state, never a fake handle.
  const site = game.site ?? { handle: null, status: "unknown" as const, projected: null };
  const view = roomViewFor(site.status);

  // ── Room open = the deferred registry read-back (bounded staleness for a
  // parent unpublish reaching a playing child). refreshSiteStatus is stable
  // (GameContext useCallback with empty deps) so this runs once per open; a
  // failed read adopts `unknown`, which this room renders neutrally.
  useEffect(() => {
    void refreshSiteStatus();
  }, [refreshSiteStatus]);

  // Live status mirror for the go-live sequencing below: the async attempt
  // must re-check the CURRENT status after its await, never the one captured
  // when the effect fired (Unit 6 review P0).
  const siteStatusRef = useRef(site.status);
  siteStatusRef.current = site.status;

  // ── Go-live retry / claim-to-publish sequencing. One attempt per room open
  // (the ref), fired whenever the slice reads `claimed` — which is BOTH the
  // R19 parked case at open (onboarding's publish never landed) AND the moment
  // an in-room claim succeeds (GameContext adopts status "claimed"). Sequencing
  // per the Key Technical Decision: flush first, publish ONLY on "landed"
  // (publish is the server's authoritative content re-sync). NEVER fires for
  // `offline` — a parent takedown is not auto-reversed.
  const goLiveAttemptedRef = useRef(false);
  useEffect(() => {
    if (site.status !== "claimed" || goLiveAttemptedRef.current) return;
    goLiveAttemptedRef.current = true;
    // Cancellation (review P1): cleanup runs on unmount (room closed) and on
    // any dep change, so an orphaned continuation can never publish — a
    // rapid close→reopen gets exactly the new mount's own single attempt
    // (GameContext's publish in-flight memo backstops the provider layer).
    let cancelled = false;
    void (async () => {
      try {
        const outcome = await flushNow();
        // Live re-checks before going live (review P0): the flush await is a
        // window in which (a) the room may have closed (`cancelled`), or
        // (b) the room-open refresh may have resolved a DIFFERENT status —
        // 'offline' here means a parent takedown landed mid-flight, and
        // publishing over it would auto-reverse the takedown.
        if (outcome === "landed" && !cancelled && siteStatusRef.current === "claimed") {
          await publishSite();
        }
        // Any other outcome: stay in the honest "going live…" render; the
        // next room open retries (goLiveAttemptedRef is per-mount).
      } catch {
        // flushNow/publishSite never throw by contract; belt-and-braces.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [site.status, flushNow, publishSite]);

  // ── In-room claim (status "none"): the SHARED claim state machine
  // (src/lib/useClaimFlow — one implementation with onboarding screen 2)
  // over the shared ClaimBlock. State lives in this component, which stays
  // mounted for the whole room open (the room dialog restyles across `sm`
  // without unmounting, so no breakpoint can drop an in-flight claim). On
  // success GameContext adopts status "claimed" and the go-live effect above
  // runs flush→publish (claim IS the go-live moment for existing accounts) —
  // so the post-claim continuation here is a no-op.
  const flow = useClaimFlow({
    game,
    firstName: profile.firstName,
    active: view.showClaim,
    onClaimed: () => {
      // Deliberate no-op: the slice adoption ("claimed") re-renders the room
      // and triggers the go-live effect — there is no screen to advance.
    },
  });

  const urlText = site.handle ? `firstprofit.school/${site.handle}` : "firstprofit.school/ …";

  // One container layout across states (the claim and published bodies share
  // it). Mobile-first (CLAUDE.md ~390px): the link keeps a >=44px tap target
  // and its URL text truncates at container width; no horizontal scrolling.
  return (
    <div className="flex w-full flex-col items-start gap-3">
      {view.url === "link" && site.handle ? (
        // The open-site affordance. Server strings (the canonical handle)
        // render through React's default escaping only; the href is built
        // from the slice's already-validated handle, never echoed user input.
        <a
          href={`https://firstprofit.school/${site.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] max-w-full items-center gap-1.5 rounded-full border-2 border-[hsl(217_74%_56%/0.4)] bg-[hsl(217_74%_56%/0.08)] px-4 text-[13px] font-semibold text-[hsl(217_74%_46%)]"
        >
          <span className="min-w-0 truncate font-mono">{urlText}</span>
          <span aria-hidden="true">↗</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}
      {view.url === "plain" ? (
        // Offline: the URL is shown but deliberately NOT clickable (the page
        // is down; a dead link would lie).
        <p className="max-w-full truncate font-mono text-[12.5px] text-[hsl(25_20%_38%)]">
          {urlText}
        </p>
      ) : null}
      {view.caption ? (
        <p className="text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">{view.caption}</p>
      ) : null}

      {view.showClaim ? (
        <div className="w-full">
          <h3 className="font-display text-[17px] font-black text-[hsl(25_34%_20%)]">
            Claim your page name
          </h3>
          <ClaimBlock
            claim={{
              handleValue: flow.handleValue,
              onHandleChange: flow.onHandleChange,
              badge: flow.badge,
              suggestions: flow.suggestions,
              onPickSuggestion: flow.onPickSuggestion,
              notice: flow.notice,
              claimed: false,
              claiming: flow.claiming,
            }}
          />
          <GreenCta onClick={() => void flow.claimNow(flow.handleValue)} disabled={flow.claiming}>
            {flow.claiming ? "Claiming…" : "Claim my page →"}
          </GreenCta>
        </div>
      ) : null}

      {view.showNote ? <ComingSoonNote /> : null}
    </div>
  );
}
