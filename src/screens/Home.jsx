import { useEffect, useMemo, useRef, useState } from "react";
import { toDateStr, formatKoreanDate } from "../utils/date.js";
import { store } from "../utils/storage.js";
import { getPermission } from "../utils/notification.js";
import { calcStreak, calcGoalProgress } from "../data/stats.js";
import S from "../styles.js";
import WeeklySchedule from "../components/WeeklySchedule.jsx";

export default function Home({ user, goals, todayData, plans, onToggleTask, goalChecks, onToggleGoal, onSetTodayTasks, onSaveMonthGoals, habits, onToggleHabit, onOpenDate, onOpenDateMemo, installPrompt, handleInstall, showInstallBanner, dismissInstallBanner, isIOS }) {
  const today = toDateStr();
  const doneCount = (todayData?.tasks || []).filter((t) => t.done && t.title.trim()).length;
  const filledCount = (todayData?.tasks || []).filter((t) => t.title.trim()).length;
  const allDone = filledCount > 0 && doneCount === filledCount;

  const streak = useMemo(() => calcStreak(plans), [plans]);
  const goalProgress = useMemo(() => calcGoalProgress(plans), [plans]);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [someday, setSomeday] = useState(() => store.get("dm_someday") || []);
  const [somedayInput, setSomedayInput] = useState("");
  const saveSomeday = (next) => { setSomeday(next); store.set("dm_someday", next); };
  const addSomeday = () => {
    const title = somedayInput.trim();
    if (!title) return;
    saveSomeday([...someday, { id: `sd${Date.now()}`, title, done: false }]);
    setSomedayInput("");
  };
  const toggleSomeday = (id) => saveSomeday(someday.map(x => x.id === id ? { ...x, done: !x.done } : x));
  const deleteSomeday = (id) => saveSomeday(someday.filter(x => x.id !== id));
  const moveToToday = (item) => {
    const tasks = [...(todayData?.tasks || [])];
    const emptyIdx = tasks.findIndex(t => !t.title.trim());
    const newTask = { id: `t${Date.now()}`, title: item.title, done: false, checkedAt: null, priority: false };
    if (emptyIdx >= 0) tasks[emptyIdx] = newTask;
    else tasks.push(newTask);
    onSetTodayTasks(tasks);
    deleteSomeday(item.id);
  };

  const [editingTasks, setEditingTasks] = useState(false);
  const [draftTasks, setDraftTasks] = useState([]);
  const [editingGoals, setEditingGoals] = useState(false);
  const [draftGoals, setDraftGoals] = useState([]);
  const [newGoalInput, setNewGoalInput] = useState('');
  const [prevAllDone, setPrevAllDone] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [swipedId, setSwipedId] = useState(null);
  const swipeStartX = useRef(0);

  useEffect(() => {
    if (allDone && !prevAllDone) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2500);
    }
    setPrevAllDone(allDone);
  }, [allDone]);

  const startEditTasks = () => {
    setDraftTasks((todayData?.tasks || []).map(t => ({ ...t })));
    setEditingTasks(true);
  };
  const saveTaskEdits = () => {
    onSetTodayTasks(draftTasks);
    setEditingTasks(false);
  };
  const startEditGoals = () => {
    setDraftGoals([...(goals.month || [])]);
    setNewGoalInput('');
    setEditingGoals(true);
  };
  const saveGoalEdits = () => {
    const final = [...draftGoals, ...(newGoalInput.trim() ? [newGoalInput.trim()] : [])].filter(g => g.trim());
    onSaveMonthGoals(final);
    setNewGoalInput('');
    setEditingGoals(false);
  };

  return (
    <div style={S.content}>
      {showConfetti && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, pointerEvents:'none', zIndex:500, overflow:'hidden' }}>
          {Array(20).fill(null).map((_,i) => (
            <div key={i} style={{
              position:'absolute',
              left: `${(i * 5.1 + 3) % 100}%`,
              top: '-20px',
              fontSize: 20,
              animation: `fall ${1.5 + (i % 5) * 0.2}s ease-in forwards`,
              animationDelay: `${(i % 8) * 0.1}s`,
            }}>{['🎉','⭐','✨','🎊','💫'][i%5]}</div>
          ))}
        </div>
      )}
      <div style={S.topbar}>
        <div>
          <div style={S.title}>DayMate Lite</div>
          <div style={S.sub}>{user.name}님 · {formatKoreanDate(today)} · {clock.toLocaleTimeString('ko-KR', { hour12: false })}</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 800 }}>
            {getPermission() === "granted" ? "🔔" : "🔕"}
        </div>
      </div>

      {showInstallBanner && (
        <div style={{ margin: "0 0 12px 0", borderRadius: 14, background: "var(--dm-card)", border: "1.5px solid #4B6FFF", padding: "12px 14px", boxShadow: "0 2px 12px rgba(75,111,255,.2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: installPrompt || isIOS ? 10 : 0 }}>
            <div style={{ fontSize: 22 }}>📲</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>홈 화면에 설치하기</div>
              <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 1 }}>앱처럼 빠르게 실행돼요</div>
            </div>
            <button onClick={dismissInstallBanner} style={{ background: "transparent", border: "none", color: "var(--dm-muted)", fontSize: 16, cursor: "pointer", padding: 4, lineHeight: 1 }}>✕</button>
          </div>
          {installPrompt && (
            <button onClick={handleInstall} style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>설치하기</button>
          )}
          {!installPrompt && (
            <div style={{ padding: "8px 10px", borderRadius: 8, background: "var(--dm-bg)", fontSize: 12, color: "var(--dm-sub)", lineHeight: 2 }}>
              {isIOS ? <>1️⃣ 하단 <b style={{color:"var(--dm-text)"}}>공유(□↑)</b> 버튼 → 2️⃣ <b style={{color:"var(--dm-text)"}}>홈 화면에 추가</b> → 3️⃣ <b style={{color:"var(--dm-text)"}}>추가</b></> : <>Chrome <b style={{color:"var(--dm-text)"}}>⋮ 메뉴</b> → <b style={{color:"var(--dm-text)"}}>앱 설치</b> 또는 <b style={{color:"var(--dm-text)"}}>홈 화면에 추가</b></>}
            </div>
          )}
        </div>
      )}

      <div style={{ ...S.sectionTitle, display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 16 }}>
        <span>🎯 이달 목표</span>
        <button onClick={editingGoals ? saveGoalEdits : startEditGoals}
          style={{ fontSize: 11, fontWeight: 900, color: editingGoals ? "#4ADE80" : "var(--dm-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}>
          {editingGoals ? "완료 ✓" : "✏️ 편집"}
        </button>
      </div>
      <div style={S.card}>
        {editingGoals ? (
          <>
            {draftGoals.map((g, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <input
                  style={{ ...S.input, flex: 1 }}
                  value={g}
                  onChange={(e) => setDraftGoals(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                  placeholder={`목표 ${i + 1}`}
                  maxLength={40}
                />
                <button onClick={() => setDraftGoals(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer", flexShrink: 0 }}>✕</button>
              </div>
            ))}
            {draftGoals.length < 5 && (
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  style={{ ...S.input, flex: 1 }}
                  value={newGoalInput}
                  onChange={(e) => setNewGoalInput(e.target.value)}
                  placeholder="새 목표 입력 후 Enter 또는 ➕"
                  maxLength={40}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newGoalInput.trim()) {
                      setDraftGoals(prev => [...prev, newGoalInput.trim()]);
                      setNewGoalInput('');
                    }
                  }}
                />
                <button onClick={() => {
                  if (!newGoalInput.trim()) return;
                  setDraftGoals(prev => [...prev, newGoalInput.trim()]);
                  setNewGoalInput('');
                }} style={{ background: "transparent", border: "none", color: "#4B6FFF", cursor: "pointer", flexShrink: 0, fontSize: 20, lineHeight: 1 }}>➕</button>
              </div>
            )}
          </>
        ) : (goals.month || []).length ? (() => {
          const monthGoals = goals.month;
          const doneGoals = monthGoals.filter((_, i) => goalChecks[i]).length;
          const allGoalsDone = doneGoals === monthGoals.length;
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: "var(--dm-sub)", fontWeight: 900 }}>{doneGoals}/{monthGoals.length} 달성</div>
                {allGoalsDone && <div style={{ fontSize: 12, color: "#4ADE80", fontWeight: 900 }}>🎉 전부 달성!</div>}
              </div>
              <div style={{ height: 6, background: "var(--dm-row)", borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
                <div style={{
                  height: "100%", borderRadius: 3, transition: "width 0.3s",
                  background: allGoalsDone ? "#4ADE80" : "#4B6FFF",
                  width: `${(doneGoals / monthGoals.length) * 100}%`,
                }} />
              </div>
              {monthGoals.map((g, i) => {
                const done = !!goalChecks[i];
                return (
                  <div key={i} onClick={() => onToggleGoal(i)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                      borderBottom: i < monthGoals.length - 1 ? `1px solid var(--dm-row)` : "none",
                      cursor: "pointer" }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: done ? "none" : "2px solid #3A4260",
                      background: done ? "#4B6FFF" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {done && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 700, flex: 1,
                      color: done ? "var(--dm-muted)" : "var(--dm-text)",
                      textDecoration: done ? "line-through" : "none",
                    }}>{g}</div>
                  </div>
                );
              })}
            </>
          );
        })() : (
          <div style={{ color: "var(--dm-muted)", fontSize: 13, marginBottom: 4 }}>
            이달 목표가 없어요.{" "}
            <span onClick={startEditGoals} style={{ color: "#4B6FFF", cursor: "pointer", fontWeight: 900 }}>✏️ 편집</span>에서 추가해보세요
          </div>
        )}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--dm-row)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 900 }}>📆 완벽한 날</div>
            <div style={{ flex: 1, height: 4, background: "var(--dm-row)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                background: goalProgress.monthProgress >= 80 ? "#4ADE80" : goalProgress.monthProgress >= 50 ? "#FCD34D" : "#F87171",
                width: `${goalProgress.monthProgress}%`,
              }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--dm-sub)", fontWeight: 900 }}>{goalProgress.perfectDaysThisMonth}/{goalProgress.daysInMonth}일</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 900 }}>👑 연간</div>
            <div style={{ flex: 1, height: 4, background: "var(--dm-row)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                background: goalProgress.yearProgress >= 80 ? "#4ADE80" : goalProgress.yearProgress >= 50 ? "#FCD34D" : "#F87171",
                width: `${goalProgress.yearProgress}%`,
              }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--dm-sub)", fontWeight: 900 }}>{goalProgress.yearProgress}%</div>
          </div>
        </div>
      </div>

      <div style={{ ...S.sectionTitle, display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 16 }}>
        <span>✅ 오늘 할일</span>
        <button onClick={editingTasks ? saveTaskEdits : startEditTasks}
          style={{ fontSize: 11, fontWeight: 900, color: editingTasks ? "#4ADE80" : "var(--dm-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}>
          {editingTasks ? "완료 ✓" : "✏️ 편집"}
        </button>
      </div>
      <div style={{ ...S.card, border: allDone && !editingTasks ? "1.5px solid #4ADE80" : "1.5px solid var(--dm-border)" }}>
        {editingTasks ? (
          <>
            {draftTasks.map((t, idx) => (
              <div key={t.id} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <input
                  style={{ ...S.input, flex: 1 }}
                  value={t.title}
                  onChange={(e) => setDraftTasks(prev => prev.map(x => x.id === t.id ? { ...x, title: e.target.value } : x))}
                  placeholder={`할 일 ${idx + 1}`}
                  maxLength={60}
                />
                <button onClick={() => setDraftTasks(prev => prev.filter(x => x.id !== t.id))}
                  style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer", flexShrink: 0 }}>✕</button>
              </div>
            ))}
            <button style={{ ...S.btn, marginTop: 4 }}
              onClick={() => setDraftTasks(prev => [...prev, { id: `t${Date.now()}`, title: "", done: false, checkedAt: null, priority: false }])}>
              ➕ 할 일 추가
            </button>
            {(() => {
              const yesterday = toDateStr(new Date(Date.now() - 86400000));
              const yData = plans[yesterday];
              const undone = (yData?.tasks || []).filter(t => t.title.trim() && !t.done);
              if (undone.length === 0) return null;
              return (
                <button style={{ ...S.btnGhost, marginTop: 6, fontSize: 12 }}
                  onClick={() => setDraftTasks(prev => {
                    const existing = new Set(prev.map(t => t.title.trim()));
                    const toAdd = undone.filter(t => !existing.has(t.title.trim()))
                      .map(t => ({ id: `t${Date.now()}_${t.id}`, title: t.title, done: false, checkedAt: null, priority: t.priority || false }));
                    return [...prev, ...toAdd];
                  })}>
                  ↩️ 어제 미완료 {undone.length}개 가져오기
                </button>
              );
            })()}
          </>
        ) : filledCount === 0 ? (
          <>
            <div style={{ color: "var(--dm-muted)", fontSize: 13, marginBottom: 14 }}>
              오늘 할 일을 아직 입력하지 않았어요
            </div>
            <button style={S.btn} onClick={startEditTasks}>할일 입력하기 →</button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: "var(--dm-sub)", fontWeight: 900 }}>{doneCount}/{filledCount} 완료</div>
              {allDone && <div style={{ fontSize: 12, color: "#4ADE80", fontWeight: 900 }}>🎉 모두 완료!</div>}
            </div>
            <div style={{ height: 6, background: "var(--dm-row)", borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
              <div style={{
                height: "100%", borderRadius: 3, transition: "width 0.3s",
                background: allDone ? "#4ADE80" : "#4B6FFF",
                width: `${(doneCount / filledCount) * 100}%`,
              }} />
            </div>
            {(todayData?.tasks || []).map((task, i) => {
              if (!task.title.trim()) return null;
              const isSwiped = swipedId === task.id;
              return (
                <div key={task.id} style={{ position: "relative", overflow: "hidden",
                  borderBottom: i < (todayData.tasks.length - 1) ? `1px solid var(--dm-row)` : "none" }}>
                  <button onClick={() => { onSetTodayTasks((todayData.tasks || []).filter(t => t.id !== task.id)); setSwipedId(null); }}
                    style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 70,
                      background: "#F87171", border: "none", color: "#fff", fontWeight: 900, cursor: "pointer", fontSize: 13 }}>
                    삭제
                  </button>
                  <div
                    onTouchStart={(e) => { swipeStartX.current = e.touches[0].clientX; }}
                    onTouchEnd={(e) => {
                      const dx = e.changedTouches[0].clientX - swipeStartX.current;
                      if (dx < -60) setSwipedId(task.id);
                      else if (dx > 10) setSwipedId(null);
                    }}
                    onClick={() => { if (isSwiped) { setSwipedId(null); return; } onToggleTask(task.id); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                      cursor: "pointer", background: "var(--dm-card)",
                      transform: isSwiped ? "translateX(-70px)" : "translateX(0)",
                      transition: "transform 0.2s" }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: task.done ? "none" : "2px solid #3A4260",
                      background: task.done ? "#4B6FFF" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {task.done && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 700, flex: 1,
                      color: task.done ? "var(--dm-muted)" : "var(--dm-text)",
                      textDecoration: task.done ? "line-through" : "none",
                    }}>{task.title}</div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div style={S.sectionTitle}>📋 언젠가 할일</div>
      <div style={S.card}>
        {someday.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--dm-muted)", marginBottom: 10 }}>언제 할지 모르지만 해야 할 일을 적어두세요.</div>
        )}
        {someday.map(item => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <button onClick={() => toggleSomeday(item.id)} style={{
              width: 22, height: 22, borderRadius: 6, border: `2px solid ${item.done ? "#4ADE80" : "var(--dm-border)"}`,
              background: item.done ? "#4ADE80" : "transparent", flexShrink: 0, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
            }}>{item.done ? "✓" : ""}</button>
            <div style={{ flex: 1, fontSize: 14, color: item.done ? "var(--dm-muted)" : "var(--dm-text)", textDecoration: item.done ? "line-through" : "none" }}>
              {item.title}
            </div>
            <button onClick={() => moveToToday(item)} title="오늘 할일로 이동" style={{
              background: "transparent", border: "1px solid #4B6FFF", borderRadius: 6,
              color: "#4B6FFF", fontSize: 10, fontWeight: 900, cursor: "pointer", padding: "3px 6px", flexShrink: 0,
            }}>오늘로↑</button>
            <button onClick={() => deleteSomeday(item.id)} style={{
              background: "transparent", border: "none", color: "#F87171", cursor: "pointer", fontSize: 16, flexShrink: 0, lineHeight: 1,
            }}>✕</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: someday.length > 0 ? 8 : 0 }}>
          <input
            style={{ ...S.input, flex: 1, marginBottom: 0 }}
            value={somedayInput}
            onChange={e => setSomedayInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addSomeday()}
            placeholder="언젠가 할 일 추가..."
            maxLength={60}
          />
          <button onClick={addSomeday} style={{ ...S.btn, width: 48, marginBottom: 0, flexShrink: 0 }}>➕</button>
        </div>
      </div>

      {habits.length > 0 && (() => {
        const habitChecks = todayData?.habitChecks || {};
        const doneHabits = habits.filter(h => habitChecks[h.id]).length;
        const allHabitsDone = doneHabits === habits.length;
        return (
          <>
            <div style={{ ...S.sectionTitle, display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 16 }}>
              <span>🎯 오늘 습관</span>
              <span style={{ fontSize: 11, color: allHabitsDone ? "#4ADE80" : "var(--dm-muted)", fontWeight: 900 }}>{doneHabits}/{habits.length}</span>
            </div>
            <div style={{ ...S.card, border: allHabitsDone ? "1.5px solid #4ADE80" : "1.5px solid var(--dm-border)" }}>
              <div style={{ height: 6, background: "var(--dm-row)", borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
                <div style={{
                  height: "100%", borderRadius: 3, transition: "width 0.3s",
                  background: allHabitsDone ? "#4ADE80" : "#A78BFA",
                  width: habits.length === 0 ? "0%" : `${(doneHabits / habits.length) * 100}%`,
                }} />
              </div>
              {habits.map((h, i) => {
                const checked = !!habitChecks[h.id];
                return (
                  <div key={h.id} onClick={() => onToggleHabit(h.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                      borderBottom: i < habits.length - 1 ? `1px solid var(--dm-row)` : "none",
                      cursor: "pointer" }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: checked ? "none" : "2px solid #3A4260",
                      background: checked ? "#A78BFA" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {checked && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{h.icon}</span>
                    <div style={{
                      fontSize: 14, fontWeight: 700, flex: 1,
                      color: checked ? "var(--dm-muted)" : "var(--dm-text)",
                      textDecoration: checked ? "line-through" : "none",
                    }}>{h.name || "(이름 없음)"}</div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      <div style={S.sectionTitle}>📅 이번주 일정</div>
      <div style={{ padding: "0 16px" }}>
        <WeeklySchedule plans={plans} habits={habits} onOpenDate={onOpenDate} />
      </div>

      <div style={{ height: 12 }} />
    </div>
  );
}
