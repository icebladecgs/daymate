import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { indentAtCursor } from "../utils/editorAssist.js";
import { canAutoFocus } from "../utils/device.js";

// 휴대폰 메모 입력칸의 ⇤ 내어쓰기 / ⇥ 들여쓰기 (2026-11-01) — 휴대폰 키보드엔 Tab이 없어
// 목록 단계(1. → 가. → 1))를 바꿀 수 없었다. 입력칸에 커서가 있을 때만 키보드 바로 위에 띄운다.
// 터치 화면에서만 (PC는 Tab/Shift+Tab). 버튼을 눌러도 입력칸 커서가 빠지지 않게 mousedown을 막는다.
export default function IndentBar({ taRef }) {
  const [focused, setFocused] = useState(false);
  const [bottom, setBottom] = useState(0);
  const touch = !canAutoFocus();

  useEffect(() => {
    const ta = taRef.current;
    if (!touch || !ta) return;
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    ta.addEventListener("focus", on);
    ta.addEventListener("blur", off);
    if (document.activeElement === ta) on();
    return () => { ta.removeEventListener("focus", on); ta.removeEventListener("blur", off); };
  }, [taRef, touch]);

  // 키보드가 올라오면 보이는 화면(visualViewport)이 줄어든다 → 그만큼 띄워서 키보드 바로 위에
  useEffect(() => {
    const vv = window.visualViewport;
    if (!focused || !vv) return;
    const place = () => setBottom(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    place();
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    return () => { vv.removeEventListener("resize", place); vv.removeEventListener("scroll", place); };
  }, [focused]);

  if (!touch || !focused) return null;
  const btn = { flex: 1, height: 40, padding: 0, borderRadius: 10, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "#5B7CFA", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
  const press = (shift) => indentAtCursor(taRef.current, shift);
  return createPortal(
    <div data-indent-bar style={{ position: "fixed", left: 0, right: 0, bottom, zIndex: 920, display: "flex", gap: 8, padding: "6px 12px", background: "var(--dm-bg)", borderTop: "1px solid var(--dm-border)", maxWidth: 430, margin: "0 auto" }}>
      <button onMouseDown={e => e.preventDefault()} onClick={() => press(true)} style={btn}>⇤ 내어쓰기</button>
      <button onMouseDown={e => e.preventDefault()} onClick={() => press(false)} style={btn}>⇥ 들여쓰기</button>
    </div>,
    document.body
  );
}
