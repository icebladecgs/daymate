// 하루 시간대 (2026-11-09, 삼성 나우 브리프 참고) — 오늘 탭 머리글 인사, 저녁 "내일 미리보기"·내일 날씨의 기준.
// 계산은 이 파일 한 곳. 출퇴근 시간(utils/workHours.js)을 따른다.
import { normalizeWorkHours, planUntilMin, toMin, isWorkday } from "./workHours.js";
import { ruleMatches } from "./recurring.js";

// 저녁 시작 — 일하는 날은 퇴근 시각(17시보다 이르면 17시), 쉬는 날은 18시
export function eveningFromMin(wh, ds) {
  if (!isWorkday(ds)) return 18 * 60;
  return Math.max(17 * 60, toMin(normalizeWorkHours(wh).end));
}

// 'night'(0~5시) · 'morning'(아침 계획이 보이는 동안) · 'day' · 'evening'
export function dayPhase(nowMin, wh, ds) {
  if (nowMin < 5 * 60) return "night";
  if (nowMin < planUntilMin(wh)) return "morning";
  if (nowMin >= eveningFromMin(wh, ds)) return "evening";
  return "day";
}

// 머리글 인사 — 낮에는 인사 없이 지금처럼 "n개 남았어요"만
export const PHASE_GREETING = { night: "늦은 밤이에요", morning: "좋은 아침이에요", evening: "하루가 끝나가요" };

const timeMin = (t) => toMin(t?.time) ?? Infinity;

// 내일 할 일 미리보기 — 그날 기록의 할일 + 아직 그날에 안 들어간 반복 할일(달력에서 그날을 처음 열 때 들어감).
// 시간 있는 것 시간순 → 시간 없는 것(넣은 순). 끝낸 것도 보여 주되 표시만 한다.
export function tomorrowTasks(plans, recurringRules, ds) {
  const day = plans?.[ds] || {};
  const tasks = (day.tasks || []).filter((t) => t?.title?.trim());
  const applied = new Set(day.recurringApplied || []);
  const ids = new Set(tasks.map((t) => String(t.id)));
  const rec = (recurringRules || [])
    .filter((r) => r?.title?.trim() && !applied.has(r.id) && !ids.has(`r${r.id}_${ds}`) && ruleMatches(r, ds))
    .map((r) => ({ id: `r${r.id}_${ds}`, title: r.title, done: false, recurring: true }));
  return [...tasks, ...rec]
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (timeMin(a.t) - timeMin(b.t) || 0) || a.i - b.i)
    .map((x) => x.t);
}
