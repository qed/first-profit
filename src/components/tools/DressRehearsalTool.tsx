import { useEffect, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  DollarSign,
  Package,
  Play,
  RefreshCcw,
  Save,
  Sparkles,
  UserCheck,
} from "lucide-react";
import type { Band } from "../../data/path";
import {
  DRESS_REHEARSAL_DELIVERY_METHODS,
  DRESS_REHEARSAL_FIELD_KEYS,
  DRESS_REHEARSAL_PAYMENT_METHODS,
  assessDressRehearsal,
  buildDressRehearsalSummary,
  dressRehearsalEvidence,
  isDressRehearsalSetupReady,
  type DressRehearsalFields,
} from "../../lib/dressRehearsal";
import {
  PRICE_PICKER_FIELD_KEYS,
  formatMoney,
  parseMoney,
} from "../../lib/pricePicker";

const REHEARSAL_MOMENTS = [
  {
    title: "Greeting",
    prompt: "Welcome the buyer and make eye contact.",
  },
  {
    title: "Ask",
    prompt: "Make the offer clearly and say the price.",
  },
  {
    title: "Payment",
    prompt: "Practice the exact money handoff and count it carefully.",
  },
  {
    title: "Delivery",
    prompt: "Hand over the product or explain exactly when it arrives.",
  },
  {
    title: "Thank-you",
    prompt: "Thank the buyer and confirm the next step.",
  },
] as const;

const STATUS_CLASS = {
  "needs-payment": "border-[hsl(25_34%_20%/0.14)] bg-white",
  "needs-delivery": "border-build/30 bg-build/5",
  "needs-band-proof": "border-scale/40 bg-scale/10",
  "needs-run": "border-build/30 bg-build/5",
  "needs-parent": "border-scale/40 bg-scale/10",
  ready: "border-sell/35 bg-sell/5",
  complete: "border-verified/35 bg-verified/10",
} as const;

function localDate(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function bandRole(band: Band): {
  body: string;
  label: string;
} {
  if (band === "g3_5") {
    return {
      body: "The parent handles the cash, transfer, or card reader. The child handles the greeting, ask, delivery, and thank-you.",
      label: "A parent agrees to handle the money mechanics during the rehearsal.",
    };
  }
  if (band === "g9_12") {
    return {
      body: "The student handles the complete sale and prepares change, a receipt method, and a simple sales record.",
      label: "A simple sales record is ready to use.",
    };
  }
  return {
    body: "The child handles the payment. A parent watches the math and steps in only if a correction is needed.",
    label: "A parent agrees to watch the payment math during the rehearsal.",
  };
}

function ChoiceButtons({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`min-h-[46px] rounded-[10px] border-2 px-3 py-2.5 text-left font-display text-[12.5px] font-bold transition ${selected ? "border-verified bg-verified/10 text-[hsl(25_34%_20%)]" : "border-[hsl(25_34%_20%/0.14)] bg-white text-[hsl(25_20%_38%)] hover:border-build/40"}`}
          >
            <span className="flex items-center gap-2">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-verified bg-verified text-white" : "border-[hsl(25_34%_20%/0.2)]"}`}>
                {selected ? <Check size={12} strokeWidth={3} aria-hidden /> : null}
              </span>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function DressRehearsalTool({
  band,
  fields,
  onFieldChange,
  onTaskComplete,
}: {
  band: Band;
  fields: DressRehearsalFields;
  onFieldChange: (key: string, value: string) => void;
  onTaskComplete?: () => void;
}) {
  const completionSentRef = useRef(false);
  const [activeMoment, setActiveMoment] = useState<number | null>(null);
  const evidence = dressRehearsalEvidence(fields);
  const assessment = assessDressRehearsal(band, fields);
  const setupReady = isDressRehearsalSetupReady(band, fields);
  const role = bandRole(band);
  const savedOffer = fields[PRICE_PICKER_FIELD_KEYS.offer]?.trim() ?? "";
  const savedUnit = fields[PRICE_PICKER_FIELD_KEYS.unit]?.trim() ?? "";
  const savedPrice = parseMoney(fields[PRICE_PICKER_FIELD_KEYS.price]);

  useEffect(() => {
    if (!assessment.complete || completionSentRef.current) return;
    completionSentRef.current = true;
    onTaskComplete?.();
  }, [assessment.complete, onTaskComplete]);

  const clearSavedCompletion = () => {
    onFieldChange(DRESS_REHEARSAL_FIELD_KEYS.confirmed, "");
    onFieldChange(DRESS_REHEARSAL_FIELD_KEYS.summary, "");
  };

  const changeSetup = (key: string, value: string) => {
    onFieldChange(key, value);
    onFieldChange(DRESS_REHEARSAL_FIELD_KEYS.runCompleted, "");
    onFieldChange(DRESS_REHEARSAL_FIELD_KEYS.cleanRunConfirmed, "");
    onFieldChange(DRESS_REHEARSAL_FIELD_KEYS.parentBuyerConfirmed, "");
    onFieldChange(DRESS_REHEARSAL_FIELD_KEYS.runDate, "");
    clearSavedCompletion();
    setActiveMoment(null);
  };

  const changeConfirmation = (key: string, checked: boolean) => {
    onFieldChange(key, checked ? "true" : "");
    clearSavedCompletion();
  };

  const startRun = () => {
    if (!setupReady) return;
    onFieldChange(DRESS_REHEARSAL_FIELD_KEYS.runCompleted, "");
    onFieldChange(DRESS_REHEARSAL_FIELD_KEYS.cleanRunConfirmed, "");
    onFieldChange(DRESS_REHEARSAL_FIELD_KEYS.parentBuyerConfirmed, "");
    onFieldChange(DRESS_REHEARSAL_FIELD_KEYS.runDate, "");
    clearSavedCompletion();
    setActiveMoment(0);
  };

  const advanceRun = () => {
    if (activeMoment === null) return;
    if (activeMoment < REHEARSAL_MOMENTS.length - 1) {
      setActiveMoment(activeMoment + 1);
      return;
    }
    onFieldChange(DRESS_REHEARSAL_FIELD_KEYS.runCompleted, "true");
    onFieldChange(DRESS_REHEARSAL_FIELD_KEYS.runDate, localDate());
    setActiveMoment(null);
  };

  const saveRehearsal = () => {
    if (!assessment.readyToSave) return;
    onFieldChange(
      DRESS_REHEARSAL_FIELD_KEYS.summary,
      buildDressRehearsalSummary(band, fields),
    );
    onFieldChange(DRESS_REHEARSAL_FIELD_KEYS.confirmed, "true");
    if (!completionSentRef.current) {
      completionSentRef.current = true;
      onTaskComplete?.();
    }
  };

  const setupDone = setupReady;
  const runDone = evidence.runCompleted && evidence.cleanRunConfirmed;
  const parentDone = evidence.parentBuyerConfirmed;

  return (
    <div aria-labelledby="fp-dress-rehearsal-title" className="pb-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sell">Set it up · run it clean · confirm it</p>
          <h3 id="fp-dress-rehearsal-title" className="mt-1 font-display text-[24px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">Dress Rehearsal</h3>
          <p className="mt-1.5 max-w-[620px] text-[13.5px] leading-[1.55] text-[hsl(25_20%_38%)]">Practice the whole sale with a parent playing the buyer—from hello to thank-you—before real money is involved.</p>
        </div>

        <div aria-label="Dress Rehearsal progress" className="grid shrink-0 grid-cols-3 gap-1.5 rounded-[14px] border-2 border-build/20 bg-build/5 p-2.5 shadow-card">
          {[
            ["1", "Set up", setupDone],
            ["2", "Rehearse", runDone],
            ["3", "Confirm", parentDone],
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
        <div>
          <p className="text-[12px] font-bold text-[hsl(25_34%_20%)]">Your rehearsal roles</p>
          <p className="mt-0.5 text-[12px] leading-[1.5] text-[hsl(25_20%_38%)]">{role.body}</p>
        </div>
      </div>

      <div className="mt-4 rounded-[12px] border-2 border-sell/20 bg-sell/5 px-3.5 py-3">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-sell">Sale you are rehearsing</p>
        {savedOffer ? (
          <p className="mt-1 text-[12.5px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">
            {savedOffer}{savedPrice !== null ? ` · ${formatMoney(savedPrice)}` : ""}{savedUnit ? ` · ${savedUnit}` : ""}
          </p>
        ) : (
          <p className="mt-1 text-[12px] leading-[1.45] text-[hsl(25_20%_38%)]">Use the offer and price you saved in Price Picker.</p>
        )}
      </div>

      <section className="mt-4 rounded-[14px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card" aria-labelledby="fp-dress-setup">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-build">Step 1 · Set up the point of sale</p>
        <h4 id="fp-dress-setup" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">How will payment and delivery work?</h4>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-[12px] border-2 border-build/20 bg-build/5 p-3.5">
            <div className="flex items-center gap-2"><DollarSign size={18} className="text-build" aria-hidden /><h5 className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">Payment</h5></div>
            <p className="mt-1 text-[10.5px] leading-[1.4] text-[hsl(25_20%_38%)]">Choose the real method you expect to use.</p>
            <div className="mt-3">
              <ChoiceButtons label="Payment method" options={DRESS_REHEARSAL_PAYMENT_METHODS} value={evidence.paymentMethod} onChange={(value) => changeSetup(DRESS_REHEARSAL_FIELD_KEYS.paymentMethod, value)} />
            </div>
            <label htmlFor="fp-dress-payment-details" className="mt-3 block text-[12px] font-bold text-[hsl(25_34%_20%)]">Payment handoff plan</label>
            <textarea id="fp-dress-payment-details" rows={3} maxLength={500} value={fields[DRESS_REHEARSAL_FIELD_KEYS.paymentDetails] ?? ""} onChange={(event) => changeSetup(DRESS_REHEARSAL_FIELD_KEYS.paymentDetails, event.target.value)} placeholder="Who takes the payment, where it goes, and what must be ready..." className="mt-1.5 min-h-[88px] w-full resize-y rounded-[10px] border-2 border-build/20 bg-white px-3 py-2.5 text-[12.5px] leading-[1.5] outline-none focus:border-build focus:ring-2 focus:ring-build/15" />
          </div>

          <div className="rounded-[12px] border-2 border-sell/20 bg-sell/5 p-3.5">
            <div className="flex items-center gap-2"><Package size={18} className="text-sell" aria-hidden /><h5 className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">Delivery</h5></div>
            <p className="mt-1 text-[10.5px] leading-[1.4] text-[hsl(25_20%_38%)]">Choose how the customer receives what they bought.</p>
            <div className="mt-3">
              <ChoiceButtons label="Delivery method" options={DRESS_REHEARSAL_DELIVERY_METHODS} value={evidence.deliveryMethod} onChange={(value) => changeSetup(DRESS_REHEARSAL_FIELD_KEYS.deliveryMethod, value)} />
            </div>
            <label htmlFor="fp-dress-delivery-details" className="mt-3 block text-[12px] font-bold text-[hsl(25_34%_20%)]">Delivery handoff plan</label>
            <textarea id="fp-dress-delivery-details" rows={3} maxLength={500} value={fields[DRESS_REHEARSAL_FIELD_KEYS.deliveryDetails] ?? ""} onChange={(event) => changeSetup(DRESS_REHEARSAL_FIELD_KEYS.deliveryDetails, event.target.value)} placeholder="What the buyer receives now and what happens next..." className="mt-1.5 min-h-[88px] w-full resize-y rounded-[10px] border-2 border-sell/20 bg-white px-3 py-2.5 text-[12.5px] leading-[1.5] outline-none focus:border-sell focus:ring-2 focus:ring-sell/15" />
          </div>
        </div>

        <div className="mt-4 rounded-[12px] border-2 border-scale/30 bg-scale/10 p-3.5">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-scale">Grade-band money check</p>
          {band === "g9_12" ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[12px] font-bold text-[hsl(25_34%_20%)]">Change plan<textarea rows={2} maxLength={350} value={fields[DRESS_REHEARSAL_FIELD_KEYS.changePlan] ?? ""} onChange={(event) => changeSetup(DRESS_REHEARSAL_FIELD_KEYS.changePlan, event.target.value)} placeholder="Float, exact payment, or how change is counted..." className="mt-1.5 min-h-[72px] w-full rounded-[10px] border-2 border-scale/20 bg-white px-3 py-2.5 text-[12px] font-normal leading-[1.45] outline-none focus:border-scale" /></label>
              <label className="text-[12px] font-bold text-[hsl(25_34%_20%)]">Receipt or confirmation plan<textarea rows={2} maxLength={350} value={fields[DRESS_REHEARSAL_FIELD_KEYS.receiptPlan] ?? ""} onChange={(event) => changeSetup(DRESS_REHEARSAL_FIELD_KEYS.receiptPlan, event.target.value)} placeholder="Paper receipt, email, or transfer confirmation..." className="mt-1.5 min-h-[72px] w-full rounded-[10px] border-2 border-scale/20 bg-white px-3 py-2.5 text-[12px] font-normal leading-[1.45] outline-none focus:border-scale" /></label>
            </div>
          ) : null}
          <label className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[10px] border-2 border-scale/20 bg-white px-3.5 py-3">
            <input
              type="checkbox"
              checked={band === "g3_5" ? evidence.parentMoneyRoleConfirmed : band === "g6_8" ? evidence.parentMathWatchConfirmed : evidence.salesRecordReady}
              onChange={(event) => changeSetup(band === "g3_5" ? DRESS_REHEARSAL_FIELD_KEYS.parentMoneyRoleConfirmed : band === "g6_8" ? DRESS_REHEARSAL_FIELD_KEYS.parentMathWatchConfirmed : DRESS_REHEARSAL_FIELD_KEYS.salesRecordReady, event.target.checked ? "true" : "")}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(150_52%_36%)]"
            />
            <span className="text-[12.5px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">{role.label}</span>
          </label>
        </div>
      </section>

      <section className="mt-4 rounded-[14px] border-2 border-build/25 bg-build/5 p-4" aria-labelledby="fp-dress-run">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-build">Step 2 · Do one uninterrupted run</p>
            <h4 id="fp-dress-run" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">Parent plays the buyer</h4>
            <p className="mt-1 text-[11.5px] leading-[1.45] text-[hsl(25_20%_38%)]">Set the phone down if needed. Tap through only after each real moment happens.</p>
          </div>
          {activeMoment === null ? (
            <button type="button" onClick={startRun} disabled={!setupReady} className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-build px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(208_64%_32%)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"><Play size={16} fill="currentColor" aria-hidden />{evidence.runCompleted ? "Run it again" : "Start full run"}</button>
          ) : (
            <button type="button" onClick={startRun} className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-build/25 bg-white px-4 font-display text-[12px] font-bold text-build"><RefreshCcw size={15} aria-hidden />Restart run</button>
          )}
        </div>

        {!setupReady ? (
          <div className="mt-3 flex items-start gap-2 rounded-[10px] border-2 border-build/20 bg-white px-3 py-2.5 text-[11.5px] font-semibold text-[hsl(25_20%_38%)]"><CircleAlert size={16} className="mt-0.5 shrink-0 text-build" aria-hidden />Finish the payment, delivery, and grade-band setup before starting.</div>
        ) : null}

        <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-5">
          {REHEARSAL_MOMENTS.map((moment, index) => {
            const finishedInRun = activeMoment !== null && index < activeMoment;
            const active = activeMoment === index;
            const finishedEarlier = activeMoment === null && evidence.runCompleted;
            const done = finishedInRun || finishedEarlier;
            return (
              <li key={moment.title} className={`rounded-[11px] border-2 p-3 ${active ? "border-build bg-white shadow-card" : done ? "border-verified/30 bg-verified/10" : "border-[hsl(25_34%_20%/0.12)] bg-white/70"}`}>
                <div className="flex items-center gap-2 sm:block">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-display text-[11px] font-black ${done ? "border-verified bg-verified text-white" : active ? "border-build bg-build text-white" : "border-[hsl(25_34%_20%/0.16)] bg-white text-[hsl(25_20%_38%)]"}`}>{done ? <Check size={14} strokeWidth={3} aria-hidden /> : index + 1}</span>
                  <p className="font-display text-[12px] font-black text-[hsl(25_34%_20%)] sm:mt-2">{moment.title}</p>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-[1.4] text-[hsl(25_20%_38%)]">{moment.prompt}</p>
              </li>
            );
          })}
        </ol>

        {activeMoment !== null ? (
          <div className="mt-4 rounded-[12px] border-2 border-build/30 bg-white p-3.5 text-center">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-build">Moment {activeMoment + 1} of {REHEARSAL_MOMENTS.length}</p>
            <p className="mt-1 font-display text-[17px] font-black text-[hsl(25_34%_20%)]">{REHEARSAL_MOMENTS[activeMoment].title}</p>
            <p className="mt-1 text-[12px] text-[hsl(25_20%_38%)]">{REHEARSAL_MOMENTS[activeMoment].prompt}</p>
            <button type="button" onClick={advanceRun} className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sell px-5 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)]">Complete {REHEARSAL_MOMENTS[activeMoment].title.toLocaleLowerCase()} <span aria-hidden>→</span></button>
          </div>
        ) : null}
      </section>

      <section className="mt-4 rounded-[14px] border-2 border-sell/25 bg-sell/5 p-4" aria-labelledby="fp-dress-confirm">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-sell">Step 3 · Confirm the clean run</p>
        <h4 id="fp-dress-confirm" className="mt-0.5 font-display text-[17px] font-black text-[hsl(25_34%_20%)]">Did it happen start to finish?</h4>
        {evidence.runCompleted ? (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex min-h-[60px] cursor-pointer items-start gap-3 rounded-[10px] border-2 border-sell/20 bg-white px-3.5 py-3">
              <input type="checkbox" checked={evidence.cleanRunConfirmed} onChange={(event) => changeConfirmation(DRESS_REHEARSAL_FIELD_KEYS.cleanRunConfirmed, event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(150_52%_36%)]" />
              <span className="text-[12px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">We completed greeting, ask, payment, delivery, and thank-you without stopping.</span>
            </label>
            <label className="flex min-h-[60px] cursor-pointer items-start gap-3 rounded-[10px] border-2 border-sell/20 bg-white px-3.5 py-3">
              <input type="checkbox" checked={evidence.parentBuyerConfirmed} onChange={(event) => changeConfirmation(DRESS_REHEARSAL_FIELD_KEYS.parentBuyerConfirmed, event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(150_52%_36%)]" />
              <span className="text-[12px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">The parent who played the buyer confirms this was one clean run.</span>
            </label>
          </div>
        ) : (
          <p className="mt-3 rounded-[10px] border-2 border-sell/15 bg-white px-3.5 py-3 text-[12px] leading-[1.45] text-[hsl(25_20%_38%)]">Complete all five rehearsal moments to unlock the confirmation.</p>
        )}
      </section>

      <section role="status" aria-label="Dress Rehearsal status" className={`mt-4 rounded-[14px] border-2 p-3.5 ${STATUS_CLASS[assessment.stage]}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${assessment.complete ? "bg-verified text-white" : assessment.stage === "needs-band-proof" || assessment.stage === "needs-parent" ? "bg-scale text-white" : "bg-[hsl(25_34%_20%/0.08)] text-[hsl(25_20%_38%)]"}`} aria-hidden>
              {assessment.complete ? <Sparkles size={17} /> : assessment.stage === "needs-band-proof" || assessment.stage === "needs-parent" ? <CircleAlert size={16} /> : <Play size={16} />}
            </span>
            <div>
              <p className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">{assessment.complete ? "Rehearsal saved" : assessment.readyToSave ? "Ready for the Founder File" : "Dress rehearsal check"}</p>
              <p className="mt-0.5 text-[12.5px] font-semibold leading-[1.45] text-[hsl(25_20%_38%)]">{assessment.message}</p>
            </div>
          </div>

          {assessment.complete ? (
            <div className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-verified px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)]"><Check size={16} strokeWidth={3} aria-hidden /> Task complete</div>
          ) : (
            <button type="button" onClick={saveRehearsal} disabled={!assessment.readyToSave} className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-sell px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"><Save size={16} aria-hidden /> Save rehearsal</button>
          )}
        </div>
      </section>
    </div>
  );
}
