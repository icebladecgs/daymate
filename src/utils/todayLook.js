import { store } from "./storage.js";

// 새 디자인 — 오늘 탭(2026-10-30 1·2단계)에서 시작해 다른 탭으로 넓혀 가는 중(My 탭 2026-10-30).
// 기기마다 켜고 끔(기본 켜짐) — 설정 → 앱 관리 → 새 디자인. 끄면 예전 화면 그대로.
// 저장 키는 처음 이름(dm_today_new_look)을 그대로 쓴다 — 이미 끈 사람의 선택을 유지하려고.
const KEY = "dm_today_new_look";
export const todayNewLookOn = () => store.get(KEY, true) !== false;
export const newDesignOn = todayNewLookOn;
export const setTodayNewLook = (on) => store.set(KEY, !!on);

// 새 화면에서 끝낸 할 일을 아래 "완료 n" 묶음으로 모으기 (끄면 제자리에 남음)
const DONE_KEY = "dm_today_done_group";
export const todayDoneGroupOn = () => store.get(DONE_KEY, true) !== false;
export const setTodayDoneGroup = (on) => store.set(DONE_KEY, !!on);
