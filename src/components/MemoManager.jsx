import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PhotoGallery from "./PhotoGallery.jsx";
import PhotoViewer from "./PhotoViewer.jsx";
import { genMemoId, getMemoTimeStr, withMemoList } from "./MemoTimeline.jsx";
import { buildManagerItems, BASE_FILTERS, topTags, filterItems, sortItems } from "../utils/memoManager.js";
import { toDateStr, formatKoreanDate } from "../utils/date.js";

const KIND = {
  memo: { icon: "📝", label: "메모", color: "#6C8EFF" },
  task: { icon: "📅", label: "일정", color: "#4ADE80" },
  journal: { icon: "📖", label: "일기", color: "#A78BFA" },
};
const PAGE = 300;

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
export default function MemoManager({ plans, onUpdateDayData, uid, onClose, onOpenDate, onError }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [selectedKey, setSelectedKey] = useState(null);
  const [limit, setLimit] = useState(PAGE);
  const [wide, setWide] = useState(() => window.innerWidth >= 900);
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const items = useMemo(() => buildManagerItems(plans), [plans]);
  const tags = useMemo(() => topTags(items), [items]);
  const list = useMemo(() => sortItems(filterItems(items, filter, query), sort), [items, filter, query, sort]);
  const selected = items.find(it => it.key === selectedKey) || null;
  const selIndex = list.findIndex(it => it.key === selectedKey);

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
  };
  const deleteMemo = (it) => {
    if (!window.confirm(`"${it.title}" 메모를 삭제할까요?`)) return;
    onUpdateDayData(it.ds, prev => {
      const next = updateMemoIn(prev, it.id, {});
      return { ...next, memos: next.memos.filter(m => m.id !== it.id) };
    });
    setSelectedKey(null);
  };

  const ink = { color: "var(--dm-text)" };
  const muted = { color: "var(--dm-muted)" };
  const border = "1px solid var(--dm-border)";

  const filterButton = (id, label, icon) => {
    const active = filter === id;
    return (
      <button key={id} onClick={() => changeFilter(id)}
        style={wide
          ? { display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "6px 10px", borderRadius: 6, border: "none", background: active ? "rgba(108,142,255,.18)" : "transparent", color: active ? "#6C8EFF" : "var(--dm-text)", fontWeight: active ? 800 : 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }
          : { flexShrink: 0, padding: "5px 10px", borderRadius: 14, border: active ? "1.5px solid #6C8EFF" : border, background: active ? "rgba(108,142,255,.15)" : "var(--dm-input)", color: active ? "#6C8EFF" : "var(--dm-sub)", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
        <span>{icon}</span> {label}
      </button>
    );
  };
  const filters = (
    <>
      {BASE_FILTERS.map(f => filterButton(f.id, f.label, f.icon))}
      {tags.length > 0 && wide && <div style={{ ...muted, fontSize: 11, fontWeight: 700, padding: "12px 10px 4px" }}>태그</div>}
      {tags.map(t => filterButton(`#${t.name}`, `${t.name} (${t.n})`, "#"))}
    </>
  );

  const th = (key, label, style) => (
    <th onClick={() => toggleSort(key)} style={{ textAlign: "left", padding: "7px 8px", fontSize: 12, fontWeight: 700, ...muted, cursor: "pointer", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--dm-bg)", borderBottom: border, userSelect: "none", ...style }}>
      {label}{sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
  const table = (
    <div tabIndex={0} onKeyDown={onListKey} style={{ flex: 1, minHeight: 0, overflow: "auto", outline: "none" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            {th("kind", "", { width: 30 })}
            {th("title", "제목")}
            {th("date", "날짜", { width: wide ? 150 : 96 })}
            {wide && th("updated", "수정일", { width: 130 })}
            {wide && <th style={{ width: 150, textAlign: "left", padding: "7px 8px", fontSize: 12, fontWeight: 700, ...muted, position: "sticky", top: 0, background: "var(--dm-bg)", borderBottom: border }}>태그</th>}
            {th("photo", "📷", { width: 40 })}
          </tr>
        </thead>
        <tbody>
          {list.slice(0, limit).map(it => {
            const active = it.key === selectedKey;
            return (
              <tr key={it.key} ref={el => { rowRefs.current[it.key] = el; }} onClick={() => select(it.key)}
                style={{ cursor: "pointer", background: active ? "rgba(108,142,255,.2)" : "transparent", borderBottom: "1px solid var(--dm-row)" }}>
                <td style={{ padding: "6px 8px", fontSize: 13 }} title={KIND[it.kind].label}>{KIND[it.kind].icon}</td>
                <td style={{ padding: "6px 8px", fontSize: 13, ...ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: it.done ? "line-through" : "none", opacity: it.done ? 0.6 : 1 }}>
                  {it.starred && "⭐ "}{it.title}
                </td>
                <td style={{ padding: "6px 8px", fontSize: 12, ...muted, whiteSpace: "nowrap" }}>{wide ? it.ds : it.ds.slice(2)}{wide && it.time ? ` ${it.time}` : ""}</td>
                {wide && <td style={{ padding: "6px 8px", fontSize: 12, ...muted, whiteSpace: "nowrap" }}>{fmtUpdated(it.updatedAt)}</td>}
                {wide && <td style={{ padding: "6px 8px", fontSize: 12, color: "#6C8EFF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.tags.map(t => `#${t}`).join(" ")}</td>}
                <td style={{ padding: "6px 8px", fontSize: 12, ...muted }}>{it.photos.length || ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {list.length > limit && (
        <button onClick={() => setLimit(l => l + PAGE)} style={{ display: "block", margin: "10px auto", padding: "6px 16px", borderRadius: 8, border, background: "var(--dm-input)", ...muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          더 보기 ({list.length - limit}개 남음)
        </button>
      )}
      {list.length === 0 && <div style={{ padding: 30, textAlign: "center", ...muted, fontSize: 13 }}>{query.trim() ? "검색 결과가 없어요" : "기록이 없어요"}</div>}
    </div>
  );

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 900, background: "var(--dm-bg)", display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
      {/* 상단: 닫기 · 새 메모 · 검색 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: border, flexShrink: 0, flexWrap: wide ? "nowrap" : "wrap" }}>
        <button onClick={onClose} style={{ padding: "6px 12px", borderRadius: 8, border, background: "var(--dm-input)", ...ink, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>← 닫기</button>
        <div style={{ fontSize: 15, fontWeight: 900, ...ink, flexShrink: 0, marginRight: 6 }}>🗂 메모 관리자</div>
        <button onClick={addMemo} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(250,204,21,.6)", background: "rgba(250,204,21,.18)", ...ink, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>＋ 새 메모</button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 200 }}>
          <input value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE); }}
            onKeyDown={e => { if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); move(1); } else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); } }}
            placeholder="검색 (메모·일정·일기)" autoFocus
            style={{ flex: 1, minWidth: 0, padding: "7px 10px", borderRadius: 8, border, background: "var(--dm-input)", ...ink, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <button onClick={() => move(1)} aria-label="다음" style={{ width: 30, height: 30, padding: 0, borderRadius: 8, border, background: "var(--dm-input)", color: "#6C8EFF", cursor: "pointer", fontSize: 13 }}>▼</button>
          <button onClick={() => move(-1)} aria-label="이전" style={{ width: 30, height: 30, padding: 0, borderRadius: 8, border, background: "var(--dm-input)", color: "#6C8EFF", cursor: "pointer", fontSize: 13 }}>▲</button>
          <span style={{ fontSize: 12, ...muted, whiteSpace: "nowrap" }}>{list.length}개</span>
        </div>
      </div>

      {wide ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <div style={{ width: 200, flexShrink: 0, borderRight: border, overflowY: "auto", padding: 8 }}>{filters}</div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: "1 1 45%", minHeight: 0, display: "flex", flexDirection: "column", borderBottom: border }}>{table}</div>
            <div style={{ flex: "1 1 55%", minHeight: 0, display: "flex", flexDirection: "column" }}>
              <DetailPane key={selected?.key || "none"} item={selected} plans={plans} onUpdateDayData={onUpdateDayData} uid={uid} onError={onError} onOpenDate={onOpenDate} onDeleteMemo={deleteMemo} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 12px", flexShrink: 0 }}>{filters}</div>
          <div style={{ flex: "1 1 40%", minHeight: 0, display: "flex", flexDirection: "column", borderTop: border, borderBottom: border }}>{table}</div>
          <div style={{ flex: "1 1 60%", minHeight: 0, display: "flex", flexDirection: "column" }}>
            <DetailPane key={selected?.key || "none"} item={selected} plans={plans} onUpdateDayData={onUpdateDayData} uid={uid} onError={onError} onOpenDate={onOpenDate} onDeleteMemo={deleteMemo} />
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

// 선택한 항목 바로 편집 — 글은 입력을 멈추면(0.7초) 저장하고, 다른 항목을 고르거나 닫을 때도 저장한다
function DetailPane({ item, plans, onUpdateDayData, uid, onError, onOpenDate, onDeleteMemo }) {
  const day = item ? plans[item.ds] : null;
  const task = item?.kind === "task" ? (day?.tasks || []).find(t => t.id === item.id) : null;
  const journal = item?.kind === "journal" ? (day?.journal || {}) : null;
  const initial = item?.kind === "memo" ? item.text : item?.kind === "task" ? (task?.note || "") : (journal?.body || "");
  const [text, setText] = useState(initial);
  const [title, setTitle] = useState(task?.title || "");
  const [viewer, setViewer] = useState(null);

  const saved = useRef({ text: initial, title: task?.title || "" });
  const save = (t, ti) => {
    if (!item) return;
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

  if (!item) {
    return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dm-muted)", fontSize: 13, padding: 20, textAlign: "center" }}>목록에서 항목을 고르면 여기서 바로 보고 고칠 수 있어요.<br />↑↓ 키로 이동할 수 있어요.</div>;
  }

  const memo = item.kind === "memo" ? (day?.memos?.length ? day.memos : []).find(m => m.id === item.id) : null;
  const photos = item.kind === "memo" ? (memo?.photos || []) : item.kind === "task" ? (task?.photos || []) : [];
  const setPhotos = (next) => {
    if (item.kind === "memo") onUpdateDayData(item.ds, prev => updateMemoIn(prev, item.id, { photos: next }));
    else if (item.kind === "task") onUpdateDayData(item.ds, prev => ({ ...prev, tasks: (prev.tasks || []).map(x => (x.id === item.id ? { ...x, photos: next } : x)) }));
  };
  const small = { padding: "5px 10px", borderRadius: 8, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-sub)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "10px 14px", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: KIND[item.kind].color }}>{KIND[item.kind].icon} {KIND[item.kind].label}</span>
        <span style={{ fontSize: 12, color: "var(--dm-muted)" }}>{formatKoreanDate(item.ds)}{item.time ? ` · ${item.time}` : ""}</span>
        <span style={{ flex: 1 }} />
        {item.kind === "memo" && (
          <button onClick={() => onUpdateDayData(item.ds, prev => updateMemoIn(prev, item.id, { starred: !item.starred }))} style={small}>{item.starred ? "⭐ 즐겨찾기 해제" : "☆ 즐겨찾기"}</button>
        )}
        {item.kind === "task" && (
          <button onClick={() => onUpdateDayData(item.ds, prev => ({ ...prev, tasks: (prev.tasks || []).map(x => (x.id === item.id ? { ...x, done: !x.done } : x)) }))} style={small}>{task?.done ? "✓ 완료됨" : "☐ 완료 표시"}</button>
        )}
        {item.kind === "memo" && window.daymateDesktop?.openSticky && (
          <button onClick={() => window.daymateDesktop.openSticky(item.ds, item.id)} style={small}>📌 포스트잇으로</button>
        )}
        {onOpenDate && <button onClick={() => onOpenDate(item.ds)} style={small}>날짜 열기 →</button>}
        {item.kind === "memo" && <button onClick={() => onDeleteMemo(item)} style={{ ...small, color: "#F87171", borderColor: "rgba(248,113,113,.35)" }}>🗑 삭제</button>}
      </div>
      {item.kind === "task" && (
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={60}
          style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-text)", fontSize: 14, fontWeight: 700, fontFamily: "inherit", outline: "none", flexShrink: 0 }} />
      )}
      <textarea value={text} onChange={e => setText(e.target.value)}
        placeholder={item.kind === "task" ? "일정 메모" : item.kind === "journal" ? "일기" : "메모"}
        style={{ flex: 1, minHeight: 80, resize: "none", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-text)", fontSize: 14, lineHeight: 1.7, fontFamily: "inherit", outline: "none" }} />
      {item.kind === "journal" && (journal?.good || journal?.regret || journal?.tomorrow) && (
        <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.6, flexShrink: 0, maxHeight: 90, overflowY: "auto" }}>
          {journal.good && <div>😊 잘한 일: {journal.good}</div>}
          {journal.regret && <div>🤔 아쉬운 일: {journal.regret}</div>}
          {journal.tomorrow && <div>➡️ 내일: {journal.tomorrow}</div>}
        </div>
      )}
      {item.kind !== "journal" && (
        <div style={{ flexShrink: 0 }}>
          {uid ? (
            <PhotoGallery uid={uid} pathPrefix={`users/${uid}/memos`} photos={photos} onChange={setPhotos} onError={onError} />
          ) : photos.length > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
              {photos.map((p, i) => <img key={p.path || i} src={p.url} alt="첨부 사진" onClick={() => setViewer(i)} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, cursor: "zoom-in" }} />)}
            </div>
          )}
        </div>
      )}
      {viewer !== null && <PhotoViewer photos={photos} index={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
