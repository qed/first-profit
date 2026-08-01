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
 * render them here. The Step Runner (Unit 10), room dialogs + mock checkout
 * (Unit 11) are MINIMAL placeholders here — functional enough that the game loop
 * (create idea → do tasks → pass criterion → unlock 1.2) works and nothing is
 * broken, but visually plain. See the per-dialog notes for where Units 10/11 plug in.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../state/GameContext";
import { firstIncompleteTaskIndex, ideaOneLiner, roomEntryFor } from "../state/floorSelectors";
import type { RoomId } from "../data/path";
import { FactoryFloor, type FloorView, type WalkIntent } from "../components/FactoryFloor";
import { Hud } from "../components/Hud";
import { StepRunner } from "../components/StepRunner";
import { Celebration } from "../components/Celebration";
import { MockCheckout } from "../components/MockCheckout";
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
      <div className="min-h-0 flex-1">
        <FactoryFloor
          walkTo={walkTo}
          onArrived={onArrived}
          onWalk={setWalkTo}
          floorView={floorView}
          onBack={() => setFloorView("phases")}
        />
      </div>

      <StepRunner />
      <Celebration />
      <RoomDialog />
      <MockCheckout />
      <PickerDialog />
    </main>
  );
}
