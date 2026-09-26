// 일기토 배틀 NPC — Lv1~25, 레벨이 오를수록 강해지는 도전 상대 목록
// 4b/8b/12b/16b는 브론즈~다이아 각 티어 승급 구간(4↔5, 8↔9, 12↔13, 16↔17)에 끼워 넣은 완충 캐릭터, 20b는 챌린저 진입 보스
// stats는 플레이어와 동일하게 0~100 스케일(calcStatScore와 같은 범위)
// "약점"은 별도 로직 없이 해당 스탯을 낮게 잡는 것으로만 표현 (자연스럽게 방어/회피가 약해짐)
// energyMax는 calcLevel의 실제 레벨 공식(100×(레벨-1)²)을 기준으로, 그 레벨 구간의 중간값 정도로 앵커링
export const NPCS = [
  {
    id: 'npc_1',
    level: 1,
    name: '만년 작심삼일러',
    energyMax: 150,
    // 신규 유저(전 스탯 0)와 거의 대등하게 붙어볼 수 있도록 이 NPC만 전 스탯 0으로 설계
    // — "아직 아무것도 안 해본 사람"이라는 설정과도 자연스럽게 맞음
    stats: { STR: 0, INT: 0, WEALTH: 0, REL: 0, ACHIEVE: 0, LIFE: 0 },
    trait: { id: 'sanheunsamil', label: '작심삼일', desc: '4턴째부터 전 능력치 20% 하락' },
  },
  {
    id: 'npc_2',
    level: 2,
    name: '회식왕 김대리',
    energyMax: 280,
    stats: { STR: 12, INT: 10, WEALTH: 15, REL: 25, ACHIEVE: 15, LIFE: 8 },
    trait: { id: 'sulja_wang', label: '술자리의 제왕', desc: '기본공격 데미지 +15% (관계력 기반)', basicAttackDamageMult: 1.15 },
  },
  {
    id: 'npc_3',
    level: 3,
    name: '운동광 박대리',
    energyMax: 600,
    stats: { STR: 50, INT: 15, WEALTH: 15, REL: 15, ACHIEVE: 20, LIFE: 20 },
    trait: { id: 'helchang', label: '헬창', desc: '기본공격 데미지 +15% (체력 기반)', basicAttackDamageMult: 1.15 },
  },
  {
    id: 'npc_4',
    level: 4,
    name: '공부벌레 이과장',
    energyMax: 1250,
    stats: { STR: 15, INT: 45, WEALTH: 20, REL: 15, ACHIEVE: 20, LIFE: 15 },
    trait: { id: 'byurak', label: '벼락치기', desc: '기본공격 데미지 +15% (지력 기반)', basicAttackDamageMult: 1.15 },
  },
  // 브론즈→실버 승급 완충 캐릭터 (Lv4↔5 사이 에너지 격차 완화용)
  {
    id: 'npc_4b',
    level: 5,
    name: '단지 경비실 최반장',
    energyMax: 1600,
    stats: { STR: 15, INT: 12, WEALTH: 12, REL: 38, ACHIEVE: 15, LIFE: 18 },
    trait: { id: 'banjang', label: '모르는 사람이 없다', desc: '회피율 +5%p', dodgeFlatBonus: 0.05 },
  },
  {
    id: 'npc_5',
    level: 6,
    name: '짠테크 최과장',
    energyMax: 2050,
    stats: { STR: 15, INT: 20, WEALTH: 50, REL: 15, ACHIEVE: 20, LIFE: 20 },
    trait: { id: 'mujichul', label: '무지출챌린지', desc: '받는 피해 6% 고정 경감', defenseFlatBonus: 0.06 },
  },
  {
    id: 'npc_6',
    level: 7,
    name: '인맥왕 정차장',
    energyMax: 3050,
    stats: { STR: 20, INT: 25, WEALTH: 25, REL: 45, ACHIEVE: 40, LIFE: 20 },
    trait: { id: 'nunchi', label: '눈치 100단', desc: '크리티컬 확률 +8%p', critFlatBonus: 0.08 },
  },
  {
    id: 'npc_7',
    level: 8,
    name: '일잘러 한팀장',
    energyMax: 4250,
    stats: { STR: 25, INT: 35, WEALTH: 30, REL: 30, ACHIEVE: 55, LIFE: 25 },
    trait: { id: 'kaltoe', label: '칼퇴는없다', desc: '크리티컬 확률 +10%p', critFlatBonus: 0.10 },
  },
  {
    id: 'npc_8',
    level: 9,
    name: '루틴왕 윤팀장',
    energyMax: 5650,
    stats: { STR: 35, INT: 35, WEALTH: 30, REL: 30, ACHIEVE: 35, LIFE: 50 },
    trait: { id: 'miracle_morning', label: '미라클모닝', desc: '받는 피해 5% 고정 경감', defenseFlatBonus: 0.05 },
  },
  // 실버→골드 승급 완충 캐릭터
  {
    id: 'npc_8b',
    level: 10,
    name: '만능해결사 잡무왕',
    energyMax: 6400,
    stats: { STR: 20, INT: 22, WEALTH: 20, REL: 25, ACHIEVE: 48, LIFE: 22 },
    trait: { id: 'japmu', label: '시키는 건 다 함', desc: '기본공격 데미지 +12% (성취력 기반)', basicAttackDamageMult: 1.12 },
  },
  {
    id: 'npc_9',
    level: 11,
    name: '에이스 지점장',
    energyMax: 7250,
    stats: { STR: 55, INT: 55, WEALTH: 55, REL: 60, ACHIEVE: 60, LIFE: 55 },
    trait: { id: 'allrounder', label: '올라운더', desc: '뚜렷한 약점 없는 전천후형' },
  },
  {
    id: 'npc_10',
    level: 12,
    name: '철인 CEO',
    energyMax: 10000,
    stats: { STR: 65, INT: 65, WEALTH: 70, REL: 65, ACHIEVE: 70, LIFE: 65 },
    trait: { id: 'bulgul', label: '불굴', desc: '받는 피해 7% 고정 경감', defenseFlatBonus: 0.07 },
  },
  {
    id: 'npc_11',
    level: 13,
    name: '미니멀리스트 조여사',
    energyMax: 11050,
    stats: { STR: 30, INT: 40, WEALTH: 40, REL: 30, ACHIEVE: 40, LIFE: 70 },
    trait: { id: 'jeongri', label: '정리의 달인', desc: '받는 피해 7% 고정 경감', defenseFlatBonus: 0.07 },
  },
  {
    id: 'npc_12',
    level: 14,
    name: '울트라마라토너 강코치',
    energyMax: 13250,
    stats: { STR: 75, INT: 30, WEALTH: 30, REL: 35, ACHIEVE: 45, LIFE: 45 },
    trait: { id: 'marathon', label: '마라토너', desc: '기본공격 데미지 +20% (체력 기반)', basicAttackDamageMult: 1.2 },
  },
  // 골드→플래티넘 승급 완충 캐릭터 — 겉보기엔 스탯이 평범하지만 트레이트가 의외로 강한 "복병"형
  {
    id: 'npc_12b',
    level: 15,
    name: '존재감 제로 은둔고수',
    energyMax: 14400,
    stats: { STR: 28, INT: 28, WEALTH: 25, REL: 22, ACHIEVE: 28, LIFE: 30 },
    trait: { id: 'eundun', label: '보이는 게 다가 아니다', desc: '크리티컬 확률 +14%p', critFlatBonus: 0.14 },
  },
  {
    id: 'npc_13',
    level: 16,
    name: '다독가 서작가',
    energyMax: 15650,
    stats: { STR: 30, INT: 70, WEALTH: 35, REL: 35, ACHIEVE: 45, LIFE: 35 },
    trait: { id: 'mangwon', label: '만권독서', desc: '크리티컬 확률 +10%p', critFlatBonus: 0.10 },
  },
  {
    id: 'npc_14',
    level: 17,
    name: '엔젤투자자 배대표',
    energyMax: 18250,
    stats: { STR: 30, INT: 45, WEALTH: 80, REL: 40, ACHIEVE: 45, LIFE: 35 },
    trait: { id: 'gwiche', label: '투자의 귀재', desc: '받는 피해 7% 고정 경감', defenseFlatBonus: 0.07 },
  },
  {
    id: 'npc_15',
    level: 18,
    name: '인플루언서 유크리에이터',
    energyMax: 21050,
    stats: { STR: 35, INT: 40, WEALTH: 45, REL: 60, ACHIEVE: 60, LIFE: 35 },
    trait: { id: 'follower', label: '팔로워 100만', desc: '회피율 +10%p', dodgeFlatBonus: 0.10 },
  },
  {
    id: 'npc_16',
    level: 19,
    name: '천재 전략가',
    energyMax: 24050,
    stats: { STR: 35, INT: 85, WEALTH: 45, REL: 40, ACHIEVE: 70, LIFE: 35 },
    trait: { id: 'strategist', label: '판을 읽는 자', desc: '크리티컬 확률 +12%p', critFlatBonus: 0.12 },
  },
  // 플래티넘→다이아몬드 승급 완충 캐릭터 — STR+LIFE 이중 특화형
  {
    id: 'npc_16b',
    level: 20,
    name: '해뜨기 전 헬스장 죽돌이',
    energyMax: 25600,
    stats: { STR: 58, INT: 22, WEALTH: 25, REL: 22, ACHIEVE: 30, LIFE: 60 },
    trait: { id: 'saebyeok', label: '이미 하루 반을 산 사람', desc: '기본공격 데미지 +18% (체력 기반)', basicAttackDamageMult: 1.18 },
  },
  {
    id: 'npc_17',
    level: 21,
    name: '슈퍼개미',
    energyMax: 27250,
    stats: { STR: 35, INT: 55, WEALTH: 90, REL: 40, ACHIEVE: 50, LIFE: 40 },
    trait: { id: 'super_ant', label: '시장의 승부사', desc: '받는 피해 8% 고정 경감', defenseFlatBonus: 0.08 },
  },
  {
    id: 'npc_18',
    level: 22,
    name: '스타트업 대표',
    energyMax: 30650,
    stats: { STR: 40, INT: 60, WEALTH: 60, REL: 55, ACHIEVE: 85, LIFE: 40 },
    trait: { id: 'unicorn', label: '유니콘을 꿈꾸다', desc: '기본공격 데미지 +20% (성취력 기반)', basicAttackDamageMult: 1.2 },
  },
  {
    id: 'npc_19',
    level: 23,
    name: '백만장자',
    energyMax: 34250,
    stats: { STR: 40, INT: 60, WEALTH: 95, REL: 50, ACHIEVE: 55, LIFE: 45 },
    trait: { id: 'millionaire', label: '이미 은퇴 가능', desc: '받는 피해 9% 고정 경감', defenseFlatBonus: 0.09 },
  },
  {
    id: 'npc_20',
    level: 24,
    name: '완벽한 엄친아',
    energyMax: 38050,
    stats: { STR: 80, INT: 82, WEALTH: 80, REL: 82, ACHIEVE: 85, LIFE: 80 },
    trait: { id: 'glass_mental', label: '유리멘탈', desc: '한 방에 최대 Energy 15% 이상 맞으면 30% 확률로 전 능력치 25% 하락 (1회성)', glassMental: true },
  },
  // 다이아몬드→챌린저 승급전 — 현재 로스터의 상징적인 최상위 보스 (기존엔 이 구간에 NPC가 아예 없었음)
  {
    id: 'npc_20b',
    level: 25,
    name: '갓생 끝판왕',
    energyMax: 46000,
    stats: { STR: 90, INT: 90, WEALTH: 88, REL: 88, ACHIEVE: 92, LIFE: 90 },
    trait: { id: 'godsaeng', label: '더 이상 오를 곳이 없다', desc: '받는 피해 10% 고정 경감', defenseFlatBonus: 0.10 },
  },
];

// 배틀 화면 캐릭터 얼굴 — 이름에 어울리는 이모지. 능력치 아이콘(⚔️🧠💰🤝🚀🏠)과 내 얼굴(😎)은 피한다
const NPC_AVATARS = {
  npc_1: '😪', npc_2: '🍻', npc_3: '💪', npc_4: '🤓', npc_4b: '👮',
  npc_5: '🪙', npc_6: '🥂', npc_7: '💼', npc_8: '⏰', npc_8b: '🧰',
  npc_9: '🏦', npc_10: '🦾', npc_11: '🧘', npc_12: '🏃', npc_12b: '🥷',
  npc_13: '📚', npc_14: '😇', npc_15: '🤳', npc_16: '♟️', npc_16b: '🏋️',
  npc_17: '🐜', npc_18: '🦄', npc_19: '🤑', npc_20: '🌟', npc_20b: '👑',
};
export const getNpcAvatar = (id) => NPC_AVATARS[id] || '😈';

export const getNpcById = (id) => NPCS.find(n => n.id === id) || null;
