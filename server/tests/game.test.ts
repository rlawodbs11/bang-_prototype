import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card, CardType } from '@bang/shared';
import { GameError, GameRoom } from '../src/game/GameRoom.js';
import { distance } from '../src/game/rules.js';
import { toClientView } from '../src/game/view.js';

let cardSeq = 1;
function makeCard(type: CardType, id?: string): Card {
  const n = cardSeq++;
  return {
    id: id ?? `test_c_${n}`,
    type,
    suit: 'SPADES',
    rank: 'A',
  };
}

function setupStartedRoom(count = 4, timeoutMs = 20000): {
  room: GameRoom;
  onChange: ReturnType<typeof vi.fn>;
} {
  const onChange = vi.fn();
  const room = new GameRoom('TEST', onChange, timeoutMs);
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
  return { room, onChange };
}

function playersBySeat(room: GameRoom) {
  return [...room.state.players].sort((a, b) => a.seatIndex - b.seatIndex);
}

describe('BANG! Phase 1 server logic', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes circular distance among alive players and excludes dead players', () => {
    const { room } = setupStartedRoom(4);
    const seated = playersBySeat(room);
    const [a, b, c, d] = seated;

    expect(distance(room.state, a.id, b.id)).toBe(1);
    expect(distance(room.state, a.id, c.id)).toBe(2);
    expect(distance(room.state, a.id, d.id)).toBe(1);

    // Kill player B between A and C -> distance A to C becomes 1
    b.isAlive = false;
    expect(distance(room.state, a.id, c.id)).toBe(1);
    expect(distance(room.state, a.id, d.id)).toBe(1);

    // Equipment modifiers (MUSTANG +1, SCOPE -1, min 1)
    c.equipped.push(makeCard('MUSTANG'));
    expect(distance(room.state, a.id, c.id)).toBe(2);
    a.equipped.push(makeCard('SCOPE'));
    expect(distance(room.state, a.id, c.id)).toBe(1);
  });

  it('strictly filters hidden hand and role information per viewer', () => {
    const { room } = setupStartedRoom(4);

    for (const viewer of room.state.players) {
      const view = toClientView(room.state, viewer.id);
      expect(view.myInfo.role).toBe(viewer.role);
      expect(view.myInfo.hand).toHaveLength(viewer.hand.length);

      for (const pub of view.players) {
        expect('hand' in pub).toBe(false);
        const raw = room.state.players.find((p) => p.id === pub.id)!;
        expect(pub.handCount).toBe(raw.hand.length);

        if (raw.role === 'SHERIFF' || !raw.isAlive) {
          expect(pub.role).toBe(raw.role);
        } else {
          expect(pub.role).toBeNull();
        }
      }

      const serialized = JSON.stringify(view);
      for (const other of room.state.players) {
        if (other.id === viewer.id) continue;
        for (const otherCard of other.hand) {
          expect(serialized).not.toContain(`"${otherCard.id}"`);
        }
      }
    }
  });

  it('enforces BANG range, interrupt state machine, MISSED/hit responses, and VOLCANIC multi-shot', () => {
    const { room } = setupStartedRoom(4);
    const seated = playersBySeat(room);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const sheriff = seated[sheriffIdx];
    const neighbor = seated[(sheriffIdx + 1) % 4];
    const opposite = seated[(sheriffIdx + 2) % 4];

    room.draw(sheriff.id);

    const bang1 = makeCard('BANG', 'b1');
    const bang2 = makeCard('BANG', 'b2');
    const bang3 = makeCard('BANG', 'b3');
    const stagecoach = makeCard('STAGECOACH', 'st1');
    const volcanic = makeCard('WEAPON_VOLCANIC', 'vol1');
    sheriff.hand = [bang1, bang2, bang3, stagecoach, volcanic];

    const missed = makeCard('MISSED', 'm1');
    neighbor.hand = [missed];

    // Out of range shot (distance 2 with range 1) rejected
    expect(() => room.playCard(sheriff.id, bang1.id, opposite.id)).toThrow(GameError);

    // Valid BANG transitions to WAITING_FOR_RESPONSE
    room.playCard(sheriff.id, bang1.id, neighbor.id);
    expect(room.state.turnPhase).toBe('WAITING_FOR_RESPONSE');
    expect(room.state.pendingAction?.targetPlayerId).toBe(neighbor.id);

    // Normal actions blocked while waiting for response
    expect(() => room.playCard(sheriff.id, stagecoach.id)).toThrow(GameError);
    expect(() => room.endTurn(sheriff.id)).toThrow(GameError);

    // Neighbor plays MISSED -> HP stays intact, phase returns to ACTION
    const prevHp = neighbor.hp;
    room.respond(neighbor.id, missed.id);
    expect(neighbor.hp).toBe(prevHp);
    expect(room.state.turnPhase).toBe('ACTION');
    expect(room.state.pendingAction).toBeNull();

    // Second BANG without VOLCANIC rejected
    expect(() => room.playCard(sheriff.id, bang2.id, neighbor.id)).toThrow(GameError);

    // Equip VOLCANIC -> second BANG allowed, respond(null) deals 1 damage
    room.playCard(sheriff.id, volcanic.id);
    room.playCard(sheriff.id, bang2.id, neighbor.id);
    room.respond(neighbor.id, null);
    expect(neighbor.hp).toBe(prevHp - 1);
    expect(room.state.turnPhase).toBe('ACTION');
  });

  it('auto-applies damage and notifies onChange when response timeout expires', () => {
    vi.useFakeTimers();
    const { room, onChange } = setupStartedRoom(4, 5000);
    const seated = playersBySeat(room);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const sheriff = seated[sheriffIdx];
    const neighbor = seated[(sheriffIdx + 1) % 4];

    room.draw(sheriff.id);
    const bang = makeCard('BANG', 'timeout_bang');
    sheriff.hand = [bang];
    const initialHp = neighbor.hp;

    room.playCard(sheriff.id, bang.id, neighbor.id);
    expect(room.state.turnPhase).toBe('WAITING_FOR_RESPONSE');

    vi.advanceTimersByTime(5000);

    expect(neighbor.hp).toBe(initialHp - 1);
    expect(room.state.turnPhase).toBe('ACTION');
    expect(room.state.pendingAction).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('handles BEER auto-save, player death, and team victory conditions', () => {
    // 1) BEER auto-save when > 2 alive, then death -> OUTLAW_TEAM wins on Sheriff death
    const { room: r1 } = setupStartedRoom(4);
    const s1 = playersBySeat(r1);
    const sheriff1Idx = s1.findIndex((p) => p.role === 'SHERIFF');
    const sheriff1 = s1[sheriff1Idx];
    const outlaw1 = s1.find((p) => p.role === 'OUTLAW')!;
    const neighbor1 = s1[(sheriff1Idx + 1) % 4];

    // Give neighbor 1 HP and 1 BEER -> lethal hit triggers auto-save
    r1.draw(sheriff1.id);
    const bSave = makeCard('BANG', 'b_save');
    const vol = makeCard('WEAPON_VOLCANIC', 'vol_save');
    sheriff1.hand = [bSave, vol];
    sheriff1.equipped = [vol];
    neighbor1.hp = 1;
    neighbor1.hand = [makeCard('BEER', 'auto_beer')];

    r1.playCard(sheriff1.id, bSave.id, neighbor1.id);
    r1.respond(neighbor1.id, null);
    expect(neighbor1.isAlive).toBe(true);
    expect(neighbor1.hp).toBe(1);
    expect(neighbor1.hand).toHaveLength(0);

    // Sheriff dies while outlaw + deputy/renegade alive -> OUTLAW_TEAM
    r1.endTurn(sheriff1.id);
    // Advance turns until outlaw1's turn
    while (r1.state.currentTurnPlayerId !== outlaw1.id) {
      const cur = r1.state.players.find((p) => p.id === r1.state.currentTurnPlayerId)!;
      cur.hand = [];
      r1.draw(cur.id);
      cur.hand = [];
      r1.endTurn(cur.id);
    }
    r1.draw(outlaw1.id);
    outlaw1.equipped = [makeCard('WEAPON_WINCHESTER', 'win1')];
    const killBang = makeCard('BANG', 'kill_sheriff');
    outlaw1.hand = [killBang];
    sheriff1.hp = 1;
    sheriff1.hand = [];

    r1.playCard(outlaw1.id, killBang.id, sheriff1.id);
    r1.respond(sheriff1.id, null);
    expect(sheriff1.isAlive).toBe(false);
    expect(r1.state.status).toBe('FINISHED');
    expect(r1.state.winner).toBe('OUTLAW_TEAM');

    // 2) SHERIFF_TEAM wins when all OUTLAW and RENEGADE players die
    const { room: r2 } = setupStartedRoom(4);
    const s2 = playersBySeat(r2);
    const sheriff2 = s2.find((p) => p.role === 'SHERIFF')!;
    const enemies = s2.filter((p) => p.role === 'OUTLAW' || p.role === 'RENEGADE');
    // Leave only the last enemy alive
    for (let i = 0; i < enemies.length - 1; i++) {
      enemies[i].isAlive = false;
      enemies[i].hp = 0;
    }
    const lastEnemy = enemies[enemies.length - 1];
    lastEnemy.hp = 1;
    lastEnemy.hand = [];

    r2.draw(sheriff2.id);
    const finalBang = makeCard('BANG', 'final_bang');
    sheriff2.equipped = [makeCard('WEAPON_WINCHESTER', 'win2')];
    sheriff2.hand = [finalBang];
    r2.playCard(sheriff2.id, finalBang.id, lastEnemy.id);
    r2.respond(lastEnemy.id, null);

    expect(lastEnemy.isAlive).toBe(false);
    expect(r2.state.status).toBe('FINISHED');
    expect(r2.state.winner).toBe('SHERIFF_TEAM');
  });

  it('requires discarding exact excess cards when hand exceeds HP on endTurn', () => {
    const { room } = setupStartedRoom(4);
    const sheriff = room.state.players.find((p) => p.role === 'SHERIFF')!;
    const firstTurnId = sheriff.id;

    // Sheriff starts with 5 HP and 5 cards; drawing 2 makes 7 cards (> 5 HP)
    room.draw(sheriff.id);
    expect(sheriff.hand.length).toBe(7);

    room.endTurn(sheriff.id);
    expect(room.state.turnPhase).toBe('DISCARD');
    expect(room.state.currentTurnPlayerId).toBe(firstTurnId);

    // Wrong count rejected
    expect(() => room.discardCards(sheriff.id, [sheriff.hand[0].id])).toThrow(GameError);
    // Duplicate ids rejected
    expect(() =>
      room.discardCards(sheriff.id, [sheriff.hand[0].id, sheriff.hand[0].id])
    ).toThrow(GameError);

    // Exact 2 cards succeeds and advances turn
    room.discardCards(sheriff.id, [sheriff.hand[0].id, sheriff.hand[1].id]);
    expect(sheriff.hand.length).toBe(5);
    expect(room.state.turnPhase).toBe('DRAW');
    expect(room.state.currentTurnPlayerId).not.toBe(firstTurnId);
  });
});
