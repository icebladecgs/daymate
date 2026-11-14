import { displayMemos } from "../components/MemoTimeline.jsx";
import { parseWikiLinks } from "./knowledge.js";
import { toDateStr, addDays } from "./date.js";
import { searchTokens, matchesQuery } from "./searchText.js";

const norm = (s) => (s || "").normalize("NFC").toLowerCase();
const validTime = (t) => (/^\d{1,2}:\d{2}$/.test(t || "") ? t : ""); // 예전 앱이 넣은 "편집됨" 같은 값은 시각이 아님
const firstLine = (s) => (s || "").split("\n").map(l => l.trim()).find(Boolean) || "";
// 제목은 #태그를 빼고 읽는다 — 태그부터 쓰는 메모는 첫 줄이 태그뿐이라 제목이 다 태그명이 됐다.
// [[키워드]]는 문장 속에 쓰므로 괄호만 뺀다. 태그만 있는 메모는 원래 첫 줄 그대로
const TAG_RE = /#[\w가-힣]{2,20}(?:\/[\w가-힣]{2,20})*/g;
const titleLine = (s) => (s || "").split("\n")
  .map(l => l.replace(TAG_RE, " ").replace(/\[\[([^\]]+)\]\]/g, "$1").replace(/\s+/g, " ").trim())
  .find(Boolean) || firstLine(s);

// 메모 관리자에 보여줄 항목 — 메모·일정(할일)·일기를 한 목록으로
// key: 종류|날짜|id (선택 유지용), date: 기록 날짜, time: 작성 시각(메모)·일정 시각(할일)
export function buildManagerItems(plans) {
  const items = [];
  Object.entries(plans || {}).forEach(([ds, d]) => {
    if (!d) return;
    displayMemos(d).forEach(m => {
      if (m.locked) { // 잠긴 메모는 제목·내용 없이 표시만 (검색되지 않음)
        items.push({ key: `memo|${ds}|${m.id}`, kind: "memo", ds, id: m.id, title: "🔒 잠긴 메모", text: "", time: validTime(m.createdAt),
          updatedAt: m.updatedAt || "", starred: !!m.starred, photos: [], tags: [], locked: true, pinned: !!m.pinned });
        return;
      }
      const text = m.text || "";
      items.push({
        key: `memo|${ds}|${m.id}`, kind: "memo", ds, id: m.id,
        title: titleLine(text) || (m.photos?.length ? "(사진 메모)" : "(빈 메모)"),
        text, time: validTime(m.createdAt), updatedAt: m.updatedAt || "",
        starred: !!m.starred, photos: m.photos || [], tags: parseWikiLinks(text),
        color: m.color || "", alarm: m.alarm?.time ? m.alarm : null, pinned: !!m.pinned,
      });
    });
    (d.tasks || []).forEach(t => {
      if (!t.title?.trim()) return;
      items.push({
        key: `task|${ds}|${t.id}`, kind: "task", ds, id: t.id,
        title: t.title.trim(), text: t.note || "", time: t.time || "", updatedAt: "", cat: t.cat || "",
        done: !!t.done, starred: false, photos: t.photos || [], tags: parseWikiLinks(`${t.title} ${t.note || ""}`),
      });
    });
    (d.memoTrash || []).forEach(m => {
      const text = m.text || "";
      items.push({
        key: `trash|${ds}|${m.id}`, kind: "trash", ds, id: m.id,
        title: m.locked ? "🔒 잠긴 메모" : (titleLine(text) || (m.photos?.length ? "(사진 메모)" : "(빈 메모)")),
        text, time: validTime(m.createdAt), updatedAt: m.deletedAt || "",
        starred: false, photos: m.photos || [], tags: [],
      });
    });
    const j = d.journal || {};
    const journalText = [j.body, j.good, j.regret, j.tomorrow].filter(s => s?.trim()).join("\n");
    if (journalText.trim()) {
      items.push({
        key: `journal|${ds}`, kind: "journal", ds, id: "journal",
        title: titleLine(j.body) || titleLine(journalText), text: journalText, time: "", updatedAt: j.savedAt || "",
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
  { id: "photo", label: "사진", icon: "📷" },
  { id: "locked", label: "잠긴 메모", icon: "🔒" },
  { id: "today", label: "오늘", icon: "🕐" },
  { id: "yesterday", label: "어제", icon: "🕐" },
  { id: "d7", label: "최근 일주일", icon: "🕐" },
  { id: "d15", label: "최근 15일", icon: "🕐" },
  { id: "d30", label: "최근 한달", icon: "🕐" },
  { id: "trash", label: "휴지통 (30일 보관)", icon: "🗑" },
];

// 태그 필터 id — "#이름"(태그 하나), "@부모"(#부모/자식 카테고리 전체: #부모 자체와 #부모/… 모두)
const parentOf = (t) => { const i = t.indexOf("/"); return i > 0 ? t.slice(0, i) : null; };
const inGroup = (t, parent) => t === parent || t.startsWith(`${parent}/`);

// ── 태그 배치 (2026-11-14 사용자 결정 — 메모 관리자 PC에서 끌어서 순서·폴더) ──
// 계정 설정 memoTagLayout = { order: [이름…], parents: { 태그: 폴더 } }. 메모 글은 고치지 않는다("보기만 묶기").
// order는 맨 위 줄(태그·📂 묶음)과 묶음 안 줄의 이름 순서(정한 적 없는 새 태그는 뒤에, 많이 쓴 순).
// parents는 글로 쓴 #부모/자식과 같은 모양으로 보이게 하는 표 — 폴더는 한 단계(폴더 안 폴더는 무시).
const MAX_LAYOUT = 500;
export function normalizeTagLayout(x) {
  const order = Array.isArray(x?.order) ? [...new Set(x.order.filter(s => typeof s === "string" && s))].slice(0, MAX_LAYOUT) : [];
  const parents = {};
  if (x?.parents && typeof x.parents === "object" && !Array.isArray(x.parents)) {
    Object.entries(x.parents).slice(0, MAX_LAYOUT).forEach(([k, v]) => { if (k && typeof v === "string" && v && v !== k && !k.includes("/")) parents[k] = v; });
  }
  // 폴더가 된 태그는 다른 폴더에 못 들어간다(한 단계) — 폴더 쪽을 살린다
  const folders = new Set(Object.values(parents));
  Object.keys(parents).forEach(k => { if (folders.has(k)) delete parents[k]; });
  return { order, parents };
}

export const tagMatcher = (filter, layout) => {
  const parents = normalizeTagLayout(layout).parents;
  if (filter.startsWith("@")) { const p = filter.slice(1); return (it) => it.tags.some(t => inGroup(t, p) || parents[t] === p); }
  if (filter.startsWith("#")) { const name = filter.slice(1); return (it) => it.tags.includes(name); }
  return null;
};

// 분류 목록의 태그 영역 (지식 화면의 "내가 만든 태그"·"카테고리별 모아보기"를 옮겨 옴)
// #부모/자식 태그가 하나라도 있으면 부모를 카테고리로 묶고 자식을 아래에 둔다. 개수는 그 태그가 붙은 기록 수
// layout(태그 배치)이 있으면 폴더에 넣은 태그도 그 묶음 아래(mapped), 순서도 그대로
// 반환: [{ type: "group", name, n, children: [{ name, label, n, mapped? }] } | { type: "tag", name, n }]
export function tagTree(items, layout) {
  const { order, parents } = normalizeTagLayout(layout);
  const live = items.filter(it => it.kind !== "trash");
  const count = new Map();
  live.forEach(it => it.tags.forEach(t => count.set(t, (count.get(t) || 0) + 1)));
  const slashParents = new Set([...count.keys()].map(parentOf).filter(Boolean));
  const groups = new Map();
  const entries = [];
  const groupOf = (p) => {
    if (!groups.has(p)) {
      const g = { type: "group", name: p, n: 0, children: [] };
      groups.set(p, g);
      entries.push(g);
    }
    return groups.get(p);
  };
  count.forEach((n, name) => {
    const p = slashParents.has(name) ? name : parentOf(name);
    if (p) { const g = groupOf(p); if (name !== p) g.children.push({ name, label: name.slice(p.length + 1), n }); return; }
    if (parents[name]) return; // 폴더에 넣은 태그 — 아래에서
    entries.push({ type: "tag", name, n });
  });
  // 폴더에 넣은 태그: 폴더 이름이 그냥 태그면 묶음으로 바꾼다, 메모가 없는 폴더 이름도 묶음으로
  Object.entries(parents).forEach(([name, folder]) => {
    if (!count.has(name)) return;
    const i = entries.findIndex(e => e.type === "tag" && e.name === folder);
    if (i >= 0) entries.splice(i, 1);
    groupOf(folder).children.push({ name, label: name, n: count.get(name), mapped: true });
  });
  groups.forEach((g, p) => { g.n = live.filter(it => it.tags.some(t => inGroup(t, p) || parents[t] === p)).length; });
  const rank = new Map(order.map((s, i) => [s, i]));
  const byOrder = (key) => (a, b) => {
    const ra = rank.has(a[key]) ? rank.get(a[key]) : Infinity;
    const rb = rank.has(b[key]) ? rank.get(b[key]) : Infinity;
    if (ra !== rb) return ra - rb;
    return b.n - a.n || a[key].localeCompare(b[key], "ko");
  };
  groups.forEach(g => g.children.sort((a, b) => byOrder("name")(a, b)));
  return entries.sort(byOrder("name"));
}

// 끌어 놓기 판단 — where: "before" | "after" | "into". 놓을 수 없으면 false
// 규칙: 글로 쓴 #부모/자식 줄은 같은 묶음 안에서 순서만. 폴더에는 그냥 태그만 넣는다(묶음·폴더는 못 넣음).
function tagNodes(tree) {
  const m = new Map();
  tree.forEach(e => {
    m.set(e.name, { top: true, group: e.type === "group" });
    if (e.type === "group") e.children.forEach(c => m.set(c.name, { top: false, parent: e.name, mapped: !!c.mapped }));
  });
  return m;
}
export function canDropTag(tree, drag, target, where) {
  if (!drag || !target || drag === target) return false;
  const nodes = tagNodes(tree);
  const d = nodes.get(drag), t = nodes.get(target);
  if (!d || !t) return false;
  const natural = !d.top && !d.mapped; // 글로 쓴 #부모/자식
  const plain = (d.top && !d.group) || d.mapped; // 폴더에 넣을 수 있는 태그
  if (where === "into") return t.top && plain && d.parent !== target;
  if (natural) return !t.top && t.parent === d.parent;
  if (t.top) return true; // 맨 위 줄 사이로 (폴더에 있던 태그는 빠져나옴)
  return plain; // 묶음 안 줄 사이로 = 그 폴더에 넣기
}
// 놓은 결과의 새 배치 (지금 보이는 순서를 모두 order에 적는다 — 그 뒤로는 끈 순서 그대로)
export function dropTag(layout, tree, drag, target, where) {
  if (!canDropTag(tree, drag, target, where)) return normalizeTagLayout(layout);
  const cur = normalizeTagLayout(layout);
  const nodes = tagNodes(tree);
  const d = nodes.get(drag), t = nodes.get(target);
  const parents = { ...cur.parents };
  const full = tree.flatMap(e => (e.type === "group" ? [e.name, ...e.children.map(c => c.name)] : [e.name]));
  let order = full.filter(n => n !== drag);
  if (where === "into") {
    parents[drag] = target;
    delete parents[target];
    const g = tree.find(e => e.name === target);
    const last = g?.type === "group" && g.children.filter(c => c.name !== drag).length ? g.children.filter(c => c.name !== drag).slice(-1)[0].name : target;
    order.splice(order.indexOf(last) + 1, 0, drag);
  } else {
    if (t.top) delete parents[drag];
    else if (d.top || d.mapped) parents[drag] = t.parent;
    // 맨 위 줄 사이에 놓을 때 "뒤"는 그 묶음의 자식들 다음
    let anchor = target;
    if (t.top && where === "after") {
      const g = tree.find(e => e.name === target);
      if (g?.type === "group") { const kids = g.children.filter(c => c.name !== drag); if (kids.length) anchor = kids[kids.length - 1].name; }
    }
    const i = order.indexOf(anchor);
    order.splice(where === "before" ? order.indexOf(target) : i + 1, 0, drag);
  }
  // 폴더에 남은 원래 줄 순서를 지킨다: 묶음이 된 폴더가 원래 다른 이름 사이에 있으면 그대로
  return normalizeTagLayout({ order: [...new Set([...order, ...cur.order.filter(n => !order.includes(n))])].slice(0, MAX_LAYOUT), parents });
}
// 폴더에서 빼기(맨 위 줄 맨 앞으로)
export function takeOutTag(layout, tree, name) {
  const cur = normalizeTagLayout(layout);
  const parents = { ...cur.parents };
  delete parents[name];
  const full = tree.flatMap(e => (e.type === "group" ? [e.name, ...e.children.map(c => c.name)] : [e.name])).filter(n => n !== name);
  return normalizeTagLayout({ order: [name, ...full], parents });
}

// 관련 태그 — 고른 태그(카테고리)가 나온 날에 함께 나온 다른 태그, 많이 겹친 순 (지식 화면의 "관련 키워드"와 같은 기준)
export function relatedTags(items, filter, limit = 8, layout) {
  const match = tagMatcher(filter, layout);
  const lp = normalizeTagLayout(layout).parents;
  if (!match) return [];
  const live = items.filter(it => it.kind !== "trash");
  const days = new Set(live.filter(match).map(it => it.ds));
  const own = filter.startsWith("@") ? (t) => inGroup(t, filter.slice(1)) || lp[t] === filter.slice(1) : (t) => t === filter.slice(1);
  const overlap = new Map(); // 태그 -> 겹친 날짜들
  live.forEach(it => {
    if (!days.has(it.ds)) return;
    it.tags.forEach(t => {
      if (own(t)) return;
      if (!overlap.has(t)) overlap.set(t, new Set());
      overlap.get(t).add(it.ds);
    });
  });
  return [...overlap.entries()].map(([name, ds]) => ({ name, n: ds.size }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "ko")).slice(0, limit);
}

// 🎨 색상 분류 (2026-11-03, 메모잇 참고) — "color:pink"처럼. 포스트잇에서 색을 고른 메모만 (색을 안 고른 메모는 전부 노랑이라 빼 둠)
const colorMatcher = (filter) => (filter.startsWith("color:") ? (it) => it.kind === "memo" && it.color === filter.slice(6) : null);
export function colorCounts(items) {
  const n = {};
  items.forEach(it => { if (it.kind === "memo" && it.color) n[it.color] = (n[it.color] || 0) + 1; });
  return n;
}

// ── 검색 (2026-11-13 사용자 승인) — 띄어쓰기 = 그리고, 초성 검색, 찾은 단어 자리: utils/searchText.js ──
export { choseongOf, searchTokens, highlightTerms, matchesQuery, termRanges } from "./searchText.js";

// 기간 — 새 디자인에서는 왼쪽 분류와 따로 골라 겹쳐 쓴다("업무 + 최근 일주일")
export const PERIOD_FILTERS = [
  { id: "all", label: "전체 기간" },
  { id: "today", label: "오늘" },
  { id: "yesterday", label: "어제" },
  { id: "d7", label: "일주일" },
  { id: "d15", label: "15일" },
  { id: "d30", label: "한달" },
];
export const isPeriodFilter = (id) => PERIOD_FILTERS.some((p) => p.id === id && id !== "all");

// 일정 분류(업무·재무·직접 만든 것) — "cat:work"처럼. 일정은 달력과 같은 기준(it.catId — 화면이 catOf로 채움),
// 메모·일기는 그 분류 이름 태그(#업무)가 붙은 것
export const catMatcher = (filter) => (filter.startsWith("cat:") ? (it) => it.catId === filter.slice(4) : null);
export function itemCatId(it, cats, catOfTask) {
  if (it.kind === "task") return catOfTask(it) || "";
  const hit = cats.find((c) => it.tags.includes(c.name));
  return hit ? hit.id : "";
}

// stickyKeys: 데스크탑 앱에서 지금 포스트잇으로 띄워 둔 메모("날짜|id"). period: 기간(새 디자인 칩 줄, 기본 전체)
export function filterItems(items, filter, query, today = toDateStr(), stickyKeys = null, period = "all", tagLayout = null) {
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
    locked: (it) => !!it.locked,
    sticky: (it) => it.kind === "memo" && !!stickyKeys?.has(`${it.ds}|${it.id}`),
    today: (it) => it.ds === today,
    yesterday: (it) => it.ds === addDays(today, -1),
    d7: recent(7),
    d15: recent(15),
    d30: recent(30),
    trash: () => true,
  };
  const pick = byFilter[filter] || colorMatcher(filter) || catMatcher(filter) || tagMatcher(filter, tagLayout) || (() => true);
  const byPeriod = period && period !== "all" && byFilter[period] ? byFilter[period] : () => true;
  const tokens = searchTokens(query);
  // 휴지통 항목은 휴지통 보기에서만, 다른 보기에서는 제외
  const inView = (it) => (filter === "trash" ? it.kind === "trash" : it.kind !== "trash");
  return items.filter(it => inView(it) && pick(it) && byPeriod(it) && matchesQuery(`${it.title}\n${it.text}`, tokens));
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
    // 📍 고정한 메모는 어떤 정렬이든 맨 위 (2026-11-13)
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
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
