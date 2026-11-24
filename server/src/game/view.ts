import type { ClientGameView, PublicPlayer } from '@bang/shared';
import { weaponRange } from './rules.js';
import type { ServerGameState } from './types.js';

export function toClientView(state: ServerGameState, viewerId: string): ClientGameView {
  const viewer = state.players.find((p) => p.id === viewerId);
  if (!viewer) {
    throw new Error(`Viewer not found in room: ${viewerId}`);
  }

  const sortedPlayers = [...state.players].sort((a, b) => a.seatIndex - b.seatIndex);

  const publicPlayers: PublicPlayer[] = sortedPlayers.map((p) => {
    const showRole =
      state.status === 'FINISHED' || p.role === 'SHERIFF' || !p.isAlive;

    return {
      id: p.id,
      nickname: p.nickname,
      seatIndex: p.seatIndex,
      hp: p.hp,
      maxHp: p.maxHp,
      isAlive: p.isAlive,
      role: showRole ? p.role : null,
      handCount: p.hand.length,
      equipped: p.equipped.map((c) => ({ ...c })),
      weaponRange: weaponRange(p),
      character: p.character,
      avatar: p.avatar,
    };
  });

  const myPublic = publicPlayers.find((p) => p.id === viewer.id)!;

  return {
    roomId: state.roomId,
    status: state.status,
    turnPhase: state.turnPhase,
    currentTurnPlayerId: state.currentTurnPlayerId,
    bangPlayedThisTurn: state.bangPlayedThisTurn,
    myInfo: {
      ...myPublic,
      role: viewer.role,
      hand: viewer.hand.map((c) => ({ ...c })),
      kitChoices:
        state.currentTurnPlayerId === viewer.id && state.kitChoices
          ? state.kitChoices.map((c) => ({ ...c }))
          : null,
    },
    players: publicPlayers,
    discardTop:
      state.discard.length > 0
        ? { ...state.discard[state.discard.length - 1] }
        : null,
    deckCount: state.deck.length,
    pendingAction: state.pendingAction
      ? {
          ...state.pendingAction,
          remainingQueue: state.pendingAction.remainingQueue
            ? [...state.pendingAction.remainingQueue]
            : undefined,
        }
      : null,
    lastCheck: state.lastCheck
      ? {
          ...state.lastCheck,
          card: state.lastCheck.card ? { ...state.lastCheck.card } : null,
        }
      : null,
    effects: state.effects.map((e) => ({ ...e })),
    logs: [...state.logs],
    winner: state.winner,
  };
}
