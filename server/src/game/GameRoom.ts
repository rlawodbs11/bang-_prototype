import type { Card, CardType, CheckResult, GameEffect, LobbyView, Role } from '@bang/shared';
import { CHARACTER_LIST, CHARACTER_META } from './characters.js';
import { createDeck, drawN, drawOne, shuffle } from './deck.js';
import {
  canPlayUnlimitedBang,
  distance,
  hasEquipped,
  isDynamiteExplosion,
  isWeapon,
  ROLE_TABLE,
  weaponRange,
} from './rules.js';
import type { ServerGameState, ServerPlayer } from './types.js';

export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameError';
  }
}

const MAX_LOGS = 50;
const MAX_EFFECTS = 12;

const ROLE_LABELS: Record<Role, string> = {
  SHERIFF: '보안관',
  DEPUTY: '부관',
  OUTLAW: '무법자',
  RENEGADE: '배신자',
};

const WEAPON_LABELS: Partial<Record<CardType, string>> = {
  WEAPON_VOLCANIC: '볼캐닉 (사거리 1, 연사)',
  WEAPON_SCHOFIELD: '스코필드 (사거리 2)',
  WEAPON_REMINGTON: '레밍턴 (사거리 3)',
  WEAPON_CARABINE: '카빈 (사거리 4)',
  WEAPON_WINCHESTER: '윈체스터 (사거리 5)',
};

const EQUIP_LABELS: Partial<Record<CardType, string>> = {
  BARREL: '술통',
  MUSTANG: '야생마',
  SCOPE: '조준경',
  JAIL: '감옥',
  DYNAMITE: '다이너마이트',
};

const CHECK_REASON_LABELS: Record<CheckResult['reason'], string> = {
  BARREL: '술통',
  JAIL: '감옥',
  DYNAMITE: '다이너마이트',
};

const SUIT_SYMBOLS: Record<Card['suit'], string> = {
  SPADES: '♠',
  HEARTS: '♥',
  DIAMONDS: '♦',
  CLUBS: '♣',
};

const AVATAR_DATA_URL_RE =
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const MAX_AVATAR_LEN = 32768;

function sanitizeAvatar(avatar?: string | null): string | null {
  if (!avatar) return null;
  const trimmed = avatar.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_AVATAR_LEN) {
    throw new GameError('프로필 이미지 크기가 너무 큽니다.');
  }
  if (!AVATAR_DATA_URL_RE.test(trimmed)) {
    throw new GameError('지원하지 않는 이미지 형식입니다.');
  }
  return trimmed;
}

function cardLabel(card: Card): string {
  return `${SUIT_SYMBOLS[card.suit]}${card.rank}`;
}

export class GameRoom {
  public readonly state: ServerGameState;
  private readonly onChange: () => void;
  private readonly responseTimeoutMs: number;
  private responseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(roomId: string, onChange: () => void, responseTimeoutMs = 20000) {
    this.onChange = onChange;
    this.responseTimeoutMs = responseTimeoutMs;
    this.state = {
      roomId,
      status: 'LOBBY',
      hostId: '',
      turnPhase: 'DRAW',
      currentTurnPlayerId: '',
      bangPlayedThisTurn: false,
      players: [],
      deck: [],
      discard: [],
      pendingAction: null,
      kitChoices: null,
      lastCheck: null,
      checkSeq: 0,
      effects: [],
      effectSeq: 0,
      logs: [],
    };
  }

  public dispose(): void {
    this.clearResponseTimer();
  }

  public connectedCount(): number {
    return this.state.players.filter((p) => p.connected).length;
  }

  public addPlayer(id: string, nickname: string, avatar?: string | null): void {
    const cleanNick = nickname.trim();
    if (!cleanNick) {
      throw new GameError('닉네임을 입력해주세요.');
    }

    const existing = this.state.players.find((p) => p.id === id);
    if (existing) {
      existing.connected = true;
      if (avatar !== undefined) {
        existing.avatar = sanitizeAvatar(avatar);
      }
      if (this.state.status === 'LOBBY') {
        existing.nickname = cleanNick;
      } else {
        this.pushLog(`${existing.nickname}님이 다시 접속했습니다.`);
      }
      return;
    }

    if (this.state.status !== 'LOBBY') {
      throw new GameError('이미 진행 중인 게임에는 참가할 수 없습니다.');
    }

    if (this.state.players.length >= 7) {
      throw new GameError('방이 가득 찼습니다 (최대 7명).');
    }

    const cleanAvatar = sanitizeAvatar(avatar);

    if (this.state.players.length === 0) {
      this.state.hostId = id;
    }

    this.state.players.push({
      id,
      nickname: cleanNick,
      seatIndex: this.state.players.length,
      hp: 4,
      maxHp: 4,
      isAlive: true,
      role: 'OUTLAW',
      character: 'SID_KETCHUM',
      avatar: cleanAvatar,
      hand: [],
      equipped: [],
      connected: true,
    });
  }

  public updateAvatar(id: string, avatar: string | null): void {
    const player = this.state.players.find((p) => p.id === id);
    if (!player) {
      throw new GameError('방에서 플레이어를 찾을 수 없습니다.');
    }
    player.avatar = sanitizeAvatar(avatar);
  }

  public removePlayer(id: string): void {
    const idx = this.state.players.findIndex((p) => p.id === id);
    if (idx === -1) return;

    if (this.state.status === 'LOBBY') {
      this.state.players.splice(idx, 1);
      this.state.players.forEach((p, i) => {
        p.seatIndex = i;
      });
      if (this.state.hostId === id) {
        this.state.hostId = this.state.players[0]?.id ?? '';
      }
      return;
    }

    const player = this.state.players[idx];
    player.connected = false;
    this.pushLog(`${player.nickname}님의 연결이 끊겼습니다.`);
  }

  public toLobbyView(): LobbyView {
    return {
      roomId: this.state.roomId,
      hostId: this.state.hostId,
      players: this.state.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        connected: p.connected,
        avatar: p.avatar,
      })),
      minPlayers: 4,
      maxPlayers: 7,
    };
  }

  public start(byId: string): void {
    if (this.state.status !== 'LOBBY') {
      throw new GameError('이미 게임이 시작되었습니다.');
    }
    if (this.state.hostId !== byId) {
      throw new GameError('방장만 게임을 시작할 수 있습니다.');
    }

    const count = this.state.players.length;
    if (count < 4 || count > 7) {
      throw new GameError('게임을 시작하려면 4~7명이 필요합니다.');
    }

    const shuffledPlayers = shuffle(this.state.players);
    const roles = shuffle(ROLE_TABLE[count]);
    const characters = shuffle(CHARACTER_LIST);

    this.state.deck = shuffle(createDeck());
    this.state.discard = [];
    this.state.pendingAction = null;
    this.state.kitChoices = null;
    this.state.lastCheck = null;
    this.state.checkSeq = 0;
    this.state.effects = [];
    this.state.effectSeq = 0;
    this.state.winner = undefined;
    this.state.logs = [];

    shuffledPlayers.forEach((p, idx) => {
      const role = roles[idx];
      const char = characters[idx];
      const maxHp = CHARACTER_META[char].hp + (role === 'SHERIFF' ? 1 : 0);
      p.seatIndex = idx;
      p.role = role;
      p.character = char;
      p.maxHp = maxHp;
      p.hp = maxHp;
      p.isAlive = true;
      p.equipped = [];
      p.hand = drawN(this.state, maxHp);
    });

    this.state.players = shuffledPlayers;

    const sheriff = this.state.players.find((p) => p.role === 'SHERIFF')!;
    this.state.status = 'PLAYING';

    this.pushLog('게임이 시작되었습니다!');
    this.pushLog(
      `${sheriff.nickname}님(${CHARACTER_META[sheriff.character].name})이 보안관입니다. 선턴으로 시작합니다.`
    );
    this.beginTurn(sheriff);
  }

  public draw(id: string): void {
    const player = this.requireTurnPlayer(id);
    if (this.state.turnPhase !== 'DRAW') {
      throw new GameError('지금은 카드를 뽑는 단계가 아닙니다.');
    }
    if (this.state.kitChoices) {
      throw new GameError('먼저 3장 중 2장을 선택해주세요.');
    }

    if (player.character === 'KIT_CARLSON') {
      const drawn = drawN(this.state, 3);
      if (drawn.length <= 2) {
        player.hand.push(...drawn);
        this.state.turnPhase = 'ACTION';
        this.pushLog(
          `${player.nickname}님(킷 칼슨)이 카드 ${drawn.length}장을 뽑았습니다.`
        );
        this.pushEffect({ type: 'DRAW', targetPlayerId: player.id, amount: drawn.length });
        return;
      }
      this.state.kitChoices = drawn;
      this.pushLog(
        `${player.nickname}님(킷 칼슨)이 3장을 확인하고 2장을 고르는 중입니다.`
      );
      return;
    }

    const cards = drawN(this.state, 2);
    player.hand.push(...cards);
    this.pushLog(`${player.nickname}님이 카드 ${cards.length}장을 뽑았습니다.`);

    let bonusDrawn = 0;
    if (player.character === 'BLACK_JACK' && cards.length === 2) {
      const second = cards[1];
      const isRed = second.suit === 'HEARTS' || second.suit === 'DIAMONDS';
      if (isRed) {
        const bonus = drawOne(this.state);
        if (bonus) {
          player.hand.push(bonus);
          bonusDrawn = 1;
          this.pushLog(
            `🃏 ${player.nickname}님(블랙 잭)의 2번째 카드가 ${cardLabel(second)}이므로 1장을 추가로 뽑았습니다!`
          );
        } else {
          this.pushLog(
            `🃏 ${player.nickname}님(블랙 잭)의 2번째 카드는 ${cardLabel(second)}입니다.`
          );
        }
      } else {
        this.pushLog(
          `🃏 ${player.nickname}님(블랙 잭)의 2번째 카드는 ${cardLabel(second)}입니다.`
        );
      }
    }

    this.pushEffect({
      type: 'DRAW',
      targetPlayerId: player.id,
      amount: cards.length + bonusDrawn,
    });
    this.state.turnPhase = 'ACTION';
  }

  public specialDraw(
    id: string,
    mode: 'DISCARD' | 'PLAYER',
    targetPlayerId?: string
  ): void {
    const player = this.requireTurnPlayer(id);
    if (this.state.turnPhase !== 'DRAW') {
      throw new GameError('지금은 카드를 뽑는 단계가 아닙니다.');
    }
    if (this.state.kitChoices) {
      throw new GameError('먼저 3장 중 2장을 선택해주세요.');
    }

    if (mode === 'DISCARD') {
      if (player.character !== 'PEDRO_RAMIREZ') {
        throw new GameError('페드로 라미레즈만 버린 더미에서 뽑을 수 있습니다.');
      }
      if (this.state.discard.length === 0) {
        throw new GameError('버린 더미가 비어 있습니다.');
      }

      const top = this.state.discard.pop()!;
      const second = drawOne(this.state);
      player.hand.push(top);
      if (second) player.hand.push(second);
      this.state.turnPhase = 'ACTION';
      this.pushLog(
        `${player.nickname}님(페드로 라미레즈)이 버린 더미 맨 위(${cardLabel(top)})와 덱에서 ${
          second ? '1' : '0'
        }장을 뽑았습니다.`
      );
      this.pushEffect({
        type: 'DRAW',
        targetPlayerId: player.id,
        amount: second ? 2 : 1,
      });
      return;
    }

    if (mode === 'PLAYER') {
      if (player.character !== 'JESSE_JONES') {
        throw new GameError('제시 존스만 다른 플레이어에게서 카드를 뽑을 수 있습니다.');
      }
      if (!targetPlayerId || targetPlayerId === player.id) {
        throw new GameError('카드를 가져올 다른 플레이어를 선택해주세요.');
      }
      const target = this.state.players.find((p) => p.id === targetPlayerId);
      if (!target || !target.isAlive) {
        throw new GameError('유효하지 않은 대상입니다.');
      }
      if (target.hand.length === 0) {
        throw new GameError('대상의 손패가 비어 있습니다.');
      }

      const randIdx = Math.floor(Math.random() * target.hand.length);
      const [stolen] = target.hand.splice(randIdx, 1);
      player.hand.push(stolen);
      const second = drawOne(this.state);
      if (second) player.hand.push(second);
      this.state.turnPhase = 'ACTION';
      this.pushLog(
        `${player.nickname}님(제시 존스)이 ${target.nickname}님의 손패에서 1장, 덱에서 ${
          second ? '1' : '0'
        }장을 뽑았습니다.`
      );
      this.pushEffect({
        type: 'DRAW',
        sourcePlayerId: target.id,
        targetPlayerId: player.id,
        amount: second ? 2 : 1,
      });
      this.checkSuzy(target);
      return;
    }

    throw new GameError('지원하지 않는 드로우 방식입니다.');
  }

  public pickKitCards(id: string, cardIds: string[]): void {
    const player = this.requireTurnPlayer(id);
    if (this.state.turnPhase !== 'DRAW' || !this.state.kitChoices) {
      throw new GameError('현재 선택할 킷 칼슨 카드가 없습니다.');
    }

    const unique = new Set(cardIds);
    if (unique.size !== 2 || cardIds.length !== 2) {
      throw new GameError('정확히 2장의 카드를 선택해야 합니다.');
    }

    const choices = this.state.kitChoices;
    for (const cid of cardIds) {
      if (!choices.some((c) => c.id === cid)) {
        throw new GameError('유효하지 않은 카드 선택입니다.');
      }
    }

    const picked = choices.filter((c) => unique.has(c.id));
    const returned = choices.filter((c) => !unique.has(c.id));

    player.hand.push(...picked);
    for (const r of returned) {
      this.state.deck.push(r);
    }

    this.state.kitChoices = null;
    this.state.turnPhase = 'ACTION';
    this.pushLog(`${player.nickname}님(킷 칼슨)이 3장 중 2장을 선택했습니다.`);
    this.pushEffect({ type: 'DRAW', targetPlayerId: player.id, amount: picked.length });
  }

  public useAbility(id: string, type: 'SID_HEAL', cardIds: string[]): void {
    const player = this.requireTurnPlayer(id);
    if (this.state.turnPhase !== 'ACTION' || this.state.pendingAction) {
      throw new GameError('행동 단계에서만 능력을 사용할 수 있습니다.');
    }
    if (type !== 'SID_HEAL' || player.character !== 'SID_KETCHUM') {
      throw new GameError('시드 케첨만 사용할 수 있는 능력입니다.');
    }
    if (player.hp >= player.maxHp) {
      throw new GameError('체력이 이미 최대치입니다.');
    }

    const unique = new Set(cardIds);
    if (unique.size !== 2 || cardIds.length !== 2) {
      throw new GameError('체력을 회복하려면 손패에서 서로 다른 카드 2장을 버려야 합니다.');
    }
    for (const cid of cardIds) {
      if (!player.hand.some((c) => c.id === cid)) {
        throw new GameError('손패에 없는 카드가 포함되어 있습니다.');
      }
    }

    for (const cid of cardIds) {
      const idx = player.hand.findIndex((c) => c.id === cid);
      const [removed] = player.hand.splice(idx, 1);
      this.state.discard.push(removed);
    }
    player.hp += 1;
    this.pushLog(
      `${player.nickname}님(시드 케첨)이 카드 2장을 버리고 체력을 1 회복했습니다 (${player.hp}/${player.maxHp}).`
    );
    this.pushEffect({ type: 'HEAL', targetPlayerId: player.id, amount: 1 });
  }

  public playCard(id: string, cardId: string, targetId?: string): void {
    const player = this.requireTurnPlayer(id);
    if (this.state.turnPhase !== 'ACTION') {
      if (this.state.turnPhase === 'WAITING_FOR_RESPONSE') {
        throw new GameError('상대방의 응답을 기다리는 중입니다.');
      }
      if (this.state.turnPhase === 'DRAW') {
        throw new GameError('먼저 카드를 2장 뽑아야 합니다.');
      }
      throw new GameError('지금은 카드를 사용할 수 없는 단계입니다.');
    }
    if (this.state.pendingAction) {
      throw new GameError('대기 중인 응답이 완료될 때까지 카드를 사용할 수 없습니다.');
    }

    const cardIdx = player.hand.findIndex((c) => c.id === cardId);
    if (cardIdx === -1) {
      throw new GameError('손패에 해당 카드가 없습니다.');
    }

    const card = player.hand[cardIdx];
    const isBangPlay =
      card.type === 'BANG' ||
      (card.type === 'MISSED' && player.character === 'CALAMITY_JANET');

    if (isBangPlay) {
      if (this.state.bangPlayedThisTurn && !canPlayUnlimitedBang(player)) {
        throw new GameError('이번 턴에는 이미 BANG!을 사용했습니다.');
      }
      if (!targetId) {
        throw new GameError('공격할 대상을 선택해주세요.');
      }
      if (targetId === player.id) {
        throw new GameError('자기 자신을 공격할 수 없습니다.');
      }

      const target = this.state.players.find((p) => p.id === targetId);
      if (!target || !target.isAlive) {
        throw new GameError('유효하지 않은 공격 대상입니다.');
      }

      const dist = distance(this.state, player.id, target.id);
      const range = weaponRange(player);
      if (dist > range) {
        throw new GameError(`사거리 밖입니다 (거리 ${dist}, 사거리 ${range}).`);
      }

      player.hand.splice(cardIdx, 1);
      this.state.discard.push(card);
      this.state.bangPlayedThisTurn = true;
      if (card.type === 'MISSED') {
        this.pushLog(
          `${player.nickname}님(캘러미티 자넷)이 빗나감!을 BANG!으로 사용해 ${target.nickname}님을 공격했습니다.`
        );
      } else {
        this.pushLog(`${player.nickname}님이 ${target.nickname}님에게 BANG!을 쏘았습니다.`);
      }
      this.pushEffect({
        type: 'BANG',
        sourcePlayerId: player.id,
        targetPlayerId: target.id,
      });
      this.checkSuzy(player);

      let needed = player.character === 'SLAB_THE_KILLER' ? 2 : 1;

      if (target.character === 'JOURDONNAIS') {
        const dodged = this.drawCheck(
          target,
          'BARREL',
          (c) => c.suit === 'HEARTS',
          false
        );
        if (dodged) {
          needed -= 1;
          this.pushLog(`${target.nickname}님(주르도네)이 고유 술통 능력으로 빗나감 효과를 얻었습니다!`);
          this.pushEffect({
            type: 'MISSED',
            targetPlayerId: target.id,
            label: '술통 회피!',
          });
        }
      }

      if (needed > 0 && hasEquipped(target, 'BARREL')) {
        const dodged = this.drawCheck(
          target,
          'BARREL',
          (c) => c.suit === 'HEARTS',
          false
        );
        if (dodged) {
          needed -= 1;
          this.pushLog(`${target.nickname}님이 술통으로 빗나감 효과를 얻었습니다!`);
          this.pushEffect({
            type: 'MISSED',
            targetPlayerId: target.id,
            label: '술통 회피!',
          });
        }
      }

      if (needed <= 0) {
        this.pushLog(`${target.nickname}님이 BANG!을 완전히 회피했습니다!`);
        return;
      }

      this.state.turnPhase = 'WAITING_FOR_RESPONSE';
      const deadline = Date.now() + this.responseTimeoutMs;
      this.state.pendingAction = {
        type: 'RESPOND_BANG',
        sourcePlayerId: player.id,
        targetPlayerId: target.id,
        requiredCard: 'MISSED',
        requiredCount: needed,
        responseDeadline: deadline,
      };

      this.startResponseTimer();
      return;
    }

    if (card.type === 'MISSED') {
      throw new GameError('빗나감!은 상대방의 BANG!에 대응할 때만 사용할 수 있습니다.');
    }

    if (card.type === 'BEER') {
      const aliveCount = this.state.players.filter((p) => p.isAlive).length;
      if (aliveCount <= 2) {
        throw new GameError('생존자가 2명 이하일 때는 맥주를 사용할 수 없습니다.');
      }
      if (player.hp >= player.maxHp) {
        throw new GameError('체력이 이미 최대치입니다.');
      }

      player.hand.splice(cardIdx, 1);
      this.state.discard.push(card);
      player.hp += 1;
      this.pushLog(`${player.nickname}님이 맥주를 마셔 체력을 1 회복했습니다 (${player.hp}/${player.maxHp}).`);
      this.pushEffect({ type: 'HEAL', targetPlayerId: player.id, amount: 1 });
      this.checkSuzy(player);
      return;
    }

    if (card.type === 'STAGECOACH') {
      player.hand.splice(cardIdx, 1);
      this.state.discard.push(card);
      const drawn = drawN(this.state, 2);
      player.hand.push(...drawn);
      this.pushLog(`${player.nickname}님이 역마차를 사용해 카드 ${drawn.length}장을 뽑았습니다.`);
      this.pushEffect({ type: 'DRAW', targetPlayerId: player.id, amount: drawn.length });
      this.checkSuzy(player);
      return;
    }

    if (isWeapon(card.type)) {
      player.hand.splice(cardIdx, 1);
      const oldWeaponIdx = player.equipped.findIndex((c) => isWeapon(c.type));
      if (oldWeaponIdx !== -1) {
        const [oldWeapon] = player.equipped.splice(oldWeaponIdx, 1);
        this.state.discard.push(oldWeapon);
      }
      player.equipped.push(card);
      const label = WEAPON_LABELS[card.type] ?? card.type;
      this.pushLog(`${player.nickname}님이 ${label}을(를) 장착했습니다.`);
      this.pushEffect({
        type: 'EQUIP',
        sourcePlayerId: player.id,
        targetPlayerId: player.id,
      });
      this.checkSuzy(player);
      return;
    }

    if (
      card.type === 'BARREL' ||
      card.type === 'MUSTANG' ||
      card.type === 'SCOPE' ||
      card.type === 'DYNAMITE'
    ) {
      if (hasEquipped(player, card.type)) {
        throw new GameError('이미 같은 장비를 장착하고 있습니다.');
      }
      player.hand.splice(cardIdx, 1);
      player.equipped.push(card);
      const label = EQUIP_LABELS[card.type] ?? card.type;
      this.pushLog(`${player.nickname}님이 ${label}을(를) 장착했습니다.`);
      this.pushEffect({
        type: 'EQUIP',
        sourcePlayerId: player.id,
        targetPlayerId: player.id,
      });
      this.checkSuzy(player);
      return;
    }

    if (card.type === 'JAIL') {
      if (!targetId) {
        throw new GameError('감옥에 가둘 대상을 선택해주세요.');
      }
      if (targetId === player.id) {
        throw new GameError('자기 자신에게는 감옥을 사용할 수 없습니다.');
      }
      const target = this.state.players.find((p) => p.id === targetId);
      if (!target || !target.isAlive) {
        throw new GameError('유효하지 않은 대상입니다.');
      }
      if (target.role === 'SHERIFF') {
        throw new GameError('보안관에게는 감옥을 사용할 수 없습니다.');
      }
      if (hasEquipped(target, 'JAIL')) {
        throw new GameError('이미 감옥에 갇혀 있는 대상입니다.');
      }

      player.hand.splice(cardIdx, 1);
      target.equipped.push(card);
      this.pushLog(`${player.nickname}님이 ${target.nickname}님을 감옥에 가두었습니다.`);
      this.pushEffect({
        type: 'EQUIP',
        sourcePlayerId: player.id,
        targetPlayerId: target.id,
      });
      this.checkSuzy(player);
      return;
    }

    throw new GameError('현재 지원되지 않는 카드입니다.');
  }

  public respond(id: string, cardId: string | null): void {
    if (this.state.status !== 'PLAYING') {
      throw new GameError('진행 중인 게임이 아닙니다.');
    }
    if (this.state.turnPhase !== 'WAITING_FOR_RESPONSE' || !this.state.pendingAction) {
      throw new GameError('현재 대기 중인 응답이 없습니다.');
    }

    const pending = this.state.pendingAction;
    if (pending.targetPlayerId !== id) {
      throw new GameError('응답할 차례가 아닙니다.');
    }

    const target = this.state.players.find((p) => p.id === pending.targetPlayerId)!;
    const source = this.state.players.find((p) => p.id === pending.sourcePlayerId);

    if (cardId !== null) {
      const cardIdx = target.hand.findIndex((c) => c.id === cardId);
      if (cardIdx === -1) {
        throw new GameError('손패에 해당 카드가 없습니다.');
      }
      const card = target.hand[cardIdx];
      const isValid =
        card.type === pending.requiredCard ||
        (pending.requiredCard === 'MISSED' &&
          target.character === 'CALAMITY_JANET' &&
          card.type === 'BANG');

      if (!isValid) {
        throw new GameError(
          target.character === 'CALAMITY_JANET'
            ? '빗나감! 또는 BANG! 카드만 제출할 수 있습니다.'
            : '빗나감! 카드만 제출할 수 있습니다.'
        );
      }

      target.hand.splice(cardIdx, 1);
      this.state.discard.push(card);
      this.checkSuzy(target);

      const left = (pending.requiredCount ?? 1) - 1;
      if (left > 0) {
        pending.requiredCount = left;
        pending.responseDeadline = Date.now() + this.responseTimeoutMs;
        this.startResponseTimer();
        this.pushLog(`${target.nickname}님이 회피 카드 1장을 냈습니다 (남은 필요 장수: ${left}장).`);
        this.pushEffect({
          type: 'MISSED',
          targetPlayerId: target.id,
          label: '방어 1장!',
        });
        return;
      }

      this.clearResponseTimer();
      this.state.pendingAction = null;
      this.state.turnPhase = 'ACTION';
      if (card.type === 'BANG') {
        this.pushLog(`${target.nickname}님(캘러미티 자넷)이 BANG!으로 공격을 회피했습니다.`);
      } else {
        this.pushLog(`${target.nickname}님이 빗나감!으로 공격을 회피했습니다.`);
      }
      this.pushEffect({
        type: 'MISSED',
        targetPlayerId: target.id,
        label: '빗나감!',
      });
      return;
    }

    this.resolveHit(target, source, false);
  }

  public endTurn(id: string): void {
    const player = this.requireTurnPlayer(id);
    if (this.state.turnPhase === 'WAITING_FOR_RESPONSE') {
      throw new GameError('상대방의 응답을 기다리는 중입니다.');
    }
    if (this.state.turnPhase === 'DRAW') {
      throw new GameError('먼저 카드를 2장 뽑아야 합니다.');
    }
    if (this.state.turnPhase === 'DISCARD') {
      throw new GameError('초과한 카드를 먼저 버려야 턴을 마칠 수 있습니다.');
    }

    if (player.hand.length > player.hp) {
      this.state.turnPhase = 'DISCARD';
      const excess = player.hand.length - player.hp;
      this.pushLog(`${player.nickname}님은 현재 체력(${player.hp})을 초과한 카드 ${excess}장을 버려야 합니다.`);
      return;
    }

    this.advanceTurn();
  }

  public discardCards(id: string, cardIds: string[]): void {
    const player = this.requireTurnPlayer(id);
    if (this.state.turnPhase !== 'DISCARD' || this.state.pendingAction) {
      throw new GameError('지금은 카드를 버리는 단계가 아닙니다.');
    }

    const excess = player.hand.length - player.hp;
    const uniqueIds = new Set(cardIds);
    if (uniqueIds.size !== cardIds.length) {
      throw new GameError('중복된 카드가 선택되었습니다.');
    }
    if (cardIds.length !== excess) {
      throw new GameError(`정확히 ${excess}장의 카드를 선택해 버려야 합니다.`);
    }

    for (const cid of cardIds) {
      if (!player.hand.some((c) => c.id === cid)) {
        throw new GameError('손패에 없는 카드가 포함되어 있습니다.');
      }
    }

    for (const cid of cardIds) {
      const idx = player.hand.findIndex((c) => c.id === cid);
      const [removed] = player.hand.splice(idx, 1);
      this.state.discard.push(removed);
    }

    this.pushLog(`${player.nickname}님이 초과 카드 ${cardIds.length}장을 버렸습니다.`);
    this.checkSuzy(player);
    this.advanceTurn();
  }

  private requireTurnPlayer(id: string): ServerPlayer {
    if (this.state.status !== 'PLAYING') {
      throw new GameError('진행 중인 게임이 아닙니다.');
    }
    if (this.state.currentTurnPlayerId !== id) {
      throw new GameError('당신의 턴이 아닙니다.');
    }
    const player = this.state.players.find((p) => p.id === id);
    if (!player || !player.isAlive) {
      throw new GameError('유효하지 않은 플레이어입니다.');
    }
    return player;
  }

  private startResponseTimer(): void {
    this.clearResponseTimer();
    const expectedPending = this.state.pendingAction;
    this.responseTimer = setTimeout(() => {
      this.responseTimer = null;
      if (
        this.state.status !== 'PLAYING' ||
        this.state.turnPhase !== 'WAITING_FOR_RESPONSE' ||
        this.state.pendingAction !== expectedPending ||
        !expectedPending
      ) {
        return;
      }

      const target = this.state.players.find((p) => p.id === expectedPending.targetPlayerId);
      const source = this.state.players.find((p) => p.id === expectedPending.sourcePlayerId);
      if (!target) return;

      this.resolveHit(target, source, true);
      this.onChange();
    }, this.responseTimeoutMs);
  }

  private clearResponseTimer(): void {
    if (this.responseTimer) {
      clearTimeout(this.responseTimer);
      this.responseTimer = null;
    }
  }

  private resolveHit(
    target: ServerPlayer,
    source: ServerPlayer | undefined,
    timedOut: boolean
  ): void {
    this.clearResponseTimer();
    this.state.pendingAction = null;
    this.state.turnPhase = 'ACTION';

    if (timedOut) {
      this.pushLog(`${target.nickname}님이 시간 초과로 BANG!에 명중했습니다.`);
    } else {
      this.pushLog(`${target.nickname}님이 BANG!에 명중했습니다.`);
    }

    this.applyDamage(target, source);
  }

  private checkSuzy(player: ServerPlayer): void {
    if (
      this.state.status === 'PLAYING' &&
      player.isAlive &&
      player.character === 'SUZY_LAFAYETTE' &&
      player.hand.length === 0
    ) {
      const drawn = drawOne(this.state);
      if (drawn) {
        player.hand.push(drawn);
        this.pushLog(
          `${player.nickname}님(수지 라파예트)이 손패가 비어 카드 1장을 뽑았습니다.`
        );
      }
    }
  }

  private applyDamage(
    target: ServerPlayer,
    source: ServerPlayer | undefined,
    amount = 1,
    emitHitEffect = true
  ): void {
    target.hp -= amount;
    if (emitHitEffect) {
      this.pushEffect({
        type: 'HIT',
        sourcePlayerId: source?.id,
        targetPlayerId: target.id,
        amount,
      });
    }
    if (target.hp <= 0) {
      const aliveCount = this.state.players.filter((p) => p.isAlive).length;
      if (aliveCount > 2) {
        while (target.hp <= 0) {
          const beerIdx = target.hand.findIndex((c) => c.type === 'BEER');
          if (beerIdx === -1) break;
          const [beer] = target.hand.splice(beerIdx, 1);
          this.state.discard.push(beer);
          target.hp += 1;
          this.pushLog(`${target.nickname}님이 마지막 맥주 카드로 위기를 모면했습니다! (HP ${target.hp})`);
          this.pushEffect({ type: 'HEAL', targetPlayerId: target.id, amount: 1 });
        }
      }
    }

    if (target.hp > 0) {
      this.checkSuzy(target);
      if (target.character === 'BART_CASSIDY') {
        const drawn = drawN(this.state, amount);
        target.hand.push(...drawn);
        this.pushLog(
          `${target.nickname}님(바트 캐시디)이 피해 보상으로 카드 ${drawn.length}장을 뽑았습니다.`
        );
      }
      if (
        target.character === 'EL_GRINGO' &&
        source &&
        source.id !== target.id &&
        source.isAlive
      ) {
        let stolenCount = 0;
        for (let i = 0; i < amount && source.hand.length > 0; i++) {
          const randIdx = Math.floor(Math.random() * source.hand.length);
          const [stolen] = source.hand.splice(randIdx, 1);
          target.hand.push(stolen);
          stolenCount += 1;
        }
        if (stolenCount > 0) {
          this.pushLog(
            `${target.nickname}님(엘 그링고)이 ${source.nickname}님의 손패에서 ${stolenCount}장을 가져갔습니다.`
          );
          this.checkSuzy(source);
        }
      }
      return;
    }

    target.hp = 0;
    target.isAlive = false;
    const loot = [...target.hand, ...target.equipped];
    target.hand = [];
    target.equipped = [];
    this.pushLog(`${target.nickname}님이 사망했습니다! 정체는 [${ROLE_LABELS[target.role]}]이었습니다.`);
    this.pushEffect({ type: 'DEATH', targetPlayerId: target.id });

    const vultureSam = this.state.players.find(
      (p) => p.isAlive && p.id !== target.id && p.character === 'VULTURE_SAM'
    );
    if (vultureSam) {
      vultureSam.hand.push(...loot);
      if (loot.length > 0) {
        this.pushLog(
          `${vultureSam.nickname}님(벌처 샘)이 ${target.nickname}님의 카드 ${loot.length}장을 모두 회수했습니다.`
        );
      }
    } else {
      this.state.discard.push(...loot);
    }

    if (source && source.isAlive && source.id !== target.id) {
      if (target.role === 'OUTLAW') {
        const reward = drawN(this.state, 3);
        source.hand.push(...reward);
        this.pushLog(`${source.nickname}님이 무법자 처치 보상으로 카드 ${reward.length}장을 뽑았습니다.`);
      } else if (target.role === 'DEPUTY' && source.role === 'SHERIFF') {
        this.state.discard.push(...source.hand, ...source.equipped);
        source.hand = [];
        source.equipped = [];
        this.pushLog(`보안관 ${source.nickname}님이 부관을 처치하여 손패와 장비를 모두 잃었습니다!`);
        this.checkSuzy(source);
      }
    }

    this.checkVictory();
  }

  private checkVictory(): void {
    const sheriff = this.state.players.find((p) => p.role === 'SHERIFF');
    if (sheriff && !sheriff.isAlive) {
      const alive = this.state.players.filter((p) => p.isAlive);
      if (alive.length === 1 && alive[0].role === 'RENEGADE') {
        this.state.winner = 'RENEGADE';
        this.pushLog('배신자가 최후의 생존자가 되어 승리했습니다!');
      } else {
        this.state.winner = 'OUTLAW_TEAM';
        this.pushLog('보안관이 사망하여 무법자 팀이 승리했습니다!');
      }
      this.state.status = 'FINISHED';
      this.clearResponseTimer();
      this.state.pendingAction = null;
      return;
    }

    const enemiesAlive = this.state.players.some(
      (p) => p.isAlive && (p.role === 'OUTLAW' || p.role === 'RENEGADE')
    );
    if (!enemiesAlive) {
      this.state.winner = 'SHERIFF_TEAM';
      this.state.status = 'FINISHED';
      this.clearResponseTimer();
      this.state.pendingAction = null;
      this.pushLog('모든 무법자와 배신자가 제거되어 보안관 팀이 승리했습니다!');
    }
  }

  private drawCheck(
    player: ServerPlayer,
    reason: CheckResult['reason'],
    isSuccess: (card: Card) => boolean,
    nullSuccess: boolean
  ): boolean {
    let chosen: Card | null = null;
    let success: boolean;
    let cardText = '카드 없음';

    if (player.character === 'LUCKY_DUKE') {
      const c1 = drawOne(this.state);
      const c2 = drawOne(this.state);
      const drawn = [c1, c2].filter((c): c is Card => c !== null);
      for (const c of drawn) {
        this.state.discard.push(c);
      }

      if (drawn.length === 0) {
        success = nullSuccess;
      } else {
        const hit = drawn.find((c) => isSuccess(c));
        chosen = hit ?? drawn[0];
        success = Boolean(hit);
        cardText = drawn.map(cardLabel).join(', ');
      }
    } else {
      const card = drawOne(this.state);
      if (card) {
        this.state.discard.push(card);
        chosen = card;
        success = isSuccess(card);
        cardText = cardLabel(card);
      } else {
        success = nullSuccess;
      }
    }

    this.state.checkSeq += 1;
    this.state.lastCheck = {
      seq: this.state.checkSeq,
      playerId: player.id,
      reason,
      card: chosen ? { ...chosen } : null,
      success,
    };

    const reasonLabel = CHECK_REASON_LABELS[reason];
    const outcomeText =
      reason === 'BARREL'
        ? success
          ? '회피 성공'
          : '회피 실패'
        : reason === 'JAIL'
          ? success
            ? '탈출 성공'
            : '탈출 실패'
          : success
            ? '불발'
            : '폭발!';

    const luckyPrefix = player.character === 'LUCKY_DUKE' ? '(럭키 듀크) ' : '';
    this.pushLog(
      `🎲 ${player.nickname}님${luckyPrefix} ${reasonLabel} 판정: ${cardText} → ${outcomeText}`
    );
    return success;
  }

  private nextAlivePlayerAfter(seatIndex: number): ServerPlayer | undefined {
    const alive = this.state.players
      .filter((p) => p.isAlive)
      .sort((a, b) => a.seatIndex - b.seatIndex);

    if (alive.length === 0) return undefined;
    return alive.find((p) => p.seatIndex > seatIndex) ?? alive[0];
  }

  private beginTurn(player: ServerPlayer): void {
    if (this.state.status !== 'PLAYING') return;

    this.state.currentTurnPlayerId = player.id;
    this.state.bangPlayedThisTurn = false;
    this.state.turnPhase = 'DRAW';
    this.pushLog(`${player.nickname}님의 턴입니다.`);

    const dynIdx = player.equipped.findIndex((c) => c.type === 'DYNAMITE');
    if (dynIdx !== -1) {
      const exploded = !this.drawCheck(
        player,
        'DYNAMITE',
        (c) => !isDynamiteExplosion(c),
        true
      );
      const [dynCard] = player.equipped.splice(dynIdx, 1);
      if (exploded) {
        this.state.discard.push(dynCard);
        this.pushLog(`💥 ${player.nickname}님의 다이너마이트가 폭발해 3의 피해를 입었습니다!`);
        this.pushEffect({
          type: 'DYNAMITE_BOOM',
          targetPlayerId: player.id,
          amount: 3,
        });
        this.applyDamage(player, undefined, 3, false);
        if (this.state.status !== 'PLAYING') return;
        if (!player.isAlive) {
          this.advanceTurn();
          return;
        }
      } else {
        const nextAlive = this.nextAlivePlayerAfter(player.seatIndex);
        if (nextAlive && nextAlive.id !== player.id) {
          nextAlive.equipped.push(dynCard);
          this.pushLog(`다이너마이트가 ${nextAlive.nickname}님에게 넘어갔습니다.`);
        } else {
          player.equipped.push(dynCard);
        }
      }
    }

    const jailIdx = player.equipped.findIndex((c) => c.type === 'JAIL');
    if (jailIdx !== -1) {
      const escaped = this.drawCheck(
        player,
        'JAIL',
        (c) => c.suit === 'HEARTS',
        true
      );
      const [jailCard] = player.equipped.splice(jailIdx, 1);
      this.state.discard.push(jailCard);
      if (!escaped) {
        this.pushLog(`⛓️ ${player.nickname}님이 감옥에 갇혀 턴을 건너뜁니다.`);
        this.pushEffect({ type: 'JAIL_SKIP', targetPlayerId: player.id });
        this.advanceTurn();
        return;
      }
      this.pushLog(`${player.nickname}님이 감옥에서 탈출해 턴을 계속합니다!`);
    }
  }

  private advanceTurn(): void {
    if (this.state.status !== 'PLAYING') return;

    const current = this.state.players.find((p) => p.id === this.state.currentTurnPlayerId);
    const currentSeat = current?.seatIndex ?? -1;
    const next = this.nextAlivePlayerAfter(currentSeat);
    if (!next) return;

    this.beginTurn(next);
  }

  private pushEffect(effect: Omit<GameEffect, 'seq'>): void {
    this.state.effectSeq += 1;
    this.state.effects.push({ seq: this.state.effectSeq, ...effect });
    if (this.state.effects.length > MAX_EFFECTS) {
      this.state.effects = this.state.effects.slice(-MAX_EFFECTS);
    }
  }

  private pushLog(message: string): void {
    this.state.logs.push(message);
    if (this.state.logs.length > MAX_LOGS) {
      this.state.logs = this.state.logs.slice(-MAX_LOGS);
    }
  }
}
