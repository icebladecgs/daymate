function pad2(value) {
  return String(value).padStart(2, '0');
}

export function getCurrentGoalMonthKey(baseDate = new Date()) {
  return `${baseDate.getFullYear()}-${pad2(baseDate.getMonth() + 1)}`;
}

function normalizeActionList(actions, goalId) {
  return (Array.isArray(actions) ? actions : [])
    .map((action, index) => {
      if (typeof action === 'string') {
        const title = action.trim();
        if (!title) return null;
        return { id: `yga_${goalId}_${index}`, title };
      }
      const title = action?.title?.trim();
      if (!title) return null;
      return {
        id: action.id || `yga_${goalId}_${index}`,
        title,
      };
    })
    .filter(Boolean);
}

function normalizeYearGoals(yearGoals) {
  return (Array.isArray(yearGoals) ? yearGoals : [])
    .map((goal, index) => {
      if (typeof goal === 'string') {
        const title = goal.trim();
        if (!title) return null;
        const id = `yg_${index}_${title.replace(/\s+/g, '_').slice(0, 16)}`;
        return { id, title, actions: [] };
      }

      const title = goal?.title?.trim();
      if (!title) return null;
      const id = goal.id || `yg_${index}_${title.replace(/\s+/g, '_').slice(0, 16)}`;
      return {
        id,
        title,
        actions: normalizeActionList(goal.actions, id),
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeMonthGoalList(monthGoals) {
  return (Array.isArray(monthGoals) ? monthGoals : [])
    .map((goal) => (typeof goal === 'string' ? goal.trim() : ''))
    .filter(Boolean)
    .slice(0, 5);
}

export function normalizeGoals(rawGoals, currentMonthKey = getCurrentGoalMonthKey()) {
  const raw = rawGoals || {};
  const hasStructuredMonths = !!(raw.months && Object.keys(raw.months).length > 0);
  const months = Object.fromEntries(
    Object.entries(raw.months || {})
      .map(([monthKey, goals]) => [monthKey, normalizeMonthGoalList(goals)])
      .filter(([, goals]) => goals.length > 0)
  );

  const legacyMonthGoals = normalizeMonthGoalList(raw.month || []);
  if (!hasStructuredMonths && legacyMonthGoals.length > 0 && !months[currentMonthKey]) {
    months[currentMonthKey] = legacyMonthGoals;
  }

  return {
    year: normalizeYearGoals(raw.year || []),
    month: months[currentMonthKey] || [],
    months,
  };
}

// 목표 목록을 편집·저장할 때 기존 항목(실천 항목 등)을 이어받기 위한 매칭.
// 같은 제목이면 그대로, 제목이 바뀐 경우는 같은 자리(순서)에 있던 항목을 이어받음 (이름 수정).
// 삭제로 순서가 밀린 경우 제목이 같은 쪽이 먼저 짝지어지므로 엉뚱한 목표로 넘어가지 않음.
// 반환: newTitles와 같은 길이의 배열, 각 원소는 짝지어진 oldTitles의 인덱스(없으면 -1)
export function matchGoalsByTitle(oldTitles = [], newTitles = []) {
  const used = new Set();
  const result = newTitles.map((t) => {
    const i = oldTitles.findIndex((o, idx) => !used.has(idx) && o === t);
    if (i >= 0) used.add(i);
    return i;
  });
  return result.map((i, pos) => {
    if (i >= 0) return i;
    if (pos < oldTitles.length && !used.has(pos)) { used.add(pos); return pos; }
    return -1;
  });
}

export function getYearGoals(goals) {
  return normalizeGoals(goals).year;
}

export function getYearGoalTitles(goals) {
  return getYearGoals(goals).map((goal) => goal.title);
}

export function getMonthGoals(goals, monthKey = getCurrentGoalMonthKey()) {
  return normalizeGoals(goals, monthKey).months[monthKey] || [];
}

export function setYearGoals(goals, yearGoals, currentMonthKey = getCurrentGoalMonthKey()) {
  const normalized = normalizeGoals(goals, currentMonthKey);
  return {
    ...normalized,
    year: normalizeYearGoals(yearGoals),
  };
}

export function updateYearGoal(goals, goalId, updater, currentMonthKey = getCurrentGoalMonthKey()) {
  const normalized = normalizeGoals(goals, currentMonthKey);
  return {
    ...normalized,
    year: normalized.year.map((goal) => goal.id === goalId ? updater(goal) : goal),
  };
}

export function setMonthGoals(goals, monthKey, monthGoals, currentMonthKey = getCurrentGoalMonthKey()) {
  const normalized = normalizeGoals(goals, currentMonthKey);
  const nextMonths = {
    ...normalized.months,
    [monthKey]: normalizeMonthGoalList(monthGoals),
  };

  if ((nextMonths[monthKey] || []).length === 0) {
    delete nextMonths[monthKey];
  }

  return {
    ...normalized,
    months: nextMonths,
    month: nextMonths[currentMonthKey] || [],
  };
}