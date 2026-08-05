import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, MessageCircleQuestion, RefreshCcw, Sparkles } from "lucide-react";
import type { Band } from "../../data/path";
import {
  PITCH_BEATS,
  pitchBeatValues,
  type PitchBeat,
} from "../../lib/pitch";
import {
  OBJECTION_LOG_FIELD_KEYS,
  applyRevisionToPitch,
  assessObjectionEvidence,
  buildObjectionSummary,
  hasMeaningfulRevision,
  objectionEvidence,
  type ObjectionFields,
} from "../../lib/objectionLog";

const PARENT_PROMPTS = [
  "Why would I need that?",
  "Why is it worth the price?",
  "What makes it different?",
] as const;

const STATUS_CLASS = {
  "needs-objection": "border-[hsl(25_34%_20%/0.14)] bg-white",
  "needs-beat": "border-build/30 bg-build/5",
  "needs-revision": "border-build/30 bg-build/5",
  ready: "border-sell/30 bg-sell/5",
  complete: "border-verified/35 bg-verified/10",
} as const;

function bandIntro(band: Band): string {
  if (band === "g3_5") {
    return "Say your pitch to a parent. They ask one gentle but real question, and you choose stronger words. Your parent can type exactly what you say.";
  }
  if (band === "g9_12") {
    return "Cold-pitch a skeptical parent. Capture two honest objections, revise for one, and answer the other live.";
  }
  return "Cold-pitch a parent acting like a skeptical customer. Capture the honest objection, then strengthen one part of your pitch.";
}

function RevisionBeatButton({
  beat,
  selected,
  onSelect,
}: {
  beat: PitchBeat;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`min-h-[44px] rounded-xl border-2 px-3 py-2 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-sell/25 ${
        selected
          ? "border-sell bg-sell/10"
          : "border-[hsl(25_34%_20%/0.14)] bg-white hover:border-sell/35"
      }`}
    >
      <span className="block font-display text-[13px] font-black text-[hsl(25_34%_20%)]">
        {beat.label}
      </span>
      <span className="mt-0.5 block text-[10.5px] leading-[1.35] text-[hsl(25_20%_38%)]">
        {beat.prompt}
      </span>
    </button>
  );
}

export function ObjectionLogTool({
  band,
  fields,
  onFieldChange,
  onTaskComplete,
}: {
  band: Band;
  fields: ObjectionFields;
  onFieldChange: (key: string, value: string) => void;
  onTaskComplete?: () => void;
}) {
  const [showPrompts, setShowPrompts] = useState(false);
  const [justApplied, setJustApplied] = useState(false);
  const completionSentRef = useRef(false);
  const evidence = objectionEvidence(fields);
  const assessment = assessObjectionEvidence(fields);
  const pitchValues = pitchBeatValues(fields);
  const selectedBeat = PITCH_BEATS.find((beat) => beat.key === evidence.beat);

  useEffect(() => {
    if (!assessment.complete || completionSentRef.current) return;
    completionSentRef.current = true;
    onTaskComplete?.();
  }, [assessment.complete, onTaskComplete]);

  const changeEvidence = (key: string, value: string) => {
    setJustApplied(false);
    onFieldChange(key, value);
    onFieldChange(OBJECTION_LOG_FIELD_KEYS.applied, "");
    onFieldChange(OBJECTION_LOG_FIELD_KEYS.summary, "");
  };

  const selectBeat = (beat: PitchBeat) => {
    const currentText = pitchValues[beat.key] ?? "";
    changeEvidence(OBJECTION_LOG_FIELD_KEYS.beat, beat.key);
    onFieldChange(OBJECTION_LOG_FIELD_KEYS.original, currentText);
    onFieldChange(OBJECTION_LOG_FIELD_KEYS.revision, currentText);
  };

  const changeOptionalEvidence = (key: string, value: string) => {
    onFieldChange(key, value);
    if (!evidence.applied) return;
    onFieldChange(
      OBJECTION_LOG_FIELD_KEYS.summary,
      buildObjectionSummary({ ...fields, [key]: value }),
    );
  };

  const applyRevision = () => {
    if (!assessment.readyToApply || !evidence.beat) return;
    const pitchPatch = applyRevisionToPitch(fields, evidence.beat, evidence.revision);
    onFieldChange(evidence.beat, pitchPatch[evidence.beat]);
    onFieldChange("pitch", pitchPatch.pitch);
    onFieldChange(OBJECTION_LOG_FIELD_KEYS.applied, "true");
    onFieldChange(OBJECTION_LOG_FIELD_KEYS.summary, buildObjectionSummary(fields));
    setJustApplied(true);
    if (!completionSentRef.current) {
      completionSentRef.current = true;
      onTaskComplete?.();
    }
  };

  const firstStepDone = Boolean(evidence.exact);
  const secondStepDone = Boolean(
    evidence.beat && hasMeaningfulRevision(evidence.original, evidence.revision),
  );
  const thirdStepDone = assessment.complete || justApplied;

  return (
    <div aria-labelledby="fp-objection-log-title" className="pb-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sell">
            Hear it · use it · improve
          </p>
          <h3 id="fp-objection-log-title" className="mt-1 font-display text-[24px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
            Objection Log
          </h3>
          <p className="mt-1.5 max-w-[620px] text-[13.5px] leading-[1.55] text-[hsl(25_20%_38%)]">
            {bandIntro(band)}
          </p>
        </div>

        <div aria-label="Objection Log progress" className="grid shrink-0 grid-cols-3 gap-1.5 rounded-[14px] border-2 border-build/20 bg-build/5 p-2.5 shadow-card">
          {[
            ["1", "Hear", firstStepDone],
            ["2", "Rewrite", secondStepDone],
            ["3", "Apply", thirdStepDone],
          ].map(([number, label, done]) => (
            <div key={String(number)} className="min-w-[54px] text-center">
              <span className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full border-2 font-display text-xs font-black ${done ? "border-verified bg-verified text-white" : "border-[hsl(25_34%_20%/0.14)] bg-white text-[hsl(25_20%_38%)]"}`}>
                {done ? <Check size={15} strokeWidth={3} aria-hidden /> : number}
              </span>
              <span className="mt-1 block font-mono text-[8px] font-semibold uppercase tracking-[0.04em] text-[hsl(25_20%_38%)]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <section className="mt-4 rounded-[14px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card" aria-labelledby="fp-objection-heard">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-build/10 text-build" aria-hidden>
            <MessageCircleQuestion size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-build">Step 1 · Hear it</p>
                <h4 id="fp-objection-heard" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">What did the parent say?</h4>
              </div>
              <button type="button" onClick={() => setShowPrompts((open) => !open)} aria-expanded={showPrompts} className="inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-build/20 bg-build/5 px-3 font-display text-[12px] font-bold text-build">
                {showPrompts ? "Hide parent prompts" : "Need a parent prompt?"}
              </button>
            </div>
            {showPrompts ? (
              <div className="mt-3 rounded-[10px] border-2 border-dashed border-build/25 bg-build/5 p-3">
                <p className="text-[11.5px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">The parent should react honestly. If they are stuck, they can start with:</p>
                <ul className="mt-1.5 space-y-1 text-[11.5px] leading-[1.45] text-[hsl(25_20%_38%)]">
                  {PARENT_PROMPTS.map((prompt) => <li key={prompt}>“{prompt}”</li>)}
                </ul>
              </div>
            ) : null}
            <label htmlFor="fp-objection-exact" className="mt-3 block text-[12px] font-bold text-[hsl(25_34%_20%)]">The objection, in their exact words</label>
            <textarea
              id="fp-objection-exact"
              rows={3}
              maxLength={600}
              value={fields[OBJECTION_LOG_FIELD_KEYS.exact] ?? ""}
              onChange={(event) => changeEvidence(OBJECTION_LOG_FIELD_KEYS.exact, event.target.value)}
              placeholder="They said, “Why would I buy this instead of…?”"
              className="mt-1.5 min-h-[88px] w-full resize-y rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_30%_99%)] px-3.5 py-3 text-sm leading-[1.5] text-[hsl(25_34%_20%)] outline-none placeholder:text-[hsl(25_20%_38%/0.5)] focus:border-build focus:ring-2 focus:ring-build/15"
            />
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-[14px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card" aria-labelledby="fp-objection-revise">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-sell">Step 2 · Rewrite it</p>
        <h4 id="fp-objection-revise" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">Which part should answer the objection?</h4>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PITCH_BEATS.map((beat) => (
            <RevisionBeatButton
              key={beat.key}
              beat={beat}
              selected={evidence.beat === beat.key}
              onSelect={() => selectBeat(beat)}
            />
          ))}
        </div>

        {selectedBeat ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-[10px] border-2 border-[hsl(25_34%_20%/0.12)] bg-[hsl(40_30%_99%)] p-3.5">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">Before</p>
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.55] text-[hsl(25_34%_20%)]">
                {evidence.original || "No saved text in this section yet."}
              </p>
            </div>
            <div className="rounded-[10px] border-2 border-sell/25 bg-sell/5 p-3.5">
              <label htmlFor="fp-objection-revision" className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-sell">Stronger version</label>
              <textarea
                id="fp-objection-revision"
                rows={4}
                maxLength={1000}
                value={fields[OBJECTION_LOG_FIELD_KEYS.revision] ?? ""}
                onChange={(event) => changeEvidence(OBJECTION_LOG_FIELD_KEYS.revision, event.target.value)}
                placeholder={`Rewrite ${selectedBeat.label.toLowerCase()} so it answers the objection.`}
                className="mt-2 min-h-[108px] w-full resize-y rounded-[10px] border-2 border-sell/20 bg-white px-3 py-2.5 text-[13px] leading-[1.5] text-[hsl(25_34%_20%)] outline-none placeholder:text-[hsl(25_20%_38%/0.5)] focus:border-sell focus:ring-2 focus:ring-sell/15"
              />
            </div>
          </div>
        ) : null}
      </section>

      {band === "g9_12" ? (
        <section className="mt-4 rounded-[14px] border-2 border-dashed border-scale/35 bg-scale/5 p-4" aria-labelledby="fp-objection-live">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-scale">Older-student challenge · does not block completion</p>
          <h4 id="fp-objection-live" className="mt-1 font-display text-[17px] font-black text-[hsl(25_34%_20%)]">Answer a second objection live</h4>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-[12px] font-bold text-[hsl(25_34%_20%)]">
              Second objection
              <textarea rows={3} maxLength={600} value={fields[OBJECTION_LOG_FIELD_KEYS.second] ?? ""} onChange={(event) => changeOptionalEvidence(OBJECTION_LOG_FIELD_KEYS.second, event.target.value)} className="mt-1.5 min-h-[82px] w-full resize-y rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3 py-2.5 text-[13px] font-normal leading-[1.5] outline-none focus:border-scale focus:ring-2 focus:ring-scale/15" />
            </label>
            <label className="text-[12px] font-bold text-[hsl(25_34%_20%)]">
              What you answered out loud
              <textarea rows={3} maxLength={1000} value={fields[OBJECTION_LOG_FIELD_KEYS.liveAnswer] ?? ""} onChange={(event) => changeOptionalEvidence(OBJECTION_LOG_FIELD_KEYS.liveAnswer, event.target.value)} className="mt-1.5 min-h-[82px] w-full resize-y rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white px-3 py-2.5 text-[13px] font-normal leading-[1.5] outline-none focus:border-scale focus:ring-2 focus:ring-scale/15" />
            </label>
          </div>
        </section>
      ) : null}

      <section role="status" aria-label="Objection Log status" className={`mt-4 rounded-[14px] border-2 p-3.5 ${STATUS_CLASS[assessment.stage]}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${assessment.complete || justApplied ? "bg-verified text-white" : "bg-[hsl(25_34%_20%/0.08)] text-[hsl(25_20%_38%)]"}`} aria-hidden>
              {assessment.complete || justApplied ? <Check size={16} strokeWidth={3} /> : <RefreshCcw size={14} />}
            </span>
            <div>
              <p className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">
                {assessment.complete || justApplied ? "Revision locked in" : "Coach check"}
              </p>
              <p className="mt-0.5 text-[12.5px] font-semibold leading-[1.45] text-[hsl(25_20%_38%)]">{assessment.message}</p>
            </div>
          </div>
          {assessment.complete || justApplied ? (
            <div className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-verified px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)]">
              <Sparkles size={16} aria-hidden /> Applied to pitch
            </div>
          ) : (
            <button
              type="button"
              onClick={applyRevision}
              disabled={!assessment.readyToApply}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-sell px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
            >
              <ArrowRight size={16} aria-hidden /> Apply revision
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
