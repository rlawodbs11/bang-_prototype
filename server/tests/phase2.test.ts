import { describe, expect, it, vi } from 'vitest';
import type { Card, CardType } from '@bang/shared';
import { createDeck } from '../src/game/deck.js';
import { GameError, GameRoom } from '../src/game/GameRoom.js';
import { distance } from '../src/game/rules.js';

let seq = 1;
function makeCard(
  type: CardType,
  suit: Card['suit'] = 'SPADES',
  rank = 'A',
  id?: string
): Card {
  return {
    id: id ?? `p2_c_${seq++}`,
    type,
    suit,
    rank,
  };
}

function setupStartedRoom(count = 4): GameRoom {
  const room = new GameRoom('P2RM', vi.fn(), 20000);
  for (let i = 1; i <= count; i++) {
    room.addPlayer(`p${i}`, `Player${i}`);
  }
  room.start('p1');
  for (const p of room.state.players) {
    p.character = 'SID_KETCHUM';
    const targetHp = p.role === 'SHERIFF' ? 5 : 4;
    p.maxHp = targetHp;
    p.hp = targetHp;
    while (p.hand.length < targetHp && room.state.deck.length > 0) {
      p.hand.push(room.state.deck.pop()!);
    }
    if (p.hand.length > targetHp) {
      p.hand = p.hand.slice(0, targetHp);
    }
  }
  return room;
}

function playersBySeat(room: GameRoom) {
  return [...room.state.players].sort((a, b) => a.seatIndex - b.seatIndex);
}

describe('BANG! Phase 2 equipment and check rules', () => {
  it('applies MUSTANG (+1) and SCOPE (-1) distance modifiers in combat', () => {
    const room = setupStartedRoom(4);
    const seated = playersBySeat(room);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const sheriff = seated[sheriffIdx];
    const neighbor = seated[(sheriffIdx + 1) % 4];

    const mustang = makeCard('MUSTANG', 'HEARTS', '8');
    neighbor.equipped.push(mustang);

    expect(distance(room.state, sheriff.id, neighbor.id)).toBe(2);

    room.draw(sheriff.id);
    const bang = makeCard('BANG', 'DIAMONDS', '5');
    const scope = makeCard('SCOPE', 'SPADES', 'A');
    sheriff.hand = [bang, scope];

    // Range 1 vs distance 2 (due to MUSTANG) -> rejected
    expect(() => room.playCard(sheriff.id, bang.id, neighbor.id)).toThrow(GameError);

    // Equip SCOPE -> distance returns to 1 -> allowed
    room.playCard(sheriff.id, scope.id);
    expect(distance(room.state, sheriff.id, neighbor.id)).toBe(1);
    room.playCard(sheriff.id, bang.id, neighbor.id);
    expect(room.state.turnPhase).toBe('WAITING_FOR_RESPONSE');
  });

  it('prevents duplicate equipment of the same type and replaces old weapons into discard', () => {
    const room = setupStartedRoom(4);
    const sheriff = room.state.players.find((p) => p.role === 'SHERIFF')!;

    room.draw(sheriff.id);
    const b1 = makeCard('BARREL', 'SPADES', 'Q');
    const b2 = makeCard('BARREL', 'SPADES', 'K');
    const schofield = makeCard('WEAPON_SCHOFIELD', 'CLUBS', 'J');
    const remington = makeCard('WEAPON_REMINGTON', 'CLUBS', 'K');
    sheriff.hand = [b1, b2, schofield, remington];

    room.playCard(sheriff.id, b1.id);
    expect(() => room.playCard(sheriff.id, b2.id)).toThrow(GameError);

    room.playCard(sheriff.id, schofield.id);
    expect(sheriff.equipped.some((c) => c.id === schofield.id)).toBe(true);

    room.playCard(sheriff.id, remington.id);
    expect(sheriff.equipped.some((c) => c.id === remington.id)).toBe(true);
    expect(sheriff.equipped.some((c) => c.id === schofield.id)).toBe(false);
    expect(room.state.discard.some((c) => c.id === schofield.id)).toBe(true);
  });

  it('auto-checks BARREL on BANG (HEARTS dodges, non-HEARTS enters WAITING_FOR_RESPONSE)', () => {
    const room = setupStartedRoom(4);
    const seated = playersBySeat(room);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const sheriff = seated[sheriffIdx];
    const neighbor = seated[(sheriffIdx + 1) % 4];

    neighbor.equipped.push(makeCard('BARREL', 'SPADES', 'Q'));

    room.draw(sheriff.id);
    const vol = makeCard('WEAPON_VOLCANIC', 'SPADES', '10');
    const bang1 = makeCard('BANG', 'DIAMONDS', '2');
    const bang2 = makeCard('BANG', 'DIAMONDS', '3');
    sheriff.hand = [vol, bang1, bang2];
    room.playCard(sheriff.id, vol.id);

    const prevHp = neighbor.hp;

    // Top of deck is HEARTS -> BARREL succeeds
    room.state.deck.push(makeCard('BEER', 'HEARTS', '9', 'top_heart'));
    room.playCard(sheriff.id, bang1.id, neighbor.id);
    expect(room.state.pendingAction).toBeNull();
    expect(room.state.turnPhase).toBe('ACTION');
    expect(neighbor.hp).toBe(prevHp);
    expect(room.state.lastCheck?.reason).toBe('BARREL');
    expect(room.state.lastCheck?.success).toBe(true);

    // Top of deck is SPADES -> BARREL fails -> WAITING_FOR_RESPONSE
    room.state.deck.push(makeCard('MISSED', 'SPADES', '4', 'top_spade'));
    room.playCard(sheriff.id, bang2.id, neighbor.id);
    expect(room.state.turnPhase).toBe('WAITING_FOR_RESPONSE');
    expect(room.state.pendingAction?.targetPlayerId).toBe(neighbor.id);
    expect(room.state.lastCheck?.reason).toBe('BARREL');
    expect(room.state.lastCheck?.success).toBe(false);
  });

  it('handles JAIL targeting rules, turn skip on non-HEARTS, and escape on HEARTS', () => {
    // Case 1: fail to escape (SPADES) -> skips turn
    const r1 = setupStartedRoom(4);
    const s1 = playersBySeat(r1);
    const sheriffIdx1 = s1.findIndex((p) => p.role === 'SHERIFF');
    const sheriff1 = s1[sheriffIdx1];
    const pNext1 = s1[(sheriffIdx1 + 1) % 4];
    const pThird1 = s1[(sheriffIdx1 + 2) % 4];

    r1.draw(sheriff1.id);
    const jail1 = makeCard('JAIL', 'SPADES', 'J');
    const jail2 = makeCard('JAIL', 'SPADES', '10');
    const selfJail = makeCard('JAIL', 'HEARTS', '4');
    sheriff1.hand = [jail1, jail2, selfJail];

    // Cannot jail self
    expect(() => r1.playCard(sheriff1.id, selfJail.id, sheriff1.id)).toThrow(GameError);

    // Jail neighbor
    r1.playCard(sheriff1.id, jail1.id, pNext1.id);
    // Cannot jail already jailed player
    expect(() => r1.playCard(sheriff1.id, jail2.id, pNext1.id)).toThrow(GameError);

    // Cannot jail Sheriff (test on pNext1's turn if we let them, or simulate directly)
    sheriff1.hand = [];
    r1.state.deck.push(makeCard('BANG', 'SPADES', 'A', 'jail_fail'));
    r1.endTurn(sheriff1.id);

    expect(r1.state.currentTurnPlayerId).toBe(pThird1.id);
    expect(r1.state.discard.some((c) => c.id === jail1.id)).toBe(true);
    expect(pNext1.equipped.some((c) => c.type === 'JAIL')).toBe(false);

    // Also verify Sheriff cannot be jailed on pThird1's turn
    r1.draw(pThird1.id);
    const jailForSheriff = makeCard('JAIL', 'HEARTS', '4');
    pThird1.hand = [jailForSheriff];
    expect(() => r1.playCard(pThird1.id, jailForSheriff.id, sheriff1.id)).toThrow(GameError);

    // Case 2: escape on HEARTS -> keeps turn in DRAW phase
    const r2 = setupStartedRoom(4);
    const s2 = playersBySeat(r2);
    const sheriffIdx2 = s2.findIndex((p) => p.role === 'SHERIFF');
    const sheriff2 = s2[sheriffIdx2];
    const pNext2 = s2[(sheriffIdx2 + 1) % 4];

    r2.draw(sheriff2.id);
    const jailOk = makeCard('JAIL', 'SPADES', 'J');
    sheriff2.hand = [jailOk];
    r2.playCard(sheriff2.id, jailOk.id, pNext2.id);
    sheriff2.hand = [];
    r2.state.deck.push(makeCard('BEER', 'HEARTS', '7', 'jail_pass'));
    r2.endTurn(sheriff2.id);

    expect(r2.state.currentTurnPlayerId).toBe(pNext2.id);
    expect(r2.state.turnPhase).toBe('DRAW');
    expect(r2.state.discard.some((c) => c.id === jailOk.id)).toBe(true);
  });

  it('handles DYNAMITE explosion (SPADES 2..9) and passing to next player otherwise', () => {
    // Case 1: Explodes on 3♠ -> -3 HP and discarded
    const r1 = setupStartedRoom(4);
    const s1 = playersBySeat(r1);
    const sheriffIdx1 = s1.findIndex((p) => p.role === 'SHERIFF');
    const sheriff1 = s1[sheriffIdx1];
    const target1 = s1[(sheriffIdx1 + 1) % 4];

    const dyn1 = makeCard('DYNAMITE', 'HEARTS', '2', 'dyn_boom');
    target1.equipped.push(dyn1);
    target1.hp = 4;

    r1.draw(sheriff1.id);
    sheriff1.hand = [];
    r1.state.deck.push(makeCard('MISSED', 'SPADES', '3', 'boom_card'));
    r1.endTurn(sheriff1.id);

    expect(r1.state.currentTurnPlayerId).toBe(target1.id);
    expect(target1.hp).toBe(1);
    expect(r1.state.discard.some((c) => c.id === dyn1.id)).toBe(true);
    expect(target1.equipped.some((c) => c.id === dyn1.id)).toBe(false);

    // Case 2: Dud on ♥ -> passes to next alive player
    const r2 = setupStartedRoom(4);
    const s2 = playersBySeat(r2);
    const sheriffIdx2 = s2.findIndex((p) => p.role === 'SHERIFF');
    const sheriff2 = s2[sheriffIdx2];
    const target2 = s2[(sheriffIdx2 + 1) % 4];
    const nextAfterTarget2 = s2[(sheriffIdx2 + 2) % 4];

    const dyn2 = makeCard('DYNAMITE', 'HEARTS', '2', 'dyn_pass');
    target2.equipped.push(dyn2);

    r2.draw(sheriff2.id);
    sheriff2.hand = [];
    r2.state.deck.push(makeCard('BEER', 'HEARTS', '10', 'dud_card'));
    r2.endTurn(sheriff2.id);

    expect(r2.state.currentTurnPlayerId).toBe(target2.id);
    expect(target2.equipped.some((c) => c.id === dyn2.id)).toBe(false);
    expect(nextAfterTarget2.equipped.some((c) => c.id === dyn2.id)).toBe(true);
  });

  it('consumes multiple BEER cards on lethal DYNAMITE and triggers OUTLAW_TEAM win if Sheriff dies', () => {
    // 1) Multi-beer save: HP 2 + 2 BEER -> survives at HP 1 after -3
    const r1 = setupStartedRoom(4);
    const s1 = playersBySeat(r1);
    const sheriffIdx1 = s1.findIndex((p) => p.role === 'SHERIFF');
    const sheriff1 = s1[sheriffIdx1];
    const target1 = s1[(sheriffIdx1 + 1) % 4];

    target1.hp = 2;
    target1.hand = [makeCard('BEER', 'HEARTS', '6'), makeCard('BEER', 'HEARTS', '7')];
    target1.equipped.push(makeCard('DYNAMITE', 'HEARTS', '2'));

    r1.draw(sheriff1.id);
    sheriff1.hand = [];
    r1.state.deck.push(makeCard('MISSED', 'SPADES', '5'));
    r1.endTurn(sheriff1.id);

    expect(target1.isAlive).toBe(true);
    expect(target1.hp).toBe(1);
    expect(target1.hand).toHaveLength(0);

    // 2) Sheriff (HP 3, no BEER) killed by DYNAMITE -> OUTLAW_TEAM wins
    const r2 = setupStartedRoom(4);
    const s2 = playersBySeat(r2);
    const sheriffIdx2 = s2.findIndex((p) => p.role === 'SHERIFF');
    const sheriff2 = s2[sheriffIdx2];
    const prevPlayer = s2[(sheriffIdx2 + 3) % 4];

    // Advance cleanly from Sheriff to prevPlayer
    r2.draw(sheriff2.id);
    sheriff2.hand = [];
    r2.endTurn(sheriff2.id);
    while (r2.state.currentTurnPlayerId !== prevPlayer.id) {
      const cur = r2.state.players.find((p) => p.id === r2.state.currentTurnPlayerId)!;
      r2.draw(cur.id);
      cur.hand = [];
      r2.endTurn(cur.id);
    }

    sheriff2.hp = 3;
    sheriff2.hand = [];
    sheriff2.equipped.push(makeCard('DYNAMITE', 'HEARTS', '2'));

    r2.draw(prevPlayer.id);
    prevPlayer.hand = [];
    r2.state.deck.push(makeCard('MISSED', 'SPADES', '9'));
    r2.endTurn(prevPlayer.id);

    expect(sheriff2.isAlive).toBe(false);
    expect(r2.state.status).toBe('FINISHED');
    expect(r2.state.winner).toBe('OUTLAW_TEAM');
  });

  it('builds the 62-card Phase 2 deck with exact original counts', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(62);

    const counts: Record<string, number> = {};
    for (const c of deck) {
      counts[c.type] = (counts[c.type] ?? 0) + 1;
    }

    expect(counts).toEqual({
      BANG: 25,
      MISSED: 12,
      BEER: 6,
      STAGECOACH: 2,
      WEAPON_VOLCANIC: 2,
      WEAPON_SCHOFIELD: 3,
      WEAPON_REMINGTON: 1,
      WEAPON_CARABINE: 1,
      WEAPON_WINCHESTER: 1,
      BARREL: 2,
      MUSTANG: 2,
      SCOPE: 1,
      JAIL: 3,
      DYNAMITE: 1,
    });
  });
});
