import { addDays } from "../utils/date.js";

// 오늘의 할일 위 "월~일" 동그라미 — 보고 있는 날짜가 든 주를 보여 주고, 누르면 그 날짜로 이동.
// 할일이 있는 날은 아래에 점. (네덜란드 Daymate 앱의 요일 동그라미를 참고, 2026-09-27)
const DOW = ["월", "화", "수", "목", "금", "토", "일"];
const dayDiff = (a, b) => Math.round((new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`)) / 86400000);

export default function WeekStrip({ todayDs, selectedDs, plans, todayTasks, onSelect }) {
  const d = new Date(`${selectedDs}T00:00:00`);
  const monday = addDays(selectedDs, d.getDay() === 0 ? -6 : 1 - d.getDay());
  const days = DOW.map((_, i) => addDays(monday, i));
  const hasTasks = (ds) => ((ds === todayDs ? todayTasks : plans?.[ds]?.tasks) || []).some(t => t.title?.trim());

  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 4, margin: "0 16px 10px" }}>
      {days.map((ds, i) => {
        const selected = ds === selectedDs;
        const isToday = ds === todayDs;
        const weekend = i >= 5;
        return (
          <button key={ds} onClick={() => onSelect(dayDiff(ds, todayDs))} aria-label={`${ds}${isToday ? " (오늘)" : ""}`} aria-pressed={selected}
            style={{
              flex: 1, maxWidth: 48, aspectRatio: "1 / 1.15", padding: 0, borderRadius: 999, cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
              border: selected ? "2px solid #6C8EFF" : isToday ? "2px solid rgba(108,142,255,.45)" : "1px solid var(--dm-border)",
              background: selected ? "#6C8EFF" : "var(--dm-card)",
              color: selected ? "#fff" : weekend ? (i === 6 ? "#F87171" : "#6C8EFF") : "var(--dm-text)",
            }}>
            <span style={{ fontSize: 11, fontWeight: 800, opacity: selected ? 0.9 : 0.75 }}>{DOW[i]}</span>
            <span style={{ fontSize: 15, fontWeight: 900, lineHeight: 1 }}>{Number(ds.slice(8))}</span>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: hasTasks(ds) ? (selected ? "#fff" : "#6C8EFF") : "transparent" }} />
          </button>
        );
      })}
    </div>
  );
}
