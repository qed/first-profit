/**
 * Path data — the ASSEMBLY POINT for the app's step/task API (Unit 4).
 *
 * Task content (titles, bodies, done-when lines, grade-band variants) is
 * GENERATED from the canonical curriculum brief into
 * `pathContent.generated.ts` (rebuild: `npx tsx scripts/build-path-content.ts`).
 * Behavior hooks (artifact auto-complete, the real-sale target, authored input
 * fields) are hand-kept in `pathHooks.ts` keyed by stable task id. This module
 * combines the two — plus the hand-kept per-criterion app chrome below — into
 * the SAME exported API the app has always consumed (`STEPS`, `stepById`,
 * `parseTask`, `PHASES`), and adds band-aware accessors for later units.
 *
 * Every hook and chrome reference is asserted against the generated content at
 * module load: a broken task/criterion id fails the build and the test suite,
 * never the child.
 */
import { PATH_CONTENT } from "./pathContent.generated";
import type { Band, ContentPhase, PathContent, UnitTask } from "./parseCurriculum";
import { assertMatchesManifest, resolveVariant } from "./parseCurriculum";
import {
  ARTIFACT_HOOKS,
  FIELD_HOOKS,
  SALE_AUTO_COMPLETE_TASK_ID,
} from "./pathHooks";

export type PhaseId = 'sell' | 'build' | 'validate' | 'grow' | 'scale';

export type RoomId =
'idea' |
'market' |
'build' |
'website' |
'checkout' |
'product' |
'workshop' |
'command';

export type ArtifactKey = 'website' | 'checkout' | 'delivery' | 'ledger';

export interface Phase {
  id: PhaseId;
  index: number;
  name: string;
  promise: string;
  color: string;
  tint: string;
}

export interface Step {
  id: string;
  phase: PhaseId;
  room: RoomId;
  title: string;
  brief: string;
  doneWhen: string;
  coach: string;
  xp: number;
  /** A task string prefixed with "@artifact " auto-completes when that artifact is built. */
  tasks: string[];
  field?: StepField;
  /** Multiple authored inputs on the first task (e.g. 1.1's product name +
   *  one-liner). Takes precedence over `field` when present. */
  fields?: StepField[];
}

export interface StepField {key: string;label: string;placeholder: string;long?: boolean;}

export const PHASES: Phase[] = [
{
  id: 'sell',
  index: 1,
  name: 'Sell',
  promise: 'Learn to confidently sell anything.',
  color: '#E0562A',
  tint: '#FBEAE1'
},
{
  id: 'build',
  index: 2,
  name: 'Build',
  promise: 'Ship a real thing people can buy.',
  color: '#2F5D8C',
  tint: '#E3EBF3'
},
{
  id: 'validate',
  index: 3,
  name: 'Validate',
  promise: 'Prove it works before you scale it.',
  color: '#6B4E8C',
  tint: '#EBE5F2'
},
{
  id: 'grow',
  index: 4,
  name: 'Grow',
  promise: 'Get to your first $1,000 in sales.',
  color: '#2E7D53',
  tint: '#E2F0E8'
},
{
  id: 'scale',
  index: 5,
  name: 'Scale',
  promise: 'Build the plan to $10,000 in profit.',
  color: '#C98A16',
  tint: '#F7EDD8'
}];


export const phaseById = (id: PhaseId): Phase =>
PHASES.find((p) => p.id === id) as Phase;

// ── Per-criterion app chrome (hand-kept) ─────────────────────────────────
// The brief carries task content only; the room a criterion lives in and the
// game-voice framing (title/brief/done-when/coach/xp) are app design, authored
// here. Keyed by criterion id; the assembly asserts this table covers exactly
// the criteria the generated content carries.

export interface StepMeta {
  room: RoomId;
  title: string;
  brief: string;
  doneWhen: string;
  coach: string;
  xp: number;
}

export const STEP_META: Record<string, StepMeta> = {
  // ── PHASE 01 · SELL ─────────────────────────────────────────────
  '1.1': {
    room: 'idea',
    title: 'Pitch a product in 60 seconds, no notes',
    brief:
    'Pick the thing you want to sell and get a 60-second pitch out of your mouth in front of an adult who is not family.',
    doneWhen:
    'A non-family adult can say back what your product is and what you asked them to do.',
    coach:
    'Start here. Write one sentence. What it is, who it is for, why they want it. Everything else in First Profit hangs off that sentence.',
    xp: 60
  },
  '1.2': {
    room: 'market',
    title: 'Make a real sale',
    brief:
    'A real customer who is not family. Real money changing hands. This is the moment you become a founder.',
    doneWhen: 'Money from a non-family customer is in hand and the sale is logged.',
    coach:
    'Head to the Market Stall. Build a list of ten people you can safely ask, rehearse the money handover, then ask until one person says yes.',
    xp: 120
  },
  '1.3': {
    room: 'market',
    title: 'Hear "no" three times',
    brief:
    'Collect three real nos and write down what each one taught you. Nos are data, not damage.',
    doneWhen: 'Three nos are logged with a lesson written under each.',
    coach:
    'Open the No Ledger at the Market Stall. Log every no with the reason you heard. You are hunting for the pattern.',
    xp: 70
  },
  '1.4': {
    room: 'product',
    title: 'Explain cost, price and profit on one page',
    brief:
    'What one unit costs you to make, what you charge, and what is left over. In your own words, on one page.',
    doneWhen: 'The one-pager is in the Founder File and you can explain it out loud.',
    coach:
    'Use the Unit Economics bench in the Product Room. Set your cost and your price — the machine shows you the profit per unit.',
    xp: 80
  },
  '1.5': {
    room: 'market',
    title: '25 supervised outreach attempts',
    brief:
    'A booth, door to door, calls, messages — 25 real attempts with a parent present.',
    doneWhen: 'The outreach tally reads 25 with channel and outcome for each.',
    coach:
    'Grind the tally. Every knock counts whether they buy or not. Twenty-five is the credential.',
    xp: 100
  },

  // ── PHASE 02 · BUILD ────────────────────────────────────────────
  '2.1': {
    room: 'build',
    title: 'Ship the smallest thing that works',
    brief:
    'A working product, site or offer built with AI tools — with a live URL, a price and instructions.',
    doneWhen: 'A stranger could find it, understand it and buy it without you in the room.',
    coach:
    'In the Build Room, strip your idea down to the smallest version that still solves the problem. Ship that. Then publish it in the Website Studio.',
    xp: 140
  },
  '2.2': {
    room: 'idea',
    title: 'Connect the product to a real gap',
    brief:
    'A one-page brief on the gap you spotted in a world you actually know — your sport, your school, your street.',
    doneWhen: 'The brief names the gap, who feels it, and how your product closes it.',
    coach:
    'Back to the Idea Room. Name the gap in a domain you know better than most adults do.',
    xp: 80
  },
  '2.3': {
    room: 'market',
    title: 'Contact 40 potential customers',
    brief:
    'Forty real contacts, plus one piece of marketing you launch and measure.',
    doneWhen: 'The contact tally reads 40 and your marketing piece has numbers attached.',
    coach:
    'Volume time. Work the tally to 40, then launch one poster, post or flyer and write down what it actually did.',
    xp: 120
  },
  '2.4': {
    room: 'build',
    title: 'Ship a v2 from real feedback',
    brief:
    'Three real users tell you what is wrong. You change it and ship again.',
    doneWhen: 'v2 is live and each of the three changes traces back to a user.',
    coach:
    'Feedback in, version out. In the Build Room, log three pieces of feedback and ship the change each one demands.',
    xp: 110
  },
  '2.5': {
    room: 'workshop',
    title: 'Give a 3–5 minute live demo',
    brief:
    'The build, the results, the lessons — live, to an audience with at least one non-family adult.',
    doneWhen: 'The demo happened, was recorded, and the recording is in the Founder File.',
    coach:
    'Book the Demo Stage in the Workshop Room. Three minutes, three beats: what I built, what happened, what I learned.',
    xp: 120
  },

  // ── PHASE 03 · VALIDATE ─────────────────────────────────────────
  '3.1': {
    room: 'product',
    title: 'Run two validation loops',
    brief: 'Hypothesis, test, outcome. Twice. Write the outcome even when you were wrong.',
    doneWhen: 'Two complete loops are logged with an honest outcome on each.',
    coach:
    'Use the Loop Bench. Guess out loud, run the smallest test that could prove you wrong, then write what actually happened.',
    xp: 110
  },
  '3.2': {
    room: 'checkout',
    title: 'Run a pricing experiment',
    brief:
    'Two price points, the margin math for each, and feedback from two different groups.',
    doneWhen: 'You can say which price wins and show the math behind it.',
    coach:
    'The Checkout Booth lets you swap the price on your live checkout. Try both. Watch what people actually do.',
    xp: 100
  },
  '3.3': {
    room: 'workshop',
    title: 'Audit your AI tools',
    brief:
    'Three tools you adopted since Day 1: why you picked them, what they produced, whether they stay.',
    doneWhen: 'Three tools are audited with a keep-or-cut decision on each.',
    coach:
    'Sit the AI Audit workshop. Tools are staff — if one is not earning its keep, fire it.',
    xp: 80
  },
  '3.4': {
    room: 'product',
    title: 'Choose a validation path solo',
    brief:
    'No adult help. You pick the path, you run it, you present the reasoning and the outcome.',
    doneWhen: 'You presented the decision and the result at a Family Demo Session.',
    coach:
    'This one is yours alone. Pick the test, defend the choice, live with the answer.',
    xp: 120
  },
  '3.5': {
    room: 'website',
    title: 'Publish two pieces of content',
    brief: 'Two posts, videos or pages that pull in engagement from outside your household.',
    doneWhen: 'Both are published and you can show real external engagement.',
    coach:
    'Publish from the Website Studio. Content is the cheapest way to get strangers to look at you.',
    xp: 90
  },

  // ── PHASE 04 · GROW ─────────────────────────────────────────────
  '4.1': {
    room: 'checkout',
    title: '10 sales or 3 repeat customers',
    brief: 'Proof this is a business and not a one-off favour.',
    doneWhen: 'The sales ledger shows ten sales, or three customers who bought twice.',
    coach:
    'Run real checkouts. Every completed payment lands in your ledger and pushes the $1,000 bar.',
    xp: 160
  },
  // PP2 forward reference (Unit 7): when the P&L is built here, the "money out"
  // lines are the chosen provider's MONTHLY SUBSCRIPTION (providers.ts
  // subscriptionCents) plus the PER-SALE FEES already snapshotted on each fp_ledger
  // sale row (feeCents). The Checkout Booth only shows a light directional
  // "subscription so far" estimate today; the real accounting belongs in this task.
  '4.2': {
    room: 'command',
    title: 'Track a P&L for four weeks',
    brief: 'Money in, money out, what is left. Four consecutive weeks of a live business.',
    doneWhen: 'Four weeks of numbers are in the ledger with a total on the bottom.',
    coach:
    'The Command Deck keeps your P&L. Enter each week honestly — the ugly weeks teach the most.',
    xp: 130
  },
  '4.3': {
    room: 'command',
    title: 'Build one repeating AI process',
    brief: 'A daily or weekly job an AI tool does for the business, every time, without you rewriting it.',
    doneWhen: 'The process has run at least twice on schedule.',
    coach:
    'Write the prompt once, run it on a schedule. This is where your time starts coming back.',
    xp: 110
  },
  '4.4': {
    room: 'market',
    title: 'Close a real negotiation',
    brief: 'A real back-and-forth with documented terms both sides agreed to.',
    doneWhen: 'The agreed terms are written down and both sides have a copy.',
    coach:
    'Ask for something: a better price, a bulk order, a stall at a market. Then write the deal down.',
    xp: 120
  },
  '4.5': {
    room: 'command',
    title: 'Present your financials to the board',
    brief:
    'Parents plus a non-family adult sit as your board. You present the numbers like a founder.',
    doneWhen: 'The board meeting happened and the board asked at least two questions.',
    coach:
    'Pull your P&L into a board pack. Lead with the number, then the story behind it.',
    xp: 150
  },

  // ── PHASE 05 · SCALE ────────────────────────────────────────────
  '5.1': {
    room: 'command',
    title: 'Automate one real part of the business',
    brief: 'An agent or automation doing a real job — and you can show it running.',
    doneWhen: 'The automation runs live in front of a witness.',
    coach:
    'Wire the automation into your Command Deck and let it work while you watch.',
    xp: 140
  },
  '5.2': {
    room: 'product',
    title: 'Delegate a task with written instructions',
    brief: 'Someone else does a real job for your business using only what you wrote down.',
    doneWhen: 'The task got done correctly by someone else, from your instructions alone.',
    coach:
    'Write the instructions in the Delivery Bay, hand them over, and do not rescue them.',
    xp: 120
  },
  '5.3': {
    room: 'product',
    title: 'Take a week off — stay open',
    brief: 'Customers still get served through a week you did not work.',
    doneWhen: 'A week passed with no founder hours and at least one customer served.',
    coach:
    'Your systems go on trial. Turn on auto-delivery, hand off the rest, and step away.',
    xp: 150
  },
  '5.4': {
    room: 'workshop',
    title: 'Write the one-page playbook',
    brief: 'One page that lets someone else run your business.',
    doneWhen: 'A stranger could run a week of the business from the page alone.',
    coach:
    'Everything you know, on one page: the offer, the process, the numbers, the rules.',
    xp: 130
  },
  '5.5': {
    room: 'workshop',
    title: 'Pitch next year, on stage',
    brief:
    'The Capstone Showcase: five people, two of them non-family adults, and a real stage moment.',
    doneWhen: 'You pitched what the business becomes next year, live, to that audience.',
    coach:
    'Last step. Show where the business goes next and what it takes to get to $10,000 in profit.',
    xp: 200
  }
};

// ── Assembly ─────────────────────────────────────────────────────────────

/** Hooks shape consumed by the assembly (mirrors pathHooks.ts's exports). */
export interface PathHooks {
  artifacts: Readonly<Record<string, ArtifactKey>>;
  saleAutoCompleteTaskId: string;
  fields: Readonly<Record<string, StepField[]>>;
}

const PHASE_ID_BY_KEY: Record<ContentPhase['key'], PhaseId> = {
  SELL: 'sell',
  BUILD: 'build',
  VALIDATE: 'validate',
  GROW: 'grow',
  SCALE: 'scale'
};

/** A task's checklist label: the brief's title, sans its trailing period. */
const taskLabel = (task: UnitTask): string => task.title.replace(/\.$/, '');

/**
 * Combine generated content × hooks × chrome into the app's Step list.
 * Exported for the test suite; the app consumes the assembled `STEPS` below.
 *
 * Throws (failing the build and every test run) when:
 *  - a hook references a task or criterion id the content does not carry,
 *  - the sale auto-complete target is not the LAST task of its criterion
 *    (gameCore addresses it positionally as `tasks.length - 1`),
 *  - the chrome table and the content's criteria don't match 1:1.
 */
export function assembleSteps(
  content: PathContent,
  hooks: PathHooks,
  meta: Record<string, StepMeta> = STEP_META,
): Step[] {
  const criteria = content.phases.flatMap((phase) =>
    phase.criteria.map((criterion) => ({ phase, criterion })),
  );
  const taskIds = new Set(
    criteria.flatMap(({ criterion }) => criterion.tasks.map((t) => t.id)),
  );
  const criterionIds = new Set(criteria.map(({ criterion }) => criterion.id));

  for (const taskId of Object.keys(hooks.artifacts)) {
    if (!taskIds.has(taskId)) {
      throw new Error(
        `pathHooks: artifact hook references nonexistent task id "${taskId}".`,
      );
    }
  }
  for (const criterionId of Object.keys(hooks.fields)) {
    if (!criterionIds.has(criterionId)) {
      throw new Error(
        `pathHooks: field hook references nonexistent criterion id "${criterionId}".`,
      );
    }
  }

  const saleId = hooks.saleAutoCompleteTaskId;
  if (!taskIds.has(saleId)) {
    throw new Error(
      `pathHooks: sale auto-complete references nonexistent task id "${saleId}".`,
    );
  }
  const saleCriterionId = saleId.split('.').slice(0, 2).join('.');
  const saleCriterion = criteria.find(({ criterion }) => criterion.id === saleCriterionId);
  const saleLast = saleCriterion?.criterion.tasks[saleCriterion.criterion.tasks.length - 1];
  if (!saleLast || saleLast.id !== saleId) {
    throw new Error(
      `pathHooks: sale auto-complete target "${saleId}" must be the LAST task of ` +
        `criterion ${saleCriterionId} (gameCore addresses it as tasks.length - 1), ` +
        `but the last task is "${saleLast?.id}".`,
    );
  }

  for (const metaId of Object.keys(meta)) {
    if (!criterionIds.has(metaId)) {
      throw new Error(`path.ts STEP_META has chrome for unknown criterion "${metaId}".`);
    }
  }

  return criteria.map(({ phase, criterion }) => {
    const m = meta[criterion.id];
    if (!m) {
      throw new Error(`path.ts STEP_META is missing chrome for criterion "${criterion.id}".`);
    }
    const fields = hooks.fields[criterion.id];
    return {
      id: criterion.id,
      phase: PHASE_ID_BY_KEY[phase.key],
      room: m.room,
      title: m.title,
      brief: m.brief,
      doneWhen: m.doneWhen,
      coach: m.coach,
      xp: m.xp,
      tasks: criterion.tasks.map((task) => {
        const auto = hooks.artifacts[task.id];
        return auto ? `@${auto} ${taskLabel(task)}` : taskLabel(task);
      }),
      // One authored input keeps the legacy `field` shape; several use `fields`
      // (exactly reproducing the hand-written Step objects the app consumed).
      ...(fields && fields.length === 1 ? { field: fields[0] } : {}),
      ...(fields && fields.length > 1 ? { fields } : {}),
    };
  });
}

// Belt-and-braces: the generated module is validated against the manifest at
// import time, so a corrupted or hand-edited pathContent.generated.ts fails
// the dev server and the app the moment it loads — not when a child reaches
// the affected screen. (The build preflight runs the same check pre-deploy.)
assertMatchesManifest(PATH_CONTENT);

export const STEPS: Step[] = assembleSteps(PATH_CONTENT, {
  artifacts: ARTIFACT_HOOKS,
  saleAutoCompleteTaskId: SALE_AUTO_COMPLETE_TASK_ID,
  fields: FIELD_HOOKS,
});

export const stepById = (id: string): Step | undefined =>
STEPS.find((s) => s.id === id);

export const parseTask = (
raw: string)
: {label: string;auto?: ArtifactKey;} => {
  const match = raw.match(/^@(website|checkout|delivery|ledger)\s+(.*)$/);
  if (match) return { label: match[2], auto: match[1] as ArtifactKey };
  return { label: raw };
};

// ── Band-aware content accessors (for later units) ───────────────────────

export type { Band, UnitTask } from "./parseCurriculum";
export { PATH_CONTENT } from "./pathContent.generated";

const TASKS_BY_ID: ReadonlyMap<string, UnitTask> = new Map(
  PATH_CONTENT.phases.flatMap((p) =>
    p.criteria.flatMap((c) => c.tasks.map((t) => [t.id, t] as const)),
  ),
);

/** The generated unit task for a stable task id ("1.2.5"), if it exists. */
export const taskById = (taskId: string): UnitTask | undefined =>
  TASKS_BY_ID.get(taskId);

/** The checklist title for a task. Titles do not vary by band today; the band
 *  parameter keeps the call sites honest if that ever changes. */
export function taskTitleForBand(taskId: string, _band: Band): string | undefined {
  const task = TASKS_BY_ID.get(taskId);
  return task ? taskLabel(task) : undefined;
}

/**
 * The full instruction body for a task at a band: the shared body, plus the
 * band's variant line when one is authored (variants are PARTIAL overlays —
 * a band without one reads the body alone).
 */
export function taskBodyForBand(taskId: string, band: Band): string | undefined {
  const task = TASKS_BY_ID.get(taskId);
  if (!task) return undefined;
  const variant = resolveVariant(task, band);
  return variant ? `${task.body}\n${variant}` : task.body;
}

/** The binary Done-when line for a task (identical across bands). */
export function doneWhenForBand(taskId: string, _band: Band): string | undefined {
  return TASKS_BY_ID.get(taskId)?.doneWhen;
}

/** The `All bands:` note for a task, when the brief carries one. */
export function allBandsNoteFor(taskId: string): string | undefined {
  return TASKS_BY_ID.get(taskId)?.allBandsNote;
}
