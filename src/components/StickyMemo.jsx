import { useEffect, useRef, useState } from "react";
import PhotoViewer from "./PhotoViewer.jsx";
import { genMemoId, getMemoTimeStr } from "./MemoTimeline.jsx";
import { newDay, loadDay, saveDay, dayKey } from "../data/model.js";
import { markDayUnsynced } from "../utils/daySync.js";
import { toDateStr } from "../utils/date.js";
import { compressImage, photoErrorMessage } from "../utils/image.js";
import { handleEditorKey } from "../utils/editorAssist.js";

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
  const [status, setStatus] = useState("");
  const [viewer, setViewer] = useState(null);
  const [uid, setUid] = useState(null);

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
    if (!window.confirm("이 메모를 삭제할까요?")) return;
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
        {!folded && desktop() && <button onClick={() => desktop().newSticky()} title="새 메모" style={iconBtn}>＋</button>}
        {!folded && desktop() && <button onClick={togglePin} title={pinned ? "항상 위 해제" : "항상 위에 고정"} style={{ ...iconBtn, opacity: pinned ? 1 : 0.4 }}>📌</button>}
        {!folded && <button onClick={() => setShowColors(v => !v)} title="색 바꾸기" style={iconBtn}>🎨</button>}
        {!folded && <button onClick={() => patch({ starred: !memo.starred })} title="즐겨찾기" style={iconBtn}>{memo.starred ? "⭐" : "☆"}</button>}
        {!folded && <button onClick={copyAll} title="전체 복사" style={iconBtn}>📋</button>}
        {desktop()?.fold && <button onClick={toggleFold} title={folded ? "펼치기" : "접기 (제목줄 더블클릭도 가능)"} style={iconBtn}>{folded ? "▾" : "−"}</button>}
        {!folded && <button onClick={remove} title="삭제" style={iconBtn}>🗑</button>}
        <button onClick={close} title="닫기 (메모는 남아요)" style={iconBtn}>✕</button>
      </div>
      {showColors && !folded && (
        <div style={{ display: "flex", gap: 6, padding: "6px 8px", background: c.bar, borderTop: `1px solid ${c.line}`, flexShrink: 0, flexWrap: "wrap" }}>
          {Object.entries(STICKY_COLORS).map(([key, col]) => (
            <button key={key} onClick={() => { patch({ color: key }); setShowColors(false); }} title={col.name}
              style={{ width: 20, height: 20, padding: 0, borderRadius: "50%", background: col.bg, cursor: "pointer",
                border: (memo.color || "yellow") === key ? "2px solid #333" : `1px solid ${col.line}` }} />
          ))}
        </div>
      )}
      {!folded && (
        <textarea
          autoFocus
          value={text}
          onChange={e => { typedAt.current = Date.now(); setText(e.target.value); }}
          onKeyDown={e => handleEditorKey(e, () => flash("계산할 수식이 없어요"))}
          onPaste={onPaste}
          placeholder="메모를 입력하세요 (이미지 붙여넣기 가능)"
          style={{ flex: 1, minHeight: 0, resize: "none", border: "none", outline: "none", background: "transparent", color: "#000", fontSize: 14, lineHeight: 1.6, padding: "8px 10px", fontFamily: "inherit" }}
        />
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
    </div>
  );
}
