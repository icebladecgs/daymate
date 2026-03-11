import { useEffect, useMemo, useRef, useState } from "react";
import { onAuth, googleSignIn, googleSignOut, saveSettings, saveGoals, saveDay as fsaveDay, loadAllFromFirestore, uploadLocalToFirestore, googleSignInWithCalendarScope } from "./firebase.js";

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

// 현재 주 월~일 날짜 배열 반환
const getWeekDates = () => {
  const today = new Date();
  const day = today.getDay(); // 0=일
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diffToMon);
  return Array(7).fill(null).map((_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return toDateStr(d);
  });
};

// ---------- Google Calendar API ----------
async function gcalCreateEvent(token, dateStr, task) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const endDate = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: task.title,
      start: { date: dateStr },
      end: { date: endDate },
      extendedProperties: { private: { daymateId: task.id } },
    }),
  });
  if (!res.ok) throw new Error(`gcal ${res.status}`);
  return (await res.json()).id;
}

async function gcalDeleteEvent(token, eventId) {
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function gcalFetchTodayEvents(token, dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const nextDate = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(dateStr + 'T00:00:00Z')}&timeMax=${encodeURIComponent(nextDate + 'T00:00:00Z')}&singleEvents=true&orderBy=startTime`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`gcal fetch ${res.status}`);
  return (await res.json()).items || [];
}

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

// ---------- Telegram helpers ----------
async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken || !chatId) return { ok: false, error: '토큰 또는 챗 ID가 비어 있어요' };
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
    return { ok: false, error: e.message || '네트워크 오류' };
  }
}

const ASSET_META = {
  BTC:  { label: '비트코인',     src: 'coingecko' },
  ETH:  { label: '이더리움',     src: 'coingecko' },
  TSLA: { label: '테슬라',       src: 'finnhub' },
  GOOGL:{ label: '구글',         src: 'finnhub' },
  IVR:  { label: 'IVR',          src: 'finnhub' },
  QQQ:  { label: '나스닥100(QQQ)', src: 'finnhub' },
};

async function fetchMarketData(finnhubKey, assets = Object.keys(ASSET_META), customRegistry = {}) {
  const data = {};
  const registry = { ...ASSET_META, ...customRegistry }; // 통합 레지스트리

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

function buildBriefingText(marketData, userName, weather = null) {
  const today = new Date();
  const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;
  let text = `📊 <b>${userName}님의 아침 자산 브리핑</b> (${dateStr})\n`;
  if (weather) {
    const icon = weather.icon || '☀️';
    const temp = weather.temp != null ? `${Math.round(weather.temp)}°C` : '';
    const desc = weather.description || '';
    const wind = weather.wind != null ? ` · 바람 ${weather.wind}km/h` : '';
    text = `${icon} ${weather.city || '서울'} ${temp} · ${desc}${wind}\n` + text;
  }
  text += `━━━━━━━━━━━━━━━\n`;

  const fmtPrice = (n, currency = 'USD') => {
    if (n == null) return 'N/A';
    if (currency === 'KRW') return Number(n).toLocaleString('ko-KR') + '원';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const fmtChg = (chgPct, change, currency = 'USD') => {
    if (chgPct == null) return '';
    const arrow = chgPct >= 0 ? '▲' : '▼';
    const pct = `${chgPct >= 0 ? '+' : ''}${Number(chgPct).toFixed(2)}%`;
    if (change != null) {
      const sign = change >= 0 ? '+' : '-';
      const absChange = Math.abs(Number(change));
      const chgStr = currency === 'KRW'
        ? ` (${sign}${absChange.toLocaleString('ko-KR')}원)`
        : ` (${sign}$${absChange.toFixed(2)})`;
      return ` ${arrow} ${pct}${chgStr}`;
    }
    return ` ${arrow} ${pct}`;
  };

  // crypto (src='coingecko') 먼저
  const cryptoSyms = Object.keys(marketData).filter(s => marketData[s].src === 'coingecko');
  for (const sym of cryptoSyms) {
    const d = marketData[sym];
    const icon = sym === 'BTC' ? '₿' : sym === 'ETH' ? 'Ξ' : '🪙';
    text += `${icon} <b>${d.label}</b>: ${fmtPrice(d.price)}${fmtChg(d.chgPct)}\n`;
  }

  // 해외주식 (src='finnhub')
  const stockSyms = Object.keys(marketData).filter(s => marketData[s].src === 'finnhub');
  if (stockSyms.length > 0) {
    text += `━━━━━━━━━━━━━━━\n`;
    for (const sym of stockSyms) {
      const d = marketData[sym];
      text += `📈 <b>${d.label}</b>: ${fmtPrice(d.price)}${fmtChg(d.chgPct, d.change)}\n`;
    }
  }

  // 국내주식 (src='yahoo')
  const krSyms = Object.keys(marketData).filter(s => marketData[s].src === 'yahoo');
  if (krSyms.length > 0) {
    text += `━━━━━━━━━━━━━━━\n`;
    for (const sym of krSyms) {
      const d = marketData[sym];
      text += `🇰🇷 <b>${d.label}</b>: ${fmtPrice(d.price, d.currency)}${fmtChg(d.chgPct, d.change, d.currency)}\n`;
    }
  }

  text += `━━━━━━━━━━━━━━━\n좋은 하루 되세요! 🌅`;
  return text;
}

async function fetchMarketDataFromServer(assets, customRegistry = {}) {
  try {
    const r = await fetch('/api/market', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assets, customRegistry }),
    });
    if (!r.ok) return {};
    return await r.json();
  } catch { return {}; }
}

async function searchFinnhub(_key, query) {
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const j = await r.json();
    return (j.result || [])
      .filter(item => item.type === 'Common Stock' || item.type === 'ETP')
      .slice(0, 6)
      .map(item => ({ sym: item.symbol, label: item.description, src: 'finnhub' }));
  } catch { return []; }
}

async function searchKoreanStock(query) {
  try {
    const r = await fetch(`/api/ksearch?q=${encodeURIComponent(query)}`);
    const j = await r.json();
    return j.result || [];
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

  schedule(id, timeStr, title, body, iconEmoji = "🔔", onFire = null) {
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

    const { botToken = '', chatId = '', briefingTime = '07:00', todoTime = '07:05', assets, customAssets: rawCustomAssets } = telegramCfg;
    const selectedAssets = assets && assets.length > 0 ? assets : Object.keys(ASSET_META);
    const customAssetsArr = rawCustomAssets || [];
    const customRegistry = Object.fromEntries(customAssetsArr.map(a => [a.sym, a]));
    const morningTime = alarmTimes.morning || '07:30';
    const noonTime = alarmTimes.noon || '12:00';
    const eveningTime = alarmTimes.evening || '18:00';
    const nightTime = alarmTimes.night || '23:00';
    const hasTg = !!(botToken && chatId);

    // 자산 브리핑 (Telegram)
    if (hasTg) {
      this.schedule(
        'tg_market', briefingTime,
        'DayMate 📊', '아침 자산 브리핑을 텔레그램으로 전송 중...',
        '📊',
        async () => {
          const weatherRes = await fetch(`/api/weather?city=${encodeURIComponent(telegramCfg.weatherCity || 'Seoul')}`).then(r => r.json()).catch(() => null);
          const weather = weatherRes?.ok ? weatherRes : null;
          const marketData = await fetchMarketDataFromServer(selectedAssets, customRegistry);
          const text = buildBriefingText(marketData, userName, weather);
          await sendTelegramMessage(botToken, chatId, text);
        }
      );

      // 할일 알림 (Telegram)
      this.schedule(
        'tg_todo', todoTime,
        'DayMate ✅', '오늘 할 일을 텔레그램으로 전송',
        '✅',
        async () => {
          const today = toDateStr();
          const todayDayData = store.get(dayKey(today));
          const tasks = (todayDayData?.tasks || []).filter(t => t.title.trim());
          let text = `✅ <b>${userName}님, 오늘 할 일!</b>\n\n`;
          if (tasks.length > 0) {
            tasks.forEach((t, i) => { text += `${i + 1}. ${t.title}\n`; });
            text += `\n총 ${tasks.length}개 예정 · 화이팅! 💪`;
          } else {
            text += `아직 오늘 할 일을 입력하지 않았어요.\nDayMate에서 입력해주세요 📝`;
          }
          await sendTelegramMessage(botToken, chatId, text);
        }
      );
    }

    // 브라우저 알림 (권한 필요)
    if (getPermission() !== "granted") return;

    this.schedule(
      'm_morning', morningTime,
      'DayMate 🌅', `${userName}님, 좋은 아침! 오늘 할 일을 정해볼까요?`, '🌅',
      hasTg ? async () => {
        const d = store.get(dayKey(toDateStr()));
        const tasks = (d?.tasks || []).filter(t => t.title.trim());
        let text = `🌅 <b>${userName}님, 좋은 아침이에요!</b>\n\n`;
        if (tasks.length > 0) {
          text += `📋 오늘의 할일\n`;
          tasks.forEach((t, i) => { text += `  ${i + 1}. ${t.title}\n`; });
        } else {
          text += `오늘 할 일을 아직 입력하지 않았어요.\nDayMate에서 하루를 계획해보세요 📝`;
        }
        text += `\n\n<a href="https://daymate-beta.vercel.app">📱 DayMate 열기</a>`;
        await sendTelegramMessage(botToken, chatId, text);
      } : null
    );

    this.schedule(
      'm_noon', noonTime,
      'DayMate 🕛', `${userName}님, 점심 체크인!`, '🕛',
      hasTg ? async () => {
        const d = store.get(dayKey(toDateStr()));
        const tasks = d?.tasks || [];
        const done = tasks.filter(t => t.done && t.title.trim()).length;
        const total = tasks.filter(t => t.title.trim()).length;
        await sendTelegramMessage(botToken, chatId,
          `🕛 <b>${userName}님 점심 체크인!</b>\n\n✅ 완료: ${done}/${total}\n\n오후도 화이팅! 💪`
        );
      } : null
    );

    this.schedule(
      'm_eve', eveningTime,
      'DayMate 🌆', `${userName}님, 저녁 체크인!`, '🌆',
      hasTg ? async () => {
        const d = store.get(dayKey(toDateStr()));
        const tasks = d?.tasks || [];
        const done = tasks.filter(t => t.done && t.title.trim()).length;
        const total = tasks.filter(t => t.title.trim()).length;
        await sendTelegramMessage(botToken, chatId,
          `🌆 <b>${userName}님 저녁 체크인!</b>\n\n✅ 완료: ${done}/${total}\n\n마무리 잘 해요! 🎯`
        );
      } : null
    );

    this.schedule(
      'm_night', nightTime,
      'DayMate 🌙', `${userName}님, 마지막 체크 + 일기 작성하고 마무리해요.`, '🌙',
      hasTg ? async () => {
        const d = store.get(dayKey(toDateStr()));
        const tasks = d?.tasks || [];
        const done = tasks.filter(t => t.done && t.title.trim()).length;
        const total = tasks.filter(t => t.title.trim()).length;
        const hasJournal = !!d?.journal?.body?.trim();
        let text = `🌙 <b>${userName}님, 하루 마무리할 시간이에요!</b>\n\n`;
        text += `✅ 완료: ${done}/${total}\n`;
        text += hasJournal ? `📖 일기: 작성 완료 ✓\n` : `📖 일기: 아직 작성 전 ✏️\n`;
        text += `\n오늘도 수고했어요! 🌟`;
        const isWeeklyReview = new Date().getDay() === 0; // 일요일
        if (isWeeklyReview) {
          text += `\n\n📝 <b>이번 주 회고</b>\n이번 주 잘한 점 하나와 다음 주 목표를 DayMate에 기록해보세요!`;
        }
        await sendTelegramMessage(botToken, chatId, text);
      } : null
    );
  }
}
const scheduler = new NotifScheduler();

// ---------- Styles ----------
const S = {
  app: {
    background: "var(--dm-bg)",
    color: "var(--dm-text)",
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
    background: "var(--dm-phone)",
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
    borderBottom: "1px solid var(--dm-border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: 900 },
  sub: { fontSize: 12, color: "var(--dm-sub)", marginTop: 2 },
  card: {
    background: "var(--dm-card)",
    border: "1px solid var(--dm-border)",
    borderRadius: 14,
    padding: "14px 14px",
    margin: "0 16px 10px",
    boxSizing: "border-box",
  },
  sectionTitle: {
    padding: "18px 16px 8px",
    fontSize: 14,
    letterSpacing: "0.02em",
    color: "var(--dm-text)",
    fontWeight: 900,
    textTransform: "none",
  },
  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 10,
    background: "var(--dm-input)",
    border: "1.5px solid var(--dm-border)",
    color: "var(--dm-text)",
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
    border: "1.5px solid var(--dm-border2)",
    background: "transparent",
    color: "var(--dm-sub)",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  pill: (on) => ({
    padding: "7px 12px",
    borderRadius: 999,
    border: `1.5px solid ${on ? "#6C8EFF" : "var(--dm-border)"}`,
    background: on ? "rgba(108,142,255,.12)" : "var(--dm-pill-off)",
    color: on ? "#6C8EFF" : "var(--dm-sub)",
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
    background: "var(--dm-nav)",
    borderTop: "1px solid var(--dm-border)",
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
    color: active ? "#6C8EFF" : "var(--dm-muted)",
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
    background: "var(--dm-toast-bg)",
    border: "1px solid var(--dm-toast-bd)",
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
// ---------- WeeklySchedule ----------
const DOW_KR = ['월', '화', '수', '목', '금', '토', '일'];

function WeeklySchedule({ plans, habits, onOpenDate }) {
  const today = toDateStr();
  const weekDates = getWeekDates();

  return (
    <div>
      {weekDates.map((ds, i) => {
        const d = plans[ds];
        const tasks = (d?.tasks || []).filter(t => t.title.trim());
        const done = tasks.filter(t => t.done).length;
        const isToday = ds === today;
        const isFuture = ds > today;
        const dateObj = new Date(ds + 'T00:00:00');
        const habitChecks = d?.habitChecks || {};
        const habitDone = (habits || []).filter(h => habitChecks[h.id]).length;
        const hasHabits = (habits || []).length > 0;
        const allDone = tasks.length > 0 && done === tasks.length;

        return (
          <div key={ds} onClick={() => onOpenDate(ds)}
            style={{
              ...S.card,
              border: isToday
                ? '1.5px solid #6C8EFF'
                : allDone ? '1.5px solid rgba(74,222,128,.4)' : '1px solid var(--dm-border)',
              background: isToday ? 'rgba(108,142,255,.06)' : 'var(--dm-card)',
              cursor: 'pointer', marginBottom: 8,
            }}>
            {/* 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tasks.length > 0 ? 10 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 13, fontWeight: 900, width: 22,
                  color: isToday ? '#6C8EFF' : isFuture ? 'var(--dm-text)' : 'var(--dm-muted)',
                }}>{DOW_KR[i]}</span>
                <span style={{ fontSize: 12, color: 'var(--dm-sub)' }}>
                  {dateObj.getMonth() + 1}/{dateObj.getDate()}
                </span>
                {isToday && (
                  <span style={{ fontSize: 10, color: '#6C8EFF', fontWeight: 900,
                    background: 'rgba(108,142,255,.15)', borderRadius: 999, padding: '2px 7px' }}>오늘</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {hasHabits && d && (
                  <span style={{ fontSize: 11, color: habitDone === (habits||[]).length ? '#A78BFA' : 'var(--dm-muted)', fontWeight: 700 }}>
                    🎯{habitDone}/{(habits||[]).length}
                  </span>
                )}
                {tasks.length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 900,
                    color: allDone ? '#4ADE80' : 'var(--dm-muted)' }}>
                    {allDone ? '✓ 완료' : `${done}/${tasks.length}`}
                  </span>
                )}
              </div>
            </div>

            {/* 할일 목록 */}
            {tasks.length > 0 ? (
              <div>
                {[...tasks].sort((a,b) => (b.priority?1:0)-(a.priority?1:0)).slice(0, 4).map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                      background: t.done ? '#4B6FFF' : 'transparent',
                      border: t.done ? 'none' : '1.5px solid #3A4260',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {t.done && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>}
                    </div>
                    <span style={{
                      fontSize: 13, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      color: t.done ? 'var(--dm-muted)' : 'var(--dm-text)',
                      textDecoration: t.done ? 'line-through' : 'none',
                    }}>{t.priority ? '⭐ ' : ''}{t.title}</span>
                  </div>
                ))}
                {tasks.length > 4 && (
                  <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 2 }}>+{tasks.length - 4}개 더</div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--dm-muted)' }}>
                {isFuture || isToday ? '탭해서 할 일 추가 →' : '기록 없음'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
    { id: "today", icon: "📖", label: "일기" },
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
    { id: "t1", title: "", done: false, checkedAt: null, priority: false },
    { id: "t2", title: "", done: false, checkedAt: null, priority: false },
    { id: "t3", title: "", done: false, checkedAt: null, priority: false },
  ],
  checks: { "07:30": false, "12:00": false, "18:00": false, "22:00": false },
  journal: { body: "", savedAt: null },
  memo: "",
  habitChecks: {},
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
  return filledTasks >= 3 && doneTasks === filledTasks && hasJournal;
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
      rate: filledTasks === 0 ? 0 : Math.min(100, Math.round((doneTasks / filledTasks) * 100)),
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
function Home({ user, goals, todayData, plans, onToggleTask, goalChecks, onToggleGoal, onSetTodayTasks, onSaveMonthGoals, habits, onToggleHabit, onOpenDate, onOpenDateMemo }) {
  const today = toDateStr();
  const doneCount = (todayData?.tasks || []).filter((t) => t.done && t.title.trim())
    .length;
  const filledCount = (todayData?.tasks || []).filter((t) => t.title.trim()).length;
  const allDone = filledCount > 0 && doneCount === filledCount;

  const streak = useMemo(() => calcStreak(plans), [plans]);
  const goalProgress = useMemo(() => calcGoalProgress(plans), [plans]);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 언젠가 할일
  const [someday, setSomeday] = useState(() => store.get("dm_someday") || []);
  const [somedayInput, setSomedayInput] = useState("");
  const saveSomeday = (next) => { setSomeday(next); store.set("dm_someday", next); };
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

  const [editingTasks, setEditingTasks] = useState(false);
  const [draftTasks, setDraftTasks] = useState([]);
  const [editingGoals, setEditingGoals] = useState(false);
  const [draftGoals, setDraftGoals] = useState([]);
  const [newGoalInput, setNewGoalInput] = useState('');
  const [prevAllDone, setPrevAllDone] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (allDone && !prevAllDone) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2500);
    }
    setPrevAllDone(allDone);
  }, [allDone]);

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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => onOpenDateMemo(today)} style={{
            background: "var(--dm-card)", border: "1.5px solid var(--dm-border)",
            borderRadius: 10, padding: "6px 12px", cursor: "pointer",
            fontSize: 13, color: "var(--dm-text)", fontWeight: 700,
            display: "flex", alignItems: "center", gap: 5,
          }}>📝 <span style={{ fontSize: 12 }}>메모</span></button>
          <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 800 }}>
            {getPermission() === "granted" ? "🔔" : "🔕"}
          </div>
        </div>
      </div>

      <div style={{ ...S.sectionTitle, display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 16 }}>
        <span>✅ 오늘 할일</span>
        <button onClick={editingTasks ? saveTaskEdits : startEditTasks}
          style={{ fontSize: 11, fontWeight: 900, color: editingTasks ? "#4ADE80" : "var(--dm-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}>
          {editingTasks ? "완료 ✓" : "✏️ 편집"}
        </button>
      </div>
      <div style={{ ...S.card, border: allDone && !editingTasks ? "1.5px solid #4ADE80" : "1.5px solid var(--dm-border)" }}>
        {editingTasks ? (
          <>
            {draftTasks.map((t, idx) => (
              <div key={t.id} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <input
                  style={{ ...S.input, flex: 1 }}
                  value={t.title}
                  onChange={(e) => setDraftTasks(prev => prev.map(x => x.id === t.id ? { ...x, title: e.target.value } : x))}
                  placeholder={`할 일 ${idx + 1}`}
                  maxLength={60}
                />
                <button onClick={() => setDraftTasks(prev => prev.filter(x => x.id !== t.id))}
                  style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer", flexShrink: 0 }}>✕</button>
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
              }} />
            </div>
            {(todayData?.tasks || []).map((task, i) => {
              if (!task.title.trim()) return null;
              return (
                <div key={task.id} onClick={() => onToggleTask(task.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                    borderBottom: i < (todayData.tasks.length - 1) ? `1px solid var(--dm-row)` : "none",
                    cursor: "pointer" }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    border: task.done ? "none" : "2px solid #3A4260",
                    background: task.done ? "#4B6FFF" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {task.done && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900 }}>✓</span>}
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 700, flex: 1,
                    color: task.done ? "var(--dm-muted)" : "var(--dm-text)",
                    textDecoration: task.done ? "line-through" : "none",
                  }}>{task.title}</div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div style={S.sectionTitle}>📋 언젠가 할일</div>
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

      {habits.length > 0 && (() => {
        const habitChecks = todayData?.habitChecks || {};
        const doneHabits = habits.filter(h => habitChecks[h.id]).length;
        const allHabitsDone = doneHabits === habits.length;
        return (
          <>
            <div style={{ ...S.sectionTitle, display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 16 }}>
              <span>🎯 오늘 습관</span>
              <span style={{ fontSize: 11, color: allHabitsDone ? "#4ADE80" : "var(--dm-muted)", fontWeight: 900 }}>{doneHabits}/{habits.length}</span>
            </div>
            <div style={{ ...S.card, border: allHabitsDone ? "1.5px solid #4ADE80" : "1.5px solid var(--dm-border)" }}>
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
                  <div key={h.id} onClick={() => onToggleHabit(h.id)}
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
            </div>
          </>
        );
      })()}

      <div style={S.sectionTitle}>📅 이번주 일정</div>
      <div style={{ padding: "0 16px" }}>
        <WeeklySchedule plans={plans} habits={habits} onOpenDate={onOpenDate} />
      </div>

      <div style={{ ...S.sectionTitle, display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 16 }}>
        <span>🎯 이달 목표</span>
        <button onClick={editingGoals ? saveGoalEdits : startEditGoals}
          style={{ fontSize: 11, fontWeight: 900, color: editingGoals ? "#4ADE80" : "var(--dm-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}>
          {editingGoals ? "완료 ✓" : "✏️ 편집"}
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
      </div>
      <div style={{ height: 12 }} />
    </div>
  );
}

function JournalViewer({ plans, onClose }) {
  const [copied, setCopied] = useState(false);

  const journalEntries = Object.entries(plans)
    .filter(([, d]) => d?.journal?.body?.trim())
    .sort(([a], [b]) => b.localeCompare(a));

  const allText = journalEntries
    .map(([ds, d]) => `[${formatKoreanDate(ds)}]\n${d.journal.body.trim()}`)
    .join('\n\n───────────\n\n');

  const copyAll = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(allText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    } else {
      const ta = document.createElement('textarea');
      ta.value = allText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--dm-bg)', zIndex: 500, display: 'flex', flexDirection: 'column', maxWidth: '100%' }}>
      <div style={{ ...S.topbar, flexShrink: 0 }}>
        <button onClick={onClose} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={S.title}>일기 몰아보기</div>
          <div style={S.sub}>{journalEntries.length}일치 일기</div>
        </div>
        <button onClick={copyAll} style={{
          padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: copied ? 'rgba(74,222,128,.15)' : 'rgba(108,142,255,.15)',
          color: copied ? '#4ADE80' : '#6C8EFF',
          fontSize: 12, fontWeight: 900, flexShrink: 0,
        }}>
          {copied ? '✓ 복사됨' : '전체 복사'}
        </button>
      </div>
      <div style={{ ...S.content, paddingBottom: 32 }}>
        {journalEntries.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--dm-muted)', fontSize: 14 }}>
            아직 작성된 일기가 없어요.
          </div>
        ) : journalEntries.map(([ds, d]) => (
          <div key={ds} style={S.card}>
            <div style={{ fontSize: 11, color: '#A78BFA', fontWeight: 900, marginBottom: 8 }}>
              {formatKoreanDate(ds)}
            </div>
            <div style={{ fontSize: 14, color: 'var(--dm-text)', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {d.journal.body.trim()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Today({ dateStr, data, setData, toast, setToast, plans }) {
  const doneCount = data.tasks.filter((t) => t.done && t.title.trim()).length;
  const filledCount = data.tasks.filter((t) => t.title.trim()).length;
  const isPerfect = filledCount >= 3 && doneCount === filledCount && !!data.journal?.body?.trim();
  const [showMemoViewer, setShowMemoViewer] = useState(false);
  const [showJournalViewer, setShowJournalViewer] = useState(false);

  if (showMemoViewer) return <MemoViewer plans={plans} onClose={() => setShowMemoViewer(false)} />;
  if (showJournalViewer) return <JournalViewer plans={plans} onClose={() => setShowJournalViewer(false)} />;

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      <div style={S.topbar}>
        <div>
          <div style={S.title}>오늘 일기</div>
          <div style={S.sub}>{formatKoreanDate(dateStr)} · {doneCount}/{filledCount || 3} 완료</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowMemoViewer(true)} style={{
            ...S.btnGhost, marginTop: 0, padding: '6px 10px', fontSize: 11, width: 'auto',
          }}>전체메모</button>
          <button onClick={() => setShowJournalViewer(true)} style={{
            ...S.btnGhost, marginTop: 0, padding: '6px 10px', fontSize: 11, width: 'auto',
          }}>전체일기</button>
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
          <div style={{ fontSize: 12, textAlign: "center", color: "var(--dm-sub)", marginTop: 6 }}>
            3가지 완료 + 일기 작성. 연속 기록이 쌓이고 있어요 🔥
          </div>
        </div>
      )}

      <div style={{ ...S.sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center", paddingRight: 16 }}>
        <span>📝 오늘 메모</span>
        <span style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 400 }}>수시로 기록해요</span>
      </div>
      <div style={S.card}>
        <textarea
          rows={4}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={data.memo ?? ""}
          onChange={(e) =>
            setData((prev) => ({ ...prev, memo: e.target.value }))
          }
          placeholder="업무 메모, 떠오른 생각, 할 일... 뭐든 적어요."
          maxLength={1200}
        />
        <button
          style={S.btn}
          onClick={() => {
            setData((prev) => ({ ...prev, memo: prev.memo ?? "" }));
            setToast("메모 저장 ✅");
          }}
        >
          메모 저장
        </button>
        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 6, textAlign: "right" }}>
          {(data.memo ?? "").length} / 1200
        </div>
      </div>

      <div style={S.sectionTitle}>일기 (22:00 이후 추천)</div>
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
        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 8, textAlign: "right" }}>
          {data.journal.body.length} / 1200
        </div>
      </div>

      <div style={{ height: 12 }} />
    </div>
  );
}

function MemoViewer({ plans, onClose }) {
  const [copied, setCopied] = useState(false);

  const memoEntries = Object.entries(plans)
    .filter(([, d]) => d?.memo?.trim())
    .sort(([a], [b]) => b.localeCompare(a));

  const allText = memoEntries
    .map(([ds, d]) => `[${formatKoreanDate(ds)}]\n${d.memo.trim()}`)
    .join('\n\n───────────\n\n');

  const copyAll = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(allText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    } else {
      const ta = document.createElement('textarea');
      ta.value = allText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--dm-bg)', zIndex: 500, display: 'flex', flexDirection: 'column', maxWidth: '100%' }}>
      <div style={{ ...S.topbar, flexShrink: 0 }}>
        <button onClick={onClose} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={S.title}>메모 몰아보기</div>
          <div style={S.sub}>{memoEntries.length}일치 메모</div>
        </div>
        <button onClick={copyAll} style={{
          padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: copied ? 'rgba(74,222,128,.15)' : 'rgba(108,142,255,.15)',
          color: copied ? '#4ADE80' : '#6C8EFF',
          fontSize: 12, fontWeight: 900, flexShrink: 0,
        }}>
          {copied ? '✓ 복사됨' : '전체 복사'}
        </button>
      </div>

      <div style={{ ...S.content, paddingBottom: 32 }}>
        {memoEntries.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--dm-muted)', fontSize: 14 }}>
            아직 작성된 메모가 없어요.
          </div>
        ) : memoEntries.map(([ds, d]) => (
          <div key={ds} style={S.card}>
            <div style={{ fontSize: 11, color: '#6C8EFF', fontWeight: 900, marginBottom: 8 }}>
              {formatKoreanDate(ds)}
            </div>
            <div style={{ fontSize: 14, color: 'var(--dm-text)', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {d.memo.trim()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function History({ plans, onOpenDate, habits }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month0, setMonth0] = useState(new Date().getMonth());
  const [showMemoViewer, setShowMemoViewer] = useState(false);
  const firstDay = new Date(year, month0, 1).getDay();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const today = toDateStr();

  const rateOf = (dateStr) => {
    const d = plans[dateStr];
    if (!d) return null;
    const filled = d.tasks.filter((t) => t.title.trim()).length;
    if (filled === 0) return 0;
    const done = d.tasks.filter((t) => t.done && t.title.trim()).length;
    return Math.min(100, Math.round((done / filled) * 100));
  };

  const styleOf = (r, isToday, isPerfect) => {
    if (isPerfect) return { background: "rgba(74,222,128,.20)", color: "#4ADE80", fontWeight: 900, border: "1.5px solid #4ADE80" };
    if (isToday) return { background: "#6C8EFF", color: "#fff", fontWeight: 900 };
    if (r === null) return { background: "transparent", color: "var(--dm-muted)" };
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

  if (showMemoViewer) return <MemoViewer plans={plans} onClose={() => setShowMemoViewer(false)} />;

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
            <div key={d} style={{ textAlign: "center", fontSize: 11, color: "var(--dm-muted)", fontWeight: 900 }}>
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
            const isFutureDate = ds > today;
            const st = isFutureDate && r === null
              ? { background: "var(--dm-input)", color: "var(--dm-muted)", border: "1px dashed var(--dm-border)" }
              : styleOf(r, isToday, perfect);
            const clickable = true;
            const hasMemo = !!(plans[ds]?.memo?.trim());
            const dayHabits = (habits || []);
            const habitChecks = plans[ds]?.habitChecks || {};
            const habitDots = dayHabits.slice(0, 6);
            const hasHabitData = dayHabits.length > 0 && plans[ds];
            return (
              <div
                key={ds}
                onClick={() => clickable && onOpenDate(ds)}
                style={{
                  aspectRatio: 1,
                  borderRadius: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  position: "relative",
                  cursor: clickable ? "pointer" : "default",
                  paddingBottom: hasHabitData ? 4 : 0,
                  ...st,
                }}
                title={clickable ? (perfect ? "완벽한 하루 ✓" : `${r}%`) : ""}
              >
                <span>{perfect ? "✓" : day}</span>
                {hasHabitData && (
                  <div style={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap", maxWidth: "90%" }}>
                    {habitDots.map(h => (
                      <span key={h.id} style={{
                        width: 4, height: 4, borderRadius: 999, flexShrink: 0,
                        background: habitChecks[h.id] ? "#A78BFA" : "rgba(167,139,250,.22)",
                      }} />
                    ))}
                  </div>
                )}
                {hasMemo && (
                  <span style={{
                    position: "absolute", top: 3, right: 3,
                    width: 4, height: 4, borderRadius: 999,
                    background: "#6C8EFF",
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={S.sectionTitle}>📅 이번주 일정</div>
      <div style={{ padding: "0 16px" }}>
        <WeeklySchedule plans={plans} habits={habits} onOpenDate={onOpenDate} />
      </div>

      <div style={{ height: 12 }} />
    </div>
  );
}

function DayDetail({ dateStr, data, setData, onBack, toast, setToast, habits, scrollToMemo, getValidGcalToken }) {
  const isToday = dateStr === toDateStr();
  const doneCount = data.tasks.filter((t) => t.done && t.title.trim()).length;
  const filledCount = data.tasks.filter((t) => t.title.trim()).length;
  const memoRef = useRef(null);
  useEffect(() => {
    if (scrollToMemo && memoRef.current) {
      setTimeout(() => memoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [scrollToMemo]);

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
      tasks: [...prev.tasks, { id: `t${Date.now()}`, title: "", done: false, checkedAt: null, priority: false }],
    }));
  };

  const removeTask = (id) => {
    const token = getValidGcalToken?.();
    const task = data.tasks.find(t => t.id === id);
    if (token && task?.gcalEventId) gcalDeleteEvent(token, task.gcalEventId).catch(() => {});
    setData((prev) => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== id) }));
  };

  const saveJournal = () => {
    setData((prev) => ({
      ...prev,
      journal: { ...prev.journal, savedAt: new Date().toISOString() },
    }));
    setToast("일기 저장 ✅");
  };

  const isPerfect = filledCount >= 3 && doneCount === filledCount && !!data.journal?.body?.trim();

  return (
    <div style={S.content}>
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
      <div style={S.topbar}>
        <button onClick={onBack} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={S.title}>{formatKoreanDate(dateStr)}</div>
          <div style={S.sub}>
            {doneCount}/{filledCount} 완료
            {isPerfect && " · 🎉 완벽한 하루"}
          </div>
        </div>
        <div />
      </div>

      <div style={{ ...S.sectionTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>할 일 ({data.tasks.length}개)</span>
        {getValidGcalToken && getValidGcalToken() && (
          <button onClick={async () => {
            const token = getValidGcalToken();
            if (!token) return;
            try {
              const events = await gcalFetchTodayEvents(token, dateStr);
              const external = events.filter(e => !e.extendedProperties?.private?.daymateId && e.summary?.trim());
              if (external.length === 0) { setToast('가져올 일정이 없어요'); return; }
              const existingTitles = new Set(data.tasks.map(t => t.title.trim().toLowerCase()));
              const toAdd = external
                .filter(e => !existingTitles.has(e.summary.trim().toLowerCase()))
                .map(e => ({ id: `gcal_${e.id}`, title: e.summary.trim(), done: false, checkedAt: null, priority: false, gcalEventId: e.id }));
              if (toAdd.length === 0) { setToast('이미 모두 추가됨'); return; }
              setData(prev => ({ ...prev, tasks: [...prev.tasks, ...toAdd] }));
              setToast(`${toAdd.length}개 추가됨`);
            } catch { setToast('캘린더 가져오기 실패'); }
          }} style={{ fontSize: 12, padding: '3px 8px', background: 'var(--dm-input)', border: '1px solid var(--dm-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--dm-sub)' }}>
            📅 캘린더에서 가져오기
          </button>
        )}
      </div>
      <div style={S.card}>
        {data.tasks.map((t, idx) => (
          <div key={t.id} style={{ display: "flex", gap: 10, marginBottom: idx < data.tasks.length - 1 ? 10 : 0 }}>
            <button
              onClick={() => toggleDone(t.id)}
              style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                border: `1.5px solid ${t.done ? "#4ADE80" : "var(--dm-border)"}`,
                background: t.done ? "rgba(74,222,128,.12)" : "var(--dm-input)",
                color: t.done ? "#4ADE80" : "var(--dm-sub)",
                fontSize: 18, cursor: "pointer",
              }}
            >
              {t.done ? "✓" : idx + 1}
            </button>
            <input
              style={S.input}
              value={t.title}
              onChange={(e) => setTitle(t.id, e.target.value)}
              onBlur={(e) => {
                const token = getValidGcalToken?.();
                if (!token || t.gcalEventId || !e.target.value.trim()) return;
                gcalCreateEvent(token, dateStr, { ...t, title: e.target.value.trim() })
                  .then(gcalEventId => setData(prev => ({
                    ...prev,
                    tasks: prev.tasks.map(x => x.id === t.id ? { ...x, gcalEventId } : x),
                  }))).catch(() => {});
              }}
              placeholder={`할 일 ${idx + 1}`}
              maxLength={60}
            />
            <button onClick={() => setData(prev => ({...prev, tasks: prev.tasks.map(x => x.id === t.id ? {...x, priority: !x.priority} : x)}))}
              style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:18, flexShrink:0, opacity: t.priority ? 1 : 0.3 }}>
              ⭐
            </button>
            <button
              style={{ marginLeft: 6, background: "transparent", border: "none", color: "#F87171", cursor: "pointer", flexShrink: 0 }}
              onClick={() => removeTask(t.id)}
              title="삭제"
            >
              ✕
            </button>
          </div>
        ))}
        <button style={{ ...S.btn, marginTop: 8 }} onClick={addTask}>➕ 할 일 추가</button>
        {!isToday && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--dm-muted)" }}>
            ✏️ 과거 날짜 기록을 편집 중이에요
          </div>
        )}
      </div>

      <div style={S.sectionTitle}>체크</div>
      <div style={S.card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CHECK_TIMES.map((t) => (
            <div
              key={t}
              style={{
                padding: "7px 10px", borderRadius: 999, border: "1.5px solid var(--dm-border)",
                background: data.checks[t] ? "rgba(108,142,255,.12)" : "var(--dm-input)",
                color: data.checks[t] ? "#6C8EFF" : "var(--dm-sub)",
                fontSize: 12, fontWeight: 900,
              }}
            >
              {data.checks[t] ? "✅" : "⏱️"} {t}
            </div>
          ))}
        </div>
      </div>

      {(habits || []).length > 0 && (() => {
        const habitChecks = data.habitChecks || {};
        const toggleHabit = (id) => setData(prev => {
          const cur = prev.habitChecks || {};
          return { ...prev, habitChecks: { ...cur, [id]: !cur[id] } };
        });
        return (
          <>
            <div style={S.sectionTitle}>🎯 습관</div>
            <div style={S.card}>
              {(habits || []).map((h, i) => {
                const checked = !!habitChecks[h.id];
                return (
                  <div key={h.id} onClick={() => toggleHabit(h.id)}
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
            </div>
          </>
        );
      })()}

      <div ref={memoRef} style={S.sectionTitle}>📝 메모</div>
      <div style={S.card}>
        <textarea
          rows={3}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={data.memo ?? ""}
          onChange={(e) =>
            setData((prev) => ({ ...prev, memo: e.target.value }))
          }
          placeholder="메모를 남겨보세요."
          maxLength={1200}
        />
        <button
          style={S.btn}
          onClick={() => {
            setData((prev) => ({ ...prev, memo: prev.memo ?? "" }));
            setToast("메모 저장 ✅");
          }}
        >
          메모 저장
        </button>
        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 6, textAlign: "right" }}>
          {(data.memo ?? "").length} / 1200
        </div>
      </div>

      <div style={S.sectionTitle}>일기</div>
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
          placeholder="이 날의 기록을 남겨보세요."
          maxLength={1200}
        />
        <button style={S.btn} onClick={saveJournal}>일기 저장</button>
        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 8, textAlign: "right" }}>
          {(data.journal?.body || "").length} / 1200
        </div>
      </div>
      <div style={{ height: 12 }} />
    </div>
  );
}

function Stats({ plans, habits }) {
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear());

  const streak = useMemo(() => calcStreak(plans), [plans]);
  const weeklyStats = useMemo(() => calcWeeklyStats(plans), [plans]);
  const weeklyAvg = useMemo(() =>
    Math.round(weeklyStats.reduce((a, d) => a + d.rate, 0) / 7),
    [weeklyStats]
  );

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
        if (isPerfectDay(dayData)) perfect++;
      }
    }
    monthStats.push({ month: m, perfect, filled, rate: filled === 0 ? 0 : Math.round((perfect / filled) * 100) });
  }

  // 연간 히트맵 데이터 (해당 연도 1월1일 ~ 12월31일)
  const buildHeatmap = (year) => {
    const jan1 = new Date(year, 0, 1);
    const startOffset = jan1.getDay(); // 0=일
    const totalDays = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
    const cells = [];
    // 앞쪽 빈칸
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
    if (!cell || !cell.filled) return 'var(--dm-deep)';
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
          <div style={S.title}>통계</div>
          <div style={S.sub}>{monthLabel(viewYear, viewMonth)}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={prev} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>‹</button>
          <button onClick={next} style={{ ...S.btnGhost, width: 44, marginTop: 0, padding: 10 }}>›</button>
        </div>
      </div>

      <div style={S.sectionTitle}>🔥 연속기록 · 이번주</div>
      <div style={{ ...S.card, margin: "0 0 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <div style={{ textAlign: "center", minWidth: 56 }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: streak > 0 ? "#FCD34D" : "var(--dm-muted)", lineHeight: 1 }}>{streak}</div>
            <div style={{ fontSize: 11, color: "var(--dm-sub)", marginTop: 4 }}>일 연속</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: streak > 0 ? "var(--dm-text)" : "var(--dm-muted)", marginBottom: 4 }}>
              {streak > 0 ? `🔥 ${streak}일 연속 중!` : "연속 기록 없음"}
            </div>
            <div style={{ fontSize: 12, color: "var(--dm-muted)" }}>이번주 평균 완료율 
              <b style={{ color: weeklyAvg >= 80 ? "#4ADE80" : weeklyAvg >= 50 ? "#FCD34D" : "#F87171" }}>{weeklyAvg}%</b>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, justifyContent: "space-between" }}>
          {weeklyStats.map((d, i) => {
            const dow = "일월화수목금토"[new Date(d.date).getDay()];
            return (
              <div key={i} style={{ flex: 1, textAlign: "center" }}>
                <div style={{
                  height: 28, borderRadius: 6,
                  background: d.isPerfect ? "rgba(74,222,128,.20)" : d.rate >= 80 ? "rgba(252,211,77,.15)" : d.rate > 0 ? "rgba(248,113,113,.12)" : "var(--dm-input)",
                  border: `1.5px solid ${d.isPerfect ? "#4ADE80" : d.rate >= 80 ? "#FCD34D" : d.rate > 0 ? "#F87171" : "var(--dm-card)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 900, color: d.isPerfect ? "#4ADE80" : "var(--dm-sub)", marginBottom: 4,
                }}>
                  {d.isPerfect ? "✓" : d.rate > 0 ? d.rate : ""}
                </div>
                <div style={{ fontSize: 10, color: "var(--dm-muted)", fontWeight: 800 }}>{dow}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={S.sectionTitle}>이달 완벽한 날</div>
      {/* make these cards occupy full content width by removing horizontal margins */}
      <div style={{ ...S.card, margin: "0 0 10px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 42, fontWeight: 900, color: perfectRate >= 80 ? "#4ADE80" : perfectRate >= 50 ? "#FCD34D" : "#F87171", marginBottom: 8 }}>
            {perfectDays}
          </div>
          <div style={{ fontSize: 13, color: "var(--dm-sub)", marginBottom: 12 }}>
            {filledDays}일 중 {perfectDays}일 완벽함
          </div>
          <div style={{
            height: 12,
            background: "var(--dm-input)",
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
      {/* remove horizontal margins so grid stretches full width */}
      <div style={{ ...S.card, margin: "0 0 10px", padding: "10px 10px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(50px,1fr))", gap: 6 }}>
          {monthStats.map((m) => (
            <div key={m.month} style={{
              textAlign: "center",
              padding: 12,
              background: "var(--dm-input)",
              borderRadius: 10,
              border: m.month === viewMonth ? "2px solid #6C8EFF" : "1px solid var(--dm-border)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-sub)", marginBottom: 8 }}>
                {pad2(m.month + 1)}월
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: m.rate >= 80 ? "#4ADE80" : m.rate >= 50 ? "#FCD34D" : m.filled > 0 ? "#F87171" : "var(--dm-muted)" }}>
                {m.filled === 0 ? "-" : m.rate + "%"}
              </div>
              <div style={{ fontSize: 10, color: "var(--dm-muted)", marginTop: 4 }}>
                {m.perfect}/{m.filled}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...S.sectionTitle, display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 16 }}>
        <span>🌱 연간 잔디</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setHeatmapYear(y => y - 1)}
            style={{ ...S.btnGhost, width: 32, marginTop: 0, padding: "4px 8px", fontSize: 13 }}>‹</button>
          <span style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, alignSelf: "center" }}>{heatmapYear}</span>
          <button onClick={() => setHeatmapYear(y => y + 1)}
            style={{ ...S.btnGhost, width: 32, marginTop: 0, padding: "4px 8px", fontSize: 13 }}>›</button>
        </div>
      </div>
      <div style={{ ...S.card, margin: "0 0 10px", padding: "12px 10px", overflowX: "auto" }}>
        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>완벽한 날 <b style={{ color: "#4ADE80" }}>{heatTotalPerfect}</b>일</span>
          <span>기록한 날 <b style={{ color: "var(--dm-sub)" }}>{heatTotalFilled}</b>일</span>
        </div>
        {/* 요일 헤더 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4, minWidth: 200 }}>
          {["일","월","화","수","목","금","토"].map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 9, color: "#3A4260", fontWeight: 900 }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, minWidth: 200 }}>
          {heatmapCells.map((cell, i) => (
            <div
              key={i}
              title={cell ? `${cell.ds} ${cell.perfect ? "🌟 완벽" : cell.filled ? `${cell.done}/${cell.total}` : ""}` : ""}
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
          <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--dm-input)", borderRadius: 8, fontSize: 12, color: "var(--dm-text)" }}>
            <b>{formatKoreanDate(tooltip.ds)}</b>
            {tooltip.perfect && <span style={{ color: "#4ADE80", marginLeft: 8 }}>🌟 완벽한 날</span>}
            {!tooltip.perfect && tooltip.filled && <span style={{ color: "#FCD34D", marginLeft: 8 }}>{tooltip.done}/{tooltip.total} 완료</span>}
          </div>
        )}
        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", fontSize: 10, color: "var(--dm-muted)" }}>
          <span>적음</span>
          {["var(--dm-deep)", "rgba(248,113,113,.25)", "rgba(252,211,77,.35)", "rgba(74,222,128,.4)", "#4ADE80"].map((c, i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
          ))}
          <span>완벽</span>
        </div>
      </div>

      {(habits || []).length > 0 && (
        <>
          <div style={S.sectionTitle}>🎯 습관 달성률</div>
          <div style={{ ...S.card, margin: "0 0 10px" }}>
            {(habits || []).map(h => {
              let done = 0, total = 0;
              for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
                const dayData = plans[dateStr];
                if (dayData) { total++; if (dayData.habitChecks?.[h.id]) done++; }
              }
              const rate = total === 0 ? 0 : Math.round((done / total) * 100);
              return (
                <div key={h.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{h.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dm-text)" }}>{h.name}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: rate >= 80 ? "#4ADE80" : rate >= 50 ? "#FCD34D" : "#F87171" }}>
                      {total === 0 ? "-" : `${done}/${total}일 · ${rate}%`}
                    </div>
                  </div>
                  <div style={{ height: 8, background: "var(--dm-input)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 4, transition: "width 0.3s",
                      background: rate >= 80 ? "#A78BFA" : rate >= 50 ? "#FCD34D" : "#F87171",
                      width: `${rate}%`,
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ height: 12 }} />
    </div>
  );
}

function Settings({ user, setUser, goals, setGoals, notifEnabled, setNotifEnabled,
                    telegramCfg, setTelegramCfg, alarmTimes, setAlarmTimes, toast, setToast,
                    authUser, syncStatus, onGoogleSignIn, onGoogleSignOut,
                    habits, setHabits, recurringTasks, setRecurringTasks,
                    installPrompt, handleInstall,
                    gcalToken, gcalTokenExp, onGcalConnect, onGcalDisconnect, onGcalPull }) {
  const [name, setName] = useState(user.name || "");
  const [yearText, setYearText] = useState((goals.year || []).join("\n"));
  const [permission, setPermission] = useState(getPermission());
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [gcalStatus, setGcalStatus] = useState('');
  const gcalConnected = !!(gcalToken && Date.now() < gcalTokenExp);
  const fileInputRef = useRef(null);

  const [tgToken, setTgToken] = useState(telegramCfg.botToken || '');
  const [tgChatId, setTgChatId] = useState(telegramCfg.chatId || '');
  const [showBotHelp, setShowBotHelp] = useState(false);
  const [showChatHelp, setShowChatHelp] = useState(false);
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
      botToken: tgToken.trim(), chatId: tgChatId.trim(),
      briefingTime, todoTime, assets: selectedAssets, customAssets,
      weatherCity: telegramCfg.weatherCity || '',
    };
    setTelegramCfg(cfg);
    store.set('dm_telegram', cfg);
    if (authUser) saveSettings(authUser.uid, { telegram: cfg }).catch(() => {});
    setToast('텔레그램 설정 저장 ✅');
  };

  const searchTimerRef = useRef(null);
  const doAssetSearch = (query) => {
    setAssetSearch(query);
    if (!query.trim()) { setSearchResults([]); return; }
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      const results = searchMode === 'stock'
        ? await searchFinnhub('', query)
        : searchMode === 'korean'
          ? await searchKoreanStock(query)
          : await searchCoinGecko(query);
      setSearchResults(results);
      setSearching(false);
    }, 500);
  };

  const addCustomAsset = (asset) => {
    const allSyms = [...Object.keys(ASSET_META), ...customAssets.map(a => a.sym)];
    if (allSyms.includes(asset.sym)) { setToast(`${asset.sym} 이미 있어요`); return; }
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

  const handleGcalConnect = async () => {
    setGcalStatus('연결 중...');
    const token = await onGcalConnect();
    setGcalStatus(token ? '✓ 연동 완료' : '✗ 연동 실패 (팝업 차단 확인)');
    setTimeout(() => setGcalStatus(''), 3000);
  };

  const handleGcalPull = async () => {
    setGcalStatus('가져오는 중...');
    try {
      const count = await onGcalPull(gcalToken);
      setGcalStatus(count > 0 ? `✓ ${count}개 가져왔어요` : '✓ 새 일정 없음');
    } catch {
      setGcalStatus('✗ 실패 (토큰 만료됐을 수 있어요)');
    }
    setTimeout(() => setGcalStatus(''), 3000);
  };

  const saveAlarmTimes = () => {
    const times = { morning: morningTime, noon: noonTime, evening: eveningTime, night: nightTime };
    setAlarmTimes(times);
    store.set('dm_alarm_times', times);
    if (authUser) saveSettings(authUser.uid, { alarmTimes: times }).catch(() => {});
    setToast('알림 시간 저장 ✅');
  };

  const testTelegramMsg = async () => {
    const res = await sendTelegramMessage(tgToken.trim(), tgChatId.trim(), '✅ <b>DayMate 연결 테스트 성공!</b>\n\n텔레그램 알림이 정상 작동해요.');
    setToast(res.ok ? '텔레그램 전송 성공 ✅' : `전송 실패: ${res.error} 🚫`);
  };

  const testBriefing = async () => {
    setToast('브리핑 생성 중...');
    const customRegistry = Object.fromEntries(customAssets.map(a => [a.sym, a]));
    const marketData = await fetchMarketDataFromServer(selectedAssets, customRegistry);
    const text = buildBriefingText(marketData, user.name);
    const res = await sendTelegramMessage(tgToken.trim(), tgChatId.trim(), text);
    setToast(res.ok ? '브리핑 전송 성공 ✅' : `전송 실패: ${res.error} 🚫`);
  };

  const save = () => {
    const nextUser = { name: (name || "").trim() || "사용자" };
    const nextGoals = {
      year: clampList(parseLines(yearText), 5),
      month: goals.month || [],
    };
    setUser(nextUser);
    setGoals(nextGoals);
    store.set("dm_user", nextUser);
    store.set("dm_goals", nextGoals);
    if (authUser) saveSettings(authUser.uid, { name: nextUser.name }).catch(() => {});
    setToast("저장 완료 ✅");
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
        <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 8 }}>이름</div>
        <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
        <button style={S.btn} onClick={save}>저장</button>
      </div>

      <div style={S.sectionTitle}>목표</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 8 }}>
          👑 연간 목표 (최대 5개)
        </div>
        <textarea
          rows={5}
          style={{ ...S.input, resize: "none", lineHeight: 1.6 }}
          value={yearText}
          onChange={(e) => setYearText(e.target.value)}
          placeholder="한 줄에 하나씩 입력"
        />
        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 8, lineHeight: 1.6 }}>
          💡 이달 목표는 홈 화면에서 직접 추가/편집할 수 있어요
        </div>
        <button style={S.btn} onClick={save}>저장</button>
      </div>

      <div style={S.sectionTitle}>🎯 습관 관리</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.7, marginBottom: 12 }}>
          매일 반복할 습관을 등록하면 홈 화면에서 체크할 수 있어요. (최대 10개)
        </div>
        {(habits || []).map((h) => (
          <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <input
              style={{ ...S.input, width: 48, textAlign: "center", marginBottom: 0, padding: "8px 4px" }}
              value={h.icon}
              maxLength={2}
              placeholder="🎯"
              onChange={(e) => setHabits(prev => prev.map(x => x.id === h.id ? { ...x, icon: e.target.value } : x))}
            />
            <input
              style={{ ...S.input, flex: 1, marginBottom: 0 }}
              value={h.name}
              maxLength={20}
              placeholder="습관 이름 (예: 운동, 독서)"
              onChange={(e) => setHabits(prev => prev.map(x => x.id === h.id ? { ...x, name: e.target.value } : x))}
            />
            <button onClick={() => setHabits(prev => prev.filter(x => x.id !== h.id))}
              style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer", fontSize: 20, flexShrink: 0, lineHeight: 1 }}>✕</button>
          </div>
        ))}
        {(habits || []).length < 10 && (
          <button style={{ ...S.btn, marginTop: (habits || []).length > 0 ? 4 : 0 }}
            onClick={() => setHabits(prev => [...prev, { id: `h${Date.now()}`, name: "", icon: "🎯" }])}>
            ➕ 습관 추가
          </button>
        )}
        {(habits || []).length === 0 && (
          <div style={{ fontSize: 12, color: "var(--dm-muted)", marginTop: 4 }}>아직 등록된 습관이 없어요.</div>
        )}
      </div>

      <div style={S.sectionTitle}>알림</div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900 }}>알림 ON/OFF</div>
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
              background: notifEnabled && permission === "granted" ? "#6C8EFF" : "var(--dm-border)",
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
              sendNotification("DayMate Lite", "테스트 알림입니다. ✅", "🔔");
              setToast("테스트 알림 발송 ✅");
            } else if (permission === "denied") {
              setToast("알림이 차단됨 — 브라우저 설정 → 알림 → 허용으로 변경해주세요");
            } else {
              const r = await requestPermission();
              setPermission(r);
              if (r === "granted") {
                setNotifEnabled(true);
                sendNotification("DayMate Lite", "알림이 활성화됐어요! ✅", "🔔");
                setToast("알림 권한 허용됨 ✅");
              } else {
                setToast("알림 권한 거부됨 — 브라우저 설정에서 허용해주세요");
              }
            }
          }}
        >
          🔔 알림 권한 허용 / 테스트
        </button>
      </div>

      <div style={S.sectionTitle}>알림 시간 설정</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.7, marginBottom: 12 }}>
          아침·점심·저녁·밤 알림 시간을 조정할 수 있어요.
        </div>
        {[
          { label: "아침 기상 알람", value: morningTime, set: setMorningTime },
          { label: "점심 체크인", value: noonTime, set: setNoonTime },
          { label: "저녁 체크인", value: eveningTime, set: setEveningTime },
          { label: "밤 마감 알람", value: nightTime, set: setNightTime },
        ].map(({ label, value, set }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ flex: 1, fontSize: 13, color: "var(--dm-text)", fontWeight: 800 }}>{label}</div>
            <input
              type="time"
              value={value}
              onChange={(e) => set(e.target.value)}
              style={{ ...S.input, width: 110, padding: "8px 10px", marginBottom: 0 }}
            />
          </div>
        ))}
        <button style={S.btn} onClick={saveAlarmTimes}>알림 시간 저장</button>
      </div>

      <div style={S.sectionTitle}>텔레그램 자동화</div>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900 }}>봇 토큰 (Bot Token)</div>
          <button onClick={() => setShowBotHelp(v => !v)}
            style={{ fontSize: 11, color: "#6C8EFF", background: "transparent", border: "none", cursor: "pointer", fontWeight: 700 }}>
            {showBotHelp ? "▲ 닫기" : "❓ 얻는 방법"}
          </button>
        </div>
        {showBotHelp && (
          <div style={{ fontSize: 12, color: "var(--dm-sub)", background: "var(--dm-deep)", borderRadius: 8, padding: "10px 12px", marginBottom: 10, lineHeight: 1.8, border: "1px solid var(--dm-border)" }}>
            <b style={{ color: "#6C8EFF" }}>1.</b> 텔레그램에서 <b>@BotFather</b> 검색 후 시작<br />
            <b style={{ color: "#6C8EFF" }}>2.</b> <code style={{ background: "var(--dm-input)", padding: "1px 5px", borderRadius: 4 }}>/newbot</code> 명령 입력<br />
            <b style={{ color: "#6C8EFF" }}>3.</b> 봇 이름 지정 → 사용자명(봇ID) 지정<br />
            <b style={{ color: "#6C8EFF" }}>4.</b> BotFather가 전송한 <b>HTTP API token</b> 복사<br />
            <span style={{ color: "var(--dm-muted)" }}>예) <code style={{ background: "var(--dm-input)", padding: "1px 5px", borderRadius: 4 }}>123456789:ABCdefGhIjklMno...</code></span>
          </div>
        )}
        <input style={S.input} value={tgToken} onChange={(e) => setTgToken(e.target.value)} placeholder="123456789:ABCdef..." type="password" />

        <div style={{ height: 10 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900 }}>채팅 ID (Chat ID)</div>
          <button onClick={() => setShowChatHelp(v => !v)}
            style={{ fontSize: 11, color: "#6C8EFF", background: "transparent", border: "none", cursor: "pointer", fontWeight: 700 }}>
            {showChatHelp ? "▲ 닫기" : "❓ 얻는 방법"}
          </button>
        </div>
        {showChatHelp && (
          <div style={{ fontSize: 12, color: "var(--dm-sub)", background: "var(--dm-deep)", borderRadius: 8, padding: "10px 12px", marginBottom: 10, lineHeight: 1.8, border: "1px solid var(--dm-border)" }}>
            <b style={{ color: "#6C8EFF" }}>1.</b> 텔레그램에서 내가 만든 봇을 찾아 메시지 전송<br />
            <b style={{ color: "#6C8EFF" }}>2.</b> 브라우저에서 아래 URL 접속:<br />
            <code style={{ background: "var(--dm-input)", padding: "2px 6px", borderRadius: 4, wordBreak: "break-all" }}>https://api.telegram.org/bot<b>토큰</b>/getUpdates</code><br />
            <b style={{ color: "#6C8EFF" }}>3.</b> 결과 JSON에서 <code style={{ background: "var(--dm-input)", padding: "1px 5px", borderRadius: 4 }}>"chat":{'{'}"id": <b>숫자</b>{'}'}</code> 확인<br />
            <span style={{ color: "var(--dm-muted)" }}>또는 <b>@userinfobot</b>에 메시지 보내면 ID 알려줌</span>
          </div>
        )}
        <input style={S.input} value={tgChatId} onChange={(e) => setTgChatId(e.target.value)} placeholder="123456789" />

        <div style={{ height: 10 }} />
        <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 4 }}>
          Finnhub API Key <span style={{ color: "var(--dm-muted)", fontWeight: 400 }}>(Vercel 환경변수로 설정)</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--dm-muted)", padding: "10px 12px", background: "var(--dm-deep)", borderRadius: 8, border: "1px solid var(--dm-border)" }}>
          🔒 FINNHUB_KEY 서버 환경변수로 관리됨 — 입력할 필요 없음
        </div>

        <div style={{ height: 10 }} />
        <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 4 }}>날씨 도시</div>
        <input style={S.input} value={telegramCfg.weatherCity || ''}
          onChange={(e) => setTelegramCfg(prev => ({...prev, weatherCity: e.target.value}))}
          placeholder="서울 (기본값)" />

        <div style={{ height: 14 }} />
        <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 10 }}>알림 시간</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>자산 브리핑</div>
            <input style={S.input} type="time" value={briefingTime} onChange={(e) => setBriefingTime(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--dm-muted)", marginBottom: 4 }}>할일 알림</div>
            <input style={S.input} type="time" value={todoTime} onChange={(e) => setTodoTime(e.target.value)} />
          </div>
        </div>

        <div style={{ height: 14 }} />
        <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 10 }}>브리핑 자산 선택</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(ASSET_META).map(([sym, meta]) => {
            const on = selectedAssets.includes(sym);
            return (
              <button
                key={sym}
                onClick={() => toggleAsset(sym)}
                style={{
                  padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  background: on ? "#4B6FFF" : "var(--dm-row)",
                  color: on ? "#fff" : "var(--dm-muted)",
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
                background: selectedAssets.includes(a.sym) ? "#4B6FFF" : "var(--dm-row)",
                color: selectedAssets.includes(a.sym) ? "#fff" : "var(--dm-muted)",
              }}>
                <span onClick={() => toggleAsset(a.sym)} style={{ cursor: "pointer" }}>
                  {a.sym} <span style={{ fontWeight: 400 }}>{a.label}</span>
                </span>
                <span
                  onClick={() => removeCustomAsset(a.sym)}
                  style={{ cursor: "pointer", color: "#F87171", fontWeight: 900, marginLeft: 2 }}
                >×</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 8 }}>자산 검색 추가</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { id: 'stock', label: '해외주식/ETF' },
              { id: 'korean', label: '국내주식' },
              { id: 'crypto', label: '코인' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => { setSearchMode(id); setSearchResults([]); setAssetSearch(''); }}
                style={{
                  padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  background: searchMode === id ? "#4B6FFF" : "var(--dm-row)",
                  color: searchMode === id ? "#fff" : "var(--dm-muted)",
                }}
              >{label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...S.input, flex: 1, marginBottom: 0 }}
              placeholder={searchMode === 'stock' ? 'AAPL, NVDA, SPY...' : searchMode === 'korean' ? '삼성전자, 카카오...' : 'SOL, XRP, DOGE...'}
              value={assetSearch}
              onChange={e => doAssetSearch(e.target.value)}
            />
            {searching && <span style={{ color: "var(--dm-sub)", fontSize: 12, alignSelf: "center" }}>검색 중...</span>}
          </div>
          {searchResults.length > 0 && (
            <div style={{
              marginTop: 8, background: "var(--dm-deep)", border: "1px solid var(--dm-border)",
              borderRadius: 10, overflow: "hidden",
            }}>
              {searchResults.map(item => (
                <div
                  key={item.sym + item.src}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", borderBottom: "1px solid var(--dm-card)", cursor: "pointer",
                  }}
                  onClick={() => addCustomAsset(item)}
                >
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "var(--dm-text)" }}>{item.sym}</span>
                    <span style={{ fontSize: 12, color: "var(--dm-sub)", marginLeft: 8 }}>{item.label}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "#4B6FFF", fontWeight: 700 }}>+ 추가</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 14 }} />
        <button style={S.btn} onClick={saveTelegram}>저장</button>
        <button style={S.btnGhost} onClick={testTelegramMsg}>연결 테스트</button>
        <button style={S.btnGhost} onClick={testBriefing}>자산 브리핑 테스트 전송</button>

        <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 10, lineHeight: 1.7 }}>
          ⚠️ 탭이 열려 있을 때만 동작해요.
        </div>
      </div>

      <div style={S.sectionTitle}>백업</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.7 }}>
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

      <div style={S.sectionTitle}>계정 동기화</div>
      <div style={S.card}>
        {authUser ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              {authUser.photoURL && (
                <img src={authUser.photoURL} alt="" style={{ width: 40, height: 40, borderRadius: "50%" }} />
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{authUser.displayName}</div>
                <div style={{ fontSize: 12, color: "var(--dm-sub)" }}>{authUser.email}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: syncStatus === 'synced' ? '#4ade80' : 'var(--dm-sub)', marginBottom: 12 }}>
              {syncStatus === 'syncing' ? '동기화 중...' : syncStatus === 'synced' ? '✓ 동기화 완료' : '대기 중'}
            </div>
            <button style={S.btnGhost} onClick={() => onGoogleSignOut().catch(() => {})}>로그아웃</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.7, marginBottom: 12 }}>
              Google 계정으로 로그인하면 데스크탑↔모바일 데이터가 자동으로 동기화돼요.
            </div>
            <button
              style={{ ...S.btn, background: "#fff", color: "#333", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              onClick={() => onGoogleSignIn().catch(() => {})}
            >
              <span style={{ fontSize: 16 }}>G</span> Google로 로그인
            </button>
          </div>
        )}
      </div>

      <div style={S.sectionTitle}>🔁 반복 할일</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.7, marginBottom: 12 }}>
          매일 또는 특정 요일에 자동으로 추가되는 할일을 설정해요.
        </div>
        {(recurringTasks || []).map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <select
              value={t.days}
              onChange={(e) => setRecurringTasks(prev => prev.map(x => x.id === t.id ? {...x, days: e.target.value} : x))}
              style={{ ...S.input, width: 80, marginBottom: 0, padding: "8px 6px", fontSize: 12 }}>
              <option value="daily">매일</option>
              <option value="1">월</option><option value="2">화</option><option value="3">수</option>
              <option value="4">목</option><option value="5">금</option>
              <option value="6">토</option><option value="0">일</option>
            </select>
            <input
              style={{ ...S.input, flex: 1, marginBottom: 0 }}
              value={t.title}
              maxLength={40}
              placeholder="반복 할일 이름"
              onChange={(e) => setRecurringTasks(prev => prev.map(x => x.id === t.id ? {...x, title: e.target.value} : x))}
            />
            <button onClick={() => setRecurringTasks(prev => prev.filter(x => x.id !== t.id))}
              style={{ background: "transparent", border: "none", color: "#F87171", cursor: "pointer", fontSize: 20, flexShrink: 0 }}>✕</button>
          </div>
        ))}
        {(recurringTasks || []).length < 10 && (
          <button style={{ ...S.btn, marginTop: (recurringTasks||[]).length > 0 ? 4 : 0 }}
            onClick={() => setRecurringTasks(prev => [...prev, { id: `r${Date.now()}`, title: "", days: "daily" }])}>
            ➕ 반복 할일 추가
          </button>
        )}
      </div>

      <div style={S.sectionTitle}>📲 앱 설치</div>
      <div style={S.card}>
        <button onClick={installPrompt ? handleInstall : () => setShowInstallGuide(v => !v)}
          style={{ ...S.btn, background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)", color: "#fff" }}>
          앱 설치 (휴대폰 바탕화면에 바로가기 만들기)
        </button>
        {!installPrompt && showInstallGuide && (
          <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.9, marginTop: 12 }}>
            📱 <b>iOS Safari:</b> 하단 공유(□↑) 버튼 → <b>홈 화면에 추가</b><br />
            🤖 <b>Android Chrome:</b> 주소창 오른쪽 ⋮ 메뉴 → <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>
          </div>
        )}
      </div>

      <div style={S.sectionTitle}>🔗 친구에게 공유하기</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: "var(--dm-sub)", lineHeight: 1.7, marginBottom: 12 }}>
          DayMate를 친구에게 소개해보세요!
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {navigator.share && (
            <button onClick={async () => {
              try { await navigator.share({ title: 'DayMate', text: '📅 DayMate — 매일 할일 3가지, 습관, 일기를 한 곳에서! 무료로 써보세요 👉 ', url: 'https://daymate-beta.vercel.app' }); } catch {}
            }} style={{ ...S.btn, marginTop: 0, background: 'linear-gradient(135deg,#FEE500,#FDD835)', color: '#3C1E1E' }}>
              💬 카카오 / 문자로 공유하기
            </button>
          )}
          <button onClick={() => {
            const full = '📅 DayMate — 매일 할일 3가지, 습관, 일기를 한 곳에서! 무료로 써보세요 👉 https://daymate-beta.vercel.app';
            if (navigator.clipboard) {
              navigator.clipboard.writeText(full).then(() => { setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); });
            } else {
              const ta = document.createElement('textarea');
              ta.value = full; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
              setShareCopied(true); setTimeout(() => setShareCopied(false), 2000);
            }
          }} style={{
            ...S.btn, marginTop: 0,
            background: shareCopied ? 'rgba(74,222,128,.15)' : 'var(--dm-input)',
            color: shareCopied ? '#4ADE80' : 'var(--dm-text)',
            border: '1.5px solid var(--dm-border)', boxShadow: 'none',
          }}>
            {shareCopied ? '✓ 링크 복사됨' : '🔗 링크 복사하기'}
          </button>
        </div>
      </div>

      <div style={S.sectionTitle}>🗓️ 구글 캘린더 연동</div>
      <div style={S.card}>
        <div style={{ fontSize: 12, color: 'var(--dm-sub)', lineHeight: 1.7, marginBottom: 12 }}>
          {gcalConnected
            ? `연동됨 · ${new Date(gcalTokenExp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 만료`
            : '할일을 구글 캘린더에 자동으로 추가하거나, 캘린더 일정을 오늘 할일로 가져올 수 있어요.'}
        </div>
        {gcalConnected ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleGcalPull} style={{ ...S.btnGhost, flex: 1, marginTop: 0, fontSize: 12 }}>
              📥 오늘 일정 가져오기
            </button>
            <button onClick={onGcalDisconnect} style={{
              ...S.btnGhost, marginTop: 0, fontSize: 12, flexShrink: 0,
              color: '#F87171', border: '1.5px solid rgba(248,113,113,.35)',
            }}>
              연동 해제
            </button>
          </div>
        ) : (
          <button onClick={handleGcalConnect} style={S.btn}>🔗 구글 캘린더 연동하기</button>
        )}
        {gcalStatus && (
          <div style={{
            fontSize: 12, marginTop: 10, fontWeight: 700,
            color: gcalStatus.startsWith('✓') ? '#4ADE80' : gcalStatus.includes('중') ? 'var(--dm-sub)' : '#F87171',
          }}>
            {gcalStatus}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginTop: 10, lineHeight: 1.7 }}>
          💡 구글 로그인 팝업이 열려요. 토큰은 1시간 유효하며 만료 시 재연동이 필요해요.
        </div>
      </div>

      <div style={{ padding: "16px 18px", textAlign: "center", color: "var(--dm-muted)", fontSize: 12 }}>
        DayMate Lite v23 · 2026-03-11
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

  // PWA 설치 프롬프트
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); setShowInstallBanner(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setShowInstallBanner(false);
    setInstallPrompt(null);
  };

  // no width limit - let container fill viewport
  const phoneStyleOverride = { maxWidth: '100%' };

  const [authUser, setAuthUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle'|'syncing'|'synced'
  const syncReadyRef = useRef(false); // Firestore 쓰기 허용 플래그 (초기 로드 완료 후 true)

  // Google Calendar 연동 토큰
  const [gcalToken, setGcalToken] = useState(() => store.get('dm_gcal_token', null));
  const [gcalTokenExp, setGcalTokenExp] = useState(() => store.get('dm_gcal_token_exp', 0));

  // FCM Web Push 구독
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
        const { saveSettings: _s } = await import('./firebase.js');
        await _s(authUser.uid, { pushSubscription: JSON.parse(JSON.stringify(sub)) });
      } catch {}
    });
  }, [authUser, VAPID_PUBLIC]);

  // 다크/라이트 모드
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
  const [recurringTasks, setRecurringTasks] = useState(() => store.get("dm_recurring", []));

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
      const { accessToken, expiresAt } = await googleSignInWithCalendarScope();
      store.set('dm_gcal_token', accessToken);
      store.set('dm_gcal_token_exp', expiresAt);
      setGcalToken(accessToken);
      setGcalTokenExp(expiresAt);
      return accessToken;
    } catch { return null; }
  };

  const disconnectGcal = () => {
    store.remove('dm_gcal_token');
    store.remove('dm_gcal_token_exp');
    setGcalToken(null);
    setGcalTokenExp(0);
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
    setTodayData(prev => ({ ...prev, tasks: [...(prev.tasks || []), ...toAdd] }));
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
      try {
        const remote = await loadAllFromFirestore(firebaseUser.uid);
        const hasRemote = remote.settings || remote.goals || Object.keys(remote.days).length > 0;

        if (hasRemote) {
          // Firestore 데이터를 로컬로 덮어쓰기
          if (remote.settings) {
            const s = remote.settings;
            if (s.name) { setUser({ name: s.name }); store.set("dm_user", { name: s.name }); }
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
          // 최초 로그인: 로컬 데이터를 Firestore로 업로드
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

  // Persist habits
  useEffect(() => {
    store.set("dm_habits", habits);
    if (authUser && syncReadyRef.current) saveSettings(authUser.uid, { habits }).catch(() => {});
  }, [habits, authUser]);

  // Persist recurringTasks
  useEffect(() => {
    store.set("dm_recurring", recurringTasks);
    if (authUser && syncReadyRef.current) saveSettings(authUser.uid, { recurringTasks }).catch(() => {});
  }, [recurringTasks, authUser]);

  // Apply notifications (GUARDED)
  useEffect(() => {
    scheduler.apply(notifEnabled, user.name || "사용자", telegramCfg, alarmTimes);
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
    window.history.replaceState(null,'',`?screen=detail&date=${ds}`);
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

    // 삭제된 할일의 Calendar 이벤트 제거
    const newTaskIds = new Set(tasks.map(t => t.id));
    prevTasks.filter(t => t.gcalEventId && !newTaskIds.has(t.id))
      .forEach(t => gcalDeleteEvent(token, t.gcalEventId).catch(() => {}));

    // 새로 추가된 할일을 Calendar에 생성
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
            <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.7, marginTop: 10 }}>
              매일 “할 일 3가지”만 정하고<br/>체크하고, 일기 한 줄로 마무리.
            </div>
          </div>

          <div style={S.card}>
            <div style={{ fontSize: 12, color: "var(--dm-sub)", fontWeight: 900, marginBottom: 8 }}>이름</div>
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

          <div style={{ padding: "0 22px", color: "var(--dm-muted)", fontSize: 12, lineHeight: 1.7 }}>
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
          onToggleTask={(id) => setTodayData(prev => ({
            ...prev,
            tasks: prev.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t),
          }))}
          goalChecks={goalChecks}
          onToggleGoal={onToggleGoal}
          onSetTodayTasks={onSetTodayTasks}
          onSaveMonthGoals={onSaveMonthGoals}
          habits={habits}
          onToggleHabit={onToggleHabit}
          onOpenDate={openDetail}
          onOpenDateMemo={openDetailMemo}
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
          plans={plans}
        />
      );
    }
    if (screen === "history") {
      return <History plans={plans} onOpenDate={openDetail} habits={habits} />;
    }
    if (screen === "stats") {
      return <Stats plans={plans} habits={habits} />;
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
          setData={setDetailData}
          onBack={() => changeScreen("history")}
          toast={toast}
          setToast={setToast}
          habits={habits}
          scrollToMemo={scrollToMemo}
          getValidGcalToken={getValidGcalToken}
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
          habits={habits}
          setHabits={setHabits}
          recurringTasks={recurringTasks}
          setRecurringTasks={setRecurringTasks}
          installPrompt={installPrompt}
          handleInstall={handleInstall}
          gcalToken={gcalToken}
          gcalTokenExp={gcalTokenExp}
          onGcalConnect={connectGcal}
          onGcalDisconnect={disconnectGcal}
          onGcalPull={pullFromGcal}
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
        {showInstallBanner && (
          <div style={{
            position: "fixed", bottom: 90, left: 16, right: 16, zIndex: 300,
            background: "var(--dm-card)", border: "1.5px solid #4B6FFF",
            borderRadius: 16, padding: "14px 16px",
            display: "flex", alignItems: "center", gap: 12,
            boxShadow: "0 4px 24px rgba(75,111,255,.3)",
          }}>
            <div style={{ fontSize: 28 }}>📲</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>홈 화면에 설치하기</div>
              <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 2 }}>앱처럼 빠르게 실행돼요</div>
            </div>
            <button onClick={handleInstall} style={{
              padding: "8px 14px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg,#4B6FFF,#6C8EFF)", color: "#fff",
              fontSize: 12, fontWeight: 900, cursor: "pointer", flexShrink: 0,
            }}>설치</button>
            <button onClick={() => setShowInstallBanner(false)} style={{
              background: "transparent", border: "none", color: "var(--dm-muted)",
              fontSize: 18, cursor: "pointer", padding: 4, flexShrink: 0, lineHeight: 1,
            }}>✕</button>
          </div>
        )}
        {screen === "home" && (
          <button
            onClick={() => setIsDark(v => !v)}
            style={{ position:"fixed", top:14, right:16, width:38, height:38, borderRadius:999,
              border:"1.5px solid var(--dm-border)", background:"var(--dm-card)", fontSize:18,
              cursor:"pointer", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:"0 2px 12px rgba(0,0,0,.25)" }}>
            {isDark ? "☀️" : "🌙"}
          </button>
        )}
      </div>
    </div>
  );
}