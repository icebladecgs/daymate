export const HOME_PREFS_KEY = 'dm_home_prefs';
export const HOME_SECTION_ORDER_KEY = 'dm_home_section_order';

export const HOME_SECTION_CONFIG = [
  { id: 'level', visibleKey: 'showLevel', label: '레벨 섹션', description: 'XP, 레벨, 순위 카드' },
  { id: 'quote', visibleKey: 'showQuote', label: '오늘의 명언', description: '상단 명언 카드' },
  { id: 'tasks', visibleKey: 'showTasks', label: '오늘 할일', description: '오늘 체크할 핵심 할일' },
  { id: 'challenges', visibleKey: 'showChallenges', label: '오늘의 챌린지', description: '참여 중인 챌린지 요약' },
  { id: 'someday', visibleKey: 'showSomeday', label: '언젠가 할일', description: '나중에 할 일 보관함' },
  { id: 'habits', visibleKey: 'showHabits', label: '오늘 습관', description: '반복 습관 체크와 열지도' },
  { id: 'recurring', visibleKey: 'showRecurring', label: '반복 할일', description: '요일별 자동 할일 관리' },
  { id: 'goalsShortcut', visibleKey: 'showGoalsShortcut', label: '목표 바로가기', description: '달력으로 이동하는 목표 카드' },
  { id: 'portfolio', visibleKey: 'showPortfolio', label: '투자 허브', description: '보유자산 브리핑 · 투자 기록' },
];

export const DEFAULT_HOME_PREFS = Object.fromEntries(HOME_SECTION_CONFIG.map((section) => [section.visibleKey, true]));

export const DEFAULT_HOME_SECTION_ORDER = HOME_SECTION_CONFIG.map(section => section.id);
export const HOME_SECTION_LABELS = Object.fromEntries(HOME_SECTION_CONFIG.map(section => [section.id, section.label]));

export function normalizeHomeSectionOrder(saved) {
  const base = Array.isArray(saved)
    ? saved.filter(key => DEFAULT_HOME_SECTION_ORDER.includes(key))
    : [];

  const result = [...base];
  DEFAULT_HOME_SECTION_ORDER.forEach((key, defaultIndex) => {
    if (result.includes(key)) return;

    const laterKeys = DEFAULT_HOME_SECTION_ORDER.slice(defaultIndex + 1);
    const laterIndexes = laterKeys
      .map((laterKey) => result.indexOf(laterKey))
      .filter((index) => index >= 0);

    if (laterIndexes.length === 0) {
      result.push(key);
      return;
    }

    result.splice(Math.min(...laterIndexes), 0, key);
  });

  return result;
}