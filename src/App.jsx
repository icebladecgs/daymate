import { useEffect, useRef, useState } from "react";
import { onAuth, googleSignIn, googleSignOut, saveSettings, saveGoals, saveDay as fsaveDay, loadAllFromFirestore, uploadLocalToFirestore, googleSignInWithCalendarScope, googleSignInWithDriveScope, updateUserMeta, updateRanking, registerInviteCode, loadRankings } from "./firebase.js";
import { store } from "./utils/storage.js";
import { toDateStr, getWeekKey } from "./utils/date.js";
import { driveBackup } from "./api/drive.js";
import { scheduler } from "./api/scheduler.js";
import { gcalDeleteEvent, gcalCreateEvent, gcalUpdateEvent, gcalFetchTodayEvents } from "./api/gcal.js";
import { newDay, loadDay, saveDay, listAllDays } from "./data/model.js";
import { calcDayScore, calcLevel } from "./data/stats.js";
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

  // PWA 설치 프롬프트
  const [installPrompt, setInstallPrompt] = useState(null);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isKakao = /KAKAOTALK/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const [showInstallBanner, setShowInstallBanner] = useState(() => {
    if (isStandalone) return false;
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

  const phoneStyleOverride = {};

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

  const [isDark, setIsDark] = useState(() => store.get('dm_theme', 'dark') === 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    store.set('dm_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const [user, setUser] = useState(() => store.get("dm_user", { name: "사용자" }));
  const [goals, setGoals] = useState(() => store.get("dm_goals", { year: [], month: [] }));
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
  const [myRank, setMyRank] = useState(null);

  useEffect(() => {
    if (!authUser) return;
    loadRankings().then(list => {
      const sorted = list.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
      const idx = sorted.findIndex(r => r.uid === authUser.uid);
      if (idx >= 0) setMyRank({ rank: idx + 1, total: sorted.length });
    }).catch(() => {});
  }, [authUser]);

  const todayStr = toDateStr();

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
    const waitForGis = (fn, timerRef) => {
      if (window.google?.accounts?.oauth2) { fn(); return; }
      timerRef.current = setTimeout(() => waitForGis(fn, timerRef), 500);
    };
    const gcalExp = store.get('dm_gcal_token_exp', 0);
    if (gcalExp) {
      const delay = gcalExp - Date.now() - 5 * 60 * 1000;
      if (delay <= 0) waitForGis(connectGcal, gcalRefreshTimerRef);
      else gcalRefreshTimerRef.current = setTimeout(connectGcal, delay);
    }
    const driveExp = store.get('dm_drive_token_exp', 0);
    if (driveExp) {
      const delay = driveExp - Date.now() - 5 * 60 * 1000;
      if (delay <= 0) waitForGis(connectDrive, driveRefreshTimerRef);
      else driveRefreshTimerRef.current = setTimeout(connectDrive, delay);
    }
    return () => {
      clearTimeout(gcalRefreshTimerRef.current);
      clearTimeout(driveRefreshTimerRef.current);
    };
  }, []); // eslint-disable-line

  // Drive 자동 백업 (하루 1회)
  useEffect(() => {
    const token = getValidDriveToken();
    if (!token) return;
    const today = toDateStr();
    if (store.get('dm_last_drive_backup', '')?.slice(0, 10) === today) return;
    performDriveBackup(token).catch(() => {});
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
      gcalRefreshTimerRef.current = setTimeout(connectGcal, 5 * 60 * 1000);
      return null;
    }
  };

  const disconnectGcal = () => {
    store.remove('dm_gcal_token');
    store.remove('dm_gcal_token_exp');
    setGcalToken(null);
    setGcalTokenExp(0);
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
      driveRefreshTimerRef.current = setTimeout(connectDrive, 5 * 60 * 1000);
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

  const pullFromGcal = async (token) => {
    const events = await gcalFetchTodayEvents(token, todayStr);
    const external = events.filter(e => !e.extendedProperties?.private?.daymateId && e.summary?.trim());
    if (external.length === 0) return 0;
    const curTasks = plans[todayStr]?.tasks || [];
    const existingTitles = new Set(curTasks.map(t => t.title.trim().toLowerCase()));
    const toAdd = external
      .filter(e => !existingTitles.has(e.summary.trim().toLowerCase()))
      .map(e => ({ id: `gcal_${e.id}`, title: e.summary.trim(), done: false, checkedAt: null, priority: false, gcalEventId: e.id }));
    if (toAdd.length === 0) return 0;
    setTodayData(prev => {
      const tasks = [...(prev.tasks || [])];
      const remaining = [...toAdd];
      for (let i = 0; i < tasks.length && remaining.length > 0; i++) {
        if (!tasks[i].title.trim()) tasks[i] = remaining.shift();
      }
      return { ...prev, tasks: [...tasks, ...remaining] };
    });
    return toAdd.length;
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
    scheduler.apply(notifEnabled, user.name || "사용자", telegramCfg, alarmTimes);
    return () => scheduler.cancelAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifEnabled, user.name, telegramCfg, alarmTimes]);

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
      return { ...prev, habitChecks: { ...cur, [habitId]: !cur[habitId] } };
    });
  };

  // 온보딩
  const [firstRunDone, setFirstRunDone] = useState(() => !!store.get("dm_first_run_done", false));
  const [nameInput, setNameInput] = useState("");
  const [onboardStep, setOnboardStep] = useState(1);

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
        {[1,2,3].map(n => (
          <div key={n} style={{ width: n === onboardStep ? 20 : 8, height: 8, borderRadius: 4, transition: "width .2s", background: n === onboardStep ? "#6C8EFF" : "var(--dm-border)" }} />
        ))}
      </div>
    );

    return (
      <div style={S.app}>
        <div style={S.phone}>
          {toast && <Toast msg={toast} onDone={() => setToast("")} />}
          <div style={{ padding: "44px 22px 24px" }}>
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
                <button style={{ ...S.btn, marginTop: 20, background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)" }} onClick={() => {
                  store.set("dm_first_run_done", true);
                  setFirstRunDone(true);
                  setToast("시작합니다 ✅");
                }}>🚀 시작하기</button>
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
          onToggleTask={(id) => setTodayData(prev => ({
            ...prev,
            tasks: prev.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t),
          }))}
          goalChecks={goalChecks} onToggleGoal={onToggleGoal}
          onSetTodayTasks={onSetTodayTasks} onSaveMonthGoals={onSaveMonthGoals}
          habits={habits} onToggleHabit={onToggleHabit}
          scores={scores} onOpenDate={openDetail} onOpenDateMemo={openDetailMemo}
          installPrompt={installPrompt} handleInstall={handleInstall}
          showInstallBanner={showInstallBanner} dismissInstallBanner={dismissInstallBanner}
          isIOS={isIOS} isKakao={isKakao} event={event} inviteBonus={inviteBonus}
          onOpenChat={() => changeScreen("chat")}
          isDark={isDark} setIsDark={setIsDark}
          getValidGcalToken={getValidGcalToken}
          myRank={myRank} onOpenStats={() => changeScreen("stats")}
        />
      );
    }
    if (screen === "today") {
      const d = plans[todayStr] || newDay(todayStr);
      return (
        <Today dateStr={todayStr} data={d} setData={setTodayData}
          toast={toast} setToast={setToast} plans={plans} />
      );
    }
    if (screen === "history") {
      return <History plans={plans} onOpenDate={openDetail} habits={habits} />;
    }
    if (screen === "stats") {
      return <Stats plans={plans} habits={habits} authUser={authUser} />;
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
          event={event} setEvent={setEvent}
          onAddInviteBonus={addInviteBonus}
          driveToken={driveToken} driveTokenExp={driveTokenExp}
          onDriveConnect={connectDrive} onDriveBackup={performDriveBackup}
          lastDriveBackup={lastDriveBackup}
          onOpenAdmin={() => changeScreen("admin")}
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
      />;
    }
    return null;
  };

  return (
    <div style={S.app}>
      <div style={{...S.phone, ...phoneStyleOverride}}>
        {renderScreen()}
        {screen !== "detail" && screen !== "admin" && screen !== "chat" && <BottomNav screen={screen} setScreen={changeScreen} badge={{
          home: (todayData?.tasks || []).filter(t => t.title.trim() && !t.done).length || 0,
        }} />}
      </div>
    </div>
  );
}
