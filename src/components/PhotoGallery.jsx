import { useRef, useState } from "react";
import { uploadPhoto, deletePhoto } from "../firebase.js";
import { compressImage } from "../utils/image.js";

const TILE = 72;

export default function PhotoGallery({ uid, pathPrefix, photos = [], onChange, onError }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);

  const handlePick = () => {
    if (uploading || !uid) return;
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
      onChange([...photos, result]);
    } catch {
      onError?.('사진 업로드 실패 ❌');
    }
    setUploading(false);
  };

  const handleRemove = (idx) => {
    if (!window.confirm('사진을 삭제할까요?')) return;
    const target = photos[idx];
    if (target?.path) deletePhoto(target.path);
    onChange(photos.filter((_, i) => i !== idx));
  };

  const tileStyle = {
    width: TILE, height: TILE, borderRadius: 10, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />

      {photos.map((p, idx) => (
        <div key={p.path || idx} style={{ position: 'relative' }}>
          <img
            src={p.url}
            onClick={() => setPreview(p.url)}
            style={{ ...tileStyle, objectFit: 'cover', border: '1.5px solid var(--dm-border)', cursor: 'pointer' }}
            alt="첨부 사진"
          />
          <button
            onClick={() => handleRemove(idx)}
            style={{
              position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
              background: '#F87171', border: '2px solid var(--dm-bg)', color: '#fff', fontSize: 10,
              lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
          >✕</button>
        </div>
      ))}

      {uploading ? (
        <div style={{ ...tileStyle, background: 'var(--dm-input)', border: '1.5px solid var(--dm-border)' }}>
          <span className="dm-spin" style={{ fontSize: 26 }}>⏳</span>
        </div>
      ) : (
        uid && (
          <button
            onClick={handlePick}
            style={{ ...tileStyle, background: 'var(--dm-input)', border: '1.5px dashed var(--dm-border)', fontSize: 22, color: 'var(--dm-muted)', cursor: 'pointer' }}
          >＋</button>
        )
      )}

      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <button
            onClick={() => setPreview(null)}
            aria-label="닫기"
            style={{
              position: 'fixed', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff',
              fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
          <img src={preview} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12 }} alt="첨부 사진 확대보기" />
        </div>
      )}
    </div>
  );
}
