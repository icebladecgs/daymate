import { store } from '../utils/storage.js';

export const CHECK_TIMES = ["07:30", "12:00", "18:00", "22:00"];

export const newDay = (date) => ({
  date,
  tasks: [
    { id: "t1", title: "", done: false, checkedAt: null, priority: false },
    { id: "t2", title: "", done: false, checkedAt: null, priority: false },
    { id: "t3", title: "", done: false, checkedAt: null, priority: false },
  ],
  checks: { "07:30": false, "12:00": false, "18:00": false, "22:00": false },
  journal: { body: "", savedAt: null },
  memo: "",
  habitChecks: {},
});

export function dayKey(dateStr) {
  return `dm_day_${dateStr}`;
}

export function loadDay(dateStr) {
  return store.get(dayKey(dateStr), null);
}

export function saveDay(dateStr, data) {
  store.set(dayKey(dateStr), data);
}

export function listAllDays() {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith("dm_day_"))
      .map((k) => k.replace("dm_day_", ""))
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}
