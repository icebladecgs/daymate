import { useState } from "react";
import { toDateStr, pad2, monthLabel, formatKoreanDate } from "../utils/date.js";
import { isPerfectDay } from "../data/stats.js";
import S from "../styles.js";
import WeeklySchedule from "../components/WeeklySchedule.jsx";
import MemoViewer from "./MemoViewer.jsx";

export default function History({ plans, onOpenDate, habits }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month0, setMonth0] = useState(new Date().getMonth());
  const [showMemoViewer, setShowMemoViewer] = useState(false);
  const [preview, setPreview] = useState(null);
  const firstDay = new Date(year, month0, 1).getDay();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const today = toDateStr();

  const rateOf = (dateStr) => {
    const d = plans[dateStr];
    if (!d) return null;
    const filled = d.tasks.filter((t) => t.title.trim()).length;
    if (filled === 0) return 0;
    const done = d.tasks.filter((t) => t.done && t.title.trim()).length;
    return Math.min(100, Math.round((done / filled) * 100));
  };

  const styleOf = (r, isToday, isPerfect) => {
    if (isPerfect) return { background: "rgba(74,222,128,.20)", color: "#4ADE80", fontWeight: 900, border: "1.5px solid #4ADE80" };
    if (isToday) return { background: "#6C8EFF", color: "#fff", fontWeight: 900 };
    if (r === null) return { background: "transparent", color: "var(--dm-muted)" };
    if (r >= 80) return { background: "rgba(74,222,128,.18)", color: "#4ADE80", fontWeight: 900 };
    if (r >= 50) return { background: "rgba(252,211,77,.14)", color: "#FCD34D", fontWeight: 900 };
    return { background: "rgba(248,113,113,.10)", color: "#F87171", fontWeight: 900 };
  };

  const prev = () => {
    if (month0 === 0) { setMonth0(11); setYear((y) => y - 1); }
    else setMonth0((m) => m - 1);
  };
  const next = () => {
    if (month0 === 11) { setMonth0(0); setYear((y) => y + 1); }
    else setMonth0((m) => m + 1);
  };

  if (showMemoViewer) return <MemoViewer plans={plans} onClose={() => setShowMemoViewer(false)} />;

  return (
    <div style={S.content}>
      <div style={S.topbar}>
        <div>
          <div style={S.title}>기록</div>
          <div style={S.sub}>달력에서 날짜를 눌러 확인</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={prev} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>‹</button>
          <button onClick={next} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>›</button>
        </div>
      </div>

      <div style={{ padding: "12px 18px 8px", fontSize: 16, fontWeight: 900 }}>
        {monthLabel(year, month0)}
      </div>

      <div style={{ padding: "0 18px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
          {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, color: "var(--dm-muted)", fontWeight: 900 }}>
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {Array(firstDay).fill(null).map((_, i) => <div key={"e" + i} />)}
          {Array(daysInMonth).fill(null).map((_, i) => {
            const day = i + 1;
            const ds = `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
            const r = rateOf(ds);
            const isToday = ds === today;
            const perfect = isPerfectDay(plans[ds]);
            const isFutureDate = ds > today;
            const st = isFutureDate && r === null
              ? { background: "var(--dm-input)", color: "var(--dm-muted)", border: "1px dashed var(--dm-border)" }
              : styleOf(r, isToday, perfect);
            const hasMemo = !!(plans[ds]?.memo?.trim());
            const dayHabits = (habits || []);
            const habitChecks = plans[ds]?.habitChecks || {};
            const habitDots = dayHabits.slice(0, 6);
            const hasHabitData = dayHabits.length > 0 && plans[ds];
            return (
              <div
                key={ds}
                onClick={() => setPreview(ds)}
                style={{
                  aspectRatio: 1,
                  borderRadius: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  position: "relative",
                  cursor: "pointer",
                  paddingBottom: hasHabitData ? 4 : 0,
                  ...st,
                }}
                title={perfect ? "완벽한 하루 ✓" : `${r}%`}
              >
                <span>{perfect ? "✓" : day}</span>
                {hasHabitData && (
                  <div style={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap", maxWidth: "90%" }}>
                    {habitDots.map(h => (
                      <span key={h.id} style={{
                        width: 4, height: 4, borderRadius: 999, flexShrink: 0,
                        background: habitChecks[h.id] ? "#A78BFA" : "rgba(167,139,250,.22)",
                      }} />
                    ))}
                  </div>
                )}
                {hasMemo && (
                  <span style={{
                    position: "absolute", top: 3, right: 3,
                    width: 4, height: 4, borderRadius: 999,
                    background: "#6C8EFF",
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={S.sectionTitle}>📅 이번주 일정</div>
      <div style={{ padding: "0 16px" }}>
        <WeeklySchedule plans={plans} habits={habits} onOpenDate={onOpenDate} />
      </div>

      <div style={{ height: 12 }} />

      {preview && (() => {
        const d = plans[preview];
        const tasks = (d?.tasks || []).filter(t => t.title.trim());
        const done = tasks.filter(t => t.done).length;
        const dayHabits = habits || [];
        const habitChecks = d?.habitChecks || {};
        return (
          <>
            <div onClick={() => setPreview(null)} style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200,
            }} />
            <div style={{
              position: "fixed", left: 0, right: 0, bottom: 0,
              background: "var(--dm-card)", borderRadius: "20px 20px 0 0",
              padding: "20px 20px 36px", zIndex: 201, boxShadow: "0 -4px 24px rgba(0,0,0,.3)",
            }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--dm-border)", margin: "0 auto 16px" }} />
              <div style={{ fontSize: 16, fontWeight: 900, color: "var(--dm-text)", marginBottom: 12 }}>
                {formatKoreanDate(preview)}
              </div>
              {tasks.length > 0 ? (
                <>
                  <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 8 }}>
                    {done}/{tasks.length} 완료
                    <div style={{ height: 4, background: "var(--dm-input)", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
                      <div style={{ height: "100%", borderRadius: 2, background: done === tasks.length ? "#4ADE80" : "#4B6FFF", width: `${Math.round(done / tasks.length * 100)}%` }} />
                    </div>
                  </div>
                  {tasks.slice(0, 3).map((t, i) => (
                    <div key={i} style={{ fontSize: 13, color: t.done ? "var(--dm-muted)" : "var(--dm-text)", textDecoration: t.done ? "line-through" : "none", padding: "3px 0" }}>
                      {t.done ? "✓ " : "○ "}{t.title}
                    </div>
                  ))}
                  {tasks.length > 3 && <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 4 }}>+{tasks.length - 3}개 더</div>}
                </>
              ) : (
                <div style={{ fontSize: 13, color: "var(--dm-muted)", marginBottom: 8 }}>기록 없음</div>
              )}
              {dayHabits.length > 0 && d && (
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {dayHabits.map(h => (
                    <span key={h.id} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999,
                      background: habitChecks[h.id] ? "rgba(167,139,250,.2)" : "var(--dm-input)",
                      color: habitChecks[h.id] ? "#A78BFA" : "var(--dm-muted)" }}>
                      {h.icon} {habitChecks[h.id] ? "✓" : "-"}
                    </span>
                  ))}
                </div>
              )}
              {d?.memo?.trim() && (
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--dm-muted)", fontStyle: "italic",
                  background: "var(--dm-input)", borderRadius: 8, padding: "6px 10px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  📝 {d.memo.trim()}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button onClick={() => setPreview(null)}
                  style={{ flex: 1, padding: 12, borderRadius: 10, background: "var(--dm-input)", border: "1px solid var(--dm-border)", color: "var(--dm-sub)", fontWeight: 900, cursor: "pointer", fontSize: 14 }}>
                  닫기
                </button>
                <button onClick={() => { onOpenDate(preview); setPreview(null); }}
                  style={{ flex: 2, padding: 12, borderRadius: 10, background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)", border: "none", color: "#fff", fontWeight: 900, cursor: "pointer", fontSize: 14 }}>
                  상세보기 →
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
