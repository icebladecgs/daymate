import { findNowTask } from "../utils/nowTask.js";

// 오늘 탭 "지금 할 일" — 시간을 넣은 할일 중 지금 시간대의 것을 크게, 없으면 다음 할일을 작게 보여 준다.
// 할일에는 시작 시각(time)만 있어서, 끝 시각은 1시간 뒤(다음 시간 할일이 먼저 시작하면 거기까지)로 본다.
// (네덜란드 Daymate 앱의 "지금 할 일 하나에 집중" 화면을 참고, 2026-09-27)
const fmt = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const untilText = (min) => (min < 60 ? `${min}분 뒤` : `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ""} 뒤`);

export default function NowTaskCard({ tasks, nowMin, onToggle, onOpen, onFocus }) {
  const { current, next } = findNowTask(tasks, nowMin);
  if (!current && !next) return null;

  if (!current) {
    return (
      <div onClick={() => onOpen(next.task.id)} style={{ margin: "0 16px 10px", padding: "12px 14px", borderRadius: 14, background: "var(--dm-card)", border: "1px solid var(--dm-border)", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--dm-muted)", flexShrink: 0 }}>다음</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#6C8EFF", flexShrink: 0 }}>{fmt(next.start)}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, color: "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{next.task.title}</span>
        <span style={{ fontSize: 12, color: "var(--dm-muted)", flexShrink: 0 }}>{untilText(next.start - nowMin)}</span>
      </div>
    );
  }

  const total = Math.max(1, current.end - current.start);
  const left = Math.max(0, current.end - nowMin);
  const progress = Math.min(1, (nowMin - current.start) / total);
  const R = 34, C = 2 * Math.PI * R;
  return (
    <div style={{ margin: "0 16px 10px", padding: 16, borderRadius: 18, background: "linear-gradient(135deg, rgba(108,142,255,.18), rgba(108,142,255,.06))", border: "1.5px solid rgba(108,142,255,.35)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* 남은 시간 원 — 시간이 지날수록 채워진다 */}
        <div style={{ position: "relative", width: 84, height: 84, flexShrink: 0 }}>
          <svg width="84" height="84" viewBox="0 0 84 84" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="42" cy="42" r={R} fill="none" stroke="rgba(108,142,255,.18)" strokeWidth="7" />
            <circle cx="42" cy="42" r={R} fill="none" stroke="#6C8EFF" strokeWidth="7" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: "var(--dm-text)", lineHeight: 1.1 }}>{left >= 60 ? `${Math.floor(left / 60)}h` : left}</span>
            <span style={{ fontSize: 10, color: "var(--dm-muted)" }}>{left >= 60 ? `${left % 60}분 남음` : "분 남음"}</span>
          </div>
        </div>
        <div onClick={() => onOpen(current.task.id)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#6C8EFF", letterSpacing: "0.04em" }}>● 지금 할 일</div>
          <div style={{ fontSize: 19, fontWeight: 900, color: "var(--dm-text)", lineHeight: 1.3, marginTop: 2, wordBreak: "keep-all", overflowWrap: "anywhere" }}>{current.task.title}</div>
          <div style={{ fontSize: 13, color: "var(--dm-sub)", marginTop: 3 }}>{fmt(current.start)} ~ {fmt(current.end)}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <button onClick={() => onToggle(current.task.id)}
          style={{ flex: 1, height: 44, padding: 0, borderRadius: 12, border: "none", background: "#6C8EFF", color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer" }}>✓ 완료</button>
        {onFocus && (
          <button onClick={() => onFocus(current.task)}
            style={{ flex: 1, height: 44, padding: 0, borderRadius: 12, border: "1.5px solid rgba(167,139,250,.55)", background: "rgba(167,139,250,.14)", color: "#A78BFA", fontSize: 15, fontWeight: 900, cursor: "pointer" }}>▶ 집중</button>
        )}
      </div>
      {next && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--dm-sub)", display: "flex", gap: 6, minWidth: 0 }}>
          <span style={{ flexShrink: 0 }}>다음 <b style={{ color: "#6C8EFF" }}>{fmt(next.start)}</b></span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--dm-text)", fontWeight: 700 }}>{next.task.title}</span>
        </div>
      )}
    </div>
  );
}
