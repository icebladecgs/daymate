import { useEffect, useRef, useState } from "react";
import { onAuth, googleSignIn, googleSignOut, saveSettings, saveGoals, saveDay as fsaveDay, loadAllFromFirestore, uploadLocalToFirestore, googleSignInWithCalendarScope, googleSignInWithDriveScope, updateUserMeta, updateRanking, registerInviteCode, loadRankings, loadTodayCommunityEvents } from "./firebase.js";
import { store } from "./utils/storage.js";
import { toDateStr, getWeekKey } from "./utils/date.js";
import { driveBackup } from "./api/drive.js";
import { sendTelegramMessage } from "./api/telegram.js";
import { scheduler } from "./api/scheduler.js";
import { gcalDeleteEvent, gcalCreateEvent, gcalUpdateEvent, gcalFetchRangeEvents } from "./api/gcal.js";
import { newDay, loadDay, saveDay, listAllDays } from "./data/model.js";
import { calcDayScore, calcLevel, calcStreak, calcStreakBonus } from "./data/stats.js";
import S from "./styles.js";
import Toast from "./components/Toast.jsx";
import BottomNav from "./components/BottomNav.jsx";
import Home from "./screens/Home.jsx";
import Today from "./screens/Today.jsx";
import History from "./screens/History.jsx";
import Stats from "./screens/Stats.jsx";
import DayDetail from "./screens/DayDetail.jsx";
import Settings from "./screens/Settings.jsx";
import Admin from "./screens/Admin.jsx";
import Chat from "./screens/Chat.jsx";
import Community from "./screens/Community.jsx";
import InvestDiary from "./screens/InvestDiary.jsx";
import LifeCoach from "./screens/LifeCoach.jsx";

export default function App() {
  const [screen, setScreen] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const inviteParam = params.get('invite');
      if (inviteParam) store.set('dm_pending_invite', inviteParam.toUpperCase());
      const s = params.get('screen') || window.location.hash.replace('#','');
      if (s) return s;
    } catch {}
    return "home";
  });
  const screenRef = useRef(null);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  // 안드로이드 뒤로가기 처리
  useEffect(() => {
    history.replaceState({ screen: 'home', isRoot: true }, '', window.location.href);
    history.pushState({ screen: 'home', isRoot: false }, '', window.location.href);
    const handler = (e) => {
      if (!e.state || e.state.isRoot) {
        const confirmed = window.confirm('앱을 종료하시겠습니까?');
        if (!confirmed) {
          history.pushState({ screen: screenRef.current, isRoot: false }, '', `?screen=${screenRef.current}`);
        }
      } else {
        setScreen(e.state.screen);
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [toast, setToast] = useState("");
  const [communityUnread, setCommunityUnread] = useState(0);

  // PWA 설치 프롬프트
  const [installPrompt, setInstallPrompt] = useState(null);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isKakao = /KAKAOTALK/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const fromKakao = new URLSearchParams(window.location.search).get('from_kakao') === '1';
  const [showInstallBanner, setShowInstallBanner] = useState(() => {
    if (isStandalone) return false;
    if (fromKakao) return true; // 카카오에서 넘어온 경우 항상 설치 배너 표시
    if (store.get('dm_install_dismissed')) return false;
    return isIOS;
  });
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      if (!isStandalone && !store.get('dm_install_dismissed')) setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') { setShowInstallBanner(false); store.set('dm_install_dismissed', true); }
    setInstallPrompt(null);
  };
  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    store.set('dm_install_dismissed', true);
  };

  const [authUser, setAuthUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle');
  const syncReadyRef = useRef(false);
  const gcalRefreshTimerRef = useRef(null);
  const driveRefreshTimerRef = useRef(null);

  const [gcalToken, setGcalToken] = useState(() => store.get('dm_gcal_token', null));
  const [gcalTokenExp, setGcalTokenExp] = useState(() => store.get('dm_gcal_token_exp', 0));

  // FCM Web Push
  const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  useEffect(() => {
    if (!VAPID_PUBLIC || !authUser) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted') return;
    navigator.serviceWorker.ready.then(async reg => {
      try {
        const existing = await reg.pushManager.getSubscription();
        const sub = existing || await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: VAPID_PUBLIC,
        });
        await saveSettings(authUser.uid, { pushSubscription: JSON.parse(JSON.stringify(sub)) });
      } catch {}
    });
  }, [authUser, VAPID_PUBLIC]);

  const [isDark, setIsDark] = useState(() => {
    const stored = store.get('dm_theme', null);
    if (stored !== null) return stored === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches !== false;
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    store.set('dm_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const [fontScale, setFontScale] = useState(() => store.get('dm_font_scale', 'large'));
  useEffect(() => {
    document.documentElement.setAttribute('data-font', fontScale);
    store.set('dm_font_scale', fontScale);
  }, [fontScale]);

  const [user, setUser] = useState(() => store.get("dm_user", { name: "사용자" }));
  const [goals, setGoals] = useState(() => store.get("dm_goals", { year: [], month: [] }));
  const [lifeGoals, setLifeGoalsState] = useState(() => store.get("dm_life_goals", []));
  const setLifeGoals = (v) => { const next = typeof v === 'function' ? v(lifeGoals) : v; setLifeGoalsState(next); store.set("dm_life_goals", next); };
  const [notifEnabled, setNotifEnabled] = useState(() => store.get("dm_notif_enabled", false));
  const [telegramCfg, setTelegramCfg] = useState(() => {
    const saved = store.get("dm_telegram", {});
    return {
      botToken: "", chatId: "",
      briefingTime: "07:00", todoTime: "07:05",
      assets: ["BTC", "ETH", "TSLA", "GOOGL", "IVR", "QQQ"],
      ...saved,
    };
  });
  const [alarmTimes, setAlarmTimes] = useState(() =>
    store.get("dm_alarm_times", { morning: "07:30", noon: "12:00", evening: "18:00", night: "23:00" })
  );
  const [habits, setHabits] = useState(() => store.get("dm_habits", []));
  const [scores, setScores] = useState(() => store.get("dm_scores", {}));
  const [recurringTasks, setRecurringTasks] = useState(() => store.get("dm_recurring", []));
  const [event, setEvent] = useState(() => store.get("dm_event", { name: "", startDate: "", endDate: "", active: false }));
  const [driveToken, setDriveToken] = useState(() => store.get("dm_drive_token", null));
  const [driveTokenExp, setDriveTokenExp] = useState(() => store.get("dm_drive_token_exp", 0));
  const [lastDriveBackup, setLastDriveBackup] = useState(() => store.get("dm_last_drive_backup", null));
  const [inviteBonus, setInviteBonus] = useState(() => store.get("dm_invite_bonus", 0));
  const [levelUpInfo, setLevelUpInfo] = useState(null); // { level, title, icon, badge }
  const [myRank, setMyRank] = useState(null);
  const [communityIds, setCommunityIdsState] = useState(() => {
    const arr = store.get('dm_community_ids', null);
    if (arr) return arr;
    const old = store.get('dm_community_id', null);
    if (old) { store.set('dm_community_ids', [old]); return [old]; }
    return [];
  });
  const [activeCommunityId, setActiveCommunityIdState] = useState(() =>
    store.get('dm_active_community_id', store.get('dm_community_id', null))
  );
  const [someday, setSomeday] = useState(() => store.get("dm_someday", []));

  const addCommunityId = (id) => {
    setCommunityIdsState(prev => {
      const next = prev.includes(id) ? prev : [...prev, id];
      store.set('dm_community_ids', next);
      return next;
    });
    setActiveCommunityIdState(id);
    store.set('dm_active_community_id', id);
  };
  const removeCommunityId = (id) => {
    setCommunityIdsState(prev => {
      const next = prev.filter(c => c !== id);
      store.set('dm_community_ids', next);
      // 활성 커뮤니티가 제거된 경우 첫 번째로 전환
      if (activeCommunityId === id) {
        const fallback = next[0] || null;
        setActiveCommunityIdState(fallback);
        store.set('dm_active_community_id', fallback);
      }
      return next;
    });
  };
  const setActiveCommunityId = (id) => {
    setActiveCommunityIdState(id);
    store.set('dm_active_community_id', id);
  };

  useEffect(() => {
    if (!authUser) return;
    loadRankings().then(list => {
      const sorted = list.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
      const idx = sorted.findIndex(r => r.uid === authUser.uid);
      if (idx >= 0) setMyRank({ rank: idx + 1, total: sorted.length });
    }).catch(() => {});
  }, [authUser]);

  const todayStr = toDateStr();

  const [communityEventsToday, setCommunityEventsToday] = useState([]);
  const [communityEventChecks, setCommunityEventChecks] = useState(() =>
    store.get(`dm_community_event_checks_${todayStr}`, {})
  );

  useEffect(() => {
    if (!communityIds.length) { setCommunityEventsToday([]); return; }
    loadTodayCommunityEvents(communityIds, todayStr).then(setCommunityEventsToday).catch(() => {});
  }, [communityIds, todayStr]);

  const onToggleCommunityEvent = (eventId) => {
    setCommunityEventChecks(prev => {
      const next = { ...prev, [eventId]: !prev[eventId] };
      store.set(`dm_community_event_checks_${todayStr}`, next);
      return next;
    });
  };

  const [plans, setPlans] = useState(() => {
    const all = {};
    listAllDays().forEach((ds) => {
      const d = loadDay(ds);
      if (d) all[ds] = d;
    });
    return all;
  });

  // event 변경 시 localStorage 저장
  useEffect(() => { store.set('dm_event', event); }, [event]);

  // 구글 캘린더/드라이브 토큰 자동 갱신 예약 (앱 시작 시)
  useEffect(() => {
    // 만료된 토큰은 즉시 초기화 — 사용자 제스처 없이 requestAccessToken() 호출 시
    // 브라우저/PWA 보안 정책으로 팝업이 차단되거나 반복 표시될 수 있어서
    const now = Date.now();
    const gcalExp = store.get('dm_gcal_token_exp', 0);
    if (gcalExp) {
      if (gcalExp <= now) disconnectGcal();
      else {
        const delay = gcalExp - now - 5 * 60 * 1000;
        if (delay > 0) gcalRefreshTimerRef.current = setTimeout(connectGcal, delay);
      }
    }
    const driveExp = store.get('dm_drive_token_exp', 0);
    if (driveExp) {
      if (driveExp <= now) disconnectDrive();
      else {
        const delay = driveExp - now - 5 * 60 * 1000;
        if (delay > 0) driveRefreshTimerRef.current = setTimeout(connectDrive, delay);
      }
    }
    return () => {
      clearTimeout(gcalRefreshTimerRef.current);
      clearTimeout(driveRefreshTimerRef.current);
    };
  }, []); // eslint-disable-line

  // 구글 캘린더 자동 동기화 (토큰 있을 때 하루 1회, 앱 시작 시)
  useEffect(() => {
    const token = getValidGcalToken();
    if (!token) return;
    const today = toDateStr();
    if (store.get('dm_last_gcal_sync', '') === today) return;
    pullFromGcal(token).then(n => {
      store.set('dm_last_gcal_sync', today);
      if (n > 0) setToast(`구글 캘린더에서 ${n}개 일정을 가져왔어요`);
    }).catch(() => {});
  }, []); // eslint-disable-line

  // Drive 자동 백업 (하루 1회)
  useEffect(() => {
    const token = getValidDriveToken();
    if (!token) return;
    const today = toDateStr();
    if (store.get('dm_last_drive_backup', '')?.slice(0, 10) === today) return;
    performDriveBackup(token).catch(() => {});
  }, []); // eslint-disable-line

  // 월말 목표 달성률 알림
  useEffect(() => {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - today.getDate();
    if (daysLeft > 7) return;
    const alertKey = `dm_month_alert_${toDateStr()}`;
    if (store.get(alertKey, false)) return;
    const monthGoals = goals.month || [];
    if (monthGoals.length === 0) return;
    const done = monthGoals.filter((_, i) => goalChecks[i]).length;
    const pct = done / monthGoals.length;
    if (pct >= 0.6) return;
    store.set(alertKey, true);
    const pctStr = Math.round(pct * 100);
    setToast(`📅 월말 D-${daysLeft} · 목표 달성 ${pctStr}%`);
    if (telegramCfg?.botToken && telegramCfg?.chatId) {
      sendTelegramMessage(telegramCfg.botToken, telegramCfg.chatId,
        `📅 <b>월말 목표 알림</b>\n\n이번 달 ${daysLeft}일 남았어요!\n목표 달성: ${pctStr}% (${done}/${monthGoals.length})\n\n아직 ${monthGoals.length - done}개가 남아있어요 💪 마지막 스퍼트!`
      );
    }
  }, []); // eslint-disable-line

  // 과거 날짜 점수 스냅샷 (오늘 이전 날만, 한 번 저장되면 변경 불가)
  useEffect(() => {
    const today = toDateStr();
    const next = { ...scores };
    let changed = false;
    Object.keys(plans).forEach(ds => {
      if (ds < today && next[ds] === undefined) {
        const s = calcDayScore(plans[ds], habits);
        if (s > 0) { next[ds] = s; changed = true; }
      }
    });
    if (changed) {
      setScores(next);
      store.set("dm_scores", next);
      if (authUser) {
        const total = Object.values(next).reduce((a, b) => a + b, 0) + (store.get('dm_invite_bonus', 0));
        const lvInfo = calcLevel(total);
        // 월별 점수 계산
        const monthlyScores = {};
        Object.entries(next).forEach(([ds, score]) => {
          const ym = ds.slice(0, 7); // "2026-03"
          monthlyScores[ym] = (monthlyScores[ym] || 0) + score;
        });
        updateRanking(authUser.uid, {
          email: authUser.email,
          totalScore: total,
          level: lvInfo.level,
          daysCount: Object.keys(next).length,
          monthlyScores,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }
    }
  }, []); // eslint-disable-line

  // 레벨업 감지 + 스트릭 보너스
  const prevLevelRef = useRef(null);
  const prevStreakRef = useRef(null);
  useEffect(() => {
    const todayScore = calcDayScore(plans[todayStr], habits);
    const bonus = store.get('dm_invite_bonus', 0);
    const total = Object.values(scores).reduce((a, b) => a + b, 0) + todayScore + bonus;
    const lvInfo = calcLevel(total);

    // 레벨업 감지
    if (prevLevelRef.current !== null && lvInfo.level > prevLevelRef.current) {
      setLevelUpInfo({ level: lvInfo.level, title: lvInfo.title, icon: lvInfo.icon, badge: lvInfo.badge });
    }
    prevLevelRef.current = lvInfo.level;

    // 스트릭 보너스 (7일 배수 달성 시 1회만)
    const streak = calcStreak(plans);
    const bonusKey = `dm_streak_bonus_${streak}`;
    if (streak > 0 && streak % 7 === 0 && prevStreakRef.current !== null && streak > prevStreakRef.current && !store.get(bonusKey)) {
      const bonusPts = calcStreakBonus(streak);
      store.set(bonusKey, true);
      setInviteBonus(prev => { const next = prev + bonusPts; store.set('dm_invite_bonus', next); return next; });
    }
    prevStreakRef.current = streak;
  }, [plans[todayStr], habits, scores]); // eslint-disable-line

  // 오늘 점수 변경 시 랭킹 실시간 반영 (debounce 10초)
  const rankingTimerRef = useRef(null);
  useEffect(() => {
    if (!authUser) return;
    clearTimeout(rankingTimerRef.current);
    rankingTimerRef.current = setTimeout(() => {
      const todayScore = calcDayScore(plans[todayStr], habits);
      const total = Object.values(scores).reduce((a, b) => a + b, 0) + todayScore + (store.get('dm_invite_bonus', 0));
      const lvInfo = calcLevel(total);
      const monthlyScores = {};
      Object.entries(scores).forEach(([ds, score]) => {
        const ym = ds.slice(0, 7);
        monthlyScores[ym] = (monthlyScores[ym] || 0) + score;
      });
      const todayYm = todayStr.slice(0, 7);
      monthlyScores[todayYm] = (monthlyScores[todayYm] || 0) + todayScore;
      updateRanking(authUser.uid, {
        email: authUser.email,
        totalScore: total,
        level: lvInfo.level,
        daysCount: Object.keys(scores).length,
        monthlyScores,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }, 10000);
  }, [plans[todayStr], habits, scores, authUser]); // eslint-disable-line

  const [openDate, setOpenDate] = useState(null);
  const [scrollToMemo, setScrollToMemo] = useState(false);

  const [goalChecks, setGoalChecks] = useState(() =>
    store.get(`dm_goal_checks_${todayStr.slice(0, 7)}`, {})
  );

  const onToggleGoal = (idx) => {
    const monthKey = `dm_goal_checks_${todayStr.slice(0, 7)}`;
    setGoalChecks((prev) => {
      const next = { ...prev, [idx]: !prev[idx] };
      store.set(monthKey, next);
      return next;
    });
  };

  const todayData = plans[todayStr] || null;

  const getValidGcalToken = () => {
    const t = store.get('dm_gcal_token', null);
    const e = store.get('dm_gcal_token_exp', 0);
    return t && Date.now() < e ? t : null;
  };

  const connectGcal = async () => {
    try {
      if (!window.google?.accounts?.oauth2) {
        gcalRefreshTimerRef.current = setTimeout(connectGcal, 500);
        return null;
      }
      const { accessToken, expiresAt } = await googleSignInWithCalendarScope();
      store.set('dm_gcal_token', accessToken);
      store.set('dm_gcal_token_exp', expiresAt);
      setGcalToken(accessToken);
      setGcalTokenExp(expiresAt);
      if (gcalRefreshTimerRef.current) clearTimeout(gcalRefreshTimerRef.current);
      const delay = expiresAt - Date.now() - 5 * 60 * 1000;
      if (delay > 0) gcalRefreshTimerRef.current = setTimeout(connectGcal, delay);
      return accessToken;
    } catch {
      // 자동 재시도 금지 — 반복 팝업 방지. 사용자가 Settings에서 수동 재연결
      return null;
    }
  };

  const disconnectGcal = () => {
    store.remove('dm_gcal_token');
    store.remove('dm_gcal_token_exp');
    setGcalToken(null);
    setGcalTokenExp(0);
  };

  const disconnectDrive = () => {
    store.remove('dm_drive_token');
    store.remove('dm_drive_token_exp');
    setDriveToken(null);
    setDriveTokenExp(0);
  };

  const getValidDriveToken = () => {
    const t = store.get('dm_drive_token', null);
    const e = store.get('dm_drive_token_exp', 0);
    return t && Date.now() < e ? t : null;
  };

  const connectDrive = async () => {
    try {
      if (!window.google?.accounts?.oauth2) {
        driveRefreshTimerRef.current = setTimeout(connectDrive, 500);
        return null;
      }
      const { accessToken, expiresAt } = await googleSignInWithDriveScope();
      store.set('dm_drive_token', accessToken);
      store.set('dm_drive_token_exp', expiresAt);
      setDriveToken(accessToken);
      setDriveTokenExp(expiresAt);
      if (driveRefreshTimerRef.current) clearTimeout(driveRefreshTimerRef.current);
      const delay = expiresAt - Date.now() - 5 * 60 * 1000;
      if (delay > 0) driveRefreshTimerRef.current = setTimeout(connectDrive, delay);
      // 오늘 백업이 아직 안 됐으면 토큰 갱신 직후 실행
      const today = toDateStr();
      if (store.get('dm_last_drive_backup', '')?.slice(0, 10) !== today) {
        performDriveBackup(accessToken).catch(() => {});
      }
      return accessToken;
    } catch {
      // 자동 재시도 금지 — 반복 팝업 방지. 사용자가 Settings에서 수동 재연결
      return null;
    }
  };

  const performDriveBackup = async (token) => {
    const data = {};
    try { Object.keys(localStorage).filter(k => k.startsWith('dm_')).forEach(k => { data[k] = store.get(k); }); } catch {}
    await driveBackup(token, data);
    const now = new Date().toISOString();
    store.set('dm_last_drive_backup', now);
    setLastDriveBackup(now);
  };

  const addInviteBonus = (pts) => {
    setInviteBonus(prev => { const next = prev + pts; store.set('dm_invite_bonus', next); return next; });
  };

  const syncGcalByDate = (byDate) => {
    const updates = {};
    let totalAdded = 0;
    for (const [dateStr, events] of Object.entries(byDate)) {
      const external = events.filter(e => !e.extendedProperties?.private?.daymateId && e.summary?.trim());
      if (external.length === 0) continue;
      const curDay = plans[dateStr] || newDay(dateStr);
      const existingGcalIds = new Set((curDay.tasks || []).map(t => t.gcalEventId).filter(Boolean));
      const toAdd = external
        .filter(e => !existingGcalIds.has(e.id))
        .map(e => ({ id: `gcal_${e.id}`, title: e.summary.trim(), done: false, checkedAt: null, priority: false, gcalEventId: e.id }));
      if (toAdd.length === 0) continue;
      const tasks = [...(curDay.tasks || [])];
      const remaining = [...toAdd];
      for (let i = 0; i < tasks.length && remaining.length > 0; i++) {
        if (!tasks[i].title.trim()) tasks[i] = remaining.shift();
      }
      const updated = { ...curDay, tasks: [...tasks, ...remaining] };
      updates[dateStr] = updated;
      saveDay(dateStr, updated);
      totalAdded += toAdd.length;
    }
    if (totalAdded > 0) setPlans(prev => ({ ...prev, ...updates }));
    return totalAdded;
  };

  const pullFromGcal = async (token) => {
    const byDate = await gcalFetchRangeEvents(token, todayStr, 30);
    return syncGcalByDate(byDate);
  };

  const ensureToday = () => {
    setPlans((prev) => {
      if (prev[todayStr]) return prev;
      const d = newDay(todayStr);
      const next = { ...prev, [todayStr]: d };
      saveDay(todayStr, d);
      return next;
    });
  };

  // Firebase auth listener
  useEffect(() => {
    return onAuth(async (firebaseUser) => {
      setAuthUser(firebaseUser);
      if (!firebaseUser) return;

      setSyncStatus('syncing');
      syncReadyRef.current = false;
      updateUserMeta(firebaseUser.uid, {
        email: firebaseUser.email,
        photoURL: firebaseUser.photoURL,
        lastSeen: new Date().toISOString(),
        createdAt: firebaseUser.metadata.creationTime,
      }).catch(() => {});
      const myInviteCode = store.get('dm_invite_code');
      if (myInviteCode) registerInviteCode(firebaseUser.uid, myInviteCode).catch(() => {});
      try {
        const remote = await loadAllFromFirestore(firebaseUser.uid);
        const hasRemote = remote.settings || remote.goals || Object.keys(remote.days).length > 0;

        if (hasRemote) {
          if (remote.settings) {
            const s = remote.settings;
            if (s.name) { setUser({ name: s.name }); store.set("dm_user", { name: s.name }); updateUserMeta(firebaseUser.uid, { name: s.name }).catch(() => {}); }
            if (s.notifEnabled !== undefined) { setNotifEnabled(s.notifEnabled); store.set("dm_notif_enabled", s.notifEnabled); }
            if (s.alarmTimes) { setAlarmTimes(s.alarmTimes); store.set("dm_alarm_times", s.alarmTimes); }
            if (s.telegram) { setTelegramCfg(s.telegram); store.set("dm_telegram", s.telegram); }
            if (s.habits) { setHabits(s.habits); store.set("dm_habits", s.habits); }
            if (s.recurringTasks) { setRecurringTasks(s.recurringTasks); store.set("dm_recurring", s.recurringTasks); }
            if (s.someday) { setSomeday(s.someday); store.set("dm_someday", s.someday); }
            if (s.inviteBonus !== undefined) { setInviteBonus(s.inviteBonus); store.set("dm_invite_bonus", s.inviteBonus); }
            const ym = todayStr.slice(0, 7);
            if (s[`goalChecks_${ym}`]) { setGoalChecks(s[`goalChecks_${ym}`]); store.set(`dm_goal_checks_${ym}`, s[`goalChecks_${ym}`]); }
          }
          if (remote.goals) { setGoals(remote.goals); store.set("dm_goals", remote.goals); }
          if (Object.keys(remote.days).length > 0) {
            const merged = { ...remote.days };
            Object.entries(remote.days).forEach(([ds, d]) => { saveDay(ds, d); });
            setPlans(merged);
          }
        } else {
          const localDays = {};
          listAllDays().forEach((ds) => { const d = loadDay(ds); if (d) localDays[ds] = d; });
          await uploadLocalToFirestore(firebaseUser.uid, {
            settings: { name: user.name, notifEnabled, alarmTimes, telegram: telegramCfg },
            goals,
            days: localDays,
          });
        }
        syncReadyRef.current = true;
        setSyncStatus('synced');
      } catch {
        syncReadyRef.current = true;
        setSyncStatus('idle');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    store.set("dm_user", user);
    if (authUser && syncReadyRef.current) saveSettings(authUser.uid, { name: user.name }).catch(() => {});
  }, [user, authUser]);
  useEffect(() => {
    store.set("dm_goals", goals);
    if (authUser && syncReadyRef.current) saveGoals(authUser.uid, goals).catch(() => {});
  }, [goals, authUser]);
  useEffect(() => { store.set("dm_notif_enabled", notifEnabled); }, [notifEnabled]);
  useEffect(() => {
    store.set("dm_habits", habits);
    if (authUser && syncReadyRef.current) saveSettings(authUser.uid, { habits }).catch(() => {});
  }, [habits, authUser]);
  useEffect(() => {
    store.set("dm_recurring", recurringTasks);
    if (authUser && syncReadyRef.current) saveSettings(authUser.uid, { recurringTasks }).catch(() => {});
  }, [recurringTasks, authUser]);
  useEffect(() => {
    store.set("dm_someday", someday);
    if (authUser && syncReadyRef.current) saveSettings(authUser.uid, { someday }).catch(() => {});
  }, [someday, authUser]);
  useEffect(() => {
    const ym = todayStr.slice(0, 7);
    store.set(`dm_goal_checks_${ym}`, goalChecks);
    if (authUser && syncReadyRef.current) saveSettings(authUser.uid, { [`goalChecks_${ym}`]: goalChecks }).catch(() => {});
  }, [goalChecks, authUser]); // eslint-disable-line
  useEffect(() => {
    store.set("dm_invite_bonus", inviteBonus);
    if (authUser && syncReadyRef.current) saveSettings(authUser.uid, { inviteBonus }).catch(() => {});
  }, [inviteBonus, authUser]);

  useEffect(() => {
    scheduler.apply(notifEnabled, user.name || "사용자", telegramCfg, alarmTimes);
    return () => scheduler.cancelAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifEnabled, user.name, telegramCfg, alarmTimes]);
  useEffect(() => {
    scheduler.scheduleTaskAlarms(todayData?.tasks || [], user.name || "사용자", notifEnabled);
  }, [todayData, notifEnabled]); // eslint-disable-line

  useEffect(() => {
    if (screen === "today") ensureToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const setTodayData = (updater) => {
    setPlans((prev) => {
      const cur = prev[todayStr] || newDay(todayStr);
      const nextDay = typeof updater === "function" ? updater(cur) : updater;
      const next = { ...prev, [todayStr]: nextDay };
      saveDay(todayStr, nextDay);
      if (authUser && syncReadyRef.current) fsaveDay(authUser.uid, todayStr, nextDay).catch(() => {});
      return next;
    });
  };

  const openDetail = (ds) => {
    setPlans((prev) => {
      if (prev[ds]) return prev;
      const d = newDay(ds);
      const dayOfWeek = new Date(ds + 'T00:00:00').getDay();
      const applicable = recurringTasks.filter(t => t.title.trim() && (t.days === 'daily' || String(t.days) === String(dayOfWeek)));
      if (applicable.length > 0) {
        d.tasks = [...d.tasks.filter(t => t.title.trim()), ...applicable.map(t => ({id:`r${t.id}_${ds}`, title: t.title, done: false, checkedAt: null, priority: false}))];
      }
      saveDay(ds, d);
      if (authUser && syncReadyRef.current) fsaveDay(authUser.uid, ds, d).catch(() => {});
      return { ...prev, [ds]: d };
    });
    setOpenDate(ds);
    setScrollToMemo(false);
    setScreen("detail");
    history.pushState({ screen: 'detail', isRoot: false }, '', `?screen=detail&date=${ds}`);
  };

  const openDetailMemo = (ds) => {
    openDetail(ds);
    setScrollToMemo(true);
  };

  const setDetailData = (updater) => {
    if (!openDate) return;
    setPlans((prev) => {
      const cur = prev[openDate] || newDay(openDate);
      const nextDay = typeof updater === "function" ? updater(cur) : updater;
      const next = { ...prev, [openDate]: nextDay };
      saveDay(openDate, nextDay);
      if (authUser && syncReadyRef.current) fsaveDay(authUser.uid, openDate, nextDay).catch(() => {});
      return next;
    });
  };

  const onSetTodayTasks = (tasks) => {
    const prevTasks = todayData?.tasks || [];
    setTodayData(prev => ({ ...prev, tasks }));

    const token = getValidGcalToken();
    if (!token) return;

    const newTaskIds = new Set(tasks.map(t => t.id));
    prevTasks.filter(t => t.gcalEventId && !newTaskIds.has(t.id))
      .forEach(t => gcalDeleteEvent(token, t.gcalEventId).catch(() => {}));

    const prevTaskMap = new Map(prevTasks.map(t => [t.id, t]));
    tasks.forEach(t => {
      const prev = prevTaskMap.get(t.id);
      if (prev && prev.gcalEventId && t.title.trim() && prev.title !== t.title) {
        gcalUpdateEvent(token, prev.gcalEventId, t.title).catch(() => {});
      }
    });

    const prevTaskIds = new Set(prevTasks.map(t => t.id));
    const toCreate = tasks.filter(t => t.title.trim() && !t.gcalEventId && !prevTaskIds.has(t.id));
    if (toCreate.length === 0) return;
    Promise.all(toCreate.map(async task => {
      try { return { id: task.id, gcalEventId: await gcalCreateEvent(token, todayStr, task) }; }
      catch { return null; }
    })).then(results => {
      const updates = results.filter(Boolean);
      if (updates.length === 0) return;
      setTodayData(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => {
          const u = updates.find(r => r.id === t.id);
          return u ? { ...t, gcalEventId: u.gcalEventId } : t;
        }),
      }));
    });
  };

  const onSaveMonthGoals = (monthGoals) => {
    const nextGoals = { ...goals, month: monthGoals };
    setGoals(nextGoals);
    store.set("dm_goals", nextGoals);
    if (authUser && syncReadyRef.current) saveGoals(authUser.uid, nextGoals).catch(() => {});
  };

  const onToggleHabit = (habitId) => {
    setTodayData(prev => {
      const cur = prev.habitChecks || {};
      const nowChecked = !cur[habitId];
      const next = { ...prev, habitChecks: { ...cur, [habitId]: nowChecked } };
      if (nowChecked) {
        const allHabitsDone = habits.length > 0 && habits.every(h => next.habitChecks[h.id]);
        if (allHabitsDone) setToast(`🌟 습관 전부 완료! +${5 + 15} XP`);
        else setToast(`✅ 습관 체크 · +5 XP`);
      }
      return next;
    });
  };

  // 온보딩
  const [firstRunDone, setFirstRunDone] = useState(() => !!store.get("dm_first_run_done", false));
  const [nameInput, setNameInput] = useState("");
  const [onboardStep, setOnboardStep] = useState(1);

  // 카카오톡 인앱 브라우저 감지 → 외부 브라우저로 유도
  if (isKakao && !isStandalone) {
    const openInBrowser = (pkg) => {
      const url = new URL(window.location.href);
      url.searchParams.set('from_kakao', '1');
      window.location.href = `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=${pkg};S.browser_fallback_url=${encodeURIComponent(url.toString())};end`;
    };
    return (
      <div style={S.app}>
        <div style={S.phone}>
          <div className="dm-blob dm-blob-1" />
          <div className="dm-blob dm-blob-2" />
          <div style={{ padding: "56px 24px 32px", position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, marginBottom: 20, background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, boxShadow: "0 8px 24px rgba(108,142,255,.35)" }}>✅</div>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8, textAlign: "center" }}>DayMate Lite</div>
            <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.8, textAlign: "center", marginBottom: 32 }}>
              매일 할 일 3가지만 정하고<br/>체크하고, 일기 한 줄로 마무리.
            </div>

            <div style={{ width: "100%", background: "var(--dm-card)", border: "1.5px solid var(--dm-border)", borderRadius: 16, padding: "20px", marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 6 }}>📲 앱으로 설치하려면</div>
              <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.8 }}>
                카카오톡 브라우저에서는 앱 설치가 되지 않아요.<br/>
                {isIOS ? "Safari" : "크롬 또는 삼성인터넷"}에서 열어주세요.
              </div>
            </div>

            {isIOS ? (
              <div style={{ width: "100%", background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 12 }}>Safari로 여는 방법</div>
                {[
                  ["1", "하단의 ⋯ 버튼을 탭해요"],
                  ["2", "'Safari로 열기'를 선택해요"],
                  ["3", "공유 버튼(□↑) → '홈 화면에 추가'"],
                ].map(([n, txt]) => (
                  <div key={n} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 999, background: "#6C8EFF", color: "#fff", fontSize: 12, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</div>
                    <div style={{ fontSize: 13, color: "var(--dm-text)", lineHeight: 1.5, paddingTop: 2 }}>{txt}</div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <button style={{ ...S.btn, background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)", marginBottom: 10 }} onClick={() => openInBrowser('com.android.chrome')}>
                  🌐 크롬에서 열기
                </button>
                <button style={{ ...S.btn, background: "var(--dm-card)", color: "var(--dm-text)", border: "1.5px solid var(--dm-border)", marginBottom: 0 }} onClick={() => openInBrowser('com.sec.android.app.sbrowser')}>
                  🌐 삼성인터넷에서 열기
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!firstRunDone) {
    const iconBox = (
      <div style={{
        width: 72, height: 72, borderRadius: 20, margin: "0 auto 16px",
        background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 32, boxShadow: "0 8px 24px rgba(108,142,255,.35)",
      }}>✅</div>
    );
    const stepDots = (
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
        {[1,2,3,4].map(n => (
          <div key={n} style={{ width: n === onboardStep ? 20 : 8, height: 8, borderRadius: 4, transition: "width .2s", background: n === onboardStep ? "#6C8EFF" : "var(--dm-border)" }} />
        ))}
      </div>
    );

    return (
      <div style={S.app}>
        <div style={S.phone}>
          <div className="dm-blob dm-blob-1" />
          <div className="dm-blob dm-blob-2" />
          {toast && <Toast msg={toast} onDone={() => setToast("")} />}
          <div style={{ padding: "44px 22px 24px", position: "relative", zIndex: 1 }}>
            {iconBox}
            {stepDots}

            {onboardStep === 1 && (
              <>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>DayMate Lite</div>
                  <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.8, marginTop: 8 }}>
                    매일 할 일 3가지만 정하고<br/>체크하고, 일기 한 줄로 마무리.
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 8 }}>이름이 뭐예요?</div>
                <input
                  style={S.input}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setOnboardStep(2)}
                  placeholder="예: 계승"
                  maxLength={20}
                  autoFocus
                />
                <button style={S.btn} onClick={() => {
                  const nm = (nameInput || "").trim() || "사용자";
                  setUser({ name: nm }); store.set("dm_user", { name: nm });
                  setOnboardStep(2);
                }}>다음 →</button>
              </>
            )}

            {onboardStep === 2 && (
              <>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>📊 점수 시스템</div>
                  <div style={{ fontSize: 13, color: "var(--dm-sub)", marginTop: 6 }}>매일 하루를 완성하면 XP가 쌓여요</div>
                </div>
                {[
                  ["✅ 할일 완료", "개당 +10pt · 전부 완료 보너스 +20pt"],
                  ["🎯 습관 체크", "개당 +5pt · 전부 완료 보너스 +15pt"],
                  ["📝 일기 작성", "+15pt"],
                  ["🎉 완벽한 하루", "3가지 완료 + 일기 작성 시 +25pt 보너스"],
                ].map(([label, desc]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--dm-row)" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
                    <div style={{ fontSize: 12, color: "#6C8EFF", fontWeight: 900 }}>{desc}</div>
                  </div>
                ))}
                <button style={{ ...S.btn, marginTop: 20 }} onClick={() => setOnboardStep(3)}>다음 →</button>
              </>
            )}

            {onboardStep === 3 && (
              <>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>🏆 레벨 시스템</div>
                  <div style={{ fontSize: 13, color: "var(--dm-sub)", marginTop: 6 }}>꾸준히 하면 레벨이 올라가요!</div>
                </div>
                {[
                  ["🌱", "새싹", "Lv.1"],
                  ["🌿", "성장", "Lv.2~3"],
                  ["⚡", "도전자", "Lv.4~5"],
                  ["🔥", "실행가", "Lv.6~7"],
                  ["👑", "마스터", "Lv.8~9"],
                  ["💎", "챔피언", "Lv.10+"],
                ].map(([icon, title, lv]) => (
                  <div key={lv} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--dm-row)" }}>
                    <div style={{ fontSize: 22, width: 32, textAlign: "center" }}>{icon}</div>
                    <div style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{title}</div>
                    <div style={{ fontSize: 12, color: "var(--dm-muted)" }}>{lv}</div>
                  </div>
                ))}
                <button style={{ ...S.btn, marginTop: 20 }} onClick={() => setOnboardStep(4)}>다음 →</button>
              </>
            )}

            {onboardStep === 4 && (
              <>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>📲 앱으로 설치하기</div>
                  <div style={{ fontSize: 13, color: "var(--dm-sub)", marginTop: 6, lineHeight: 1.7 }}>
                    홈 화면에 추가하면 앱처럼 바로 실행돼요.<br/>알림도 받을 수 있어요!
                  </div>
                </div>

                {isStandalone ? (
                  <div style={{ background: "rgba(74,222,128,.1)", border: "1.5px solid rgba(74,222,128,.4)", borderRadius: 14, padding: "16px", textAlign: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>🎉</div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: "#4ADE80" }}>이미 앱으로 설치되어 있어요!</div>
                  </div>
                ) : installPrompt ? (
                  <button style={{ ...S.btn, background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)", marginBottom: 8 }} onClick={async () => {
                    await handleInstall();
                  }}>📲 홈 화면에 설치하기</button>
                ) : isIOS ? (
                  <div style={{ background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: 14, padding: "16px", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)", marginBottom: 10 }}>iPhone / iPad 설치 방법</div>
                    {[
                      ["1", "Safari 하단의 공유 버튼(□↑)을 탭해요"],
                      ["2", "스크롤해서 '홈 화면에 추가'를 탭해요"],
                      ["3", "우측 상단 '추가'를 눌러 완료!"],
                    ].map(([n, txt]) => (
                      <div key={n} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 999, background: "#6C8EFF", color: "#fff", fontSize: 12, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</div>
                        <div style={{ fontSize: 13, color: "var(--dm-text)", lineHeight: 1.5, paddingTop: 2 }}>{txt}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: 14, padding: "14px 16px", marginBottom: 12, fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.7 }}>
                    💡 브라우저 주소창 오른쪽의 <b style={{ color: "var(--dm-text)" }}>설치(+) 버튼</b>을 눌러 홈 화면에 추가해보세요.
                  </div>
                )}

                <button style={{ ...S.btn, marginTop: 8, background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)" }} onClick={() => {
                  store.set("dm_first_run_done", true);
                  setFirstRunDone(true);
                }}>시작하기 →</button>
              </>
            )}

            <div style={{ height: 20 }} />
          </div>
        </div>
      </div>
    );
  }

  const changeScreen = (s) => {
    setScreen(s);
    history.pushState({ screen: s, isRoot: false }, '', `?screen=${s}`);
  };

  const renderScreen = () => {
    if (screen === "home") {
      return (
        <Home
          user={user} goals={goals} todayData={todayData} plans={plans}
          onToggleTask={(id) => {
            setTodayData(prev => {
              const next = { ...prev, tasks: prev.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) };
              const nowDone = next.tasks.find(t => t.id === id)?.done;
              if (nowDone) {
                const filled = next.tasks.filter(t => t.title.trim());
                const allDone = filled.length > 0 && filled.every(t => t.done);
                if (allDone) setToast(`🎉 할일 전부 완료! +${10 + 20} XP`);
                else setToast(`✅ 할일 완료 · +10 XP`);
              }
              return next;
            });
          }}
          goalChecks={goalChecks} onToggleGoal={onToggleGoal}
          onSetTodayTasks={onSetTodayTasks} onSaveMonthGoals={onSaveMonthGoals}
          habits={habits} setHabits={setHabits} onToggleHabit={onToggleHabit}
          recurringTasks={recurringTasks} setRecurringTasks={setRecurringTasks}
          someday={someday} setSomeday={setSomeday}
          scores={scores} onOpenDate={openDetail} onOpenDateMemo={openDetailMemo}
          installPrompt={installPrompt} handleInstall={handleInstall}
          showInstallBanner={showInstallBanner} dismissInstallBanner={dismissInstallBanner}
          isIOS={isIOS} isKakao={isKakao} isStandalone={isStandalone} event={event} inviteBonus={inviteBonus}
          onOpenChat={() => changeScreen("chat")}
          isDark={isDark} setIsDark={setIsDark}
          getValidGcalToken={getValidGcalToken}
          myRank={myRank} onOpenStats={() => changeScreen("stats")}
          onLuckyXp={addInviteBonus}
          lifeGoals={lifeGoals} setLifeGoals={setLifeGoals}
          onOpenSettings={() => changeScreen("settings")}
          levelUpInfo={levelUpInfo} onDismissLevelUp={() => setLevelUpInfo(null)}
          communityEventsToday={communityEventsToday}
          communityEventChecks={communityEventChecks}
          onToggleCommunityEvent={onToggleCommunityEvent}
        />
      );
    }
    if (screen === "today") {
      const d = plans[todayStr] || newDay(todayStr);
      return (
        <Today dateStr={todayStr} data={d} setData={setTodayData}
          toast={toast} setToast={setToast} plans={plans} onOpenDate={openDetail}
          onOpenInvest={() => changeScreen("invest")} />
      );
    }
    if (screen === "invest") {
      return (
        <InvestDiary
          uid={authUser?.uid}
          telegramCfg={telegramCfg}
          onBack={() => history.back()}
        />
      );
    }
    if (screen === "community") {
      const _filled = (todayData?.tasks || []).filter(t => t.title.trim()).length;
      const _done = (todayData?.tasks || []).filter(t => t.done && t.title.trim()).length;
      const todayCompletion = _filled > 0 ? Math.round((_done / _filled) * 100) : null;
      return (
        <Community
          user={user} authUser={authUser}
          communityIds={communityIds}
          activeCommunityId={activeCommunityId}
          setActiveCommunityId={setActiveCommunityId}
          addCommunityId={addCommunityId}
          removeCommunityId={removeCommunityId}
          getValidGcalToken={getValidGcalToken} onGcalConnect={connectGcal}
          setToast={setToast}
          todayCompletion={todayCompletion}
          onUnreadChange={setCommunityUnread}
        />
      );
    }
    if (screen === "history") {
      return <History plans={plans} onOpenDate={openDetail} habits={habits} getValidGcalToken={getValidGcalToken} onSyncGcal={syncGcalByDate} />;
    }
    if (screen === "stats") {
      return <Stats plans={plans} habits={habits} authUser={authUser} onBack={() => history.back()} />;
    }
    if (screen === "detail") {
      const d = plans[openDate];
      if (!openDate || !d) {
        return (
          <div style={S.content}>
            <div style={S.topbar}>
              <button onClick={() => history.back()} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>←</button>
              <div style={{ flex: 1 }}>
                <div style={S.title}>기록</div>
                <div style={S.sub}>데이터 없음</div>
              </div>
              <div />
            </div>
          </div>
        );
      }
      return (
        <DayDetail dateStr={openDate} data={d} setData={setDetailData}
          onBack={() => history.back()}
          toast={toast} setToast={setToast}
          habits={habits} scrollToMemo={scrollToMemo}
          getValidGcalToken={getValidGcalToken} onGcalConnect={connectGcal}
          someday={someday} setSomeday={setSomeday}
        />
      );
    }
    if (screen === "settings") {
      return (
        <Settings
          user={user} setUser={setUser} goals={goals} setGoals={setGoals}
          notifEnabled={notifEnabled} setNotifEnabled={setNotifEnabled}
          telegramCfg={telegramCfg} setTelegramCfg={setTelegramCfg}
          alarmTimes={alarmTimes} setAlarmTimes={setAlarmTimes}
          toast={toast} setToast={setToast}
          authUser={authUser} syncStatus={syncStatus}
          onGoogleSignIn={googleSignIn} onGoogleSignOut={googleSignOut}
          habits={habits} setHabits={setHabits}
          recurringTasks={recurringTasks} setRecurringTasks={setRecurringTasks}
          installPrompt={installPrompt} handleInstall={handleInstall}
          setShowInstallBanner={setShowInstallBanner}
          gcalToken={gcalToken} gcalTokenExp={gcalTokenExp}
          onGcalConnect={connectGcal} onGcalDisconnect={disconnectGcal}
          onGcalPull={pullFromGcal}
          isDark={isDark} setIsDark={setIsDark}
          fontScale={fontScale} setFontScale={setFontScale}
          event={event} setEvent={setEvent}
          onAddInviteBonus={addInviteBonus}
          driveToken={driveToken} driveTokenExp={driveTokenExp}
          onDriveConnect={connectDrive} onDriveBackup={performDriveBackup}
          lastDriveBackup={lastDriveBackup}
          onOpenAdmin={authUser?.uid === import.meta.env.VITE_ADMIN_UID ? () => changeScreen("admin") : undefined}
          onOpenStats={() => changeScreen("stats")}
          onOpenLifeCoach={() => changeScreen("life-coach")}
          onChangeScreen={changeScreen}
        />
      );
    }
    if (screen === "admin") {
      return <Admin authUser={authUser} onBack={() => changeScreen("settings")} />;
    }
    if (screen === "chat") {
      return <Chat user={user} todayData={todayData} habits={habits} scores={scores} onBack={() => changeScreen("home")}
        onSetTodayTasks={onSetTodayTasks}
        onSetMemo={(memo) => setTodayData(prev => ({ ...prev, memo }))}
        onToggleHabit={onToggleHabit}
        someday={someday} setSomeday={setSomeday}
      />;
    }
    if (screen === "life-coach") {
      return <LifeCoach
        user={user}
        onBack={() => changeScreen("home")}
        onApplyPlan={(plan) => {
          // 할일 등록
          if (plan.tasks?.length) {
            const newTasks = plan.tasks.map((title, i) => ({
              id: `t${Date.now()}_lc${i}`,
              title,
              done: false,
              checkedAt: null,
              priority: false,
            }));
            setTodayData(prev => {
              const all = [...(prev.tasks || [])];
              newTasks.forEach(nt => {
                const emptyIdx = all.findIndex(t => !t.title?.trim());
                if (emptyIdx >= 0) all[emptyIdx] = nt;
                else all.push(nt);
              });
              return { ...prev, tasks: all };
            });
          }
          // 습관 등록
          if (plan.habits?.length) {
            const newHabits = plan.habits.map((name, i) => ({
              id: `h_lc_${Date.now()}_${i}`,
              name,
              icon: "✨",
              streak: 0,
            }));
            setHabits(prev => [...(prev || []), ...newHabits]);
          }
          setToast("플랜이 등록됐어요 🎯");
          changeScreen("home");
        }}
      />;
    }
    return null;
  };

  return (
    <div style={S.app}>
      <div style={S.phone} className="dm-phone">
        <div className="dm-blob dm-blob-1" />
        <div className="dm-blob dm-blob-2" />
        {renderScreen()}
        {screen !== "detail" && screen !== "admin" && screen !== "chat" && screen !== "life-coach" && <BottomNav screen={screen} setScreen={changeScreen} badge={{
          home: (todayData?.tasks || []).filter(t => t.title.trim() && !t.done).length || 0,
          community: screen !== "community" ? communityUnread : 0,
        }} />}
      </div>
    </div>
  );
}
