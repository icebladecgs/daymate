import { store } from "./storage.js";

// 오늘 탭 새 화면(2026-10-30 1단계: 큰 할 일 글씨·지금 할 일을 목록 첫 줄로·조용한 버튼·분 단위 시계,
// 이어서 시간순 정렬·완료 모으기). 기기마다 켜고 끔(기본 켜짐) — 설정 → 앱 관리 → 오늘 화면. 끄면 예전 화면 그대로.
const KEY = "dm_today_new_look";
export const todayNewLookOn = () => store.get(KEY, true) !== false;
export const setTodayNewLook = (on) => store.set(KEY, !!on);

// 새 화면에서 끝낸 할 일을 아래 "완료 n" 묶음으로 모으기 (끄면 제자리에 남음)
const DONE_KEY = "dm_today_done_group";
export const todayDoneGroupOn = () => store.get(DONE_KEY, true) !== false;
export const setTodayDoneGroup = (on) => store.set(DONE_KEY, !!on);
