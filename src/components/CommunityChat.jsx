import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { onSnapshot } from "firebase/firestore";
import { chatQuery, addChatMessage, deleteChatMessage, loadOlderChat, uploadPhoto, deletePhoto } from "../firebase.js";
import { compressImage, photoErrorMessage } from "../utils/image.js";
import { markChatRead } from "../utils/chatRead.js";
import { formatKoreanDate } from "../utils/date.js";
import Linkify from "../utils/linkify.jsx";
import PhotoViewer from "./PhotoViewer.jsx";
import Toast from "./Toast.jsx";

const MAX_PHOTOS = 10;
const hhmm = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const dayOf = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// 휴대폰은 엔터가 줄바꿈(전송은 버튼), PC는 엔터 전송·Shift+엔터 줄바꿈
const touchDevice = () => window.matchMedia?.("(pointer: coarse)").matches;

// 커뮤니티 단체 채팅방 — 창을 연 동안만 실시간으로 받는다(닫으면 연결 해제).
// 시트·팝업 원칙대로 .dm-phone에 포털로 그린다(하단 메뉴에 가리지 않게, 큰글씨 zoom 적용).
export default function CommunityChat({ communityId, communityName, authUser, myNickname, isAdmin, onClose }) {
  const [live, setLive] = useState([]);   // 최신 50개(실시간)
  const [older, setOlder] = useState([]); // "이전 대화 더 보기"로 불러온 것
  const [exhausted, setExhausted] = useState(false); // 더 불러올 이전 대화가 없음
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false); // 멤버가 아니거나(권한 없음) 연결 실패
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState(null); // 삭제 버튼을 보일 메시지 id
  const [viewer, setViewer] = useState(null);
  const [toast, setToast] = useState("");
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const stickBottom = useRef(true);   // 맨 아래를 보고 있으면 새 메시지에 따라 내려감
  const keepOffset = useRef(null);    // 이전 대화를 붙일 때 보던 위치 유지

  useEffect(() => {
    const unsub = onSnapshot(chatQuery(communityId), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLive(docs.reverse());
      setLoading(false);
      if (docs.length) markChatRead(communityId, docs[docs.length - 1].createdAt);
    }, () => { setLoading(false); setLoadError(true); });
    return () => unsub();
  }, [communityId]);

  // 같은 메시지가 두 목록에 겹치지 않게 합치기
  const messages = useMemo(() => {
    const ids = new Set(live.map(m => m.id));
    return [...older.filter(m => !ids.has(m.id)), ...live];
  }, [older, live]);

  const hasMore = !exhausted && (older.length > 0 || live.length >= 50);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (keepOffset.current != null) { el.scrollTop = el.scrollHeight - keepOffset.current; keepOffset.current = null; return; }
    if (stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadMore = async () => {
    if (loadingOlder || !messages.length) return;
    setLoadingOlder(true);
    try {
      const list = await loadOlderChat(communityId, messages[0].createdAt);
      keepOffset.current = listRef.current.scrollHeight - listRef.current.scrollTop;
      setOlder(prev => [...list.reverse(), ...prev]);
      if (list.length < 50) setExhausted(true);
    } catch { setToast("이전 대화를 불러오지 못했어요"); }
    setLoadingOlder(false);
  };

  const send = async (photos = []) => {
    const body = photos.length ? "" : text.trim();
    if (!body && !photos.length) return;
    setSending(true);
    try {
      const { createdAt } = await addChatMessage(communityId, { uid: authUser.uid, nickname: myNickname, text: body, photos });
      markChatRead(communityId, createdAt);
      if (!photos.length) setText("");
      stickBottom.current = true;
    } catch { setToast("보내지 못했어요. 다시 시도해 주세요"); }
    setSending(false);
    if (!photos.length) inputRef.current?.focus();
  };

  // 사진은 고르면 바로 한 메시지로 보낸다
  const onPickPhotos = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS);
    e.target.value = "";
    if (!files.length) return;
    setSending(true);
    setToast(`사진 ${files.length}장 보내는 중…`);
    const results = await Promise.allSettled(files.map(async (f) => {
      const blob = await compressImage(f);
      return uploadPhoto(`community_photos/${communityId}/chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`, blob, authUser.uid);
    }));
    const uploaded = results.filter(r => r.status === "fulfilled").map(r => r.value);
    const failed = results.find(r => r.status === "rejected");
    setSending(false);
    if (uploaded.length) await send(uploaded);
    setToast(failed ? photoErrorMessage(failed.reason) : "");
  };

  const remove = async (m) => {
    if (!window.confirm(m.photos?.length ? "이 메시지와 사진을 삭제할까요?" : "이 메시지를 삭제할까요?")) return;
    try {
      await deleteChatMessage(communityId, m.id);
      (m.photos || []).forEach(p => deletePhoto(p.path));
      setOlder(prev => prev.filter(x => x.id !== m.id));
      setSelected(null);
    } catch { setToast("삭제하지 못했어요"); }
  };

  const onKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || touchDevice()) return;
    e.preventDefault();
    if (!sending) send();
  };

  const target = document.querySelector(".dm-phone") || document.body;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "var(--dm-bg)", display: "flex", flexDirection: "column" }}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      {/* 머리줄 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderBottom: "1px solid var(--dm-border)", flexShrink: 0 }}>
        <button onClick={onClose} aria-label="뒤로" style={{ width: 36, height: 36, padding: 0, borderRadius: 10, border: "1px solid var(--dm-border)", background: "var(--dm-card)", color: "var(--dm-text)", fontSize: 18, cursor: "pointer" }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>💬 {communityName || "단체 채팅"}</div>
          <div style={{ fontSize: 11, color: "var(--dm-muted)" }}>멤버만 볼 수 있어요</div>
        </div>
      </div>

      {/* 메시지 목록 */}
      <div ref={listRef} onScroll={onScroll} onClick={() => setSelected(null)} style={{ flex: 1, overflowY: "auto", padding: "10px 12px 16px" }}>
        {hasMore && (
          <button onClick={loadMore} disabled={loadingOlder} style={{ display: "block", margin: "0 auto 10px", padding: "6px 14px", borderRadius: 999, border: "1px solid var(--dm-border)", background: "var(--dm-card)", color: "var(--dm-sub)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {loadingOlder ? "불러오는 중…" : "이전 대화 더 보기"}
          </button>
        )}
        <div style={{ fontSize: 11, color: "var(--dm-muted)", textAlign: "center", lineHeight: 1.6, margin: "4px 8px 12px" }}>
          🔒 대화는 이 커뮤니티 멤버만 볼 수 있어요. 서버에 저장되며, 앱 운영자는 기술적으로 볼 수 있어요.
        </div>
        {loading && <div style={{ textAlign: "center", color: "var(--dm-muted)", fontSize: 13, padding: 20 }}>불러오는 중…</div>}
        {loadError && <div style={{ textAlign: "center", color: "#F87171", fontSize: 14, fontWeight: 700, padding: 30, lineHeight: 1.6 }}>채팅을 불러오지 못했어요.<br />이 커뮤니티 멤버만 볼 수 있어요.</div>}
        {!loading && !loadError && messages.length === 0 && <div style={{ textAlign: "center", color: "var(--dm-muted)", fontSize: 14, padding: 30 }}>첫 메시지를 보내 보세요 👋</div>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || dayOf(prev.createdAt) !== dayOf(m.createdAt);
          const mine = m.uid === authUser?.uid;
          const sameSender = !newDay && prev && prev.uid === m.uid;
          const canDelete = mine || isAdmin;
          return (
            <div key={m.id}>
              {newDay && (
                <div style={{ textAlign: "center", margin: "14px 0 10px" }}>
                  <span style={{ fontSize: 11, color: "var(--dm-muted)", background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: 999, padding: "3px 10px" }}>{formatKoreanDate(dayOf(m.createdAt))}</span>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", marginTop: sameSender ? 3 : 10 }}>
                {!mine && !sameSender && <div style={{ fontSize: 12, fontWeight: 800, color: "var(--dm-sub)", margin: "0 0 3px 4px" }}>{m.nickname || "익명"}</div>}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 5, flexDirection: mine ? "row-reverse" : "row", maxWidth: "88%" }}>
                  <div onClick={(e) => { e.stopPropagation(); if (canDelete) setSelected(s => (s === m.id ? null : m.id)); }}
                    style={{ minWidth: 0, padding: m.photos?.length && !m.text ? 4 : "8px 12px", borderRadius: 14,
                      background: mine ? "#6C8EFF" : "var(--dm-card)", color: mine ? "#fff" : "var(--dm-text)",
                      border: mine ? "none" : "1px solid var(--dm-border)", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      cursor: canDelete ? "pointer" : "default", outline: selected === m.id ? "2px solid #F87171" : "none" }}>
                    {m.text && <Linkify text={m.text} linkColor={mine ? "#fff" : undefined} />}
                    {m.photos?.length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(m.photos.length, 3)}, 1fr)`, gap: 3, marginTop: m.text ? 6 : 0 }}>
                        {m.photos.map((p, j) => (
                          <img key={p.path || j} src={p.url} alt="보낸 사진" loading="lazy"
                            onClick={(e) => { e.stopPropagation(); setViewer({ photos: m.photos, index: j }); }}
                            style={{ width: m.photos.length === 1 ? 200 : 92, maxWidth: "100%", height: m.photos.length === 1 ? "auto" : 92, maxHeight: 260, objectFit: m.photos.length === 1 ? "contain" : "cover", borderRadius: 10, display: "block", cursor: "zoom-in", background: "rgba(0,0,0,.05)" }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--dm-muted)", flexShrink: 0 }}>{hhmm(m.createdAt)}</div>
                </div>
                {selected === m.id && (
                  <button onClick={(e) => { e.stopPropagation(); remove(m); }}
                    style={{ marginTop: 4, padding: "4px 12px", borderRadius: 8, border: "1px solid rgba(248,113,113,.4)", background: "rgba(248,113,113,.1)", color: "#F87171", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                    🗑 삭제{!mine ? " (관리자)" : ""}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 입력줄 */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "8px 10px calc(8px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--dm-border)", background: "var(--dm-bg)", flexShrink: 0 }}>
        <button onClick={() => fileRef.current?.click()} disabled={sending} aria-label="사진 보내기" title={`사진 보내기 (한 번에 ${MAX_PHOTOS}장까지)`}
          style={{ width: 42, height: 42, padding: 0, borderRadius: 12, border: "1px solid var(--dm-border)", background: "var(--dm-card)", fontSize: 20, cursor: "pointer", flexShrink: 0, opacity: sending ? 0.5 : 1 }}>📷</button>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPickPhotos} style={{ display: "none" }} />
        <textarea ref={inputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={onKeyDown} rows={1} maxLength={2000}
          placeholder="메시지 입력"
          style={{ flex: 1, minWidth: 0, resize: "none", maxHeight: 120, minHeight: 42, boxSizing: "border-box", padding: "10px 12px", borderRadius: 12, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-text)", fontSize: 15, lineHeight: 1.4, fontFamily: "inherit", outline: "none", fieldSizing: "content" }} />
        <button onClick={() => send()} disabled={sending || !text.trim()}
          style={{ height: 42, padding: "0 16px", borderRadius: 12, border: "none", background: text.trim() ? "#6C8EFF" : "var(--dm-border)", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", flexShrink: 0 }}>보내기</button>
      </div>
      {viewer && <PhotoViewer photos={viewer.photos} index={viewer.index} onClose={() => setViewer(null)} />}
    </div>,
    target
  );
}
