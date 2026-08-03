/**
 * The compact idea-switcher chip (Unit 8; origin IA decision): the Path and the
 * phase 1-3 criterion floors always show the ACTIVE idea's progress, and this
 * chip is the one-tap route to every other idea. Tapping calls `onOpen`, which
 * the parent (screens/Factory) turns into the switcher dialog — the open-state
 * lives ABOVE the breakpoint conditional mount, per the lifted-intent contract.
 * Hidden until an idea exists (there is nothing to switch to or from).
 */
import { useGame } from "../state/GameContext";
import { ideaSummaryName } from "../state/floorSelectors";

export function IdeaSwitcherChip({ onOpen }: { onOpen: () => void }) {
  const game = useGame();
  const { ideas, activeIdea } = game;
  if (ideas.length === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Switch idea"
      className="flex min-h-[44px] items-center gap-1.5 rounded-full border-2 border-[hsl(14_78%_54%/0.35)] bg-[hsl(14_78%_54%/0.08)] px-3.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[hsl(14_78%_44%)] transition-colors hover:border-[hsl(14_78%_54%)]"
    >
      <span aria-hidden>💡</span>
      <span className="max-w-[9rem] truncate sm:max-w-[14rem]">
        Idea #{activeIdea + 1} · {ideaSummaryName(game, activeIdea)}
      </span>
      <span aria-hidden className="text-[8px]">
        ▾
      </span>
    </button>
  );
}
