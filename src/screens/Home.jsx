import { useEffect, useMemo, useRef, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toDateStr, formatKoreanDate, getWeekDates } from "../utils/date.js";
import FocusTimerModal from "../components/FocusTimerModal.jsx";
import { store } from "../utils/storage.js";
import { getPermission } from "../utils/notification.js";
import { calcStreak, calcGoalProgress, calcDayScore, calcLevel } from "../data/stats.js";
import { gcalFetchWeekEvents } from "../api/gcal.js";
import { fetchMarketDataFromServer } from "../api/telegram.js";
import { playSound } from "../utils/sound.js";
import S from "../styles.js";
import WeeklySchedule from "../components/WeeklySchedule.jsx";
import HomeCustomizationModal from "../components/home/HomeCustomizationModal.jsx";
import { DEFAULT_HOME_PREFS, DEFAULT_HOME_SECTION_ORDER, HOME_PREFS_KEY, HOME_SECTION_CONFIG, HOME_SECTION_LABELS, HOME_SECTION_ORDER_KEY, normalizeHomeSectionOrder } from "../components/home/config.js";
import { getCurrentGoalMonthKey, getMonthGoals, getYearGoals } from "../utils/goals.js";
function SortableHabitRow({ habit, setHabits, onRemove, isOverlay = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: habit.id });
  const dragging = isDragging || isOverlay;
  const habitLabel = habit?.name?.trim() || '이름 없는 습관';

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        transform: isOverlay ? undefined : CSS.Transform.toString(transform),
        transition: isOverlay ? undefined : [transition, 'box-shadow 180ms ease, border-color 180ms ease, background 180ms ease, padding 180ms ease'].filter(Boolean).join(', '),
        opacity: isOverlay ? 1 : undefined,
        position: 'relative',
        zIndex: dragging ? 2 : 1,
        borderRadius: 14,
        boxShadow: dragging ? '0 18px 36px rgba(0,0,0,.18)' : 'none',
        border: dragging ? '1px dashed rgba(108,142,255,.35)' : '1px solid transparent',
        background: dragging ? 'rgba(108,142,255,.05)' : 'transparent',
        padding: dragging ? '6px' : 0,
      }}
    >
      <button
        type="button"
        {...(isOverlay ? {} : attributes)}
        {...(isOverlay ? {} : listeners)}
        aria-label={`${habitLabel} 순서 이동`}
        aria-roledescription="sortable habit"
        title={`${habitLabel} 순서 이동`}
        style={{
          width: 32,
          height: 42,
          borderRadius: 10,
          border: '1px solid var(--dm-border)',
          background: dragging ? 'rgba(108,142,255,.18)' : 'var(--dm-card)',
          color: 'var(--dm-muted)',
          cursor: isOverlay ? 'grabbing' : 'grab',
          flexShrink: 0,
          fontSize: 16,
          lineHeight: 1,
          touchAction: 'none',
          transform: dragging ? 'scale(1.04)' : 'scale(1)',
          transition: 'transform 140ms ease, background 140ms ease, border-color 140ms ease',
        }}
      >
        ⋮⋮
      </button>
      <input style={{ ...S.input, width: 48, textAlign: 'center', marginBottom: 0, padding: '8px 4px' }}
        value={habit.icon} maxLength={2} placeholder="🎯"
        onChange={e => setHabits(prev => prev.map(x => x.id === habit.id ? { ...x, icon: e.target.value } : x))} />
      <input style={{ ...S.input, flex: 1, marginBottom: 0 }}
        value={habit.name} maxLength={20} placeholder="습관 이름"
        onChange={e => setHabits(prev => prev.map(x => x.id === habit.id ? { ...x, name: e.target.value } : x))} />
      <button onClick={() => onRemove(habit.id)}
        style={{ background: 'transparent', border: 'none', color: '#F87171', cursor: 'pointer', fontSize: 20, flexShrink: 0 }}>✕</button>
    </div>
  );
}

function SortableHomeSectionRow({ sectionId, homePrefs, onMoveSection, onTogglePref, orderIndex, totalCount }) {
  const sectionMeta = HOME_SECTION_CONFIG.find(section => section.id === sectionId);
  const isVisible = sectionMeta?.visibleKey ? homePrefs?.[sectionMeta.visibleKey] !== false : true;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 16,
        border: '1px solid var(--dm-border)',
        background: 'var(--dm-card)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--dm-text)' }}>{sectionMeta?.label || HOME_SECTION_LABELS[sectionId]}</div>
        <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 4 }}>{sectionMeta?.description || '홈 화면에서 보이는 위치를 바꿉니다.'}</div>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (sectionMeta?.visibleKey) onTogglePref?.(sectionMeta.visibleKey);
        }}
        aria-label={`${sectionMeta?.label || HOME_SECTION_LABELS[sectionId]} 표시 전환`}
        style={{
          minWidth: 58,
          height: 32,
          borderRadius: 999,
          padding: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: isVisible ? 'flex-end' : 'flex-start',
          background: isVisible ? 'rgba(74,222,128,.18)' : 'var(--dm-row)',
          border: `1px solid ${isVisible ? 'rgba(74,222,128,.35)' : 'var(--dm-border)'}`,
          cursor: 'pointer',
          flexShrink: 0,
          marginLeft: 12,
        }}
      >
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: isVisible ? '#4ADE80' : 'var(--dm-muted)' }} />
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 10 }}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onMoveSection?.(sectionId, -1);
          }}
          disabled={orderIndex <= 0}
          aria-label={`${sectionMeta?.label || HOME_SECTION_LABELS[sectionId]} 위로 이동`}
          style={{
            width: 28,
            height: 20,
            borderRadius: 8,
            border: '1px solid var(--dm-border)',
            background: orderIndex <= 0 ? 'var(--dm-row)' : 'var(--dm-bg)',
            color: orderIndex <= 0 ? 'var(--dm-muted)' : 'var(--dm-text)',
            cursor: orderIndex <= 0 ? 'default' : 'pointer',
            fontSize: 10,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ▲
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onMoveSection?.(sectionId, 1);
          }}
          disabled={orderIndex >= totalCount - 1}
          aria-label={`${sectionMeta?.label || HOME_SECTION_LABELS[sectionId]} 아래로 이동`}
          style={{
            width: 28,
            height: 20,
            borderRadius: 8,
            border: '1px solid var(--dm-border)',
            background: orderIndex >= totalCount - 1 ? 'var(--dm-row)' : 'var(--dm-bg)',
            color: orderIndex >= totalCount - 1 ? 'var(--dm-muted)' : 'var(--dm-text)',
            cursor: orderIndex >= totalCount - 1 ? 'default' : 'pointer',
            fontSize: 10,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ▼
        </button>
      </div>
    </div>
  );
}

export default function Home({ user, goals, todayData, plans, onToggleTask, onSetTodayTasks, habits, setHabits, onToggleHabit, onOpenDate, onOpenDateMemo, installPrompt, handleInstall, showInstallBanner, dismissInstallBanner, isIOS, isKakao, isStandalone, scores, event, inviteBonus, onOpenChat, isDark, setIsDark, getValidGcalToken, myRank, onOpenStats, recurringTasks, setRecurringTasks, someday, setSomeday, onLuckyXp, onOpenGoalsHub, onOpenSettings, invitePromptCode, recentInviteReward, onOpenInviteFlow, onDismissInvitePrompt, onDismissInviteReward, levelUpInfo, onDismissLevelUp, communityEventsToday = [], communityEventChecks = {}, onToggleCommunityEvent, myChallenges = [], onOpenChallengeHub, onOpenChallengeItem, telegramCfg, onOpenPortfolio, onSetMemo }) {
  const today = toDateStr();
  const yearGoals = getYearGoals(goals);
  const monthGoals = getMonthGoals(goals, getCurrentGoalMonthKey());
    const doneCount = (todayData?.tasks || []).filter((t) => t.done && t.title.trim()).length;  
  const filledCount = (todayData?.tasks || []).filter((t) => t.title.trim()).length;
  const allDone = filledCount > 0 && doneCount === filledCount;

  // ── 포커스 모드 (FocusTimerModal로 분리) ────────────────────
  const [focusTask, setFocusTask] = useState(null);
  const startFocus = (task) => setFocusTask(task);

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
  const fortuneXpKey = `dm_fortune_xp_${today}`;

  // XP 플로팅 애니메이션
  const [xpFloat, setXpFloat] = useState(null);
  const [xpFloatPos, setXpFloatPos] = useState({ top: '40%', left: '50%' });
  const triggerXpFloat = (xp, anchorEl) => {
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      setXpFloatPos({ top: r.top + r.height / 2, left: r.left + r.width / 2 });
    }
    setXpFloat({ xp, key: Date.now() });
    onLuckyXp?.(xp);
  };

  // ── 운세 ────────────────────────────────────────────────────
  const [fortuneOpen, setFortuneOpen] = useState(false);
  const [fortuneModalOpen, setFortuneModalOpen] = useState(false);
  const [fortuneTab, setFortuneTab] = useState('daily'); // daily | saju | tojeong
  const [fortuneData, setFortuneData] = useState(null);
  const [fortuneLoading, setFortuneLoading] = useState(false);
  const [fortuneError, setFortuneError] = useState(false);
  const canDirectInstall = !!installPrompt;
  const showInviteBanners = !showInstallBanner;
  const showInvitePrompt = showInviteBanners && !!invitePromptCode;

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
    setFortuneError(false);
    try {
      const res = await fetch('/api/chat?action=fortune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthDate, birthTime, userName: user?.name || '사용자', today: todayStr }),
      });
      if (!res.ok) throw new Error(`fortune ${res.status}`);
      const data = await res.json();
      store.set(fortuneCacheKey, data);
      setFortuneData(data);
    } catch {
      setFortuneError(true);
    }
    setFortuneLoading(false);
  };

  useEffect(() => {
    if (fortuneData?.overall && !store.get(fortuneXpKey, null)) {
      const xp = Math.round(fortuneData.overall * 2);
      store.set(fortuneXpKey, xp);
      triggerXpFloat(xp);
    }
  }, [fortuneData]); // eslint-disable-line

  const loadSaju = async () => {
    if (!birthDate) return;
    setFortuneLoading(true);
    try {
      const res = await fetch('/api/chat?action=saju', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthDate, birthTime, userName: user?.name || '사용자' }),
      });
      if (!res.ok) throw new Error(`saju ${res.status}`);
      const data = await res.json();
      store.set('dm_saju_result', data);
      setSajuData(data);
    } catch { setFortuneError(true); }
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
      if (!res.ok) throw new Error(`tojeong ${res.status}`);
      const data = await res.json();
      store.set('dm_tojeong_result', data);
      setTojeongData(data);
    } catch { setFortuneError(true); }
    setFortuneLoading(false);
  };

  const starRating = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

  const fortuneLevel = (score) => {
    if (!score) return { label: '🔮', color: '#A78BFA', desc: '운세보기' };
    const pts = score * 20;
    if (pts >= 80) return { label: '대길 ★', color: '#4ADE80', desc: `${pts}점` };
    if (pts >= 60) return { label: '길 ☆', color: '#FCD34D', desc: `${pts}점` };
    if (pts >= 40) return { label: '평 △', color: '#94A3B8', desc: `${pts}점` };
    return { label: '흉 ▽', color: '#F87171', desc: `${pts}점` };
  };

  const fortuneWeekHistory = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = toDateStr(d);
      const cached = store.get(`dm_fortune_${dateStr}`, null);
      const dow = '일월화수목금토'[d.getDay()];
      return { dateStr, overall: cached?.overall ?? null, dow };
    });
  }, []); // eslint-disable-line
  const linkedChallengesByHabit = useMemo(() => {
    return (myChallenges || []).reduce((acc, challenge) => {
      const linkedHabitId = challenge?.myMember?.linkedHabitId || challenge?.linkedHabitId;
      if (!linkedHabitId) return acc;
      if (!acc[linkedHabitId]) acc[linkedHabitId] = [];
      acc[linkedHabitId].push(challenge);
      return acc;
    }, {});
  }, [myChallenges]);

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

  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [somedayInput, setSomedayInput] = useState("");
  const [somedayCollapsed, setSomedayCollapsed] = useState(false);
  const [habitCheckedId, setHabitCheckedId] = useState(null);
  const [xpHelpOpen, setXpHelpOpen] = useState(false);
  const [levelExpanded, setLevelExpanded] = useState(false);

  // ── 포트폴리오 브리핑 ────────────────────────────────────────
  const pfCacheKey = `dm_portfolio_prices_${toDateStr()}`;
  const [pfMarket, setPfMarket] = useState(() => { try { return JSON.parse(localStorage.getItem(pfCacheKey) || "null"); } catch { return null; } });
  const [pfLoading, setPfLoading] = useState(false);

  useEffect(() => {
    const holdings = telegramCfg?.holdings || [];
    if (!pfMarket && holdings.length > 0) {
      const customRegistry = Object.fromEntries(holdings.map(h => [h.sym, { label: h.label, src: h.src, ...(h.coinId ? { coinId: h.coinId } : {}) }]));
      setPfLoading(true);
      fetchMarketDataFromServer([...new Set(holdings.map(h => h.sym))], customRegistry)
        .then(data => { localStorage.setItem(pfCacheKey, JSON.stringify(data)); setPfMarket(data); })
        .finally(() => setPfLoading(false));
    }
  }, []); // eslint-disable-line

  const pfSummary = useMemo(() => {
    const holdings = telegramCfg?.holdings || [];
    if (!pfMarket || holdings.length === 0) return null;
    let totalValue = 0, totalCost = 0, totalDailyChange = 0, count = 0;
    holdings.forEach(h => {
      const d = pfMarket[h.sym]; if (!d) return;
      const value = h.qty * d.price;
      const cost = h.qty * h.avgPrice;
      const chg = d.change != null ? d.change * h.qty : d.chgPct != null ? value * (d.chgPct / 100) / (1 + d.chgPct / 100) : 0;
      totalValue += value; totalCost += cost; totalDailyChange += chg; count++;
    });
    if (count === 0) return null;
    const pnl = totalValue - totalCost;
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
    const prevValue = totalValue - totalDailyChange;
    const dailyChangePct = prevValue > 0 ? (totalDailyChange / prevValue) * 100 : 0;
    return { totalValue, pnl, pnlPct, totalDailyChange, dailyChangePct };
  }, [pfMarket, telegramCfg?.holdings]); // eslint-disable-line


  // 뒤로가기로 모달 닫기
  useEffect(() => {
    const handler = () => {
      if (fortuneModalOpen) { setFortuneModalOpen(false); return; }
      if (xpHelpOpen) { setXpHelpOpen(false); return; }
      if (focusTask) { setFocusTask(null); return; }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [fortuneModalOpen, xpHelpOpen, focusTask]); // eslint-disable-line
  const [quickMemoOpen, setQuickMemoOpen] = useState(false);
  const [quickMemoText, setQuickMemoText] = useState('');
  const quickMemoSavedRef = useRef('');
  const quickMemoSaved = quickMemoText === quickMemoSavedRef.current;

  const openQuickMemo = () => {
    const cur = todayData?.memo ?? '';
    setQuickMemoText(cur);
    quickMemoSavedRef.current = cur;
    setQuickMemoOpen(true);
  };

  const closeQuickMemo = () => {
    if (quickMemoText !== quickMemoSavedRef.current) {
      onSetMemo?.(quickMemoText);
      quickMemoSavedRef.current = quickMemoText;
    }
    setQuickMemoOpen(false);
  };

  useEffect(() => {
    if (!quickMemoOpen || quickMemoText === quickMemoSavedRef.current) return;
    const t = setTimeout(() => {
      onSetMemo?.(quickMemoText);
      quickMemoSavedRef.current = quickMemoText;
    }, 1500);
    return () => clearTimeout(t);
  }, [quickMemoText]); // eslint-disable-line

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
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskTime, setQuickTaskTime] = useState('');
  const [quickTaskPriority, setQuickTaskPriority] = useState(false);
  const [prevAllDone, setPrevAllDone] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [checkedId, setCheckedId] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [shortcutTipDismissed, setShortcutTipDismissed] = useState(() => store.get('dm_shortcut_tip_dismissed', false));
  const [homePrefsOpen, setHomePrefsOpen] = useState(false);
  const [homePrefs, setHomePrefs] = useState(() => ({ ...DEFAULT_HOME_PREFS, ...(store.get(HOME_PREFS_KEY, {}) || {}) }));
  const [homeSectionOrder, setHomeSectionOrder] = useState(() => normalizeHomeSectionOrder(store.get(HOME_SECTION_ORDER_KEY, HOME_SECTION_CONFIG.map(section => section.id))));
  const [showCompletedHabits, setShowCompletedHabits] = useState(false);
  const [srAnnouncement, setSrAnnouncement] = useState('');
  const habitsSectionRef = useRef(null);
  const [highlightedHomeSection, setHighlightedHomeSection] = useState(null);
  const habitSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const updateHomePrefs = (patch) => {
    setHomePrefs(prev => {
      const next = { ...prev, ...patch };
      store.set(HOME_PREFS_KEY, next);
      return next;
    });
  };

  const announce = (message) => {
    setSrAnnouncement('');
    window.setTimeout(() => setSrAnnouncement(message), 10);
  };

  const reorderHabits = (activeId, overId) => {
    if (!activeId || !overId || activeId === overId) return;
    setHabits(prev => {
      const oldIndex = prev.findIndex(item => item.id === activeId);
      const newIndex = prev.findIndex(item => item.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const reorderHomeSections = (activeId, overId) => {
    if (!activeId || !overId || activeId === overId) return;
    setHomeSectionOrder(prev => {
      const oldIndex = prev.indexOf(activeId);
      const newIndex = prev.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      store.set(HOME_SECTION_ORDER_KEY, next);
      return next;
    });
  };

  const moveHomeSectionByStep = (sectionId, step) => {
    if (!sectionId || !step) return;
    setHomeSectionOrder(prev => {
      const currentIndex = prev.indexOf(sectionId);
      if (currentIndex < 0) return prev;
      const nextIndex = currentIndex + step;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = arrayMove(prev, currentIndex, nextIndex);
      store.set(HOME_SECTION_ORDER_KEY, next);
      return next;
    });
  };

  const resetHomeCustomization = () => {
    const nextPrefs = { ...DEFAULT_HOME_PREFS };
    const nextOrder = [...DEFAULT_HOME_SECTION_ORDER];
    setHomePrefs(nextPrefs);
    setHomeSectionOrder(nextOrder);
    store.set(HOME_PREFS_KEY, nextPrefs);
    store.set(HOME_SECTION_ORDER_KEY, nextOrder);
    announce('홈 구성을 기본 추천 상태로 되돌렸습니다.');
  };

  const renderHomeSectionRow = (sectionId) => (
    <SortableHomeSectionRow
      key={sectionId}
      sectionId={sectionId}
      homePrefs={homePrefs}
      onMoveSection={moveHomeSectionByStep}
      onTogglePref={(key) => updateHomePrefs({ [key]: !homePrefs[key] })}
      orderIndex={homeSectionOrder.indexOf(sectionId)}
      totalCount={homeSectionOrder.length}
    />
  );

  const isSectionVisible = (sectionId) => {
    const sectionMeta = HOME_SECTION_CONFIG.find((section) => section.id === sectionId);
    if (!sectionMeta?.visibleKey) return true;
    return homePrefs[sectionMeta.visibleKey] !== false;
  };

  const getSectionOrder = (sectionId, fallback = 999) => {
    const index = homeSectionOrder.indexOf(sectionId);
    return index < 0 ? fallback : index * 10;
  };

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

  useEffect(() => {
    if (levelUpInfo) {
      [523, 659, 784, 1047].forEach((freq, i) => {
        setTimeout(() => playSound(freq, 320), i * 90);
      });
    }
  }, [levelUpInfo]); // eslint-disable-line

  const startEditTasks = () => {
    setDraftTasks((todayData?.tasks || []).map(t => ({ ...t })));
    setEditingTasks(true);
  };
  const saveTaskEdits = () => {
    onSetTodayTasks(draftTasks);
    setEditingTasks(false);
  };
  const addQuickTask = () => {
    const title = quickTaskTitle.trim();
    if (!title) return;
    const tasks = [...(todayData?.tasks || [])];
    const emptyIdx = tasks.findIndex(t => !t.title?.trim());
    const newTask = {
      id: `t${Date.now()}`,
      title,
      time: quickTaskTime || undefined,
      done: false,
      checkedAt: null,
      priority: quickTaskPriority,
    };
    if (emptyIdx >= 0) tasks[emptyIdx] = newTask;
    else tasks.push(newTask);
    onSetTodayTasks(tasks);
    setQuickTaskTitle('');
    setQuickTaskTime('');
    setQuickTaskPriority(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const focus = params.get('focus');
    if (focus !== 'habits') return;
    const timeoutId = window.setTimeout(() => {
      habitsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setHighlightedHomeSection('habits');
      window.setTimeout(() => setHighlightedHomeSection(null), 2200);
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, []);
  return (
    <div style={S.content}>
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>{srAnnouncement}</div>
      {/* ── 레벨업 모달 ─────────────────────────────────────── */}
      {levelUpInfo && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={onDismissLevelUp}>
          <div className="dm-levelup-card" style={{ background: "var(--dm-card)", border: "1.5px solid rgba(108,142,255,.5)", borderRadius: 28, padding: "40px 32px", textAlign: "center", minWidth: 260, maxWidth: 320, position: "relative", boxShadow: "0 0 60px rgba(108,142,255,.35)" }}
            onClick={e => e.stopPropagation()}>
            {/* 배경 빛 효과 */}
            <div style={{ position: "absolute", inset: 0, borderRadius: 28, background: "radial-gradient(circle at 50% 30%, rgba(108,142,255,.25), transparent 70%)", pointerEvents: "none" }} />
            <div style={{ position: "relative", display: "inline-block", marginBottom: 8 }}>
              <div style={{ position: "absolute", inset: -12, borderRadius: "50%", background: "radial-gradient(circle, rgba(252,211,77,.35), transparent 70%)", animation: "dm-levelup-pulse 2s ease-in-out infinite alternate", pointerEvents: "none" }} />
              <div style={{ fontSize: 64, filter: "drop-shadow(0 0 20px rgba(252,211,77,.8))", position: "relative" }}>{levelUpInfo.icon}</div>
            </div>
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
      {fortuneModalOpen && (() => {
        const isFsTab = fortuneTab === 'saju' || fortuneTab === 'tojeong';
        return (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.75)", display: "flex", alignItems: isFsTab ? "stretch" : "flex-end", justifyContent: "center" }}
          onClick={() => setFortuneModalOpen(false)}>
          <div style={{ background: "var(--dm-card)", border: "1px solid rgba(255,255,255,.1)", borderRadius: isFsTab ? 0 : "24px 24px 0 0", padding: "20px 16px 24px", width: "100%", maxHeight: isFsTab ? "100%" : "calc(90vh - 84px)", marginBottom: isFsTab ? 0 : 84, overflowY: "auto" }}
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
              <div style={{ padding: "4px 0" }}>
                <div style={{ textAlign: 'center', padding: '18px 0 14px' }}>
                  <div className="dm-spin" style={{ fontSize: 36 }}>🔮</div>
                  <div style={{ fontSize: 13, color: 'var(--dm-muted)', marginTop: 10, fontWeight: 700 }}>운세를 읽는 중<span style={{ display: 'inline-block', minWidth: 18, textAlign: 'left' }}>...</span></div>
                </div>
                <div className="dm-skeleton" style={{ height: 80, borderRadius: 14, marginBottom: 14 }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {[1,2,3,4].map(i => <div key={i} className="dm-skeleton" style={{ height: 72, borderRadius: 10 }} />)}
                </div>
                <div className="dm-skeleton" style={{ height: 68, borderRadius: 10, marginBottom: 10 }} />
                <div className="dm-skeleton" style={{ height: 44, borderRadius: 10, marginBottom: 10 }} />
                <div style={{ display: "flex", gap: 10 }}>
                  <div className="dm-skeleton" style={{ flex: 1, height: 52, borderRadius: 10 }} />
                  <div className="dm-skeleton" style={{ flex: 1, height: 52, borderRadius: 10 }} />
                </div>
              </div>
            ) : fortuneError ? (
              <div style={{ textAlign: "center", padding: "24px 16px" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>😶‍🌫️</div>
                <div style={{ fontSize: 13, color: "var(--dm-muted)", marginBottom: 14 }}>운세를 불러오지 못했어요.<br/>네트워크를 확인하고 다시 시도해보세요.</div>
                <button onClick={loadFortune} style={{ ...S.btn, width: "auto", padding: "10px 24px", fontSize: 13 }}>🔄 다시 시도</button>
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
                    {/* 주간 운세 히스토리 미니 차트 */}
                    {fortuneWeekHistory.some(d => d.overall !== null) && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 6, textAlign: "center" }}>7일 운세 흐름</div>
                        <div style={{ display: "flex", gap: 4, alignItems: "flex-end", justifyContent: "center", height: 36 }}>
                          {fortuneWeekHistory.map((d, i) => {
                            const pts = d.overall ? d.overall * 20 : 0;
                            const isToday = i === 6;
                            const barColor = pts >= 80 ? "#4ADE80" : pts >= 60 ? "#FCD34D" : pts > 0 ? "#F87171" : "var(--dm-row)";
                            return (
                              <div key={d.dateStr} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: 1 }}>
                                <div style={{ width: "100%", maxWidth: 28, height: d.overall ? `${Math.max(4, pts * 0.32)}px` : 4, background: barColor, borderRadius: 3, opacity: isToday ? 1 : 0.6, border: isToday ? `1.5px solid ${barColor}` : "none" }} />
                                <div style={{ fontSize: 9, color: isToday ? "var(--dm-text)" : "var(--dm-muted)", fontWeight: isToday ? 900 : 400 }}>{d.dow}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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
      );})()}

      {/* ── 포커스 모드 모달 ─────────────────────────────────── */}
      {focusTask && (
        <FocusTimerModal
          task={focusTask}
          onClose={() => setFocusTask(null)}
          onToggleTask={onToggleTask}
          onXp={(xp) => triggerXpFloat(xp)}
        />
      )}

      {showConfetti && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, pointerEvents:'none', zIndex:500, overflow:'hidden' }}>
          {Array(36).fill(null).map((_,i) => (
            <div key={i} style={{
              position:'absolute',
              left: `${(i * 2.8 + 1.5) % 100}%`,
              top: '-20px',
              fontSize: 18 + (i % 3) * 4,
              animation: `fall ${1.2 + (i % 6) * 0.18}s ease-in forwards`,
              animationDelay: `${(i % 12) * 0.07}s`,
            }}>{['🎉','⭐','✨','🎊','💫','🌟','🎈','🏆'][i%8]}</div>
          ))}
        </div>
      )}
      <div style={S.topbar}>
        <div>
          <div style={S.title}>{user.name}님</div>
          <div style={S.sub}>{formatKoreanDate(today)} · {clock.toLocaleTimeString('ko-KR', { hour12: false })}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setIsDark?.(d => !d)} style={{ ...S.btnGhost, marginTop: 0, width: 36, height: 36, padding: 0, borderRadius: '50%', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <button onClick={() => setHomePrefsOpen(true)} style={{ ...S.btnGhost, marginTop: 0, width: 36, height: 36, padding: 0, borderRadius: '50%', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ≡
          </button>
          <button onClick={onOpenChat} style={{ ...S.btnGhost, marginTop: 0, width: 40, height: 40, padding: 0, borderRadius: '50%', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✦
          </button>
        </div>
      </div>

      {showInstallBanner && (
        <div
          onClick={() => { if (canDirectInstall) handleInstall(); }}
          style={{ margin: "0 0 12px 0", borderRadius: 14, background: "var(--dm-card)", border: "1.5px solid #4B6FFF", padding: "12px 14px", boxShadow: "0 2px 12px rgba(75,111,255,.2)", cursor: canDirectInstall ? 'pointer' : 'default' }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 22 }}>📲</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>홈 화면에 설치하기</div>
              <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 1 }}>
                {canDirectInstall ? '이 배너를 누르면 바로 설치돼요' : '앱처럼 빠르게 실행돼요'}
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); dismissInstallBanner(); }} style={{ background: "transparent", border: "none", color: "var(--dm-muted)", fontSize: 16, cursor: "pointer", padding: 4, lineHeight: 1 }}>✕</button>
          </div>
          {installPrompt ? (
            <button onClick={(e) => { e.stopPropagation(); handleInstall(); }} style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>설치하기</button>
          ) : (
            <div style={{ padding: "8px 10px", borderRadius: 8, background: "var(--dm-bg)", fontSize: 12, color: "var(--dm-sub)", lineHeight: 2 }}>
              {isIOS ? <>1️⃣ 하단 <b style={{color:"var(--dm-text)"}}>공유(□↑)</b> 버튼 → 2️⃣ <b style={{color:"var(--dm-text)"}}>홈 화면에 추가</b> → 3️⃣ <b style={{color:"var(--dm-text)"}}>추가</b></> : <>Chrome <b style={{color:"var(--dm-text)"}}>⋮ 메뉴</b> → <b style={{color:"var(--dm-text)"}}>앱 설치</b> 또는 <b style={{color:"var(--dm-text)"}}>홈 화면에 추가</b></>}
            </div>
          )}
        </div>
      )}

      {showInviteBanners && recentInviteReward && (
        <div style={{ margin: "0 0 12px 0", borderRadius: 16, background: "linear-gradient(135deg,rgba(74,222,128,.18),rgba(108,142,255,.08))", border: "1.5px solid rgba(74,222,128,.3)", padding: "13px 15px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#4ADE80", marginBottom: 3 }}>초대 보상이 적용됐어요</div>
              <div style={{ fontSize: 11, color: "var(--dm-sub)", lineHeight: 1.6 }}>
                코드 <b style={{ color: "var(--dm-text)" }}>{recentInviteReward.code}</b> 적용 완료. 이번 주 랭킹도 같이 올려보세요.
              </div>
            </div>
            <button onClick={onDismissInviteReward} style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', cursor: 'pointer', fontSize: 16, padding: 4, lineHeight: 1 }}>
              ✕
            </button>
          </div>
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

      {/* 바로가기 팁 (PWA 설치된 경우 1회만) */}
      {isStandalone && !shortcutTipDismissed && (
        <div style={{ margin: "0 16px 10px", borderRadius: 12, background: "var(--dm-card)", border: "1px solid var(--dm-border)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>💡</span>
          <span style={{ flex: 1, fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.5 }}>홈 화면 아이콘을 <b style={{ color: "var(--dm-text)" }}>꾹 누르면</b> 오늘 할 일과 오늘 습관 바로가기를 바로 열 수 있어요.</span>
          <button onClick={() => { setShortcutTipDismissed(true); store.set('dm_shortcut_tip_dismissed', true); }}
            style={{ background: "transparent", border: "none", color: "var(--dm-muted)", fontSize: 16, cursor: "pointer", padding: 4 }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
            {isSectionVisible('level') && (
            <div style={{ order: getSectionOrder('level') }}>
            <div style={{ ...S.card, margin: "0 16px 10px", background: "linear-gradient(135deg,rgba(75,111,255,.15),rgba(108,142,255,.07))", border: "1.5px solid rgba(108,142,255,.35)", padding: "12px 14px" }}>
              {/* ── 항상 보이는 한 줄 요약 ── */}
              <button
                onClick={() => setLevelExpanded(v => !v)}
                style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 10 }}
              >
                <span style={{ fontSize: 24 }}>{levelInfo.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 900, color: "var(--dm-text)" }}>{levelInfo.title}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#6C8EFF" }}>Lv.{levelInfo.level}</span>
                <span style={{ fontSize: 12, color: "var(--dm-muted)", marginLeft: 2 }}>· {totalScore.toLocaleString()} XP</span>
                {streak > 0 && <span style={{ fontSize: 12, color: "#F97316", fontWeight: 900, marginLeft: 2 }}>🔥{streak}</span>}
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--dm-muted)" }}>
                  {(() => { const pct = filledCount > 0 ? Math.round((doneCount / filledCount) * 100) : 0; return `${doneCount}/${filledCount || 0} (${pct}%)`; })()}
                </span>
                <span style={{ fontSize: 11, color: "var(--dm-muted)", marginLeft: 6 }}>{levelExpanded ? '▲' : '▼'}</span>
              </button>
              {/* ── 프로그레스 바 (항상 표시) ── */}
              <div style={{ height: 4, background: "var(--dm-row)", borderRadius: 4, overflow: "hidden", marginTop: 8 }}>
                <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#4B6FFF,#6C8EFF)", width: `${levelInfo.progress}%`, transition: "width 0.4s" }} />
              </div>
              {/* ── 펼쳐지는 상세 ── */}
              {levelExpanded && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {myRank && (
                        <button onClick={onOpenStats} style={{ background: "rgba(75,111,255,.15)", border: "1px solid rgba(108,142,255,.4)", borderRadius: 20, padding: "5px 12px", cursor: "pointer", textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 1 }}>전체 순위</div>
                          <div style={{ fontSize: 15, fontWeight: 900, color: "#6C8EFF" }}>🏆 {myRank.rank}위</div>
                          <div style={{ fontSize: 10, color: "var(--dm-muted)" }}>{myRank.total}명 중</div>
                        </button>
                      )}
                      {(() => {
                        const fl = fortuneLevel(todayFortuneScore);
                        return (
                          <button onClick={() => { if (!fortuneData && birthDate) loadFortune(); setFortuneModalOpen(true); history.pushState({ modal: 'fortune' }, ''); }} style={{
                            background: todayFortuneScore ? `${fl.color}1a` : "rgba(167,139,250,.08)",
                            border: `1px solid ${todayFortuneScore ? `${fl.color}66` : "rgba(167,139,250,.3)"}`,
                            borderRadius: 20, padding: "5px 12px", cursor: "pointer", textAlign: "center",
                          }}>
                            <div style={{ fontSize: 10, color: "var(--dm-muted)", marginBottom: 1 }}>오늘의 운세</div>
                            <div style={{ fontSize: 14, fontWeight: 900, color: fl.color }}>{fl.label}</div>
                            <div style={{ fontSize: 10, color: "var(--dm-muted)" }}>{fl.desc}</div>
                          </button>
                        );
                      })()}
                    </div>
                    <div style={{ position: "relative" }}>
                      {xpFloat && (
                        <div key={xpFloat.key} className="xp-float"
                          style={{ top: xpFloatPos.top, left: xpFloatPos.left }}
                          onAnimationEnd={() => setXpFloat(null)}>
                          +{xpFloat.xp} XP
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 28, fontWeight: 900, color: "var(--dm-text)", letterSpacing: -1 }}>{totalScore.toLocaleString()}</span>
                        <span style={{ fontSize: 13, color: "#6C8EFF", fontWeight: 700 }}>XP</span>
                        <button onClick={() => { setXpHelpOpen(true); history.pushState({ modal: 'xp' }, ''); }} style={{
                          background: "rgba(108,142,255,.18)", border: "1px solid rgba(108,142,255,.4)",
                          borderRadius: 999, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", fontSize: 11, color: "#6C8EFF", fontWeight: 900, padding: 0, lineHeight: 1,
                        }}>?</button>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>
                      {streak > 0 && streak % 7 !== 0 && <span style={{ color: "#FCD34D", fontWeight: 700 }}>{7 - (streak % 7)}일 후 주간 보너스 · </span>}
                      다음 레벨까지 {(levelInfo.nextFloor - totalScore).toLocaleString()} XP
                    </span>
                    <span style={{ fontSize: 11, color: "var(--dm-muted)" }}>오늘 +{todayScore}pt · 이달 {monthScore}pt</span>
                  </div>
                </div>
              )}
            </div>
            </div>
            )}
            {isSectionVisible('quote') && (
            <div style={{ order: getSectionOrder('quote') }}>
          <div style={{ margin: "0 16px 10px", borderRadius: 16, background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.06)", padding: "12px 14px", boxShadow: "none" }}>
            <div style={{ fontSize: 10, color: "var(--dm-muted)", fontWeight: 900, marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>오늘의 명언</div>
            <div style={{ fontSize: 13, color: "var(--dm-text)", fontWeight: 700, lineHeight: 1.55, marginBottom: 5, opacity: 0.9 }}>"{todayQuote.text}"</div>
            <div style={{ fontSize: 11, color: "var(--dm-muted)", textAlign: "right" }}>— {todayQuote.author}</div>
          </div>
      </div>
      )}



      {isSectionVisible('tasks') && (
      <div style={{ order: getSectionOrder('tasks') }}>
      <div style={{ ...S.sectionTitle, justifyContent: "space-between", paddingRight: 16, paddingTop: 18 }}>
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
      <div style={{
        ...S.card,
        border: allDone && !editingTasks ? "1.5px solid #4ADE80" : "1.5px solid rgba(108,142,255,.28)",
        background: allDone && !editingTasks
          ? "linear-gradient(135deg, rgba(74,222,128,.12), rgba(108,142,255,.08))"
          : "linear-gradient(135deg, rgba(108,142,255,.12), rgba(108,142,255,.04))",
        boxShadow: allDone && !editingTasks
          ? "0 10px 26px rgba(74,222,128,.12), inset 0 1px 0 rgba(255,255,255,.08)"
          : "0 12px 28px rgba(75,111,255,.12), inset 0 1px 0 rgba(255,255,255,.08)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 800, marginBottom: 3 }}>오늘 실행할 핵심</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "var(--dm-text)" }}>
              {filledCount === 0 ? '아직 비어 있어요' : `${doneCount}/${filledCount} 완료`}
            </div>
          </div>
          <div style={{
            minWidth: 58,
            height: 58,
            borderRadius: 18,
            background: allDone ? 'rgba(74,222,128,.14)' : 'rgba(108,142,255,.12)',
            border: `1px solid ${allDone ? 'rgba(74,222,128,.28)' : 'rgba(108,142,255,.24)'}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: allDone ? '#4ADE80' : '#6C8EFF', lineHeight: 1 }}>{filledCount > 0 ? Math.round((doneCount / filledCount) * 100) : 0}%</div>
            <div style={{ fontSize: 9, color: 'var(--dm-muted)', marginTop: 2 }}>완료율</div>
          </div>
        </div>
        {!editingTasks && (
          <div style={{
            marginBottom: 14,
            padding: '12px',
            borderRadius: 16,
            border: '1px solid rgba(108,142,255,.18)',
            background: 'rgba(255,255,255,.03)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--dm-text)' }}>바로 추가</div>
              <button
                type="button"
                onClick={() => setQuickTaskPriority(v => !v)}
                style={{
                  border: `1px solid ${quickTaskPriority ? 'rgba(108,142,255,.45)' : 'var(--dm-border)'}`,
                  background: quickTaskPriority ? 'rgba(108,142,255,.16)' : 'transparent',
                  color: quickTaskPriority ? '#6C8EFF' : 'var(--dm-muted)',
                  borderRadius: 999,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                중요
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input
                style={{ ...S.input, flex: 1, marginBottom: 0 }}
                value={quickTaskTitle}
                onChange={(e) => setQuickTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addQuickTask();
                }}
                placeholder="지금 바로 추가할 할일"
                maxLength={60}
              />
              <button
                type="button"
                onClick={addQuickTask}
                disabled={!quickTaskTitle.trim()}
                style={{
                  ...S.btn,
                  width: 'auto',
                  minWidth: 64,
                  marginTop: 0,
                  padding: '0 18px',
                  opacity: quickTaskTitle.trim() ? 1 : 0.5,
                }}
              >
                추가
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--dm-muted)' }}>시간</span>
              <input
                type="time"
                value={quickTaskTime}
                onChange={(e) => setQuickTaskTime(e.target.value)}
                style={{ ...S.input, width: 118, padding: '8px 10px', fontSize: 12, marginBottom: 0 }}
              />
              {quickTaskTime && (
                <button
                  type="button"
                  onClick={() => setQuickTaskTime('')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 12, cursor: 'pointer', padding: 0 }}
                >
                  시간 제거
                </button>
              )}
            </div>
          </div>
        )}
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
            <div style={{ color: "var(--dm-muted)", fontSize: 14, marginBottom: 10 }}>
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
      </div>
      )}

      {/* 오늘의 챌린지 요약 */}
      {isSectionVisible('challenges') && (
      <div style={{ order: getSectionOrder('challenges') }}>
      {myChallenges.length > 0 && (() => {
        const today = toDateStr();
        return (
          <div style={{ margin: '0 16px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🏁</span> 오늘의 챌린지
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {myChallenges.map(c => {
                const streak = c.myMember?.streak || 0;
                const lastCert = c.myMember?.lastCertDate;
                const certedToday = lastCert === today;
                return (
                  <div key={c.id} style={{ background: 'var(--dm-card)', border: `1.5px solid ${certedToday ? 'rgba(74,222,128,.4)' : 'var(--dm-border)'}`, borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 20 }}>{certedToday ? '✅' : '⬜'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--dm-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--dm-muted)' }}>{certedToday ? '오늘 인증 완료' : '오늘 인증 대기 중'} · 🔥 {streak}일 연속</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenChallengeItem?.(c.id) || onOpenChallengeHub?.()}
                      style={{
                        border: '1px solid rgba(108,142,255,.28)',
                        background: 'rgba(108,142,255,.12)',
                        color: '#6C8EFF',
                        borderRadius: 999,
                        padding: '6px 10px',
                        fontSize: 11,
                        fontWeight: 900,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      바로가기
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
      </div>
      )}

      {isSectionVisible('someday') && (
      <div style={{ order: getSectionOrder('someday') }}>
      <div style={{ ...S.sectionTitle, justifyContent: 'space-between', paddingRight: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={S.sectionEmoji}>📋</span>언젠가 할일
          {someday.length > 0 && <span style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 400 }}>{someday.length}개</span>}
        </span>
        <button onClick={() => setSomedayCollapsed(v => !v)}
          style={{ fontSize: 11, color: "var(--dm-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px", fontWeight: 700 }}>
          {somedayCollapsed ? "펼치기 ▼" : "접기 ▲"}
        </button>
      </div>
      {!somedayCollapsed && <div style={S.card}>
        {someday.length === 0 && (
          <div style={{ textAlign: "center", padding: "10px 0 6px" }}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>📋</div>
            <div style={{ fontSize: 12, color: "var(--dm-muted)", lineHeight: 1.6 }}>언젠가 하고 싶은 일을 적어두세요<br/>오늘 할일로 언제든 옮길 수 있어요</div>
          </div>
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
      </div>}
      </div>
      )}

      {isSectionVisible('habits') && (
      <div style={{ order: getSectionOrder('habits') }}>
      <div ref={habitsSectionRef} style={{ borderRadius: 22, boxShadow: highlightedHomeSection === 'habits' ? '0 0 0 2px rgba(167,139,250,.35)' : 'none', transition: 'box-shadow 180ms ease' }}>
      {(() => {
        const habitChecks = todayData?.habitChecks || {};
        const doneHabits = habits.filter(h => habitChecks[h.id]).length;
        const allHabitsDone = habits.length > 0 && doneHabits === habits.length;
        const visibleHabits = showCompletedHabits ? habits : habits.filter(h => !habitChecks[h.id]);
        const hiddenDoneCount = Math.max(doneHabits - (showCompletedHabits ? doneHabits : 0), 0);
        return (
          <>
            <div style={{ ...S.sectionTitle, justifyContent: "space-between", paddingRight: 16 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={S.sectionEmoji}>🎯</span>오늘 습관
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
                  {(habits || []).length > 1 && (
                    <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginBottom: 10 }}>
                      왼쪽 핸들을 잡고 끌어서 오늘 습관 순서를 바꿀 수 있어요.
                    </div>
                  )}
                  <DndContext
                    sensors={habitSensors}
                    collisionDetection={closestCenter}
                    onDragStart={() => {
                      vibrateIfAvailable(12);
                      announce('습관 순서 이동을 시작했습니다. 원하는 위치에서 손을 떼면 순서가 바뀝니다.');
                    }}
                    onDragCancel={() => {}}
                    onDragEnd={({ active, over }) => {
                      reorderHabits(active?.id, over?.id);
                      vibrateIfAvailable(over?.id && active?.id !== over?.id ? [14, 28, 12] : 10);
                      if (active?.id && over?.id && active.id !== over.id) {
                        const activeHabit = habits.find(h => h.id === active.id);
                        announce(`${activeHabit?.name || '습관'} 순서를 변경했습니다.`);
                      }
                    }}
                  >
                    <SortableContext items={(habits || []).map(h => h.id)} strategy={verticalListSortingStrategy}>
                      {(habits || []).map((h) => (
                        <SortableHabitRow
                          key={h.id}
                          habit={h}
                          setHabits={setHabits}
                          onRemove={(habitId) => setHabits(prev => prev.filter(x => x.id !== habitId))}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
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
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(167,139,250,.12)', border: '1px solid rgba(167,139,250,.24)', fontSize: 11, fontWeight: 800, color: '#C4B5FD' }}>
                      진행 {habits.length - doneHabits}개
                    </div>
                    <div style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(74,222,128,.12)', border: '1px solid rgba(74,222,128,.24)', fontSize: 11, fontWeight: 800, color: '#86EFAC' }}>
                      완료 {doneHabits}개
                    </div>
                    {doneHabits > 0 && !allHabitsDone && (
                      <button
                        type="button"
                        onClick={() => setShowCompletedHabits(v => !v)}
                        style={{
                          border: '1px solid var(--dm-border)',
                          background: 'transparent',
                          color: 'var(--dm-muted)',
                          borderRadius: 999,
                          padding: '6px 10px',
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        {showCompletedHabits ? '완료 숨기기' : `완료 ${hiddenDoneCount}개 숨김`}
                      </button>
                    )}
                  </div>
                  <div style={{ height: 6, background: "var(--dm-row)", borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
                    <div style={{
                      height: "100%", borderRadius: 3, transition: "width 0.3s",
                      background: allHabitsDone ? "#4ADE80" : "#A78BFA",
                      width: habits.length === 0 ? "0%" : `${(doneHabits / habits.length) * 100}%`,
                    }} />
                  </div>
                  {visibleHabits.map((h, i) => {
                    const checked = !!habitChecks[h.id];
                    const linkedChallenges = linkedChallengesByHabit[h.id] || [];
                    return (
                      <div key={h.id} onClick={() => {
                        navigator.vibrate?.(50);
                        if (!checked) { setHabitCheckedId(h.id); setTimeout(() => setHabitCheckedId(null), 400); }
                        onToggleHabit(h.id);
                      }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                          borderBottom: i < visibleHabits.length - 1 ? `1px solid var(--dm-row)` : "none",
                          cursor: "pointer" }}>
                        <div className={habitCheckedId === h.id ? "dm-check-bounce" : ""}
                          style={{
                          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                          border: checked ? "none" : "2px solid #3A4260",
                          background: checked ? "#A78BFA" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "background 0.2s",
                        }}>
                          {checked && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>{h.icon}</span>
                        <div style={{
                          fontSize: 14, fontWeight: 700, flex: 1,
                          color: checked ? "var(--dm-muted)" : "var(--dm-text)",
                          textDecoration: checked ? "line-through" : "none",
                        }}>{h.name || "(이름 없음)"}</div>
                        {linkedChallenges.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenChallengeHub?.();
                            }}
                            title={linkedChallenges.map(c => c.title).join(', ')}
                            style={{
                              border: '1px solid rgba(108,142,255,.28)',
                              background: 'rgba(108,142,255,.12)',
                              color: '#6C8EFF',
                              borderRadius: 999,
                              padding: '4px 8px',
                              fontSize: 11,
                              fontWeight: 900,
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            🏁 {linkedChallenges.length}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {!showCompletedHabits && visibleHabits.length === 0 && habits.length > 0 && (
                    <div style={{ padding: '8px 0 2px', fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center' }}>
                      남은 습관이 없어요. 완료한 항목을 펼쳐서 다시 볼 수 있어요.
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        );
      })()}
      </div>
      </div>
      )}

      {/* 반복 할일 관리 */}
      {isSectionVisible('recurring') && (
      <div style={{ order: getSectionOrder('recurring') }}>
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
          {(recurringTasks || []).length === 0 && (
            <div style={{ textAlign: "center", padding: "10px 0 6px" }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>🔁</div>
              <div style={{ fontSize: 12, color: "var(--dm-muted)", lineHeight: 1.6 }}>매일 자동으로 추가될 할일을 등록해보세요</div>
            </div>
          )}
        </div>
      )}
      </div>
      )}

      <div style={{ height: 8 }} />

      {/* ── 목표 이동 링크 ───────────────────────────────────── */}
      {isSectionVisible('goalsShortcut') && (
        <div style={{ order: getSectionOrder('goalsShortcut') }}>
        <div style={{ ...S.sectionTitle, justifyContent: "space-between", paddingRight: 16 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={S.sectionEmoji}>🗓️</span>목표
          </span>
          <span style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>
            연간 {yearGoals.length}개 · 월별 목표 {monthGoals.length}개
          </span>
        </div>
        <div style={S.card}>
          <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.65, marginBottom: 14 }}>
            홈은 오늘 할 일에만 집중하고, 중장기 목표는 달력 화면에서 관리하도록 분리했습니다.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ padding: "7px 10px", borderRadius: 999, background: "rgba(108,142,255,.12)", color: "#AFC0FF", fontSize: 11, fontWeight: 800 }}>
              올해 목표 {yearGoals.length}개
            </div>
            <div style={{ padding: "7px 10px", borderRadius: 999, background: "rgba(255,255,255,.05)", color: "var(--dm-text)", fontSize: 11, fontWeight: 800 }}>
              월별 목표 {monthGoals.length}개
            </div>
          </div>
          <button onClick={onOpenGoalsHub} style={{ ...S.btn, marginTop: 0 }}>
            달력에서 목표 보기 →
          </button>
        </div>
        </div>
      )}

      {isSectionVisible('portfolio') && (telegramCfg?.holdings?.length > 0 || pfSummary) && (
        <div style={{ order: getSectionOrder('portfolio') }}>
          <div style={{ ...S.sectionTitle, justifyContent: "space-between", paddingRight: 16 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={S.sectionEmoji}>💼</span>자산 브리핑
            </span>
            <button onClick={onOpenPortfolio}
              style={{ fontSize: 11, fontWeight: 900, color: "var(--dm-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}>
              허브 →
            </button>
          </div>
          <div style={{ ...S.card, marginBottom: 10 }}>
            {pfLoading && <div style={{ textAlign: "center", fontSize: 12, color: "var(--dm-muted)", padding: "12px 0" }}>시세 불러오는 중...</div>}
            {!pfLoading && pfSummary && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 2 }}>총 평가금액</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "var(--dm-text)" }}>
                    ${pfSummary.totalValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ fontSize: 12, color: pfSummary.pnl >= 0 ? "#4ADE80" : "#F87171", marginTop: 2, fontWeight: 700 }}>
                    {pfSummary.pnl >= 0 ? "+" : ""}{pfSummary.pnl.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}$ ({pfSummary.pnlPct >= 0 ? "+" : ""}{pfSummary.pnlPct.toFixed(1)}%)
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 2 }}>오늘 변동</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: pfSummary.totalDailyChange >= 0 ? "#4ADE80" : "#F87171" }}>
                    {pfSummary.totalDailyChange >= 0 ? "+" : ""}{pfSummary.totalDailyChange.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}$
                  </div>
                  <div style={{ fontSize: 11, color: pfSummary.dailyChangePct >= 0 ? "#4ADE80" : "#F87171" }}>
                    {pfSummary.dailyChangePct >= 0 ? "+" : ""}{pfSummary.dailyChangePct.toFixed(2)}%
                  </div>
                </div>
              </div>
            )}
            {!pfLoading && !pfSummary && (
              <div style={{ fontSize: 12, color: "var(--dm-muted)", textAlign: "center", padding: "8px 0" }}>
                시세 데이터를 불러올 수 없어요
              </div>
            )}
          </div>
        </div>
      )}
      </div>
      <div style={{ height: 12 }} />

      <HomeCustomizationModal
        open={homePrefsOpen}
        homeSectionOrder={homeSectionOrder}
        renderSectionRow={renderHomeSectionRow}
        onReset={resetHomeCustomization}
        onClose={() => setHomePrefsOpen(false)}
      />

      {showInvitePrompt && (
        <div onClick={onDismissInvitePrompt} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.48)', zIndex: 270,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px'
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', maxWidth: 360, borderRadius: 24, background: 'var(--dm-bg)', border: '1px solid var(--dm-border2)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.32)', padding: '22px 20px 18px'
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🎁</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--dm-text)', marginBottom: 8 }}>초대 보상이 도착했어요</div>
            <div style={{ fontSize: 13, color: 'var(--dm-sub)', lineHeight: 1.7, marginBottom: 16 }}>
              친구 초대 코드 <b style={{ color: '#6C8EFF' }}>{invitePromptCode}</b> 를 적용하면 바로 <b style={{ color: '#4ADE80' }}>+100 XP</b>를 받을 수 있어요.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onDismissInvitePrompt} style={{ ...S.btnGhost, flex: 1, marginTop: 0 }}>나중에</button>
              <button onClick={onOpenInviteFlow} style={{ ...S.btn, flex: 1, marginTop: 0 }}>지금 받기</button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── 빠른 메모 플로팅 버튼 ────────────────────────────── */}
      {onSetMemo && (
        <button
          onClick={openQuickMemo}
          aria-label="빠른 메모"
          style={{
            position: 'fixed', bottom: 96, right: 18, zIndex: 200,
            width: 50, height: 50, borderRadius: 999,
            background: 'rgba(108,142,255,0.18)', border: '1.5px solid rgba(108,142,255,0.4)',
            fontSize: 20, cursor: 'pointer', backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 18px rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >📝</button>
      )}

      {/* ── 빠른 메모 모달 ──────────────────────────────────── */}
      {quickMemoOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }}
          onClick={closeQuickMemo}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', background: 'var(--dm-card)', borderRadius: '20px 20px 0 0', padding: '18px 16px 36px', border: '1px solid var(--dm-border2)', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--dm-text)' }}>📝 오늘 메모</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 11, color: quickMemoSaved ? '#4ADE80' : '#6C8EFF', fontWeight: 700, transition: 'color 0.3s' }}>
                  {quickMemoSaved ? '✓ 저장됨' : '저장 중...'}
                </span>
                <button
                  onClick={closeQuickMemo}
                  style={{ background: 'transparent', border: 'none', color: 'var(--dm-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0 }}
                >✕</button>
              </div>
            </div>
            <textarea
              autoFocus
              rows={8}
              value={quickMemoText}
              onChange={e => setQuickMemoText(e.target.value)}
              placeholder="업무 메모, 떠오른 생각, 할 일... 뭐든 적어요."
              maxLength={1200}
              style={{ ...S.input, resize: 'none', lineHeight: 1.7, flex: 1, minHeight: 0, marginBottom: 6 }}
            />
            <div style={{ fontSize: 11, color: 'var(--dm-muted)', textAlign: 'right' }}>
              {quickMemoText.length} / 1200
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
