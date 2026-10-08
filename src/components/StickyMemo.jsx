import { useEffect, useRef, useState } from "react";
import PhotoViewer from "./PhotoViewer.jsx";
import { genMemoId, getMemoTimeStr } from "./MemoTimeline.jsx";
import { newDay, loadDay, saveDay, dayKey } from "../data/model.js";
import { markDayUnsynced } from "../utils/daySync.js";
import { toDateStr } from "../utils/date.js";
import { compressImage, photoErrorMessage } from "../utils/image.js";
import { handleEditorKey } from "../utils/editorAssist.js";
import { urlAt, openLink, findAll } from "../utils/links.js";
import LinkOverlay from "./LinkOverlay.jsx";
import { APP_VERSION } from "../version.js";
import MemoSettings from "./MemoSettings.jsx";

// 데스크탑 앱의 바탕화면 포스트잇 창 (?view=sticky) — 메모잇의 간편 메모처럼 작은 노란 창.
// 앱 전체를 띄우지 않고 이 PC 저장소(localStorage)의 오늘/해당 날짜 메모만 읽고 쓴다.
// 서버 저장은 트레이에 떠 있는 메인 창이 storage 이벤트로 받아서 대신 한다(App.jsx).
const desktop = () => window.daymateDesktop;
// 데스크탑 앱이면 앱이 창을 닫고(목록에서 정리), 브라우저면 그냥 창 닫기
const closeWindow = (info) => { if (desktop()?.stickyClose) desktop().stickyClose(info); else window.close(); };

// 포스트잇 색 (메모잇처럼 여러 색) — 메모의 color 칸에 저장. 글자는 항상 검은색
const STICKY_COLORS = {
  yellow: { name: "노랑", bg: "#FFF7A8", bar: "#F5E97A", line: "#E8D95A", sub: "#8a7400" },
  pink: { name: "분홍", bg: "#FFDDEA", bar: "#FFC2D8", line: "#F2A9C4", sub: "#9a3d63" },
  blue: { name: "하늘", bg: "#DCEFFF", bar: "#BFE1FF", line: "#A3CFF2", sub: "#2f5f8a" },
  green: { name: "연두", bg: "#E2F7D6", bar: "#C8EDB5", line: "#AEDD96", sub: "#3f6b2a" },
  purple: { name: "보라", bg: "#ECE2FF", bar: "#DACBFF", line: "#C4B0F2", sub: "#5a3f96" },
  orange: { name: "주황", bg: "#FFE6C9", bar: "#FFD3A3", line: "#F2BD85", sub: "#8a5214" },
  gray: { name: "회색", bg: "#EEEEEE", bar: "#DDDDDD", line: "#C9C9C9", sub: "#555555" },
  white: { name: "흰색", bg: "#FFFFFF", bar: "#F1F1F1", line: "#DDDDDD", sub: "#666666" },
};

const memoListOf = (day) => (day?.memos?.length ? day.memos : (day?.memo?.trim() ? [{ id: "legacy", text: day.memo.trim(), createdAt: "" }] : []));
const findMemo = (ds, id) => memoListOf(loadDay(ds)).find(m => m.id === id) || null;

function writeMemo(ds, id, patchOrRemove) {
  const day = loadDay(ds) || newDay(ds);
  const list = memoListOf(day);
  const memos = patchOrRemove === null
    ? list.filter(m => m.id !== id)
    : list.map(m => (m.id === id ? { ...m, ...patchOrRemove, updatedAt: new Date().toISOString() } : m));
  // 지운 메모는 휴지통으로 (앱의 저장 경로를 거치지 않으므로 여기서 직접) — 빈 메모는 제외
  const gone = patchOrRemove === null ? list.find(m => m.id === id) : null;
  const trashed = gone && (gone.text?.trim() || gone.photos?.length || gone.files?.length)
    ? { memoTrash: [...(day.memoTrash || []), { ...gone, deletedAt: new Date().toISOString() }] } : {};
  saveDay(ds, { ...day, memos, ...trashed });
  markDayUnsynced(ds, true);
}

export default function StickyMemo() {
  const [target] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("new") === "1") {
      // 새 간편 메모 — 오늘 날짜 메모로 바로 만든다 (작성 시각 자동 기록)
      const ds = toDateStr();
      const id = genMemoId();
      const day = loadDay(ds) || newDay(ds);
      saveDay(ds, { ...day, memos: [...memoListOf(day), { id, text: "", createdAt: getMemoTimeStr(), updatedAt: new Date().toISOString() }] });
      markDayUnsynced(ds, true);
      window.history.replaceState(null, "", `?view=sticky&ds=${ds}&id=${id}&pin=${q.get("pin") === "1" ? 1 : 0}`);
      desktop()?.stickyCreated?.({ ds, id });
      return { ds, id, isNew: true };
    }
    return { ds: q.get("ds"), id: q.get("id"), isNew: false };
  });
  const { ds, id } = target;
  const isNewRef = useRef(target.isNew); // 새로 만든 메모 — 비워 둔 채 닫으면 지운다
  const [memo, setMemo] = useState(() => findMemo(ds, id));
  const lastMemoRef = useRef(memo); // 다른 곳에서 지워졌을 때 되살리기용 마지막 모습
  useEffect(() => { if (memo) lastMemoRef.current = memo; }, [memo]);
  const [text, setText] = useState(() => findMemo(ds, id)?.text || "");
  const [pinned, setPinned] = useState(() => new URLSearchParams(window.location.search).get("pin") === "1");
  const [folded, setFolded] = useState(() => new URLSearchParams(window.location.search).get("fold") === "1");
  const [showColors, setShowColors] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false); // 삭제 확인 — 윈도우 기본 확인창은 메모와 먼 곳에 떠서 창 안에 직접 그린다
  const [status, setStatus] = useState("");
  const [viewer, setViewer] = useState(null);
  const [uid, setUid] = useState(null);
  // 투명도(데스크탑 1.3.1~) — 앱이 기억해 둔 값을 주소(op)로 넘겨준다
  const [opacity, setOpacityState] = useState(() => Number(new URLSearchParams(window.location.search).get("op")) || 1);
  const [showOpacity, setShowOpacity] = useState(false);
  // 포스트잇 안 찾기 (Ctrl+F) — 찾은 곳은 글 뒤에 깐 같은 모양의 층(backdrop)에 형광펜으로 표시
  const [find, setFind] = useState(null); // null = 닫힘, { q, i }
  const taRef = useRef(null);
  const backRef = useRef(null);
  const findInputRef = useRef(null);
  const [taBox, setTaBox] = useState({ w: 0, h: 0 });

  // 작은 창이라 앱 공통 스타일(body 최소 너비 320px 등) 때문에 스크롤바가 생기지 않게
  useEffect(() => {
    document.title = "DayMate 메모";
    for (const el of [document.documentElement, document.body]) { el.style.overflow = "hidden"; el.style.minWidth = "0"; }
  }, []);

  // 사진 붙여넣기용 로그인 정보 (메인 창과 같은 로그인을 공유)
  useEffect(() => {
    let unsub = () => {};
    import("../firebase.js").then(({ onAuth }) => { unsub = onAuth(u => setUid(u?.uid || null)); }).catch(() => {});
    return () => unsub();
  }, []);

  // 입력 저장 — 0.5초 멈추면 저장, 창을 닫을 때도 저장
  const typedAt = useRef(0);
  const saved = useRef(text);
  const flush = (t) => {
    if (t === saved.current || !findMemo(ds, id)) return;
    saved.current = t;
    writeMemo(ds, id, { text: t });
  };
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
    const h = setTimeout(() => flush(text), 500);
    return () => clearTimeout(h);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // 닫을 때: 저장하고, 새로 만든 메모를 비워 둔 채 닫으면 지운다
  const onLeave = () => {
    flush(textRef.current);
    const m = findMemo(ds, id);
    if (isNewRef.current && m && !m.text?.trim() && !m.photos?.length && !m.files?.length) writeMemo(ds, id, null);
  };
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  useEffect(() => {
    const h = () => onLeaveRef.current();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  // 다른 창·휴대폰에서 바뀐 내용 반영 (입력 중이면 잠깐 기다림)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== dayKey(ds)) return;
      const m = findMemo(ds, id);
      setMemo(m);
      if (m && Date.now() - typedAt.current > 1500 && m.text !== textRef.current) {
        saved.current = m.text || "";
        setText(m.text || "");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [ds, id]);

  // 이 창에 남아 있는 내용으로 메모를 다시 만든다 (같은 id)
  const restore = () => {
    const day = loadDay(ds) || newDay(ds);
    const base = lastMemoRef.current || { id, createdAt: getMemoTimeStr() };
    saveDay(ds, { ...day, memos: [...memoListOf(day), { ...base, id, text: textRef.current, updatedAt: new Date().toISOString() }] });
    markDayUnsynced(ds, true);
    saved.current = textRef.current;
    setMemo(findMemo(ds, id));
  };

  const flash = (msg) => { setStatus(msg); setTimeout(() => setStatus(""), 1800); };
  const patch = (p) => { writeMemo(ds, id, p); setMemo(findMemo(ds, id)); };

  // 캡처한 이미지 Ctrl+V → 사진으로 첨부
  const onPaste = async (e) => {
    const files = [...(e.clipboardData?.items || [])].filter(it => it.type.startsWith("image/")).map(it => it.getAsFile()).filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    if (!uid) { flash("사진은 로그인 후 붙일 수 있어요"); return; }
    flash("사진 올리는 중…");
    try {
      const { uploadPhoto } = await import("../firebase.js");
      const uploaded = await Promise.all(files.map(async (f) => {
        const blob = await compressImage(f);
        return uploadPhoto(`users/${uid}/memos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`, blob, uid);
      }));
      patch({ photos: [...(findMemo(ds, id)?.photos || []), ...uploaded] });
      flash("사진을 붙였어요");
    } catch (err) {
      flash(photoErrorMessage(err));
    }
  };

  const copyAll = async () => {
    try { await navigator.clipboard.writeText(text); flash("복사했어요"); } catch { flash("복사하지 못했어요"); }
  };
  const remove = () => {
    setConfirmDel(false);
    writeMemo(ds, id, null);
    isNewRef.current = false;
    closeWindow({ deleted: true });
  };
  const close = () => { onLeave(); closeWindow({}); };
  // 접기/펼치기 — 창을 제목줄 높이로 줄인다(크기는 데스크탑 앱이 조절·기억)
  const toggleFold = async () => {
    if (!desktop()?.fold) return;
    const next = await desktop().fold(!folded);
    if (typeof next === "boolean") setFolded(next);
  };
  const togglePin = async () => {
    const next = await desktop()?.togglePin?.();
    if (typeof next === "boolean") setPinned(next);
  };

  const changeOpacity = async (v) => {
    const next = await desktop()?.setStickyOpacity?.(v);
    if (typeof next === "number") setOpacityState(next);
  };

  // ---- 찾기 ----
  const matches = find ? findAll(text, find.q) : [];
  const cur = matches.length ? Math.min(find.i, matches.length - 1) : -1;
  const openFind = () => {
    const ta = taRef.current;
    const sel = ta && ta.selectionEnd > ta.selectionStart ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : "";
    setFind(f => ({ q: sel && !sel.includes("\n") ? sel : (f?.q || ""), i: 0 }));
    setTimeout(() => { findInputRef.current?.focus(); findInputRef.current?.select(); }, 0);
  };
  // 닫을 때 지금 찾은 곳을 선택한 채로 글 칸으로 돌아간다
  const closeFind = () => {
    const ta = taRef.current;
    if (ta && cur >= 0) { ta.focus(); ta.setSelectionRange(matches[cur], matches[cur] + find.q.length); }
    else ta?.focus();
    setFind(null);
  };
  const stepFind = (d) => setFind(f => (f && matches.length ? { ...f, i: (Math.min(f.i, matches.length - 1) + d + matches.length) % matches.length } : f));
  // 찾은 곳이 보이게 글 칸을 스크롤 (표시 층의 형광펜 위치로 계산)
  useEffect(() => {
    if (cur < 0) return;
    const mark = backRef.current?.querySelector("mark[data-cur]");
    const ta = taRef.current;
    if (!mark || !ta) return;
    const top = mark.offsetTop, h = mark.offsetHeight;
    if (top < ta.scrollTop + 8 || top + h > ta.scrollTop + ta.clientHeight - 8) ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);
    if (backRef.current) backRef.current.scrollTop = ta.scrollTop;
  }, [cur, find?.q, text]);
  // 표시 층 크기는 글 칸의 실제 글 영역(스크롤바 제외)에 맞춘다 — 줄바꿈 위치가 같아야 형광펜이 제자리에 온다
  useEffect(() => {
    const ta = taRef.current;
    if (!find || !ta) return;
    const measure = () => setTaBox({ w: ta.clientWidth, h: ta.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ta);
    return () => ro.disconnect();
  }, [find !== null, text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === "KeyF") { e.preventDefault(); openFind(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // 매번 최신 openFind로

  // 링크: Ctrl+클릭으로 열기, 그냥 누르면 방법을 알려 준다
  const onTextClick = (e) => {
    const ta = e.currentTarget;
    const url = urlAt(ta.value, ta.selectionStart);
    if (!url) return;
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); openLink(url); flash("링크를 열었어요"); }
    else flash("Ctrl+클릭하면 링크가 열려요");
  };

  // 포스트잇 창 안 단축키 — 데스크탑 앱이 키를 받아 동작 이름을 보내 준다(키 설정은 트레이 → 단축키 설정)
  const actionsRef = useRef({});
  // 삭제 확인·찾기 등이 열려 있으면 접기 키(기본 Esc)가 그것을 닫는다
  actionsRef.current = { fold: confirmDel ? () => setConfirmDel(false) : find ? closeFind : showSettings ? () => setShowSettings(false) : showOpacity ? () => setShowOpacity(false) : showMenu ? () => setShowMenu(false) : toggleFold, close, pin: togglePin, copy: copyAll };
  const [keys, setKeys] = useState({});
  useEffect(() => {
    const d = desktop();
    if (!d?.onStickyKey) return;
    const loadKeys = () => d.getStickyKeys?.().then(setKeys).catch(() => {});
    loadKeys();
    const offKey = d.onStickyKey(a => actionsRef.current[a]?.());
    const offChanged = d.onStickyKeysChanged?.(loadKeys);
    return () => { offKey(); offChanged?.(); };
  }, []);
  const withKey = (label, k) => (keys[k] ? `${label} (${keys[k]})` : label);

  const c = STICKY_COLORS[memo?.color] || STICKY_COLORS.yellow;
  const iconBtn = { width: 24, height: 24, padding: 0, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, lineHeight: 1, borderRadius: 4, WebkitAppRegion: "no-drag", color: "#333", flexShrink: 0 };
  const photos = memo?.photos || [];

  if (!memo) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#FFF7A8", color: "#5b4a00", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 13, fontFamily: "inherit" }}>
        이 메모는 삭제되었어요.
        <div style={{ display: "flex", gap: 8 }}>
          {text.trim() && <button onClick={restore} style={{ ...iconBtn, width: "auto", padding: "4px 12px", background: "#F5E97A" }}>되살리기</button>}
          <button onClick={() => closeWindow({ deleted: true })} style={{ ...iconBtn, width: "auto", padding: "4px 12px", background: "#F5E97A" }}>닫기</button>
        </div>
      </div>
    );
  }

  if (memo.locked) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#FFF7A8", color: "#5b4a00", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 13, fontFamily: "inherit", padding: 12, textAlign: "center" }}>
        🔒 잠긴 메모는 포스트잇으로 열 수 없어요.
        <button onClick={() => closeWindow({})} style={{ ...iconBtn, width: "auto", padding: "4px 12px", background: "#F5E97A" }}>닫기</button>
      </div>
    );
  }

  const firstLine = text.split("\n").map(l => l.trim()).find(Boolean) || "";
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: c.bg, color: "#000", fontFamily: "inherit", border: `1px solid ${c.line}` }}>
      {/* 제목줄: 끌어서 옮기기, 더블클릭으로 접기/펼치기. 접히면 창 전체(윈도우 최소 높이 39px)를 채움 */}
      <div onDoubleClick={toggleFold}
        style={{ display: "flex", alignItems: "center", gap: 1, height: folded ? "100%" : 28, padding: "0 4px 0 8px", background: c.bar, WebkitAppRegion: "drag", flexShrink: 0, userSelect: "none" }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: folded ? 12 : 11, fontWeight: folded ? 700 : 400, color: folded ? "#000" : c.sub, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {status || (folded && firstLine) || `${ds.slice(5).replace("-", "/")} ${memo.createdAt || ""}`}
        </span>
        {!folded && desktop() && <button onClick={() => desktop().newSticky()} title={withKey("새 메모", "new")} style={iconBtn}>＋</button>}
        {!folded && desktop() && <button onClick={togglePin} title={withKey(pinned ? "항상 위 해제" : "항상 위에 고정", "pin")} style={{ ...iconBtn, opacity: pinned ? 1 : 0.4 }}>📌</button>}
        {/* 색·즐겨찾기·복사·삭제는 ⋯ 메뉴로 — 제목줄 빈 자리(끌어서 옮기는 곳)를 넓게 남긴다 */}
        {!folded && <button onClick={() => setShowMenu(v => !v)} title="더 보기 (색·즐겨찾기·복사·삭제)" style={{ ...iconBtn, fontWeight: 900, background: showMenu ? c.line : "transparent" }}>⋯</button>}
        {/* 접기/펼치기는 항상 닫기 바로 왼쪽 — 접은 자리에서 그대로 다시 펼 수 있게 */}
        {desktop()?.fold && <button onClick={toggleFold} title={folded ? withKey("펼치기", "fold") : withKey("접기", "fold") + " · 제목줄 더블클릭도 가능"} style={iconBtn}>{folded ? "▾" : "−"}</button>}
        <button onClick={close} title={withKey("닫기", "close") + " · 메모는 남아요"} style={iconBtn}>✕</button>
      </div>
      {showMenu && !folded && (
        <>
          <div onClick={() => setShowMenu(false)} style={{ position: "absolute", inset: 0, zIndex: 9 }} />
          <div role="menu" style={{ position: "absolute", top: 30, right: 4, zIndex: 10, background: "#fff", color: "#000", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.25)", padding: 4, minWidth: 150 }}>
            {[
              ["🎨", "색 바꾸기", () => setShowColors(v => !v)],
              [memo.starred ? "⭐" : "☆", memo.starred ? "즐겨찾기 해제" : "즐겨찾기", () => patch({ starred: !memo.starred })],
              ["📋", withKey("전체 복사", "copy"), copyAll],
              ["🔍", "찾기 (Ctrl+F)", openFind],
              ...(desktop()?.setStickyOpacity ? [["🌫", `투명도 (${Math.round(opacity * 100)}%)`, () => setShowOpacity(v => !v)]] : []),
              ["🗑", "삭제", () => setConfirmDel(true)],
              ["⚙️", "메모 설정", () => setShowSettings(true)],
            ].map(([icon, label, fn]) => (
              <button key={icon + label} role="menuitem" onClick={() => { setShowMenu(false); fn(); }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", border: "none", background: "transparent", color: "#000", fontSize: 13, textAlign: "left", cursor: "pointer", borderRadius: 6, fontFamily: "inherit", whiteSpace: "nowrap" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#f1f1f1"; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                <span style={{ width: 18, textAlign: "center" }}>{icon}</span>{label}
              </button>
            ))}
            <div style={{ fontSize: 10, color: "#999", padding: "4px 10px 2px", borderTop: "1px solid #eee", marginTop: 2 }}>DayMate {APP_VERSION}</div>
          </div>
        </>
      )}
      {showColors && !folded && (
        <div style={{ display: "flex", gap: 6, padding: "6px 8px", background: c.bar, borderTop: `1px solid ${c.line}`, flexShrink: 0, flexWrap: "wrap" }}>
          {Object.entries(STICKY_COLORS).map(([key, col]) => (
            <button key={key} onClick={() => { patch({ color: key }); setShowColors(false); }} title={col.name}
              style={{ width: 20, height: 20, padding: 0, borderRadius: "50%", background: col.bg, cursor: "pointer",
                border: (memo.color || "yellow") === key ? "2px solid #333" : `1px solid ${col.line}` }} />
          ))}
        </div>
      )}
      {showOpacity && !folded && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", background: c.bar, borderTop: `1px solid ${c.line}`, flexShrink: 0, flexWrap: "wrap", fontSize: 11, color: c.sub }}>
          투명도
          {[1, 0.9, 0.8, 0.7, 0.6, 0.5].map(v => (
            <button key={v} onClick={() => changeOpacity(v)}
              style={{ ...iconBtn, width: "auto", height: 22, padding: "0 6px", fontSize: 11, color: "#000", background: Math.abs(opacity - v) < 0.01 ? c.line : "transparent", fontWeight: Math.abs(opacity - v) < 0.01 ? 800 : 400 }}>
              {Math.round(v * 100)}%
            </button>
          ))}
          <button onClick={() => setShowOpacity(false)} aria-label="닫기" style={{ ...iconBtn, marginLeft: "auto" }}>✕</button>
        </div>
      )}
      {find && !folded && (
        <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "4px 6px", background: c.bar, borderTop: `1px solid ${c.line}`, flexShrink: 0 }}>
          <input ref={findInputRef} value={find.q} placeholder="찾기"
            onChange={e => setFind({ q: e.target.value, i: 0 })}
            onKeyDown={e => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter") { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
              else if (e.key === "Escape") { e.preventDefault(); closeFind(); }
              else if (e.key === "F3") { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
            }}
            style={{ flex: 1, minWidth: 0, height: 22, padding: "0 6px", fontSize: 12, border: `1px solid ${c.line}`, borderRadius: 4, outline: "none", background: "#fff", color: "#000", fontFamily: "inherit" }} />
          <span style={{ fontSize: 11, color: c.sub, whiteSpace: "nowrap", minWidth: 34, textAlign: "center" }}>
            {find.q ? (matches.length ? `${cur + 1}/${matches.length}` : "없음") : ""}
          </span>
          <button onClick={() => stepFind(-1)} title="이전 (Shift+Enter)" style={iconBtn}>▲</button>
          <button onClick={() => stepFind(1)} title="다음 (Enter)" style={iconBtn}>▼</button>
          <button onClick={closeFind} title="닫기 (Esc)" style={iconBtn}>✕</button>
        </div>
      )}
      {!folded && (
        <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex" }}>
          {/* 찾기 표시 층 — 글 칸과 같은 글꼴·여백·줄바꿈. 글자는 투명, 찾은 곳만 형광펜 */}
          {find && matches.length > 0 && (
            <div ref={backRef} aria-hidden
              style={{ position: "absolute", left: 0, top: 0, width: taBox.w, height: taBox.h, overflow: "hidden", pointerEvents: "none",
                whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "normal", color: "transparent", fontSize: 14, lineHeight: 1.6, padding: "8px 10px", boxSizing: "border-box", fontFamily: "inherit" }}>
              {(() => {
                const parts = [];
                let at = 0;
                matches.forEach((s, k) => {
                  parts.push(text.slice(at, s));
                  parts.push(<mark key={s} data-cur={k === cur ? "" : undefined}
                    style={{ color: "transparent", background: k === cur ? "rgba(255,140,0,.55)" : "rgba(255,200,0,.45)", borderRadius: 2 }}>{text.slice(s, s + find.q.length)}</mark>);
                  at = s + find.q.length;
                });
                parts.push(text.slice(at) + "\n");
                return parts;
              })()}
            </div>
          )}
          <textarea
            ref={taRef}
            autoFocus
            value={text}
            onChange={e => { typedAt.current = Date.now(); setText(e.target.value); }}
            onKeyDown={e => handleEditorKey(e, () => flash("계산할 수식이 없어요"))}
            onPaste={onPaste}
            onClick={onTextClick}
            onScroll={e => { if (backRef.current) backRef.current.scrollTop = e.currentTarget.scrollTop; }}
            placeholder="메모를 입력하세요 (이미지 붙여넣기 가능)"
            style={{ position: "relative", flex: 1, minHeight: 0, resize: "none", border: "none", outline: "none", background: "transparent", color: "#000", fontSize: 14, lineHeight: 1.6, padding: "8px 10px", fontFamily: "inherit", boxSizing: "border-box", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}
          />
          <LinkOverlay taRef={taRef} text={text} />
        </div>
      )}
      {!folded && photos.length > 0 && (
        <div style={{ display: "flex", gap: 4, padding: "4px 6px 6px", overflowX: "auto", flexShrink: 0 }}>
          {photos.map((p, i) => (
            <img key={p.path || i} src={p.url} alt="첨부 사진" onClick={() => setViewer(i)}
              style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4, cursor: "zoom-in", border: `1px solid ${c.line}`, flexShrink: 0 }} />
          ))}
        </div>
      )}
      {viewer !== null && <PhotoViewer photos={photos} index={viewer} onClose={() => setViewer(null)} />}
      {showSettings && !folded && <MemoSettings inline onClose={() => setShowSettings(false)} />}
      {confirmDel && !folded && (
        <div onClick={() => setConfirmDel(false)} onKeyDown={e => { if (e.key === "Escape") setConfirmDel(false); }}
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
          <div role="alertdialog" aria-label="메모 삭제 확인" onClick={e => e.stopPropagation()}
            style={{ background: "#fff", color: "#000", borderRadius: 8, padding: "14px 16px", boxShadow: "0 6px 20px rgba(0,0,0,.25)", textAlign: "center", maxWidth: "85%" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>이 메모를 삭제할까요?</div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 12 }}>휴지통에서 30일 동안 되살릴 수 있어요</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button autoFocus onClick={() => setConfirmDel(false)} style={{ ...iconBtn, width: "auto", padding: "6px 14px", fontSize: 13, background: "#eee" }}>취소</button>
              <button onClick={remove} style={{ ...iconBtn, width: "auto", padding: "6px 14px", fontSize: 13, background: "#E5484D", color: "#fff", fontWeight: 700 }}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
