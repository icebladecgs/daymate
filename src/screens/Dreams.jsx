// 🛒 갖고 싶은 것 · 📍 가고 싶은 곳 (2026-11-08) — 같은 화면을 kind만 바꿔 쓴다. 계산·문구는 utils/dreams.js
// 사진은 볼 때 의욕이 생기게 크게, 앨범에서 고른다(capture 없음, 원본 비율 그대로 — 압축만).
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import S, { UI, boxCard } from "../styles.js";
import Toast from "../components/Toast.jsx";
import UndoBar from "../components/UndoBar.jsx";
import { SectionIcon } from "../components/TodayLook.jsx";
import { useUndo, putBack } from "../utils/useUndo.js";
import { useBackClose } from "../utils/useBackClose.js";
import { toDateStr } from "../utils/date.js";
import { daysUntil } from "../utils/exam.js";
import { openLink } from "../utils/links.js";
import { uploadPhoto, deletePhoto } from "../firebase.js";
import { compressImage, photoErrorMessage } from "../utils/image.js";
import { DREAM_KINDS, dreamLists, normalizeDreams, newDreamId, safeLink, fmtWon, doneDateLabel } from "../utils/dreams.js";

const ACCENT = "var(--dm-accent, #5B7CFA)";
const ddayText = (n) => (n === 0 ? "오늘" : n === 1 ? "내일" : n > 0 ? `D-${n}` : `${-n}일 지남`);

// 사진이 없으면 이름 첫 글자를 색 칸에
function Thumb({ item, size, radius = 12, color }) {
  if (item.photo?.url) {
    return <img src={item.photo.url} alt="" loading="lazy" style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", flexShrink: 0, display: "block", background: "var(--dm-input)" }} />;
  }
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: color, color: "#fff", fontSize: typeof size === "number" ? Math.round(size * 0.38) : 40, fontWeight: 900 }}>
      {item.name.slice(0, 1)}
    </span>
  );
}
const KIND_COLOR = { wish: "#FF2D55", place: "#30B0C7" };

// My 탭 칸 — 사진 썸네일 4개 + 한 줄 요약, 누르면 목록 화면
export function DreamCard({ kind, items, onOpen, style }) {
  const cfg = DREAM_KINDS[kind];
  const { active, done, total } = useMemo(() => dreamLists(items), [items]);
  return (
    <div style={{ ...boxCard, ...style }}>
      <button onClick={onOpen} style={{ display: "block", width: "100%", padding: 0, background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "var(--dm-text)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: UI.headingGap, fontSize: UI.title, fontWeight: 900 }}>
          <SectionIcon name={cfg.icon} size={20} badge />{cfg.title}
          <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 800, color: ACCENT }}>{active.length || done.length ? "전체 ›" : "＋ 추가"}</span>
        </div>
        {active.length === 0 ? (
          <div style={{ fontSize: 15, color: "var(--dm-sub)", lineHeight: 1.5 }}>{done.length ? `${cfg.doneTitle} ${done.length}개 · 다음엔 뭘 할까요?` : cfg.empty}</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
              {active.slice(0, 4).map((x) => (
                <span key={x.id} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
                    <span style={{ position: "absolute", inset: 0 }}><Thumb item={x} size="100%" color={KIND_COLOR[kind]} /></span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dm-sub)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
                </span>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 14, color: "var(--dm-sub)" }}>
              {active.length}개{total > 0 ? ` · 모두 ${fmtWon(total)}` : ""}{done.length ? ` · ${cfg.doneTitle} ${done.length}` : ""}
            </div>
          </>
        )}
      </button>
    </div>
  );
}

export default function Dreams({ kind, items, setItems, uid, onBack }) {
  const cfg = DREAM_KINDS[kind];
  const today = toDateStr();
  const { active, done, total } = useMemo(() => dreamLists(items), [items]);
  const [editing, setEditing] = useState(null); // 'new' 또는 id
  const [doneOpen, setDoneOpen] = useState(false);
  const [toast, setToast] = useState("");
  const undo = useUndo();

  const save = (item) => {
    // 사진을 바꾸거나 뺐으면 예전 사진 파일은 저장할 때 지운다
    const old = normalizeDreams(items).find((x) => x.id === item.id);
    setItems((prev) => {
      const cur = normalizeDreams(prev);
      return cur.some((x) => x.id === item.id) ? cur.map((x) => (x.id === item.id ? item : x)) : [...cur, item];
    });
    if (old?.photo?.path && old.photo.path !== item.photo?.path) deletePhoto(old.photo.path);
    setEditing(null);
  };
  const remove = (item) => {
    const idx = normalizeDreams(items).findIndex((x) => x.id === item.id);
    setItems((prev) => normalizeDreams(prev).filter((x) => x.id !== item.id));
    setEditing(null);
    // 사진 파일은 5초 뒤(되돌리기 시간이 지나면) 지운다
    undo.offer(`"${item.name}"을(를) 지웠어요`, () => setItems((prev) => putBack(normalizeDreams(prev), item, idx)), () => item.photo?.path && deletePhoto(item.photo.path));
  };
  const markDone = (item, on) => {
    save({ ...item, doneAt: on ? today : "", done: on });
    if (on) setToast(cfg.doneToast);
  };

  return (
    <div style={{ paddingBottom: 110 }}>
      <UndoBar bar={undo.bar} onUndo={undo.run} />
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <div style={S.topbar}>
        <button className="dm-hit" onClick={onBack} aria-label="뒤로" style={{ background: "transparent", border: "none", color: "var(--dm-text)", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ flex: 1, marginLeft: 10 }}>
          <div className="dm-page-title" style={S.title}>{cfg.emoji} {cfg.title}</div>
          <div style={{ ...S.sub, fontSize: UI.sub }}>{active.length}개{total > 0 ? ` · 모두 ${fmtWon(total)}` : ""}{done.length ? ` · ${cfg.doneTitle} ${done.length}개` : ""}</div>
        </div>
        <button className="dm-hit" onClick={() => setEditing("new")} style={{ height: 36, padding: "0 6px", background: "none", border: "none", color: ACCENT, fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>＋ 추가</button>
      </div>

      {active.length === 0 && (
        <div style={{ ...boxCard, marginTop: 14, fontSize: 15, color: "var(--dm-sub)", lineHeight: 1.6 }}>
          {cfg.empty}. 오른쪽 위 ＋ 추가로 시작해요. 사진은 쇼핑몰·지도 화면을 캡처해서 앨범에서 고르면 돼요.
        </div>
      )}

      {active.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, padding: "14px 16px 4px" }}>
          {active.map((x) => {
            const d = x.when ? daysUntil(x.when, today) : null;
            return (
              <button key={x.id} onClick={() => setEditing(x.id)} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 0, background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "var(--dm-text)", minWidth: 0 }}>
                <span style={{ position: "relative", width: "100%", aspectRatio: "1 / 1" }}>
                  <span style={{ position: "absolute", inset: 0 }}><Thumb item={x} size="100%" radius={16} color={KIND_COLOR[kind]} /></span>
                  {d != null && <span style={{ position: "absolute", left: 8, top: 8, padding: "2px 8px", borderRadius: 999, background: d <= 7 && d >= 0 ? "#FF3B30" : "rgba(0,0,0,.6)", color: "#fff", fontSize: 13, fontWeight: 800 }}>{ddayText(d)}</span>}
                </span>
                <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "keep-all", overflowWrap: "anywhere" }}>{x.name}</span>
                {(x.price || x.why) && (
                  <span style={{ fontSize: 13, color: "var(--dm-sub)", marginTop: -4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {x.price ? <b style={{ color: "var(--dm-text)" }}>{fmtWon(x.price)}</b> : null}{x.price && x.why ? " · " : ""}{x.why}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <div style={{ ...boxCard, marginTop: 14 }}>
          <button onClick={() => setDoneOpen((v) => !v)} aria-expanded={doneOpen} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--dm-text)", fontSize: 17, fontWeight: 900 }}>
            🎉 {cfg.doneTitle} <span style={{ color: "var(--dm-sub)", fontWeight: 800 }}>{done.length}</span>
            <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--dm-sub)" }}>{doneOpen ? "▲" : "▼"}</span>
          </button>
          {doneOpen && done.map((x, i) => (
            <button key={x.id} onClick={() => setEditing(x.id)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 0", marginTop: i ? 0 : 8, background: "none", border: "none", borderTop: "1px solid var(--dm-row)", borderRadius: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "var(--dm-text)" }}>
              <Thumb item={x} size={44} radius={10} color={KIND_COLOR[kind]} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
              <span style={{ fontSize: 14, color: "var(--dm-sub)", flexShrink: 0 }}>{doneDateLabel(x.doneAt, today)}</span>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <DreamSheet kind={kind} uid={uid}
          initial={editing === "new" ? null : normalizeDreams(items).find((x) => x.id === editing)}
          onSave={save} onDelete={remove} onDone={markDone} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

// 추가·고치기 창 — 갖고 싶은 것·가고 싶은 곳·버킷리스트(Home.jsx)가 같이 쓴다. extra: 본문 맨 아래에 붙일 버튼(버킷리스트 "언젠가로")
export function DreamSheet({ kind, uid, initial, onSave, onDelete, onDone, onClose, extra = null }) {
  const cfg = DREAM_KINDS[kind];
  const isDone = !!initial?.done;
  const [name, setName] = useState(initial?.name || "");
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : "");
  const [link, setLink] = useState(initial?.link || "");
  const [why, setWhy] = useState(initial?.why || "");
  const [when, setWhen] = useState(initial?.when || "");
  const [photo, setPhoto] = useState(initial?.photo || null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  // 저장하지 않고 닫으면 이 창에서 새로 올린 사진만 지운다(원래 사진은 그대로)
  const close = () => {
    if (photo?.path && photo.path !== initial?.photo?.path) deletePhoto(photo.path);
    onClose();
  };
  useBackClose(close);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uid) return;
    setUploading(true); setErr("");
    try {
      const blob = await compressImage(file);
      const path = `users/${uid}/dreams/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const res = await uploadPhoto(path, blob, uid);
      // 이 창에서 앞서 올렸다가 바꾼 사진은 바로 지운다(원래 사진은 저장할 때)
      if (photo?.path && photo.path !== initial?.photo?.path) deletePhoto(photo.path);
      setPhoto(res);
    } catch (e2) { setErr(photoErrorMessage(e2)); }
    setUploading(false);
  };
  const removePhoto = () => {
    if (photo?.path && photo.path !== initial?.photo?.path) deletePhoto(photo.path);
    setPhoto(null);
  };

  const num = Number(String(price).replace(/[^\d]/g, ""));
  const cleanLink = safeLink(link);
  const valid = name.trim().length > 0 && !uploading;
  const build = (more = {}) => ({
    id: initial?.id || newDreamId(), name: name.trim(), price: num > 0 ? num : null, link: cleanLink, photo, why: why.trim(), when,
    createdAt: initial?.createdAt || new Date().toISOString(), doneAt: initial?.doneAt || "", done: isDone, ...more,
  });
  const submit = () => { if (valid) onSave(build()); };

  const label = { display: "block", fontSize: 15, fontWeight: 900, color: "var(--dm-text)", margin: "18px 0 8px" };
  const input = { ...S.input, fontSize: 16, padding: "12px 14px", border: "none", borderRadius: 12, marginBottom: 0 };
  const smallBtn = { height: 40, padding: "0 14px", border: "none", borderRadius: 10, background: "var(--dm-input)", color: "var(--dm-text)", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };

  return createPortal(
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={initial ? `${cfg.title} 고치기` : `${cfg.title} 추가`}
        style={{ width: "100%", maxWidth: 430, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "var(--dm-bg)", borderRadius: "20px 20px 0 0", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 20px 6px" }}>
          <div style={{ flex: 1, fontSize: 21, fontWeight: 900, color: "var(--dm-text)" }}>{cfg.emoji} {initial ? (isDone ? cfg.doneTitle : "고치기") : `${cfg.title} 추가`}</div>
          <button className="dm-hit" onClick={close} aria-label="닫기" style={{ width: 32, height: 32, padding: 0, background: "none", border: "none", color: "var(--dm-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", padding: "0 20px 16px" }}>
          {/* 사진 — 크게 보여야 의욕이 생긴다 */}
          <div style={{ marginTop: 8 }}>
            {photo?.url ? (
              <img src={photo.url} alt="" style={{ width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 16, background: "var(--dm-input)", display: "block" }} />
            ) : (
              <button onClick={() => uid && fileRef.current?.click()} disabled={!uid || uploading} style={{ width: "100%", height: 140, border: "1.5px dashed var(--dm-border2, var(--dm-border))", borderRadius: 16, background: "transparent", color: uid ? ACCENT : "var(--dm-muted)", fontSize: 15, fontWeight: 800, cursor: uid ? "pointer" : "default", fontFamily: "inherit" }}>
                {uploading ? "사진 올리는 중…" : uid ? "📷 사진 넣기 (캡처해서 앨범에서 고르기)" : "로그인하면 사진을 넣을 수 있어요"}
              </button>
            )}
            {photo?.url && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => fileRef.current?.click()} disabled={uploading} style={smallBtn}>{uploading ? "올리는 중…" : "사진 바꾸기"}</button>
                <button onClick={removePhoto} style={{ ...smallBtn, color: "#FF3B30" }}>사진 빼기</button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
            {err && <div style={{ fontSize: 14, color: "#FF3B30", marginTop: 6 }}>{err}</div>}
          </div>

          <label style={label} htmlFor="dream-name">이름</label>
          <input id="dream-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={cfg.namePh} style={input} />

          <label style={label} htmlFor="dream-price">{cfg.priceLabel} <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dm-muted)" }}>(선택)</span></label>
          <input id="dream-price" inputMode="numeric" value={price ? Number(String(price).replace(/[^\d]/g, "") || 0).toLocaleString("ko-KR") : ""} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} placeholder={`${cfg.pricePh} (원)`} style={input} />

          <label style={label} htmlFor="dream-link">링크 <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dm-muted)" }}>(선택)</span></label>
          <div style={{ display: "flex", gap: 8 }}>
            <input id="dream-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder={cfg.linkPh} inputMode="url" style={{ ...input, flex: 1, minWidth: 0 }} />
            {cleanLink && <button onClick={() => openLink(cleanLink)} style={{ ...smallBtn, height: 46, color: ACCENT }}>열기</button>}
          </div>
          {link.trim() && !cleanLink && <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 6 }}>인터넷 주소(https://…)만 넣을 수 있어요</div>}

          <label style={label} htmlFor="dream-why">한 줄 메모 <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dm-muted)" }}>(선택)</span></label>
          <input id="dream-why" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={200} placeholder={cfg.whyPh} style={input} />

          <label style={label} htmlFor="dream-when">{cfg.whenLabel} <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dm-muted)" }}>(선택 · 7일 전부터 오늘 탭에 보여요)</span></label>
          <div style={{ display: "flex", gap: 8 }}>
            <input id="dream-when" type="date" value={when} onChange={(e) => setWhen(e.target.value)} style={{ ...input, flex: 1, minWidth: 0 }} />
            {when && <button onClick={() => setWhen("")} style={{ ...smallBtn, height: 46 }}>지우기</button>}
          </div>
          {isDone && <div style={{ fontSize: 14, color: "#30D158", fontWeight: 800, marginTop: 14 }}>🎉 {initial.doneAt ? `${initial.doneAt.replace(/-/g, ".")}에 이뤘어요` : "이뤘어요 (날짜 모름)"}</div>}
          {extra}
        </div>
        <div style={{ display: "flex", gap: 8, padding: "10px 20px calc(14px + env(safe-area-inset-bottom, 0px))", borderTop: "1px solid var(--dm-row)" }}>
          {initial && <button onClick={() => onDelete(initial)} style={{ height: 50, padding: "0 16px", border: "none", borderRadius: 14, background: "var(--dm-input)", color: "#FF3B30", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>삭제</button>}
          {initial && (
            <button onClick={() => { if (valid) onDone(build(), !isDone); }} disabled={!valid}
              style={{ height: 50, padding: "0 14px", border: "none", borderRadius: 14, background: isDone ? "var(--dm-input)" : "#30D158", color: isDone ? "var(--dm-text)" : "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {isDone ? "다시 목록으로" : cfg.doneBtn}
            </button>
          )}
          <button onClick={submit} disabled={!valid} style={{ flex: 1, height: 50, border: "none", borderRadius: 14, background: valid ? ACCENT : "var(--dm-input)", color: valid ? "#fff" : "var(--dm-muted)", fontSize: 17, fontWeight: 900, cursor: valid ? "pointer" : "default", fontFamily: "inherit" }}>저장</button>
        </div>
      </div>
    </div>,
    document.querySelector(".dm-phone") || document.body,
  );
}
