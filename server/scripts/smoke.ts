import assert from 'node:assert/strict';
import { io as createClient, type Socket } from 'socket.io-client';
import type {
  AckResponse,
  ClientGameView,
  ClientToServerEvents,
  LobbyView,
  PublicPlayer,
  ServerToClientEvents,
} from '@bang/shared';
import { createGameServer } from '../src/server.js';

type TypedClient = Socket<ServerToClientEvents, ClientToServerEvents>;

interface ClientHarness {
  id: string;
  nickname: string;
  socket: TypedClient;
  latestLobby: LobbyView | null;
  latestGame: ClientGameView | null;
}

function waitForEvent<T>(
  check: () => T | null,
  timeoutMs = 5000,
  label = 'condition'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const val = check();
      if (val !== null) {
        clearInterval(timer);
        resolve(val);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${label}`));
      }
    }, 20);
  });
}

function emitAck(
  fn: (cb: (res: AckResponse) => void) => void
): Promise<AckResponse> {
  return new Promise((resolve) => {
    fn((res) => resolve(res));
  });
}

function calcDistance(players: PublicPlayer[], fromId: string, toId: string): number {
  if (fromId === toId) return 0;
  const alive = players.filter((p) => p.isAlive).sort((a, b) => a.seatIndex - b.seatIndex);
  const fromIdx = alive.findIndex((p) => p.id === fromId);
  const toIdx = alive.findIndex((p) => p.id === toId);
  const diff = Math.abs(fromIdx - toIdx);
  let dist = Math.min(diff, alive.length - diff);
  const from = alive[fromIdx];
  const to = alive[toIdx];
  if (to.equipped.some((c) => c.type === 'MUSTANG')) dist += 1;
  if (to.character === 'PAUL_REGRET') dist += 1;
  if (from.equipped.some((c) => c.type === 'SCOPE')) dist -= 1;
  if (from.character === 'ROSE_DOOLAN') dist -= 1;
  return Math.max(1, dist);
}

async function run() {
  const server = await createGameServer(0);
  const url = `http://localhost:${server.port}`;
  const clients: ClientHarness[] = [];

  try {
    for (let i = 1; i <= 4; i++) {
      const socket: TypedClient = createClient(url, {
        transports: ['websocket'],
      });
      const harness: ClientHarness = {
        id: `smoke_p${i}`,
        nickname: `Player${i}`,
        socket,
        latestLobby: null,
        latestGame: null,
      };
      socket.on('lobby_update', (v) => {
        harness.latestLobby = v;
      });
      socket.on('game_state_update', (v) => {
        harness.latestGame = v;
      });
      clients.push(harness);
      await waitForEvent(() => (socket.connected ? true : null), 4000, `connect p${i}`);
    }

    const createRes = await emitAck((cb) =>
      clients[0].socket.emit(
        'create_room',
        { nickname: clients[0].nickname, playerId: clients[0].id },
        cb
      )
    );
    assert.equal(createRes.ok, true, 'create_room should succeed');
    const roomId = createRes.roomId!;
    assert.ok(roomId && roomId.length === 4, 'roomId should be 4 chars');

    for (let i = 1; i < 4; i++) {
      const joinRes = await emitAck((cb) =>
        clients[i].socket.emit(
          'join_room',
          { roomId, nickname: clients[i].nickname, playerId: clients[i].id },
          cb
        )
      );
      assert.equal(joinRes.ok, true, `join_room p${i + 1} should succeed`);
    }

    await waitForEvent(
      () => (clients[0].latestLobby?.players.length === 4 ? true : null),
      3000,
      '4 players in lobby'
    );

    const startRes = await emitAck((cb) =>
      clients[0].socket.emit('start_game', cb)
    );
    assert.equal(startRes.ok, true, 'start_game should succeed');

    await waitForEvent(
      () => (clients.every((c) => c.latestGame?.status === 'PLAYING') ? true : null),
      3000,
      'all clients PLAYING'
    );

    for (const c of clients) {
      const view = c.latestGame!;
      assert.ok(view.myInfo.role, 'myInfo.role must be visible');
      assert.ok(view.myInfo.character, 'myInfo.character must be assigned');
      assert.equal(view.myInfo.hand.length, view.myInfo.hp);
      for (const pub of view.players) {
        assert.equal('hand' in pub, false, 'PublicPlayer must never have hand');
        if (pub.role !== null) {
          assert.equal(pub.role, 'SHERIFF', 'Only SHERIFF role may be revealed while alive');
        }
      }
    }

    let bangResolved = false;
    for (let turn = 0; turn < 16 && !bangResolved; turn++) {
      const refView = clients[0].latestGame!;
      const actor = clients.find((c) => c.id === refView.currentTurnPlayerId)!;

      const drawRes = await emitAck((cb) => actor.socket.emit('draw_cards', cb));
      assert.equal(drawRes.ok, true, 'draw_cards should succeed');

      await waitForEvent(
        () =>
          actor.latestGame &&
          (actor.latestGame.turnPhase === 'ACTION' ||
            Boolean(actor.latestGame.myInfo.kitChoices?.length))
            ? true
            : null,
        3000,
        'ACTION or kitChoices'
      );

      if (actor.latestGame?.myInfo.kitChoices?.length) {
        const pickIds = actor.latestGame.myInfo.kitChoices.slice(0, 2).map((c) => c.id);
        const pickRes = await emitAck((cb) =>
          actor.socket.emit('pick_kit_cards', { cardIds: pickIds }, cb)
        );
        assert.equal(pickRes.ok, true, 'pick_kit_cards should succeed');
        await waitForEvent(
          () => (actor.latestGame?.turnPhase === 'ACTION' ? true : null),
          3000,
          'ACTION after kit pick'
        );
      }

      const actorView = actor.latestGame!;
      const bangCard = actorView.myInfo.hand.find((c) => c.type === 'BANG');

      if (bangCard) {
        const targetPub = actorView.players.find(
          (p) =>
            p.isAlive &&
            p.id !== actor.id &&
            calcDistance(actorView.players, actor.id, p.id) <=
              actorView.myInfo.weaponRange
        );

        if (targetPub) {
          const targetClient = clients.find((c) => c.id === targetPub.id)!;
          const hpBefore = targetPub.hp;

          const playRes = await emitAck((cb) =>
            actor.socket.emit(
              'play_card',
              { cardId: bangCard.id, targetPlayerId: targetClient.id },
              cb
            )
          );
          assert.equal(playRes.ok, true, 'play_card BANG should succeed');

          await waitForEvent(
            () =>
              targetClient.latestGame &&
              (targetClient.latestGame.turnPhase === 'WAITING_FOR_RESPONSE' ||
                targetClient.latestGame.lastCheck !== null)
                ? true
                : null,
            3000,
            'WAITING_FOR_RESPONSE or barrel check'
          );

          if (
            targetClient.latestGame?.turnPhase === 'WAITING_FOR_RESPONSE' &&
            targetClient.latestGame?.pendingAction?.targetPlayerId === targetClient.id
          ) {
            const respRes = await emitAck((cb) =>
              targetClient.socket.emit('respond', { cardId: null }, cb)
            );
            assert.equal(respRes.ok, true, 'respond(null) should succeed');

            await waitForEvent(
              () => {
                const updatedTarget = targetClient.latestGame?.players.find(
                  (p) => p.id === targetClient.id
                );
                return updatedTarget && updatedTarget.hp === hpBefore - 1 ? true : null;
              },
              3000,
              'HP reduction after BANG hit'
            );

            bangResolved = true;
            break;
          }
        }
      }

      const endRes = await emitAck((cb) => actor.socket.emit('end_turn', cb));
      assert.equal(endRes.ok, true, 'end_turn should succeed');

      await waitForEvent(
        () =>
          actor.latestGame &&
          (actor.latestGame.turnPhase === 'DISCARD' ||
            actor.latestGame.currentTurnPlayerId !== actor.id)
            ? true
            : null,
        3000,
        'DISCARD or next turn'
      );

      if (actor.latestGame?.turnPhase === 'DISCARD') {
        const excess =
          actor.latestGame.myInfo.hand.length - actor.latestGame.myInfo.hp;
        const cardIds = actor.latestGame.myInfo.hand
          .slice(0, excess)
          .map((c) => c.id);
        const discRes = await emitAck((cb) =>
          actor.socket.emit('discard_cards', { cardIds }, cb)
        );
        assert.equal(discRes.ok, true, 'discard_cards should succeed');
        await waitForEvent(
          () =>
            actor.latestGame?.currentTurnPlayerId !== actor.id ? true : null,
          3000,
          'next turn after discard'
        );
      }
    }

    assert.equal(bangResolved, true, 'Should resolve a BANG hit within 16 turns');
    console.log('SMOKE OK');
  } finally {
    for (const c of clients) {
      c.socket.disconnect();
    }
    await server.close();
  }
}

run().catch((err) => {
  console.error('SMOKE FAILED:', err);
  process.exit(1);
});
