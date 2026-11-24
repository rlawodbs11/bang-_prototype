import type { Card, CardType, CharacterId, PublicPlayer, Role } from '@bang/shared';

export interface CardDisplayMeta {
  name: string;
  desc: string;
  badgeColor: string;
  borderColor: string;
}

export const CARD_META: Record<CardType, CardDisplayMeta> = {
  BANG: {
    name: 'BANG!',
    desc: '사거리 내 대상 1명 공격',
    badgeColor: 'bg-rose-900/70 text-rose-200',
    borderColor: 'border-rose-500/50',
  },
  MISSED: {
    name: '빗나감!',
    desc: '상대의 BANG! 회피 (대응 전용)',
    badgeColor: 'bg-sky-900/70 text-sky-200',
    borderColor: 'border-sky-500/50',
  },
  BEER: {
    name: '맥주',
    desc: '체력 +1 (2인 이하 불가)',
    badgeColor: 'bg-emerald-900/70 text-emerald-200',
    borderColor: 'border-emerald-500/50',
  },
  STAGECOACH: {
    name: '역마차',
    desc: '카드 2장 뽑기',
    badgeColor: 'bg-violet-900/70 text-violet-200',
    borderColor: 'border-violet-500/50',
  },
  WELLS_FARGO: {
    name: '웰스 파고',
    desc: '카드 3장 뽑기',
    badgeColor: 'bg-violet-900/70 text-violet-200',
    borderColor: 'border-violet-500/50',
  },
  GATLING: {
    name: '기관총',
    desc: '전체 공격',
    badgeColor: 'bg-rose-900/70 text-rose-200',
    borderColor: 'border-rose-500/50',
  },
  INDIANS: {
    name: '인디언',
    desc: '전체 BANG 요구',
    badgeColor: 'bg-rose-900/70 text-rose-200',
    borderColor: 'border-rose-500/50',
  },
  DUEL: {
    name: '결투',
    desc: '1:1 결투',
    badgeColor: 'bg-amber-900/70 text-amber-200',
    borderColor: 'border-amber-500/50',
  },
  PANIC: {
    name: '강탈',
    desc: '거리 1 카드 뺏기',
    badgeColor: 'bg-amber-900/70 text-amber-200',
    borderColor: 'border-amber-500/50',
  },
  CAT_BALOU: {
    name: '캣 발루',
    desc: '아무나 카드 1장 버리기',
    badgeColor: 'bg-amber-900/70 text-amber-200',
    borderColor: 'border-amber-500/50',
  },
  GENERAL_STORE: {
    name: '잡화점',
    desc: '카드 공개 분배',
    badgeColor: 'bg-amber-900/70 text-amber-200',
    borderColor: 'border-amber-500/50',
  },
  WEAPON_VOLCANIC: {
    name: '볼캐닉',
    desc: '사거리 1 · BANG! 연사',
    badgeColor: 'bg-cyan-900/70 text-cyan-200',
    borderColor: 'border-cyan-500/60',
  },
  WEAPON_SCHOFIELD: {
    name: '스코필드',
    desc: '사거리 2 무기 장착',
    badgeColor: 'bg-cyan-900/70 text-cyan-200',
    borderColor: 'border-cyan-500/60',
  },
  WEAPON_REMINGTON: {
    name: '레밍턴',
    desc: '사거리 3 무기 장착',
    badgeColor: 'bg-cyan-900/70 text-cyan-200',
    borderColor: 'border-cyan-500/60',
  },
  WEAPON_CARABINE: {
    name: '카빈',
    desc: '사거리 4 무기 장착',
    badgeColor: 'bg-cyan-900/70 text-cyan-200',
    borderColor: 'border-cyan-500/60',
  },
  WEAPON_WINCHESTER: {
    name: '윈체스터',
    desc: '사거리 5 무기 장착',
    badgeColor: 'bg-cyan-900/70 text-cyan-200',
    borderColor: 'border-cyan-500/60',
  },
  BARREL: {
    name: '술통',
    desc: 'BANG! 피격 시 자동 판정, ♥면 회피',
    badgeColor: 'bg-blue-900/70 text-blue-200',
    borderColor: 'border-blue-500/60',
  },
  MUSTANG: {
    name: '야생마',
    desc: '다른 사람이 나를 볼 때 거리 +1',
    badgeColor: 'bg-blue-900/70 text-blue-200',
    borderColor: 'border-blue-500/60',
  },
  SCOPE: {
    name: '조준경',
    desc: '내가 남을 볼 때 거리 -1',
    badgeColor: 'bg-blue-900/70 text-blue-200',
    borderColor: 'border-blue-500/60',
  },
  JAIL: {
    name: '감옥',
    desc: '대상 턴 시작 시 판정, ♥ 아니면 턴 스킵 (보안관 불가)',
    badgeColor: 'bg-blue-900/70 text-blue-200',
    borderColor: 'border-blue-500/60',
  },
  DYNAMITE: {
    name: '다이너마이트',
    desc: '턴 시작 시 판정, ♠2~9면 3 피해, 아니면 다음 사람에게',
    badgeColor: 'bg-blue-900/70 text-blue-200',
    borderColor: 'border-blue-500/60',
  },
};

export const EQUIP_ICON: Partial<Record<CardType, string>> = {
  BARREL: '🛢️',
  MUSTANG: '🐎',
  SCOPE: '🔭',
  JAIL: '⛓️',
  DYNAMITE: '🧨',
  WEAPON_VOLCANIC: '🔫',
  WEAPON_SCHOFIELD: '🔫',
  WEAPON_REMINGTON: '🔫',
  WEAPON_CARABINE: '🔫',
  WEAPON_WINCHESTER: '🔫',
};

export const CHECK_REASON_LABELS: Record<'BARREL' | 'JAIL' | 'DYNAMITE', string> = {
  BARREL: '술통',
  JAIL: '감옥',
  DYNAMITE: '다이너마이트',
};

export function isTargetCard(type: CardType): boolean {
  return type === 'BANG' || type === 'JAIL';
}

export function isEquipmentCard(type: CardType): boolean {
  return (
    type.startsWith('WEAPON_') ||
    type === 'BARREL' ||
    type === 'MUSTANG' ||
    type === 'SCOPE' ||
    type === 'JAIL' ||
    type === 'DYNAMITE'
  );
}

export const SUIT_SYMBOL: Record<Card['suit'], { symbol: string; isRed: boolean }> = {
  SPADES: { symbol: '♠', isRed: false },
  CLUBS: { symbol: '♣', isRed: false },
  HEARTS: { symbol: '♥', isRed: true },
  DIAMONDS: { symbol: '♦', isRed: true },
};

export const ROLE_META: Record<
  Role,
  { name: string; goal: string; badgeClass: string }
> = {
  SHERIFF: {
    name: '보안관',
    goal: '모든 무법자와 배신자를 처치하세요.',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/50',
  },
  DEPUTY: {
    name: '부관',
    goal: '보안관을 지키고 무법자와 배신자를 처치하세요.',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-400/50',
  },
  OUTLAW: {
    name: '무법자',
    goal: '보안관을 처치하세요.',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-400/50',
  },
  RENEGADE: {
    name: '배신자',
    goal: '모두를 쓰러뜨리고 최후의 1인이 되세요.',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-400/50',
  },
};

export const PHASE_LABELS: Record<
  'DRAW' | 'ACTION' | 'DISCARD' | 'WAITING_FOR_RESPONSE',
  string
> = {
  DRAW: '카드 뽑기 단계',
  ACTION: '행동 단계',
  DISCARD: '카드 버리기 단계',
  WAITING_FOR_RESPONSE: '응답 대기 중',
};

export const CHARACTER_META: Record<
  CharacterId,
  { name: string; hp: number; desc: string }
> = {
  BART_CASSIDY: {
    name: '바트 캐시디',
    hp: 4,
    desc: '피해를 입을 때마다 카드 1장 뽑기',
  },
  BLACK_JACK: {
    name: '블랙 잭',
    hp: 4,
    desc: '2번째 뽑은 카드가 ♥/♦면 1장 추가 뽑기',
  },
  CALAMITY_JANET: {
    name: '캘러미티 자넷',
    hp: 4,
    desc: 'BANG!과 빗나감!을 서로 바꿔 사용 가능',
  },
  EL_GRINGO: {
    name: '엘 그링고',
    hp: 3,
    desc: '피해를 입으면 공격자 손패에서 1장 가져오기',
  },
  JESSE_JONES: {
    name: '제시 존스',
    hp: 4,
    desc: '턴 첫 카드를 다른 사람 손패에서 뽑을 수 있음',
  },
  JOURDONNAIS: {
    name: '주르도네',
    hp: 4,
    desc: '항상 술통 효과 보유 (장착 술통과 중복 가능)',
  },
  KIT_CARLSON: {
    name: '킷 칼슨',
    hp: 4,
    desc: '턴 시작 시 3장을 보고 2장 선택, 1장은 덱 위로',
  },
  LUCKY_DUKE: {
    name: '럭키 듀크',
    hp: 4,
    desc: '판정 시 2장을 뒤집어 유리한 카드 선택',
  },
  PAUL_REGRET: {
    name: '폴 리그렛',
    hp: 3,
    desc: '항상 야생마 효과 보유 (타인→나 거리 +1)',
  },
  PEDRO_RAMIREZ: {
    name: '페드로 라미레즈',
    hp: 4,
    desc: '턴 첫 카드를 버린 더미 맨 위에서 가져올 수 있음',
  },
  ROSE_DOOLAN: {
    name: '로즈 둘란',
    hp: 4,
    desc: '항상 조준경 효과 보유 (나→타인 거리 -1)',
  },
  SID_KETCHUM: {
    name: '시드 케첨',
    hp: 4,
    desc: '행동 단계에서 카드 2장을 버려 체력 1 회복',
  },
  SLAB_THE_KILLER: {
    name: '슬랩 더 킬러',
    hp: 4,
    desc: '내 BANG! 회피에 빗나감! 2장 필요',
  },
  SUZY_LAFAYETTE: {
    name: '수지 라파예트',
    hp: 4,
    desc: '손패가 0장이 되면 즉시 카드 1장 뽑기',
  },
  VULTURE_SAM: {
    name: '벌처 샘',
    hp: 4,
    desc: '누군가 사망하면 그 사람의 카드 모두 획득',
  },
  WILLY_THE_KID: {
    name: '윌리 더 키드',
    hp: 4,
    desc: '한 턴에 BANG! 횟수 제한 없이 사용',
  },
};

export function calculateDistance(
  players: PublicPlayer[],
  fromId: string,
  toId: string
): number {
  if (fromId === toId) return 0;

  const alive = players
    .filter((p) => p.isAlive)
    .sort((a, b) => a.seatIndex - b.seatIndex);

  const fromIdx = alive.findIndex((p) => p.id === fromId);
  const toIdx = alive.findIndex((p) => p.id === toId);
  if (fromIdx === -1 || toIdx === -1) return Infinity;

  const diff = Math.abs(fromIdx - toIdx);
  let dist = Math.min(diff, alive.length - diff);

  const fromPlayer = alive[fromIdx];
  const toPlayer = alive[toIdx];

  if (toPlayer.equipped.some((c) => c.type === 'MUSTANG')) dist += 1;
  if (toPlayer.character === 'PAUL_REGRET') dist += 1;
  if (fromPlayer.equipped.some((c) => c.type === 'SCOPE')) dist -= 1;
  if (fromPlayer.character === 'ROSE_DOOLAN') dist -= 1;

  return Math.max(1, dist);
}
