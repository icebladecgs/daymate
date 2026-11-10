import { useState } from "react";
import { toDateStr, getWeekDates } from "../utils/date.js";
import S, { UI } from "../styles.js";

const DOW_KR = ['월', '화', '수', '목', '금', '토', '일'];

// showAll: 첫 할일 "외 n건" 대신 그날 할일을 모두 보여 줌 (PC 대시보드)
// roomy: 새 디자인 오늘 탭 기준 — 글씨 13px 이상, ‹ › 40px, 또렷한 요일 색. 달력 탭은 예전 모습 유지라 넘기지 않는다
export default function WeeklySchedule({ plans, habits, onOpenDate, showAll, roomy }) {
  const fs = (n) => (roomy ? Math.max(n, UI.sub) : n);
  const navSize = roomy ? UI.touch : 36;
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
    // minmax(0, 1fr): 칸 폭이 화면을 못 넘게 — 띄어쓰기 없는 긴 제목이 있으면 grid 칸이 글자 폭만큼 늘어나 가로로 넘쳤다(2026-11-07)
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: showAll ? UI.rowGapDense : UI.rowGap }}>
      {/* 주간 네비게이션 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
        <button onClick={() => setWeekOffset(o => o - 1)} aria-label="이전 주" style={{ ...S.btnGhost, marginTop: 0, width: navSize, height: navSize, padding: 0, fontSize: 16 }}>‹</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: roomy ? 14 : 13, fontWeight: 900, color: 'var(--dm-text)' }}>{weekLabel}</span>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} style={{ fontSize: fs(10), fontWeight: 900, color: 'var(--dm-accent, #6C8EFF)', background: 'var(--dm-accent-soft, rgba(108,142,255,.12))', border: '1px solid var(--dm-accent-line, rgba(108,142,255,.25))', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>이번주</button>
          )}
        </div>
        <button onClick={() => setWeekOffset(o => o + 1)} aria-label="다음 주" style={{ ...S.btnGhost, marginTop: 0, width: navSize, height: navSize, padding: 0, fontSize: 16 }}>›</button>
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
              padding: showAll ? '5px 10px' : '10px 12px',
              border: isToday ? '1.5px solid var(--dm-accent-line, rgba(108,142,255,.5))' : '1px solid var(--dm-border)',
              background: isToday ? 'var(--dm-accent-soft, rgba(108,142,255,.08))' : 'rgba(255,255,255,.02)',
            }}>
            {roomy ? (
              // 새 디자인 오늘 탭: "9(월)" 한 줄 (2026-11-09 사용자 요청 — 요일·날짜를 세로로 쌓으면 읽기 어렵다). 토 파랑·일 빨강
              <div style={{ width: 52, flexShrink: 0, fontSize: UI.item, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                color: isToday ? UI.accent : i === 6 ? '#EF4444' : i === 5 ? UI.accent : 'var(--dm-text)' }}>
                {dateObj.getDate()}<span style={{ fontSize: 14, fontWeight: 500, color: isToday || i >= 5 ? 'inherit' : 'var(--dm-sub)' }}>({DOW_KR[i]})</span>
              </div>
            ) : (
            <div style={{ width: 30, textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: fs(9), color: isToday ? (roomy || showAll ? UI.accent : '#AFC0FF') /* 대시보드(showAll)는 밝은 화면에서 흐려서 강조색 (2026-11-11), 달력 탭은 예전 그대로 */ : 'var(--dm-muted)', fontWeight: 900 }}>{DOW_KR[i]}</div>
              <div style={{ fontSize: 13, color: 'var(--dm-text)', fontWeight: 900, lineHeight: 1.2 }}>{dateObj.getDate()}</div>
            </div>
            )}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              {isToday && !roomy && ( /* 새 디자인은 날짜가 파랑·줄이 강조라 "오늘" 칩을 뺀다 */
                <span style={{ fontSize: fs(10), color: 'var(--dm-accent, #6C8EFF)', fontWeight: 900, background: 'var(--dm-accent-soft, rgba(108,142,255,.15))', borderRadius: 999, padding: '2px 6px', flexShrink: 0 }}>오늘</span>
              )}
              {showAll && tasks.length > 0 ? (
                <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 3 }}>
                  {sortedTasks.map(t => (
                    <span key={t.id} style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35, wordBreak: 'keep-all', overflowWrap: 'anywhere', color: t.done ? 'var(--dm-muted)' : 'var(--dm-text)', textDecoration: t.done ? 'line-through' : 'none' }}>
                      {t.time ? `${t.time} ` : ''}{t.title}
                    </span>
                  ))}
                </span>
              ) : <span style={{
                fontSize: showAll ? 14 : roomy ? (tasks.length ? UI.item : 14) : 12.5, fontWeight: roomy ? 400 : 700, color: tasks.length > 0 ? 'var(--dm-text)' : 'var(--dm-muted)',
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>{previewLabel}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {/* roomy: 글씨를 키우면 360px에서 제목이 5글자만 남아서 진행 수·습관 수를 위아래로 쌓는다. 아니면 display: contents로 예전 배치 그대로 */}
              <span style={roomy ? { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.3 } : { display: 'contents' }}>
                {tasks.length > 0 && (
                  <span style={{ fontSize: fs(11), fontWeight: 800, color: allDone ? '#4ADE80' : 'var(--dm-muted)' }}>{done}/{tasks.length}</span>
                )}
                {hasHabits && d && (
                  <span style={{ fontSize: fs(10), color: habitDone === (habits || []).length ? '#A78BFA' : 'var(--dm-muted)', fontWeight: 700 }}>습관{habitDone}/{(habits || []).length}</span>
                )}
              </span>
              <span style={{ color: 'var(--dm-muted)', fontSize: 14 }}>›</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
