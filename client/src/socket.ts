import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@bang/shared';

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);

const KEY_PLAYER_ID = 'bang_player_id';
const KEY_ROOM_ID = 'bang_room_id';
const KEY_NICKNAME = 'bang_nickname';
const KEY_AVATAR = 'bang_avatar';

export type TypedClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: TypedClientSocket = io(SERVER_URL, {
  autoConnect: true,
});

export function getPlayerId(): string {
  let id = sessionStorage.getItem(KEY_PLAYER_ID);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `p_${Math.random().toString(36).slice(2, 11)}_${Date.now()}`;
    sessionStorage.setItem(KEY_PLAYER_ID, id);
  }
  return id;
}

export function getSavedSession(): { roomId: string | null; nickname: string } {
  return {
    roomId: sessionStorage.getItem(KEY_ROOM_ID),
    nickname: sessionStorage.getItem(KEY_NICKNAME) ?? '',
  };
}

export function saveSession(roomId: string, nickname: string): void {
  sessionStorage.setItem(KEY_ROOM_ID, roomId);
  sessionStorage.setItem(KEY_NICKNAME, nickname);
}

export function clearSessionRoom(): void {
  sessionStorage.removeItem(KEY_ROOM_ID);
}

export function getSavedAvatar(): string | null {
  return sessionStorage.getItem(KEY_AVATAR);
}

export function saveAvatar(avatar: string | null): void {
  if (avatar) {
    sessionStorage.setItem(KEY_AVATAR, avatar);
  } else {
    sessionStorage.removeItem(KEY_AVATAR);
  }
}
