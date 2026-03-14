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
