import { useRef, useState, type ChangeEvent } from 'react';
import type { LobbyView } from '@bang/shared';
import { resizeProfileImage } from '../utils/image';
import { Avatar } from './Avatar';

interface LobbyProps {
  lobby: LobbyView;
  myPlayerId: string;
  onUpdateAvatar: (avatar: string | null) => void;
  onError: (msg: string) => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
}

export function Lobby({
  lobby,
  myPlayerId,
  onUpdateAvatar,
  onError,
  onStartGame,
  onLeaveRoom,
}: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isHost = lobby.hostId === myPlayerId;
  const canStart =
    lobby.players.length >= lobby.minPlayers &&
    lobby.players.length <= lobby.maxPlayers;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(lobby.roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const dataUrl = await resizeProfileImage(file);
      onUpdateAvatar(dataUrl);
    } catch (err) {
      onError(err instanceof Error ? err.message : '이미지를 처리할 수 없습니다.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-stone-950 via-stone-900 to-amber-950/30">
      <div className="w-full max-w-lg rounded-2xl border border-amber-700/40 bg-stone-900/90 p-6 sm:p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              대기실
            </p>
            <div className="mt-1 flex items-center gap-3">
              <span className="font-mono text-4xl font-black tracking-widest text-amber-400">
                {lobby.roomId}
              </span>
              <button
                type="button"
                onClick={copyCode}
                className="rounded-lg border border-stone-700 bg-stone-800 px-2.5 py-1 text-xs text-stone-300 hover:bg-stone-700 cursor-pointer"
              >
                {copied ? '복사됨!' : '코드 복사'}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onLeaveRoom}
            className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-300 hover:bg-stone-800 cursor-pointer"
          >
            나가기
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-stone-400 mb-2">
            <span>참가자 목록</span>
            <span>
              {lobby.players.length} / {lobby.maxPlayers}명 (최소 {lobby.minPlayers}명)
            </span>
          </div>
          <ul className="space-y-2">
            {lobby.players.map((p, idx) => {
              const isMe = p.id === myPlayerId;
              return (
                <li
                  key={p.id}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 sm:px-4 py-2.5 ${
                    isMe
                      ? 'border-amber-500/50 bg-amber-950/20'
                      : 'border-stone-800 bg-stone-950/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-mono text-stone-500">
                      #{idx + 1}
                    </span>
                    <Avatar nickname={p.nickname} avatar={p.avatar} size="sm" />
                    <span className="truncate font-semibold text-stone-100">
                      {p.nickname}
                    </span>
                    {isMe && (
                      <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-medium text-amber-300">
                        나
                      </span>
                    )}
                    {p.id === lobby.hostId && (
                      <span className="shrink-0 rounded bg-stone-700/70 px-1.5 py-0.5 text-[11px] font-medium text-amber-200">
                        방장
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isMe && (
                      <>
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded border border-stone-700 bg-stone-800 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-stone-700 cursor-pointer"
                        >
                          {uploading ? '...' : '사진 변경'}
                        </button>
                        {p.avatar && (
                          <button
                            type="button"
                            onClick={() => onUpdateAvatar(null)}
                            className="rounded border border-stone-700 px-1.5 py-0.5 text-[11px] text-stone-400 hover:text-stone-200 cursor-pointer"
                          >
                            삭제
                          </button>
                        )}
                      </>
                    )}
                    <span
                      className={`text-xs ${
                        p.connected ? 'text-emerald-400' : 'text-stone-500'
                      }`}
                    >
                      {p.connected ? '접속 중' : '오프라인'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {isHost ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled={!canStart}
              onClick={onStartGame}
              className="w-full min-h-[44px] rounded-xl bg-amber-600 px-4 py-3 font-bold text-stone-950 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              게임 시작
            </button>
            {!canStart && (
              <p className="text-center text-xs text-stone-400">
                4명 이상 모여야 게임을 시작할 수 있습니다.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-stone-800 bg-stone-950/60 py-3 text-center text-sm text-stone-400">
            방장이 게임을 시작하기를 기다리는 중...
          </div>
        )}
      </div>
    </div>
  );
}
