import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { canSharePhotos, downloadPhoto, fetchPhotoBlob, isIOS, photoFileName, sharePhoto } from "../utils/photoShare.js";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 사진 전체화면 보기 — 두 손가락 확대·두 번 탭 확대·마우스 휠 확대, 확대 중 끌어서 이동,
// 여러 장이면 좌우로 밀어 넘기기. 휴대폰 뒤로가기는 사진만 닫는다(열 때 히스토리 한 칸 추가).
// photos: [{ url, caption? }], index: 처음 보여줄 사진 번호, onIndexChange: 넘길 때마다 지금 번호 (선택)
// closeLabel: 닫기 버튼 글자 (주면 ✕ 대신 그 글자 — 메모 관리자 "⤡ 작게 보기")
// sensitive: 잠긴 메모 사진 — 공유·저장 전에 한 번 묻는다
export default function PhotoViewer({ photos = [], index = 0, onClose, onIndexChange, closeLabel = "", sensitive = false }) {
  const [cur, setCur] = useState(() => clamp(index, 0, Math.max(0, photos.length - 1)));
  const onIndexRef = useRef(onIndexChange);
  onIndexRef.current = onIndexChange;
  useEffect(() => { onIndexRef.current?.(cur); }, [cur]);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const boxRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  // 공유·저장 — 휴대폰 공유 창은 버튼을 누른 직후에 바로 열어야 해서(아이폰) 보고 있는 사진을 미리 받아 둔다
  const [canShare] = useState(canSharePhotos);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const blobs = useRef(new Map());
  const getBlob = async (url) => {
    if (blobs.current.has(url)) return blobs.current.get(url);
    const blob = await fetchPhotoBlob(url);
    blobs.current.set(url, blob);
    return blob;
  };
  const curUrl = photos[cur]?.url;
  useEffect(() => {
    setNotice(""); setFailed(false);
    if (!canShare || !curUrl) return undefined;
    const t = setTimeout(() => { getBlob(curUrl).catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [curUrl, canShare]);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  const askSensitive = () => !sensitive || window.confirm("잠긴 메모의 사진이에요. 공유하거나 저장하면 잠금 밖으로 나가요. 계속할까요?");
  const photoFail = () => { setFailed(true); setNotice("사진을 가져오지 못했어요. 원본 열기를 눌러 주세요"); };
  const onShare = async () => {
    if (busy || !askSensitive()) return;
    let blob = blobs.current.get(curUrl);
    if (!blob) {
      setBusy(true);
      try { blob = await getBlob(curUrl); } catch { photoFail(); return; } finally { setBusy(false); }
    }
    try {
      await sharePhoto(blob, photoFileName(blob, cur + 1));
    } catch (e) {
      if (e?.name === "AbortError") return; // 사용자가 공유 창을 닫음
      if (e?.name === "NotAllowedError") setNotice("사진을 준비했어요. 공유를 한 번 더 눌러 주세요");
      else photoFail();
    }
  };
  const onSave = async () => {
    if (busy || !askSensitive()) return;
    setBusy(true);
    try {
      const blob = await getBlob(curUrl);
      downloadPhoto(blob, photoFileName(blob, cur + 1));
      setNotice("사진 내려받기를 시작했어요");
    } catch { photoFail(); } finally { setBusy(false); }
  };

  // 뒤로가기 → 사진만 닫기. 현재 화면 state를 복사해 두어, 앱의 뒤로가기 처리가 같은 화면에 머물게 한다.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    history.pushState({ ...(history.state || {}), photoViewer: true }, "");
    let closedByBack = false;
    const onPop = () => { closedByBack = true; onCloseRef.current?.(); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!closedByBack && history.state?.photoViewer) history.back();
    };
  }, []);
  const close = () => history.back(); // popstate에서 onClose 호출

  const resetView = () => setView({ scale: 1, x: 0, y: 0 });
  const go = (delta) => {
    if (photos.length < 2) return;
    setCur(i => (i + delta + photos.length) % photos.length);
    resetView();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // 화면 중심 기준 좌표
  const toCenter = (clientX, clientY) => {
    const r = boxRef.current.getBoundingClientRect();
    return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) };
  };
  // 한 점(p)을 기준으로 확대 — 그 점 아래의 사진 위치가 그대로 유지되게
  const zoomAt = (p, nextScale, base = viewRef.current) => {
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    if (scale === 1) return { scale: 1, x: 0, y: 0 };
    const k = scale / base.scale;
    return { scale, x: p.x - (p.x - base.x) * k, y: p.y - (p.y - base.y) * k };
  };

  const onPointerDown = (e) => {
    if (e.target.closest?.("button")) return; // ‹ › 버튼은 그대로 클릭되게
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const [a, b] = pts;
      gesture.current = {
        type: "pinch",
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: toCenter((a.x + b.x) / 2, (a.y + b.y) / 2),
        base: viewRef.current,
      };
    } else if (pts.length === 1) {
      gesture.current = { type: "drag", start: { x: e.clientX, y: e.clientY }, base: viewRef.current, moved: false };
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.type === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = toCenter((a.x + b.x) / 2, (a.y + b.y) / 2);
      const zoomed = zoomAt(g.mid, g.base.scale * (dist / g.dist), g.base);
      // 두 손가락 가운데가 움직이면 사진도 따라 이동
      setView(zoomed.scale === 1 ? zoomed : { ...zoomed, x: zoomed.x + (mid.x - g.mid.x), y: zoomed.y + (mid.y - g.mid.y) });
    } else if (g.type === "drag") {
      const dx = e.clientX - g.start.x;
      const dy = e.clientY - g.start.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.moved = true;
      if (g.base.scale > 1) setView({ ...g.base, x: g.base.x + dx, y: g.base.y + dy });
    }
  };

  const onPointerUp = (e) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (g?.type === "pinch") {
      // 한 손가락이 남으면 이어서 끌기
      const rest = [...pointers.current.values()][0];
      gesture.current = rest ? { type: "drag", start: rest, base: viewRef.current, moved: true } : null;
      return;
    }
    gesture.current = null;
    if (!g || g.type !== "drag") return;
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    // 확대 안 한 상태에서 옆으로 밀면 다음/이전 사진
    if (g.base.scale === 1 && g.moved && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      go(dx < 0 ? 1 : -1);
      return;
    }
    if (g.moved) return;
    // 두 번 탭 → 확대/원래대로
    const now = Date.now();
    const lt = lastTap.current;
    if (now - lt.t < 300 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
      lastTap.current = { t: 0, x: 0, y: 0 };
      const v = viewRef.current;
      setView(v.scale > 1 ? { scale: 1, x: 0, y: 0 } : zoomAt(toCenter(e.clientX, e.clientY), DOUBLE_TAP_SCALE));
    } else {
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  };

  const onWheel = (e) => {
    const v = viewRef.current;
    setView(zoomAt(toCenter(e.clientX, e.clientY), v.scale * Math.exp(-e.deltaY * 0.0015)));
  };

  const photo = photos[cur];
  if (!photo) return null;
  const btn = {
    width: 40, height: 40, borderRadius: "50%", padding: 0,
    background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff",
    fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  };
  const textBtn = { ...btn, width: "auto", borderRadius: 20, padding: "0 14px", fontSize: 14, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 };
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#000", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", flexShrink: 0, color: "#fff" }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {photos.length > 1 ? `${cur + 1} / ${photos.length}` : ""}
          {photo.caption && <span style={{ fontWeight: 500, marginLeft: photos.length > 1 ? 10 : 0 }}>{photo.caption}</span>}
        </div>
        {canShare && (
          <button onClick={onShare} disabled={busy} style={{ ...textBtn, opacity: busy ? 0.6 : 1 }}>{isIOS() ? "공유·저장" : "공유"}</button>
        )}
        {!(canShare && isIOS()) && (
          <button onClick={onSave} disabled={busy} style={{ ...textBtn, opacity: busy ? 0.6 : 1 }}>저장</button>
        )}
        {(!canShare || failed) && (
          <button onClick={() => window.open(photo.url, "_blank", "noopener")} style={textBtn}>원본 열기</button>
        )}
        {closeLabel
          ? <button onClick={close} style={{ ...btn, width: "auto", borderRadius: 20, padding: "0 14px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap" }}>{closeLabel}</button>
          : <button onClick={close} aria-label="닫기" style={btn}>✕</button>}
      </div>

      <div
        ref={boxRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden", touchAction: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: view.scale > 1 ? "grab" : "default" }}
      >
        <img
          key={photo.url}
          src={photo.url}
          alt="사진 크게 보기"
          draggable={false}
          style={{
            maxWidth: "100%", maxHeight: "100%", objectFit: "contain", userSelect: "none", pointerEvents: "none",
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: gesture.current ? "none" : "transform 0.15s ease-out",
          }}
        />
        {photos.length > 1 && (
          <>
            <button onClick={() => go(-1)} aria-label="이전 사진" style={{ ...btn, position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>‹</button>
            <button onClick={() => go(1)} aria-label="다음 사진" style={{ ...btn, position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}>›</button>
          </>
        )}
      </div>

      <div aria-live="polite" style={{ padding: "8px 14px 16px", textAlign: "center", fontSize: notice ? 14 : 12, fontWeight: notice ? 700 : 400, color: notice ? "#fff" : "rgba(255,255,255,0.55)", flexShrink: 0 }}>
        {busy ? "사진을 가져오는 중…" : notice || `두 손가락으로 벌리거나 두 번 눌러 확대${photos.length > 1 ? " · 옆으로 밀어 넘기기" : ""}`}
      </div>
    </div>,
    document.body
  );
}
