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

export interface TaskInput {
  key: string;
  label: string;
  placeholder: string;
  long?: boolean;
}

export interface UnitTask {
  id: string;
  label: string;
  /** Kid-facing instructions for the one thing to do right now. */
  how: string;
  doneWhen: string;
  minutes: number;
  input?: TaskInput;
  auto?: ArtifactKey;
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
  tasks: UnitTask[];
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


export const phaseById = (id: PhaseId): Phase => PHASES.find((p) => p.id === id) as Phase;

/** Compact builder for the later phases: [label, how, doneWhen]. */
const quick = (
stepId: string,
rows: [string, string, string][],
extras: Record<number, Partial<UnitTask>> = {})
: UnitTask[] =>
rows.map(([label, how, doneWhen], i) => ({
  id: `${stepId}.${i + 1}`,
  label,
  how,
  doneWhen,
  minutes: 20,
  ...(extras[i + 1] ?? {})
}));

export const STEPS: Step[] = [
// ── PHASE 01 · SELL — fully authored, 5 steps × 5 unit tasks ──────
{
  id: '1.1',
  phase: 'sell',
  room: 'idea',
  title: 'Pitch a product in 60 seconds, no notes',
  brief:
  'Five small tasks. At the end of them you can pitch something to a grown-up you are not related to, without reading anything.',
  doneWhen: 'A non-family adult can say back what your product is and what you asked them to do.',
  coach:
  'This is square one. You do not need a company, a website or an idea worth millions. You need one thing to sell and one sentence about it.',
  xp: 60,
  tasks: [
  {
    id: '1.1.1',
    label: 'Pick the product',
    how: 'Choose one thing you could sell this week. Something you make, something you can do for people, or something you already own and would happily sell. Then write one sentence: what it is, who it is for, and why they would want it.',
    doneWhen: 'Your one-liner is written down and you can say it without looking.',
    minutes: 10,
    input: {
      key: 'oneLiner',
      label: 'Your one-liner',
      placeholder: 'Team-colour friendship bracelets for kids who want to trade at practice.'
    }
  },
  {
    id: '1.1.2',
    label: 'Write the 60-second pitch',
    how: 'Four beats, 150 words max. Hook (make them look up), what it is (plainly), why it is good (the problem it kills), the ask (exactly what you want them to do).',
    doneWhen: 'The written pitch reads aloud in under 60 seconds.',
    minutes: 20,
    input: {
      key: 'pitch',
      label: 'Your 60-second pitch',
      placeholder:
      'Ever lost a friendship bracelet the day after you made it? Mine are stitched...',
      long: true
    }
  },
  {
    id: '1.1.3',
    label: 'Rehearse until note-free and filler-free',
    how: 'Record yourself on a phone. Watch it back and count your "um"s and "like"s. Run it again until you get three clean takes in a row — no notes, no fillers, under 60 seconds.',
    doneWhen: 'You have three clean, note-free runs in a row on video.',
    minutes: 25
  },
  {
    id: '1.1.4',
    label: 'Cold pitch a parent',
    how: 'Pitch a parent who plays a real, slightly grumpy customer. They must give you one honest objection. Then change one thing in your pitch because of it.',
    doneWhen: 'You wrote down the objection and the one thing you changed.',
    minutes: 15,
    input: {
      key: 'objection',
      label: 'Their objection → your fix',
      placeholder: '“Too expensive.” → I say the team colours first, price last.'
    }
  },
  {
    id: '1.1.5',
    label: 'Cold pitch a non-family adult, no notes',
    how: 'A neighbour, a coach, a family friend — an adult who does not live with you. Pitch them live, no notes, under 60 seconds. Then ask them to say back what it is and what you asked for.',
    doneWhen: 'Their say-back matches your pitch, and a parent watched it happen.',
    minutes: 20,
    input: {
      key: 'firstAudience',
      label: 'Who you pitched',
      placeholder: 'Coach Mel, after Tuesday practice'
    }
  }]

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
  'Ten names, one rehearsal, then ask until somebody says yes. Most people say no. You only need one.',
  xp: 120,
  tasks: [
  {
    id: '1.2.1',
    label: 'Choose the offer and set the price',
    how: 'Decide exactly what one unit is and what it costs. Write one sentence on how you picked the price.',
    doneWhen: 'The offer, the unit and the price are written down.',
    minutes: 15,
    input: {
      key: 'offer',
      label: 'One unit is…',
      placeholder: 'One woven bracelet in your team colours — $12'
    }
  },
  {
    id: '1.2.2',
    label: 'Build a list of ten people to ask',
    how: 'With a parent, list ten real people or households who are not family, and how you will safely reach each one.',
    doneWhen: 'Ten names with a channel each, approved by a parent.',
    minutes: 20
  },
  {
    id: '1.2.3',
    label: 'Set up how money changes hands',
    how: 'Cash box with float, a parent-held transfer, or your First Profit checkout link. Decide it now, before anyone says yes.',
    doneWhen: 'You can name exactly how a customer pays you and how they get the product.',
    minutes: 15
  },
  {
    id: '1.2.4',
    label: 'Dress rehearse the whole sale',
    how: 'A parent plays the buyer. Run it start to finish: greeting, ask, payment, delivery, thank-you. No stopping halfway.',
    doneWhen: 'The rehearsal ran all the way through without a restart.',
    minutes: 15
  },
  {
    id: '1.2.5',
    label: 'Ask until one yes',
    how: 'Work your list. Real asks, parent nearby. Keep going until one real person pays you real money — then log the sale at the Market Stall.',
    doneWhen: 'A non-family customer has paid and the sale is in your ledger.',
    minutes: 45
  }]

},
{
  id: '1.3',
  phase: 'sell',
  room: 'market',
  title: 'Hear "no" three times',
  brief: 'Three real nos, each with the lesson written under it. Nos are data, not damage.',
  doneWhen: 'Three nos are logged with a lesson under each, and you named the pattern.',
  coach:
  'Everybody flinches at the first no. The trick is one follow-up question: "What would have made it a yes?"',
  xp: 70,
  tasks: [
  {
    id: '1.3.1',
    label: 'Guess the three nos before you hear them',
    how: 'Write the three reasons you think people will say no. You are going to check your guesses against real life.',
    doneWhen: 'Three predicted nos are written down.',
    minutes: 10,
    input: {
      key: 'predictedNos',
      label: 'Your three guesses',
      placeholder: 'Too expensive · already has one · does not know me',
      long: true
    }
  },
  {
    id: '1.3.2',
    label: 'Log no #1 and its lesson',
    how: 'After the no, ask: "What would have made it a yes?" Write the answer in the No Ledger the same day.',
    doneWhen: 'No #1 and its lesson are in the ledger.',
    minutes: 10
  },
  {
    id: '1.3.3',
    label: 'Log no #2 and its lesson',
    how: 'Same again. Do not argue with a no — collect it.',
    doneWhen: 'No #2 and its lesson are in the ledger.',
    minutes: 10
  },
  {
    id: '1.3.4',
    label: 'Log no #3 and its lesson',
    how: 'Three is where the pattern starts showing up.',
    doneWhen: 'No #3 and its lesson are in the ledger.',
    minutes: 10
  },
  {
    id: '1.3.5',
    label: 'Name the pattern and change one thing',
    how: 'Read your three nos together. What do they have in common? Change exactly one thing about your offer or your pitch because of it.',
    doneWhen: 'The pattern and the one change are written down.',
    minutes: 15,
    input: {
      key: 'noPattern',
      label: 'The pattern → the change',
      placeholder: 'They all wanted to see it first → I carry two finished samples now.'
    }
  }]

},
{
  id: '1.4',
  phase: 'sell',
  room: 'product',
  title: 'Explain cost, price and profit on one page',
  brief: 'What one costs you, what you charge, what is left. One page, your own words.',
  doneWhen: 'The one-pager exists and you can explain it out loud without reading it.',
  coach:
  'Profit is not a mystery. It is the gap between two numbers you control. Find your gap.',
  xp: 80,
  tasks: [
  {
    id: '1.4.1',
    label: 'List every cost in one unit',
    how: 'Materials, packaging, fees — and your time. Add them up for exactly one unit.',
    doneWhen: 'The cost of one unit is written down with every part listed.',
    minutes: 15
  },
  {
    id: '1.4.2',
    label: 'Set your price and say why',
    how: 'Use the Unit Economics Bench in the Product Room. Aim for at least three times your cost.',
    doneWhen: 'The price is set and you wrote one sentence on why.',
    minutes: 10
  },
  {
    id: '1.4.3',
    label: 'Do the profit math',
    how: 'Price minus cost equals profit per unit. Then work out how many units get you to $1,000.',
    doneWhen: 'Profit per unit and units-to-$1,000 are both written down.',
    minutes: 10
  },
  {
    id: '1.4.4',
    label: 'Write the one-pager',
    how: 'One page: what it costs, what you charge, what you keep, and how many you need to sell.',
    doneWhen: 'The page is in your Founder File.',
    minutes: 20
  },
  {
    id: '1.4.5',
    label: 'Explain it out loud, no reading',
    how: 'Say the whole page to your coach from memory. If you get stuck, the page is too complicated — simplify it.',
    doneWhen: 'You explained it without looking at the page.',
    minutes: 10
  }]

},
{
  id: '1.5',
  phase: 'sell',
  room: 'market',
  title: '25 supervised outreach attempts',
  brief: 'A booth, door to door, calls, messages — 25 real attempts with a parent present.',
  doneWhen: 'The tally reads 25 with a channel and an outcome on each.',
  coach: 'This is the grind that makes the rest easy. Every knock counts, yes or no.',
  xp: 100,
  tasks: [
  {
    id: '1.5.1',
    label: 'Pick your channels and get them approved',
    how: 'Choose two or three ways to reach people — a stall, doors on your street, calls to known adults, parent-approved messages.',
    doneWhen: 'Your channels are written down and a parent approved them.',
    minutes: 10,
    input: {
      key: 'channels',
      label: 'Your channels',
      placeholder: 'Saturday stall at the rink · doors on our street · team group chat'
    }
  },
  {
    id: '1.5.2',
    label: 'Warm up: attempts 1–5',
    how: 'The first five are the hardest. Tally each one at the Market Stall as you go.',
    doneWhen: 'The tally reads 5.',
    minutes: 30
  },
  {
    id: '1.5.3',
    label: 'Attempts 6–15',
    how: 'You will notice your pitch getting shorter and better. Let it.',
    doneWhen: 'The tally reads 15.',
    minutes: 45
  },
  {
    id: '1.5.4',
    label: 'Attempts 16–25',
    how: 'Finish the set. Do not stop on a no.',
    doneWhen: 'The tally reads 25.',
    minutes: 45
  },
  {
    id: '1.5.5',
    label: 'Write what converted best',
    how: 'Which channel produced the most yeses per attempt? That is where you spend your time from now on.',
    doneWhen: 'The winning channel and the reason are written down.',
    minutes: 10,
    input: {
      key: 'bestChannel',
      label: 'What worked best',
      placeholder: 'The rink stall — people could touch it before deciding.'
    }
  }]

},

// ── PHASE 02 · BUILD ──────────────────────────────────────────────
{
  id: '2.1',
  phase: 'build',
  room: 'build',
  title: 'Ship the smallest thing that works',
  brief: 'A working product, site or offer with a live URL, a price and instructions.',
  doneWhen: 'A stranger could find it, understand it and buy it without you in the room.',
  coach: 'Strip it to the one job it does for one person. Ship that.',
  xp: 140,
  tasks: quick(
    '2.1',
    [
    [
    'Cut the idea down to one job',
    'Use the Scope Cutter. Keep only what one customer needs to get value once.',
    'v1 is one or two things, not five.'],

    [
    'Build v1 with your AI tools',
    'One sitting. If it takes longer than a weekend, it is still too big.',
    'v1 exists and works.'],

    [
    'Write the buyer instructions',
    'What they get, how they get it, and what to do if it goes wrong.',
    'A stranger could follow it without asking you.'],

    [
    'Put it on your site at a real price',
    'Your firstprofit.school page is already live — add the product to it.',
    'The price is visible on your page.'],

    [
    'Publish it at your live URL',
    'Hit publish in the Website Studio and send the link to one person.',
    'The link works on someone else’s phone.']],


    { 5: { auto: 'website' } }
  )
},
{
  id: '2.2',
  phase: 'build',
  room: 'idea',
  title: 'Connect the product to a real gap',
  brief: 'A one-page brief on a gap you spotted in a world you actually know.',
  doneWhen: 'The brief names the gap, who feels it, and how your product closes it.',
  coach: 'You know a world adults do not. Sell into that world.',
  xp: 80,
  tasks: quick('2.2', [
  [
  'Name the domain you know well',
  'Your sport, your school, your street, your game.',
  'The domain is named in one line.'],

  [
  'Describe the gap and who feels it',
  'Who is annoyed, and how often?',
  'The gap and the person are both written down.'],

  [
  'Show how your product closes it',
  'Draw the before and the after.',
  'The brief fits on one page.']]

  )
},
{
  id: '2.3',
  phase: 'build',
  room: 'market',
  title: 'Contact 40 potential customers',
  brief: 'Forty real contacts, plus one piece of marketing you launch and measure.',
  doneWhen: 'The contact tally reads 40 and your marketing has numbers attached.',
  coach: 'Volume first, cleverness second.',
  xp: 120,
  tasks: quick('2.3', [
  ['Reach 40 contacts on the tally', 'Tally each one at the Market Stall.', 'The tally reads 40.'],
  [
  'Launch one piece of marketing',
  'A poster, a post, a flyer, a stall sign — one thing, launched.',
  'It is live where real people see it.'],

  [
  'Record the metric it produced',
  'Views, scans, calls, sales. Any real number.',
  'The number is written down next to the thing you launched.']]

  )
},
{
  id: '2.4',
  phase: 'build',
  room: 'build',
  title: 'Ship a v2 from real feedback',
  brief: 'Three real users tell you what is wrong. You change it and ship again.',
  doneWhen: 'v2 is live and each change traces back to a user.',
  coach: 'Feedback in, version out.',
  xp: 110,
  tasks: quick('2.4', [
  [
  'Collect feedback from three real users',
  'Ask: what nearly stopped you buying?',
  'Three pieces of feedback are logged.'],

  ['Choose the three changes worth making', 'Ignore the ones only you care about.', 'Three changes are chosen.'],
  ['Ship v2 and tell the users', 'Message each person and say what you changed.', 'v2 is live and the three users know.']]
  )
},
{
  id: '2.5',
  phase: 'build',
  room: 'workshop',
  title: 'Give a 3–5 minute live demo',
  brief: 'The build, the results, the lessons — live, with a non-family adult watching.',
  doneWhen: 'The demo happened and the recording is in your Founder File.',
  coach: 'A demo is a story with numbers in the middle.',
  xp: 120,
  tasks: quick('2.5', [
  ['Write the three-beat script', 'Built it · what happened · what I learned.', 'The script is written.'],
  ['Rehearse it to time', 'Under five minutes, out loud, twice.', 'You hit the time twice in a row.'],
  ['Deliver it live and record it', 'One non-family adult in the room, minimum.', 'The recording exists.']]
  )
},

// ── PHASE 03 · VALIDATE ───────────────────────────────────────────
{
  id: '3.1',
  phase: 'validate',
  room: 'product',
  title: 'Run two validation loops',
  brief: 'Hypothesis, test, outcome. Twice. Write the outcome even when you were wrong.',
  doneWhen: 'Two complete loops are logged with an honest outcome on each.',
  coach: 'Guess out loud, then run the smallest test that could prove you wrong.',
  xp: 110,
  tasks: quick('3.1', [
  ['Loop 1: write the hypothesis', 'One sentence starting with "If I…".', 'The guess is written before the test.'],
  ['Loop 1: run it and log the outcome', 'Honest numbers, even ugly ones.', 'The outcome is logged.'],
  ['Loop 2: write the hypothesis', 'Base it on what loop 1 taught you.', 'The guess is written.'],
  ['Loop 2: run it and log the outcome', 'Then say which guess was closer.', 'The outcome is logged.']]
  )
},
{
  id: '3.2',
  phase: 'validate',
  room: 'checkout',
  title: 'Run a pricing experiment',
  brief: 'Two price points, the margin math for each, feedback from two groups.',
  doneWhen: 'You can say which price wins and show the math.',
  coach: 'Watch what people do, not what they say.',
  xp: 100,
  tasks: quick(
    '3.2',
    [
    ['Put a working checkout live', 'Your First Profit checkout is already connected.', 'The checkout takes a payment.'],
    ['Test price A', 'Show it to one group and record what happened.', 'Price A has a result next to it.'],
    ['Test price B', 'A different group, a different price.', 'Price B has a result next to it.'],
    ['Pick the winner and show the math', 'Most profit, not most sales.', 'The winning price and its margin are written down.']],

    { 1: { auto: 'checkout' } }
  )
},
{
  id: '3.3',
  phase: 'validate',
  room: 'workshop',
  title: 'Audit your AI tools',
  brief: 'Three tools: why you picked them, what they made, whether they stay.',
  doneWhen: 'Three tools are audited with a keep-or-cut call each.',
  coach: 'Tools are staff. If one is not earning its keep, fire it.',
  xp: 80,
  tasks: quick('3.3', [
  ['List every tool you have used', 'Since day one.', 'The list exists.'],
  ['Write the rationale and outcome for three', 'Why you picked it, what it actually produced.', 'Three are written up.'],
  ['Make a keep-or-cut call on each', 'No maybes.', 'Each tool says KEEP or CUT.']]
  )
},
{
  id: '3.4',
  phase: 'validate',
  room: 'product',
  title: 'Choose a validation path solo',
  brief: 'No adult help. You pick it, you run it, you present it.',
  doneWhen: 'You presented the decision and the result at a Family Demo Session.',
  coach: 'This one is yours alone. Defend the choice.',
  xp: 120,
  tasks: quick('3.4', [
  ['Choose the path with no adult input', 'Write down why before you start.', 'The choice and reason are written.'],
  ['Run it start to finish', 'No rescuing allowed.', 'It ran to the end.'],
  ['Present the reasoning and outcome', 'At a scheduled Family Demo Session.', 'You presented and took questions.']]
  )
},
{
  id: '3.5',
  phase: 'validate',
  room: 'website',
  title: 'Publish two pieces of content',
  brief: 'Two posts, videos or pages that pull engagement from outside your household.',
  doneWhen: 'Both are published with real external engagement.',
  coach: 'Content is the cheapest way to get strangers to look at you.',
  xp: 90,
  tasks: quick(
    '3.5',
    [
    ['Publish piece one', 'From the Website Studio.', 'It is live at your URL.'],
    ['Publish piece two', 'Different angle, same audience.', 'It is live at your URL.'],
    ['Log the engagement each pulled', 'Views, comments, messages from outside your house.', 'Numbers are written next to each piece.']],

    { 1: { auto: 'website' } }
  )
},

// ── PHASE 04 · GROW ───────────────────────────────────────────────
{
  id: '4.1',
  phase: 'grow',
  room: 'checkout',
  title: '10 sales or 3 repeat customers',
  brief: 'Proof this is a business and not a one-off favour.',
  doneWhen: 'Ten sales, or three customers who bought twice.',
  coach: 'Every completed payment pushes the $1,000 bar.',
  xp: 160,
  tasks: quick(
    '4.1',
    [
    ['Take payments through your checkout', 'First Profit handles the money and pays it out.', 'At least one payment has cleared.'],
    ['Reach ten sales or three repeats', 'Watch the ledger fill.', 'The ledger shows it.'],
    ['Thank every customer by name', 'Repeat customers come from thank-yous.', 'Every customer has been thanked.']],

    { 1: { auto: 'checkout' } }
  )
},
{
  id: '4.2',
  phase: 'grow',
  room: 'command',
  title: 'Track a P&L for four weeks',
  brief: 'Money in, money out, what is left. Four weeks in a row.',
  doneWhen: 'Four weeks of numbers are logged with a total.',
  coach: 'Log the ugly weeks too — those are the ones the board asks about.',
  xp: 130,
  tasks: quick(
    '4.2',
    [
    ['Open the P&L ledger', 'On the Command Deck.', 'The ledger is open.'],
    ['Log four consecutive weeks', 'Every week, even the zero ones.', 'Four weeks are in.'],
    ['Write what the numbers say', 'One honest sentence.', 'The sentence is written under the total.']],

    { 1: { auto: 'ledger' } }
  )
},
{
  id: '4.3',
  phase: 'grow',
  room: 'command',
  title: 'Build one repeating AI process',
  brief: 'A daily or weekly job an AI tool does the same way every time.',
  doneWhen: 'The process has run at least twice on schedule.',
  coach: 'Write the prompt once, run it forever.',
  xp: 110,
  tasks: quick('4.3', [
  ['Pick the repeating job', 'The most boring thing you do twice a week.', 'The job is named.'],
  ['Write the reusable prompt', 'Inputs spelled out so it works without you rewriting it.', 'The prompt is saved.'],
  ['Run it twice on schedule', 'Check both outputs.', 'Two runs are done.']]
  )
},
{
  id: '4.4',
  phase: 'grow',
  room: 'market',
  title: 'Close a real negotiation',
  brief: 'A real back-and-forth with terms both sides agreed to.',
  doneWhen: 'The terms are written down and both sides have a copy.',
  coach: 'Know your walk-away before you open your mouth.',
  xp: 120,
  tasks: quick('4.4', [
  ['Prepare your ask and your walk-away', 'Write both numbers down first.', 'Both are written.'],
  ['Run the negotiation', 'Parent present, real counterparty.', 'It happened.'],
  ['Document the terms', 'Both sides get a copy.', 'The written terms exist.']]
  )
},
{
  id: '4.5',
  phase: 'grow',
  room: 'command',
  title: 'Present your financials to the board',
  brief: 'Parents plus a non-family adult sit as your board.',
  doneWhen: 'The board meeting happened and they asked at least two questions.',
  coach: 'Lead with the number, then the story behind it.',
  xp: 150,
  tasks: quick('4.5', [
  ['Assemble the board pack', 'Straight from your ledger.', 'The pack is printed or on screen.'],
  ['Present revenue, costs and profit', 'Five minutes, no waffle.', 'You presented all three.'],
  ['Answer two board questions', 'It is fine to say "I will find out".', 'Two questions were asked and answered.']]
  )
},

// ── PHASE 05 · SCALE ──────────────────────────────────────────────
{
  id: '5.1',
  phase: 'scale',
  room: 'command',
  title: 'Automate one real part of the business',
  brief: 'An agent or automation doing a real job — and you can show it running.',
  doneWhen: 'The automation runs live in front of a witness.',
  coach: 'Let it work while somebody watches.',
  xp: 140,
  tasks: quick('5.1', [
  ['Choose what to automate', 'Pick the job that steals the most time.', 'The job is named.'],
  ['Build the automation', 'Wire it into your dashboard.', 'It exists and runs.'],
  ['Show it running live', 'In front of one witness.', 'They saw it run.']]
  )
},
{
  id: '5.2',
  phase: 'scale',
  room: 'product',
  title: 'Delegate a task with written instructions',
  brief: 'Someone else does a real job using only what you wrote.',
  doneWhen: 'The task got done correctly, from your instructions alone.',
  coach: 'Hand it over and do not rescue them.',
  xp: 120,
  tasks: quick(
    '5.2',
    [
    ['Set up the delivery system', 'So it can be handed over at all.', 'Delivery is switched on.'],
    ['Write instructions someone else can follow', 'No steps living only in your head.', 'The instructions are written.'],
    ['Hand it off and check the result', 'Silence while they work.', 'They finished it correctly.']],

    { 1: { auto: 'delivery' } }
  )
},
{
  id: '5.3',
  phase: 'scale',
  room: 'product',
  title: 'Take a week off — stay open',
  brief: 'Customers still get served through a week you did not work.',
  doneWhen: 'A week passed with no founder hours and a customer still got served.',
  coach: 'Your systems go on trial. Step away.',
  xp: 150,
  tasks: quick('5.3', [
  ['Set the systems and the cover', 'Auto-delivery on, instructions handed over.', 'Everything is set before you leave.'],
  ['Take the full week off', 'No sneaky checking.', 'Seven days passed.'],
  ['Show a customer served while away', 'Proof from the ledger.', 'The order is in the ledger.']]
  )
},
{
  id: '5.4',
  phase: 'scale',
  room: 'workshop',
  title: 'Write the one-page playbook',
  brief: 'One page that lets someone else run your business.',
  doneWhen: 'A stranger could run a week of it from the page alone.',
  coach: 'The offer, the process, the numbers, the rules.',
  xp: 130,
  tasks: quick('5.4', [
  ['Write the offer and the process', 'Step by step, in order.', 'Both are on the page.'],
  ['Add the numbers and the rules', 'Prices, costs, and what never to do.', 'Both are on the page.'],
  ['Have someone read it back', 'If they get confused, rewrite that line.', 'They explained it back correctly.']]
  )
},
{
  id: '5.5',
  phase: 'scale',
  room: 'workshop',
  title: 'Pitch next year, on stage',
  brief: 'Five people, two non-family adults, and a real stage moment.',
  doneWhen: 'You pitched what the business becomes next year, live.',
  coach: 'Show where it goes next and what it takes to reach $10,000 profit.',
  xp: 200,
  tasks: quick('5.5', [
  ['Write the next-year plan', 'Include the path to $10,000 profit.', 'The plan is one page.'],
  ['Rehearse the stage pitch', 'To time, out loud, three times.', 'You hit the time.'],
  ['Deliver it to the Capstone audience', 'Five people, two of them non-family adults.', 'You pitched it live.']]
  )
}];


export const stepById = (id: string): Step | undefined => STEPS.find((s) => s.id === id);

export const SELL_STEPS = STEPS.filter((s) => s.phase === 'sell');