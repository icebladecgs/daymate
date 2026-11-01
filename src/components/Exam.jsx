import { useState } from "react";
import { createPortal } from "react-dom";
import S from "../styles.js";
import { formatShortKoreanDate } from "../utils/date.js";
import {
  upcomingDdays, daysUntil, ddayLabel, fmtMin, studyOf, studyTotal, studyBySubject, lastWeekStudy, newStudyEntry,
} from "../utils/exam.js";

// 수험생 모드 화면 부품 (2026-11-01) — 오늘 탭 패널·D-day 창·공부 기록 창·설정 카드.
// 계산은 utils/exam.js, 오답 노트는 WrongNotes.jsx.

const BLUE = '#5B7CFA';
const chip = (on) => ({
  padding: '7px 12px', borderRadius: 999, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
  borderWidth: 1.5, borderStyle: 'solid', borderColor: on ? BLUE : 'var(--dm-border)', background: on ? 'rgba(91,124,250,.14)' : 'var(--dm-input)',
  color: on ? BLUE : 'var(--dm-sub)', whiteSpace: 'nowrap',
});
const smallBtn = {
  padding: '7px 12px', borderRadius: 10, border: `1px solid rgba(91,124,250,.4)`, background: 'rgba(91,124,250,.1)',
  color: BLUE, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
};
const xBtn = { background: 'none', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 17, padding: '0 4px', flexShrink: 0 };

// 할일 상세와 같은 이유로 앱 루트(.dm-phone)에 포털 (하단 메뉴에 가려지지 않게)
export function ExamSheet({ label, title, onClose, children }) {
  const target = document.querySelector('.dm-phone') || document.body;
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 430, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--dm-bg)', borderRadius: '20px 20px 0 0', border: '1px solid var(--dm-border)', borderBottom: 'none', boxShadow: '0 -8px 32px rgba(0,0,0,.35)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 20px 10px' }}>
          <div style={{ minWidth: 0 }}>
            {label && <div style={{ fontSize: 13, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 4 }}>{label}</div>}
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--dm-text)', lineHeight: 1.4 }}>{title}</div>
          </div>
          <button onClick={onClose} aria-label="닫기" style={{ ...xBtn, fontSize: 22 }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 20px calc(24px + env(safe-area-inset-bottom))' }}>{children}</div>
      </div>
    </div>,
    target,
  );
}

// ── 오늘 탭: D-day · 오늘 공부 · 다시 풀 문제 ──
export function ExamTodayPanel({ exam, setExam, dateStr, plans, todayData, onStartStudy, onAddStudy, onDeleteStudy, wrongDue, onOpenWrong }) {
  const [sheet, setSheet] = useState(null); // 'dday' | 'study'
  const up = upcomingDdays(exam.ddays, dateStr);
  const today = studyTotal(todayData);
  const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' };
  return (
    <div style={{ ...S.card, padding: '6px 16px' }}>
      {/* D-day — 가까운 시험부터, 누르면 편집 */}
      <div style={{ ...rowStyle, borderBottom: '1px solid var(--dm-row)', cursor: 'pointer' }} onClick={() => setSheet('dday')}>
        <span style={{ fontSize: 18 }}>📌</span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12, rowGap: 2 }}>
          {up.length === 0 && <span style={{ fontSize: 15, color: 'var(--dm-sub)', fontWeight: 700 }}>시험 D-day를 등록해 보세요</span>}
          {up.slice(0, 3).map((d, i) => (
            <span key={d.id} style={{ fontSize: i === 0 ? 17 : 15, fontWeight: i === 0 ? 900 : 700, color: i === 0 ? 'var(--dm-text)' : 'var(--dm-sub)', whiteSpace: 'nowrap' }}>
              {d.title} <span style={{ color: d.left <= 7 ? '#EF4444' : BLUE }}>{ddayLabel(d.left)}</span>
            </span>
          ))}
        </div>
        <span style={{ fontSize: 14, color: 'var(--dm-muted)', fontWeight: 700, flexShrink: 0 }}>{up.length ? '편집' : '＋ 추가'}</span>
      </div>
      {/* 오늘 공부 — 누르면 과목별·이번 주 */}
      <div style={{ ...rowStyle, borderBottom: onOpenWrong ? '1px solid var(--dm-row)' : 'none' }}>
        <span style={{ fontSize: 18 }}>📚</span>
        <div onClick={() => setSheet('study')} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--dm-text)' }}>오늘 공부 </span>
          <span style={{ fontSize: 17, fontWeight: 900, color: today ? BLUE : 'var(--dm-muted)' }}>{fmtMin(today)}</span>
        </div>
        <button onClick={onStartStudy} style={smallBtn}>▶ 타이머</button>
        <button onClick={() => setSheet('study-add')} style={{ ...smallBtn, padding: '7px 10px' }}>＋</button>
      </div>
      {onOpenWrong && (
        <div style={{ ...rowStyle, cursor: 'pointer' }} onClick={onOpenWrong}>
          <span style={{ fontSize: 18 }}>📕</span>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 800, color: 'var(--dm-text)' }}>
            {wrongDue > 0 ? <>다시 풀 문제 <span style={{ color: '#EF4444' }}>{wrongDue}개</span></> : '오답 노트'}
          </span>
          <span style={{ fontSize: 14, color: 'var(--dm-muted)', fontWeight: 700 }}>열기 ›</span>
        </div>
      )}
      {sheet === 'dday' && <DdaySheet exam={exam} setExam={setExam} todayDs={dateStr} onClose={() => setSheet(null)} />}
      {(sheet === 'study' || sheet === 'study-add') && (
        <StudySheet exam={exam} plans={plans} todayDs={dateStr} todayData={todayData} startAdding={sheet === 'study-add'}
          onAdd={onAddStudy} onDelete={onDeleteStudy} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

function DdaySheet({ exam, setExam, todayDs, onClose }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const list = [...exam.ddays].sort((a, b) => a.date.localeCompare(b.date));
  const add = () => {
    if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setExam(e => ({ ...e, ddays: [...e.ddays, { id: `dd_${Date.now().toString(36)}`, title: title.trim(), date }] }));
    setTitle(''); setDate('');
  };
  const remove = (d) => {
    if (!window.confirm(`"${d.title}" D-day를 지울까요?`)) return;
    setExam(e => ({ ...e, ddays: e.ddays.filter(x => x.id !== d.id) }));
  };
  return (
    <ExamSheet label="📚 수험생 모드" title="📌 시험 D-day" onClose={onClose}>
      {list.length === 0 && <div style={{ fontSize: 15, color: 'var(--dm-muted)', lineHeight: 1.6, padding: '4px 0 12px' }}>수능·모의고사·중간고사처럼 기다리는 시험을 넣어 보세요. 가장 가까운 시험이 오늘 탭 맨 앞에 보여요.</div>}
      {list.map(d => {
        const left = daysUntil(d.date, todayDs);
        return (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--dm-row)', opacity: left < 0 ? 0.5 : 1 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--dm-text)' }}>{d.title}</div>
              <div style={{ fontSize: 13, color: 'var(--dm-muted)', marginTop: 2 }}>{formatShortKoreanDate(d.date)}{left < 0 ? ' · 지난 시험(오늘 탭에서 숨김)' : ''}</div>
            </div>
            <span style={{ fontSize: 17, fontWeight: 900, color: left >= 0 && left <= 7 ? '#EF4444' : BLUE }}>{ddayLabel(left)}</span>
            <button onClick={() => remove(d)} aria-label="삭제" style={xBtn}>✕</button>
          </div>
        );
      })}
      <div style={{ marginTop: 16, fontSize: 14, fontWeight: 800, color: 'var(--dm-sub)', marginBottom: 8 }}>＋ 새 D-day</div>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="시험 이름 (예: 수능, 6월 모의고사)" maxLength={20} style={{ ...S.input, fontSize: 15 }} />
      <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...S.input, fontSize: 15 }} />
      <button onClick={add} disabled={!title.trim() || !date} style={{ ...S.btn, opacity: title.trim() && date ? 1 : 0.5 }}>추가</button>
    </ExamSheet>
  );
}

const QUICK_MIN = [30, 60, 90, 120, 180];
function StudySheet({ exam, plans, todayDs, todayData, startAdding, onAdd, onDelete, onClose }) {
  const [adding, setAdding] = useState(startAdding);
  const [sub, setSub] = useState(exam.subjects[0]);
  const [min, setMin] = useState('');
  const todayList = studyOf(todayData);
  const todayBySub = studyBySubject([todayData], exam.subjects);
  const week = lastWeekStudy(plans, todayDs);
  const weekDays = week.map(w => (w.ds === todayDs ? todayData : plans?.[w.ds]));
  const weekBySub = studyBySubject(weekDays, exam.subjects);
  const weekMax = Math.max(60, ...week.map(w => (w.ds === todayDs ? studyTotal(todayData) : w.min)));
  const weekTotal = weekBySub.reduce((a, s) => a + s.min, 0);
  const subMax = Math.max(1, ...weekBySub.map(s => s.min));
  const save = () => {
    const m = parseInt(min, 10);
    if (!m || m <= 0 || m > 24 * 60) return;
    onAdd(newStudyEntry(sub, m, 'manual'));
    setMin(''); setAdding(false);
  };
  const h3 = { fontSize: 15, fontWeight: 900, color: 'var(--dm-text)', margin: '18px 0 10px' };
  return (
    <ExamSheet label="📚 수험생 모드" title={`오늘 공부 ${fmtMin(studyTotal(todayData))}`} onClose={onClose}>
      {adding ? (
        <div style={{ ...S.card, margin: '0 0 8px', padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--dm-sub)', marginBottom: 8 }}>공부 시간 직접 넣기 (학원·독서실 등)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {exam.subjects.map(s => <button key={s} onClick={() => setSub(s)} style={chip(sub === s)}>{s}</button>)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {QUICK_MIN.map(m => <button key={m} onClick={() => setMin(String(m))} style={chip(String(m) === min)}>{fmtMin(m)}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={min} onChange={e => setMin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="분" style={{ ...S.input, margin: 0, flex: 1, fontSize: 15 }} />
            <span style={{ fontSize: 15, color: 'var(--dm-sub)' }}>분</span>
            <button onClick={save} disabled={!parseInt(min, 10)} style={{ ...smallBtn, padding: '10px 16px', opacity: parseInt(min, 10) ? 1 : 0.5 }}>저장</button>
            <button onClick={() => setAdding(false)} style={xBtn}>✕</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ ...S.btnGhost, marginTop: 0 }}>＋ 공부 시간 직접 넣기</button>
      )}

      <div style={h3}>오늘 과목별</div>
      {todayBySub.length === 0 && <div style={{ fontSize: 14, color: 'var(--dm-muted)' }}>아직 기록이 없어요. ▶ 타이머로 공부하거나 직접 넣어 보세요.</div>}
      {todayList.map(s => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--dm-row)' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--dm-text)', minWidth: 56 }}>{s.sub}</span>
          <span style={{ flex: 1, fontSize: 15, color: 'var(--dm-sub)' }}>{fmtMin(s.min)} <span style={{ fontSize: 13, color: 'var(--dm-muted)' }}>· {s.by === 'timer' ? '타이머' : '직접'} {new Date(s.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span></span>
          <button onClick={() => window.confirm(`${s.sub} ${fmtMin(s.min)} 기록을 지울까요?`) && onDelete(s)} aria-label="기록 삭제" style={xBtn}>✕</button>
        </div>
      ))}

      <div style={h3}>최근 7일 <span style={{ fontSize: 14, color: 'var(--dm-muted)', fontWeight: 700 }}>· 합계 {fmtMin(weekTotal)}</span></div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110 }}>
        {week.map(w => {
          const m = w.ds === todayDs ? studyTotal(todayData) : w.min;
          const d = new Date(w.ds + 'T00:00:00');
          return (
            <div key={w.ds} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 12, color: 'var(--dm-muted)', fontWeight: 700 }}>{m ? (m >= 60 ? `${Math.round(m / 6) / 10}h` : `${m}m`) : ''}</span>
              <div style={{ width: '100%', maxWidth: 28, height: `${Math.max(m ? 4 : 2, (m / weekMax) * 70)}px`, borderRadius: 6, background: m ? (w.ds === todayDs ? BLUE : 'rgba(91,124,250,.45)') : 'var(--dm-border)' }} />
              <span style={{ fontSize: 13, color: w.ds === todayDs ? BLUE : 'var(--dm-sub)', fontWeight: w.ds === todayDs ? 900 : 700 }}>{'일월화수목금토'[d.getDay()]}</span>
            </div>
          );
        })}
      </div>
      {weekBySub.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {weekBySub.map(s => (
            <div key={s.sub} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--dm-text)', minWidth: 56 }}>{s.sub}</span>
              <div style={{ flex: 1, height: 12, borderRadius: 6, background: 'var(--dm-input)', overflow: 'hidden' }}>
                <div style={{ width: `${(s.min / subMax) * 100}%`, height: '100%', background: BLUE, borderRadius: 6 }} />
              </div>
              <span style={{ fontSize: 14, color: 'var(--dm-sub)', fontWeight: 700, minWidth: 74, textAlign: 'right' }}>{fmtMin(s.min)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 13, color: 'var(--dm-muted)', marginTop: 14, lineHeight: 1.6 }}>공부 10분마다 성장 능력치 🧠 지력이 1씩 올라요.</div>
    </ExamSheet>
  );
}

// ── 설정: 수험생 모드 켜기 + 과목 편집 ──
export function ExamSettingsCard({ exam, setExam }) {
  const [input, setInput] = useState('');
  const on = exam.on;
  const addSub = () => {
    const t = input.trim().slice(0, 10);
    if (!t || exam.subjects.includes(t)) { setInput(''); return; }
    setExam(e => ({ ...e, subjects: [...e.subjects, t] }));
    setInput('');
  };
  const removeSub = (s) => {
    if (exam.subjects.length <= 1) return;
    setExam(e => ({ ...e, subjects: e.subjects.filter(x => x !== s) }));
  };
  return (
    <>
      <div style={S.sectionTitle}>📚 수험생 모드</div>
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15 }}>수험생 모드</div>
            <div style={{ fontSize: 13, color: 'var(--dm-muted)', marginTop: 2, lineHeight: 1.5 }}>
              오늘 탭에 시험 D-day·과목별 공부 시간·오답 노트를 보여줘요 · 계정에 저장돼 다른 기기에도 적용
            </div>
          </div>
          <div onClick={() => setExam(e => ({ ...e, on: !e.on }))} role="switch" aria-checked={on} aria-label="수험생 모드" style={{
            width: 52, height: 28, borderRadius: 999, background: on ? "#6C8EFF" : "var(--dm-border)",
            cursor: "pointer", position: "relative", flexShrink: 0,
          }}>
            <div style={{ position: "absolute", top: 4, left: on ? 28 : 4, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
          </div>
        </div>
        {on && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--dm-row)' }}>
            <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 8 }}>과목</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {exam.subjects.map(s => (
                <span key={s} style={{ ...chip(false), display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'default' }}>
                  {s}
                  {exam.subjects.length > 1 && <button onClick={() => removeSub(s)} aria-label={`${s} 빼기`} style={{ ...xBtn, fontSize: 14, padding: 0 }}>✕</button>}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSub()} placeholder="과목 추가 (예: 한국사)" maxLength={10} style={{ ...S.input, margin: 0, flex: 1, fontSize: 15 }} />
              <button onClick={addSub} style={smallBtn}>추가</button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--dm-muted)', marginTop: 10, lineHeight: 1.6 }}>시험 D-day는 오늘 탭의 📌 줄을 눌러 넣어요. 과목을 빼도 지난 공부 기록은 그대로 남아요.</div>
          </div>
        )}
      </div>
    </>
  );
}
