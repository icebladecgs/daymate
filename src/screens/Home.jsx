import { useEffect, useMemo, useRef, useState } from "react";
import { toDateStr, formatKoreanDate, getWeekDates } from "../utils/date.js";
import { store } from "../utils/storage.js";
import { getPermission } from "../utils/notification.js";
import { calcStreak, calcGoalProgress, calcDayScore, calcLevel } from "../data/stats.js";
import { gcalFetchWeekEvents } from "../api/gcal.js";
import { playSound } from "../utils/sound.js";
import S from "../styles.js";
import WeeklySchedule from "../components/WeeklySchedule.jsx";

export default function Home({ user, goals, todayData, plans, onToggleTask, goalChecks, onToggleGoal, onSetTodayTasks, onSaveMonthGoals, habits, setHabits, onToggleHabit, onOpenDate, onOpenDateMemo, installPrompt, handleInstall, showInstallBanner, dismissInstallBanner, isIOS, isKakao, isStandalone, scores, event, inviteBonus, onOpenChat, isDark, setIsDark, getValidGcalToken, myRank, onOpenStats, recurringTasks, setRecurringTasks, someday, setSomeday, onLuckyXp, lifeGoals = [], setLifeGoals, onOpenSettings, levelUpInfo, onDismissLevelUp, communityEventsToday = [], communityEventChecks = {}, onToggleCommunityEvent }) {
  const today = toDateStr();
  const doneCount = (todayData?.tasks || []).filter((t) => t.done && t.title.trim()).length;
  const filledCount = (todayData?.tasks || []).filter((t) => t.title.trim()).length;
  const allDone = filledCount > 0 && doneCount === filledCount;

  // ── 포커스 모드 / 타이머 챌린지 ─────────────────────────────
  const TIMER_OPTIONS = [
    { label: '5분', sec: 5 * 60, xp: 5 },
    { label: '15분', sec: 15 * 60, xp: 15 },
    { label: '25분', sec: 25 * 60, xp: 30 },
    { label: '50분', sec: 50 * 60, xp: 70 },
  ];
  const [focusTask, setFocusTask] = useState(null);
  const [focusTimerIdx, setFocusTimerIdx] = useState(2); // 기본 25분
  const [focusSec, setFocusSec] = useState(TIMER_OPTIONS[2].sec);
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusDone, setFocusDone] = useState(false);
  const focusInterval = useRef(null);
  const POMODORO_SEC = TIMER_OPTIONS[focusTimerIdx].sec;

  useEffect(() => {
    if (focusRunning && focusSec > 0) {
      focusInterval.current = setInterval(() => setFocusSec(s => s - 1), 1000);
    } else if (focusSec === 0 && focusRunning) {
      setFocusRunning(false);
      setFocusDone(true);
      // 완료 효과음 (3번 울림)
      [0, 300, 600].forEach(d => setTimeout(() => playSound(880, 400), d));
    }
    return () => clearInterval(focusInterval.current);
  }, [focusRunning, focusSec]);

  const startFocus = (task) => {
    setFocusTask(task);
    setFocusSec(TIMER_OPTIONS[focusTimerIdx].sec);
    setFocusRunning(false);
    setFocusDone(false);
  };
  const closeFocus = () => {
    clearInterval(focusInterval.current);
    setFocusTask(null);
    setFocusRunning(false);
    setFocusDone(false);
    setFocusSec(TIMER_OPTIONS[focusTimerIdx].sec);
  };
  const focusMin = String(Math.floor(focusSec / 60)).padStart(2, "0");
  const focusSs  = String(focusSec % 60).padStart(2, "0");
  const focusPct = ((POMODORO_SEC - focusSec) / POMODORO_SEC) * 100;

  const streak = useMemo(() => calcStreak(plans), [plans]);
  const goalProgress = useMemo(() => calcGoalProgress(plans), [plans]);
  const todayScore = useMemo(() => calcDayScore(todayData, habits), [todayData, habits]);
  const totalScore = useMemo(() => Object.values(scores || {}).reduce((a, b) => a + b, 0) + todayScore + (inviteBonus || 0), [scores, todayScore, inviteBonus]);
  const levelInfo = useMemo(() => calcLevel(totalScore), [totalScore]);
  const monthScore = useMemo(() => {
    const prefix = toDateStr().slice(0, 7);
    return Object.entries(scores || {}).filter(([ds]) => ds.startsWith(prefix)).reduce((a, [, v]) => a + v, 0) + todayScore;
  }, [scores, todayScore]);
  // 오늘 운세 점수 (캐시에서 읽기)
  const todayFortuneScore = (() => {
    try {
      const cached = store.get(`dm_fortune_${today}`, null);
      return cached?.overall ?? null;
    } catch { return null; }
  })();

  // ── 운세 ────────────────────────────────────────────────────
  const [fortuneOpen, setFortuneOpen] = useState(false);
  const [fortuneModalOpen, setFortuneModalOpen] = useState(false);
  const [fortuneTab, setFortuneTab] = useState('daily'); // daily | saju | tojeong
  const [fortuneData, setFortuneData] = useState(null);
  const [fortuneLoading, setFortuneLoading] = useState(false);

  // 로또 번호
  const lottoKey = `dm_lotto_${today}`;
  const [lottoNums, setLottoNums] = useState(() => store.get(lottoKey, null));
  const [lottoAnim, setLottoAnim] = useState(false);
  const drawLotto = () => {
    if (lottoNums) return;
    setLottoAnim(true);
    setTimeout(() => {
      const pool = Array.from({ length: 45 }, (_, i) => i + 1);
      const picked = [];
      while (picked.length < 6) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(idx, 1)[0]);
      }
      picked.sort((a, b) => a - b);
      store.set(lottoKey, picked);
      setLottoNums(picked);
      setLottoAnim(false);
    }, 900);
  };
  const [sajuData, setSajuData] = useState(() => store.get('dm_saju_result', null));
  const [tojeongData, setTojeongData] = useState(() => store.get('dm_tojeong_result', null));

  const birthDate = store.get('dm_birth_date', '');
  const birthTime = store.get('dm_birth_time', '');

  const todayStr = toDateStr();
  const fortuneCacheKey = `dm_fortune_${todayStr}`;

  const loadFortune = async () => {
    if (!birthDate) return;
    const cached = store.get(fortuneCacheKey, null);
    if (cached) { setFortuneData(cached); return; }
    setFortuneLoading(true);
    try {
      const res = await fetch('/api/chat?action=fortune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthDate, birthTime, userName: user?.name || '사용자', today: todayStr }),
      });
      const data = await res.json();
      store.set(fortuneCacheKey, data);
      setFortuneData(data);
    } catch {}
    setFortuneLoading(false);
  };

  const loadSaju = async () => {
    if (!birthDate) return;
    setFortuneLoading(true);
    try {
      const res = await fetch('/api/chat?action=saju', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthDate, birthTime, userName: user?.name || '사용자' }),
      });
      const data = await res.json();
      store.set('dm_saju_result', data);
      setSajuData(data);
    } catch {}
    setFortuneLoading(false);
  };

  const loadTojeong = async () => {
    if (!birthDate) return;
    setFortuneLoading(true);
    try {
      const year = new Date().getFullYear();
      const res = await fetch('/api/chat?action=tojeong', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthDate, birthTime, userName: user?.name || '사용자', year }),
      });
      const data = await res.json();
      store.set('dm_tojeong_result', data);
      setTojeongData(data);
    } catch {}
    setFortuneLoading(false);
  };

  const starRating = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);


  // ── 오늘의 명언 ──────────────────────────────────────────────
  const QUOTES = [
    { text: "작은 행동이 큰 꿈을 만든다.", author: "마틴 루터 킹" },
    { text: "오늘 할 수 있는 일을 내일로 미루지 말라.", author: "벤자민 프랭클린" },
    { text: "성공은 준비된 자에게 기회가 왔을 때 만들어진다.", author: "세네카" },
    { text: "천 리 길도 한 걸음부터.", author: "노자" },
    { text: "당신이 할 수 있다고 생각하든, 없다고 생각하든, 당신이 옳다.", author: "헨리 포드" },
    { text: "인생은 자전거 타기와 같다. 균형을 유지하려면 계속 움직여야 한다.", author: "알버트 아인슈타인" },
    { text: "실패는 포기할 때 일어난다. 그 전까지는 그저 과정이다.", author: "익명" },
    { text: "지금 이 순간이 당신이 가진 전부다. 최선을 다하라.", author: "오프라 윈프리" },
    { text: "규율 있는 삶이 자유로운 삶을 만든다.", author: "익명" },
    { text: "한 번에 한 걸음씩. 그것이 산을 오르는 유일한 방법이다.", author: "익명" },
    { text: "당신의 시간은 한정되어 있다. 다른 사람의 삶을 사느라 낭비하지 말라.", author: "스티브 잡스" },
    { text: "성공한 사람이 되려 하기보다 가치 있는 사람이 되려 하라.", author: "알버트 아인슈타인" },
    { text: "어제의 나보다 나은 오늘의 내가 되어라.", author: "익명" },
    { text: "부자가 되는 가장 빠른 길은 천천히 꾸준히 가는 것이다.", author: "워런 버핏" },
    { text: "투자의 핵심은 손실을 피하는 것이다.", author: "워런 버핏" },
    { text: "미래를 예측하는 가장 좋은 방법은 미래를 만드는 것이다.", author: "피터 드러커" },
    { text: "건강이 최고의 재산이다.", author: "랄프 왈도 에머슨" },
    { text: "시스템을 만들어라. 그 시스템이 당신 대신 일하게 하라.", author: "익명" },
    { text: "습관은 제2의 천성이다.", author: "키케로" },
    { text: "작은 습관들이 모여 인생을 바꾼다.", author: "제임스 클리어" },
    { text: "당신이 집중하는 것이 성장한다.", author: "익명" },
    { text: "가족이 있는 한 실패는 없다.", author: "익명" },
  ];
  const todayQuote = useMemo(() => {
    const idx = Math.floor(new Date(todayStr).getTime() / 86400000) % QUOTES.length;
    return QUOTES[idx];
  }, [todayStr]); // eslint-disable-line

  // ── 인생 목표 ────────────────────────────────────────────────
  const [lifeGoalOpen, setLifeGoalOpen] = useState(false);
  const [expandedGoalIds, setExpandedGoalIds] = useState({});
  const toggleGoalExpand = (id) => setExpandedGoalIds(prev => ({ ...prev, [id]: !prev[id] }));
  const [lgForm, setLgForm] = useState(null); // null | { id?, title, deadline, emoji, actions }
  const [lgActionInput, setLgActionInput] = useState('');

  const daysLeft = (deadline) => {
    if (!deadline) return null;
    const diff = Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const saveLgForm = () => {
    if (!lgForm?.title?.trim()) return;
    const goal = {
      id: lgForm.id || `lg_${Date.now()}`,
      title: lgForm.title.trim(),
      deadline: lgForm.deadline || '',
      emoji: lgForm.emoji || '🎯',
      actions: lgForm.actions || [],
    };
    setLifeGoals(prev =>
      lgForm.id ? prev.map(g => g.id === lgForm.id ? goal : g) : [...prev, goal]
    );
    setLgForm(null);
    setLgActionInput('');
  };

  const addLgAction = () => {
    if (!lgActionInput.trim()) return;
    setLgForm(prev => ({ ...prev, actions: [...(prev.actions || []), { id: `la_${Date.now()}`, title: lgActionInput.trim() }] }));
    setLgActionInput('');
  };

  const addTaskFromAction = (actionTitle) => {
    const newTask = { id: `t${Date.now()}`, title: actionTitle, done: false, checkedAt: null, priority: false };
    onSetTodayTasks(prev => {
      const all = [...(prev || [])];
      const emptyIdx = all.findIndex(t => !t.title?.trim());
      if (emptyIdx >= 0) all[emptyIdx] = newTask;
      else all.push(newTask);
      return all;
    });
  };

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
  const [checkedId, setCheckedId] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [shortcutTipDismissed, setShortcutTipDismissed] = useState(() => store.get('dm_shortcut_tip_dismissed', false));
  const [xpHelpOpen, setXpHelpOpen] = useState(false);

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
    setGoalsExpanded(true);
  };
  const saveGoalEdits = () => {
    const final = [...draftGoals, ...(newGoalInput.trim() ? [newGoalInput.trim()] : [])].filter(g => g.trim());
    onSaveMonthGoals(final);
    setNewGoalInput('');
    setEditingGoals(false);
  };

  return (
    <div style={S.content}>
      {/* ── 레벨업 모달 ─────────────────────────────────────── */}
      {levelUpInfo && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={onDismissLevelUp}>
          <div style={{ background: "var(--dm-card)", border: "1.5px solid rgba(108,142,255,.5)", borderRadius: 28, padding: "40px 32px", textAlign: "center", minWidth: 260, maxWidth: 320, position: "relative" }}
            onClick={e => e.stopPropagation()}>
            {/* 배경 빛 효과 */}
            <div style={{ position: "absolute", inset: 0, borderRadius: 28, background: "radial-gradient(circle at 50% 30%, rgba(108,142,255,.15), transparent 70%)", pointerEvents: "none" }} />
            <div style={{ fontSize: 64, marginBottom: 8, filter: "drop-shadow(0 0 16px rgba(252,211,77,.6))" }}>{levelUpInfo.icon}</div>
            <div style={{ fontSize: 13, color: "#6C8EFF", fontWeight: 900, letterSpacing: 2, marginBottom: 4 }}>LEVEL UP!</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "var(--dm-text)", marginBottom: 4 }}>Lv.{levelUpInfo.level}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#FCD34D", marginBottom: 16 }}>{levelUpInfo.title}</div>
            {levelUpInfo.badge && (
              <div style={{ background: "linear-gradient(135deg, rgba(252,211,77,.2), rgba(108,142,255,.2))", border: "1px solid rgba(252,211,77,.4)", borderRadius: 14, padding: "10px 20px", marginBottom: 16, display: "inline-block" }}>
                <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 4 }}>🏅 뱃지 획득</div>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{levelUpInfo.badge.icon} {levelUpInfo.badge.label}</div>
              </div>
            )}
            <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.6, marginBottom: 20 }}>
              꾸준한 실천이 당신을<br />한 단계 성장시켰어요 🎉
            </div>
            <button onClick={onDismissLevelUp}
              style={{ ...S.btn, width: "auto", padding: "12px 32px", fontSize: 15 }}>확인</button>
          </div>
        </div>
      )}

      {/* ── 오늘의 운 모달 ───────────────────────────────────── */}
      {/* ── 운세 팝업 모달 ──────────────────────────────────── */}
      {fortuneModalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setFortuneModalOpen(false)}>
          <div style={{ background: "var(--dm-card)", border: "1px solid rgba(255,255,255,.1)", borderRadius: "24px 24px 0 0", padding: "20px 16px 24px", width: "100%", maxHeight: "calc(90vh - 84px)", marginBottom: 84, overflowY: "auto" }}
            onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 900 }}>🔮 오늘의 운세</div>
              <button onClick={() => setFortuneModalOpen(false)}
                style={{ background: "none", border: "none", color: "var(--dm-muted)", fontSize: 20, cursor: "pointer", padding: "0 4px" }}>✕</button>
            </div>
            {/* 탭 */}
            {birthDate && (
              <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "var(--dm-input)", borderRadius: 999, padding: 4 }}>
                {[{ key: 'daily', label: '오늘의 운세' }, { key: 'saju', label: '평생 사주' }, { key: 'tojeong', label: '토정비결' }].map(t => (
                  <button key={t.key} onClick={() => {
                    setFortuneTab(t.key);
                    if (t.key === 'daily' && !fortuneData) loadFortune();
                    if (t.key === 'saju' && !sajuData) loadSaju();
                    if (t.key === 'tojeong' && !tojeongData) loadTojeong();
                  }} style={{
                    flex: 1, padding: "8px 0", borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: "pointer",
                    border: "none", transition: "all .2s",
                    background: fortuneTab === t.key ? "#6C8EFF" : "transparent",
                    color: fortuneTab === t.key ? "#fff" : "var(--dm-muted)",
                    boxShadow: fortuneTab === t.key ? "0 2px 8px rgba(108,142,255,.4)" : "none",
                  }}>{t.label}</button>
                ))}
              </div>
            )}
            {/* 컨텐츠 — 기존 운세 섹션 내용 재사용 */}
            {!birthDate ? (
              <div style={{ textAlign: "center", padding: "20px 16px" }}>
                <div style={{ fontSize: 13, color: "var(--dm-muted)", marginBottom: 12 }}>생년월일을 입력하면 오늘의 운세를 볼 수 있어요</div>
                <button onClick={() => { setFortuneModalOpen(false); onOpenSettings?.(); }}
                  style={{ ...S.btn, width: "auto", padding: "10px 24px", fontSize: 13 }}>⚙️ 설정에서 입력하기</button>
              </div>
            ) : fortuneLoading ? (
              <div style={{ textAlign: "center", color: "var(--dm-muted)", fontSize: 13, padding: "28px 16px" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🔮</div>
                <div>운세를 불러오는 중<span style={{ display: "inline-block", animation: "dm-dots 1.2s steps(3,end) infinite", width: 18 }}>...</span></div>
              </div>
            ) : fortuneTab === 'daily' ? (
              fortuneData ? (() => {
                const cats = [
                  { label: "전체운", val: fortuneData.overall || 3 },
                  { label: "금전운", val: fortuneData.money || 3 },
                  { label: "건강운", val: fortuneData.health || 3 },
                  { label: "인간관계", val: fortuneData.relation || 3 },
                ];
                const totalScore = Math.round(cats.reduce((s, c) => s + c.val, 0) / cats.length * 20);
                const scoreColor = totalScore >= 80 ? "#4ADE80" : totalScore >= 60 ? "#FCD34D" : "#F87171";
                return (
                  <div style={S.card}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, gap: 12 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 2 }}>종합 운세 점수</div>
                        <div style={{ fontSize: 36, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{totalScore}<span style={{ fontSize: 16 }}>점</span></div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                      {cats.map(item => {
                        const pct = item.val * 20;
                        const c = pct >= 80 ? "#4ADE80" : pct >= 60 ? "#FCD34D" : "#F87171";
                        return (
                          <div key={item.label} style={{ background: "var(--dm-input)", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                              <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>{item.label}</div>
                              <div style={{ fontSize: 13, fontWeight: 900, color: c }}>{pct}점</div>
                            </div>
                            <div style={{ fontSize: 13, color: "#FCD34D", letterSpacing: 1, marginBottom: 4 }}>{starRating(item.val)}</div>
                            <div style={{ height: 4, background: "var(--dm-row)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: c, borderRadius: 2, transition: "width 0.4s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--dm-text)", lineHeight: 1.7, marginBottom: 12 }}>{fortuneData.message}</div>
                    <div style={{ background: "var(--dm-input)", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#6C8EFF", marginBottom: 4 }}>💡 오늘의 조언</div>
                      <div style={{ fontSize: 13, color: "var(--dm-text)" }}>{fortuneData.advice}</div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <div style={{ flex: 1, background: "var(--dm-input)", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>행운의 색</div>
                        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 2 }}>{fortuneData.luckyColor}</div>
                      </div>
                      <div style={{ flex: 1, background: "var(--dm-input)", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>행운의 숫자</div>
                        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 2 }}>{fortuneData.luckyNumber}</div>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div style={{ textAlign: "center", padding: "20px 16px" }}>
                  <button onClick={loadFortune} style={{ ...S.btn, width: "auto", padding: "10px 24px" }}>🔮 오늘의 운세 보기</button>
                </div>
              )
            ) : fortuneTab === 'saju' ? (
              sajuData ? (
                <div style={S.card}>
                  <div style={{ background: "var(--dm-input)", borderRadius: 10, padding: "10px 14px", marginBottom: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 2 }}>사주팔자</div>
                    <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 2 }}>{sajuData.pillars}</div>
                    <div style={{ fontSize: 12, color: "#6C8EFF", marginTop: 4 }}>일간: {sajuData.dayMaster}</div>
                  </div>
                  {[
                    { label: "🧠 성격 & 기질", content: sajuData.personality },
                    { label: "💼 적합한 직업", content: sajuData.career },
                    { label: "💰 재물운", content: sajuData.wealth },
                    { label: "❤️ 건강", content: sajuData.health },
                    { label: "🌟 인생 조언", content: sajuData.lifeAdvice },
                  ].map(sec => (
                    <div key={sec.label} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-sub)", marginBottom: 4 }}>{sec.label}</div>
                      <div style={{ fontSize: 13, color: "var(--dm-text)", lineHeight: 1.7 }}>{sec.content}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 16px" }}>
                  <button onClick={loadSaju} style={{ ...S.btn, width: "auto", padding: "10px 24px" }}>🌟 평생 사주 보기</button>
                </div>
              )
            ) : (
              tojeongData ? (
                <div style={S.card}>
                  <div style={{ background: "var(--dm-input)", borderRadius: 10, padding: "12px 14px", marginBottom: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 2 }}>{new Date().getFullYear()}년 토정비결</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: "#FCD34D" }}>{tojeongData.hexagram}</div>
                    <div style={{ fontSize: 13, color: "var(--dm-text)", marginTop: 6 }}>{tojeongData.summary}</div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--dm-text)", lineHeight: 1.8, marginBottom: 12 }}>{tojeongData.overall}</div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 16px" }}>
                  <button onClick={loadTojeong} style={{ ...S.btn, width: "auto", padding: "10px 24px" }}>📖 토정비결 보기</button>
                </div>
              )
            )}
            {/* ── 로또 번호 (운세 탭 하단) ── */}
            {fortuneTab === 'daily' && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--dm-border)", paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-sub)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  🎱 오늘의 로또 번호
                  {lottoNums && <span style={{ fontSize: 10, color: "var(--dm-muted)", fontWeight: 400 }}>· 오늘 1회 추출 완료</span>}
                </div>
                {lottoNums ? (
                  <>
                    {todayFortuneScore >= 80 && (
                      <div style={{ fontSize: 11, color: "#FBBF24", fontWeight: 700, marginBottom: 8 }}>🍀 오늘 운이 좋으니 한번 사보세요!</div>
                    )}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {lottoNums.map((n, i) => {
                        const bg = n <= 10 ? "#F87171" : n <= 20 ? "#FBBF24" : n <= 30 ? "#4ADE80" : n <= 40 ? "#60A5FA" : "#A78BFA";
                        return (
                          <div key={i} style={{ width: 36, height: 36, borderRadius: 999, background: bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, boxShadow: `0 2px 8px ${bg}66` }}>{n}</div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 8 }}>내일 새 번호를 뽑을 수 있어요</div>
                  </>
                ) : (
                  <button onClick={drawLotto} disabled={lottoAnim}
                    style={{ ...S.btn, background: lottoAnim ? "var(--dm-input)" : "linear-gradient(135deg,#7C3AED,#A78BFA)", fontSize: 14, marginTop: 0 }}>
                    {lottoAnim ? "🎱 추출 중..." : "🎱 번호 뽑기"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 포커스 모드 모달 ─────────────────────────────────── */}
      {focusTask && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(10,12,30,0.97)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: 24,
        }}>
          {/* 닫기 */}
          <button onClick={closeFocus} style={{
            position: "absolute", top: 20, right: 20,
            background: "transparent", border: "none", color: "var(--dm-muted)",
            fontSize: 28, cursor: "pointer", lineHeight: 1,
          }}>✕</button>

          {/* 할일 이름 */}
          <div style={{ fontSize: 15, color: "var(--dm-sub)", marginBottom: 8, fontWeight: 700, textAlign: "center" }}>집중 중</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "var(--dm-text)", marginBottom: 40, textAlign: "center", maxWidth: 280 }}>
            {focusTask.title}
          </div>

          {/* 원형 타이머 */}
          <div style={{ position: "relative", width: 220, height: 220, marginBottom: 40 }}>
            <svg width="220" height="220" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="110" cy="110" r="100" fill="none" stroke="var(--dm-input)" strokeWidth="10" />
              <circle cx="110" cy="110" r="100" fill="none"
                stroke={focusDone ? "#4ADE80" : "#A78BFA"} strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 100}`}
                strokeDashoffset={`${2 * Math.PI * 100 * (1 - focusPct / 100)}`}
                style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
              />
            </svg>
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              {focusDone ? (
                <div style={{ fontSize: 48 }}>🎉</div>
              ) : (
                <>
                  <div style={{ fontSize: 48, fontWeight: 900, color: "var(--dm-text)", letterSpacing: 2 }}>
                    {focusMin}:{focusSs}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--dm-muted)", marginTop: 4 }}>남음</div>
                </>
              )}
            </div>
          </div>

          {/* 완료 시 */}
          {focusDone ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#4ADE80", marginBottom: 8 }}>
                {TIMER_OPTIONS[focusTimerIdx].label} 집중 완료! 🌟
              </div>
              <div style={{ fontSize: 14, color: "#FCD34D", fontWeight: 900, marginBottom: 20 }}>
                +{TIMER_OPTIONS[focusTimerIdx].xp} XP 획득!
              </div>
              <button onClick={() => { onToggleTask(focusTask.id); onLuckyXp?.(TIMER_OPTIONS[focusTimerIdx].xp); closeFocus(); }}
                style={{ ...S.btn, marginBottom: 10, background: "linear-gradient(135deg,#4ADE80,#22c55e)" }}>
                ✅ 할일 완료 + XP 받기
              </button>
              <button onClick={() => { onLuckyXp?.(TIMER_OPTIONS[focusTimerIdx].xp); closeFocus(); }}
                style={{ ...S.btnGhost, marginBottom: 0 }}>XP만 받고 닫기</button>
            </div>
          ) : (
            <>
              {/* 시간 선택 */}
              {!focusRunning && focusSec === TIMER_OPTIONS[focusTimerIdx].sec && (
                <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
                  {TIMER_OPTIONS.map((opt, i) => (
                    <button key={opt.label} onClick={() => { setFocusTimerIdx(i); setFocusSec(opt.sec); }} style={{
                      padding: "6px 10px", borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                      border: `1.5px solid ${focusTimerIdx === i ? '#A78BFA' : 'var(--dm-border)'}`,
                      background: focusTimerIdx === i ? 'rgba(167,139,250,.2)' : 'var(--dm-input)',
                      color: focusTimerIdx === i ? '#A78BFA' : 'var(--dm-muted)',
                    }}>
                      {opt.label}
                      <div style={{ fontSize: 10, color: focusTimerIdx === i ? '#A78BFA' : 'var(--dm-muted)', marginTop: 1 }}>+{opt.xp}XP</div>
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => setFocusRunning(r => !r)} style={{
                  ...S.btn, width: 120, background: focusRunning
                    ? "linear-gradient(135deg,#F87171,#ef4444)"
                    : "linear-gradient(135deg,#A78BFA,#7c3aed)",
                }}>
                  {focusRunning ? "⏸ 일시정지" : "▶ 시작"}
                </button>
                <button onClick={() => { setFocusSec(TIMER_OPTIONS[focusTimerIdx].sec); setFocusRunning(false); setFocusDone(false); }}
                  style={{ ...S.btnGhost, width: 80 }}>
                  🔄 초기화
                </button>
              </div>
            </>
          )}
        </div>
      )}

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
          {installPrompt ? (
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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {myRank && (
              <button onClick={onOpenStats} style={{ background: "rgba(75,111,255,.15)", border: "1px solid rgba(108,142,255,.4)", borderRadius: 20, padding: "5px 12px", cursor: "pointer", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 1 }}>전체 순위</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#6C8EFF" }}>🏆 {myRank.rank}위</div>
                <div style={{ fontSize: 10, color: "var(--dm-muted)" }}>{myRank.total}명 중</div>
              </button>
            )}
            <button onClick={() => { if (!fortuneData && birthDate) loadFortune(); setFortuneModalOpen(true); }} style={{
              background: todayFortuneScore ? "rgba(167,139,250,.12)" : "rgba(167,139,250,.08)",
              border: `1px solid ${todayFortuneScore ? "rgba(167,139,250,.5)" : "rgba(167,139,250,.3)"}`,
              borderRadius: 20, padding: "5px 12px", cursor: "pointer", textAlign: "center",
            }}>
              <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 1 }}>오늘의 운세</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#A78BFA" }}>
                {todayFortuneScore ? `${todayFortuneScore * 20}점` : "🔮"}
              </div>
              <div style={{ fontSize: 10, color: "var(--dm-muted)" }}>운세보기</div>
            </button>
          </div>
        </div>
        {/* 중앙: 원형 링 + XP */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "4px 0 12px" }}>
          {/* 원형 완료율 링 */}
          {(() => {
            const pct = filledCount > 0 ? Math.round((doneCount / filledCount) * 100) : 0;
            const r = 26;
            const circ = 2 * Math.PI * r;
            const dash = (pct / 100) * circ;
            return (
              <svg width="68" height="68" viewBox="0 0 68 68" style={{ flexShrink: 0 }}>
                <defs>
                  <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#4B6FFF" />
                    <stop offset="100%" stopColor="#b8c3ff" />
                  </linearGradient>
                </defs>
                <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(75,111,255,0.15)" strokeWidth="6" />
                <circle cx="34" cy="34" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circ}`}
                  transform="rotate(-90 34 34)"
                  style={{ transition: "stroke-dasharray 0.5s ease" }}
                />
                <text x="34" y="37" textAnchor="middle" fill="var(--dm-text)" fontSize="13" fontWeight="900" fontFamily="'Plus Jakarta Sans',sans-serif">{pct}%</text>
              </svg>
            );
          })()}
          {/* XP 정보 */}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 30, fontWeight: 900, color: "var(--dm-text)", letterSpacing: -1 }}>{totalScore.toLocaleString()}</span>
              <span style={{ fontSize: 13, color: "#6C8EFF", fontWeight: 700 }}>XP</span>
              <button onClick={() => setXpHelpOpen(true)} style={{
                background: "rgba(108,142,255,.18)", border: "1px solid rgba(108,142,255,.4)",
                borderRadius: 999, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", fontSize: 11, color: "#6C8EFF", fontWeight: 900, padding: 0, lineHeight: 1,
              }}>?</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 2 }}>
              오늘 {doneCount}/{filledCount || 3} 완료
            </div>
          </div>
        </div>
        {/* 진행바 */}
        <div style={{ height: 7, background: "var(--dm-row)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
          <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#4B6FFF,#6C8EFF)", width: `${levelInfo.progress}%`, transition: "width 0.4s" }} />
        </div>
        {/* 하단 요약 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>
            {streak > 0 && <span style={{ color: "#F97316", fontWeight: 900 }}>🔥 {streak}일 연속 · </span>}
            {streak > 0 && streak % 7 !== 0 && <span style={{ color: "#FCD34D", fontWeight: 700 }}>({7 - (streak % 7)}일 후 보너스) · </span>}
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

      {/* ── 오늘의 명언 ─────────────────────────────────────────── */}
      <div style={{ margin: "0 16px 10px", borderRadius: 14, background: "var(--dm-card)", border: "1px solid var(--dm-border)", padding: "14px 16px" }}>
        <div style={{ fontSize: 11, color: "#6C8EFF", fontWeight: 900, marginBottom: 6 }}>✨ 오늘의 명언</div>
        <div style={{ fontSize: 14, color: "var(--dm-text)", fontWeight: 700, lineHeight: 1.6, marginBottom: 6 }}>"{todayQuote.text}"</div>
        <div style={{ fontSize: 12, color: "var(--dm-muted)", textAlign: "right" }}>— {todayQuote.author}</div>
      </div>



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
              {allDone && <div style={{ fontSize: 12, color: "#4ADE80", fontWeight: 900 }}>🎉 모두 완료!</div>}
            </div>
            <div style={{ height: 6, background: "var(--dm-row)", borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
              <div style={{
                height: "100%", borderRadius: 3, transition: "width 0.3s",
                background: allDone ? "#4ADE80" : "#4B6FFF",
                width: `${(doneCount / filledCount) * 100}%`,
                boxShadow: allDone ? "0 0 10px rgba(74,222,128,0.5)" : "0 0 10px rgba(75,111,255,0.5)",
              }} />
            </div>
            {[...(todayData?.tasks || [])].sort((a,b) => (b.priority?1:0)-(a.priority?1:0)).map((task, i, arr) => {
              if (!task.title.trim()) return null;
              const isChecked = checkedId === task.id;
              return (
                <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0",
                  borderBottom: i < arr.length - 1 ? `1px solid var(--dm-row)` : "none",
                  borderLeft: task.priority ? "3px solid #4B6FFF" : "3px solid transparent" }}>
                  {/* 체크박스 + 제목 클릭 영역 */}
                  <div onClick={() => {
                    if (!task.done) { setCheckedId(task.id); setTimeout(() => setCheckedId(null), 400); }
                    onToggleTask(task.id);
                  }} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, cursor: "pointer", minWidth: 0 }}>
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
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                      {task.priority && (
                        <span style={{ fontSize: 9, fontWeight: 900, color: "#6C8EFF", background: "rgba(75,111,255,0.12)", border: "1px solid rgba(75,111,255,0.3)", borderRadius: 4, padding: "1px 5px", flexShrink: 0, letterSpacing: "0.04em" }}>중요</span>
                      )}
                      <span style={{
                        fontSize: 14, fontWeight: 700,
                        color: task.done ? "var(--dm-muted)" : "var(--dm-text)",
                        textDecoration: task.done ? "line-through" : "none",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{task.title}</span>
                    </div>
                  </div>
                  {/* 포커스 모드 */}
                  {!task.done && (
                    <button onClick={() => startFocus(task)}
                      title="포커스 모드 (25분)"
                      style={{ background: "transparent", border: "1px solid #A78BFA", borderRadius: 6, color: "#A78BFA", fontSize: 13, cursor: "pointer", padding: "3px 7px", flexShrink: 0 }}>
                      ▶
                    </button>
                  )}
                  {/* 언젠가할일로 이동 */}
                  <button onClick={() => {
                    const item = (todayData?.tasks || []).find(t => t.id === task.id);
                    if (item?.title?.trim()) {
                      setSomeday(prev => [...(prev || []), { id: `sd${Date.now()}`, title: item.title.trim(), done: false }]);
                      onSetTodayTasks((todayData.tasks || []).filter(t => t.id !== task.id));
                    }
                  }} style={{ background: "transparent", border: "1px solid #4B6FFF", borderRadius: 6, color: "#6C8EFF", fontSize: 14, fontWeight: 900, cursor: "pointer", padding: "3px 7px", flexShrink: 0 }}>↓</button>
                  {/* 삭제 */}
                  <button onClick={() => onSetTodayTasks((todayData.tasks || []).filter(t => t.id !== task.id))}
                    style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer", fontSize: 18, flexShrink: 0, lineHeight: 1, padding: "0 2px" }}>✕</button>
                </div>
              );
            })}
            {communityEventsToday.map((ev, i) => {
              const isDone = !!communityEventChecks[ev.id];
              return (
                <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0",
                  borderTop: "1px solid var(--dm-row)", borderLeft: "3px solid rgba(108,142,255,0.4)" }}>
                  <div onClick={() => onToggleCommunityEvent(ev.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, cursor: "pointer", minWidth: 0 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: isDone ? "none" : "2px solid #3A4260",
                      background: isDone ? "#4B6FFF" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {isDone && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 9, fontWeight: 900, color: "#6C8EFF", background: "rgba(75,111,255,0.12)", border: "1px solid rgba(75,111,255,0.3)", borderRadius: 4, padding: "1px 5px", flexShrink: 0, whiteSpace: "nowrap" }}>👥 {ev.communityName}</span>
                      <span style={{ fontSize: 14, fontWeight: 700,
                        color: isDone ? "var(--dm-muted)" : "var(--dm-text)",
                        textDecoration: isDone ? "line-through" : "none",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
                    </div>
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

      {/* ── 인생 목표 섹션 ───────────────────────────────────── */}
      <div onClick={() => { if (!lgForm) setLifeGoalOpen(v => !v); }}
        style={{ ...S.sectionTitle, justifyContent: "space-between", paddingRight: 16, cursor: "pointer", userSelect: "none" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={S.sectionEmoji}>🚀</span>인생 목표
          <span style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>{lifeGoalOpen ? "▾" : "▸"}</span>
          {!lifeGoalOpen && lifeGoals.length > 0 && (
            <span style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>{lifeGoals.length}개</span>
          )}
        </span>
        {lifeGoalOpen && (
          <button onClick={e => { e.stopPropagation(); setLgForm({ title: '', deadline: '', emoji: '🎯', actions: [] }); }}
            style={{ fontSize: 11, fontWeight: 900, color: "#6C8EFF", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}>
            + 목표 추가
          </button>
        )}
      </div>

      {lifeGoalOpen && (
        <div style={{ paddingBottom: 4 }}>
          {lifeGoals.length === 0 && !lgForm && (
            <div style={{ ...S.card, textAlign: "center", color: "var(--dm-muted)", fontSize: 13, padding: "20px 16px" }}>
              아직 목표가 없어요.<br />
              <button onClick={() => setLgForm({ title: '', deadline: '', emoji: '🎯', actions: [] })}
                style={{ marginTop: 10, ...S.btn, width: "auto", padding: "8px 20px", fontSize: 13 }}>
                + 첫 목표 만들기
              </button>
            </div>
          )}

          {lifeGoals.map(goal => {
            const dl = daysLeft(goal.deadline);
            const isExpanded = !!expandedGoalIds[goal.id];
            return (
              <div key={goal.id} style={S.card}>
                {/* 목표 헤더 — 클릭으로 펼치기/접기 */}
                <div onClick={() => toggleGoalExpand(goal.id)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: "var(--dm-text)", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{goal.emoji} {goal.title}</span>
                      <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>{isExpanded ? "▾" : "▸"}</span>
                    </div>
                    {goal.deadline && (
                      <div style={{ fontSize: 11, color: dl != null && dl < 30 ? "#F87171" : "var(--dm-muted)", marginTop: 2, fontWeight: 700 }}>
                        {goal.deadline}{dl != null ? (dl > 0 ? ` · D-${dl}` : dl === 0 ? ' · 오늘!' : ` · D+${Math.abs(dl)}`) : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => setLgForm({ ...goal })}
                      style={{ fontSize: 11, color: "var(--dm-muted)", background: "transparent", border: "none", cursor: "pointer" }}>✏️</button>
                    <button onClick={() => { if (window.confirm('목표를 삭제할까요?')) setLifeGoals(prev => prev.filter(g => g.id !== goal.id)); }}
                      style={{ fontSize: 11, color: "#F87171", background: "transparent", border: "none", cursor: "pointer" }}>✕</button>
                  </div>
                </div>

                {/* 액션 목록 — 펼쳐졌을 때만 표시 */}
                {isExpanded && goal.actions.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--dm-row)", marginTop: 10, paddingTop: 8 }}>
                    {goal.actions.map(a => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0" }}>
                        <div style={{ fontSize: 13, color: "var(--dm-sub)" }}>▸ {a.title}</div>
                        <button onClick={() => addTaskFromAction(a.title)}
                          style={{ fontSize: 11, fontWeight: 800, color: "#6C8EFF", background: "rgba(108,142,255,.1)", border: "1px solid rgba(108,142,255,.2)", borderRadius: 8, padding: "3px 8px", cursor: "pointer" }}>
                          → 오늘 할일
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {isExpanded && goal.actions.length === 0 && (
                  <div style={{ borderTop: "1px solid var(--dm-row)", marginTop: 10, paddingTop: 8, fontSize: 12, color: "var(--dm-muted)", textAlign: "center" }}>
                    액션플랜을 추가해보세요 ✏️
                  </div>
                )}
              </div>
            );
          })}

          {/* 목표 추가/편집 폼 */}
          {lgForm && (
            <div style={{ ...S.card, border: "1.5px solid rgba(108,142,255,.4)" }}>
              <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 10 }}>
                {lgForm.id ? '목표 편집' : '새 목표'}
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input style={{ ...S.input, width: 48, textAlign: "center", fontSize: 20, padding: "8px 4px" }}
                  value={lgForm.emoji} onChange={e => setLgForm(p => ({ ...p, emoji: e.target.value }))} maxLength={2} />
                <input style={{ ...S.input, flex: 1 }} placeholder="목표 제목"
                  value={lgForm.title} onChange={e => setLgForm(p => ({ ...p, title: e.target.value }))} maxLength={40} autoFocus />
              </div>
              <input type="date" style={{ ...S.input, marginBottom: 10 }}
                value={lgForm.deadline} onChange={e => setLgForm(p => ({ ...p, deadline: e.target.value }))} />

              {(lgForm.actions || []).length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--dm-muted)", marginBottom: 6 }}>액션 플랜</div>
                  {lgForm.actions.map((a, i) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ flex: 1, fontSize: 13, color: "var(--dm-sub)" }}>▸ {a.title}</div>
                      <button onClick={() => setLgForm(p => ({ ...p, actions: p.actions.filter((_, j) => j !== i) }))}
                        style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer", fontSize: 13 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input style={{ ...S.input, flex: 1 }} placeholder="액션 추가 (예: 매일 30분 운동)"
                  value={lgActionInput} onChange={e => setLgActionInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addLgAction()} maxLength={40} />
                <button onClick={addLgAction}
                  style={{ ...S.btn, width: "auto", marginTop: 0, padding: "0 14px", fontSize: 18 }}>+</button>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...S.btn, flex: 1, marginTop: 0 }} onClick={saveLgForm}>저장</button>
                <button style={{ ...S.btnGhost, flex: 1, marginTop: 0 }} onClick={() => { setLgForm(null); setLgActionInput(''); }}>취소</button>
              </div>
            </div>
          )}
        </div>
      )}

      {false && <><div
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
                  boxShadow: allGoalsDone ? "0 0 10px rgba(74,222,128,0.5)" : "0 0 10px rgba(75,111,255,0.5)",
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
      </div>}</>}

      {(() => {
        const habitChecks = todayData?.habitChecks || {};
        const doneHabits = habits.filter(h => habitChecks[h.id]).length;
        const allHabitsDone = habits.length > 0 && doneHabits === habits.length;
        return (
          <>
            <div style={{ ...S.sectionTitle, justifyContent: "space-between", paddingRight: 16 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={S.sectionEmoji}>🎯</span>오늘 습관
                {habits.length === 0 && !editingHabits && (
                  <span style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 400 }}>매일 반복해야 하는 습관을 입력하세요</span>
                )}
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {habits.length > 0 && <span style={{ fontSize: 11, color: allHabitsDone ? "#4ADE80" : "var(--dm-muted)", fontWeight: 900 }}>{doneHabits}/{habits.length}</span>}
                <button onClick={() => setEditingHabits(v => !v)}
                  style={{ fontSize: 11, fontWeight: 900, color: editingHabits ? "#4ADE80" : "var(--dm-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}>
                  {editingHabits ? "완료 ✓" : "⚙️ 편집"}
                </button>
              </div>
            </div>
            {habits.length === 0 && !editingHabits && (
              <div style={{ ...S.card, textAlign: "center", padding: "22px 16px", border: "1.5px dashed var(--dm-border)" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🌱</div>
                <div style={{ fontSize: 14, color: "var(--dm-text)", fontWeight: 900, marginBottom: 4 }}>오늘 첫 습관을 시작해볼까요?</div>
                <div style={{ fontSize: 12, color: "var(--dm-muted)", marginBottom: 14, lineHeight: 1.6 }}>매일 작은 실천이 큰 변화를 만들어요<br/>아래 예시를 탭하면 바로 추가돼요</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
                  {[{ icon: "💧", name: "물 마시기" }, { icon: "🏃", name: "스트레칭" }, { icon: "📚", name: "독서 10분" }].map(ex => (
                    <button key={ex.name} onClick={() => {
                      setHabits(prev => [...prev, { id: `h${Date.now()}_${ex.name}`, name: ex.name, icon: ex.icon }]);
                    }} style={{
                      padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: "pointer",
                      border: "1.5px solid rgba(108,142,255,.4)", background: "rgba(108,142,255,.1)",
                      color: "#818cf8", display: "flex", alignItems: "center", gap: 5,
                    }}>
                      <span>{ex.icon}</span><span>{ex.name}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setEditingHabits(true)}
                  style={{ ...S.btn, width: "auto", padding: "10px 24px", fontSize: 13 }}>➕ 직접 추가하기</button>
              </div>
            )}
            <div style={{ ...S.card, border: allHabitsDone && !editingHabits ? "1.5px solid #4ADE80" : "1.5px solid var(--dm-border)", display: habits.length === 0 && !editingHabits ? "none" : undefined }}>
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

      <div style={{ height: 12 }} />

      {/* ── XP 도움말 모달 ──────────────────────────────────────── */}
      {xpHelpOpen && (() => {
        const LEVELS = Array.from({ length: 21 }, (_, i) => {
          const lv = i + 1;
          const icons  = ['🌱','🌱','🌱','🌿','🌿','⚡','⚡','🔥','🔥','🔥','👑','👑','👑','👑','👑','🌟','🌟','🌟','🌟','🌟','💎'];
          const titles = ['새싹','새싹','새싹','성장','성장','도전자','도전자','실행가','실행가','실행가','마스터','마스터','마스터','마스터','마스터','전설','전설','전설','전설','전설','챔피언'];
          const floor = Math.pow(lv - 1, 2) * 100;
          return { lv, icon: icons[i], title: titles[i], floor };
        });
        const XP_ITEMS = [
          { label: '할일 완료 1개', pt: '+10 XP' },
          { label: '할일 전체 완료 보너스', pt: '+20 XP' },
          { label: '습관 체크 1개', pt: '+5 XP' },
          { label: '습관 전체 완료 보너스', pt: '+15 XP' },
          { label: '일기/메모 작성', pt: '+15 XP' },
          { label: '완벽한 하루 달성', pt: '+25 XP' },
          { label: '7일 연속 보너스', pt: '+50 XP~' },
          { label: '타이머 챌린지 (5/15/25/50분)', pt: '5·15·30·70 XP' },
        ];
        return (
          <div onClick={() => setXpHelpOpen(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
            zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 20px",
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "var(--dm-bg)", border: "1px solid var(--dm-border2)",
              borderRadius: 22, width: "100%", maxWidth: 360,
              maxHeight: "80vh", display: "flex", flexDirection: "column",
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              animation: "modalPop 0.18s ease-out", overflow: "hidden",
            }}>
              {/* 헤더 */}
              <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid var(--dm-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "var(--dm-text)" }}>⚡ XP & 레벨 안내</div>
                <button onClick={() => setXpHelpOpen(false)} style={{ background: "transparent", border: "none", color: "var(--dm-muted)", fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1 }}>✕</button>
              </div>
              {/* 스크롤 내용 */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>
                {/* 내 현재 상태 */}
                <div style={{ background: "linear-gradient(135deg,rgba(75,111,255,.15),rgba(108,142,255,.07))", border: "1.5px solid rgba(108,142,255,.3)", borderRadius: 14, padding: "14px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 36 }}>{levelInfo.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>{levelInfo.title} · Lv.{levelInfo.level}</div>
                    <div style={{ fontSize: 11, color: "#6C8EFF", fontWeight: 700, marginTop: 2 }}>{totalScore.toLocaleString()} XP 보유</div>
                    <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 1 }}>다음 레벨까지 {(levelInfo.nextFloor - totalScore).toLocaleString()} XP 남음</div>
                  </div>
                </div>

                {/* XP 획득 방법 */}
                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-sub)", marginBottom: 8 }}>📌 XP 획득 방법</div>
                <div style={{ borderRadius: 12, border: "1px solid var(--dm-border)", overflow: "hidden", marginBottom: 18 }}>
                  {XP_ITEMS.map((it, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px",
                      background: i % 2 === 0 ? "transparent" : "var(--dm-row)",
                      borderBottom: i < XP_ITEMS.length - 1 ? "1px solid var(--dm-border)" : "none" }}>
                      <span style={{ fontSize: 13, color: "var(--dm-text)" }}>{it.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 900, color: "#6C8EFF" }}>{it.pt}</span>
                    </div>
                  ))}
                </div>

                {/* 등급표 */}
                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-sub)", marginBottom: 8 }}>🏆 전체 등급표</div>
                <div style={{ borderRadius: 12, border: "1px solid var(--dm-border)", overflow: "hidden" }}>
                  {LEVELS.map((lv, i) => {
                    const isCurrent = lv.lv === levelInfo.level;
                    return (
                      <div key={lv.lv} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                        background: isCurrent ? "rgba(75,111,255,.15)" : i % 2 === 0 ? "transparent" : "var(--dm-row)",
                        borderBottom: i < LEVELS.length - 1 ? "1px solid var(--dm-border)" : "none",
                        border: isCurrent ? "1.5px solid rgba(108,142,255,.5)" : undefined,
                      }}>
                        <span style={{ fontSize: 18 }}>{lv.icon}</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: isCurrent ? 900 : 700, color: isCurrent ? "#6C8EFF" : "var(--dm-text)" }}>
                            Lv.{lv.lv} {lv.title}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: isCurrent ? "#6C8EFF" : "var(--dm-muted)", fontWeight: 700 }}>
                          {lv.floor.toLocaleString()} XP~
                        </span>
                        {isCurrent && <span style={{ fontSize: 10, background: "#4B6FFF", color: "#fff", borderRadius: 999, padding: "2px 7px", fontWeight: 900 }}>현재</span>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ height: 8 }} />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
