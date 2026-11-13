import { useEffect, useRef, useState } from "react";
import { BUILTIN_TEMPLATES, fillTemplate, getUserTemplates, setUserTemplates, getHiddenBuiltins, setHiddenBuiltins } from "../utils/memoTemplates.js";
import { canAutoFocus } from "../utils/device.js";
import TemplateMakeSheet from "./TemplateMakeSheet.jsx";

// 📄 틀로 시작 (2026-11-13) — 빈 메모일 때만 입력칸 위에. 누르면 틀 글을 넣고 {커서} 자리에 커서. utils/memoTemplates.js
// - onPick(넣은 글): 쓰는 쪽이 기억해 두고, 한 글자도 안 바꾼 동안은 저장하지 않는다 (사용자 요청)
// - 칩이 많으면: PC는 다음 줄로 내려가고, 휴대폰은 좌우로 민다(스크롤 막대는 숨김 — 막대가 칩 아래에 회색 줄로 겹쳤다).
//   PC 가로 스크롤은 "이쁘지 않다"는 사용자 의견으로 줄바꿈 (2026-11-13)
// - "편집"을 눌렀을 때만 ✕: 기본 틀은 숨기기(되살리기 가능), 내 틀은 지우기. 평소엔 ✕ 없이 깔끔하게
// - "＋ 만들기"로 이름·내용을 직접 써서 내 틀을 만든다(TemplateMakeSheet)
export default function TemplateRow({ text, setText, taRef, style, onPick, onNotice }) {
  const [mine, setMine] = useState(getUserTemplates);
  const [hiddenIds, setHiddenIds] = useState(getHiddenBuiltins);
  const [making, setMaking] = useState(false);
  const [editing, setEditing] = useState(false);
  const rowRef = useRef(null);
  const touch = !canAutoFocus();
  const hidden = !!String(text || "").trim();
  useEffect(() => {
    const on = () => { setMine(getUserTemplates()); setHiddenIds(getHiddenBuiltins()); };
    window.addEventListener("dm:templates-changed", on);
    return () => window.removeEventListener("dm:templates-changed", on);
  }, []);
  // 휴대폰처럼 옆으로 미는 줄에서 PC 휠도 옆으로 (줄바꿈하는 PC에선 넘칠 일이 없어 그대로)
  useEffect(() => {
    const el = rowRef.current;
    if (!el || !touch) return;
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY > 0 && el.scrollLeft >= max - 1) || (e.deltaY < 0 && el.scrollLeft <= 0)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hidden, touch]);

  const pick = (t) => {
    if (editing) return;
    const f = fillTemplate(t.text);
    onPick?.(f.text);
    setText(f.text);
    setTimeout(() => { const ta = taRef?.current; if (ta) { ta.focus(); ta.setSelectionRange(f.caret, f.caret); } }, 0);
  };
  const removeMine = (t) => {
    if (!window.confirm(`내 틀 "${t.name}"을(를) 지울까요?\n다른 기기에서도 사라져요.`)) return;
    setUserTemplates(mine.filter((x) => x.id !== t.id));
  };
  const hideBuiltin = (t) => setHiddenBuiltins([...hiddenIds, t.id]);
  const sheet = making && <TemplateMakeSheet onClose={() => setMaking(false)} onSaved={(nm) => onNotice?.(`📄 "${nm}" 틀을 만들었어요`)} />;
  if (hidden) return sheet || null;

  const builtins = BUILTIN_TEMPLATES.filter((t) => !hiddenIds.includes(t.id));
  const chip = { flexShrink: 0, height: 34, padding: "0 12px", borderRadius: 999, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-sub)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 };
  const x = (label, onClick) => (
    <button type="button" aria-label={label} onClick={onClick}
      style={{ width: 24, height: 24, padding: 0, marginRight: -4, background: "none", border: "none", color: "#F87171", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>✕</button>
  );
  const named = (t, isMine) => (
    <span key={t.id} style={{ ...chip, ...(editing ? { paddingRight: 8 } : {}), ...(isMine ? { color: "var(--dm-accent, #5B7CFA)", borderColor: "var(--dm-accent-line, rgba(91,124,250,.35))" } : {}) }}>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(t)}
        style={{ background: "none", border: "none", padding: 0, color: "inherit", font: "inherit", cursor: editing ? "default" : "pointer" }}>{t.name}</button>
      {editing && (isMine ? x(`${t.name} 틀 지우기`, () => removeMine(t)) : x(`${t.name} 틀 숨기기`, () => hideBuiltin(t)))}
    </span>
  );
  const ghost = { ...chip, background: "none", borderStyle: "dashed" };
  return (
    <>
      <div ref={rowRef} className={touch ? "dm-noscrollbar" : undefined}
        style={{ display: "flex", alignItems: "center", gap: 6, rowGap: 8, paddingBottom: 6, ...(touch ? { overflowX: "auto" } : { flexWrap: "wrap" }), ...style }}>
        <span style={{ flexShrink: 0, fontSize: 13, color: "var(--dm-muted)", fontWeight: 700 }}>📄 틀로 시작</span>
        {builtins.map((t) => named(t, false))}
        {mine.map((t) => named(t, true))}
        {!editing && (
          <button type="button" onClick={() => setMaking(true)} aria-label="틀 만들기"
            style={{ ...ghost, color: "var(--dm-accent, #5B7CFA)", borderColor: "var(--dm-accent-line, rgba(91,124,250,.45))" }}>＋ 만들기</button>
        )}
        {editing && hiddenIds.length > 0 && (
          <button type="button" onClick={() => setHiddenBuiltins([])} style={{ ...ghost, color: "var(--dm-sub)" }}>↺ 기본 틀 되살리기</button>
        )}
        <button type="button" onClick={() => setEditing((v) => !v)} aria-pressed={editing}
          style={{ ...ghost, color: editing ? "var(--dm-accent, #5B7CFA)" : "var(--dm-muted)", borderColor: editing ? "var(--dm-accent, #5B7CFA)" : "var(--dm-border)", fontWeight: 700 }}>
          {editing ? "완료" : "편집"}
        </button>
      </div>
      {sheet}
    </>
  );
}
