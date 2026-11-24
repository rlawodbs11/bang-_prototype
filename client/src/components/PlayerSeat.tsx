import type { CardType, GameEffectType, PublicPlayer, Role } from '@bang/shared';
import { CARD_META, CHARACTER_META, EQUIP_ICON, ROLE_META } from '../utils/gameHelpers';
import { Avatar } from './Avatar';

export interface SeatEffectItem {
  id: number;
  type: GameEffectType;
  amount?: number;
  label?: string;
}

interface PlayerSeatProps {
  player: PublicPlayer;
  isMe: boolean;
  myRole: Role;
  isCurrentTurn: boolean;
  isPendingTarget: boolean;
  distanceFromMe: number;
  targetingActive: boolean;
  isTargetable: boolean;
  compact?: boolean;
  activeEffects?: SeatEffectItem[];
  onSelectTarget?: (playerId: string) => void;
  onInspectPlayer?: (player: PublicPlayer) => void;
}

function equipBadgeStyle(type: CardType): string {
  if (type === 'JAIL') {
    return 'border-rose-500/60 bg-stone-800 text-rose-300';
  }
  if (type === 'DYNAMITE') {
    return 'border-orange-500/60 bg-orange-950/70 text-orange-200';
  }
  return 'border-blue-500/50 bg-blue-950/60 text-blue-200';
}

function renderFloatingEffect(ef: SeatEffectItem) {
  switch (ef.type) {
    case 'HIT':
      return {
        text: `-${ef.amount ?? 1} HP`,
        cls: 'border-rose-400 bg-rose-700 text-white',
      };
    case 'DYNAMITE_BOOM':
      return {
        text: `💥 -${ef.amount ?? 3} HP`,
        cls: 'border-orange-400 bg-orange-700 text-white',
      };
    case 'HEAL':
      return {
        text: `+${ef.amount ?? 1} HP 💚`,
        cls: 'border-emerald-400 bg-emerald-700 text-white',
      };
    case 'MISSED':
      return {
        text: `💨 ${ef.label ?? '빗나감!'}`,
        cls: 'border-sky-400 bg-sky-700 text-white',
      };
    case 'JAIL_SKIP':
      return {
        text: '⛓️ 턴 스킵',
        cls: 'border-stone-400 bg-stone-700 text-stone-100',
      };
    case 'DEATH':
      return {
        text: '💀 사망!',
        cls: 'border-rose-500 bg-black text-rose-300',
      };
    case 'EQUIP':
      return {
        text: '🛡️ 장착',
        cls: 'border-blue-400 bg-blue-800 text-blue-100',
      };
    case 'DRAW':
      return {
        text: `🃏 +${ef.amount ?? 1}`,
        cls: 'border-amber-400 bg-amber-700 text-stone-950',
      };
    case 'BANG':
      return {
        text: '🔫 BANG!',
        cls: 'border-amber-400 bg-amber-700 text-stone-950',
      };
  }
}

export function PlayerSeat({
  player,
  isMe,
  myRole,
  isCurrentTurn,
  isPendingTarget,
  distanceFromMe,
  targetingActive,
  isTargetable,
  compact = false,
  activeEffects = [],
  onSelectTarget,
  onInspectPlayer,
}: PlayerSeatProps) {
  const visibleRole = isMe ? myRole : player.role;
  const roleInfo = visibleRole ? ROLE_META[visibleRole] : null;
  const charMeta = player.character ? CHARACTER_META[player.character] : null;
  const weaponCard = player.equipped.find((c) => c.type.startsWith('WEAPON_'));
  const otherEquips = player.equipped.filter((c) => !c.type.startsWith('WEAPON_'));

  const latestEffect =
    activeEffects.length > 0 ? activeEffects[activeEffects.length - 1] : null;

  let effectAnimClass = '';
  if (latestEffect?.type === 'HIT' || latestEffect?.type === 'DYNAMITE_BOOM') {
    effectAnimClass = 'animate-bang-shake border-rose-500 ring-2 ring-rose-500/80';
  } else if (latestEffect?.type === 'HEAL') {
    effectAnimClass = 'animate-bang-heal border-emerald-400 ring-2 ring-emerald-400/70';
  } else if (latestEffect?.type === 'MISSED') {
    effectAnimClass = 'animate-bang-dodge border-sky-400 ring-2 ring-sky-400/70';
  }

  let borderClass = 'border-stone-700/80 bg-stone-900/90';
  if (effectAnimClass) {
    borderClass = `bg-stone-900/95 ${effectAnimClass}`;
  } else if (isPendingTarget) {
    borderClass = 'border-rose-500 ring-2 ring-rose-500/70 bg-rose-950/30 animate-pulse';
  } else if (targetingActive && isTargetable) {
    borderClass =
      'border-red-400 ring-2 ring-red-500 bg-red-950/40 cursor-pointer hover:scale-105 transition-transform';
  } else if (isCurrentTurn) {
    borderClass = 'border-amber-400 ring-2 ring-amber-400/50 bg-stone-900';
  }

  const floatingList = activeEffects.filter(
    (ef) => ef.type !== 'BANG' && ef.type !== 'DRAW'
  );

  return (
    <div
      role={targetingActive && isTargetable ? 'button' : undefined}
      tabIndex={targetingActive && isTargetable ? 0 : undefined}
      onClick={() => {
        if (targetingActive && isTargetable && onSelectTarget) {
          onSelectTarget(player.id);
        }
      }}
      onKeyDown={(e) => {
        if (
          (e.key === 'Enter' || e.key === ' ') &&
          targetingActive &&
          isTargetable &&
          onSelectTarget
        ) {
          e.preventDefault();
          onSelectTarget(player.id);
        }
      }}
      className={`relative rounded-xl border shadow-lg select-none ${
        compact ? 'w-full p-2' : 'w-44 lg:w-48 p-2.5'
      } ${borderClass} ${!player.isAlive ? 'opacity-50 grayscale' : ''}`}
    >
      {/* Floating Visual Effects */}
      {floatingList.length > 0 && (
        <div className="pointer-events-none absolute -top-3 left-1/2 z-30 flex flex-col items-center gap-0.5">
          {floatingList.map((ef) => {
            const badge = renderFloatingEffect(ef);
            return (
              <span
                key={ef.id}
                className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-black shadow-lg animate-bang-float-up ${badge.cls}`}
              >
                {badge.text}
              </span>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-1.5 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Avatar nickname={player.nickname} avatar={player.avatar} size="sm" />
          <span className="truncate font-bold text-xs sm:text-sm text-stone-100">
            {player.nickname}
          </span>
          {isMe && (
            <span className="shrink-0 rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-bold text-amber-300">
              나
            </span>
          )}
        </div>

        {roleInfo ? (
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${roleInfo.badgeClass}`}
          >
            {roleInfo.name}
          </span>
        ) : (
          <span className="shrink-0 rounded border border-stone-700 bg-stone-800 px-1.5 py-0.5 text-[10px] text-stone-400">
            ?
          </span>
        )}
      </div>

      {charMeta && (
        <button
          type="button"
          title={charMeta.desc}
          onClick={(e) => {
            e.stopPropagation();
            onInspectPlayer?.(player);
          }}
          className="mb-1 flex w-full items-center justify-between gap-1 rounded px-1 py-0.5 text-left text-[11px] font-medium text-amber-200/90 hover:bg-stone-800/80 hover:text-amber-200 cursor-pointer"
        >
          <span className="truncate">★ {charMeta.name}</span>
          <span className="shrink-0 text-[10px] text-stone-400">ⓘ</span>
        </button>
      )}

      {/* HP */}
      <div className="flex items-center justify-between text-xs mb-1">
        <div className="flex items-center gap-0.5" title={`체력 ${player.hp}/${player.maxHp}`}>
          {Array.from({ length: player.maxHp }).map((_, i) => (
            <span
              key={i}
              className={i < player.hp ? 'text-rose-500' : 'text-stone-700'}
            >
              ♥
            </span>
          ))}
          <span className="ml-1 text-[10px] text-stone-400">
            {player.hp}/{player.maxHp}
          </span>
        </div>

        <span className="text-[11px] text-stone-300">
          🃏 {player.handCount}
        </span>
      </div>

      {/* Weapon & Distance */}
      <div className="flex items-center justify-between gap-1 text-[11px] text-stone-400">
        <span className="truncate">
          {weaponCard
            ? `🔫 ${CARD_META[weaponCard.type].name} (${player.weaponRange})`
            : `콜트 (사거리 ${player.weaponRange})`}
        </span>

        {!player.isAlive ? (
          <span className="shrink-0 font-semibold text-rose-400">사망</span>
        ) : !isMe ? (
          <span
            className={`shrink-0 rounded px-1 py-0.5 ${
              targetingActive && isTargetable
                ? 'bg-red-500/30 text-red-200 font-semibold'
                : 'bg-stone-800 text-stone-300'
            }`}
          >
            거리 {distanceFromMe}
          </span>
        ) : null}
      </div>

      {/* Blue Equipment Badges */}
      {otherEquips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {otherEquips.map((eq) => (
            <span
              key={eq.id}
              className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium ${equipBadgeStyle(
                eq.type
              )}`}
            >
              <span>{EQUIP_ICON[eq.type] ?? ''}</span>
              <span>{CARD_META[eq.type].name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
