/**
 * The top-level `app` surface (handoff §H). This screen OWNS the two pieces of
 * in-flight intent that must outlive the desktop/mobile variant swap at lg:
 *
 *   - `walkTo`  : the WalkIntent a card tap wants to run once the avatar arrives.
 *   - `floorView`: phases | sell (which sub-floor is showing).
 *
 * Both live HERE, above <FactoryFloor/>'s matchMedia conditional mount, per
 * docs/solutions/ui-bugs/breakpoint-crossing-drops-navigation (BINDING). Card
 * taps flow: card → onWalk(intent) → setWalkTo → the mounted variant animates and
 * calls onArrived(intent) → we run the action and clear walkTo (at-least-once).
 * Crossing lg mid-walk cancels the old variant's timer but not the intent, so the
 * new variant's effect resumes it.
 *
 * Dialog / runner / picker / celebration open-state lives in the gameCore reducer
 * (in the provider, above everything), so those already survive the swap; we just
 * render them here. The mock Stripe checkout overlay was retired in Payment Phase
 * 2 Unit 4; the Checkout Booth now teaches the provider-choice lesson inline in
 * the room dialog body.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../state/GameContext";
import { firstIncompleteTaskIndex, ideaOneLiner, nextCoachTarget, roomEntryFor } from "../state/floorSelectors";
import { stepById, type RoomId } from "../data/path";
import { FactoryFloor, type FloorView, type WalkIntent } from "../components/FactoryFloor";
import { Hud } from "../components/Hud";
import { StepRunner } from "../components/StepRunner";
import { Celebration } from "../components/Celebration";
import { GradeAsk } from "../components/GradeAsk";
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
  const { sign, name, tagline, Body } = meta;
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
 * whatever comes next (first idea → the Idea Room; otherwise the room of the next
 * incomplete criterion). Routes through onWalk so the walk animation and the
 * breakpoint-swap survival contract apply exactly as for a card tap. Hidden while
 * any overlay is open (it would sit behind the scrim but still catch tab focus)
 * and once the playable criteria are all done.
 */
function NextStepCoach({ onWalk }: { onWalk: (intent: WalkIntent) => void }) {
  const game = useGame();
  if (game.runnerOpen || game.room || game.celebrate || game.pickFor) return null;
  const target = nextCoachTarget(game);
  if (!target) return null;
  // The promotion seam (Unit 6): an idea validated through phase 3 with no
  // business promoted yet. Unit 8 renders the promotion CTA; until then the
  // coach hides rather than pointing at the locked Grow phase.
  if (target.kind === "promote") return null;

  const name =
    target.kind === "create"
      ? ROOM_META.idea?.name ?? "The Idea Room"
      : ROOM_META[target.room]?.name ?? stepById(target.stepId)?.title ?? "your next room";
  const intent: WalkIntent =
    target.kind === "create" ? { kind: "createIdea" } : { kind: "enterCriterion", stepId: target.stepId };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-7 z-40 flex justify-center px-4 lg:bottom-11">
      <button
        type="button"
        onClick={() => onWalk(intent)}
        className="pointer-events-auto flex min-h-[52px] items-center gap-3 rounded-2xl bg-verified px-5 py-3 text-left text-white shadow-[0_6px_0_hsl(150_52%_26%)] transition hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_3px_0_hsl(150_52%_26%)] focus:outline-none focus-visible:ring-4 focus-visible:ring-verified/40"
      >
        <span>
          <span className="block font-display text-lg font-black leading-none">Next Step</span>
          <span className="mt-1 block font-mono text-[10px] uppercase tracking-wider text-white/85">
            Take me to {name}
          </span>
        </span>
        <span aria-hidden className="text-xl">
          →
        </span>
      </button>
    </div>
  );
}

export function Factory() {
  const game = useGame();
  const { dispatch } = game;
  const [walkTo, setWalkTo] = useState<WalkIntent | null>(null);
  const [floorView, setFloorView] = useState<FloorView>("phases");

  const onArrived = useCallback(
    (intent: WalkIntent) => {
      switch (intent.kind) {
        case "openSellFloor":
          setFloorView("sell");
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
          dispatch({ type: "CREATE_IDEA" });
          break;
      }
      setWalkTo(null);
    },
    [game, dispatch],
  );

  return (
    <main className="flex h-[100dvh] w-full flex-col gap-3 overflow-hidden bg-[hsl(38_46%_95%)] p-3 text-ink sm:gap-4 sm:p-5">
      <Hud />
      <div className="relative min-h-0 flex-1">
        <FactoryFloor
          walkTo={walkTo}
          onArrived={onArrived}
          onWalk={setWalkTo}
          floorView={floorView}
          onBack={() => setFloorView("phases")}
        />
        <NextStepCoach onWalk={setWalkTo} />
        {/* Ask-once birth-year card (Unit 3): non-modal, above the breakpoint
            conditional like the coach, so it survives the lg variant swap. */}
        <GradeAsk />
      </div>

      <StepRunner />
      <Celebration />
      <RoomDialog />
      <PickerDialog />
    </main>
  );
}
