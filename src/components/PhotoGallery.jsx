import { useRef, useState } from "react";
import PhotoViewer from "./PhotoViewer.jsx";
import { uploadPhoto, deletePhoto } from "../firebase.js";
import { compressImage, photoErrorMessage } from "../utils/image.js";

// tile: 칸 크기(기본 72). openRef: 밖의 버튼이 사진 고르기를 열 수 있게 함수를 넣어 준다.
// emptyAdd=false면 사진이 없을 때 ＋ 칸을 그리지 않는다 (메모 관리자 — 버튼 줄의 "사진"으로 연다, 2026-11-14)
export default function PhotoGallery({ uid, pathPrefix, photos = [], onChange, onError, tile: TILE = 72, openRef, emptyAdd = true }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);

  const handlePick = () => {
    if (uploading || !uid) return;
    inputRef.current?.click();
  };
  if (openRef) openRef.current = handlePick;

  const handleFile = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    const results = await Promise.allSettled(files.map(async (file) => {
      const blob = await compressImage(file);
      const path = `${pathPrefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      return uploadPhoto(path, blob, uid);
    }));
    const uploaded = results.filter(r => r.status === "fulfilled").map(r => r.value);
    const failed = results.find(r => r.status === "rejected");
    if (uploaded.length > 0) onChange([...photos, ...uploaded]);
    if (failed) onError?.(photoErrorMessage(failed.reason));
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

  const small = TILE < 60;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: small ? 6 : 8 }}>
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleFile} style={{ display: 'none' }} />

      {photos.map((p, idx) => (
        <div key={p.path || idx} style={{ position: 'relative' }}>
          <img
            src={p.url}
            onClick={() => setPreview(idx)}
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
          <span className="dm-spin" style={{ fontSize: small ? 18 : 26 }}>⏳</span>
        </div>
      ) : (
        uid && (emptyAdd || photos.length > 0) && (
          <button
            onClick={handlePick} aria-label="사진 추가"
            style={{ ...tileStyle, ...(small ? { padding: 0 } : {}), background: 'var(--dm-input)', border: '1.5px dashed var(--dm-border)', fontSize: small ? 18 : 22, color: 'var(--dm-muted)', cursor: 'pointer' }}
          >＋</button>
        )
      )}

      {preview !== null && <PhotoViewer photos={photos} index={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
