import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addNamedTemplate, getUserTemplates, setUserTemplates, fillTemplate, MAX_USER_TEMPLATES } from "../utils/memoTemplates.js";
import { useBackClose } from "../utils/useBackClose.js";

// ＋ 틀 만들기 (2026-11-13 사용자 요청) — 이름과 내용을 직접 써서 내 틀로. {날짜}·{시간}은 넣을 때 값으로, {커서}는 커서 자리.
// 내 틀은 계정에 저장돼 다른 기기에서도 보인다(utils/memoTemplates.js → App이 올림)
export default function TemplateMakeSheet({ onClose, onSaved }) {
  useBackClose(onClose);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const taRef = useRef(null);
  const insert = (tok) => {
    const ta = taRef.current;
    const s = ta ? ta.selectionStart : body.length, e = ta ? ta.selectionEnd : body.length;
    const next = body.slice(0, s) + tok + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => { if (ta) { ta.focus(); ta.setSelectionRange(s + tok.length, s + tok.length); } });
  };
  const save = () => {
    const r = addNamedTemplate(getUserTemplates(), name, body);
    if (r.error) { setErr(r.error); return; }
    setUserTemplates(r.list);
    onSaved?.(r.name);
    onClose();
  };
  const preview = body.trim() ? fillTemplate(body).text : "";
  const tokBtn = { height: 34, padding: "0 12px", borderRadius: 999, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-sub)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
  const input = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 12, border: "none", background: "var(--dm-input)", color: "var(--dm-text)", fontSize: 15, fontFamily: "inherit", outline: "none" };
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1500, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="틀 만들기"
        style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", background: "var(--dm-bg)", borderRadius: "20px 20px 0 0", padding: "16px 16px 20px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1, fontSize: 19, fontWeight: 900, color: "var(--dm-text)" }}>📄 틀 만들기</div>
          <button onClick={onClose} aria-label="닫기" style={{ width: 40, height: 40, padding: 0, border: "none", background: "none", color: "var(--dm-muted)", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        <input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} maxLength={12} placeholder="틀 이름 (예: 주간 보고)" aria-label="틀 이름" style={input} />
        <textarea ref={taRef} value={body} onChange={(e) => { setBody(e.target.value); setErr(""); }} rows={8} maxLength={3000} aria-label="틀 내용"
          placeholder={"틀 내용\n예)\n주간 보고 {날짜}\n한 일\n- {커서}\n다음 주 할 일\n- "} style={{ ...input, resize: "vertical", lineHeight: 1.7, minHeight: 160 }} />
        <div style={{ display: "flex", gap: 6, overflowX: "auto" }} className="dm-noscrollbar">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert("{날짜}")} style={tokBtn}>＋ 날짜</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert("{시간}")} style={tokBtn}>＋ 시간</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert("{커서}")} style={tokBtn}>＋ 커서 자리</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert("[ ] ")} style={tokBtn}>＋ 체크</button>
        </div>
        <div style={{ fontSize: 13, color: "var(--dm-muted)", lineHeight: 1.5 }}>{"{날짜}·{시간}은 넣는 순간 오늘 날짜·지금 시간으로 바뀌고, {커서} 자리에서 바로 쓰기 시작해요. 내 틀은 "}{MAX_USER_TEMPLATES}{"개까지, 다른 기기에서도 보여요."}</div>
        {preview && (
          <div style={{ fontSize: 13, color: "var(--dm-sub)", whiteSpace: "pre-wrap", background: "var(--dm-input)", borderRadius: 12, padding: "10px 12px", maxHeight: 140, overflowY: "auto" }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>미리 보기</div>{preview}
          </div>
        )}
        {err && <div style={{ fontSize: 13, color: "#F87171", fontWeight: 700 }}>{err}</div>}
        <button onClick={save} style={{ height: 48, border: "none", borderRadius: 12, background: "var(--dm-accent, #5B7CFA)", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>틀 저장</button>
      </div>
    </div>,
    document.body
  );
}
