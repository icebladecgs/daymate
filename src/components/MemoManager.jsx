import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PhotoGallery from "./PhotoGallery.jsx";
import PhotoViewer from "./PhotoViewer.jsx";
import PhotoWall from "./PhotoWall.jsx";
import { deletePhoto, uploadPhoto } from "../firebase.js";
import { compressImage, photoErrorMessage } from "../utils/image.js";
import { genMemoId, getMemoTimeStr, withMemoList } from "./MemoTimeline.jsx";
import { buildManagerItems, BASE_FILTERS, tagTree, relatedTags, filterItems, sortItems, colorCounts, PERIOD_FILTERS, isPeriodFilter, itemCatId, highlightTerms, termRanges } from "../utils/memoManager.js";
import { allCats, catOf } from "../utils/taskCategory.js";
import { STICKY_COLORS } from "../utils/stickyColors.js";
import { restoreMemoFromTrash } from "../utils/dayMerge.js";
import { pickTaskTitle, sendMemoToSomeday, sendMemoToToday, sentLabel } from "../utils/memoToTask.js";
import LoginNotice from "./LoginNotice.jsx";
import { canAutoFocus } from "../utils/device.js";
import { toDateStr, formatKoreanDate } from "../utils/date.js";
import { handleEditorKey } from "../utils/editorAssist.js";
import { printMemo } from "../utils/printMemo.js";
import { requestMemoLock } from "../utils/memoLock.js";
import MemoSettings from "./MemoSettings.jsx";
import Toast from "./Toast.jsx";
import MemoView from "./MemoView.jsx";
import { toggleCheckAt } from "../utils/memoView.js";
import { openLinkOnCtrlClick } from "../utils/links.js";
import { MemoLinks } from "./DriveFiles.jsx";
import LinkOverlay from "./LinkOverlay.jsx";
import IndentBar from "./IndentBar.jsx";
import { newDesignOn } from "../utils/todayLook.js";
import UndoBar from "./UndoBar.jsx";
import { useUndo } from "../utils/useUndo.js";
import { useAiTidy } from "./AiTidy.jsx";
import Splitter from "./Splitter.jsx";
import TagSuggest from "./TagSuggest.jsx";
import MemoHistorySheet from "./MemoHistorySheet.jsx";
import TemplateRow from "./TemplateRow.jsx";
import { addUserTemplate, getUserTemplates, setUserTemplates } from "../utils/memoTemplates.js";
import { useBackClose } from "../utils/useBackClose.js";

const KIND = {
  memo: { icon: "📝", label: "메모", color: "var(--dm-accent, #6C8EFF)" },
  task: { icon: "📅", label: "일정", color: "#4ADE80" },
  journal: { icon: "📖", label: "일기", color: "#A78BFA" },
  trash: { icon: "🗑", label: "휴지통", color: "#F87171" },
};
const PAGE = 300;
const ACCENT = (nl) => (nl ? "var(--dm-accent, #5B7CFA)" : "var(--dm-accent, #6C8EFF)"); // 새 디자인: 밝은·어두운 화면 둘 다 보이는 파랑

// 찾은 단어 노란 표시 (목록 제목) — utils/memoManager.js termRanges
const HL_BG = "rgba(250,204,21,.45)";
const markTerms = (text, terms) => {
  const ranges = termRanges(text, terms);
  if (!ranges.length) return text;
  const out = [];
  let at = 0;
  ranges.forEach((r, i) => {
    out.push(text.slice(at, r.start));
    out.push(<mark key={i} style={{ background: HL_BG, color: "inherit", borderRadius: 3, padding: 0 }}>{text.slice(r.start, r.end)}</mark>);
    at = r.end;
  });
  out.push(text.slice(at));
  return out;
};

const fmtUpdated = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// 날짜 문서의 메모 목록을 id로 수정 — 레거시 단일 memo만 있는 날은 id 'legacy' 그대로 목록으로 옮긴다
const updateMemoIn = (day, id, patch) => {
  const list = day?.memos?.length ? day.memos : (day?.memo?.trim() ? [{ id: "legacy", text: day.memo.trim(), createdAt: "" }] : withMemoList(day));
  return { ...day, memos: list.map(m => (m.id === id ? { ...m, ...patch } : m)) };
};

// 메모잇 "메모관리자"를 본뜬 PC용 관리 화면 — 왼쪽 필터 / 오른쪽 위 목록 / 오른쪽 아래 바로 편집.
// 좁은 창(휴대폰·데스크탑 앱 기본 창)에서는 필터를 가로 칩으로, 목록·편집을 위아래로 배치한다.
// 알림은 이 화면 안에 직접 그린다 — 앱 화면(zIndex 1) 위에 덮인 창이라 앱의 알림이 보이지 않았다(2026-10-08)
export default function MemoManager({ plans, onUpdateDayData, uid, catCtx = null, onClose, onOpenDate, onRequireLogin, scaleControl = null, zoom = 1 }) {
  const [toast, setToast] = useState("");
  // 새 디자인(2026-11-01): 글씨 12~13px → 14~16px, 버튼·줄 높이 크게. 배치는 그대로
  const [nl] = useState(newDesignOn);
  const z = (oldV, newV) => (nl ? newV : oldV);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  // 메모 탭 "📍 고정한 메모"에서 눌러 열었으면 그 메모를 골라 둔다 (한 번 읽고 지움, 2026-11-13)
  const [selectedKey, setSelectedKey] = useState(() => {
    try { const k = sessionStorage.getItem("dm_mm_select"); sessionStorage.removeItem("dm_mm_select"); return k || null; } catch { return null; }
  });
  const [limit, setLimit] = useState(PAGE);
  const [tagsOpen, setTagsOpen] = useState(false); // 좁은 화면: 태그 칩 묶음 펼침
  const [showSettings, setShowSettings] = useState(false); // ⚙️ 메모 설정
  // ⤢ 크게: 목록을 접고 편집 칸을 넓게 / 👁 보기: 읽기 좋게 그린 화면 (둘 다 기본 꺼짐 — 지금처럼 바로 고치는 방식이 기본)
  const [big, setBig] = useState(false);
  const [viewMode, setViewMode] = useState(false);
  // 휴대폰(새 디자인): 목록이 화면 전체 → 줄을 누르면 그 자리에서 내용 미리보기 → [편집]을 누르면 편집 화면 전체 (2026-11-14 사용자 결정)
  const [mEdit, setMEdit] = useState(false);
  const [pvPhotos, setPvPhotos] = useState(null); // 미리보기 사진 크게 {photos, index}
  const [pvMenu, setPvMenu] = useState(false); // 미리보기 ⋯
  const [wide, setWide] = useState(() => window.innerWidth >= 900);
  const hit = nl && !wide ? "dm-hit" : undefined; // 모양·배치는 그대로, 누르는 범위만 40px
  // 칸 크기 직접 바꾸기 (2026-11-13 사용자 요청, 새 디자인) — 왼쪽 분류 폭(PC)·목록/편집 높이 비율. 기기마다 dm_mm_split
  const SPLIT_DEF = { w: 220, hWide: 0.45, hNarrow: 0.4 };
  const [split, setSplit] = useState(() => {
    try { return { ...SPLIT_DEF, ...JSON.parse(localStorage.getItem("dm_mm_split") || "{}") }; } catch { return SPLIT_DEF; }
  });
  const splitRef = useRef(split);
  splitRef.current = split;
  const saveSplit = () => { try { localStorage.setItem("dm_mm_split", JSON.stringify(splitRef.current)); } catch { /* 무시 */ } };
  const resetSplit = (keys) => setSplit(s => { const n = { ...s }; keys.forEach(k => { n[k] = SPLIT_DEF[k]; }); splitRef.current = n; saveSplit(); return n; });
  const leftRef = useRef(null);
  const colRef = useRef(null);
  const dragLeft = (clientX) => {
    const el = leftRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const scale = r.width / (splitRef.current.w || 1); // 화면 확대(zoom) 때문에 보이는 크기와 CSS 크기가 다르다
    const w = Math.round(Math.min(420, Math.max(150, (clientX - r.left) / (scale || 1))));
    setSplit(s => ({ ...s, w }));
  };
  const dragList = (clientY) => {
    const el = colRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.height < 1) return;
    const scale = r.height / (el.offsetHeight || r.height);
    const minList = 90 * scale, minDetail = 170 * scale; // 목록 2줄쯤·편집 4줄쯤은 남긴다
    const y = Math.min(r.height - minDetail, Math.max(minList, clientY - r.top));
    const f = Math.min(0.85, Math.max(0.08, y / r.height));
    setSplit(s => ({ ...s, [wide ? "hWide" : "hNarrow"]: f }));
  };
  const listFrac = wide ? split.hWide : split.hNarrow;
  // 목록 칸 폭 — 분류 칸을 넓히거나 화면을 키워 좁아지면 수정일·태그 칸을 빼고 태그는 제목 뒤에 (제목 칸이 0이 되던 문제)
  const [paneW, setPaneW] = useState(9999);
  useEffect(() => {
    const el = colRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setPaneW(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const cols = wide && (!nl || paneW >= 720);
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 일정 분류(업무·재무·직접 만든 것, 2026-11-13) — 일정은 달력과 같은 기준(catOf), 메모·일기는 그 이름 태그(#업무)
  const cats = useMemo(() => allCats(catCtx?.taskCats), [catCtx?.taskCats]);
  const items = useMemo(() => {
    const built = buildManagerItems(plans);
    if (!catCtx) return built;
    const ofTask = (it) => catOf({ title: it.title, time: it.time, cat: it.cat }, it.ds, catCtx.taskCats, catCtx.workHours);
    return built.map(it => (it.kind === "trash" ? it : { ...it, catId: itemCatId(it, cats, ofTask) }));
  }, [plans, catCtx, cats]);
  const catCounts = useMemo(() => {
    const n = {};
    items.forEach(it => { if (it.catId && it.kind !== "trash") n[it.catId] = (n[it.catId] || 0) + 1; });
    return n;
  }, [items]);
  const [period, setPeriod] = useState("all"); // 기간 — 새 디자인은 분류와 따로 고른다
  const tags = useMemo(() => tagTree(items), [items]);
  // #태그 자동완성용 — 많이 쓴 순서의 태그 이름 (#부모/자식은 그대로)
  const tagNames = useMemo(() => tags.flatMap(e => (e.type === "group" ? [{ name: e.name, n: e.n }, ...e.children.map(c => ({ name: c.name, n: c.n }))] : [e]))
    .sort((a, b) => b.n - a.n).map(e => e.name), [tags]);
  const colors = useMemo(() => colorCounts(items), [items]); // 🎨 포스트잇 색별 개수
  const related = useMemo(() => relatedTags(items, filter), [items, filter]);
  const tagFilter = filter.startsWith("#") || filter.startsWith("@");
  // 📌 포스트잇 분류 — 데스크탑 앱(1.3.1~)에서만. 지금 띄워 둔 포스트잇 목록을 앱에서 받아 온다(창으로 돌아올 때 다시)
  const canSticky = !!window.daymateDesktop?.getOpenStickies;
  const [stickyKeys, setStickyKeys] = useState(null);
  useEffect(() => {
    if (!canSticky) return;
    const load = () => window.daymateDesktop.getOpenStickies().then(l => setStickyKeys(new Set((l || []).map(s => `${s.ds}|${s.id}`)))).catch(() => {});
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [canSticky, filter]);
  const baseFilters = useMemo(() => {
    if (!canSticky) return BASE_FILTERS;
    const i = BASE_FILTERS.findIndex(f => f.id === "locked") + 1;
    return [...BASE_FILTERS.slice(0, i), { id: "sticky", label: "포스트잇", icon: "📌" }, ...BASE_FILTERS.slice(i)];
  }, [canSticky]);
  // 최근 검색어 (메모잇 "이전 검색단어목록") — 검색 칸을 누르면 아래에 목록이 뜬다. 이 기기에만 10개
  const [recentQs, setRecentQs] = useState(() => { try { return JSON.parse(localStorage.getItem("dm_memo_recent_q") || "[]"); } catch { return []; } });
  const rememberQuery = () => {
    const q = query.trim();
    if (q.length < 2) return;
    setRecentQs(prev => {
      const next = [q, ...prev.filter(x => x !== q)].slice(0, 10);
      try { localStorage.setItem("dm_memo_recent_q", JSON.stringify(next)); } catch { /* 저장 못 해도 이번엔 보임 */ }
      return next;
    });
  };
  const list = useMemo(() => sortItems(filterItems(items, filter, query, undefined, stickyKeys, nl ? period : "all"), sort), [items, filter, query, sort, stickyKeys, nl, period]);
  const hlTerms = useMemo(() => (nl ? highlightTerms(query) : []), [nl, query]); // 찾은 단어 노란 표시 (새 디자인)
  const selected = items.find(it => it.key === selectedKey) || null;
  const selIndex = list.findIndex(it => it.key === selectedKey);
  const phone = nl && !wide;
  const phoneEdit = phone && mEdit && !!selected;
  useBackClose(() => setMEdit(false), phoneEdit); // 휴대폰 뒤로가기 → 편집 화면에서 목록으로

  const rowRefs = useRef({});
  const select = (key) => {
    setSelectedKey(key);
    requestAnimationFrame(() => rowRefs.current[key]?.scrollIntoView({ block: "nearest" }));
  };
  const move = (delta) => {
    if (!list.length) return;
    const next = selIndex < 0 ? (delta > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, selIndex + delta));
    if (next >= limit) setLimit(l => l + PAGE);
    select(list[next].key);
  };
  const onListKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
  };
  const changeFilter = (f) => { setFilter(f); setLimit(PAGE); };
  const toggleSort = (key) => setSort(s => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "title" || key === "kind" ? "asc" : "desc" }));

  // "＋ 새 메모"로 만들고 아무것도 안 쓴 채 다른 항목으로 넘어가면 빈 메모를 지운다
  const newMemoRef = useRef(null);
  useEffect(() => {
    const created = newMemoRef.current;
    if (!created || created.key === selectedKey) return;
    newMemoRef.current = null;
    onUpdateDayData(created.ds, prev => ({
      ...prev,
      memos: (prev.memos || []).filter(m => m.id !== created.id || m.text?.trim() || m.photos?.length || m.files?.length),
    }));
  }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const addMemo = () => {
    const ds = toDateStr();
    const id = genMemoId();
    onUpdateDayData(ds, prev => ({ ...prev, memos: [...withMemoList(prev), { id, text: "", createdAt: getMemoTimeStr() }] }));
    setFilter("all");
    setQuery("");
    const key = `memo|${ds}|${id}`;
    newMemoRef.current = { key, ds, id };
    setSelectedKey(key);
    setMEdit(true); // 휴대폰은 새 메모를 바로 편집 화면으로 (PC는 이 값을 안 씀)
  };
  // 휴지통: 되살리기(원래 날짜 메모로) · 영구 삭제(사진 파일도 정리) · 비우기
  const restoreTrash = (it) => {
    onUpdateDayData(it.ds, prev => restoreMemoFromTrash(prev, it.id));
    setSelectedKey(`memo|${it.ds}|${it.id}`);
    setFilter("all");
    setToast("메모를 되살렸어요");
  };
  const purgeTrash = (targets) => {
    const byDay = new Map();
    targets.forEach(it => byDay.set(it.ds, [...(byDay.get(it.ds) || []), it.id]));
    byDay.forEach((ids, ds) => {
      const gone = (plans[ds]?.memoTrash || []).filter(m => ids.includes(m.id));
      gone.forEach(m => (m.photos || []).forEach(p => p?.path && deletePhoto(p.path)));
      onUpdateDayData(ds, prev => ({ ...prev, memoTrash: (prev.memoTrash || []).filter(m => !ids.includes(m.id)) }));
    });
    setSelectedKey(null);
  };
  const deleteForever = (it) => {
    if (!window.confirm(`"${it.title}" 메모를 영구 삭제할까요? 되돌릴 수 없어요.`)) return;
    purgeTrash([it]);
  };
  const emptyTrash = () => {
    const all = items.filter(it => it.kind === "trash");
    if (!all.length || !window.confirm(`휴지통의 메모 ${all.length}개를 모두 영구 삭제할까요? 되돌릴 수 없어요.`)) return;
    purgeTrash(all);
  };

  // ☑ 여러 개 한꺼번에 (2026-11-03) — 메모만 고를 수 있다(일정·일기·휴지통 제외). 지우기는 휴지통으로, 태그는 끝에 한 줄,
  // 날짜 옮기기는 새 날짜에 넣고 원래 날짜에서 뺀다(빼면 휴지통에 들어가는 사본은 바로 정리)
  const undo = useUndo();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [bulkTag, setBulkTag] = useState("");
  const [bulkTagOpen, setBulkTagOpen] = useState(false); // 새 디자인 고르기 줄: 🏷를 누를 때만 태그 입력칸
  const [periodOpen, setPeriodOpen] = useState(false); // 휴대폰 📅 기간 펼침 (2026-11-14)
  const pickable = (it) => it.kind === "memo";
  const togglePick = (key) => setPicked(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const stopPicking = () => { setPicking(false); setPicked(new Set()); setBulkTag(""); setBulkTagOpen(false); };
  const pickedItems = () => items.filter(it => picked.has(it.key) && pickable(it));
  const byDayOf = (list) => { const m = new Map(); list.forEach(it => m.set(it.ds, [...(m.get(it.ds) || []), it.id])); return m; };
  const bulkDelete = () => {
    const list = pickedItems();
    if (!list.length) return;
    byDayOf(list).forEach((ids, ds) => onUpdateDayData(ds, prev => { const next = updateMemoIn(prev, "", {}); return { ...next, memos: next.memos.filter(m => !ids.includes(m.id)) }; }));
    undo.offer(`메모 ${list.length}개를 휴지통으로 옮겼어요`, () => list.forEach(it => onUpdateDayData(it.ds, prev => restoreMemoFromTrash(prev, it.id))));
    setSelectedKey(null);
    stopPicking();
  };
  const bulkAddTag = () => {
    const tag = bulkTag.trim().replace(/^#+/, "").replace(/\s+/g, "");
    const list = pickedItems().filter(it => !it.locked);
    if (!tag || !list.length) return;
    byDayOf(list).forEach((ids, ds) => onUpdateDayData(ds, prev => {
      const next = updateMemoIn(prev, "", {});
      return { ...next, memos: next.memos.map(m => (ids.includes(m.id) && !(m.text || "").includes(`#${tag}`) ? { ...m, text: `${(m.text || "").replace(/\s+$/, "")}\n#${tag}` } : m)) };
    }));
    setToast(`메모 ${list.length}개에 #${tag}를 붙였어요`);
    stopPicking();
  };
  const bulkMove = (toDs) => {
    const list = pickedItems().filter(it => it.ds !== toDs);
    if (!toDs || !list.length) return;
    byDayOf(list).forEach((ids, ds) => {
      const moving = (plans[ds]?.memos || []).filter(m => ids.includes(m.id));
      onUpdateDayData(toDs, prev => ({ ...prev, memos: [...(prev.memos || []).filter(m => !ids.includes(m.id)), ...moving] }));
      onUpdateDayData(ds, prev => { const next = updateMemoIn(prev, "", {}); return { ...next, memos: next.memos.filter(m => !ids.includes(m.id)) }; });
      onUpdateDayData(ds, prev => ({ ...prev, memoTrash: (prev.memoTrash || []).filter(m => !ids.includes(m.id)) }));
    });
    setToast(`메모 ${list.length}개를 ${toDs}로 옮겼어요`);
    setSelectedKey(null);
    stopPicking();
  };

  const deleteMemo = (it) => {
    onUpdateDayData(it.ds, prev => {
      const next = updateMemoIn(prev, it.id, {});
      return { ...next, memos: next.memos.filter(m => m.id !== it.id) };
    });
    setSelectedKey(null);
    undo.offer(`"${(it.title || "메모").slice(0, 14)}" 휴지통으로 옮겼어요`, () => {
      onUpdateDayData(it.ds, prev => restoreMemoFromTrash(prev, it.id));
      setSelectedKey(`memo|${it.ds}|${it.id}`);
    });
  };

  const ink = { color: "var(--dm-text)" };
  const muted = { color: "var(--dm-muted)" };
  const border = "1px solid var(--dm-border)";

  const filterButton = (id, label, icon, indent = false) => {
    const active = filter === id;
    return (
      <button key={id} className={hit} onClick={() => { changeFilter(id); if (id.startsWith("#") || id.startsWith("@")) setTagsOpen(false); }}
        style={wide
          ? { display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: indent ? z("5px 10px 5px 28px", "7px 10px 7px 28px") : z("6px 10px", "8px 10px"), borderRadius: 6, border: "none", background: active ? "var(--dm-accent-soft, rgba(108,142,255,.18))" : "transparent", color: active ? ACCENT(nl) : "var(--dm-text)", fontWeight: active ? 800 : z(500, 600), fontSize: z(13, 15), cursor: "pointer", fontFamily: "inherit" }
          : { flexShrink: 0, padding: z("5px 10px", "7px 12px"), borderRadius: z(14, 16), border: active ? `1.5px solid ${ACCENT(nl)}` : border, background: active ? "var(--dm-accent-soft, rgba(108,142,255,.15))" : "var(--dm-input)", color: active ? ACCENT(nl) : "var(--dm-sub)", fontSize: z(12, 14), fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
        <span>{icon}</span> {label}
      </button>
    );
  };
  // 휴대폰(새 디자인) 분류 줄의 글자 탭
  const tabBtn = (key, active, onClick, label, count) => (
    <button key={key} onClick={onClick} aria-pressed={active}
      style={{ flexShrink: 0, height: 42, padding: "0 10px", border: "none", borderRadius: 0, background: "none", borderBottom: `2.5px solid ${active ? ACCENT(nl) : "transparent"}`,
        color: active ? "var(--dm-text)" : "var(--dm-sub)", fontSize: 15, fontWeight: active ? 800 : 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
      {label}{count !== undefined && <span style={{ marginLeft: 4, fontSize: 13, fontWeight: 600, color: "var(--dm-muted)" }}>{count}</span>}
    </button>
  );
  // 태그 영역 — #부모/자식은 📂 카테고리로 묶는다(지식 화면에서 옮겨 옴). 좁은 화면에서는 "🏷 태그" 칩 하나로 접어 둔다
  const tagGuide = (
    <div style={{ ...muted, fontSize: z(12, 13), lineHeight: 1.6, padding: wide ? "2px 10px" : "2px 2px" }}>
      메모에 <b>#태그</b>나 <b>[[키워드]]</b>를 쓰면 여기에 모여요. <b>#투자/주식</b>처럼 쓰면 📂 투자 묶음으로 보여요.
    </div>
  );
  // 새 디자인: 분류 이름과 같은 태그(#업무)는 위 "분류"에 이미 들어가므로 태그 목록에서 뺀다
  const shownTags = nl ? tags.filter(e => !(e.type === "tag" && cats.some(c => c.name === e.name))) : tags;
  const tagButtons = shownTags.length === 0 ? tagGuide : shownTags.map(e => (e.type === "group"
    ? [filterButton(`@${e.name}`, `${e.name} (${e.n})`, "📂"), ...e.children.map(c => filterButton(`#${c.name}`, wide ? `${c.label} (${c.n})` : `${c.name} (${c.n})`, wide ? "" : "#", true))]
    : filterButton(`#${e.name}`, `${e.name} (${e.n})`, "#")));
  // 🎨 색상 — 포스트잇에서 색을 고른 메모가 있을 때만
  const colorButtons = Object.keys(STICKY_COLORS).filter(k => colors[k]).map(k => filterButton(`color:${k}`, `${STICKY_COLORS[k].name} (${colors[k]})`,
    <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: STICKY_COLORS[k].bg, border: `1px solid ${STICKY_COLORS[k].line}`, verticalAlign: "middle" }} />));
  const tagChipLabel = tagFilter ? `${filter.startsWith("@") ? "📂" : "#"} ${filter.slice(1)}` : "🏷 태그";
  // 새 디자인 (2026-11-13 사용자 승인): 기간은 목록 위 칩 줄로 빼고(분류와 함께 고름), 🎨 색상 대신 일정 분류(업무·재무·직접 만든 것)
  const nlBase = baseFilters.filter(f => !isPeriodFilter(f.id));
  const catButtons = cats.map(c => filterButton(`cat:${c.id}`, `${c.name} (${catCounts[c.id] || 0})`,
    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: c.color, verticalAlign: "middle" }} />));
  const groupLabel = (txt) => <div style={{ ...(nl ? ink : muted), fontSize: z(11, 14), fontWeight: z(700, 900), padding: "12px 10px 4px" }}>{txt}</div>;
  const filters = nl ? (wide ? (
    <>
      {nlBase.map(f => filterButton(f.id, f.label, f.icon))}
      {cats.length > 0 && groupLabel("분류")}
      {catButtons}
      {groupLabel("태그")}
      {tagButtons}
    </>
  ) : (
    // 휴대폰: 상자 없는 글자 탭 — 고른 것만 진하게 + 파란 밑줄, 숫자는 괄호 없이 연하게 (2026-11-14 사용자 승인 A안)
    <>
      {tabBtn(BASE_FILTERS[0].id, filter === BASE_FILTERS[0].id, () => changeFilter(BASE_FILTERS[0].id), BASE_FILTERS[0].label)}
      {cats.map(c => tabBtn(`cat:${c.id}`, filter === `cat:${c.id}`, () => changeFilter(`cat:${c.id}`),
        <><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: c.color, marginRight: 6, verticalAlign: "middle", position: "relative", top: -1 }} />{c.name}</>, catCounts[c.id] || 0))}
      {tabBtn("tags", !!tagFilter || tagsOpen, () => setTagsOpen(o => !o), <>{tagFilter ? tagChipLabel.replace("🏷 ", "") : "태그"} <span style={{ fontSize: 11 }}>{tagsOpen ? "▲" : "▼"}</span></>)}
      {nlBase.slice(1).map(f => tabBtn(f.id, filter === f.id, () => changeFilter(f.id), f.label))}
    </>
  )) : wide ? (
    <>
      {baseFilters.map(f => filterButton(f.id, f.label, f.icon))}
      {colorButtons.length > 0 && <div style={{ ...(nl ? ink : muted), fontSize: z(11, 14), fontWeight: z(700, 900), padding: "12px 10px 4px" }}>🎨 색상</div>}
      {colorButtons}
      <div style={{ ...(nl ? ink : muted), fontSize: z(11, 14), fontWeight: z(700, 900), padding: "12px 10px 4px" }}>태그</div>
      {tagButtons}
    </>
  ) : (
    <>
      {filterButton(BASE_FILTERS[0].id, BASE_FILTERS[0].label, BASE_FILTERS[0].icon)}
      <button className={hit} onClick={() => setTagsOpen(o => !o)}
        style={{ flexShrink: 0, padding: z("5px 10px", "7px 12px"), borderRadius: z(14, 16), border: tagFilter ? `1.5px solid ${ACCENT(nl)}` : border, background: tagFilter || tagsOpen ? "var(--dm-accent-soft, rgba(108,142,255,.15))" : "var(--dm-input)", color: tagFilter ? ACCENT(nl) : "var(--dm-sub)", fontSize: z(12, 14), fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
        {tagChipLabel} {tagsOpen ? "▴" : "▾"}
      </button>
      {baseFilters.slice(1).map(f => filterButton(f.id, f.label, f.icon))}
      {colorButtons}
    </>
  );
  // 태그·카테고리를 고르면 목록 위에 관련 태그(같은 날 함께 나온 태그) 한 줄
  const relatedRow = tagFilter && related.length > 0 && (
    <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", padding: "6px 12px", flexShrink: 0, borderBottom: border }}>
      <span style={{ ...muted, fontSize: z(12, 14), fontWeight: 700, whiteSpace: "nowrap" }}>관련</span>
      {related.map(r => (
        <button key={r.name} onClick={() => changeFilter(`#${r.name}`)}
          style={{ flexShrink: 0, padding: z("3px 9px", "5px 11px"), borderRadius: z(12, 14), border: "1px solid var(--dm-accent-line, rgba(108,142,255,.35))", background: "var(--dm-accent-soft, rgba(108,142,255,.08))", color: ACCENT(nl), fontSize: z(12, 14), fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
          #{r.name}
        </button>
      ))}
    </div>
  );

  const th = (key, label, style) => (
    <th onClick={() => toggleSort(key)} style={{ textAlign: "left", padding: z("7px 8px", "8px 8px"), fontSize: z(12, 13), fontWeight: 700, ...muted, cursor: "pointer", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--dm-bg)", borderBottom: border, userSelect: "none", ...style }}>
      {label}{sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
  const bulkBtn = { padding: z("4px 10px", "6px 12px"), borderRadius: 8, border, background: "var(--dm-input)", color: "var(--dm-text)", fontSize: z(12, 14), fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 };
  // 새 디자인은 "여러 개 고르기"를 따로 한 줄로 두지 않는다 — PC는 기간 줄 오른쪽 끝, 휴대폰은 분류 줄 오른쪽 ☑ (2026-11-14). 고르는 중일 때만 이 줄
  // 새 디자인 고르기 줄: 한 줄 — ✕ n개 선택 · 모두 … 🗑 🏷 📅 (태그 입력칸은 🏷를 누를 때만, 2026-11-14)
  const pickIco = { flexShrink: 0, width: 42, height: 40, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 10, background: "none", cursor: "pointer", color: "var(--dm-sub)" };
  const nlPickBar = nl && picking && filter !== "trash" && (
    <div style={{ flexShrink: 0, borderBottom: border, padding: "2px 6px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <button onClick={stopPicking} aria-label="고르기 끝내기" title="취소" style={pickIco}><Ico name="close" size={21} /></button>
        <span style={{ fontSize: 15, fontWeight: 800, ...ink, whiteSpace: "nowrap" }}>{picked.size}개 선택</span>
        <button onClick={() => setPicked(new Set(list.filter(pickable).slice(0, limit).map(it => it.key)))}
          style={{ marginLeft: 6, height: 40, padding: "0 10px", border: "none", background: "none", color: ACCENT(nl), fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>모두</button>
        <span style={{ flex: 1 }} />
        <button onClick={bulkDelete} disabled={!picked.size} aria-label="지우기" title="휴지통으로" style={{ ...pickIco, color: picked.size ? "#F87171" : "var(--dm-muted)" }}><Ico name="trash" size={21} /></button>
        <button onClick={() => setBulkTagOpen(o => !o)} disabled={!picked.size} aria-label="태그 붙이기" title="태그 붙이기" aria-expanded={bulkTagOpen}
          style={{ ...pickIco, color: bulkTagOpen ? ACCENT(nl) : picked.size ? "var(--dm-sub)" : "var(--dm-muted)" }}><Ico name="tag" size={21} /></button>
        <label aria-label="날짜 옮기기" title="날짜 옮기기" style={{ ...pickIco, position: "relative", color: picked.size ? "var(--dm-sub)" : "var(--dm-muted)" }}>
          <Ico name="date" size={21} />
          <input type="date" onChange={e => bulkMove(e.target.value)} disabled={!picked.size} aria-label="옮길 날짜"
            onClick={e => { try { e.currentTarget.showPicker(); } catch { /* 기본 동작 */ } }}
            style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", border: "none", padding: 0 }} />
        </label>
      </div>
      {bulkTagOpen && picked.size > 0 && (
        <div style={{ display: "flex", gap: 6, padding: "4px 6px 8px" }}>
          <input value={bulkTag} onChange={e => setBulkTag(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.nativeEvent.isComposing && bulkAddTag()} placeholder="붙일 태그" aria-label="붙일 태그" autoFocus
            style={{ flex: 1, minWidth: 0, height: 40, padding: "0 12px", borderRadius: 10, border: "none", background: "var(--dm-input)", color: "var(--dm-text)", fontSize: 15, fontFamily: "inherit", outline: "none" }} />
          <button onClick={bulkAddTag} disabled={!bulkTag.trim()} style={{ height: 40, padding: "0 14px", borderRadius: 10, border: "none", background: bulkTag.trim() ? ACCENT(nl) : "var(--dm-input)", color: bulkTag.trim() ? "#fff" : "var(--dm-muted)", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>붙이기</button>
        </div>
      )}
    </div>
  );
  const pickBar = nl ? nlPickBar : filter !== "trash" && (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "6px 10px", flexShrink: 0, borderBottom: border }}>
      {!picking ? (
        <button className={hit} onClick={() => setPicking(true)} style={bulkBtn}>☑ 여러 개 고르기</button>
      ) : (
        <>
          <span style={{ fontSize: z(12, 14), fontWeight: 800, ...ink }}>{picked.size}개</span>
          <button onClick={() => setPicked(new Set(list.filter(pickable).slice(0, limit).map(it => it.key)))} style={bulkBtn}>모두</button>
          <button onClick={bulkDelete} disabled={!picked.size} style={{ ...bulkBtn, color: "#F87171" }}>🗑 지우기</button>
          <input value={bulkTag} onChange={e => setBulkTag(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.nativeEvent.isComposing && bulkAddTag()} placeholder="태그" aria-label="붙일 태그"
            style={{ width: 80, padding: z("4px 8px", "6px 8px"), borderRadius: 8, border, background: "var(--dm-input)", color: "var(--dm-text)", fontSize: z(12, 14), fontFamily: "inherit" }} />
          <button onClick={bulkAddTag} disabled={!picked.size || !bulkTag.trim()} style={bulkBtn}>🏷 붙이기</button>
          <label style={{ ...bulkBtn, position: "relative" }}>📅 날짜 옮기기
            <input type="date" onChange={e => bulkMove(e.target.value)} disabled={!picked.size} aria-label="옮길 날짜"
              onClick={e => { try { e.currentTarget.showPicker(); } catch { /* 기본 동작 */ } }}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", border: "none", padding: 0 }} />
          </label>
          <button onClick={stopPicking} style={bulkBtn}>취소</button>
        </>
      )}
    </div>
  );
  // 휴대폰 미리보기: 내용 8줄까지(넘으면 아래 흐리게) · 작은 사진 · [편집] 복사 ⋯ — 목록은 보기만, 고치기는 편집 화면에서 (CLAUDE.md 14.1)
  const updateMemo = (it, patch) => onUpdateDayData(it.ds, prev => updateMemoIn(prev, it.id, patch));
  const rowPreview = (it) => {
    const body = it.kind === "task" ? (it.text || "") : it.kind === "memo" ? it.text.split("\n").slice(1).join("\n").replace(/^\s*\n/, "") || "" : it.text;
    const shown = (it.kind === "memo" && !body.trim() ? "" : body).trim();
    const long = shown.split("\n").length > 8 || shown.length > 360;
    const pvBtn = { height: 40, padding: "0 14px", borderRadius: 10, border: "none", background: "var(--dm-input)", color: "var(--dm-text)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
    const copy = async () => { try { await navigator.clipboard.writeText(it.text || it.title); setToast("복사했어요"); } catch { setToast("복사하지 못했어요"); } };
    const memoMenu = it.kind === "memo" && !it.locked ? [
      { label: it.starred ? "☆ 즐겨찾기 해제" : "⭐ 즐겨찾기", run: () => updateMemo(it, { starred: !it.starred }) },
      { label: it.pinned ? "📍 고정 풀기" : "📍 위에 고정", run: () => updateMemo(it, { pinned: it.pinned ? undefined : true }) },
      { label: "🗑 삭제", run: () => deleteMemo(it), danger: true },
    ] : [];
    return (
      <div onClick={e => e.stopPropagation()}>
        {it.locked ? (
          <div style={{ fontSize: 15, color: "var(--dm-sub)", padding: "4px 0 10px" }}>잠긴 메모예요. [편집]을 누르면 비밀번호를 물어요.</div>
        ) : shown ? (
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 15, lineHeight: 1.6, color: "var(--dm-text)", padding: "2px 0 10px",
            ...(long ? { maxHeight: 15 * 1.6 * 8, overflow: "hidden", WebkitMaskImage: "linear-gradient(#000 70%, transparent)", maskImage: "linear-gradient(#000 70%, transparent)" } : {}) }}>
            {hlTerms.length ? markTerms(shown, hlTerms) : shown}
          </div>
        ) : (
          <div style={{ fontSize: 14, color: "var(--dm-muted)", padding: "2px 0 10px" }}>{it.kind === "task" ? "일정 메모가 없어요" : "제목 말고 다른 내용은 없어요"}</div>
        )}
        {it.photos.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 10 }}>
            {it.photos.map((p, i) => p?.url && <img key={p.path || i} src={p.url} alt="첨부 사진" onClick={() => setPvPhotos({ photos: it.photos, index: i })}
              style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: "1px solid var(--dm-border)", cursor: "zoom-in" }} />)}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
          <button onClick={() => setMEdit(true)} style={{ ...pvBtn, background: ACCENT(nl), color: "#fff", fontWeight: 800 }}>{it.kind === "trash" ? "열기" : "편집"}</button>
          {!it.locked && it.kind !== "trash" && <button onClick={copy} style={pvBtn}>복사</button>}
          {memoMenu.length > 0 && <button onClick={() => setPvMenu(o => !o)} aria-label="더보기" aria-expanded={pvMenu} style={{ ...pvBtn, padding: 0, width: 44 }}>⋯</button>}
        </div>
        {/* ⋯ → 아래 한 줄로 (목록 칸이 스크롤 상자라 떠 있는 메뉴는 잘린다) */}
        {pvMenu && memoMenu.length > 0 && (
          <div role="menu" style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 8 }}>
            {memoMenu.map(m => (
              <button key={m.label} role="menuitem" onClick={() => { setPvMenu(false); m.run(); }}
                style={{ ...pvBtn, background: "none", border, color: m.danger ? "#F87171" : "var(--dm-text)", fontSize: 14 }}>{m.label}</button>
            ))}
          </div>
        )}
      </div>
    );
  };
  const table = (
    <div tabIndex={0} onKeyDown={onListKey} style={{ flex: 1, minHeight: 0, overflow: "auto", outline: "none" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        {/* 휴대폰(새 디자인)은 머리 줄(제목·날짜·📷) 없이 — 날짜 최신순 (2026-11-14). 머리 줄이 없으면 칸 폭은 colgroup으로 */}
        {nl && !wide && <colgroup><col style={{ width: 34 }} /><col /><col style={{ width: 84 }} /><col style={{ width: 36 }} /></colgroup>}
        <thead style={nl && !wide ? { display: "none" } : undefined}>
          <tr>
            {th("kind", "", { width: z(30, 34) })}
            {th("title", "제목")}
            {th("date", "날짜", { width: wide ? 150 : z(96, 84) })}
            {cols && th("updated", filter === "trash" ? "삭제일" : "수정일", { width: 130 })}
            {cols && <th style={{ width: 150, textAlign: "left", padding: z("7px 8px", "8px 8px"), fontSize: z(12, 13), fontWeight: 700, ...muted, position: "sticky", top: 0, background: "var(--dm-bg)", borderBottom: border }}>태그</th>}
            {th("photo", "📷", { width: z(40, 36) })}
          </tr>
        </thead>
        <tbody>
          {list.slice(0, limit).map(it => {
            const active = it.key === selectedKey;
            const cell = z("6px 8px", "10px 8px");
            const open = phone && active && !picking; // 휴대폰: 누른 줄 아래 미리보기
            return (
              <Fragment key={it.key}>
              <tr ref={el => { rowRefs.current[it.key] = el; }} onClick={() => (picking ? pickable(it) && togglePick(it.key) : phone ? (active ? setSelectedKey(null) : (setPvMenu(false), select(it.key))) : select(it.key))}
                style={{ cursor: picking && !pickable(it) ? "default" : "pointer", opacity: picking && !pickable(it) ? 0.4 : 1, background: (picking ? picked.has(it.key) : active) ? "var(--dm-accent-soft, rgba(108,142,255,.2))" : "transparent", borderBottom: open ? "none" : "1px solid var(--dm-row)" }}>
                <td style={{ padding: cell, fontSize: z(13, 15) }} title={KIND[it.kind].label}>{picking ? (pickable(it) ? (picked.has(it.key) ? "☑" : "☐") : "") : KIND[it.kind].icon}</td>
                <td style={{ padding: cell, fontSize: z(13, 16), fontWeight: z(400, 600), ...ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: it.done ? "line-through" : "none", opacity: it.done ? 0.6 : 1 }}>
                  {it.pinned && "📍 "}{it.starred && "⭐ "}{hlTerms.length ? markTerms(it.title, hlTerms) : it.title}
                  {/* 좁은 화면엔 태그 칸이 없어 제목 뒤에 흐리게 — 제목에 이미 보이는 [[키워드]]는 빼고 */}
                  {!cols && it.tags.filter(t => !it.title.includes(t)).map(t => <span key={t} style={{ marginLeft: 6, fontSize: z(11, 13), fontWeight: z(400, 500), color: ACCENT(nl), opacity: z(0.75, 0.9) }}>#{t}</span>)}
                </td>
                <td style={{ padding: cell, fontSize: z(12, 13), ...(nl ? { color: "var(--dm-sub)" } : muted), whiteSpace: "nowrap" }}>{wide ? it.ds : it.ds.slice(2)}{wide && it.time ? ` ${it.time}` : ""}</td>
                {cols && <td style={{ padding: cell, fontSize: z(12, 13), ...(nl ? { color: "var(--dm-sub)" } : muted), whiteSpace: "nowrap" }}>{fmtUpdated(it.updatedAt)}</td>}
                {cols && <td style={{ padding: cell, fontSize: z(12, 13), color: ACCENT(nl), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.tags.map(t => `#${t}`).join(" ")}</td>}
                <td style={{ padding: cell, fontSize: z(12, 13), ...(nl ? { color: "var(--dm-sub)" } : muted) }}>{it.photos.length || ""}</td>
              </tr>
              {open && <tr style={{ background: "var(--dm-accent-soft, rgba(108,142,255,.2))", borderBottom: "1px solid var(--dm-row)" }}><td colSpan={4} style={{ padding: "0 12px 12px 12px" }}>{rowPreview(it)}</td></tr>}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {list.length > limit && (
        <button onClick={() => setLimit(l => l + PAGE)} style={{ display: "block", margin: "10px auto", padding: z("6px 16px", "9px 18px"), borderRadius: 8, border, background: "var(--dm-input)", ...(nl ? { color: "var(--dm-sub)", fontWeight: 700 } : muted), fontSize: z(12, 14), cursor: "pointer", fontFamily: "inherit" }}>
          더 보기 ({list.length - limit}개 남음)
        </button>
      )}
      {list.length === 0 && <div style={{ padding: 30, textAlign: "center", ...muted, fontSize: z(13, 15) }}>{query.trim() ? "검색 결과가 없어요" : "기록이 없어요"}</div>}
    </div>
  );

  // 📷 사진 분류 — 목록 자리에 사진 모음(월별 3칸). 검색어가 있으면 그 글자가 든 메모·일정의 사진만,
  // 사진을 누르면 고르기(테두리 + 아래 편집 칸에 그 기록), 위쪽 "⤢ 크게 보기"로 고른 사진부터 크게 보며 좌우로 넘긴다.
  // "⤡ 작게 보기"로 돌아오면 마지막으로 본 사진이 골라져 있다 (예전 통합 검색 화면의 사진 모아보기를 옮겨 옴, 2026-11-01)
  const photoWall = useMemo(() => (filter !== "photo" ? [] : list
    .flatMap(it => it.photos.filter(p => p?.url).map((p, i) => ({ key: `${it.key}|${i}`, url: p.url, ds: it.ds, kind: it.kind, itemKey: it.key, caption: `${formatKoreanDate(it.ds)} · ${it.title}` })))
    .sort((a, b) => b.ds.localeCompare(a.ds))), [filter, list]);
  const [wallViewer, setWallViewer] = useState(null); // 크게 보는 사진 번호
  const [wallPick, setWallPick] = useState(null); // 고른 사진 key
  const pickPhoto = (p) => { setWallPick(p.key); select(p.itemKey); if (phone && wallViewer === null) setMEdit(true); };
  const openBig = () => setWallViewer(Math.max(0, photoWall.findIndex(p => p.key === wallPick)));
  const wall = (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {photoWall.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", flexShrink: 0, borderBottom: border }}>
          <span style={{ flex: 1, fontSize: z(13, 14), ...muted }}>사진 {photoWall.length}장 · 누르면 {phone ? "그 기록이" : "아래에 그 기록이"} 열려요</span>
          <button onClick={openBig} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--dm-accent, #5B7CFA)", background: "var(--dm-accent-soft, rgba(91,124,250,.12))", color: "var(--dm-accent, #5B7CFA)", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>⤢ 크게 보기</button>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 4px 10px" }}>
        <PhotoWall photos={photoWall} query={query} onOpen={pickPhoto} tile={wide ? 120 : 0} selectedKey={wallPick} />
      </div>
      {wallViewer !== null && photoWall.length > 0 && (
        <PhotoViewer photos={photoWall} index={wallViewer} closeLabel="⤡ 작게 보기" onClose={() => setWallViewer(null)}
          onIndexChange={(i) => photoWall[i] && pickPhoto(photoWall[i])} />
      )}
    </div>
  );
  // 기간 칩 줄 (새 디자인) — 왼쪽 분류·태그와 함께 걸린다. "전체 기간"이 아니면 파랗게
  const pickStart = !picking && filter !== "trash" && filter !== "photo";
  // 휴대폰(새 디자인): 기간은 칩 6개 대신 "전체 기간 ▾" 하나 — 분류 줄 맨 앞 (2026-11-14)
  const periodLabel = PERIOD_FILTERS.find(p => p.id === period)?.label || "기간";
  // 휴대폰(새 디자인): 기간은 오른쪽 📅 — 누르면 아래로 펼침(예전 숨은 select는 휴대폰에서 안 열렸다), 고르면 파랗게 + 짧은 이름 (2026-11-14)
  const periodOn = period !== PERIOD_FILTERS[0].id;
  const iconBtn = { flexShrink: 0, height: 40, minWidth: 40, padding: "0 6px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, border: "none", borderRadius: 10, background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" };
  const periodSelect = nl && !wide && filter !== "trash" && (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={() => setPeriodOpen(o => !o)} aria-label={`기간: ${periodLabel}`} aria-expanded={periodOpen} title="기간"
        style={{ ...iconBtn, color: periodOn || periodOpen ? ACCENT(nl) : "var(--dm-sub)", background: periodOn ? "var(--dm-accent-soft, rgba(108,142,255,.15))" : "none" }}>
        <Ico name="calendar" size={22} />{periodOn && periodLabel}
      </button>
      {periodOpen && (
        <>
          <div onClick={() => setPeriodOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div role="menu" style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, zIndex: 41, minWidth: 150, padding: 6, borderRadius: 14, background: "var(--dm-card)", boxShadow: "0 10px 30px rgba(0,0,0,.35)", border }}>
            {PERIOD_FILTERS.map(p => (
              <button key={p.id} role="menuitemradio" aria-checked={period === p.id} onClick={() => { setPeriod(p.id); setLimit(PAGE); setPeriodOpen(false); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 10, border: "none", background: period === p.id ? "var(--dm-accent-soft, rgba(108,142,255,.12))" : "none",
                  color: period === p.id ? ACCENT(nl) : "var(--dm-text)", fontSize: 15, fontWeight: period === p.id ? 800 : 500, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                {p.label}{period === p.id && <span>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
  const pickIconBtn = nl && !wide && pickStart && (
    <button onClick={() => setPicking(true)} aria-label="여러 개 고르기" title="여러 개 고르기" style={{ ...iconBtn, color: "var(--dm-sub)" }}>
      <Ico name="checks" size={22} />
    </button>
  );
  const periodRow = nl && wide && filter !== "trash" && (
    <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", padding: "6px 10px", flexShrink: 0, borderBottom: border }}>
      {PERIOD_FILTERS.map(p => {
        const on = period === p.id;
        return (
          <button key={p.id} className={hit} onClick={() => { setPeriod(p.id); setLimit(PAGE); }} aria-pressed={on}
            style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 16, border: on ? `1.5px solid ${ACCENT(nl)}` : border, background: on ? "var(--dm-accent-soft, rgba(108,142,255,.15))" : "transparent", color: on ? ACCENT(nl) : "var(--dm-sub)", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
            {p.label}
          </button>
        );
      })}
      {pickStart && <span style={{ flex: 1 }} />}
      {pickStart && <button className={hit} onClick={() => setPicking(true)} style={{ ...bulkBtn, border: "none", background: "transparent", color: "var(--dm-sub)" }}>☑ 여러 개 고르기</button>}
    </div>
  );
  const listArea = <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{periodRow}{filter === "photo" ? wall : <>{pickBar}{table}</>}</div>;

  // [[키워드]]·#태그를 누르면 그 태그 목록으로 (크게 보던 중이면 목록이 보이게 돌아온다)
  const openTag = (name) => { setBig(false); setQuery(""); changeFilter(`#${name}`); if (!wide) setTagsOpen(false); };
  const isBig = big && !!selected;
  const detail = (
    <DetailPane key={selected?.key || "none"} hlTerms={hlTerms} tagNames={tagNames} item={selected} plans={plans} onUpdateDayData={onUpdateDayData} uid={uid} onError={setToast} onOpenDate={onOpenDate} onDeleteMemo={deleteMemo} onRestore={restoreTrash} onDeleteForever={deleteForever} nl={nl} wide={wide && paneW >= 760 /* 편집 칸이 좁으면 버튼을 두 줄로 */}
      phone={phone} big={phone ? true : isBig} onToggleBig={phone ? () => setMEdit(false) : () => setBig(b => !b)} viewMode={viewMode} onToggleView={() => setViewMode(v => !v)} onTag={openTag} />
  );

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 900, background: "var(--dm-bg)", display: "flex", flexDirection: "column", fontFamily: "inherit", ...(zoom !== 1 ? { zoom } : {}) }}>
      {/* 상단: 닫기 · 새 메모 · 검색 (휴대폰 편집 화면에서는 숨김 — 뒤로가기·"목록"으로 돌아간다) */}
      <div style={{ display: phoneEdit ? "none" : "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: border, flexShrink: 0, flexWrap: wide ? "nowrap" : "wrap" }}>
        <button className={hit} onClick={onClose} style={{ padding: z("6px 12px", "8px 12px"), borderRadius: 8, border, background: "var(--dm-input)", ...ink, fontSize: z(13, 15), fontWeight: z(400, 700), cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>← 닫기</button>
        <div style={{ fontSize: z(15, 17), fontWeight: 900, ...ink, flexShrink: 0, marginRight: 6 }}>🗂 메모 관리자</div>
        <button className={hit} onClick={addMemo} style={{ padding: z("6px 12px", "8px 12px"), borderRadius: 8, border: "1px solid rgba(250,204,21,.6)", background: "rgba(250,204,21,.18)", ...ink, fontSize: z(13, 15), fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>＋ 새 메모</button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 200 }}>
          <input value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE); }}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); rememberQuery(); move(1); } else if (e.key === "ArrowDown" && (query || !recentQs.length)) { e.preventDefault(); move(1); } else if (e.key === "ArrowUp" && (query || !recentQs.length)) { e.preventDefault(); move(-1); } }}
            onBlur={rememberQuery} list="dm-memo-recent-q"
            placeholder={nl && !wide ? `${list.length}개에서 검색` : "검색 (메모·일정·일기)"} autoFocus={canAutoFocus()}
            style={{ flex: 1, minWidth: 0, padding: z("7px 10px", "9px 12px"), borderRadius: 8, border, background: "var(--dm-input)", ...ink, fontSize: z(13, 16), fontFamily: "inherit", outline: "none" }} />
          <datalist id="dm-memo-recent-q">{recentQs.map(q => <option key={q} value={q} />)}</datalist>
          {/* 휴대폰(새 디자인)은 ▼▲·개수 없이 — 목록 줄을 누르면 되고, 개수는 검색칸 안에 (2026-11-14) */}
          {!(nl && !wide) && <>
          <button className={hit} onClick={() => move(1)} aria-label="다음" style={{ width: z(30, 38), height: z(30, 38), padding: 0, borderRadius: 8, border, background: "var(--dm-input)", color: ACCENT(nl), cursor: "pointer", fontSize: z(13, 15), flexShrink: 0 }}>▼</button>
          <button className={hit} onClick={() => move(-1)} aria-label="이전" style={{ width: z(30, 38), height: z(30, 38), padding: 0, borderRadius: 8, border, background: "var(--dm-input)", color: ACCENT(nl), cursor: "pointer", fontSize: z(13, 15), flexShrink: 0 }}>▲</button>
          </>}
          <button className={hit} onClick={() => setShowSettings(true)} aria-label="메모 설정" title="메모 설정 (자동완성·단축키)" style={{ width: z(30, 38), height: z(30, 38), padding: 0, borderRadius: 8, border, background: "var(--dm-input)", cursor: "pointer", fontSize: z(14, 16), flexShrink: 0 }}>⚙️</button>
          {!(nl && !wide) && <span style={{ fontSize: z(12, 14), ...(nl ? { color: "var(--dm-sub)", fontWeight: 700 } : muted), whiteSpace: "nowrap" }}>{list.length}개</span>}
          {scaleControl /* 가− 가+ 화면 크기 (PC만, 2026-11-11) */}
          {filter === "trash" && list.length > 0 && (
            <button onClick={emptyTrash} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(248,113,113,.4)", background: "rgba(248,113,113,.1)", color: "#F87171", fontSize: z(12, 14), fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>휴지통 비우기</button>
          )}
        </div>
      </div>
      {!uid && onRequireLogin && !phoneEdit && <div style={{ paddingTop: 8 }}><LoginNotice onLogin={onRequireLogin} /></div>}

      {wide && nl ? (
        /* 새 디자인: 선을 끌어 칸 크기를 바꾼다 (두 번 누르면 원래대로) */
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <div ref={leftRef} style={{ width: split.w, flexShrink: 0, overflowY: "auto", padding: 8 }}>{filters}</div>
          <Splitter dir="x" label="분류 칸 폭 바꾸기" onMove={dragLeft} onEnd={saveSplit} onReset={() => resetSplit(["w"])} />
          <div ref={colRef} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {!isBig && <div style={{ flex: `0 0 ${listFrac * 100}%`, minHeight: 0, display: "flex", flexDirection: "column" }}>{relatedRow}{listArea}</div>}
            {!isBig && <Splitter dir="y" label="목록·편집 칸 높이 바꾸기" onMove={dragList} onEnd={saveSplit} onReset={() => resetSplit(["hWide"])} />}
            <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" }}>
              {detail}
            </div>
          </div>
        </div>
      ) : wide ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <div style={{ width: z(200, 220), flexShrink: 0, borderRight: border, overflowY: "auto", padding: 8 }}>{filters}</div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {!isBig && <div style={{ flex: "1 1 45%", minHeight: 0, display: "flex", flexDirection: "column", borderBottom: border }}>{relatedRow}{listArea}</div>}
            <div style={{ flex: "1 1 55%", minHeight: 0, display: "flex", flexDirection: "column" }}>
              {detail}
            </div>
          </div>
        </div>
      ) : nl ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {!phoneEdit && (
            // 글자 탭(옆으로 밀기, 끝은 흐리게) | 📅 기간 · ☑ 여러 개 고르기
            <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "2px 8px 0 4px", flexShrink: 0, borderBottom: border }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-end", overflowX: "auto", scrollbarWidth: "none",
                WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 28px), transparent)", maskImage: "linear-gradient(to right, #000 calc(100% - 28px), transparent)" }}>{filters}</div>
              {periodSelect}
              {pickIconBtn}
            </div>
          )}
          {!phoneEdit && tagsOpen && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 12px 8px", maxHeight: z(132, 156), overflowY: "auto", flexShrink: 0 }}>{tagButtons}</div>}
          {/* 목록은 편집 중에도 지우지 않고 숨긴다 — 돌아오면 보던 자리 그대로 */}
          <div style={{ flex: 1, minHeight: 0, display: phoneEdit ? "none" : "flex", flexDirection: "column" }}>{relatedRow}{listArea}</div>
          {phoneEdit && (
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              {/* 잠긴 메모·휴지통 화면엔 버튼 줄("목록")이 없어 돌아가기 줄을 따로 */}
              {(selected.locked || selected.kind === "trash") && (
                <button onClick={() => setMEdit(false)} style={{ alignSelf: "flex-start", height: 44, padding: "0 14px", border: "none", background: "none", color: "var(--dm-sub)", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>← 목록</button>
              )}
              {detail}
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {!isBig && <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 12px", flexShrink: 0 }}>{filters}</div>}
          {!isBig && tagsOpen && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 12px 8px", maxHeight: z(132, 156), overflowY: "auto", flexShrink: 0 }}>{tagButtons}</div>}
          {!isBig && <div style={{ flex: "1 1 40%", minHeight: 0, display: "flex", flexDirection: "column", borderTop: border, borderBottom: border }}>{relatedRow}{listArea}</div>}
          <div style={{ flex: "1 1 60%", minHeight: 0, display: "flex", flexDirection: "column" }}>
            {detail}
          </div>
        </div>
      )}
      {showSettings && <MemoSettings onClose={() => setShowSettings(false)} />}
      {pvPhotos && <PhotoViewer photos={pvPhotos.photos} index={pvPhotos.index} onClose={() => setPvPhotos(null)} />}
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <UndoBar bar={undo.bar} onUndo={undo.run} zIndex={910} />
    </div>,
    document.body
  );
}

// 선택한 항목 바로 편집 — 글은 입력을 멈추면(0.7초) 저장하고, 다른 항목을 고르거나 닫을 때도 저장한다
function DetailPane({ nl, wide, phone = false, hlTerms = null, tagNames = [], item, plans, onUpdateDayData, uid, onError, onOpenDate, onDeleteMemo, onRestore, onDeleteForever, big, onToggleBig, viewMode, onToggleView, onTag }) {
  const day = item ? plans[item.ds] : null;
  const task = item?.kind === "task" ? (day?.tasks || []).find(t => t.id === item.id) : null;
  const journal = item?.kind === "journal" ? (day?.journal || {}) : null;
  const initial = item?.kind === "memo" ? item.text : item?.kind === "task" ? (task?.note || "") : (journal?.body || "");
  const [text, setText] = useState(initial);
  const [title, setTitle] = useState(task?.title || "");
  const [viewer, setViewer] = useState(null);
  const [sentTask, setSentTask] = useState(false);
  const [sentToday, setSentToday] = useState("");
  const [moreOpen, setMoreOpen] = useState(false); // 새 디자인 ⋯ 더보기
  const [showHist, setShowHist] = useState(false); // 🕘 이전 내용 (2026-11-13)
  const textRef = useRef(null);
  const photoPickRef = useRef(null); // 버튼 줄 "사진" → PhotoGallery 사진 고르기
  const z = (oldV, newV) => (nl ? newV : oldV);

  const saved = useRef({ text: initial, title: task?.title || "" });
  // 📄 틀로 넣은 글을 한 글자도 안 바꿨으면 빈 메모로 둔다 — 그대로 나가면 빈 새 메모처럼 정리된다 (2026-11-13 사용자 요청)
  const tplRef = useRef(null);
  const save = (t0, ti) => {
    if (!item) return;
    const t = item.kind === "memo" && tplRef.current !== null && t0.trim() === tplRef.current.trim() ? "" : t0;
    if (t === saved.current.text && ti === saved.current.title) return;
    saved.current = { text: t, title: ti };
    if (item.kind === "memo") onUpdateDayData(item.ds, prev => updateMemoIn(prev, item.id, { text: t }));
    else if (item.kind === "task") onUpdateDayData(item.ds, prev => ({ ...prev, tasks: (prev.tasks || []).map(x => (x.id === item.id ? { ...x, note: t, title: ti.trim() || x.title } : x)) }));
    else onUpdateDayData(item.ds, prev => ({ ...prev, journal: { ...(prev.journal || {}), body: t } }));
  };
  const latest = useRef({ text, title, save });
  useEffect(() => { latest.current = { text, title, save }; });
  useEffect(() => {
    const h = setTimeout(() => save(text, title), 700);
    return () => clearTimeout(h);
  }, [text, title]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { const l = latest.current; l.save(l.text, l.title); }, []);
  // ✨ AI 정리 (2026-11-10, components/AiTidy.jsx) — 메모 관리자(900) 위에 뜨게
  const tidy = useAiTidy({ getText: () => text, setText, notify: onError, zIndex: 1500 });

  if (item?.locked) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "var(--dm-muted)", fontSize: z(13, 15), padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 30 }}>🔒</div>
        잠긴 메모예요. 비밀번호를 넣어야 볼 수 있어요.
        <button onClick={() => requestMemoLock(item.id, "open")} style={{ padding: "8px 18px", borderRadius: 10, border: "1px solid var(--dm-accent-line, rgba(108,142,255,.4))", background: "var(--dm-accent-soft, rgba(108,142,255,.15))", color: ACCENT(nl), fontSize: z(13, 15), fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🔓 열기</button>
      </div>
    );
  }
  if (item?.kind === "trash") {
    const btn = { padding: z("5px 12px", "7px 14px"), borderRadius: 8, fontSize: z(12, 14), fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "10px 14px", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          <span style={{ fontSize: z(12, 14), fontWeight: 800, color: "#F87171" }}>🗑 휴지통</span>
          <span style={{ fontSize: z(12, 13), color: z("var(--dm-muted)", "var(--dm-sub)") }}>{formatKoreanDate(item.ds)} 메모 · 삭제 {fmtUpdated(item.updatedAt)}</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => onRestore(item)} style={{ ...btn, border: "1px solid rgba(74,222,128,.5)", background: "rgba(74,222,128,.12)", color: "#4ADE80" }}>↩ 되살리기</button>
          <button onClick={() => onDeleteForever(item)} style={{ ...btn, border: "1px solid rgba(248,113,113,.4)", background: "rgba(248,113,113,.08)", color: "#F87171" }}>영구 삭제</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", padding: "10px 12px", borderRadius: 8, border: "1px dashed var(--dm-border)", color: "var(--dm-sub)", fontSize: z(14, 16), lineHeight: 1.7 }}>
          {item.text || "(내용 없음)"}
        </div>
        {item.photos.length > 0 && <div style={{ fontSize: z(12, 14), color: "var(--dm-muted)", flexShrink: 0 }}>📷 사진 {item.photos.length}장 (되살리면 다시 보여요)</div>}
      </div>
    );
  }
  if (!item) {
    return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dm-muted)", fontSize: z(13, 15), padding: 20, textAlign: "center" }}>목록에서 항목을 고르면 여기서 바로 보고 고칠 수 있어요.<br />↑↓ 키로 이동할 수 있어요.</div>;
  }

  const memo = item.kind === "memo" ? (day?.memos?.length ? day.memos : []).find(m => m.id === item.id) : null;
  const photos = item.kind === "memo" ? (memo?.photos || []) : item.kind === "task" ? (task?.photos || []) : [];
  // 캡처한 이미지 Ctrl+V → 아래 사진 칸에 추가 (＋ 버튼과 같은 곳에 저장). 일기는 사진 칸이 없어 그대로 둔다.
  // 엑셀·워드처럼 글자와 그림이 함께 복사되면 글자를 붙인다 — 표를 붙이려다 사진이 되면 안 되므로
  const pastePhotos = async (e) => {
    if (item.kind !== "memo" && item.kind !== "task") return;
    if (e.clipboardData?.getData("text/plain")?.trim()) return;
    const files = [...(e.clipboardData?.items || [])].filter(it => it.type.startsWith("image/")).map(it => it.getAsFile()).filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    if (!uid) { onError?.("사진은 로그인 후 붙일 수 있어요"); return; }
    onError?.("사진 올리는 중…");
    try {
      const uploaded = await Promise.all(files.map(async (f) => {
        const blob = await compressImage(f);
        return uploadPhoto(`users/${uid}/memos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`, blob, uid);
      }));
      // 올리는 동안 다른 메모로 옮겨 가거나 또 붙여도 빠지지 않게, 그 메모의 최신 사진 목록에 더한다
      onUpdateDayData(item.ds, prev => item.kind === "memo"
        ? updateMemoIn(prev, item.id, { photos: [...((prev.memos || []).find(m => m.id === item.id)?.photos || []), ...uploaded] })
        : { ...prev, tasks: (prev.tasks || []).map(x => (x.id === item.id ? { ...x, photos: [...(x.photos || []), ...uploaded] } : x)) });
      onError?.("사진을 붙였어요");
    } catch (err) {
      onError?.(photoErrorMessage(err));
    }
  };
  const setPhotos = (next) => {
    if (item.kind === "memo") onUpdateDayData(item.ds, prev => updateMemoIn(prev, item.id, { photos: next }));
    else if (item.kind === "task") onUpdateDayData(item.ds, prev => ({ ...prev, tasks: (prev.tasks || []).map(x => (x.id === item.id ? { ...x, photos: next } : x)) }));
  };
  // ⧉ 복사(휴대폰·PC) · 🖨 출력(PC만 — 포스트잇과 같은 A4 출력, utils/printMemo.js). 일기는 잘한 일·아쉬운 일·내일도 함께 (2026-11-01)
  const fullText = () => {
    if (item.kind !== "journal") return text;
    const extra = [journal?.good && `😊 잘한 일: ${journal.good}`, journal?.regret && `🤔 아쉬운 일: ${journal.regret}`, journal?.tomorrow && `➡️ 내일: ${journal.tomorrow}`].filter(Boolean);
    return extra.length ? [text, "", ...extra].join("\n") : text;
  };
  const copyText = async () => {
    const t = fullText();
    if (!t.trim()) { onError?.("복사할 내용이 없어요"); return; }
    try { await navigator.clipboard.writeText(t); onError?.("복사했어요"); } catch { onError?.("복사하지 못했어요"); }
  };
  const printText = () => {
    const t = fullText();
    if (!t.trim()) { onError?.("출력할 내용이 없어요"); return; }
    const head = `${formatKoreanDate(item.ds)}${item.kind === "task" && title.trim() ? ` · ${title.trim()}` : item.kind === "journal" ? " · 일기" : ""}`;
    if (!printMemo(t, head)) onError?.("출력 창을 열지 못했어요");
  };
  // 커서가 있는 줄(고른 글자가 있으면 그 부분)을 언젠가·오늘 할일로 — utils/memoToTask.js
  const sendSomeday = () => {
    const el = textRef.current;
    const t = pickTaskTitle(text, el?.selectionStart ?? 0, el?.selectionEnd ?? 0);
    if (!t) { onError?.("언젠가로 보낼 줄에 커서를 두거나 글자를 골라 주세요"); return; }
    sendMemoToSomeday(t, item.id);
    setSentTask(true);
    setTimeout(() => setSentTask(false), 2000);
  };
  const sendToday = () => {
    const el = textRef.current;
    const t = pickTaskTitle(text, el?.selectionStart ?? 0, el?.selectionEnd ?? 0);
    if (!t) { onError?.("오늘로 보낼 줄에 커서를 두거나 글자를 골라 주세요"); return; }
    const sent = sendMemoToToday(t, item.id); // 줄에 시간·날짜가 있으면 그대로
    setSentToday(sentLabel(sent, toDateStr()));
    setTimeout(() => setSentToday(""), 2500);
  };
  const toggleStar = () => onUpdateDayData(item.ds, prev => updateMemoIn(prev, item.id, { starred: !item.starred }));
  // 📄 지금 글을 내 틀로 (이름은 첫 줄, utils/memoTemplates.js)
  const saveTemplate = () => {
    const r = addUserTemplate(getUserTemplates(), text);
    if (r.error) { onError?.(r.error); return; }
    setUserTemplates(r.list);
    onError?.(`📄 "${r.name}" 틀로 저장했어요 — 빈 메모에서 골라 쓸 수 있어요`);
  };
  // 📍 위에 고정 (2026-11-13) — 풀 때는 칸을 비운다
  const togglePin = () => onUpdateDayData(item.ds, prev => updateMemoIn(prev, item.id, { pinned: item.pinned ? undefined : true }));
  const toggleDone = () => onUpdateDayData(item.ds, prev => ({ ...prev, tasks: (prev.tasks || []).map(x => (x.id === item.id ? { ...x, done: !x.done } : x)) }));
  const smallHit = nl && window.innerWidth < 900 ? "dm-hit" : undefined;
  const small = { padding: z("5px 10px", "7px 12px"), borderRadius: 8, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-sub)", fontSize: z(12, 14), fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "10px 14px", gap: 8 }}>
      {nl ? <NlBar {...{ item, wide, phone, big, viewMode, onToggleBig, onToggleView, tidy, copyText, printText, sendSomeday, sendToday, sentTask, sentToday,
        toggleStar, togglePin, toggleDone, taskDone: !!task?.done, pickPhoto: uid && item.kind !== "journal" ? () => photoPickRef.current?.() : null, openHistory: () => setShowHist(true), saveTemplate: text.trim() ? saveTemplate : null, dirty: (item.kind === "memo" && tplRef.current !== null && text.trim() === tplRef.current.trim() ? "" : text) !== saved.current.text || title !== saved.current.title, onOpenDate, onDeleteMemo, moreOpen, setMoreOpen }} /> : (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
        <span style={{ fontSize: z(12, 15), fontWeight: 800, color: KIND[item.kind].color }}>{KIND[item.kind].icon} {KIND[item.kind].label}</span>
        <span style={{ fontSize: z(12, 14), color: z("var(--dm-muted)", "var(--dm-sub)") }}>{formatKoreanDate(item.ds)}{item.time ? ` · ${item.time}` : ""}</span>
        <button className={smallHit} onClick={onToggleBig} title={big ? "목록 다시 보기" : "목록을 접고 넓게 쓰기"} style={big ? { ...small, color: ACCENT(nl), borderColor: "var(--dm-accent-soft, rgba(108,142,255,.5))" } : small}>{big ? "⤡ 목록 보기" : "⤢ 크게"}</button>
        <button className={smallHit} onClick={onToggleView} title={viewMode ? "바로 고치는 칸으로" : "제목·체크박스·링크를 읽기 좋게 (더블클릭하면 편집)"} style={viewMode ? { ...small, color: ACCENT(nl), borderColor: "var(--dm-accent-soft, rgba(108,142,255,.5))" } : small}>{viewMode ? "✏️ 편집" : "👁 보기"}</button>
        <span style={{ flex: 1 }} />
        {!viewMode && <button className={smallHit} onClick={tidy.open} title="AI가 메모를 정리 — 내 글과 비교하고 고른 뒤 바꾸기" style={{ ...small, color: "#8B5CF6", borderColor: "rgba(139,92,246,.45)" }}>✨ AI 정리</button>}
        {tidy.ui}
        <button className={smallHit} onMouseDown={e => e.preventDefault()} onClick={copyText} title="내용 전체 복사" style={small}>⧉ 복사</button>
        {canAutoFocus() && <button className={smallHit} onClick={printText} title="A4 종이에 글만 출력 (위에 날짜)" style={small}>🖨 출력</button>}
        {item.kind === "memo" && (
          <button className={smallHit} onClick={toggleStar} style={small}>{item.starred ? "⭐ 즐겨찾기 해제" : "☆ 즐겨찾기"}</button>
        )}
        {item.kind === "memo" && (
          <button className={smallHit} onClick={togglePin} style={small}>{item.pinned ? "📍 고정 풀기" : "📍 위에 고정"}</button>
        )}
        {item.kind === "memo" && <button className={smallHit} onClick={() => setShowHist(true)} style={small}>🕘 이전 내용</button>}
        {item.kind === "memo" && text.trim() && <button className={smallHit} onClick={saveTemplate} style={small}>📄 틀로 저장</button>}
        {/* 커서가 있는 줄(고른 글자가 있으면 그 부분)을 언젠가할일로 — utils/memoToTask.js. 보기 모드엔 커서가 없어 숨김 */}
        {item.kind === "memo" && !viewMode && (
          <button className={smallHit} onMouseDown={e => e.preventDefault()} onClick={sendSomeday} title="커서가 있는 줄(또는 고른 글자)을 언젠가할일로" style={sentTask ? { ...small, color: "#4ADE80", borderColor: "rgba(74,222,128,.5)" } : small}>{sentTask ? "보냄 ✓" : "📋 언젠가로"}</button>
        )}
        {/* 📌 오늘로 (2026-11-10) — 같은 줄을 오늘 할일로 */}
        {item.kind === "memo" && !viewMode && (
          <button className={smallHit} onMouseDown={e => e.preventDefault()} onClick={sendToday} title="커서가 있는 줄(또는 고른 글자)을 오늘 할일로 — 시간·날짜가 쓰여 있으면 그대로" style={sentToday ? { ...small, color: "#5B7CFA", borderColor: "rgba(91,124,250,.5)" } : small}>{sentToday || "📌 오늘로"}</button>
        )}
        {item.kind === "task" && (
          <button className={smallHit} onClick={toggleDone} style={small}>{task?.done ? "✓ 완료됨" : "☐ 완료 표시"}</button>
        )}
        {item.kind === "memo" && window.daymateDesktop?.openSticky && (
          <button className={smallHit} onClick={() => window.daymateDesktop.openSticky(item.ds, item.id)} style={small}>📌 포스트잇으로</button>
        )}
        {onOpenDate && <button className={smallHit} onClick={() => onOpenDate(item.ds)} style={small}>날짜 열기 →</button>}
        {item.kind === "memo" && item.id !== "legacy" && <button className={smallHit} onClick={() => requestMemoLock(item.id, "lock")} style={small}>🔒 잠그기</button>}
        {item.kind === "memo" && <button className={smallHit} onClick={() => onDeleteMemo(item)} style={{ ...small, color: "#F87171", borderColor: "rgba(248,113,113,.35)" }}>🗑 삭제</button>}
      </div>
      )}
      {item.kind === "task" && (
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={60}
          style={{ padding: z("7px 10px", "10px 14px"), borderRadius: z(8, 12), border: nl ? "none" : "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-text)", fontSize: z(14, 16), fontWeight: 700, fontFamily: "inherit", outline: "none", flexShrink: 0 }} />
      )}
      {item.kind === "memo" && !viewMode && <TemplateRow text={text} setText={setText} taRef={textRef} onPick={(t) => { tplRef.current = t; }} onNotice={onError} style={{ flexShrink: 0 }} />}
      {viewMode ? (
        <MemoView text={text} onToggle={(line) => setText(t => toggleCheckAt(t, line))} onTag={onTag}
          onEdit={onToggleView} placeholder={item.kind === "task" ? "일정 메모가 없어요" : "내용이 없어요"} />
      ) : (
      <div style={{ position: "relative", flex: 1, minHeight: 80, display: "flex" }}>
        <textarea ref={textRef} value={text} onChange={e => setText(e.target.value)}
          onPaste={pastePhotos}
          onClick={openLinkOnCtrlClick}
          onKeyDown={e => handleEditorKey(e, () => onError?.("계산할 수식이 없어요 (예: 1500000*12)"))}
          placeholder={item.kind === "task" ? "일정 메모" : item.kind === "journal" ? "일기" : "메모"}
          style={{ flex: 1, minHeight: 80, resize: "none", padding: z("10px 12px", "12px 14px"), borderRadius: z(8, 12), border: nl ? "none" : "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-text)", fontSize: z(14, 16), lineHeight: 1.7, fontFamily: "inherit", outline: "none" }} />
        {/* 링크 자리에 연한 파란 바탕·밑줄 (입력칸 위에 겹친 표시 층) */}
        <LinkOverlay taRef={textRef} text={text} terms={hlTerms} />
        <IndentBar taRef={textRef} />
        <TagSuggest taRef={textRef} tags={tagNames} />
      </div>
      )}
      {/* 편집 칸의 링크를 누를 수 있게 (보기 모드에선 글 속 링크를 바로 누르면 돼서 생략). 휴대폰은 Ctrl+클릭이 없어 이 버튼으로 연다 */}
      {!viewMode && <MemoLinks text={text} hint={canAutoFocus() && !nl ? "Ctrl+클릭으로도 열려요" : ""} style={{ marginTop: 0, marginBottom: 0, flexShrink: 0 }} />}
      {item.kind === "journal" && (journal?.good || journal?.regret || journal?.tomorrow) && (
        <div style={{ fontSize: z(12, 14), color: "var(--dm-sub)", lineHeight: 1.6, flexShrink: 0, maxHeight: z(90, 110), overflowY: "auto" }}>
          {journal.good && <div>😊 잘한 일: {journal.good}</div>}
          {journal.regret && <div>🤔 아쉬운 일: {journal.regret}</div>}
          {journal.tomorrow && <div>➡️ 내일: {journal.tomorrow}</div>}
        </div>
      )}
      {item.kind !== "journal" && (
        <div style={{ flexShrink: 0 }}>
          {uid ? (
            // 새 디자인: 작은 칸(44), 사진이 없으면 ＋ 칸 없이 버튼 줄의 "사진"으로 (2026-11-14 사용자 요청)
            <PhotoGallery uid={uid} pathPrefix={`users/${uid}/memos`} photos={photos} onChange={setPhotos} onError={onError}
              {...(nl ? { tile: 44, emptyAdd: false, openRef: photoPickRef } : {})} />
          ) : photos.length > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
              {photos.map((p, i) => <img key={p.path || i} src={p.url} alt="첨부 사진" onClick={() => setViewer(i)} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, cursor: "zoom-in" }} />)}
            </div>
          )}
        </div>
      )}
      {viewer !== null && <PhotoViewer photos={photos} index={viewer} onClose={() => setViewer(null)} />}
      {showHist && <MemoHistorySheet memoId={item.id} currentText={text} onRestore={(t) => { setText(t); onError?.("🕘 이전 내용으로 되살렸어요"); }} onClose={() => setShowHist(false)} />}
    </div>
  );
}

// ── 새 디자인 편집 칸 버튼 줄 (2026-11-13 사용자 승인, UX-GUIDE 4장) ──
// 상자·색 이모지 대신 색 없는 선 아이콘 + 아래 설명. 자주 쓰는 것(AI 정리·복사·오늘로·언젠가로)만 줄에 두고
// 나머지(출력·포스트잇으로·날짜 열기·잠그기·삭제)는 ⋯ 더보기. 즐겨찾기는 날짜 옆 ☆, 자동 저장 상태를 날짜 아래에.
const ICONS = {
  ai: <><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  today: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /><path d="M9 15l2 2 4-4" /></>,
  someday: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></>,
  done: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 10" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  checks: <><rect x="3.5" y="3.5" width="17" height="17" rx="3.5" /><path d="M8 12.5l2.7 2.7L16 10" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  tag: <><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.1 6.1a1.5 1.5 0 0 1-2.1 0z" /><circle cx="8.3" cy="8.3" r="1.4" /></>,
  photo: <><rect x="3" y="5" width="18" height="15" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M21 16l-5-5-8 9" /></>,
  more: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  template: <><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></>,
  pin: <><path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.2" /></>,
  expand: <><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></>,
  shrink: <><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  pencil: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  print: <><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
  sticky: <><path d="M5 4h14v10l-5 6H5z" /><path d="M14 20v-6h5" /></>,
  date: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17M12 14h4m-2-2l2 2-2 2" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
};
const Ico = ({ name, size = 23, fill }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={fill || "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
);
const savedLabel = (dirty, updatedAt) => {
  if (dirty) return "저장 중…";
  if (!updatedAt) return "자동 저장";
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return "자동 저장";
  const p = (n) => String(n).padStart(2, "0");
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return `저장됨 · ${d.toDateString() === new Date().toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`}`;
};

function NlBar({ item, wide, phone, big, viewMode, onToggleBig, onToggleView, tidy, copyText, printText, sendSomeday, sendToday, sentTask, sentToday,
  toggleStar, togglePin, toggleDone, taskDone, dirty, onOpenDate, onDeleteMemo, moreOpen, setMoreOpen, openHistory, saveTemplate, pickPhoto }) {
  const accent = "var(--dm-accent, #5B7CFA)";
  const memo = item.kind === "memo";
  const [taskOpen, setTaskOpen] = useState(false); // "할일로" → 오늘로·언젠가로 고르기 (2026-11-14)
  useEffect(() => {
    if (!moreOpen && !taskOpen) return;
    const onKey = (e) => { if (e.key === "Escape") { setMoreOpen(false); setTaskOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen, taskOpen, setMoreOpen]);

  // 아이콘 + 아래 설명 (누르는 칸 44, 테두리·바탕 없음). on = 켜진 상태(보냄 등)만 옅은 동그라미
  const tool = (key, icon, label, onClick, { on = false, color = accent, strong = false, keepFocus = false, title } = {}) => (
    <button key={key} onClick={onClick} title={title || label} aria-label={label} onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: wide ? 48 : 0, flex: wide ? "0 1 72px" : "1 1 0", padding: "2px 0",
        background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", WebkitTapHighlightColor: "transparent" }}>
      <span style={{ width: 44, height: 40, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
        background: on || strong ? `color-mix(in srgb, ${color} 16%, transparent)` : "transparent", color: on || strong ? color : "var(--dm-text)", transition: "background .15s" }}>
        <Ico name={icon} />
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, color: on || strong ? color : "var(--dm-sub)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
  // 머리 줄의 작은 버튼 — 넓은 화면은 아이콘만(이름은 마우스를 올리면), 휴대폰은 아이콘 + 옆 글자 (2026-11-14)
  const headBtn = (icon, label, onClick, on, title) => (
    <button onClick={onClick} title={title || label} aria-label={label} aria-pressed={on}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 40, minWidth: 40, padding: wide ? 0 : "0 8px", borderRadius: 10, background: on ? `color-mix(in srgb, ${accent} 14%, transparent)` : "none",
        border: "none", color: on ? accent : "var(--dm-sub)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
      <Ico name={icon} size={wide ? 21 : 19} />{!wide && label}
    </button>
  );

  // 오늘로·언젠가로는 "할일로" 하나로 묶고 누르면 고른다 — 보낸 뒤 잠깐 결과를 버튼 이름에 (2026-11-14)
  const taskSent = sentToday || (sentTask ? "보냄 ✓" : "");
  const tools = [
    !viewMode && tool("ai", "ai", "AI 정리", tidy.open, { strong: true, title: "AI가 메모를 정리 — 내 글과 비교하고 고른 뒤 바꾸기" }),
    tool("copy", "copy", "복사", copyText, { keepFocus: true, title: "내용 전체 복사" }),
    memo && !viewMode && tool("task", "today", taskSent || "할일로", () => { setMoreOpen(false); setTaskOpen(o => !o); }, { on: !!taskSent || taskOpen, keepFocus: true, title: "커서가 있는 줄(또는 고른 글자)을 오늘 할일·언젠가할일로" }),
    item.kind === "task" && tool("done", "done", taskDone ? "완료됨" : "완료", toggleDone, { on: taskDone, color: "#22C55E" }),
    pickPhoto && tool("photo", "photo", "사진", pickPhoto, { title: "사진 추가 (캡처는 Ctrl+V로도 붙어요)" }),
  ].filter(Boolean);
  const popStyle = { position: "absolute", right: 0, top: "100%", marginTop: 4, zIndex: 41, minWidth: 200, padding: 6, borderRadius: 14,
    background: "var(--dm-card)", boxShadow: "0 10px 30px rgba(0,0,0,.35)", border: "1px solid var(--dm-border)" };
  const popItem = (icon, label, run, sub) => (
    <button key={label} role="menuitem" onMouseDown={e => e.preventDefault()} onClick={() => { setTaskOpen(false); run(); }}
      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 48, padding: "0 12px", borderRadius: 10, background: "none", border: "none",
        color: "var(--dm-text)", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
      <span style={{ color: "var(--dm-sub)", display: "flex" }}><Ico name={icon} size={20} /></span>
      <span>{label}<span style={{ display: "block", fontSize: 13, color: "var(--dm-muted)" }}>{sub}</span></span>
    </button>
  );

  // ⋯ 더보기 — 가끔 쓰는 것. 삭제는 맨 아래 빨간 글자
  const menu = [
    canAutoFocus() && { icon: "print", label: "출력 (A4)", run: printText },
    memo && window.daymateDesktop?.openSticky && { icon: "sticky", label: "포스트잇으로 열기", run: () => window.daymateDesktop.openSticky(item.ds, item.id) },
    onOpenDate && { icon: "date", label: "그 날짜 열기", run: () => onOpenDate(item.ds) },
    memo && { icon: "history", label: "이전 내용", run: openHistory },
    memo && saveTemplate && { icon: "template", label: "이 글을 틀로 저장", run: saveTemplate },
    memo && item.id !== "legacy" && { icon: "lock", label: "잠그기", run: () => requestMemoLock(item.id, "lock") },
    memo && { icon: "trash", label: "삭제", run: () => onDeleteMemo(item), danger: true },
  ].filter(Boolean);

  return (
    // 넓은 화면은 한 줄(줄바꿈 없음): 머리는 남는 자리만(기준 0), 기능 버튼은 모자라면 줄어든다 — 오른쪽으로 잘려 나가지 않게
    // (2026-11-13 데스크탑 앱에서 머리가 내용보다 넓게 잡혀 버튼이 창 밖으로 밀린 제보)
    <div style={{ display: "flex", flexWrap: wide ? "nowrap" : "wrap", alignItems: "center", columnGap: 6, rowGap: 6, flexShrink: 0, minWidth: 0 }}>
      {/* 머리: 종류·날짜 / 저장 상태 · ☆ · 크게 · 보기 */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, flex: wide ? "1 1 0" : "1 1 100%", minWidth: 0, overflow: wide ? "hidden" : undefined }}>
        <div style={{ minWidth: 0, marginRight: 2 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--dm-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span style={{ color: KIND[item.kind].color }}>{KIND[item.kind].label}</span>
            <span style={{ color: "var(--dm-sub)", fontWeight: 500 }}> · {formatKoreanDate(item.ds)}{item.time ? ` · ${item.time}` : ""}</span>
          </div>
          <div style={{ fontSize: 13, color: dirty ? accent : "var(--dm-muted)", marginTop: 1, whiteSpace: "nowrap" }}>{savedLabel(dirty, item.updatedAt)}</div>
        </div>
        {memo && (
          <button onClick={toggleStar} aria-label={item.starred ? "즐겨찾기 해제" : "즐겨찾기"} title={item.starred ? "즐겨찾기 해제" : "즐겨찾기"} aria-pressed={!!item.starred}
            style={{ width: 40, height: 40, padding: 0, flexShrink: 0, borderRadius: 999, background: "none", border: "none", cursor: "pointer",
              color: item.starred ? "#F5B400" : "var(--dm-sub)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ico name="star" size={22} fill={item.starred ? "currentColor" : undefined} />
          </button>
        )}
        {memo && (
          <button onClick={togglePin} aria-label={item.pinned ? "고정 풀기" : "위에 고정"} title={item.pinned ? "고정 풀기" : "목록·메모 탭 맨 위에 고정"} aria-pressed={!!item.pinned}
            style={{ width: 40, height: 40, padding: 0, flexShrink: 0, borderRadius: 999, background: "none", border: "none", cursor: "pointer",
              color: item.pinned ? "#EF4444" : "var(--dm-sub)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ico name="pin" size={22} fill={item.pinned ? "currentColor" : undefined} />
          </button>
        )}
        <span style={{ flex: 1 }} />
        {/* 휴대폰은 편집 화면이 따로라 "‹ 목록"(돌아가기) — 켜진 표시 없이 (2026-11-14) */}
        {!phone ? headBtn(big ? "shrink" : "expand", big ? "목록" : "크게", onToggleBig, big, big ? "목록 다시 보기" : "목록을 접고 넓게 쓰기")
          : headBtn("back", "목록", onToggleBig, false, "목록으로 돌아가기")}
        {headBtn(viewMode ? "pencil" : "eye", viewMode ? "편집" : "보기", onToggleView, viewMode, viewMode ? "바로 고치는 칸으로" : "제목·체크박스·링크를 읽기 좋게 (더블클릭하면 편집)")}
      </div>
      {/* 기능 줄 */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: wide ? 0 : 2, flex: wide ? `0 1 ${(tools.length + (menu.length ? 1 : 0)) * 72}px` : "1 1 100%", minWidth: 0, position: "relative" }}>
        {tools}
        {menu.length > 0 && tool("more", "more", "더보기", () => { setTaskOpen(false); setMoreOpen(o => !o); }, { on: moreOpen, color: "var(--dm-text)" })}
        {taskOpen && (
          <>
            <div onClick={() => setTaskOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div role="menu" style={popStyle}>
              {popItem("today", "오늘 할일로", sendToday, "시간·날짜가 쓰여 있으면 그대로")}
              {popItem("someday", "언젠가할일로", sendSomeday, "커서가 있는 줄(또는 고른 글자)")}
            </div>
          </>
        )}
        {moreOpen && (
          <>
            <div onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div role="menu" style={popStyle}>
              {menu.map((m, i) => (
                <div key={m.label}>
                  {m.danger && i > 0 && <div style={{ height: 1, background: "var(--dm-border)", margin: "4px 6px" }} />}
                  <button role="menuitem" onClick={() => { setMoreOpen(false); m.run(); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 10, background: "none", border: "none",
                      color: m.danger ? "#F87171" : "var(--dm-text)", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    <span style={{ color: m.danger ? "#F87171" : "var(--dm-sub)", display: "flex" }}><Ico name={m.icon} size={20} /></span>{m.label}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {tidy.ui}
    </div>
  );
}
