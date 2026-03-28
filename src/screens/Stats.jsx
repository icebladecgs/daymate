import { useEffect, useMemo, useState } from "react";
import { toDateStr, pad2, monthLabel, formatKoreanDate } from "../utils/date.js";
import { isPerfectDay, calcStreak, calcWeeklyStats, calcHabitStreak } from "../data/stats.js";
import { loadRankings } from "../firebase.js";
import S from "../styles.js";

function maskEmail(email) {
  if (!email) return '익명';
  const [local, domain] = email.split('@');
  const masked = local.slice(0, 4) + '****';
  return `${masked}@${domain}`;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Stats({ plans, habits, authUser, onBack }) {
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [barTooltip, setBarTooltip] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [rankLoading, setRankLoading] = useState(true);
  const [rankTab, setRankTab] = useState('total'); // 'total' | 'month' | 'invite'
  const currentYM = `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`;
  const currentMonthLabel = `${new Date().getMonth() + 1}월`;

  useEffect(() => {
    loadRankings()
      .then(list => setRankings(list))
      .catch(() => {})
      .finally(() => setRankLoading(false));
  }, []);

  const sortedRankings = useMemo(() => {
    const list = [...rankings];
    if (rankTab === 'month') {
      return list
        .map(r => ({ ...r, score: (r.monthlyScores || {})[currentYM] || 0 }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score);
    }
    if (rankTab === 'invite') {
      return list
        .filter(r => (r.inviteCount || 0) > 0)
        .sort((a, b) => (b.inviteCount || 0) - (a.inviteCount || 0));
    }
    return list.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
  }, [rankings, rankTab, currentYM]);

  const streak = useMemo(() => calcStreak(plans), [plans]);
  const weeklyStats = useMemo(() => calcWeeklyStats(plans), [plans]);
  const habitStreaks = useMemo(() => {
    const map = {};
    (habits || []).forEach(h => { map[h.id] = calcHabitStreak(plans, h.id); });
    return map;
  }, [plans, habits]);
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

const last30 = useMemo(() => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = toDateStr(d);
      const day = plans[ds];
      const filled = day && (day.tasks || []).some(t => t.title.trim());
      const tasks = day ? (day.tasks || []).filter(t => t.title.trim()) : [];
      const done = tasks.filter(t => t.done).length;
      const perfect = isPerfectDay(day);
      const rate = tasks.length > 0 ? done / tasks.length : 0;
      days.push({ ds, filled, perfect, done, total: tasks.length, rate, date: d.getDate(), weekday: d.getDay() });
    }
    return days;
  }, [plans]);

  const cellColor = (cell) => {
    if (!cell || !cell.filled) return 'var(--dm-deep)';
    if (cell.perfect) return '#4ADE80';
    if (cell.done === 0) return 'rgba(248,113,113,.25)';
    if (cell.done === cell.total) return 'rgba(74,222,128,.4)';
    return 'rgba(252,211,77,.35)';
  };


  // 월간 리포트 계산 (현재 보는 달)
  const monthlyReport = useMemo(() => {
    const ym = `${viewYear}-${pad2(viewMonth + 1)}`;
    const daysInM = new Date(viewYear, viewMonth + 1, 0).getDate();
    let totalTasks = 0, doneTasks = 0, perfectDaysCount = 0, filledDaysCount = 0;
    let habitTotals = {}, habitDones = {};
    let bestStreak = 0, curStreak = 0;
    for (let day = 1; day <= daysInM; day++) {
      const ds = `${ym}-${pad2(day)}`;
      const d = plans[ds];
      const tasks = d ? (d.tasks || []).filter(t => t.title.trim()) : [];
      if (tasks.length > 0) {
        filledDaysCount++;
        const done = tasks.filter(t => t.done).length;
        totalTasks += tasks.length;
        doneTasks += done;
        if (isPerfectDay(d)) { perfectDaysCount++; curStreak++; bestStreak = Math.max(bestStreak, curStreak); }
        else curStreak = 0;
        (habits || []).forEach(h => {
          habitTotals[h.id] = (habitTotals[h.id] || 0) + 1;
          if (d.habitChecks?.[h.id]) habitDones[h.id] = (habitDones[h.id] || 0) + 1;
        });
      } else curStreak = 0;
    }
    const completionRate = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);
    const habitStats = (habits || []).map(h => ({
      ...h, rate: habitTotals[h.id] ? Math.round(((habitDones[h.id] || 0) / habitTotals[h.id]) * 100) : 0,
    })).sort((a, b) => b.rate - a.rate);
    return { filledDaysCount, perfectDaysCount, completionRate, bestStreak, habitStats, totalTasks, doneTasks };
  }, [plans, habits, viewYear, viewMonth]);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'var(--dm-text)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}>←</button>
          )}
          <div>
            <div style={S.title}>통계</div>
            <div style={S.sub}>{monthLabel(viewYear, viewMonth)}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={prev} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>‹</button>
          <button onClick={next} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>›</button>
        </div>
      </div>

      <div style={S.sectionTitle}><span style={S.sectionEmoji}>🔥</span> 연속기록 · 이번주</div>
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

      <div style={S.sectionTitle}><span style={S.sectionEmoji}>🌟</span>이달 완벽한 날</div>
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

      <div style={S.sectionTitle}><span style={S.sectionEmoji}>📈</span>연간 월별 진행도</div>
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

      <div style={S.sectionTitle}><span style={S.sectionEmoji}>📝</span> 월간 리포트 — {viewMonth + 1}월</div>
      <div style={{ ...S.card, margin: "0 0 10px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: monthlyReport.habitStats.length > 0 ? 14 : 0 }}>
          {[
            { label: '기록한 날', value: `${monthlyReport.filledDaysCount}일`, color: '#6C8EFF' },
            { label: '완벽한 날', value: `${monthlyReport.perfectDaysCount}일`, color: '#4ADE80' },
            { label: '할일 완료율', value: `${monthlyReport.completionRate}%`, color: monthlyReport.completionRate >= 80 ? '#4ADE80' : monthlyReport.completionRate >= 50 ? '#FCD34D' : '#F87171' },
            { label: '최고 연속', value: `${monthlyReport.bestStreak}일`, color: '#FCD34D' },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--dm-input)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 2 }}>{item.label}</div>
            </div>
          ))}
        </div>
        {monthlyReport.habitStats.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-sub)', marginBottom: 8 }}>🎯 습관 달성률</div>
            {monthlyReport.habitStats.map(h => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{h.icon}</span>
                <div style={{ fontSize: 13, flex: 1, color: 'var(--dm-text)' }}>{h.name}</div>
                <div style={{ width: 80, height: 6, background: 'var(--dm-row)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: h.rate >= 80 ? '#4ADE80' : h.rate >= 50 ? '#FCD34D' : '#F87171', width: `${h.rate}%` }} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--dm-sub)', width: 30, textAlign: 'right' }}>{h.rate}%</div>
              </div>
            ))}
          </>
        )}
        {monthlyReport.filledDaysCount === 0 && (
          <div style={{ fontSize: 13, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0' }}>이달 기록이 없어요</div>
        )}
      </div>

      <div style={S.sectionTitle}><span style={S.sectionEmoji}>📊</span> 최근 30일</div>
      <div style={{ ...S.card, padding: "14px 12px" }}>
        {/* 바 차트 */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 72 }}>
          {last30.map((day, i) => {
            const barH = day.filled ? Math.max(8, Math.round(day.rate * 60)) : 4;
            const color = day.perfect ? '#4ADE80' : day.filled ? day.rate >= 0.5 ? '#FCD34D' : '#F87171' : 'var(--dm-deep)';
            const isSelected = barTooltip?.ds === day.ds;
            return (
              <div key={day.ds} onClick={() => setBarTooltip(isSelected ? null : day)}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", gap: 3 }}>
                <div style={{
                  width: "100%", height: barH, borderRadius: 3,
                  background: color,
                  opacity: isSelected ? 1 : 0.85,
                  border: isSelected ? "1.5px solid #6C8EFF" : "1.5px solid transparent",
                  transition: "height 0.2s",
                }} />
                {/* 날짜 레이블: 매주 일요일 또는 1일 */}
                <div style={{ fontSize: 8, color: "var(--dm-muted)", whiteSpace: "nowrap" }}>
                  {day.weekday === 0 || day.date === 1 ? `${day.date}` : ""}
                </div>
              </div>
            );
          })}
        </div>
        {/* 툴팁 */}
        {barTooltip && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--dm-input)", borderRadius: 8, fontSize: 12, color: "var(--dm-text)" }}>
            <b>{formatKoreanDate(barTooltip.ds)}</b>
            {barTooltip.perfect && <span style={{ color: "#4ADE80", marginLeft: 8 }}>🌟 완벽한 날</span>}
            {!barTooltip.perfect && barTooltip.filled && <span style={{ color: "#FCD34D", marginLeft: 8 }}>{barTooltip.done}/{barTooltip.total} 완료</span>}
            {!barTooltip.filled && <span style={{ color: "var(--dm-muted)", marginLeft: 8 }}>기록 없음</span>}
          </div>
        )}
        {/* 범례 */}
        <div style={{ marginTop: 10, display: "flex", gap: 12, fontSize: 10, color: "var(--dm-muted)" }}>
          {[['#4ADE80', '완벽'], ['#FCD34D', '50%↑'], ['#F87171', '50%↓'], ['var(--dm-deep)', '없음']].map(([c, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {(habits || []).length > 0 && (
        <>
          <div style={S.sectionTitle}><span style={S.sectionEmoji}>🎯</span> 습관 달성률</div>
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
                      {habitStreaks[h.id] > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 900, color: "#FCD34D", background: "rgba(252,211,77,0.12)", borderRadius: 6, padding: "1px 6px" }}>
                          🔥 {habitStreaks[h.id]}일
                        </span>
                      )}
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

      {/* 전체 랭킹 */}
      <div style={S.sectionTitle}><span style={S.sectionEmoji}>🏆</span> 랭킹</div>
      <div style={S.card}>
        {/* 탭 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {[['total', '전체'], ['month', `${currentMonthLabel}`], ['invite', '초대']].map(([key, label]) => (
            <button key={key} onClick={() => setRankTab(key)} style={{
              ...S.btn, marginTop: 0, flex: 1, fontSize: 12,
              background: rankTab === key ? 'linear-gradient(135deg,#4B6FFF,#6C8EFF)' : 'var(--dm-input)',
              color: rankTab === key ? '#fff' : 'var(--dm-sub)',
              boxShadow: 'none',
            }}>{label}</button>
          ))}
        </div>

        {rankLoading ? (
          <div style={{ color: 'var(--dm-muted)', fontSize: 13, textAlign: 'center', padding: 12 }}>로딩 중...</div>
        ) : sortedRankings.length === 0 ? (
          <div style={{ color: 'var(--dm-muted)', fontSize: 13, textAlign: 'center', padding: 12 }}>아직 랭킹 데이터가 없어요</div>
        ) : (
          sortedRankings.map((r, i) => {
            const isMe = authUser?.uid === r.uid;
            const score = rankTab === 'month' ? r.score : r.totalScore;
            return (
              <div key={r.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < sortedRankings.length - 1 ? '1px solid var(--dm-row)' : 'none' }}>
                <div style={{ fontSize: i < 3 ? 20 : 13, width: 28, textAlign: 'center', fontWeight: 900, color: 'var(--dm-muted)' }}>
                  {i < 3 ? MEDALS[i] : `${i + 1}`}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: isMe ? 900 : 700, color: isMe ? '#6C8EFF' : 'var(--dm-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {maskEmail(r.email)}{isMe ? ' 👈 나' : ''}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--dm-muted)' }}>Lv.{r.level} · {r.daysCount || 0}일 기록</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 900, color: rankTab === 'invite' ? '#F472B6' : '#FBBF24' }}>
                  {rankTab === 'invite' ? `${r.inviteCount || 0}명` : `${(score || 0).toLocaleString()} XP`}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ height: 12 }} />
    </div>
  );
}
