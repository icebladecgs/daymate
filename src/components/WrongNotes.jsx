import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import S from "../styles.js";
import Toast from "./Toast.jsx";
import PhotoGallery from "./PhotoGallery.jsx";
import PhotoViewer from "./PhotoViewer.jsx";
import { ExamSheet } from "./Exam.jsx";
import { saveWrongNote, deleteWrongNote, deletePhoto } from "../firebase.js";
import { formatShortKoreanDate } from "../utils/date.js";
import { WRONG_INTERVALS, WRONG_REASONS, firstDue, reviewWrongNote, isDue, daysUntil, cropLayout, normalizeCrop, sessionSummary, wrongStats } from "../utils/exam.js";
import { printWrongNotes } from "../utils/printWrongNotes.js";
import { useBackClose } from "../utils/useBackClose.js";

// 2026-11-14 업그레이드 (콴다 참고, AI 없이): ▶ 시험처럼 다시 풀기(한 장씩 → 결과), 🖨 출력(정답은 뒤 페이지),
// ✂ 문제 부분만 보이기(사진 파일은 그대로, 보여 줄 칸만 photo.crop), 📊 통계 탭. 계산은 utils/exam.js.

// 오답 노트 (수험생 모드, 2026-11-01) — 문제 사진은 원본 그대로(자르기·보정 없음, 앨범에서 고르기).
// 다시 풀 날은 utils/exam.js(1·3·7·21일), 4번 연속 맞으면 졸업. 저장은 firebase.js wrongNotes.
// 앱 위에 덮는 화면이라 알림(Toast)을 따로 그린다 (CLAUDE.md 15장).

const BLUE = 'var(--dm-accent, #5B7CFA)';
const chip = (on) => ({
  padding: '7px 12px', borderRadius: 999, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
  borderWidth: 1.5, borderStyle: 'solid', borderColor: on ? BLUE : 'var(--dm-border)', background: on ? 'var(--dm-accent-soft, rgba(91,124,250,.14))' : 'var(--dm-input)',
  color: on ? BLUE : 'var(--dm-sub)', whiteSpace: 'nowrap',
});
const newId = () => `wn_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const dueText = (n, todayDs) => {
  if (n.done) return '🎓 졸업';
  const left = daysUntil(n.due, todayDs);
  return left <= 0 ? '오늘 다시 풀기' : left === 1 ? '내일 다시' : `${left}일 뒤 다시`;
};
const sortNotes = (list) => [...list].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (b.createdAt || '').localeCompare(a.createdAt || ''));

export default function WrongNotes({ uid, notes, setNotes, exam, todayStr, onClose, onRequireLogin }) {
  useBackClose(onClose);
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState('due'); // due | all | done | stats
  const [sub, setSub] = useState(null);
  const [editing, setEditing] = useState(null); // 새 오답(빈 객체) 또는 고칠 오답
  const [openId, setOpenId] = useState(null);
  const [session, setSession] = useState(null); // 시험처럼 다시 풀기 — 시작할 때의 문제 id 목록
  const list = notes || [];
  const due = list.filter(n => isDue(n, todayStr));
  const shown = sortNotes((tab === 'due' ? due : tab === 'done' ? list.filter(n => n.done) : list.filter(n => !n.done))
    .filter(n => !sub || n.sub === sub));
  const subjects = [...new Set([...exam.subjects, ...list.map(n => n.sub).filter(Boolean)])];
  const tabName = { due: '오늘 다시 풀기', all: '푸는 중', done: '졸업' }[tab] || '';
  const doPrint = () => {
    printWrongNotes(shown, `DayMate 오답 노트 · ${tabName}${sub ? ` · ${sub}` : ''} · ${todayStr} 출력`)
      .then(ok => { if (!ok) setToast('인쇄 창을 열지 못했어요'); });
  };

  const persist = async (note) => {
    setNotes(prev => [...(prev || []).filter(n => n.id !== note.id), note]);
    try { await saveWrongNote(uid, note); } catch { setToast('저장하지 못했어요. 인터넷 연결을 확인해 주세요'); }
  };
  const remove = async (note) => {
    if (!window.confirm('이 오답을 지울까요? 사진도 함께 지워져요.')) return;
    setNotes(prev => (prev || []).filter(n => n.id !== note.id));
    setOpenId(null);
    [...(note.photos || []), ...(note.answerPhotos || [])].forEach(p => p?.path && deletePhoto(p.path));
    try { await deleteWrongNote(uid, note.id); setToast('지웠어요'); } catch { setToast('지우지 못했어요'); }
  };
  const review = (note, ok) => {
    const next = { ...note, ...reviewWrongNote(note, ok, todayStr) };
    persist(next);
    setOpenId(null);
    setToast(next.done ? '🎓 졸업! 이제 이 문제는 자신 있어요' : ok ? `⭕ 좋아요 · ${WRONG_INTERVALS[next.step]}일 뒤에 한 번 더` : '❌ 내일 다시 풀어 봐요');
  };
  // 다시 풀기 화면에서 한 문제 답할 때 — 알림 없이 저장만 (끝에 결과를 한 번에 보여 줌)
  const reviewQuiet = (note, ok) => persist({ ...note, ...reviewWrongNote(note, ok, todayStr) });

  const target = document.querySelector('.dm-phone') || document.body;
  const open = list.find(n => n.id === openId);
  return createPortal(
    // zIndex 600: 메모 탭 쓰기 화면(fullScreenPanel 500) 위 — 260이던 때 메모 탭에서 열면 뒤에 숨어 안 열리는 것처럼 보였다 (2026-11-14)
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'var(--dm-bg)', display: 'flex', flexDirection: 'column' }}>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'max(14px, env(safe-area-inset-top)) 16px 10px', borderBottom: '1px solid var(--dm-border)' }}>
        <div style={{ flex: 1, fontSize: 20, fontWeight: 900, color: 'var(--dm-text)' }}>📕 오답 노트</div>
        {uid && <button onClick={() => setEditing({})} style={{ ...chip(true), padding: '8px 14px', fontSize: 15 }}>＋ 오답 추가</button>}
        <button onClick={onClose} aria-label="닫기" style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 24, cursor: 'pointer', padding: '0 4px' }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px calc(32px + env(safe-area-inset-bottom))' }}>
        {!uid ? (
          <div style={{ ...S.card, margin: '8px 0', textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--dm-text)', marginBottom: 8 }}>오답 노트는 로그인하면 쓸 수 있어요</div>
            <div style={{ fontSize: 14, color: 'var(--dm-muted)', lineHeight: 1.6, marginBottom: 14 }}>문제 사진을 계정에 안전하게 저장하고, 다른 기기에서도 이어서 풀 수 있어요.</div>
            {onRequireLogin && <button onClick={onRequireLogin} style={S.btn}>구글로 로그인</button>}
          </div>
        ) : notes === null ? (
          <div style={{ textAlign: 'center', color: 'var(--dm-muted)', fontSize: 15, padding: 32 }}>불러오는 중…</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[['due', `오늘 풀기 ${due.length}`], ['all', '푸는 중'], ['done', '🎓 졸업'], ['stats', '📊 통계']].map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} style={{ ...chip(tab === k), flex: 1, minWidth: 0, padding: '9px 4px' }}>{label}</button>
              ))}
            </div>
            {tab === 'stats' ? <WrongStatsView notes={list} todayStr={todayStr} subjects={exam.subjects} /> : (<>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
              <button onClick={() => setSub(null)} style={chip(!sub)}>전체</button>
              {subjects.map(s => <button key={s} onClick={() => setSub(s)} style={chip(sub === s)}>{s}</button>)}
            </div>

            {shown.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                {tab === 'due'
                  ? <button onClick={() => setSession(shown.map(n => n.id))} style={{ ...S.btn, flex: 1, marginTop: 0, minHeight: 46 }}>▶ 시험처럼 풀기 · {shown.length}문제</button>
                  : <span style={{ flex: 1, fontSize: 14, color: 'var(--dm-muted)' }}>{shown.length}문제</span>}
                <button onClick={doPrint} title="정답·풀이는 뒤쪽 페이지에 따로 찍혀요" style={{ ...chip(false), minHeight: 40, padding: '8px 14px' }}>🖨 출력</button>
              </div>
            )}

            {shown.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--dm-muted)', fontSize: 15, lineHeight: 1.7, padding: '28px 8px' }}>
                {list.length === 0
                  ? <>틀린 문제를 사진으로 남겨 두면<br />1일·3일·7일·21일 뒤에 다시 풀 차례를 알려 줘요.<br /><br /><button onClick={() => setEditing({})} style={{ ...S.btn, maxWidth: 260 }}>＋ 첫 오답 추가</button></>
                  : tab === 'due' ? '오늘 다시 풀 문제가 없어요 👏' : '여기에 해당하는 오답이 없어요'}
              </div>
            )}
            {shown.map(n => (
              <div key={n.id} onClick={() => setOpenId(n.id)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--dm-row)', cursor: 'pointer' }}>
                {n.photos?.[0]?.url
                  ? <div style={{ width: 64, height: 64, borderRadius: 10, border: '1px solid var(--dm-border)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', background: 'var(--dm-input)' }}>
                      <CroppedImg photo={n.photos[0]} thumb />
                    </div>
                  : <div style={{ width: 64, height: 64, borderRadius: 10, background: 'var(--dm-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>📕</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--dm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.sub}{n.unit ? ` · ${n.unit}` : ''}</div>
                  <div style={{ fontSize: 14, color: 'var(--dm-sub)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.reason || ''}{n.memo ? `${n.reason ? ' · ' : ''}${n.memo}` : ''}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: isDue(n, todayStr) ? '#EF4444' : n.done ? '#16A34A' : BLUE }}>{dueText(n, todayStr)}</span>
                    <span style={{ fontSize: 12, color: 'var(--dm-muted)', letterSpacing: 2 }}>{WRONG_INTERVALS.map((_, i) => (i < (n.step || 0) ? '●' : '○')).join('')}</span>
                  </div>
                </div>
              </div>
            ))}
            </>)}
          </>
        )}
      </div>

      {session && <WrongSession ids={session} notes={list} onAnswer={reviewQuiet} onClose={() => setSession(null)} />}
      {open &&<WrongNoteDetail note={open} todayStr={todayStr} onClose={() => setOpenId(null)} onReview={review}
        onEdit={() => { setEditing(open); setOpenId(null); }} onDelete={() => remove(open)} />}
      {editing && <WrongNoteEditor uid={uid} note={editing} exam={exam} notes={list} todayStr={todayStr} onError={setToast}
        onClose={() => setEditing(null)}
        onSave={(n) => { persist(n); setEditing(null); setToast(editing.id ? '고쳤어요' : `📕 저장했어요 · ${formatShortKoreanDate(n.due)}에 다시 풀어요`); }} />}
    </div>,
    target,
  );
}

function WrongNoteDetail({ note, todayStr, onClose, onReview, onEdit, onDelete }) {
  useBackClose(onClose);
  const [showAnswer, setShowAnswer] = useState(false);
  const [viewer, setViewer] = useState(null); // { photos, index }
  const ph = note.photos || [];
  const ans = note.answerPhotos || [];
  const big = { width: '100%', borderRadius: 12, border: '1px solid var(--dm-border)', marginBottom: 8, cursor: 'zoom-in', display: 'block' };
  return (
    <ExamSheet zIndex={650} label={`📕 ${dueText(note, todayStr)} · ${formatShortKoreanDate(note.ds || todayStr)} 저장`} title={`${note.sub}${note.unit ? ` · ${note.unit}` : ''}`} onClose={onClose}>
      {ph.map((p, i) => <CroppedImg key={p.path || i} photo={p} alt="문제 사진" onClick={() => setViewer({ photos: ph, index: i })} style={big} />)}
      {(note.reason || note.memo) && (
        <div style={{ fontSize: 15, color: 'var(--dm-text)', lineHeight: 1.6, margin: '6px 0 12px', whiteSpace: 'pre-wrap' }}>
          {note.reason && <span style={{ ...chip(false), display: 'inline-block', marginRight: 8, cursor: 'default' }}>{note.reason}</span>}
          {note.memo}
        </div>
      )}
      {ans.length > 0 && (showAnswer
        ? ans.map((p, i) => <CroppedImg key={p.path || i} photo={p} alt="정답·풀이 사진" onClick={() => setViewer({ photos: ans, index: i })} style={big} />)
        : <button onClick={() => setShowAnswer(true)} style={{ ...S.btnGhost, marginTop: 0 }}>👀 정답·풀이 보기 (먼저 풀어 보세요)</button>)}
      {!note.done && (
        <>
          <div style={{ fontSize: 14, color: 'var(--dm-muted)', margin: '16px 0 8px', textAlign: 'center' }}>다시 풀어 봤나요?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onReview(note, true)} style={{ ...S.btn, flex: 1, marginTop: 0, background: 'linear-gradient(135deg,#4ADE80,#22c55e)' }}>⭕ 맞았어요</button>
            <button onClick={() => onReview(note, false)} style={{ ...S.btn, flex: 1, marginTop: 0, background: 'linear-gradient(135deg,#F87171,#ef4444)' }}>❌ 또 틀렸어요</button>
          </div>
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={onEdit} style={{ ...S.btnGhost, flex: 1, marginTop: 0 }}>✏️ 고치기</button>
        <button onClick={onDelete} style={{ ...S.btnGhost, flex: 1, marginTop: 0, color: '#EF4444' }}>🗑 지우기</button>
      </div>
      {note.reviews?.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--dm-muted)', marginTop: 12, lineHeight: 1.6 }}>
          다시 푼 기록: {note.reviews.map(r => `${r.ds.slice(5).replace('-', '/')} ${r.ok ? '⭕' : '❌'}`).join('  ')}
        </div>
      )}
      {viewer && <PhotoViewer photos={viewer.photos} index={viewer.index} onClose={() => setViewer(null)} />}
    </ExamSheet>
  );
}

function WrongNoteEditor({ uid, note, exam, notes, todayStr, onSave, onClose, onError }) {
  const isNew = !note.id;
  const [id] = useState(() => note.id || newId());
  const [photos, setPhotos] = useState(note.photos || []);
  const [answerPhotos, setAnswerPhotos] = useState(note.answerPhotos || []);
  const [sub, setSub] = useState(note.sub || exam.subjects[0]);
  const [unit, setUnit] = useState(note.unit || '');
  const [reason, setReason] = useState(note.reason || '');
  const [memo, setMemo] = useState(note.memo || '');
  // 이 과목에서 전에 쓴 단원 (빠르게 고르기)
  const units = [...new Set(notes.filter(n => n.sub === sub && n.unit).map(n => n.unit))].slice(0, 8);
  const canSave = photos.length > 0 || memo.trim();
  const close = () => {
    // 고치던 오답: 사진은 올리거나 지우는 순간 저장소에 반영되므로, 사진이 바뀌었으면 목록도 맞춰 저장한다
    if (!isNew) {
      if (photos !== (note.photos || []) || answerPhotos !== (note.answerPhotos || [])) onSave({ ...note, photos, answerPhotos });
      else onClose();
      return;
    }
    // 새 오답을 저장하지 않고 닫으면 올려 둔 사진은 지운다 (주인 없는 사진이 남지 않게)
    if ((photos.length || answerPhotos.length) && !window.confirm('저장하지 않고 닫을까요? 올린 사진은 지워져요.')) return;
    [...photos, ...answerPhotos].forEach(p => p?.path && deletePhoto(p.path));
    onClose();
  };
  const save = () => {
    if (!canSave) return;
    const base = isNew
      ? { ds: todayStr, createdAt: new Date().toISOString(), step: 0, due: firstDue(todayStr), done: false, reviews: [] }
      : note;
    onSave({ ...base, id, sub, unit: unit.trim().slice(0, 30), reason, memo: memo.trim().slice(0, 500), photos, answerPhotos });
  };
  const label = { fontSize: 14, fontWeight: 900, color: 'var(--dm-text)', margin: '14px 0 8px' };
  return (
    <ExamSheet zIndex={650} label="📕 오답 노트" title={isNew ? '오답 추가' : '오답 고치기'} onClose={close}>
      <div style={{ ...label, marginTop: 0 }}>문제 사진 <span style={{ fontSize: 13, color: 'var(--dm-muted)', fontWeight: 700 }}>· 앨범이나 카메라에서 그대로</span></div>
      <PhotoGallery uid={uid} pathPrefix={`users/${uid}/wrong`} photos={photos} onChange={setPhotos} onError={onError} />
      <CropRow photos={photos} onChange={setPhotos} />
      <div style={label}>과목</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {exam.subjects.map(s => <button key={s} onClick={() => setSub(s)} style={chip(sub === s)}>{s}</button>)}
      </div>
      <div style={label}>단원 <span style={{ fontSize: 13, color: 'var(--dm-muted)', fontWeight: 700 }}>· 선택</span></div>
      {units.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {units.map(u => <button key={u} onClick={() => setUnit(u)} style={chip(unit === u)}>{u}</button>)}
        </div>
      )}
      <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="예: 미적분 - 극한" maxLength={30} style={{ ...S.input, fontSize: 15 }} />
      <div style={{ ...label, marginTop: 6 }}>왜 틀렸나요?</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {WRONG_REASONS.map(r => <button key={r} onClick={() => setReason(reason === r ? '' : r)} style={chip(reason === r)}>{r}</button>)}
      </div>
      <div style={label}>메모 <span style={{ fontSize: 13, color: 'var(--dm-muted)', fontWeight: 700 }}>· 선택</span></div>
      <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="헷갈린 부분, 다음에 주의할 점" maxLength={500} rows={3} style={{ ...S.input, fontSize: 15, resize: 'vertical', fontFamily: 'inherit' }} />
      <div style={label}>정답·풀이 사진 <span style={{ fontSize: 13, color: 'var(--dm-muted)', fontWeight: 700 }}>· 선택, 다시 풀 때는 가려 둬요</span></div>
      <PhotoGallery uid={uid} pathPrefix={`users/${uid}/wrong`} photos={answerPhotos} onChange={setAnswerPhotos} onError={onError} />
      <CropRow photos={answerPhotos} onChange={setAnswerPhotos} />
      <button onClick={save} disabled={!canSave} style={{ ...S.btn, marginTop: 18, opacity: canSave ? 1 : 0.5 }}>{isNew ? '저장' : '고친 내용 저장'}</button>
      {!canSave && <div style={{ fontSize: 13, color: 'var(--dm-muted)', textAlign: 'center', marginTop: 6 }}>문제 사진이나 메모 중 하나는 있어야 해요</div>}
    </ExamSheet>
  );
}

// ── 문제 부분만 보이기 (2026-11-14) — 사진 파일은 그대로, photo.crop 칸만 보여 준다(utils/exam.js cropLayout) ──
// 누르면(onClick) 크게 보기는 원본 전체(PhotoViewer)
function CroppedImg({ photo, style, onClick, alt = '', thumb = false }) {
  const lay = cropLayout(photo?.crop);
  if (!lay) {
    return thumb
      ? <img src={photo?.url} alt={alt} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      : <img src={photo?.url} alt={alt} onClick={onClick} style={style} />;
  }
  return (
    <div role={onClick ? 'button' : undefined} onClick={onClick}
      style={{ ...(style || {}), position: 'relative', overflow: 'hidden', width: '100%', height: 'auto', aspectRatio: String(lay.ar), flexShrink: 0 }}>
      <img src={photo.url} alt={alt} draggable={false}
        style={{ position: 'absolute', width: `${lay.width}%`, height: 'auto', maxWidth: 'none', maxHeight: 'none', left: `${lay.left}%`, top: `${lay.top}%`, display: 'block' }} />
    </div>
  );
}

const withCrop = (p, c) => {
  if (c) return { ...p, crop: c };
  const rest = { ...p };
  delete rest.crop;
  return rest;
};

// 입력 창의 사진 아래 한 줄: 사진을 누르면 자르기 창
function CropRow({ photos, onChange }) {
  const [editIdx, setEditIdx] = useState(null);
  if (!photos?.length) return null;
  const editing = editIdx != null ? photos[editIdx] : null;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--dm-muted)', fontWeight: 700 }}>✂ 문제 부분만 보이기</span>
        {photos.map((p, i) => (
          <button key={p.path || i} onClick={() => setEditIdx(i)} aria-label={`${i + 1}번 사진 자르기`}
            style={{ position: 'relative', width: 48, height: 48, padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'center', background: 'var(--dm-input)',
              border: p.crop ? `2px solid ${BLUE}` : '1px solid var(--dm-border)' }}>
            <CroppedImg photo={p} thumb />
            <span style={{ position: 'absolute', right: 2, bottom: 2, fontSize: 11, lineHeight: 1, background: 'rgba(0,0,0,.6)', color: '#fff', borderRadius: 4, padding: '2px 3px' }}>✂</span>
          </button>
        ))}
      </div>
      {editing && <CropSheet photo={editing} onClose={() => setEditIdx(null)}
        onSave={(c) => { onChange(photos.map((p, i) => (i === editIdx ? withCrop(p, c) : p))); setEditIdx(null); }} />}
    </>
  );
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
function CropSheet({ photo, onSave, onClose }) {
  useBackClose(onClose);
  const boxRef = useRef(null);
  const drag = useRef(null);
  const [nat, setNat] = useState(null);
  const [rect, setRect] = useState(() => { const c = normalizeCrop(photo.crop); return c ? { x: c.x, y: c.y, w: c.w, h: c.h } : null; });
  const pt = (e) => {
    const r = boxRef.current.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height), pw: r.width, ph: r.height };
  };
  const down = (e) => {
    e.preventDefault();
    const p = pt(e);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    if (rect) {
      const near = (ax, ay) => Math.abs((p.x - ax) * p.pw) < 28 && Math.abs((p.y - ay) * p.ph) < 28;
      const { x, y, w, h } = rect;
      // 모서리를 잡으면 반대쪽 모서리를 고정하고 새로 끄는 것과 같다
      for (const [cx, cy, ox, oy] of [[x, y, x + w, y + h], [x + w, y, x, y + h], [x, y + h, x + w, y], [x + w, y + h, x, y]]) {
        if (near(cx, cy)) { drag.current = { mode: 'new', sx: ox, sy: oy }; return; }
      }
      if (p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) { drag.current = { mode: 'move', ox: p.x - x, oy: p.y - y }; return; }
    }
    drag.current = { mode: 'new', sx: p.x, sy: p.y };
    setRect({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = pt(e);
    if (d.mode === 'move') setRect(r => ({ ...r, x: Math.min(Math.max(0, p.x - d.ox), 1 - r.w), y: Math.min(Math.max(0, p.y - d.oy), 1 - r.h) }));
    else setRect({ x: Math.min(d.sx, p.x), y: Math.min(d.sy, p.y), w: Math.abs(p.x - d.sx), h: Math.abs(p.y - d.sy) });
  };
  const up = () => { drag.current = null; setRect(r => (r && r.w > 0.03 && r.h > 0.03 ? r : null)); };
  const crop = rect && nat ? normalizeCrop({ ...rect, ar: (rect.w * nat.w) / (rect.h * nat.h) }) : null;
  const btn = { flex: 1, minHeight: 46, borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: '0 8px' };
  const handle = (pos) => ({ position: 'absolute', width: 14, height: 14, background: '#fff', borderRadius: 3, pointerEvents: 'none', ...pos });
  const target = document.querySelector('.dm-phone') || document.body;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,.92)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 'max(16px, env(safe-area-inset-top)) 18px 10px', color: '#fff' }}>
        <div style={{ fontSize: 17, fontWeight: 900 }}>✂ 문제 부분만 보이기</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,.75)', marginTop: 4, lineHeight: 1.5 }}>문제 부분을 손가락으로 끌어 고르세요. 모서리를 끌면 크기, 안쪽을 끌면 위치가 바뀌어요. 원본 사진은 그대로 남아요.</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px' }}>
        <div ref={boxRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{ position: 'relative', display: 'inline-block', lineHeight: 0, overflow: 'hidden', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'crosshair' }}>
          <img src={photo.url} alt="" draggable={false} onLoad={e => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={{ display: 'block', maxWidth: '100%', maxHeight: '62vh', pointerEvents: 'none' }} />
          {rect && rect.w > 0 && (
            <div style={{ position: 'absolute', left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%`,
              border: '2px solid #fff', boxShadow: '0 0 0 9999px rgba(0,0,0,.55)', boxSizing: 'border-box', pointerEvents: 'none' }}>
              <span style={handle({ left: -2, top: -2 })} /><span style={handle({ right: -2, top: -2 })} />
              <span style={handle({ left: -2, bottom: -2 })} /><span style={handle({ right: -2, bottom: -2 })} />
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px calc(16px + env(safe-area-inset-bottom))' }}>
        <button onClick={() => onSave(null)} style={{ ...btn, background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,.4)' }}>전체 사진</button>
        <button onClick={onClose} style={{ ...btn, background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,.4)' }}>취소</button>
        <button onClick={() => crop && onSave(crop)} disabled={!crop} style={{ ...btn, flex: 1.4, background: BLUE, color: '#fff', border: 'none', opacity: crop ? 1 : 0.45 }}>이 부분만</button>
      </div>
    </div>,
    target,
  );
}

// ── ▶ 시험처럼 다시 풀기 (2026-11-14) — 시작할 때 고른 문제를 한 장씩, 답할 때마다 저장, 끝에 결과 ──
function WrongSession({ ids, notes, onAnswer, onClose }) {
  useBackClose(onClose);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [showAns, setShowAns] = useState(false);
  const [showMemo, setShowMemo] = useState(false);
  const [viewer, setViewer] = useState(null);
  const bodyRef = useRef(null);
  const byId = Object.fromEntries((notes || []).map(n => [n.id, n]));
  const queue = ids.filter(id => byId[id]);
  const finished = idx >= queue.length;
  const note = finished ? null : byId[queue[idx]];
  const next = (ok) => {
    if (typeof ok === 'boolean') onAnswer(note, ok);
    setResults(r => [...r, typeof ok === 'boolean' ? { id: note.id, ok } : { id: note.id, skip: true }]);
    setIdx(i => i + 1);
    setShowAns(false);
    setShowMemo(false);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  };
  const big = { width: '100%', borderRadius: 12, border: '1px solid var(--dm-border)', marginBottom: 8, cursor: 'zoom-in', display: 'block' };
  const sum = sessionSummary(results, notes);
  const wrongOnes = results.filter(r => r.ok === false).map(r => byId[r.id]).filter(Boolean);
  const skipped = results.filter(r => r.skip).length;
  const target = document.querySelector('.dm-phone') || document.body;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 650, background: 'var(--dm-bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 'max(14px, env(safe-area-inset-top)) 16px 10px', borderBottom: '1px solid var(--dm-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 900, color: 'var(--dm-text)' }}>📕 다시 풀기</div>
          {!finished && <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--dm-sub)' }}>{idx + 1} / {queue.length}</div>}
          <button onClick={onClose} aria-label="닫기" style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 24, cursor: 'pointer', padding: '0 4px' }}>✕</button>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--dm-row)', marginTop: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${queue.length ? (Math.min(idx, queue.length) / queue.length) * 100 : 100}%`, background: BLUE, transition: 'width .3s' }} />
        </div>
      </div>

      {finished ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 20px calc(32px + env(safe-area-inset-bottom))', textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>{sum.total && sum.rate >= 80 ? '🎉' : '📕'}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--dm-text)', marginTop: 8 }}>
            {sum.total ? `${sum.total}문제 중 ${sum.ok}개 맞았어요` : '푼 문제가 없어요'}
          </div>
          {sum.total > 0 && <div style={{ fontSize: 16, color: 'var(--dm-sub)', marginTop: 6 }}>맞은 비율 {sum.rate}%</div>}
          {sum.graduated > 0 && <div style={{ fontSize: 16, fontWeight: 800, color: '#16A34A', marginTop: 10 }}>🎓 이번에 졸업한 문제 {sum.graduated}개</div>}
          {skipped > 0 && <div style={{ fontSize: 14, color: 'var(--dm-muted)', marginTop: 6 }}>건너뛴 문제 {skipped}개는 목록에 그대로 있어요</div>}
          {wrongOnes.length > 0 && (
            <div style={{ textAlign: 'left', marginTop: 22 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 6 }}>❌ 또 틀린 문제 — 내일 다시 나와요</div>
              {wrongOnes.map(n => (
                <div key={n.id} style={{ fontSize: 15, color: 'var(--dm-sub)', padding: '8px 0', borderBottom: '1px solid var(--dm-row)' }}>
                  {n.sub}{n.unit ? ` · ${n.unit}` : ''}{n.reason ? <span style={{ color: 'var(--dm-muted)' }}> · {n.reason}</span> : null}
                </div>
              ))}
            </div>
          )}
          <button onClick={onClose} style={{ ...S.btn, marginTop: 24 }}>닫기</button>
        </div>
      ) : (<>
        <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px 16px' }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 10 }}>{note.sub}{note.unit ? ` · ${note.unit}` : ''}</div>
          {(note.photos || []).map((p, i) => <CroppedImg key={p.path || i} photo={p} alt="문제 사진" onClick={() => setViewer({ photos: note.photos, index: i })} style={big} />)}
          {!(note.photos || []).length && note.memo && <div style={{ fontSize: 16, color: 'var(--dm-text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 10 }}>{note.memo}</div>}
          {(note.photos || []).length > 0 && note.memo && (showMemo
            ? <div style={{ fontSize: 15, color: 'var(--dm-text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: '4px 0 10px' }}>💬 {note.memo}</div>
            : <button onClick={() => setShowMemo(true)} style={{ ...S.btnGhost, marginTop: 4 }}>💬 내 메모 보기 (힌트가 될 수 있어요)</button>)}
          {(note.answerPhotos || []).length > 0 && (showAns
            ? note.answerPhotos.map((p, i) => <CroppedImg key={p.path || i} photo={p} alt="정답·풀이 사진" onClick={() => setViewer({ photos: note.answerPhotos, index: i })} style={big} />)
            : <button onClick={() => setShowAns(true)} style={{ ...S.btnGhost, marginTop: 8 }}>👀 정답·풀이 보기 (먼저 풀어 보세요)</button>)}
        </div>
        <div style={{ padding: '10px 16px calc(14px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--dm-border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => next(true)} style={{ ...S.btn, flex: 1, marginTop: 0, background: 'linear-gradient(135deg,#4ADE80,#22c55e)' }}>⭕ 맞았어요</button>
            <button onClick={() => next(false)} style={{ ...S.btn, flex: 1, marginTop: 0, background: 'linear-gradient(135deg,#F87171,#ef4444)' }}>❌ 또 틀렸어요</button>
          </div>
          <button onClick={() => next(null)} style={{ display: 'block', margin: '8px auto 0', background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', fontFamily: 'inherit' }}>건너뛰기</button>
        </div>
      </>)}
      {viewer && <PhotoViewer photos={viewer.photos} index={viewer.index} onClose={() => setViewer(null)} />}
    </div>,
    target,
  );
}

// ── 📊 통계 (2026-11-14) — 계산은 utils/exam.js wrongStats ──
function WrongStatsView({ notes, todayStr, subjects }) {
  const st = wrongStats(notes, todayStr, subjects);
  if (!st.total) return <div style={{ textAlign: 'center', color: 'var(--dm-muted)', fontSize: 15, lineHeight: 1.7, padding: '28px 8px' }}>오답을 저장하면 과목별 졸업률과 자주 틀리는 곳을 보여 줘요.</div>;
  const box = { borderRadius: 14, background: 'var(--dm-input)', padding: 14, marginBottom: 12 };
  const h = { fontSize: 16, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 10 };
  const bar = (pct, color) => (
    <div style={{ height: 8, borderRadius: 4, background: 'var(--dm-row)', overflow: 'hidden', marginTop: 6 }}>
      <div style={{ height: '100%', width: `${Math.max(pct, pct > 0 ? 3 : 0)}%`, background: color, borderRadius: 4 }} />
    </div>
  );
  const maxReason = Math.max(1, ...st.reasons.map(([, v]) => v));
  const num = (label, value, color = 'var(--dm-text)') => (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--dm-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
  return (
    <div>
      <div style={{ ...box, display: 'flex', gap: 4 }}>
        {num('전체', st.total)}
        {num('푸는 중', st.active, BLUE)}
        {num(`졸업 ${st.rate}%`, st.done, '#16A34A')}
        {num('오늘 풀기', st.due, st.due ? '#EF4444' : 'var(--dm-text)')}
      </div>
      <div style={box}>
        <div style={h}>최근 7일</div>
        <div style={{ fontSize: 15, color: 'var(--dm-sub)', lineHeight: 1.6 }}>
          {st.week.count ? <>다시 푼 문제 <b style={{ color: 'var(--dm-text)' }}>{st.week.count}번</b> · 맞은 비율 <b style={{ color: 'var(--dm-text)' }}>{st.week.rate}%</b></> : '최근 7일 동안 다시 푼 문제가 없어요'}
        </div>
        {st.week.count > 0 && bar(st.week.rate, '#16A34A')}
      </div>
      <div style={box}>
        <div style={h}>과목별 졸업률</div>
        {st.bySub.map(s => (
          <div key={s.sub} style={{ padding: '6px 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 15 }}>
              <span style={{ flex: 1, fontWeight: 800, color: 'var(--dm-text)' }}>{s.sub}</span>
              {s.due > 0 && <span style={{ fontSize: 13, fontWeight: 800, color: '#EF4444' }}>오늘 {s.due}</span>}
              <span style={{ color: 'var(--dm-sub)' }}>{s.done}/{s.total} 졸업 · {s.rate}%</span>
            </div>
            {bar(s.rate, BLUE)}
          </div>
        ))}
      </div>
      {st.reasons.length > 0 && (
        <div style={box}>
          <div style={h}>틀린 이유</div>
          {st.reasons.map(([r, v]) => (
            <div key={r} style={{ padding: '5px 0' }}>
              <div style={{ display: 'flex', fontSize: 15 }}><span style={{ flex: 1, color: 'var(--dm-text)' }}>{r}</span><span style={{ color: 'var(--dm-sub)' }}>{v}번</span></div>
              {bar((v / maxReason) * 100, '#F59E0B')}
            </div>
          ))}
        </div>
      )}
      <div style={box}>
        <div style={h}>자주 틀리는 단원</div>
        {st.units.length
          ? st.units.map(([k, v], i) => <div key={k} style={{ fontSize: 15, color: 'var(--dm-sub)', padding: '4px 0' }}>{i + 1}. {k} <b style={{ color: '#EF4444' }}>{v}번</b></div>)
          : <div style={{ fontSize: 14, color: 'var(--dm-muted)', lineHeight: 1.6 }}>같은 단원에서 두 번 이상 틀린 곳이 아직 없어요. 오답에 단원을 적어 두면 여기에 모여요.</div>}
      </div>
    </div>
  );
}
