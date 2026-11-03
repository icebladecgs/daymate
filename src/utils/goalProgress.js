// 목표 진행 — 목표에서 나온 할일(goalRef)을 날짜 기록에서 모아 "최근 7일 한 일·집중 시간·마지막 실천"을 센다 (2026-11-03).
// 목표 제목으로 찾으므로 목표 이름을 바꾸면 예전 할일은 세지 않는다.
import { addDays } from "./date.js";

export const goalKey = (kind, title) => `${kind}|${title}`;

// plans: { 'YYYY-MM-DD': { tasks } } → Map(goalKey → { week, weekFocus, total, totalFocus, lastDs })
export function buildGoalProgress(plans, todayStr) {
  const weekStart = addDays(todayStr, -6);
  const map = new Map();
  for (const [ds, day] of Object.entries(plans || {})) {
    if (ds > todayStr) continue; // 앞으로의 할일은 아직 한 일이 아님
    for (const t of day?.tasks || []) {
      const ref = t?.goalRef;
      if (!ref?.title || !ref.kind) continue;
      if (!t.done && !(t.focusMin > 0)) continue;
      const k = goalKey(ref.kind, ref.title);
      const p = map.get(k) || { week: 0, weekFocus: 0, total: 0, totalFocus: 0, lastDs: '' };
      const inWeek = ds >= weekStart;
      if (t.done) {
        p.total++;
        if (inWeek) p.week++;
      }
      const m = t.focusMin > 0 ? t.focusMin : 0;
      p.totalFocus += m;
      if (inWeek) p.weekFocus += m;
      if (ds > p.lastDs) p.lastDs = ds;
      map.set(k, p);
    }
  }
  return map;
}

export const fmtFocus = (min) => (min >= 60 ? `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ''}` : `${min}분`);

// "오늘" · "어제" · "n일 전"
export function agoText(ds, todayStr) {
  if (!ds) return '';
  const days = Math.round((new Date(`${todayStr}T00:00:00`) - new Date(`${ds}T00:00:00`)) / 86400000);
  return days <= 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`;
}

// 목표 목록 한 줄 아래에 붙이는 짧은 글 — 한 번도 안 했으면 빈 글
export function goalProgressLine(p, todayStr) {
  if (!p?.lastDs) return '';
  const parts = [];
  if (p.week) parts.push(`최근 7일 ${p.week}개`);
  if (p.weekFocus) parts.push(`집중 ${fmtFocus(p.weekFocus)}`);
  parts.push(`마지막 ${agoText(p.lastDs, todayStr)}`);
  return parts.join(' · ');
}
