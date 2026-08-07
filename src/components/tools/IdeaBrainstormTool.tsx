import { useEffect, useState } from "react";
import {
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
  missingBrainstormInputs,
  parseRubricScores,
  parseStartingIdeas,
  type BrainstormInputs,
  type MoneyIdeaTone,
  type RubricKey,
  type StartingIdea,
} from "../../lib/ideaBrainstorm";
import { requestAiStartingIdeas } from "../../lib/brainstormApi";

type BrainstormFields = Record<string, string | undefined>;

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
  {
    key: IDEA_BRAINSTORM_FIELD_KEYS.boardGame,
    inputKey: "boardGame",
    label: "Favorite board game",
    placeholder: "Chess, Catan, Uno...",
  },
  {
    key: IDEA_BRAINSTORM_FIELD_KEYS.animal,
    inputKey: "animal",
    label: "An animal you love",
    placeholder: "Dogs, axolotls, horses...",
  },
  {
    key: IDEA_BRAINSTORM_FIELD_KEYS.sport,
    inputKey: "sport",
    label: "Favorite sport",
    placeholder: "Soccer, skating, tennis...",
  },
  {
    key: IDEA_BRAINSTORM_FIELD_KEYS.activity,
    inputKey: "activity",
    label: "Activity you love doing",
    placeholder: "Drawing, baking, coding...",
  },
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

  const activeIdea = ideas.find((idea) => idea.id === activeIdeaId) ?? ideas[0];

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
    const next = current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key];
    const updated = { ...rubricScores, [ideaId]: next };
    onFieldChange(IDEA_BRAINSTORM_FIELD_KEYS.rubric, JSON.stringify(updated));
  };

  return (
    <div aria-labelledby="fp-idea-lab-title" aria-busy={isGenerating} className="pb-2">
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-scale/15 text-[hsl(35_72%_34%)]">
          <Lightbulb size={22} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[hsl(35_72%_34%)]">
            Mix · make · test
          </p>
          <h3
            id="fp-idea-lab-title"
            className="mt-1 font-display text-[24px] font-black leading-[1.15] text-[hsl(25_34%_20%)]"
          >
            Business Idea Spark Lab
          </h3>
          <p className="mt-1.5 max-w-[700px] text-[13.5px] leading-[1.55] text-[hsl(25_20%_38%)]">
            Mix something you love with a possible buyer and a custom twist. You will get five starting ideas to compare.
          </p>
        </div>
      </header>

      <section className="mt-4 rounded-[16px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-3.5 shadow-card sm:p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-build font-mono text-[11px] font-bold text-white">
            1
          </span>
          <div>
            <h4 className="font-display text-[18px] font-black text-[hsl(25_34%_20%)]">Start with what you like</h4>
            <p className="text-[12px] text-[hsl(25_20%_38%)]">Fill in at least one. More sparks can create more variety.</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {INTEREST_FIELDS.map((item) => (
            <label key={item.key} className="min-w-0 text-[12px] font-bold text-[hsl(25_34%_20%)]">
              {item.label}
              <input
                type="text"
                disabled={isGenerating}
                maxLength={80}
                value={inputs[item.inputKey]}
                onChange={(event) => setField(item.key, event.target.value)}
                placeholder={item.placeholder}
                className="mt-1.5 min-h-[44px] w-full rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_30%_99%)] px-3.5 text-sm font-normal text-[hsl(25_34%_20%)] outline-none placeholder:text-[hsl(25_20%_38%/0.5)] focus:border-build focus:ring-2 focus:ring-build/15"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="mt-3 rounded-[16px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-3.5 shadow-card sm:p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sell font-mono text-[11px] font-bold text-white">
            2
          </span>
          <div>
            <h4 className="font-display text-[18px] font-black text-[hsl(25_34%_20%)]">Choose how the business works</h4>
            <p className="text-[12px] text-[hsl(25_20%_38%)]">Pick one type for this round.</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {BUSINESS_TYPES.map((option) => {
            const Icon = BUSINESS_ICON[option.key];
            const selected = inputs.businessType === option.key;
            return (
              <button
                key={option.key}
                type="button"
                disabled={isGenerating}
                aria-pressed={selected}
                onClick={() => setField(IDEA_BRAINSTORM_FIELD_KEYS.businessType, option.key)}
                className={`min-h-[84px] rounded-[14px] border-2 p-3 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-sell/25 ${
                  selected
                    ? "border-sell bg-sell/5 shadow-[0_3px_0_hsl(14_78%_42%)]"
                    : "border-[hsl(25_34%_20%/0.14)] bg-[hsl(40_30%_99%)] hover:border-sell/45"
                }`}
              >
                <span className="flex items-center gap-2 font-display text-[15px] font-black text-[hsl(25_34%_20%)]">
                  <Icon size={17} aria-hidden className={selected ? "text-sell" : "text-[hsl(25_20%_38%)]"} />
                  {option.label}
                  {selected ? <Check size={15} aria-hidden className="ml-auto text-sell" /> : null}
                </span>
                <span className="mt-1 block text-[11.5px] font-normal leading-[1.4] text-[hsl(25_20%_38%)]">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-3 rounded-[16px] border-2 border-[hsl(25_34%_20%/0.14)] bg-white p-3.5 shadow-card sm:p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[hsl(265_52%_58%)] font-mono text-[11px] font-bold text-white">
            3
          </span>
          <div>
            <h4 className="font-display text-[18px] font-black text-[hsl(25_34%_20%)]">Name a buyer and make it special</h4>
            <p className="text-[12px] text-[hsl(25_20%_38%)]">A specific buyer makes a business idea easier to test.</p>
          </div>
        </div>

        <label className="mt-3 block text-[12px] font-bold text-[hsl(25_34%_20%)]">
          Who might buy it?
          <select
            disabled={isGenerating}
            value={inputs.audience}
            onChange={(event) => setField(IDEA_BRAINSTORM_FIELD_KEYS.audience, event.target.value)}
            className="mt-1.5 min-h-[44px] w-full rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_30%_99%)] px-3.5 text-sm font-normal text-[hsl(25_34%_20%)] outline-none focus:border-[hsl(265_52%_58%)] focus:ring-2 focus:ring-[hsl(265_52%_58%/0.15)]"
          >
            <option value="">Choose a possible buyer</option>
            {AUDIENCES.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="mt-3">
          <legend className="text-[12px] font-bold text-[hsl(25_34%_20%)]">Choose a custom twist</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CUSTOMIZATIONS.map((option) => {
              const selected = inputs.customization === option.key && !inputs.customTwist.trim();
              return (
                <button
                  key={option.key}
                  type="button"
                  disabled={isGenerating}
                  aria-pressed={selected}
                  onClick={() => {
                    setField(IDEA_BRAINSTORM_FIELD_KEYS.customization, option.key);
                    onFieldChange(IDEA_BRAINSTORM_FIELD_KEYS.customTwist, "");
                  }}
                  className={`min-h-[48px] rounded-xl border-2 px-2.5 py-2 text-left text-[11.5px] font-bold leading-[1.25] transition ${
                    selected
                      ? "border-[hsl(265_52%_58%)] bg-[hsl(265_52%_58%/0.08)] text-[hsl(265_52%_38%)]"
                      : "border-[hsl(25_34%_20%/0.13)] bg-[hsl(40_30%_99%)] text-[hsl(25_34%_20%)]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-3 block text-[12px] font-bold text-[hsl(25_34%_20%)]">
          Or type your own custom twist
          <input
            type="text"
            disabled={isGenerating}
            maxLength={120}
            value={inputs.customTwist}
            onChange={(event) => setField(IDEA_BRAINSTORM_FIELD_KEYS.customTwist, event.target.value)}
            placeholder="Custom chess pieces, neighborhood histories, a team edition..."
            className="mt-1.5 min-h-[44px] w-full rounded-xl border-2 border-[hsl(25_34%_20%/0.15)] bg-[hsl(40_30%_99%)] px-3.5 text-sm font-normal text-[hsl(25_34%_20%)] outline-none placeholder:text-[hsl(25_20%_38%/0.5)] focus:border-[hsl(265_52%_58%)] focus:ring-2 focus:ring-[hsl(265_52%_58%/0.15)]"
          />
        </label>
      </section>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={missing.length > 0 || isGenerating}
          onClick={() => void generateIdeas()}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-sell px-5 font-display text-[15px] font-bold text-white shadow-[0_3px_0_hsl(14_78%_38%)] transition enabled:active:translate-y-px enabled:active:shadow-[0_1px_0_hsl(14_78%_38%)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isGenerating ? (
            <RefreshCw size={17} aria-hidden className="animate-spin" />
          ) : ideas.length > 0 ? (
            <RefreshCw size={17} aria-hidden />
          ) : (
            <Sparkles size={17} aria-hidden />
          )}
          {isGenerating ? "Mixing 5 ideas..." : ideas.length > 0 ? "Remix 5 ideas" : "Generate 5 ideas"}
        </button>
        <p role="status" className="text-[12px] leading-[1.4] text-[hsl(25_20%_38%)]">
          {isGenerating
            ? "AI is mixing your interests, buyer, and custom twist."
            : missing.length > 0
            ? `Still needed: ${missing.join(", ")}.`
            : ideas.length > 0 && ideaSource === "ai"
              ? "AI made these starting points. Real customers decide whether one is worth paying for."
              : ideas.length > 0 && ideaSource === "fallback"
                ? "Backup ideas are shown because AI was unavailable. Remix to try AI again."
            : "Ready. These are starting points, not proof that customers will pay."}
        </p>
      </div>

      {ideas.length > 0 ? (
        <section aria-labelledby="fp-starting-ideas-title" className="mt-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-build">Your idea batch</p>
              <h4 id="fp-starting-ideas-title" className="mt-1 font-display text-[22px] font-black text-[hsl(25_34%_20%)]">
                Five starting ideas
              </h4>
            </div>
            <p className="text-[12px] text-[hsl(25_20%_38%)]">Score each one before you choose.</p>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ideas.map((idea, index) => {
              const isSelected = selectedIdeaId === idea.id;
              const typeLabel = BUSINESS_TYPES.find((option) => option.key === idea.businessType)?.label;
              return (
                <article
                  key={idea.id}
                  className={`flex min-w-0 flex-col rounded-[16px] border-2 bg-white p-3.5 shadow-card ${
                    isSelected ? "border-verified" : "border-[hsl(25_34%_20%/0.14)]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
                        Idea {index + 1} · {typeLabel}
                      </p>
                      <h5 className="mt-1 font-display text-[18px] font-black leading-[1.2] text-[hsl(25_34%_20%)]">
                        {idea.name}
                      </h5>
                    </div>
                    {isSelected ? (
                      <span className="rounded-full bg-verified/12 px-2.5 py-1 font-mono text-[9px] font-bold uppercase text-[hsl(150_52%_27%)]">
                        Chosen
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[13px] font-semibold leading-[1.45] text-[hsl(25_34%_20%)]">{idea.oneLiner}</p>
                  <div className="mt-3 space-y-2 text-[11.5px] leading-[1.4] text-[hsl(25_20%_38%)]">
                    <p>
                      <span className="font-bold text-[hsl(25_34%_20%)]">Why it may sell:</span> {idea.whyItMaySell}
                    </p>
                    <p>
                      <span className="font-bold text-[hsl(25_34%_20%)]">First test:</span> {idea.firstTest}
                    </p>
                  </div>
                  <div className="mt-auto pt-3">
                    <IdeaScore idea={idea} checked={rubricScores[idea.id]} />
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={() => setActiveIdeaId(idea.id)}
                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border-2 border-build/30 bg-build/5 px-3 font-display text-[12px] font-bold text-build"
                      >
                        <FlaskConical size={15} aria-hidden />
                        Score it
                      </button>
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={() => chooseIdea(idea)}
                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-verified px-3 font-display text-[12px] font-bold text-white shadow-[0_3px_0_hsl(150_52%_26%)]"
                      >
                        <Check size={15} aria-hidden />
                        Pick this idea
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {savedMessage ? (
            <div role="status" className="mt-3 rounded-xl border-2 border-verified/30 bg-verified/10 px-3.5 py-3 text-[12.5px] font-semibold text-[hsl(150_52%_25%)]">
              {savedMessage} You can adjust both in Inputs.
            </div>
          ) : null}

          {activeIdea ? (
            <section
              aria-label={`Money-making rubric for ${activeIdea.name}`}
              className="mt-4 rounded-[16px] border-2 border-build/25 bg-build/5 p-3.5 sm:p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-build">
                    <CircleDollarSign size={15} aria-hidden />
                    Hobby or money-making idea?
                  </p>
                  <h5 className="mt-1 font-display text-[20px] font-black text-[hsl(25_34%_20%)]">Score {activeIdea.name}</h5>
                  <p className="mt-1 text-[12px] text-[hsl(25_20%_38%)]">Check only what you can honestly say right now.</p>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-[hsl(25_20%_38%)]">
                  <Users size={16} aria-hidden className="text-build" />
                  Real customers are the final test
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {MONEY_IDEA_RUBRIC.map((item) => {
                  const checked = rubricScores[activeIdea.id]?.includes(item.key) ?? false;
                  return (
                    <label
                      key={item.key}
                      className={`flex min-h-[58px] cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-2.5 ${
                        checked ? "border-build bg-white" : "border-build/15 bg-white/70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={isGenerating}
                        checked={checked}
                        onChange={() => toggleRubric(activeIdea.id, item.key)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(217_74%_56%)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-bold text-[hsl(25_34%_20%)]">{item.label}</span>
                        <span className="mt-0.5 block text-[11.5px] font-normal leading-[1.35] text-[hsl(25_20%_38%)]">
                          {item.question}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {(() => {
                const assessment = assessMoneyIdea(rubricScores[activeIdea.id]);
                return (
                  <div
                    role="status"
                    className={`mt-3 rounded-xl border-2 px-3.5 py-3 ${SCORE_CLASS[assessment.tone]}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-display text-[17px] font-black">{assessment.label}</p>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.06em]">
                        {assessment.score} of 5 checks
                      </p>
                    </div>
                    <p className="mt-1 text-[12px] font-semibold leading-[1.45]">{assessment.message}</p>
                  </div>
                );
              })()}
            </section>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
