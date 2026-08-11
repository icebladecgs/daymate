import { useRef, useState } from "react";
import { uploadPhoto, deletePhoto } from "../firebase.js";
import { compressImage, photoErrorMessage } from "../utils/image.js";

export default function PhotoAttach({ uid, pathPrefix, photoUrl, photoPath, onChange, onError, disabled = false, size = 40 }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const inputRef = useRef(null);

  const handlePick = () => {
    if (disabled || uploading || !uid) return;
    inputRef.current?.click();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const blob = await compressImage(file);
      const path = `${pathPrefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const result = await uploadPhoto(path, blob, uid);
      onChange(result);
    } catch (err) {
      onError?.(photoErrorMessage(err));
    }
    setUploading(false);
  };

  const handleRemove = async (e) => {
    e.stopPropagation();
    if (!window.confirm('사진을 삭제할까요?')) return;
    if (photoPath) deletePhoto(photoPath);
    onChange(null);
  };

  const boxStyle = {
    width: size, height: size, borderRadius: 10, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled || uploading ? 'default' : 'pointer',
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />

      {uploading ? (
        <div style={{ ...boxStyle, background: 'var(--dm-input)', border: '1.5px solid var(--dm-border)' }}>
          <span className="dm-spin" style={{ fontSize: size * 0.4 }}>⏳</span>
        </div>
      ) : photoUrl ? (
        <div style={{ position: 'relative' }}>
          <img
            src={photoUrl}
            onClick={() => setPreview(true)}
            style={{ ...boxStyle, objectFit: 'cover', border: '1.5px solid var(--dm-border)' }}
            alt="첨부 사진"
          />
          <button
            onClick={handleRemove}
            style={{
              position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
              background: '#F87171', border: '2px solid var(--dm-bg)', color: '#fff', fontSize: 10,
              lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
          >✕</button>
        </div>
      ) : (
        <button
          onClick={handlePick}
          disabled={disabled || !uid}
          style={{
            ...boxStyle, background: 'var(--dm-input)', border: '1.5px solid var(--dm-border)',
            fontSize: size * 0.45, opacity: disabled || !uid ? 0.4 : 1,
          }}
        >📷</button>
      )}

      {preview && photoUrl && (
        <div
          onClick={() => setPreview(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <button
            onClick={() => setPreview(false)}
            aria-label="닫기"
            style={{
              position: 'fixed', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff',
              fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
          <img src={photoUrl} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12 }} alt="첨부 사진 확대보기" />
        </div>
      )}
    </div>
  );
}
