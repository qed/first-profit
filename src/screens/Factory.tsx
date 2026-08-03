/**
 * The top-level `app` surface (handoff §H). This screen OWNS the pieces of
 * UI intent that must outlive the desktop/mobile variant swap at lg:
 *
 *   - `walkTo`  : the WalkIntent a card tap wants to run once the avatar arrives.
 *   - `floorView`: phases | a phase id (which sub-floor is showing).
 *   - `promoteOpen` / `switcherOpen`: the TWO Factory-owned overlays — the
 *     PromoteBusiness screen and the idea SwitcherDialog. Their open-state is
 *     pure UI intent no reducer action ever needs to drive, so it lives in
 *     useState HERE rather than gameCore. That placement is swap-safe because
 *     Factory itself NEVER unmounts across the lg breakpoint — only
 *     FactoryFloor's two variants below it swap — so this state (like walkTo)
 *     survives a mid-interaction viewport crossing.
 *
 * All of it lives above <FactoryFloor/>'s matchMedia conditional mount, per
 * docs/solutions/ui-bugs/breakpoint-crossing-drops-navigation (BINDING). Card
 * taps flow: card → onWalk(intent) → setWalkTo → the mounted variant animates and
 * calls onArrived(intent) → we run the action and clear walkTo (at-least-once).
 * Crossing lg mid-walk cancels the old variant's timer but not the intent, so the
 * new variant's effect resumes it. Arrival is RACE-PROOF (unit review FIX 1):
 * the variants call arrival through a ref-backed stable wrapper, so the action
 * always computes against LIVE state (never the closure captured when the walk
 * started), onBack and an idea switch both CANCEL an in-flight walk
 * (walkTo → null; the variants' effect cleanup clears their timer), and the
 * kid's explicit switch always wins over a pending arrival.
 *
 * Dialog / runner / picker / celebration open-state lives in the gameCore reducer
 * (in the provider, above everything), so those already survive the swap; we just
 * render them here. While ANY overlay is open (reducer overlays + the two
 * Factory-owned ones) the floor container is `inert` and the floating helpers
 * (coach, switcher chip, GradeAsk) hide, so nothing behind a modal scrim can
 * catch taps or tab focus.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../state/GameContext";
import { isPublicSiteEnabled } from "../config";
import { firstIncompleteTaskIndex, ideaOneLiner, ideaProgressLabel, ideaSummaryName, nextCoachTarget, roomEntryFor } from "../state/floorSelectors";
import { stepById, type RoomId } from "../data/path";
import { FactoryFloor, type FloorView, type WalkIntent } from "../components/FactoryFloor";
import { Hud } from "../components/Hud";
import { StepRunner } from "../components/StepRunner";
import { Celebration } from "../components/Celebration";
import { GradeAsk } from "../components/GradeAsk";
import { PromoteBusiness } from "../components/PromoteBusiness";
import { useFocusTrap } from "../lib/useFocusTrap";
import { YourSite } from "../components/rooms/YourSite";
import { CheckoutBooth } from "../components/rooms/CheckoutBooth";
import { SalesRoom } from "../components/rooms/SalesRoom";
import { IdeaRoom } from "../components/rooms/IdeaRoom";

/** Room-id → dialog chrome (sign / name / tagline) + body. Only these four fpv2
 *  rooms have real surfaces in Slice A; any other RoomId is inert (no dialog). */
const ROOM_META: Partial<Record<RoomId, { sign: string; name: string; tagline: string; Body: () => React.JSX.Element }>> = {
  website: { sign: "🌐", name: "Your Site", tagline: "Live already. Make it yours.", Body: YourSite },
  checkout: { sign: "💳", name: "The Checkout Booth", tagline: "Take real money. Backers get store credit.", Body: CheckoutBooth },
  market: { sign: "🛒", name: "The Sales Room", tagline: "Strangers, asks, yeses and nos.", Body: SalesRoom },
  idea: { sign: "💡", name: "The Idea Room", tagline: "Pick one thing to sell. Say it in a sentence.", Body: IdeaRoom },
};

function Modal({ children, onClose, label }: { children: React.ReactNode; onClose?: () => void; label: string }) {
  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-[hsl(25_34%_20%/0.55)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
    >
      <div
        className="fp-rise w-full max-w-[560px] overflow-hidden rounded-[24px] border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] shadow-[0_8px_0_rgba(120,80,40,.1)]"
        style={{ animation: "fp-rise .3s cubic-bezier(.22,1,.36,1) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The room dialog (handoff §Rooms): Your Site / Checkout Booth / Sales Room / Idea
 * Room. One shared shell (full-screen below sm, floating from sm — the overlay
 * breakpoint, matching StepRunner/RoomShell), aria-modal, Escape-to-close, focus
 * on open; the body is the room-specific component. Reduced-motion zeroes fp-rise
 * in src/index.css.
 */
function RoomDialog() {
  const { room, dispatch } = useGame();
  const panelRef = useRef<HTMLDivElement>(null);
  const open = Boolean(room && ROOM_META[room]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "CLOSE_ROOM" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dispatch]);

  useFocusTrap(panelRef, open);

  if (!room) return null;
  const meta = ROOM_META[room];
  if (!meta) return null;
  const { sign, name, Body } = meta;
  // Truthful chrome (Unit 6, R19): the website room's static "Live already."
  // tagline is only honest for the mock. With the real public site enabled the
  // room body renders the actual state (live / going live / offline /
  // unclaimed), so the tagline stays state-neutral. Flag off keeps the
  // original string byte-for-byte.
  const tagline =
    room === "website" && isPublicSiteEnabled()
      ? "Your real page on the internet."
      : meta.tagline;
  const close = () => dispatch({ type: "CLOSE_ROOM" });

  return (
    <div className="fixed inset-0 z-[55] flex bg-[hsl(25_34%_20%/0.55)] sm:items-center sm:justify-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        tabIndex={-1}
        className="fp-rise flex h-full w-full flex-col overflow-y-auto bg-[hsl(40_55%_97%)] outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[620px] sm:rounded-3xl sm:border-2 sm:border-[hsl(25_34%_20%/0.15)] sm:shadow-[0_8px_0_rgba(120,80,40,.1)]"
        style={{ animation: "fp-rise .3s cubic-bezier(.22,1,.36,1) both" }}
      >
        <header className="flex items-center justify-between gap-4 border-b-2 border-[hsl(25_34%_20%/0.1)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-[22px]" aria-hidden>
              {sign}
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-display text-[19px] font-black text-[hsl(25_34%_20%)]">{name}</h2>
              <p className="truncate text-xs text-[hsl(25_20%_38%)]">{tagline}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Back to the floor"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] text-sm text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.4)]"
          >
            ✕
          </button>
        </header>
        <div className="px-5 pb-7 pt-5 sm:px-6">
          <Body />
        </div>
      </div>
    </div>
  );
}

/** "Which idea?" picker (handoff Multi-idea model). Small but fully functional. */
function PickerDialog() {
  const game = useGame();
  const { pickFor, ideasEligibleFor, dispatch } = game;
  if (!pickFor) return null;
  const eligible = ideasEligibleFor(pickFor);
  const close = () => dispatch({ type: "SET_PICK_FOR", pickFor: null });
  const choose = (ideaIndex: number) => {
    dispatch({ type: "SET_ACTIVE_IDEA", ideaIndex });
    dispatch({ type: "OPEN_RUNNER", stepId: pickFor, index: firstIncompleteTaskIndex(game, ideaIndex, pickFor) ?? 0 });
    close();
  };
  return (
    <Modal label="Which idea?" onClose={close}>
      <div className="px-6 py-7">
        <h2 className="font-display text-xl font-black text-[hsl(25_34%_20%)]">Which idea?</h2>
        <p className="mt-1 text-[13px] text-[hsl(25_20%_38%)]">Pick the product you are working on for {pickFor}.</p>
        <div className="mt-4 flex flex-col gap-2">
          {eligible.map((n) => {
            const oneLiner = ideaOneLiner(game, n) || "Not named yet";
            return (
              <button
                key={n}
                type="button"
                onClick={() => choose(n)}
                className="flex min-h-[48px] flex-col rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-4 py-3 text-left hover:border-sell"
              >
                <span className="font-mono text-[11px] font-bold text-[hsl(14_78%_44%)]">Idea #{n + 1}</span>
                <span className="text-[13px] text-[hsl(25_34%_20%)]">{oneLiner}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/**
 * The bottom-docked Next Step coach: one green button that walks the founder to
 * whatever comes next (first idea → the Idea Room; the room of the next
 * incomplete criterion — any phase, for the active idea or the promoted
 * business; or the promotion screen when an idea finished Validate and no
 * business exists). Routes through onWalk so the walk animation and the
 * breakpoint-swap survival contract apply exactly as for a card tap. Hidden
 * while any overlay is open (it would sit behind the scrim but still catch tab
 * focus) and once the whole path is done.
 *
 * Exported for the component test suite; only Factory mounts it.
 */
export function NextStepCoach({
  onWalk,
  overlayOpen,
}: {
  onWalk: (intent: WalkIntent) => void;
  /** Factory's lifted anyOverlayOpen (unit review FIX 5): includes the two
   *  Factory-owned overlays (promote/switcher) the reducer knows nothing of. */
  overlayOpen?: boolean;
}) {
  const game = useGame();
  // ── One-shot claim hint (real-public-site plan, Unit 6; R13/R16). With the
  // public site enabled, a HANDLE-LESS established account (status "none" from
  // the registry read-back, and at least one idea — a brand-new account's
  // first-task guidance is never preempted) is pointed at the Your Site room
  // ONCE: the coach button targets the room through the same onWalk intent
  // channel as every other coach action (no new interstitial machinery). The
  // hint is CONSUMED the moment the room opens by ANY route (this button, a
  // pod tap), then the coach reverts to normal next-step guidance for the
  // session — claiming stays an invitation, never a gate. In-memory only (the
  // gradeAskDone precedent): it reappears next session while the account
  // remains handle-less. `unknown` (failed read) deliberately shows NO hint —
  // never nudge a claim on state we could not confirm.
  const [siteHintUsed, setSiteHintUsed] = useState(false);
  const roomOpen = game.room;
  useEffect(() => {
    if (roomOpen === "website") setSiteHintUsed(true);
  }, [roomOpen]);
  if (overlayOpen || game.runnerOpen || game.room || game.celebrate || game.pickFor) return null;

  const siteHint =
    isPublicSiteEnabled() &&
    !siteHintUsed &&
    game.site?.status === "none" &&
    game.ideas.length > 0;
  if (siteHint) {
    return (
      <CoachButton
        label={`Claim your page in ${ROOM_META.website?.name ?? "Your Site"}`}
        onClick={() => onWalk({ kind: "openRoom", room: "website" })}
      />
    );
  }

  const target = nextCoachTarget(game);
  if (!target) return null;

  // The promotion seam (Unit 8 Tier C2): the CTA opens the PromoteBusiness
  // screen via the same walk/intent channel as every other coach action.
  const label =
    target.kind === "promote"
      ? "Make it your business!"
      : target.kind === "create"
        ? `Take me to ${ROOM_META.idea?.name ?? "The Idea Room"}`
        : `Take me to ${stepById(target.stepId)?.roomName ?? "your next room"}`;
  const intent: WalkIntent =
    target.kind === "promote"
      ? { kind: "openPromote" }
      : target.kind === "create"
        ? { kind: "createIdea" }
        : { kind: "enterCriterion", stepId: target.stepId };

  return <CoachButton label={label} onClick={() => onWalk(intent)} />;
}

/** The coach's docked green button chrome, shared by the normal next-step
 *  target and the Unit 6 one-shot claim hint (identical markup either way). */
function CoachButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-7 z-40 flex justify-center px-4 lg:bottom-11">
      <button
        type="button"
        onClick={onClick}
        className="pointer-events-auto flex min-h-[52px] items-center gap-3 rounded-2xl bg-verified px-5 py-3 text-left text-white shadow-[0_6px_0_hsl(150_52%_26%)] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_3px_0_hsl(150_52%_26%)] focus:outline-none focus-visible:ring-4 focus-visible:ring-verified/40"
      >
        <span>
          <span className="block font-display text-lg font-black leading-none">Next Step</span>
          <span className="mt-1 block font-mono text-[10px] uppercase tracking-wider text-white/85">
            {label}
          </span>
        </span>
        <span aria-hidden className="text-xl">
          →
        </span>
      </button>
    </div>
  );
}

/**
 * The idea-switcher dialog (Unit 8; origin IA decision): the Path shows the
 * ACTIVE idea, and this dialog is the one-tap route to any other. It reuses
 * the existing picker pattern (Modal + idea rows) but lists EVERY idea — a
 * switch is SET_ACTIVE_IDEA only; entry into a criterion stays with the
 * floor cards/coach, which now target any built phase for the newly active
 * idea. Exported for the component test suite; only Factory mounts it.
 */
export function SwitcherDialog({
  open,
  onClose,
  onSwitched,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired on an explicit idea choice (unit review FIX 1c): Factory cancels
   *  any in-flight walk here — the kid's switch wins over a pending arrival. */
  onSwitched?: () => void;
}) {
  const game = useGame();
  const { ideas, activeIdea, dispatch } = game;
  if (!open) return null;
  const choose = (ideaIndex: number) => {
    onSwitched?.();
    dispatch({ type: "SET_ACTIVE_IDEA", ideaIndex });
    onClose();
  };
  return (
    <Modal label="Switch idea" onClose={onClose}>
      <div className="px-6 py-7">
        <h2 className="font-display text-xl font-black text-[hsl(25_34%_20%)]">Switch idea</h2>
        <p className="mt-1 text-[13px] text-[hsl(25_20%_38%)]">
          The Path shows one idea at a time. Which one are you working on?
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {ideas.map((_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => choose(n)}
              className="flex min-h-[48px] flex-col rounded-2xl border-2 bg-white px-4 py-3 text-left hover:border-sell"
              style={{ borderColor: n === activeIdea ? "hsl(14 78% 54%)" : "hsl(25 34% 20% / .15)" }}
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-[hsl(14_78%_44%)]">Idea #{n + 1}</span>
                {n === activeIdea ? (
                  <span className="rounded-full bg-[hsl(14_78%_54%/0.12)] px-2 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.06em] text-[hsl(14_78%_44%)]">
                    current
                  </span>
                ) : null}
              </span>
              <span className="text-[13px] text-[hsl(25_34%_20%)]">{ideaSummaryName(game, n)}</span>
              <span className="font-mono text-[9px] text-[hsl(25_20%_38%)]">{ideaProgressLabel(game, n)}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function Factory() {
  const game = useGame();
  const { dispatch } = game;
  const [walkTo, setWalkTo] = useState<WalkIntent | null>(null);
  const [floorView, setFloorView] = useState<FloorView>("phases");
  // Overlay intents owned HERE (not the reducer): pure UI open-state that no
  // reducer action ever needs to drive, held above the breakpoint conditional
  // mount so both survive the lg swap (see PromoteBusiness's doc comment).
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Race-proof arrival (unit review FIX 1a): the floor variants fire their
  // arrival timer ~550ms after the tap, during which the game state may have
  // moved (a switch, a remote union, a completed task). The variants therefore
  // call a STABLE wrapper that reads the CURRENT implementation from a ref
  // refreshed every render, so arrival always computes against live state —
  // never the closure captured when the walk started.
  const onArrivedImpl = (intent: WalkIntent) => {
    switch (intent.kind) {
        case "openPhaseFloor":
          setFloorView(intent.phase);
          break;
        case "openPromote":
          setPromoteOpen(true);
          break;
        case "openRoom":
          dispatch({ type: "OPEN_ROOM", room: intent.room });
          break;
        case "enterCriterion": {
          const entry = roomEntryFor(game, intent.stepId);
          if (entry.action === "enter") {
            dispatch({ type: "SET_ACTIVE_IDEA", ideaIndex: entry.ideaIndex });
            dispatch({ type: "OPEN_RUNNER", stepId: intent.stepId, index: entry.index });
          } else if (entry.action === "pick") {
            dispatch({ type: "SET_PICK_FOR", pickFor: intent.stepId });
          }
          // "noop" → nothing (no eligible idea)
          break;
        }
        case "openIdea": {
          dispatch({ type: "SET_ACTIVE_IDEA", ideaIndex: intent.ideaIndex });
          const step = game.nextUpFor(intent.ideaIndex);
          if (step) {
            dispatch({
              type: "OPEN_RUNNER",
              stepId: step,
              index: firstIncompleteTaskIndex(game, intent.ideaIndex, step) ?? 0,
            });
          }
          break;
        }
        case "createIdea":
          // The idea's stable id is minted at this caller boundary (Unit 7).
          dispatch({ type: "CREATE_IDEA", ideaId: crypto.randomUUID() });
          break;
      }
    setWalkTo(null);
  };
  const onArrivedRef = useRef(onArrivedImpl);
  onArrivedRef.current = onArrivedImpl;
  const onArrived = useCallback((intent: WalkIntent) => onArrivedRef.current(intent), []);

  // Cancel any in-flight walk (FIX 1b/1c): clearing walkTo makes both floor
  // variants' [walkTo] effect cleanup run, which clears their arrival timer —
  // the intent never fires.
  const cancelWalk = useCallback(() => setWalkTo(null), []);

  // One lifted overlay truth (unit review FIX 5): the reducer-owned overlays
  // (runner / room / celebration / picker) plus the two Factory-owned ones.
  // Every overlay here is a modal takeover (full-screen below sm, floating
  // aria-modal dialog from sm up), so while ANY is open the floor container
  // goes `inert` and the floating helpers hide.
  const anyOverlayOpen =
    Boolean(game.runnerOpen || game.room || game.celebrate || game.pickFor) ||
    promoteOpen ||
    switcherOpen;
  // React 18's types don't know the `inert` attribute yet; apply it through a
  // spread so the DOM gets the real attribute without a ts-expect-error.
  const inertProps = (anyOverlayOpen ? { inert: "" } : {}) as React.HTMLAttributes<HTMLDivElement>;

  return (
    <main className="flex h-[100dvh] w-full flex-col gap-3 overflow-hidden bg-[hsl(38_46%_95%)] p-3 text-ink sm:gap-4 sm:p-5">
      <Hud />
      <div className="relative min-h-0 flex-1" {...inertProps}>
        <FactoryFloor
          walkTo={walkTo}
          onArrived={onArrived}
          onWalk={setWalkTo}
          floorView={floorView}
          onBack={() => {
            // Back cancels any in-flight walk (FIX 1b): a walk started from
            // this floor must not arrive onto the floor we just left.
            cancelWalk();
            setFloorView("phases");
          }}
          onOpenSwitcher={() => setSwitcherOpen(true)}
          overlayOpen={anyOverlayOpen}
        />
        <NextStepCoach onWalk={setWalkTo} overlayOpen={anyOverlayOpen} />
        {/* Ask-once birth-year card (Unit 3): non-modal, above the breakpoint
            conditional like the coach, so it survives the lg variant swap. */}
        <GradeAsk overlayOpen={anyOverlayOpen} />
      </div>

      <StepRunner />
      <Celebration />
      <RoomDialog />
      <PickerDialog />
      <PromoteBusiness open={promoteOpen} onClose={() => setPromoteOpen(false)} />
      <SwitcherDialog
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        onSwitched={cancelWalk}
      />
    </main>
  );
}
