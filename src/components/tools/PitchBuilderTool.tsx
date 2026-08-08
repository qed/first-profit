import { useEffect, useState, type MouseEventHandler } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Mic,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
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
import { ToolFlowProgress } from "./ToolFlowProgress";

type RunAfterWalk = (run: () => void) => MouseEventHandler<HTMLButtonElement>;

const directAction: RunAfterWalk = (run) => () => run();

const TONE_CLASS = {
  empty: "border-[hsl(25_34%_20%/0.14)] bg-white",
  incomplete: "border-build/30 bg-build/5",
  ready: "border-verified/35 bg-verified/10",
  roomy: "border-scale/45 bg-scale/10",
} as const;

const TONE_DOT_CLASS = {
  empty: "bg-[hsl(25_34%_20%/0.25)]",
  incomplete: "bg-build",
  ready: "bg-verified",
  roomy: "bg-scale",
} as const;

const FLOW_STEPS = [
  "Hook",
  "What it is",
  "Why it is good",
  "The ask",
  "Read it aloud",
] as const;

function formatTimer(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function beatSpaceMessage(words: number, target: number): string {
  if (words === 0) return "Start with the idea. The counter can wait.";
  const ratio = words / target;
  if (ratio <= 0.75) return "Plenty of room if this beat needs another detail.";
  if (ratio <= 1.1) return "A comfortable share of the minute.";
  if (ratio <= 1.4) {
    return "This beat is taking a little more room. That can work if another beat is shorter.";
  }
  return "This beat is getting large. Keep the strongest lines, then balance the whole pitch on the review screen.";
}

function BeatSpaceBubble({
  words,
  target,
  seconds,
}: {
  words: number;
  target: number;
  seconds: number;
}) {
  const ratio = target > 0 ? words / target : 0;
  const diameter = Math.round(50 + Math.min(ratio, 1.8) * 22);
  const tone =
    words === 0
      ? "border-[hsl(25_34%_20%/0.14)] bg-[hsl(25_34%_20%/0.04)]"
      : ratio <= 1.1
        ? "border-build/30 bg-build/10"
        : ratio <= 1.4
          ? "border-validate/35 bg-validate/10"
          : "border-scale/40 bg-scale/15";

  return (
    <aside className="flex min-h-[118px] items-center gap-3 rounded-[12px] border-2 border-[hsl(25_34%_20%/0.1)] bg-white px-3.5 py-3" aria-label="Beat space guide">
      <span
        className={`flex shrink-0 items-center justify-center rounded-full border-2 text-center transition-[width,height,background-color] duration-300 ${tone}`}
        style={{ width: diameter, height: diameter }}
        aria-hidden
      >
        <span>
          <strong className="block font-display text-[18px] font-black leading-none text-[hsl(25_34%_20%)]">{words}</strong>
          <span className="mt-0.5 block font-mono text-[7.5px] font-semibold uppercase text-[hsl(25_20%_38%)]">words</span>
        </span>
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[hsl(25_20%_38%)]">
          Suggested share · {target} words · {seconds}s
        </p>
        <p className="mt-1 text-[11.5px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">
          {beatSpaceMessage(words, target)}
        </p>
      </div>
    </aside>
  );
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
  const inputId = `fp-pitch-${beat.key}`;
  const hintId = `${inputId}-hint`;

  return (
    <section className="rounded-[16px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card sm:p-5">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.09em] text-sell">Write this beat</p>
      <label htmlFor={inputId} className="mt-1 block font-display text-[24px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
        {beat.label}
      </label>
      <p id={hintId} className="mt-1 text-[13px] leading-[1.5] text-[hsl(25_20%_38%)]">
        {beat.prompt}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(250px,0.65fr)]">
        <textarea
          id={inputId}
          rows={6}
          maxLength={1000}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={hintId}
          placeholder={beat.placeholder}
          className="min-h-[168px] w-full resize-y rounded-[12px] border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_30%_99%)] px-4 py-3.5 text-[15px] leading-[1.55] text-[hsl(25_34%_20%)] outline-none placeholder:text-[hsl(25_20%_38%/0.5)] focus:border-sell focus:ring-2 focus:ring-sell/15"
        />
        <BeatSpaceBubble words={words} target={beat.targetWords} seconds={beat.targetSeconds} />
      </div>
    </section>
  );
}

function FlowNavigation({
  stage,
  onBack,
  onNext,
  runAfterWalk,
}: {
  stage: number;
  onBack: () => void;
  onNext: () => void;
  runAfterWalk: RunAfterWalk;
}) {
  const nextLabel = stage === PITCH_BEATS.length - 1
    ? "Review the full pitch"
    : `Continue to ${FLOW_STEPS[stage + 1]}`;
  return (
    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      {stage > 0 ? (
        <button
          type="button"
          onClick={runAfterWalk(onBack)}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 font-display text-[13px] font-bold text-[hsl(25_20%_38%)] hover:bg-[hsl(25_34%_20%/0.06)]"
        >
          <ArrowLeft size={16} aria-hidden /> Back
        </button>
      ) : <span />}
      <button
        type="button"
        onClick={runAfterWalk(onNext)}
        className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-verified px-5 font-display text-[15px] font-bold text-white shadow-[0_4px_0_hsl(150_52%_26%)] active:translate-y-px active:shadow-[0_2px_0_hsl(150_52%_26%)]"
      >
        {nextLabel} <ArrowRight size={17} aria-hidden />
      </button>
    </div>
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
  const [stage, setStage] = useState(0);
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
  const activeBeat = stage < PITCH_BEATS.length ? PITCH_BEATS[stage] : null;
  const totalBubbleSize = Math.round(74 + Math.min(assessment.totalWords / PITCH_WORD_MAX, 1.25) * 30);

  return (
    <div aria-labelledby="fp-pitch-builder-title" className="pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sell">One beat at a time</p>
          <h3 id="fp-pitch-builder-title" className="mt-1 font-display text-[24px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">60-Second Pitch Builder</h3>
          <p className="mt-1.5 max-w-[620px] text-[13.5px] leading-[1.55] text-[hsl(25_20%_38%)]">The word guides are flexible. Give one beat more room and another less, then judge the whole pitch by reading it aloud.</p>
        </div>
        <div className="w-full rounded-[13px] border-2 border-[hsl(25_34%_20%/0.12)] bg-white p-3 shadow-card sm:max-w-[320px]">
          <ToolFlowProgress current={stage + 1} steps={FLOW_STEPS} />
        </div>
      </div>

      {legacyDraft && stage === 0 ? (
        <div className="mt-4 rounded-[12px] border-2 border-build/25 bg-build/5 px-3.5 py-3 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">
          <p className="font-bold text-[hsl(25_34%_20%)]">Your saved pitch is here.</p>
          <p className="mt-0.5">We divided it into four beats. Nothing changes in your saved work until you edit or save the split.</p>
          <button type="button" onClick={runAfterWalk(() => persistValues(values))} className="mt-2 inline-flex min-h-[44px] items-center rounded-xl border-2 border-build/30 bg-white px-3.5 font-display text-[13px] font-bold text-build">Save as four beats</button>
        </div>
      ) : null}

      {activeBeat ? (
        <div className="mt-4">
          <BeatEditor beat={activeBeat} value={values[activeBeat.key]} onChange={(value) => changeBeat(activeBeat.key, value)} />
          <FlowNavigation stage={stage} onBack={() => setStage(stage - 1)} onNext={() => setStage(stage + 1)} runAfterWalk={runAfterWalk} />
        </div>
      ) : (
        <div className="mt-4">
          <section className="rounded-[16px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card sm:p-5" aria-labelledby="fp-pitch-review-title">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.09em] text-verified">Final screen · hear the whole thing</p>
                <h4 id="fp-pitch-review-title" className="mt-1 font-display text-[23px] font-black text-[hsl(25_34%_20%)]">Review the full pitch</h4>
                <p className="mt-1 max-w-[600px] text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">The total matters more than making every beat land on its suggested number.</p>
              </div>
              <div className="flex items-center gap-3 rounded-[12px] border-2 border-build/20 bg-build/5 px-3.5 py-3">
                <span className="flex shrink-0 items-center justify-center rounded-full border-2 border-build/30 bg-build/10 text-center transition-[width,height]" style={{ width: totalBubbleSize, height: totalBubbleSize }} aria-hidden>
                  <span><strong className="block font-display text-[24px] font-black leading-none text-[hsl(25_34%_20%)]">{assessment.totalWords}</strong><span className="font-mono text-[8px] uppercase text-[hsl(25_20%_38%)]">total</span></span>
                </span>
                <div><p className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">Whole-pitch space</p><p className="mt-0.5 font-mono text-[9px] uppercase text-[hsl(25_20%_38%)]">{PITCH_WORD_TARGET} guide · {PITCH_WORD_MAX} cap</p></div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PITCH_BEATS.map((beat, index) => {
                const text = values[beat.key].trim();
                return (
                  <button key={beat.key} type="button" onClick={runAfterWalk(() => setStage(index))} aria-label={`Edit ${beat.label}`} className="min-h-[92px] rounded-[11px] border-2 border-[hsl(25_34%_20%/0.12)] bg-[hsl(40_30%_99%)] p-3 text-left hover:border-build/35">
                    <span className="flex items-center justify-between gap-2"><strong className="font-display text-[13.5px] font-black text-[hsl(25_34%_20%)]">{beat.label}</strong><span className="font-mono text-[9px] font-semibold text-build">{countPitchWords(text)} words</span></span>
                    <span className="mt-1.5 block line-clamp-2 text-[11px] leading-[1.45] text-[hsl(25_20%_38%)]">{text || "Tap to add this beat."}</span>
                  </button>
                );
              })}
            </div>

            <section aria-label="Pitch timing assessment" role="status" className={`mt-4 rounded-[13px] border-2 p-3.5 ${TONE_CLASS[assessment.tone]}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2.5 sm:min-w-[170px]"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT_CLASS[assessment.tone]}`} aria-hidden /><div><p className="font-display text-[17px] font-black leading-tight text-[hsl(25_34%_20%)]">{assessment.totalWords} words</p><p className="font-mono text-[8.5px] uppercase tracking-[0.07em] text-[hsl(25_20%_38%)]">about {assessment.estimatedSeconds}s</p></div></div>
                <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-[1.5] text-[hsl(25_34%_20%)]">{assessment.message}</p>
              </div>
            </section>

            <section aria-label="One-minute read-aloud timer" className="mt-4 flex flex-col gap-3 rounded-[14px] border-2 border-verified/25 bg-verified/5 p-3.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3"><Mic size={21} className="shrink-0 text-verified" aria-hidden /><div><p className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">Now trust your voice</p><p className="mt-0.5 text-[11.5px] leading-[1.45] text-[hsl(25_20%_38%)]">Start the clock, read naturally, then edit only what actually feels crowded.</p></div></div>
              <div className="flex shrink-0 items-center gap-2"><div className="min-w-[68px] text-center"><p role="timer" aria-label={`${secondsLeft} seconds remaining`} className="font-display text-[30px] font-black leading-none tabular-nums text-[hsl(25_34%_20%)]">{formatTimer(secondsLeft)}</p><p aria-live="polite" className={`mt-1 font-mono text-[8px] uppercase tracking-[0.08em] ${secondsLeft === 0 ? "font-bold text-sell" : "text-[hsl(25_20%_38%)]"}`}>{timerCaption}</p></div><button type="button" onClick={runAfterWalk(toggleTimer)} aria-label={timerLabel} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-sell px-3.5 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)]">{timerRunning ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}{timerLabel}</button><button type="button" onClick={runAfterWalk(resetTimer)} aria-label="Reset timer" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] text-[hsl(25_34%_20%)]"><RotateCcw size={17} aria-hidden /></button></div>
            </section>
          </section>

          <div className="mt-4"><button type="button" onClick={runAfterWalk(() => setStage(PITCH_BEATS.length - 1))} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 font-display text-[13px] font-bold text-[hsl(25_20%_38%)] hover:bg-[hsl(25_34%_20%/0.06)]"><ArrowLeft size={16} aria-hidden /> Back to the ask</button></div>
        </div>
      )}
    </div>
  );
}
