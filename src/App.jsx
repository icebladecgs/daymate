import { useEffect, useMemo, useRef, useState } from "react";
import { onAuth, googleSignIn, googleSignOut, saveSettings, saveGoals, saveDay as fsaveDay, loadAllFromFirestore, uploadLocalToFirestore } from "./firebase.js";

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
  const dow = "?¼ì›”?”ìˆ˜ëª©ê¸ˆ??[d.getDay()];
  return `${d.getMonth() + 1}??${d.getDate()}??${dow}?”ì¼`;
};
const monthLabel = (y, m0) => `${y}??${m0 + 1}??;

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

const sendNotification = (title, body, iconEmoji = "??) => {
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

// ---------- Telegram helpers ----------
async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken || !chatId) return { ok: false, error: '? í° ?ëŠ” ì±?IDê°€ ë¹„ì–´ ?ˆì–´?? };
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const json = await res.json();
    if (res.ok) return { ok: true };
    return { ok: false, error: json.description || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e.message || '?¤íŠ¸?Œí¬ ?¤ë¥˜' };
  }
}

const ASSET_META = {
  BTC:  { label: 'ë¹„íŠ¸ì½”ì¸',     src: 'coingecko' },
  ETH:  { label: '?´ë”ë¦¬ì?',     src: 'coingecko' },
  TSLA: { label: '?ŒìŠ¬??,       src: 'finnhub' },
  GOOGL:{ label: 'êµ¬ê?',         src: 'finnhub' },
  IVR:  { label: 'IVR',          src: 'finnhub' },
  QQQ:  { label: '?˜ìŠ¤??00(QQQ)', src: 'finnhub' },
};

async function fetchMarketData(finnhubKey, assets = Object.keys(ASSET_META), customRegistry = {}) {
  const data = {};
  const registry = { ...ASSET_META, ...customRegistry }; // ?µí•© ?ˆì??¤íŠ¸ë¦?

  // CoinGecko (preset BTC/ETH + custom crypto)
  const geckoCoins = assets
    .filter(sym => registry[sym]?.src === 'coingecko')
    .map(sym => ({
      sym,
      coinId: registry[sym].coinId || (sym === 'BTC' ? 'bitcoin' : sym === 'ETH' ? 'ethereum' : null),
      label: registry[sym].label
    }))
    .filter(c => c.coinId);

  if (geckoCoins.length > 0) {
    try {
      const ids = geckoCoins.map(c => c.coinId).join(',');
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
      const j = await r.json();
      for (const { sym, coinId, label } of geckoCoins) {
        const coin = j[coinId];
        if (coin) data[sym] = { label, price: coin.usd, chgPct: coin.usd_24h_change, src: 'coingecko' };
      }
    } catch {}
  }

  // Finnhub (preset + custom stocks)
  if (finnhubKey) {
    const finnhubAssets = assets.filter(sym => registry[sym]?.src === 'finnhub');
    for (const sym of finnhubAssets) {
      try {
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`);
        const j = await r.json();
        if (j && j.c > 0) data[sym] = { label: registry[sym].label, price: j.c, change: j.d, chgPct: j.dp, src: 'finnhub' };
      } catch {}
    }
  }
  return data;
}

function buildBriefingText(marketData, userName) {
  const today = new Date();
  const dateStr = `${today.getMonth() + 1}??${today.getDate()}??;
  let text = `?“Š <b>${userName}?˜ì˜ ?„ì¹¨ ?ì‚° ë¸Œë¦¬??/b> (${dateStr})\n`;
  text += `?â”?â”?â”?â”?â”?â”?â”??n`;

  const fmtPrice = (n) =>
    n == null ? 'N/A' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtChg = (chgPct, change) => {
    if (chgPct == null) return '';
    const arrow = chgPct >= 0 ? '?? : '??;
    const pct = `${chgPct >= 0 ? '+' : ''}${Number(chgPct).toFixed(2)}%`;
    const chgStr = change != null
      ? ` (${change >= 0 ? '+' : ''}$${Math.abs(Number(change)).toFixed(2)})`
      : '';
    return ` ${arrow} ${pct}${chgStr}`;
  };

  // crypto (src='coingecko') ë¨¼ì?
  const cryptoSyms = Object.keys(marketData).filter(s => marketData[s].src === 'coingecko');
  for (const sym of cryptoSyms) {
    const d = marketData[sym];
    const icon = sym === 'BTC' ? '?? : sym === 'ETH' ? '?' : '?ª™';
    text += `${icon} <b>${d.label}</b>: $${fmtPrice(d.price)}${fmtChg(d.chgPct)}\n`;
  }

  // ì£¼ì‹ (src='finnhub') ?˜ì¤‘
  const stockSyms = Object.keys(marketData).filter(s => marketData[s].src === 'finnhub');
  if (stockSyms.length > 0) {
    text += `?â”?â”?â”?â”?â”?â”?â”??n`;
    for (const sym of stockSyms) {
      const d = marketData[sym];
      text += `?“ˆ <b>${d.label}</b>: $${fmtPrice(d.price)}${fmtChg(d.chgPct, d.change)}\n`;
    }
  }
  text += `?â”?â”?â”?â”?â”?â”?â”??nì¢‹ì? ?˜ë£¨ ?˜ì„¸?? ?Œ…`;
  return text;
}

async function searchFinnhub(finnhubKey, query) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${finnhubKey}`);
    const j = await r.json();
    return (j.result || [])
      .filter(item => item.type === 'Common Stock' || item.type === 'ETP')
      .slice(0, 6)
      .map(item => ({ sym: item.symbol, label: item.description, src: 'finnhub' }));
  } catch { return []; }
}

async function searchCoinGecko(query) {
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
    const j = await r.json();
    return (j.coins || []).slice(0, 6).map(coin => ({
      sym: coin.symbol.toUpperCase(),
      label: coin.name,
      src: 'coingecko',
      coinId: coin.id,
    }));
  } catch { return []; }
}

// setTimeout ê¸°ë°˜ (???´ë ¤?ˆì„ ?Œë§Œ ?™ì‘)
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

  schedule(id, timeStr, title, body, iconEmoji = "?””", onFire = null) {
    clearTimeout(this.timers[id]);
    const fire = async () => {
      sendNotification(title, body, iconEmoji);
      if (onFire) {
        try { await onFire(); } catch {}
      }
      this.timers[id] = setTimeout(fire, 24 * 60 * 60 * 1000);
    };
    this.timers[id] = setTimeout(fire, this.msUntil(timeStr));
  }

  apply(enabled, userName, telegramCfg = {}, alarmTimes = {}) {
    this.cancelAll();
    if (!enabled) return;

    const { botToken = '', chatId = '', finnhubKey = '', briefingTime = '07:00', todoTime = '07:05', assets, customAssets: rawCustomAssets } = telegramCfg;
    const selectedAssets = assets && assets.length > 0 ? assets : Object.keys(ASSET_META);
    const customAssetsArr = rawCustomAssets || [];
    const customRegistry = Object.fromEntries(customAssetsArr.map(a => [a.sym, a]));
    const morningTime = alarmTimes.morning || '07:30';
    const noonTime = alarmTimes.noon || '12:00';
    const eveningTime = alarmTimes.evening || '18:00';
    const nightTime = alarmTimes.night || '23:00';
    const hasTg = !!(botToken && chatId);

    // ?ì‚° ë¸Œë¦¬??(Telegram)
    if (hasTg) {
      this.schedule(
        'tg_market', briefingTime,
        'DayMate ?“Š', '?„ì¹¨ ?ì‚° ë¸Œë¦¬?‘ì„ ?”ë ˆê·¸ë¨?¼ë¡œ ?„ì†¡ ì¤?..',
        '?“Š',
        async () => {
          const marketData = await fetchMarketData(finnhubKey, selectedAssets, customRegistry);
          const text = buildBriefingText(marketData, userName);
          await sendTelegramMessage(botToken, chatId, text);
        }
      );

      // ? ì¼ ?Œë¦¼ (Telegram)
      this.schedule(
        'tg_todo', todoTime,
        'DayMate ??, '?¤ëŠ˜ ???¼ì„ ?”ë ˆê·¸ë¨?¼ë¡œ ?„ì†¡',
        '??,
        async () => {
          const today = toDateStr();
          const todayDayData = store.get(dayKey(today));
          const tasks = (todayDayData?.tasks || []).filter(t => t.title.trim());
          let text = `??<b>${userName}?? ?¤ëŠ˜ ????</b>\n\n`;
          if (tasks.length > 0) {
            tasks.forEach((t, i) => { text += `${i + 1}. ${t.title}\n`; });
            text += `\nì´?${tasks.length}ê°??ˆì • Â· ?”ì´?? ?’ª`;
          } else {
            text += `?„ì§ ?¤ëŠ˜ ???¼ì„ ?…ë ¥?˜ì? ?Šì•˜?´ìš”.\nDayMate?ì„œ ?…ë ¥?´ì£¼?¸ìš” ?“`;
          }
          await sendTelegramMessage(botToken, chatId, text);
        }
      );
    }

    // ë¸Œë¼?°ì? ?Œë¦¼ (ê¶Œí•œ ?„ìš”)
    if (getPermission() !== "granted") return;

    this.schedule(
      'm_morning', morningTime,
      'DayMate ?Œ…', `${userName}?? ì¢‹ì? ?„ì¹¨! ?¤ëŠ˜ ???¼ì„ ?•í•´ë³¼ê¹Œ??`, '?Œ…',
      hasTg ? async () => {
        const d = store.get(dayKey(toDateStr()));
        const tasks = (d?.tasks || []).filter(t => t.title.trim());
        let text = `?Œ… <b>${userName}?? ì¢‹ì? ?„ì¹¨?´ì—??</b>\n\n`;
        if (tasks.length > 0) {
          text += `?“‹ ?¤ëŠ˜??? ì¼\n`;
          tasks.forEach((t, i) => { text += `  ${i + 1}. ${t.title}\n`; });
        } else {
          text += `?¤ëŠ˜ ???¼ì„ ?„ì§ ?…ë ¥?˜ì? ?Šì•˜?´ìš”.\nDayMate?ì„œ ?˜ë£¨ë¥?ê³„íš?´ë³´?¸ìš” ?“`;
        }
        text += `\n\n<a href="https://daymate-beta.vercel.app">?“± DayMate ?´ê¸°</a>`;
        await sendTelegramMessage(botToken, chatId, text);
      } : null
    );

    this.schedule(
      'm_noon', noonTime,
      'DayMate ?•›', `${userName}?? ?ì‹¬ ì²´í¬??`, '?•›',
      hasTg ? async () => {
        const d = store.get(dayKey(toDateStr()));
        const tasks = d?.tasks || [];
        const done = tasks.filter(t => t.done && t.title.trim()).length;
        const total = tasks.filter(t => t.title.trim()).length;
        await sendTelegramMessage(botToken, chatId,
          `?•› <b>${userName}???ì‹¬ ì²´í¬??</b>\n\n???„ë£Œ: ${done}/${total}\n\n?¤í›„???”ì´?? ?’ª`
        );
      } : null
    );

    this.schedule(
      'm_eve', eveningTime,
      'DayMate ?Œ†', `${userName}?? ?€??ì²´í¬??`, '?Œ†',
      hasTg ? async () => {
        const d = store.get(dayKey(toDateStr()));
        const tasks = d?.tasks || [];
        const done = tasks.filter(t => t.done && t.title.trim()).length;
        const total = tasks.filter(t => t.title.trim()).length;
        await sendTelegramMessage(botToken, chatId,
          `?Œ† <b>${userName}???€??ì²´í¬??</b>\n\n???„ë£Œ: ${done}/${total}\n\në§ˆë¬´ë¦????´ìš”! ?¯`
        );
      } : null
    );

    this.schedule(
      'm_night', nightTime,
      'DayMate ?Œ™', `${userName}?? ë§ˆì?ë§?ì²´í¬ + ?¼ê¸° ?‘ì„±?˜ê³  ë§ˆë¬´ë¦¬í•´??`, '?Œ™',
      hasTg ? async () => {
        const d = store.get(dayKey(toDateStr()));
        const tasks = d?.tasks || [];
        const done = tasks.filter(t => t.done && t.title.trim()).length;
        const total = tasks.filter(t => t.title.trim()).length;
        const hasJournal = !!d?.journal?.body?.trim();
        let text = `?Œ™ <b>${userName}?? ?˜ë£¨ ë§ˆë¬´ë¦¬í•  ?œê°„?´ì—??</b>\n\n`;
        text += `???„ë£Œ: ${done}/${total}\n`;
        text += hasJournal ? `?“– ?¼ê¸°: ?‘ì„± ?„ë£Œ ??n` : `?“– ?¼ê¸°: ?„ì§ ?‘ì„± ???ï¸\n`;
        text += `\n?¤ëŠ˜???˜ê³ ?ˆì–´?? ?ŒŸ`;
        await sendTelegramMessage(botToken, chatId, text);
      } : null
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
    width: "100vw",   // make container span full viewport regardless of parent flex
  },
  phone: {
    width: "100%",
    maxWidth: "100%",
    minHeight: "100vh",
    background: "#181C27",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  content: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    overflowY: "auto",
    overflowX: "auto",
    paddingBottom: 90,
    boxSizing: "border-box",
  },
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
    margin: "0 16px 10px",
    boxSizing: "border-box",
  },
  sectionTitle: {
    padding: "14px 16px 8px",
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
    { id: "home", icon: "? ", label: "?? },
    { id: "today", icon: "?“–", label: "?¼ê¸°" },
    { id: "history", icon: "?“…", label: "ê¸°ë¡" },
    { id: "stats", icon: "?“Š", label: "?µê³„" },
    { id: "settings", icon: "?™ï¸", label: "?¤ì •" },
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
  memo: "",
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
  
  // ?°ê°„ ì§„í–‰?? 1??1?¼ë????¤ëŠ˜ê¹Œì?
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
function Home({ user, goals, todayData, plans, onGoToday, onToggleTask, goalChecks, onToggleGoal, onSetTodayTasks, onSaveMonthGoals }) {
  const today = toDateStr();
  const doneCount = (todayData?.tasks || []).filter((t) => t.done && t.title.trim())
    .length;
  const filledCount = (todayData?.tasks || []).filter((t) => t.title.trim()).length;
  const allDone = filledCount > 0 && doneCount === filledCount;

  const streak = useMemo(() => calcStreak(plans), [plans]);
  const weeklyStats = useMemo(() => calcWeeklyStats(plans), [plans]);
  const weeklyAvg = useMemo(() => 
    Math.round(weeklyStats.reduce((a, d) => a + d.rate, 0) / 7),
    [weeklyStats]
  );
  const goalProgress = useMemo(() => calcGoalProgress(plans), [plans]);

  const [editingTasks, setEditingTasks] = useState(false);
  const [draftTasks, setDraftTasks] = useState([]);
  const [editingGoals, setEditingGoals] = useState(false);
  const [draftGoals, setDraftGoals] = useState([]);
  const [newGoalInput, setNewGoalInput] = useState('');

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
      <div style={S.topbar}>
        <div>
          <div style={S.title}>DayMate Lite</div>
          <div style={S.sub}>{user.name}??Â· {formatKoreanDate(today)}</div>
        </div>
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 800 }}>
          {getPermission() === "granted" ? "?””" : "?”•"}
        </div>
      </div>

      <div style={{ ...S.sectionTitle, display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 16 }}>
        <span>???¤ëŠ˜ ? ì¼</span>
        <button onClick={editingTasks ? saveTaskEdits : startEditTasks}
          style={{ fontSize: 11, fontWeight: 900, color: editingTasks ? "#4ADE80" : "#5C6480", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}>
          {editingTasks ? "?„ë£Œ ?? : "?ï¸ ?¸ì§‘"}
        </button>
      </div>
      <div style={{ ...S.card, border: allDone && !editingTasks ? "1.5px solid #4ADE80" : "1.5px solid #2D344A" }}>
        {editingTasks ? (
          <>
            {draftTasks.map((t, idx) => (
              <div key={t.id} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <input
                  style={{ ...S.input, flex: 1 }}
                  value={t.title}
                  onChange={(e) => setDraftTasks(prev => prev.map(x => x.id === t.id ? { ...x, title: e.target.value } : x))}
                  placeholder={`????${idx + 1}`}
                  maxLength={60}
                />
                <button onClick={() => setDraftTasks(prev => prev.filter(x => x.id !== t.id))}
                  style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer", flexShrink: 0 }}>??/button>
              </div>
            ))}
            <button style={{ ...S.btn, marginTop: 4 }}
              onClick={() => setDraftTasks(prev => [...prev, { id: `t${Date.now()}`, title: "", done: false, checkedAt: null }])}>
              ??????ì¶”ê?
            </button>
          </>
        ) : filledCount === 0 ? (
          <>
            <div style={{ color: "#5C6480", fontSize: 13, marginBottom: 14 }}>
              ?¤ëŠ˜ ???¼ì„ ?„ì§ ?…ë ¥?˜ì? ?Šì•˜?´ìš”
            </div>
            <button style={S.btn} onClick={startEditTasks}>? ì¼ ?…ë ¥?˜ê¸° ??/button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: "#A8AFCA", fontWeight: 900 }}>{doneCount}/{filledCount} ?„ë£Œ</div>
              {allDone && <div style={{ fontSize: 12, color: "#4ADE80", fontWeight: 900 }}>?‰ ëª¨ë‘ ?„ë£Œ!</div>}
            </div>
            <div style={{ height: 6, background: "#1E2235", borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
              <div style={{
                height: "100%", borderRadius: 3, transition: "width 0.3s",
                background: allDone ? "#4ADE80" : "#4B6FFF",
                width: `${(doneCount / filledCount) * 100}%`,
              }} />
            </div>
            {(todayData?.tasks || []).map((task, i) => {
              if (!task.title.trim()) return null;
              return (
                <div key={task.id} onClick={() => onToggleTask(task.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                    borderBottom: i < (todayData.tasks.length - 1) ? "1px solid #1E2235" : "none",
                    cursor: "pointer" }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    border: task.done ? "none" : "2px solid #3A4260",
                    background: task.done ? "#4B6FFF" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {task.done && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>??/span>}
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 700, flex: 1,
                    color: task.done ? "#5C6480" : "#F0F2F8",
                    textDecoration: task.done ? "line-through" : "none",
                  }}>{task.title}</div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div style={S.sectionTitle}>?”¥ ?°ì† ê¸°ë¡</div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: streak > 0 ? "#FCD34D" : "#5C6480" }}>
            {streak}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#F0F2F8" }}>
              {streak > 0 ? `${streak}???°ì†` : "?°ì† ê¸°ë¡ ?†ìŒ"}
            </div>
            <div style={{ fontSize: 12, color: "#A8AFCA", marginTop: 4 }}>
              ?„ë²½???˜ë£¨ (3ê°??„ë£Œ + ?¼ê¸°)
            </div>
          </div>
        </div>
      </div>

      <div style={S.sectionTitle}>?“Š ?´ë²ˆ ì£?/div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: "#A8AFCA", fontWeight: 900 }}>?‰ê·  ?„ë£Œ??/div>
          <div style={{ fontSize: 20, fontWeight: 900, color: weeklyAvg >= 80 ? "#4ADE80" : weeklyAvg >= 50 ? "#FCD34D" : "#F87171" }}>
            {weeklyAvg}%
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, justifyContent: "space-between" }}>
          {weeklyStats.map((d, i) => {
            const dow = "?¼ì›”?”ìˆ˜ëª©ê¸ˆ??[new Date(d.date).getDay()];
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
                  {d.isPerfect ? "?? : d.rate > 0 ? d.rate : ""}
                </div>
                <div style={{ fontSize: 11, color: "#5C6480", fontWeight: 800 }}>{dow}</div>
              </div>
            );
          })}
        </div>
      </div>

      {(todayData?.memo || '').trim() && (
        <>
          <div style={S.sectionTitle}>?“ ?¤ëŠ˜ ë©”ëª¨</div>
          <div style={{ ...S.card, cursor: "pointer" }} onClick={onGoToday}>
            <div style={{ fontSize: 13, color: "#A8AFCA", whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 64, overflow: "hidden" }}>
              {(todayData.memo || '').trim().split('\n').slice(0, 3).join('\n')}
            </div>
            <div style={{ fontSize: 11, color: "#5C6480", marginTop: 6 }}>?ï¸ ??•´???¸ì§‘</div>
          </div>
        </>
      )}

      <div style={{ ...S.sectionTitle, display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 16 }}>
        <span>?“… ?´ë‹¬ ëª©í‘œ</span>
        <button onClick={editingGoals ? saveGoalEdits : startEditGoals}
          style={{ fontSize: 11, fontWeight: 900, color: editingGoals ? "#4ADE80" : "#5C6480", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}>
          {editingGoals ? "?„ë£Œ ?? : "?ï¸ ?¸ì§‘"}
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
                  placeholder={`ëª©í‘œ ${i + 1}`}
                  maxLength={40}
                />
                <button onClick={() => setDraftGoals(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer", flexShrink: 0 }}>??/button>
              </div>
            ))}
            {draftGoals.length < 5 && (
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  style={{ ...S.input, flex: 1 }}
                  value={newGoalInput}
                  onChange={(e) => setNewGoalInput(e.target.value)}
                  placeholder="??ëª©í‘œ ?…ë ¥ ??Enter ?ëŠ” ??
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
                }} style={{ background: "transparent", border: "none", color: "#4B6FFF", cursor: "pointer", flexShrink: 0, fontSize: 20, lineHeight: 1 }}>??/button>
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
                <div style={{ fontSize: 13, color: "#A8AFCA", fontWeight: 900 }}>{doneGoals}/{monthGoals.length} ?¬ì„±</div>
                {allGoalsDone && <div style={{ fontSize: 12, color: "#4ADE80", fontWeight: 900 }}>?‰ ?„ë? ?¬ì„±!</div>}
              </div>
              <div style={{ height: 6, background: "#1E2235", borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
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
                      borderBottom: i < monthGoals.length - 1 ? "1px solid #1E2235" : "none",
                      cursor: "pointer" }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: done ? "none" : "2px solid #3A4260",
                      background: done ? "#4B6FFF" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {done && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>??/span>}
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 700, flex: 1,
                      color: done ? "#5C6480" : "#F0F2F8",
                      textDecoration: done ? "line-through" : "none",
                    }}>{g}</div>
                  </div>
                );
              })}
            </>
          );
        })() : (
          <div style={{ color: "#5C6480", fontSize: 13, marginBottom: 4 }}>
            ?´ë‹¬ ëª©í‘œê°€ ?†ì–´??{" "}
            <span onClick={startEditGoals} style={{ color: "#4B6FFF", cursor: "pointer", fontWeight: 900 }}>?ï¸ ?¸ì§‘</span>?ì„œ ì¶”ê??´ë³´?¸ìš”
          </div>
        )}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #1E2235" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: "#5C6480", fontWeight: 900 }}>?“† ?„ë²½????/div>
            <div style={{ flex: 1, height: 4, background: "#1E2235", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                background: goalProgress.monthProgress >= 80 ? "#4ADE80" : goalProgress.monthProgress >= 50 ? "#FCD34D" : "#F87171",
                width: `${goalProgress.monthProgress}%`,
              }} />
            </div>
            <div style={{ fontSize: 11, color: "#A8AFCA", fontWeight: 900 }}>{goalProgress.perfectDaysThisMonth}/{goalProgress.daysInMonth}??/div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 11, color: "#5C6480", fontWeight: 900 }}>?‘‘ ?°ê°„</div>
            <div style={{ flex: 1, height: 4, background: "#1E2235", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                background: goalProgress.yearProgress >= 80 ? "#4ADE80" : goalProgress.yearProgress >= 50 ? "#FCD34D" : "#F87171",
                width: `${goalProgress.yearProgress}%`,
              }} />
            </div>
            <div style={{ fontSize: 11, color: "#A8AFCA", fontWeight: 900 }}>{goalProgress.yearProgress}%</div>
          </div>
        </div>
      </div>
      <div style={{ height: 12 }} />
    </div>
  );
}

function Today({ dateStr, data, setData, toast, setToast }) {
  const doneCount = data.tasks.filter((t) => t.done && t.title.trim()).length;
  const filledCount = data.tasks.filter((t) => t.title.trim()).length;
  const isPerfect = filledCount >= 3 && doneCount === filledCount && !!data.journal?.body?.trim();

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      <div style={S.topbar}>
        <div>
          <div style={S.title}>?¤ëŠ˜ ?¼ê¸°</div>
          <div style={S.sub}>{formatKoreanDate(dateStr)} Â· {doneCount}/{filledCount || 3} ?„ë£Œ</div>
        </div>
      </div>

      {isPerfect && (
        <div style={{
          ...S.card,
          background: "linear-gradient(135deg,rgba(74,222,128,.15),rgba(108,142,255,.10))",
          border: "1.5px solid rgba(74,222,128,.35)",
        }}>
          <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>?‰</div>
          <div style={{ fontSize: 14, fontWeight: 900, textAlign: "center", color: "#4ADE80" }}>
            ?„ë²½???˜ë£¨!
          </div>
          <div style={{ fontSize: 12, textAlign: "center", color: "#A8AFCA", marginTop: 6 }}>
            3ê°€ì§€ ?„ë£Œ + ?¼ê¸° ?‘ì„±. ?°ì† ê¸°ë¡???“ì´ê³??ˆì–´???”¥
          </div>
        </div>
      )}

      <div style={{ ...S.sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: 16 }}>
        <span>?“ ?¤ëŠ˜ ë©”ëª¨</span>
        <span style={{ fontSize: 11, color: "#5C6480", fontWeight: 400 }}>?˜ì‹œë¡?ê¸°ë¡?´ìš”</span>
      </div>
      <div style={S.card}>
        <textarea
          rows={4}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={data.memo ?? ""}
          onChange={(e) =>
            setData((prev) => ({ ...prev, memo: e.target.value }))
          }
          placeholder="?…ë¬´ ë©”ëª¨, ? ì˜¤ë¥??ê°, ????.. ë­ë“  ?ì–´??"
          maxLength={1200}
        />
        <button
          style={S.btn}
          onClick={() => {
            setData((prev) => ({ ...prev, memo: prev.memo ?? "" }));
            setToast("ë©”ëª¨ ?€????);
          }}
        >
          ë©”ëª¨ ?€??
        </button>
        <div style={{ fontSize: 11, color: "#5C6480", marginTop: 6, textAlign: "right" }}>
          {(data.memo ?? "").length} / 1200
        </div>
      </div>

      <div style={S.sectionTitle}>?¼ê¸° (22:00 ?´í›„ ì¶”ì²œ)</div>
      <div style={S.card}>
        <textarea
          rows={10}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={data.journal.body}
          onChange={(e) =>
            setData((prev) => ({
              ...prev,
              journal: { ...prev.journal, body: e.target.value },
            }))
          }
          placeholder="?¤ëŠ˜ ?˜ë£¨ë¥???ì¤„ì´?¼ë„ ê¸°ë¡?´ë´??"
          maxLength={1200}
        />
        <button
          style={S.btn}
          onClick={() => {
            setData((prev) => ({
              ...prev,
              journal: { ...prev.journal, savedAt: new Date().toISOString() },
            }));
            setToast("?¼ê¸° ?€????);
          }}
        >
          ?¼ê¸° ?€??
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
  const [searchQ, setSearchQ] = useState('');

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

  const searchResults = useMemo(() => {
    if (!searchQ.trim()) return [];
    const q = searchQ.toLowerCase();
    return Object.keys(plans)
      .filter(ds => {
        const d = plans[ds];
        return (d?.memo || '').toLowerCase().includes(q) || (d?.journal?.body || '').toLowerCase().includes(q);
      })
      .sort((a, b) => b.localeCompare(a));
  }, [searchQ, plans]);


  return (
    <div style={S.content}>
      <div style={S.topbar}>
        <div>
          <div style={S.title}>ê¸°ë¡</div>
          <div style={S.sub}>?¬ë ¥?ì„œ ? ì§œë¥??ŒëŸ¬ ?•ì¸</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={prev} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>??/button>
          <button onClick={next} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>??/button>
        </div>
      </div>

      <div style={{ padding: "12px 18px 8px", fontSize: 16, fontWeight: 900 }}>
        {monthLabel(year, month0)}
      </div>

      <div style={{ padding: "0 18px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
          {["??, "??, "??, "??, "ëª?, "ê¸?, "??].map((d) => (
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
            const hasMemo = !!(plans[ds]?.memo?.trim());
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
                  position: "relative",
                  cursor: clickable ? "pointer" : "default",
                  ...st,
                }}
                title={clickable ? (perfect ? "?„ë²½???˜ë£¨ ?? : `${r}%`) : ""}
              >
                {perfect ? "?? : day}
                {hasMemo && (
                  <span style={{
                    position: "absolute", bottom: 3, right: 3,
                    width: 5, height: 5, borderRadius: 999,
                    background: "#6C8EFF",
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={S.sectionTitle}>ìµœê·¼ ê¸°ë¡</div>
      {recent.length === 0 && (
        <div style={{ padding: "20px 18px", color: "#5C6480", textAlign: "center" }}>
          ?„ì§ ê¸°ë¡???†ì–´???Œ±
        </div>
      )}
      {recent.map((ds) => {
        const d = plans[ds];
        const done = d.tasks.filter((t) => t.done && t.title.trim()).length;
        const filled = d.tasks.filter((t) => t.title.trim()).length;
        const hasJournal = !!d.journal?.body?.trim();
        const hasMemo = !!d.memo?.trim();
        const journalPreview = (d.journal?.body || '').trim().split('\n')[0].slice(0, 50);
        const memoPreview = (d.memo || '').trim().split('\n')[0].slice(0, 50);
        return (
          <div key={ds} style={{ ...S.card, cursor: "pointer" }} onClick={() => onOpenDate(ds)}>
            <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900 }}>
              {formatKoreanDate(ds)}
            </div>
            <div style={{ fontSize: 13, marginTop: 8, color: "#F0F2F8" }}>
              ??{done}/{Math.max(3, filled || 3)} Â· {hasJournal ? "?“– ?¼ê¸° ?ˆìŒ" : "?“– ?¼ê¸° ?†ìŒ"}
            </div>
            {hasMemo && <div style={{ fontSize: 12, color: "#6C8EFF", marginTop: 6, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>?“ {memoPreview}</div>}
            {hasJournal && journalPreview && <div style={{ fontSize: 12, color: "#A8AFCA", marginTop: 4, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>?’¬ {journalPreview}</div>}
          </div>
        );
      })}

      <div style={S.sectionTitle}>?” ë©”ëª¨ / ?¼ê¸° ê²€??/div>
      <div style={{ padding: "0 16px 10px" }}>
        <input
          style={{ ...S.input, width: "100%", boxSizing: "border-box" }}
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="?¤ì›Œ?œë¡œ ê²€??.."
        />
      </div>
      {searchQ.trim() && searchResults.length === 0 && (
        <div style={{ padding: "12px 18px", color: "#5C6480", fontSize: 13 }}>ê²€??ê²°ê³¼ ?†ìŒ</div>
      )}
      {searchResults.map((ds) => {
        const d = plans[ds];
        const q = searchQ.toLowerCase();
        const memoSnippet = (d?.memo || '').trim();
        const journalSnippet = (d?.journal?.body || '').trim();
        const highlight = (text) => {
          const idx = text.toLowerCase().indexOf(q);
          if (idx < 0) return text.slice(0, 60);
          const start = Math.max(0, idx - 15);
          return (start > 0 ? '?? : '') + text.slice(start, idx + q.length + 30);
        };
        return (
          <div key={ds} style={{ ...S.card, cursor: "pointer" }} onClick={() => onOpenDate(ds)}>
            <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 6 }}>{formatKoreanDate(ds)}</div>
            {memoSnippet.toLowerCase().includes(q) && (
              <div style={{ fontSize: 12, color: "#6C8EFF", marginBottom: 4, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>?“ {highlight(memoSnippet)}</div>
            )}
            {journalSnippet.toLowerCase().includes(q) && (
              <div style={{ fontSize: 12, color: "#A8AFCA", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>?’¬ {highlight(journalSnippet)}</div>
            )}
          </div>
        );
      })}

      <div style={{ height: 12 }} />
    </div>
  );
}

function DayDetail({ dateStr, data, setData, onBack, toast, setToast }) {
  const isToday = dateStr === toDateStr();
  const doneCount = data.tasks.filter((t) => t.done && t.title.trim()).length;
  const filledCount = data.tasks.filter((t) => t.title.trim()).length;

  const toggleDone = (id) => {
    setData((prev) => {
      const next = { ...prev };
      const wasUndone = !prev.tasks.find(t => t.id === id)?.done;
      next.tasks = next.tasks.map((t) =>
        t.id === id ? { ...t, done: !t.done, checkedAt: new Date().toISOString() } : t
      );
      if (wasUndone) playSuccessSound();
      return next;
    });
  };

  const setTitle = (id, title) => {
    setData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => t.id === id ? { ...t, title } : t),
    }));
  };

  const addTask = () => {
    setData((prev) => ({
      ...prev,
      tasks: [...prev.tasks, { id: `t${Date.now()}`, title: "", done: false, checkedAt: null }],
    }));
  };

  const removeTask = (id) => {
    setData((prev) => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== id) }));
  };

  const saveJournal = () => {
    setData((prev) => ({
      ...prev,
      journal: { ...prev.journal, savedAt: new Date().toISOString() },
    }));
    setToast("?¼ê¸° ?€????);
  };

  const isPerfect = filledCount >= 3 && doneCount === filledCount && !!data.journal?.body?.trim();

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <div style={S.topbar}>
        <button onClick={onBack} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>
          ??
        </button>
        <div style={{ flex: 1 }}>
          <div style={S.title}>{formatKoreanDate(dateStr)}</div>
          <div style={S.sub}>
            {doneCount}/{filledCount} ?„ë£Œ
            {isPerfect && " Â· ?‰ ?„ë²½???˜ë£¨"}
          </div>
        </div>
        <div />
      </div>

      <div style={S.sectionTitle}>????({data.tasks.length}ê°?</div>
      <div style={S.card}>
        {data.tasks.map((t, idx) => (
          <div key={t.id} style={{ display: "flex", gap: 10, marginBottom: idx < data.tasks.length - 1 ? 10 : 0 }}>
            <button
              onClick={() => toggleDone(t.id)}
              style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                border: `1.5px solid ${t.done ? "#4ADE80" : "#2D344A"}`,
                background: t.done ? "rgba(74,222,128,.12)" : "#252B3E",
                color: t.done ? "#4ADE80" : "#A8AFCA",
                fontSize: 18, cursor: "pointer",
              }}
            >
              {t.done ? "?? : idx + 1}
            </button>
            <input
              style={S.input}
              value={t.title}
              onChange={(e) => setTitle(t.id, e.target.value)}
              placeholder={`????${idx + 1}`}
              maxLength={60}
            />
            <button
              style={{ marginLeft: 6, background: "transparent", border: "none", color: "#F87171", cursor: "pointer", flexShrink: 0 }}
              onClick={() => removeTask(t.id)}
              title="?? œ"
            >
              ??
            </button>
          </div>
        ))}
        <button style={{ ...S.btn, marginTop: 8 }} onClick={addTask}>??????ì¶”ê?</button>
        {!isToday && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#5C6480" }}>
            ?ï¸ ê³¼ê±° ? ì§œ ê¸°ë¡???¸ì§‘ ì¤‘ì´?ìš”
          </div>
        )}
      </div>

      <div style={S.sectionTitle}>ì²´í¬</div>
      <div style={S.card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CHECK_TIMES.map((t) => (
            <div
              key={t}
              style={{
                padding: "7px 10px", borderRadius: 999, border: "1.5px solid #2D344A",
                background: data.checks[t] ? "rgba(108,142,255,.12)" : "#252B3E",
                color: data.checks[t] ? "#6C8EFF" : "#A8AFCA",
                fontSize: 12, fontWeight: 900,
              }}
            >
              {data.checks[t] ? "?? : "?±ï¸"} {t}
            </div>
          ))}
        </div>
      </div>

      <div style={S.sectionTitle}>?“ ë©”ëª¨</div>
      <div style={S.card}>
        <textarea
          rows={3}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={data.memo ?? ""}
          onChange={(e) =>
            setData((prev) => ({ ...prev, memo: e.target.value }))
          }
          placeholder="ë©”ëª¨ë¥??¨ê²¨ë³´ì„¸??"
          maxLength={1200}
        />
        <button
          style={S.btn}
          onClick={() => {
            setData((prev) => ({ ...prev, memo: prev.memo ?? "" }));
            setToast("ë©”ëª¨ ?€????);
          }}
        >
          ë©”ëª¨ ?€??
        </button>
        <div style={{ fontSize: 11, color: "#5C6480", marginTop: 6, textAlign: "right" }}>
          {(data.memo ?? "").length} / 1200
        </div>
      </div>

      <div style={S.sectionTitle}>?¼ê¸°</div>
      <div style={S.card}>
        <textarea
          rows={6}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={data.journal?.body || ""}
          onChange={(e) =>
            setData((prev) => ({
              ...prev,
              journal: { ...prev.journal, body: e.target.value },
            }))
          }
          placeholder="??? ì˜ ê¸°ë¡???¨ê²¨ë³´ì„¸??"
          maxLength={1200}
        />
        <button style={S.btn} onClick={saveJournal}>?¼ê¸° ?€??/button>
        <div style={{ fontSize: 11, color: "#5C6480", marginTop: 8, textAlign: "right" }}>
          {(data.journal?.body || "").length} / 1200
        </div>
      </div>
      <div style={{ height: 12 }} />
    </div>
  );
}

function Stats({ plans }) {
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  let perfectDays = 0;
  let filledDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
    const dayData = plans[dateStr];
    if (dayData && (dayData.tasks || []).some(t => t.title.trim())) {
      filledDays++;
      if (isPerfectDay(dayData)) perfectDays++;
    }
  }

  const perfectRate = filledDays === 0 ? 0 : Math.round((perfectDays / filledDays) * 100);

  // ?”ë³„ ?°ì´??
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
        if (isPerfectDay(dayData)) perfect++;
      }
    }
    monthStats.push({ month: m, perfect, filled, rate: filled === 0 ? 0 : Math.round((perfect / filled) * 100) });
  }

  // ?°ê°„ ?ˆíŠ¸ë§??°ì´??(?´ë‹¹ ?°ë„ 1????~ 12??1??
  const buildHeatmap = (year) => {
    const jan1 = new Date(year, 0, 1);
    const startOffset = jan1.getDay(); // 0=??
    const totalDays = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
    const cells = [];
    // ?ìª½ ë¹ˆì¹¸
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(year, 0, i + 1);
      const ds = toDateStr(d);
      const day = plans[ds];
      const filled = day && (day.tasks || []).some(t => t.title.trim());
      const perfect = isPerfectDay(day);
      const done = day ? (day.tasks || []).filter(t => t.done && t.title.trim()).length : 0;
      const total = day ? (day.tasks || []).filter(t => t.title.trim()).length : 0;
      cells.push({ ds, filled, perfect, done, total, month: d.getMonth(), date: d.getDate() });
    }
    return cells;
  };

  const heatmapCells = useMemo(() => buildHeatmap(heatmapYear), [heatmapYear, plans]);
  const heatTotalPerfect = heatmapCells.filter(c => c && c.perfect).length;
  const heatTotalFilled = heatmapCells.filter(c => c && c.filled).length;

  const cellColor = (cell) => {
    if (!cell || !cell.filled) return '#1A1F2E';
    if (cell.perfect) return '#4ADE80';
    if (cell.done === 0) return 'rgba(248,113,113,.25)';
    if (cell.done === cell.total) return 'rgba(74,222,128,.4)';
    return 'rgba(252,211,77,.35)';
  };

  const [tooltip, setTooltip] = useState(null);

  const prev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const next = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  return (
    <div style={S.content}>
      <div style={S.topbar}>
        <div>
          <div style={S.title}>?µê³„</div>
          <div style={S.sub}>{monthLabel(viewYear, viewMonth)}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={prev} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>??/button>
          <button onClick={next} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>??/button>
        </div>
      </div>

      <div style={S.sectionTitle}>?´ë‹¬ ?„ë²½????/div>
      {/* make these cards occupy full content width by removing horizontal margins */}
      <div style={{ ...S.card, margin: "0 0 10px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 42, fontWeight: 900, color: perfectRate >= 80 ? "#4ADE80" : perfectRate >= 50 ? "#FCD34D" : "#F87171", marginBottom: 8 }}>
            {perfectDays}
          </div>
          <div style={{ fontSize: 13, color: "#A8AFCA", marginBottom: 12 }}>
            {filledDays}??ì¤?{perfectDays}???„ë²½??
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
            {perfectRate}% ?„ì„±??
          </div>
        </div>
      </div>

      <div style={S.sectionTitle}>?°ê°„ ?”ë³„ ì§„í–‰??/div>
      {/* remove horizontal margins so grid stretches full width */}
      <div style={{ ...S.card, margin: "0 0 10px", padding: "10px 10px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(50px,1fr))", gap: 6 }}>
          {monthStats.map((m) => (
            <div key={m.month} style={{
              textAlign: "center",
              padding: 12,
              background: "#252B3E",
              borderRadius: 10,
              border: m.month === viewMonth ? "2px solid #6C8EFF" : "1px solid #2D344A",
            }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#A8AFCA", marginBottom: 8 }}>
                {pad2(m.month + 1)}??
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

      <div style={{ ...S.sectionTitle, display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 16 }}>
        <span>?Œ± ?°ê°„ ?”ë””</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setHeatmapYear(y => y - 1)}
            style={{ ...S.btnGhost, width: 32, marginTop: 0, padding: "4px 8px", fontSize: 13 }}>??/button>
          <span style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, alignSelf: "center" }}>{heatmapYear}</span>
          <button onClick={() => setHeatmapYear(y => y + 1)}
            style={{ ...S.btnGhost, width: 32, marginTop: 0, padding: "4px 8px", fontSize: 13 }}>??/button>
        </div>
      </div>
      <div style={{ ...S.card, margin: "0 0 10px", padding: "12px 10px", overflowX: "auto" }}>
        <div style={{ fontSize: 11, color: "#5C6480", marginBottom: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>?„ë²½????<b style={{ color: "#4ADE80" }}>{heatTotalPerfect}</b>??/span>
          <span>ê¸°ë¡????<b style={{ color: "#A8AFCA" }}>{heatTotalFilled}</b>??/span>
        </div>
        {/* ?”ì¼ ?¤ë” */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4, minWidth: 200 }}>
          {["??,"??,"??,"??,"ëª?,"ê¸?,"??].map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 9, color: "#3A4260", fontWeight: 900 }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, minWidth: 200 }}>
          {heatmapCells.map((cell, i) => (
            <div
              key={i}
              title={cell ? `${cell.ds} ${cell.perfect ? "?ŒŸ ?„ë²½" : cell.filled ? `${cell.done}/${cell.total}` : ""}` : ""}
              onClick={() => cell && setTooltip(tooltip?.ds === cell.ds ? null : cell)}
              style={{
                aspectRatio: "1",
                borderRadius: 3,
                background: cellColor(cell),
                cursor: cell && cell.filled ? "pointer" : "default",
                border: tooltip && cell && tooltip.ds === cell.ds ? "1.5px solid #6C8EFF" : "1.5px solid transparent",
                transition: "transform 0.1s",
              }}
            />
          ))}
        </div>
        {tooltip && (
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#252B3E", borderRadius: 8, fontSize: 12, color: "#F0F2F8" }}>
            <b>{formatKoreanDate(tooltip.ds)}</b>
            {tooltip.perfect && <span style={{ color: "#4ADE80", marginLeft: 8 }}>?ŒŸ ?„ë²½????/span>}
            {!tooltip.perfect && tooltip.filled && <span style={{ color: "#FCD34D", marginLeft: 8 }}>{tooltip.done}/{tooltip.total} ?„ë£Œ</span>}
          </div>
        )}
        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", fontSize: 10, color: "#5C6480" }}>
          <span>?ìŒ</span>
          {["#1A1F2E", "rgba(248,113,113,.25)", "rgba(252,211,77,.35)", "rgba(74,222,128,.4)", "#4ADE80"].map((c, i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
          ))}
          <span>?„ë²½</span>
        </div>
      </div>

      <div style={{ height: 12 }} />
    </div>
  );
}

function Settings({ user, setUser, goals, setGoals, notifEnabled, setNotifEnabled,
                    telegramCfg, setTelegramCfg, alarmTimes, setAlarmTimes, toast, setToast,
                    authUser, syncStatus, onGoogleSignIn, onGoogleSignOut }) {
  const [name, setName] = useState(user.name || "");
  const [yearText, setYearText] = useState((goals.year || []).join("\n"));
  const [permission, setPermission] = useState(getPermission());
  const fileInputRef = useRef(null);

  const [tgToken, setTgToken] = useState(telegramCfg.botToken || '');
  const [tgChatId, setTgChatId] = useState(telegramCfg.chatId || '');
  const [finnhubKey, setFinnhubKey] = useState(telegramCfg.finnhubKey || '');
  const [briefingTime, setBriefingTime] = useState(telegramCfg.briefingTime || '07:00');
  const [todoTime, setTodoTime] = useState(telegramCfg.todoTime || '07:05');
  const [selectedAssets, setSelectedAssets] = useState(
    telegramCfg.assets || Object.keys(ASSET_META)
  );
  const [customAssets, setCustomAssets] = useState(telegramCfg.customAssets || []);
  const [assetSearch, setAssetSearch] = useState('');
  const [searchMode, setSearchMode] = useState('stock');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [morningTime, setMorningTime] = useState(alarmTimes.morning || '07:30');
  const [noonTime, setNoonTime] = useState(alarmTimes.noon || '12:00');
  const [eveningTime, setEveningTime] = useState(alarmTimes.evening || '18:00');
  const [nightTime, setNightTime] = useState(alarmTimes.night || '23:00');

  const toggleAsset = (sym) => {
    setSelectedAssets(prev =>
      prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
    );
  };

  const saveTelegram = () => {
    const cfg = {
      botToken: tgToken.trim(), chatId: tgChatId.trim(), finnhubKey: finnhubKey.trim(),
      briefingTime, todoTime, assets: selectedAssets, customAssets,
    };
    setTelegramCfg(cfg);
    store.set('dm_telegram', cfg);
    if (authUser) saveSettings(authUser.uid, { telegram: cfg }).catch(() => {});
    setToast('?”ë ˆê·¸ë¨ ?¤ì • ?€????);
  };

  const doAssetSearch = async (query) => {
    setAssetSearch(query);
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const results = searchMode === 'stock'
      ? await searchFinnhub(finnhubKey.trim(), query)
      : await searchCoinGecko(query);
    setSearchResults(results);
    setSearching(false);
  };

  const addCustomAsset = (asset) => {
    const allSyms = [...Object.keys(ASSET_META), ...customAssets.map(a => a.sym)];
    if (allSyms.includes(asset.sym)) { setToast(`${asset.sym} ?´ë? ?ˆì–´??); return; }
    const next = [...customAssets, asset];
    setCustomAssets(next);
    setSelectedAssets(prev => [...prev, asset.sym]);
    setSearchResults([]);
    setAssetSearch('');
  };

  const removeCustomAsset = (sym) => {
    setCustomAssets(prev => prev.filter(a => a.sym !== sym));
    setSelectedAssets(prev => prev.filter(s => s !== sym));
  };

  const saveAlarmTimes = () => {
    const times = { morning: morningTime, noon: noonTime, evening: eveningTime, night: nightTime };
    setAlarmTimes(times);
    store.set('dm_alarm_times', times);
    if (authUser) saveSettings(authUser.uid, { alarmTimes: times }).catch(() => {});
    setToast('?Œë¦¼ ?œê°„ ?€????);
  };

  const testTelegramMsg = async () => {
    const res = await sendTelegramMessage(tgToken.trim(), tgChatId.trim(), '??<b>DayMate ?°ê²° ?ŒìŠ¤???±ê³µ!</b>\n\n?”ë ˆê·¸ë¨ ?Œë¦¼???•ìƒ ?‘ë™?´ìš”.');
    setToast(res.ok ? '?”ë ˆê·¸ë¨ ?„ì†¡ ?±ê³µ ?? : `?„ì†¡ ?¤íŒ¨: ${res.error} ?š«`);
  };

  const testBriefing = async () => {
    setToast('ë¸Œë¦¬???ì„± ì¤?..');
    const customRegistry = Object.fromEntries(customAssets.map(a => [a.sym, a]));
    const marketData = await fetchMarketData(finnhubKey.trim(), selectedAssets, customRegistry);
    const text = buildBriefingText(marketData, user.name);
    const res = await sendTelegramMessage(tgToken.trim(), tgChatId.trim(), text);
    setToast(res.ok ? 'ë¸Œë¦¬???„ì†¡ ?±ê³µ ?? : `?„ì†¡ ?¤íŒ¨: ${res.error} ?š«`);
  };

  const save = () => {
    const nextUser = { name: (name || "").trim() || "?¬ìš©?? };
    const nextGoals = {
      year: clampList(parseLines(yearText), 5),
      month: goals.month || [],
    };
    setUser(nextUser);
    setGoals(nextGoals);
    store.set("dm_user", nextUser);
    store.set("dm_goals", nextGoals);
    if (authUser) saveSettings(authUser.uid, { name: nextUser.name }).catch(() => {});
    setToast("?€???„ë£Œ ??);
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
    setToast("ë°±ì—… ?Œì¼ ?¤ìš´ë¡œë“œ ??);
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
        alert("ë³µêµ¬ ?„ë£Œ! ?±ì„ ?ˆë¡œê³ ì¹¨?˜ì„¸??");
      } catch {
        alert("?Œì¼ ?•ì‹???¬ë°”ë¥´ì? ?ŠìŠµ?ˆë‹¤.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      <div style={S.topbar}>
        <div>
          <div style={S.title}>?¤ì •</div>
          <div style={S.sub}>?´ë¦„ Â· ëª©í‘œ Â· ?Œë¦¼ Â· ë°±ì—…</div>
        </div>
      </div>

      <div style={S.sectionTitle}>?„ë¡œ??/div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 8 }}>?´ë¦„</div>
        <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
        <button style={S.btn} onClick={save}>?€??/button>
      </div>

      <div style={S.sectionTitle}>ëª©í‘œ</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 8 }}>
          ?‘‘ ?°ê°„ ëª©í‘œ (ìµœë? 5ê°?
        </div>
        <textarea
          rows={5}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={yearText}
          onChange={(e) => setYearText(e.target.value)}
          placeholder="??ì¤„ì— ?˜ë‚˜???…ë ¥"
        />
        <div style={{ fontSize: 11, color: "#5C6480", marginTop: 8, lineHeight: 1.6 }}>
          ?’¡ ?´ë‹¬ ëª©í‘œ?????”ë©´?ì„œ ì§ì ‘ ì¶”ê?/?¸ì§‘?????ˆì–´??
        </div>
        <button style={S.btn} onClick={save}>?€??/button>
      </div>

      <div style={S.sectionTitle}>?Œë¦¼</div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900 }}>?Œë¦¼ ON/OFF</div>
            <div style={{ fontSize: 12, color: "#5C6480", marginTop: 4 }}>
              07:30 / 12:00 / 18:00 / 22:00 (??´ ?´ë ¤ ?ˆì„ ???™ì‘)
            </div>
            {permission === "denied" && (
              <div style={{ fontSize: 12, color: "#F87171", marginTop: 6 }}>
                ë¸Œë¼?°ì? ?Œë¦¼??ì°¨ë‹¨?˜ì–´ ?ˆì–´?? (?¬ì´???¤ì •?ì„œ ?ˆìš©)
              </div>
            )}
            {permission === "default" && (
              <div style={{ fontSize: 12, color: "#FCD34D", marginTop: 6 }}>
                ?Œë¦¼ ê¶Œí•œ??ë¨¼ì? ?ˆìš©?´ì•¼ ?´ìš”.
              </div>
            )}
            {permission === "unsupported" && (
              <div style={{ fontSize: 12, color: "#F87171", marginTop: 6 }}>
                ??ë¸Œë¼?°ì????Œë¦¼??ì§€?í•˜ì§€ ?Šì•„??
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
              setToast(next ? "?Œë¦¼ ON ?? : "?Œë¦¼ OFF");
              // scheduler ?ìš©?€ App?ì„œ ì²˜ë¦¬
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



        <button
          style={S.btnGhost}
          onClick={async () => {
            if (permission === "granted") {
              sendNotification("DayMate Lite", "?ŒìŠ¤???Œë¦¼?…ë‹ˆ?? ??, "?””");
              setToast("?ŒìŠ¤???Œë¦¼ ë°œì†¡ ??);
            } else if (permission === "denied") {
              setToast("?Œë¦¼??ì°¨ë‹¨????ë¸Œë¼?°ì? ?¤ì • ???Œë¦¼ ???ˆìš©?¼ë¡œ ë³€ê²½í•´ì£¼ì„¸??);
            } else {
              const r = await requestPermission();
              setPermission(r);
              if (r === "granted") {
                setNotifEnabled(true);
                sendNotification("DayMate Lite", "?Œë¦¼???œì„±?”ë?´ìš”! ??, "?””");
                setToast("?Œë¦¼ ê¶Œí•œ ?ˆìš©????);
              } else {
                setToast("?Œë¦¼ ê¶Œí•œ ê±°ë?????ë¸Œë¼?°ì? ?¤ì •?ì„œ ?ˆìš©?´ì£¼?¸ìš”");
              }
            }
          }}
        >
          ?”” ?Œë¦¼ ê¶Œí•œ ?ˆìš© / ?ŒìŠ¤??
        </button>
      </div>

      <div style={S.sectionTitle}>?Œë¦¼ ?œê°„ ?¤ì •</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "#A8AFCA", lineHeight: 1.7, marginBottom: 12 }}>
          ?„ì¹¨Â·?ì‹¬Â·?€?Â·ë°¤ ?Œë¦¼ ?œê°„??ì¡°ì •?????ˆì–´??
        </div>
        {[
          { label: "?„ì¹¨ ê¸°ìƒ ?ŒëŒ", value: morningTime, set: setMorningTime },
          { label: "?ì‹¬ ì²´í¬??, value: noonTime, set: setNoonTime },
          { label: "?€??ì²´í¬??, value: eveningTime, set: setEveningTime },
          { label: "ë°?ë§ˆê° ?ŒëŒ", value: nightTime, set: setNightTime },
        ].map(({ label, value, set }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ flex: 1, fontSize: 13, color: "#F0F2F8", fontWeight: 800 }}>{label}</div>
            <input
              type="time"
              value={value}
              onChange={(e) => set(e.target.value)}
              style={{ ...S.input, width: 110, padding: "8px 10px", marginBottom: 0 }}
            />
          </div>
        ))}
        <button style={S.btn} onClick={saveAlarmTimes}>?Œë¦¼ ?œê°„ ?€??/button>
      </div>

      <div style={S.sectionTitle}>?”ë ˆê·¸ë¨ ?ë™??/div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 6 }}>ë´?? í° (Bot Token)</div>
        <input style={S.input} value={tgToken} onChange={(e) => setTgToken(e.target.value)} placeholder="123456789:ABCdef..." type="password" />

        <div style={{ height: 10 }} />
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 6 }}>ì±„íŒ… ID (Chat ID)</div>
        <input style={S.input} value={tgChatId} onChange={(e) => setTgChatId(e.target.value)} placeholder="123456789" />

        <div style={{ height: 10 }} />
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 4 }}>
          Finnhub API Key <span style={{ color: "#5C6480", fontWeight: 400 }}>(ì£¼ì‹ ?°ì´?°ìš©)</span>
        </div>
        <input style={S.input} value={finnhubKey} onChange={(e) => setFinnhubKey(e.target.value)} placeholder="API Key ?…ë ¥" type="password" />

        <div style={{ height: 14 }} />
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 10 }}>?Œë¦¼ ?œê°„</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "#5C6480", marginBottom: 4 }}>?ì‚° ë¸Œë¦¬??/div>
            <input style={S.input} type="time" value={briefingTime} onChange={(e) => setBriefingTime(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#5C6480", marginBottom: 4 }}>? ì¼ ?Œë¦¼</div>
            <input style={S.input} type="time" value={todoTime} onChange={(e) => setTodoTime(e.target.value)} />
          </div>
        </div>

        <div style={{ height: 14 }} />
        <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 10 }}>ë¸Œë¦¬???ì‚° ? íƒ</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(ASSET_META).map(([sym, meta]) => {
            const on = selectedAssets.includes(sym);
            return (
              <button
                key={sym}
                onClick={() => toggleAsset(sym)}
                style={{
                  padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  background: on ? "#4B6FFF" : "#1E2235",
                  color: on ? "#fff" : "#5C6480",
                }}
              >
                {sym} <span style={{ fontWeight: 400 }}>{meta.label}</span>
              </button>
            );
          })}
        </div>

        {customAssets.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {customAssets.map(a => (
              <div key={a.sym} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: selectedAssets.includes(a.sym) ? "#4B6FFF" : "#1E2235",
                color: selectedAssets.includes(a.sym) ? "#fff" : "#5C6480",
              }}>
                <span onClick={() => toggleAsset(a.sym)} style={{ cursor: "pointer" }}>
                  {a.sym} <span style={{ fontWeight: 400 }}>{a.label}</span>
                </span>
                <span
                  onClick={() => removeCustomAsset(a.sym)}
                  style={{ cursor: "pointer", color: "#F87171", fontWeight: 900, marginLeft: 2 }}
                >Ã—</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 8 }}>?ì‚° ê²€??ì¶”ê?</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {['stock', 'crypto'].map(mode => (
              <button
                key={mode}
                onClick={() => { setSearchMode(mode); setSearchResults([]); setAssetSearch(''); }}
                style={{
                  padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  background: searchMode === mode ? "#4B6FFF" : "#1E2235",
                  color: searchMode === mode ? "#fff" : "#5C6480",
                }}
              >{mode === 'stock' ? 'ì£¼ì‹/ETF' : 'ì½”ì¸'}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...S.input, flex: 1, marginBottom: 0 }}
              placeholder={searchMode === 'stock' ? 'AAPL, NVDA, SPY...' : 'SOL, XRP, DOGE...'}
              value={assetSearch}
              onChange={e => doAssetSearch(e.target.value)}
            />
            {searching && <span style={{ color: "#A8AFCA", fontSize: 12, alignSelf: "center" }}>ê²€??ì¤?..</span>}
          </div>
          {searchResults.length > 0 && (
            <div style={{
              marginTop: 8, background: "#131720", border: "1px solid #2D344A",
              borderRadius: 10, overflow: "hidden",
            }}>
              {searchResults.map(item => (
                <div
                  key={item.sym + item.src}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", borderBottom: "1px solid #1E2336", cursor: "pointer",
                  }}
                  onClick={() => addCustomAsset(item)}
                >
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#F0F2F8" }}>{item.sym}</span>
                    <span style={{ fontSize: 12, color: "#A8AFCA", marginLeft: 8 }}>{item.label}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "#4B6FFF", fontWeight: 700 }}>+ ì¶”ê?</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 14 }} />
        <button style={S.btn} onClick={saveTelegram}>?€??/button>
        <button style={S.btnGhost} onClick={testTelegramMsg}>?°ê²° ?ŒìŠ¤??/button>
        <button style={S.btnGhost} onClick={testBriefing}>?ì‚° ë¸Œë¦¬???ŒìŠ¤???„ì†¡</button>

        <div style={{ fontSize: 11, color: "#5C6480", marginTop: 10, lineHeight: 1.7 }}>
          ? ï¸ ??´ ?´ë ¤ ?ˆì„ ?Œë§Œ ?™ì‘?´ìš”.
        </div>
      </div>

      <div style={S.sectionTitle}>ë°±ì—…</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "#A8AFCA", lineHeight: 1.7 }}>
          ???????°ì´?°ëŠ” ê°?ê¸°ê¸° ë¸Œë¼?°ì????€?¥ë©?ˆë‹¤.<br />
          ??JSON?¼ë¡œ ë°±ì—…?˜ë©´ ?¤ë¥¸ ê¸°ê¸°?ì„œ ë³µêµ¬?????ˆì–´??
        </div>

        <button style={S.btn} onClick={exportData}>
          ?“¦ ?°ì´???´ë³´?´ê¸° (ë°±ì—…)
        </button>

        <button
          style={S.btnGhost}
          onClick={() => fileInputRef.current?.click()}
        >
          ?“¥ ?°ì´??ê°€?¸ì˜¤ê¸?(ë³µêµ¬)
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
            if (!window.confirm("ëª¨ë“  ?°ì´?°ë? ?? œ? ê¹Œ??")) return;
            if (!window.confirm("?•ë§ ?? œ?˜ì‹œê² ì–´?? (ë³µêµ¬ ë¶ˆê?)")) return;
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
          ?—‘ï¸?ëª¨ë“  ?°ì´???? œ
        </button>
      </div>

      <div style={S.sectionTitle}>ê³„ì • ?™ê¸°??/div>
      <div style={S.card}>
        {authUser ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              {authUser.photoURL && (
                <img src={authUser.photoURL} alt="" style={{ width: 40, height: 40, borderRadius: "50%" }} />
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{authUser.displayName}</div>
                <div style={{ fontSize: 12, color: "#A8AFCA" }}>{authUser.email}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: syncStatus === 'synced' ? '#4ade80' : '#A8AFCA', marginBottom: 12 }}>
              {syncStatus === 'syncing' ? '?™ê¸°??ì¤?..' : syncStatus === 'synced' ? '???™ê¸°???„ë£Œ' : '?€ê¸?ì¤?}
            </div>
            <button style={S.btnGhost} onClick={() => onGoogleSignOut().catch(() => {})}>ë¡œê·¸?„ì›ƒ</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: "#A8AFCA", lineHeight: 1.7, marginBottom: 12 }}>
              Google ê³„ì •?¼ë¡œ ë¡œê·¸?¸í•˜ë©??°ìŠ¤?¬íƒ‘?”ëª¨ë°”ì¼ ?°ì´?°ê? ?ë™?¼ë¡œ ?™ê¸°?”ë¼??
            </div>
            <button
              style={{ ...S.btn, background: "#fff", color: "#333", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              onClick={() => onGoogleSignIn().catch(() => {})}
            >
              <span style={{ fontSize: 16 }}>G</span> Googleë¡?ë¡œê·¸??
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: "16px 18px", textAlign: "center", color: "#5C6480", fontSize: 12 }}>
        DayMate Lite v10 Â· 2026-03-08
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

  // no width limit - let container fill viewport
  const phoneStyleOverride = { maxWidth: '100%' };

  const [authUser, setAuthUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle'|'syncing'|'synced'
  const syncReadyRef = useRef(false); // Firestore ?°ê¸° ?ˆìš© ?Œë˜ê·?(ì´ˆê¸° ë¡œë“œ ?„ë£Œ ??true)

  const [user, setUser] = useState(() => store.get("dm_user", { name: "?¬ìš©?? }));
  const [goals, setGoals] = useState(() => store.get("dm_goals", { year: [], month: [] }));
  const [notifEnabled, setNotifEnabled] = useState(() => store.get("dm_notif_enabled", false));
  const [telegramCfg, setTelegramCfg] = useState(() => {
    const saved = store.get("dm_telegram", {});
    return {
      botToken: "", chatId: "", finnhubKey: "",
      briefingTime: "07:00", todoTime: "07:05",
      assets: ["BTC", "ETH", "TSLA", "GOOGL", "IVR", "QQQ"],
      ...saved,
    };
  });
  const [alarmTimes, setAlarmTimes] = useState(() =>
    store.get("dm_alarm_times", { morning: "07:30", noon: "12:00", evening: "18:00", night: "23:00" })
  );

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
      try {
        const remote = await loadAllFromFirestore(firebaseUser.uid);
        const hasRemote = remote.settings || remote.goals || Object.keys(remote.days).length > 0;

        if (hasRemote) {
          // Firestore ?°ì´?°ë? ë¡œì»¬ë¡???–´?°ê¸°
          if (remote.settings) {
            const s = remote.settings;
            if (s.name) { setUser({ name: s.name }); store.set("dm_user", { name: s.name }); }
            if (s.notifEnabled !== undefined) { setNotifEnabled(s.notifEnabled); store.set("dm_notif_enabled", s.notifEnabled); }
            if (s.alarmTimes) { setAlarmTimes(s.alarmTimes); store.set("dm_alarm_times", s.alarmTimes); }
            if (s.telegram) { setTelegramCfg(s.telegram); store.set("dm_telegram", s.telegram); }
          }
          if (remote.goals) { setGoals(remote.goals); store.set("dm_goals", remote.goals); }
          if (Object.keys(remote.days).length > 0) {
            const merged = { ...remote.days };
            Object.entries(remote.days).forEach(([ds, d]) => { saveDay(ds, d); });
            setPlans(merged);
          }
        } else {
          // ìµœì´ˆ ë¡œê·¸?? ë¡œì»¬ ?°ì´?°ë? Firestoreë¡??…ë¡œ??
          const localDays = {};
          listAllDays().forEach((ds) => { const d = loadDay(ds); if (d) localDays[ds] = d; });
          await uploadLocalToFirestore(firebaseUser.uid, {
            settings: {
              name: user.name,
              notifEnabled,
              alarmTimes,
              telegram: telegramCfg,
            },
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

  // Persist user/goals when updated elsewhere
  useEffect(() => {
    store.set("dm_user", user);
    if (authUser && syncReadyRef.current) saveSettings(authUser.uid, { name: user.name }).catch(() => {});
  }, [user, authUser]);
  useEffect(() => {
    store.set("dm_goals", goals);
    if (authUser && syncReadyRef.current) saveGoals(authUser.uid, goals).catch(() => {});
  }, [goals, authUser]);

  // Persist notifEnabled
  useEffect(() => {
    store.set("dm_notif_enabled", notifEnabled);
  }, [notifEnabled]);

  // Apply notifications (GUARDED)
  useEffect(() => {
    scheduler.apply(notifEnabled, user.name || "?¬ìš©??, telegramCfg, alarmTimes);
    return () => scheduler.cancelAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifEnabled, user.name, telegramCfg, alarmTimes]);

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
      if (authUser && syncReadyRef.current) fsaveDay(authUser.uid, todayStr, nextDay).catch(() => {});
      return next;
    });
  };

  const openDetail = (ds) => {
    setOpenDate(ds);
    setScreen("detail");
    window.history.replaceState(null,'',`?screen=detail&date=${ds}`);
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
    setTodayData(prev => ({ ...prev, tasks }));
  };

  const onSaveMonthGoals = (monthGoals) => {
    const nextGoals = { ...goals, month: monthGoals };
    setGoals(nextGoals);
    store.set("dm_goals", nextGoals);
    if (authUser && syncReadyRef.current) saveGoals(authUser.uid, nextGoals).catch(() => {});
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
            }}>??/div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>DayMate Lite</div>
            <div style={{ fontSize: 13, color: "#A8AFCA", lineHeight: 1.7, marginTop: 10 }}>
              ë§¤ì¼ ?œí•  ??3ê°€ì§€?ë§Œ ?•í•˜ê³?br/>ì²´í¬?˜ê³ , ?¼ê¸° ??ì¤„ë¡œ ë§ˆë¬´ë¦?
            </div>
          </div>

          <div style={S.card}>
            <div style={{ fontSize: 12, color: "#A8AFCA", fontWeight: 900, marginBottom: 8 }}>?´ë¦„</div>
            <input
              style={S.input}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="?? ê³„ìŠ¹"
              maxLength={20}
            />
            <button
              style={S.btn}
              onClick={() => {
                const nm = (nameInput || "").trim() || "?¬ìš©??;
                setUser({ name: nm });
                store.set("dm_user", { name: nm });
                store.set("dm_first_run_done", true);
                setFirstRunDone(true);
                setToast("?œì‘?©ë‹ˆ????);
              }}
            >
              ?œì‘?˜ê¸° ??
            </button>
          </div>

          <div style={{ padding: "0 22px", color: "#5C6480", fontSize: 12, lineHeight: 1.7 }}>
            ???°ì´?°ëŠ” ê¸°ê¸° ë¸Œë¼?°ì????€?¥ë©?ˆë‹¤<br/>
            ??ë°±ì—…?€ ?¤ì •?ì„œ JSON?¼ë¡œ ?´ë³´?´ê¸° ê°€??
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
          onToggleTask={(id) => setTodayData(prev => ({
            ...prev,
            tasks: prev.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t),
          }))}
          goalChecks={goalChecks}
          onToggleGoal={onToggleGoal}
          onSetTodayTasks={onSetTodayTasks}
          onSaveMonthGoals={onSaveMonthGoals}
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
                ??
              </button>
              <div style={{ flex: 1 }}>
                <div style={S.title}>ê¸°ë¡</div>
                <div style={S.sub}>?°ì´???†ìŒ</div>
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
          setData={setDetailData}
          onBack={() => changeScreen("history")}
          toast={toast}
          setToast={setToast}
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
          telegramCfg={telegramCfg}
          setTelegramCfg={setTelegramCfg}
          alarmTimes={alarmTimes}
          setAlarmTimes={setAlarmTimes}
          toast={toast}
          setToast={setToast}
          authUser={authUser}
          syncStatus={syncStatus}
          onGoogleSignIn={googleSignIn}
          onGoogleSignOut={googleSignOut}
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
