import { describe, expect, it, vi } from 'vitest';
import type { Card, CardType } from '@bang/shared';
import { GameRoom } from '../src/game/GameRoom.js';
import { toClientView } from '../src/game/view.js';

let seq = 1;
function makeCard(
  type: CardType,
  suit: Card['suit'] = 'SPADES',
  rank = 'A',
  id?: string
): Card {
  return {
    id: id ?? `ef_c_${seq++}`,
    type,
    suit,
    rank,
  };
}

function setupNeutralRoom(): GameRoom {
  const room = new GameRoom('EFF1', vi.fn(), 20000);
  for (let i = 1; i <= 4; i++) {
    room.addPlayer(`p${i}`, `Player${i}`);
  }
  room.start('p1');
  for (const p of room.state.players) {
    p.character = 'SID_KETCHUM';
    const hp = p.role === 'SHERIFF' ? 5 : 4;
    p.maxHp = hp;
    p.hp = hp;
  }
  return room;
}

describe('GameEffect tracking and view filtering', () => {
  it('records sequential BANG, MISSED, HIT, HEAL, DYNAMITE_BOOM, and DEATH effects without leaking hidden cards', () => {
    const room = setupNeutralRoom();
    const seated = [...room.state.players].sort((a, b) => a.seatIndex - b.seatIndex);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const sheriff = seated[sheriffIdx];
    const neighbor = seated[(sheriffIdx + 1) % 4];

    room.draw(sheriff.id);
    const vol = makeCard('WEAPON_VOLCANIC', 'SPADES', '10', 'ef_vol');
    const b1 = makeCard('BANG', 'DIAMONDS', '2', 'ef_b1');
    const b2 = makeCard('BANG', 'DIAMONDS', '3', 'ef_b2');
    const beer = makeCard('BEER', 'HEARTS', '6', 'ef_beer');
    sheriff.hp = 4;
    sheriff.hand = [vol, b1, b2, beer];

    const missed = makeCard('MISSED', 'CLUBS', '10', 'ef_m1');
    const secretNeighborCard = makeCard('STAGECOACH', 'SPADES', '9', 'secret_neighbor_card');
    neighbor.hand = [missed, secretNeighborCard];

    // HEAL + EQUIP + BANG -> MISSED + BANG -> HIT
    room.playCard(sheriff.id, beer.id);
    room.playCard(sheriff.id, vol.id);
    room.playCard(sheriff.id, b1.id, neighbor.id);
    room.respond(neighbor.id, missed.id);

    room.playCard(sheriff.id, b2.id, neighbor.id);
    room.respond(neighbor.id, null);

    // Trigger DYNAMITE_BOOM and DEATH on neighbor
    neighbor.hp = 3;
    neighbor.hand = [secretNeighborCard];
    neighbor.equipped.push(makeCard('DYNAMITE', 'HEARTS', '2', 'ef_dyn'));
    sheriff.hand = [];
    room.state.deck.push(makeCard('MISSED', 'SPADES', '4', 'ef_boom'));
    room.endTurn(sheriff.id);

    const viewForSheriff = toClientView(room.state, sheriff.id);
    const effects = viewForSheriff.effects ?? [];
    const types = effects.map((e) => e.type);

    expect(types).toContain('HEAL');
    expect(types).toContain('EQUIP');
    expect(types).toContain('BANG');
    expect(types).toContain('MISSED');
    expect(types).toContain('HIT');
    expect(types).toContain('DYNAMITE_BOOM');
    expect(types).toContain('DEATH');

    // Sequence numbers are strictly increasing
    for (let i = 1; i < effects.length; i++) {
      expect(effects[i].seq).toBeGreaterThan(effects[i - 1].seq);
    }

    // Hidden cards of other players never leak via effects
    const other = seated[(sheriffIdx + 2) % 4];
    const secretOtherCard = makeCard('BEER', 'HEARTS', '9', 'secret_other_card');
    other.hand = [secretOtherCard];
    const sheriffJson = JSON.stringify(toClientView(room.state, sheriff.id));
    expect(sheriffJson).not.toContain('"secret_other_card"');
  });
});
