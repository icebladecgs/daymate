import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import S from "../styles.js";
import PhotoGallery from "./PhotoGallery.jsx";
import TimeSelect from "./TimeSelect.jsx";
import { GROWTH_STATS, GROWTH_STAT_MAP, classifyTodoStat } from "../data/growthStats.js";
import { useDriveUpload, DriveFileList, MemoLinks } from "./DriveFiles.jsx";
import { formatShortKoreanDate } from "../utils/date.js";
import { useBackClose } from "../utils/useBackClose.js";

const chip = (active) => ({
  fontSize: 12, padding: '5px 10px', borderRadius: 8, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
  border: active ? '1.5px solid var(--dm-accent, #6C8EFF)' : '1px solid var(--dm-border)',
  background: active ? 'var(--dm-accent-soft, rgba(108,142,255,.15))' : 'var(--dm-input)', color: 'var(--dm-sub)',
});
const sectionLabel = { fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 6 };
const newStep = (text) => ({ id: `s${Date.now()}${Math.random().toString(36).slice(2, 6)}`, text: text.trim(), done: false });

// 할일 상세 — 목록은 보기 전용, 편집(제목·시간·성장 스탯·메모·사진·언젠가·삭제)은 모두 여기서.
// - 시간·스탯·사진은 바꾸는 즉시 저장 / 제목·메모는 닫을 때 저장 (뒤로가기로 언마운트될 때 포함)
// - 구글 캘린더에는 메모·사진을 반영하지 않음 (제목·시간은 기존 동기화 그대로)
// - 할일·언젠가할일 모두 같은 화면 사용 (언젠가로 옮기기는 목록의 버튼으로)
// - onDelete를 넘긴 화면에서만 삭제 버튼 표시
// - onComplete를 넘긴 화면에서는 작은 단계를 다 끝냈을 때 "할일도 완료" 버튼 (자동 완료는 안 함 — 목록 체크와 같은 경로로 저장)
// - recurring: 반복으로 생긴 할일이면 { label, onStop, onManage } — 반복 칸을 보여준다 (2026-11-03)
// - onMoveDate를 넘긴 화면에서만 날짜 버튼 표시. dateStr은 지금 날짜(언젠가할일은 없음) — 바꾸면 그 날짜로 옮기고 창을 닫음
export default function TaskDetailSheet({ task, uid, onSave, onClose, onError, onDelete, dateStr, onMoveDate, onFocus, onComplete, recurring, order }) {
  const [title, setTitle] = useState(task.title || '');
  const [note, setNote] = useState(task.note || '');
  const [photos, setPhotos] = useState(task.photos || []);
  const [editingTime, setEditingTime] = useState(false);
  const [editingEnd, setEditingEnd] = useState(false); // 끝 시간 (시작 시간이 있을 때만)
  const [endError, setEndError] = useState('');
  // 끝 시간은 시작보다 늦을 때만 저장 (이른 시간이면 구글 캘린더에 다음날까지 이어지는 일정이 됐다)
  const saveEndTime = (v) => {
    if (!v || v === task.time) { setEndError(''); onSave({ endTime: undefined }); return; }
    if (v < task.time) { setEndError('끝 시간은 시작 시간보다 늦어야 해요'); return; }
    setEndError('');
    onSave({ endTime: v });
  };

  // 작은 단계 체크리스트 — 체크·추가·삭제는 바로 저장, 글 고치기는 칸을 벗어나거나 창을 닫을 때 저장.
  // 할일 완료와는 따로 움직인다(단계를 다 끝내도 할일을 자동으로 완료하지 않음).
  const [steps, setSteps] = useState(task.steps || []);
  const [stepDraft, setStepDraft] = useState('');
  const draftRef = useRef(null);
  const imeEnterRef = useRef(false); // 한글 조합 중 Enter — 조합이 끝난 뒤 추가 (두 번 들어가지 않게)

  const savedRef = useRef({ title: task.title || '', note: task.note || '', steps: JSON.stringify(task.steps || []) });
  const doneRef = useRef(false); // 삭제·이동 후에는 언마운트 저장을 건너뜀
  // 빈 단계는 빼고, 아직 Enter를 안 친 새 단계 글도 넣는다
  const finalSteps = (st, draft) => {
    const list = st.map(s => ({ ...s, text: s.text.trim() })).filter(s => s.text);
    return draft.trim() ? [...list, newStep(draft)] : list;
  };
  const commitSteps = (next) => {
    setSteps(next);
    const clean = finalSteps(next, '');
    const key = JSON.stringify(clean);
    if (key === savedRef.current.steps) return;
    savedRef.current = { ...savedRef.current, steps: key };
    onSave({ steps: clean.length ? clean : undefined });
  };
  const flush = (t, n, st, draft) => {
    if (doneRef.current) return;
    const patch = {};
    const nextTitle = t.trim() || savedRef.current.title; // 제목을 비우면 기존 제목 유지 (삭제는 아래 삭제 버튼으로)
    if (nextTitle !== savedRef.current.title || n !== savedRef.current.note) Object.assign(patch, { title: nextTitle, note: n });
    const clean = finalSteps(st, draft);
    const stepsKey = JSON.stringify(clean);
    if (stepsKey !== savedRef.current.steps) patch.steps = clean.length ? clean : undefined;
    if (!Object.keys(patch).length) return;
    savedRef.current = { title: nextTitle, note: n, steps: stepsKey };
    onSave(patch);
  };

  // 뒤로가기 등으로 화면이 바뀌어 언마운트돼도 입력 중인 내용이 사라지지 않게
  const latestRef = useRef({ title, note, steps, stepDraft, flush });
  useEffect(() => { latestRef.current = { title, note, steps, stepDraft, flush }; });
  useEffect(() => () => {
    const { title: t, note: n, steps: st, stepDraft: d, flush: f } = latestRef.current;
    f(t, n, st, d);
  }, []);

  const handleClose = () => { flush(title, note, steps, stepDraft); onClose(); };
  useBackClose(handleClose);

  const addStep = () => {
    const text = (draftRef.current?.value ?? stepDraft).trim();
    if (!text) return;
    setStepDraft('');
    commitSteps([...steps, newStep(text)]);
  };
  const stepDone = steps.filter(s => s.done && s.text.trim()).length;
  const stepTotal = steps.filter(s => s.text.trim()).length;

  const handlePhotos = (next) => {
    setPhotos(next);
    onSave({ photos: next });
  };

  // 지금 입력 중인 제목·메모까지 반영된 할일 (언젠가로 옮길 때 함께 가져가도록)
  const handleDelete = () => {
    if (onDelete(task) === false) return; // 확인창에서 취소
    doneRef.current = true;
    onClose();
  };

  // 날짜 바꾸기 — 입력 중인 제목·메모까지 담아서 옮긴다 (옮긴 뒤에는 원래 자리에 저장하지 않음)
  const importedGcal = !!(task.gcalEventId && String(task.id || '').startsWith('gcal_'));
  const handleMoveDate = (toDs) => {
    if (!toDs || toDs === dateStr) return;
    const st = finalSteps(steps, stepDraft);
    const latest = { ...task, title: title.trim() || task.title, note, steps: st.length ? st : undefined };
    if (onMoveDate(latest, toDs) === false) return;
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
          {task.goalRef?.title && (
            <div style={{ fontSize: 12, color: '#A78BFA', fontWeight: 700, background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.3)', borderRadius: 10, padding: '8px 10px', marginBottom: 14, lineHeight: 1.5 }}>
              🎯 {task.goalRef.kind === 'life' ? '인생목표' : '올해 목표'} "{task.goalRef.title}"에서 나온 할일
            </div>
          )}
          {task.memoRef && (
            <div style={{ fontSize: 12, color: 'var(--dm-accent, #6C8EFF)', fontWeight: 700, background: 'var(--dm-accent-soft, rgba(108,142,255,.1))', border: '1px solid var(--dm-accent-line, rgba(108,142,255,.3))', borderRadius: 10, padding: '8px 10px', marginBottom: 14, lineHeight: 1.5 }}>
              📝 {task.memoRef.ds ? `${formatShortKoreanDate(task.memoRef.ds)} ` : ''}메모에서 나온 할일
            </div>
          )}
          {recurring && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 14, color: 'var(--dm-accent, #5B7CFA)', fontWeight: 700, background: 'var(--dm-accent-soft, rgba(108,142,255,.1))', border: '1px solid var(--dm-accent-line, rgba(108,142,255,.3))', borderRadius: 10, padding: '8px 10px', marginBottom: 14 }}>
              <span style={{ flex: 1, minWidth: 0 }}>🔁 {recurring.label} 반복</span>
              {recurring.onManage && <button onClick={() => { handleClose(); recurring.onManage(); }} style={{ ...chip(false), fontSize: 13, color: 'var(--dm-accent, #5B7CFA)', fontWeight: 700 }}>반복 관리</button>}
              <button onClick={() => { if (recurring.onStop() !== false) handleClose(); }} style={{ ...chip(false), fontSize: 13, color: '#F87171', fontWeight: 700 }}>반복 그만하기</button>
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 4 }}>제목</div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={60}
            style={{ ...S.input, marginBottom: 14 }}
          />

          <div style={sectionLabel}>작은 단계{stepTotal > 0 && ` · ${stepDone}/${stepTotal}`}</div>
          {steps.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <button onClick={() => commitSteps(steps.map(x => x.id === s.id ? { ...x, done: !x.done } : x))} aria-label={s.done ? '단계 완료 취소' : '단계 완료'}
                style={{ width: 36, height: 38, padding: 0, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, boxSizing: 'border-box', border: `2px solid ${s.done ? '#4ADE80' : 'var(--dm-muted)'}`, background: s.done ? '#4ADE80' : 'transparent', color: '#fff', fontSize: 13, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{s.done ? '✓' : ''}</span>
              </button>
              <input
                value={s.text}
                onChange={e => setSteps(steps.map(x => x.id === s.id ? { ...x, text: e.target.value } : x))}
                onBlur={() => commitSteps(steps)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); draftRef.current?.focus(); } }}
                maxLength={80}
                aria-label="단계 내용"
                style={{ ...S.input, flex: 1, minWidth: 0, width: 'auto', padding: '8px 10px', fontSize: 15, textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'var(--dm-muted)' : 'var(--dm-text)' }}
              />
              <button onClick={() => commitSteps(steps.filter(x => x.id !== s.id))} aria-label="단계 삭제"
                style={{ width: 32, height: 38, padding: 0, border: 'none', background: 'none', color: 'var(--dm-muted)', fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>✕</button>
            </div>
          ))}
          <input
            ref={draftRef}
            value={stepDraft}
            onChange={e => setStepDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (e.nativeEvent.isComposing) { imeEnterRef.current = true; return; }
              addStep();
            }}
            onCompositionEnd={() => { if (imeEnterRef.current) { imeEnterRef.current = false; setTimeout(addStep, 0); } }}
            enterKeyHint="enter"
            maxLength={80}
            placeholder="＋ 단계 추가 (예: 서류 출력)"
            style={{ ...S.input, padding: '8px 10px', fontSize: 15, borderStyle: 'dashed', marginBottom: 14 }}
          />
          {onComplete && !task.done && stepTotal > 0 && stepDone === stepTotal && (
            // 완료를 먼저 저장하고 닫는다 (닫을 때 저장하는 제목·메모는 그 위에 합쳐짐)
            <button onClick={() => { onComplete(task); handleClose(); }}
              style={{ width: '100%', height: 44, padding: 0, marginTop: -6, marginBottom: 14, borderRadius: 12, border: 'none', background: '#4ADE80', color: '#fff', fontSize: 15, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>
              ✓ 단계를 다 끝냈어요 · 할일도 완료
            </button>
          )}

          <div style={sectionLabel}>{onMoveDate ? '날짜·시간' : '시간'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: importedGcal && onMoveDate ? 6 : 14, minHeight: 32, flexWrap: 'wrap' }}>
            {onMoveDate && (
              // 버튼 위에 투명한 날짜 입력칸을 겹쳐서 누르면 휴대폰·PC 기본 달력이 열리게 한다
              <label style={{ ...chip(!!dateStr), position: 'relative', color: dateStr ? 'var(--dm-accent, #6C8EFF)' : 'var(--dm-muted)', fontWeight: 700, opacity: importedGcal ? 0.5 : 1, cursor: importedGcal ? 'default' : 'pointer' }}>
                📅 {dateStr ? formatShortKoreanDate(dateStr) : '날짜 정하기'}
                {!importedGcal && (
                  <input
                    type="date"
                    value={dateStr || ''}
                    onChange={e => handleMoveDate(e.target.value)}
                    onClick={e => { try { e.currentTarget.showPicker(); } catch { /* 지원 안 하는 브라우저는 기본 동작 */ } }}
                    aria-label="날짜 바꾸기"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
                  />
                )}
              </label>
            )}
            {editingTime ? (
              <TimeSelect autoFocus value={task.time} onChange={v => onSave({ time: v || undefined })} onClose={() => setEditingTime(false)} />
            ) : (
              <button onClick={() => setEditingTime(true)} style={{ ...chip(!!task.time), color: task.time ? 'var(--dm-accent, #6C8EFF)' : 'var(--dm-muted)', fontWeight: 700 }}>
                ⏰ {task.time || '시간 설정'}
              </button>
            )}
            {task.time && !editingTime && (editingEnd ? (
              <TimeSelect autoFocus value={task.endTime || task.time} onChange={saveEndTime} onClose={() => setEditingEnd(false)} />
            ) : (
              <button onClick={() => setEditingEnd(true)} style={{ ...chip(!!task.endTime && task.endTime > task.time), color: task.endTime && task.endTime > task.time ? 'var(--dm-accent, #6C8EFF)' : 'var(--dm-muted)', fontWeight: 700 }}>
                ~ {task.endTime && task.endTime > task.time ? task.endTime : '끝 시간'}
              </button>
            ))}
            {/* 끝 시간 빠르게 — 시작 시간만 있을 때 30분·1시간·2시간 뒤 (자정을 넘으면 안 보임) */}
            {task.time && !editingTime && !editingEnd && !(task.endTime && task.endTime > task.time) && [30, 60, 120].map(d => {
              const [hh, mm] = task.time.split(':').map(Number);
              const end = hh * 60 + mm + d;
              if (end >= 24 * 60) return null;
              const v = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
              return <button key={d} onClick={() => saveEndTime(v)} style={{ ...chip(false), color: 'var(--dm-accent, #5B7CFA)', fontWeight: 700 }}>+{d < 60 ? `${d}분` : `${d / 60}시간`}</button>;
            })}
            {task.time && (
              <button onClick={() => { setEditingTime(false); setEditingEnd(false); onSave({ time: undefined, endTime: undefined }); }} style={{ ...chip(false), color: 'var(--dm-muted)' }}>시간 지우기</button>
            )}
          </div>
          {endError && <div style={{ fontSize: 12, color: '#F87171', fontWeight: 700, margin: '-8px 0 12px' }}>{endError}</div>}
          {/* 집중 타이머 — 시간을 정하지 않은 할일도 바로 시작. 집중한 시간은 할일에 쌓인다(focusMin) */}
          {(onFocus && !task.done || task.focusMin > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {onFocus && !task.done && (
                <button onClick={() => onFocus(task)} style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid rgba(167,139,250,.55)', background: 'rgba(167,139,250,.14)', color: '#A78BFA', fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>▶ 집중 시작</button>
              )}
              {task.focusMin > 0 && <span style={{ fontSize: 13, color: 'var(--dm-sub)', fontWeight: 700 }}>⏱ 집중 {task.focusMin >= 60 ? `${Math.floor(task.focusMin / 60)}시간 ${task.focusMin % 60 ? `${task.focusMin % 60}분` : ''}` : `${task.focusMin}분`}</span>}
            </div>
          )}
          {importedGcal && onMoveDate && (
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginBottom: 14 }}>구글 캘린더에서 가져온 일정은 구글 캘린더에서 날짜를 바꿔주세요</div>
          )}

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
            style={{ width: '100%', padding: '11px', borderRadius: 12, background: 'var(--dm-input)', border: '1.5px dashed var(--dm-border)', color: drive.busy ? 'var(--dm-accent, #6C8EFF)' : 'var(--dm-muted)', fontSize: 13, fontWeight: 700, cursor: drive.busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            {drive.label}
          </button>

          {/* 순서 바꾸기 — 목록은 보기 전용이라 여기서 한다. 옮길 곳이 없으면(시간이 정한 순서 등) 숨긴다 */}
          {order && (order.canUp || order.canDown) && (
            <>
              <div style={{ ...sectionLabel, marginTop: 16 }}>목록 순서</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[[-1, '▲ 위로', order.canUp], [1, '▼ 아래로', order.canDown]].map(([dir, label, can]) => (
                  <button key={dir} onClick={() => order.onMove(dir)} disabled={!can}
                    style={{ flex: 1, height: 42, padding: 0, borderRadius: 10, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: can ? 'var(--dm-text)' : 'var(--dm-muted)', opacity: can ? 1 : 0.5, fontSize: 15, fontWeight: 700, cursor: can ? 'pointer' : 'default' }}>{label}</button>
                ))}
              </div>
            </>
          )}

          {onDelete && (
            <button onClick={handleDelete} style={{ width: '100%', marginTop: 18, padding: '10px 0', borderRadius: 10, border: '1px solid rgba(248,113,113,.35)', background: 'rgba(248,113,113,.08)', color: '#F87171', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              🗑 삭제
            </button>
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

// 목록에서 할일 제목 옆에 붙이는 성장 능력치 아이콘 — 체크하면 오를 능력치 (직접 고른 것 우선, 없으면 자동 분류·내 단어).
// 분류가 안 되거나 '없음'이면 표시하지 않는다.
export function TaskStatIcon({ task, size = 12 }) {
  const statId = task?.statTag || classifyTodoStat(task?.title || '');
  const stat = statId && statId !== 'NONE' ? GROWTH_STAT_MAP[statId] : null;
  if (!stat) return null;
  return <span title={`${stat.name} 능력치`} aria-label={`${stat.name} 능력치`} style={{ fontSize: size, flexShrink: 0, lineHeight: 1 }}>{stat.icon}</span>;
}

// 목록에서 메모·사진·드라이브 파일이 있는 할일 옆에 붙이는 작은 표시
export function TaskDetailBadge({ task }) {
  const hasNote = !!task?.note?.trim();
  const photoCount = task?.photos?.length || 0;
  const fileCount = task?.files?.length || 0;
  const goalTitle = task?.goalRef?.title || '';
  const steps = task?.steps || [];
  if (!hasNote && !photoCount && !fileCount && !goalTitle && !steps.length) return null;
  return (
    <>
      {/* 작은 단계 진행 — 체크는 상세 창에서만 (목록은 보기 전용) */}
      {steps.length > 0 && (
        <span title="작은 단계" style={{ fontSize: 11, fontWeight: 700, color: steps.every(s => s.done) ? '#4ADE80' : 'var(--dm-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
          ☑{steps.filter(s => s.done).length}/{steps.length}
        </span>
      )}
      {(hasNote || photoCount > 0 || fileCount > 0) && (
        <span style={{ fontSize: 11, color: 'var(--dm-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {hasNote && '📝'}{photoCount > 0 && `📷${photoCount > 1 ? photoCount : ''}`}{fileCount > 0 && `📎${fileCount > 1 ? fileCount : ''}`}
        </span>
      )}
      {/* 목표에서 파생된 할일 표시 — 긴 목표 이름은 말줄임 */}
      {goalTitle && (
        <span title={goalTitle} style={{ fontSize: 10, color: '#A78BFA', background: 'rgba(167,139,250,.12)', borderRadius: 6, padding: '1px 6px', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>
          🎯{goalTitle}
        </span>
      )}
    </>
  );
}
