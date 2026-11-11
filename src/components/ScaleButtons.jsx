import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FONT_STEPS, flashScale } from "../utils/fontScale.js";

// 화면 크기를 바꿀 때 가운데에 "120%"를 잠깐 띄운다 (2026-11-11 사용자 요청) — App에 하나만 둔다
export function ScaleFlash() {
  const [shown, setShown] = useState(null); // { pct, n }
  useEffect(() => {
    let t = null;
    const on = (e) => {
      clearTimeout(t);
      setShown((s) => ({ pct: e.detail, n: (s?.n || 0) + 1 }));
      t = setTimeout(() => setShown(null), 900);
    };
    window.addEventListener("dm:scale-flash", on);
    return () => { window.removeEventListener("dm:scale-flash", on); clearTimeout(t); };
  }, []);
  if (!shown) return null;
  return createPortal(
    <div key={shown.n} aria-live="polite" style={{ position: "fixed", left: "50%", top: "45%", transform: "translate(-50%, -50%)", zIndex: 3000, pointerEvents: "none",
      padding: "14px 26px", borderRadius: 16, background: "var(--dm-accent, #5B7CFA)", boxShadow: "0 8px 30px rgba(0,0,0,.35)", color: "#fff", fontSize: 30, fontWeight: 800, fontFamily: "inherit",
      fontVariantNumeric: "tabular-nums", animation: "dm-scale-flash .9s ease forwards" }}>
      <style>{"@keyframes dm-scale-flash { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.92); } 15% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 70% { opacity: 1; } 100% { opacity: 0; } }"}</style>
      {shown.pct}%
    </div>,
    document.body,
  );
}

// 넓은 화면(대시보드·메모 관리자) 위쪽의 가− / 가+ — 한 단계씩(100·110·120·130%)
export default function ScaleButtons({ value, onChange }) {
  const i = Math.max(0, FONT_STEPS.findIndex((s) => s.id === value));
  const go = (d) => {
    const next = FONT_STEPS[i + d];
    if (!next) { flashScale(value); return; } // 끝이면 지금 값만 보여 준다
    onChange(next.id);
    flashScale(next.id);
  };
  const btn = { width: 40, height: 40, padding: 0, borderRadius: 10, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-text)", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, flexShrink: 0, marginTop: 0 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
      <button onClick={() => go(-1)} aria-label="화면 작게" title={`화면 작게 (지금 ${FONT_STEPS[i].pct}%)`} style={{ ...btn, fontSize: 13, opacity: i === 0 ? 0.45 : 1 }}>가−</button>
      <button onClick={() => go(1)} aria-label="화면 크게" title={`화면 크게 (지금 ${FONT_STEPS[i].pct}%)`} style={{ ...btn, fontSize: 16, opacity: i === FONT_STEPS.length - 1 ? 0.45 : 1 }}>가+</button>
    </div>
  );
}
