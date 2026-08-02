import type { PhaseId, RoomId } from './path';

export interface Room {
  id: RoomId;
  name: string;
  tagline: string;
  /** Percentage position on the factory floor. */
  x: number;
  y: number;
  w: number;
  h: number;
  phase: PhaseId;
  /** Emoji used as the pod's shop sign. */
  sign: string;
  /** The criterion that must pass before this pod opens. Undefined = open from day one. */
  unlockAfter?: string;
  /** Shown on the locked pod so the kid knows what is coming. */
  lockedHint: string;
}

export const ROOMS: Room[] = [
{
  id: 'idea',
  name: 'The Idea Room',
  tagline: 'Pick one thing to sell. Say it in a sentence.',
  x: 6,
  y: 8,
  w: 25,
  h: 30,
  phase: 'sell',
  sign: '💡',
  lockedHint: 'Open from day one'
},
{
  id: 'website',
  name: 'Your Site',
  tagline: 'Live already. Make it yours.',
  x: 37,
  y: 6,
  w: 26,
  h: 26,
  phase: 'sell',
  sign: '🌐',
  lockedHint: 'Open from day one'
},
{
  id: 'checkout',
  name: 'The Checkout Booth',
  tagline: 'Take real money. Backers get store credit.',
  x: 69,
  y: 8,
  w: 25,
  h: 30,
  phase: 'sell',
  sign: '💳',
  lockedHint: 'Open from day one'
},
{
  id: 'market',
  name: 'The Market Stall',
  tagline: 'Strangers, asks, yeses and nos.',
  x: 6,
  y: 45,
  w: 25,
  h: 24,
  phase: 'sell',
  sign: '🛒',
  unlockAfter: '1.1',
  lockedHint: 'Pitch to one adult first'
},
{
  id: 'workshop',
  name: 'The Workshop Room',
  tagline: 'Short workshops. One skill each.',
  x: 36,
  y: 39,
  w: 28,
  h: 26,
  phase: 'build',
  sign: '🎓',
  unlockAfter: '1.2',
  lockedHint: 'Make your first sale first'
},
{
  id: 'command',
  name: 'The Command Deck',
  tagline: 'Your dashboard, P&L and profit path.',
  x: 69,
  y: 45,
  w: 25,
  h: 24,
  phase: 'grow',
  sign: '📊',
  unlockAfter: '1.2',
  lockedHint: 'Make your first sale first'
},
{
  id: 'product',
  name: 'The Product Room',
  tagline: 'Unit economics and delivery.',
  x: 12,
  y: 76,
  w: 30,
  h: 20,
  phase: 'validate',
  sign: '📦',
  unlockAfter: '1.3',
  lockedHint: 'Collect three nos first'
},
{
  id: 'build',
  name: 'The Building Room',
  tagline: 'Ship the smallest thing that works.',
  x: 58,
  y: 76,
  w: 30,
  h: 20,
  phase: 'build',
  sign: '🔨',
  unlockAfter: '1.5',
  lockedHint: 'Finish Sell to start building'
}];


export const roomById = (id: RoomId): Room => ROOMS.find((r) => r.id === id) as Room;

/** Where the avatar stands when visiting a pod. */
export const doorOf = (room: Room) => ({ x: room.x + room.w / 2, y: room.y + room.h + 3 });