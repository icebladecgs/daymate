// 출퇴근 시간 (2026-11-06) — 계정 설정 workHours = { start, end } (App.jsx가 동기화, 설정 → 앱 관리)
// 하루 흐름에 맞춰 뜨는 것들의 기준: 아침 계획 카드, 퇴근 전 체크, 하루 마무리, 오늘 양 경고, 알림 "퇴근 전"
import { holidayName } from "./holidays.js";

export const DEFAULT_WORK_HOURS = { start: "09:00", end: "18:00" };

export const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function normalizeWorkHours(x) {
  const s = toMin(x?.start), e = toMin(x?.end);
  if (s == null || e == null || e <= s) return DEFAULT_WORK_HOURS;
  return { start: x.start, end: x.end };
}

// 평일이고 공휴일이 아닌 날 — 퇴근 전 체크·오늘 양 경고는 이런 날만
export function isWorkday(ds) {
  const d = new Date(`${ds}T00:00:00`).getDay();
  return d >= 1 && d <= 5 && !holidayName(ds);
}

// 아침 계획 카드가 보이는 끝 — 정오, 늦게 출근하면 출근 3시간 뒤까지
export const planUntilMin = (wh) => Math.max(12 * 60, toMin(normalizeWorkHours(wh).start) + 180);

// 퇴근 전 체크는 퇴근 30분 전부터
export const leaveCheckFrom = (wh) => toMin(normalizeWorkHours(wh).end) - 30;

// 하루 마무리(일기)는 자기 전 — 21시, 늦게 퇴근하면 퇴근 1시간 뒤. 일요일 "이번 주 돌아보기"는 일을 안 하는 날이라 18시부터
export function wrapFromMin(wh, ds) {
  if (new Date(`${ds}T00:00:00`).getDay() === 0) return 18 * 60;
  return Math.max(21 * 60, toMin(normalizeWorkHours(wh).end) + 60);
}

// 오늘 양 — 근무 시간 안에 잡힌 일의 시간을 더한다. 끝 시간이 없으면 "지금 할 일"과 같게 최대 1시간(다음 일이 먼저면 거기까지).
// 저녁 약속처럼 근무 시간 밖의 일은 세지 않는다. 겹친 일은 각각 센다(같은 시간에 둘 다 할 수는 없으므로).
export function workload(tasks, wh) {
  const { start, end } = normalizeWorkHours(wh);
  const ws = toMin(start), we = toMin(end);
  const timed = (tasks || [])
    .filter((t) => t?.title?.trim() && toMin(t.time) != null)
    .map((t) => ({ s: toMin(t.time), e: toMin(t.endTime) }))
    .sort((a, b) => a.s - b.s);
  let planned = 0;
  timed.forEach((x, i) => {
    const next = timed.slice(i + 1).find((y) => y.s > x.s)?.s;
    const stop = x.e != null && x.e > x.s ? x.e : Math.min(next ?? Infinity, x.s + 60);
    planned += Math.max(0, Math.min(stop, we) - Math.max(x.s, ws));
  });
  return { planned, work: we - ws, over: planned > we - ws };
}
