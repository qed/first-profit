import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Box,
  Calculator,
  Check,
  CircleAlert,
  DollarSign,
  Save,
  Scale,
  ShoppingBasket,
  Sparkles,
  UserCheck,
} from "lucide-react";
import type { Band } from "../../data/path";
import {
  PRICE_PICKER_FIELD_KEYS,
  assessPricePicker,
  buildPricePickerSummary,
  estimatedProfit,
  formatMoney,
  parseMoney,
  pricePickerEvidence,
  type PricePickerFields,
} from "../../lib/pricePicker";
import { ToolFlowProgress } from "./ToolFlowProgress";

const FLOW_STEPS = ["Define the offer", "Choose the price", "Explain + save"] as const;

const STATUS_CLASS = {
  "needs-offer": "border-[hsl(25_34%_20%/0.14)] bg-white",
  "needs-price": "border-build/30 bg-build/5",
  "needs-band-proof": "border-scale/40 bg-scale/10",
  "needs-reason": "border-sell/30 bg-sell/5",
  ready: "border-sell/35 bg-sell/5",
  complete: "border-verified/35 bg-verified/10",
} as const;

function bandGuidance(band: Band): string {
  if (band === "g3_5") {
    return "Ask a parent to suggest three possible prices. You make the final choice and explain it.";
  }
  if (band === "g9_12") {
    return "Compare your price with two real alternatives a customer could choose instead.";
  }
  return "Propose the price yourself. A parent checks that it covers your best current cost estimate.";
}

function reasonPrompt(band: Band): string {
  if (band === "g3_5") return "I chose this price because...";
  if (band === "g9_12") return "Compared with the two alternatives, this price makes sense because...";
  return "This price covers my estimated cost and makes sense because...";
}

function MoneyInput({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <label htmlFor={id} className="block text-[12px] font-bold text-[hsl(25_34%_20%)]">
      {label}
      {hint ? <span className="mt-0.5 block text-[10.5px] font-normal leading-[1.4] text-[hsl(25_20%_38%)]">{hint}</span> : null}
      <span className="relative mt-1.5 block">
        <DollarSign size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-build" aria-hidden />
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0.00"
          className="min-h-[44px] w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-white py-2 pl-8 pr-3 text-sm font-semibold outline-none placeholder:text-[hsl(25_20%_38%/0.45)] focus:border-build focus:ring-2 focus:ring-build/15"
        />
      </span>
    </label>
  );
}

function PriceSlider({
  price,
  cost,
  onChange,
}: {
  price: number | null;
  cost: number | null;
  onChange: (value: string) => void;
}) {
  const typedPriceCeiling = Math.ceil((price ?? 0) / 100) * 100;
  const costCeiling = Math.ceil(((cost ?? 0) * 2) / 100) * 100;
  const max = Math.max(100, typedPriceCeiling, costCeiling);
  const value = price && price > 0 ? Math.min(price, max) : 1;
  return (
    <div className="mt-3 rounded-[12px] border-2 border-build/20 bg-build/5 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="fp-price-slider" className="font-display text-[14px] font-black text-[hsl(25_34%_20%)]">Try the price</label>
        <span className="rounded-full bg-build px-3 py-1 font-mono text-[11px] font-bold text-white">{formatMoney(value)}</span>
      </div>
      <input
        id="fp-price-slider"
        type="range"
        min="1"
        max={max}
        step="0.5"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 h-6 w-full cursor-pointer accent-[hsl(208_64%_46%)]"
      />
      <div className="mt-0.5 flex justify-between font-mono text-[9px] font-semibold text-[hsl(25_20%_38%)]">
        <span>$1</span>
        <span>{formatMoney(max)}</span>
      </div>
    </div>
  );
}

function StageNavigation({
  back,
  next,
  nextLabel,
  nextDisabled = false,
}: {
  back?: () => void;
  next?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      {back ? <button type="button" onClick={back} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 font-display text-[13px] font-bold text-[hsl(25_20%_38%)]"><ArrowLeft size={16} aria-hidden /> Back</button> : <span />}
      {next && nextLabel ? <button type="button" disabled={nextDisabled} onClick={next} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-verified px-5 font-display text-[15px] font-bold text-white shadow-[0_4px_0_hsl(150_52%_26%)] enabled:active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45">{nextLabel}<ArrowRight size={17} aria-hidden /></button> : null}
    </div>
  );
}

export function PricePickerTool({
  band,
  fields,
  onFieldChange,
  onTaskComplete,
}: {
  band: Band;
  fields: PricePickerFields;
  onFieldChange: (key: string, value: string) => void;
  onTaskComplete?: () => void;
}) {
  const completionSentRef = useRef(false);
  const evidence = pricePickerEvidence(fields);
  const assessment = assessPricePicker(band, fields);
  const profit = estimatedProfit(evidence.price, evidence.estimatedCost);

  useEffect(() => {
    if (!assessment.complete || completionSentRef.current) return;
    completionSentRef.current = true;
    onTaskComplete?.();
  }, [assessment.complete, onTaskComplete]);

  const changeEvidence = (key: string, value: string) => {
    onFieldChange(key, value);
    onFieldChange(PRICE_PICKER_FIELD_KEYS.confirmed, "");
    onFieldChange(PRICE_PICKER_FIELD_KEYS.summary, "");
  };

  const saveChoice = () => {
    if (!assessment.readyToSave) return;
    onFieldChange(
      PRICE_PICKER_FIELD_KEYS.summary,
      buildPricePickerSummary(band, fields),
    );
    onFieldChange(PRICE_PICKER_FIELD_KEYS.confirmed, "true");
    if (!completionSentRef.current) {
      completionSentRef.current = true;
      onTaskComplete?.();
    }
  };

  const offerDone = Boolean(evidence.offer && evidence.unit);
  const priceDone = ![
    "needs-offer",
    "needs-price",
    "needs-band-proof",
  ].includes(assessment.stage);
  const [stage, setStage] = useState(() => assessment.complete || evidence.reason ? 2 : offerDone ? 1 : 0);

  const optionFields = [
    [PRICE_PICKER_FIELD_KEYS.optionOne, "Price option 1"],
    [PRICE_PICKER_FIELD_KEYS.optionTwo, "Price option 2"],
    [PRICE_PICKER_FIELD_KEYS.optionThree, "Price option 3"],
  ] as const;

  return (
    <div aria-labelledby="fp-price-picker-title" className="pb-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sell">Choose it · check it · explain it</p>
          <h3 id="fp-price-picker-title" className="mt-1 font-display text-[24px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">Price Picker</h3>
          <p className="mt-1.5 max-w-[620px] text-[13.5px] leading-[1.55] text-[hsl(25_20%_38%)]">Turn your idea into one clear offer with one clear price a customer can understand.</p>
        </div>

        <div className="w-full rounded-[13px] border-2 border-[hsl(25_34%_20%/0.12)] bg-white p-3 shadow-card sm:max-w-[300px]">
          <ToolFlowProgress current={stage + 1} steps={FLOW_STEPS} />
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-[12px] border-2 border-build/20 bg-build/5 px-3.5 py-3">
        <UserCheck size={18} className="mt-0.5 shrink-0 text-build" aria-hidden />
        <p className="text-[12px] leading-[1.5] text-[hsl(25_20%_38%)]"><strong className="text-[hsl(25_34%_20%)]">Your pricing check:</strong> {bandGuidance(band)}</p>
      </div>

      {stage === 0 ? <>
      <section className="mt-4 rounded-[14px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card" aria-labelledby="fp-price-offer">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-build">Step 1 · Define the offer</p>
        <h4 id="fp-price-offer" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">What does the customer get?</h4>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[12px] font-bold text-[hsl(25_34%_20%)]">
            Offer name
            <span className="mt-0.5 block text-[10.5px] font-normal text-[hsl(25_20%_38%)]">The product, service, or charity offer.</span>
            <span className="relative mt-1.5 block">
              <ShoppingBasket size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-build" aria-hidden />
              <input type="text" maxLength={120} value={fields[PRICE_PICKER_FIELD_KEYS.offer] ?? ""} onChange={(event) => changeEvidence(PRICE_PICKER_FIELD_KEYS.offer, event.target.value)} placeholder="Custom chess pieces" className="min-h-[44px] w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_30%_99%)] py-2 pl-9 pr-3 text-sm outline-none focus:border-build focus:ring-2 focus:ring-build/15" />
            </span>
          </label>
          <label className="text-[12px] font-bold text-[hsl(25_34%_20%)]">
            What is one unit?
            <span className="mt-0.5 block text-[10.5px] font-normal text-[hsl(25_20%_38%)]">Exactly what one customer receives.</span>
            <span className="relative mt-1.5 block">
              <Box size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-build" aria-hidden />
              <input type="text" maxLength={160} value={fields[PRICE_PICKER_FIELD_KEYS.unit] ?? ""} onChange={(event) => changeEvidence(PRICE_PICKER_FIELD_KEYS.unit, event.target.value)} placeholder="One set of eight custom pawns" className="min-h-[44px] w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_30%_99%)] py-2 pl-9 pr-3 text-sm outline-none focus:border-build focus:ring-2 focus:ring-build/15" />
            </span>
          </label>
        </div>
      </section>
      <StageNavigation next={() => setStage(1)} nextLabel="Choose the price" nextDisabled={!offerDone} />
      </> : null}

      {stage === 1 ? <>
      <section className="mt-4 rounded-[14px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card" aria-labelledby="fp-price-choose">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sell/10 text-sell" aria-hidden><BadgeDollarSign size={21} /></span>
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-sell">Step 2 · Choose the price</p>
            <h4 id="fp-price-choose" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">What will one unit cost?</h4>
            <p className="mt-1 text-[11.5px] leading-[1.45] text-[hsl(25_20%_38%)]">Use dollar amounts. You can change this price after real customer feedback.</p>
          </div>
        </div>

        {band === "g3_5" ? (
          <div className="mt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {optionFields.map(([key, label]) => {
                const amount = parseMoney(fields[key]);
                const selected = amount !== null && evidence.price !== null && Math.round(amount * 100) === Math.round(evidence.price * 100);
                return (
                  <div key={key} className={`rounded-[12px] border-2 p-3 ${selected ? "border-verified bg-verified/10" : "border-build/20 bg-build/5"}`}>
                    <MoneyInput id={`fp-${key}`} label={label} value={fields[key] ?? ""} onChange={(value) => changeEvidence(key, value)} />
                    <button type="button" disabled={amount === null || amount <= 0} onClick={() => changeEvidence(PRICE_PICKER_FIELD_KEYS.price, String(amount))} className={`mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-2 font-display text-[12px] font-bold ${selected ? "bg-verified text-white" : "border-2 border-build/25 bg-white text-build disabled:cursor-not-allowed disabled:opacity-40"}`}>
                      {selected ? <Check size={15} aria-hidden /> : null}{selected ? "Chosen price" : amount && amount > 0 ? `Choose ${formatMoney(amount)}` : "Enter a price"}
                    </button>
                  </div>
                );
              })}
            </div>
            <label className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[10px] border-2 border-verified/25 bg-verified/5 px-3.5 py-3">
              <input type="checkbox" checked={evidence.parentOptions} onChange={(event) => changeEvidence(PRICE_PICKER_FIELD_KEYS.parentOptions, event.target.checked ? "true" : "")} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(150_52%_36%)]" />
              <span className="text-[12.5px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">A parent helped list these three price choices.</span>
            </label>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MoneyInput id="fp-price-final" label="Your price" value={fields[PRICE_PICKER_FIELD_KEYS.price] ?? ""} onChange={(value) => changeEvidence(PRICE_PICKER_FIELD_KEYS.price, value)} hint="What one customer pays for one unit." />
                <MoneyInput id="fp-price-cost" label={band === "g6_8" ? "Estimated cost" : "Estimated cost (optional)"} value={fields[PRICE_PICKER_FIELD_KEYS.estimatedCost] ?? ""} onChange={(value) => changeEvidence(PRICE_PICKER_FIELD_KEYS.estimatedCost, value)} hint="Your best estimate for one unit today." />
              </div>
              <PriceSlider price={evidence.price} cost={evidence.estimatedCost} onChange={(value) => changeEvidence(PRICE_PICKER_FIELD_KEYS.price, value)} />
            </div>

            {band === "g6_8" ? (
              <div className="rounded-[12px] border-2 border-verified/25 bg-verified/5 p-3.5">
                <div className="flex items-center gap-2"><Calculator size={18} className="text-verified" aria-hidden /><h5 className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">Quick profit preview</h5></div>
                {profit === null ? (
                  <p className="mt-3 text-[12px] leading-[1.5] text-[hsl(25_20%_38%)]">Enter the price and estimated cost to see what may be left per unit.</p>
                ) : (
                  <div className={`mt-3 rounded-[10px] border-2 p-3 ${profit >= 0 ? "border-verified/30 bg-white" : "border-scale/40 bg-scale/10"}`}>
                    <p className="font-mono text-[9px] font-semibold uppercase text-[hsl(25_20%_38%)]">{profit >= 0 ? "Estimated profit per unit" : "Amount not covered"}</p>
                    <p className={`mt-0.5 font-display text-[28px] font-black ${profit >= 0 ? "text-verified" : "text-scale"}`}>{formatMoney(Math.abs(profit))}</p>
                    <p className="mt-1 text-[10.5px] leading-[1.4] text-[hsl(25_20%_38%)]">This is a quick estimate. You will count every cost in a later task.</p>
                  </div>
                )}
                <label className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[10px] border-2 border-verified/25 bg-white px-3 py-3">
                  <input type="checkbox" checked={evidence.parentCostCheck} onChange={(event) => changeEvidence(PRICE_PICKER_FIELD_KEYS.parentCostCheck, event.target.checked ? "true" : "")} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(150_52%_36%)]" />
                  <span className="text-[12px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">A parent checked that this price covers the estimated cost.</span>
                </label>
              </div>
            ) : (
              <div className="rounded-[12px] border-2 border-scale/30 bg-scale/10 p-3.5">
                <div className="flex items-center gap-2"><Scale size={18} className="text-scale" aria-hidden /><h5 className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">Two customer alternatives</h5></div>
                <p className="mt-1 text-[10.5px] leading-[1.4] text-[hsl(25_20%_38%)]">Use real products or services a customer could buy instead.</p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[1, 2].map((number) => {
                    const nameKey = number === 1 ? PRICE_PICKER_FIELD_KEYS.alternativeOne : PRICE_PICKER_FIELD_KEYS.alternativeTwo;
                    const priceKey = number === 1 ? PRICE_PICKER_FIELD_KEYS.alternativeOnePrice : PRICE_PICKER_FIELD_KEYS.alternativeTwoPrice;
                    return (
                      <div key={number} className="rounded-[10px] border-2 border-scale/20 bg-white p-3">
                        <label className="block text-[11.5px] font-bold text-[hsl(25_34%_20%)]">Alternative {number}<input type="text" maxLength={140} value={fields[nameKey] ?? ""} onChange={(event) => changeEvidence(nameKey, event.target.value)} placeholder={number === 1 ? "Etsy custom set" : "Local maker set"} className="mt-1.5 min-h-[44px] w-full rounded-[9px] border-2 border-[hsl(25_34%_20%/0.14)] px-3 text-[12px] outline-none focus:border-scale" /></label>
                        <div className="mt-2"><MoneyInput id={`fp-alternative-${number}-price`} label="Their price" value={fields[priceKey] ?? ""} onChange={(value) => changeEvidence(priceKey, value)} /></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      {!priceDone ? <p role="status" aria-label="Price Picker progress note" className="mt-3 rounded-xl border-2 border-build/20 bg-build/5 px-3.5 py-3 text-[12px] font-semibold leading-[1.45] text-[hsl(25_20%_38%)]">{assessment.message}</p> : null}
      <StageNavigation back={() => setStage(0)} next={() => setStage(2)} nextLabel="Explain the choice" nextDisabled={!priceDone} />
      </> : null}

      {stage === 2 ? <>
      <section className="mt-4 rounded-[14px] border-2 border-sell/25 bg-sell/5 p-4" aria-labelledby="fp-price-reason">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-sell">Step 3 · Explain the choice</p>
        <h4 id="fp-price-reason" className="mt-0.5 font-display text-[17px] font-black text-[hsl(25_34%_20%)]">Why did you choose this price?</h4>
        <label htmlFor="fp-price-reason-input" className="mt-3 block text-[12px] font-bold text-[hsl(25_34%_20%)]">One clear sentence</label>
        <textarea id="fp-price-reason-input" rows={3} maxLength={500} value={fields[PRICE_PICKER_FIELD_KEYS.reason] ?? ""} onChange={(event) => changeEvidence(PRICE_PICKER_FIELD_KEYS.reason, event.target.value)} placeholder={reasonPrompt(band)} className="mt-1.5 min-h-[88px] w-full resize-y rounded-[10px] border-2 border-sell/20 bg-white px-3.5 py-3 text-[13px] leading-[1.5] outline-none placeholder:text-[hsl(25_20%_38%/0.5)] focus:border-sell focus:ring-2 focus:ring-sell/15" />
      </section>

      <section role="status" aria-label="Price Picker status" className={`mt-4 rounded-[14px] border-2 p-3.5 ${STATUS_CLASS[assessment.stage]}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${assessment.complete ? "bg-verified text-white" : assessment.stage === "needs-band-proof" ? "bg-scale text-white" : "bg-[hsl(25_34%_20%/0.08)] text-[hsl(25_20%_38%)]"}`} aria-hidden>
              {assessment.complete ? <Sparkles size={17} /> : assessment.stage === "needs-band-proof" ? <CircleAlert size={16} /> : <BadgeDollarSign size={16} />}
            </span>
            <div>
              <p className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">{assessment.complete ? "Price saved" : assessment.readyToSave ? "Ready for the Founder File" : "Price check"}</p>
              <p className="mt-0.5 text-[12.5px] font-semibold leading-[1.45] text-[hsl(25_20%_38%)]">{assessment.message}</p>
            </div>
          </div>

          {assessment.complete ? (
            <div className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-verified px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)]"><Check size={16} strokeWidth={3} aria-hidden /> Task complete</div>
          ) : (
            <button type="button" onClick={saveChoice} disabled={!assessment.readyToSave} className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-sell px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"><Save size={16} aria-hidden /> Save price</button>
          )}
        </div>
      </section>
      <StageNavigation back={() => setStage(1)} />
      </> : null}
    </div>
  );
}
