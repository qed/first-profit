/**
 * The Path / Company / Products rows (handoff §H). Shared content rendered by
 * BOTH breakpoint variants — the desktop 2D floor and the mobile vertical path —
 * so they stay identical at the card level. Layout is mobile-first responsive:
 * 2 columns at ~390px, up to the handoff's 5 columns at lg (only the desktop
 * variant ever reaches lg, so the two never disagree on-screen).
 *
 * Clickable cards call `onWalk(intent)` — they never mutate state or start a walk
 * locally. The parent (screens/Factory) holds the walk intent ABOVE the
 * desktop/mobile conditional mount, so an in-flight walk survives crossing the lg
 * breakpoint (docs/solutions/ui-bugs/breakpoint-crossing-drops-navigation).
 */
import { useGame } from "../state/GameContext";
import { MAX_IDEAS, criterionIdsForPhase } from "../state/gameCore";
import { ideaProgressLabel, ideaSummaryName } from "../state/floorSelectors";
import { CompanyCard, DashedSlot, PhaseCard, ProductCard, ProductEmpty, SectionTitle } from "./PodCardContent";
import type { WalkIntent } from "./FactoryFloor";

const GRID = "mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5";

export function PhasesFloor({ onWalk }: { onWalk: (intent: WalkIntent) => void }) {
  const game = useGame();
  const { profile, ideas, activeIdea, isCriterionDone } = game;
  const handle = profile.handle || "you";

  // Phase-1 progress over the full five Sell criteria (Unit 6 engine). The
  // phase 2-5 cards stay visually locked until Unit 8 generalizes this floor.
  const sellIds = criterionIdsForPhase("sell");
  const phaseDone = sellIds.filter((id) => isCriterionDone(activeIdea, id)).length;
  const phasePips = sellIds.map((_, k) => k < phaseDone);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionTitle>The Path</SectionTitle>
        <div className={GRID}>
          <PhaseCard
            index={1}
            unlocked
            done={phaseDone}
            pips={phasePips}
            onClick={() => onWalk({ kind: "openSellFloor" })}
          />
          {[2, 3, 4, 5].map((i) => (
            <PhaseCard key={i} index={i} unlocked={false} done={0} pips={[]} />
          ))}
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
              <ProductCard key={n} num={n + 1} name={ideaSummaryName(game, n)} progress={ideaProgressLabel(game, n)} />
            ) : (
              <ProductEmpty key={n} num={n + 1} />
            ),
          )}
        </div>
      </section>
    </div>
  );
}
