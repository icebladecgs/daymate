import { useEffect, useRef, useState } from "react";
import { getMemoTimeStr } from "./MemoTimeline.jsx";

export default function LongMemoEditor({ initialId = null, initialText = '', onCreate, onUpdate, onClose, onSearch, onOpenKnowledge }) {
  const [text, setText] = useState(initialText);
  const [savedAt, setSavedAt] = useState(null);
  const textareaRef = useRef(null);
  const idRef = useRef(initialId);
  const savedTextRef = useRef(initialText);

  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const flush = (value) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === savedTextRef.current) return;
    if (idRef.current) onUpdate(idRef.current, trimmed);
    else idRef.current = onCreate(trimmed);
    savedTextRef.current = trimmed;
    setSavedAt(getMemoTimeStr());
  };

  // 자동 저장 debounce (1초)
  useEffect(() => {
    if (text.trim() === savedTextRef.current) return;
    const timer = setTimeout(() => flush(text), 1000);
    return () => clearTimeout(timer);
  }, [text]); // eslint-disable-line

  const handleClose = () => { flush(text); onClose(); };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--dm-bg)', zIndex: 500, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--dm-border)', flexShrink: 0 }}>
        <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, fontSize: 15, fontWeight: 900, color: 'var(--dm-text)' }}>긴 메모</div>
        {onSearch && <button onClick={onSearch} aria-label="검색" style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 18, cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}>🔍</button>}
        {onOpenKnowledge && <button onClick={onOpenKnowledge} aria-label="지식" style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 18, cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}>🧠</button>}
        <button
          onClick={handleClose}
          style={{ background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.4)', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 900, color: '#A78BFA', cursor: 'pointer', fontFamily: 'inherit' }}
        >저장</button>
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleClose(); }}
        placeholder="자유롭게 작성하세요"
        style={{ flex: 1, background: 'var(--dm-bg)', border: 'none', outline: 'none', padding: '20px 20px', fontSize: 15, color: 'var(--dm-text)', lineHeight: 1.8, resize: 'none', fontFamily: 'inherit', wordBreak: 'break-word', overflowWrap: 'break-word' }}
      />
      <div style={{ padding: '8px 20px 20px', fontSize: 11, color: 'var(--dm-muted)', flexShrink: 0 }}>
        {text.length}자 · {savedAt ? `${savedAt} 자동저장됨` : '1초간 멈추면 자동저장돼요'}
      </div>
    </div>
  );
}
