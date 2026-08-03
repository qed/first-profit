/**
 * Your Site room body (handoff §Rooms, screenshot 11; real-public-site plan
 * Unit 6): a browser frame for firstprofit.school/<handle> with the live site
 * headline, an editable headline input below, the active idea's one-liner if
 * written, and a "Back me · from $10" pill (in-game preview only, R8).
 *
 * The headline lives in the SAVE DOC (profile.siteHeadline), not the identity
 * profile (which is service-role-write-only). Editing dispatches SET_PROFILE
 * {siteHeadline}; the sync layer persists it, and with the public site enabled
 * a COMMIT (input blur) forces an immediate flush (R11, "edit→refresh within
 * seconds").
 *
 * ── Flag gate (VITE_ENABLE_PUBLIC_SITE) ─────────────────────────────────────
 * Flag OFF renders `LegacyYourSite`, byte-identical to the pre-Unit-6 room
 * (the mock frame with the hardcoded "● live" chip, `/you` fallback, no input
 * cap, no network). Flag ON renders the REAL room, driven by the site slice
 * (the Unit 4 registry read-back):
 *
 *   published → the URL bar is a real link (new tab, rel-hardened) + "● live".
 *   offline   → parent-unpublished OR operator-locked (deliberately
 *               undistinguished to the child): plain-text URL, a DISABLED
 *               visit affordance with a visible reason — never a warn-on-click
 *               — and editing still saves. The room never says "live" (R19).
 *   claimed   → "going live…": the claim landed but publish has not (R19's
 *               not-live-yet state). Opening the room RETRIES flush→publish
 *               for exactly this state (never for offline: a parent takedown
 *               must not be auto-reversed; republish is an explicit act that
 *               does not exist on this child surface in v1).
 *   none      → placeholder URL bar and the in-room claim UI — the SAME claim
 *               block as onboarding screen 2 (shared ClaimBlock component),
 *               wired here for existing accounts (R16: they claim at first
 *               login through this room). A successful in-room claim flows
 *               straight into publish (Key Technical Decision: claim IS the
 *               go-live moment for existing accounts — onboarding never
 *               re-runs — and triggers the parent email server-side).
 *   unknown   → the status fetch failed: neutral render — no link, no "live",
 *               no claim UI (we cannot know a claim is safe) — editing saves.
 *
 * Room open calls refreshSiteStatus() (the deferred half of the split-storage
 * read-back): a parent unpublish reaches a playing child with staleness
 * bounded by their next room open, not their next login.
 *
 * Content screening for the headline is SERVER-side at the projection/publish
 * layer (blocked strings are stored empty, so the public page falls back to
 * the default copy) — this room's job is the input cap (R6), the PII nudge
 * (R23's accepted-limit copy), and honest state display. No client blocklist
 * corpus (see src/lib/handleRules.ts). Honesty about screening (Unit 7
 * review): the self-read's `projected` payload is what the public page
 * actually renders — when a typed headline/one-liner sits beside an EMPTY
 * projected value, the room shows the kid-friendly blocked-text note instead
 * of previewing raw text forever.
 */
import { useEffect, useRef } from "react";
import { isPublicSiteEnabled } from "../../config";
import { defaultSiteHeadline, SITE_HEADLINE_MAX_CHARS } from "../../lib/siteCopy";
import { useClaimFlow } from "../../lib/useClaimFlow";
import { ClaimBlock, GreenCta } from "../claim/ClaimBlock";
import { useGame } from "../../state/GameContext";
import { ideaOneLiner } from "../../state/floorSelectors";
import type { SiteStatus } from "../../state/gameCore";

export function YourSite() {
  // The flag is baked into the bundle (never flips at runtime), so branching
  // to two components here is hook-safe and keeps the flag-off render
  // byte-identical to the pre-Unit-6 room.
  return isPublicSiteEnabled() ? <RealYourSite /> : <LegacyYourSite />;
}

/* ────────────────────────────────────────────────────────── flag OFF (mock) */

/** The pre-Unit-6 mock room, unchanged (flag-off stability contract). */
function LegacyYourSite() {
  const game = useGame();
  const { profile, activeIdea, dispatch } = game;
  const handle = profile.handle || "you";
  const oneLiner = ideaOneLiner(game, activeIdea);

  // The frame + input display the saved headline, defaulting to the shared
  // starter line (src/lib/siteCopy.ts — the public page renders the same
  // sentence, R12) while the save doc's headline is still empty.
  const headline =
    profile.siteHeadline || defaultSiteHeadline(profile.firstName || "Founder");

  return (
    <div>
      <div className="overflow-hidden rounded-[14px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white">
        <div className="flex items-center gap-1.5 border-b-2 border-[hsl(25_34%_20%/0.1)] bg-[hsl(25_34%_20%/0.05)] px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-sell" />
          <span className="h-2.5 w-2.5 rounded-full bg-scale" />
          <span className="h-2.5 w-2.5 rounded-full bg-grow" />
          <span className="ml-1.5 min-w-0 flex-1 truncate rounded-md bg-white px-2.5 py-0.5 font-mono text-[10px] text-[hsl(25_20%_38%)]">
            firstprofit.school/{handle}
          </span>
          <span className="shrink-0 font-mono text-[9px] uppercase text-verified">● live</span>
        </div>
        <div className="px-5 py-7 text-center">
          <p className="mx-auto max-w-[38ch] font-display text-[17px] font-bold leading-[1.45] text-[hsl(25_34%_20%)]">
            {headline}
          </p>
          {oneLiner ? (
            <p className="mx-auto mt-2.5 max-w-[44ch] text-[13px] text-[hsl(25_20%_38%)]">{oneLiner}</p>
          ) : null}
          <span className="mt-4 inline-block rounded-full bg-[hsl(25_34%_20%)] px-5 py-2 text-[13px] font-semibold text-[hsl(40_55%_97%)]">
            Back me · from $10
          </span>
        </div>
      </div>

      <div className="mt-4">
        <label
          htmlFor="fp-site-headline"
          className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]"
        >
          Your headline
        </label>
        <input
          id="fp-site-headline"
          value={headline}
          onChange={(e) => dispatch({ type: "SET_PROFILE", patch: { siteHeadline: e.target.value } })}
          className="w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3 text-sm text-[hsl(25_34%_20%)] outline-none focus:border-sell"
        />
        <p className="mt-2 text-[12px] text-[hsl(25_20%_38%)]">
          Edits publish instantly. Your parent sees everything that goes live.
        </p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── flag ON (real) */

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

/** The R23 accepted-limit nudge: a blocklist cannot catch self-disclosure. */
const PII_NUDGE =
  "Your page is public. Don't put your phone number, address, school, or last name on it.";

/** The honest-divergence note (Unit 7 review): shown when a locally-typed
 *  headline/one-liner was stored EMPTY by the server's word check, so the
 *  public page shows default copy while this preview shows the typed text.
 *  Kid-friendly, no scolding, actionable. NO em dashes (product rule). */
const BLOCKED_TEXT_NOTE =
  "Part of your page text can't be shown on your public page. Try different words.";

/** The designed active-idea behavior, made visible so it reads as a feature,
 *  not a data bug (Unit 6 copy note). */
const ONE_LINER_NOTE =
  "Your page shows your headline plus the one-liner from the idea you are working on right now. Switch ideas and the page follows.";

/**
 * Everything the room varies by site status, derived in ONE exhaustive switch
 * (Unit 6 review P3a) so a future sixth SiteStatus fails the build here
 * instead of silently falling into some ternary's else-branch.
 */
interface RoomView {
  /** URL-bar state chip, or none (R19: only `published` may ever say live). */
  chip: { text: string; tone: string } | null;
  /** The honest state caption under the visit row, or none (published). */
  caption: string | null;
  /** Visit affordance: a real link, a disabled-with-reason button, or none. */
  visit: "link" | "disabled" | "none";
  /** Render the in-room claim UI (unclaimed accounts only). */
  showClaim: boolean;
}

function roomViewFor(status: SiteStatus): RoomView {
  switch (status) {
    case "published":
      return { chip: { text: "● live", tone: "text-verified" }, caption: null, visit: "link", showClaim: false };
    case "offline":
      return { chip: { text: "offline", tone: "text-[hsl(14_78%_44%)]" }, caption: STATE_COPY.offline, visit: "disabled", showClaim: false };
    case "claimed":
      return { chip: { text: "going live…", tone: "text-[hsl(41_74%_38%)]" }, caption: STATE_COPY.claimed, visit: "disabled", showClaim: false };
    case "none":
      return { chip: null, caption: STATE_COPY.none, visit: "none", showClaim: true };
    case "unknown":
      return { chip: null, caption: STATE_COPY.unknown, visit: "none", showClaim: false };
    default: {
      // Exhaustiveness: a new SiteStatus must be handled above.
      const unhandled: never = status;
      return unhandled;
    }
  }
}

function RealYourSite() {
  const game = useGame();
  const { profile, activeIdea, dispatch, refreshSiteStatus, flushNow, publishSite } = game;
  // Defensive default (mirrors Onboarding): a legacy stub/provider without the
  // slice renders the neutral unknown state, never a fake handle.
  const site = game.site ?? { handle: null, status: "unknown" as const, projected: null };
  const view = roomViewFor(site.status);
  const oneLiner = ideaOneLiner(game, activeIdea);
  const headline =
    profile.siteHeadline || defaultSiteHeadline(profile.firstName || "Founder");

  // ── Honest-divergence check (Unit 7 review): the self-read's `projected`
  // is what the public page actually renders. A NON-EMPTY local string beside
  // an EMPTY projected one means the server's word check stored it empty (the
  // page shows default copy) — say so, instead of previewing raw text forever.
  // `projected` null (no row / read not answered) shows nothing: we never
  // infer a block from data we do not have. Bounded staleness: the projection
  // refreshes with the room-open read-back, same as the status itself.
  const projected = site.projected ?? null;
  const blockedTextNote =
    projected !== null &&
    ((profile.siteHeadline !== "" && projected.headline === "") ||
      (oneLiner !== "" && projected.oneLiner === ""));

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

  // ── URL bar (R19: the chip/link can never say "live" unless the slice
  // says published — see roomViewFor).
  const urlText = site.handle ? `firstprofit.school/${site.handle}` : "firstprofit.school/ …";
  const urlBarClass =
    "ml-1.5 min-w-0 flex-1 truncate rounded-md bg-white px-2.5 py-0.5 font-mono text-[10px]";

  return (
    <div>
      <div className="overflow-hidden rounded-[14px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white">
        <div className="flex items-center gap-1.5 border-b-2 border-[hsl(25_34%_20%/0.1)] bg-[hsl(25_34%_20%/0.05)] px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-sell" />
          <span className="h-2.5 w-2.5 rounded-full bg-scale" />
          <span className="h-2.5 w-2.5 rounded-full bg-grow" />
          {view.visit === "link" && site.handle ? (
            // R13: the URL bar IS the visit affordance when the page is live.
            // Server strings (the canonical handle) render through React's
            // default escaping only; the href is built from the slice's
            // already-validated handle, never echoed user input.
            <a
              href={`https://firstprofit.school/${site.handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`${urlBarClass} text-[hsl(217_74%_46%)] underline decoration-[hsl(217_74%_46%/0.4)] underline-offset-2`}
            >
              {urlText} ↗
            </a>
          ) : (
            <span className={`${urlBarClass} text-[hsl(25_20%_38%)]`}>{urlText}</span>
          )}
          {view.chip ? (
            <span className={`shrink-0 font-mono text-[9px] uppercase ${view.chip.tone}`}>
              {view.chip.text}
            </span>
          ) : null}
        </div>
        <div className="px-5 py-7 text-center">
          <p className="mx-auto max-w-[38ch] break-words font-display text-[17px] font-bold leading-[1.45] text-[hsl(25_34%_20%)]">
            {headline}
          </p>
          {oneLiner ? (
            <p className="mx-auto mt-2.5 max-w-[44ch] break-words text-[13px] text-[hsl(25_20%_38%)]">{oneLiner}</p>
          ) : null}
          {/* R8: the Back me pill stays an in-game preview affordance only. */}
          <span className="mt-4 inline-block rounded-full bg-[hsl(25_34%_20%)] px-5 py-2 text-[13px] font-semibold text-[hsl(40_55%_97%)]">
            Back me · from $10
          </span>
        </div>
      </div>

      {/* Visit affordance row: a real link when live; a DISABLED affordance
          with its reason visible (not a warning-on-click) otherwise. */}
      {view.visit === "link" && site.handle ? (
        <a
          href={`https://firstprofit.school/${site.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-[44px] items-center rounded-full border-2 border-[hsl(217_74%_56%/0.4)] bg-[hsl(217_74%_56%/0.08)] px-4 text-[13px] font-semibold text-[hsl(217_74%_46%)]"
        >
          Visit your site ↗
        </a>
      ) : null}
      {view.visit === "disabled" ? (
        // A BUTTON, not an anchor: with no href there is nothing Enter/Space
        // (or any click) could navigate to — the disabled affordance is
        // keyboard-inert by construction, and the reason renders right below.
        <button
          type="button"
          aria-disabled="true"
          onClick={(e) => e.preventDefault()}
          className="mt-3 inline-flex min-h-[44px] cursor-default items-center rounded-full border border-[hsl(25_34%_20%/0.25)] bg-[hsl(40_55%_97%)] px-4 text-[13px] font-semibold text-[hsl(25_34%_20%)] opacity-60"
        >
          Visit your site ↗
        </button>
      ) : null}
      {view.caption ? (
        <p className="mt-2 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">{view.caption}</p>
      ) : null}

      {view.showClaim ? (
        <div className="mt-5">
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

      <div className="mt-4">
        <label
          htmlFor="fp-site-headline"
          className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]"
        >
          Your headline
        </label>
        <input
          id="fp-site-headline"
          value={headline}
          maxLength={SITE_HEADLINE_MAX_CHARS}
          onChange={(e) => dispatch({ type: "SET_PROFILE", patch: { siteHeadline: e.target.value } })}
          // Commit = blur: force the debounced save out NOW so the public page
          // reflects the edit within seconds (R11). Fire-and-forget; the HUD's
          // sync status and the state chip stay the honest indicators.
          // BEST-EFFORT by design (review P3d): closing the room via ✕/Escape
          // can unmount this input without a blur, skipping the immediate
          // flush — the value is ALREADY in the reducer (SET_PROFILE per
          // keystroke), so nothing is lost; it lands on the sync engine's
          // normal 3s debounce instead of within seconds. No dedicated
          // close-path flush: one more flush trigger is not worth a second
          // commit channel for a few seconds of tail latency.
          onBlur={() => void flushNow()}
          className="w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3 text-sm text-[hsl(25_34%_20%)] outline-none focus:border-sell"
        />
        <p className="mt-2 text-[12px] text-[hsl(25_20%_38%)]">
          {site.status === "published"
            ? "Edits go live in a few seconds. Your parent can see your page too."
            : "Edits save now and show up as soon as your page is live. Your parent can see your page too."}
        </p>
        {blockedTextNote ? (
          <p className="mt-1.5 text-[12px] font-semibold text-[hsl(14_78%_44%)]">
            {BLOCKED_TEXT_NOTE}
          </p>
        ) : null}
        <p className="mt-1.5 text-[12px] font-semibold text-[hsl(25_20%_38%)]">{PII_NUDGE}</p>
        <p className="mt-1.5 text-[12px] text-[hsl(25_20%_38%)]">{ONE_LINER_NOTE}</p>
      </div>
    </div>
  );
}
