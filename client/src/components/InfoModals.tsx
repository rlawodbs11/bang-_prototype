import { useState } from 'react';
import type { CharacterId, PublicPlayer } from '@bang/shared';
import { CARD_META, CHARACTER_META, EQUIP_ICON, ROLE_META } from '../utils/gameHelpers';
import { Avatar } from './Avatar';

interface CharacterDetailModalProps {
  player: PublicPlayer;
  isMe: boolean;
  onClose: () => void;
}

export function CharacterDetailModal({
  player,
  isMe,
  onClose,
}: CharacterDetailModalProps) {
  const charMeta = player.character ? CHARACTER_META[player.character] : null;
  const visibleRole = player.role ? ROLE_META[player.role] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-amber-500/50 bg-stone-900 p-5 shadow-2xl animate-bang-card-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <Avatar nickname={player.nickname} avatar={player.avatar} size="md" />
            <div>
              <p className="text-xs font-semibold text-stone-400">
                {player.nickname} {isMe ? '(나)' : ''}
              </p>
              <h3 className="text-xl font-black text-amber-300 mt-0.5">
                ★ {charMeta ? charMeta.name : '캐릭터 미배정'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-700 px-2.5 py-1 text-xs text-stone-300 hover:bg-stone-800 cursor-pointer"
          >
            닫기
          </button>
        </div>

        {charMeta && (
          <div className="rounded-xl border border-amber-700/40 bg-amber-950/25 p-3.5 mb-4">
            <div className="flex items-center justify-between text-xs text-amber-200/80 mb-1.5">
              <span className="font-bold">특수 능력</span>
              <span>기본 최대 체력 ♥ {charMeta.hp}</span>
            </div>
            <p className="text-sm leading-relaxed text-stone-100">
              {charMeta.desc}
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center mb-4">
          <div className="rounded-xl border border-stone-800 bg-stone-950/70 p-2">
            <div className="text-[11px] text-stone-400">현재 체력</div>
            <div className="text-sm font-bold text-rose-400 mt-0.5">
              ♥ {player.hp}/{player.maxHp}
            </div>
          </div>
          <div className="rounded-xl border border-stone-800 bg-stone-950/70 p-2">
            <div className="text-[11px] text-stone-400">무기 사거리</div>
            <div className="text-sm font-bold text-cyan-300 mt-0.5">
              {player.weaponRange}
            </div>
          </div>
          <div className="rounded-xl border border-stone-800 bg-stone-950/70 p-2">
            <div className="text-[11px] text-stone-400">직업</div>
            <div className="text-sm font-bold text-amber-200 mt-0.5">
              {visibleRole ? visibleRole.name : '비공개'}
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-stone-400 mb-2">
            장착 중인 카드 ({player.equipped.length}장)
          </p>
          {player.equipped.length === 0 ? (
            <p className="text-xs text-stone-500 rounded-lg border border-stone-800 bg-stone-950/50 p-3">
              장착한 카드가 없습니다.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
              {player.equipped.map((eq) => {
                const meta = CARD_META[eq.type];
                return (
                  <div
                    key={eq.id}
                    className="rounded-lg border border-stone-800 bg-stone-950/70 px-3 py-2 text-xs"
                  >
                    <div className="font-bold text-blue-200">
                      {EQUIP_ICON[eq.type] ?? ''} {meta.name}
                    </div>
                    <div className="text-stone-400 mt-0.5">{meta.desc}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface GuideModalProps {
  activeCharacters: CharacterId[];
  onClose: () => void;
}

const DECK_GUIDE_CARDS: Array<{
  type: keyof typeof CARD_META;
  count: number;
}> = [
  { type: 'BANG', count: 25 },
  { type: 'MISSED', count: 12 },
  { type: 'BEER', count: 6 },
  { type: 'STAGECOACH', count: 2 },
  { type: 'WEAPON_VOLCANIC', count: 2 },
  { type: 'WEAPON_SCHOFIELD', count: 3 },
  { type: 'WEAPON_REMINGTON', count: 1 },
  { type: 'WEAPON_CARABINE', count: 1 },
  { type: 'WEAPON_WINCHESTER', count: 1 },
  { type: 'BARREL', count: 2 },
  { type: 'MUSTANG', count: 2 },
  { type: 'SCOPE', count: 1 },
  { type: 'JAIL', count: 3 },
  { type: 'DYNAMITE', count: 1 },
];

export function GuideModal({ activeCharacters, onClose }: GuideModalProps) {
  const [tab, setTab] = useState<'CHAR' | 'CARD' | 'RULE'>('CHAR');
  const allChars = Object.keys(CHARACTER_META) as CharacterId[];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-amber-500/40 bg-stone-900 shadow-2xl animate-bang-card-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-800 px-5 py-3.5">
          <h3 className="text-lg font-black text-amber-300">BANG! 게임 도감</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-700 px-2.5 py-1 text-xs text-stone-300 hover:bg-stone-800 cursor-pointer"
          >
            닫기
          </button>
        </div>

        <div className="flex gap-1.5 border-b border-stone-800 px-5 py-2.5">
          {(
            [
              ['CHAR', '캐릭터 16종'],
              ['CARD', '카드 안내 (62장)'],
              ['RULE', '직업 & 규칙'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                tab === key
                  ? 'bg-amber-600 text-stone-950'
                  : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
          {tab === 'CHAR' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {allChars.map((cid) => {
                const meta = CHARACTER_META[cid];
                const inGame = activeCharacters.includes(cid);
                return (
                  <div
                    key={cid}
                    className={`rounded-xl border p-3 ${
                      inGame
                        ? 'border-amber-500/60 bg-amber-950/25'
                        : 'border-stone-800 bg-stone-950/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-bold text-sm text-amber-200">
                        ★ {meta.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {inGame && (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                            참여 중
                          </span>
                        )}
                        <span className="text-xs text-rose-400 font-semibold">
                          ♥ {meta.hp}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-stone-300 leading-relaxed">
                      {meta.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'CARD' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {DECK_GUIDE_CARDS.map(({ type, count }) => {
                const meta = CARD_META[type];
                return (
                  <div
                    key={type}
                    className="rounded-xl border border-stone-800 bg-stone-950/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-bold ${meta.badgeColor}`}
                      >
                        {EQUIP_ICON[type] ? `${EQUIP_ICON[type]} ` : ''}
                        {meta.name}
                      </span>
                      <span className="text-xs text-stone-400">{count}장</span>
                    </div>
                    <p className="text-xs text-stone-300 leading-relaxed">
                      {meta.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'RULE' && (
            <div className="space-y-4 text-xs text-stone-300 leading-relaxed">
              <div>
                <h4 className="font-bold text-sm text-amber-300 mb-2">
                  직업별 승리 조건
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(Object.keys(ROLE_META) as Array<keyof typeof ROLE_META>).map(
                    (role) => {
                      const r = ROLE_META[role];
                      return (
                        <div
                          key={role}
                          className="rounded-xl border border-stone-800 bg-stone-950/60 p-3"
                        >
                          <span
                            className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-bold mb-1 ${r.badgeClass}`}
                          >
                            {r.name}
                          </span>
                          <p>{r.goal}</p>
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-stone-800 bg-stone-950/60 p-3.5 space-y-1.5">
                <h4 className="font-bold text-sm text-amber-300 mb-1">
                  핵심 규칙 요약
                </h4>
                <p>
                  • <strong>턴 순서</strong>: 다이너마이트/감옥 판정 → 카드 뽑기(2장) → 행동 단계(BANG!은 턴당 1회) → 체력 초과분 버리기.
                </p>
                <p>
                  • <strong>거리 & 사거리</strong>: 살아 있는 플레이어 기준 양옆 원형 최단 거리 + 야생마(+1) / 조준경(-1). 거리가 무기 사거리 이하일 때만 BANG! 공격 가능.
                </p>
                <p>
                  • <strong>BANG! 대응</strong>: 피격자는 20초 이내에 빗나감!을 내거나 피해를 입어야 합니다.
                </p>
                <p>
                  • <strong>사망 보상/페널티</strong>: 무법자 처치 시 카드 3장 보너스, 보안관이 부관을 처치하면 손패와 장비를 모두 잃습니다.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
