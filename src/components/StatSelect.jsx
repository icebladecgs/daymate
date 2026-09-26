import { GROWTH_STATS, GROWTH_STAT_MAP, classifyTodoStat } from "../data/growthStats.js";

// statTag를 바꾼 사본 — '자동'이면 키를 아예 뺀다 (Firestore는 undefined 값이 있으면 저장을 거부함)
export const withStatTag = (obj, statTag) => {
  const { statTag: _old, ...rest } = obj;
  return statTag ? { ...rest, statTag } : rest;
};

// 성장 능력치 고르기 (습관 등 목록 편집 줄에 들어가는 작은 선택 칸)
// value: 없으면 자동(이름 키워드로 분류), 'NONE'이면 지급 안 함, 그 외 스탯 id
export default function StatSelect({ value, name, onChange, style }) {
  const auto = GROWTH_STAT_MAP[classifyTodoStat(name || '')];
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value || undefined)}
      aria-label="성장 능력치"
      title="체크하면 오르는 성장 능력치"
      style={{
        height: 42, borderRadius: 10, border: '1px solid var(--dm-border)', background: 'var(--dm-input)',
        color: value ? '#6C8EFF' : 'var(--dm-sub)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
        padding: '0 2px', width: 78, flexShrink: 0, cursor: 'pointer', ...style,
      }}
    >
      <option value="">{auto ? `자동 ${auto.icon}` : '자동'}</option>
      <option value="NONE">🚫 없음</option>
      {GROWTH_STATS.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
    </select>
  );
}
