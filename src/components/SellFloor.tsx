/**
 * The Sell-phase sub-floor (handoff §"Sell phase floor"): five room cards with
 * sequential unlock, "You are here", wax stamp, and the Your Ideas row whose
 * "＋ Start Idea #N" slot is the ONLY place a new idea is created.
 *
 * Shared by both breakpoint variants (same reasoning as PhasesFloor). All taps
 * route through `onWalk(intent)`; the back pill calls `onBack` (an immediate
 * Factory-level setter, no walk). Room-entry routing (0/1/many eligible ideas)
 * is decided in Factory via roomEntryFor — this file only emits the intent.
 */
import { useGame } from "../state/GameContext";
import { MAX_IDEAS } from "../state/gameCore";
import { stepById } from "../data/path";
import { ideaProgressLabel, ideaSummaryName } from "../state/floorSelectors";
import { IdeaSlot, SectionTitle, SellRoomCard } from "./PodCardContent";
import type { WalkIntent } from "./FactoryFloor";

interface Criterion {
  id: string;
  room: string;
  sign: string;
  title: string;
  built: boolean;
}

const SELL_CRITERIA: Criterion[] = [
  { id: "1.1", room: "The Idea Room", sign: "💡", title: "Pitch a product in 60 seconds, no notes", built: true },
  { id: "1.2", room: "The Sales Room", sign: "🛒", title: "Make a real sale", built: true },
  { id: "1.3", room: "The Learning Room", sign: "🎓", title: 'Hear "no" 3 times and learn from the conversations', built: false },
  { id: "1.4", room: "The Pricing Room", sign: "🏷️", title: "Explain cost, price and profit on one page", built: false },
  { id: "1.5", room: "The Outreach Room", sign: "📣", title: "25 supervised outreach attempts", built: false },
];

const GRID = "mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5";

export function SellFloor({ onWalk, onBack }: { onWalk: (intent: WalkIntent) => void; onBack: () => void }) {
  const game = useGame();
  const { ideas, activeIdea, isCriterionDone, isStepUnlocked, nextUpFor, isTaskDone } = game;
  const nextStep = nextUpFor(activeIdea);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] rounded-full border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] px-4 font-mono text-[11px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)] hover:border-[hsl(25_34%_20%/0.4)]"
        >
          ← The Path
        </button>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[hsl(14_78%_44%)]">Phase 1 · Sell</p>
        <p className="font-display text-base font-bold text-[hsl(25_34%_20%)]">Learn to confidently sell anything.</p>
      </div>

      <div className={GRID}>
        {SELL_CRITERIA.map((c) => {
          const step = stepById(c.id);
          const total = step?.tasks.length ?? 0;
          const unlocked = c.built && ideas.some((_, i) => isStepUnlocked(i, c.id));
          const pips = step ? step.tasks.map((_, i) => isTaskDone(activeIdea, c.id, i)) : [];
          const doneTasks = pips.filter(Boolean).length;
          const complete = c.built && isCriterionDone(activeIdea, c.id);
          const isNext = nextStep === c.id;
          const hint = c.built ? `Complete ${SELL_CRITERIA[SELL_CRITERIA.indexOf(c) - 1]?.id ?? ""} first` : "Coming in the next build";
          return (
            <SellRoomCard
              key={c.id}
              sign={c.sign}
              room={c.room}
              id={c.id}
              title={c.title}
              unlocked={unlocked}
              complete={complete}
              isNext={isNext}
              pips={pips}
              meta={`${doneTasks}/${total} unit tasks · Idea #${activeIdea + 1}`}
              hint={hint}
              onClick={() => onWalk({ kind: "enterCriterion", stepId: c.id })}
            />
          );
        })}
      </div>

      <div className="mt-6">
        <SectionTitle sub="Up to five products through Sell · the best one carries into Build">Your Ideas</SectionTitle>
        <div className={GRID}>
          {Array.from({ length: MAX_IDEAS }).map((_, n) => {
            if (n < ideas.length) {
              return (
                <IdeaSlot
                  key={n}
                  kind="filled"
                  num={n + 1}
                  name={ideaSummaryName(game, n)}
                  progress={ideaProgressLabel(game, n)}
                  current={n === activeIdea}
                  onClick={() => onWalk({ kind: "openIdea", ideaIndex: n })}
                />
              );
            }
            if (n === ideas.length && n < MAX_IDEAS) {
              return <IdeaSlot key={n} kind="create" num={n + 1} onClick={() => onWalk({ kind: "createIdea" })} />;
            }
            return <IdeaSlot key={n} kind="future" num={n + 1} />;
          })}
        </div>
      </div>
    </div>
  );
}
