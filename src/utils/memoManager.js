import { displayMemos } from "../components/MemoTimeline.jsx";
import { parseWikiLinks } from "./knowledge.js";
import { toDateStr, addDays } from "./date.js";

const norm = (s) => (s || "").normalize("NFC").toLowerCase();
const validTime = (t) => (/^\d{1,2}:\d{2}$/.test(t || "") ? t : ""); // 예전 앱이 넣은 "편집됨" 같은 값은 시각이 아님
const firstLine = (s) => (s || "").split("\n").map(l => l.trim()).find(Boolean) || "";

// 메모 관리자에 보여줄 항목 — 메모·일정(할일)·일기를 한 목록으로
// key: 종류|날짜|id (선택 유지용), date: 기록 날짜, time: 작성 시각(메모)·일정 시각(할일)
export function buildManagerItems(plans) {
  const items = [];
  Object.entries(plans || {}).forEach(([ds, d]) => {
    if (!d) return;
    displayMemos(d).forEach(m => {
      const text = m.text || "";
      items.push({
        key: `memo|${ds}|${m.id}`, kind: "memo", ds, id: m.id,
        title: firstLine(text) || (m.photos?.length ? "(사진 메모)" : "(빈 메모)"),
        text, time: validTime(m.createdAt), updatedAt: m.updatedAt || "",
        starred: !!m.starred, photos: m.photos || [], tags: parseWikiLinks(text),
      });
    });
    (d.tasks || []).forEach(t => {
      if (!t.title?.trim()) return;
      items.push({
        key: `task|${ds}|${t.id}`, kind: "task", ds, id: t.id,
        title: t.title.trim(), text: t.note || "", time: t.time || "", updatedAt: "",
        done: !!t.done, starred: false, photos: t.photos || [], tags: parseWikiLinks(`${t.title} ${t.note || ""}`),
      });
    });
    const j = d.journal || {};
    const journalText = [j.body, j.good, j.regret, j.tomorrow].filter(s => s?.trim()).join("\n");
    if (journalText.trim()) {
      items.push({
        key: `journal|${ds}`, kind: "journal", ds, id: "journal",
        title: firstLine(j.body) || firstLine(journalText), text: journalText, time: "", updatedAt: j.savedAt || "",
        starred: false, photos: [], tags: parseWikiLinks(journalText),
      });
    }
  });
  return items;
}

// 왼쪽 필터 목록 — 메모잇의 "전체·오늘·최근 일주일…" 구성을 따름. 태그는 메모잇의 "그룹" 역할
export const BASE_FILTERS = [
  { id: "all", label: "전체", icon: "📁" },
  { id: "memo", label: "메모", icon: "📝" },
  { id: "task", label: "일정", icon: "📅" },
  { id: "journal", label: "일기", icon: "📖" },
  { id: "starred", label: "즐겨찾기", icon: "⭐" },
  { id: "photo", label: "사진 있음", icon: "📷" },
  { id: "today", label: "오늘", icon: "🕐" },
  { id: "yesterday", label: "어제", icon: "🕐" },
  { id: "d7", label: "최근 일주일", icon: "🕐" },
  { id: "d15", label: "최근 15일", icon: "🕐" },
  { id: "d30", label: "최근 한달", icon: "🕐" },
];

export function topTags(items, limit = 30) {
  const count = new Map();
  items.forEach(it => it.tags.forEach(t => count.set(t, (count.get(t) || 0) + 1)));
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, n]) => ({ name, n }));
}

export function filterItems(items, filter, query, today = toDateStr()) {
  const recent = (days) => {
    const from = addDays(today, -(days - 1));
    return (it) => it.ds >= from && it.ds <= today;
  };
  const byFilter = {
    all: () => true,
    memo: (it) => it.kind === "memo",
    task: (it) => it.kind === "task",
    journal: (it) => it.kind === "journal",
    starred: (it) => it.starred,
    photo: (it) => it.photos.length > 0,
    today: (it) => it.ds === today,
    yesterday: (it) => it.ds === addDays(today, -1),
    d7: recent(7),
    d15: recent(15),
    d30: recent(30),
  }[filter] || ((it) => it.tags.includes(filter.replace(/^#/, "")));
  const q = norm(query.trim());
  return items.filter(it => byFilter(it) && (!q || norm(`${it.title}\n${it.text}`).includes(q)));
}

const SORTERS = {
  kind: (it) => it.kind,
  title: (it) => it.title,
  date: (it) => `${it.ds} ${it.time || "00:00"}`,
  updated: (it) => it.updatedAt || "",
  photo: (it) => String(it.photos.length).padStart(3, "0"),
};

// 날짜 최신순일 때 앞으로의 일정(오늘 이후 날짜)은 오늘까지의 기록 아래로 — 안 그러면 다음 달 일정이
// 목록 맨 위를 차지해 오늘 쓴 메모가 한참 아래로 밀린다. 아래쪽 일정은 가까운 날짜부터
export function sortItems(items, { key, dir }, today = toDateStr()) {
  const get = SORTERS[key] || SORTERS.date;
  const sign = dir === "asc" ? 1 : -1;
  const futureLast = key === "date" && dir === "desc";
  return [...items].sort((a, b) => {
    if (futureLast) {
      const fa = a.ds > today ? 1 : 0;
      const fb = b.ds > today ? 1 : 0;
      if (fa !== fb) return fa - fb;
      if (fa) return SORTERS.date(a).localeCompare(SORTERS.date(b)); // 앞으로의 일정은 가까운 날부터
    }
    const r = get(a).localeCompare(get(b), "ko");
    if (r) return r * sign;
    return SORTERS.date(b).localeCompare(SORTERS.date(a)); // 같으면 최신 날짜 먼저
  });
}
