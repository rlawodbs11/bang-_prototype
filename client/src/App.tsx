import { useCallback, useEffect, useRef, useState } from 'react';
import type { AckResponse, ClientGameView, LobbyView } from '@bang/shared';
import {
  clearSessionRoom,
  getPlayerId,
  getSavedAvatar,
  getSavedSession,
  saveAvatar,
  saveSession,
  socket,
} from './socket';
import { Home } from './components/Home';
import { Lobby } from './components/Lobby';
import { Game } from './components/Game';

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [lobby, setLobby] = useState<LobbyView | null>(null);
  const [gameView, setGameView] = useState<ClientGameView | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(() => getSavedAvatar());
  const avatarRef = useRef<string | null>(avatar);
  avatarRef.current = avatar;

  const playerId = useRef(getPlayerId()).current;
  const initialSession = useRef(getSavedSession()).current;

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
  }, []);

  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 4000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  useEffect(() => {
    const attemptReconnect = () => {
      const saved = getSavedSession();
      if (saved.roomId && saved.nickname) {
        socket.emit(
          'join_room',
          {
            roomId: saved.roomId,
            nickname: saved.nickname,
            playerId,
            avatar: avatarRef.current,
          },
          (res: AckResponse) => {
            if (!res.ok) {
              clearSessionRoom();
              setLobby(null);
              setGameView(null);
            }
          }
        );
      }
    };

    const onConnect = () => {
      setConnected(true);
      attemptReconnect();
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onLobbyUpdate = (view: LobbyView) => {
      setLobby(view);
      setGameView(null);
    };

    const onGameUpdate = (view: ClientGameView) => {
      setGameView(view);
      setLobby(null);
    };

    const onErrorMessage = (msg: string) => {
      showError(msg);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('lobby_update', onLobbyUpdate);
    socket.on('game_state_update', onGameUpdate);
    socket.on('error_message', onErrorMessage);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('lobby_update', onLobbyUpdate);
      socket.off('game_state_update', onGameUpdate);
      socket.off('error_message', onErrorMessage);
    };
  }, [playerId, showError]);

  const handleAck = (res: AckResponse) => {
    if (!res.ok) {
      showError(res.error);
    }
  };

  const handleLocalAvatarChange = (nextAvatar: string | null) => {
    setAvatar(nextAvatar);
    saveAvatar(nextAvatar);
  };

  const handleUpdateLobbyAvatar = (nextAvatar: string | null) => {
    handleLocalAvatarChange(nextAvatar);
    socket.emit('update_profile', { avatar: nextAvatar }, handleAck);
  };

  const handleCreateRoom = (nickname: string) => {
    socket.emit('create_room', { nickname, playerId, avatar }, (res) => {
      if (!res.ok) {
        showError(res.error);
        return;
      }
      if (res.roomId) {
        saveSession(res.roomId, nickname.trim());
      }
    });
  };

  const handleJoinRoom = (roomId: string, nickname: string) => {
    socket.emit('join_room', { roomId, nickname, playerId, avatar }, (res) => {
      if (!res.ok) {
        showError(res.error);
        return;
      }
      saveSession(res.roomId ?? roomId, nickname.trim());
    });
  };

  const handleLeaveRoom = () => {
    socket.emit('leave_room');
    clearSessionRoom();
    setLobby(null);
    setGameView(null);
  };

  return (
    <>
      {errorMsg && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-rose-500/60 bg-rose-950/95 px-4 py-2.5 text-sm font-medium text-rose-100 shadow-xl">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-300 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {gameView ? (
        <Game
          view={gameView}
          onDraw={() => socket.emit('draw_cards', handleAck)}
          onPlayCard={(cardId, targetPlayerId) =>
            socket.emit('play_card', { cardId, targetPlayerId }, handleAck)
          }
          onRespond={(cardId) => socket.emit('respond', { cardId }, handleAck)}
          onEndTurn={() => socket.emit('end_turn', handleAck)}
          onDiscardCards={(cardIds) =>
            socket.emit('discard_cards', { cardIds }, handleAck)
          }
          onSpecialDraw={(mode, targetPlayerId) =>
            socket.emit('special_draw', { mode, targetPlayerId }, handleAck)
          }
          onPickKitCards={(cardIds) =>
            socket.emit('pick_kit_cards', { cardIds }, handleAck)
          }
          onUseAbility={(type, cardIds) =>
            socket.emit('use_ability', { type, cardIds }, handleAck)
          }
          onLeaveRoom={handleLeaveRoom}
        />
      ) : lobby ? (
        <Lobby
          lobby={lobby}
          myPlayerId={playerId}
          onUpdateAvatar={handleUpdateLobbyAvatar}
          onError={showError}
          onStartGame={() => socket.emit('start_game', handleAck)}
          onLeaveRoom={handleLeaveRoom}
        />
      ) : (
        <Home
          connected={connected}
          defaultNickname={initialSession.nickname}
          avatar={avatar}
          onAvatarChange={handleLocalAvatarChange}
          onError={showError}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />
      )}
    </>
  );
}
