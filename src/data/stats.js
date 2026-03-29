import { toDateStr, pad2 } from '../utils/date.js';

export const isPerfectDay = (dayData) => {
  if (!dayData || !dayData.tasks) return false;
  const filledTasks = dayData.tasks.filter((t) => t.title.trim()).length;
  const doneTasks = dayData.tasks.filter((t) => t.done && t.title.trim()).length;
  const hasJournal = !!dayData.journal?.body?.trim();
  return filledTasks >= 3 && doneTasks === filledTasks && hasJournal;
};

export const calcStreak = (plans) => {
  let streak = 0;
  let current = new Date();
  while (streak < 365) {
    const dateStr = toDateStr(current);
    const day = plans[dateStr];
    if (!isPerfectDay(day)) break;
    streak++;
    current.setDate(current.getDate() - 1);
  }
  return streak;
};

export const calcHabitStreak = (plans, habitId) => {
  let streak = 0;
  const today = new Date();
  const todayStr = toDateStr(today);
  const todayChecked = !!plans[todayStr]?.habitChecks?.[habitId];

  // 오늘 체크 안 했으면 어제부터 카운트 (오늘 기회 남아있으므로)
  let current = new Date(today);
  if (!todayChecked) current.setDate(current.getDate() - 1);

  while (streak < 365) {
    const dateStr = toDateStr(current);
    if (!plans[dateStr]?.habitChecks?.[habitId]) break;
    streak++;
    current.setDate(current.getDate() - 1);
  }
  return streak;
};

export const calcWeeklyStats = (plans) => {
  const days = [];
  let current = new Date();
  for (let i = 0; i < 7; i++) {
    const dateStr = toDateStr(current);
    const day = plans[dateStr];
    const filledTasks = (day?.tasks || []).filter((t) => t.title.trim()).length;
    const doneTasks = (day?.tasks || []).filter((t) => t.done && t.title.trim()).length;
    days.push({
      date: dateStr,
      rate: filledTasks === 0 ? 0 : Math.min(100, Math.round((doneTasks / filledTasks) * 100)),
      isPerfect: isPerfectDay(day),
    });
    current.setDate(current.getDate() - 1);
  }
  return days.reverse();
};

export const calcGoalProgress = (plans) => {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  let perfectDaysThisMonth = 0;
  let daysInMonth = 0;

  let checkDate = new Date(currentYear, currentMonth, 1);
  while (checkDate.getMonth() === currentMonth) {
    daysInMonth++;
    const dateStr = toDateStr(checkDate);
    if (isPerfectDay(plans[dateStr])) {
      perfectDaysThisMonth++;
    }
    checkDate.setDate(checkDate.getDate() + 1);
  }

  const monthProgress = Math.round((perfectDaysThisMonth / daysInMonth) * 100);

  let perfectDaysThisYear = 0;
  let daysInYear = 0;

  checkDate = new Date(currentYear, 0, 1);
  const endDate = new Date();
  while (checkDate <= endDate) {
    daysInYear++;
    const dateStr = toDateStr(checkDate);
    if (isPerfectDay(plans[dateStr])) {
      perfectDaysThisYear++;
    }
    checkDate.setDate(checkDate.getDate() + 1);
  }

  const yearProgress = Math.round((perfectDaysThisYear / daysInYear) * 100);

  return { monthProgress, yearProgress, perfectDaysThisMonth, daysInMonth };
};

export const calcDayScore = (dayData, habits = []) => {
  if (!dayData) return 0;
  const tasks = (dayData.tasks || []).filter(t => t.title.trim());
  const done = tasks.filter(t => t.done).length;
  let score = 0;
  score += done * 10;
  if (tasks.length > 0 && done === tasks.length) score += 20;
  const habitChecks = dayData.habitChecks || {};
  const doneHabits = habits.filter(h => habitChecks[h.id]).length;
  score += doneHabits * 5;
  if (habits.length > 0 && doneHabits === habits.length) score += 15;
  if (dayData.journal?.body?.trim()) score += 15;
  if (tasks.length >= 3 && done === tasks.length && dayData.journal?.body?.trim()) score += 25;
  return score;
};

// 스트릭 보너스: 7일 배수마다 보너스 XP
export const STREAK_BONUS_INTERVAL = 7;
export const calcStreakBonus = (streak) => {
  if (streak <= 0 || streak % STREAK_BONUS_INTERVAL !== 0) return 0;
  const multiplier = Math.floor(streak / STREAK_BONUS_INTERVAL);
  return 50 * multiplier; // 7일=50, 14일=100, 21일=150...
};

const LEVEL_TITLES = ['새싹','새싹','새싹','성장','성장','도전자','도전자','실행가','실행가','실행가','마스터','마스터','마스터','마스터','마스터','전설','전설','전설','전설','전설','챔피언'];
const LEVEL_ICONS  = ['🌱','🌱','🌱','🌿','🌿','⚡','⚡','🔥','🔥','🔥','👑','👑','👑','👑','👑','🌟','🌟','🌟','🌟','🌟','💎'];

export const LEVEL_BADGES = [
  null, null, null,
  { label: '성장하는 씨앗', icon: '🌿' },
  { label: '성장하는 씨앗', icon: '🌿' },
  { label: '도전의 불꽃', icon: '⚡' },
  { label: '도전의 불꽃', icon: '⚡' },
  { label: '실행력의 화신', icon: '🔥' },
  { label: '실행력의 화신', icon: '🔥' },
  { label: '실행력의 화신', icon: '🔥' },
  { label: '왕관을 쓴 자', icon: '👑' },
  { label: '왕관을 쓴 자', icon: '👑' },
  { label: '왕관을 쓴 자', icon: '👑' },
  { label: '왕관을 쓴 자', icon: '👑' },
  { label: '왕관을 쓴 자', icon: '👑' },
  { label: '전설의 시작', icon: '🌟' },
  { label: '전설의 시작', icon: '🌟' },
  { label: '전설의 시작', icon: '🌟' },
  { label: '전설의 시작', icon: '🌟' },
  { label: '전설의 시작', icon: '🌟' },
  { label: '다이아몬드 챔피언', icon: '💎' },
];

export const calcLevel = (totalScore) => {
  const level = Math.max(1, Math.floor(Math.sqrt(totalScore / 100)) + 1);
  const idx = Math.min(level - 1, LEVEL_TITLES.length - 1);
  const curFloor = Math.pow(level - 1, 2) * 100;
  const nextFloor = Math.pow(level, 2) * 100;
  const progress = totalScore >= nextFloor ? 100 : Math.round((totalScore - curFloor) / (nextFloor - curFloor) * 100);
  const badge = LEVEL_BADGES[idx] || null;
  return { level, title: LEVEL_TITLES[idx], icon: LEVEL_ICONS[idx], progress, nextFloor, curFloor, badge };
};
