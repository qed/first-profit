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
  field?: {key: string;label: string;placeholder: string;long?: boolean;};
}

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

export const STEPS: Step[] = [
// ── PHASE 01 · SELL ───────────────────────────────────────────────
{
  id: '1.1',
  phase: 'sell',
  room: 'idea',
  title: 'Pitch a product in 60 seconds, no notes',
  brief:
  'Pick the thing you want to sell and get a 60-second pitch out of your mouth in front of an adult who is not family.',
  doneWhen:
  'A non-family adult can say back what your product is and what you asked them to do.',
  coach:
  'Start here. Write one sentence. What it is, who it is for, why they want it. Everything else in First Profit hangs off that sentence.',
  xp: 60,
  field: {
    key: 'oneLiner',
    label: 'Your one-liner',
    placeholder: 'Custom friendship bracelets for kids who want to trade at recess.'
  },
  tasks: [
  'Pick the product and write the one-liner',
  'Write the 60-second pitch: hook, what it is, why it is good, the ask',
  'Rehearse to camera until three clean runs in a row',
  'Cold-pitch a parent and revise one thing',
  'Deliver it to a non-family adult with no notes']

},
{
  id: '1.2',
  phase: 'sell',
  room: 'market',
  title: 'Make a real sale',
  brief:
  'A real customer who is not family. Real money changing hands. This is the moment you become a founder.',
  doneWhen: 'Money from a non-family customer is in hand and the sale is logged.',
  coach:
  'Head to the Market Stall. Build a list of ten people you can safely ask, rehearse the money handover, then ask until one person says yes.',
  xp: 120,
  tasks: [
  'Choose the offer and set the price',
  'Build the first prospect list of ten',
  'Set up the point of sale and dress-rehearse it',
  'Ask until one yes. Log the sale']

},
{
  id: '1.3',
  phase: 'sell',
  room: 'market',
  title: 'Hear "no" three times',
  brief:
  'Collect three real nos and write down what each one taught you. Nos are data, not damage.',
  doneWhen: 'Three nos are logged with a lesson written under each.',
  coach:
  'Open the No Ledger at the Market Stall. Log every no with the reason you heard. You are hunting for the pattern.',
  xp: 70,
  tasks: [
  'Log no #1 and what it taught you',
  'Log no #2 and what it taught you',
  'Log no #3 and what it taught you',
  'Name the pattern across all three']

},
{
  id: '1.4',
  phase: 'sell',
  room: 'product',
  title: 'Explain cost, price and profit on one page',
  brief:
  'What one unit costs you to make, what you charge, and what is left over. In your own words, on one page.',
  doneWhen: 'The one-pager is in the Founder File and you can explain it out loud.',
  coach:
  'Use the Unit Economics bench in the Product Room. Set your cost and your price — the machine shows you the profit per unit.',
  xp: 80,
  tasks: [
  'List every cost that goes into one unit',
  'Write your price and why you chose it',
  'Do the profit math: price minus cost',
  'Explain the page out loud to your coach']

},
{
  id: '1.5',
  phase: 'sell',
  room: 'market',
  title: '25 supervised outreach attempts',
  brief:
  'A booth, door to door, calls, messages — 25 real attempts with a parent present.',
  doneWhen: 'The outreach tally reads 25 with channel and outcome for each.',
  coach:
  'Grind the tally. Every knock counts whether they buy or not. Twenty-five is the credential.',
  xp: 100,
  tasks: [
  'Pick your channels and get them parent-approved',
  'Run attempts 1–10',
  'Run attempts 11–25',
  'Write what converted best and why']

},

// ── PHASE 02 · BUILD ──────────────────────────────────────────────
{
  id: '2.1',
  phase: 'build',
  room: 'build',
  title: 'Ship the smallest thing that works',
  brief:
  'A working product, site or offer built with AI tools — with a live URL, a price and instructions.',
  doneWhen: 'A stranger could find it, understand it and buy it without you in the room.',
  coach:
  'In the Build Room, strip your idea down to the smallest version that still solves the problem. Ship that. Then publish it in the Website Studio.',
  xp: 140,
  tasks: [
  'Cut the idea down to one job it does',
  'Build v1 with your AI tools',
  'Write the instructions a buyer needs',
  '@website Publish it at a live URL']

},
{
  id: '2.2',
  phase: 'build',
  room: 'idea',
  title: 'Connect the product to a real gap',
  brief:
  'A one-page brief on the gap you spotted in a world you actually know — your sport, your school, your street.',
  doneWhen: 'The brief names the gap, who feels it, and how your product closes it.',
  coach:
  'Back to the Idea Room. Name the gap in a domain you know better than most adults do.',
  xp: 80,
  field: {
    key: 'gapBrief',
    label: 'The gap, in your words',
    placeholder:
    'Kids on my team lose their mouthguards every season and the store version takes two weeks...',
    long: true
  },
  tasks: [
  'Name the domain you know well',
  'Describe the gap and who feels it',
  'Show how your product closes it']

},
{
  id: '2.3',
  phase: 'build',
  room: 'market',
  title: 'Contact 40 potential customers',
  brief:
  'Forty real contacts, plus one piece of marketing you launch and measure.',
  doneWhen: 'The contact tally reads 40 and your marketing piece has numbers attached.',
  coach:
  'Volume time. Work the tally to 40, then launch one poster, post or flyer and write down what it actually did.',
  xp: 120,
  tasks: [
  'Reach 40 contacts on the tally',
  'Launch one piece of marketing',
  'Record the metric it produced']

},
{
  id: '2.4',
  phase: 'build',
  room: 'build',
  title: 'Ship a v2 from real feedback',
  brief:
  'Three real users tell you what is wrong. You change it and ship again.',
  doneWhen: 'v2 is live and each of the three changes traces back to a user.',
  coach:
  'Feedback in, version out. In the Build Room, log three pieces of feedback and ship the change each one demands.',
  xp: 110,
  tasks: [
  'Collect feedback from three real users',
  'Choose the three changes worth making',
  'Ship v2 and tell the users what changed']

},
{
  id: '2.5',
  phase: 'build',
  room: 'workshop',
  title: 'Give a 3–5 minute live demo',
  brief:
  'The build, the results, the lessons — live, to an audience with at least one non-family adult.',
  doneWhen: 'The demo happened, was recorded, and the recording is in the Founder File.',
  coach:
  'Book the Demo Stage in the Workshop Room. Three minutes, three beats: what I built, what happened, what I learned.',
  xp: 120,
  tasks: [
  'Write the three-beat demo script',
  'Rehearse it to time',
  'Deliver it live and record it']

},

// ── PHASE 03 · VALIDATE ───────────────────────────────────────────
{
  id: '3.1',
  phase: 'validate',
  room: 'product',
  title: 'Run two validation loops',
  brief: 'Hypothesis, test, outcome. Twice. Write the outcome even when you were wrong.',
  doneWhen: 'Two complete loops are logged with an honest outcome on each.',
  coach:
  'Use the Loop Bench. Guess out loud, run the smallest test that could prove you wrong, then write what actually happened.',
  xp: 110,
  tasks: [
  'Loop 1: write the hypothesis',
  'Loop 1: run the test and log the outcome',
  'Loop 2: write the hypothesis',
  'Loop 2: run the test and log the outcome']

},
{
  id: '3.2',
  phase: 'validate',
  room: 'checkout',
  title: 'Run a pricing experiment',
  brief:
  'Two price points, the margin math for each, and feedback from two different groups.',
  doneWhen: 'You can say which price wins and show the math behind it.',
  coach:
  'The Checkout Booth lets you swap the price on your live checkout. Try both. Watch what people actually do.',
  xp: 100,
  tasks: [
  '@checkout Put a working checkout live',
  'Test price A and record the response',
  'Test price B and record the response',
  'Pick the winner and show the margin math']

},
{
  id: '3.3',
  phase: 'validate',
  room: 'workshop',
  title: 'Audit your AI tools',
  brief:
  'Three tools you adopted since Day 1: why you picked them, what they produced, whether they stay.',
  doneWhen: 'Three tools are audited with a keep-or-cut decision on each.',
  coach:
  'Sit the AI Audit workshop. Tools are staff — if one is not earning its keep, fire it.',
  xp: 80,
  tasks: [
  'List every tool you have used',
  'Write the rationale and outcome for three',
  'Make a keep-or-cut call on each']

},
{
  id: '3.4',
  phase: 'validate',
  room: 'product',
  title: 'Choose a validation path solo',
  brief:
  'No adult help. You pick the path, you run it, you present the reasoning and the outcome.',
  doneWhen: 'You presented the decision and the result at a Family Demo Session.',
  coach:
  'This one is yours alone. Pick the test, defend the choice, live with the answer.',
  xp: 120,
  tasks: [
  'Choose the path with no adult input',
  'Run it start to finish',
  'Present the reasoning and the outcome']

},
{
  id: '3.5',
  phase: 'validate',
  room: 'website',
  title: 'Publish two pieces of content',
  brief: 'Two posts, videos or pages that pull in engagement from outside your household.',
  doneWhen: 'Both are published and you can show real external engagement.',
  coach:
  'Publish from the Website Studio. Content is the cheapest way to get strangers to look at you.',
  xp: 90,
  tasks: [
  '@website Publish piece one',
  'Publish piece two',
  'Log the external engagement each one pulled']

},

// ── PHASE 04 · GROW ───────────────────────────────────────────────
{
  id: '4.1',
  phase: 'grow',
  room: 'checkout',
  title: '10 sales or 3 repeat customers',
  brief: 'Proof this is a business and not a one-off favour.',
  doneWhen: 'The sales ledger shows ten sales, or three customers who bought twice.',
  coach:
  'Run real checkouts. Every completed payment lands in your ledger and pushes the $1,000 bar.',
  xp: 160,
  tasks: [
  '@checkout Take payments through your checkout',
  'Reach ten sales or three repeat customers',
  'Thank every customer by name']

},
// PP2 forward reference (Unit 7): when the P&L is built here, the "money out"
// lines are the chosen provider's MONTHLY SUBSCRIPTION (providers.ts
// subscriptionCents) plus the PER-SALE FEES already snapshotted on each fp_ledger
// sale row (feeCents). The Checkout Booth only shows a light directional
// "subscription so far" estimate today; the real accounting belongs in this task.
{
  id: '4.2',
  phase: 'grow',
  room: 'command',
  title: 'Track a P&L for four weeks',
  brief: 'Money in, money out, what is left. Four consecutive weeks of a live business.',
  doneWhen: 'Four weeks of numbers are in the ledger with a total on the bottom.',
  coach:
  'The Command Deck keeps your P&L. Enter each week honestly — the ugly weeks teach the most.',
  xp: 130,
  tasks: [
  '@ledger Open the P&L ledger',
  'Log four consecutive weeks',
  'Write one sentence on what the numbers say']

},
{
  id: '4.3',
  phase: 'grow',
  room: 'command',
  title: 'Build one repeating AI process',
  brief: 'A daily or weekly job an AI tool does for the business, every time, without you rewriting it.',
  doneWhen: 'The process has run at least twice on schedule.',
  coach:
  'Write the prompt once, run it on a schedule. This is where your time starts coming back.',
  xp: 110,
  tasks: [
  'Pick the repeating job',
  'Write the reusable prompt or recipe',
  'Run it twice on schedule']

},
{
  id: '4.4',
  phase: 'grow',
  room: 'market',
  title: 'Close a real negotiation',
  brief: 'A real back-and-forth with documented terms both sides agreed to.',
  doneWhen: 'The agreed terms are written down and both sides have a copy.',
  coach:
  'Ask for something: a better price, a bulk order, a stall at a market. Then write the deal down.',
  xp: 120,
  tasks: [
  'Prepare your ask and your walk-away',
  'Run the negotiation',
  'Document the terms both sides agreed']

},
{
  id: '4.5',
  phase: 'grow',
  room: 'command',
  title: 'Present your financials to the board',
  brief:
  'Parents plus a non-family adult sit as your board. You present the numbers like a founder.',
  doneWhen: 'The board meeting happened and the board asked at least two questions.',
  coach:
  'Pull your P&L into a board pack. Lead with the number, then the story behind it.',
  xp: 150,
  tasks: [
  'Assemble the board pack from your ledger',
  'Present revenue, costs and profit',
  'Answer at least two board questions']

},

// ── PHASE 05 · SCALE ──────────────────────────────────────────────
{
  id: '5.1',
  phase: 'scale',
  room: 'command',
  title: 'Automate one real part of the business',
  brief: 'An agent or automation doing a real job — and you can show it running.',
  doneWhen: 'The automation runs live in front of a witness.',
  coach:
  'Wire the automation into your Command Deck and let it work while you watch.',
  xp: 140,
  tasks: [
  'Choose the part of the business to automate',
  'Build the automation',
  'Show it running live']

},
{
  id: '5.2',
  phase: 'scale',
  room: 'product',
  title: 'Delegate a task with written instructions',
  brief: 'Someone else does a real job for your business using only what you wrote down.',
  doneWhen: 'The task got done correctly by someone else, from your instructions alone.',
  coach:
  'Write the instructions in the Delivery Bay, hand them over, and do not rescue them.',
  xp: 120,
  tasks: [
  '@delivery Set up the delivery system so it can be handed over',
  'Write instructions someone else can follow',
  'Hand it off and check the result']

},
{
  id: '5.3',
  phase: 'scale',
  room: 'product',
  title: 'Take a week off — stay open',
  brief: 'Customers still get served through a week you did not work.',
  doneWhen: 'A week passed with no founder hours and at least one customer served.',
  coach:
  'Your systems go on trial. Turn on auto-delivery, hand off the rest, and step away.',
  xp: 150,
  tasks: [
  'Set the systems and the cover before you leave',
  'Take the full week off',
  'Show a customer served while you were away']

},
{
  id: '5.4',
  phase: 'scale',
  room: 'workshop',
  title: 'Write the one-page playbook',
  brief: 'One page that lets someone else run your business.',
  doneWhen: 'A stranger could run a week of the business from the page alone.',
  coach:
  'Everything you know, on one page: the offer, the process, the numbers, the rules.',
  xp: 130,
  tasks: [
  'Write the offer and the process',
  'Add the numbers and the rules',
  'Have someone read it back to you']

},
{
  id: '5.5',
  phase: 'scale',
  room: 'workshop',
  title: 'Pitch next year, on stage',
  brief:
  'The Capstone Showcase: five people, two of them non-family adults, and a real stage moment.',
  doneWhen: 'You pitched what the business becomes next year, live, to that audience.',
  coach:
  'Last step. Show where the business goes next and what it takes to get to $10,000 in profit.',
  xp: 200,
  tasks: [
  'Write the next-year plan and the path to $10,000 profit',
  'Rehearse the stage pitch',
  'Deliver it to the Capstone audience']

}];


export const stepById = (id: string): Step | undefined =>
STEPS.find((s) => s.id === id);

export const parseTask = (
raw: string)
: {label: string;auto?: ArtifactKey;} => {
  const match = raw.match(/^@(website|checkout|delivery|ledger)\s+(.*)$/);
  if (match) return { label: match[2], auto: match[1] as ArtifactKey };
  return { label: raw };
};