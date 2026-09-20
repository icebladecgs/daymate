// 생활 RPG 성장영역(스탯) 시스템 — Phase 1
// 기존 XP/레벨/티어(stats.js)와는 완전히 별개의 누적 레이어. 소급 없음, 감소 없음.

export const GROWTH_STATS = [
  { id: 'STR', name: '체력', icon: '⚔️' },
  { id: 'INT', name: '지력', icon: '🧠' },
  { id: 'WEALTH', name: '자산력', icon: '💰' },
  { id: 'REL', name: '관계력', icon: '🤝' },
  { id: 'ACHIEVE', name: '성취력', icon: '🚀' },
  { id: 'LIFE', name: '생활력', icon: '🏠' },
];

export const GROWTH_STAT_MAP = Object.fromEntries(GROWTH_STATS.map(s => [s.id, s]));

export const DEFAULT_STAT_XP = Object.fromEntries(GROWTH_STATS.map(s => [s.id, 0]));

// 완료 유형별 지급 XP (텍스트 난이도 판단 대신, 이미 존재하는 구조적 신호를 사용)
export const STAT_XP_HABIT = 1;         // 습관 체크 (반복 빈도가 높으므로 개당 낮게)
export const STAT_XP_TASK = 3;          // 일반 할일 완료
export const STAT_XP_PRIORITY_TASK = 5; // 우선순위(⭐) 할일 완료
export const STAT_XP_MONTH_GOAL = 10;   // 이번달 목표 체크

// 스탯 점수 100에 도달하는 데 필요한 누적 XP (√ 성장곡선 기준)
export const XP_FOR_STAT_100 = 10000;

// 스탯 점수 = ⌊√누적XP⌋, 100 상한
export function calcStatScore(xp) {
  return Math.min(100, Math.floor(Math.sqrt(Math.max(0, xp || 0))));
}

// 로컬 키워드 사전 — 실제 DayMate 데이터(인생목표/올해목표/언젠가할일) 기반 시드
// 우선순위: 배열 순서대로 먼저 매칭되는 스탯으로 분류
const STAT_KEYWORDS = {
  STR: ['헬스', '운동', '걷기', '걷', '산책', '조깅', '러닝', '달리기', '필라테스', '요가', '스트레칭',
    '다이어트', '뱃살', '체중', '금연', '담배', '절주', '금주', '푸시업', '헬스장', '수영', '등산',
    '근력', '유산소', '병원', '건강검진', '수면', '스쿼트'],
  // '책' 단독 키워드는 넣지 않음 — "책상정리"(생활), "책 팔기"(생활/자산), "책 출간"(성취력)처럼
  // 단어만으론 목적이 갈리므로, 읽는다는 동사가 붙은 표현("읽기")으로만 지력을 판단한다
  INT: ['독서', '공부', '강의', '학습', '배우기', '자격증', '어학', '외국어', '세미나',
    '특강', '스터디', '논문', '필사', '읽기'],
  WEALTH: ['자산', '투자', '포트폴리오', '적금', '예금', '보험', '대출', '주식', '코인', '펀드',
    '현금흐름', '세금', '연말정산', '전세', '재테크', '부동산', '통장', '절약', '용돈'],
  REL: ['가족', '아내', '남편', '와이프', '딸', '아들', '부모님', '엄마', '아빠', '친구',
    '연애', '데이트', '고객', '약속', '연락', '전화', '가족회의', '모임', '동료', '상담'],
  ACHIEVE: ['프로젝트', '보고서', '기획', '개발', '제작', '만들기', '출간', '브랜드', 'sns', '블로그',
    '유튜브 촬영', '유튜브 편집', '콘텐츠', '시스템', '발표', '업무', '완성', '런칭', '출시', '회의', '글쓰기'],
  LIFE: ['청소', '정리', '정돈', '장보기', '쇼핑', '수리', '고치기', '처분', '행정', '등본',
    '면허', '예약', '빨래', '세탁', '가구', '옷장', '변기', '보일러', '정수기', '차량',
    '반려동물', '강아지', '고양이', '책상정리', '텔레비전'],
};

// 명확히 스탯 대상이 아닌 순수 휴식/오락 — 체크는 되지만 스탯 XP는 지급하지 않음
const NONE_KEYWORDS = ['게임', '영화', '넷플릭스', '드라마', '휴식', '여행', '놀기', '쉬기', '낮잠', '유튜브시청'];

// 키워드를 전부 펼쳐서 "긴 단어부터" 매칭 — 짧은 단어가 긴 단어의 일부로 오탐되는 것 방지
// (예: "책상정리"를 먼저 봐야 "책"만 보고 지력으로 잘못 분류하지 않음)
const ALL_KEYWORDS = [
  ...Object.entries(STAT_KEYWORDS).flatMap(([statId, words]) => words.map(w => ({ word: w.replace(/\s+/g, ''), statId }))),
  ...NONE_KEYWORDS.map(w => ({ word: w.replace(/\s+/g, ''), statId: 'NONE' })),
].sort((a, b) => b.word.length - a.word.length);

export function classifyTodoStat(title) {
  // 띄어쓰기 유무(예: "현금흐름" vs "현금 흐름")에 흔들리지 않도록 공백 제거 후 비교
  const text = (title || '').replace(/\s+/g, '').toLowerCase();
  if (!text) return null;
  const hit = ALL_KEYWORDS.find(({ word }) => text.includes(word));
  return hit ? hit.statId : null; // null = 미분류
}
