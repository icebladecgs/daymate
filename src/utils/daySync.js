import { store } from "./storage.js";

// 서버 저장이 아직 확인되지 않은 날짜 목록 — 로그인·새로고침 병합 때 이 날짜만 이 기기 할일을 우선한다.
// 데스크탑 포스트잇 창은 서버에 직접 쓰지 않고 여기에 표시만 해 두면, 메인 창이 받아서 서버에 올린다.
export const UNSYNCED_DAYS_KEY = "dm_unsynced_days";

export function markDayUnsynced(dateStr, unsynced) {
  const set = new Set(store.get(UNSYNCED_DAYS_KEY, []));
  if (unsynced === set.has(dateStr)) return;
  if (unsynced) set.add(dateStr); else set.delete(dateStr);
  store.set(UNSYNCED_DAYS_KEY, [...set]);
}

export function isDayUnsynced(dateStr) {
  return store.get(UNSYNCED_DAYS_KEY, []).includes(dateStr);
}
