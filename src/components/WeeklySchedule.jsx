import { toDateStr, getWeekDates } from "../utils/date.js";
import S from "../styles.js";

const DOW_KR = ['월', '화', '수', '목', '금', '토', '일'];

export default function WeeklySchedule({ plans, habits, onOpenDate, gcalEvents = {} }) {
  const today = toDateStr();
  const weekDates = getWeekDates();

  return (
    <div>
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

        return (
          <div key={ds} onClick={() => onOpenDate(ds)}
            style={{
              ...S.card,
              border: isToday
                ? '1.5px solid #6C8EFF'
                : allDone ? '1.5px solid rgba(74,222,128,.4)' : '1px solid var(--dm-border)',
              background: isToday ? 'rgba(108,142,255,.06)' : 'var(--dm-card)',
              cursor: 'pointer', marginBottom: 8,
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tasks.length > 0 ? 10 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 13, fontWeight: 900, width: 22,
                  color: isToday ? '#6C8EFF' : isFuture ? 'var(--dm-text)' : 'var(--dm-muted)',
                }}>{DOW_KR[i]}</span>
                <span style={{ fontSize: 12, color: 'var(--dm-sub)' }}>
                  {dateObj.getMonth() + 1}/{dateObj.getDate()}
                </span>
                {isToday && (
                  <span style={{ fontSize: 10, color: '#6C8EFF', fontWeight: 900,
                    background: 'rgba(108,142,255,.15)', borderRadius: 999, padding: '2px 7px' }}>오늘</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {dayGcalEvents.length > 0 && (
                  <span style={{ fontSize: 11, color: '#4B9EFF', fontWeight: 700 }}>
                    📅{dayGcalEvents.length}
                  </span>
                )}
                {hasHabits && d && (
                  <span style={{ fontSize: 11, color: habitDone === (habits||[]).length ? '#A78BFA' : 'var(--dm-muted)', fontWeight: 700 }}>
                    🎯{habitDone}/{(habits||[]).length}
                  </span>
                )}
                {tasks.length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 900,
                    color: allDone ? '#4ADE80' : 'var(--dm-muted)' }}>
                    {allDone ? '✓ 완료' : `${done}/${tasks.length}`}
                  </span>
                )}
              </div>
            </div>

            {tasks.length > 0 ? (
              <div>
                {[...tasks].sort((a,b) => (b.priority?1:0)-(a.priority?1:0)).slice(0, 4).map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                      background: t.done ? '#4B6FFF' : 'transparent',
                      border: t.done ? 'none' : '1.5px solid #3A4260',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {t.done && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>}
                    </div>
                    <span style={{
                      fontSize: 13, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      color: t.done ? 'var(--dm-muted)' : 'var(--dm-text)',
                      textDecoration: t.done ? 'line-through' : 'none',
                    }}>{t.priority ? '⭐ ' : ''}{t.title}</span>
                  </div>
                ))}
                {tasks.length > 4 && (
                  <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 2 }}>+{tasks.length - 4}개 더</div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--dm-muted)' }}>
                {isFuture || isToday ? '탭해서 할 일 추가 →' : '기록 없음'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
