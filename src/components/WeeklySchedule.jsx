import { useState } from "react";
import { toDateStr, getWeekDates } from "../utils/date.js";
import S from "../styles.js";

const DOW_KR = ['월', '화', '수', '목', '금', '토', '일'];

export default function WeeklySchedule({ plans, habits, onOpenDate, gcalEvents = {} }) {
  const today = toDateStr();
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = getWeekDates(weekOffset);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];
  const weekLabel = (() => {
    const s = new Date(weekStart + 'T00:00:00');
    const e = new Date(weekEnd + 'T00:00:00');
    if (s.getMonth() === e.getMonth()) return `${s.getMonth()+1}월 ${s.getDate()}일 ~ ${e.getDate()}일`;
    return `${s.getMonth()+1}월 ${s.getDate()}일 ~ ${e.getMonth()+1}월 ${e.getDate()}일`;
  })();

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* 주간 네비게이션 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
        <button onClick={() => setWeekOffset(o => o - 1)} style={{ ...S.btnGhost, marginTop: 0, width: 36, height: 36, padding: 0, fontSize: 16 }}>‹</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--dm-text)' }}>{weekLabel}</span>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} style={{ fontSize: 10, fontWeight: 900, color: '#6C8EFF', background: 'rgba(108,142,255,.12)', border: '1px solid rgba(108,142,255,.25)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>이번주</button>
          )}
        </div>
        <button onClick={() => setWeekOffset(o => o + 1)} style={{ ...S.btnGhost, marginTop: 0, width: 36, height: 36, padding: 0, fontSize: 16 }}>›</button>
      </div>
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
        const sortedTasks = [...tasks].sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0));
        const previewLabel = tasks.length > 0
          ? `${sortedTasks[0].priority ? '⭐ ' : ''}${sortedTasks[0].title}${tasks.length > 1 ? ` 외 ${tasks.length - 1}건` : ''}`
          : (isFuture || isToday ? '등록된 할일 없음' : '기록 없음');

        return (
          <button
            key={ds}
            onClick={() => onOpenDate(ds)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: 'inherit',
              borderRadius: 12,
              padding: '10px 12px',
              border: isToday ? '1.5px solid rgba(108,142,255,.5)' : '1px solid var(--dm-border)',
              background: isToday ? 'rgba(108,142,255,.08)' : 'rgba(255,255,255,.02)',
            }}>
            <div style={{ width: 30, textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 9, color: isToday ? '#AFC0FF' : 'var(--dm-muted)', fontWeight: 900 }}>{DOW_KR[i]}</div>
              <div style={{ fontSize: 13, color: 'var(--dm-text)', fontWeight: 900, lineHeight: 1.2 }}>{dateObj.getDate()}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              {isToday && (
                <span style={{ fontSize: 10, color: '#6C8EFF', fontWeight: 900, background: 'rgba(108,142,255,.15)', borderRadius: 999, padding: '2px 6px', flexShrink: 0 }}>오늘</span>
              )}
              <span style={{
                fontSize: 12.5, fontWeight: 700, color: tasks.length > 0 ? 'var(--dm-text)' : 'var(--dm-muted)',
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>{previewLabel}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {tasks.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 800, color: allDone ? '#4ADE80' : 'var(--dm-muted)' }}>{done}/{tasks.length}</span>
              )}
              {hasHabits && d && (
                <span style={{ fontSize: 10, color: habitDone === (habits || []).length ? '#A78BFA' : 'var(--dm-muted)', fontWeight: 700 }}>습관{habitDone}/{(habits || []).length}</span>
              )}
              <span style={{ color: 'var(--dm-muted)', fontSize: 14 }}>›</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
