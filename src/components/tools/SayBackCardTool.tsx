import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CircleAlert,
  MessageSquareQuote,
  MousePointerClick,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { Band } from "../../data/path";
import {
  SAY_BACK_FIELD_KEYS,
  assessSayBackEvidence,
  buildSayBackSummary,
  sayBackEvidence,
  sayBackOutcome,
  type SayBackFields,
  type SayBackMatch,
} from "../../lib/sayBack";
import { ToolFlowProgress } from "./ToolFlowProgress";

const FLOW_STEPS = ["Choose listener", "Hear it back", "Verify clarity"] as const;

const STATUS_CLASS = {
  "needs-listener": "border-[hsl(25_34%_20%/0.14)] bg-white",
  "needs-say-back": "border-build/30 bg-build/5",
  "needs-review": "border-build/30 bg-build/5",
  "needs-witness": "border-build/30 bg-build/5",
  ready: "border-sell/30 bg-sell/5",
  "not-yet": "border-scale/45 bg-scale/10",
  complete: "border-verified/35 bg-verified/10",
} as const;

function listenerGuidance(band: Band): string {
  if (band === "g3_5") {
    return "Choose a familiar adult who is not family, like a neighbor or coach. A parent can type the adult's exact words.";
  }
  if (band === "g9_12") {
    return "Choose an adult you have never pitched to before and meet them for this purpose. A parent still witnesses the result.";
  }
  return "Choose a non-family adult you do not see every week. Deliver the pitch live with no notes.";
}

function MatchButtons({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SayBackMatch;
  onChange: (value: Exclude<SayBackMatch, "">) => void;
}) {
  return (
    <div role="group" aria-label={label} className="mt-3 grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => onChange("yes")}
        aria-pressed={value === "yes"}
        className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border-2 px-3 font-display text-[12px] font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-verified/25 ${value === "yes" ? "border-verified bg-verified text-white" : "border-verified/25 bg-white text-[hsl(150_52%_28%)]"}`}
      >
        <Check size={15} aria-hidden /> Yes, it matched
      </button>
      <button
        type="button"
        onClick={() => onChange("no")}
        aria-pressed={value === "no"}
        className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border-2 px-3 font-display text-[12px] font-bold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-scale/25 ${value === "no" ? "border-scale bg-scale text-white" : "border-scale/30 bg-white text-[hsl(35_72%_34%)]"}`}
      >
        <CircleAlert size={15} aria-hidden /> Not yet
      </button>
    </div>
  );
}

export function SayBackCardTool({
  band,
  fields,
  onFieldChange,
  onTaskComplete,
}: {
  band: Band;
  fields: SayBackFields;
  onFieldChange: (key: string, value: string) => void;
  onTaskComplete?: () => void;
}) {
  const completionSentRef = useRef(false);
  const evidence = sayBackEvidence(fields);
  const assessment = assessSayBackEvidence(fields);
  const listenerDone = Boolean(evidence.adultName && evidence.date);
  const sayBackDone = Boolean(evidence.productWords && evidence.askWords);
  const reviewReady = Boolean(
    sayBackDone && evidence.productMatch && evidence.askMatch,
  );
  const [stage, setStage] = useState(() =>
    fields[SAY_BACK_FIELD_KEYS.reviewed] || reviewReady ? 2 : listenerDone ? 1 : 0,
  );

  useEffect(() => {
    if (!assessment.complete || completionSentRef.current) return;
    completionSentRef.current = true;
    onTaskComplete?.();
  }, [assessment.complete, onTaskComplete]);

  const changeEvidence = (key: string, value: string) => {
    onFieldChange(key, value);
    onFieldChange(SAY_BACK_FIELD_KEYS.reviewed, "");
    onFieldChange(SAY_BACK_FIELD_KEYS.outcome, "");
    onFieldChange(SAY_BACK_FIELD_KEYS.summary, "");
  };

  const verifySayBack = () => {
    if (!assessment.readyToVerify) return;
    const outcome = sayBackOutcome(fields);
    onFieldChange(SAY_BACK_FIELD_KEYS.outcome, outcome);
    onFieldChange(SAY_BACK_FIELD_KEYS.reviewed, "true");
    onFieldChange(SAY_BACK_FIELD_KEYS.summary, buildSayBackSummary(fields));
    if (outcome === "matched" && !completionSentRef.current) {
      completionSentRef.current = true;
      onTaskComplete?.();
    }
  };

  const tryAgain = () => {
    [
      SAY_BACK_FIELD_KEYS.productWords,
      SAY_BACK_FIELD_KEYS.askWords,
      SAY_BACK_FIELD_KEYS.productMatch,
      SAY_BACK_FIELD_KEYS.askMatch,
      SAY_BACK_FIELD_KEYS.witnessed,
      SAY_BACK_FIELD_KEYS.reviewed,
      SAY_BACK_FIELD_KEYS.outcome,
      SAY_BACK_FIELD_KEYS.summary,
    ].forEach((key) => onFieldChange(key, ""));
    setStage(1);
  };

  return (
    <div aria-labelledby="fp-say-back-title" className="pb-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sell">
            Pitch it · hear it back · verify
          </p>
          <h3 id="fp-say-back-title" className="mt-1 font-display text-[24px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">
            Say-Back Card
          </h3>
          <p className="mt-1.5 max-w-[620px] text-[13.5px] leading-[1.55] text-[hsl(25_20%_38%)]">
            Give your pitch without notes. Then ask the adult to explain what you sell and what you asked them to do, using their own words.
          </p>
        </div>

        <div className="w-full shrink-0 sm:w-[230px]">
          <ToolFlowProgress current={stage + 1} steps={FLOW_STEPS} />
        </div>
      </div>

      {stage === 0 ? (
        <>
      <div className="mt-4 flex items-start gap-2.5 rounded-[12px] border-2 border-build/20 bg-build/5 px-3.5 py-3">
        <UserRound size={18} className="mt-0.5 shrink-0 text-build" aria-hidden />
        <p className="text-[12px] leading-[1.5] text-[hsl(25_20%_38%)]">
          <strong className="text-[hsl(25_34%_20%)]">Your listener:</strong> {listenerGuidance(band)}
        </p>
      </div>

      <section className="mt-4 rounded-[14px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card" aria-labelledby="fp-say-back-listener">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-build">Step 1 · Log the listener</p>
        <h4 id="fp-say-back-listener" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">Who heard the pitch?</h4>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[12px] font-bold text-[hsl(25_34%_20%)]">
            Adult's first name or role
            <span className="mt-0.5 block text-[10.5px] font-normal leading-[1.4] text-[hsl(25_20%_38%)]">First name, “neighbor,” or “soccer coach” is enough. Do not add contact information.</span>
            <input
              type="text"
              maxLength={80}
              value={fields[SAY_BACK_FIELD_KEYS.adultName] ?? ""}
              onChange={(event) => changeEvidence(SAY_BACK_FIELD_KEYS.adultName, event.target.value)}
              placeholder="Coach Lee"
              className="mt-2 min-h-[44px] w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_30%_99%)] px-3.5 text-sm font-normal outline-none placeholder:text-[hsl(25_20%_38%/0.5)] focus:border-build focus:ring-2 focus:ring-build/15"
            />
          </label>
          <label className="text-[12px] font-bold text-[hsl(25_34%_20%)]">
            Date of the pitch
            <span className="mt-0.5 block text-[10.5px] font-normal leading-[1.4] text-[hsl(25_20%_38%)]">Use the date the adult heard this exact pitch.</span>
            <span className="relative mt-2 block">
              <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-build" aria-hidden />
              <input
                type="date"
                value={fields[SAY_BACK_FIELD_KEYS.date] ?? ""}
                onChange={(event) => changeEvidence(SAY_BACK_FIELD_KEYS.date, event.target.value)}
                className="min-h-[44px] w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_30%_99%)] py-2 pl-9 pr-3 text-sm font-normal outline-none focus:border-build focus:ring-2 focus:ring-build/15"
              />
            </span>
          </label>
        </div>
      </section>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setStage(1)}
              disabled={!listenerDone}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sell px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
            >
              Hear the pitch back <ArrowRight size={16} aria-hidden />
            </button>
          </div>
        </>
      ) : null}

      {stage === 1 ? (
        <>
      <section className="mt-4 rounded-[14px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card" aria-labelledby="fp-say-back-words">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sell/10 text-sell" aria-hidden>
            <MessageSquareQuote size={20} />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-sell">Step 2 · Hear it back</p>
            <h4 id="fp-say-back-words" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">Write the adult's own words</h4>
            <p className="mt-1 text-[11.5px] leading-[1.45] text-[hsl(25_20%_38%)]">Do not show them your script or correct them while they answer.</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[12px] border-2 border-build/20 bg-build/5 p-3.5">
            <div className="flex items-center gap-2">
              <PackageCheck size={17} className="text-build" aria-hidden />
              <label htmlFor="fp-product-say-back" className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">What did they think you sell?</label>
            </div>
            <textarea
              id="fp-product-say-back"
              rows={4}
              maxLength={600}
              value={fields[SAY_BACK_FIELD_KEYS.productWords] ?? ""}
              onChange={(event) => changeEvidence(SAY_BACK_FIELD_KEYS.productWords, event.target.value)}
              placeholder="In their words, the product or service was…"
              className="mt-2.5 min-h-[104px] w-full resize-y rounded-[10px] border-2 border-build/20 bg-white px-3 py-2.5 text-[13px] leading-[1.5] outline-none placeholder:text-[hsl(25_20%_38%/0.5)] focus:border-build focus:ring-2 focus:ring-build/15"
            />
            <MatchButtons
              label="Did the product say-back match the pitch?"
              value={evidence.productMatch}
              onChange={(value) => changeEvidence(SAY_BACK_FIELD_KEYS.productMatch, value)}
            />
          </div>

          <div className="rounded-[12px] border-2 border-sell/20 bg-sell/5 p-3.5">
            <div className="flex items-center gap-2">
              <MousePointerClick size={17} className="text-sell" aria-hidden />
              <label htmlFor="fp-ask-say-back" className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">What did they think you asked?</label>
            </div>
            <textarea
              id="fp-ask-say-back"
              rows={4}
              maxLength={600}
              value={fields[SAY_BACK_FIELD_KEYS.askWords] ?? ""}
              onChange={(event) => changeEvidence(SAY_BACK_FIELD_KEYS.askWords, event.target.value)}
              placeholder="In their words, the action you wanted was…"
              className="mt-2.5 min-h-[104px] w-full resize-y rounded-[10px] border-2 border-sell/20 bg-white px-3 py-2.5 text-[13px] leading-[1.5] outline-none placeholder:text-[hsl(25_20%_38%/0.5)] focus:border-sell focus:ring-2 focus:ring-sell/15"
            />
            <MatchButtons
              label="Did the ask say-back match the pitch?"
              value={evidence.askMatch}
              onChange={(value) => changeEvidence(SAY_BACK_FIELD_KEYS.askMatch, value)}
            />
          </div>
        </div>
      </section>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => setStage(0)} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-[hsl(25_34%_20%/0.14)] bg-white px-4 font-display text-[13px] font-bold text-[hsl(25_34%_20%)]">
              <ArrowLeft size={16} aria-hidden /> Listener
            </button>
            <button type="button" onClick={() => setStage(2)} disabled={!reviewReady} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sell px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none">
              Verify the say-back <ArrowRight size={16} aria-hidden />
            </button>
          </div>
        </>
      ) : null}

      {stage === 2 ? (
        <>
      <section className="mt-4 rounded-[14px] border-2 border-verified/20 bg-verified/5 p-4" aria-labelledby="fp-say-back-witness">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-verified">Step 3 · Parent verification</p>
        <h4 id="fp-say-back-witness" className="mt-0.5 font-display text-[17px] font-black text-[hsl(25_34%_20%)]">Confirm the real-world test</h4>
        <label className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[10px] border-2 border-verified/25 bg-white px-3.5 py-3">
          <input
            type="checkbox"
            checked={evidence.witnessed}
            onChange={(event) => changeEvidence(SAY_BACK_FIELD_KEYS.witnessed, event.target.checked ? "true" : "")}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(150_52%_36%)]"
          />
          <span className="text-[12.5px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">A parent witnessed the live pitch and confirms the listener was a non-family adult.</span>
        </label>
      </section>

      <section role="status" aria-label="Say-Back Card status" className={`mt-4 rounded-[14px] border-2 p-3.5 ${STATUS_CLASS[assessment.stage]}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${assessment.complete ? "bg-verified text-white" : assessment.stage === "not-yet" ? "bg-scale text-white" : "bg-[hsl(25_34%_20%/0.08)] text-[hsl(25_20%_38%)]"}`} aria-hidden>
              {assessment.complete ? <Sparkles size={17} /> : assessment.stage === "not-yet" ? <CircleAlert size={16} /> : <ShieldCheck size={16} />}
            </span>
            <div>
              <p className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">
                {assessment.complete ? "Clarity confirmed" : assessment.stage === "not-yet" ? "Useful result, not yet" : "Clarity check"}
              </p>
              <p className="mt-0.5 text-[12.5px] font-semibold leading-[1.45] text-[hsl(25_20%_38%)]">{assessment.message}</p>
            </div>
          </div>

          {assessment.complete ? (
            <div className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-verified px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)]">
              <Check size={16} strokeWidth={3} aria-hidden /> Criterion complete
            </div>
          ) : assessment.stage === "not-yet" ? (
            <button type="button" onClick={tryAgain} className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-scale px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(35_72%_34%)]">
              <RotateCcw size={16} aria-hidden /> Try the pitch again
            </button>
          ) : (
            <button type="button" onClick={verifySayBack} disabled={!assessment.readyToVerify} className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-sell px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none">
              <ShieldCheck size={16} aria-hidden /> Verify say-back
            </button>
          )}
        </div>
      </section>
          <div className="mt-4">
            <button type="button" onClick={() => setStage(1)} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-[hsl(25_34%_20%/0.14)] bg-white px-4 font-display text-[13px] font-bold text-[hsl(25_34%_20%)]">
              <ArrowLeft size={16} aria-hidden /> Revise the say-back
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
