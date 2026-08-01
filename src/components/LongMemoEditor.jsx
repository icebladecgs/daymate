import { useEffect, useRef, useState } from "react";
import S from "../styles.js";
import { getMemoTimeStr } from "./MemoTimeline.jsx";
import PhotoAttach from "./PhotoAttach.jsx";

export default function LongMemoEditor({ initialId = null, initialText = '', subtitle = '', onCreate, onUpdate, onClose, onSearch, onOpenKnowledge, uid, pathPrefix, initialPhotoUrl = null, initialPhotoPath = null, onUpdatePhoto, onPhotoError }) {
  const [text, setText] = useState(initialText);
  const [savedAt, setSavedAt] = useState(null);
  const [photo, setPhoto] = useState({ url: initialPhotoUrl, path: initialPhotoPath });
  const [hasId, setHasId] = useState(!!initialId);
  const textareaRef = useRef(null);
  const idRef = useRef(initialId);
  const savedTextRef = useRef(initialText);

  const handlePhotoChange = (next) => {
    setPhoto(next || { url: null, path: null });
    onUpdatePhoto?.(idRef.current, next);
  };

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
    setHasId(true);
  };

  // 자동 저장 debounce (1초)
  useEffect(() => {
    if (text.trim() === savedTextRef.current) return;
    const timer = setTimeout(() => flush(text), 1000);
    return () => clearTimeout(timer);
  }, [text]); // eslint-disable-line

  const handleClose = () => { flush(text); onClose(); };

  return (
    <div style={S.fullScreenPanel(90)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--dm-border)', flexShrink: 0 }}>
        <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--dm-text)' }}>긴 메모</div>
          {subtitle && <div style={{ fontSize: 12, color: "var(--dm-sub)", marginTop: 2 }}>{subtitle}</div>}
        </div>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 20px', flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--dm-muted)' }}>
          {text.length}자 · {savedAt ? `${savedAt} 자동저장됨` : '1초간 멈추면 자동저장돼요'}
        </div>
        {uid && (
          <PhotoAttach
            uid={uid}
            pathPrefix={pathPrefix}
            photoUrl={photo.url}
            photoPath={photo.path}
            onChange={handlePhotoChange}
            onError={onPhotoError}
            disabled={!hasId}
            size={34}
          />
        )}
      </div>
    </div>
  );
}
