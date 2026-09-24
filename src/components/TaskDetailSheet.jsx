import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import S from "../styles.js";
import PhotoGallery from "./PhotoGallery.jsx";
import TimeSelect from "./TimeSelect.jsx";
import { GROWTH_STATS, GROWTH_STAT_MAP, classifyTodoStat } from "../data/growthStats.js";
import { useDriveUpload, DriveFileList, MemoLinks } from "./DriveFiles.jsx";

const chip = (active) => ({
  fontSize: 12, padding: '5px 10px', borderRadius: 8, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
  border: active ? '1.5px solid #6C8EFF' : '1px solid var(--dm-border)',
  background: active ? 'rgba(108,142,255,.15)' : 'var(--dm-input)', color: 'var(--dm-sub)',
});
const sectionLabel = { fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 6 };

// 할일 상세 — 목록은 보기 전용, 편집(제목·시간·성장 스탯·메모·사진·언젠가·삭제)은 모두 여기서.
// - 시간·스탯·사진은 바꾸는 즉시 저장 / 제목·메모는 닫을 때 저장 (뒤로가기로 언마운트될 때 포함)
// - 구글 캘린더에는 메모·사진을 반영하지 않음 (제목·시간은 기존 동기화 그대로)
// - onMoveToSomeday / onDelete를 넘긴 화면에서만 해당 버튼 표시
export default function TaskDetailSheet({ task, uid, onSave, onClose, onError, onMoveToSomeday, onDelete }) {
  const [title, setTitle] = useState(task.title || '');
  const [note, setNote] = useState(task.note || '');
  const [photos, setPhotos] = useState(task.photos || []);
  const [editingTime, setEditingTime] = useState(false);

  const savedRef = useRef({ title: task.title || '', note: task.note || '' });
  const doneRef = useRef(false); // 삭제·이동 후에는 언마운트 저장을 건너뜀
  const flush = (t, n) => {
    if (doneRef.current) return;
    const nextTitle = t.trim() || savedRef.current.title; // 제목을 비우면 기존 제목 유지 (삭제는 아래 삭제 버튼으로)
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

  // 지금 입력 중인 제목·메모까지 반영된 할일 (언젠가로 옮길 때 함께 가져가도록)
  const currentTask = () => ({ ...task, title: title.trim() || savedRef.current.title, note, photos, files: task.files || [] });
  const handleMove = () => {
    doneRef.current = true;
    onMoveToSomeday(currentTask());
    onClose();
  };
  const handleDelete = () => {
    if (onDelete(task) === false) return; // 확인창에서 취소
    doneRef.current = true;
    onClose();
  };

  const autoStat = GROWTH_STAT_MAP[classifyTodoStat(title || task.title || '')];

  // 구글 드라이브 첨부 — 올리거나 목록에서 뺄 때 즉시 저장
  const files = task.files || [];
  const drive = useDriveUpload({ files, onChange: (next) => onSave({ files: next }), onError });

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

          <div style={sectionLabel}>시간</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, minHeight: 32 }}>
            {editingTime ? (
              <TimeSelect autoFocus value={task.time} onChange={v => onSave({ time: v || undefined })} onClose={() => setEditingTime(false)} />
            ) : (
              <button onClick={() => setEditingTime(true)} style={{ ...chip(!!task.time), color: task.time ? '#6C8EFF' : 'var(--dm-muted)', fontWeight: 700 }}>
                ⏰ {task.time || '시간 설정'}
              </button>
            )}
            {task.time && (
              <button onClick={() => { setEditingTime(false); onSave({ time: undefined }); }} style={{ ...chip(false), color: 'var(--dm-muted)' }}>시간 지우기</button>
            )}
          </div>

          <div style={sectionLabel}>성장 스탯</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            <button onClick={() => onSave({ statTag: undefined })} style={chip(!task.statTag)}>
              자동{autoStat ? ` (${autoStat.icon} ${autoStat.name})` : ''}
            </button>
            <button onClick={() => onSave({ statTag: 'NONE' })} style={chip(task.statTag === 'NONE')}>🚫 없음</button>
            {GROWTH_STATS.map(s => (
              <button key={s.id} onClick={() => onSave({ statTag: s.id })} style={chip(task.statTag === s.id)}>{s.icon} {s.name}</button>
            ))}
          </div>

          <div style={{ fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 4 }}>메모</div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="장소, 시간, 준비물, 모바일 청첩장 링크 등을 적어두세요"
            style={{ ...S.input, marginBottom: 14, resize: 'vertical', lineHeight: 1.6, fontSize: 14, fontFamily: 'inherit' }}
          />
          <MemoLinks text={note} />

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

          <div style={{ ...sectionLabel, marginTop: 16 }}>파일 (구글 드라이브)</div>
          <DriveFileList files={files} onChange={(next) => onSave({ files: next })} />
          {drive.input}
          <button onClick={drive.pick} disabled={drive.busy}
            style={{ width: '100%', padding: '11px', borderRadius: 12, background: 'var(--dm-input)', border: '1.5px dashed var(--dm-border)', color: drive.busy ? '#6C8EFF' : 'var(--dm-muted)', fontSize: 13, fontWeight: 700, cursor: drive.busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            {drive.label}
          </button>

          {(onMoveToSomeday || onDelete) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              {onMoveToSomeday && (
                <button onClick={handleMove} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid rgba(108,142,255,.35)', background: 'rgba(108,142,255,.1)', color: '#6C8EFF', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ↓ 언젠가로 보내기
                </button>
              )}
              {onDelete && (
                <button onClick={handleDelete} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid rgba(248,113,113,.35)', background: 'rgba(248,113,113,.08)', color: '#F87171', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  🗑 삭제
                </button>
              )}
            </div>
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

// 목록에서 메모·사진·드라이브 파일이 있는 할일 옆에 붙이는 작은 표시
export function TaskDetailBadge({ task }) {
  const hasNote = !!task?.note?.trim();
  const photoCount = task?.photos?.length || 0;
  const fileCount = task?.files?.length || 0;
  if (!hasNote && !photoCount && !fileCount) return null;
  return (
    <span style={{ fontSize: 11, color: 'var(--dm-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
      {hasNote && '📝'}{photoCount > 0 && `📷${photoCount > 1 ? photoCount : ''}`}{fileCount > 0 && `📎${fileCount > 1 ? fileCount : ''}`}
    </span>
  );
}
