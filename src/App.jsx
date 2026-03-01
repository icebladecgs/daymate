import { useEffect, useMemo, useRef, useState } from "react";

/* =========================================================
   DayMate Lite (safe, mobile-friendly)
   - 3 tasks/day, check-ins at 07:30 / 12:00 / 18:00 / 22:00
   - journal at night
   - calendar/history
   - yearly/monthly goals
   - backup/export/import JSON
   - Notification guards to avoid white screen on mobile
========================================================= */

// ---------- Safe Storage ----------
const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

// ---------- Date helpers ----------
const pad2 = (n) => String(n).padStart(2, "0");
const toDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const formatKoreanDate = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  const dow = "일월화수목금토"[d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${dow}요일`;
};
const monthLabel = (y, m0) => `${y}년 ${m0 + 1}월`;

// ---------- Text helpers ----------
const parseLines = (text) =>
  (text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

const clampList = (arr, max) => arr.slice(0, max);

// ---------- Notification (GUARDED) ----------
const hasNotification = () =>
  typeof window !== "undefined" && "Notification" in window;

const getPermission = () => {
  if (!hasNotification()) return "unsupported";
  return Notification.permission; // default | granted | denied
};

const requestPermission = async () => {
  if (!hasNotification()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
};

const sendNotification = (title, body, iconEmoji = "✅") => {
  if (!hasNotification()) return null;
  if (Notification.permission !== "granted") return null;
  try {
    const iconSvg =
      "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${iconEmoji}</text></svg>`
      );
    const n = new Notification(title, {
      body,
      icon: iconSvg,
      badge: iconSvg,
      tag: "daymate-" + Date.now(),
      requireInteraction: false,
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore
      }
      try {
        n.close();
      } catch {
        // ignore
      }
    };
    return n;
  } catch {
    // ignore
    return null;
  }
};

// ---------- Sound helpers ----------
const playSound = (frequency = 800, duration = 200) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration / 1000);
  } catch {
    // ignore
  }
};

const playSuccessSound = () => playSound(800, 150);

// setTimeout 기반 (탭 열려있을 때만 동작)
class NotifScheduler {
  constructor() {
    this.timers = {};
  }
  
  cancelAll() {
    Object.keys(this.timers).forEach((k) => {
      clearTimeout(this.timers[k]);
      delete this.timers[k];
    });
  }
  msUntil(timeStr) {
    const [hh, mm] = timeStr.split(":").map(Number);
    const now = new Date();
    const t = new Date();
    t.setHours(hh, mm, 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    return t.getTime() - now.getTime();
  }
  schedule(id, timeStr, title, body, iconEmoji = "🔔") {
    clearTimeout(this.timers[id]);
    const fire = () => {
      sendNotification(title, body, iconEmoji);
      // next day
      this.timers[id] = setTimeout(fire, 24 * 60 * 60 * 1000);
    };
    this.timers[id] = setTimeout(fire, this.msUntil(timeStr));
  }
  apply(enabled, userName) {
    this.cancelAll();
    if (!enabled) return;
    if (getPermission() !== "granted") return;

    this.schedule(
      "m0730",
      "07:30",
      "DayMate Lite 🌅",
      `${userName}님, 오늘 할 일 3가지를 정해볼까요?`,
      "🌅"
    );
    this.schedule(
      "m1200",
      "12:00",
      "DayMate Lite 🕛",
      `${userName}님, 1차 체크 시간이에요. 진행 상황 확인!`,
      "🕛"
    );
    this.schedule(
      "m1800",
      "18:00",
      "DayMate Lite 🌆",
      `${userName}님, 2차 체크 시간이에요. 남은 3가지 점검!`,
      "🌆"
    );
    this.schedule(
      "m2200",
      "22:00",
      "DayMate Lite 🌙",
      `${userName}님, 마지막 체크 + 일기 작성하고 마무리해요.`,
      "🌙"
    );
  }
}
const scheduler = new NotifScheduler();

// ---------- Styles ----------
const S = {
  app: {
    background: "#0F1117",
    color: "#F0F2F8",
    fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif",
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
  },
  phone: {
    width: "100%",
    maxWidth: 430, // will override in App render when desktop
    minHeight: "100vh",
    background: "#181C27",
    display: "flex",
    flexDirection: "column",
  },
  content: { flex: 1, overflowY: "auto", paddingBottom: 90 },
  topbar: {
    padding: "18px 20px 12px",
    borderBottom: "1px solid #2D344A",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: 900 },
  sub: { fontSize: 12, color: "#A8AFCA", marginTop: 2 },
  card: {
    background: "#1E2336",
    border: "1px solid #2D344A",
    borderRadius: 14,
    padding: "14px 14px",
    margin: "0 18px 10px",
  },
  sectionTitle: {
    padding: "14px 18px 8px",
    fontSize: 11,
    letterSpacing: "0.1em",
    color: "#5C6480",
    fontWeight: 800,
    textTransform: "uppercase",
  },
  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 10,
    background: "#252B3E",
    border: "1.5px solid #2D344A",
    color: "#F0F2F8",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  },
  btn: {
    width: "100%",
    marginTop: 10,
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 4px 18px rgba(108,142,255,.25)",
  },
  btnGhost: {
    width: "100%",
    marginTop: 10,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1.5px solid #363D54",
    background: "transparent",
    color: "#A8AFCA",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  pill: (on) => ({
    padding: "7px 12px",
    borderRadius: 999,
    border: `1.5px solid ${on ? "#6C8EFF" : "#2D344A"}`,
    background: on ? "rgba(108,142,255,.12)" : "#1E2336",
    color: on ? "#6C8EFF" : "#A8AFCA",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  }),
  bottomNav: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 430,
    background: "#181C27",
    borderTop: "1px solid #2D344A",
    padding: "10px 0 26px",
    display: "flex",
    justifyContent: "space-around",
    zIndex: 100,
  },
  navItem: (active) => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    fontSize: 11,
    color: active ? "#6C8EFF" : "#5C6480",
    cursor: "pointer",
    padding: "4px 10px",
    border: "none",
    background: "transparent",
    fontFamily: "inherit",
  }),
  toast: {
    position: "fixed",
    bottom: 105,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1A2E20",
    border: "1px solid #2E7D52",
    color: "#4ADE80",
    padding: "10px 18px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 800,
    zIndex: 999,
    boxShadow: "0 4px 16px rgba(0,0,0,.35)",
  },
};

// ---------- UI atoms ----------
function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1900);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div style={S.toast}>{msg}</div>;
}

function BottomNav({ screen, setScreen }) {
  const items = [
    { id: "home", icon: "🏠", label: "홈" },
    { id: "today", icon: "✅", label: "오늘" },
    { id: "history", icon: "📅", label: "기록" },
    { id: "stats", icon: "📊", label: "통계" },
    { id: "settings", icon: "⚙️", label: "설정" },
  ];
  return (
    <div style={S.bottomNav}>
      {items.map((it) => (
        <button
          key={it.id}
          style={S.navItem(screen === it.id)}
          onClick={() => setScreen(it.id)}
        >
          <span style={{ fontSize: 20 }}>{it.icon}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- Data model ----------
/*
dm_user: { name }
dm_goals: { year: string[], month: string[] }
dm_notif_enabled: boolean
dm_day_YYYY-MM-DD:
  {
    date,
    tasks: [{id,title, done, checkedAt}],
    checks: { "07:30": true/false, "12:00": true/false, "18:00": true/false, "22:00": true/false },
    journal: { body, savedAt }
  }
*/

const CHECK_TIMES = ["07:30", "12:00", "18:00", "22:00"];

const newDay = (date) => ({
  date,
  tasks: [
    { id: "t1", title: "", done: false, checkedAt: null },
    { id: "t2", title: "", done: false, checkedAt: null },
    { id: "t3", title: "", done: false, checkedAt: null },
  ],
  checks: { "07:30": false, "12:00": false, "18:00": false, "22:00": false },
  journal: { body: "", savedAt: null },
});

function dayKey(dateStr) {
  return `dm_day_${dateStr}`;
}

function loadDay(dateStr) {
  return store.get(dayKey(dateStr), null);
}

function saveDay(dateStr, data) {
  store.set(dayKey(dateStr), data);
}

function listAllDays() {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith("dm_day_"))
      .map((k) => k.replace("dm_day_", ""))
      .filter((ds) => {
        try { return !!loadDay(ds); } catch { return false; }
      })
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}

// ---------- Streak & Stats ----------
const isPerfectDay = (dayData) => {
  if (!dayData || !dayData.tasks) return false;
  const filledTasks = dayData.tasks.filter((t) => t.title.trim()).length;
  const doneTasks = dayData.tasks.filter((t) => t.done && t.title.trim()).length;
  const hasJournal = !!dayData.journal?.body?.trim();
  return filledTasks === 3 && doneTasks === 3 && hasJournal;
};

const calcStreak = (plans) => {
  let streak = 0;
  let current = new Date();
  while (streak < 365) {
    const dateStr = toDateStr(current);
    const day = plans[dateStr];
    if (!isPerfectDay(day)) break;
    streak++;
    current.setDate(current.getDate() - 1);
  }
  return streak;
};

const calcWeeklyStats = (plans) => {
  const days = [];
  let current = new Date();
  for (let i = 0; i < 7; i++) {
    const dateStr = toDateStr(current);
    const day = plans[dateStr];
    const filledTasks = (day?.tasks || []).filter((t) => t.title.trim()).length;
    const doneTasks = (day?.tasks || []).filter((t) => t.done && t.title.trim()).length;
    days.push({
      date: dateStr,
      rate: filledTasks === 0 ? 0 : Math.round((doneTasks / 3) * 100),
      isPerfect: isPerfectDay(day),
    });
    current.setDate(current.getDate() - 1);
  }
  return days.reverse();
};

// ---------- Goal progress ----------
const calcGoalProgress = (plans) => {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  let perfectDaysThisMonth = 0;
  let daysInMonth = 0;
  
  let checkDate = new Date(currentYear, currentMonth, 1);
  while (checkDate.getMonth() === currentMonth) {
    daysInMonth++;
    const dateStr = toDateStr(checkDate);
    if (isPerfectDay(plans[dateStr])) {
      perfectDaysThisMonth++;
    }
    checkDate.setDate(checkDate.getDate() + 1);
  }
  
  const monthProgress = Math.round((perfectDaysThisMonth / daysInMonth) * 100);
  
  // 연간 진행도: 1월 1일부터 오늘까지
  let perfectDaysThisYear = 0;
  let daysInYear = 0;
  
  checkDate = new Date(currentYear, 0, 1);
  const endDate = new Date();
  while (checkDate <= endDate) {
    daysInYear++;
    const dateStr = toDateStr(checkDate);
    if (isPerfectDay(plans[dateStr])) {
      perfectDaysThisYear++;
    }
    checkDate.setDate(checkDate.getDate() + 1);
  }
  
  const yearProgress = Math.round((perfectDaysThisYear / daysInYear) * 100);
  
  return { monthProgress, yearProgress, perfectDaysThisMonth, daysInMonth };
};

// ---------- Screens ----------
function Home({ user, goals, todayData, plans, onGoToday, onGoHistory }) {
  const today = toDateStr();
  const hasTasks = todayData?.tasks?.some((t) => t.title.trim());
  const doneCount = (todayData?.tasks || []).filter((t) => t.done && t.title.trim())
    .length;
  const filledCount = (todayData?.tasks || []).filter((t) => t.title.trim()).length;

  const statusText = !hasTasks
    ? "오늘 할 일 3가지를 정해보세요"
    : `${filledCount}개 중 ${doneCount}개 완료`;

  const streak = useMemo(() => calcStreak(plans), [plans]);
  const weeklyStats = useMemo(() => calcWeeklyStats(plans), [plans]);
  const weeklyAvg = useMemo(() => 
    Math.round(weeklyStats.reduce((a, d) => a + d.rate, 0) / 7),
    [weeklyStats]
  );
  const goalProgress = useMemo(() => calcGoalProgress(plans), [plans]);

  return (
    <div style={S.content}>
      <div style={S.topbar}>
        <div>
          <div style={S.title}>DayMate Lite</div>
          <div style={S.sub}>{user.name}님 · {formatKoreanDate(today)}</div>
        </div>
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 800 }}>
          {getPermission() === "granted" ? "🔔" : "🔕"}
        </div>
      </div>

      <div style={S.sectionTitle}>🔥 연속 기록</div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: streak > 0 ? "#FCD34D" : "#5C6480" }}>
            {streak}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#F0F2F8" }}>
              {streak > 0 ? `${streak}일 연속` : "연속 기록 없음"}
            </div>
            <div style={{ fontSize: 12, color: "#A8AFCA", marginTop: 4 }}>
              완벽한 하루 (3개 완료 + 일기)
            </div>
          </div>
        </div>
      </div>

      <div style={S.sectionTitle}>📊 이번 주</div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: "#A8AFCA", fontWeight: 900 }}>평균 완료율</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: weeklyAvg >= 80 ? "#4ADE80" : weeklyAvg >= 50 ? "#FCD34D" : "#F87171" }}>
            {weeklyAvg}%
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, justifyContent: "space-between" }}>
          {weeklyStats.map((d, i) => {
            const dow = "일월화수목금토"[new Date(d.date).getDay()];
            return (
              <div key={i} style={{ flex: 1, textAlign: "center" }}>
                <div style={{
                  height: 32,
                  borderRadius: 6,
                  background: d.isPerfect ? "rgba(74,222,128,.20)" : d.rate >= 80 ? "rgba(252,211,77,.15)" : d.rate > 0 ? "rgba(248,113,113,.12)" : "#252B3E",
                  border: `1.5px solid ${d.isPerfect ? "#4ADE80" : d.rate >= 80 ? "#FCD34D" : d.rate > 0 ? "#F87171" : "#1E2336"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 900,
                  color: d.isPerfect ? "#4ADE80" : "#A8AFCA",
                  marginBottom: 6,
                }}>
                  {d.isPerfect ? "✓" : d.rate > 0 ? d.rate : ""}
                </div>
                <div style={{ fontSize: 11, color: "#5C6480", fontWeight: 800 }}>{dow}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={S.sectionTitle}>목표</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 8 }}>
          👑 연간 목표
        </div>
        <div style={{ fontSize: 13, color: "#F0F2F8", lineHeight: 1.6, marginBottom: 12 }}>
          {(goals.year || []).length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {goals.year.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          ) : (
            <span style={{ color: "#5C6480" }}>설정에서 입력하세요</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#A8AFCA", fontWeight: 800, marginBottom: 4 }}>
          진행도: {goalProgress.yearProgress}%
        </div>
        <div style={{
          height: 8,
          background: "#252B3E",
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: 12,
        }}>
          <div style={{
            height: "100%",
            background: goalProgress.yearProgress >= 80 ? "#4ADE80" : goalProgress.yearProgress >= 50 ? "#FCD34D" : "#F87171",
            width: `${goalProgress.yearProgress}%`,
            transition: "width 0.3s",
          }} />
        </div>

        <div style={{ height: 12 }} />

        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 8 }}>
          📅 이달 목표
        </div>
        <div style={{ fontSize: 13, color: "#F0F2F8", lineHeight: 1.6, marginBottom: 12 }}>
          {(goals.month || []).length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {goals.month.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          ) : (
            <span style={{ color: "#5C6480" }}>설정에서 입력하세요</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#A8AFCA", fontWeight: 800, marginBottom: 4 }}>
          진행도: {goalProgress.monthProgress}% ({goalProgress.perfectDaysThisMonth}/{goalProgress.daysInMonth})
        </div>
        <div style={{
          height: 8,
          background: "#252B3E",
          borderRadius: 4,
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            background: goalProgress.monthProgress >= 80 ? "#4ADE80" : goalProgress.monthProgress >= 50 ? "#FCD34D" : "#F87171",
            width: `${goalProgress.monthProgress}%`,
            transition: "width 0.3s",
          }} />
        </div>
      </div>

      <div style={S.sectionTitle}>오늘</div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 22 }}>✅</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900 }}>{statusText}</div>
            <div style={{ fontSize: 12, color: "#A8AFCA", marginTop: 4 }}>
              체크: 07:30 / 12:00 / 18:00 / 22:00
            </div>
          </div>
        </div>
        <button style={S.btn} onClick={onGoToday}>
          오늘 화면으로 가기 →
        </button>
        <button style={S.btnGhost} onClick={onGoHistory}>
          기록(달력) 보기 →
        </button>
      </div>
      <div style={{ height: 12 }} />
    </div>
  );
}

function Today({ dateStr, data, setData, toast, setToast }) {
  const getDefaultTime = () => {
    const now = new Date();
    const hm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    return CHECK_TIMES.slice()
      .reverse()
      .find((t) => t <= hm) || "07:30";
  };

  const [activeTime, setActiveTime] = useState(getDefaultTime());

  const tasksFilled = data.tasks.filter((t) => t.title.trim()).length;
  const doneCount = data.tasks.filter((t) => t.done && t.title.trim()).length;
  const isPerfect = tasksFilled >= 3 && doneCount === tasksFilled && !!data.journal?.body?.trim();

  const toggleDone = (id) => {
    setData((prev) => {
      const next = { ...prev };
      next.tasks = next.tasks.map((t) =>
        t.id === id
          ? { ...t, done: !t.done, checkedAt: new Date().toISOString() }
          : t
      );
      if (next.tasks.find(t => t.id === id).done) {
        playSuccessSound();
      }
      return next;
    });
  };

  const setTitle = (id, title) => {
    setData((prev) => {
      const next = { ...prev };
      next.tasks = next.tasks.map((t) =>
        t.id === id ? { ...t, title } : t
      );
      return next;
    });
  };

  const markCheck = (timeStr) => {
    setData((prev) => {
      const next = { ...prev };
      next.checks = { ...next.checks, [timeStr]: true };
      return next;
    });
    setToast(`체크 완료 (${timeStr}) ✅`);
  };

  const allSet = tasksFilled === 3;

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      <div style={S.topbar}>
        <div>
          <div style={S.title}>오늘</div>
          <div style={S.sub}>{formatKoreanDate(dateStr)} · {doneCount}/3 완료</div>
        </div>
      </div>

      {isPerfect && (
        <div style={{
          ...S.card,
          background: "linear-gradient(135deg,rgba(74,222,128,.15),rgba(108,142,255,.10))",
          border: "1.5px solid rgba(74,222,128,.35)",
        }}>
          <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 14, fontWeight: 900, textAlign: "center", color: "#4ADE80" }}>
            완벽한 하루!
          </div>
          <div style={{ fontSize: 12, textAlign: "center", color: "#A8AFCA", marginTop: 6 }}>
            3가지 완료 + 일기 작성. 연속 기록이 쌓이고 있어요 🔥
          </div>
        </div>
      )}

      <div style={S.sectionTitle}>{`오늘 할 일 (${data.tasks.length}개)`}</div>
      <div style={S.card}>
        {data.tasks.map((t, idx) => (
          <div key={t.id} style={{ display: "flex", gap: 10, marginBottom: idx < data.tasks.length - 1 ? 10 : 0 }}>
            <button
              onClick={() => toggleDone(t.id)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                border: `1.5px solid ${t.done ? "#4ADE80" : "#2D344A"}`,
                background: t.done ? "rgba(74,222,128,.12)" : "#252B3E",
                color: t.done ? "#4ADE80" : "#A8AFCA",
                fontSize: 18,
                cursor: "pointer",
              }}
              title="완료 체크"
            >
              {t.done ? "✓" : idx + 1}
            </button>
            <input
              style={S.input}
              value={t.title}
              onChange={(e) => setTitle(t.id, e.target.value)}
              placeholder={`할 일 ${idx + 1}`}
              maxLength={60}
            />
            <button
              style={{ marginLeft: 6, background: "transparent", border: "none", color: "#F87171", cursor: "pointer" }}
              onClick={() => {
                setData(prev => {
                  const next = { ...prev };
                  next.tasks = next.tasks.filter(x => x.id !== t.id);
                  return next;
                });
              }}
              title="삭제"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          style={{ ...S.btn, marginTop: 8 }}
          onClick={() => {
            setData(prev => {
              const next = { ...prev };
              const id = `t${Date.now()}`;
              next.tasks = [...next.tasks, { id, title: "", done: false, checkedAt: null }];
              return next;
            });
          }}
        >
          ➕ 할 일 추가
        </button>
        <div style={{ marginTop: 10, fontSize: 12, color: allSet ? "#4ADE80" : "#FCD34D", fontWeight: 900 }}>
          {allSet ? "좋아요! 3가지가 정해졌어요." : "3가지를 모두 입력하면 루틴이 더 선명해져요."}
        </div>
      </div>

      <div style={S.sectionTitle}>체크 (07:30 / 12:00 / 18:00 / 22:00)</div>
      <div style={{ display: "flex", gap: 8, padding: "0 18px 10px", overflowX: "auto" }}>
        {CHECK_TIMES.map((t) => (
          <div
            key={t}
            style={S.pill(activeTime === t)}
            onClick={() => setActiveTime(t)}
          >
            {data.checks[t] ? "✅ " : "⏱️ "}
            {t}
          </div>
        ))}
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 6 }}>
          {activeTime} 체크
        </div>
        <div style={{ fontSize: 12, color: "#A8AFCA", lineHeight: 1.6 }}>
          {activeTime === "07:30" && "오늘 할 일 3가지가 맞는지 확인하고 시작!"}
          {activeTime === "12:00" && "점심 전에 진행 상황 점검."}
          {activeTime === "18:00" && "퇴근 전/후 남은 것 정리."}
          {activeTime === "22:00" && "마지막 체크 후 일기 작성!"}
        </div>
        <button
          style={S.btn}
          onClick={() => markCheck(activeTime)}
          disabled={data.checks[activeTime]}
        >
          {data.checks[activeTime] ? "이미 체크됨 ✅" : "체크 완료하기"}
        </button>
      </div>

      <div style={S.sectionTitle}>일기 (22:00 이후 추천)</div>
      <div style={S.card}>
        <textarea
          rows={6}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={data.journal.body}
          onChange={(e) =>
            setData((prev) => ({
              ...prev,
              journal: { ...prev.journal, body: e.target.value },
            }))
          }
          placeholder="오늘 하루를 한 줄이라도 기록해봐요."
          maxLength={1200}
        />
        <button
          style={S.btn}
          onClick={() => {
            setData((prev) => ({
              ...prev,
              journal: { ...prev.journal, savedAt: new Date().toISOString() },
            }));
            setToast("일기 저장 ✅");
          }}
        >
          일기 저장
        </button>
        <div style={{ fontSize: 11, color: "#5C6480", marginTop: 8, textAlign: "right" }}>
          {data.journal.body.length} / 1200
        </div>
      </div>

      <div style={{ height: 12 }} />
    </div>
  );
}

function History({ plans, onOpenDate }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month0, setMonth0] = useState(new Date().getMonth());

  const firstDay = new Date(year, month0, 1).getDay();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const today = toDateStr();

  const rateOf = (dateStr) => {
    const d = plans[dateStr];
    if (!d) return null;
    const filled = d.tasks.filter((t) => t.title.trim()).length;
    if (filled === 0) return 0;
    const done = d.tasks.filter((t) => t.done && t.title.trim()).length;
    return Math.round((done / 3) * 100);
  };

  const styleOf = (r, isToday, isPerfect) => {
    if (isPerfect) return { background: "rgba(74,222,128,.20)", color: "#4ADE80", fontWeight: 900, border: "1.5px solid #4ADE80" };
    if (isToday) return { background: "#6C8EFF", color: "#fff", fontWeight: 900 };
    if (r === null) return { background: "transparent", color: "#5C6480" };
    if (r >= 80) return { background: "rgba(74,222,128,.18)", color: "#4ADE80", fontWeight: 900 };
    if (r >= 50) return { background: "rgba(252,211,77,.14)", color: "#FCD34D", fontWeight: 900 };
    return { background: "rgba(248,113,113,.10)", color: "#F87171", fontWeight: 900 };
  };

  const prev = () => {
    if (month0 === 0) {
      setMonth0(11);
      setYear((y) => y - 1);
    } else setMonth0((m) => m - 1);
  };
  const next = () => {
    if (month0 === 11) {
      setMonth0(0);
      setYear((y) => y + 1);
    } else setMonth0((m) => m + 1);
  };

 const recent = useMemo(() => {
  try {
    return Object.keys(plans)
      .filter((ds) => plans[ds]?.tasks)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 10);
  } catch { return []; }
}, [plans]);


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
            <div key={d} style={{ textAlign: "center", fontSize: 11, color: "#5C6480", fontWeight: 900 }}>
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
            const st = styleOf(r, isToday, perfect);
            const clickable = r !== null;
            return (
              <div
                key={ds}
                onClick={() => clickable && onOpenDate(ds)}
                style={{
                  aspectRatio: 1,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: clickable ? "pointer" : "default",
                  ...st,
                }}
                title={clickable ? (perfect ? "완벽한 하루 ✓" : `${r}%`) : ""}
              >
                {perfect ? "✓" : day}
              </div>
            );
          })}
        </div>
      </div>

      <div style={S.sectionTitle}>최근 기록</div>
      {recent.length === 0 && (
        <div style={{ padding: "20px 18px", color: "#5C6480", textAlign: "center" }}>
          아직 기록이 없어요 🌱
        </div>
      )}
      {recent.map((ds) => {
        const d = plans[ds];
        const done = d.tasks.filter((t) => t.done && t.title.trim()).length;
        const filled = d.tasks.filter((t) => t.title.trim()).length;
        const hasJournal = !!d.journal?.body?.trim();
        return (
          <div key={ds} style={{ ...S.card, cursor: "pointer" }} onClick={() => onOpenDate(ds)}>
            <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900 }}>
              {formatKoreanDate(ds)}
            </div>
            <div style={{ fontSize: 13, marginTop: 8, color: "#F0F2F8" }}>
              ✅ {done}/{Math.max(3, filled || 3)} · {hasJournal ? "📖 일기 있음" : "📖 일기 없음"}
            </div>
          </div>
        );
      })}
      <div style={{ height: 12 }} />
    </div>
  );
}

function DayDetail({ dateStr, data, onBack }) {
  const done = data.tasks.filter((t) => t.done && t.title.trim()).length;
  const lines = data.tasks.map((t, idx) => ({
    idx,
    title: t.title.trim() || `할 일 ${idx + 1} (미입력)`,
    done: !!t.done && !!t.title.trim(),
  }));

  return (
    <div style={S.content}>
      <div style={S.topbar}>
        <button onClick={onBack} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={S.title}>{formatKoreanDate(dateStr)}</div>
          <div style={S.sub}>완료 {done}/3</div>
        </div>
        <div />
      </div>

      <div style={S.sectionTitle}>오늘의 3가지</div>
      <div style={S.card}>
        {lines.map((l) => (
          <div key={l.idx} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8,
              background: l.done ? "rgba(74,222,128,.16)" : "#252B3E",
              border: `1.5px solid ${l.done ? "#4ADE80" : "#2D344A"}`,
              color: l.done ? "#4ADE80" : "#A8AFCA",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 900
            }}>
              {l.done ? "✓" : l.idx + 1}
            </div>
            <div style={{ fontSize: 14, color: "#F0F2F8", flex: 1 }}>{l.title}</div>
          </div>
        ))}
      </div>

      <div style={S.sectionTitle}>체크</div>
      <div style={S.card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CHECK_TIMES.map((t) => (
            <div
              key={t}
              style={{
                padding: "7px 10px",
                borderRadius: 999,
                border: "1.5px solid #2D344A",
                background: data.checks[t] ? "rgba(108,142,255,.12)" : "#252B3E",
                color: data.checks[t] ? "#6C8EFF" : "#A8AFCA",
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              {data.checks[t] ? "✅" : "⏱️"} {t}
            </div>
          ))}
        </div>
      </div>

      <div style={S.sectionTitle}>일기</div>
      <div style={S.card}>
        {data.journal?.body?.trim() ? (
          <div style={{ fontSize: 14, color: "#F0F2F8", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {data.journal.body}
          </div>
        ) : (
          <div style={{ color: "#5C6480" }}>일기 없음</div>
        )}
      </div>
      <div style={{ height: 12 }} />
    </div>
  );
}

function Stats({ plans }) {
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  let perfectDays = 0;
  let filledDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
    const dayData = plans[dateStr];
    if (dayData && (dayData.tasks || []).some(t => t.title.trim())) {
      filledDays++;
      if (isPerfectDay(dayData)) {
        perfectDays++;
      }
    }
  }

  const perfectRate = filledDays === 0 ? 0 : Math.round((perfectDays / filledDays) * 100);

  // 월별 데이터
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
        if (isPerfectDay(dayData)) {
          perfect++;
        }
      }
    }
    monthStats.push({ month: m, perfect, filled, rate: filled === 0 ? 0 : Math.round((perfect / filled) * 100) });
  }

  const prev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const next = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
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

      <div style={S.sectionTitle}>이달 완벽한 날</div>
      <div style={S.card}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 42, fontWeight: 900, color: perfectRate >= 80 ? "#4ADE80" : perfectRate >= 50 ? "#FCD34D" : "#F87171", marginBottom: 8 }}>
            {perfectDays}
          </div>
          <div style={{ fontSize: 13, color: "#A8AFCA", marginBottom: 12 }}>
            {filledDays}일 중 {perfectDays}일 완벽함
          </div>
          <div style={{
            height: 12,
            background: "#252B3E",
            borderRadius: 6,
            overflow: "hidden",
            marginBottom: 8,
          }}>
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
      <div style={S.card}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {monthStats.map((m) => (
            <div key={m.month} style={{
              textAlign: "center",
              padding: 12,
              background: "#252B3E",
              borderRadius: 10,
              border: m.month === viewMonth ? "2px solid #6C8EFF" : "1px solid #2D344A",
            }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#A8AFCA", marginBottom: 8 }}>
                {pad2(m.month + 1)}월
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: m.rate >= 80 ? "#4ADE80" : m.rate >= 50 ? "#FCD34D" : m.filled > 0 ? "#F87171" : "#5C6480" }}>
                {m.filled === 0 ? "-" : m.rate + "%"}
              </div>
              <div style={{ fontSize: 10, color: "#5C6480", marginTop: 4 }}>
                {m.perfect}/{m.filled}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 12 }} />
    </div>
  );
}

function Settings({ user, setUser, goals, setGoals, notifEnabled, setNotifEnabled, toast, setToast }) {
  const [name, setName] = useState(user.name || "");
  const [yearText, setYearText] = useState((goals.year || []).join("\n"));
  const [monthText, setMonthText] = useState((goals.month || []).join("\n"));
  const [permission, setPermission] = useState(getPermission());
  const fileInputRef = useRef(null);

  const save = () => {
    const nextUser = { name: (name || "").trim() || "사용자" };
    const nextGoals = {
      year: clampList(parseLines(yearText), 5),
      month: clampList(parseLines(monthText), 3),
    };
    setUser(nextUser);
    setGoals(nextGoals);
    store.set("dm_user", nextUser);
    store.set("dm_goals", nextGoals);
    setToast("저장 완료 ✅");
  };

  const askPermission = async () => {
    const r = await requestPermission();
    setPermission(r);
    if (r === "granted") {
      setNotifEnabled(true);
      store.set("dm_notif_enabled", true);
      setToast("알림 권한 허용 ✅");
      sendNotification("DayMate Lite", "알림이 켜졌어요!", "🔔");
    } else if (r === "denied") {
      setToast("알림이 차단됨 🚫");
    }
  };

  // Backup export (all dm_ keys)
  const exportData = () => {
    const data = {};
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("dm_"))
        .forEach((k) => {
          data[k] = store.get(k);
        });
    } catch {
      // ignore export error
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daymate-backup-${toDateStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("백업 파일 다운로드 ✅");
  };

  const importData = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        Object.keys(data || {}).forEach((k) => {
          if (k.startsWith("dm_")) {
            store.set(k, data[k]);
          }
        });
        alert("복구 완료! 앱을 새로고침하세요.");
      } catch {
        alert("파일 형식이 올바르지 않습니다.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      <div style={S.topbar}>
        <div>
          <div style={S.title}>설정</div>
          <div style={S.sub}>이름 · 목표 · 알림 · 백업</div>
        </div>
      </div>

      <div style={S.sectionTitle}>프로필</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 8 }}>이름</div>
        <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
        <button style={S.btn} onClick={save}>저장</button>
      </div>

      <div style={S.sectionTitle}>목표</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 8 }}>
          👑 연간 목표 (최대 5개)
        </div>
        <textarea
          rows={5}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={yearText}
          onChange={(e) => setYearText(e.target.value)}
          placeholder="한 줄에 하나씩 입력"
        />
        <div style={{ height: 12 }} />
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 8 }}>
          📅 이달 목표 (최대 3개)
        </div>
        <textarea
          rows={3}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={monthText}
          onChange={(e) => setMonthText(e.target.value)}
          placeholder="한 줄에 하나씩 입력"
        />
        <button style={S.btn} onClick={save}>저장</button>
      </div>

      <div style={S.sectionTitle}>알림</div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900 }}>알림 ON/OFF</div>
            <div style={{ fontSize: 12, color: "#5C6480", marginTop: 4 }}>
              07:30 / 12:00 / 18:00 / 22:00 (탭이 열려 있을 때 동작)
            </div>
            {permission === "denied" && (
              <div style={{ fontSize: 12, color: "#F87171", marginTop: 6 }}>
                브라우저 알림이 차단되어 있어요. (사이트 설정에서 허용)
              </div>
            )}
            {permission === "default" && (
              <div style={{ fontSize: 12, color: "#FCD34D", marginTop: 6 }}>
                알림 권한을 먼저 허용해야 해요.
              </div>
            )}
            {permission === "unsupported" && (
              <div style={{ fontSize: 12, color: "#F87171", marginTop: 6 }}>
                이 브라우저는 알림을 지원하지 않아요.
              </div>
            )}
          </div>

          {/* Toggle */}
          <div
            onClick={() => {
              if (permission !== "granted") return;
              const next = !notifEnabled;
              setNotifEnabled(next);
              store.set("dm_notif_enabled", next);
              setToast(next ? "알림 ON ✅" : "알림 OFF");
              // scheduler 적용은 App에서 처리
            }}
            style={{
              width: 52,
              height: 28,
              borderRadius: 999,
              background: notifEnabled && permission === "granted" ? "#6C8EFF" : "#2D344A",
              cursor: permission === "granted" ? "pointer" : "not-allowed",
              position: "relative",
              opacity: permission === "granted" ? 1 : 0.5,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 4,
                left: notifEnabled && permission === "granted" ? 28 : 4,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#fff",
                transition: "left .2s",
              }}
            />
          </div>
        </div>

        {permission !== "granted" && permission !== "unsupported" && (
          <button style={S.btn} onClick={askPermission}>
            🔔 알림 권한 허용하기
          </button>
        )}

        <button
          style={S.btnGhost}
          onClick={() => {
            sendNotification("DayMate Lite", "테스트 알림입니다.", "🔔");
            setToast("테스트 발송(권한 필요) 🔔");
          }}
        >
          테스트 알림 보내기
        </button>
      </div>

      <div style={S.sectionTitle}>백업</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "#A8AFCA", lineHeight: 1.7 }}>
          • 이 앱 데이터는 각 기기 브라우저에 저장됩니다.<br />
          • JSON으로 백업하면 다른 기기에서 복구할 수 있어요.
        </div>

        <button style={S.btn} onClick={exportData}>
          📦 데이터 내보내기 (백업)
        </button>

        <button
          style={S.btnGhost}
          onClick={() => fileInputRef.current?.click()}
        >
          📥 데이터 가져오기 (복구)
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={importData}
          style={{ display: "none" }}
        />

        <button
          style={{ ...S.btnGhost, borderColor: "rgba(248,113,113,.35)", color: "#F87171" }}
          onClick={() => {
            if (!window.confirm("모든 데이터를 삭제할까요?")) return;
            if (!window.confirm("정말 삭제하시겠어요? (복구 불가)")) return;
            try {
              Object.keys(localStorage)
                .filter((k) => k.startsWith("dm_"))
                .forEach((k) => localStorage.removeItem(k));
            } catch {
              // ignore delete error
            }
            window.location.reload();
          }}
        >
          🗑️ 모든 데이터 삭제
        </button>
      </div>

      <div style={{ padding: "16px 18px", textAlign: "center", color: "#5C6480", fontSize: 12 }}>
        DayMate Lite · v2 (safe)
      </div>
      <div style={{ height: 12 }} />
    </div>
  );
}

// ---------- App ----------
export default function App() {
  const [screen, setScreen] = useState(() => {
    // deep link from query/hash
    try {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('screen') || window.location.hash.replace('#','');
      if (s) return s;
    } catch {}
    return "home";
  });
  const [toast, setToast] = useState("");

  // responsive width
  const [winW, setWinW] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const phoneStyleOverride = {
    maxWidth: winW < 480 ? 430 : '100%',
  };

  const [user, setUser] = useState(() => store.get("dm_user", { name: "사용자" }));
  const [goals, setGoals] = useState(() => store.get("dm_goals", { year: [], month: [] }));
  const [notifEnabled, setNotifEnabled] = useState(() => store.get("dm_notif_enabled", false));

  const todayStr = toDateStr();

  const [plans, setPlans] = useState(() => {
    const all = {};
    const dates = listAllDays();
    dates.forEach((ds) => {
      const d = loadDay(ds);
      if (d) all[ds] = d;
    });
    return all;
  });

  const [openDate, setOpenDate] = useState(null);

  const todayData = plans[todayStr] || null;

  const ensureToday = () => {
    setPlans((prev) => {
      if (prev[todayStr]) return prev;
      const d = newDay(todayStr);
      const next = { ...prev, [todayStr]: d };
      saveDay(todayStr, d);
      return next;
    });
  };

  // Persist user/goals when updated elsewhere
  useEffect(() => {
    store.set("dm_user", user);
  }, [user]);
  useEffect(() => {
    store.set("dm_goals", goals);
  }, [goals]);

  // Persist notifEnabled
  useEffect(() => {
    store.set("dm_notif_enabled", notifEnabled);
  }, [notifEnabled]);

  // Apply notifications (GUARDED)
  useEffect(() => {
    scheduler.apply(notifEnabled, user.name || "사용자");
    return () => scheduler.cancelAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifEnabled, user.name]);

  // Auto-create today when opening today screen
  useEffect(() => {
    if (screen === "today") ensureToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Save day data on change (today & edits)
  const setTodayData = (updater) => {
    setPlans((prev) => {
      const cur = prev[todayStr] || newDay(todayStr);
      const nextDay = typeof updater === "function" ? updater(cur) : updater;
      const next = { ...prev, [todayStr]: nextDay };
      saveDay(todayStr, nextDay);
      return next;
    });
  };

  const openDetail = (ds) => {
    setOpenDate(ds);
    setScreen("detail");
    window.history.replaceState(null,'',`?screen=detail&date=${ds}`);
  };

  // Onboarding-lite: first run ask name quickly
  const [firstRunDone, setFirstRunDone] = useState(() => !!store.get("dm_first_run_done", false));
  const [nameInput, setNameInput] = useState("");

  if (!firstRunDone) {
    return (
      <div style={S.app}>
        <div style={S.phone}>
          {toast && <Toast msg={toast} onDone={() => setToast("")} />}
          <div style={{ padding: "44px 22px 18px", textAlign: "center" }}>
            <div style={{
              width: 78, height: 78, borderRadius: 22, margin: "0 auto 18px",
              background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 34, boxShadow: "0 8px 28px rgba(108,142,255,.35)"
            }}>✅</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>DayMate Lite</div>
            <div style={{ fontSize: 13, color: "#A8AFCA", lineHeight: 1.7, marginTop: 10 }}>
              매일 “할 일 3가지”만 정하고<br/>체크하고, 일기 한 줄로 마무리.
            </div>
          </div>

          <div style={S.card}>
            <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 8 }}>이름</div>
            <input
              style={S.input}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="예: 계승"
              maxLength={20}
            />
            <button
              style={S.btn}
              onClick={() => {
                const nm = (nameInput || "").trim() || "사용자";
                setUser({ name: nm });
                store.set("dm_user", { name: nm });
                store.set("dm_first_run_done", true);
                setFirstRunDone(true);
                setToast("시작합니다 ✅");
              }}
            >
              시작하기 →
            </button>
          </div>

          <div style={{ padding: "0 22px", color: "#5C6480", fontSize: 12, lineHeight: 1.7 }}>
            • 데이터는 기기 브라우저에 저장됩니다<br/>
            • 백업은 설정에서 JSON으로 내보내기 가능
          </div>
          <div style={{ height: 30 }} />
        </div>
      </div>
    );
  }

  const render = (changeScreen) => {
    if (screen === "home") {
      return (
        <Home
          user={user}
          goals={goals}
          todayData={todayData}
          plans={plans}
          onGoToday={() => changeScreen("today")}
          onGoHistory={() => changeScreen("history")}
        />
      );
    }
    if (screen === "today") {
      const d = plans[todayStr] || newDay(todayStr);
      return (
        <Today
          dateStr={todayStr}
          data={d}
          setData={setTodayData}
          toast={toast}
          setToast={setToast}
        />
      );
    }
    if (screen === "history") {
      return <History plans={plans} onOpenDate={openDetail} />;
    }
    if (screen === "stats") {
      return <Stats plans={plans} />;
    }
    if (screen === "detail") {
      const d = plans[openDate];
      if (!openDate || !d) {
        return (
          <div style={S.content}>
            <div style={S.topbar}>
              <button onClick={() => changeScreen("history")} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>
                ←
              </button>
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
        <DayDetail
          dateStr={openDate}
          data={d}
          onBack={() => changeScreen("history")}
        />
      );
    }
    if (screen === "settings") {
      return (
        <Settings
          user={user}
          setUser={setUser}
          goals={goals}
          setGoals={setGoals}
          notifEnabled={notifEnabled}
          setNotifEnabled={setNotifEnabled}
          toast={toast}
          setToast={setToast}
        />
      );
    }
    return null;
  };

  const changeScreen = (s) => {
    setScreen(s);
    window.history.replaceState(null,'',`?screen=${s}`);
  };

  return (
    <div style={S.app}>
      <div style={{...S.phone, ...phoneStyleOverride}}>
        {render(changeScreen)}
        {screen !== "detail" && <BottomNav screen={screen} setScreen={changeScreen} />}
      </div>
    </div>
  );
}