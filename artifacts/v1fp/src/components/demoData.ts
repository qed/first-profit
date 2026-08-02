export type Kid = 'Ada' | 'Ben';

export type Slot = {
  day: number;
  time: string;
  mins: number;
  note?: string;
  warn?: boolean;
};

export type Activity = {
  id: string;
  title: string;
  kid: Kid;
  icon: 'swim' | 'piano' | 'football' | 'art' | 'tutor' | 'party' | 'meet';
  chaos: Slot;
  sorted: Slot;
};

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const KID_STYLES: Record<Kid, {dot: string;chip: string;label: string;}> = {
  Ada: { dot: 'bg-sky', chip: 'bg-sky/10 text-sky', label: 'Ada, 7' },
  Ben: { dot: 'bg-mint', chip: 'bg-mint/15 text-mint', label: 'Ben, 10' }
};

export const ACTIVITIES: Activity[] = [
{
  id: 'swim',
  title: 'Swim class',
  kid: 'Ada',
  icon: 'swim',
  chaos: { day: 0, time: '4:15pm', mins: 975, note: 'who is driving??' },
  sorted: { day: 0, time: '4:15pm', mins: 975, note: 'Priya drives' }
},
{
  id: 'piano',
  title: 'Piano lesson',
  kid: 'Ben',
  icon: 'piano',
  chaos: { day: 0, time: '4:15pm', mins: 975, note: 'other side of town' },
  sorted: { day: 1, time: '4:15pm', mins: 975, note: 'walks from school' }
},
{
  id: 'football',
  title: 'Football practice',
  kid: 'Ben',
  icon: 'football',
  chaos: { day: 1, time: '5:00pm', mins: 1020 },
  sorted: { day: 1, time: '5:30pm', mins: 1050, note: 'straight after piano' }
},
{
  id: 'art',
  title: 'Art club',
  kid: 'Ada',
  icon: 'art',
  chaos: { day: 1, time: '5:00pm', mins: 1020, note: 'clashes with football' },
  sorted: { day: 3, time: '4:00pm', mins: 960, note: 'same room as tutoring' }
},
{
  id: 'tutor',
  title: 'Maths tutoring',
  kid: 'Ada',
  icon: 'tutor',
  chaos: { day: 2, time: '4:30pm', mins: 990 },
  sorted: { day: 3, time: '5:00pm', mins: 1020, note: 'one trip, two kids' }
},
{
  id: 'party',
  title: "Noor's birthday",
  kid: 'Ben',
  icon: 'party',
  chaos: { day: 4, time: '3:00pm', mins: 900, note: 'gift not bought', warn: true },
  sorted: { day: 4, time: '3:00pm', mins: 900, note: 'gift ordered ✓' }
},
{
  id: 'meet',
  title: 'Swim meet',
  kid: 'Ada',
  icon: 'meet',
  chaos: { day: 5, time: '8:30am', mins: 510, note: 'overlaps football' },
  sorted: { day: 5, time: '8:30am', mins: 510, note: 'Dey family drives' }
},
{
  id: 'match',
  title: 'Football match',
  kid: 'Ben',
  icon: 'football',
  chaos: { day: 5, time: '8:30am', mins: 510, note: 'two places at once' },
  sorted: { day: 5, time: '11:00am', mins: 660, note: 'moved with the coach' }
}];