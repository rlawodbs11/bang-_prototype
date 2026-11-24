import type { Card, CharacterId } from '@bang/shared';
import { CARD_META, isEquipmentCard, SUIT_SYMBOL } from '../utils/gameHelpers';

interface HandProps {
  hand: Card[];
  canAct: boolean;
  isDiscardMode: boolean;
  myCharacter?: CharacterId;
  isSidHealMode?: boolean;
  selectedAbilityIds?: string[];
  selectedTargetCardId: string | null;
  selectedDiscardIds: string[];
  onCardClick: (card: Card) => void;
}

export function Hand({
  hand,
  canAct,
  isDiscardMode,
  myCharacter,
  isSidHealMode = false,
  selectedAbilityIds = [],
  selectedTargetCardId,
  selectedDiscardIds,
  onCardClick,
}: HandProps) {
  return (
    <div className="flex flex-nowrap overflow-x-auto snap-x pb-2 md:flex-wrap md:overflow-visible md:justify-center gap-2.5 scrollbar-thin">
      {hand.length === 0 ? (
        <div className="w-full text-center py-6 text-sm text-stone-500">
          손패가 비어 있습니다.
        </div>
      ) : (
        hand.map((card) => {
          const meta = CARD_META[card.type];
          const suit = SUIT_SYMBOL[card.suit];
          const isTargetSelected = selectedTargetCardId === card.id;
          const isDiscardSelected = selectedDiscardIds.includes(card.id);
          const isAbilitySelected = selectedAbilityIds.includes(card.id);
          const isMissed = card.type === 'MISSED';
          const isEquip = isEquipmentCard(card.type);
          const canPlayMissedAsBang =
            isMissed && myCharacter === 'CALAMITY_JANET';

          const clickable =
            isDiscardMode ||
            isSidHealMode ||
            (canAct && (!isMissed || canPlayMissedAsBang));

          return (
            <button
              key={card.id}
              type="button"
              disabled={!clickable}
              onClick={() => onCardClick(card)}
              className={`shrink-0 snap-start w-28 sm:w-32 rounded-xl border p-2.5 text-left flex flex-col justify-between min-h-[112px] touch-manipulation active:scale-95 transition-all duration-200 animate-bang-card-pop ${
                isAbilitySelected
                  ? 'border-emerald-400 ring-2 ring-emerald-400 bg-emerald-950/40 -translate-y-1.5'
                  : isTargetSelected || isDiscardSelected
                    ? 'border-amber-400 ring-2 ring-amber-400 bg-amber-950/40 -translate-y-1.5'
                    : isEquip
                      ? 'border-blue-500/60 bg-stone-900/95'
                      : `${meta.borderColor} bg-stone-900/95`
              } ${
                clickable
                  ? 'cursor-pointer hover:-translate-y-1 hover:border-amber-400/80'
                  : 'cursor-not-allowed opacity-60'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold mb-1">
                <span className={suit.isRed ? 'text-rose-400' : 'text-stone-200'}>
                  {suit.symbol} {card.rank}
                </span>
                {isAbilitySelected ? (
                  <span className="rounded bg-emerald-500 px-1 text-[10px] text-stone-950">
                    회복용
                  </span>
                ) : isDiscardSelected ? (
                  <span className="rounded bg-amber-500 px-1 text-[10px] text-stone-950">
                    버림
                  </span>
                ) : isTargetSelected ? (
                  <span className="rounded bg-rose-500 px-1 text-[10px] text-white">
                    {card.type === 'JAIL' ? '대상 선택' : '조준'}
                  </span>
                ) : isEquip ? (
                  <span className="rounded bg-blue-500/20 border border-blue-500/40 px-1 text-[10px] text-blue-300">
                    장착
                  </span>
                ) : null}
              </div>

              <div>
                <div
                  className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold mb-1 ${meta.badgeColor}`}
                >
                  {meta.name}
                </div>
                <p className="text-[11px] leading-snug text-stone-400">
                  {canPlayMissedAsBang ? 'BANG!으로도 사용 가능' : meta.desc}
                </p>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
