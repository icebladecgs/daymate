import S from "../styles.js";
import { parseNth, NTH_LABELS, WEEKDAY_LABELS, recurringLabel } from "../utils/recurring.js";

// 반복 할일 관리 (설정 → 🔁 반복 할일, 2026-11-03) — 예전 홈 화면에 있던 편집 칸을 옮겨 왔다.
// 규칙을 바꾸거나 지우면 앞으로 새로 만들어지는 날짜부터 적용된다(이미 만들어진 날의 할일은 그대로).
const RECURRING_MAX = 10;

export default function RecurringManager({ recurringTasks = [], setRecurringTasks }) {
  const list = recurringTasks || [];
  const update = (id, patch) => setRecurringTasks(prev => (prev || []).map(x => x.id === id ? { ...x, ...patch } : x));
  const remove = (t) => {
    if (!window.confirm(`"${t.title || '이름 없음'}" 반복을 그만할까요?\n(이미 만들어진 날의 할일은 그대로 남아요)`)) return;
    setRecurringTasks(prev => (prev || []).filter(x => x.id !== t.id));
  };
  const sel = { ...S.input, marginBottom: 0, padding: '9px 6px', fontSize: 15 };

  return (
    <div style={S.card}>
      <div style={{ fontSize: 14, color: 'var(--dm-sub)', lineHeight: 1.6, marginBottom: 12 }}>
        매일, 특정 요일, 또는 매월 n번째 요일에 자동으로 추가되는 할일이에요. 오늘 탭에 "매주 화요일 회의"처럼 써도 만들어져요.
      </div>
      {list.length === 0 && (
        <div style={{ textAlign: 'center', padding: '8px 0 14px', fontSize: 15, color: 'var(--dm-muted)' }}>🔁 아직 반복 할일이 없어요</div>
      )}
      {list.map(t => {
        const nth = parseNth(t.days);
        return (
          <div key={t.id} style={{ padding: '10px 0', borderTop: '1px solid var(--dm-row)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select value={nth ? 'nth' : t.days} aria-label="반복 주기"
                onChange={e => update(t.id, { days: e.target.value === 'nth' ? `nth:1:${new Date().getDay()}` : e.target.value })}
                style={{ ...sel, width: 88 }}>
                <option value="daily">매일</option>
                <option value="1">월</option><option value="2">화</option><option value="3">수</option>
                <option value="4">목</option><option value="5">금</option>
                <option value="6">토</option><option value="0">일</option>
                <option value="nth">매월…</option>
              </select>
              <input style={{ ...S.input, flex: 1, minWidth: 0, marginBottom: 0, fontSize: 15 }}
                value={t.title} maxLength={40} placeholder="반복 할일 이름" aria-label="반복 할일 이름"
                onChange={e => update(t.id, { title: e.target.value })} />
              <button onClick={() => remove(t)} aria-label="반복 그만하기"
                style={{ width: 36, height: 40, padding: 0, background: 'transparent', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 20, flexShrink: 0 }}>✕</button>
            </div>
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
            <div style={{ fontSize: 13, color: 'var(--dm-muted)', marginTop: 4, paddingLeft: 4 }}>{recurringLabel(t.days)}</div>
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
