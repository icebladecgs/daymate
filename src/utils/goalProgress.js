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

// "1년 전 오늘" (2026-11-03) — 1~5년 전 같은 날 기록 중 가장 가까운 해. 일기 첫 줄·메모 첫 줄·끝낸 할일 수.
// 잠긴 메모는 내용을 보여주지 않는다. 남긴 게 없으면 null.
export function onThisDay(plans, todayStr) {
  const [y, md] = [Number(todayStr.slice(0, 4)), todayStr.slice(4)];
  for (let back = 1; back <= 5; back++) {
    const ds = `${y - back}${md}`;
    const day = plans?.[ds];
    if (!day) continue;
    const firstLine = (t) => String(t || '').split('\n').map(l => l.trim()).find(Boolean) || '';
    const journal = firstLine(day.journal?.body);
    const memos = (day.memos || []).filter(m => !m.locked && firstLine(m.text));
    const done = (day.tasks || []).filter(t => t.done && t.title?.trim()).length;
    if (!journal && !memos.length && !done) continue;
    return { ds, years: back, journal, memo: memos.length ? firstLine(memos[0].text) : '', memoCount: memos.length, done };
  }
  return null;
}

// 주간 돌아보기 (2026-11-03) — endDs(일요일)까지 7일: 끝낸 할일·전체·집중 시간·가장 많이 한 날·목표별 끝낸 수
export function weekSummary(plans, endDs) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(endDs, i - 6));
  let done = 0, total = 0, focus = 0, best = null;
  const goals = new Map();
  for (const ds of days) {
    const list = (plans?.[ds]?.tasks || []).filter(t => t?.title?.trim());
    const d = list.filter(t => t.done).length;
    done += d;
    total += list.length;
    for (const t of list) {
      if (t.focusMin > 0) focus += t.focusMin;
      if (t.done && t.goalRef?.title) {
        const k = goalKey(t.goalRef.kind, t.goalRef.title);
        goals.set(k, { ...t.goalRef, count: (goals.get(k)?.count || 0) + 1 });
      }
    }
    if (d && (!best || d > best.done)) best = { ds, done: d };
  }
  return { done, total, focus, best, goals: [...goals.values()].sort((a, b) => b.count - a.count) };
}
