import type { PhaseId } from './path';

export interface Workshop {
  id: string;
  title: string;
  phase: PhaseId;
  minutes: number;
  promise: string;
  beats: string[];
  takeaway: string;
}

export const WORKSHOPS: Workshop[] = [
{
  id: 'w-smallest',
  title: 'Build the smallest thing that works',
  phase: 'build',
  minutes: 25,
  promise: 'Cut your idea down until it can ship this week.',
  beats: [
  'Write the one job your product does for one person.',
  'List every feature you imagined, then cross out all but one.',
  'Build that one thing with an AI tool in a single sitting.',
  'Show it to one human before you add anything else.'],

  takeaway: 'A small thing that exists beats a big thing that does not.'
},
{
  id: 'w-20-strangers',
  title: 'Get 20 strangers to look at it',
  phase: 'validate',
  minutes: 30,
  promise: 'Attention first, opinions second, money third.',
  beats: [
  'Pick three places your customer already stands, online or in person.',
  'Write one sentence you would say out loud in each place.',
  'Ask 20 strangers to look — count looks, not compliments.',
  'Write down the first question each stranger asked you.'],

  takeaway: 'The question strangers repeat is the thing your product must answer.'
},
{
  id: 'w-no',
  title: 'How to hear "no" without flinching',
  phase: 'sell',
  minutes: 20,
  promise: 'Turn rejection into your fastest research tool.',
  beats: [
  'Practise the three most likely nos out loud with your coach.',
  'Learn the one follow-up question: "What would have made it a yes?"',
  'Log every no in the No Ledger the same day.',
  'Find the pattern after three and change one thing.'],

  takeaway: 'A no with a reason attached is worth more than a polite maybe.'
},
{
  id: 'w-price',
  title: 'Price it so it pays you',
  phase: 'validate',
  minutes: 25,
  promise: 'Know your cost, your price, and the gap that is yours.',
  beats: [
  'Add up materials, time and fees for one unit.',
  'Set a price at least three times your cost.',
  'Test a second price with a different group of people.',
  'Keep the price that makes the most profit, not the most sales.'],

  takeaway: 'Profit per unit × units sold is the only equation that matters.'
},
{
  id: 'w-first-1000',
  title: 'Your first $1,000',
  phase: 'grow',
  minutes: 35,
  promise: 'Work backwards from the number until it looks easy.',
  beats: [
  'Divide $1,000 by your price to get the number of sales you need.',
  'Multiply that by ten to get the number of asks you need.',
  'Split the asks across four weeks and put them in a calendar.',
  'Track it daily on the Command Deck.'],

  takeaway: '$1,000 is not a dream. It is a division problem with a deadline.'
},
{
  id: 'w-demo',
  title: 'Three minutes on stage',
  phase: 'build',
  minutes: 20,
  promise: 'Demo the build, the results and the lesson without rambling.',
  beats: [
  'Beat one: what I built and who it is for (45 seconds).',
  'Beat two: what actually happened when real people saw it (90 seconds).',
  'Beat three: what I learned and what I do next (45 seconds).',
  'Rehearse to a timer three times before you go live.'],

  takeaway: 'A demo is a story with numbers in the middle.'
},
{
  id: 'w-robot',
  title: 'Make the robot do it',
  phase: 'scale',
  minutes: 30,
  promise: 'Hand the boring, repeating work to an AI process.',
  beats: [
  'Track one week and mark every job you did more than twice.',
  'Pick the most boring one.',
  'Write a reusable prompt with the inputs spelled out.',
  'Run it on a schedule and check the output twice.'],

  takeaway: 'If you wrote it twice, write it once and let the robot run it.'
},
{
  id: 'w-10k',
  title: 'The road to $10,000 profit',
  phase: 'scale',
  minutes: 40,
  promise: 'Turn your first $1,000 into a repeatable plan.',
  beats: [
  'Work out your profit per unit after every fee.',
  'Find the one channel that produced most of your sales.',
  'Decide what you would need to double: units, price or channel.',
  'Write the twelve-month plan on one page.'],

  takeaway: 'Scaling is doing the one thing that worked, on purpose, again.'
}];