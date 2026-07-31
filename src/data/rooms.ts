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
}

export const ROOMS: Room[] = [
{
  id: 'idea',
  name: 'The Idea Room',
  tagline: 'Find the gap. Say it in one sentence.',
  x: 6,
  y: 8,
  w: 25,
  h: 30,
  phase: 'sell',
  sign: '💡'
},
{
  id: 'market',
  name: 'The Market Stall',
  tagline: 'Strangers, asks, yeses and nos.',
  x: 37,
  y: 6,
  w: 26,
  h: 26,
  phase: 'sell',
  sign: '🛒'
},
{
  id: 'build',
  name: 'The Building Room',
  tagline: 'Ship the smallest thing that works.',
  x: 69,
  y: 8,
  w: 25,
  h: 30,
  phase: 'build',
  sign: '🔨'
},
{
  id: 'website',
  name: 'The Website Studio',
  tagline: 'Your company, at a real URL.',
  x: 6,
  y: 45,
  w: 25,
  h: 24,
  phase: 'build',
  sign: '🌐'
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
  sign: '🎓'
},
{
  id: 'checkout',
  name: 'The Checkout Booth',
  tagline: 'Take real money with Stripe.',
  x: 69,
  y: 45,
  w: 25,
  h: 24,
  phase: 'validate',
  sign: '💳'
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
  sign: '📦'
},
{
  id: 'command',
  name: 'The Command Deck',
  tagline: 'Your dashboard, P&L and profit path.',
  x: 58,
  y: 76,
  w: 30,
  h: 20,
  phase: 'grow',
  sign: '📊'
}];


export const roomById = (id: RoomId): Room => ROOMS.find((r) => r.id === id) as Room;

/** Where the avatar stands when visiting a pod. */
export const doorOf = (room: Room) => ({ x: room.x + room.w / 2, y: room.y + room.h + 3 });