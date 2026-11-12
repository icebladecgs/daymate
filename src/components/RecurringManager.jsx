import S from "../styles.js";
import { parseNth, NTH_LABELS, WEEKDAY_LABELS, recurringLabel, weekdaysOf, daysFromWeekdays } from "../utils/recurring.js";
import UndoBar from "./UndoBar.jsx";
import { useUndo, putBack } from "../utils/useUndo.js";

// 반복 할일 관리 (설정 → 🔁 반복 할일, 2026-11-03) — 예전 홈 화면에 있던 편집 칸을 옮겨 왔다.
// 규칙을 바꾸거나 지우면 앞으로 새로 만들어지는 날짜부터 적용된다(이미 만들어진 날의 할일은 그대로).
const RECURRING_MAX = 10;
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월요일부터
const toggle = (on) => ({
  height: 40, padding: '0 14px', borderRadius: 20, cursor: 'pointer', fontSize: 14, fontWeight: 700,
  background: on ? 'var(--dm-accent, #5B7CFA)' : 'transparent',
  color: on ? '#fff' : 'var(--dm-accent, #5B7CFA)',
  border: on ? '1.5px solid var(--dm-accent, #5B7CFA)' : '1.5px solid rgba(128,128,128,0.45)',
});

export default function RecurringManager({ recurringTasks = [], setRecurringTasks }) {
  const list = recurringTasks || [];
  const undo = useUndo();
  const update = (id, patch) => setRecurringTasks(prev => (prev || []).map(x => x.id === id ? { ...x, ...patch } : x));
  const remove = (t) => {
    const idx = list.findIndex(x => x.id === t.id);
    setRecurringTasks(prev => (prev || []).filter(x => x.id !== t.id));
    undo.offer(`"${t.title || '이름 없음'}" 반복을 그만했어요`, () => setRecurringTasks(prev => putBack(prev, t, idx)));
  };
  const sel = { ...S.input, marginBottom: 0, padding: '9px 6px', fontSize: 15 };

  return (
    <div style={S.card}>
      <UndoBar bar={undo.bar} onUndo={undo.run} />
      <div style={{ fontSize: 14, color: 'var(--dm-sub)', lineHeight: 1.6, marginBottom: 12 }}>
        켠 요일마다(또는 매월 n번째 요일에) 오늘 할일에 자동으로 들어가요. "공휴일 제외"를 켜면 공휴일에는 안 생겨요. 오늘 탭에 "매주 화요일 회의"처럼 써도 만들어져요.
      </div>
      {list.length === 0 && (
        <div style={{ textAlign: 'center', padding: '8px 0 14px', fontSize: 15, color: 'var(--dm-muted)' }}>🔁 아직 반복 할일이 없어요</div>
      )}
      {list.map(t => {
        const nth = parseNth(t.days);
        const week = weekdaysOf(t.days) || [];
        const toggleDay = (w) => update(t.id, { days: daysFromWeekdays(week.includes(w) ? week.filter(x => x !== w) : [...week, w]) });
        return (
          <div key={t.id} style={{ padding: '12px 0', borderTop: '1px solid var(--dm-row)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input style={{ ...S.input, flex: 1, minWidth: 0, marginBottom: 0, fontSize: 15 }}
                value={t.title} maxLength={40} placeholder="반복 할일 이름" aria-label="반복 할일 이름"
                onChange={e => update(t.id, { title: e.target.value })} />
              <button onClick={() => remove(t)} aria-label="반복 그만하기"
                style={{ width: 36, height: 40, padding: 0, background: 'transparent', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 20, flexShrink: 0 }}>✕</button>
            </div>
            {/* 요일 동그라미 (2026-11-12) — 켠 요일마다 생긴다. 다 켜면 매일, 월~금이면 평일 */}
            {!nth && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, marginTop: 10 }} role="group" aria-label="반복 요일">
                {DAY_ORDER.map(w => {
                  const on = week.includes(w);
                  const tint = w === 0 ? '#F87171' : w === 6 ? '#5B7CFA' : 'var(--dm-text)';
                  return (
                    <button key={w} onClick={() => toggleDay(w)} aria-pressed={on} aria-label={`${WEEKDAY_LABELS[w]}요일`}
                      style={{
                        width: 40, height: 40, padding: 0, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                        fontSize: 15, fontWeight: on ? 800 : 600,
                        background: on ? 'var(--dm-accent, #5B7CFA)' : 'transparent',
                        color: on ? '#fff' : tint,
                        border: on ? '1.5px solid var(--dm-accent, #5B7CFA)' : '1.5px solid rgba(128,128,128,0.45)',
                      }}>{WEEKDAY_LABELS[w]}</button>
                  );
                })}
              </div>
            )}
            {/* 매월 n번째 ○요일 (예: 매월 둘째 화요일, 마지막 금요일) */}
            {nth && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingLeft: 4, fontSize: 15, color: 'var(--dm-sub)' }}>
                매월
                <select value={nth.n} onChange={e => update(t.id, { days: `nth:${e.target.value}:${nth.w}` })} style={{ ...sel, width: 86 }}>
                  {[1, 2, 3, 4, -1].map(n => <option key={n} value={n}>{NTH_LABELS[n]}</option>)}
                </select>
                <select value={nth.w} onChange={e => update(t.id, { days: `nth:${nth.n}:${e.target.value}` })} style={{ ...sel, width: 70 }}>
                  {[1, 2, 3, 4, 5, 6, 0].map(w => <option key={w} value={w}>{WEEKDAY_LABELS[w]}</option>)}
                </select>
                요일
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              <button onClick={() => update(t.id, { noHoliday: !t.noHoliday })} aria-pressed={!!t.noHoliday}
                style={{ ...toggle(!!t.noHoliday) }}>{t.noHoliday ? '✓ ' : ''}공휴일 제외</button>
              <button onClick={() => update(t.id, { days: nth ? 'daily' : `nth:1:${new Date().getDay()}` })}
                style={{ ...toggle(false), color: 'var(--dm-sub)', fontWeight: 600 }}>{nth ? '요일로 바꾸기' : '매월 n번째로'}</button>
            </div>
            <div style={{ fontSize: 13, color: !nth && !week.length ? '#F87171' : 'var(--dm-muted)', marginTop: 6, paddingLeft: 4 }}>
              {!nth && !week.length ? '요일을 하나 이상 골라 주세요' : recurringLabel(t.days, t.noHoliday)}
            </div>
          </div>
        );
      })}
      {list.length < RECURRING_MAX && (
        <button style={{ ...S.btn, marginTop: 8 }}
          onClick={() => setRecurringTasks(prev => [...(prev || []), { id: `r${Date.now()}`, title: '', days: 'daily' }])}>
          ＋ 반복 할일 추가
        </button>
      )}
    </div>
  );
}
