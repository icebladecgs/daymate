import { useEffect, useState } from "react";
import { toDateStr, pad2, monthLabel, formatKoreanDate } from "../utils/date.js";
import { isPerfectDay } from "../data/stats.js";
import { gcalFetchRangeEvents } from "../api/gcal.js";
import { store } from "../utils/storage.js";
import S from "../styles.js";
import WeeklySchedule from "../components/WeeklySchedule.jsx";
import SearchViewer from "./SearchViewer.jsx";

export default function History({ plans, onOpenDate, habits, getValidGcalToken }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month0, setMonth0] = useState(new Date().getMonth());
  const [gcalEvents, setGcalEvents] = useState({});

  useEffect(() => {
    const token = getValidGcalToken?.();
    if (!token) return;
    const cacheKey = `dm_gcal_month_${year}_${pad2(month0 + 1)}`;
    const cached = store.get(cacheKey, null);
    if (cached && cached._fetchedAt && Date.now() - cached._fetchedAt < 60 * 60 * 1000) {
      setGcalEvents(cached);
      return;
    }
    const startDateStr = `${year}-${pad2(month0 + 1)}-01`;
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    gcalFetchRangeEvents(token, startDateStr, daysInMonth).then(byDate => {
      const toStore = { ...byDate, _fetchedAt: Date.now() };
      store.set(cacheKey, toStore);
      setGcalEvents(byDate);
    }).catch(() => {});
  }, [year, month0]); // eslint-disable-line
  const [showSearch, setShowSearch] = useState(false);
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
    if (isToday && isPerfect) return { background: "#6C8EFF", color: "#fff", fontWeight: 900, border: "2px solid #4ADE80" };
    if (isToday) return { background: "#6C8EFF", color: "#fff", fontWeight: 900 };
    if (isPerfect) return { background: "rgba(74,222,128,.20)", color: "#4ADE80", fontWeight: 900, border: "1.5px solid #4ADE80" };
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

  if (showSearch) return <SearchViewer plans={plans} onClose={() => setShowSearch(false)} onOpenDate={onOpenDate} />;

  return (
    <div style={{ ...S.content, overflowX: "hidden" }}>
      <div style={S.topbar}>
        <div>
          <div style={S.title}>달력</div>
          <div style={S.sub}>달력에서 날짜를 눌러 확인</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowSearch(true)} style={{ ...S.btnGhost, marginTop: 0, padding: '6px 10px', fontSize: 11, width: 'auto' }}>🔍</button>
          <button onClick={prev} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>‹</button>
          <button onClick={next} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>›</button>
        </div>
      </div>

      <div style={{ padding: "12px 18px 8px", fontSize: 16, fontWeight: 900 }}>
        {monthLabel(year, month0)}
      </div>

      <div style={{ padding: "0 18px 12px", boxSizing: "border-box" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 4, marginBottom: 6 }}>
          {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, color: "var(--dm-muted)", fontWeight: 900 }}>
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 4 }}>
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
            const dayGcalEvents = (gcalEvents[ds] || []).filter(e => !e.extendedProperties?.private?.daymateId);
            const hasGcal = dayGcalEvents.length > 0;
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
                  paddingBottom: hasHabitData || hasGcal ? 4 : 0,
                  ...st,
                }}
                title={perfect ? `${day}일 · 완벽한 하루 ✓` : r !== null ? `${day}일 · ${r}%` : undefined}
              >
                <span>{day}</span>
                {hasGcal && (
                  <span style={{
                    position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)",
                    width: 4, height: 4, borderRadius: 999,
                    background: "#4B6FFF",
                  }} />
                )}
                {hasHabitData && !hasGcal && (
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

      {/* 빈 상태: 이번 달 기록이 하나도 없을 때 */}
      {(() => {
        const hasAnyRecord = Array(daysInMonth).fill(null).some((_, i) => {
          const ds = `${year}-${pad2(month0 + 1)}-${pad2(i + 1)}`;
          return !!plans[ds];
        });
        if (hasAnyRecord) return null;
        const isCurrentMonth = year === new Date().getFullYear() && month0 === new Date().getMonth();
        return (
          <div style={{ margin: "4px 16px 12px", borderRadius: 16, background: "var(--dm-card)", border: "1.5px dashed var(--dm-border)", padding: "22px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📅</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "var(--dm-text)", marginBottom: 6 }}>
              {isCurrentMonth ? "아직 이번 달 기록이 없어요" : "이 달은 기록이 없어요"}
            </div>
            <div style={{ fontSize: 12, color: "var(--dm-muted)", lineHeight: 1.7 }}>
              {isCurrentMonth
                ? "오늘 할 일 3가지를 완료하면\n달력에 색이 채워져요 🌈"
                : "할일을 완료하거나 일기를 쓰면\n달력에 기록이 남아요"}
            </div>
          </div>
        );
      })()}

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
        const previewGcal = (gcalEvents[preview] || []).filter(e => !e.extendedProperties?.private?.daymateId);
        return (
          <div onClick={() => setPreview(null)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
            zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 20px",
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "var(--dm-bg)",
              border: "1px solid var(--dm-border2)",
              borderRadius: 22,
              width: "100%", maxWidth: 360,
              maxHeight: "70vh",
              display: "flex", flexDirection: "column",
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              animation: "modalPop 0.18s ease-out",
              overflow: "hidden",
            }}>
              {/* 헤더 */}
              <div style={{ padding: "22px 22px 14px", borderBottom: "1px solid var(--dm-border)" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: "var(--dm-text)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {formatKoreanDate(preview)}
                </div>
              </div>
              {/* 내용 */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>
                {tasks.length > 0 ? (
                  <>
                    <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 10 }}>
                      {done}/{tasks.length} 완료
                      <div style={{ height: 5, background: "var(--dm-row)", borderRadius: 3, overflow: "hidden", marginTop: 6 }}>
                        <div style={{ height: "100%", borderRadius: 3, transition: "width 0.3s",
                          background: done === tasks.length ? "#4ADE80" : "#4B6FFF",
                          width: `${Math.round(done / tasks.length * 100)}%` }} />
                      </div>
                    </div>
                    {tasks.slice(0, 4).map((t, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                        borderBottom: i < Math.min(tasks.length, 4) - 1 ? "1px solid var(--dm-row)" : "none" }}>
                        <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                          background: t.done ? "#4B6FFF" : "transparent",
                          border: t.done ? "none" : "2px solid var(--dm-border2)",
                          display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {t.done && <span style={{ color: "#fff", fontSize: 11, fontWeight: 900 }}>✓</span>}
                        </div>
                        <div style={{ fontSize: 14, color: t.done ? "var(--dm-muted)" : "var(--dm-text)",
                          textDecoration: t.done ? "line-through" : "none", flex: 1 }}>{t.title}</div>
                      </div>
                    ))}
                    {tasks.length > 4 && <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 6 }}>+{tasks.length - 4}개 더</div>}
                  </>
                ) : (
                  <div style={{ fontSize: 14, color: "var(--dm-muted)", textAlign: "center", padding: "16px 0" }}>기록 없음</div>
                )}
                {previewGcal.length > 0 && (
                  <div style={{ marginTop: tasks.length > 0 ? 12 : 0 }}>
                    <div style={{ fontSize: 11, color: "#4B6FFF", fontWeight: 900, marginBottom: 6 }}>📅 구글 캘린더</div>
                    {previewGcal.slice(0, 5).map((e, i) => {
                      const time = e.start?.dateTime
                        ? new Date(e.start.dateTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                        : '종일';
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                          borderBottom: i < Math.min(previewGcal.length, 5) - 1 ? "1px solid var(--dm-row)" : "none" }}>
                          <div style={{ width: 3, height: 28, borderRadius: 2, background: "#4B6FFF", flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 13, color: "var(--dm-text)", fontWeight: 700 }}>{e.summary || '(제목 없음)'}</div>
                            <div style={{ fontSize: 11, color: "var(--dm-muted)" }}>{time}</div>
                          </div>
                        </div>
                      );
                    })}
                    {previewGcal.length > 5 && <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 4 }}>+{previewGcal.length - 5}개 더</div>}
                  </div>
                )}
                {d?.memo?.trim() && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "var(--dm-muted)", fontStyle: "italic",
                    background: "var(--dm-row)", borderRadius: 8, padding: "8px 10px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    📝 {d.memo.trim()}
                  </div>
                )}
              </div>
              {/* 버튼 */}
              <div style={{ display: "flex", gap: 10, padding: "14px 22px 22px", borderTop: "1px solid var(--dm-border)" }}>
                <button onClick={() => setPreview(null)}
                  style={{ flex: 1, padding: 14, borderRadius: 12, background: "var(--dm-row)", border: "1.5px solid var(--dm-border2)", color: "var(--dm-text)", fontWeight: 900, cursor: "pointer", fontSize: 14 }}>
                  닫기
                </button>
                <button onClick={() => { onOpenDate(preview); setPreview(null); }}
                  style={{ flex: 2, padding: 14, borderRadius: 12, background: "linear-gradient(135deg,#4B6FFF,#818cf8)", border: "none", color: "#fff", fontWeight: 900, cursor: "pointer", fontSize: 16, boxShadow: "0 6px 20px rgba(75,111,255,.45)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  상세보기 →
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
