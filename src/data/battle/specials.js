// 일기토 배틀 SPECIAL 기술 — Phase 1: 각 스탯당 1단계(요구 점수 10)만 구현
// type: 'attack'(데미지) | 'heal'(회복) | 'shield'(다음 피격 경감) | 'buff'(다음 공격 크리 확정)
// 내 기본공격 이름 — 가장 높은 능력치(primaryStat)에 따라. 화면·기록 표시용이며 계산에는 영향 없음
export const PLAYER_BASIC_MOVES = {
  STR: '정권 지르기', INT: '논리 펀치', WEALTH: '복리 펀치',
  REL: '말빨 공격', ACHIEVE: '성과 어택', LIFE: '생활 내공',
};

export const SPECIALS_TIER10 = {
  STR: { stat: 'STR', name: '강타', icon: '⚔️', desc: '다음 공격 데미지 1.5배', type: 'attack', mult: 1.5, requireScore: 10 },
  INT: { stat: 'INT', name: '분석', icon: '🧠', desc: '이번 공격은 상대 방어를 무시', type: 'attack', ignoreDefense: true, requireScore: 10 },
  WEALTH: { stat: 'WEALTH', name: '저축', icon: '💰', desc: '최대 Energy의 12% 회복', type: 'heal', healPct: 0.12, requireScore: 10 },
  REL: { stat: 'REL', name: '인맥찬스', icon: '🤝', desc: '다음에 받는 피해 40% 감소', type: 'shield', shieldPct: 0.4, requireScore: 10 },
  ACHIEVE: { stat: 'ACHIEVE', name: '몰입', icon: '🚀', desc: '다음 공격 크리티컬 확정', type: 'buff', requireScore: 10 },
  LIFE: { stat: 'LIFE', name: '루틴', icon: '🏠', desc: '다음에 받는 피해를 최대 Energy의 15%만큼 흡수', type: 'shield', shieldFlatRatio: 0.15, requireScore: 10 },
};

export const SPECIAL_COOLDOWN = 1; // 사용 후 다음 턴엔 재사용 불가 (그 다음 턴부터 다시 가능)
