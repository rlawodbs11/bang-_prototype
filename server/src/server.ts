import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import type {
  Ack,
  AckResponse,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@bang/shared';
import { GameError, type GameRoom } from './game/GameRoom.js';
import { toClientView } from './game/view.js';
import { RoomManager } from './rooms.js';

const CLIENT_DIST =
  process.env.CLIENT_DIST ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

interface SocketData {
  roomId?: string;
  playerId?: string;
}

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

function sendAck(ack: unknown, res: AckResponse): void {
  if (typeof ack === 'function') {
    (ack as Ack)(res);
  }
}

export interface GameServerHandle {
  io: TypedServer;
  httpServer: http.Server;
  port: number;
  close: () => Promise<void>;
}

export async function createGameServer(
  port = 3001,
  options?: { responseTimeoutMs?: number }
): Promise<GameServerHandle> {
  const httpServer = http.createServer((req, res) => {
    const rawUrl = req.url ?? '/';
    if (rawUrl.startsWith('/socket.io')) return;

    let pathname = '/';
    try {
      pathname = decodeURIComponent(new URL(rawUrl, 'http://localhost').pathname);
    } catch {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'bang-server' }));
      return;
    }

    const indexFile = path.join(CLIENT_DIST, 'index.html');
    if (
      fs.existsSync(indexFile) &&
      (req.method === 'GET' || req.method === 'HEAD')
    ) {
      const resolved = path.resolve(CLIENT_DIST, '.' + pathname);
      if (
        resolved !== CLIENT_DIST &&
        !resolved.startsWith(CLIENT_DIST + path.sep)
      ) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      let targetFile = resolved;
      let isFile = false;
      try {
        isFile = fs.statSync(targetFile).isFile();
      } catch {
        isFile = false;
      }

      if (!isFile) {
        targetFile = indexFile;
      }

      const ext = path.extname(targetFile).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      const cacheControl =
        targetFile === indexFile
          ? 'no-cache'
          : pathname.startsWith('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      fs.createReadStream(targetFile).pipe(res);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'bang-server' }));
  });

  const io: TypedServer = new Server(httpServer, {
    cors: { origin: '*' },
  });

  const roomManager = new RoomManager();

  const broadcast = async (room: GameRoom): Promise<void> => {
    const { roomId, status } = room.state;
    if (status === 'LOBBY') {
      io.to(roomId).emit('lobby_update', room.toLobbyView());
      return;
    }

    const sockets = await io.in(roomId).fetchSockets();
    for (const s of sockets) {
      const pid = s.data.playerId;
      if (!pid) continue;
      if (!room.state.players.some((p) => p.id === pid)) continue;
      s.emit('game_state_update', toClientView(room.state, pid));
    }
  };

  const leaveCurrentRoom = async (socket: TypedSocket): Promise<void> => {
    const prevRoomId = socket.data.roomId;
    const prevPlayerId = socket.data.playerId;
    if (!prevRoomId) return;

    await socket.leave(prevRoomId);
    socket.data.roomId = undefined;

    const room = roomManager.getRoom(prevRoomId);
    if (!room) return;

    if (prevPlayerId) {
      const remainingSockets = await io.in(prevRoomId).fetchSockets();
      const stillConnected = remainingSockets.some(
        (s) => s.id !== socket.id && s.data.playerId === prevPlayerId
      );
      if (!stillConnected) {
        room.removePlayer(prevPlayerId);
      }
    }

    if (room.connectedCount() === 0) {
      roomManager.deleteRoom(prevRoomId);
    } else {
      await broadcast(room);
    }
  };

  const withPlayerRoom = async (
    socket: TypedSocket,
    ack: unknown,
    fn: (room: GameRoom, playerId: string) => void
  ): Promise<void> => {
    try {
      const { roomId, playerId } = socket.data;
      if (!roomId || !playerId) {
        throw new GameError('방에 참가한 상태가 아닙니다.');
      }
      const room = roomManager.getRoom(roomId);
      if (!room) {
        throw new GameError('방을 찾을 수 없습니다.');
      }
      fn(room, playerId);
      sendAck(ack, { ok: true });
      await broadcast(room);
    } catch (err) {
      const msg =
        err instanceof GameError ? err.message : '요청 처리 중 오류가 발생했습니다.';
      sendAck(ack, { ok: false, error: msg });
      if (typeof ack !== 'function') {
        socket.emit('error_message', msg);
      }
    }
  };

  io.on('connection', (socket) => {
    socket.on('create_room', async (payload, ack) => {
      try {
        if (!payload || !payload.playerId) {
          throw new GameError('플레이어 식별자가 필요합니다.');
        }
        await leaveCurrentRoom(socket);

        const room = roomManager.createRoom(
          (changedRoom) => {
            void broadcast(changedRoom);
          },
          options?.responseTimeoutMs
        );

        room.addPlayer(payload.playerId, payload.nickname ?? '', payload.avatar);
        socket.data.roomId = room.state.roomId;
        socket.data.playerId = payload.playerId;
        await socket.join(room.state.roomId);

        sendAck(ack, { ok: true, roomId: room.state.roomId });
        await broadcast(room);
      } catch (err) {
        const msg =
          err instanceof GameError ? err.message : '방 생성에 실패했습니다.';
        sendAck(ack, { ok: false, error: msg });
      }
    });

    socket.on('join_room', async (payload, ack) => {
      try {
        if (!payload || !payload.playerId || !payload.roomId) {
          throw new GameError('방 코드와 플레이어 정보가 필요합니다.');
        }
        const room = roomManager.getRoom(payload.roomId);
        if (!room) {
          throw new GameError('존재하지 않는 방 코드입니다.');
        }

        if (socket.data.roomId && socket.data.roomId !== room.state.roomId) {
          await leaveCurrentRoom(socket);
        }

        room.addPlayer(payload.playerId, payload.nickname ?? '', payload.avatar);
        socket.data.roomId = room.state.roomId;
        socket.data.playerId = payload.playerId;
        await socket.join(room.state.roomId);

        sendAck(ack, { ok: true, roomId: room.state.roomId });
        await broadcast(room);
      } catch (err) {
        const msg =
          err instanceof GameError ? err.message : '방 참가에 실패했습니다.';
        sendAck(ack, { ok: false, error: msg });
      }
    });

    socket.on('leave_room', () => {
      void leaveCurrentRoom(socket);
    });

    socket.on('update_profile', (payload, ack) => {
      void withPlayerRoom(socket, ack, (room, playerId) => {
        room.updateAvatar(playerId, payload?.avatar ?? null);
      });
    });

    socket.on('start_game', (ack) => {
      void withPlayerRoom(socket, ack, (room, playerId) => {
        room.start(playerId);
      });
    });

    socket.on('draw_cards', (ack) => {
      void withPlayerRoom(socket, ack, (room, playerId) => {
        room.draw(playerId);
      });
    });

    socket.on('play_card', (payload, ack) => {
      void withPlayerRoom(socket, ack, (room, playerId) => {
        if (!payload || !payload.cardId) {
          throw new GameError('사용할 카드를 선택해주세요.');
        }
        room.playCard(playerId, payload.cardId, payload.targetPlayerId);
      });
    });

    socket.on('respond', (payload, ack) => {
      void withPlayerRoom(socket, ack, (room, playerId) => {
        room.respond(playerId, payload?.cardId ?? null);
      });
    });

    socket.on('end_turn', (ack) => {
      void withPlayerRoom(socket, ack, (room, playerId) => {
        room.endTurn(playerId);
      });
    });

    socket.on('discard_cards', (payload, ack) => {
      void withPlayerRoom(socket, ack, (room, playerId) => {
        room.discardCards(playerId, payload?.cardIds ?? []);
      });
    });

    socket.on('special_draw', (payload, ack) => {
      void withPlayerRoom(socket, ack, (room, playerId) => {
        if (!payload || (payload.mode !== 'DISCARD' && payload.mode !== 'PLAYER')) {
          throw new GameError('유효하지 않은 드로우 방식입니다.');
        }
        room.specialDraw(playerId, payload.mode, payload.targetPlayerId);
      });
    });

    socket.on('pick_kit_cards', (payload, ack) => {
      void withPlayerRoom(socket, ack, (room, playerId) => {
        room.pickKitCards(playerId, payload?.cardIds ?? []);
      });
    });

    socket.on('use_ability', (payload, ack) => {
      void withPlayerRoom(socket, ack, (room, playerId) => {
        if (!payload || payload.type !== 'SID_HEAL') {
          throw new GameError('유효하지 않은 능력 요청입니다.');
        }
        room.useAbility(playerId, payload.type, payload.cardIds ?? []);
      });
    });

    socket.on('disconnect', () => {
      void leaveCurrentRoom(socket);
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  const addr = httpServer.address() as AddressInfo;

  return {
    io,
    httpServer,
    port: addr.port,
    close: async () => {
      roomManager.clearAll();
      await io.close();
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((err) => (err ? reject(err) : resolve()));
        });
      }
    },
  };
}
