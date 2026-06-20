import { useState, useEffect, useRef } from "react";
import S from "../styles.js";

function getMemoTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function MemoItem({ item, onSave, onDelete }) {
  const [text, setText] = useState(item.text);
  const [expanded, setExpanded] = useState(false);
  const prevText = useRef(item.text);

  useEffect(() => {
    if (item.text !== prevText.current) {
      setText(item.text);
      prevText.current = item.text;
    }
  }, [item.text]);

  const lineCount = (text.match(/\n/g) || []).length + 1;
  const isLong = lineCount >= 3 || text.length > 120;
  const rows = expanded ? Math.max(1, lineCount) : Math.min(Math.max(1, lineCount), 3);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <textarea
          value={text}
          rows={rows}
          onChange={e => setText(e.target.value)}
          onFocus={() => isLong && setExpanded(true)}
          onBlur={() => { if (text !== item.text) onSave(item.id, text); }}
          style={{ ...S.input, flex: 1, marginBottom: 0, resize: "none", fontSize: 13, lineHeight: 1.6, padding: "8px 10px", overflow: "hidden" }}
        />
        <button
          onClick={() => onDelete(item.id)}
          style={{ background: "none", border: "none", color: "#F87171", cursor: "pointer", fontSize: 16, padding: "8px 2px", flexShrink: 0, lineHeight: 1 }}
        >✕</button>
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ background: "none", border: "none", color: "var(--dm-muted)", fontSize: 11, cursor: "pointer", padding: "2px 0 0", fontFamily: "inherit", fontWeight: 700 }}
        >{expanded ? "접기 ▲" : "펼치기 ▼"}</button>
      )}
    </div>
  );
}

export function genMemoId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
}

export function getMemoTimeStr() {
  return getMemoTime();
}

export default function MemoTimeline({ memos = [], onAdd, onUpdate, onDelete, placeholder, extraAction }) {
  const [input, setInput] = useState("");
  const inputRef = useRef(null);

  const handleAdd = () => {
    const text = input.trim();
    if (!text) return;
    onAdd(text, getMemoTime());
    setInput("");
    inputRef.current?.focus();
  };

  const inputRows = Math.max(1, (input.match(/\n/g) || []).length + 1);

  return (
    <div>
      {memos.map(memo => (
        <div key={memo.id} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
          <div style={{ fontSize: 11, color: "#6C8EFF", fontWeight: 900, paddingTop: 9, width: 34, flexShrink: 0 }}>
            {memo.createdAt || ""}
          </div>
          <div style={{ flex: 1 }}>
            <MemoItem item={memo} onSave={onUpdate} onDelete={onDelete} />
          </div>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: memos.length > 0 ? 10 : 0, alignItems: "flex-end" }}>
        <textarea
          ref={inputRef}
          value={input}
          rows={inputRows}
          onChange={e => setInput(e.target.value)}
          placeholder={placeholder || "메모 입력 후 + 버튼"}
          style={{ ...S.input, flex: 1, marginBottom: 0, fontSize: 13, resize: "none", lineHeight: 1.6 }}
        />
        {extraAction}
        <button
          onClick={handleAdd}
          style={{
            background: "rgba(75,111,255,0.15)", border: "1px solid rgba(75,111,255,0.3)",
            color: "#6C8EFF", borderRadius: 10, padding: "8px 14px", fontSize: 18,
            fontWeight: 900, cursor: "pointer", flexShrink: 0, fontFamily: "inherit",
          }}
        >+</button>
      </div>
    </div>
  );
}
