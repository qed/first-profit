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
import { useCallback, useState } from "react";
import { useGame } from "../state/GameContext";
import { PLAYABLE_STEPS } from "../state/gameCore";
import { parseTask, stepById } from "../data/path";
import { firstIncompleteTaskIndex, ideaOneLiner, roomEntryFor } from "../state/floorSelectors";
import { FactoryFloor, type FloorView, type WalkIntent } from "../components/FactoryFloor";
import { Hud } from "../components/Hud";

/** Room-id → display name for the placeholder room dialog. */
const ROOM_NAMES: Record<string, string> = {
  website: "Your Site",
  checkout: "The Checkout Booth",
};

/** Criterion id → sell room name (for the celebration unlock listing). */
const CRITERION_ROOMS: Record<string, string> = {
  "1.1": "The Idea Room",
  "1.2": "The Sales Room",
  "1.3": "The Learning Room",
  "1.4": "The Pricing Room",
  "1.5": "The Outreach Room",
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
 * Unit 10 replaces this with the full Step Runner (task rail, "how" copy, saved
 * inputs). For now: a functional minimal runner so tasks can be completed and
 * criteria passed. State (runnerOpen/runnerStep/runnerIndex) is the reducer's.
 */
function RunnerDialog() {
  const { runnerOpen, runnerStep, runnerIndex, activeIdea, isTaskDone, dispatch } = useGame();
  if (!runnerOpen || !runnerStep) return null;
  const step = stepById(runnerStep);
  if (!step) return null;
  const total = step.tasks.length;
  const idx = Math.min(runnerIndex, total - 1);
  const critNum = PLAYABLE_STEPS.indexOf(runnerStep as (typeof PLAYABLE_STEPS)[number]) + 1;
  const task = parseTask(step.tasks[idx]).label;
  const alreadyDone = isTaskDone(activeIdea, runnerStep, idx);

  const doIt = () => {
    dispatch({ type: "COMPLETE_TASK", ideaIndex: activeIdea, stepId: runnerStep, index: idx });
    if (idx + 1 < total) dispatch({ type: "OPEN_RUNNER", stepId: runnerStep, index: idx + 1 });
  };

  return (
    <Modal label="Step Runner" onClose={() => dispatch({ type: "CLOSE_RUNNER" })}>
      <header className="border-b-2 border-[hsl(25_34%_20%/0.1)] bg-[hsl(14_78%_54%/0.09)] px-6 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[hsl(14_78%_44%)]">
          Phase 1 · Sell · Criterion {critNum} of 5 · Idea #{activeIdea + 1}
        </p>
        <h2 className="mt-1 font-display text-xl font-black leading-tight text-[hsl(25_34%_20%)]">{step.title}</h2>
      </header>
      <div className="flex gap-1.5 border-b-2 border-[hsl(25_34%_20%/0.1)] px-6 py-3">
        {step.tasks.map((_, i) => (
          <span
            key={i}
            className="h-1.5 flex-1 rounded-full"
            style={{ background: isTaskDone(activeIdea, runnerStep, i) ? "hsl(150 52% 40%)" : i === idx ? "hsl(14 78% 54%)" : "hsl(25 34% 20% / .12)" }}
          />
        ))}
      </div>
      <div className="px-6 py-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(25_20%_38%)]">Task {idx + 1} of {total}</p>
        <p className="mt-2 font-display text-[22px] font-black leading-tight text-[hsl(25_34%_20%)]">{task}</p>
        <p className="mt-4 text-[13px] leading-[1.6] text-[hsl(25_20%_38%)]">
          The full Step Runner (how-to, saved answers, "done when") arrives in the next build. For now,
          mark the task once you have really done it.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={doIt}
            disabled={alreadyDone}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-verified px-5 font-display text-base font-bold text-white shadow-[0_6px_0_hsl(150_52%_26%)] disabled:opacity-50"
          >
            {alreadyDone ? "Done" : "✓ I did it"}
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "CLOSE_RUNNER" })}
            className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] px-5 font-display text-base font-bold text-[hsl(25_34%_20%)]"
          >
            Back to the Floor
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Unit 10 replaces this with the wax-stamp celebration. Minimal functional version. */
function CelebrationDialog() {
  const { celebrate, dispatch } = useGame();
  if (!celebrate) return null;
  const step = stepById(celebrate);
  const num = PLAYABLE_STEPS.indexOf(celebrate as (typeof PLAYABLE_STEPS)[number]) + 1;
  const nextId = `1.${num + 1}`;
  const nextRoom = CRITERION_ROOMS[nextId];

  return (
    <Modal label="Criterion passed" onClose={() => dispatch({ type: "DISMISS_CELEBRATION" })}>
      <div className="px-6 py-8 text-center">
        <span
          className="fp-stamp mx-auto flex h-16 w-16 items-center justify-center rounded-full text-2xl text-white"
          style={{ background: "hsl(4 62% 46%)", animation: "fp-stamp .55s cubic-bezier(.34,1.56,.64,1) both" }}
        >
          ✓
        </span>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[hsl(14_78%_44%)]">Criterion passed</p>
        <h2 className="mt-1 font-display text-[26px] font-black leading-tight text-[hsl(25_34%_20%)]">{step?.title}</h2>
        {step ? <p className="mt-1 font-mono text-sm font-bold text-verified">+{step.xp} XP</p> : null}
        {nextRoom ? (
          <div className="mt-5 rounded-2xl border-2 border-[hsl(150_52%_40%/0.3)] bg-[hsl(150_52%_40%/0.08)] px-4 py-3 text-left">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(25_20%_38%)]">New on The Path</p>
            <p className="mt-1 font-display text-[15px] font-bold text-[hsl(25_34%_20%)]">
              {nextId} · {nextRoom}
            </p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => dispatch({ type: "DISMISS_CELEBRATION" })}
          className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-verified px-5 font-display text-base font-bold text-white shadow-[0_6px_0_hsl(150_52%_26%)]"
        >
          Keep going →
        </button>
      </div>
    </Modal>
  );
}

/** Unit 11 replaces this with the real Your Site / Checkout Booth rooms + mock checkout. */
function RoomDialog() {
  const { room, dispatch } = useGame();
  if (!room) return null;
  const name = ROOM_NAMES[room] ?? room;
  return (
    <Modal label={name} onClose={() => dispatch({ type: "CLOSE_ROOM" })}>
      <div className="px-6 py-8">
        <h2 className="font-display text-2xl font-black text-[hsl(25_34%_20%)]">{name}</h2>
        <p className="mt-3 text-sm leading-[1.6] text-[hsl(25_20%_38%)]">
          This room opens fully in the next build. It is live and connected to your page.
        </p>
        <button
          type="button"
          onClick={() => dispatch({ type: "CLOSE_ROOM" })}
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] px-5 font-display text-base font-bold text-[hsl(25_34%_20%)]"
        >
          Back to the Floor
        </button>
      </div>
    </Modal>
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

      <RunnerDialog />
      <CelebrationDialog />
      <RoomDialog />
      <PickerDialog />
    </main>
  );
}
