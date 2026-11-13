import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { indentAtCursor, checkboxAtCursor, listAtCursor, dateTimeAtCursor } from "../utils/editorAssist.js";
import { canAutoFocus } from "../utils/device.js";
import { newDesignOn } from "../utils/todayLook.js";

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
  const press = (shift) => indentAtCursor(taRef.current, shift);
  // 새 디자인 (2026-11-13 사용자 요청 "구식") — 얇은 띠에 선 아이콘 + 아래 글자.
  // 같은 날 6칸으로 늘림(사용자 승인): 내어쓰기·들여쓰기 + ☐ 체크·• 목록·1. 번호·🕐 날짜 — 휴대폰엔 Ctrl+Shift+X 같은 단축키가 없어서
  if (newDesignOn()) {
    const tb = { flex: 1, minWidth: 0, height: 52, padding: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, background: "none", border: "none", color: "var(--dm-text)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", WebkitTapHighlightColor: "transparent", whiteSpace: "nowrap" };
    const Ico = ({ children }) => (
      <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
    );
    const ta = () => taRef.current;
    const items = [
      { key: "out", label: "내어쓰기", run: () => press(true), icon: <><path d="M11 6h10M11 12h10M11 18h10" /><path d="M7 9l-3 3 3 3" /></> },
      { key: "in", label: "들여쓰기", run: () => press(false), icon: <><path d="M11 6h10M11 12h10M11 18h10" /><path d="M3 9l3 3-3 3" /></> },
      { key: "check", label: "체크", run: () => checkboxAtCursor(ta()), icon: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></> },
      { key: "bullet", label: "목록", run: () => listAtCursor(ta(), "bullet"), icon: <><circle cx="5" cy="7" r="1.2" /><circle cx="5" cy="12" r="1.2" /><circle cx="5" cy="17" r="1.2" /><path d="M10 7h10M10 12h10M10 17h10" /></> },
      { key: "number", label: "번호", run: () => listAtCursor(ta(), "number"), icon: <><path d="M4 5h1.5v5M4 10h3" /><path d="M4 14.5c0-1 2.8-1 2.8.4 0 1-2.8 2-2.8 3.6h3" /><path d="M11 7h9M11 12h9M11 17h9" /></> },
      { key: "date", label: "날짜", run: () => dateTimeAtCursor(ta()), icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></> },
    ];
    return createPortal(
      <div data-indent-bar style={{ position: "fixed", left: 0, right: 0, bottom, zIndex: 920, display: "flex", alignItems: "center", padding: "0 4px", background: "var(--dm-card)", borderTop: "1px solid var(--dm-border)", maxWidth: 430, margin: "0 auto" }}>
        {items.map((it) => (
          <button key={it.key} aria-label={it.label} onMouseDown={e => e.preventDefault()} onClick={it.run} style={tb}><Ico>{it.icon}</Ico>{it.label}</button>
        ))}
      </div>,
      document.body
    );
  }
  const btn = { flex: 1, height: 40, padding: 0, borderRadius: 10, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-accent, #5B7CFA)", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
  return createPortal(
    <div data-indent-bar style={{ position: "fixed", left: 0, right: 0, bottom, zIndex: 920, display: "flex", gap: 8, padding: "6px 12px", background: "var(--dm-bg)", borderTop: "1px solid var(--dm-border)", maxWidth: 430, margin: "0 auto" }}>
      <button onMouseDown={e => e.preventDefault()} onClick={() => press(true)} style={btn}>⇤ 내어쓰기</button>
      <button onMouseDown={e => e.preventDefault()} onClick={() => press(false)} style={btn}>⇥ 들여쓰기</button>
    </div>,
    document.body
  );
}
