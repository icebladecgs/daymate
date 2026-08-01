import { useState, useEffect, useRef } from "react";
import S from "../styles.js";
import PhotoAttach from "./PhotoAttach.jsx";

function getMemoTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

const chipBtn = (color) => ({
  background: `${color}1A`,
  border: `1px solid ${color}44`,
  color,
  borderRadius: 8,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
});

function MemoItem({ item, onSave, onDelete, onOpenLongEditor, uid, pathPrefix, onUpdatePhoto, onPhotoError }) {
  const [mode, setMode] = useState('collapsed');
  const [editText, setEditText] = useState(item.text);

  useEffect(() => { setEditText(item.text); }, [item.text]);

  const isLong = item.text.includes('\n') || item.text.length > 35;
  const editRows = Math.max(2, (editText.match(/\n/g) || []).length + 1);

  const handleCopy = () => navigator.clipboard.writeText(item.text);
  const handleSave = () => { onSave(item.id, editText); setMode('collapsed'); };
  const handleCancel = () => { setEditText(item.text); setMode('collapsed'); };

  if (mode === 'editing') {
    return (
      <div>
        <textarea
          value={editText}
          rows={editRows}
          autoFocus
          onChange={e => setEditText(e.target.value)}
          style={{ ...S.input, marginBottom: 6, resize: "none", fontSize: 13, lineHeight: 1.6, padding: "8px 10px", wordBreak: "break-word", overflowWrap: "break-word" }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={handleSave} style={chipBtn('#4B6FFF')}>저장</button>
          <button onClick={handleCancel} style={chipBtn('#888')}>취소</button>
        </div>
      </div>
    );
  }

  if (mode === 'expanded') {
    return (
      <div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--dm-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word', padding: '8px 10px', background: 'var(--dm-input)', border: '1.5px solid var(--dm-border)', borderRadius: 8, marginBottom: 6 }}>
          {item.text}
        </div>
        {uid && (
          <div style={{ marginBottom: 6 }}>
            <PhotoAttach
              uid={uid}
              pathPrefix={pathPrefix}
              photoUrl={item.photoUrl}
              photoPath={item.photoPath}
              onChange={(photo) => onUpdatePhoto(item.id, photo)}
              onError={onPhotoError}
              size={64}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleCopy} style={chipBtn('#6C8EFF')}>복사</button>
          <button onClick={() => setMode('editing')} style={chipBtn('#6C8EFF')}>수정</button>
          {onOpenLongEditor && <button onClick={() => onOpenLongEditor(item)} style={chipBtn('#A78BFA')}>긴메모편집</button>}
          <button onClick={() => onDelete(item.id)} style={chipBtn('#F87171')}>삭제</button>
          <div style={{ flex: 1 }} />
          <button onClick={() => setMode('collapsed')} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: '4px 6px' }}>∧</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <div
        onClick={() => isLong ? setMode('expanded') : setMode('editing')}
        style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--dm-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '8px 10px', background: 'var(--dm-input)', border: '1.5px solid var(--dm-border)', borderRadius: 8, cursor: 'pointer' }}
      >
        {item.photoUrl && <span style={{ marginRight: 4 }}>📷</span>}
        {item.text.replace(/\n/g, ' ')}
      </div>
      {isLong && (
        <button onClick={() => setMode('expanded')} style={{ background: 'none', border: 'none', color: '#6C8EFF', cursor: 'pointer', fontSize: 14, padding: '4px 6px', flexShrink: 0 }}>∨</button>
      )}
      <button onClick={() => onDelete(item.id)} style={{ background: 'none', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 16, padding: '8px 2px', flexShrink: 0, lineHeight: 1 }}>✕</button>
    </div>
  );
}

export function genMemoId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
}

export function getMemoTimeStr() {
  return getMemoTime();
}

export default function MemoTimeline({ memos = [], onAdd, onUpdate, onDelete, placeholder, extraAction, onOpenLongEditor, uid, pathPrefix, onUpdatePhoto, onPhotoError }) {
  const [input, setInput] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [memos.length]);

  const handleAdd = () => {
    const text = input.trim();
    if (!text) return;
    onAdd(text, getMemoTime(), pendingPhoto);
    setInput("");
    setPendingPhoto(null);
    inputRef.current?.focus();
  };

  const inputRows = Math.max(1, (input.match(/\n/g) || []).length + 1);

  return (
    <div>
      <div ref={listRef}>
        {memos.map(memo => (
          <div key={memo.id} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
            <div style={{ fontSize: 11, color: "#6C8EFF", fontWeight: 900, paddingTop: 9, width: 34, flexShrink: 0 }}>
              {memo.createdAt || ""}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <MemoItem item={memo} onSave={onUpdate} onDelete={onDelete} onOpenLongEditor={onOpenLongEditor}
                uid={uid} pathPrefix={pathPrefix} onUpdatePhoto={onUpdatePhoto} onPhotoError={onPhotoError} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: memos.length > 0 ? 10 : 0, alignItems: "flex-end" }}>
        <textarea
          ref={inputRef}
          value={input}
          rows={inputRows}
          onChange={e => setInput(e.target.value)}
          placeholder={placeholder || "메모 입력 후 + 버튼"}
          style={{ ...S.input, flex: 1, marginBottom: 0, fontSize: 13, resize: "none", lineHeight: 1.6 }}
        />
        {uid && (
          <PhotoAttach
            uid={uid}
            pathPrefix={pathPrefix}
            photoUrl={pendingPhoto?.url}
            photoPath={pendingPhoto?.path}
            onChange={setPendingPhoto}
            onError={onPhotoError}
            size={42}
          />
        )}
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
