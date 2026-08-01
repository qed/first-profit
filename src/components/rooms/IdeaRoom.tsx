/**
 * The Idea Room room body (handoff §Rooms; criterion 1.1's room "idea"):
 * read-only cards of the active idea's one-liner (task 1.1.1) and 60-second pitch
 * (task 1.1.2), with "Not written yet. Task N of The Path writes this." empty
 * states. This room writes nothing — the Step Runner authors these fields.
 */
import { useGame } from "../../state/GameContext";

export function IdeaRoom() {
  const { ideas, activeIdea } = useGame();
  const fields = ideas[activeIdea]?.fields ?? {};
  const oneLiner = (fields.oneLiner ?? "").trim();
  const pitch = (fields.pitch ?? "").trim();

  return (
    <div>
      <p className="text-[13.5px] leading-[1.6] text-[hsl(25_20%_38%)]">
        Everything from your pitch work lives here. It flows straight onto your website when you are ready.
      </p>
      <div className="mt-3.5 flex flex-col gap-2.5">
        <div className="rounded-[14px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-4 py-3.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
            Your one-liner
          </p>
          <p className="mt-1 text-sm leading-[1.55] text-[hsl(25_34%_20%)]">
            {oneLiner || "Not written yet. Task 1 of The Path writes this."}
          </p>
        </div>
        <div className="rounded-[14px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-4 py-3.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
            Your 60-second pitch
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-[1.55] text-[hsl(25_34%_20%)]">
            {pitch || "Not written yet. Task 2 of The Path writes this."}
          </p>
        </div>
      </div>
    </div>
  );
}
