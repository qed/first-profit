/**
 * GradeAsk — the ask-once birth-year card (plan Unit 3; R9/R10).
 *
 * A NON-MODAL inline card floated over the factory floor, mounted in
 * src/screens/Factory.tsx ABOVE the FactoryFloor breakpoint conditional (the
 * lifted-intent rule: its visibility state lives in the provider, so it
 * survives the lg variant swap exactly like the Next Step coach beside it).
 *
 * Shown only while: stage is `app`, the roster grade is null, and the card was
 * not answered or skipped this session. It NEVER gates play — the floor stays
 * fully interactive behind it, Skip applies the default band, and a failed
 * write-back silently falls back to the client-derived band (the provider owns
 * that logic; this component never shows the kid an error).
 *
 * Mobile-first: base classes are the 390px layout; every target is >= 44px
 * tall; from sm up the card floats at a fixed max width. Hidden while any
 * overlay is open (same rule as NextStepCoach — it would sit behind the scrim
 * but still catch tab focus).
 */
import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/GameContext";
import { birthYearBounds } from "../lib/band";

/** All user-facing copy in one place (kid-voiced, no em dashes) for review. */
export const GRADE_ASK_COPY = {
  title: "One quick thing: what year were you born?",
  yearLabel: "Birth year",
  hint: "This helps us pick the right words for you. It never slows you down.",
  placeholder: "Pick a year",
  save: "Save",
  skip: "Skip for now",
  thanks: "Got it. Thanks!",
} as const;

/** How long the thanks note stays up before the card collapses for good. */
export const THANKS_MS = 2500;

/** The birth-year options, newest first, from the shared school-year bounds. */
export function birthYearOptions(now: Date): number[] {
  const { newest, oldest } = birthYearBounds(now);
  const years: number[] = [];
  for (let y = newest; y >= oldest; y--) years.push(y);
  return years;
}

export function GradeAsk() {
  const { stage, grade, gradeAskDone, skipGradeAsk, submitGradeAnswer, runnerOpen, room, celebrate, pickFor } =
    useGame();
  const [year, setYear] = useState<string>("");
  const [saving, setSaving] = useState(false);
  // `thanks` outlives the grade adoption (which would otherwise hide the card
  // instantly), then `done` removes the card for the rest of the session.
  const [phase, setPhase] = useState<"ask" | "thanks" | "done">("ask");
  const thanksTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One-shot guard: a double-tap on Save must post exactly one answer (the
  // route is rate limited; every attempt spends budget).
  const savingRef = useRef(false);

  useEffect(
    () => () => {
      if (thanksTimer.current) clearTimeout(thanksTimer.current);
    },
    [],
  );

  if (phase === "done") return null;
  if (phase === "ask") {
    if (stage !== "app" || grade !== null || gradeAskDone) return null;
    // Behind an overlay the card is hidden, not dismissed (reappears after).
    if (runnerOpen || room || celebrate || pickFor) return null;
  }

  const save = async () => {
    const birthYear = Number.parseInt(year, 10);
    if (!Number.isInteger(birthYear) || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    // Success or generic failure both land on the thanks note: the provider
    // adopted a band either way (server grade or the local derivation), and a
    // write-back hiccup is never the kid's problem.
    await submitGradeAnswer(birthYear);
    setPhase("thanks");
    thanksTimer.current = setTimeout(() => setPhase("done"), THANKS_MS);
  };

  const skip = () => {
    skipGradeAsk();
    setPhase("done");
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center px-3 sm:top-4">
      <div className="pointer-events-auto w-full max-w-[380px] rounded-2xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_55%_97%)] p-4 shadow-[0_6px_0_rgba(120,80,40,.12)]">
        {phase === "thanks" ? (
          <p
            aria-live="polite"
            className="flex min-h-[44px] items-center justify-center text-center font-display text-[15px] font-bold text-[hsl(150_52%_32%)]"
          >
            {GRADE_ASK_COPY.thanks}
          </p>
        ) : (
          <>
            <h2 className="font-display text-[16px] font-black leading-snug text-[hsl(25_34%_20%)]">
              {GRADE_ASK_COPY.title}
            </h2>
            <p className="mt-1 text-[12px] leading-[1.5] text-[hsl(25_20%_38%)]">{GRADE_ASK_COPY.hint}</p>
            <label htmlFor="fp-grade-year" className="sr-only">
              {GRADE_ASK_COPY.yearLabel}
            </label>
            <select
              id="fp-grade-year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="mt-3 block min-h-[44px] w-full rounded-xl border-2 border-[hsl(25_34%_20%/0.2)] bg-white px-3 text-[15px] text-[hsl(25_34%_20%)] outline-none focus:border-sell"
            >
              <option value="">{GRADE_ASK_COPY.placeholder}</option>
              {birthYearOptions(new Date()).map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
            <div className="mt-3 flex gap-2.5">
              <button
                type="button"
                onClick={() => void save()}
                disabled={year === "" || saving}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-verified px-4 font-display text-sm font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)] disabled:opacity-50 disabled:shadow-none"
              >
                {GRADE_ASK_COPY.save}
              </button>
              <button
                type="button"
                onClick={skip}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.2)] px-4 font-display text-sm font-bold text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.5)]"
              >
                {GRADE_ASK_COPY.skip}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
