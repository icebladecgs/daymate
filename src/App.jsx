import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────
const CATEGORIES = [
  { id:"work",    label:"업무",   icon:"💼", color:"#6C8EFF", bg:"rgba(108,142,255,.15)" },
  { id:"health",  label:"건강",   icon:"💪", color:"#4ADE80", bg:"rgba(74,222,128,.12)"  },
  { id:"family",  label:"가족",   icon:"👨‍👩‍👧", color:"#FB923C", bg:"rgba(251,146,60,.12)"  },
  { id:"content", label:"콘텐츠", icon:"📚", color:"#F87171", bg:"rgba(248,113,113,.12)" },
  { id:"invest",  label:"투자",   icon:"📈", color:"#FCD34D", bg:"rgba(252,211,77,.12)"  },
];

const DEFAULT_ROUTINES = [
  { id:"r1",  category:"work",    title:"핵심 업무 3가지 정리",   desc:"오늘 반드시 해야 할 업무 목록" },
  { id:"r2",  category:"work",    title:"이메일/메시지 정리",      desc:"미처리 메시지 처리하기" },
  { id:"r3",  category:"work",    title:"회의 준비",              desc:"오늘 회의 자료 확인" },
  { id:"r4",  category:"health",  title:"30분 운동",              desc:"유산소 또는 근력 운동" },
  { id:"r5",  category:"health",  title:"물 2L 마시기",           desc:"수분 섭취 목표" },
  { id:"r6",  category:"health",  title:"7시간 수면",             desc:"취침/기상 시간 준수" },
  { id:"r7",  category:"family",  title:"가족 연락 1회",          desc:"부모님 또는 배우자 안부" },
  { id:"r8",  category:"family",  title:"가족과 식사",            desc:"함께 식사 시간 갖기" },
  { id:"r9",  category:"content", title:"독서 20분",              desc:"취침 전 또는 점심 활용" },
  { id:"r10", category:"content", title:"뉴스/트렌드 읽기",       desc:"업계 뉴스 확인" },
  { id:"r11", category:"invest",  title:"포트폴리오 확인",        desc:"주식/코인 잔고 점검" },
  { id:"r12", category:"invest",  title:"경제 지표 확인",         desc:"시장 동향 파악" },
];

const MOODS = [
  { emoji:"🔥", label:"최고" }, { emoji:"😊", label:"좋음" },
  { emoji:"😐", label:"보통" }, { emoji:"😔", label:"힘듦" }, { emoji:"😴", label:"피곤" },
];

const SC = {
  HOME:"home", MORNING:"morning", EVENING:"evening",
  JOURNAL:"journal", HISTORY:"history", HISTORY_DETAIL:"history_detail",
  REPORT:"report", SETTINGS:"settings", NOTIFICATIONS:"notifications",
};

// ─── STORAGE ─────────────────────────────────────────────────
const store = {
  get: (k, d=null) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── DATE UTILS ──────────────────────────────────────────────
const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const formatDate = s => { const d=new Date(s+"T00:00:00"); return `${d.getMonth()+1}월 ${d.getDate()}일 ${"일월화수목금토"[d.getDay()]}요일`; };
const greetingMsg = name => { const h=new Date().getHours(); if(h<6)return`새벽이네요, ${name}님 🌙`; if(h<12)return`좋은 아침, ${name}님 ☀️`; if(h<18)return`좋은 오후, ${name}님 🌤`; return`수고했어요, ${name}님 🌙`; };

// ══════════════════════════════════════════════════════════════
// 🔔 NOTIFICATION ENGINE
// ══════════════════════════════════════════════════════════════

// 알림 권한 상태
const getPermission = () => {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
};

// 권한 요청
const requestPermission = async () => {
  if (!("Notification" in window)) return "unsupported";
  return await Notification.requestPermission();
};

// 즉시 알림 발송
const sendNotification = (title, body, icon = "🌅") => {
  if (Notification.permission !== "granted") return null;
  try {
    const n = new Notification(title, {
      body,
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>" + icon + "</text></svg>",
      badge: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📅</text></svg>",
      tag: "daymate-" + Date.now(),
      requireInteraction: false,
    });
    n.onclick = () => { window.focus(); n.close(); };
    return n;
  } catch { return null; }
};

// 알림 스케줄러 — setTimeout 기반 (탭이 열려 있는 동안 동작)
class NotificationScheduler {
  constructor() {
    this.timers = {};
    this.log = [];
  }

  // HH:mm 문자열 → 오늘 기준 ms 후 시간 계산
  msUntil(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1); // 이미 지났으면 내일
    return target.getTime() - now.getTime();
  }

  // 특정 알림 예약
  schedule(id, timeStr, title, body, icon, repeat = true) {
    this.cancel(id);
    const ms = this.msUntil(timeStr);
    const fire = () => {
      sendNotification(title, body, icon);
      this.log.unshift({ id, title, body, firedAt: new Date().toISOString() });
      if (this.log.length > 50) this.log = this.log.slice(0, 50);
      store.set("dm_notif_log", this.log);
      if (repeat) {
        // 24시간 후 재예약
        this.timers[id] = setTimeout(fire, 24 * 60 * 60 * 1000);
      }
    };
    this.timers[id] = setTimeout(fire, ms);
    return ms;
  }

  cancel(id) {
    if (this.timers[id]) { clearTimeout(this.timers[id]); delete this.timers[id]; }
  }

  cancelAll() {
    Object.keys(this.timers).forEach(id => this.cancel(id));
  }

  // 설정 기반으로 전체 재예약
  applySettings(settings, userName) {
    this.cancelAll();
    if (!settings.enabled || Notification.permission !== "granted") return;

    if (settings.morning.enabled) {
      this.schedule("morning", settings.morning.time,
        "DayMate 🌅 아침 알림",
        `${userName}님, 오늘의 루틴을 시작할 시간이에요!`,
        "🌅"
      );
    }
    if (settings.evening.enabled) {
      this.schedule("evening", settings.evening.time,
        "DayMate 🌙 저녁 체크",
        `${userName}님, 오늘 하루 루틴을 체크해보세요.`,
        "🌙"
      );
    }
    if (settings.journal.enabled) {
      this.schedule("journal", settings.journal.time,
        "DayMate 📖 일기 작성",
        `${userName}님, 오늘 하루를 기록으로 남겨보세요.`,
        "📖"
      );
    }
  }

  activeCount() { return Object.keys(this.timers).length; }
}

const scheduler = new NotificationScheduler();

// 기본 알림 설정
const DEFAULT_NOTIF_SETTINGS = {
  enabled: false,
  morning: { enabled: true,  time: "07:30" },
  evening: { enabled: true,  time: "21:00" },
  journal: { enabled: false, time: "22:00" },
};

// ─── STYLES ──────────────────────────────────────────────────
const S = {
  app:        { background:"#0F1117", color:"#F0F2F8", fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif", minHeight:"100vh", display:"flex", justifyContent:"center" },
  phone:      { width:"100%", maxWidth:430, minHeight:"100vh", background:"#181C27", display:"flex", flexDirection:"column" },
  content:    { flex:1, overflowY:"auto", paddingBottom:100 },
  statusBar:  { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 24px 8px", fontSize:12, color:"#A8AFCA", fontWeight:600, flexShrink:0 },
  bottomNav:  { position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"#181C27", borderTop:"1px solid #2D344A", padding:"10px 0 28px", display:"flex", justifyContent:"space-around", zIndex:100 },
  navItem:    a => ({ display:"flex", flexDirection:"column", alignItems:"center", gap:3, fontSize:11, color:a?"#6C8EFF":"#5C6480", cursor:"pointer", padding:"4px 12px", border:"none", background:"transparent" }),
  pageHeader: { padding:"20px 24px 0" },
  pageTitle:  { fontSize:24, fontWeight:700, lineHeight:1.2 },
  pageSub:    { fontSize:13, color:"#A8AFCA", marginTop:4 },
  sH:         { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 24px 10px" },
  sT:         { fontSize:11, fontWeight:600, color:"#5C6480", letterSpacing:"0.1em", textTransform:"uppercase" },
  card:       { background:"#1E2336", border:"1px solid #2D344A", borderRadius:14, padding:"16px 18px", margin:"0 24px 10px" },
  cta:        { display:"block", margin:"14px 24px", padding:"16px", background:"linear-gradient(135deg,#4B6FFF,#6C8EFF)", border:"none", borderRadius:14, color:"#fff", fontSize:16, fontWeight:700, textAlign:"center", cursor:"pointer", fontFamily:"inherit", width:"calc(100% - 48px)", boxShadow:"0 4px 20px rgba(108,142,255,.35)" },
  ctaGhost:   { display:"block", margin:"8px 24px", padding:"14px", background:"transparent", border:"1.5px solid #363D54", borderRadius:14, color:"#A8AFCA", fontSize:14, fontWeight:600, textAlign:"center", cursor:"pointer", fontFamily:"inherit", width:"calc(100% - 48px)" },
  input:      { width:"100%", padding:"13px 16px", borderRadius:10, background:"#1E2336", border:"1.5px solid #2D344A", color:"#F0F2F8", fontSize:14, fontFamily:"inherit", outline:"none", boxSizing:"border-box" },
  inputLabel: { fontSize:12, color:"#A8AFCA", fontWeight:500, marginBottom:6, display:"block" },
};

// ─── ATOMS ───────────────────────────────────────────────────
function StatusBar({ notifEnabled }) {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id=setInterval(()=>setT(new Date()),1000); return ()=>clearInterval(id); }, []);
  return (
    <div style={S.statusBar}>
      <span>{String(t.getHours()).padStart(2,"0")}:{String(t.getMinutes()).padStart(2,"0")}</span>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        {notifEnabled && Notification.permission==="granted" && (
          <span style={{ fontSize:11, color:"#4ADE80" }}>🔔 알림 ON</span>
        )}
      </div>
    </div>
  );
}

function BottomNav({ active, onNav }) {
  return (
    <div style={S.bottomNav}>
      {[{id:SC.HOME,icon:"🏠",label:"홈"},{id:SC.MORNING,icon:"☀️",label:"루틴"},{id:SC.HISTORY,icon:"📅",label:"기록"},{id:SC.REPORT,icon:"📊",label:"리포트"},{id:SC.SETTINGS,icon:"⚙️",label:"설정"}].map(it=>(
        <button key={it.id} style={S.navItem(active===it.id)} onClick={()=>onNav(it.id)}>
          <span style={{ fontSize:20 }}>{it.icon}</span><span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

function CatBadge({ catId }) {
  const c=CATEGORIES.find(x=>x.id===catId); if(!c) return null;
  return <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10, fontWeight:600, background:c.bg, color:c.color, flexShrink:0 }}>{c.icon} {c.label}</span>;
}

function ProgressBar({ value }) {
  return (
    <div style={{ background:"#1E2336", borderRadius:100, height:8, overflow:"hidden" }}>
      <div style={{ height:"100%", borderRadius:100, background:"linear-gradient(90deg,#4B6FFF,#4ADE80)", width:`${Math.min(100,Math.max(0,value))}%`, transition:"width .4s" }} />
    </div>
  );
}

function Toast({ msg, onDone }) {
  useEffect(()=>{ const t=setTimeout(onDone,2200); return()=>clearTimeout(t); }, []);
  return (
    <div style={{ position:"fixed", bottom:110, left:"50%", transform:"translateX(-50%)", background:"#1A2E20", border:"1px solid #2E7D52", color:"#4ADE80", padding:"10px 20px", borderRadius:20, fontSize:13, fontWeight:600, zIndex:999, whiteSpace:"nowrap", boxShadow:"0 4px 16px rgba(0,0,0,.4)" }}>
      {msg}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 🔔 NOTIFICATION SETTINGS SCREEN
// ═══════════════════════════════════════════════════════════
function NotificationScreen({ settings, onSave, userName, onBack }) {
  const [s, setS] = useState(settings);
  const [permission, setPermission] = useState(getPermission());
  const [toast, setToast] = useState("");
  const [testing, setTesting] = useState(null);
  const log = store.get("dm_notif_log", []);

  const update = patch => setS(p => ({ ...p, ...patch }));
  const updateMorning = patch => setS(p => ({ ...p, morning:{ ...p.morning, ...patch } }));
  const updateEvening = patch => setS(p => ({ ...p, evening:{ ...p.evening, ...patch } }));
  const updateJournal = patch => setS(p => ({ ...p, journal:{ ...p.journal, ...patch } }));

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    setPermission(result);
    if (result === "granted") {
      update({ enabled: true });
      setToast("🔔 알림 권한 허용됨!");
      sendNotification("DayMate 알림 테스트", "알림이 정상적으로 작동합니다! 🎉", "🌅");
    } else if (result === "denied") {
      setToast("⚠️ 알림이 차단되었습니다. 브라우저 설정에서 변경하세요.");
    }
  };

  const handleTest = (type) => {
    setTesting(type);
    const config = {
      morning: { title:"DayMate 🌅 아침 알림", body:`${userName}님, 오늘의 루틴을 시작할 시간이에요!`, icon:"🌅" },
      evening: { title:"DayMate 🌙 저녁 체크", body:`${userName}님, 오늘 하루 루틴을 체크해보세요.`, icon:"🌙" },
      journal: { title:"DayMate 📖 일기 작성", body:`${userName}님, 오늘 하루를 기록으로 남겨보세요.`, icon:"📖" },
    }[type];
    sendNotification(config.title, config.body, config.icon);
    setTimeout(() => setTesting(null), 1500);
  };

  const handleSave = () => {
    onSave(s);
    setToast("✅ 알림 설정 저장!");
  };

  // ms → "X시간 Y분 후" 변환
  const timeUntil = timeStr => {
    const ms = scheduler.msUntil(timeStr);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}시간 ${m}분 후`;
    return `${m}분 후`;
  };

  // 권한 상태별 배너
  const PermissionBanner = () => {
    if (permission === "unsupported") return (
      <div style={{ margin:"0 24px 12px", padding:"14px 16px", background:"rgba(248,113,113,.08)", border:"1px solid rgba(248,113,113,.2)", borderRadius:12 }}>
        <div style={{ fontSize:13, fontWeight:600, color:"#F87171", marginBottom:4 }}>⚠️ 알림 미지원 브라우저</div>
        <div style={{ fontSize:12, color:"#A8AFCA", lineHeight:1.5 }}>이 브라우저는 알림 기능을 지원하지 않아요. Chrome, Edge, Firefox를 사용해주세요.</div>
      </div>
    );
    if (permission === "denied") return (
      <div style={{ margin:"0 24px 12px", padding:"14px 16px", background:"rgba(248,113,113,.08)", border:"1px solid rgba(248,113,113,.2)", borderRadius:12 }}>
        <div style={{ fontSize:13, fontWeight:600, color:"#F87171", marginBottom:4 }}>🚫 알림이 차단되어 있어요</div>
        <div style={{ fontSize:12, color:"#A8AFCA", lineHeight:1.5 }}>
          브라우저 주소창 왼쪽 🔒 아이콘 → 알림 → 허용으로 변경 후 새로고침 해주세요.
        </div>
      </div>
    );
    if (permission === "default") return (
      <div style={{ margin:"0 24px 12px", padding:"16px", background:"rgba(108,142,255,.08)", border:"1px solid rgba(108,142,255,.25)", borderRadius:12 }}>
        <div style={{ fontSize:13, fontWeight:600, color:"#6C8EFF", marginBottom:6 }}>🔔 알림 권한이 필요해요</div>
        <div style={{ fontSize:12, color:"#A8AFCA", lineHeight:1.5, marginBottom:12 }}>
          아침 루틴 시작 · 저녁 체크 · 일기 작성 알림을 받으려면 권한을 허용해주세요.
        </div>
        <button onClick={handleRequestPermission} style={{ ...S.cta, margin:0, width:"100%", padding:"12px", fontSize:14 }}>
          🔔 알림 권한 허용하기
        </button>
      </div>
    );
    // granted
    return (
      <div style={{ margin:"0 24px 12px", padding:"12px 16px", background:"rgba(74,222,128,.08)", border:"1px solid rgba(74,222,128,.2)", borderRadius:12, display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:20 }}>✅</span>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:"#4ADE80" }}>알림 권한 허용됨</div>
          <div style={{ fontSize:12, color:"#A8AFCA" }}>활성 알림: {scheduler.activeCount()}개</div>
        </div>
      </div>
    );
  };

  // 알림 항목 row
  const NotifRow = ({ icon, title, sub, enabled, onToggle, time, onTimeChange, id, showTest }) => (
    <div style={{ ...S.card, padding:"16px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom: enabled ? 12 : 0 }}>
        <span style={{ fontSize:24, width:32 }}>{icon}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:600 }}>{title}</div>
          <div style={{ fontSize:12, color:"#5C6480", marginTop:2 }}>{sub}</div>
        </div>
        {/* Toggle */}
        <div onClick={() => permission==="granted" && onToggle(!enabled)} style={{
          width:48, height:26, borderRadius:100, cursor: permission==="granted"?"pointer":"not-allowed",
          background: enabled && permission==="granted" ? "#6C8EFF" : "#2D344A",
          position:"relative", transition:"background .2s", flexShrink:0,
          opacity: permission==="granted" ? 1 : 0.4,
        }}>
          <div style={{ position:"absolute", top:3, left: enabled&&permission==="granted"?24:3, width:20, height:20, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 4px rgba(0,0,0,.3)" }} />
        </div>
      </div>
      {enabled && permission === "granted" && (
        <div style={{ display:"flex", alignItems:"center", gap:10, paddingTop:12, borderTop:"1px solid #2D344A" }}>
          <span style={{ fontSize:12, color:"#A8AFCA", flexShrink:0 }}>알림 시간</span>
          <input type="time" value={time} onChange={e=>onTimeChange(e.target.value)} style={{ ...S.input, flex:1, padding:"8px 12px", fontSize:13 }} />
          <span style={{ fontSize:11, color:"#5C6480", flexShrink:0, minWidth:60 }}>{timeUntil(time)}</span>
          {showTest && (
            <button onClick={()=>handleTest(id)} style={{ padding:"8px 12px", borderRadius:8, border:"1.5px solid #363D54", background: testing===id?"rgba(108,142,255,.2)":"transparent", color:"#6C8EFF", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", flexShrink:0, whiteSpace:"nowrap" }}>
              {testing===id ? "발송중.." : "테스트"}
            </button>
          )}
        </div>
      )}
    </div>
  );

  // 알림 로그
  const fmtTime = iso => { const d=new Date(iso); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={()=>setToast("")} />}
      <StatusBar notifEnabled={s.enabled} />
      <div style={S.pageHeader}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#A8AFCA", cursor:"pointer", fontSize:22, padding:0, marginBottom:4 }}>←</button>
        <div style={S.pageTitle}>🔔 알림 설정</div>
        <div style={S.pageSub}>아침·저녁·일기 알림을 받아보세요</div>
      </div>
      <div style={{ height:16 }} />

      <PermissionBanner />

      {/* 전체 알림 ON/OFF */}
      <div style={S.sH}><span style={S.sT}>알림 항목</span></div>

      <NotifRow
        id="morning" icon="🌅" title="아침 루틴 알림" sub="루틴 시작을 알려드려요"
        enabled={s.morning.enabled} onToggle={v=>updateMorning({enabled:v})}
        time={s.morning.time} onTimeChange={v=>updateMorning({time:v})} showTest
      />
      <NotifRow
        id="evening" icon="🌙" title="저녁 체크 알림" sub="루틴 체크 시간을 알려드려요"
        enabled={s.evening.enabled} onToggle={v=>updateEvening({enabled:v})}
        time={s.evening.time} onTimeChange={v=>updateEvening({time:v})} showTest
      />
      <NotifRow
        id="journal" icon="📖" title="일기 작성 알림" sub="하루 마무리 일기를 써요"
        enabled={s.journal.enabled} onToggle={v=>updateJournal({enabled:v})}
        time={s.journal.time} onTimeChange={v=>updateJournal({time:v})} showTest
      />

      {/* 주의사항 */}
      <div style={{ margin:"0 24px 12px", padding:"14px 16px", background:"rgba(252,211,77,.05)", border:"1px solid rgba(252,211,77,.15)", borderRadius:12 }}>
        <div style={{ fontSize:12, color:"#FCD34D", fontWeight:600, marginBottom:6 }}>📌 알림 동작 안내</div>
        <div style={{ fontSize:12, color:"#A8AFCA", lineHeight:1.7 }}>
          • 브라우저 탭이 열려 있어야 알림이 작동합니다<br/>
          • 탭을 닫으면 알림이 중단됩니다 (PWA 설치 시 개선 가능)<br/>
          • 테스트 버튼으로 즉시 알림을 확인해보세요<br/>
          • 시간을 변경하면 반드시 저장을 눌러주세요
        </div>
      </div>

      <button style={S.cta} onClick={handleSave}>💾 설정 저장</button>

      {/* 알림 발송 로그 */}
      {log.length > 0 && (
        <>
          <div style={S.sH}><span style={S.sT}>최근 알림 기록</span></div>
          {log.slice(0,5).map((l,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", margin:"0 24px 6px", background:"#1E2336", border:"1px solid #2D344A", borderRadius:10 }}>
              <span style={{ fontSize:16 }}>{l.id==="morning"?"🌅":l.id==="evening"?"🌙":"📖"}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:500 }}>{l.title}</div>
                <div style={{ fontSize:11, color:"#5C6480" }}>{new Date(l.firedAt).toLocaleDateString("ko")} {fmtTime(l.firedAt)}</div>
              </div>
              <span style={{ fontSize:11, color:"#4ADE80" }}>발송됨</span>
            </div>
          ))}
        </>
      )}
      <div style={{ height:20 }} />
    </div>
  );
}

// ─── ONBOARDING ──────────────────────────────────────────────
function OnboardScreen({ onDone }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [morning, setMorning] = useState("07:30");
  const [evening, setEvening] = useState("21:00");
  const [selCats, setSelCats] = useState(["work","health"]);
  const [askedNotif, setAskedNotif] = useState(false);

  const toggleCat = id => setSelCats(p => p.includes(id)?p.filter(x=>x!==id):[...p,id]);

  const handleDone = async () => {
    if (!name.trim()) return;
    const settings = { ...DEFAULT_NOTIF_SETTINGS, morning:{ enabled:true, time:morning }, evening:{ enabled:true, time:evening } };
    store.set("dm_user", { name:name.trim(), morningTime:morning, eveningTime:evening, selCats, createdAt:new Date().toISOString() });
    store.set("dm_notif_settings", settings);
    // 알림 권한 요청
    if ("Notification" in window && Notification.permission === "default") {
      setAskedNotif(true);
      const perm = await requestPermission();
      if (perm === "granted") {
        settings.enabled = true;
        store.set("dm_notif_settings", settings);
        scheduler.applySettings(settings, name.trim());
        sendNotification("DayMate 시작! 🎉", `${name.trim()}님, 환영해요! 알림이 활성화됐습니다.`, "🌅");
      }
    }
    onDone();
  };

  return (
    <div style={S.content}>
      <StatusBar />
      {step === 1 ? (
        <>
          <div style={{ textAlign:"center", padding:"48px 32px 28px" }}>
            <div style={{ width:80,height:80,borderRadius:24,margin:"0 auto 20px",background:"linear-gradient(135deg,#4B6FFF,#6C8EFF)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,boxShadow:"0 8px 32px rgba(108,142,255,.4)" }}>🌅</div>
            <div style={{ fontSize:28, fontWeight:700, marginBottom:8 }}>DayMate</div>
            <div style={{ fontSize:14, color:"#A8AFCA", lineHeight:1.7 }}>매일 아침 루틴을 시작하고<br/>저녁엔 하루를 기록하세요.</div>
          </div>
          <div style={{ margin:"0 24px 10px", padding:18, borderRadius:14, border:"1.5px solid #6C8EFF", background:"rgba(108,142,255,.08)", cursor:"pointer" }} onClick={()=>setStep(2)}>
            <div style={{ fontSize:22, marginBottom:6 }}>📱</div>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>로컬 저장으로 시작</div>
            <div style={{ fontSize:12, color:"#A8AFCA", lineHeight:1.5 }}>가입 없이 바로 시작. 브라우저 알림 지원.</div>
          </div>
          <button style={S.cta} onClick={()=>setStep(2)}>시작하기 →</button>
        </>
      ) : (
        <>
          <div style={{ ...S.pageHeader, paddingTop:32 }}>
            <div style={S.pageTitle}>안녕하세요! 👋</div>
            <div style={S.pageSub}>이름과 알림 시간을 설정하세요</div>
          </div>
          <div style={{ height:20 }} />
          <div style={{ padding:"0 24px 12px" }}><label style={S.inputLabel}>이름</label><input style={S.input} placeholder="예: 지수" value={name} onChange={e=>setName(e.target.value)} /></div>
          <div style={{ padding:"0 24px 12px" }}><label style={S.inputLabel}>🌅 아침 루틴 알림 시간</label><input style={S.input} type="time" value={morning} onChange={e=>setMorning(e.target.value)} /></div>
          <div style={{ padding:"0 24px 16px" }}><label style={S.inputLabel}>🌙 저녁 체크 알림 시간</label><input style={S.input} type="time" value={evening} onChange={e=>setEvening(e.target.value)} /></div>
          <div style={S.sH}><span style={S.sT}>관심 카테고리</span></div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, padding:"0 24px 20px" }}>
            {CATEGORIES.map(c=>{ const on=selCats.includes(c.id); return (
              <div key={c.id} onClick={()=>toggleCat(c.id)} style={{ padding:"8px 16px", borderRadius:20, fontSize:13, fontWeight:600, cursor:"pointer", background:on?c.bg:"#1E2336", border:`1.5px solid ${on?c.color:"#2D344A"}`, color:on?c.color:"#5C6480" }}>{c.icon} {c.label}</div>
            );})}
          </div>
          <div style={{ margin:"0 24px 12px", padding:"12px 14px", background:"rgba(108,142,255,.06)", border:"1px solid rgba(108,142,255,.15)", borderRadius:12, fontSize:12, color:"#A8AFCA", lineHeight:1.6 }}>
            🔔 시작하면 브라우저 알림 권한을 요청합니다. 허용하면 아침·저녁 알림을 받을 수 있어요.
          </div>
          <button style={S.cta} onClick={handleDone}>DayMate 시작하기 🚀</button>
          <button style={S.ctaGhost} onClick={()=>setStep(1)}>← 뒤로</button>
          <div style={{ height:20 }} />
        </>
      )}
    </div>
  );
}

// ─── HOME ────────────────────────────────────────────────────
function HomeScreen({ user, todayPlan, onNav, streak, notifSettings }) {
  const h = new Date().getHours();
  const greeting = greetingMsg(user.name);
  const items = todayPlan?.items||[];
  const doneCount=items.filter(i=>i.status==="done").length, totalCount=items.length;
  const pct=totalCount>0?Math.round(doneCount/totalCount*100):0;
  const hasJournal=!!todayPlan?.journal?.body;
  const permission = getPermission();

  let statusColor="#FB923C", statusTitle="오늘 루틴을 아직 시작하지 않았어요", statusSub="아침 루틴 세팅이 필요합니다";
  if(todayPlan?.confirmed){
    if(pct>=100){statusColor="#4ADE80";statusTitle="오늘 루틴 완료! 🎉";statusSub=hasJournal?"일기도 작성 완료":"일기를 작성해보세요";}
    else if(h>=18){statusColor="#FCD34D";statusTitle="저녁 체크가 남아있어요";statusSub=`${totalCount}개 중 ${doneCount}개 완료`;}
    else{statusColor="#4ADE80";statusTitle="루틴 진행 중이에요 💪";statusSub=`${doneCount}/${totalCount}개 완료`;}
  }

  return (
    <div style={S.content}>
      <StatusBar notifEnabled={notifSettings?.enabled} />

      {/* 알림 유도 배너 (권한 미허용 시) */}
      {permission !== "granted" && permission !== "unsupported" && (
        <div onClick={()=>onNav(SC.NOTIFICATIONS)} style={{ margin:"8px 24px 0", padding:"12px 14px", background:"rgba(252,211,77,.06)", border:"1px solid rgba(252,211,77,.15)", borderRadius:12, cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:18 }}>🔔</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#FCD34D" }}>알림 설정하기</div>
            <div style={{ fontSize:12, color:"#A8AFCA" }}>아침/저녁 알림을 받아보세요 →</div>
          </div>
        </div>
      )}

      <div style={{ padding:"20px 24px 8px" }}>
        <div style={{ fontSize:13, color:"#5C6480" }}>{formatDate(todayStr())}</div>
        <div style={{ fontSize:26, fontWeight:700, marginTop:4 }}>{greeting}</div>
      </div>

      <div style={{ ...S.card, display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:10,height:10,borderRadius:"50%",background:statusColor,boxShadow:`0 0 8px ${statusColor}`,flexShrink:0 }} />
        <div><div style={{ fontSize:14, fontWeight:600 }}>{statusTitle}</div><div style={{ fontSize:12, color:"#A8AFCA", marginTop:2 }}>{statusSub}</div></div>
      </div>

      {todayPlan?.confirmed && (
        <div style={{ padding:"0 24px 8px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#5C6480", marginBottom:6 }}>
            <span>오늘 진행률</span><span style={{ color:"#4ADE80", fontWeight:700 }}>{pct}% ({doneCount}/{totalCount})</span>
          </div>
          <ProgressBar value={pct} />
        </div>
      )}

      {streak>1 && (
        <div style={{ ...S.card, background:"rgba(252,211,77,.06)", border:"1px solid rgba(252,211,77,.2)", display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ fontSize:28, fontWeight:700, color:"#FCD34D" }}>🔥{streak}</div>
          <div><div style={{ fontSize:14, fontWeight:600 }}>연속 {streak}일째!</div><div style={{ fontSize:12, color:"#A8AFCA" }}>오늘도 파이팅!</div></div>
        </div>
      )}

      <div style={{ display:"flex", gap:10, padding:"0 24px 8px" }}>
        {[{val:pct>0?pct+"%":"-",label:"오늘 완료율",color:"#4ADE80"},{val:totalCount||"-",label:"오늘 루틴",color:"#6C8EFF"},{val:hasJournal?"✓":"-",label:"일기",color:"#FCD34D"}].map((s,i)=>(
          <div key={i} style={{ flex:1, background:"#1E2336", border:"1px solid #2D344A", borderRadius:12, padding:"12px 10px" }}>
            <div style={{ fontSize:20, fontWeight:700, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:11, color:"#5C6480", marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {!todayPlan?.confirmed ? (
        <button style={S.cta} onClick={()=>onNav(SC.MORNING)}>🌅 오늘 루틴 시작하기</button>
      ) : pct<100 ? (
        <><button style={S.cta} onClick={()=>onNav(SC.EVENING)}>🌙 저녁 체크하기</button>{!hasJournal&&<button style={S.ctaGhost} onClick={()=>onNav(SC.JOURNAL)}>📖 일기 쓰기</button>}</>
      ) : (
        !hasJournal&&<button style={S.cta} onClick={()=>onNav(SC.JOURNAL)}>📖 오늘 일기 쓰기</button>
      )}
    </div>
  );
}

// ─── MORNING ─────────────────────────────────────────────────
function MorningScreen({ todayPlan, onSave, onBack }) {
  const [selIds,setSelIds]=useState(()=>todayPlan?.items?.map(i=>i.templateId).filter(Boolean)||["r1","r4","r9"]);
  const [activeCat,setActiveCat]=useState("all");
  const [customTitle,setCustomTitle]=useState("");
  const [customItems,setCustomItems]=useState([]);
  const [toast,setToast]=useState("");

  const toggle=id=>setSelIds(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const addCustom=()=>{
    if(!customTitle.trim())return;
    const item={id:"c"+Date.now(),title:customTitle.trim(),category:activeCat==="all"?"work":activeCat,isCustom:true};
    setCustomItems(p=>[...p,item]);setSelIds(p=>[...p,item.id]);setCustomTitle("");
  };
  const allTemplates=[...DEFAULT_ROUTINES,...customItems];
  const filtered=activeCat==="all"?allTemplates:allTemplates.filter(r=>r.category===activeCat);

  const handleConfirm=()=>{
    if(selIds.length===0)return;
    const items=allTemplates.filter(r=>selIds.includes(r.id)).map((r,i)=>({
      id:"item_"+r.id+"_"+Date.now()+i,templateId:r.id,category:r.category,title:r.title,status:"pending",memo:"",checkedAt:null,
    }));
    onSave({date:todayStr(),confirmed:true,confirmedAt:new Date().toISOString(),items,journal:null});
    setToast("✅ 루틴 확정!");
    setTimeout(onBack,1200);
  };

  return (
    <div style={S.content}>
      {toast&&<Toast msg={toast} onDone={()=>setToast("")}/>}
      <StatusBar/>
      <div style={S.pageHeader}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#A8AFCA",cursor:"pointer",fontSize:22,padding:0,marginBottom:4}}>←</button>
        <div style={S.pageTitle}>오늘의 루틴 🌅</div>
        <div style={S.pageSub}>{formatDate(todayStr())}</div>
      </div>
      <div style={{display:"flex",gap:8,padding:"12px 24px",overflowX:"auto",scrollbarWidth:"none"}}>
        {[{id:"all",label:"전체",icon:"✨"},...CATEGORIES].map(c=>(
          <div key={c.id} onClick={()=>setActiveCat(c.id)} style={{padding:"7px 14px",borderRadius:20,fontSize:12,fontWeight:600,border:`1.5px solid ${activeCat===c.id?"#6C8EFF":"#2D344A"}`,background:activeCat===c.id?"#6C8EFF":"#1E2336",color:activeCat===c.id?"#fff":"#A8AFCA",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{c.icon} {c.label}</div>
        ))}
      </div>
      <div style={S.sH}><span style={S.sT}>선택됨 {selIds.length}개</span><span style={{fontSize:12,color:"#6C8EFF",cursor:"pointer"}} onClick={()=>setSelIds(filtered.map(r=>r.id))}>전체 선택</span></div>
      {filtered.map(r=>{const checked=selIds.includes(r.id);return(
        <div key={r.id} onClick={()=>toggle(r.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",margin:"0 24px 8px",background:checked?"rgba(108,142,255,.06)":"#1E2336",border:`1.5px solid ${checked?"#6C8EFF":"#2D344A"}`,borderRadius:12,cursor:"pointer"}}>
          <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,border:`2px solid ${checked?"#6C8EFF":"#363D54"}`,background:checked?"#6C8EFF":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
            {checked&&<span style={{color:"#fff",fontSize:12}}>✓</span>}
          </div>
          <div style={{flex:1}}><div style={{fontSize:14,fontWeight:500}}>{r.title}</div>{r.desc&&<div style={{fontSize:11,color:"#5C6480",marginTop:2}}>{r.desc}</div>}</div>
          <CatBadge catId={r.category}/>
        </div>
      );})}
      <div style={{padding:"0 24px 8px",display:"flex",gap:8}}>
        <input style={{...S.input,flex:1}} placeholder="직접 추가..." value={customTitle} onChange={e=>setCustomTitle(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCustom()}/>
        <button onClick={addCustom} style={{width:44,height:44,borderRadius:10,background:"#1E2336",border:"1.5px solid #363D54",color:"#6C8EFF",fontSize:22,cursor:"pointer",flexShrink:0}}>+</button>
      </div>
      {todayPlan?.confirmed?(
        <div style={{margin:"16px 24px",padding:"14px",background:"rgba(74,222,128,.08)",border:"1px solid rgba(74,222,128,.2)",borderRadius:12,fontSize:13,color:"#4ADE80",textAlign:"center"}}>✅ 오늘 루틴이 이미 확정됐어요</div>
      ):(
        <button style={S.cta} onClick={handleConfirm}>✅ 오늘 루틴 확정 ({selIds.length}개)</button>
      )}
      <div style={{height:20}}/>
    </div>
  );
}

// ─── EVENING ─────────────────────────────────────────────────
function EveningScreen({ todayPlan, onSave, onNext, onBack }) {
  const [items,setItems]=useState(todayPlan?.items||[]);
  const [memoOpen,setMemoOpen]=useState({});
  const [toast,setToast]=useState("");
  const statusCfg={done:{label:"완료",color:"#4ADE80",bg:"rgba(74,222,128,.12)"},partial:{label:"부분",color:"#FCD34D",bg:"rgba(252,211,77,.12)"},skip:{label:"건너뜀",color:"#F87171",bg:"rgba(248,113,113,.12)"},pending:{label:"미입력",color:"#5C6480",bg:"transparent"}};
  const checkedCount=items.filter(i=>i.status!=="pending").length;
  const pct=items.length>0?Math.round(checkedCount/items.length*100):0;
  const update=(id,patch)=>setItems(prev=>prev.map(it=>it.id===id?{...it,...patch}:it));
  const handleSave=()=>{onSave({...todayPlan,items});setToast("💾 저장 완료!");setTimeout(onNext,1400);};

  return (
    <div style={S.content}>
      {toast&&<Toast msg={toast} onDone={()=>setToast("")}/>}
      <StatusBar/>
      <div style={S.pageHeader}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#A8AFCA",cursor:"pointer",fontSize:22,padding:0,marginBottom:4}}>←</button>
        <div style={S.pageTitle}>오늘 하루 어땠나요? 🌙</div>
        <div style={S.pageSub}>{formatDate(todayStr())} · {items.length}개 루틴</div>
      </div>
      <div style={{padding:"8px 24px 12px"}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#5C6480",marginBottom:6}}>
          <span>완료율</span><span style={{color:"#4ADE80",fontWeight:700}}>{pct}% ({checkedCount}/{items.length})</span>
        </div>
        <ProgressBar value={pct}/>
      </div>
      {items.map(item=>(
        <div key={item.id} style={{...S.card,padding:"14px 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <CatBadge catId={item.category}/>
            <div style={{flex:1,fontSize:14,fontWeight:500,minWidth:80}}>{item.title}</div>
            <div style={{display:"flex",gap:4,flexShrink:0}}>
              {["done","partial","skip"].map(s=>{const cfg=statusCfg[s];const on=item.status===s;return(
                <button key={s} onClick={()=>{update(item.id,{status:on?"pending":s,checkedAt:new Date().toISOString()});if(s==="partial")setMemoOpen(p=>({...p,[item.id]:true}));}} style={{padding:"5px 8px",borderRadius:8,fontSize:11,fontWeight:600,border:`1.5px solid ${on?cfg.color:"#363D54"}`,background:on?cfg.bg:"transparent",color:on?cfg.color:"#5C6480",cursor:"pointer",fontFamily:"inherit"}}>{cfg.label}</button>
              );})}
            </div>
          </div>
          {(memoOpen[item.id]||item.memo)&&(
            <textarea value={item.memo} onChange={e=>update(item.id,{memo:e.target.value})} placeholder="메모..." rows={2} style={{...S.input,marginTop:10,resize:"none",fontSize:13,color:"#A8AFCA",padding:"9px 12px",background:"#252B3E"}}/>
          )}
          {!memoOpen[item.id]&&!item.memo&&(
            <button onClick={()=>setMemoOpen(p=>({...p,[item.id]:true}))} style={{background:"none",border:"none",color:"#5C6480",fontSize:12,cursor:"pointer",marginTop:6,padding:0}}>+ 메모 추가</button>
          )}
        </div>
      ))}
      <button style={S.cta} onClick={handleSave}>저장하고 일기 쓰기 →</button>
      <button style={S.ctaGhost} onClick={()=>{onSave({...todayPlan,items});onBack();}}>일기 없이 저장</button>
      <div style={{height:20}}/>
    </div>
  );
}

// ─── JOURNAL ─────────────────────────────────────────────────
function JournalScreen({ todayPlan, onSave, onBack }) {
  const existing=todayPlan?.journal||{};
  const [body,setBody]=useState(existing.body||"");
  const [mood,setMood]=useState(existing.mood||"");
  const [toast,setToast]=useState("");
  const doneCount=todayPlan?.items?.filter(i=>i.status==="done").length||0;
  const total=todayPlan?.items?.length||0;
  const pct=total>0?Math.round(doneCount/total*100):0;
  const handleSave=()=>{onSave({...todayPlan,journal:{body,mood,savedAt:new Date().toISOString()}});setToast("💾 오늘 기록 완료!");setTimeout(onBack,1400);};

  return (
    <div style={S.content}>
      {toast&&<Toast msg={toast} onDone={()=>setToast("")}/>}
      <StatusBar/>
      <div style={S.pageHeader}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#A8AFCA",cursor:"pointer",fontSize:22,padding:0,marginBottom:4}}>←</button>
        <div style={S.pageTitle}>오늘의 기록 📖</div>
        <div style={S.pageSub}>{formatDate(todayStr())}</div>
      </div>
      <div style={{padding:"16px 24px 8px",fontSize:13,color:"#5C6480"}}>오늘 기분은?</div>
      <div style={{display:"flex",gap:8,padding:"0 24px 16px"}}>
        {MOODS.map(m=>(
          <div key={m.emoji} onClick={()=>setMood(mood===m.emoji?"":m.emoji)} style={{flex:1,padding:"10px 4px",borderRadius:12,textAlign:"center",border:`1.5px solid ${mood===m.emoji?"#6C8EFF":"#2D344A"}`,background:mood===m.emoji?"rgba(108,142,255,.1)":"#1E2336",cursor:"pointer"}}>
            <div style={{fontSize:22}}>{m.emoji}</div>
            <div style={{fontSize:10,color:"#5C6480",marginTop:3}}>{m.label}</div>
          </div>
        ))}
      </div>
      <div style={{margin:"0 24px",background:"#1E2336",border:"1.5px solid #2D344A",borderRadius:14,padding:16}}>
        <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="오늘 하루를 자유롭게 기록해보세요..." rows={7} style={{width:"100%",background:"transparent",border:"none",outline:"none",color:"#F0F2F8",fontSize:14,fontFamily:"inherit",resize:"none",lineHeight:1.7,boxSizing:"border-box"}}/>
        <div style={{textAlign:"right",fontSize:11,color:"#5C6480",marginTop:8}}>{body.length} / 1000자</div>
      </div>
      {todayPlan&&(
        <div style={{margin:"12px 24px 0",padding:14,background:"rgba(108,142,255,.06)",border:"1px solid rgba(108,142,255,.15)",borderRadius:12}}>
          <div style={{fontSize:11,color:"#6C8EFF",fontWeight:600,marginBottom:8}}>📊 오늘 루틴 요약</div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
            <span style={{color:"#A8AFCA"}}>완료율</span>
            <span style={{color:"#4ADE80",fontWeight:700}}>{pct}% ({doneCount}/{total})</span>
          </div>
        </div>
      )}
      <button style={S.cta} onClick={handleSave}>💾 오늘 기록 저장</button>
      <div style={{height:20}}/>
    </div>
  );
}

// ─── HISTORY ─────────────────────────────────────────────────
function HistoryScreen({ plans, onDetail }) {
  const [year,setYear]=useState(new Date().getFullYear());
  const [month,setMonth]=useState(new Date().getMonth());
  const firstDay=new Date(year,month,1).getDay(), daysInMonth=new Date(year,month+1,0).getDate(), today=todayStr();
  const getRate=ds=>{const p=plans[ds];if(!p?.confirmed)return null;const d=p.items.filter(i=>i.status==="done").length;return p.items.length>0?Math.round(d/p.items.length*100):0;};
  const rateStyle=r=>{if(r===null)return{};if(r>=80)return{background:"rgba(74,222,128,.2)",color:"#4ADE80"};if(r>=50)return{background:"rgba(252,211,77,.15)",color:"#FCD34D"};return{background:"rgba(248,113,113,.1)",color:"#F87171"};};
  const prev=()=>month===0?(setMonth(11),setYear(y=>y-1)):setMonth(m=>m-1);
  const next=()=>month===11?(setMonth(0),setYear(y=>y+1)):setMonth(m=>m+1);
  const recentDates=Object.keys(plans).sort((a,b)=>b.localeCompare(a)).slice(0,8);

  return (
    <div style={S.content}>
      <StatusBar/>
      <div style={S.pageHeader}><div style={S.pageTitle}>기록 📅</div></div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 24px 8px"}}>
        <div style={{fontSize:16,fontWeight:700}}>{year}년 {month+1}월</div>
        <div style={{display:"flex",gap:8}}>
          {[{l:"‹",f:prev},{l:"›",f:next}].map(b=>(
            <button key={b.l} onClick={b.f} style={{width:28,height:28,borderRadius:"50%",background:"#1E2336",border:"1px solid #2D344A",color:"#A8AFCA",cursor:"pointer",fontSize:14}}>{b.l}</button>
          ))}
        </div>
      </div>
      <div style={{padding:"0 24px 12px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
          {["일","월","화","수","목","금","토"].map(d=><div key={d} style={{textAlign:"center",fontSize:11,color:"#5C6480",padding:"4px 0"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {Array(firstDay).fill(null).map((_,i)=><div key={"e"+i}/>)}
          {Array(daysInMonth).fill(null).map((_,i)=>{
            const day=i+1,ds=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const rate=getRate(ds),rs=rateStyle(rate),isToday=ds===today;
            return(<div key={day} onClick={()=>rate!==null&&onDetail(ds)} style={{aspectRatio:1,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,cursor:rate!==null?"pointer":"default",background:isToday?"#6C8EFF":rs.background||"transparent",color:isToday?"#fff":rs.color||"#5C6480",fontWeight:isToday?700:400}}>{day}</div>);
          })}
        </div>
        <div style={{display:"flex",gap:12,marginTop:10}}>
          {[{bg:"rgba(74,222,128,.2)",l:"80%+"},{bg:"rgba(252,211,77,.15)",l:"50~79%"},{bg:"rgba(248,113,113,.1)",l:"~49%"}].map(l=>(
            <div key={l.l} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#5C6480"}}>
              <div style={{width:10,height:10,borderRadius:3,background:l.bg}}/>{l.l}
            </div>
          ))}
        </div>
      </div>
      <div style={S.sH}><span style={S.sT}>최근 기록</span></div>
      {recentDates.length===0&&<div style={{padding:"20px 24px",color:"#5C6480",fontSize:14,textAlign:"center"}}>아직 기록이 없어요 🌱</div>}
      {recentDates.map(date=>{
        const plan=plans[date],done=plan.items.filter(i=>i.status==="done").length,total=plan.items.length;
        const rate=total>0?Math.round(done/total*100):0;
        const catCounts=CATEGORIES.map(c=>({...c,n:plan.items.filter(i=>i.category===c.id&&i.status==="done").length})).filter(x=>x.n>0);
        return(
          <div key={date} onClick={()=>onDetail(date)} style={{...S.card,cursor:"pointer"}}>
            <div style={{fontSize:11,color:"#5C6480",marginBottom:6}}>{formatDate(date)}{plan.journal?.mood?" · "+plan.journal.mood:""}</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:13,color:"#A8AFCA"}}>{catCounts.map(c=>`${c.icon} ${c.n}`).join(" · ")||"루틴 기록"}</div>
              <div style={{fontSize:14,fontWeight:700,color:rate>=80?"#4ADE80":rate>=50?"#FCD34D":"#F87171"}}>{rate}%</div>
            </div>
          </div>
        );
      })}
      <div style={{height:20}}/>
    </div>
  );
}

function HistoryDetailScreen({ date, plan, onBack }) {
  if(!plan)return<div style={{padding:32,color:"#5C6480"}}>기록 없음</div>;
  const done=plan.items.filter(i=>i.status==="done").length,pct=plan.items.length>0?Math.round(done/plan.items.length*100):0;
  const statusCfg={done:{l:"완료",c:"#4ADE80"},partial:{l:"부분",c:"#FCD34D"},skip:{l:"건너뜀",c:"#F87171"},pending:{l:"미입력",c:"#5C6480"}};
  return(
    <div style={S.content}>
      <StatusBar/>
      <div style={S.pageHeader}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#A8AFCA",cursor:"pointer",fontSize:22,padding:0,marginBottom:4}}>←</button>
        <div style={S.pageTitle}>{formatDate(date)}</div>
        <div style={S.pageSub}>완료율 {pct}%{plan.journal?.mood?" · "+plan.journal.mood:""}</div>
      </div>
      <div style={{padding:"8px 24px 12px"}}><ProgressBar value={pct}/></div>
      {plan.items.map(item=>{const cfg=statusCfg[item.status]||statusCfg.pending;return(
        <div key={item.id} style={{...S.card,display:"flex",alignItems:"center",gap:10}}>
          <CatBadge catId={item.category}/><div style={{flex:1,fontSize:14}}>{item.title}</div>
          <span style={{fontSize:12,fontWeight:600,color:cfg.c}}>{cfg.l}</span>
        </div>
      );})}
      {plan.journal?.body&&(
        <div style={{...S.card,background:"rgba(108,142,255,.05)",border:"1px solid rgba(108,142,255,.15)"}}>
          <div style={{fontSize:11,color:"#6C8EFF",fontWeight:600,marginBottom:8}}>📖 일기</div>
          <div style={{fontSize:14,color:"#A8AFCA",lineHeight:1.7}}>{plan.journal.body}</div>
        </div>
      )}
      <div style={{height:20}}/>
    </div>
  );
}

// ─── REPORT ──────────────────────────────────────────────────
function ReportScreen({ plans }) {
  const last7=Array(7).fill(null).map((_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return d.toISOString().split("T")[0];}).reverse();
  const weekPlans=last7.map(d=>plans[d]).filter(Boolean);
  const allItems=weekPlans.flatMap(p=>p.items);
  const totalDone=allItems.filter(i=>i.status==="done").length,totalAll=allItems.length;
  const weekRate=totalAll>0?Math.round(totalDone/totalAll*100):0;
  const activeDays=weekPlans.filter(p=>p.confirmed).length;
  const catRates=CATEGORIES.map(c=>{const ci=allItems.filter(i=>i.category===c.id),cd=ci.filter(i=>i.status==="done").length;return{...c,rate:ci.length>0?Math.round(cd/ci.length*100):0,total:ci.length};});
  const titleCounts={};allItems.filter(i=>i.status==="done").forEach(i=>{titleCounts[i.title]=(titleCounts[i.title]||0)+1;});
  const top3=Object.entries(titleCounts).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const aiText=()=>{if(totalAll===0)return"아직 이번 주 기록이 없어요. 오늘부터 시작해볼까요? 🌱";if(weekRate>=80)return`이번 주 ${weekRate}% 달성! 훌륭해요. ${top3[0]?`"${top3[0][0]}" 루틴을 꾸준히 지켰네요. 🏆`:""}`;if(weekRate>=50)return`이번 주 ${weekRate}% 달성. 꾸준히 유지 중이에요! ${catRates.sort((a,b)=>a.rate-b.rate)[0]?.label} 카테고리를 조금 더 신경 써보세요. 💪`;return`이번 주는 ${weekRate}%였어요. 작은 루틴 1~2개부터 다시 시작해봐요. 🌱`;};
  const r=54,circ=2*Math.PI*r,offset=circ-(weekRate/100)*circ;

  return(
    <div style={S.content}>
      <StatusBar/>
      <div style={S.pageHeader}><div style={S.pageTitle}>이번 주 리포트 📊</div><div style={S.pageSub}>{formatDate(last7[0])} ~ {formatDate(last7[6])}</div></div>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"20px 24px 8px"}}>
        <div style={{position:"relative",width:140,height:140}}>
          <svg width="140" height="140" viewBox="0 0 140 140" style={{transform:"rotate(-90deg)"}}>
            <circle cx="70" cy="70" r={r} fill="none" stroke="#1E2336" strokeWidth="16"/>
            <circle cx="70" cy="70" r={r} fill="none" stroke="url(#rg3)" strokeWidth="16" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"/>
            <defs><linearGradient id="rg3" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#4B6FFF"/><stop offset="100%" stopColor="#4ADE80"/></linearGradient></defs>
          </svg>
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center"}}>
            <div style={{fontSize:28,fontWeight:700}}>{weekRate}%</div><div style={{fontSize:11,color:"#5C6480"}}>완료율</div>
          </div>
        </div>
        <div style={{display:"flex",gap:24,marginTop:12}}>
          {[{v:totalDone,l:"완료",c:"#4ADE80"},{v:totalAll,l:"전체",c:"#A8AFCA"},{v:`${activeDays}/7`,l:"실천일",c:"#FCD34D"}].map(s=>(
            <div key={s.l} style={{textAlign:"center"}}><div style={{fontSize:18,fontWeight:700,color:s.c}}>{s.v}</div><div style={{fontSize:11,color:"#5C6480"}}>{s.l}</div></div>
          ))}
        </div>
      </div>
      <div style={S.sH}><span style={S.sT}>카테고리별 완료율</span></div>
      <div style={{padding:"0 24px 8px"}}>
        {catRates.map(c=>(
          <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{fontSize:12,color:c.color,width:58,flexShrink:0}}>{c.icon} {c.label}</div>
            <div style={{flex:1,background:"#1E2336",borderRadius:100,height:8,overflow:"hidden"}}><div style={{height:"100%",borderRadius:100,background:c.color,width:`${c.rate}%`,transition:"width .4s"}}/></div>
            <div style={{fontSize:12,color:"#A8AFCA",width:32,textAlign:"right"}}>{c.total>0?c.rate+"%":"—"}</div>
          </div>
        ))}
      </div>
      {top3.length>0&&<><div style={S.sH}><span style={S.sT}>Top 루틴</span></div>{top3.map(([title,count],i)=>(
        <div key={title} style={{...S.card,display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:18,width:28,textAlign:"center"}}>{"🥇🥈🥉"[i]}</div>
          <div style={{flex:1}}><div style={{fontSize:14,fontWeight:500}}>{title}</div><div style={{background:"#252B3E",borderRadius:100,height:5,marginTop:6,overflow:"hidden"}}><div style={{height:"100%",borderRadius:100,background:"#6C8EFF",width:`${Math.round(count/7*100)}%`}}/></div></div>
          <div style={{fontSize:12,color:"#5C6480"}}>{count}/7일</div>
        </div>
      ))}</>}
      <div style={{margin:"8px 24px 20px",padding:16,background:"rgba(108,142,255,.06)",border:"1px solid rgba(108,142,255,.2)",borderRadius:14}}>
        <div style={{fontSize:11,color:"#6C8EFF",fontWeight:600,marginBottom:8}}>✨ AI 한줄 회고</div>
        <div style={{fontSize:14,color:"#A8AFCA",lineHeight:1.6}}>{aiText()}</div>
      </div>
    </div>
  );
}

// ─── SETTINGS ────────────────────────────────────────────────
function SettingsScreen({ user, onUpdateUser, streak, plans, onNav, notifSettings }) {
  const [name,setName]=useState(user.name);
  const [toast,setToast]=useState("");
  const permission=getPermission();
  const totalDays=Object.keys(plans).length,totalJournals=Object.values(plans).filter(p=>p.journal?.body).length;

  const save=()=>{
    const updated={...user,name};store.set("dm_user",updated);onUpdateUser(updated);setToast("✅ 저장됨!");
  };
  const exportData=()=>{
    const blob=new Blob([JSON.stringify({user,plans,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="daymate_export.json";a.click();
  };
  const clearAll=()=>{
    if(window.confirm("모든 데이터를 삭제할까요?")&&window.confirm("정말 삭제하시겠어요?")){
      Object.keys(localStorage).filter(k=>k.startsWith("dm_")).forEach(k=>localStorage.removeItem(k));
      window.location.reload();
    }
  };

  return(
    <div style={S.content}>
      {toast&&<Toast msg={toast} onDone={()=>setToast("")}/>}
      <StatusBar notifEnabled={notifSettings?.enabled}/>
      <div style={{display:"flex",alignItems:"center",gap:14,padding:"20px 24px",background:"#1E2336",borderBottom:"1px solid #2D344A",marginBottom:8}}>
        <div style={{width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#4B6FFF,#6C8EFF)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,color:"#fff",flexShrink:0}}>{user.name?.[0]||"?"}</div>
        <div style={{flex:1}}><div style={{fontSize:16,fontWeight:600}}>{user.name}</div><div style={{fontSize:12,color:"#5C6480",marginTop:2}}>📱 로컬 모드 · 연속 {streak}일</div></div>
      </div>
      <div style={{...S.card,display:"flex",gap:0,padding:0,overflow:"hidden"}}>
        {[{v:totalDays,l:"총 기록일"},{v:totalJournals,l:"일기 작성"},{v:streak,l:"현재 연속"}].map((s,i)=>(
          <div key={i} style={{flex:1,padding:"14px 0",textAlign:"center",borderRight:i<2?"1px solid #2D344A":"none"}}>
            <div style={{fontSize:20,fontWeight:700,color:"#6C8EFF"}}>{s.v}</div>
            <div style={{fontSize:11,color:"#5C6480",marginTop:2}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* 알림 설정 바로가기 */}
      <div onClick={()=>onNav(SC.NOTIFICATIONS)} style={{...S.card,cursor:"pointer",display:"flex",alignItems:"center",gap:12,borderColor:permission==="granted"?"rgba(74,222,128,.3)":"#2D344A"}}>
        <span style={{fontSize:22}}>🔔</span>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:600}}>알림 설정</div>
          <div style={{fontSize:12,color:"#5C6480",marginTop:2}}>
            {permission==="granted" ? `✅ 허용됨 · 활성 ${scheduler.activeCount()}개` : permission==="denied" ? "🚫 차단됨 — 탭하여 해결" : "⚪ 권한 미설정"}
          </div>
        </div>
        <span style={{color:"#5C6480"}}>›</span>
      </div>

      <div style={{fontSize:11,color:"#5C6480",fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",padding:"16px 24px 8px"}}>프로필</div>
      <div style={{padding:"0 24px 12px"}}><label style={S.inputLabel}>이름</label><input style={S.input} value={name} onChange={e=>setName(e.target.value)} maxLength={20}/></div>
      <button style={S.cta} onClick={save}>설정 저장</button>
      <div style={{fontSize:11,color:"#5C6480",fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",padding:"16px 24px 8px"}}>데이터</div>
      {[{icon:"📤",label:"데이터 내보내기",sub:"JSON 파일로 저장",fn:exportData,color:"#A8AFCA"},{icon:"🗑️",label:"모든 데이터 삭제",sub:"복구 불가",fn:clearAll,color:"#F87171"}].map(item=>(
        <div key={item.label} onClick={item.fn} style={{display:"flex",alignItems:"center",padding:"14px 24px",borderTop:"1px solid #2D344A",cursor:"pointer"}}>
          <span style={{fontSize:18,width:32}}>{item.icon}</span>
          <div style={{flex:1}}><div style={{fontSize:14,fontWeight:500,color:item.color}}>{item.label}</div><div style={{fontSize:12,color:"#5C6480"}}>{item.sub}</div></div>
          <span style={{color:"#5C6480"}}>›</span>
        </div>
      ))}
      <div style={{padding:"20px 24px",textAlign:"center",fontSize:12,color:"#5C6480"}}>DayMate v1.2.0 · 알림 기능 추가</div>
      <div style={{height:20}}/>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(()=>store.get("dm_user"));
  const [screen, setScreen] = useState(SC.HOME);
  const [detailDate, setDetailDate] = useState(null);
  const [notifSettings, setNotifSettings] = useState(()=>store.get("dm_notif_settings", DEFAULT_NOTIF_SETTINGS));
  const [plans, setPlans] = useState(()=>{
    const all={};
    Object.keys(localStorage).filter(k=>k.startsWith("dm_plan_")).forEach(k=>{all[k.replace("dm_plan_","")]=store.get(k);});
    return all;
  });

  // 앱 시작 시 알림 스케줄 복원
  useEffect(()=>{
    if(user && notifSettings) scheduler.applySettings(notifSettings, user.name);
    return ()=>scheduler.cancelAll();
  }, []);

  const todayPlan = plans[todayStr()]||null;
  const streak = (()=>{ let s=0;const d=new Date(); while(true){const ds=d.toISOString().split("T")[0];if(plans[ds]?.confirmed){s++;d.setDate(d.getDate()-1);}else break;} return s; })();

  const savePlan = useCallback((plan)=>{
    const date=plan.date||todayStr();
    const updated={...plans,[date]:plan};
    setPlans(updated);store.set("dm_plan_"+date,plan);
  },[plans]);

  const saveNotifSettings = (settings) => {
    setNotifSettings(settings);
    store.set("dm_notif_settings", settings);
    scheduler.applySettings(settings, user?.name||"");
  };

  if(!user) return(
    <div style={S.app}><div style={S.phone}>
      <OnboardScreen onDone={()=>{setUser(store.get("dm_user"));const ns=store.get("dm_notif_settings",DEFAULT_NOTIF_SETTINGS);setNotifSettings(ns);scheduler.applySettings(ns,store.get("dm_user")?.name||"");}}/>
    </div></div>
  );

  const navScreens=[SC.HOME,SC.MORNING,SC.HISTORY,SC.HISTORY_DETAIL,SC.REPORT,SC.SETTINGS];

  const renderScreen=()=>{
    switch(screen){
      case SC.HOME:    return <HomeScreen user={user} todayPlan={todayPlan} onNav={setScreen} streak={streak} notifSettings={notifSettings}/>;
      case SC.MORNING: return <MorningScreen todayPlan={todayPlan} onSave={p=>{savePlan(p);setScreen(SC.HOME);}} onBack={()=>setScreen(SC.HOME)}/>;
      case SC.EVENING: return <EveningScreen todayPlan={todayPlan} onSave={savePlan} onNext={()=>setScreen(SC.JOURNAL)} onBack={()=>setScreen(SC.HOME)}/>;
      case SC.JOURNAL: return <JournalScreen todayPlan={todayPlan} onSave={savePlan} onBack={()=>setScreen(SC.HOME)}/>;
      case SC.HISTORY: return <HistoryScreen plans={plans} onDetail={date=>{setDetailDate(date);setScreen(SC.HISTORY_DETAIL);}}/>;
      case SC.HISTORY_DETAIL: return <HistoryDetailScreen date={detailDate} plan={plans[detailDate]} onBack={()=>setScreen(SC.HISTORY)}/>;
      case SC.REPORT:  return <ReportScreen plans={plans}/>;
      case SC.SETTINGS:return <SettingsScreen user={user} onUpdateUser={setUser} streak={streak} plans={plans} onNav={setScreen} notifSettings={notifSettings}/>;
      case SC.NOTIFICATIONS: return <NotificationScreen settings={notifSettings} onSave={saveNotifSettings} userName={user.name} onBack={()=>setScreen(SC.SETTINGS)}/>;
      default: return <HomeScreen user={user} todayPlan={todayPlan} onNav={setScreen} streak={streak}/>;
    }
  };

  return(
    <div style={S.app}><div style={S.phone}>
      {renderScreen()}
      {navScreens.includes(screen)&&<BottomNav active={screen===SC.HISTORY_DETAIL?SC.HISTORY:screen} onNav={setScreen}/>}
    </div></div>
  );
}
