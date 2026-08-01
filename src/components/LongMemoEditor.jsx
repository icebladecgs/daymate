import { useEffect, useRef, useState } from "react";
import S from "../styles.js";
import { getMemoTimeStr } from "./MemoTimeline.jsx";
import PhotoGallery from "./PhotoGallery.jsx";

export default function LongMemoEditor({ initialId = null, initialText = '', subtitle = '', onCreate, onUpdate, onClose, onSearch, onOpenKnowledge, uid, pathPrefix, initialPhotos = [], onUpdatePhotos, onPhotoError }) {
  const [text, setText] = useState(initialText);
  const [savedAt, setSavedAt] = useState(null);
  const [photos, setPhotos] = useState(initialPhotos);
  const textareaRef = useRef(null);
  const idRef = useRef(initialId);
  const savedTextRef = useRef(initialText);

  // 아직 저장 전(id 없음)인데 사진을 먼저 추가하면, 지금까지 쓴 텍스트(없으면 플레이스홀더)로 즉시 메모를 생성
  const ensureId = () => {
    if (idRef.current) return idRef.current;
    const placeholder = text.trim() || '📷 사진';
    idRef.current = onCreate(placeholder);
    savedTextRef.current = placeholder;
    setSavedAt(getMemoTimeStr());
    return idRef.current;
  };

  const handlePhotosChange = (next) => {
    const id = ensureId();
    setPhotos(next);
    onUpdatePhotos?.(id, next);
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
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleClose(); }}
          placeholder="자유롭게 작성하세요"
          style={{ minHeight: '35vh', background: 'var(--dm-bg)', border: 'none', outline: 'none', padding: '20px 20px', fontSize: 15, color: 'var(--dm-text)', lineHeight: 1.8, resize: 'none', fontFamily: 'inherit', wordBreak: 'break-word', overflowWrap: 'break-word' }}
        />
        {uid && (
          <div style={{ padding: '0 20px 16px' }}>
            <PhotoGallery
              uid={uid}
              pathPrefix={pathPrefix}
              photos={photos}
              onChange={handlePhotosChange}
              onError={onPhotoError}
            />
          </div>
        )}
      </div>
      <div style={{ padding: '8px 20px 20px', fontSize: 11, color: 'var(--dm-muted)', flexShrink: 0 }}>
        {text.length}자 · {savedAt ? `${savedAt} 자동저장됨` : '1초간 멈추면 자동저장돼요'}
      </div>
    </div>
  );
}
