import { useState } from "react";
import { createPortal } from "react-dom";
import S from "../styles.js";
import Toast from "./Toast.jsx";
import PhotoGallery from "./PhotoGallery.jsx";
import PhotoViewer from "./PhotoViewer.jsx";
import { ExamSheet } from "./Exam.jsx";
import { saveWrongNote, deleteWrongNote, deletePhoto } from "../firebase.js";
import { formatShortKoreanDate } from "../utils/date.js";
import { WRONG_INTERVALS, WRONG_REASONS, firstDue, reviewWrongNote, isDue, daysUntil } from "../utils/exam.js";

// 오답 노트 (수험생 모드, 2026-11-01) — 문제 사진은 원본 그대로(자르기·보정 없음, 앨범에서 고르기).
// 다시 풀 날은 utils/exam.js(1·3·7·21일), 4번 연속 맞으면 졸업. 저장은 firebase.js wrongNotes.
// 앱 위에 덮는 화면이라 알림(Toast)을 따로 그린다 (CLAUDE.md 15장).

const BLUE = '#5B7CFA';
const chip = (on) => ({
  padding: '7px 12px', borderRadius: 999, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
  borderWidth: 1.5, borderStyle: 'solid', borderColor: on ? BLUE : 'var(--dm-border)', background: on ? 'rgba(91,124,250,.14)' : 'var(--dm-input)',
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
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState('due'); // due | all | done
  const [sub, setSub] = useState(null);
  const [editing, setEditing] = useState(null); // 새 오답(빈 객체) 또는 고칠 오답
  const [openId, setOpenId] = useState(null);
  const list = notes || [];
  const due = list.filter(n => isDue(n, todayStr));
  const shown = sortNotes((tab === 'due' ? due : tab === 'done' ? list.filter(n => n.done) : list.filter(n => !n.done))
    .filter(n => !sub || n.sub === sub));
  const subjects = [...new Set([...exam.subjects, ...list.map(n => n.sub).filter(Boolean)])];
  // 자주 틀리는 단원 TOP 3 (과목·단원 기준, 졸업한 것 포함)
  const unitCount = {};
  for (const n of list) if (n.unit) { const k = `${n.sub} · ${n.unit}`; unitCount[k] = (unitCount[k] || 0) + 1; }
  const topUnits = Object.entries(unitCount).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const reasons = {};
  for (const n of list) if (n.reason) reasons[n.reason] = (reasons[n.reason] || 0) + 1;
  const reasonCount = Object.entries(reasons).sort((a, b) => b[1] - a[1]);

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

  const target = document.querySelector('.dm-phone') || document.body;
  const open = list.find(n => n.id === openId);
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 260, background: 'var(--dm-bg)', display: 'flex', flexDirection: 'column' }}>
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
              {[['due', `오늘 다시 풀기 ${due.length}`], ['all', '푸는 중'], ['done', '🎓 졸업']].map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} style={{ ...chip(tab === k), flex: 1, padding: '9px 6px' }}>{label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
              <button onClick={() => setSub(null)} style={chip(!sub)}>전체</button>
              {subjects.map(s => <button key={s} onClick={() => setSub(s)} style={chip(sub === s)}>{s}</button>)}
            </div>

            {tab === 'all' && (topUnits.length > 0 || reasonCount.length > 0) && (
              <div style={{ ...S.card, margin: '0 0 12px', padding: 14 }}>
                {topUnits.length > 0 && (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 6 }}>자주 틀리는 단원</div>
                    {topUnits.map(([k, v], i) => <div key={k} style={{ fontSize: 15, color: 'var(--dm-sub)', padding: '3px 0' }}>{i + 1}. {k} <b style={{ color: '#EF4444' }}>{v}번</b></div>)}
                  </>
                )}
                {reasonCount.length > 0 && (
                  <div style={{ fontSize: 14, color: 'var(--dm-muted)', marginTop: topUnits.length ? 10 : 0, lineHeight: 1.6 }}>
                    틀린 이유: {reasonCount.map(([r, v]) => `${r} ${v}`).join(' · ')}
                  </div>
                )}
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
                  ? <img src={n.photos[0].url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--dm-border)', flexShrink: 0 }} />
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
          </>
        )}
      </div>

      {open && <WrongNoteDetail note={open} todayStr={todayStr} onClose={() => setOpenId(null)} onReview={review}
        onEdit={() => { setEditing(open); setOpenId(null); }} onDelete={() => remove(open)} />}
      {editing && <WrongNoteEditor uid={uid} note={editing} exam={exam} notes={list} todayStr={todayStr} onError={setToast}
        onClose={() => setEditing(null)}
        onSave={(n) => { persist(n); setEditing(null); setToast(editing.id ? '고쳤어요' : `📕 저장했어요 · ${formatShortKoreanDate(n.due)}에 다시 풀어요`); }} />}
    </div>,
    target,
  );
}

function WrongNoteDetail({ note, todayStr, onClose, onReview, onEdit, onDelete }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [viewer, setViewer] = useState(null); // { photos, index }
  const ph = note.photos || [];
  const ans = note.answerPhotos || [];
  const big = { width: '100%', borderRadius: 12, border: '1px solid var(--dm-border)', marginBottom: 8, cursor: 'zoom-in', display: 'block' };
  return (
    <ExamSheet label={`📕 ${dueText(note, todayStr)} · ${formatShortKoreanDate(note.ds || todayStr)} 저장`} title={`${note.sub}${note.unit ? ` · ${note.unit}` : ''}`} onClose={onClose}>
      {ph.map((p, i) => <img key={p.path || i} src={p.url} alt="문제 사진" onClick={() => setViewer({ photos: ph, index: i })} style={big} />)}
      {(note.reason || note.memo) && (
        <div style={{ fontSize: 15, color: 'var(--dm-text)', lineHeight: 1.6, margin: '6px 0 12px', whiteSpace: 'pre-wrap' }}>
          {note.reason && <span style={{ ...chip(false), display: 'inline-block', marginRight: 8, cursor: 'default' }}>{note.reason}</span>}
          {note.memo}
        </div>
      )}
      {ans.length > 0 && (showAnswer
        ? ans.map((p, i) => <img key={p.path || i} src={p.url} alt="정답·풀이 사진" onClick={() => setViewer({ photos: ans, index: i })} style={big} />)
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
    <ExamSheet label="📕 오답 노트" title={isNew ? '오답 추가' : '오답 고치기'} onClose={close}>
      <div style={{ ...label, marginTop: 0 }}>문제 사진 <span style={{ fontSize: 13, color: 'var(--dm-muted)', fontWeight: 700 }}>· 앨범이나 카메라에서 그대로</span></div>
      <PhotoGallery uid={uid} pathPrefix={`users/${uid}/wrong`} photos={photos} onChange={setPhotos} onError={onError} />
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
      <button onClick={save} disabled={!canSave} style={{ ...S.btn, marginTop: 18, opacity: canSave ? 1 : 0.5 }}>{isNew ? '저장' : '고친 내용 저장'}</button>
      {!canSave && <div style={{ fontSize: 13, color: 'var(--dm-muted)', textAlign: 'center', marginTop: 6 }}>문제 사진이나 메모 중 하나는 있어야 해요</div>}
    </ExamSheet>
  );
}
