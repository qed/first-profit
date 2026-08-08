/**
 * The 1.1.1 guided business-idea brainstorm model.
 *
 * The generator deliberately combines learner-authored inputs instead of
 * pretending an untested idea is market research. The rubric then turns each
 * starting idea into five concrete questions that can be checked with real
 * people before the learner commits to it.
 */
import { SITE_ONE_LINER_MAX_CHARS } from "./siteCopy";

export const IDEA_BRAINSTORM_TASK_ID = "1.1.1";

export const IDEA_BRAINSTORM_FIELD_KEYS = {
  boardGame: "brainstormBoardGame",
  animal: "brainstormAnimal",
  sport: "brainstormSport",
  activity: "brainstormActivity",
  businessType: "brainstormBusinessType",
  audience: "brainstormAudience",
  customization: "brainstormCustomization",
  customTwist: "brainstormCustomTwist",
  ideas: "brainstormIdeas",
  ideaSource: "brainstormIdeaSource",
  rubric: "brainstormRubric",
  round: "brainstormRound",
  selectedIdea: "brainstormSelectedIdea",
} as const;

export const IDEA_BRAINSTORM_PERSISTED_FIELD_KEYS = Object.values(
  IDEA_BRAINSTORM_FIELD_KEYS,
);

export type BusinessType = "physical" | "digital" | "service";

export interface BrainstormOption<T extends string> {
  key: T;
  label: string;
  description: string;
}

export const BUSINESS_TYPES: readonly BrainstormOption<BusinessType>[] = [
  {
    key: "physical",
    label: "Physical goods",
    description: "Something people can hold, use, collect, or give.",
  },
  {
    key: "digital",
    label: "Digital goods",
    description: "A download, design, guide, game, or simple app.",
  },
  {
    key: "service",
    label: "A service",
    description: "Something useful you do with someone or for them.",
  },
] as const;

export type AudienceKey = "school" | "families" | "fans" | "teams" | "neighbors";

export const AUDIENCES: readonly (BrainstormOption<AudienceKey> & {
  buyerPhrase: string;
})[] = [
  {
    key: "school",
    label: "Kids at school",
    description: "Classmates, friends, and other students.",
    buyerPhrase: "kids at school",
  },
  {
    key: "families",
    label: "Parents and families",
    description: "People buying for home, gifts, or family time.",
    buyerPhrase: "parents and families",
  },
  {
    key: "fans",
    label: "Fans and collectors",
    description: "People who already care a lot about the topic.",
    buyerPhrase: "fans and collectors",
  },
  {
    key: "teams",
    label: "Teams and clubs",
    description: "Sports teams, school clubs, and community groups.",
    buyerPhrase: "teams and clubs",
  },
  {
    key: "neighbors",
    label: "Neighbors and local shops",
    description: "People and businesses you can reach nearby.",
    buyerPhrase: "neighbors and local shops",
  },
] as const;

export type CustomizationKey = "name" | "local" | "style" | "group" | "limited" | "customer";

export const CUSTOMIZATIONS: readonly (BrainstormOption<CustomizationKey> & {
  phrase: string;
})[] = [
  {
    key: "name",
    label: "Names and messages",
    description: "Add a person's name, nickname, or message.",
    phrase: "their name or personal message",
  },
  {
    key: "local",
    label: "Local stories",
    description: "Use a neighborhood, landmark, or local history.",
    phrase: "their neighborhood and local stories",
  },
  {
    key: "style",
    label: "Colors and style",
    description: "Let the buyer choose the look and theme.",
    phrase: "their colors and favorite style",
  },
  {
    key: "group",
    label: "Team or group edition",
    description: "Make a version for a team, club, or class.",
    phrase: "their team, club, or group",
  },
  {
    key: "limited",
    label: "Limited edition",
    description: "Create a numbered series people can collect.",
    phrase: "a numbered limited edition",
  },
  {
    key: "customer",
    label: "Their own design",
    description: "Use the buyer's photo, drawing, or idea.",
    phrase: "the buyer's own photo, drawing, or idea",
  },
] as const;

export interface BrainstormInputs {
  boardGame: string;
  animal: string;
  sport: string;
  activity: string;
  businessType: string;
  audience: string;
  customization: string;
  customTwist: string;
}

export interface StartingIdea {
  id: string;
  name: string;
  oneLiner: string;
  buyer: string;
  firstTest: string;
  whyItMaySell: string;
  businessType: BusinessType;
}

export const MONEY_IDEA_RUBRIC = [
  {
    key: "buyer",
    label: "Clear buyer",
    question: "I can name the exact kind of person who would pay for this.",
  },
  {
    key: "reason",
    label: "Strong reason",
    question: "It solves a problem or creates something they really want.",
  },
  {
    key: "reach",
    label: "Reachable",
    question: "I can show it to five possible buyers this week.",
  },
  {
    key: "first",
    label: "Fast first version",
    question: "I can make or deliver a simple version within seven days.",
  },
  {
    key: "profit",
    label: "Room for profit",
    question: "The price can be higher than my supplies, fees, and other costs.",
  },
] as const;

export type RubricKey = (typeof MONEY_IDEA_RUBRIC)[number]["key"];
export type RubricScores = Record<string, RubricKey[]>;

function trimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

function sentenceFragment(value: string): string {
  return value.trim().replace(/[.!?]+$/, "");
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function shortPhrase(value: string, maxChars: number): string {
  const clean = sentenceFragment(value);
  if (clean.length <= maxChars) return clean;
  const clipped = clean.slice(0, maxChars + 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > Math.floor(maxChars / 2) ? clipped.slice(0, lastSpace) : clean.slice(0, maxChars)).trim();
}

function fitOneLiner(value: string): string {
  if (value.length <= SITE_ONE_LINER_MAX_CHARS) return value;
  const clipped = value.slice(0, SITE_ONE_LINER_MAX_CHARS);
  const lastSpace = clipped.lastIndexOf(" ");
  const sentence = (lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped)
    .replace(/[,:;\s]+$/, "")
    .trim();
  return `${sentence}.`;
}

export function interestsFrom(inputs: BrainstormInputs): string[] {
  return [inputs.boardGame, inputs.animal, inputs.sport, inputs.activity]
    .map(trimmed)
    .filter(Boolean);
}

export function missingBrainstormInputs(inputs: BrainstormInputs): string[] {
  const missing: string[] = [];
  if (interestsFrom(inputs).length === 0) missing.push("one thing you like");
  if (!BUSINESS_TYPES.some((option) => option.key === inputs.businessType)) {
    missing.push("a business type");
  }
  if (!AUDIENCES.some((option) => option.key === inputs.audience)) {
    missing.push("a possible buyer");
  }
  if (!inputs.customTwist.trim() && !CUSTOMIZATIONS.some((option) => option.key === inputs.customization)) {
    missing.push("a custom twist");
  }
  return missing;
}

function resolvedBuyer(key: string): string {
  return AUDIENCES.find((option) => option.key === key)?.buyerPhrase ?? "possible customers";
}

function resolvedCustomization(inputs: BrainstormInputs): string {
  const custom = sentenceFragment(inputs.customTwist);
  if (custom) return custom;
  return CUSTOMIZATIONS.find((option) => option.key === inputs.customization)?.phrase ?? "a personal touch";
}

type IdeaTemplate = (
  subject: string,
  buyer: string,
  twist: string,
  id: string,
) => StartingIdea;

const PHYSICAL_TEMPLATES: readonly IdeaTemplate[] = [
  (subject, buyer, twist, id) => ({
    id,
    name: `${titleCase(subject)} Collector Pack`,
    oneLiner: `Collectible packs inspired by ${subject} for ${buyer}, customized with ${twist}.`,
    buyer,
    firstTest: `Make one sample pack and ask five ${buyer} which version they would pay for.`,
    whyItMaySell: "It turns an interest into something personal people can own, trade, or give.",
    businessType: "physical",
  }),
  (subject, buyer, twist, id) => ({
    id,
    name: `${titleCase(subject)} Starter Kit`,
    oneLiner: `Starter kits for ${buyer} to explore ${subject}, customized with ${twist}.`,
    buyer,
    firstTest: `Build the smallest useful kit and ask five ${buyer} what they would add or remove.`,
    whyItMaySell: "A ready-to-use kit saves the buyer from finding every part themselves.",
    businessType: "physical",
  }),
  (subject, buyer, twist, id) => ({
    id,
    name: `Custom ${titleCase(subject)} Pieces`,
    oneLiner: `Made-to-order pieces inspired by ${subject} for ${buyer}, designed with ${twist}.`,
    buyer,
    firstTest: `Create one example piece, name a price, and show it to five ${buyer}.`,
    whyItMaySell: "Made-to-order pieces can feel more special than a standard store version.",
    businessType: "physical",
  }),
  (subject, buyer, twist, id) => ({
    id,
    name: `${titleCase(subject)} Local Edition`,
    oneLiner: `A local-edition product inspired by ${subject} for ${buyer}, featuring ${twist}.`,
    buyer,
    firstTest: `Sketch three versions and ask five ${buyer} which one feels most worth buying.`,
    whyItMaySell: "A focused edition can give a group or place something that feels like theirs.",
    businessType: "physical",
  }),
  (subject, buyer, twist, id) => ({
    id,
    name: `${titleCase(subject)} Gift Set`,
    oneLiner: `Gift sets inspired by ${subject} for ${buyer}, personalized with ${twist}.`,
    buyer,
    firstTest: `Make a paper mockup and ask five ${buyer} when they might buy it as a gift.`,
    whyItMaySell: "Gift buyers often pay for convenience and a personal connection.",
    businessType: "physical",
  }),
] as const;

const DIGITAL_TEMPLATES: readonly IdeaTemplate[] = [
  (subject, buyer, twist, id) => ({
    id,
    name: `${titleCase(subject)} Challenge Download`,
    oneLiner: `A downloadable challenge inspired by ${subject} for ${buyer}, customized with ${twist}.`,
    buyer,
    firstTest: `Make a one-page sample and ask five ${buyer} if they would download the full pack.`,
    whyItMaySell: "A useful download can be delivered quickly and sold more than once.",
    businessType: "digital",
  }),
  (subject, buyer, twist, id) => ({
    id,
    name: `${titleCase(subject)} Digital Card Set`,
    oneLiner: `Digital cards inspired by ${subject} for ${buyer}, featuring ${twist}.`,
    buyer,
    firstTest: `Design three sample cards and ask five ${buyer} which set they would choose.`,
    whyItMaySell: "A collectible format gives people a reason to choose favorites and come back.",
    businessType: "digital",
  }),
  (subject, buyer, twist, id) => ({
    id,
    name: `${titleCase(subject)} Quick-Start Guide`,
    oneLiner: `A guide that helps ${buyer} get started with ${subject}, tailored to ${twist}.`,
    buyer,
    firstTest: `Write the first page and ask five ${buyer} which question the full guide must answer.`,
    whyItMaySell: "A clear guide can save beginners time and confusion.",
    businessType: "digital",
  }),
  (subject, buyer, twist, id) => ({
    id,
    name: `${titleCase(subject)} Custom Poster Pack`,
    oneLiner: `Downloadable posters inspired by ${subject} for ${buyer}, designed with ${twist}.`,
    buyer,
    firstTest: `Make two poster styles and ask five ${buyer} which one they would pay to personalize.`,
    whyItMaySell: "Digital designs are fast to deliver while still feeling personal.",
    businessType: "digital",
  }),
  (subject, buyer, twist, id) => ({
    id,
    name: `${titleCase(subject)} Mini Tracker`,
    oneLiner: `A tracker that helps ${buyer} practice ${subject}, with goals based on ${twist}.`,
    buyer,
    firstTest: `Make a paper or spreadsheet version and watch five ${buyer} try it before building an app.`,
    whyItMaySell: "A tracker may help people practice, improve, or stay organized.",
    businessType: "digital",
  }),
] as const;

const SERVICE_TEMPLATES: readonly IdeaTemplate[] = [
  (subject, buyer, twist, id) => ({
    id,
    name: `${titleCase(subject)} Starter Session`,
    oneLiner: `Beginner sessions about ${subject} for ${buyer}, planned around ${twist}.`,
    buyer,
    firstTest: `Offer one short practice session and ask the customer what was most useful.`,
    whyItMaySell: "Beginners may pay for personal help that makes starting easier.",
    businessType: "service",
  }),
  (subject, buyer, twist, id) => ({
    id,
    name: `${titleCase(subject)} Party Activity`,
    oneLiner: `A hosted activity inspired by ${subject} for ${buyer}, customized with ${twist}.`,
    buyer,
    firstTest: `Plan a 20-minute version and ask five ${buyer} what occasion they would book it for.`,
    whyItMaySell: "A ready-to-run activity can make an event easier and more memorable.",
    businessType: "service",
  }),
  (subject, buyer, twist, id) => ({
    id,
    name: `${titleCase(subject)} Custom Design Help`,
    oneLiner: `Design help inspired by ${subject} for ${buyer}, built around ${twist}.`,
    buyer,
    firstTest: `Make one example for someone you know and ask what they would pay for the finished version.`,
    whyItMaySell: "People may pay when you can make something they cannot easily make themselves.",
    businessType: "service",
  }),
  (subject, buyer, twist, id) => ({
    id,
    name: `${titleCase(subject)} Club Workshop`,
    oneLiner: `A group workshop about ${subject} for ${buyer}, featuring ${twist}.`,
    buyer,
    firstTest: `Outline one short workshop and ask a team or club leader if they would host it.`,
    whyItMaySell: "One group booking can reach several customers at once.",
    businessType: "service",
  }),
  (subject, buyer, twist, id) => ({
    id,
    name: `${titleCase(subject)} Setup Service`,
    oneLiner: `Setup help for ${buyer} who want an easier way to enjoy ${subject}, matched to ${twist}.`,
    buyer,
    firstTest: `Help one person with a small setup and write down what saved them the most time.`,
    whyItMaySell: "Doing a confusing or time-consuming job for someone can create clear value.",
    businessType: "service",
  }),
] as const;

function templatesFor(type: BusinessType): readonly IdeaTemplate[] {
  if (type === "digital") return DIGITAL_TEMPLATES;
  if (type === "service") return SERVICE_TEMPLATES;
  return PHYSICAL_TEMPLATES;
}

export function generateStartingIdeas(inputs: BrainstormInputs, round = 1): StartingIdea[] {
  if (missingBrainstormInputs(inputs).length > 0) return [];

  const interests = interestsFrom(inputs);
  const businessType = inputs.businessType as BusinessType;
  const buyer = resolvedBuyer(inputs.audience);
  const twist = resolvedCustomization(inputs);
  const templates = templatesFor(businessType);
  const safeRound = Number.isFinite(round) ? Math.max(1, Math.floor(round)) : 1;

  return templates.map((makeIdea, index) => {
    const subject = shortPhrase(interests[(index + safeRound - 1) % interests.length], 28);
    const idea = makeIdea(
      subject,
      buyer,
      shortPhrase(twist, 46),
      `brainstorm-${safeRound}-${index + 1}`,
    );
    return { ...idea, oneLiner: fitOneLiner(idea.oneLiner) };
  });
}

export function parseStartingIdeas(value: string | undefined): StartingIdea[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StartingIdea => {
      if (!item || typeof item !== "object") return false;
      const idea = item as Partial<StartingIdea>;
      return (
        typeof idea.id === "string" &&
        typeof idea.name === "string" &&
        typeof idea.oneLiner === "string" &&
        typeof idea.buyer === "string" &&
        typeof idea.firstTest === "string" &&
        typeof idea.whyItMaySell === "string" &&
        BUSINESS_TYPES.some((option) => option.key === idea.businessType)
      );
    }).slice(0, 5);
  } catch {
    return [];
  }
}

export function parseRubricScores(value: string | undefined): RubricScores {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const validKeys = new Set<RubricKey>(MONEY_IDEA_RUBRIC.map((item) => item.key));
    return Object.fromEntries(
      Object.entries(parsed).map(([ideaId, keys]) => [
        ideaId,
        Array.isArray(keys)
          ? keys.filter((key): key is RubricKey => typeof key === "string" && validKeys.has(key as RubricKey))
          : [],
      ]),
    );
  } catch {
    return {};
  }
}

export type MoneyIdeaTone = "unscored" | "hobby" | "building" | "promising" | "strong";

export interface MoneyIdeaAssessment {
  score: number;
  label: string;
  message: string;
  tone: MoneyIdeaTone;
}

export function assessMoneyIdea(checked: readonly RubricKey[] | undefined): MoneyIdeaAssessment {
  if (!checked) {
    return {
      score: 0,
      label: "Not scored yet",
      message: "Use the five checks to see what this idea still needs.",
      tone: "unscored",
    };
  }

  const score = new Set(checked).size;
  if (score <= 1) {
    return {
      score,
      label: "Nice hobby for now",
      message: "Keep the fun part, then find a clearer buyer and reason to pay.",
      tone: "hobby",
    };
  }
  if (score <= 2) {
    return {
      score,
      label: "Needs more proof",
      message: "There may be something here. Strengthen the unchecked parts before building much.",
      tone: "building",
    };
  }
  if (score === 3) {
    return {
      score,
      label: "Promising idea",
      message: "Good starting point. Ask real possible customers about the two weak spots.",
      tone: "promising",
    };
  }
  if (score === 4) {
    return {
      score,
      label: "Worth testing",
      message: "This looks testable. Make the smallest version and ask someone to pay.",
      tone: "strong",
    };
  }
  return {
    score,
    label: "Strong money-making potential",
    message: "All five basics are present. A real customer paying is the next proof.",
    tone: "strong",
  };
}
