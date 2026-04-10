import { toDateStr, getWeekDates } from "../utils/date.js";
import S from "../styles.js";

const DOW_KR = ['월', '화', '수', '목', '금', '토', '일'];

export default function WeeklySchedule({ plans, habits, onOpenDate, onToggleTask, gcalEvents = {} }) {
  const today = toDateStr();
  const weekDates = getWeekDates();

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {weekDates.map((ds, i) => {
        const d = plans[ds];
        const tasks = (d?.tasks || []).filter(t => t.title.trim());
        const done = tasks.filter(t => t.done).length;
        const isToday = ds === today;
        const isFuture = ds > today;
        const dateObj = new Date(ds + 'T00:00:00');
        const habitChecks = d?.habitChecks || {};
        const habitDone = (habits || []).filter(h => habitChecks[h.id]).length;
        const hasHabits = (habits || []).length > 0;
        const allDone = tasks.length > 0 && done === tasks.length;
        const dayGcalEvents = (gcalEvents[ds] || []).filter(e => !e.extendedProperties?.private?.daymateId);
        const visibleTasks = [...tasks].sort((a,b) => (b.priority?1:0)-(a.priority?1:0)).slice(0, 4);

        return (
          <div key={ds}
            style={{
              ...S.card,
              border: isToday
                ? '1.5px solid rgba(108,142,255,.55)'
                : allDone ? '1.5px solid rgba(74,222,128,.32)' : '1px solid var(--dm-border)',
              background: isToday
                ? 'linear-gradient(180deg, rgba(108,142,255,.09), rgba(108,142,255,.03))'
                : 'linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))',
              marginBottom: 0,
              padding: '14px 14px 12px',
            }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  background: isToday ? 'rgba(108,142,255,.16)' : 'rgba(255,255,255,.05)',
                  border: isToday ? '1px solid rgba(108,142,255,.35)' : '1px solid var(--dm-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <div style={{ fontSize: 10, color: isToday ? '#AFC0FF' : 'var(--dm-muted)', fontWeight: 900 }}>{DOW_KR[i]}</div>
                  <div style={{ fontSize: 14, color: 'var(--dm-text)', fontWeight: 900, lineHeight: 1 }}>{dateObj.getDate()}</div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: isFuture ? 'var(--dm-text)' : 'var(--dm-text)' }}>
                      {dateObj.getMonth() + 1}월 {dateObj.getDate()}일
                    </span>
                    {isToday && (
                      <span style={{ fontSize: 10, color: '#6C8EFF', fontWeight: 900,
                        background: 'rgba(108,142,255,.15)', borderRadius: 999, padding: '2px 7px' }}>오늘</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 5 }}>
                    {tasks.length > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: allDone ? '#4ADE80' : 'var(--dm-muted)' }}>
                        {allDone ? '전부 완료' : `${done}/${tasks.length} 완료`}
                      </span>
                    )}
                    {dayGcalEvents.length > 0 && (
                      <span style={{ fontSize: 11, color: '#4B9EFF', fontWeight: 700 }}>
                        구글 일정 {dayGcalEvents.length}개
                      </span>
                    )}
                    {hasHabits && d && (
                      <span style={{ fontSize: 11, color: habitDone === (habits||[]).length ? '#A78BFA' : 'var(--dm-muted)', fontWeight: 700 }}>
                        습관 {habitDone}/{(habits||[]).length}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => onOpenDate(ds)}
                style={{ ...S.btnGhost, marginTop: 0, width: 'auto', padding: '8px 12px', fontSize: 11, flexShrink: 0 }}
              >
                전체 보기
              </button>
            </div>

            {tasks.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {visibleTasks.map(t => (
                  <div key={t.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 14,
                    background: t.done ? 'rgba(74,222,128,.08)' : 'rgba(255,255,255,.035)',
                    border: `1px solid ${t.done ? 'rgba(74,222,128,.18)' : 'rgba(255,255,255,.06)'}`,
                  }}>
                    <button
                      type="button"
                      onClick={() => onToggleTask?.(ds, t.id)}
                      aria-label={`${t.title} ${t.done ? '미완료로 변경' : '완료로 변경'}`}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 7,
                        flexShrink: 0,
                        background: t.done ? '#4B6FFF' : 'transparent',
                        border: t.done ? 'none' : '1.5px solid #4B567C',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      {t.done ? <span style={{ color: '#fff', fontSize: 11, fontWeight: 900 }}>✓</span> : null}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: t.done ? 'var(--dm-muted)' : 'var(--dm-text)',
                        textDecoration: t.done ? 'line-through' : 'none',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                      }}>{t.priority ? '⭐ ' : ''}{t.title}</div>
                    </div>
                  </div>
                ))}
                {tasks.length > 4 && (
                  <button onClick={() => onOpenDate(ds)} style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '2px 4px', textAlign: 'left' }}>
                    +{tasks.length - 4}개 더 보기
                  </button>
                )}
              </div>
            ) : (
              <div style={{
                borderRadius: 14,
                border: '1px dashed var(--dm-border)',
                background: 'rgba(255,255,255,.02)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}>
                <div style={{ fontSize: 12, color: 'var(--dm-muted)' }}>
                  {isFuture || isToday ? '아직 등록된 할일이 없어요' : '기록 없음'}
                </div>
                <button onClick={() => onOpenDate(ds)} style={{ background: 'transparent', border: 'none', color: '#6C8EFF', fontSize: 11, fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                  날짜 열기 →
                </button>
              </div>
            )}

            {dayGcalEvents.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {dayGcalEvents.slice(0, 2).map((event, index) => (
                  <div key={`${ds}-gcal-${index}`} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    maxWidth: '100%',
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: 'rgba(75,111,255,.08)',
                    border: '1px solid rgba(75,111,255,.16)',
                    color: '#AFC0FF',
                    fontSize: 11,
                    fontWeight: 700,
                  }}>
                    <span style={{ flexShrink: 0 }}>📅</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.summary || '(제목 없음)'}</span>
                  </div>
                ))}
                {dayGcalEvents.length > 2 && (
                  <div style={{ fontSize: 11, color: 'var(--dm-muted)', display: 'flex', alignItems: 'center' }}>
                    +{dayGcalEvents.length - 2}개 일정
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
