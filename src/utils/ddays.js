// 직접 넣는 D-day (2026-11-05) — 계정 설정 ddays = [{ id, title, date }] (App.jsx가 동기화)
// 오늘 탭 "다가오는 날"은 이 목록과 내 사람들의 생일·기념일을 합쳐 가까운 순으로 보여 준다.
import { getUpcomingDays } from "../data/contacts.js";
import { addDays } from "./date.js";
import { daysUntil } from "./exam.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const normalizeDdays = (x) => (Array.isArray(x) ? x.filter((d) => d && d.id && d.title && DATE_RE.test(d.date)) : []);

export const newDday = (title, date) => ({ id: `dd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, title: title.trim(), date });

// 직접 넣은 것은 멀어도 보여 주고, 지난 것은 숨긴다(지우지는 않음).
// 사람의 생일·기념일은 excludeWithin일까지 "오늘 챙길 사람" 칸에 이미 보이므로 뺀다.
export function buildUpcomingDays(contacts, ddays, todayStr, { excludeWithin = 7 } = {}) {
  const mine = normalizeDdays(ddays)
    .map((d) => ({ key: d.id, kind: "dday", id: d.id, title: d.title, date: d.date, dday: daysUntil(d.date, todayStr) }))
    .filter((d) => d.dday >= 0);
  const people = getUpcomingDays(contacts, todayStr, { excludeWithin }).map((ev, i) => ({
    key: `${ev.contactId}_${ev.type}_${ev.label}_${i}`, kind: "person", title: `${ev.name}님 ${ev.label}`,
    date: addDays(todayStr, ev.dday), dday: ev.dday,
  }));
  return [...mine, ...people].sort((a, b) => a.dday - b.dday);
}

// 지난 D-day — 최근 것부터 (다가오는 날 칸 아래 "지난 D-day"에서 고치거나 지운다)
export function pastDdays(ddays, todayStr) {
  return normalizeDdays(ddays)
    .map((d) => ({ key: d.id, kind: "dday", id: d.id, title: d.title, date: d.date, dday: daysUntil(d.date, todayStr) }))
    .filter((d) => d.dday < 0)
    .sort((a, b) => b.dday - a.dday);
}

export function ddayDateLabel(date, todayStr) {
  const [y, m, d] = date.split("-").map(Number);
  return y === Number(todayStr.slice(0, 4)) ? `${m}/${d}` : `${y}.${m}.${d}`;
}
