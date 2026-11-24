import { describe, expect, it, vi } from 'vitest';
import type { Card, CardType, CharacterId } from '@bang/shared';
import { CHARACTER_META } from '../src/game/characters.js';
import { GameError, GameRoom } from '../src/game/GameRoom.js';
import { distance } from '../src/game/rules.js';
import { toClientView } from '../src/game/view.js';

let seq = 1;
function makeCard(
  type: CardType,
  suit: Card['suit'] = 'SPADES',
  rank = 'A',
  id?: string
): Card {
  return {
    id: id ?? `ch_c_${seq++}`,
    type,
    suit,
    rank,
  };
}

function setupStartedRoom(count = 4): GameRoom {
  const room = new GameRoom('CHAR', vi.fn(), 20000);
  for (let i = 1; i <= count; i++) {
    room.addPlayer(`p${i}`, `Player${i}`);
  }
  room.start('p1');
  return room;
}

function setNeutral(room: GameRoom, char: CharacterId = 'SID_KETCHUM') {
  for (const p of room.state.players) {
    p.character = char;
    const hp = p.role === 'SHERIFF' ? 5 : 4;
    p.maxHp = hp;
    p.hp = hp;
  }
}

function playersBySeat(room: GameRoom) {
  return [...room.state.players].sort((a, b) => a.seatIndex - b.seatIndex);
}

describe('BANG! Phase 3-A: 16 Characters', () => {
  it('assigns unique characters on start and respects 3-HP maxHp (+1 for Sheriff)', () => {
    const room = setupStartedRoom(7);
    const chars = room.state.players.map((p) => p.character);
    expect(new Set(chars).size).toBe(7);

    for (const p of room.state.players) {
      const expected = CHARACTER_META[p.character].hp + (p.role === 'SHERIFF' ? 1 : 0);
      expect(p.maxHp).toBe(expected);
      expect(p.hp).toBe(expected);
      expect(p.hand).toHaveLength(expected);
    }
  });

  it('BART_CASSIDY draws cards equal to damage taken when surviving', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const seated = playersBySeat(room);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const sheriff = seated[sheriffIdx];
    const bart = seated[(sheriffIdx + 1) % 4];
    bart.character = 'BART_CASSIDY';
    bart.hand = [];

    room.draw(sheriff.id);
    const bang = makeCard('BANG');
    sheriff.hand = [bang];

    room.playCard(sheriff.id, bang.id, bart.id);
    room.respond(bart.id, null);
    expect(bart.hp).toBe(3);
    expect(bart.hand).toHaveLength(1);
  });

  it('EL_GRINGO steals random card from attacker on hit, but not from DYNAMITE', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const seated = playersBySeat(room);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const sheriff = seated[sheriffIdx];
    const gringo = seated[(sheriffIdx + 1) % 4];
    gringo.character = 'EL_GRINGO';
    gringo.maxHp = 3;
    gringo.hp = 3;
    gringo.hand = [];

    room.draw(sheriff.id);
    const bang = makeCard('BANG');
    const gift = makeCard('BEER', 'HEARTS', '6', 'gringo_loot');
    sheriff.hand = [bang, gift];

    room.playCard(sheriff.id, bang.id, gringo.id);
    room.respond(gringo.id, null);
    expect(gringo.hp).toBe(2);
    expect(gringo.hand.some((c) => c.id === gift.id)).toBe(true);
    expect(sheriff.hand).toHaveLength(0);

    // Dynamite damage has no source -> should not steal from anyone
    const room2 = setupStartedRoom(4);
    setNeutral(room2);
    const s2 = playersBySeat(room2);
    const sh2Idx = s2.findIndex((p) => p.role === 'SHERIFF');
    const sh2 = s2[sh2Idx];
    const gr2 = s2[(sh2Idx + 1) % 4];
    gr2.character = 'EL_GRINGO';
    gr2.hp = 4;
    gr2.hand = [];
    gr2.equipped.push(makeCard('DYNAMITE', 'HEARTS', '2'));
    room2.draw(sh2.id);
    sh2.hand = [makeCard('STAGECOACH')];
    room2.state.deck.push(makeCard('MISSED', 'SPADES', '5'));
    room2.endTurn(sh2.id);

    expect(gr2.hp).toBe(1);
    expect(gr2.hand).toHaveLength(0);
    expect(sh2.hand).toHaveLength(1);
  });

  it('VULTURE_SAM collects all hand and equipped cards from dead players', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const seated = playersBySeat(room);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const sheriff = seated[sheriffIdx];
    const victim = seated[(sheriffIdx + 1) % 4];
    const sam = seated[(sheriffIdx + 2) % 4];
    sam.character = 'VULTURE_SAM';
    sam.hand = [];

    const vHand = makeCard('STAGECOACH', 'SPADES', '9', 'v_hand');
    const vEquip = makeCard('MUSTANG', 'HEARTS', '9', 'v_eq');
    victim.hp = 1;
    victim.hand = [vHand];
    victim.equipped = [vEquip];

    room.draw(sheriff.id);
    const bang = makeCard('BANG');
    const scope = makeCard('SCOPE');
    sheriff.hand = [bang, scope];
    sheriff.equipped = [scope];
    room.playCard(sheriff.id, bang.id, victim.id);
    room.respond(victim.id, null);

    expect(victim.isAlive).toBe(false);
    expect(sam.hand.some((c) => c.id === vHand.id)).toBe(true);
    expect(sam.hand.some((c) => c.id === vEquip.id)).toBe(true);
  });

  it('BLACK_JACK draws a 3rd card when the 2nd drawn card is HEARTS or DIAMONDS', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const sheriff = room.state.players.find((p) => p.role === 'SHERIFF')!;
    sheriff.character = 'BLACK_JACK';
    sheriff.hand = [];

    // drawN pops from end: 1st popped is SPADES, 2nd popped is HEARTS -> bonus!
    const c1 = makeCard('BANG', 'SPADES', 'A', 'bj1');
    const c2 = makeCard('BANG', 'HEARTS', 'Q', 'bj2');
    const c3 = makeCard('BEER', 'CLUBS', '2', 'bj3');
    room.state.deck.push(c3, c2, c1);

    room.draw(sheriff.id);
    expect(sheriff.hand.map((c) => c.id)).toEqual(['bj1', 'bj2', 'bj3']);
    expect(room.state.turnPhase).toBe('ACTION');
  });

  it('PEDRO_RAMIREZ draws top of discard + 1 from deck', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const sheriff = room.state.players.find((p) => p.role === 'SHERIFF')!;
    sheriff.character = 'PEDRO_RAMIREZ';
    sheriff.hand = [];

    const topDiscard = makeCard('BEER', 'HEARTS', '10', 'pedro_disc');
    room.state.discard.push(topDiscard);

    room.specialDraw(sheriff.id, 'DISCARD');
    expect(sheriff.hand.some((c) => c.id === topDiscard.id)).toBe(true);
    expect(sheriff.hand).toHaveLength(2);
    expect(room.state.turnPhase).toBe('ACTION');
  });

  it('JESSE_JONES draws 1 card from target hand + 1 from deck and triggers SUZY', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const seated = playersBySeat(room);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const jesse = seated[sheriffIdx];
    const target = seated[(sheriffIdx + 1) % 4];
    jesse.character = 'JESSE_JONES';
    jesse.hand = [];
    target.character = 'SUZY_LAFAYETTE';
    const tCard = makeCard('BANG', 'DIAMONDS', '7', 'jesse_steal');
    target.hand = [tCard];

    room.specialDraw(jesse.id, 'PLAYER', target.id);
    expect(jesse.hand.some((c) => c.id === tCard.id)).toBe(true);
    expect(jesse.hand).toHaveLength(2);
    // Target became 0 cards and is SUZY_LAFAYETTE -> immediately draws 1
    expect(target.hand).toHaveLength(1);
    expect(room.state.turnPhase).toBe('ACTION');
  });

  it('KIT_CARLSON hides kitChoices from others, picks 2, and returns 1 to top of deck', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const seated = playersBySeat(room);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const kit = seated[sheriffIdx];
    const other = seated[(sheriffIdx + 1) % 4];
    kit.character = 'KIT_CARLSON';
    kit.hand = [];

    const k1 = makeCard('BANG', 'DIAMONDS', '2', 'k1');
    const k2 = makeCard('MISSED', 'SPADES', '3', 'k2');
    const k3 = makeCard('BEER', 'HEARTS', '6', 'k3');
    room.state.deck.push(k3, k2, k1);

    room.draw(kit.id);
    expect(room.state.turnPhase).toBe('DRAW');

    const kitView = toClientView(room.state, kit.id);
    const otherView = toClientView(room.state, other.id);
    expect(kitView.myInfo.kitChoices).toHaveLength(3);
    expect(otherView.myInfo.kitChoices).toBeNull();
    expect(JSON.stringify(otherView)).not.toContain('"k1"');

    // Invalid pick count rejected
    expect(() => room.pickKitCards(kit.id, ['k1'])).toThrow(GameError);

    room.pickKitCards(kit.id, ['k1', 'k3']);
    expect(kit.hand.map((c) => c.id)).toEqual(['k1', 'k3']);
    expect(room.state.deck[room.state.deck.length - 1].id).toBe('k2');
    expect(room.state.turnPhase).toBe('ACTION');
    expect(toClientView(room.state, kit.id).myInfo.kitChoices).toBeNull();
  });

  it('CALAMITY_JANET swaps BANG and MISSED for attack and defense', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const seated = playersBySeat(room);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const janet = seated[sheriffIdx];
    const neighbor = seated[(sheriffIdx + 1) % 4];
    janet.character = 'CALAMITY_JANET';
    neighbor.character = 'CALAMITY_JANET';

    room.draw(janet.id);
    const missedAsBang = makeCard('MISSED', 'CLUBS', '10', 'cj_m');
    janet.hand = [missedAsBang];
    const bangAsMissed = makeCard('BANG', 'DIAMONDS', '4', 'cj_b');
    neighbor.hand = [bangAsMissed];

    const hpBefore = neighbor.hp;
    room.playCard(janet.id, missedAsBang.id, neighbor.id);
    expect(room.state.turnPhase).toBe('WAITING_FOR_RESPONSE');

    room.respond(neighbor.id, bangAsMissed.id);
    expect(neighbor.hp).toBe(hpBefore);
    expect(room.state.turnPhase).toBe('ACTION');
  });

  it('WILLY_THE_KID plays unlimited BANGs without VOLCANIC', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const seated = playersBySeat(room);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const willy = seated[sheriffIdx];
    const neighbor = seated[(sheriffIdx + 1) % 4];
    willy.character = 'WILLY_THE_KID';

    room.draw(willy.id);
    const b1 = makeCard('BANG', 'DIAMONDS', '2');
    const b2 = makeCard('BANG', 'DIAMONDS', '3');
    willy.hand = [b1, b2];
    neighbor.hand = [];

    const hpBefore = neighbor.hp;
    room.playCard(willy.id, b1.id, neighbor.id);
    room.respond(neighbor.id, null);
    room.playCard(willy.id, b2.id, neighbor.id);
    room.respond(neighbor.id, null);
    expect(neighbor.hp).toBe(hpBefore - 2);
  });

  it('SID_KETCHUM discards 2 cards to heal 1 HP during ACTION', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const sheriff = room.state.players.find((p) => p.role === 'SHERIFF')!;
    sheriff.character = 'SID_KETCHUM';
    sheriff.hp = 3;

    room.draw(sheriff.id);
    const c1 = makeCard('BANG', 'CLUBS', '2', 'sk1');
    const c2 = makeCard('MISSED', 'SPADES', '2', 'sk2');
    sheriff.hand = [c1, c2];

    room.useAbility(sheriff.id, 'SID_HEAL', [c1.id, c2.id]);
    expect(sheriff.hp).toBe(4);
    expect(sheriff.hand).toHaveLength(0);
    expect(room.state.discard.some((c) => c.id === c1.id)).toBe(true);
    expect(room.state.discard.some((c) => c.id === c2.id)).toBe(true);
  });

  it('SUZY_LAFAYETTE draws 1 card immediately whenever her hand becomes empty', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const suzy = room.state.players.find((p) => p.role === 'SHERIFF')!;
    suzy.character = 'SUZY_LAFAYETTE';
    suzy.hp = 3;

    room.draw(suzy.id);
    const onlyCard = makeCard('BEER', 'HEARTS', '8', 'suzy_beer');
    suzy.hand = [onlyCard];

    room.playCard(suzy.id, onlyCard.id);
    expect(suzy.hp).toBe(4);
    expect(suzy.hand).toHaveLength(1);
  });

  it('JOURDONNAIS stacks built-in barrel with equipped BARREL', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const seated = playersBySeat(room);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const slab = seated[sheriffIdx];
    const jourdonnais = seated[(sheriffIdx + 1) % 4];
    slab.character = 'SLAB_THE_KILLER';
    jourdonnais.character = 'JOURDONNAIS';
    jourdonnais.equipped.push(makeCard('BARREL', 'SPADES', 'Q'));

    room.draw(slab.id);
    const bang = makeCard('BANG');
    slab.hand = [bang];

    // Push 2 HEARTS onto deck -> both built-in barrel and equipped barrel succeed -> 2 misses satisfied!
    room.state.deck.push(
      makeCard('BEER', 'HEARTS', '9', 'j_h2'),
      makeCard('BEER', 'HEARTS', '8', 'j_h1')
    );
    room.playCard(slab.id, bang.id, jourdonnais.id);
    expect(room.state.pendingAction).toBeNull();
    expect(room.state.turnPhase).toBe('ACTION');
  });

  it('SLAB_THE_KILLER requires 2 MISSED cards and stays WAITING_FOR_RESPONSE after 1', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const seated = playersBySeat(room);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const slab = seated[sheriffIdx];
    const victim = seated[(sheriffIdx + 1) % 4];
    slab.character = 'SLAB_THE_KILLER';

    room.draw(slab.id);
    const bang = makeCard('BANG');
    slab.hand = [bang];
    const m1 = makeCard('MISSED', 'CLUBS', '10', 'sl_m1');
    const m2 = makeCard('MISSED', 'CLUBS', 'J', 'sl_m2');
    victim.hand = [m1, m2];

    room.playCard(slab.id, bang.id, victim.id);
    expect(room.state.turnPhase).toBe('WAITING_FOR_RESPONSE');
    expect(room.state.pendingAction?.requiredCount).toBe(2);

    room.respond(victim.id, m1.id);
    expect(room.state.turnPhase).toBe('WAITING_FOR_RESPONSE');
    expect(room.state.pendingAction?.requiredCount).toBe(1);

    const hpBefore = victim.hp;
    room.respond(victim.id, m2.id);
    expect(victim.hp).toBe(hpBefore);
    expect(room.state.turnPhase).toBe('ACTION');
    expect(room.state.pendingAction).toBeNull();
  });

  it('LUCKY_DUKE flips 2 cards on drawCheck and selects the favorable one', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const seated = playersBySeat(room);
    const sheriffIdx = seated.findIndex((p) => p.role === 'SHERIFF');
    const attacker = seated[sheriffIdx];
    const duke = seated[(sheriffIdx + 1) % 4];
    duke.character = 'LUCKY_DUKE';
    duke.equipped.push(makeCard('BARREL', 'SPADES', 'Q'));

    room.draw(attacker.id);
    const bang = makeCard('BANG');
    attacker.hand = [bang];

    // Top two cards: SPADES (miss) then HEARTS (hit!)
    const bad = makeCard('MISSED', 'SPADES', '2', 'ld_bad');
    const good = makeCard('BEER', 'HEARTS', '9', 'ld_good');
    room.state.deck.push(good, bad);

    room.playCard(attacker.id, bang.id, duke.id);
    expect(room.state.pendingAction).toBeNull();
    expect(room.state.turnPhase).toBe('ACTION');
    expect(room.state.lastCheck?.success).toBe(true);
    expect(room.state.lastCheck?.card?.id).toBe('ld_good');
    expect(room.state.discard.some((c) => c.id === 'ld_bad')).toBe(true);
    expect(room.state.discard.some((c) => c.id === 'ld_good')).toBe(true);
  });

  it('PAUL_REGRET (+1) and ROSE_DOOLAN (-1) stack with MUSTANG and SCOPE in distance()', () => {
    const room = setupStartedRoom(4);
    setNeutral(room);
    const seated = playersBySeat(room);
    const [a, b, c] = seated;

    a.character = 'ROSE_DOOLAN';
    c.character = 'PAUL_REGRET';
    // Base distance A <-> C in 4 players is 2; ROSE (-1) + PAUL (+1) = 2
    expect(distance(room.state, a.id, c.id)).toBe(2);

    // Add MUSTANG to C -> distance becomes 3
    c.equipped.push(makeCard('MUSTANG', 'HEARTS', '8'));
    expect(distance(room.state, a.id, c.id)).toBe(3);

    // Add SCOPE to A -> distance returns to 2
    a.equipped.push(makeCard('SCOPE', 'SPADES', 'A'));
    expect(distance(room.state, a.id, c.id)).toBe(2);

    // Base distance A <-> B is 1; ROSE (-1) stays clamped at min 1
    expect(distance(room.state, a.id, b.id)).toBe(1);
  });
});
