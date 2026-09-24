import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import S from "../styles.js";
import PhotoGallery from "./PhotoGallery.jsx";

// 할일 상세 (제목·메모·사진). 청첩장·초대장처럼 일정에 딸린 자료를 붙여두는 용도.
// - 사진은 올리거나 지우는 즉시 저장 (저장소 파일과 데이터가 어긋나지 않게)
// - 제목·메모는 닫을 때 저장 (완료 버튼, ✕, 바깥 영역, 뒤로가기로 화면이 바뀌어 언마운트될 때 모두)
// - 구글 캘린더에는 반영하지 않음 (앱 안에서만 보임)
export default function TaskDetailSheet({ task, uid, onSave, onClose, onError }) {
  const [title, setTitle] = useState(task.title || '');
  const [note, setNote] = useState(task.note || '');
  const [photos, setPhotos] = useState(task.photos || []);

  const savedRef = useRef({ title: task.title || '', note: task.note || '' });
  const flush = (t, n) => {
    const nextTitle = t.trim() || savedRef.current.title; // 제목을 비우면 기존 제목 유지 (삭제는 목록의 ✕로)
    if (nextTitle === savedRef.current.title && n === savedRef.current.note) return;
    savedRef.current = { title: nextTitle, note: n };
    onSave({ title: nextTitle, note: n });
  };

  // 뒤로가기 등으로 화면이 바뀌어 언마운트돼도 입력 중인 내용이 사라지지 않게
  const latestRef = useRef({ title, note, flush });
  useEffect(() => { latestRef.current = { title, note, flush }; });
  useEffect(() => () => {
    const { title: t, note: n, flush: f } = latestRef.current;
    f(t, n);
  }, []);

  const handleClose = () => { flush(title, note); onClose(); };

  const handlePhotos = (next) => {
    setPhotos(next);
    onSave({ photos: next });
  };

  // 화면 본문(S.content)은 zIndex:1 쌓임 맥락이라 그 안에 그리면 하단 네비(zIndex:100)에 가려짐 →
  // 앱 루트(.dm-phone, 큰글씨 zoom 적용 범위)에 포털로 렌더링
  const portalTarget = document.querySelector('.dm-phone') || document.body;
  return createPortal(
    <div
      onClick={handleClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 430, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--dm-bg)', borderRadius: '20px 20px 0 0', border: '1px solid var(--dm-border)', borderBottom: 'none', boxShadow: '0 -8px 32px rgba(0,0,0,.35)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 8px' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--dm-text)' }}>📝 할일 상세</div>
          <button onClick={handleClose} aria-label="닫기"
            style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 20px 12px' }}>
          <div style={{ fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 4 }}>제목</div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={60}
            style={{ ...S.input, marginBottom: 14 }}
          />

          <div style={{ fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 4 }}>메모</div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="장소, 시간, 준비물 등을 적어두세요"
            style={{ ...S.input, marginBottom: 14, resize: 'vertical', lineHeight: 1.6, fontSize: 14, fontFamily: 'inherit' }}
          />

          <div style={{ fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 6 }}>사진 (청첩장·초대장 등)</div>
          {uid ? (
            <PhotoGallery uid={uid} pathPrefix={`users/${uid}/memos`} photos={photos} onChange={handlePhotos} onError={onError} />
          ) : (
            <>
              {photos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {photos.map((p, i) => (
                    <img key={p.path || i} src={p.url} alt="첨부 사진" style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', border: '1.5px solid var(--dm-border)' }} />
                  ))}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--dm-muted)' }}>사진은 로그인 후 추가할 수 있어요 (설정 → Google 로그인)</div>
            </>
          )}
        </div>

        <div style={{ padding: '10px 20px 18px', borderTop: '1px solid var(--dm-border)' }}>
          <button onClick={handleClose} style={{ ...S.btn, marginBottom: 0 }}>완료</button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

// 목록에서 메모·사진이 있는 할일 옆에 붙이는 작은 표시
export function TaskDetailBadge({ task }) {
  const hasNote = !!task?.note?.trim();
  const photoCount = task?.photos?.length || 0;
  if (!hasNote && !photoCount) return null;
  return (
    <span style={{ fontSize: 11, color: 'var(--dm-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
      {hasNote && '📝'}{photoCount > 0 && `📷${photoCount > 1 ? photoCount : ''}`}
    </span>
  );
}
