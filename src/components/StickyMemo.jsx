import { useEffect, useRef, useState } from "react";
import PhotoViewer from "./PhotoViewer.jsx";
import { genMemoId, getMemoTimeStr } from "./MemoTimeline.jsx";
import { newDay, loadDay, saveDay, dayKey } from "../data/model.js";
import { markDayUnsynced } from "../utils/daySync.js";
import { toDateStr } from "../utils/date.js";
import { compressImage, photoErrorMessage } from "../utils/image.js";
import { handleEditorKey } from "../utils/editorAssist.js";
import { urlAt, openLink, findAll } from "../utils/links.js";
import { printMemo } from "../utils/printMemo.js";
import LinkOverlay from "./LinkOverlay.jsx";
import { useAiTidy } from "./AiTidy.jsx";
import { APP_VERSION } from "../version.js";
import MemoSettings from "./MemoSettings.jsx";
import { STICKY_COLORS } from "../utils/stickyColors.js";
import { ALARM_REPEATS, alarmLabel, nextOnceDate } from "../utils/alarms.js";
import { recordMemoChanges } from "../utils/memoHistory.js";
import { newDesignOn } from "../utils/todayLook.js";
import { useDriveUpload } from "./DriveFiles.jsx";

// 포스트잇 선 아이콘 (2026-11-14, 새 디자인만 — 메모 관리자와 같은 색 없는 선 모양). 예전 디자인은 글자·이모지 그대로
const STICKY_PATHS = {
  plus: <path d="M12 5v14M5 12h14" />,
  pin: <><path d="M9 4h6l-1 6 3 3H7l3-3z" /><path d="M12 13v7" /></>,
  more: <><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></>,
  fold: <path d="M5 12h14" />,
  unfold: <path d="M6 9l6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  palette: <><path d="M12 3a9 9 0 100 18c1 0 1.6-.8 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 005-5c0-4-4-7.6-9-7.6z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></>,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  sparkle: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 012-2h9" /></>,
  print: <><path d="M7 9V4h10v5" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M7 14h10v6H7z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  alarm: <><circle cx="12" cy="13" r="7" /><path d="M12 10v3l2 2M5 4L3 6M19 4l2 2" /></>,
  opacity: <><circle cx="12" cy="12" r="8" /><path d="M12 4v16" /><path d="M12 4a8 8 0 010 16z" fill="currentColor" stroke="none" opacity=".35" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  attach: <path d="M20 11.5l-7.6 7.6a5 5 0 0 1-7.1-7.1l7.9-7.9a3.4 3.4 0 0 1 4.8 4.8l-7.9 7.9a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
};
const SIcon = ({ name, size = 15, fill }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={fill || "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", margin: "auto" }}>{STICKY_PATHS[name]}</svg>
);

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
  // 🕘 고치기 전 글을 이 기기에 남김 (포스트잇은 앱의 저장 경로를 거치지 않아 여기서 직접 — utils/memoHistory.js)
  if (patchOrRemove && typeof patchOrRemove.text === "string") recordMemoChanges(day, { memos: list.map(m => (m.id === id ? { ...m, text: patchOrRemove.text } : m)) });
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
    const ds = q.get("ds"), id = q.get("id");
    // 새로 만든 빈 포스트잇이 창 새로고침(새 버전 배포 때 자동)으로 다시 열린 경우 (2026-11-13) — 떠날 때 빈 메모를 지워서
    // 예전엔 "이 메모는 삭제되었어요"가 떴다. 같은 창 안에서만 남는 표시(sessionStorage)로 알아보고 같은 id로 다시 만든다
    let wasEmptyNew = false;
    try { wasEmptyNew = sessionStorage.getItem(`dm_sticky_new_${id}`) === "1"; } catch { /* 무시 */ }
    if (wasEmptyNew && ds && id && !findMemo(ds, id)) {
      const day = loadDay(ds) || newDay(ds);
      saveDay(ds, { ...day, memos: [...memoListOf(day), { id, text: "", createdAt: getMemoTimeStr(), updatedAt: new Date().toISOString() }] });
      markDayUnsynced(ds, true);
    }
    return { ds, id, isNew: wasEmptyNew };
  });
  // 이 창이 "새로 만든 포스트잇"인 동안 표시 — 글을 쓰면 일반 메모가 되므로 지운다(아래 onLeave)
  useEffect(() => {
    if (!target.isNew) return;
    try { sessionStorage.setItem(`dm_sticky_new_${target.id}`, "1"); } catch { /* 무시 */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  const [showAlarm, setShowAlarm] = useState(false); // ⏰ 알람 정하기 띠 (2026-11-03, 메모잇 참고 — 울리는 건 메인 창이 한다)
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
    const empty = m && !m.text?.trim() && !m.photos?.length && !m.files?.length;
    if (isNewRef.current && empty) writeMemo(ds, id, null);
    // 글을 쓴 포스트잇은 더 이상 "새 빈 포스트잇"이 아니다 — 새로고침 뒤 되살리지 않게 표시를 지운다
    else { try { sessionStorage.removeItem(`dm_sticky_new_${id}`); } catch { /* 무시 */ } }
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
  // 📎 파일 올리기 (2026-11-15 사용자 요청) — 메모 탭·메모 관리자와 같은 useDriveUpload(내 드라이브 "DayMate/첨부파일", 링크만 메모에).
  // 드라이브 연결 정보는 메인 창과 같은 저장소라 그대로 쓴다. 서버 저장은 메인 창이 storage 이벤트로 받아서(포스트잇 구조 그대로)
  const drive = useDriveUpload({
    files: memo?.files || [],
    onChange: (next) => patch({ files: next }),
    onError: (msg) => flash(msg),
  });

  // 캡처한 이미지 Ctrl+V → 사진으로 첨부
  const onPaste = async (e) => {
    if (e.clipboardData?.getData("text/plain")?.trim()) return; // 엑셀·워드처럼 글자와 그림이 함께 복사되면 글자를 붙인다
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
  const print = () => {
    if (!text.trim()) { flash("출력할 내용이 없어요"); return; }
    if (!printMemo(text, `${ds.replace(/-/g, ".")} ${memo?.createdAt || ""}`.trim())) flash("출력하지 못했어요");
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
  actionsRef.current = { fold: confirmDel ? () => setConfirmDel(false) : find ? closeFind : showSettings ? () => setShowSettings(false) : showOpacity ? () => setShowOpacity(false) : showAlarm ? () => setShowAlarm(false) : showMenu ? () => setShowMenu(false) : toggleFold, close, pin: togglePin, copy: copyAll };
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
  // ✨ AI 정리 (2026-11-10, components/AiTidy.jsx) — 바꾸면 글이 바뀌고 0.5초 뒤 저장
  const tidy = useAiTidy({ getText: () => text, setText: (v) => { typedAt.current = Date.now(); setText(v); }, notify: flash, zIndex: 50 });

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
  const nl = newDesignOn(); // 새 디자인이면 버튼을 선 아이콘으로
  const ico = (name, old, extra) => (nl ? <SIcon name={name} {...extra} /> : old);
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: c.bg, color: "#000", fontFamily: "inherit", border: `1px solid ${c.line}` }}>
      {/* 제목줄: 끌어서 옮기기, 더블클릭으로 접기/펼치기. 접히면 창 전체(윈도우 최소 높이 39px)를 채움 */}
      <div onDoubleClick={toggleFold}
        style={{ display: "flex", alignItems: "center", gap: 1, height: folded ? "100%" : 28, padding: "0 4px 0 8px", background: c.bar, WebkitAppRegion: "drag", flexShrink: 0, userSelect: "none" }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: folded ? 12 : 11, fontWeight: folded ? 700 : 400, color: folded ? "#000" : c.sub, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {(drive.busy && drive.label) || status || (folded && firstLine) || `${ds.slice(5).replace("-", "/")} ${memo.createdAt || ""}${memo.alarm?.time ? ` · ⏰ ${alarmLabel(memo.alarm, toDateStr())}` : ""}`}
        </span>
        {!folded && desktop() && <button onClick={() => desktop().newSticky()} title={withKey("새 메모", "new")} aria-label="새 메모" style={iconBtn}>{ico("plus", "＋")}</button>}
        {!folded && desktop() && <button onClick={togglePin} title={withKey(pinned ? "항상 위 해제" : "항상 위에 고정", "pin")} aria-label="항상 위" style={{ ...iconBtn, opacity: pinned ? 1 : 0.4 }}>{ico("pin", "📌", pinned ? { fill: "currentColor" } : undefined)}</button>}
        {/* 색·즐겨찾기·복사·삭제는 ⋯ 메뉴로 — 제목줄 빈 자리(끌어서 옮기는 곳)를 넓게 남긴다 */}
        {!folded && <button onClick={() => setShowMenu(v => !v)} title="더 보기 (색·즐겨찾기·복사·출력·삭제)" aria-label="더 보기" style={{ ...iconBtn, fontWeight: 900, background: showMenu ? c.line : "transparent" }}>{ico("more", "⋯")}</button>}
        {/* 접기/펼치기는 항상 닫기 바로 왼쪽 — 접은 자리에서 그대로 다시 펼 수 있게 */}
        {desktop()?.fold && <button onClick={toggleFold} title={folded ? withKey("펼치기", "fold") : withKey("접기", "fold") + " · 제목줄 더블클릭도 가능"} aria-label={folded ? "펼치기" : "접기"} style={iconBtn}>{folded ? ico("unfold", "▾") : ico("fold", "−")}</button>}
        <button onClick={close} title={withKey("닫기", "close") + " · 메모는 남아요"} aria-label="닫기" style={iconBtn}>{ico("close", "✕")}</button>
      </div>
      {showMenu && !folded && (
        <>
          <div onClick={() => setShowMenu(false)} style={{ position: "absolute", inset: 0, zIndex: 9 }} />
          <div role="menu" style={{ position: "absolute", top: 30, right: 4, zIndex: 10, background: "#fff", color: "#000", borderRadius: 8, boxShadow: "0 6px 20px rgba(0,0,0,.25)", padding: 4, minWidth: 150, maxHeight: "calc(100vh - 36px)", overflowY: "auto", boxSizing: "border-box" }}>
            {[
              ["🎨", "색 바꾸기", () => setShowColors(v => !v), "palette"],
              [memo.starred ? "⭐" : "☆", memo.starred ? "즐겨찾기 해제" : "즐겨찾기", () => patch({ starred: !memo.starred }), "star"],
              ["✨", "AI 정리", tidy.open, "sparkle"],
              ["📋", withKey("전체 복사", "copy"), copyAll, "copy"],
              ["🖨", "출력", print, "print"],
              ["🔍", "찾기 (Ctrl+F)", openFind, "search"],
              ["⏰", memo.alarm?.time ? `알람 (${alarmLabel(memo.alarm, toDateStr())})` : "알람", () => setShowAlarm(v => !v), "alarm"],
              ...(desktop()?.setStickyOpacity ? [["🌫", `투명도 (${Math.round(opacity * 100)}%)`, () => setShowOpacity(v => !v), "opacity"]] : []),
              ["📎", "파일 올리기 (드라이브)", drive.pick, "attach"],
              ["🗑", "삭제", () => setConfirmDel(true), "trash"],
              ["⚙️", "메모 설정", () => setShowSettings(true), "gear"],
            ].map(([icon, label, fn, svg]) => (
              <button key={icon + label} role="menuitem" onClick={() => { setShowMenu(false); fn(); }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "5px 10px", border: "none", background: "transparent", color: "#000", fontSize: 13, textAlign: "left", cursor: "pointer", borderRadius: 6, fontFamily: "inherit", whiteSpace: "nowrap" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#f1f1f1"; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                <span style={{ width: 18, textAlign: "center", color: nl ? (svg === "trash" ? "#DC2626" : svg === "star" && memo.starred ? "#D97706" : "#444") : undefined }}>
                  {nl ? <SIcon name={svg} size={16} fill={svg === "star" && memo.starred ? "currentColor" : undefined} /> : icon}
                </span>{label}
              </button>
            ))}
            <div style={{ fontSize: 10, color: "#999", padding: "4px 10px 2px", borderTop: "1px solid #eee", marginTop: 2 }}>DayMate {APP_VERSION}</div>
          </div>
        </>
      )}
      {tidy.ui}
      {showColors && !folded && (
        <div style={{ display: "flex", gap: 6, padding: "6px 8px", background: c.bar, borderTop: `1px solid ${c.line}`, flexShrink: 0, flexWrap: "wrap" }}>
          {Object.entries(STICKY_COLORS).map(([key, col]) => (
            <button key={key} onClick={() => { patch({ color: key }); setShowColors(false); }} title={col.name}
              style={{ width: 20, height: 20, padding: 0, borderRadius: "50%", background: col.bg, cursor: "pointer",
                border: (memo.color || "yellow") === key ? "2px solid #333" : `1px solid ${col.line}` }} />
          ))}
        </div>
      )}
      {showAlarm && !folded && (() => {
        const a = memo.alarm || {};
        const time = a.time || "09:00";
        const setAlarm = (p) => {
          const next = { time, repeat: a.repeat || "once", ...p };
          // 한 번 울리는 알람은 그 시각이 오늘 지났으면 내일로, 매주는 오늘 요일 기준
          next.date = next.repeat === "once" ? nextOnceDate(next.time) : (a.date || toDateStr());
          patch({ alarm: next });
        };
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", background: c.bar, borderTop: `1px solid ${c.line}`, flexShrink: 0, flexWrap: "wrap", fontSize: 12, color: c.sub }}>
            ⏰
            <input type="time" value={time} onChange={e => e.target.value && setAlarm({ time: e.target.value })} aria-label="알람 시각"
              style={{ fontSize: 12, padding: "1px 4px", border: `1px solid ${c.line}`, borderRadius: 6, background: "#fff", color: "#000", fontFamily: "inherit" }} />
            {ALARM_REPEATS.map(r => (
              <button key={r.id} onClick={() => setAlarm({ repeat: r.id })}
                style={{ ...iconBtn, width: "auto", height: 22, padding: "0 6px", fontSize: 12, color: "#000", background: a.time && (a.repeat || "once") === r.id ? c.line : "transparent", fontWeight: a.time && (a.repeat || "once") === r.id ? 800 : 400 }}>{r.label}</button>
            ))}
            {a.time && <button onClick={() => { patch({ alarm: null }); setShowAlarm(false); }} style={{ ...iconBtn, width: "auto", height: 22, padding: "0 6px", fontSize: 12, color: "#B91C1C" }}>끄기</button>}
            <button onClick={() => setShowAlarm(false)} aria-label="닫기" style={{ ...iconBtn, marginLeft: "auto" }}>✕</button>
            <div style={{ width: "100%", fontSize: 11, color: c.sub }}>{a.time ? `${alarmLabel(a, toDateStr())}에 알려요 · PC가 켜져 있고 알림을 켰을 때` : "시각과 반복을 고르면 켜져요"}</div>
          </div>
        );
      })()}
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
      {drive.input}
      {/* 📎 첨부 파일 — 누르면 기본 브라우저에서 드라이브로, ✕는 목록에서만 빼기(드라이브엔 남음) */}
      {!folded && (memo.files || []).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 6px 6px", flexShrink: 0, maxHeight: 96, overflowY: "auto" }}>
          {memo.files.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#222" }}>
              <button onClick={() => f.link && openLink(f.link)} title={`${f.name} — 드라이브에서 열기`}
                style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 4, padding: "2px 4px", border: `1px solid ${c.line}`, borderRadius: 4, background: "rgba(255,255,255,.35)", color: "#222", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span aria-hidden="true">📎</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              </button>
              <button onClick={() => { patch({ files: (memo.files || []).filter(x => x.id !== f.id) }); flash("목록에서 뺐어요 (드라이브엔 남아요)"); }} aria-label={`${f.name} 목록에서 빼기`}
                style={{ ...iconBtn, width: 20, height: 20, fontSize: 11, color: "#666" }}>✕</button>
            </div>
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
