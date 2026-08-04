/**
 * The Path / Company / Products rows (handoff §H). Shared content rendered by
 * BOTH breakpoint variants — the desktop 2D floor and the mobile vertical path —
 * so they stay identical at the card level. Layout is mobile-first responsive:
 * 2 columns at ~390px, up to the handoff's 5 columns at lg (only the desktop
 * variant ever reaches lg, so the two never disagree on-screen).
 *
 * Unit 8: all five phase cards are REAL — unlock state from the phase engine
 * (isPhaseUnlocked, per the ACTIVE idea; origin IA: the Path shows the active
 * idea, the GlobalNav's idea chip reaches the rest), criterion pips/done from
 * isCriterionDone, and tapping an unlocked phase opens its criterion floor.
 * The Grow card carries the promotion affordance while it is locked-but-
 * promotable (an idea finished Validate and no business exists yet).
 *
 * Clickable cards call `onWalk(intent)` — they never mutate state or start a walk
 * locally. The parent (screens/Factory) holds the walk intent ABOVE the
 * desktop/mobile conditional mount, so an in-flight walk survives crossing the lg
 * breakpoint (docs/solutions/ui-bugs/breakpoint-crossing-drops-navigation).
 */
import { useGame } from "../state/GameContext";
import {
  MAX_IDEAS,
  PHASE_ORDER,
  activeBusinessExists,
  criterionIdsForPhase,
  isPhaseComplete,
  isPhaseUnlocked,
} from "../state/gameCore";
import { phaseById, type PhaseId } from "../data/path";
import { ideaProgressLabel, ideaSummaryName } from "../state/floorSelectors";
import { CompanyCard, DashedSlot, PhaseCard, ProductCard, ProductEmpty, SectionTitle } from "./PodCardContent";
import type { WalkIntent } from "./FactoryFloor";

const GRID = "mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5";

export function PhasesFloor({ onWalk }: { onWalk: (intent: WalkIntent) => void }) {
  const game = useGame();
  const { profile, ideas, activeIdea, isCriterionDone } = game;
  const handle = profile.handle || "you";

  // Promotion seam (Tier C2): a Validate-complete idea with no business yet
  // makes the locked Grow card a tap target for the promotion screen.
  const promotable =
    !activeBusinessExists(game) &&
    ideas.some((_, i) => isPhaseComplete(game, i, "validate"));

  return (
    <div className="flex flex-col gap-5">
      <section>
        {/* Idea identity lives in the GlobalNav's chip (the one bar), not here. */}
        <SectionTitle>The Path</SectionTitle>
        <div className={GRID}>
          {PHASE_ORDER.map((phaseId: PhaseId) => {
            const ph = phaseById(phaseId);
            const ids = criterionIdsForPhase(phaseId);
            const pips = ids.map((id) => isCriterionDone(activeIdea, id));
            const done = pips.filter(Boolean).length;
            // Sell stays open even with zero ideas (its floor holds the
            // "Start Idea" slot — the only place an idea is created).
            const unlocked = phaseId === "sell" || isPhaseUnlocked(game, activeIdea, phaseId);
            const isPromoteCard = phaseId === "grow" && !unlocked && promotable;
            // Locked copy extends the existing dashed treatment (no em dashes):
            // the business gate reads "promote", everything else names the
            // previous phase. A business promoted from ANOTHER idea leaves the
            // active idea's Grow locked with an honest pointer to the switcher.
            const hint =
              phaseId === "grow" && !unlocked && activeBusinessExists(game)
                ? "Your business is a different idea"
                : isPromoteCard
                  ? "Promote an idea first"
                  : undefined;
            return (
              <PhaseCard
                key={phaseId}
                index={ph.index}
                unlocked={unlocked}
                done={done}
                pips={pips}
                hint={hint}
                promotable={isPromoteCard}
                onClick={() =>
                  onWalk(isPromoteCard ? { kind: "openPromote" } : { kind: "openPhaseFloor", phase: phaseId })
                }
              />
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle>The Company</SectionTitle>
        <div className={GRID}>
          <CompanyCard
            emoji="🌐"
            name="Your Site"
            url={`firstprofit.school/${handle}`}
            onClick={() => onWalk({ kind: "openRoom", room: "website" })}
          />
          <CompanyCard
            emoji="💳"
            name="The Checkout Booth"
            url={`pay.firstprofit.school/${handle}`}
            onClick={() => onWalk({ kind: "openRoom", room: "checkout" })}
          />
          <DashedSlot label="Built on The Path" />
          <DashedSlot label="Built on The Path" />
          <DashedSlot label="Built on The Path" />
        </div>
      </section>

      <section>
        <SectionTitle>The Products</SectionTitle>
        <div className={GRID}>
          {Array.from({ length: MAX_IDEAS }).map((_, n) =>
            n < ideas.length ? (
              <ProductCard
                key={n}
                num={n + 1}
                name={ideaSummaryName(game, n)}
                progress={ideaProgressLabel(game, n)}
                onOpen={() => onWalk({ kind: "openIdea", ideaIndex: n })}
              />
            ) : (
              <ProductEmpty key={n} num={n + 1} />
            ),
          )}
        </div>
      </section>
    </div>
  );
}
