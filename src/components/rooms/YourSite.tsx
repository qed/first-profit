/**
 * Your Site room body (handoff §Rooms, screenshot 11): a browser frame showing
 * firstprofit.school/<handle> with the live site headline, an editable headline
 * input below, the active idea's one-liner if written, and a "Back me · from $10"
 * pill.
 *
 * The headline lives in the SAVE DOC (profile.siteHeadline), not the identity
 * profile (which is service-role-write-only). Editing dispatches SET_PROFILE
 * {siteHeadline}; the sync layer persists it ("Edits publish instantly.").
 */
import { useGame } from "../../state/GameContext";
import { ideaOneLiner } from "../../state/floorSelectors";

export function YourSite() {
  const game = useGame();
  const { profile, activeIdea, dispatch } = game;
  const handle = profile.handle || "you";
  const oneLiner = ideaOneLiner(game, activeIdea);

  // The frame + input display the saved headline, defaulting to a friendly
  // starter line while the save doc's headline is still empty.
  const defaultHeadline = `Hi, I'm ${
    profile.firstName || "Founder"
  }. This is the future site of my first $1,000 profit company.`;
  const headline = profile.siteHeadline || defaultHeadline;

  return (
    <div>
      <div className="overflow-hidden rounded-[14px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white">
        <div className="flex items-center gap-1.5 border-b-2 border-[hsl(25_34%_20%/0.1)] bg-[hsl(25_34%_20%/0.05)] px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-sell" />
          <span className="h-2.5 w-2.5 rounded-full bg-scale" />
          <span className="h-2.5 w-2.5 rounded-full bg-grow" />
          <span className="ml-1.5 min-w-0 flex-1 truncate rounded-md bg-white px-2.5 py-0.5 font-mono text-[10px] text-[hsl(25_20%_38%)]">
            firstprofit.school/{handle}
          </span>
          <span className="shrink-0 font-mono text-[9px] uppercase text-verified">● live</span>
        </div>
        <div className="px-5 py-7 text-center">
          <p className="mx-auto max-w-[38ch] font-display text-[17px] font-bold leading-[1.45] text-[hsl(25_34%_20%)]">
            {headline}
          </p>
          {oneLiner ? (
            <p className="mx-auto mt-2.5 max-w-[44ch] text-[13px] text-[hsl(25_20%_38%)]">{oneLiner}</p>
          ) : null}
          <span className="mt-4 inline-block rounded-full bg-[hsl(25_34%_20%)] px-5 py-2 text-[13px] font-semibold text-[hsl(40_55%_97%)]">
            Back me · from $10
          </span>
        </div>
      </div>

      <div className="mt-4">
        <label
          htmlFor="fp-site-headline"
          className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]"
        >
          Your headline
        </label>
        <input
          id="fp-site-headline"
          value={headline}
          onChange={(e) => dispatch({ type: "SET_PROFILE", patch: { siteHeadline: e.target.value } })}
          className="w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3.5 py-3 text-sm text-[hsl(25_34%_20%)] outline-none focus:border-sell"
        />
        <p className="mt-2 text-[12px] text-[hsl(25_20%_38%)]">
          Edits publish instantly. Your parent sees everything that goes live.
        </p>
      </div>
    </div>
  );
}
