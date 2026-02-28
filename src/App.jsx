import { useEffect, useMemo, useState } from "react";

// ─────────────────────────────────────────────
// Utils / Storage
// ─────────────────────────────────────────────
const store = {
  get: (k, d = null) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

const pad2 = (n) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const formatDate = (s) => {
  const d = new Date(s + "T00:00:00");
  const w = "일월화수목금토"[d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${w}요일`;
};

// ─────────────────────────────────────────────
// Notification (tab-open only)
// ─────────────────────────────────────────────
const getPermission = () => {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
};
const requestPermission = async () => {
  if (!("Notification" in window)) return "unsupported";
  return await Notification.requestPermission();
};
const sendNotification = (title, body, icon = "✅") => {
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

class NotificationScheduler {
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
  schedule(id, timeStr, title, body, icon) {
    this.cancel(id);
    const fire = () => {
      sendNotification(title, body, icon);
      this.timers[id] = setTimeout(fire, 24 * 60 * 60 * 1000);
    };
    this.timers[id] = setTimeout(fire, this.msUntil(timeStr));
  }
  cancel(id) {
    if (this.timers[id]) {
      clearTimeout(this.timers[id]);
      delete this.timers[id];
    }
  }
  cancelAll() {
    Object.keys(this.timers).forEach((k) => this.cancel(k));
  }
  apply(enabled, name) {
    this.cancelAll();
    if (!enabled) return;
    if (getPermission() !== "granted") return;

    this.schedule(
      "m0730",
      "07:30",
      "DayMate 🌅",
      `${name}님, 오늘 가장 중요한 3가지는 뭐예요?`,
      "🌅"
    );
    this.schedule(
      "c1200",
      "12:00",
      "DayMate 🕛",
      `${name}님, 점심 체크! 3가지 진행 어때요?`,
      "🕛"
    );
    this.schedule(
      "c1800",
      "18:00",
      "DayMate 🕕",
      `${name}님, 저녁 체크! 남은 3가지를 확인해볼까요?`,
      "🕕"
    );
    this.schedule(
      "c2200",
      "22:00",
      "DayMate 🌙",
      `${name}님, 마감 체크! 3가지 했나요? 한 줄 일기 쓰고 마무리해요.`,
      "🌙"
    );
  }
}
const scheduler = new NotificationScheduler();

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
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
  top: {
    padding: "18px 20px 12px",
    borderBottom: "1px solid #2D344A",
    background: "#181C27",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  title: { fontSize: 20, fontWeight: 800 },
  sub: { fontSize: 12, color: "#A8AFCA", marginTop: 4 },
  content: { flex: 1, paddingBottom: 90 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#5C6480",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    padding: "16px 20px 8px",
  },
  card: {
    background: "#1E2336",
    border: "1px solid #2D344A",
    borderRadius: 14,
    padding: "14px 14px",
    margin: "0 20px 10px",
  },
  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 10,
    background: "#252B3E",
    border: "1.5px solid #2D344A",
    color: "#F0F2F8",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  btn: {
    width: "100%",
    padding: "14px 14px",
    borderRadius: 12,
    background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)",
    border: "none",
    color: "#fff",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
    margin: "10px 20px",
    boxShadow: "0 4px 20px rgba(108,142,255,.25)",
  },
  btnGhost: {
    width: "calc(100% - 40px)",
    padding: "12px 14px",
    borderRadius: 12,
    background: "transparent",
    border: "1.5px solid #363D54",
    color: "#A8AFCA",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    margin: "6px 20px",
  },
  row: { display: "flex", gap: 10, alignItems: "center" },
  nav: {
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
  navBtn: (on) => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    color: on ? "#6C8EFF" : "#5C6480",
    cursor: "pointer",
    padding: "4px 12px",
    border: "none",
    background: "transparent",
    fontFamily: "inherit",
  }),
  pill: (on) => ({
    padding: "7px 10px",
    borderRadius: 999,
    border: `1.5px solid ${on ? "#6C8EFF" : "#2D344A"}`,
    background: on ? "rgba(108,142,255,.1)" : "transparent",
    color: on ? "#6C8EFF" : "#A8AFCA",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  }),
  toast: {
    position: "fixed",
    bottom: 110,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1A2E20",
    border: "1px solid #2E7D52",
    color: "#4ADE80",
    padding: "10px 18px",
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 800,
    zIndex: 999,
    whiteSpace: "nowrap",
    boxShadow: "0 4px 16px rgba(0,0,0,.35)",
  },
};

function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div style={S.toast}>{msg}</div>;
}

// ─────────────────────────────────────────────
// Data helpers (Lite)
// ─────────────────────────────────────────────
const dayKey = (dateStr) => `dm_day_${dateStr}`;

const emptyDay = (dateStr) => ({
  date: dateStr,
  big3: [
    { text: "", done: false },
    { text: "", done: false },
    { text: "", done: false },
  ],
  checks: { "12": false, "18": false, "22": false },
  journal: { body: "", savedAt: "" },
});

const clampList = (arr, max) =>
  arr
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .slice(0, max);

const parseLines = (text) => clampList((text || "").split("\n"), 999);

// ─────────────────────────────────────────────
// Screens
// ─────────────────────────────────────────────
const SC = { HOME: "home", HISTORY: "history", SETTINGS: "settings", DAY: "day" };

function Home({ user, goals, day, setDay, onGoSettings, onGoHistory }) {
  const [toast, setToast] = useState("");
  const [showJournal, setShowJournal] = useState(false);

  const doneCount = day.big3.filter((x) => x.done).length;

  const setBigText = (idx, v) => {
    const next = { ...day, big3: day.big3.map((x, i) => (i === idx ? { ...x, text: v } : x)) };
    setDay(next);
  };

  const toggleDone = (idx) => {
    const next = { ...day, big3: day.big3.map((x, i) => (i === idx ? { ...x, done: !x.done } : x)) };
    setDay(next);
  };

  const markCheck = (hh) => {
    const next = { ...day, checks: { ...day.checks, [hh]: true } };
    setDay(next);
    setToast(`${hh}시 체크 완료 ✅`);
    if (hh === "22") setShowJournal(true);
  };

  const saveJournal = () => {
    const next = { ...day, journal: { ...day.journal, savedAt: new Date().toISOString() } };
    setDay(next);
    setToast("오늘 기록 저장 완료 ✅");
  };

  const canCopyYesterday = useMemo(() => {
    const d = new Date(day.date + "T00:00:00");
    d.setDate(d.getDate() - 1);
    const y = ymd(d);
    const yd = store.get(dayKey(y));
    return !!yd?.big3?.some((x) => (x.text || "").trim());
  }, [day.date]);

  const copyYesterday = () => {
    const d = new Date(day.date + "T00:00:00");
    d.setDate(d.getDate() - 1);
    const y = ymd(d);
    const yd = store.get(dayKey(y));
    if (!yd) return;
    const next = {
      ...day,
      big3: yd.big3.map((x) => ({ text: x.text || "", done: false })),
    };
    setDay(next);
    setToast("어제 Big3를 가져왔어요 ✅");
  };

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      <div style={S.top}>
        <div style={S.title}>DayMate Lite</div>
        <div style={S.sub}>
          {formatDate(day.date)} · {user.name}님
        </div>
      </div>

      <div style={S.sectionTitle}>목표</div>
      <div style={S.card}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>👑 올해 목표</div>
        {goals.year.length === 0 ? (
          <div style={{ color: "#5C6480", fontSize: 13 }}>아직 없어요. 설정에서 입력해요.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, color: "#A8AFCA", lineHeight: 1.7 }}>
            {goals.year.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        )}
        <div style={{ height: 10 }} />
        <div style={{ fontWeight: 900, marginBottom: 8 }}>📅 이달 목표</div>
        {goals.month.length === 0 ? (
          <div style={{ color: "#5C6480", fontSize: 13 }}>아직 없어요. 설정에서 입력해요.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, color: "#A8AFCA", lineHeight: 1.7 }}>
            {goals.month.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        )}
        <button style={{ ...S.btnGhost, margin: "12px 0 0" }} onClick={onGoSettings}>
          목표/설정 열기 →
        </button>
      </div>

      <div style={S.sectionTitle}>오늘의 Big 3</div>
      <div style={S.card}>
        {day.big3.map((x, i) => (
          <div key={i} style={{ ...S.row, marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={x.done}
              onChange={() => toggleDone(i)}
              style={{ width: 18, height: 18 }}
            />
            <input
              style={S.input}
              value={x.text}
              placeholder={`오늘 중요한 것 ${i + 1}`}
              onChange={(e) => setBigText(i, e.target.value)}
            />
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          {canCopyYesterday && (
            <div style={S.pill(false)} onClick={copyYesterday}>
              어제 Big3 가져오기
            </div>
          )}
          <div style={S.pill(false)} onClick={onGoHistory}>
            기록(달력) 보기
          </div>
          <div style={{ marginLeft: "auto", color: "#A8AFCA", fontSize: 12, fontWeight: 800 }}>
            완료 {doneCount}/3
          </div>
        </div>
      </div>

      <div style={S.sectionTitle}>체크(12 / 18 / 22)</div>
      <div style={S.card}>
        <div style={{ display: "flex", gap: 8 }}>
          {["12", "18", "22"].map((hh) => (
            <button
              key={hh}
              onClick={() => markCheck(hh)}
              style={{
                flex: 1,
                padding: "12px 10px",
                borderRadius: 12,
                border: `1.5px solid ${day.checks[hh] ? "rgba(74,222,128,.35)" : "#2D344A"}`,
                background: day.checks[hh] ? "rgba(74,222,128,.10)" : "#1E2336",
                color: day.checks[hh] ? "#4ADE80" : "#A8AFCA",
                fontWeight: 900,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {hh}시 {day.checks[hh] ? "✓" : "체크"}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "#5C6480", lineHeight: 1.6 }}>
          • 22시 체크 후 “한 줄 일기”를 작성하면 하루가 마무리됩니다.
        </div>
      </div>

      {(showJournal || day.checks["22"] || (day.journal?.body || "").trim()) && (
        <>
          <div style={S.sectionTitle}>한 줄 일기</div>
          <div style={S.card}>
            <textarea
              rows={4}
              style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
              placeholder="오늘을 한 줄(또는 2~3줄)로 정리해요"
              value={day.journal.body}
              onChange={(e) => setDay({ ...day, journal: { ...day.journal, body: e.target.value } })}
            />
            <button style={{ ...S.btn, margin: "10px 0 0" }} onClick={saveJournal}>
              오늘 기록 저장
            </button>
          </div>
        </>
      )}

      <div style={{ height: 20 }} />
    </div>
  );
}

function History({ allDates, onOpenDate }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth()); // 0-based
  const today = todayStr();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const hasRecord = (ds) => allDates.has(ds);

  const prev = () => (month === 0 ? (setMonth(11), setYear((y) => y - 1)) : setMonth((m) => m - 1));
  const next = () => (month === 11 ? (setMonth(0), setYear((y) => y + 1)) : setMonth((m) => m + 1));

  return (
    <div style={S.content}>
      <div style={S.top}>
        <div style={S.title}>기록(달력)</div>
        <div style={S.sub}>날짜를 눌러 상세를 확인해요</div>
      </div>

      <div style={{ padding: "14px 20px 6px", display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 16, fontWeight: 900 }}>
          {year}년 {month + 1}월
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.pill(false)} onClick={prev}>
            ‹
          </button>
          <button style={S.pill(false)} onClick={next}>
            ›
          </button>
        </div>
      </div>

      <div style={{ padding: "0 20px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 6 }}>
          {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, color: "#5C6480" }}>
              {d}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
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
              const isToday = ds === today;
              const recorded = hasRecord(ds);
              return (
                <div
                  key={day}
                  onClick={() => recorded && onOpenDate(ds)}
                  style={{
                    aspectRatio: 1,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: recorded ? "pointer" : "default",
                    border: isToday ? "1.5px solid #6C8EFF" : "1px solid #2D344A",
                    background: recorded ? "rgba(74,222,128,.10)" : "transparent",
                    color: recorded ? "#4ADE80" : isToday ? "#6C8EFF" : "#5C6480",
                    fontWeight: recorded || isToday ? 900 : 600,
                    position: "relative",
                  }}
                >
                  {day}
                  {recorded && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 6,
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: "#4ADE80",
                        opacity: 0.9,
                      }}
                    />
                  )}
                </div>
              );
            })}
        </div>
      </div>

      <div style={{ padding: "0 20px 10px", fontSize: 12, color: "#5C6480" }}>
        • 녹색 점이 있는 날짜는 기록이 있는 날입니다.
      </div>
    </div>
  );
}

function DayDetail({ date, data, onBack }) {
  if (!data) {
    return (
      <div style={S.content}>
        <div style={S.top}>
          <div style={S.title}>{formatDate(date)}</div>
          <div style={S.sub}>기록이 없습니다</div>
        </div>
        <button style={S.btn} onClick={onBack}>
          뒤로
        </button>
      </div>
    );
  }

  return (
    <div style={S.content}>
      <div style={S.top}>
        <div style={S.title}>{formatDate(date)}</div>
        <div style={S.sub}>Big3 / 체크 / 일기</div>
      </div>

      <div style={S.sectionTitle}>Big 3</div>
      <div style={S.card}>
        {data.big3.map((x, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 18 }}>{x.done ? "✅" : "⬜"}</div>
            <div style={{ color: x.text ? "#A8AFCA" : "#5C6480", fontWeight: 800 }}>
              {x.text || `(비어있음 ${i + 1})`}
            </div>
          </div>
        ))}
      </div>

      <div style={S.sectionTitle}>체크</div>
      <div style={S.card}>
        <div style={{ display: "flex", gap: 8 }}>
          {["12", "18", "22"].map((hh) => (
            <div
              key={hh}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "12px 10px",
                borderRadius: 12,
                border: "1px solid #2D344A",
                background: data.checks?.[hh] ? "rgba(74,222,128,.10)" : "transparent",
                color: data.checks?.[hh] ? "#4ADE80" : "#5C6480",
                fontWeight: 900,
              }}
            >
              {hh}시 {data.checks?.[hh] ? "✓" : "-"}
            </div>
          ))}
        </div>
      </div>

      <div style={S.sectionTitle}>일기</div>
      <div style={S.card}>
        <div style={{ color: (data.journal?.body || "").trim() ? "#A8AFCA" : "#5C6480", lineHeight: 1.7 }}>
          {(data.journal?.body || "").trim() ? data.journal.body : "일기 없음"}
        </div>
      </div>

      <button style={S.btnGhost} onClick={onBack}>
        ← 달력으로
      </button>
    </div>
  );
}

function Settings({ user, setUser, goals, setGoals, notifEnabled, setNotifEnabled }) {
  const [toast, setToast] = useState("");
  const [name, setName] = useState(user.name || "");
  const [yearText, setYearText] = useState((goals.year || []).join("\n"));
  const [monthText, setMonthText] = useState((goals.month || []).join("\n"));
  const [permission, setPermission] = useState(getPermission());

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
    } else if (r === "denied") {
      setToast("알림이 차단됨 🚫");
    }
  };

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      <div style={S.top}>
        <div style={S.title}>설정</div>
        <div style={S.sub}>이름 · 목표 · 알림</div>
      </div>

      <div style={S.sectionTitle}>프로필</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 800, marginBottom: 8 }}>이름</div>
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
        <button style={{ ...S.btn, margin: "12px 0 0" }} onClick={save}>
          저장
        </button>
      </div>

      <div style={S.sectionTitle}>알림</div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900 }}>알림 ON/OFF</div>
            <div style={{ fontSize: 12, color: "#5C6480", marginTop: 4 }}>
              07:30 / 12:00 / 18:00 / 22:00 (탭이 열려 있을 때 동작)
            </div>
          </div>
          <div
            onClick={() => {
              if (permission !== "granted") return;
              const next = !notifEnabled;
              setNotifEnabled(next);
              store.set("dm_notif_enabled", next);
              setToast(next ? "알림 ON ✅" : "알림 OFF");
            }}
            style={{
              width: 52,
              height: 28,
              borderRadius: 999,
              background: notifEnabled && permission === "granted" ? "#6C8EFF" : "#2D344A",
              cursor: permission === "granted" ? "pointer" : "not-allowed",
              position: "relative",
              opacity: permission === "granted" ? 1 : 0.5,
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
          <button style={{ ...S.btnGhost, marginTop: 12 }} onClick={askPermission}>
            알림 권한 허용하기
          </button>
        )}

        {permission === "denied" && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#F87171", lineHeight: 1.6 }}>
            브라우저 주소창 왼쪽 🔒 → 사이트 설정 → 알림 허용으로 바꾼 뒤 새로고침하세요.
          </div>
        )}

        {permission === "unsupported" && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#F87171", lineHeight: 1.6 }}>
            이 브라우저는 알림을 지원하지 않습니다. Chrome/Edge를 사용하세요.
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// App
// ─────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState(SC.HOME);
  const [detailDate, setDetailDate] = useState(null);

  const [user, setUser] = useState(() => store.get("dm_user", { name: "사용자" }));
  const [goals, setGoals] = useState(() => store.get("dm_goals", { year: [], month: [] }));
  const [notifEnabled, setNotifEnabled] = useState(() => store.get("dm_notif_enabled", false));

  const [day, setDayState] = useState(() => {
    const ds = todayStr();
    return store.get(dayKey(ds), emptyDay(ds));
  });

  // persist day
  const setDay = (next) => {
    setDayState(next);
    store.set(dayKey(next.date), next);
  };

  // refresh day if date changes (midnight)
  useEffect(() => {
    const id = setInterval(() => {
      const ds = todayStr();
      if (ds !== day.date) {
        const loaded = store.get(dayKey(ds), emptyDay(ds));
        setDayState(loaded);
      }
    }, 30 * 1000);
    return () => clearInterval(id);
  }, [day.date]);

  // apply notifications
  useEffect(() => {
    scheduler.apply(notifEnabled, user.name || "사용자");
    return () => scheduler.cancelAll();
  }, [notifEnabled, user.name]);

  // collect all record dates
  const allDates = useMemo(() => {
    const s = new Set();
    Object.keys(localStorage)
      .filter((k) => k.startsWith("dm_day_"))
      .forEach((k) => s.add(k.replace("dm_day_", "")));
    return s;
  }, [screen, day.date]);

  const openDate = (ds) => {
    setDetailDate(ds);
    setScreen(SC.DAY);
  };

  const render = () => {
    if (screen === SC.HOME)
      return (
        <Home
          user={user}
          goals={goals}
          day={day}
          setDay={setDay}
          onGoSettings={() => setScreen(SC.SETTINGS)}
          onGoHistory={() => setScreen(SC.HISTORY)}
        />
      );
    if (screen === SC.HISTORY) return <History allDates={allDates} onOpenDate={openDate} />;
    if (screen === SC.DAY) {
      const data = detailDate ? store.get(dayKey(detailDate)) : null;
      return <DayDetail date={detailDate} data={data} onBack={() => setScreen(SC.HISTORY)} />;
    }
    if (screen === SC.SETTINGS)
      return (
        <Settings
          user={user}
          setUser={(u) => {
            setUser(u);
            store.set("dm_user", u);
          }}
          goals={goals}
          setGoals={setGoals}
          notifEnabled={notifEnabled}
          setNotifEnabled={setNotifEnabled}
        />
      );
    return null;
  };

  return (
    <div style={S.app}>
      <div style={S.phone}>
        {render()}

        <div style={S.nav}>
          <button style={S.navBtn(screen === SC.HOME)} onClick={() => setScreen(SC.HOME)}>
            <span style={{ fontSize: 20 }}>🏠</span>
            <span>홈</span>
          </button>
          <button style={S.navBtn(screen === SC.HISTORY || screen === SC.DAY)} onClick={() => setScreen(SC.HISTORY)}>
            <span style={{ fontSize: 20 }}>📅</span>
            <span>기록</span>
          </button>
          <button style={S.navBtn(screen === SC.SETTINGS)} onClick={() => setScreen(SC.SETTINGS)}>
            <span style={{ fontSize: 20 }}>⚙️</span>
            <span>설정</span>
          </button>
        </div>
      </div>
    </div>
  );
}