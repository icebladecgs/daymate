import { TaskDetailBadge, TaskStatIcon } from "./TaskDetailSheet.jsx";
import { fmtMin, leftText } from "../utils/nowTask.js";

// 오늘 탭 새 화면의 할 일 한 줄 (2026-10-30 1단계).
// 목록은 보기 전용(CLAUDE.md 14.1) — 체크·언젠가(미완료만)·✕만 바로, 나머지는 줄을 눌러 상세 창.
// now: 지금 할 일이면 { start, end, nowMin } → 연한 파랑 면에 크게 + [완료][▶ 집중] + 아래 남은 시간 선
// next: 다음 할 일이면 남은 분 → "다음 · 25분 뒤"

const icon = (d) => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const TRAY = icon(<><path d="M12 4v10M8 10l4 4 4-4" /><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></>);
const X = icon(<path d="M6 6l12 12M18 6L6 18" />);
// 전역 button padding(index.css) 때문에 padding: 0 필수
const iconBtn = { width: 32, height: 40, padding: 0, border: "none", background: "none", color: "var(--dm-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: 10 };

export default function TodayTaskRow({ task, now, next, last, onToggle, onOpen, onSomeday, onDelete, onFocus }) {
  const done = !!task.done;
  const timeText = task.time ? `${task.time}${task.endTime && task.endTime > task.time ? `–${task.endTime}` : ""}` : "";
  const progress = now ? Math.min(1, Math.max(0, (now.nowMin - now.start) / Math.max(1, now.end - now.start))) : 0;

  return (
    <div style={{
      position: "relative", display: "flex", alignItems: "flex-start", gap: 4,
      ...(now
        ? { margin: "2px -8px 8px", padding: "12px 4px 14px 8px", borderRadius: 14, background: "rgba(108,142,255,.12)", overflow: "hidden" }
        : { padding: "2px 0", borderBottom: last ? "none" : "1px solid var(--dm-row)" }),
    }}>
      {/* 동그란 체크 26px, 누르는 영역 40px */}
      <button onClick={() => onToggle(task.id)} aria-label={done ? "완료 취소" : "완료"}
        style={{ width: 40, height: 40, padding: 0, border: "none", background: "none", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 26, height: 26, borderRadius: "50%", boxSizing: "border-box", border: `2px solid ${done ? "#4ADE80" : now ? "#6C8EFF" : "var(--dm-muted)"}`, background: done ? "#4ADE80" : "transparent", color: "#fff", fontSize: 15, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>{done ? "✓" : ""}</span>
      </button>

      <div onClick={() => onOpen(task.id)} style={{ flex: 1, minWidth: 0, cursor: "pointer", padding: now ? "0" : "8px 0" }}>
        {now && (
          <div style={{ display: "flex", flexWrap: "wrap", columnGap: 6, fontSize: 13, fontWeight: 800, color: "#6C8EFF", marginBottom: 2, paddingTop: 2 }}>
            <span style={{ whiteSpace: "nowrap" }}>● 지금 · {fmtMin(now.start)}–{fmtMin(now.end)}</span>
            <span style={{ whiteSpace: "nowrap" }}>· {leftText(Math.max(0, now.end - now.nowMin))} 남음</span>
          </div>
        )}
        {/* 시간·제목·아이콘을 한 문장처럼 이어 써서, 길면 자연스럽게 다음 줄로 */}
        <div style={{ fontSize: now ? 20 : 17, fontWeight: now ? 800 : 500, lineHeight: 1.4, color: done ? "var(--dm-muted)" : "var(--dm-text)", wordBreak: "keep-all", overflowWrap: "anywhere" }}>
          {timeText && !now && <span style={{ fontSize: 15, fontWeight: 600, color: done ? "var(--dm-muted)" : "var(--dm-sub)", marginRight: 7, whiteSpace: "nowrap" }}>{timeText}</span>}
          <span style={{ textDecoration: done ? "line-through" : "none" }}>{task.title}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 6, verticalAlign: "middle" }}>
            <TaskStatIcon task={task} />
            <TaskDetailBadge task={task} />
          </span>
        </div>
        {next != null && !now && !done && (
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6C8EFF", marginTop: 2 }}>다음 · {leftText(next)} 뒤</div>
        )}
        {now && (
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => onToggle(task.id)}
              style={{ flex: 1, height: 42, padding: 0, borderRadius: 12, border: "none", background: "#6C8EFF", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>✓ 완료</button>
            {onFocus && (
              <button onClick={() => onFocus(task)}
                style={{ flex: 1, height: 42, padding: 0, borderRadius: 12, border: "1.5px solid rgba(108,142,255,.45)", background: "transparent", color: "#6C8EFF", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>▶ 집중</button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", flexShrink: 0, ...(now ? {} : { paddingTop: 0 }) }}>
        {!done && <button onClick={() => onSomeday(task)} aria-label="언젠가로" title="언젠가로 보내기" style={iconBtn}>{TRAY}</button>}
        <button onClick={() => onDelete(task)} aria-label="삭제" title="삭제" style={iconBtn}>{X}</button>
      </div>

      {/* 지금 할 일 남은 시간 — 칸 아래 가장자리 선 */}
      {now && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: "rgba(108,142,255,.18)" }}>
          <div style={{ width: `${progress * 100}%`, height: "100%", background: "#6C8EFF" }} />
        </div>
      )}
    </div>
  );
}
