import { useEffect, useRef } from "react";
import {
  Check,
  CircleAlert,
  ListChecks,
  LockKeyhole,
  Route,
  Save,
  ShieldCheck,
  Sparkles,
  UserRoundPlus,
  Users,
} from "lucide-react";
import type { Band } from "../../data/path";
import {
  TEN_LIST_CHANNELS,
  TEN_LIST_FIELD_KEYS,
  TEN_LIST_SIZE,
  assessTenList,
  buildTenListSummary,
  containsPrivateContactInfo,
  requiredOutsideCount,
  tenListEvidence,
  tenListRowFieldKey,
  type TenListFields,
} from "../../lib/tenList";

const STATUS_CLASS = {
  "needs-prospects": "border-[hsl(25_34%_20%/0.14)] bg-white",
  "needs-privacy": "border-scale/40 bg-scale/10",
  "needs-channels": "border-build/30 bg-build/5",
  "needs-band-mix": "border-scale/40 bg-scale/10",
  "needs-reasons": "border-sell/30 bg-sell/5",
  "needs-parent": "border-build/30 bg-build/5",
  ready: "border-sell/35 bg-sell/5",
  complete: "border-verified/35 bg-verified/10",
} as const;

function bandGuidance(band: Band): string {
  if (band === "g3_5") {
    return "Build the list from people your family already knows, such as neighbors, teammates' families, or family friends.";
  }
  if (band === "g9_12") {
    return "Include at least five prospects beyond your immediate circle and explain why every prospect might buy.";
  }
  return "Include at least three prospects beyond your family's immediate circle.";
}

function prospectPlaceholder(index: number): string {
  const examples = [
    "Maya's household",
    "Coach Lee",
    "The family next door",
    "A parent from robotics club",
  ];
  return examples[index % examples.length];
}

export function TenListBuilderTool({
  band,
  fields,
  onFieldChange,
  onTaskComplete,
}: {
  band: Band;
  fields: TenListFields;
  onFieldChange: (key: string, value: string) => void;
  onTaskComplete?: () => void;
}) {
  const completionSentRef = useRef(false);
  const evidence = tenListEvidence(fields);
  const assessment = assessTenList(band, fields);
  const requiredOutside = requiredOutsideCount(band);
  const outsideCount = evidence.prospects.filter((prospect) => prospect.outside).length;
  const namedCount = evidence.prospects.filter((prospect) => prospect.name).length;
  const readyRows = evidence.prospects.filter(
    (prospect) =>
      prospect.name &&
      prospect.channel &&
      !containsPrivateContactInfo(prospect.name) &&
      (band !== "g9_12" || (
        prospect.reason && !containsPrivateContactInfo(prospect.reason)
      )),
  ).length;

  useEffect(() => {
    if (!assessment.complete || completionSentRef.current) return;
    completionSentRef.current = true;
    onTaskComplete?.();
  }, [assessment.complete, onTaskComplete]);

  const changeEvidence = (key: string, value: string) => {
    onFieldChange(key, value);
    onFieldChange(TEN_LIST_FIELD_KEYS.confirmed, "");
    onFieldChange(TEN_LIST_FIELD_KEYS.summary, "");
  };

  const saveList = () => {
    if (!assessment.readyToSave) return;
    onFieldChange(TEN_LIST_FIELD_KEYS.summary, buildTenListSummary(band, fields));
    onFieldChange(TEN_LIST_FIELD_KEYS.confirmed, "true");
    if (!completionSentRef.current) {
      completionSentRef.current = true;
      onTaskComplete?.();
    }
  };

  const prospectsDone = namedCount === TEN_LIST_SIZE && assessment.stage !== "needs-privacy";
  const channelsDone = readyRows === TEN_LIST_SIZE && (
    band === "g3_5" || outsideCount >= requiredOutside
  );
  const parentDone = evidence.parentApproved && (
    band !== "g3_5" || evidence.knownCircleConfirmed
  );

  return (
    <div aria-labelledby="fp-ten-list-title" className="pb-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sell">Name them · plan safely · ask</p>
          <h3 id="fp-ten-list-title" className="mt-1 font-display text-[24px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">Ten-List Builder</h3>
          <p className="mt-1.5 max-w-[620px] text-[13.5px] leading-[1.55] text-[hsl(25_20%_38%)]">Choose ten real, non-family prospects and decide how you can safely reach each one.</p>
        </div>

        <div aria-label="Ten-List Builder progress" className="grid shrink-0 grid-cols-3 gap-1.5 rounded-[14px] border-2 border-build/20 bg-build/5 p-2.5 shadow-card">
          {[
            ["1", "Prospects", prospectsDone],
            ["2", "Channels", channelsDone],
            ["3", "Parent", parentDone],
          ].map(([number, label, done]) => (
            <div key={String(number)} className="min-w-[58px] text-center">
              <span className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full border-2 font-display text-xs font-black ${done ? "border-verified bg-verified text-white" : "border-[hsl(25_34%_20%/0.14)] bg-white text-[hsl(25_20%_38%)]"}`}>
                {done ? <Check size={15} strokeWidth={3} aria-hidden /> : number}
              </span>
              <span className="mt-1 block font-mono text-[8px] font-semibold uppercase tracking-[0.03em] text-[hsl(25_20%_38%)]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex items-start gap-2.5 rounded-[12px] border-2 border-build/20 bg-build/5 px-3.5 py-3">
          <LockKeyhole size={18} className="mt-0.5 shrink-0 text-build" aria-hidden />
          <p className="text-[12px] leading-[1.5] text-[hsl(25_20%_38%)]"><strong className="text-[hsl(25_34%_20%)]">Keep contact details private.</strong> Use a first name, household label, or role only. Do not enter last names, phone numbers, email addresses, street addresses, or links.</p>
        </div>
        <div className="flex min-h-[50px] items-center justify-center gap-2 rounded-[12px] border-2 border-sell/25 bg-sell/5 px-4">
          <ListChecks size={18} className="text-sell" aria-hidden />
          <span className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]"><span className="text-sell">{readyRows}</span> / {TEN_LIST_SIZE} ready</span>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-[12px] border-2 border-scale/25 bg-scale/10 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <Users size={18} className="mt-0.5 shrink-0 text-scale" aria-hidden />
          <p className="text-[12px] leading-[1.5] text-[hsl(25_20%_38%)]"><strong className="text-[hsl(25_34%_20%)]">Your list challenge:</strong> {bandGuidance(band)}</p>
        </div>
        {band !== "g3_5" ? (
          <span className={`shrink-0 rounded-full px-3 py-1.5 font-mono text-[10px] font-bold ${outsideCount >= requiredOutside ? "bg-verified text-white" : "bg-white text-scale"}`}>
            Outside circle {outsideCount} / {requiredOutside}
          </span>
        ) : null}
      </div>

      <section className="mt-4" aria-labelledby="fp-ten-list-prospects">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-build">Steps 1 and 2 · Build the list</p>
            <h4 id="fp-ten-list-prospects" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">Who could you safely ask?</h4>
          </div>
          <p className="hidden text-right font-mono text-[9px] font-semibold uppercase text-[hsl(25_20%_38%)] sm:block">First name or household only</p>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {evidence.prospects.map((prospect, index) => {
            const nameKey = tenListRowFieldKey(index, "name");
            const channelKey = tenListRowFieldKey(index, "channel");
            const outsideKey = tenListRowFieldKey(index, "outside");
            const reasonKey = tenListRowFieldKey(index, "reason");
            const hasPrivacyIssue = containsPrivateContactInfo(prospect.name) || containsPrivateContactInfo(prospect.reason);
            const rowReady = Boolean(
              prospect.name &&
              prospect.channel &&
              !hasPrivacyIssue &&
              (band !== "g9_12" || prospect.reason),
            );
            return (
              <article key={index} className={`rounded-[14px] border-2 bg-white p-3.5 shadow-card ${hasPrivacyIssue ? "border-scale/50" : rowReady ? "border-verified/35" : "border-[hsl(25_34%_20%/0.14)]"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-[13px] font-black ${rowReady ? "bg-verified text-white" : "bg-build/10 text-build"}`} aria-hidden>
                      {rowReady ? <Check size={15} strokeWidth={3} /> : index + 1}
                    </span>
                    <h5 className="font-display text-[14px] font-black text-[hsl(25_34%_20%)]">Prospect {index + 1}</h5>
                  </div>
                  {hasPrivacyIssue ? <span className="font-mono text-[8.5px] font-bold uppercase text-scale">Remove contact info</span> : null}
                </div>

                <label htmlFor={`fp-ten-list-name-${index}`} className="mt-3 block text-[11.5px] font-bold text-[hsl(25_34%_20%)]">Prospect {index + 1} name or household</label>
                <input
                  id={`fp-ten-list-name-${index}`}
                  type="text"
                  maxLength={80}
                  value={fields[nameKey] ?? ""}
                  onChange={(event) => changeEvidence(nameKey, event.target.value)}
                  placeholder={prospectPlaceholder(index)}
                  aria-invalid={hasPrivacyIssue || undefined}
                  className={`mt-1.5 min-h-[44px] w-full rounded-[10px] border-2 bg-[hsl(40_30%_99%)] px-3 text-[12.5px] outline-none focus:ring-2 ${hasPrivacyIssue ? "border-scale focus:border-scale focus:ring-scale/15" : "border-[hsl(25_34%_20%/0.14)] focus:border-build focus:ring-build/15"}`}
                />

                <label htmlFor={`fp-ten-list-channel-${index}`} className="mt-2.5 block text-[11.5px] font-bold text-[hsl(25_34%_20%)]">Safe way to reach prospect {index + 1}</label>
                <select
                  id={`fp-ten-list-channel-${index}`}
                  value={fields[channelKey] ?? ""}
                  onChange={(event) => changeEvidence(channelKey, event.target.value)}
                  className="mt-1.5 min-h-[44px] w-full rounded-[10px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white px-3 text-[12px] font-semibold text-[hsl(25_34%_20%)] outline-none focus:border-build focus:ring-2 focus:ring-build/15"
                >
                  <option value="">Choose a safe channel</option>
                  {TEN_LIST_CHANNELS.map((channel) => <option key={channel.value} value={channel.value}>{channel.label}</option>)}
                </select>

                {band !== "g3_5" ? (
                  <label className="mt-2.5 flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-[10px] border-2 border-scale/20 bg-scale/5 px-3 py-2">
                    <input type="checkbox" checked={prospect.outside} onChange={(event) => changeEvidence(outsideKey, event.target.checked ? "true" : "")} className="h-5 w-5 shrink-0 accent-[hsl(35_72%_46%)]" />
                    <span className="text-[11.5px] font-semibold leading-[1.35] text-[hsl(25_34%_20%)]">Outside my family's immediate circle</span>
                  </label>
                ) : null}

                {band === "g9_12" ? (
                  <label htmlFor={`fp-ten-list-reason-${index}`} className="mt-2.5 block text-[11.5px] font-bold text-[hsl(25_34%_20%)]">
                    Why might prospect {index + 1} buy?
                    <textarea
                      id={`fp-ten-list-reason-${index}`}
                      rows={2}
                      maxLength={180}
                      value={fields[reasonKey] ?? ""}
                      onChange={(event) => changeEvidence(reasonKey, event.target.value)}
                      placeholder="They host a weekly game night"
                      className="mt-1.5 min-h-[64px] w-full resize-y rounded-[10px] border-2 border-[hsl(25_34%_20%/0.14)] bg-[hsl(40_30%_99%)] px-3 py-2.5 text-[12px] font-normal leading-[1.4] outline-none focus:border-sell focus:ring-2 focus:ring-sell/15"
                    />
                  </label>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-4 rounded-[14px] border-2 border-verified/25 bg-verified/5 p-4" aria-labelledby="fp-ten-list-parent-check">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-verified/15 text-verified" aria-hidden><ShieldCheck size={21} /></span>
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-verified">Step 3 · Parent safety check</p>
            <h4 id="fp-ten-list-parent-check" className="mt-0.5 font-display text-[18px] font-black text-[hsl(25_34%_20%)]">Review before anyone is contacted</h4>
            <p className="mt-1 text-[11.5px] leading-[1.45] text-[hsl(25_20%_38%)]">This tool makes a plan. A parent decides whether, when, and how each person can be asked.</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5">
          {band === "g3_5" ? (
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[10px] border-2 border-verified/25 bg-white px-3.5 py-3">
              <input type="checkbox" checked={evidence.knownCircleConfirmed} onChange={(event) => changeEvidence(TEN_LIST_FIELD_KEYS.knownCircleConfirmed, event.target.checked ? "true" : "")} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(150_52%_36%)]" />
              <span className="text-[12px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">A parent confirms that all ten prospects are non-family people in our known circle.</span>
            </label>
          ) : null}
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[10px] border-2 border-verified/25 bg-white px-3.5 py-3">
            <input type="checkbox" checked={evidence.parentApproved} onChange={(event) => changeEvidence(TEN_LIST_FIELD_KEYS.parentApproved, event.target.checked ? "true" : "")} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(150_52%_36%)]" />
            <span className="text-[12px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">A parent reviewed all ten prospects and approved the safe outreach plan.</span>
          </label>
        </div>
      </section>

      <section role="status" aria-label="Ten-List Builder status" className={`mt-4 rounded-[14px] border-2 p-3.5 ${STATUS_CLASS[assessment.stage]}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${assessment.complete ? "bg-verified text-white" : assessment.stage === "needs-privacy" || assessment.stage === "needs-band-mix" ? "bg-scale text-white" : "bg-[hsl(25_34%_20%/0.08)] text-[hsl(25_20%_38%)]"}`} aria-hidden>
              {assessment.complete ? <Sparkles size={17} /> : assessment.stage === "needs-privacy" ? <CircleAlert size={16} /> : assessment.stage === "needs-channels" ? <Route size={16} /> : <UserRoundPlus size={16} />}
            </span>
            <div>
              <p className="font-display text-[15px] font-black text-[hsl(25_34%_20%)]">{assessment.complete ? "Prospect list saved" : assessment.readyToSave ? "Ready for the Founder File" : "List check"}</p>
              <p className="mt-0.5 text-[12.5px] font-semibold leading-[1.45] text-[hsl(25_20%_38%)]">{assessment.message}</p>
            </div>
          </div>

          {assessment.complete ? (
            <div className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-verified px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)]">
              <Check size={16} strokeWidth={3} aria-hidden /> List complete
            </div>
          ) : (
            <button type="button" onClick={saveList} disabled={!assessment.readyToSave} className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-sell px-4 font-display text-[13px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none">
              <Save size={16} aria-hidden /> Save ten-list
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
