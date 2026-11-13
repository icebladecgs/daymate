import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { hashPrefixAt, replaceBeforeCaret } from "../utils/editorAssist.js";
import { canAutoFocus } from "../utils/device.js";

// #태그 자동완성 (2026-11-13 사용자 승인) — 메모 입력칸에서 "#"을 치면 쓰던 태그를 칩으로 띄우고, 누르면 그 태그를 넣는다.
// 태그 철자가 매번 같아져서 메모 관리자 분류·검색이 잘 묶인다.
// - 휴대폰: 키보드 위 띠(IndentBar, 52px) 바로 위에. PC: 입력칸 아래쪽 안에 떠 있고, Tab으로 첫 칸을 넣는다(Esc로 닫기)
// - 버튼을 눌러도 입력칸 커서가 빠지지 않게 mousedown을 막는다(IndentBar와 같음)
// tags: 많이 쓴 순서의 태그 이름 목록 (# 없이)
export function tagMatches(tags, prefix, max = 8) {
  if (prefix == null) return [];
  const p = prefix.normalize("NFC").toLowerCase();
  const seen = new Set();
  const out = [];
  for (const t of tags || []) {
    const name = String(t || "").replace(/^#/, "").trim();
    const key = name.normalize("NFC").toLowerCase();
    if (!name || seen.has(key) || key === p || !key.startsWith(p)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

export default function TagSuggest({ taRef, tags }) {
  const touch = !canAutoFocus();
  const [prefix, setPrefix] = useState(null);
  const [focused, setFocused] = useState(false);
  const [closedAt, setClosedAt] = useState(null); // Esc로 닫은 그 "#글자" — 바뀌면 다시 보인다
  const [box, setBox] = useState(null); // PC: 입력칸 화면 위치
  const [bottom, setBottom] = useState(0); // 휴대폰: 키보드 높이

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    const update = () => {
      setPrefix(document.activeElement === ta && ta.selectionStart === ta.selectionEnd ? hashPrefixAt(ta.value, ta.selectionStart) : null);
      if (!touch) { const r = ta.getBoundingClientRect(); setBox({ left: r.left, bottom: Math.min(r.bottom, window.innerHeight), width: r.width }); }
    };
    const on = () => { setFocused(true); update(); };
    const off = () => { setFocused(false); setPrefix(null); };
    const onSel = () => { if (document.activeElement === ta) update(); };
    ta.addEventListener("input", update);
    ta.addEventListener("keyup", update);
    ta.addEventListener("click", update);
    ta.addEventListener("focus", on);
    ta.addEventListener("blur", off);
    document.addEventListener("selectionchange", onSel);
    if (document.activeElement === ta) on();
    return () => {
      ta.removeEventListener("input", update); ta.removeEventListener("keyup", update); ta.removeEventListener("click", update);
      ta.removeEventListener("focus", on); ta.removeEventListener("blur", off);
      document.removeEventListener("selectionchange", onSel);
    };
  }, [taRef, touch]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!touch || !focused || !vv) return;
    const place = () => setBottom(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    place();
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    return () => { vv.removeEventListener("resize", place); vv.removeEventListener("scroll", place); };
  }, [focused, touch]);

  const list = useMemo(() => (prefix !== null && prefix !== closedAt ? tagMatches(tags, prefix) : []), [tags, prefix, closedAt]);
  const accept = (name) => {
    const ta = taRef.current;
    if (!ta || prefix === null) return;
    replaceBeforeCaret(ta, prefix.length + 1, `#${name} `);
    setPrefix(null);
  };

  // PC: Tab = 첫 칸 넣기, Esc = 닫기 (React 키 처리보다 먼저 받아 목록 들여쓰기로 가지 않게)
  useEffect(() => {
    const ta = taRef.current;
    if (!ta || touch || !list.length) return;
    const onKey = (e) => {
      if (e.isComposing) return;
      if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); accept(list[0]); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setClosedAt(prefix); }
    };
    ta.addEventListener("keydown", onKey);
    return () => ta.removeEventListener("keydown", onKey);
  });

  if (!focused || !list.length) return null;
  const chip = { flexShrink: 0, height: 34, padding: "0 12px", borderRadius: 999, border: "1px solid var(--dm-accent-line, rgba(91,124,250,.35))", background: "var(--dm-accent-soft, rgba(91,124,250,.12))", color: "var(--dm-accent, #5B7CFA)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
  const row = list.map((name, i) => (
    <button key={name} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => accept(name)} style={chip} title={!touch && i === 0 ? "Tab으로 넣기" : undefined}>
      #{name}{!touch && i === 0 ? <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.7 }}>Tab</span> : null}
    </button>
  ));
  if (touch) {
    return createPortal(
      <div data-tag-suggest style={{ position: "fixed", left: 0, right: 0, bottom: bottom + 52, zIndex: 921, display: "flex", gap: 6, overflowX: "auto", padding: "6px 8px", background: "var(--dm-card)", borderTop: "1px solid var(--dm-border)", maxWidth: 430, margin: "0 auto" }}>
        {row}
      </div>,
      document.body
    );
  }
  if (!box) return null;
  return createPortal(
    <div data-tag-suggest style={{ position: "fixed", left: box.left + 8, width: Math.max(160, box.width - 16), top: box.bottom - 46, zIndex: 1600, display: "flex", gap: 6, overflowX: "auto", padding: 4, borderRadius: 12, background: "var(--dm-card)", boxShadow: "0 4px 16px rgba(0,0,0,.25)" }}>
      {row}
    </div>,
    document.body
  );
}
