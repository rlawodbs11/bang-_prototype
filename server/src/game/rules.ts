import type { Card, CardType, Role } from '@bang/shared';
import type { ServerGameState, ServerPlayer } from './types.js';

export const ROLE_TABLE: Record<number, Role[]> = {
  4: ['SHERIFF', 'RENEGADE', 'OUTLAW', 'OUTLAW'],
  5: ['SHERIFF', 'RENEGADE', 'OUTLAW', 'OUTLAW', 'DEPUTY'],
  6: ['SHERIFF', 'RENEGADE', 'OUTLAW', 'OUTLAW', 'OUTLAW', 'DEPUTY'],
  7: ['SHERIFF', 'RENEGADE', 'OUTLAW', 'OUTLAW', 'OUTLAW', 'DEPUTY', 'DEPUTY'],
};

const WEAPON_RANGES: Partial<Record<CardType, number>> = {
  WEAPON_VOLCANIC: 1,
  WEAPON_SCHOFIELD: 2,
  WEAPON_REMINGTON: 3,
  WEAPON_CARABINE: 4,
  WEAPON_WINCHESTER: 5,
};

export const EQUIPMENT_TYPES: ReadonlySet<CardType> = new Set([
  'BARREL',
  'MUSTANG',
  'SCOPE',
  'JAIL',
  'DYNAMITE',
  'WEAPON_VOLCANIC',
  'WEAPON_SCHOFIELD',
  'WEAPON_REMINGTON',
  'WEAPON_CARABINE',
  'WEAPON_WINCHESTER',
]);

const DYNAMITE_RANKS = new Set(['2', '3', '4', '5', '6', '7', '8', '9']);

export function isWeapon(type: CardType): boolean {
  return type in WEAPON_RANGES;
}

export function isEquipment(type: CardType): boolean {
  return EQUIPMENT_TYPES.has(type);
}

export function hasEquipped(
  player: Pick<ServerPlayer, 'equipped'>,
  type: CardType
): boolean {
  return player.equipped.some((c) => c.type === type);
}

export function isDynamiteExplosion(card: Card): boolean {
  return card.suit === 'SPADES' && DYNAMITE_RANKS.has(card.rank);
}

export function weaponRange(player: Pick<ServerPlayer, 'equipped'>): number {
  for (const card of player.equipped) {
    const range = WEAPON_RANGES[card.type];
    if (range !== undefined) {
      return range;
    }
  }
  return 1;
}

export function hasVolcanic(player: Pick<ServerPlayer, 'equipped'>): boolean {
  return player.equipped.some((c) => c.type === 'WEAPON_VOLCANIC');
}

export function canPlayUnlimitedBang(
  player: Pick<ServerPlayer, 'equipped' | 'character'>
): boolean {
  return hasVolcanic(player) || player.character === 'WILLY_THE_KID';
}

export function distance(state: ServerGameState, fromId: string, toId: string): number {
  if (fromId === toId) return 0;

  const alive = state.players
    .filter((p) => p.isAlive)
    .sort((a, b) => a.seatIndex - b.seatIndex);

  const fromIdx = alive.findIndex((p) => p.id === fromId);
  const toIdx = alive.findIndex((p) => p.id === toId);

  if (fromIdx === -1 || toIdx === -1) {
    return Infinity;
  }

  const diff = Math.abs(fromIdx - toIdx);
  let dist = Math.min(diff, alive.length - diff);

  const fromPlayer = alive[fromIdx];
  const toPlayer = alive[toIdx];

  if (toPlayer.equipped.some((c) => c.type === 'MUSTANG')) {
    dist += 1;
  }
  if (toPlayer.character === 'PAUL_REGRET') {
    dist += 1;
  }
  if (fromPlayer.equipped.some((c) => c.type === 'SCOPE')) {
    dist -= 1;
  }
  if (fromPlayer.character === 'ROSE_DOOLAN') {
    dist -= 1;
  }

  return Math.max(1, dist);
}
