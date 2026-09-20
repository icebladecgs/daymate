// 일기토 배틀 NPC — Phase 1: Lv1~3만 구현 (나머지는 v2 설계 메모로 남겨둠)
// stats는 플레이어와 동일하게 0~100 스케일(calcStatScore와 같은 범위)
// "약점"은 별도 로직 없이 해당 스탯을 낮게 잡는 것으로만 표현 (자연스럽게 방어/회피가 약해짐)
export const NPCS = [
  {
    id: 'npc_1',
    level: 1,
    name: '만년 작심삼일러',
    energyMax: 150,
    // 신규 유저(전 스탯 0)와 거의 대등하게 붙어볼 수 있도록 이 NPC만 전 스탯 0으로 설계
    // — "아직 아무것도 안 해본 사람"이라는 설정과도 자연스럽게 맞음
    stats: { STR: 0, INT: 0, WEALTH: 0, REL: 0, ACHIEVE: 0, LIFE: 0 },
    trait: {
      id: 'sanheunsamil',
      label: '작심삼일',
      desc: '4턴째부터 전 능력치 20% 하락',
    },
  },
  {
    id: 'npc_2',
    level: 2,
    name: '회식왕 김대리',
    energyMax: 280,
    stats: { STR: 12, INT: 10, WEALTH: 15, REL: 25, ACHIEVE: 15, LIFE: 8 },
    trait: {
      id: 'sulja_wang',
      label: '술자리의 제왕',
      desc: '기본공격 데미지 +15% (관계력 기반)',
      basicAttackDamageMult: 1.15,
    },
  },
  {
    id: 'npc_3',
    level: 3,
    name: '운동광 박대리',
    energyMax: 600,
    stats: { STR: 50, INT: 15, WEALTH: 15, REL: 15, ACHIEVE: 20, LIFE: 20 },
    trait: {
      id: 'helchang',
      label: '헬창',
      desc: '기본공격 데미지 +15% (체력 기반)',
      basicAttackDamageMult: 1.15,
    },
  },
];

export const getNpcById = (id) => NPCS.find(n => n.id === id) || null;
