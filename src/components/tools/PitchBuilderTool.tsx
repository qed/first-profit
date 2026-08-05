import { useEffect, useState, type MouseEventHandler } from "react";
import { Mic, Pause, Play, RotateCcw } from "lucide-react";
import {
  PITCH_BEATS,
  PITCH_WORD_MAX,
  PITCH_WORD_TARGET,
  assessPitch,
  composePitch,
  countPitchWords,
  hasStructuredPitch,
  pitchBeatValues,
  type PitchBeat,
  type PitchFields,
} from "../../lib/pitch";

type RunAfterWalk = (run: () => void) => MouseEventHandler<HTMLButtonElement>;

const directAction: RunAfterWalk = (run) => () => run();

const TONE_CLASS = {
  empty: "border-[hsl(25_34%_20%/0.14)] bg-[hsl(40_30%_99%)]",
  incomplete: "border-build/30 bg-build/5",
  ready: "border-verified/35 bg-verified/10",
  "not-yet": "border-scale/55 bg-scale/10",
} as const;

const TONE_DOT_CLASS = {
  empty: "bg-[hsl(25_34%_20%/0.25)]",
  incomplete: "bg-build",
  ready: "bg-verified",
  "not-yet": "bg-scale",
} as const;

function formatTimer(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function BeatEditor({
  beat,
  value,
  onChange,
}: {
  beat: PitchBeat;
  value: string;
  onChange: (value: string) => void;
}) {
  const words = countPitchWords(value);
  const overTarget = words > beat.targetWords;
  const progress = Math.min(100, (words / beat.targetWords) * 100);
  const inputId = `fp-pitch-${beat.key}`;
  const hintId = `${inputId}-hint`;

  return (
    <section className="flex min-w-0 flex-col rounded-[14px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-3.5 shadow-card sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={inputId} className="font-display text-[17px] font-black text-[hsl(25_34%_20%)]">
          {beat.label}
        </label>
        <span
          className={`font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] ${
            overTarget ? "text-[hsl(35_72%_34%)]" : "text-[hsl(25_20%_38%)]"
          }`}
        >
          {words} / {beat.targetWords} words · {beat.targetSeconds}s
        </span>
      </div>
      <p id={hintId} className="mt-0.5 text-[12.5px] leading-[1.45] text-[hsl(25_20%_38%)]">
        {beat.prompt}
      </p>
      <textarea
        id={inputId}
        rows={3}
        maxLength={1000}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hintId}
        placeholder={beat.placeholder}
        className="mt-2.5 min-h-[92px] w-full resize-y rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_30%_99%)] px-3.5 py-3 text-sm leading-[1.5] text-[hsl(25_34%_20%)] outline-none placeholder:text-[hsl(25_20%_38%/0.55)] focus:border-sell focus:ring-2 focus:ring-sell/15"
      />
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[hsl(25_34%_20%/0.09)]" aria-hidden>
        <span
          className={`block h-full rounded-full transition-[width] ${overTarget ? "bg-scale" : "bg-verified"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </section>
  );
}

export function PitchBuilderTool({
  fields,
  onFieldChange,
  runAfterWalk = directAction,
}: {
  fields: PitchFields;
  onFieldChange: (key: string, value: string) => void;
  runAfterWalk?: RunAfterWalk;
}) {
  const values = pitchBeatValues(fields);
  const assessment = assessPitch(values);
  const legacyDraft = !hasStructuredPitch(fields) && Boolean(fields.pitch?.trim());
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    if (!timerRunning) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning]);

  useEffect(() => {
    if (secondsLeft === 0) setTimerRunning(false);
  }, [secondsLeft]);

  const persistValues = (nextValues: PitchFields) => {
    PITCH_BEATS.forEach((beat) => onFieldChange(beat.key, nextValues[beat.key] ?? ""));
    onFieldChange("pitch", composePitch(nextValues));
  };

  const changeBeat = (key: PitchBeat["key"], value: string) => {
    const nextValues = { ...values, [key]: value };
    // A legacy single-block pitch is only split in the UI until the first edit.
    // At that moment persist every resolved beat so no untouched text vanishes.
    if (legacyDraft) {
      persistValues(nextValues);
      return;
    }
    onFieldChange(key, value);
    onFieldChange("pitch", composePitch(nextValues));
  };

  const toggleTimer = () => {
    if (timerRunning) {
      setTimerRunning(false);
      return;
    }
    if (secondsLeft === 0) setSecondsLeft(60);
    setTimerRunning(true);
  };

  const resetTimer = () => {
    setTimerRunning(false);
    setSecondsLeft(60);
  };

  const timerLabel = timerRunning
    ? "Pause run"
    : secondsLeft === 0
      ? "Start again"
      : secondsLeft === 60
      ? "Start run"
      : "Resume run";
  const timerCaption = secondsLeft === 0 ? "Time's up" : timerRunning ? "Keep going" : "Read aloud";

  return (
    <div aria-labelledby="fp-pitch-builder-title" className="pb-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sell">
            Four beats · no notes
          </p>
          <h3 id="fp-pitch-builder-title" className="mt-1 font-display text-[24px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
            60-Second Pitch Builder
          </h3>
          <p className="mt-1.5 max-w-[620px] text-[13.5px] leading-[1.55] text-[hsl(25_20%_38%)]">
            Write one beat at a time. Aim for 120 words, then use the timer to read the whole pitch aloud.
          </p>
        </div>

        <section aria-label="One-minute read-aloud timer" className="flex shrink-0 items-center gap-2 rounded-[14px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-2.5 shadow-card">
          <div className="min-w-[74px] px-1 text-center">
            <p
              role="timer"
              aria-label={`${secondsLeft} seconds remaining`}
              className="font-display text-[32px] font-black leading-none tabular-nums text-[hsl(25_34%_20%)]"
            >
              {formatTimer(secondsLeft)}
            </p>
            <p
              aria-live="polite"
              className={`mt-1 font-mono text-[8.5px] uppercase tracking-[0.08em] ${
                secondsLeft === 0 ? "font-bold text-sell" : "text-[hsl(25_20%_38%)]"
              }`}
            >
              {timerCaption}
            </p>
          </div>
          <button
            type="button"
            onClick={runAfterWalk(toggleTimer)}
            aria-label={timerLabel}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-sell px-3.5 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] active:translate-y-px active:shadow-[0_1px_0_hsl(14_78%_38%)]"
          >
            {timerRunning ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
            {timerLabel}
          </button>
          <button
            type="button"
            onClick={runAfterWalk(resetTimer)}
            aria-label="Reset timer"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] text-[hsl(25_34%_20%)] hover:border-[hsl(25_34%_20%/0.4)]"
          >
            <RotateCcw size={17} aria-hidden />
          </button>
        </section>
      </div>

      {legacyDraft ? (
        <div className="mt-4 rounded-[12px] border-2 border-build/25 bg-build/5 px-3.5 py-3 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
          <p className="font-bold text-[hsl(25_34%_20%)]">Your saved pitch is here.</p>
          <p className="mt-0.5">
            We divided it at the four target word counts. Nothing changes in your saved work until you edit a beat.
          </p>
          <button
            type="button"
            onClick={runAfterWalk(() => persistValues(values))}
            className="mt-2 inline-flex min-h-[44px] items-center rounded-xl border-2 border-build/30 bg-white px-3.5 font-display text-[13px] font-bold text-build"
          >
            Save as four beats
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PITCH_BEATS.map((beat) => (
          <BeatEditor
            key={beat.key}
            beat={beat}
            value={values[beat.key]}
            onChange={(value) => changeBeat(beat.key, value)}
          />
        ))}
      </div>

      <section
        aria-label="Pitch timing assessment"
        role="status"
        className={`mt-4 rounded-[14px] border-2 p-3.5 ${TONE_CLASS[assessment.tone]}`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5 sm:min-w-[180px]">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT_CLASS[assessment.tone]}`} aria-hidden />
            <div>
              <p className="font-display text-[17px] font-black leading-tight text-[hsl(25_34%_20%)]">
                {assessment.totalWords} words
              </p>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.07em] text-[hsl(25_20%_38%)]">
                {PITCH_WORD_TARGET} target · {PITCH_WORD_MAX} maximum
              </p>
            </div>
          </div>
          <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-[1.5] text-[hsl(25_34%_20%)]">
            {assessment.message}
          </p>
          <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] font-bold text-[hsl(25_34%_20%)]">
            <Mic size={16} aria-hidden className="text-sell" />
            ≈ {assessment.estimatedSeconds}s
          </div>
        </div>
      </section>
    </div>
  );
}
