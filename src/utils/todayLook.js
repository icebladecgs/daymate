import { store } from "./storage.js";

// 오늘 탭 새 화면(2026-10-30 1단계: 큰 할 일 글씨·지금 할 일을 목록 첫 줄로·조용한 버튼·분 단위 시계).
// 기기마다 켜고 끔(기본 켜짐) — 설정 → 앱 관리 → 오늘 화면. 끄면 예전 화면 그대로.
const KEY = "dm_today_new_look";
export const todayNewLookOn = () => store.get(KEY, true) !== false;
export const setTodayNewLook = (on) => store.set(KEY, !!on);
