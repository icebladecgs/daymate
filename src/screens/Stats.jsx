import { useMemo, useState } from "react";
import { toDateStr, pad2, monthLabel, formatKoreanDate } from "../utils/date.js";
import { isPerfectDay, calcStreak, calcWeeklyStats } from "../data/stats.js";
import S from "../styles.js";

export default function Stats({ plans, habits }) {
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear());

  const streak = useMemo(() => calcStreak(plans), [plans]);
  const weeklyStats = useMemo(() => calcWeeklyStats(plans), [plans]);
  const weeklyAvg = useMemo(() =>
    Math.round(weeklyStats.reduce((a, d) => a + d.rate, 0) / 7),
    [weeklyStats]
  );

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  let perfectDays = 0;
  let filledDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
    const dayData = plans[dateStr];
    if (dayData && (dayData.tasks || []).some(t => t.title.trim())) {
      filledDays++;
      if (isPerfectDay(dayData)) perfectDays++;
    }
  }

  const perfectRate = filledDays === 0 ? 0 : Math.round((perfectDays / filledDays) * 100);

  const monthStats = [];
  for (let m = 0; m < 12; m++) {
    const mStr = pad2(m + 1);
    const daysInM = new Date(viewYear, m + 1, 0).getDate();
    let perfect = 0;
    let filled = 0;
    for (let day = 1; day <= daysInM; day++) {
      const dateStr = `${viewYear}-${mStr}-${pad2(day)}`;
      const dayData = plans[dateStr];
      if (dayData && (dayData.tasks || []).some(t => t.title.trim())) {
        filled++;
        if (isPerfectDay(dayData)) perfect++;
      }
    }
    monthStats.push({ month: m, perfect, filled, rate: filled === 0 ? 0 : Math.round((perfect / filled) * 100) });
  }

  const buildHeatmap = (year) => {
    const jan1 = new Date(year, 0, 1);
    const startOffset = jan1.getDay();
    const totalDays = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(year, 0, i + 1);
      const ds = toDateStr(d);
      const day = plans[ds];
      const filled = day && (day.tasks || []).some(t => t.title.trim());
      const perfect = isPerfectDay(day);
      const done = day ? (day.tasks || []).filter(t => t.done && t.title.trim()).length : 0;
      const total = day ? (day.tasks || []).filter(t => t.title.trim()).length : 0;
      cells.push({ ds, filled, perfect, done, total, month: d.getMonth(), date: d.getDate() });
    }
    return cells;
  };

  const heatmapCells = useMemo(() => buildHeatmap(heatmapYear), [heatmapYear, plans]);
  const heatTotalPerfect = heatmapCells.filter(c => c && c.perfect).length;
  const heatTotalFilled = heatmapCells.filter(c => c && c.filled).length;

  const cellColor = (cell) => {
    if (!cell || !cell.filled) return 'var(--dm-deep)';
    if (cell.perfect) return '#4ADE80';
    if (cell.done === 0) return 'rgba(248,113,113,.25)';
    if (cell.done === cell.total) return 'rgba(74,222,128,.4)';
    return 'rgba(252,211,77,.35)';
  };

  const [tooltip, setTooltip] = useState(null);

  const prev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const next = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  return (
    <div style={S.content}>
      <div style={S.topbar}>
        <div>
          <div style={S.title}>통계</div>
          <div style={S.sub}>{monthLabel(viewYear, viewMonth)}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={prev} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>‹</button>
          <button onClick={next} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>›</button>
        </div>
      </div>

      <div style={S.sectionTitle}>🔥 연속기록 · 이번주</div>
      <div style={{ ...S.card, margin: "0 0 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <div style={{ textAlign: "center", minWidth: 56 }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: streak > 0 ? "#FCD34D" : "var(--dm-muted)", lineHeight: 1 }}>{streak}</div>
            <div style={{ fontSize: 11, color: "var(--dm-sub)", marginTop: 4 }}>일 연속</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: streak > 0 ? "var(--dm-text)" : "var(--dm-muted)", marginBottom: 4 }}>
              {streak > 0 ? `🔥 ${streak}일 연속 중!` : "연속 기록 없음"}
            </div>
            <div style={{ fontSize: 12, color: "var(--dm-muted)" }}>이번주 평균 완료율{" "}
              <b style={{ color: weeklyAvg >= 80 ? "#4ADE80" : weeklyAvg >= 50 ? "#FCD34D" : "#F87171" }}>{weeklyAvg}%</b>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, justifyContent: "space-between" }}>
          {weeklyStats.map((d, i) => {
            const dow = "일월화수목금토"[new Date(d.date).getDay()];
            return (
              <div key={i} style={{ flex: 1, textAlign: "center" }}>
                <div style={{
                  height: 28, borderRadius: 6,
                  background: d.isPerfect ? "rgba(74,222,128,.20)" : d.rate >= 80 ? "rgba(252,211,77,.15)" : d.rate > 0 ? "rgba(248,113,113,.12)" : "var(--dm-input)",
                  border: `1.5px solid ${d.isPerfect ? "#4ADE80" : d.rate >= 80 ? "#FCD34D" : d.rate > 0 ? "#F87171" : "var(--dm-card)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 900, color: d.isPerfect ? "#4ADE80" : "var(--dm-sub)", marginBottom: 4,
                }}>
                  {d.isPerfect ? "✓" : d.rate > 0 ? d.rate : ""}
                </div>
                <div style={{ fontSize: 10, color: "var(--dm-muted)", fontWeight: 800 }}>{dow}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={S.sectionTitle}>이달 완벽한 날</div>
      <div style={{ ...S.card, margin: "0 0 10px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 42, fontWeight: 900, color: perfectRate >= 80 ? "#4ADE80" : perfectRate >= 50 ? "#FCD34D" : "#F87171", marginBottom: 8 }}>
            {perfectDays}
          </div>
          <div style={{ fontSize: 13, color: "var(--dm-sub)", marginBottom: 12 }}>
            {filledDays}일 중 {perfectDays}일 완벽함
          </div>
          <div style={{ height: 12, background: "var(--dm-input)", borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
            <div style={{
              height: "100%",
              background: perfectRate >= 80 ? "#4ADE80" : perfectRate >= 50 ? "#FCD34D" : "#F87171",
              width: `${perfectRate}%`,
              transition: "width 0.3s",
            }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#6C8EFF" }}>
            {perfectRate}% 완성도
          </div>
        </div>
      </div>

      <div style={S.sectionTitle}>연간 월별 진행도</div>
      <div style={{ ...S.card, margin: "0 0 10px", padding: "10px 10px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(50px,1fr))", gap: 6 }}>
          {monthStats.map((m) => (
            <div key={m.month} style={{
              textAlign: "center",
              padding: 12,
              background: "var(--dm-input)",
              borderRadius: 10,
              border: m.month === viewMonth ? "2px solid #6C8EFF" : "1px solid var(--dm-border)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-sub)", marginBottom: 8 }}>
                {pad2(m.month + 1)}월
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: m.rate >= 80 ? "#4ADE80" : m.rate >= 50 ? "#FCD34D" : m.filled > 0 ? "#F87171" : "var(--dm-muted)" }}>
                {m.filled === 0 ? "-" : m.rate + "%"}
              </div>
              <div style={{ fontSize: 10, color: "var(--dm-muted)", marginTop: 4 }}>
                {m.perfect}/{m.filled}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...S.sectionTitle, display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 16 }}>
        <span>🌱 연간 잔디</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setHeatmapYear(y => y - 1)}
            style={{ ...S.btnGhost, width: 32, marginTop: 0, padding: "4px 8px", fontSize: 13 }}>‹</button>
          <span style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, alignSelf: "center" }}>{heatmapYear}</span>
          <button onClick={() => setHeatmapYear(y => y + 1)}
            style={{ ...S.btnGhost, width: 32, marginTop: 0, padding: "4px 8px", fontSize: 13 }}>›</button>
        </div>
      </div>
      <div style={{ ...S.card, margin: "0 0 10px", padding: "12px 10px", overflowX: "auto" }}>
        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>완벽한 날 <b style={{ color: "#4ADE80" }}>{heatTotalPerfect}</b>일</span>
          <span>기록한 날 <b style={{ color: "var(--dm-sub)" }}>{heatTotalFilled}</b>일</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4, minWidth: 200 }}>
          {["일","월","화","수","목","금","토"].map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 9, color: "#3A4260", fontWeight: 900 }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, minWidth: 200 }}>
          {heatmapCells.map((cell, i) => (
            <div
              key={i}
              title={cell ? `${cell.ds} ${cell.perfect ? "🌟 완벽" : cell.filled ? `${cell.done}/${cell.total}` : ""}` : ""}
              onClick={() => cell && setTooltip(tooltip?.ds === cell.ds ? null : cell)}
              style={{
                aspectRatio: "1",
                borderRadius: 3,
                background: cellColor(cell),
                cursor: cell && cell.filled ? "pointer" : "default",
                border: tooltip && cell && tooltip.ds === cell.ds ? "1.5px solid #6C8EFF" : "1.5px solid transparent",
                transition: "transform 0.1s",
              }}
            />
          ))}
        </div>
        {tooltip && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--dm-input)", borderRadius: 8, fontSize: 12, color: "var(--dm-text)" }}>
            <b>{formatKoreanDate(tooltip.ds)}</b>
            {tooltip.perfect && <span style={{ color: "#4ADE80", marginLeft: 8 }}>🌟 완벽한 날</span>}
            {!tooltip.perfect && tooltip.filled && <span style={{ color: "#FCD34D", marginLeft: 8 }}>{tooltip.done}/{tooltip.total} 완료</span>}
          </div>
        )}
        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", fontSize: 10, color: "var(--dm-muted)" }}>
          <span>적음</span>
          {["var(--dm-deep)", "rgba(248,113,113,.25)", "rgba(252,211,77,.35)", "rgba(74,222,128,.4)", "#4ADE80"].map((c, i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
          ))}
          <span>완벽</span>
        </div>
      </div>

      {(habits || []).length > 0 && (
        <>
          <div style={S.sectionTitle}>🎯 습관 달성률</div>
          <div style={{ ...S.card, margin: "0 0 10px" }}>
            {(habits || []).map(h => {
              let done = 0, total = 0;
              for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
                const dayData = plans[dateStr];
                if (dayData) { total++; if (dayData.habitChecks?.[h.id]) done++; }
              }
              const rate = total === 0 ? 0 : Math.round((done / total) * 100);
              return (
                <div key={h.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{h.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dm-text)" }}>{h.name}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: rate >= 80 ? "#4ADE80" : rate >= 50 ? "#FCD34D" : "#F87171" }}>
                      {total === 0 ? "-" : `${done}/${total}일 · ${rate}%`}
                    </div>
                  </div>
                  <div style={{ height: 8, background: "var(--dm-input)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 4, transition: "width 0.3s",
                      background: rate >= 80 ? "#A78BFA" : rate >= 50 ? "#FCD34D" : "#F87171",
                      width: `${rate}%`,
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ height: 12 }} />
    </div>
  );
}
