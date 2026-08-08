import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Image as ImageIcon,
  MessageCircle,
  PackageCheck,
  Save,
  Sparkles,
  UserCheck,
} from "lucide-react";
import type { Band } from "../../data/path";
import { askTrackerEvidence } from "../../lib/askTracker";
import {
  SALE_LOGGER_DELIVERY_METHODS,
  SALE_LOGGER_FIELD_KEYS,
  SALE_LOGGER_PHOTO_SUBJECTS,
  assessSaleLogger,
  buildSaleLoggerSummary,
  saleLoggerEvidence,
  type SaleLoggerFields,
} from "../../lib/saleLogger";
import { ToolFlowProgress } from "./ToolFlowProgress";

const FLOW_STEPS = ["Complete delivery", "Thank + listen", "Save the memory"] as const;

const STATUS_CLASS = {
  "needs-sale": "border-scale/40 bg-scale/10",
  "needs-delivery": "border-build/30 bg-build/5",
  "needs-thanks": "border-build/30 bg-build/5",
  "needs-feedback": "border-sell/30 bg-sell/5",
  "needs-photo": "border-scale/40 bg-scale/10",
  "needs-reflection": "border-scale/40 bg-scale/10",
  ready: "border-sell/35 bg-sell/5",
  complete: "border-verified/35 bg-verified/10",
} as const;

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
          <button key={option.value} type="button" aria-pressed={selected} onClick={() => onChange(option.value)} className={`min-h-[46px] rounded-[10px] border-2 px-3 py-2.5 text-left font-display text-[12.5px] font-bold ${selected ? "border-verified bg-verified/10 text-[hsl(25_34%_20%)]" : "border-[hsl(25_34%_20%/0.14)] bg-white text-[hsl(25_20%_38%)]"}`}>
            <span className="flex items-center gap-2"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-verified bg-verified text-white" : "border-[hsl(25_34%_20%/0.2)]"}`}>{selected ? <Check size={12} strokeWidth={3} aria-hidden /> : null}</span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SaleLoggerTool({
  band,
  fields,
  onFieldChange,
  onTaskComplete,
}: {
  band: Band;
  fields: SaleLoggerFields;
  onFieldChange: (key: string, value: string) => void;
  onTaskComplete?: () => void;
}) {
  const completionSentRef = useRef(false);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [photoError, setPhotoError] = useState("");
  const evidence = saleLoggerEvidence(fields);
  const ask = askTrackerEvidence(fields);
  const assessment = assessSaleLogger(band, fields);

  useEffect(() => {
    if (!assessment.complete || completionSentRef.current) return;
    completionSentRef.current = true;
    onTaskComplete?.();
  }, [assessment.complete, onTaskComplete]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  const changeEvidence = (key: string, value: string) => {
    onFieldChange(key, value);
    onFieldChange(SALE_LOGGER_FIELD_KEYS.confirmed, "");
    onFieldChange(SALE_LOGGER_FIELD_KEYS.summary, "");
  };

  const selectPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Choose an image file such as JPG, PNG, HEIC, or WebP.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setPhotoError("Choose a photo smaller than 12 MB.");
      return;
    }
    setPhotoError("");
    if (typeof URL.createObjectURL === "function") {
      setPhotoPreviewUrl(URL.createObjectURL(file));
    }
    changeEvidence(SALE_LOGGER_FIELD_KEYS.photoFileName, file.name);
    changeEvidence(SALE_LOGGER_FIELD_KEYS.photoFileType, file.type);
    changeEvidence(SALE_LOGGER_FIELD_KEYS.photoFileSize, String(file.size));
    changeEvidence(SALE_LOGGER_FIELD_KEYS.photoAddedConfirmed, "");
  };

  const saveSale = () => {
    if (!assessment.readyToSave) return;
    onFieldChange(
      SALE_LOGGER_FIELD_KEYS.summary,
      buildSaleLoggerSummary(band, fields),
    );
    onFieldChange(SALE_LOGGER_FIELD_KEYS.confirmed, "true");
    if (!completionSentRef.current) {
      completionSentRef.current = true;
      onTaskComplete?.();
    }
  };

  const deliveryDone = Boolean(
    evidence.deliveryMethod &&
      evidence.deliveryDate &&
      evidence.deliveryDetails &&
      evidence.deliveredConfirmed,
  );
  const feedbackDone = evidence.thankedConfirmed && Boolean(evidence.customerSaid);
  const proofDone = evidence.photoAddedConfirmed && Boolean(evidence.photoSubject && evidence.photoFileName);
  const [stage, setStage] = useState(() =>
    fields[SALE_LOGGER_FIELD_KEYS.confirmed] || proofDone || feedbackDone
      ? 2
      : deliveryDone
        ? 1
        : 0,
  );

  return (
    <div aria-labelledby="fp-sale-logger-title" className="pb-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sell">Deliver it · thank them · finish the record</p>
          <h3 id="fp-sale-logger-title" className="mt-1 font-display text-[24px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">Sale Logger</h3>
          <p className="mt-1.5 max-w-[620px] text-[13.5px] leading-[1.55] text-[hsl(25_20%_38%)]">Close the loop on the first real sale: deliver everything promised, thank the customer, and save what happened.</p>
        </div>

        <div className="w-full shrink-0 sm:w-[230px]">
          <ToolFlowProgress current={stage + 1} steps={FLOW_STEPS} />
        </div>
      </div>

      {evidence.paidSaleReady && ask.winner ? (
        <section className="mt-4 rounded-[14px] border-2 border-verified/30 bg-verified/10 p-4 shadow-card" aria-labelledby="fp-sale-record">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-verified text-white"><UserCheck size={20} aria-hidden /></span>
            <div className="min-w-0"><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-verified">Paid sale from Ask Tracker</p><h4 id="fp-sale-record" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">{ask.winner.name} · ${ask.saleAmount?.toFixed(2)}</h4><p className="mt-1 text-[12px] leading-[1.45] text-[hsl(25_20%_38%)]">{ask.saleItem} · {ask.saleDate}</p></div>
          </div>
        </section>
      ) : (
        <div className="mt-4 flex items-start gap-2.5 rounded-[12px] border-2 border-scale/30 bg-scale/10 px-3.5 py-3"><CircleAlert size={18} className="mt-0.5 shrink-0 text-scale" aria-hidden /><p className="text-[12px] font-semibold leading-[1.5] text-[hsl(25_34%_20%)]">Finish Ask Tracker first. This logger will carry over the customer, item, amount, and sale date automatically.</p></div>
      )}

      {stage === 0 ? (
        <>
      <section className="mt-4 rounded-[14px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card" aria-labelledby="fp-sale-delivery">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-build/10 text-build"><PackageCheck size={21} aria-hidden /></span><div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-build">Step 1 · Complete delivery</p><h4 id="fp-sale-delivery" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">Did the customer receive everything?</h4></div></div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <ChoiceButtons label="Completed delivery method" options={SALE_LOGGER_DELIVERY_METHODS} value={evidence.deliveryMethod} onChange={(value) => changeEvidence(SALE_LOGGER_FIELD_KEYS.deliveryMethod, value)} />
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
            <label className="text-[12px] font-bold text-[hsl(25_34%_20%)]">Delivery date<input aria-label="Delivery date" type="date" value={fields[SALE_LOGGER_FIELD_KEYS.deliveryDate] ?? ""} onChange={(event) => changeEvidence(SALE_LOGGER_FIELD_KEYS.deliveryDate, event.target.value)} className="mt-1.5 min-h-[44px] w-full rounded-[10px] border-2 border-build/20 bg-white px-3 text-[12px] outline-none focus:border-build" /></label>
            <label className="text-[12px] font-bold text-[hsl(25_34%_20%)]">What was delivered?<textarea rows={2} maxLength={500} value={fields[SALE_LOGGER_FIELD_KEYS.deliveryDetails] ?? ""} onChange={(event) => changeEvidence(SALE_LOGGER_FIELD_KEYS.deliveryDetails, event.target.value)} placeholder="What the customer received and how the handoff happened..." className="mt-1.5 min-h-[64px] w-full rounded-[10px] border-2 border-build/20 bg-white px-3 py-2 text-[12px] font-normal leading-[1.45] outline-none focus:border-build" /></label>
          </div>
        </div>
        <label className="mt-3 flex min-h-[58px] cursor-pointer items-start gap-3 rounded-[10px] border-2 border-verified/20 bg-verified/5 px-3.5 py-3"><input type="checkbox" checked={evidence.deliveredConfirmed} onChange={(event) => changeEvidence(SALE_LOGGER_FIELD_KEYS.deliveredConfirmed, event.target.checked ? "true" : "")} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(150_52%_36%)]" /><span className="text-[12.5px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">The customer has everything they paid for.</span></label>
      </section>

          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => setStage(1)} disabled={!evidence.paidSaleReady || !deliveryDone} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sell px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none">
              Thank the customer <ArrowRight size={16} aria-hidden />
            </button>
          </div>
        </>
      ) : null}

      {stage === 1 ? (
        <>
      <section className="mt-4 rounded-[14px] border-2 border-sell/25 bg-sell/5 p-4" aria-labelledby="fp-sale-feedback">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sell/10 text-sell"><MessageCircle size={20} aria-hidden /></span><div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-sell">Step 2 · Thank and listen</p><h4 id="fp-sale-feedback" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">What did the customer say?</h4></div></div>
        <label className="mt-3 flex min-h-[58px] cursor-pointer items-start gap-3 rounded-[10px] border-2 border-sell/20 bg-white px-3.5 py-3"><input type="checkbox" checked={evidence.thankedConfirmed} onChange={(event) => changeEvidence(SALE_LOGGER_FIELD_KEYS.thankedConfirmed, event.target.checked ? "true" : "")} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(150_52%_36%)]" /><span className="text-[12.5px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">I thanked the customer for buying.</span></label>
        <label htmlFor="fp-customer-said" className="mt-3 block text-[12px] font-bold text-[hsl(25_34%_20%)]">Customer’s words</label>
        <textarea id="fp-customer-said" rows={3} maxLength={600} value={fields[SALE_LOGGER_FIELD_KEYS.customerSaid] ?? ""} onChange={(event) => changeEvidence(SALE_LOGGER_FIELD_KEYS.customerSaid, event.target.value)} placeholder="Write what they said as accurately as you can. If they said very little, record that honestly." className="mt-1.5 min-h-[92px] w-full rounded-[10px] border-2 border-sell/20 bg-white px-3.5 py-3 text-[12.5px] leading-[1.5] outline-none focus:border-sell focus:ring-2 focus:ring-sell/15" />
      </section>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => setStage(0)} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-[hsl(25_34%_20%/0.14)] bg-white px-4 font-display text-[13px] font-bold text-[hsl(25_34%_20%)]"><ArrowLeft size={16} aria-hidden /> Delivery</button>
            <button type="button" onClick={() => setStage(2)} disabled={!feedbackDone} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-sell px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none">Save the sale memory <ArrowRight size={16} aria-hidden /></button>
          </div>
        </>
      ) : null}

      {stage === 2 ? (
        <>
      <section className="mt-4 rounded-[14px] border-2 border-scale/30 bg-scale/10 p-4" aria-labelledby="fp-sale-photo">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-scale/15 text-scale"><ImageIcon size={20} aria-hidden /></span><div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-scale">Step 3 · Add photo evidence</p><h4 id="fp-sale-photo" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">What does the photo show?</h4></div></div>
        <div className="mt-3 rounded-[10px] border-2 border-scale/20 bg-white px-3.5 py-3"><p className="text-[11.5px] leading-[1.5] text-[hsl(25_20%_38%)]"><strong className="text-[hsl(25_34%_20%)]">Privacy:</strong> The customer’s face is optional. The preview stays in this browser session and is not uploaded. Keep the original on a parent-approved device for the Founder File or future Image Lab handoff.</p></div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <input id="fp-sale-photo-file" type="file" accept="image/*" capture="environment" onChange={(event) => selectPhoto(event.target.files?.[0])} className="sr-only" />
            <label htmlFor="fp-sale-photo-file" className="inline-flex min-h-[46px] w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-scale px-4 font-display text-[12.5px] font-bold text-white shadow-[0_3px_0_hsl(42_72%_34%)]"><ImageIcon size={17} aria-hidden /> Choose or take sale photo</label>
            {photoError ? <p role="alert" className="mt-2 text-[11px] font-semibold text-scale">{photoError}</p> : null}
            {evidence.photoFileName ? <div className="mt-2 rounded-[9px] border-2 border-verified/20 bg-verified/10 px-3 py-2.5"><p className="truncate text-[11.5px] font-bold text-[hsl(25_34%_20%)]">Selected: {evidence.photoFileName}</p><p className="mt-0.5 text-[9.5px] text-[hsl(25_20%_38%)]">File details are saved; the image itself remains on the device.</p></div> : null}
          </div>
          {photoPreviewUrl ? <div className="overflow-hidden rounded-[10px] border-2 border-scale/20 bg-white"><img src={photoPreviewUrl} alt="Sale photo preview" className="h-[148px] w-full object-cover" /></div> : <div className="flex min-h-[100px] items-center justify-center rounded-[10px] border-2 border-dashed border-scale/25 bg-white/70 px-4 text-center text-[10.5px] font-semibold leading-[1.45] text-[hsl(25_20%_38%)]">Your selected photo preview appears here for this session.</div>}
        </div>
        <div className="mt-3"><ChoiceButtons label="Photo subject" options={SALE_LOGGER_PHOTO_SUBJECTS} value={evidence.photoSubject} onChange={(value) => changeEvidence(SALE_LOGGER_FIELD_KEYS.photoSubject, value)} /></div>
        <label className={`mt-3 flex min-h-[58px] items-start gap-3 rounded-[10px] border-2 border-scale/20 bg-white px-3.5 py-3 ${evidence.photoFileName ? "cursor-pointer" : "cursor-not-allowed opacity-55"}`}><input type="checkbox" disabled={!evidence.photoFileName} checked={evidence.photoAddedConfirmed} onChange={(event) => changeEvidence(SALE_LOGGER_FIELD_KEYS.photoAddedConfirmed, event.target.checked ? "true" : "")} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(150_52%_36%)]" /><span className="text-[12.5px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">I kept the original photo and it is ready to add to the Founder File.</span></label>
      </section>

      {band === "g9_12" ? (
        <section className="mt-4 rounded-[14px] border-2 border-build/25 bg-build/5 p-4" aria-labelledby="fp-sale-reflection">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-build">High-school reflection</p>
          <h4 id="fp-sale-reflection" className="mt-0.5 font-display text-[17px] font-black text-[hsl(25_34%_20%)]">What would you change next time?</h4>
          <textarea aria-label="Next-sale change" rows={3} maxLength={500} value={fields[SALE_LOGGER_FIELD_KEYS.highSchoolChange] ?? ""} onChange={(event) => changeEvidence(SALE_LOGGER_FIELD_KEYS.highSchoolChange, event.target.value)} placeholder="Next time, I would..." className="mt-3 min-h-[88px] w-full rounded-[10px] border-2 border-build/20 bg-white px-3.5 py-3 text-[12.5px] leading-[1.5] outline-none focus:border-build" />
        </section>
      ) : null}

      <section role="status" aria-label="Sale Logger status" className={`mt-4 rounded-[14px] border-2 p-3.5 ${STATUS_CLASS[assessment.stage]}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2.5"><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${assessment.complete ? "bg-verified text-white" : assessment.stage === "needs-photo" || assessment.stage === "needs-reflection" || assessment.stage === "needs-sale" ? "bg-scale text-white" : "bg-[hsl(25_34%_20%/0.08)] text-[hsl(25_20%_38%)]"}`} aria-hidden>{assessment.complete ? <Sparkles size={17} /> : assessment.stage === "needs-photo" ? <ImageIcon size={16} /> : assessment.stage === "needs-delivery" ? <PackageCheck size={16} /> : <CircleAlert size={16} />}</span><div><p className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">{assessment.complete ? "First sale fully logged" : assessment.readyToSave ? "Ready for the Founder File" : "Sale Logger check"}</p><p className="mt-0.5 text-[12.5px] font-semibold leading-[1.45] text-[hsl(25_20%_38%)]">{assessment.message}</p></div></div>
          {assessment.complete ? <div className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-verified px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)]"><Check size={16} strokeWidth={3} aria-hidden /> Criterion complete</div> : <button type="button" onClick={saveSale} disabled={!assessment.readyToSave} className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-sell px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"><Save size={16} aria-hidden /> Save completed sale</button>}
        </div>
      </section>
          <div className="mt-4">
            <button type="button" onClick={() => setStage(1)} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-[hsl(25_34%_20%/0.14)] bg-white px-4 font-display text-[13px] font-bold text-[hsl(25_34%_20%)]"><ArrowLeft size={16} aria-hidden /> Customer feedback</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
