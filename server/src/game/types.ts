import type { Card, CharacterId, CheckResult, GameEffect, PendingAction, Role } from '@bang/shared';

export interface ServerPlayer {
  id: string;
  nickname: string;
  seatIndex: number;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  role: Role;
  character: CharacterId;
  avatar: string | null;
  hand: Card[];
  equipped: Card[];
  connected: boolean;
}

export interface ServerGameState {
  roomId: string;
  status: 'LOBBY' | 'PLAYING' | 'FINISHED';
  hostId: string;
  turnPhase: 'DRAW' | 'ACTION' | 'DISCARD' | 'WAITING_FOR_RESPONSE';
  currentTurnPlayerId: string;
  bangPlayedThisTurn: boolean;
  players: ServerPlayer[];
  deck: Card[];
  discard: Card[];
  pendingAction: PendingAction | null;
  kitChoices: Card[] | null;
  lastCheck: CheckResult | null;
  checkSeq: number;
  effects: GameEffect[];
  effectSeq: number;
  logs: string[];
  winner?: 'SHERIFF_TEAM' | 'OUTLAW_TEAM' | 'RENEGADE';
}
