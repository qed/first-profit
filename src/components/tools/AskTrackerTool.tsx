import { useEffect, useRef } from "react";
import {
  Check,
  CircleAlert,
  DollarSign,
  Save,
  Sparkles,
  Target,
  UserCheck,
  Users,
} from "lucide-react";
import type { Band } from "../../data/path";
import {
  ASK_TRACKER_FIELD_KEYS,
  ASK_TRACKER_OUTCOMES,
  askTrackerBandRole,
  askTrackerEvidence,
  askTrackerRowFieldKey,
  assessAskTracker,
  buildAskTrackerSummary,
  type AskTrackerFields,
} from "../../lib/askTracker";
import {
  PRICE_PICKER_FIELD_KEYS,
  parseMoney,
} from "../../lib/pricePicker";

const STATUS_CLASS = {
  "needs-prospects": "border-scale/40 bg-scale/10",
  "needs-asks": "border-build/30 bg-build/5",
  "needs-yes": "border-build/30 bg-build/5",
  "needs-sale": "border-scale/40 bg-scale/10",
  "needs-confirmation": "border-scale/40 bg-scale/10",
  "needs-band-proof": "border-scale/40 bg-scale/10",
  ready: "border-sell/35 bg-sell/5",
  complete: "border-verified/35 bg-verified/10",
} as const;

function localDate(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function AskTrackerTool({
  band,
  fields,
  onFieldChange,
  onTaskComplete,
}: {
  band: Band;
  fields: AskTrackerFields;
  onFieldChange: (key: string, value: string) => void;
  onTaskComplete?: () => void;
}) {
  const completionSentRef = useRef(false);
  const evidence = askTrackerEvidence(fields);
  const assessment = assessAskTracker(band, fields);

  useEffect(() => {
    if (!assessment.complete || completionSentRef.current) return;
    completionSentRef.current = true;
    onTaskComplete?.();
  }, [assessment.complete, onTaskComplete]);

  const clearSavedCompletion = () => {
    onFieldChange(ASK_TRACKER_FIELD_KEYS.confirmed, "");
    onFieldChange(ASK_TRACKER_FIELD_KEYS.summary, "");
  };

  const changeEvidence = (key: string, value: string) => {
    onFieldChange(key, value);
    clearSavedCompletion();
  };

  const setOutcome = (index: number, outcome: string) => {
    if (outcome === "yes-paid") {
      const rowDate = fields[askTrackerRowFieldKey(index, "date")] || localDate();
      if (!evidence.winner) {
        onFieldChange(ASK_TRACKER_FIELD_KEYS.winnerIndex, String(index));
        onFieldChange(
          ASK_TRACKER_FIELD_KEYS.saleItem,
          fields[ASK_TRACKER_FIELD_KEYS.saleItem] ||
            fields[PRICE_PICKER_FIELD_KEYS.unit] ||
            fields[PRICE_PICKER_FIELD_KEYS.offer] ||
            "",
        );
        onFieldChange(
          ASK_TRACKER_FIELD_KEYS.saleAmount,
          fields[ASK_TRACKER_FIELD_KEYS.saleAmount] ||
            fields[PRICE_PICKER_FIELD_KEYS.price] ||
            "",
        );
        onFieldChange(
          ASK_TRACKER_FIELD_KEYS.saleDate,
          fields[ASK_TRACKER_FIELD_KEYS.saleDate] || rowDate,
        );
      }
    } else if (evidence.winner?.index === index) {
      const nextWinner = evidence.rows.find(
        (row) => row.index !== index && row.outcome === "yes-paid",
      );
      onFieldChange(
        ASK_TRACKER_FIELD_KEYS.winnerIndex,
        nextWinner ? String(nextWinner.index) : "",
      );
      if (nextWinner?.date) {
        onFieldChange(ASK_TRACKER_FIELD_KEYS.saleDate, nextWinner.date);
      }
      onFieldChange(ASK_TRACKER_FIELD_KEYS.nonFamilyConfirmed, "");
      onFieldChange(ASK_TRACKER_FIELD_KEYS.paymentReceivedConfirmed, "");
    }
    onFieldChange(askTrackerRowFieldKey(index, "outcome"), outcome);
    if (!fields[askTrackerRowFieldKey(index, "date")]) {
      onFieldChange(askTrackerRowFieldKey(index, "date"), localDate());
    }
    clearSavedCompletion();
  };

  const saveTracker = () => {
    if (!assessment.readyToSave) return;
    onFieldChange(
      ASK_TRACKER_FIELD_KEYS.summary,
      buildAskTrackerSummary(band, fields),
    );
    onFieldChange(ASK_TRACKER_FIELD_KEYS.confirmed, "true");
    if (!completionSentRef.current) {
      completionSentRef.current = true;
      onTaskComplete?.();
    }
  };

  const price = parseMoney(fields[ASK_TRACKER_FIELD_KEYS.saleAmount]);

  return (
    <div aria-labelledby="fp-ask-tracker-title" className="pb-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sell">Ask safely · log honestly · reach one yes</p>
          <h3 id="fp-ask-tracker-title" className="mt-1 font-display text-[24px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">Ask Tracker</h3>
          <p className="mt-1.5 max-w-[620px] text-[13.5px] leading-[1.55] text-[hsl(25_20%_38%)]">Work through the ten-person list. Every no and “not yet” counts as progress until one non-family customer pays.</p>
        </div>

        <div aria-label="Ask Tracker progress" className="grid shrink-0 grid-cols-3 gap-1.5 rounded-[14px] border-2 border-build/20 bg-build/5 p-2.5 shadow-card">
          {[
            ["1", "Prospects", evidence.prospectsReady],
            ["2", "Real asks", evidence.asksLogged > 0],
            ["3", "First paid yes", Boolean(evidence.winner && evidence.paymentReceivedConfirmed)],
          ].map(([number, label, done]) => (
            <div key={String(number)} className="min-w-[58px] text-center">
              <span className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full border-2 font-display text-xs font-black ${done ? "border-verified bg-verified text-white" : "border-[hsl(25_34%_20%/0.14)] bg-white text-[hsl(25_20%_38%)]"}`}>
                {done ? <Check size={15} strokeWidth={3} aria-hidden /> : number}
              </span>
              <span className="mt-1 block font-mono text-[8px] font-semibold uppercase tracking-[0.04em] text-[hsl(25_20%_38%)]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-[12px] border-2 border-build/20 bg-build/5 px-3.5 py-3">
        <UserCheck size={18} className="mt-0.5 shrink-0 text-build" aria-hidden />
        <p className="text-[12px] leading-[1.5] text-[hsl(25_20%_38%)]"><strong className="text-[hsl(25_34%_20%)]">Your safety role:</strong> {askTrackerBandRole(band)}</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Ask totals">
        {[
          [String(evidence.asksLogged), "Asks logged", "text-build"],
          [String(evidence.noCount), "Nos", "text-scale"],
          [String(evidence.paidYesCount), "Paid yeses", "text-verified"],
        ].map(([value, label, color]) => (
          <div key={label} className="rounded-[11px] border-2 border-[hsl(25_34%_20%/0.12)] bg-white px-2 py-3 text-center shadow-card">
            <p className={`font-display text-[24px] font-black ${color}`}>{value}</p>
            <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.05em] text-[hsl(25_20%_38%)]">{label}</p>
          </div>
        ))}
      </div>

      <section className="mt-4 rounded-[14px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card" aria-labelledby="fp-ask-list">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-build">Step 1 · Work the list</p>
        <h4 id="fp-ask-list" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">What happened after each real ask?</h4>
        <p className="mt-1 text-[11.5px] leading-[1.45] text-[hsl(25_20%_38%)]">Only log an outcome after the ask happens. Never add phone numbers, email addresses, or private contact details.</p>
        <p className="mt-2 rounded-[10px] border-2 border-verified/20 bg-verified/5 px-3 py-2.5 text-[11px] font-semibold leading-[1.45] text-[hsl(25_20%_38%)]">You can mark more than one paid yes. The first paid customer becomes the sale record for this task.</p>

        {!evidence.prospectsReady ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-[10px] border-2 border-scale/30 bg-scale/10 px-3.5 py-3">
            <CircleAlert size={17} className="mt-0.5 shrink-0 text-scale" aria-hidden />
            <p className="text-[12px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">Return to Ten-List Builder and save all ten approved prospects before logging asks.</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {evidence.rows.map((row) => (
              <article key={row.index} className={`rounded-[12px] border-2 p-3.5 ${row.outcome === "yes-paid" ? "border-verified/40 bg-verified/10" : row.outcome ? "border-build/25 bg-build/5" : "border-[hsl(25_34%_20%/0.12)] bg-[hsl(40_30%_99%)]"}`}>
                <div className="flex items-start gap-2.5">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-black ${row.outcome ? "bg-build text-white" : "bg-[hsl(25_34%_20%/0.08)] text-[hsl(25_20%_38%)]"}`}>{row.index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[14px] font-black text-[hsl(25_34%_20%)]">{row.name}</p>
                    <div role="group" aria-label={`Outcome for ${row.name}`} className="mt-2 grid grid-cols-3 gap-1.5">
                      {ASK_TRACKER_OUTCOMES.map((option) => {
                        const selected = row.outcome === option.value;
                        return (
                          <button key={option.value} type="button" aria-pressed={selected} onClick={() => setOutcome(row.index, option.value)} className={`min-h-[44px] rounded-[9px] border-2 px-1.5 py-2 font-display text-[10.5px] font-bold ${selected ? option.value === "yes-paid" ? "border-verified bg-verified text-white" : "border-build bg-build text-white" : "border-[hsl(25_34%_20%/0.14)] bg-white text-[hsl(25_20%_38%)]"}`}>{option.label}</button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {row.outcome ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[132px_minmax(0,1fr)]">
                    <label className="text-[10.5px] font-bold text-[hsl(25_34%_20%)]">Date asked<input aria-label={`Date asked for ${row.name}`} type="date" value={fields[askTrackerRowFieldKey(row.index, "date")] ?? ""} onChange={(event) => changeEvidence(askTrackerRowFieldKey(row.index, "date"), event.target.value)} className="mt-1 min-h-[42px] w-full rounded-[9px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white px-2 text-[11px] outline-none focus:border-build" /></label>
                    <label className="text-[10.5px] font-bold text-[hsl(25_34%_20%)]">Quick note <span className="font-normal">(optional)</span><input aria-label={`Note for ${row.name}`} type="text" maxLength={220} value={fields[askTrackerRowFieldKey(row.index, "note")] ?? ""} onChange={(event) => changeEvidence(askTrackerRowFieldKey(row.index, "note"), event.target.value)} placeholder={row.outcome === "no" ? "What did they say?" : "Next step..."} className="mt-1 min-h-[42px] w-full rounded-[9px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white px-2.5 text-[11px] outline-none focus:border-build" /></label>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {evidence.winner ? (
        <section className="mt-4 rounded-[14px] border-2 border-verified/30 bg-verified/10 p-4" aria-labelledby="fp-paid-sale">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-verified text-white"><DollarSign size={21} aria-hidden /></span>
            <div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-verified">Step 2 · Record the paid yes</p>
              <h4 id="fp-paid-sale" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">First paid yes: {evidence.winner.name}</h4>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-[12px] font-bold text-[hsl(25_34%_20%)] sm:col-span-1">What they bought<input type="text" maxLength={220} value={fields[ASK_TRACKER_FIELD_KEYS.saleItem] ?? ""} onChange={(event) => changeEvidence(ASK_TRACKER_FIELD_KEYS.saleItem, event.target.value)} className="mt-1.5 min-h-[44px] w-full rounded-[10px] border-2 border-verified/20 bg-white px-3 text-[12px] outline-none focus:border-verified" /></label>
            <label className="text-[12px] font-bold text-[hsl(25_34%_20%)]">Amount paid<span className="relative mt-1.5 block"><DollarSign size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-verified" aria-hidden /><input aria-label="Amount paid" type="number" min="0" step="0.01" inputMode="decimal" value={fields[ASK_TRACKER_FIELD_KEYS.saleAmount] ?? ""} onChange={(event) => changeEvidence(ASK_TRACKER_FIELD_KEYS.saleAmount, event.target.value)} className="min-h-[44px] w-full rounded-[10px] border-2 border-verified/20 bg-white pl-8 pr-3 text-[12px] outline-none focus:border-verified" /></span></label>
            <label className="text-[12px] font-bold text-[hsl(25_34%_20%)]">Sale date<input aria-label="Sale date" type="date" value={fields[ASK_TRACKER_FIELD_KEYS.saleDate] ?? ""} onChange={(event) => changeEvidence(ASK_TRACKER_FIELD_KEYS.saleDate, event.target.value)} className="mt-1.5 min-h-[44px] w-full rounded-[10px] border-2 border-verified/20 bg-white px-3 text-[12px] outline-none focus:border-verified" /></label>
          </div>
          {price !== null && price > 0 ? <p className="mt-2 font-mono text-[10px] font-semibold text-verified">Recorded sale amount: ${price.toFixed(2)}</p> : null}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex min-h-[58px] cursor-pointer items-start gap-3 rounded-[10px] border-2 border-verified/20 bg-white px-3.5 py-3"><input type="checkbox" checked={evidence.nonFamilyConfirmed} onChange={(event) => changeEvidence(ASK_TRACKER_FIELD_KEYS.nonFamilyConfirmed, event.target.checked ? "true" : "")} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(150_52%_36%)]" /><span className="text-[12px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">This customer is not family.</span></label>
            <label className="flex min-h-[58px] cursor-pointer items-start gap-3 rounded-[10px] border-2 border-verified/20 bg-white px-3.5 py-3"><input type="checkbox" checked={evidence.paymentReceivedConfirmed} onChange={(event) => changeEvidence(ASK_TRACKER_FIELD_KEYS.paymentReceivedConfirmed, event.target.checked ? "true" : "")} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(150_52%_36%)]" /><span className="text-[12px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">Real money was received and is in hand or in the parent-held account.</span></label>
          </div>
        </section>
      ) : null}

      <section className="mt-4 rounded-[14px] border-2 border-scale/30 bg-scale/10 p-4" aria-labelledby="fp-ask-safety-confirm">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-scale">Step 3 · Confirm the safety role</p>
        <h4 id="fp-ask-safety-confirm" className="mt-0.5 font-display text-[17px] font-black text-[hsl(25_34%_20%)]">Parent check</h4>
        <label className="mt-3 flex min-h-[58px] cursor-pointer items-start gap-3 rounded-[10px] border-2 border-scale/20 bg-white px-3.5 py-3"><input type="checkbox" checked={evidence.bandRoleConfirmed} onChange={(event) => changeEvidence(ASK_TRACKER_FIELD_KEYS.bandRoleConfirmed, event.target.checked ? "true" : "")} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(150_52%_36%)]" /><span className="text-[12px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">{askTrackerBandRole(band)}</span></label>
      </section>

      <section role="status" aria-label="Ask Tracker status" className={`mt-4 rounded-[14px] border-2 p-3.5 ${STATUS_CLASS[assessment.stage]}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${assessment.complete ? "bg-verified text-white" : assessment.stage === "needs-sale" || assessment.stage === "needs-confirmation" || assessment.stage === "needs-band-proof" || assessment.stage === "needs-prospects" ? "bg-scale text-white" : "bg-[hsl(25_34%_20%/0.08)] text-[hsl(25_20%_38%)]"}`} aria-hidden>{assessment.complete ? <Sparkles size={17} /> : assessment.stage === "needs-yes" ? <Target size={16} /> : assessment.stage === "needs-asks" ? <Users size={16} /> : <CircleAlert size={16} />}</span>
            <div><p className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">{assessment.complete ? "Paid yes saved" : assessment.readyToSave ? "Ready for the Founder File" : "Ask Tracker check"}</p><p className="mt-0.5 text-[12.5px] font-semibold leading-[1.45] text-[hsl(25_20%_38%)]">{assessment.message}</p></div>
          </div>
          {assessment.complete ? <div className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-verified px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)]"><Check size={16} strokeWidth={3} aria-hidden /> Task complete</div> : <button type="button" onClick={saveTracker} disabled={!assessment.readyToSave} className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-sell px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"><Save size={16} aria-hidden /> Save paid yes</button>}
        </div>
      </section>
    </div>
  );
}
