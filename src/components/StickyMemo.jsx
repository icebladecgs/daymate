import { useEffect, useRef, useState } from "react";
import PhotoViewer from "./PhotoViewer.jsx";
import { genMemoId, getMemoTimeStr } from "./MemoTimeline.jsx";
import { newDay, loadDay, saveDay, dayKey } from "../data/model.js";
import { markDayUnsynced } from "../utils/daySync.js";
import { toDateStr } from "../utils/date.js";
import { compressImage, photoErrorMessage } from "../utils/image.js";

// 데스크탑 앱의 바탕화면 포스트잇 창 (?view=sticky) — 메모잇의 간편 메모처럼 작은 노란 창.
// 앱 전체를 띄우지 않고 이 PC 저장소(localStorage)의 오늘/해당 날짜 메모만 읽고 쓴다.
// 서버 저장은 트레이에 떠 있는 메인 창이 storage 이벤트로 받아서 대신 한다(App.jsx).
const desktop = () => window.daymateDesktop;
// 데스크탑 앱이면 앱이 창을 닫고(목록에서 정리), 브라우저면 그냥 창 닫기
const closeWindow = (info) => { if (desktop()?.stickyClose) desktop().stickyClose(info); else window.close(); };

const memoListOf = (day) => (day?.memos?.length ? day.memos : (day?.memo?.trim() ? [{ id: "legacy", text: day.memo.trim(), createdAt: "" }] : []));
const findMemo = (ds, id) => memoListOf(loadDay(ds)).find(m => m.id === id) || null;

function writeMemo(ds, id, patchOrRemove) {
  const day = loadDay(ds) || newDay(ds);
  const list = memoListOf(day);
  const memos = patchOrRemove === null
    ? list.filter(m => m.id !== id)
    : list.map(m => (m.id === id ? { ...m, ...patchOrRemove, updatedAt: new Date().toISOString() } : m));
  saveDay(ds, { ...day, memos });
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
  const [text, setText] = useState(() => findMemo(ds, id)?.text || "");
  const [pinned, setPinned] = useState(() => new URLSearchParams(window.location.search).get("pin") === "1");
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
  const togglePin = async () => {
    const next = await desktop()?.togglePin?.();
    if (typeof next === "boolean") setPinned(next);
  };

  const iconBtn = { width: 24, height: 24, padding: 0, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, lineHeight: 1, borderRadius: 4, WebkitAppRegion: "no-drag", color: "#5b4a00" };
  const photos = memo?.photos || [];

  if (!memo) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#FFF7A8", color: "#5b4a00", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 13, fontFamily: "inherit" }}>
        이 메모는 삭제되었어요.
        <button onClick={() => closeWindow({ deleted: true })} style={{ ...iconBtn, width: "auto", padding: "4px 12px", background: "#F5E97A" }}>닫기</button>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#FFF7A8", color: "#333", fontFamily: "inherit", border: "1px solid #E8D95A" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "3px 4px 3px 8px", background: "#F5E97A", WebkitAppRegion: "drag", flexShrink: 0, userSelect: "none" }}>
        <span style={{ flex: 1, fontSize: 11, color: "#8a7400", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {status || `${ds.slice(5).replace("-", "/")} ${memo.createdAt || ""}`}
        </span>
        {desktop() && <button onClick={() => desktop().newSticky()} title="새 메모" style={iconBtn}>＋</button>}
        {desktop() && <button onClick={togglePin} title={pinned ? "항상 위 해제" : "항상 위에 고정"} style={{ ...iconBtn, opacity: pinned ? 1 : 0.45 }}>📌</button>}
        <button onClick={() => patch({ starred: !memo.starred })} title="즐겨찾기" style={iconBtn}>{memo.starred ? "⭐" : "☆"}</button>
        <button onClick={copyAll} title="전체 복사" style={iconBtn}>📋</button>
        {desktop() && <button onClick={() => desktop().minimize()} title="접기" style={iconBtn}>−</button>}
        <button onClick={remove} title="삭제" style={iconBtn}>🗑</button>
        <button onClick={close} title="닫기 (메모는 남아요)" style={iconBtn}>✕</button>
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={e => { typedAt.current = Date.now(); setText(e.target.value); }}
        onPaste={onPaste}
        placeholder="메모를 입력하세요 (이미지 붙여넣기 가능)"
        style={{ flex: 1, minHeight: 0, resize: "none", border: "none", outline: "none", background: "transparent", color: "#333", fontSize: 14, lineHeight: 1.6, padding: "8px 10px", fontFamily: "inherit" }}
      />
      {photos.length > 0 && (
        <div style={{ display: "flex", gap: 4, padding: "4px 6px 6px", overflowX: "auto", flexShrink: 0 }}>
          {photos.map((p, i) => (
            <img key={p.path || i} src={p.url} alt="첨부 사진" onClick={() => setViewer(i)}
              style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4, cursor: "zoom-in", border: "1px solid #E8D95A", flexShrink: 0 }} />
          ))}
        </div>
      )}
      {viewer !== null && <PhotoViewer photos={photos} index={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
