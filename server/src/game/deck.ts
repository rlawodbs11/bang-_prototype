import type { Card, CardType } from '@bang/shared';
import type { ServerGameState } from './types.js';

type Suit = Card['suit'];
type CardSpec = [type: CardType, suit: Suit, rank: string];

const S: Suit = 'SPADES';
const H: Suit = 'HEARTS';
const D: Suit = 'DIAMONDS';
const C: Suit = 'CLUBS';

const DECK_SPECS: CardSpec[] = [
  // BANG! (25)
  ['BANG', S, 'A'],
  ['BANG', H, 'Q'],
  ['BANG', H, 'K'],
  ['BANG', H, 'A'],
  ...(['2', '3', '4', '5', '6', '7', '8', '9'] as const).map(
    (r): CardSpec => ['BANG', C, r]
  ),
  ...(
    ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const
  ).map((r): CardSpec => ['BANG', D, r]),

  // MISSED! (12)
  ...(['10', 'J', 'Q', 'K', 'A'] as const).map(
    (r): CardSpec => ['MISSED', C, r]
  ),
  ...(['2', '3', '4', '5', '6', '7', '8'] as const).map(
    (r): CardSpec => ['MISSED', S, r]
  ),

  // BEER (6)
  ...(['6', '7', '8', '9', '10', 'J'] as const).map(
    (r): CardSpec => ['BEER', H, r]
  ),

  // STAGECOACH (2)
  ['STAGECOACH', S, '9'],
  ['STAGECOACH', S, '9'],

  // WEAPONS (8)
  ['WEAPON_VOLCANIC', S, '10'],
  ['WEAPON_VOLCANIC', C, '10'],
  ['WEAPON_SCHOFIELD', C, 'J'],
  ['WEAPON_SCHOFIELD', C, 'Q'],
  ['WEAPON_SCHOFIELD', S, 'K'],
  ['WEAPON_REMINGTON', C, 'K'],
  ['WEAPON_CARABINE', C, 'A'],
  ['WEAPON_WINCHESTER', S, '8'],

  // BLUE EQUIPMENT (9)
  ['BARREL', S, 'Q'],
  ['BARREL', S, 'K'],
  ['MUSTANG', H, '8'],
  ['MUSTANG', H, '9'],
  ['SCOPE', S, 'A'],
  ['JAIL', S, 'J'],
  ['JAIL', S, '10'],
  ['JAIL', H, '4'],
  ['DYNAMITE', H, '2'],
];

export function createDeck(): Card[] {
  return DECK_SPECS.map(([type, suit, rank], idx) => ({
    id: `c${idx + 1}`,
    type,
    suit,
    rank,
  }));
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function drawOne(state: ServerGameState): Card | null {
  if (state.deck.length === 0) {
    if (state.discard.length <= 1) {
      return null;
    }
    const top = state.discard[state.discard.length - 1];
    const recyclable = state.discard.slice(0, -1);
    state.discard = [top];
    state.deck = shuffle(recyclable);
  }

  return state.deck.pop() ?? null;
}

export function drawN(state: ServerGameState, count: number): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    const card = drawOne(state);
    if (!card) break;
    drawn.push(card);
  }
  return drawn;
}
