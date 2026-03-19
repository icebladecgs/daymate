import { useEffect, useMemo, useRef, useState } from "react";
import { toDateStr, formatKoreanDate, getWeekDates } from "../utils/date.js";
import { store } from "../utils/storage.js";
import { getPermission } from "../utils/notification.js";
import { calcStreak, calcGoalProgress, calcDayScore, calcLevel } from "../data/stats.js";
import { gcalFetchWeekEvents } from "../api/gcal.js";
import S from "../styles.js";
import WeeklySchedule from "../components/WeeklySchedule.jsx";

export default function Home({ user, goals, todayData, plans, onToggleTask, goalChecks, onToggleGoal, onSetTodayTasks, onSaveMonthGoals, habits, setHabits, onToggleHabit, onOpenDate, onOpenDateMemo, installPrompt, handleInstall, showInstallBanner, dismissInstallBanner, isIOS, isKakao, isStandalone, scores, event, inviteBonus, onOpenChat, isDark, setIsDark, getValidGcalToken, myRank, onOpenStats, recurringTasks, setRecurringTasks, someday, setSomeday }) {
  const today = toDateStr();
  const doneCount = (todayData?.tasks || []).filter((t) => t.done && t.title.trim()).length;
  const filledCount = (todayData?.tasks || []).filter((t) => t.title.trim()).length;
  const allDone = filledCount > 0 && doneCount === filledCount;

  const streak = useMemo(() => calcStreak(plans), [plans]);
  const goalProgress = useMemo(() => calcGoalProgress(plans), [plans]);
  const todayScore = useMemo(() => calcDayScore(todayData, habits), [todayData, habits]);
  const totalScore = useMemo(() => Object.values(scores || {}).reduce((a, b) => a + b, 0) + todayScore + (inviteBonus || 0), [scores, todayScore, inviteBonus]);
  const levelInfo = useMemo(() => calcLevel(totalScore), [totalScore]);
  const monthScore = useMemo(() => {
    const prefix = toDateStr().slice(0, 7);
    return Object.entries(scores || {}).filter(([ds]) => ds.startsWith(prefix)).reduce((a, [, v]) => a + v, 0) + todayScore;
  }, [scores, todayScore]);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [somedayInput, setSomedayInput] = useState("");
  const saveSomeday = (next) => setSomeday(next);
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

  const [gcalWeekEvents, setGcalWeekEvents] = useState({});
  useEffect(() => {
    const token = getValidGcalToken?.();
    if (!token) return;
    gcalFetchWeekEvents(token, getWeekDates()).then(setGcalWeekEvents).catch(() => {});
  }, []); // eslint-disable-line

  const [editingHabits, setEditingHabits] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState(false);
  const [editingTasks, setEditingTasks] = useState(false);
  const [draftTasks, setDraftTasks] = useState([]);
  const [editingGoals, setEditingGoals] = useState(false);
  const [draftGoals, setDraftGoals] = useState([]);
  const [newGoalInput, setNewGoalInput] = useState('');
  const [prevAllDone, setPrevAllDone] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [goalsExpanded, setGoalsExpanded] = useState(false);
  const [swipedId, setSwipedId] = useState(null);
  const [checkedId, setCheckedId] = useState(null);
  const swipeStartX = useRef(0);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [shortcutTipDismissed, setShortcutTipDismissed] = useState(() => store.get('dm_shortcut_tip_dismissed', false));

  useEffect(() => {
    if (allDone && !prevAllDone) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2500);
    }
    setPrevAllDone(allDone);
  }, [allDone]);

  const fetchAiSuggestions = async () => {
    setAiLoading(true);
    setAiSuggestions([]);
    try {
      const recentTasks = Object.entries(plans || {})
        .filter(([ds]) => ds < toDateStr())
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 7)
        .flatMap(([, d]) => (d.tasks || []).filter(t => t.title?.trim()).map(t => t.title));
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '오늘 할 일 3가지만 추천해줘. 최근 패턴 참고해서 간결하게. 반드시 set_tasks 액션으로만 응답해.',
          history: [],
          context: { tasks: todayData?.tasks || [], habits: habits || [], habitChecks: todayData?.habitChecks || {}, scores: {}, userName: user?.name || '사용자', recentTasks },
        }),
      });
      const data = await res.json();
      const setTasksAction = data.actions?.find(a => a.type === 'set_tasks');
      if (setTasksAction?.titles?.length) setAiSuggestions(setTasksAction.titles.slice(0, 3));
    } catch {}
    finally { setAiLoading(false); }
  };

  const addAiSuggestion = (title) => {
    const tasks = [...(todayData?.tasks || [])];
    const emptyIdx = tasks.findIndex(t => !t.title?.trim());
    const newTask = { id: `t${Date.now()}`, title, done: false, checkedAt: null, priority: false };
    if (emptyIdx >= 0) tasks[emptyIdx] = newTask;
    else tasks.push(newTask);
    onSetTodayTasks(tasks);
    setAiSuggestions(prev => prev.filter(s => s !== title));
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setIsDark?.(d => !d)} style={{ ...S.btnGhost, marginTop: 0, width: 36, height: 36, padding: 0, borderRadius: '50%', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <button onClick={onOpenChat} style={{ ...S.btnGhost, marginTop: 0, width: 40, height: 40, padding: 0, borderRadius: '50%', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✦
          </button>
        </div>
      </div>

      {showInstallBanner && (
        <div style={{ margin: "0 0 12px 0", borderRadius: 14, background: "var(--dm-card)", border: "1.5px solid #4B6FFF", padding: "12px 14px", boxShadow: "0 2px 12px rgba(75,111,255,.2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 22 }}>📲</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>홈 화면에 설치하기</div>
              <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 1 }}>앱처럼 빠르게 실행돼요</div>
            </div>
            <button onClick={dismissInstallBanner} style={{ background: "transparent", border: "none", color: "var(--dm-muted)", fontSize: 16, cursor: "pointer", padding: 4, lineHeight: 1 }}>✕</button>
          </div>
          {isKakao ? (
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--dm-bg)", fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, color: "var(--dm-text)", marginBottom: 4 }}>카카오톡에서는 설치가 안 돼요 😢</div>
              {isIOS
                ? <>1️⃣ 우측 하단 <b style={{color:"var(--dm-text)"}}>⋯</b> → <b style={{color:"var(--dm-text)"}}>Safari로 열기</b><br/>2️⃣ 하단 <b style={{color:"var(--dm-text)"}}>공유(□↑)</b> → <b style={{color:"var(--dm-text)"}}>홈 화면에 추가</b></>
                : <>1️⃣ 우측 상단 <b style={{color:"var(--dm-text)"}}>⋯</b> → <b style={{color:"var(--dm-text)"}}>다른 브라우저로 열기</b> → Chrome 선택<br/>2️⃣ Chrome에서 <b style={{color:"var(--dm-text)"}}>설치하기</b> 버튼 탭</>
              }
            </div>
          ) : installPrompt ? (
            <button onClick={handleInstall} style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>설치하기</button>
          ) : (
            <div style={{ padding: "8px 10px", borderRadius: 8, background: "var(--dm-bg)", fontSize: 12, color: "var(--dm-sub)", lineHeight: 2 }}>
              {isIOS ? <>1️⃣ 하단 <b style={{color:"var(--dm-text)"}}>공유(□↑)</b> 버튼 → 2️⃣ <b style={{color:"var(--dm-text)"}}>홈 화면에 추가</b> → 3️⃣ <b style={{color:"var(--dm-text)"}}>추가</b></> : <>Chrome <b style={{color:"var(--dm-text)"}}>⋮ 메뉴</b> → <b style={{color:"var(--dm-text)"}}>앱 설치</b> 또는 <b style={{color:"var(--dm-text)"}}>홈 화면에 추가</b></>}
            </div>
          )}
        </div>
      )}

      {(() => {
        const today = toDateStr();
        if (!event?.active || !event?.name || !event?.startDate || !event?.endDate) return null;
        if (today < event.startDate || today > event.endDate) return null;
        const daysLeft = Math.ceil((new Date(event.endDate + 'T23:59:59') - new Date()) / 86400000);
        return (
          <div style={{ margin: "0 0 12px", borderRadius: 14, background: "linear-gradient(135deg,rgba(252,211,77,.12),rgba(251,146,60,.08))", border: "1.5px solid rgba(252,211,77,.4)", padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 24 }}>🏆</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>{event.name}</div>
                <div style={{ fontSize: 11, color: "#FCD34D", marginTop: 2, fontWeight: 700 }}>
                  {daysLeft > 0 ? `D-${daysLeft} · ${event.endDate} 마감` : '오늘 마감!'}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ ...S.card, margin: "0 16px 10px", background: "linear-gradient(135deg,rgba(75,111,255,.15),rgba(108,142,255,.07))", border: "1.5px solid rgba(108,142,255,.35)", padding: "16px" }}>
        {/* 상단: 레벨 아이콘 + 이름 + 번호 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 32 }}>{levelInfo.icon}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "var(--dm-text)", lineHeight: 1.2 }}>{levelInfo.title}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#6C8EFF" }}>Lv.{levelInfo.level}</div>
            </div>
          </div>
          {myRank && (
            <button onClick={onOpenStats} style={{ background: "rgba(75,111,255,.15)", border: "1px solid rgba(108,142,255,.4)", borderRadius: 20, padding: "5px 12px", cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 1 }}>전체 순위</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#6C8EFF" }}>🏆 {myRank.rank}위</div>
              <div style={{ fontSize: 10, color: "var(--dm-muted)" }}>{myRank.total}명 중</div>
            </button>
          )}
        </div>
        {/* 중앙: 총 XP 크게 */}
        <div style={{ textAlign: "center", margin: "4px 0 12px" }}>
          <span style={{ fontSize: 34, fontWeight: 900, color: "var(--dm-text)", letterSpacing: -1 }}>{totalScore.toLocaleString()}</span>
          <span style={{ fontSize: 14, color: "#6C8EFF", fontWeight: 700, marginLeft: 4 }}>XP</span>
        </div>
        {/* 진행바 */}
        <div style={{ height: 7, background: "var(--dm-row)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
          <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#4B6FFF,#6C8EFF)", width: `${levelInfo.progress}%`, transition: "width 0.4s" }} />
        </div>
        {/* 하단 요약 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>
            {streak > 0 && <span style={{ color: "#F97316", fontWeight: 900 }}>🔥 {streak}일 연속 · </span>}
            다음 레벨까지 {(levelInfo.nextFloor - totalScore).toLocaleString()} XP
          </span>
          <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>오늘 +{todayScore}pt · 이달 {monthScore}pt</span>
        </div>
      </div>

      {/* 바로가기 팁 (PWA 설치된 경우 1회만) */}
      {isStandalone && !shortcutTipDismissed && (
        <div style={{ margin: "0 16px 10px", borderRadius: 12, background: "var(--dm-card)", border: "1px solid var(--dm-border)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>💡</span>
          <span style={{ flex: 1, fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.5 }}>홈 화면 아이콘을 <b style={{ color: "var(--dm-text)" }}>꾹 누르면</b> 오늘 할 일 바로가기가 있어요!</span>
          <button onClick={() => { setShortcutTipDismissed(true); store.set('dm_shortcut_tip_dismissed', true); }}
            style={{ background: "transparent", border: "none", color: "var(--dm-muted)", fontSize: 16, cursor: "pointer", padding: 4 }}>✕</button>
        </div>
      )}

      <div style={{ ...S.sectionTitle, justifyContent: "space-between", paddingRight: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>✅</span>오늘 할일</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={fetchAiSuggestions} disabled={aiLoading}
            style={{ fontSize: 11, fontWeight: 900, color: "#A78BFA", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}>
            {aiLoading ? "..." : "✨ AI 추천"}
          </button>
          <button onClick={editingTasks ? saveTaskEdits : startEditTasks}
            style={{ fontSize: 11, fontWeight: 900, color: editingTasks ? "#4ADE80" : "var(--dm-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}>
            {editingTasks ? "완료 ✓" : "✏️ 편집"}
          </button>
        </div>
      </div>
      {aiSuggestions.length > 0 && (
        <div style={{ margin: "0 16px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
          {aiSuggestions.map((s, i) => (
            <button key={i} onClick={() => addAiSuggestion(s)}
              style={{ textAlign: "left", padding: "9px 14px", borderRadius: 10, border: "1px dashed #A78BFA", background: "rgba(167,139,250,.08)", color: "var(--dm-text)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#A78BFA", fontWeight: 900 }}>+</span> {s}
            </button>
          ))}
          <button onClick={() => setAiSuggestions([])}
            style={{ fontSize: 11, color: "var(--dm-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 0" }}>닫기</button>
        </div>
      )}
      <div style={{ ...S.card, border: allDone && !editingTasks ? "1.5px solid #4ADE80" : "1.5px solid var(--dm-border)" }}>
        {editingTasks ? (
          <>
            {draftTasks.map((t, idx) => (
              <div key={t.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    style={{ ...S.input, flex: 1, marginBottom: 0 }}
                    value={t.title}
                    onChange={(e) => setDraftTasks(prev => prev.map(x => x.id === t.id ? { ...x, title: e.target.value } : x))}
                    placeholder={`할 일 ${idx + 1}`}
                    maxLength={60}
                  />
                  <button onClick={() => setDraftTasks(prev => prev.filter(x => x.id !== t.id))}
                    style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer", flexShrink: 0 }}>✕</button>
                </div>
                {t.title?.trim() && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 13, color: t.time ? '#6C8EFF' : 'var(--dm-muted)' }}>⏰</span>
                    <input type="time" value={t.time || ''}
                      onChange={e => setDraftTasks(prev => prev.map(x => x.id === t.id ? { ...x, time: e.target.value || undefined } : x))}
                      style={{ ...S.input, width: 110, padding: '4px 8px', fontSize: 12, marginBottom: 0 }} />
                    {t.time && (
                      <button onClick={() => setDraftTasks(prev => prev.map(x => x.id === t.id ? { ...x, time: undefined } : x))}
                        style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 13 }}>✕</button>
                    )}
                  </div>
                )}
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
              {allDone
                ? <div style={{ fontSize: 12, color: "#4ADE80", fontWeight: 900 }}>🎉 모두 완료!</div>
                : <div style={{ fontSize: 10, color: "var(--dm-muted)" }}>← 밀면 이동/삭제</div>
              }
            </div>
            <div style={{ height: 6, background: "var(--dm-row)", borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
              <div style={{
                height: "100%", borderRadius: 3, transition: "width 0.3s",
                background: allDone ? "#4ADE80" : "#4B6FFF",
                width: `${(doneCount / filledCount) * 100}%`,
              }} />
            </div>
            {[...(todayData?.tasks || [])].sort((a,b) => (b.priority?1:0)-(a.priority?1:0)).map((task, i, arr) => {
              if (!task.title.trim()) return null;
              const isSwiped = swipedId === task.id;
              const isChecked = checkedId === task.id;
              return (
                <div key={task.id} style={{ position: "relative", overflow: "hidden",
                  borderBottom: i < arr.length - 1 ? `1px solid var(--dm-row)` : "none" }}>
                  <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 140, display: "flex" }}>
                    <button onClick={() => {
                      const item = (todayData?.tasks || []).find(t => t.id === task.id);
                      if (item?.title?.trim()) {
                        setSomeday(prev => [...(prev || []), { id: `sd${Date.now()}`, title: item.title.trim(), done: false }]);
                        onSetTodayTasks((todayData.tasks || []).filter(t => t.id !== task.id));
                      }
                      setSwipedId(null);
                    }} style={{ flex: 1, background: "#6C8EFF", border: "none", color: "#fff", fontWeight: 900, cursor: "pointer", fontSize: 11, lineHeight: 1.3 }}>
                      언젠가<br/>할일
                    </button>
                    <button onClick={() => { onSetTodayTasks((todayData.tasks || []).filter(t => t.id !== task.id)); setSwipedId(null); }}
                      style={{ flex: 1, background: "#F87171", border: "none", color: "#fff", fontWeight: 900, cursor: "pointer", fontSize: 13 }}>
                      삭제
                    </button>
                  </div>
                  <div
                    onTouchStart={(e) => { swipeStartX.current = e.touches[0].clientX; }}
                    onTouchEnd={(e) => {
                      const dx = e.changedTouches[0].clientX - swipeStartX.current;
                      if (dx < -60) setSwipedId(task.id);
                      else if (dx > 10) setSwipedId(null);
                    }}
                    onClick={() => {
                      if (isSwiped) { setSwipedId(null); return; }
                      if (!task.done) { setCheckedId(task.id); setTimeout(() => setCheckedId(null), 400); }
                      onToggleTask(task.id);
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                      cursor: "pointer", background: "var(--dm-card)",
                      transform: isSwiped ? "translateX(-140px)" : "translateX(0)",
                      transition: "transform 0.2s" }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: task.done ? "none" : "2px solid #3A4260",
                      background: task.done ? "#4B6FFF" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transform: isChecked ? "scale(1.4)" : "scale(1)",
                      transition: "transform 0.2s, background 0.2s",
                    }}>
                      {task.done && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 700, flex: 1,
                      color: task.done ? "var(--dm-muted)" : "var(--dm-text)",
                      textDecoration: task.done ? "line-through" : "none",
                    }}>{task.priority ? '⭐ ' : ''}{task.title}</div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div style={S.sectionTitle}><span style={S.sectionEmoji}>📋</span>언젠가 할일</div>
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

      <div
        onClick={() => { if (!editingGoals) setGoalsExpanded(v => !v); }}
        style={{ ...S.sectionTitle, justifyContent: "space-between", paddingRight: 16, cursor: "pointer", userSelect: "none" }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={S.sectionEmoji}>🎯</span>이달 목표
          <span style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>
            {goalsExpanded ? "▾" : "▸"}
          </span>
          {!goalsExpanded && (() => {
            const mg = goals.month || [];
            const dg = mg.filter((_, i) => goalChecks[i]).length;
            return mg.length > 0
              ? <span style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>{dg}/{mg.length} 달성</span>
              : <span style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>탭하여 펼치기</span>;
          })()}
        </span>
        {goalsExpanded && (
          <button onClick={e => { e.stopPropagation(); editingGoals ? saveGoalEdits() : startEditGoals(); }}
            style={{ fontSize: 11, fontWeight: 900, color: editingGoals ? "#4ADE80" : "var(--dm-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}>
            {editingGoals ? "완료 ✓" : "✏️ 편집"}
          </button>
        )}
      </div>
      {(goalsExpanded || editingGoals) && <div style={S.card}>
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
      </div>}

      {(editingHabits || habits.length > 0) && (() => {
        const habitChecks = todayData?.habitChecks || {};
        const doneHabits = habits.filter(h => habitChecks[h.id]).length;
        const allHabitsDone = habits.length > 0 && doneHabits === habits.length;
        return (
          <>
            <div style={{ ...S.sectionTitle, justifyContent: "space-between", paddingRight: 16 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>🎯</span>오늘 습관</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: allHabitsDone ? "#4ADE80" : "var(--dm-muted)", fontWeight: 900 }}>{doneHabits}/{habits.length}</span>
                <button onClick={() => setEditingHabits(v => !v)}
                  style={{ fontSize: 11, fontWeight: 900, color: editingHabits ? "#4ADE80" : "var(--dm-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}>
                  {editingHabits ? "완료 ✓" : "⚙️ 편집"}
                </button>
              </div>
            </div>
            <div style={{ ...S.card, border: allHabitsDone && !editingHabits ? "1.5px solid #4ADE80" : "1.5px solid var(--dm-border)" }}>
              {editingHabits ? (
                <>
                  {(habits || []).map(h => (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <input style={{ ...S.input, width: 48, textAlign: 'center', marginBottom: 0, padding: '8px 4px' }}
                        value={h.icon} maxLength={2} placeholder="🎯"
                        onChange={e => setHabits(prev => prev.map(x => x.id === h.id ? { ...x, icon: e.target.value } : x))} />
                      <input style={{ ...S.input, flex: 1, marginBottom: 0 }}
                        value={h.name} maxLength={20} placeholder="습관 이름"
                        onChange={e => setHabits(prev => prev.map(x => x.id === h.id ? { ...x, name: e.target.value } : x))} />
                      <button onClick={() => setHabits(prev => prev.filter(x => x.id !== h.id))}
                        style={{ background: 'transparent', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 20, flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                  {(habits || []).length < 10 && (
                    <button style={{ ...S.btn, marginTop: (habits||[]).length > 0 ? 4 : 0 }}
                      onClick={() => setHabits(prev => [...prev, { id: `h${Date.now()}`, name: '', icon: '🎯' }])}>
                      ➕ 습관 추가
                    </button>
                  )}
                  {(habits || []).length === 0 && <div style={{ fontSize: 12, color: 'var(--dm-muted)' }}>아직 등록된 습관이 없어요.</div>}
                </>
              ) : (
                <>
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
                      <div key={h.id} onClick={() => { navigator.vibrate?.(50); onToggleHabit(h.id); }}
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
                </>
              )}
            </div>
          </>
        );
      })()}

      {/* 반복 할일 관리 */}
      {(editingRecurring || (recurringTasks && recurringTasks.length > 0)) && (
        <div style={{ ...S.sectionTitle, justifyContent: 'space-between', paddingRight: 16 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>🔁</span>반복 할일</span>
          <button onClick={() => setEditingRecurring(v => !v)}
            style={{ fontSize: 11, fontWeight: 900, color: editingRecurring ? '#4ADE80' : 'var(--dm-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
            {editingRecurring ? '완료 ✓' : '⚙️ 편집'}
          </button>
        </div>
      )}
      {editingRecurring && (
        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--dm-sub)', marginBottom: 10 }}>매일 또는 특정 요일에 자동으로 추가되는 할일이에요.</div>
          {(recurringTasks || []).map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <select value={t.days}
                onChange={e => setRecurringTasks(prev => prev.map(x => x.id === t.id ? {...x, days: e.target.value} : x))}
                style={{ ...S.input, width: 80, marginBottom: 0, padding: '8px 6px', fontSize: 12 }}>
                <option value="daily">매일</option>
                <option value="1">월</option><option value="2">화</option><option value="3">수</option>
                <option value="4">목</option><option value="5">금</option>
                <option value="6">토</option><option value="0">일</option>
              </select>
              <input style={{ ...S.input, flex: 1, marginBottom: 0 }}
                value={t.title} maxLength={40} placeholder="반복 할일 이름"
                onChange={e => setRecurringTasks(prev => prev.map(x => x.id === t.id ? {...x, title: e.target.value} : x))} />
              <button onClick={() => setRecurringTasks(prev => prev.filter(x => x.id !== t.id))}
                style={{ background: 'transparent', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 20, flexShrink: 0 }}>✕</button>
            </div>
          ))}
          {(recurringTasks || []).length < 10 && (
            <button style={{ ...S.btn, marginTop: (recurringTasks||[]).length > 0 ? 4 : 0 }}
              onClick={() => setRecurringTasks(prev => [...prev, { id: `r${Date.now()}`, title: '', days: 'daily' }])}>
              ➕ 반복 할일 추가
            </button>
          )}
          {(recurringTasks || []).length === 0 && <div style={{ fontSize: 12, color: 'var(--dm-muted)' }}>아직 등록된 반복 할일이 없어요.</div>}
        </div>
      )}

      <div style={{ ...S.sectionTitle, justifyContent: 'space-between', paddingRight: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={S.sectionEmoji}>📅</span>이번주 일정</span>
        {getValidGcalToken?.() && (
          <button onClick={() => {
            const token = getValidGcalToken();
            if (!token) return;
            gcalFetchWeekEvents(token, getWeekDates()).then(setGcalWeekEvents).catch(() => {});
          }} style={{ fontSize: 11, color: 'var(--dm-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
            🔄 캘린더 동기화
          </button>
        )}
      </div>
      <div style={{ padding: "0 16px" }}>
        <WeeklySchedule plans={plans} habits={habits} onOpenDate={onOpenDate} gcalEvents={gcalWeekEvents} />
      </div>

      <div style={{ height: 12 }} />
    </div>
  );
}
