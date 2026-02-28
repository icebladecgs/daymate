import { useEffect, useMemo, useRef, useState } from "react";

/* =========================================================================
   DayMate Lite — single-file App.jsx (Vite + React)
   - 오늘 BIG 3
   - 체크: 12 / 18 / 22
   - 22시 체크 후 일기
   - 연간/월간 목표 입력
   - 브라우저 알림(탭 열려있을 때 setTimeout 기반)
   - 로컬 저장(localStorage)
   - 백업/복구(JSON export/import)
   ========================================================================= */

// -------------------- Storage --------------------
const store = {
  get(k, d = null) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

// -------------------- Date utils --------------------
const pad2 = (n) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const parseYMD = (s) => new Date(`${s}T00:00:00`);
const formatKoreanDate = (s) => {
  const d = parseYMD(s);
  const dow = "일월화수목금토"[d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${dow}요일`;
};
const isSameDay = (a, b) => a === b;

// -------------------- Notification engine --------------------
const getPermission = () => {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission; // default | granted | denied
};
const requestPermission = async () => {
  if (!("Notification" in window)) return "unsupported";
  return await Notification.requestPermission();
};
const sendNotification = (title, body, icon = "🔔") => {
  if (!("Notification" in window)) return null;
  if (Notification.permission !== "granted") return null;
  try {
    const n = new Notification(title, {
      body,
      icon:
        "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>" +
        icon +
        "</text></svg>",
      tag: "daymate-lite-" + Date.now(),
      requireInteraction: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return n;
  } catch {
    return null;
  }
};

class Scheduler {
  constructor() {
    this.timers = {};
  }
  msUntil(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.getTime() - now.getTime();
  }
  cancel(id) {
    if (this.timers[id]) {
      clearTimeout(this.timers[id]);
      delete this.timers[id];
    }
  }
  cancelAll() {
    Object.keys(this.timers).forEach((id) => this.cancel(id));
  }
  scheduleDaily(id, timeStr, fn) {
    this.cancel(id);
    const fire = () => {
      fn();
      this.timers[id] = setTimeout(fire, 24 * 60 * 60 * 1000);
    };
    this.timers[id] = setTimeout(fire, this.msUntil(timeStr));
  }
  apply({ enabled, userName, getTodayPlan }) {
    this.cancelAll();
    if (!enabled) return;
    if (getPermission() !== "granted") return;

    const msgBig3 = () => {
      const p = getTodayPlan();
      const b = (p?.big3 || []).map((x, i) => `${i + 1}) ${x.text || "(비어있음)"}`).join("\n");
      return b || "오늘 BIG 3를 먼저 적어주세요 🙂";
    };

    this.scheduleDaily("0730", "07:30", () => {
      sendNotification("DayMate Lite 🌅", `${userName}님, 오늘 BIG 3를 적어볼까요?\n\n${msgBig3()}`, "🌅");
    });
    this.scheduleDaily("1200", "12:00", () => {
      sendNotification("DayMate Lite ⏱ 12시 체크", `${userName}님, 오전 진행 상황 체크!\n\n${msgBig3()}`, "⏱");
    });
    this.scheduleDaily("1800", "18:00", () => {
      sendNotification("DayMate Lite ⏱ 18시 체크", `${userName}님, 퇴근 전 체크!\n\n${msgBig3()}`, "⏱");
    });
    this.scheduleDaily("2200", "22:00", () => {
      sendNotification("DayMate Lite 🌙 22시 마감", `${userName}님, BIG 3 완료 체크하고 일기 한 줄!\n\n${msgBig3()}`, "🌙");
    });
  }
}
const scheduler = new Scheduler();

// -------------------- Helpers --------------------
const clampList = (arr, max) => arr.slice(0, max);
const parseLines = (txt) =>
  txt
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div
      style={{
        position: "fixed",
        bottom: 96,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(30,35,54,.98)",
        border: "1px solid rgba(108,142,255,.35)",
        color: "#EAF0FF",
        padding: "10px 14px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 800,
        zIndex: 9999,
        boxShadow: "0 10px 30px rgba(0,0,0,.35)",
        whiteSpace: "nowrap",
      }}
    >
      {msg}
    </div>
  );
}

// -------------------- Styles --------------------
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
    maxWidth: 430,
    minHeight: "100vh",
    background: "#181C27",
    display: "flex",
    flexDirection: "column",
  },
  content: { flex: 1, overflowY: "auto", paddingBottom: 96 },
  top: { padding: "20px 20px 10px", borderBottom: "1px solid #2D344A" },
  title: { fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em" },
  sub: { fontSize: 12, color: "#A8AFCA", marginTop: 4, fontWeight: 700 },

  sectionTitle: {
    padding: "14px 20px 8px",
    fontSize: 11,
    color: "#5C6480",
    fontWeight: 900,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  card: {
    margin: "0 20px 10px",
    background: "#1E2336",
    border: "1px solid #2D344A",
    borderRadius: 14,
    padding: 14,
  },
  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 10,
    background: "#252B3E",
    border: "1px solid #2D344A",
    color: "#F0F2F8",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  btn: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 8px 26px rgba(108,142,255,.22)",
  },
  btnGhost: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1.5px solid #363D54",
    background: "transparent",
    color: "#A8AFCA",
    fontSize: 14,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  nav: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 430,
    background: "#181C27",
    borderTop: "1px solid #2D344A",
    display: "flex",
    justifyContent: "space-around",
    padding: "10px 0 26px",
    zIndex: 100,
  },
  navItem: (on) => ({
    background: "transparent",
    border: "none",
    color: on ? "#6C8EFF" : "#5C6480",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 800,
    padding: "6px 12px",
  }),
  pill: (on) => ({
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid #2D344A",
    background: on ? "rgba(108,142,255,.14)" : "#1E2336",
    color: on ? "#6C8EFF" : "#A8AFCA",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 900,
    textAlign: "center",
  }),
};

// -------------------- Screens --------------------
const SC = { HOME: "home", HISTORY: "history", SETTINGS: "settings" };

function BottomNav({ screen, setScreen }) {
  return (
    <div style={S.nav}>
      <button style={S.navItem(screen === SC.HOME)} onClick={() => setScreen(SC.HOME)}>
        <span style={{ fontSize: 18 }}>🏠</span>
        홈
      </button>
      <button style={S.navItem(screen === SC.HISTORY)} onClick={() => setScreen(SC.HISTORY)}>
        <span style={{ fontSize: 18 }}>📅</span>
        기록
      </button>
      <button style={S.navItem(screen === SC.SETTINGS)} onClick={() => setScreen(SC.SETTINGS)}>
        <span style={{ fontSize: 18 }}>⚙️</span>
        설정
      </button>
    </div>
  );
}

function Home({ user, plan, setPlan, goals, setScreen }) {
  const [toast, setToast] = useState("");

  const doneCount = plan.big3.filter((x) => x.done && x.text.trim()).length;
  const totalCount = plan.big3.filter((x) => x.text.trim()).length;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  const toggleDone = (idx) => {
    const next = { ...plan, big3: plan.big3.map((b, i) => (i === idx ? { ...b, done: !b.done } : b)) };
    setPlan(next);
  };

  const updateText = (idx, text) => {
    const next = { ...plan, big3: plan.big3.map((b, i) => (i === idx ? { ...b, text } : b)) };
    setPlan(next);
  };

  const toggleCheck = (key) => {
    const next = { ...plan, checks: { ...plan.checks, [key]: !plan.checks[key] } };
    setPlan(next);
    setToast(`${key} 체크 ${next.checks[key] ? "완료 ✅" : "해제"}`);
  };

  const saveJournal = () => {
    setToast("일기 저장 ✅");
  };

  return (
    <div style={S.content}>
      <div style={S.top}>
        <div style={S.title}>DayMate Lite</div>
        <div style={S.sub}>
          {formatKoreanDate(plan.date)} · {user.name || "사용자"}
        </div>
      </div>

      <div style={S.sectionTitle}>목표</div>
      <div style={S.card}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 6 }}>👑 올해 목표</div>
            <div style={{ fontSize: 13, color: "#F0F2F8", lineHeight: 1.6, minHeight: 48 }}>
              {(goals.year?.length ? goals.year : ["아직 없어요. 설정에서 입력해요."]).slice(0, 5).map((t, i) => (
                <div key={i}>• {t}</div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 6 }}>📅 이달 목표</div>
            <div style={{ fontSize: 13, color: "#F0F2F8", lineHeight: 1.6, minHeight: 48 }}>
              {(goals.month?.length ? goals.month : ["아직 없어요. 설정에서 입력해요."]).slice(0, 3).map((t, i) => (
                <div key={i}>• {t}</div>
              ))}
            </div>
          </div>
        </div>
        <button style={{ ...S.btnGhost, marginTop: 12 }} onClick={() => setScreen(SC.SETTINGS)}>
          목표/설정 열기 →
        </button>
      </div>

      <div style={S.sectionTitle}>오늘의 BIG 3</div>
      <div style={S.card}>
        {plan.big3.map((b, idx) => (
          <div key={idx} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <input type="checkbox" checked={!!b.done} onChange={() => toggleDone(idx)} />
            <input
              style={{ ...S.input, flex: 1, padding: "10px 12px" }}
              placeholder={`오늘 중요한 것 ${idx + 1}`}
              value={b.text}
              onChange={(e) => updateText(idx, e.target.value)}
            />
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#A8AFCA", fontWeight: 800 }}>
          <span>완료 {doneCount}/{totalCount || 3}</span>
          <span style={{ color: pct >= 80 ? "#4ADE80" : pct >= 50 ? "#FCD34D" : "#F87171" }}>{pct}%</span>
        </div>
      </div>

      <div style={S.sectionTitle}>체크 (12 / 18 / 22)</div>
      <div style={S.card}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }} onClick={() => toggleCheck("12")} role="button" tabIndex={0} style={S.pill(plan.checks["12"])}>
            12시 체크
          </div>
          <div style={{ flex: 1 }} onClick={() => toggleCheck("18")} role="button" tabIndex={0} style={S.pill(plan.checks["18"])}>
            18시 체크
          </div>
          <div style={{ flex: 1 }} onClick={() => toggleCheck("22")} role="button" tabIndex={0} style={S.pill(plan.checks["22"])}>
            22시 체크
          </div>
        </div>

        <div style={{ fontSize: 12, color: "#5C6480", marginTop: 10, lineHeight: 1.6 }}>
          • 22시 체크 후 “하루 일기”를 작성하면 마무리!
        </div>
      </div>

      <div style={S.sectionTitle}>하루 일기 (22시)</div>
      <div style={S.card}>
        <textarea
          rows={6}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          placeholder="오늘 한 줄 회고 (잘한 점 / 아쉬운 점 / 내일 한 가지)"
          value={plan.journal}
          onChange={(e) => setPlan({ ...plan, journal: e.target.value })}
        />
        <button style={{ ...S.btn, marginTop: 12 }} onClick={saveJournal}>
          일기 저장
        </button>
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <div style={{ height: 24 }} />
    </div>
  );
}

function History({ plans, openDate }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth()); // 0-11

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  const getRate = (ds) => {
    const p = plans[ds];
    if (!p) return null;
    const filled = p.big3.filter((x) => x.text.trim()).length || 0;
    if (filled === 0) return 0;
    const done = p.big3.filter((x) => x.text.trim() && x.done).length;
    return Math.round((done / filled) * 100);
  };

  const rateStyle = (r, isTodayFlag) => {
    if (isTodayFlag) return { background: "#6C8EFF", color: "#fff", fontWeight: 900 };
    if (r === null) return { color: "#5C6480" };
    if (r >= 80) return { background: "rgba(74,222,128,.18)", color: "#4ADE80", fontWeight: 900 };
    if (r >= 50) return { background: "rgba(252,211,77,.14)", color: "#FCD34D", fontWeight: 900 };
    if (r > 0) return { background: "rgba(248,113,113,.10)", color: "#F87171", fontWeight: 900 };
    return { background: "rgba(255,255,255,.04)", color: "#A8AFCA", fontWeight: 900 };
  };

  const prev = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else setMonth((m) => m - 1);
  };
  const next = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else setMonth((m) => m + 1);
  };

  const recentDates = useMemo(() => Object.keys(plans).sort((a, b) => b.localeCompare(a)).slice(0, 12), [plans]);

  return (
    <div style={S.content}>
      <div style={S.top}>
        <div style={S.title}>기록</div>
        <div style={S.sub}>달력에서 날짜를 눌러 확인</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px 6px" }}>
        <div style={{ fontSize: 16, fontWeight: 900 }}>
          {year}년 {month + 1}월
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...S.btnGhost, width: 44, padding: "10px 0" }} onClick={prev}>
            ‹
          </button>
          <button style={{ ...S.btnGhost, width: 44, padding: "10px 0" }} onClick={next}>
            ›
          </button>
        </div>
      </div>

      <div style={{ padding: "0 20px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
          {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, color: "#5C6480", fontWeight: 900 }}>
              {d}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {Array(firstDay)
            .fill(null)
            .map((_, i) => (
              <div key={"e" + i} />
            ))}
          {Array(daysInMonth)
            .fill(null)
            .map((_, i) => {
              const day = i + 1;
              const ds = `${year}-${pad2(month + 1)}-${pad2(day)}`;
              const rate = getRate(ds);
              const isTodayFlag = isSameDay(ds, today);

              const clickable = rate !== null || isTodayFlag; // 오늘은 클릭 가능
              const style = rateStyle(rate, isTodayFlag);

              return (
                <div
                  key={day}
                  onClick={() => clickable && openDate(ds)}
                  style={{
                    aspectRatio: 1,
                    borderRadius: 12,
                    border: "1px solid rgba(45,52,74,.6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: clickable ? "pointer" : "default",
                    userSelect: "none",
                    ...style,
                  }}
                >
                  {day}
                </div>
              );
            })}
        </div>
      </div>

      <div style={S.sectionTitle}>최근 기록</div>
      {recentDates.length === 0 && (
        <div style={{ padding: "20px", color: "#5C6480", textAlign: "center", fontWeight: 900 }}>아직 기록이 없어요 🌱</div>
      )}
      {recentDates.map((d) => {
        const p = plans[d];
        const filled = p.big3.filter((x) => x.text.trim()).length || 0;
        const done = p.big3.filter((x) => x.text.trim() && x.done).length || 0;
        const rate = filled ? Math.round((done / filled) * 100) : 0;
        return (
          <div key={d} style={{ ...S.card, cursor: "pointer" }} onClick={() => openDate(d)}>
            <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900 }}>{formatKoreanDate(d)}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <div style={{ fontSize: 13, color: "#F0F2F8", fontWeight: 800 }}>
                BIG3 {done}/{filled || 3}
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, color: rate >= 80 ? "#4ADE80" : rate >= 50 ? "#FCD34D" : "#F87171" }}>
                {rate}%
              </div>
            </div>
          </div>
        );
      })}

      <div style={{ height: 24 }} />
    </div>
  );
}

function DayDetail({ date, plan, setPlanForDate, onBack }) {
  const [toast, setToast] = useState("");

  const update = (patch) => {
    setPlanForDate(date, { ...plan, ...patch });
  };
  const updateBig3 = (idx, patch) => {
    const next = plan.big3.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    update({ big3: next });
  };
  const toggleDone = (idx) => updateBig3(idx, { done: !plan.big3[idx].done });
  const toggleCheck = (key) => update({ checks: { ...plan.checks, [key]: !plan.checks[key] } });

  const filled = plan.big3.filter((x) => x.text.trim()).length || 0;
  const done = plan.big3.filter((x) => x.text.trim() && x.done).length || 0;
  const rate = filled ? Math.round((done / filled) * 100) : 0;

  return (
    <div style={S.content}>
      <div style={S.top}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={{ ...S.btnGhost, width: 52, padding: "10px 0" }} onClick={onBack}>
            ←
          </button>
          <div>
            <div style={S.title}>{formatKoreanDate(date)}</div>
            <div style={S.sub}>완료율 {rate}%</div>
          </div>
        </div>
      </div>

      <div style={S.sectionTitle}>BIG 3</div>
      <div style={S.card}>
        {plan.big3.map((b, idx) => (
          <div key={idx} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <input type="checkbox" checked={!!b.done} onChange={() => toggleDone(idx)} />
            <input
              style={{ ...S.input, flex: 1, padding: "10px 12px" }}
              value={b.text}
              placeholder={`중요한 것 ${idx + 1}`}
              onChange={(e) => updateBig3(idx, { text: e.target.value })}
            />
          </div>
        ))}
      </div>

      <div style={S.sectionTitle}>체크</div>
      <div style={S.card}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }} onClick={() => toggleCheck("12")} style={S.pill(plan.checks["12"])} role="button" tabIndex={0}>
            12시
          </div>
          <div style={{ flex: 1 }} onClick={() => toggleCheck("18")} style={S.pill(plan.checks["18"])} role="button" tabIndex={0}>
            18시
          </div>
          <div style={{ flex: 1 }} onClick={() => toggleCheck("22")} style={S.pill(plan.checks["22"])} role="button" tabIndex={0}>
            22시
          </div>
        </div>
      </div>

      <div style={S.sectionTitle}>일기</div>
      <div style={S.card}>
        <textarea
          rows={6}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={plan.journal}
          onChange={(e) => update({ journal: e.target.value })}
          placeholder="하루 한 줄 기록"
        />
        <button
          style={{ ...S.btn, marginTop: 12 }}
          onClick={() => {
            setToast("저장 ✅");
          }}
        >
          저장
        </button>
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <div style={{ height: 24 }} />
    </div>
  );
}

function Settings({ user, setUser, goals, setGoals, notifEnabled, setNotifEnabled, getTodayPlan }) {
  const [toast, setToast] = useState("");
  const [name, setName] = useState(user.name || "");
  const [yearText, setYearText] = useState((goals.year || []).join("\n"));
  const [monthText, setMonthText] = useState((goals.month || []).join("\n"));
  const [permission, setPermission] = useState(getPermission());

  const exportData = () => {
    const data = {};
    Object.keys(localStorage)
      .filter((k) => k.startsWith("dm_"))
      .forEach((k) => {
        try {
          data[k] = JSON.parse(localStorage.getItem(k));
        } catch {
          data[k] = localStorage.getItem(k);
        }
      });

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daymate-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
        Object.keys(data).forEach((k) => {
          if (k.startsWith("dm_")) {
            localStorage.setItem(k, JSON.stringify(data[k]));
          }
        });
        alert("복구 완료! 브라우저 새로고침(F5) 해주세요.");
      } catch {
        alert("파일 형식이 올바르지 않습니다.");
      }
    };
    reader.readAsText(file);
  };

  const save = () => {
    const nextUser = { ...user, name: name.trim() || "사용자" };
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

      scheduler.apply({
        enabled: true,
        userName: (user?.name || "사용자").trim() || "사용자",
        getTodayPlan,
      });
    } else if (r === "denied") {
      setToast("알림이 차단됨 🚫");
    }
  };

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      <div style={S.top}>
        <div style={S.title}>설정</div>
        <div style={S.sub}>이름 · 목표 · 알림 · 백업</div>
      </div>

      <div style={S.sectionTitle}>프로필</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 8 }}>이름</div>
        <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
      </div>

      <div style={S.sectionTitle}>목표</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 8 }}>👑 연간 목표 (최대 5개)</div>
        <textarea
          rows={5}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={yearText}
          onChange={(e) => setYearText(e.target.value)}
          placeholder="한 줄에 하나씩 입력"
        />
        <div style={{ height: 12 }} />
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 8 }}>📅 이달 목표 (최대 3개)</div>
        <textarea
          rows={3}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={monthText}
          onChange={(e) => setMonthText(e.target.value)}
          placeholder="한 줄에 하나씩 입력"
        />
        <button style={{ ...S.btn, marginTop: 12 }} onClick={save}>
          저장
        </button>
      </div>

      {/* ✅ 알림 섹션 */}
      <div style={S.sectionTitle}>알림</div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900 }}>알림 ON/OFF</div>
            <div style={{ fontSize: 12, color: "#5C6480", marginTop: 4 }}>07:30 / 12:00 / 18:00 / 22:00 (탭이 열려 있을 때)</div>

            {permission === "denied" && <div style={{ fontSize: 12, color: "#F87171", marginTop: 6 }}>브라우저 알림이 차단되어 있어요.</div>}
            {permission === "default" && <div style={{ fontSize: 12, color: "#FCD34D", marginTop: 6 }}>알림 권한을 먼저 허용해야 해요.</div>}
            {permission === "unsupported" && <div style={{ fontSize: 12, color: "#F87171", marginTop: 6 }}>이 브라우저는 알림을 지원하지 않아요.</div>}
          </div>

          {/* Toggle */}
          <div
            onClick={() => {
              if (permission !== "granted") return;
              const next = !notifEnabled;
              setNotifEnabled(next);
              store.set("dm_notif_enabled", next);
              setToast(next ? "알림 ON ✅" : "알림 OFF");

              scheduler.apply({
                enabled: next,
                userName: (user?.name || "사용자").trim() || "사용자",
                getTodayPlan,
              });
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
            title={permission !== "granted" ? "알림 권한이 필요해요" : ""}
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

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          {permission !== "granted" && permission !== "unsupported" ? (
            <button style={S.btn} onClick={askPermission}>
              🔔 알림 권한 허용하기
            </button>
          ) : (
            <button
              style={S.btnGhost}
              onClick={() => {
                sendNotification("DayMate Lite", "테스트 알림입니다!", "🧪");
                setToast("테스트 발송 🧪");
              }}
              disabled={permission !== "granted"}
            >
              🧪 테스트 알림 보내기
            </button>
          )}
        </div>
      </div>

      {/* ✅ 백업 섹션 (알림 카드 밖!) */}
      <div style={S.sectionTitle}>백업</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "#A8AFCA", lineHeight: 1.6, fontWeight: 700 }}>
          • 이 앱 데이터는 브라우저(localStorage)에 저장됩니다.
          <br />• JSON 파일로 백업해두면 다른 PC/휴대폰에서도 복구할 수 있어요.
        </div>

        <button style={{ ...S.btn, marginTop: 12 }} onClick={exportData}>
          📦 데이터 내보내기 (백업)
        </button>

        <label
          style={{
            ...S.btnGhost,
            marginTop: 10,
            display: "block",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          📥 데이터 가져오기 (복구)
          <input type="file" accept="application/json" onChange={importData} style={{ display: "none" }} />
        </label>
      </div>

      <div style={S.sectionTitle}>주의</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "#5C6480", lineHeight: 1.7, fontWeight: 800 }}>
          • “VS Code에서 저장(Ctrl+S)”은 <b>코드 파일 저장</b>입니다.
          <br />• 앱에서 입력한 내용은 <b>브라우저에 자동 저장</b>됩니다.
          <br />• 시크릿 모드/브라우저 데이터 삭제 시 기록이 사라질 수 있어요.
        </div>
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}

// -------------------- Main App --------------------
function emptyPlan(date) {
  return {
    date,
    big3: [
      { text: "", done: false },
      { text: "", done: false },
      { text: "", done: false },
    ],
    checks: { "12": false, "18": false, "22": false },
    journal: "",
    updatedAt: new Date().toISOString(),
  };
}

export default function App() {
  const [screen, setScreen] = useState(SC.HOME);
  const [detailDate, setDetailDate] = useState(null);

  const [user, setUser] = useState(() => store.get("dm_user", { name: "사용자" }));
  const [goals, setGoals] = useState(() => store.get("dm_goals", { year: [], month: [] }));
  const [notifEnabled, setNotifEnabled] = useState(() => store.get("dm_notif_enabled", false));

  const [plans, setPlans] = useState(() => {
    const all = {};
    Object.keys(localStorage)
      .filter((k) => k.startsWith("dm_plan_"))
      .forEach((k) => {
        const ds = k.replace("dm_plan_", "");
        all[ds] = store.get(k);
      });
    return all;
  });

  // getTodayPlan for scheduler
  const getTodayPlan = () => {
    const ds = todayStr();
    return plans[ds] || emptyPlan(ds);
  };

  // Ensure today's plan exists
  const today = todayStr();
  const plan = plans[today] || emptyPlan(today);

  const setPlan = (nextPlan) => {
    const ds = nextPlan.date;
    const p = { ...nextPlan, updatedAt: new Date().toISOString() };
    setPlans((prev) => {
      const updated = { ...prev, [ds]: p };
      store.set("dm_plan_" + ds, p);
      return updated;
    });
  };

  const setPlanForDate = (ds, p) => {
    const next = { ...p, date: ds, updatedAt: new Date().toISOString() };
    setPlans((prev) => {
      const updated = { ...prev, [ds]: next };
      store.set("dm_plan_" + ds, next);
      return updated;
    });
  };

  // Apply notifications on mount & when toggled/name changes
  const applyRef = useRef(0);
  useEffect(() => {
    // avoid too-frequent re-apply bursts
    applyRef.current += 1;
    const current = applyRef.current;

    const t = setTimeout(() => {
      if (current !== applyRef.current) return;
      scheduler.apply({
        enabled: notifEnabled,
        userName: (user?.name || "사용자").trim() || "사용자",
        getTodayPlan,
      });
    }, 150);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifEnabled, user?.name, plans]);

  // Cancel timers on unmount
  useEffect(() => {
    return () => scheduler.cancelAll();
  }, []);

  const openDate = (ds) => {
    setDetailDate(ds);
    setScreen("detail");
  };

  const body = (() => {
    if (screen === SC.HOME) return <Home user={user} plan={plan} setPlan={setPlan} goals={goals} setScreen={setScreen} />;
    if (screen === SC.HISTORY) return <History plans={plans} openDate={openDate} />;
    if (screen === SC.SETTINGS)
      return (
        <Settings
          user={user}
          setUser={(u) => {
            setUser(u);
            store.set("dm_user", u);
          }}
          goals={goals}
          setGoals={(g) => {
            setGoals(g);
            store.set("dm_goals", g);
          }}
          notifEnabled={notifEnabled}
          setNotifEnabled={(v) => {
            setNotifEnabled(v);
            store.set("dm_notif_enabled", v);
          }}
          getTodayPlan={getTodayPlan}
        />
      );
    if (screen === "detail" && detailDate) {
      const p = plans[detailDate] || emptyPlan(detailDate);
      return <DayDetail date={detailDate} plan={p} setPlanForDate={setPlanForDate} onBack={() => setScreen(SC.HISTORY)} />;
    }
    return <Home user={user} plan={plan} setPlan={setPlan} goals={goals} setScreen={setScreen} />;
  })();

  return (
    <div style={S.app}>
      <div style={S.phone}>
        {body}
        {/* bottom nav: hide on detail */}
        {screen !== "detail" && <BottomNav screen={screen} setScreen={setScreen} />}
      </div>
    </div>
  );
}