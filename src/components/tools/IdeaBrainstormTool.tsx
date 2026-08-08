import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDollarSign,
  FlaskConical,
  HandHeart,
  Lightbulb,
  MonitorDown,
  Package,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";
import {
  AUDIENCES,
  BUSINESS_TYPES,
  CUSTOMIZATIONS,
  IDEA_BRAINSTORM_FIELD_KEYS,
  MONEY_IDEA_RUBRIC,
  assessMoneyIdea,
  generateStartingIdeas,
  interestsFrom,
  missingBrainstormInputs,
  parseRubricScores,
  parseStartingIdeas,
  type BrainstormInputs,
  type MoneyIdeaTone,
  type RubricKey,
  type StartingIdea,
} from "../../lib/ideaBrainstorm";
import { requestAiStartingIdeas } from "../../lib/brainstormApi";
import { ToolFlowProgress } from "./ToolFlowProgress";

type BrainstormFields = Record<string, string | undefined>;

const FLOW_STEPS = ["Your sparks", "Business shape", "Buyer + twist", "Browse ideas", "Test + choose"] as const;

const BUSINESS_ICON = {
  physical: Package,
  digital: MonitorDown,
  service: HandHeart,
} as const;

const SCORE_CLASS: Record<MoneyIdeaTone, string> = {
  unscored: "border-[hsl(25_34%_20%/0.15)] bg-white text-[hsl(25_20%_38%)]",
  hobby: "border-scale/35 bg-scale/10 text-[hsl(35_72%_30%)]",
  building: "border-sell/30 bg-sell/5 text-[hsl(14_78%_38%)]",
  promising: "border-build/30 bg-build/5 text-build",
  strong: "border-verified/35 bg-verified/10 text-[hsl(150_52%_27%)]",
};

const INTEREST_FIELDS = [
  { key: IDEA_BRAINSTORM_FIELD_KEYS.boardGame, inputKey: "boardGame", label: "Favorite board game", placeholder: "Chess, Catan, Uno..." },
  { key: IDEA_BRAINSTORM_FIELD_KEYS.animal, inputKey: "animal", label: "An animal you love", placeholder: "Dogs, axolotls, horses..." },
  { key: IDEA_BRAINSTORM_FIELD_KEYS.sport, inputKey: "sport", label: "Favorite sport", placeholder: "Soccer, skating, tennis..." },
  { key: IDEA_BRAINSTORM_FIELD_KEYS.activity, inputKey: "activity", label: "Activity you love doing", placeholder: "Drawing, baking, coding..." },
] as const;

function currentInputs(fields: BrainstormFields): BrainstormInputs {
  return {
    boardGame: fields[IDEA_BRAINSTORM_FIELD_KEYS.boardGame] ?? "",
    animal: fields[IDEA_BRAINSTORM_FIELD_KEYS.animal] ?? "",
    sport: fields[IDEA_BRAINSTORM_FIELD_KEYS.sport] ?? "",
    activity: fields[IDEA_BRAINSTORM_FIELD_KEYS.activity] ?? "",
    businessType: fields[IDEA_BRAINSTORM_FIELD_KEYS.businessType] ?? "",
    audience: fields[IDEA_BRAINSTORM_FIELD_KEYS.audience] ?? "",
    customization: fields[IDEA_BRAINSTORM_FIELD_KEYS.customization] ?? "",
    customTwist: fields[IDEA_BRAINSTORM_FIELD_KEYS.customTwist] ?? "",
  };
}

function IdeaScore({ idea, checked }: { idea: StartingIdea; checked: RubricKey[] | undefined }) {
  const assessment = assessMoneyIdea(checked);
  return (
    <span
      aria-label={`${idea.name}: ${assessment.label}, ${assessment.score} of 5`}
      className={`inline-flex min-h-[28px] items-center rounded-full border px-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.04em] ${SCORE_CLASS[assessment.tone]}`}
    >
      {checked ? `${assessment.score}/5 · ${assessment.label}` : assessment.label}
    </span>
  );
}

function FlowButtons({
  back,
  backLabel = "Back",
  next,
  nextLabel,
  nextDisabled = false,
}: {
  back?: () => void;
  backLabel?: string;
  next?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      {back ? (
        <button type="button" onClick={back} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 font-display text-[13px] font-bold text-[hsl(25_20%_38%)] hover:bg-[hsl(25_34%_20%/0.06)]">
          <ArrowLeft size={16} aria-hidden /> {backLabel}
        </button>
      ) : <span />}
      {next && nextLabel ? (
        <button type="button" disabled={nextDisabled} onClick={next} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-verified px-5 font-display text-[15px] font-bold text-white shadow-[0_4px_0_hsl(150_52%_26%)] enabled:active:translate-y-px enabled:active:shadow-[0_2px_0_hsl(150_52%_26%)] disabled:cursor-not-allowed disabled:opacity-45">
          {nextLabel} <ArrowRight size={17} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function IdeaBrainstormTool({
  fields,
  onFieldChange,
  ideaRequester = requestAiStartingIdeas,
}: {
  fields: BrainstormFields;
  onFieldChange: (key: string, value: string) => void;
  ideaRequester?: (inputs: BrainstormInputs, round: number) => Promise<StartingIdea[]>;
}) {
  const inputs = currentInputs(fields);
  const missing = missingBrainstormInputs(inputs);
  const ideas = parseStartingIdeas(fields[IDEA_BRAINSTORM_FIELD_KEYS.ideas]);
  const rubricScores = parseRubricScores(fields[IDEA_BRAINSTORM_FIELD_KEYS.rubric]);
  const selectedIdeaId = fields[IDEA_BRAINSTORM_FIELD_KEYS.selectedIdea] ?? "";
  const savedRound = Number.parseInt(fields[IDEA_BRAINSTORM_FIELD_KEYS.round] ?? "0", 10) || 0;
  const ideaSource = fields[IDEA_BRAINSTORM_FIELD_KEYS.ideaSource] ?? "";
  const [stage, setStage] = useState(() => ideas.length > 0 ? 3 : 0);
  const [activeIdeaId, setActiveIdeaId] = useState(selectedIdeaId || ideas[0]?.id || "");
  const [savedMessage, setSavedMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (ideas.length === 0) {
      setActiveIdeaId("");
      return;
    }
    if (!ideas.some((idea) => idea.id === activeIdeaId)) {
      setActiveIdeaId(selectedIdeaId || ideas[0].id);
    }
  }, [activeIdeaId, ideas, selectedIdeaId]);

  const activeIdeaIndex = Math.max(0, ideas.findIndex((idea) => idea.id === activeIdeaId));
  const activeIdea = ideas[activeIdeaIndex];
  const interestCount = interestsFrom(inputs).length;

  const setField = (key: string, value: string) => {
    if (isGenerating) return;
    onFieldChange(key, value);
    setSavedMessage("");
  };

  const generateIdeas = async () => {
    if (missing.length > 0 || isGenerating) return;
    const nextRound = savedRound + 1;
    setIsGenerating(true);
    try {
      let source = "ai";
      let generated: StartingIdea[];
      try {
        generated = await ideaRequester(inputs, nextRound);
      } catch {
        source = "fallback";
        generated = generateStartingIdeas(inputs, nextRound);
      }
      if (generated.length !== 5) return;
      onFieldChange(IDEA_BRAINSTORM_FIELD_KEYS.ideas, JSON.stringify(generated));
      onFieldChange(IDEA_BRAINSTORM_FIELD_KEYS.ideaSource, source);
      onFieldChange(IDEA_BRAINSTORM_FIELD_KEYS.rubric, "{}");
      onFieldChange(IDEA_BRAINSTORM_FIELD_KEYS.round, String(nextRound));
      onFieldChange(IDEA_BRAINSTORM_FIELD_KEYS.selectedIdea, "");
      setActiveIdeaId(generated[0].id);
      setSavedMessage("");
      setStage(3);
    } finally {
      setIsGenerating(false);
    }
  };

  const chooseIdea = (idea: StartingIdea) => {
    onFieldChange("productName", idea.name);
    onFieldChange("oneLiner", idea.oneLiner);
    onFieldChange(IDEA_BRAINSTORM_FIELD_KEYS.selectedIdea, idea.id);
    setActiveIdeaId(idea.id);
    setSavedMessage(`${idea.name} is now your product and one-liner.`);
  };

  const toggleRubric = (ideaId: string, key: RubricKey) => {
    const current = rubricScores[ideaId] ?? [];
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    onFieldChange(IDEA_BRAINSTORM_FIELD_KEYS.rubric, JSON.stringify({ ...rubricScores, [ideaId]: next }));
  };

  const moveIdea = (direction: -1 | 1) => {
    if (ideas.length === 0) return;
    const nextIndex = (activeIdeaIndex + direction + ideas.length) % ideas.length;
    setActiveIdeaId(ideas[nextIndex].id);
    setSavedMessage("");
  };

  return (
    <div aria-labelledby="fp-idea-lab-title" aria-busy={isGenerating} className="pb-2">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-scale/15 text-[hsl(35_72%_34%)]">
            <Lightbulb size={22} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[hsl(35_72%_34%)]">Mix · make · test</p>
            <h3 id="fp-idea-lab-title" className="mt-1 font-display text-[24px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">Business Idea Spark Lab</h3>
            <p className="mt-1.5 max-w-[650px] text-[13.5px] leading-[1.55] text-[hsl(25_20%_38%)]">Build one useful ingredient at a time. The lab will mix them into five starting ideas, but you keep the final say.</p>
          </div>
        </div>
        <div className="w-full rounded-[13px] border-2 border-[hsl(25_34%_20%/0.12)] bg-white p-3 shadow-card sm:max-w-[320px]">
          <ToolFlowProgress current={stage + 1} steps={FLOW_STEPS} />
        </div>
      </header>

      {stage === 0 ? (
        <>
          <section className="mt-4 rounded-[16px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card sm:p-5">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-build">Start with you</p>
            <h4 className="mt-1 font-display text-[22px] font-black text-[hsl(25_34%_20%)]">What gives you ideas?</h4>
            <p className="mt-1 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">Add one thing you genuinely like. Add more only if they come easily.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {INTEREST_FIELDS.map((item) => (
                <label key={item.key} className="min-w-0 text-[12px] font-bold text-[hsl(25_34%_20%)]">
                  {item.label}
                  <input type="text" disabled={isGenerating} maxLength={80} value={inputs[item.inputKey]} onChange={(event) => setField(item.key, event.target.value)} placeholder={item.placeholder} className="mt-1.5 min-h-[48px] w-full rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_30%_99%)] px-3.5 text-sm font-normal text-[hsl(25_34%_20%)] outline-none placeholder:text-[hsl(25_20%_38%/0.5)] focus:border-build focus:ring-2 focus:ring-build/15" />
                </label>
              ))}
            </div>
            <p role="status" className="mt-3 text-[12px] font-semibold text-[hsl(25_20%_38%)]">{interestCount === 0 ? "One spark is enough to continue." : `${interestCount} ${interestCount === 1 ? "spark" : "sparks"} ready.`}</p>
          </section>
          <FlowButtons next={() => setStage(1)} nextLabel="Choose a business shape" nextDisabled={interestCount === 0} />
        </>
      ) : null}

      {stage === 1 ? (
        <>
          <section className="mt-4 rounded-[16px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card sm:p-5">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-sell">Give it a shape</p>
            <h4 className="mt-1 font-display text-[22px] font-black text-[hsl(25_34%_20%)]">What kind of business sounds fun to try?</h4>
            <p className="mt-1 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">There is no perfect choice. Pick one for this batch and remix later if you want.</p>
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {BUSINESS_TYPES.map((option) => {
                const Icon = BUSINESS_ICON[option.key];
                const selected = inputs.businessType === option.key;
                return (
                  <button key={option.key} type="button" disabled={isGenerating} aria-pressed={selected} onClick={() => setField(IDEA_BRAINSTORM_FIELD_KEYS.businessType, option.key)} className={`min-h-[96px] rounded-[14px] border-2 p-3 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-sell/25 ${selected ? "border-sell bg-sell/5 shadow-[0_3px_0_hsl(14_78%_42%)]" : "border-[hsl(25_34%_20%/0.14)] bg-[hsl(40_30%_99%)] hover:border-sell/45"}`}>
                    <span className="flex items-center gap-2 font-display text-[15px] font-black text-[hsl(25_34%_20%)]"><Icon size={17} aria-hidden className={selected ? "text-sell" : "text-[hsl(25_20%_38%)]"} />{option.label}{selected ? <Check size={15} aria-hidden className="ml-auto text-sell" /> : null}</span>
                    <span className="mt-1 block text-[11.5px] font-normal leading-[1.4] text-[hsl(25_20%_38%)]">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </section>
          <FlowButtons back={() => setStage(0)} next={() => setStage(2)} nextLabel="Name the buyer" nextDisabled={!inputs.businessType} />
        </>
      ) : null}

      {stage === 2 ? (
        <>
          <section className="mt-4 rounded-[16px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card sm:p-5">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[hsl(265_52%_48%)]">Make it specific</p>
            <h4 className="mt-1 font-display text-[22px] font-black text-[hsl(25_34%_20%)]">Who is it for, and what makes it theirs?</h4>
            <p className="mt-1 text-[12.5px] leading-[1.5] text-[hsl(25_20%_38%)]">A real kind of buyer and one special twist give the ideas something to hold onto.</p>
            <label className="mt-4 block text-[12px] font-bold text-[hsl(25_34%_20%)]">Who might buy it?
              <select disabled={isGenerating} value={inputs.audience} onChange={(event) => setField(IDEA_BRAINSTORM_FIELD_KEYS.audience, event.target.value)} className="mt-1.5 min-h-[48px] w-full rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_30%_99%)] px-3.5 text-sm font-normal text-[hsl(25_34%_20%)] outline-none focus:border-[hsl(265_52%_58%)] focus:ring-2 focus:ring-[hsl(265_52%_58%/0.15)]">
                <option value="">Choose a possible buyer</option>
                {AUDIENCES.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </label>
            <fieldset className="mt-4">
              <legend className="text-[12px] font-bold text-[hsl(25_34%_20%)]">Choose a custom twist</legend>
              <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CUSTOMIZATIONS.map((option) => {
                  const selected = inputs.customization === option.key && !inputs.customTwist.trim();
                  return <button key={option.key} type="button" disabled={isGenerating} aria-pressed={selected} onClick={() => { setField(IDEA_BRAINSTORM_FIELD_KEYS.customization, option.key); onFieldChange(IDEA_BRAINSTORM_FIELD_KEYS.customTwist, ""); }} className={`min-h-[52px] rounded-xl border-2 px-2.5 py-2 text-left text-[11.5px] font-bold leading-[1.25] transition ${selected ? "border-[hsl(265_52%_58%)] bg-[hsl(265_52%_58%/0.08)] text-[hsl(265_52%_38%)]" : "border-[hsl(25_34%_20%/0.13)] bg-[hsl(40_30%_99%)] text-[hsl(25_34%_20%)]"}`}>{option.label}</button>;
                })}
              </div>
            </fieldset>
            <label className="mt-3 block text-[12px] font-bold text-[hsl(25_34%_20%)]">Or type your own custom twist
              <input type="text" disabled={isGenerating} maxLength={120} value={inputs.customTwist} onChange={(event) => setField(IDEA_BRAINSTORM_FIELD_KEYS.customTwist, event.target.value)} placeholder="Custom chess pieces, neighborhood histories, a team edition..." className="mt-1.5 min-h-[48px] w-full rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_30%_99%)] px-3.5 text-sm font-normal text-[hsl(25_34%_20%)] outline-none placeholder:text-[hsl(25_20%_38%/0.5)] focus:border-[hsl(265_52%_58%)] focus:ring-2 focus:ring-[hsl(265_52%_58%/0.15)]" />
            </label>
          </section>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => setStage(1)} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 font-display text-[13px] font-bold text-[hsl(25_20%_38%)] hover:bg-[hsl(25_34%_20%/0.06)]"><ArrowLeft size={16} aria-hidden /> Back</button>
            <div className="sm:text-right">
              <button type="button" disabled={missing.length > 0 || isGenerating} onClick={() => void generateIdeas()} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-verified px-5 font-display text-[15px] font-bold text-white shadow-[0_4px_0_hsl(150_52%_26%)] enabled:active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto">{isGenerating ? <RefreshCw size={17} aria-hidden className="animate-spin" /> : <Sparkles size={17} aria-hidden />}{isGenerating ? "Mixing 5 ideas..." : "Generate 5 ideas"}</button>
              <p role="status" className="mt-2 text-[11.5px] font-semibold text-[hsl(25_20%_38%)]">{missing.length > 0 ? `Add ${missing.join(" and ")} to mix the batch.` : "Everything is ready for the mixer."}</p>
            </div>
          </div>
        </>
      ) : null}

      {stage === 3 && activeIdea ? (
        <>
          <section aria-labelledby="fp-starting-ideas-title" className="mt-4 rounded-[16px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-4 shadow-card sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-build">Idea {activeIdeaIndex + 1} of {ideas.length}</p><h4 id="fp-starting-ideas-title" className="mt-1 font-display text-[22px] font-black text-[hsl(25_34%_20%)]">Meet your five starting ideas</h4></div>
              <IdeaScore idea={activeIdea} checked={rubricScores[activeIdea.id]} />
            </div>
            <article className="mt-4 rounded-[15px] border-2 border-build/25 bg-build/5 p-4 sm:p-5">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-build">{BUSINESS_TYPES.find((option) => option.key === activeIdea.businessType)?.label}</p>
              <h5 className="mt-1.5 font-display text-[25px] font-black leading-[1.15] text-[hsl(25_34%_20%)]">{activeIdea.name}</h5>
              <p className="mt-2 text-[15px] font-semibold leading-[1.5] text-[hsl(25_34%_20%)]">{activeIdea.oneLiner}</p>
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-3"><p className="font-mono text-[8.5px] font-bold uppercase text-[hsl(25_20%_38%)]">Why it may sell</p><p className="mt-1 text-[12px] leading-[1.45] text-[hsl(25_20%_38%)]">{activeIdea.whyItMaySell}</p></div>
                <div className="rounded-xl bg-white p-3"><p className="font-mono text-[8.5px] font-bold uppercase text-[hsl(25_20%_38%)]">First tiny test</p><p className="mt-1 text-[12px] leading-[1.45] text-[hsl(25_20%_38%)]">{activeIdea.firstTest}</p></div>
              </div>
            </article>
            <div className="mt-3 flex items-center justify-between gap-3">
              <button type="button" aria-label="Previous idea" onClick={() => moveIdea(-1)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.14)] text-[hsl(25_34%_20%)]"><ArrowLeft size={17} aria-hidden /></button>
              <div className="flex" aria-label={`Showing idea ${activeIdeaIndex + 1} of ${ideas.length}`}>{ideas.map((idea, index) => <button key={idea.id} type="button" aria-label={`Show idea ${index + 1}`} aria-current={idea.id === activeIdea.id ? "true" : undefined} onClick={() => setActiveIdeaId(idea.id)} className="flex h-11 w-8 items-center justify-center rounded-lg"><span className={`h-3 w-3 rounded-full ${idea.id === activeIdea.id ? "bg-build" : "bg-[hsl(25_34%_20%/0.17)]"}`} /></button>)}</div>
              <button type="button" aria-label="Next idea" onClick={() => moveIdea(1)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[hsl(25_34%_20%/0.14)] text-[hsl(25_34%_20%)]"><ArrowRight size={17} aria-hidden /></button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setStage(4)} className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl border-2 border-build/30 bg-build/5 px-4 font-display text-[14px] font-bold text-build"><FlaskConical size={17} aria-hidden /> Test this idea</button>
              <button type="button" onClick={() => chooseIdea(activeIdea)} className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-verified px-4 font-display text-[14px] font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)]"><Check size={17} aria-hidden /> Use this idea</button>
            </div>
            {savedMessage ? <div role="status" className="mt-3 rounded-xl border-2 border-verified/30 bg-verified/10 px-3.5 py-3 text-[12.5px] font-semibold text-[hsl(150_52%_25%)]">{savedMessage} You can still compare or test the others.</div> : null}
            <p className="mt-3 text-center text-[11.5px] leading-[1.4] text-[hsl(25_20%_38%)]">{ideaSource === "ai" ? "AI made these starting points. Real customers decide whether one is worth paying for." : "These backup ideas work without AI. Remix whenever you want another batch."}</p>
          </section>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => setStage(2)} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 font-display text-[13px] font-bold text-[hsl(25_20%_38%)]"><ArrowLeft size={16} aria-hidden /> Change the mix</button><button type="button" disabled={isGenerating} onClick={() => void generateIdeas()} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border-2 border-sell/25 bg-white px-4 font-display text-[13px] font-bold text-sell"><RefreshCw size={16} aria-hidden /> {isGenerating ? "Mixing..." : "Remix 5 ideas"}</button></div>
        </>
      ) : null}

      {stage === 4 && activeIdea ? (
        <>
          <section aria-label={`Money-making rubric for ${activeIdea.name}`} className="mt-4 rounded-[16px] border-2 border-build/25 bg-build/5 p-4 shadow-card sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-build"><CircleDollarSign size={15} aria-hidden /> Hobby or money-making idea?</p><h4 className="mt-1 font-display text-[22px] font-black text-[hsl(25_34%_20%)]">Test {activeIdea.name}</h4><p className="mt-1 text-[12.5px] text-[hsl(25_20%_38%)]">Check what is honestly true today. Unchecked boxes are clues, not mistakes.</p></div>
              <div className="flex items-center gap-2 text-[11px] font-bold text-[hsl(25_20%_38%)]"><Users size={16} aria-hidden className="text-build" /> Real customers are the final test</div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MONEY_IDEA_RUBRIC.map((item) => {
                const checked = rubricScores[activeIdea.id]?.includes(item.key) ?? false;
                return <label key={item.key} className={`flex min-h-[62px] cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-2.5 ${checked ? "border-build bg-white" : "border-build/15 bg-white/70"}`}><input type="checkbox" checked={checked} onChange={() => toggleRubric(activeIdea.id, item.key)} className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(217_74%_56%)]" /><span className="min-w-0"><span className="block text-[12.5px] font-bold text-[hsl(25_34%_20%)]">{item.label}</span><span className="mt-0.5 block text-[11.5px] font-normal leading-[1.35] text-[hsl(25_20%_38%)]">{item.question}</span></span></label>;
              })}
            </div>
            {(() => {
              const assessment = assessMoneyIdea(rubricScores[activeIdea.id]);
              return <div role="status" className={`mt-3 rounded-xl border-2 px-3.5 py-3 ${SCORE_CLASS[assessment.tone]}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-display text-[17px] font-black">{assessment.label}</p><p className="font-mono text-[10px] font-bold uppercase tracking-[0.06em]">{assessment.score} of 5 checks</p></div><p className="mt-1 text-[12px] font-semibold leading-[1.45]">{assessment.message}</p></div>;
            })()}
            <button type="button" onClick={() => chooseIdea(activeIdea)} className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-verified px-5 font-display text-[15px] font-bold text-white shadow-[0_4px_0_hsl(150_52%_26%)]"><Check size={17} aria-hidden /> Use this idea</button>
            {savedMessage ? <div role="status" className="mt-3 rounded-xl border-2 border-verified/30 bg-verified/10 px-3.5 py-3 text-[12.5px] font-semibold text-[hsl(150_52%_25%)]">{savedMessage} You can adjust both in Inputs.</div> : null}
          </section>
          <FlowButtons back={() => setStage(3)} backLabel="Compare the five ideas" />
        </>
      ) : null}
    </div>
  );
}
