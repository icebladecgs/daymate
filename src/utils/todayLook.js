import { store } from "./storage.js";

// 새 디자인 — 오늘 탭(2026-10-30 1·2단계)에서 시작해 다른 탭으로 넓혀 가는 중(My 탭 2026-10-30).
// 기기마다 켜고 끔(기본 켜짐) — 설정 → 앱 관리 → 새 디자인. 끄면 예전 화면 그대로.
// 저장 키는 처음 이름(dm_today_new_look)을 그대로 쓴다 — 이미 끈 사람의 선택을 유지하려고.
const KEY = "dm_today_new_look";
export const todayNewLookOn = () => store.get(KEY, true) !== false;
export const newDesignOn = todayNewLookOn;
// 새 디자인 색(2026-11-08, 아이폰 미리알림 방식 D안)은 index.css의 [data-look="new"]에 있다 — 스위치를 따라 html에 표시를 단다
const markLook = () => { try { document.documentElement.setAttribute("data-look", todayNewLookOn() ? "new" : "old"); } catch { /* 문서 없음(서버·테스트) */ } };
markLook();
export const setTodayNewLook = (on) => { store.set(KEY, !!on); markLook(); };

// 새 화면에서 끝낸 할 일을 아래 "완료 n" 묶음으로 모으기 (끄면 제자리에 남음)
const DONE_KEY = "dm_today_done_group";
export const todayDoneGroupOn = () => store.get(DONE_KEY, true) !== false;
export const setTodayDoneGroup = (on) => store.set(DONE_KEY, !!on);

// 오늘 탭에서 안 쓰는 칸 숨기기 (2026-11-03, 기기마다) — 설정 → 앱 관리 → 오늘 탭에 보일 칸
const HIDDEN_KEY = "dm_today_hidden";
export const TODAY_SECTIONS = [
  { id: "weather", label: "🌤 날씨" },
  { id: "people", label: "💌 오늘 챙길 사람" },
  { id: "upcoming", label: "📌 다가오는 날" },
  { id: "habits", label: "💪 오늘의 습관" },
  { id: "someday", label: "📋 언젠가할일" },
  { id: "weekly", label: "📅 주간 일정" },
  { id: "onthisday", label: "🕰 1년 전 오늘" },
];
export const todayHiddenSections = () => { const v = store.get(HIDDEN_KEY, {}); return v && typeof v === "object" ? v : {}; };
export const setTodayHiddenSection = (id, hidden) => store.set(HIDDEN_KEY, { ...todayHiddenSections(), [id]: !!hidden });

// 오늘 탭 칸 순서 바꾸기 (2026-11-05, 기기마다) — 머리글·날씨·할일은 위에 고정. 하루 마무리 카드는 일기에 붙어 다닌다.
const ORDER_KEY = "dm_today_order";
export const TODAY_ORDER_SECTIONS = [
  { id: "people", label: "💌 오늘 챙길 사람" },
  { id: "upcoming", label: "📌 다가오는 날" },
  { id: "habits", label: "💪 오늘의 습관" },
  { id: "someday", label: "📋 언젠가할일" },
  { id: "weekly", label: "📅 주간 일정" },
  { id: "onthisday", label: "🕰 1년 전 오늘" },
  { id: "journal", label: "📖 일기" },
];
const ORDER_IDS = TODAY_ORDER_SECTIONS.map((x) => x.id);
// 저장값에 없는 칸(새로 생긴 칸)은 원래 자리 뒤로 붙인다
export const todaySectionOrder = () => {
  const v = store.get(ORDER_KEY, null);
  const saved = Array.isArray(v) ? v.filter((id, i) => ORDER_IDS.includes(id) && v.indexOf(id) === i) : [];
  return [...saved, ...ORDER_IDS.filter((id) => !saved.includes(id))];
};
export const moveTodaySection = (id, dir) => {
  const list = todaySectionOrder();
  const at = list.indexOf(id), to = at + dir;
  if (at < 0 || to < 0 || to >= list.length) return list;
  [list[at], list[to]] = [list[to], list[at]];
  store.set(ORDER_KEY, list);
  return list;
};
