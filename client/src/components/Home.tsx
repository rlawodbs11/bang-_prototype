import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { resizeProfileImage } from '../utils/image';
import { Avatar } from './Avatar';

interface HomeProps {
  connected: boolean;
  defaultNickname: string;
  avatar: string | null;
  onAvatarChange: (avatar: string | null) => void;
  onError: (msg: string) => void;
  onCreateRoom: (nickname: string) => void;
  onJoinRoom: (roomId: string, nickname: string) => void;
}

export function Home({
  connected,
  defaultNickname,
  avatar,
  onAvatarChange,
  onError,
  onCreateRoom,
  onJoinRoom,
}: HomeProps) {
  const [nickname, setNickname] = useState(defaultNickname);
  const [roomCode, setRoomCode] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const dataUrl = await resizeProfileImage(file);
      onAvatarChange(dataUrl);
    } catch (err) {
      onError(err instanceof Error ? err.message : '이미지를 처리할 수 없습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = () => {
    onCreateRoom(nickname);
  };

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    onJoinRoom(roomCode.trim().toUpperCase(), nickname);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-stone-950 via-stone-900 to-amber-950/30">
      <div className="w-full max-w-md rounded-2xl border border-amber-700/40 bg-stone-900/90 p-7 shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 mb-3">
            <span
              className={`h-2 w-2 rounded-full ${
                connected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
              }`}
            />
            {connected ? '서버 연결됨' : '서버 연결 중...'}
          </div>
          <h1 className="text-4xl font-black tracking-wider text-amber-400">
            BANG!
          </h1>
          <p className="mt-1 text-sm text-stone-400">
            서부 개척시대 온라인 카드 게임
          </p>
        </div>

        <div className="space-y-5">
          {/* Profile Avatar Upload */}
          <div className="flex items-center gap-4 rounded-xl border border-stone-800 bg-stone-950/60 p-3">
            <Avatar nickname={nickname || '?'} avatar={avatar} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-stone-300 mb-1.5">
                프로필 사진 (선택)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-amber-600/50 bg-amber-950/40 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-900/50 disabled:opacity-50 cursor-pointer"
                >
                  {uploading ? '처리 중...' : '사진 선택'}
                </button>
                {avatar && (
                  <button
                    type="button"
                    onClick={() => onAvatarChange(null)}
                    className="rounded-lg border border-stone-700 px-2.5 py-1.5 text-xs text-stone-300 hover:bg-stone-800 cursor-pointer"
                  >
                    삭제
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="nickname"
              className="block text-xs font-semibold uppercase tracking-wide text-stone-400 mb-1.5"
            >
              닉네임
            </label>
            <input
              id="nickname"
              type="text"
              maxLength={16}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="총잡이 이름을 입력하세요"
              className="w-full rounded-xl border border-stone-700 bg-stone-950 px-4 py-2.5 text-stone-100 placeholder-stone-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            disabled={!connected || !nickname.trim()}
            onClick={handleCreate}
            className="w-full min-h-[44px] rounded-xl bg-amber-600 px-4 py-3 font-bold text-stone-950 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            새 방 만들기
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-stone-800" />
            <span className="mx-3 flex-shrink text-xs text-stone-500">
              또는 방 코드로 참가
            </span>
            <div className="flex-grow border-t border-stone-800" />
          </div>

          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              type="text"
              maxLength={6}
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="방 코드 (예: AB23)"
              className="flex-1 rounded-xl border border-stone-700 bg-stone-950 px-4 py-2.5 font-mono uppercase tracking-widest text-stone-100 placeholder-stone-500 focus:border-amber-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!connected || !nickname.trim() || !roomCode.trim()}
              className="min-h-[44px] rounded-xl border border-amber-600/60 bg-amber-950/50 px-5 py-2.5 font-bold text-amber-300 transition hover:bg-amber-900/60 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              참가
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
