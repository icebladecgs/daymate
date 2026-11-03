// 알람 (2026-11-03, 메모잇 참고) — 시간 정한 할일 알림과 메모(포스트잇) 알람을 한 곳에서 계산한다.
// 앱(데스크탑 메인 창·열려 있는 앱)이 30초마다 "지금 울릴 것"을 확인한다 — 한 번 예약하는 방식은
// PC 절전에서 깨어나면 늦거나 빠졌다. 놓친 알람은 10분 안이면 늦게라도 울린다.
// 휴대폰은 앱이 꺼져 있으면 울리지 않는다(할일은 구글 캘린더 알림으로, CLAUDE.md 14.7).
import { store } from "./storage.js";

export const ALARM_REPEATS = [
  { id: "once", label: "한 번" },
  { id: "daily", label: "매일" },
  { id: "weekdays", label: "평일" },
  { id: "weekly", label: "매주" },
];
const WD = "일월화수목금토";
const LATE_MIN = 10; // 이만큼 지난 알람까지는 늦게라도 울린다

const toMin = (hhmm) => { const [h, m] = String(hhmm || "").split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
const dayOf = (ds) => new Date(`${ds}T00:00:00`).getDay();

// 이 알람이 ds 날짜에 울리는지
export function alarmOccursOn(alarm, ds) {
  if (!alarm?.time) return false;
  const base = alarm.date || ds;
  if (ds < base) return false;
  if (alarm.repeat === "daily") return true;
  if (alarm.repeat === "weekdays") { const d = dayOf(ds); return d >= 1 && d <= 5; }
  if (alarm.repeat === "weekly") return dayOf(ds) === dayOf(base);
  return ds === base; // 한 번
}

// "오늘 15:00" · "매일 15:00" · "매주 수 15:00"
export function alarmLabel(alarm, todayStr) {
  if (!alarm?.time) return "";
  if (alarm.repeat === "daily") return `매일 ${alarm.time}`;
  if (alarm.repeat === "weekdays") return `평일 ${alarm.time}`;
  if (alarm.repeat === "weekly") return `매주 ${WD[dayOf(alarm.date || todayStr)]} ${alarm.time}`;
  if (!alarm.date || alarm.date === todayStr) return `오늘 ${alarm.time}`;
  const d = new Date(`${alarm.date}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]}) ${alarm.time}`;
}

// 한 번 울리는 알람을 정할 때 날짜 — 그 시각이 오늘 이미 지났으면 내일
export function nextOnceDate(time, now = new Date()) {
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const m = toMin(time);
  const d = new Date(now);
  if (m != null && m <= now.getHours() * 60 + now.getMinutes()) d.setDate(d.getDate() + 1);
  return ymd(d);
}

// 날짜 기록 전체에서 알람이 걸린 메모 — 잠긴 메모는 내용을 알 수 없어 "잠긴 메모"로
export function collectMemoAlarms(plans) {
  const out = [];
  for (const [ds, day] of Object.entries(plans || {})) {
    for (const m of day?.memos || []) {
      if (!m?.alarm?.time || m.alarm.off) continue;
      const first = (m.text || "").split("\n").find(l => l.trim())?.trim() || "";
      out.push({ ds, id: m.id, alarm: m.alarm, text: m.locked ? "🔒 잠긴 메모" : (first.slice(0, 60) || "메모") });
    }
  }
  return out;
}

// 지금 울릴 알람 — fired: { key: 울린 시각 } (같은 알람은 한 번만)
// tasks: 오늘 할일, lead: 할일 알림을 몇 분 전에 (null이면 할일 알림 끔)
export function dueAlarms({ memoAlarms = [], tasks = [], lead = 0, todayStr, now = new Date(), fired = {} }) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const due = [];
  const check = (key, targetMin, item) => {
    if (targetMin == null || fired[key]) return;
    if (nowMin >= targetMin && nowMin - targetMin <= LATE_MIN) due.push({ key, ...item });
  };
  if (lead != null) {
    for (const t of tasks) {
      if (!t?.title?.trim() || !t.time || t.done) continue;
      const m = toMin(t.time);
      check(`task:${t.id}@${todayStr}T${t.time}-${lead}`, m == null ? null : m - lead, {
        kind: "task", title: lead ? `DayMate ⏰ ${lead}분 뒤` : "DayMate ⏰", body: `${t.time} ${t.title}`, ds: todayStr, id: t.id,
      });
    }
  }
  for (const a of memoAlarms) {
    if (!alarmOccursOn(a.alarm, todayStr)) continue;
    check(`memo:${a.ds}:${a.id}@${todayStr}T${a.alarm.time}`, toMin(a.alarm.time), {
      kind: "memo", title: "DayMate 📝 메모 알람", body: a.text, ds: a.ds, id: a.id,
    });
  }
  return due;
}

// 할일 알림 — 기기마다: 'off' | 0(정각) | 5 | 10 (기본 정각, 예전과 같음)
const LEAD_KEY = "dm_task_alarm_lead";
export const taskAlarmLead = () => { const v = store.get(LEAD_KEY, 0); return v === "off" ? null : (Number(v) || 0); };
export const setTaskAlarmLead = (v) => store.set(LEAD_KEY, v);

// 울린 기록 (기기마다, 이틀 지난 것은 지움)
const FIRED_KEY = "dm_alarm_fired";
export const loadFired = () => { const v = store.get(FIRED_KEY, {}); return v && typeof v === "object" ? v : {}; };
export function saveFired(map, now = Date.now()) {
  const keep = {};
  for (const [k, at] of Object.entries(map)) if (now - at < 2 * 86400000) keep[k] = at;
  store.set(FIRED_KEY, keep);
  return keep;
}
