/**
 * The per-phase criterion floor (Unit 8) — the generalization of the old
 * SellFloor: ONE component, parameterized by phase, renders any phase's five
 * room cards with sequential unlock, "You are here", wax stamp, and the
 * phase's colors/tints from the PHASES data (path.ts, single source).
 *
 * Shared by both breakpoint variants (same reasoning as PhasesFloor). All taps
 * route through `onWalk(intent)`; the back pill calls `onBack` (an immediate
 * Factory-level setter, no walk). Room-entry routing (0/1/many eligible ideas)
 * is decided in Factory via roomEntryFor — this file only emits the intent.
 *
 * Idea/business context:
 *  - Phases 1-3 floors show the ACTIVE idea's progress plus the compact
 *    idea-switcher chip (origin IA decision: active idea + switcher, no
 *    row-per-idea stacking). The Your Ideas row appears on the SELL floor only
 *    (its "Start Idea" slot stays the one place a new idea is created).
 *  - Phases 4-5 floors render the BUSINESS context: the business name is the
 *    promoted idea's one-liner, and progress reads from the business record
 *    (gameCore routes grow/scale isTaskDone through it).
 * Room cards without a built dialog are still NAMED, inert cards — the Step
 * Runner is the playing surface for every phase (plan scope boundary).
 */
import { useGame } from "../state/GameContext";
import { MAX_IDEAS, activeBusiness } from "../state/gameCore";
import { BUILT_CRITERIA, STEPS, phaseById, type PhaseId } from "../data/path";
import { ideaProgressLabel, ideaSummaryName } from "../state/floorSelectors";
import { CriterionRoomCard, IdeaSlot, SectionTitle } from "./PodCardContent";
import { IdeaSwitcherChip } from "./IdeaSwitcherChip";
import type { WalkIntent } from "./FactoryFloor";

const GRID = "mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5";

export function CriterionFloor({
  phase,
  onWalk,
  onBack,
  onOpenSwitcher,
}: {
  phase: PhaseId;
  onWalk: (intent: WalkIntent) => void;
  onBack: () => void;
  onOpenSwitcher: () => void;
}) {
  const game = useGame();
  const { ideas, activeIdea, isCriterionDone, isStepUnlocked, nextUpFor, isTaskDone } = game;
  const ph = phaseById(phase);
  const criteria = STEPS.filter((s) => s.phase === phase);
  const nextStep = nextUpFor(activeIdea);
  const isBusinessPhase = phase === "grow" || phase === "scale";

  // Business context (phases 4-5): the business name IS the promoted idea's
  // one-liner (origin decision — a business is a promoted idea, not a new name).
  const business = isBusinessPhase ? activeBusiness(game) : null;
  const businessIdeaIndex = business ? ideas.findIndex((i) => i.id === business.ideaId) : -1;
  const businessName =
    businessIdeaIndex >= 0 ? ideaSummaryName(game, businessIdeaIndex) : "Your business";

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
        <p className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: ph.text }}>
          Phase {ph.index} · {ph.name}
        </p>
        <p className="font-display text-base font-bold text-[hsl(25_34%_20%)]">{ph.promise}</p>
        {isBusinessPhase ? (
          <p
            className="flex min-h-[28px] items-center gap-1.5 rounded-full px-3 font-mono text-[10px] uppercase tracking-[0.06em]"
            style={{ background: ph.wash, color: ph.text }}
          >
            <span aria-hidden>🏢</span> Your business · {businessName}
          </p>
        ) : (
          <IdeaSwitcherChip onOpen={onOpenSwitcher} />
        )}
      </div>

      <div className={GRID}>
        {criteria.map((step, pos) => {
          const built = BUILT_CRITERIA.has(step.id);
          const total = step.tasks.length;
          const unlocked = built && ideas.some((_, i) => isStepUnlocked(i, step.id));
          const pips = step.tasks.map((_, i) => isTaskDone(activeIdea, step.id, i));
          const doneTasks = pips.filter(Boolean).length;
          const complete = built && isCriterionDone(activeIdea, step.id);
          // "You are here" stops at the built frontier, exactly like the coach.
          const isNext = built && nextStep === step.id;
          // Locked hints extend the EXISTING dashed treatment: within the phase
          // it is the previous criterion; the phase's first card names the
          // phase gate (the business gate for Grow/Scale reads "promote").
          const hint = !built
            ? "Coming in the next build"
            : pos > 0
              ? `Complete ${criteria[pos - 1].id} first`
              : phase === "grow" && !business
                ? "Promote an idea first"
                : `Complete ${phaseById(PHASE_BEFORE[phase] ?? "sell").name} first`;
          const meta = isBusinessPhase
            ? `${doneTasks}/${total} unit tasks · ${businessName}`
            : `${doneTasks}/${total} unit tasks · Idea #${activeIdea + 1}`;
          return (
            <CriterionRoomCard
              key={step.id}
              sign={step.sign}
              room={step.roomName}
              id={step.id}
              title={step.title}
              unlocked={unlocked}
              complete={complete}
              isNext={isNext}
              pips={pips}
              meta={meta}
              hint={hint}
              accent={ph.accent}
              text={ph.text}
              onClick={() => onWalk({ kind: "enterCriterion", stepId: step.id })}
            />
          );
        })}
      </div>

      {phase === "sell" ? (
        <div className="mt-6">
          <SectionTitle sub="Up to five products through Sell · the best one carries into Build">
            Your Ideas
          </SectionTitle>
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
      ) : null}
    </div>
  );
}

/** The phase that precedes each phase in play order (for first-card hints). */
const PHASE_BEFORE: Partial<Record<PhaseId, PhaseId>> = {
  build: "sell",
  validate: "build",
  grow: "validate",
  scale: "grow",
};
