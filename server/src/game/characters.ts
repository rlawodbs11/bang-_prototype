import type { CharacterId } from '@bang/shared';

export const CHARACTER_LIST: CharacterId[] = [
  'BART_CASSIDY',
  'BLACK_JACK',
  'CALAMITY_JANET',
  'EL_GRINGO',
  'JESSE_JONES',
  'JOURDONNAIS',
  'KIT_CARLSON',
  'LUCKY_DUKE',
  'PAUL_REGRET',
  'PEDRO_RAMIREZ',
  'ROSE_DOOLAN',
  'SID_KETCHUM',
  'SLAB_THE_KILLER',
  'SUZY_LAFAYETTE',
  'VULTURE_SAM',
  'WILLY_THE_KID',
];

export const CHARACTER_META: Record<
  CharacterId,
  { name: string; hp: number }
> = {
  BART_CASSIDY: { name: '바트 캐시디', hp: 4 },
  BLACK_JACK: { name: '블랙 잭', hp: 4 },
  CALAMITY_JANET: { name: '캘러미티 자넷', hp: 4 },
  EL_GRINGO: { name: '엘 그링고', hp: 3 },
  JESSE_JONES: { name: '제시 존스', hp: 4 },
  JOURDONNAIS: { name: '주르도네', hp: 4 },
  KIT_CARLSON: { name: '킷 칼슨', hp: 4 },
  LUCKY_DUKE: { name: '럭키 듀크', hp: 4 },
  PAUL_REGRET: { name: '폴 리그렛', hp: 3 },
  PEDRO_RAMIREZ: { name: '페드로 라미레즈', hp: 4 },
  ROSE_DOOLAN: { name: '로즈 둘란', hp: 4 },
  SID_KETCHUM: { name: '시드 케첨', hp: 4 },
  SLAB_THE_KILLER: { name: '슬랩 더 킬러', hp: 4 },
  SUZY_LAFAYETTE: { name: '수지 라파예트', hp: 4 },
  VULTURE_SAM: { name: '벌처 샘', hp: 4 },
  WILLY_THE_KID: { name: '윌리 더 키드', hp: 4 },
};
