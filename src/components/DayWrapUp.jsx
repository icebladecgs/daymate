import { useState } from "react";
import { createPortal } from "react-dom";
import S from "../styles.js";
import { addDays, formatShortKoreanDate } from "../utils/date.js";
import { store } from "../utils/storage.js";
import { isImportedGcalTask } from "../utils/dayMerge.js";
import { weekSummary, fmtFocus } from "../utils/goalProgress.js";

// 하루 마무리 (2026-11-03) — 저녁에 오늘 탭 일기 위에 한 줄 카드가 뜨고, 누르면 정리 창:
// 끝낸 일 보기 → 못 한 일은 내일로·언젠가로(또는 그대로) → 한 줄 일기 → 마치기.
// - 카드는 18시부터, 오늘 마무리했거나 ✕로 닫으면 그날은 안 보인다 (기기마다 dm_wrap_done / dm_wrap_dismissed)
// - 반복 할일·구글 캘린더에서 가져온 일정은 옮기지 않는다 (어제 못 한 할일 넘기기와 같은 기준)
// - 정리는 누를 때마다 바로 저장된다 — 중간에 닫아도 옮긴 것은 그대로
// - 일요일에는 "이번 주 돌아보기"로 — 창 맨 위에 이번 주(월~일) 요약이 붙는다 (오늘 할일이 없어도 이번 주 기록이 있으면 뜸)
export const WRAP_FROM_MIN = 18 * 60;

const isRecurringInstance = (t) => /^r.+_\d{4}-\d{2}-\d{2}$/.test(String(t.id));
const movable = (t) => !isRecurringInstance(t) && !isImportedGcalTask(t);
const isSunday = (ds) => new Date(`${ds}T00:00:00`).getDay() === 0;

export function DayWrapUpCard({ dateStr, tasks, plans, nowMin, onOpen }) {
  const [hidden, setHidden] = useState(() => store.get('dm_wrap_done', '') === dateStr || store.get('dm_wrap_dismissed', '') === dateStr);
  const real = tasks.filter(t => t.title?.trim());
  const weekly = isSunday(dateStr) ? weekSummary(plans, dateStr) : null;
  if (hidden || nowMin < WRAP_FROM_MIN || !(real.length || weekly?.total)) return null;
  const left = real.filter(t => !t.done).length;
  return (
    <div style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 10, border: '1px solid rgba(139,92,246,.4)', background: 'rgba(139,92,246,.08)', cursor: 'pointer' }}
      onClick={onOpen}>
      <span style={{ fontSize: 22 }}>🌙</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--dm-text)' }}>{weekly ? '이번 주 돌아보기' : '하루 마무리'}</div>
        <div style={{ fontSize: 13, color: 'var(--dm-sub)', marginTop: 2 }}>{weekly ? `이번 주 ${weekly.done}개 끝냄 · ` : ''}{left ? `못 한 일 ${left}개 정리하고 한 줄 남기기` : weekly ? '한 줄 남기기' : '오늘 할 일을 다 끝냈어요 · 한 줄 남기기'}</div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); store.set('dm_wrap_dismissed', dateStr); setHidden(true); }} aria-label="오늘은 닫기" title="오늘은 그만 보기"
        style={{ width: 32, height: 32, padding: 0, background: 'none', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>✕</button>
    </div>
  );
}

export default function DayWrapUpSheet({ dateStr, tasks, plans, journalBody, onMoveTaskDate, setData, setSomeday, pickDetail, onClose, onFinish }) {
  const [body, setBody] = useState(journalBody || '');
  const done = tasks.filter(t => t.title?.trim() && t.done);
  const left = tasks.filter(t => t.title?.trim() && !t.done);
  const leftMovable = left.filter(movable);
  const tomorrow = addDays(dateStr, 1);
  const weekly = isSunday(dateStr) ? weekSummary(plans, dateStr) : null;

  const toTomorrow = (list) => list.forEach(t => onMoveTaskDate?.(t, dateStr, tomorrow));
  const toSomeday = (t) => {
    setSomeday?.(prev => [...(prev || []), { id: `sd${Date.now()}`, title: t.title, done: false, ...pickDetail(t) }]);
    setData(prev => ({ ...prev, tasks: (prev.tasks || []).filter(x => x.id !== t.id) }));
  };
  const saveJournal = () => {
    if (body === (journalBody || '')) return;
    setData(prev => ({ ...prev, journal: { ...prev.journal, body } }));
  };
  const close = () => { saveJournal(); onClose(); };
  const finish = () => { saveJournal(); store.set('dm_wrap_done', dateStr); onFinish(); };

  const smallBtn = (color) => ({ height: 34, padding: '0 10px', borderRadius: 9, border: `1px solid ${color}55`, background: `${color}14`, color, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 });
  const label = { fontSize: 15, fontWeight: 900, color: 'var(--dm-text)', margin: '4px 0 8px' };

  // 할일 상세와 같은 이유로 앱 루트(.dm-phone)에 포털 (하단 네비에 가려지지 않게)
  const portalTarget = document.querySelector('.dm-phone') || document.body;
  return createPortal(
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 430, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--dm-bg)', borderRadius: '20px 20px 0 0', border: '1px solid var(--dm-border)', borderBottom: 'none', boxShadow: '0 -8px 32px rgba(0,0,0,.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 8px' }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--dm-text)' }}>{weekly ? '🗓 이번 주 돌아보기' : '🌙 하루 마무리'} <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dm-muted)' }}>{formatShortKoreanDate(dateStr)}</span></div>
          <button onClick={close} aria-label="닫기" style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 20px 12px' }}>
          {weekly && (
            <div style={{ borderRadius: 12, background: 'rgba(139,92,246,.08)', border: '1px solid rgba(139,92,246,.3)', padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 8 }}>이번 주 ({formatShortKoreanDate(addDays(dateStr, -6))} ~)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  ['끝낸 일', `${weekly.done}개`, weekly.total ? `${weekly.total}개 중 ${Math.round(weekly.done / weekly.total * 100)}%` : ''],
                  ['집중', weekly.focus ? fmtFocus(weekly.focus) : '-', ''],
                  ['가장 많이 한 날', weekly.best ? `${'일월화수목금토'[new Date(`${weekly.best.ds}T00:00:00`).getDay()]}요일` : '-', weekly.best ? `${weekly.best.done}개` : ''],
                ].map(([k, big, small]) => (
                  <div key={k} style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--dm-muted)' }}>{k}</div>
                    <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--dm-text)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{big}</div>
                    {small && <div style={{ fontSize: 12, color: 'var(--dm-sub)' }}>{small}</div>}
                  </div>
                ))}
              </div>
              {weekly.goals.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--dm-row)' }}>
                  {weekly.goals.slice(0, 4).map(g => (
                    <div key={`${g.kind}|${g.title}`} style={{ fontSize: 14, color: 'var(--dm-text)', padding: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🎯 {g.title} <b style={{ color: '#8B5CF6' }}>{g.count}개</b></div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* 일요일에 오늘 할일이 하나도 없으면 오늘 칸은 건너뛴다 */}
          {!(weekly && !done.length && !left.length) && <div style={label}>✅ 오늘 끝낸 일 {done.length}개</div>}
          {weekly && !done.length && !left.length ? null : done.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--dm-muted)', marginBottom: 14 }}>괜찮아요. 내일 하나만 해 봐요.</div>
          ) : (
            <div style={{ marginBottom: 14 }}>
              {done.slice(0, 6).map(t => (
                <div key={t.id} style={{ fontSize: 15, color: 'var(--dm-sub)', padding: '3px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✓ {t.title}</div>
              ))}
              {done.length > 6 && <div style={{ fontSize: 13, color: 'var(--dm-muted)', paddingTop: 2 }}>외 {done.length - 6}개</div>}
            </div>
          )}

          {left.length > 0 && (
            <>
              <div style={{ ...label, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span>⏳ 못 한 일 {left.length}개</span>
                {leftMovable.length > 1 && <button onClick={() => toTomorrow(leftMovable)} style={smallBtn('#5B7CFA')}>모두 내일로</button>}
              </div>
              <div style={{ marginBottom: 14 }}>
                {left.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderTop: '1px solid var(--dm-row)' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: 'var(--dm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    {movable(t) ? (
                      <>
                        <button onClick={() => toTomorrow([t])} style={smallBtn('#5B7CFA')}>내일로</button>
                        <button onClick={() => toSomeday(t)} style={smallBtn('#8B5CF6')}>언젠가</button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--dm-muted)', flexShrink: 0 }}>{isRecurringInstance(t) ? '반복 할일' : '구글 캘린더'}</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={label}>📖 한 줄 일기</div>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={4} maxLength={5000}
            placeholder="오늘 어땠나요? 한 줄이면 충분해요"
            style={{ ...S.input, resize: 'vertical', lineHeight: 1.6, fontSize: 15 }} />
        </div>

        <div style={{ padding: '10px 20px 18px', borderTop: '1px solid var(--dm-border)' }}>
          <button onClick={finish} style={{ ...S.btn, marginBottom: 0 }}>마치기</button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}
