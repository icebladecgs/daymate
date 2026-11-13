import { useEffect, useState } from "react";
import { BUILTIN_TEMPLATES, fillTemplate, getUserTemplates, setUserTemplates } from "../utils/memoTemplates.js";

// 📄 틀로 시작 (2026-11-13) — 빈 메모일 때만 입력칸 위에 한 줄. 누르면 틀 글을 넣고 {커서} 자리에 커서.
// 내 틀은 ✕로 지운다(5초 되돌리기 대신 확인 — 지우면 다른 기기에서도 사라짐). utils/memoTemplates.js
export default function TemplateRow({ text, setText, taRef, style }) {
  const [mine, setMine] = useState(getUserTemplates);
  useEffect(() => {
    const on = () => setMine(getUserTemplates());
    window.addEventListener("dm:templates-changed", on);
    return () => window.removeEventListener("dm:templates-changed", on);
  }, []);
  if (String(text || "").trim()) return null;
  const pick = (t) => {
    const f = fillTemplate(t.text);
    setText(f.text);
    setTimeout(() => { const ta = taRef?.current; if (ta) { ta.focus(); ta.setSelectionRange(f.caret, f.caret); } }, 0);
  };
  const remove = (t) => {
    if (!window.confirm(`내 틀 "${t.name}"을(를) 지울까요?`)) return;
    setUserTemplates(mine.filter((x) => x.id !== t.id));
  };
  const chip = { flexShrink: 0, height: 34, padding: "0 12px", borderRadius: 999, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-sub)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", ...style }}>
      <span style={{ flexShrink: 0, fontSize: 13, color: "var(--dm-muted)", fontWeight: 700 }}>📄 틀로 시작</span>
      {BUILTIN_TEMPLATES.map((t) => <button key={t.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(t)} style={chip}>{t.name}</button>)}
      {mine.map((t) => (
        <span key={t.id} style={{ ...chip, padding: "0 4px 0 12px", color: "var(--dm-accent, #5B7CFA)", borderColor: "var(--dm-accent-line, rgba(91,124,250,.35))" }}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(t)} style={{ background: "none", border: "none", padding: 0, color: "inherit", font: "inherit", cursor: "pointer" }}>{t.name}</button>
          <button type="button" aria-label={`${t.name} 틀 지우기`} onClick={() => remove(t)} style={{ width: 26, height: 26, padding: 0, background: "none", border: "none", color: "var(--dm-muted)", fontSize: 14, cursor: "pointer" }}>✕</button>
        </span>
      ))}
    </div>
  );
}
