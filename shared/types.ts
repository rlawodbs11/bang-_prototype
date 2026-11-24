export type Role = 'SHERIFF' | 'DEPUTY' | 'OUTLAW' | 'RENEGADE';

export type CharacterId =
  | 'BART_CASSIDY'
  | 'BLACK_JACK'
  | 'CALAMITY_JANET'
  | 'EL_GRINGO'
  | 'JESSE_JONES'
  | 'JOURDONNAIS'
  | 'KIT_CARLSON'
  | 'LUCKY_DUKE'
  | 'PAUL_REGRET'
  | 'PEDRO_RAMIREZ'
  | 'ROSE_DOOLAN'
  | 'SID_KETCHUM'
  | 'SLAB_THE_KILLER'
  | 'SUZY_LAFAYETTE'
  | 'VULTURE_SAM'
  | 'WILLY_THE_KID';

export type CardType =
  | 'BANG' | 'MISSED' | 'BEER' | 'STAGECOACH' | 'WELLS_FARGO'
  | 'GATLING' | 'INDIANS' | 'DUEL' | 'PANIC' | 'CAT_BALOU' | 'GENERAL_STORE'
  | 'WEAPON_VOLCANIC' | 'WEAPON_SCHOFIELD' | 'WEAPON_REMINGTON' | 'WEAPON_CARABINE' | 'WEAPON_WINCHESTER'
  | 'BARREL' | 'MUSTANG' | 'SCOPE' | 'JAIL' | 'DYNAMITE';

export interface Card {
  id: string;
  type: CardType;
  suit: 'SPADES' | 'HEARTS' | 'DIAMONDS' | 'CLUBS';
  rank: string; // 'A', '2'..'10', 'J', 'Q', 'K'
}

// 다른 플레이어에게 공개되는 정보
export interface PublicPlayer {
  id: string;
  nickname: string;
  seatIndex: number;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  role: Role | null; // 보안관 및 사망자만 공개, 나머지는 null
  handCount: number; // 장수만 공개
  equipped: Card[];  // 장착된 파란 테두리 카드
  weaponRange: number;
  character?: CharacterId;
  avatar?: string | null;
}

// 인터럽트(반응 대기) 상태 정의
export interface PendingAction {
  type: 'RESPOND_BANG' | 'RESPOND_DUEL' | 'RESPOND_INDIANS' | 'PICK_GENERAL_STORE';
  sourcePlayerId: string;
  targetPlayerId: string; // 현재 응답해야 할 플레이어
  requiredCard: CardType; // 내야 하는 카드 (예: MISSED 또는 BANG)
  remainingQueue?: string[]; // 전체 공격 시 남은 응답자 ID 목록
  responseDeadline?: number; // 응답 제한 시각 (epoch ms)
  requiredCount?: number; // 필요한 응답 카드 장수 (예: 슬랩 더 킬러 2장)
}

export interface CheckResult {
  seq: number;               // 판정마다 1씩 증가 (UI 갱신용)
  playerId: string;          // 판정한 플레이어
  reason: 'BARREL' | 'JAIL' | 'DYNAMITE';
  card: Card | null;         // 뒤집은 카드 (덱이 완전히 비면 null)
  success: boolean;          // 플레이어에게 유리한 결과 (회피/탈출/불발)
}

export type GameEffectType =
  | 'BANG'
  | 'MISSED'
  | 'HIT'
  | 'HEAL'
  | 'DYNAMITE_BOOM'
  | 'JAIL_SKIP'
  | 'DEATH'
  | 'EQUIP'
  | 'DRAW';

export interface GameEffect {
  seq: number;
  type: GameEffectType;
  sourcePlayerId?: string;
  targetPlayerId?: string;
  amount?: number;
  label?: string;
}

// 서버가 각 플레이어에게 필터링해서 보내주는 최종 뷰
export interface ClientGameView {
  roomId: string;
  status: 'LOBBY' | 'PLAYING' | 'FINISHED';
  turnPhase: 'DRAW' | 'ACTION' | 'DISCARD' | 'WAITING_FOR_RESPONSE';
  currentTurnPlayerId: string;
  bangPlayedThisTurn: boolean;
  myInfo: PublicPlayer & {
    role: Role;     // 내 직업은 항상 확인 가능
    hand: Card[];   // 내 손패 전체
    kitChoices?: Card[] | null; // 킷 칼슨 3장 중 선택 후보 (본인에게만 공개)
  };
  players: PublicPlayer[]; // 나를 포함한 전체 테이블 플레이어 (원형 배치용)
  discardTop: Card | null;
  deckCount: number;
  pendingAction: PendingAction | null;
  lastCheck?: CheckResult | null;
  effects?: GameEffect[];
  logs: string[];
  winner?: 'SHERIFF_TEAM' | 'OUTLAW_TEAM' | 'RENEGADE';
}


export interface LobbyPlayer {
  id: string;
  nickname: string;
  connected: boolean;
  avatar?: string | null;
}

export interface LobbyView {
  roomId: string;
  hostId: string;
  players: LobbyPlayer[];
  minPlayers: 4;
  maxPlayers: 7;
}

export type AckResponse =
  | { ok: true; roomId?: string }
  | { ok: false; error: string };

export type Ack = (res: AckResponse) => void;

export interface ClientToServerEvents {
  create_room: (
    p: { nickname: string; playerId: string; avatar?: string | null },
    ack: Ack
  ) => void;
  join_room: (
    p: { roomId: string; nickname: string; playerId: string; avatar?: string | null },
    ack: Ack
  ) => void;
  update_profile: (p: { avatar: string | null }, ack: Ack) => void;
  leave_room: () => void;
  start_game: (ack: Ack) => void;
  draw_cards: (ack: Ack) => void;
  play_card: (p: { cardId: string; targetPlayerId?: string }, ack: Ack) => void;
  respond: (p: { cardId: string | null }, ack: Ack) => void;
  end_turn: (ack: Ack) => void;
  discard_cards: (p: { cardIds: string[] }, ack: Ack) => void;
  special_draw: (
    p: { mode: 'DISCARD' | 'PLAYER'; targetPlayerId?: string },
    ack: Ack
  ) => void;
  pick_kit_cards: (p: { cardIds: string[] }, ack: Ack) => void;
  use_ability: (p: { type: 'SID_HEAL'; cardIds: string[] }, ack: Ack) => void;
}

export interface ServerToClientEvents {
  lobby_update: (v: LobbyView) => void;
  game_state_update: (v: ClientGameView) => void;
  error_message: (msg: string) => void;
}
