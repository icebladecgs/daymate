// 반복 할일 규칙 (recurringTasks[].days)
//  "daily"      매일
//  "0"~"6"      매주 해당 요일 (0=일)
//  "nth:N:W"    매월 N번째 W요일 (N=1~4, -1=마지막 주) — 예: "nth:2:2" 매월 둘째 화요일
//  "w:1,3,5"    매주 여러 요일 (2026-11-12, 요일 동그라미) — 다 켜면 "daily", 하나면 "N"으로 저장(옛 앱도 읽게)
// 규칙의 noHoliday: true면 공휴일(대체공휴일·선거일 포함, utils/holidays.js)에는 생기지 않는다.
import { holidayName } from "./holidays.js";

export const NTH_LABELS = { 1: "첫째", 2: "둘째", 3: "셋째", 4: "넷째", "-1": "마지막" };
export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function parseNth(days) {
  const m = /^nth:(-1|[1-4]):([0-6])$/.exec(String(days || ""));
  return m ? { n: Number(m[1]), w: Number(m[2]) } : null;
}

// 매주 반복 요일 목록 (0=일). 매월 n번째면 null.
export function weekdaysOf(days) {
  const s = String(days ?? "");
  if (s === "daily") return [0, 1, 2, 3, 4, 5, 6];
  if (/^[0-6]$/.test(s)) return [Number(s)];
  if (s.startsWith("w:")) return [...new Set(s.slice(2).split(",").filter(x => /^[0-6]$/.test(x)).map(Number))].sort();
  return null;
}

// 요일 목록 → 저장 값
export function daysFromWeekdays(list) {
  const u = [...new Set(list)].filter(w => w >= 0 && w <= 6).sort();
  if (u.length === 7) return "daily";
  if (u.length === 1) return String(u[0]);
  return `w:${u.join(",")}`;
}

// dateStr(YYYY-MM-DD)이 이 반복 규칙에 해당하는지
export function matchesRecurring(days, dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  if (days === "daily") return true;
  if (String(days ?? "").startsWith("w:")) return weekdaysOf(days).includes(d.getDay());
  const nth = parseNth(days);
  if (nth) {
    if (d.getDay() !== nth.w) return false;
    if (nth.n === -1) {
      const next = new Date(d); next.setDate(d.getDate() + 7);
      return next.getMonth() !== d.getMonth(); // 일주일 뒤가 다음 달이면 마지막 주
    }
    return Math.ceil(d.getDate() / 7) === nth.n;
  }
  return String(days) === String(d.getDay());
}

// 규칙 하나가 그날 생기는지 — 요일 + 공휴일 제외. 할일을 넣는 곳·미리보기 모두 이 함수로.
export function ruleMatches(rule, dateStr) {
  if (!rule || !matchesRecurring(rule.days, dateStr)) return false;
  return !(rule.noHoliday && holidayName(dateStr));
}

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월요일부터
function daysLabel(days) {
  const nth = parseNth(days);
  if (nth) return `매월 ${NTH_LABELS[nth.n]} ${WEEKDAY_LABELS[nth.w]}요일`;
  const w = weekdaysOf(days);
  if (!w || !w.length) return "요일 없음";
  const key = w.join(",");
  if (key === "0,1,2,3,4,5,6") return "매일";
  if (key === "1,2,3,4,5") return "평일";
  if (key === "0,6") return "주말";
  if (w.length === 1) return `매주 ${WEEKDAY_LABELS[w[0]]}요일`;
  return `매주 ${ORDER.filter(x => w.includes(x)).map(x => WEEKDAY_LABELS[x]).join("·")}`;
}

export function recurringLabel(days, noHoliday) {
  return daysLabel(days) + (noHoliday ? " · 공휴일 제외" : "");
}

// 반복 할일을 그날 기록에 넣기 (2026-11-03) — 오늘 탭·달력에서 처음 여는 날 모두 이 함수로.
// 그날 아직 넣지 않은 규칙만 넣고, 넣은 규칙 id를 day.recurringApplied에 남긴다 → 사용자가 지운 반복 할일은 다시 생기지 않는다.
// 할일 id는 `r{규칙 id}_{날짜}`로 기기마다 같아서 다른 기기와 합쳐도 겹치지 않는다. 바뀐 게 없으면 null.
export function addRecurringToDay(day, rules, ds) {
  const applied = new Set(day?.recurringApplied || []);
  const due = (rules || []).filter(r => r?.title?.trim() && !applied.has(r.id) && ruleMatches(r, ds));
  if (!due.length) return null;
  const tasks = [...(day?.tasks || [])];
  const ids = new Set(tasks.map(t => String(t.id)));
  for (const r of due) {
    const id = `r${r.id}_${ds}`;
    if (ids.has(id)) continue;
    const t = { id, title: r.title, done: false, checkedAt: null, priority: false, ...(r.cat ? { cat: r.cat } : {}) }; // 반복 할일의 분류를 따라감 (2026-11-13)
    const empty = tasks.findIndex(x => !x.title?.trim());
    if (empty >= 0) tasks[empty] = t; else tasks.push(t);
  }
  return { ...day, tasks, recurringApplied: [...applied, ...due.map(r => r.id)] };
}

// 반복으로 생긴 할일 id(`r{규칙 id}_YYYY-MM-DD`)에서 규칙 id를 꺼낸다 (2026-11-03)
export const recurringIdOf = (taskId) => /^r(.+)_\d{4}-\d{2}-\d{2}$/.exec(String(taskId || ''))?.[1] || null;
