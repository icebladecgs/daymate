// Vercel Serverless Function — DayMate Telegram 알림
// 환경변수: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, FINNHUB_KEY, USER_NAME, SELECTED_ASSETS, NOTIFY_TYPE, ANTHROPIC_API_KEY
// Firebase Admin 연동: FIREBASE_SERVICE_ACCOUNT (JSON), FIREBASE_USER_UID

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';

const ASSET_META = {
  BTC:  { label: '비트코인',      src: 'coingecko' },
  ETH:  { label: '이더리움',      src: 'coingecko' },
  TSLA: { label: '테슬라',        src: 'finnhub' },
  GOOGL:{ label: '구글',          src: 'finnhub' },
  IVR:  { label: 'IVR',           src: 'finnhub' },
  QQQ:  { label: '나스닥100(QQQ)', src: 'finnhub' },
};

function getDb() {
  if (!getApps().length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    initializeApp({ credential: cert(sa) });
  }
  return getFirestore();
}

async function sendTelegramMessage(botToken, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.description || `HTTP ${res.status}`);
  return json;
}

async function fetchMarketData(finnhubKey, assets, customRegistry = {}) {
  const data = {};
  const registry = { ...ASSET_META, ...customRegistry }; // 통합 레지스트리

  // CoinGecko (preset BTC/ETH + custom crypto)
  const geckoCoins = assets
    .filter(sym => registry[sym]?.src === 'coingecko')
    .map(sym => ({
      sym,
      coinId: registry[sym].coinId || (sym === 'BTC' ? 'bitcoin' : sym === 'ETH' ? 'ethereum' : null),
      label: registry[sym].label,
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
  // KST 기준 날짜
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;
  let text = `📊 <b>${userName}님의 아침 자산 브리핑</b> (${dateStr})\n`;
  text += `━━━━━━━━━━━━━━━\n`;

  const fmtPrice = (n) =>
    n == null ? 'N/A' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtChg = (chgPct, change) => {
    if (chgPct == null) return '';
    const arrow = chgPct >= 0 ? '▲' : '▼';
    const pct = `${chgPct >= 0 ? '+' : ''}${Number(chgPct).toFixed(2)}%`;
    const chgStr = change != null ? ` (${change >= 0 ? '+' : ''}$${Math.abs(Number(change)).toFixed(2)})` : '';
    return ` ${arrow} ${pct}${chgStr}`;
  };

  // crypto (src='coingecko') 먼저
  const cryptoSyms = Object.keys(marketData).filter(s => marketData[s].src === 'coingecko');
  for (const sym of cryptoSyms) {
    const d = marketData[sym];
    const icon = sym === 'BTC' ? '₿' : sym === 'ETH' ? 'Ξ' : '🪙';
    text += `${icon} <b>${d.label}</b>: $${fmtPrice(d.price)}${fmtChg(d.chgPct)}\n`;
  }

  // 주식 (src='finnhub') 나중
  const stockSyms = Object.keys(marketData).filter(s => marketData[s].src === 'finnhub');
  if (stockSyms.length > 0) {
    text += `━━━━━━━━━━━━━━━\n`;
    for (const sym of stockSyms) {
      const d = marketData[sym];
      text += `📈 <b>${d.label}</b>: $${fmtPrice(d.price)}${fmtChg(d.chgPct, d.change)}\n`;
    }
  }
  text += `━━━━━━━━━━━━━━━\n좋은 하루 되세요! 🌅\n\n<a href="https://daymate-beta.vercel.app">📱 DayMate 열기</a>`;
  return text;
}

function buildTodoReminderText(userName) {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;
  return `📋 <b>${userName}님, 오늘의 할일을 확인하세요!</b> (${dateStr})\n\nDayMate를 열어 오늘 하루를 계획해보세요. 💪\n\n<a href="https://daymate-beta.vercel.app">📱 DayMate 열기</a>`;
}

const CRYPTO_KEYWORD_MAP = {
  BTC: ['bitcoin', 'btc'], ETH: ['ethereum', 'eth'], SOL: ['solana', 'sol'],
  XRP: ['xrp', 'ripple'], ADA: ['cardano', 'ada'], DOGE: ['dogecoin', 'doge'],
  MATIC: ['polygon', 'matic'], AVAX: ['avalanche', 'avax'], DOT: ['polkadot', 'dot'],
  LINK: ['chainlink', 'link'],
};
function isCrypto(sym) { return sym.toUpperCase() in CRYPTO_KEYWORD_MAP; }
function cryptoKeywords(sym) { return CRYPTO_KEYWORD_MAP[sym.toUpperCase()] || [sym.toLowerCase()]; }

async function fetchNewsDigest(finnhubKey, symbols) {
  if (!finnhubKey || !symbols?.length) return null;

  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const toDate = today.toISOString().slice(0, 10);
  const fromDate = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 종목별 뉴스 수집
  const newsMap = {};
  for (const sym of symbols) {
    try {
      let articles = [];
      if (isCrypto(sym)) {
        const r = await fetch(`https://finnhub.io/api/v1/news?category=crypto&token=${finnhubKey}`);
        const j = await r.json();
        const kws = cryptoKeywords(sym);
        articles = (Array.isArray(j) ? j : [])
          .filter(a => kws.some(kw => a.headline?.toLowerCase().includes(kw)))
          .slice(0, 2);
      } else {
        const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${fromDate}&to=${toDate}&token=${finnhubKey}`);
        const j = await r.json();
        articles = (Array.isArray(j) ? j : []).slice(0, 2);
      }
      if (articles.length > 0) newsMap[sym] = articles.map(a => a.headline);
    } catch {}
  }
  if (Object.keys(newsMap).length === 0) return null;

  // Claude로 한국어 한 줄 요약
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const lines = Object.entries(newsMap)
      .flatMap(([sym, headlines]) => headlines.map(h => `[${sym}] ${h}`))
      .join('\n');
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: `다음 영문 주식/코인 뉴스 헤드라인들을 각각 한국어로 한 줄씩 간결하게 번역/요약해줘. 형식: "[심볼] 요약"\n\n${lines}` }],
    });
    const summaryText = res.content.find(b => b.type === 'text')?.text || '';
    const summaryLines = summaryText.trim().split('\n').filter(Boolean);

    // 심볼별로 재매핑
    const result = {};
    for (const line of summaryLines) {
      const m = line.match(/\[(\w+)\]\s*(.+)/);
      if (m) {
        if (!result[m[1]]) result[m[1]] = [];
        result[m[1]].push(m[2].trim());
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    // Claude 실패 시 원문 그대로
    return Object.fromEntries(Object.entries(newsMap).map(([sym, h]) => [sym, h.slice(0, 1)]));
  }
}

async function handleMorningGreeting(botToken, chatId, uid, userName, selectedAssets = []) {
  if (!botToken || !chatId || !uid) return { ok: false, error: '환경변수 누락' };
  const db = getDb();

  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const pad2 = n => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const dateLabel = `${today.getMonth() + 1}월 ${today.getDate()}일`;

  const snap = await db.doc(`users/${uid}/days/${todayStr}`).get();
  const tasks = (snap.data()?.tasks || []).filter(t => t.title?.trim());

  let msg = `🌅 <b>좋은 아침이에요, ${userName}님!</b> (${dateLabel})\n\n`;

  if (tasks.length === 0) {
    msg += `📋 오늘 할일이 아직 없어요.\n오늘 뭐 할 예정인지 알려주세요!`;
  } else {
    const done = tasks.filter(t => t.done).length;
    msg += `📋 <b>오늘 할일</b> (${done}/${tasks.length})\n`;
    tasks.forEach((t, i) => {
      msg += `${t.done ? '✅' : `${i + 1}.`} ${t.title}\n`;
    });
    msg += `\n추가할 내용이 있으면 바로 말씀해주세요!`;
  }

  // 뉴스 브리핑 추가
  try {
    const newsDigest = await fetchNewsDigest(process.env.FINNHUB_KEY, selectedAssets);
    if (newsDigest && Object.keys(newsDigest).length > 0) {
      msg += `\n\n📰 <b>관심 종목 뉴스</b>\n`;
      for (const [sym, summaries] of Object.entries(newsDigest)) {
        msg += `\n🔹 <b>${sym}</b>\n`;
        summaries.forEach(s => { msg += `  · ${s}\n`; });
      }
    }
  } catch {}

  await sendTelegramMessage(botToken, chatId, msg);
  return { ok: true, tasks: tasks.length };
}

async function handleInvestReview(botToken, chatId, uid) {
  if (!botToken || !chatId || !uid) return { ok: false, error: '환경변수 누락' };
  const db = getDb();
  const snap = await db.collection('users').doc(uid).collection('invest_logs').get();
  const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const now = Date.now();
  const needReview3 = logs.filter(l => {
    if (l.review) return false;
    const diff = (now - new Date(l.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 3 && diff < 4;
  });
  const needReview7 = logs.filter(l => {
    if (l.review) return false;
    const diff = (now - new Date(l.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 7 && diff < 8;
  });
  if (needReview3.length === 0 && needReview7.length === 0) return { ok: true, reason: 'no pending reviews' };
  let msg = `📊 <b>투자일기 복기 알림</b>\n\n`;
  if (needReview3.length > 0) {
    msg += `⏰ <b>3일 경과 — 복기할 시간이에요!</b>\n`;
    needReview3.forEach(l => { msg += `  • ${l.date} ${l.asset} <b>${l.action}</b> — ${l.reason}\n`; });
    msg += `\n`;
  }
  if (needReview7.length > 0) {
    msg += `🔔 <b>7일 경과 — 마지막 복기 기회!</b>\n`;
    needReview7.forEach(l => { msg += `  • ${l.date} ${l.asset} <b>${l.action}</b> — ${l.reason}\n`; });
    msg += `\n`;
  }
  msg += `<a href="https://daymate-beta.vercel.app">📱 DayMate에서 복기하기</a>`;
  await sendTelegramMessage(botToken, chatId, msg);
  return { ok: true, review3: needReview3.length, review7: needReview7.length };
}

export default async function handler(req, res) {
  // cron 보안: Vercel이 보내는 Authorization 헤더 확인
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let botToken = process.env.TELEGRAM_BOT_TOKEN;
  let chatId   = process.env.TELEGRAM_CHAT_ID;
  let finnhubKey = process.env.FINNHUB_KEY || '';
  let userName = process.env.USER_NAME || '사용자';
  let selectedAssets = (process.env.SELECTED_ASSETS || Object.keys(ASSET_META).join(',')).split(',').map(s => s.trim()).filter(Boolean);
  let customRegistry = {};
  const notifyType = process.env.NOTIFY_TYPE || req.query.type || 'briefing';

  // Firebase Admin으로 Firestore에서 유저 텔레그램 설정 읽기
  // Vercel env vars에 추가 필요:
  //   FIREBASE_SERVICE_ACCOUNT — Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 → JSON 내용 전체
  //   FIREBASE_USER_UID       — Firebase Auth에서 본인 UID
  const uid = process.env.FIREBASE_USER_UID;
  if (uid && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const db = getDb();
      const doc = await db.collection('users').doc(uid).collection('data').doc('settings').get();
      if (doc.exists) {
        const tg = doc.data()?.telegram;
        if (tg) {
          if (tg.botToken) botToken = tg.botToken;
          if (tg.chatId) chatId = tg.chatId;
          // finnhubKey는 서버 환경변수(FINNHUB_KEY)만 사용 — Firestore에서 읽지 않음
          if (tg.assets?.length) selectedAssets = tg.assets;
          if (tg.customAssets?.length) {
            customRegistry = Object.fromEntries(tg.customAssets.map(a => [a.sym, a]));
            // 선택된 자산에 커스텀 자산도 포함
            selectedAssets = [...new Set([...selectedAssets, ...tg.customAssets.map(a => a.sym)])];
          }
        }
      }
    } catch (e) {
      // Firestore 실패 시 env var 값 사용
      console.error('Firestore read failed:', e.message);
    }
  }

  if (!botToken || !chatId) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 환경변수 없음' });
  }

  try {
    if (notifyType === 'morning') {
      const result = await handleMorningGreeting(botToken, chatId, uid, userName, selectedAssets);
      return res.status(200).json(result);
    }
    if (notifyType === 'invest-review') {
      const uid = process.env.FIREBASE_USER_UID;
      const result = await handleInvestReview(botToken, chatId, uid);
      return res.status(200).json(result);
    }
    let text;
    if (notifyType === 'todo') {
      text = buildTodoReminderText(userName);
    } else {
      const marketData = await fetchMarketData(finnhubKey, selectedAssets, customRegistry);
      text = buildBriefingText(marketData, userName);

      // 자산 브리핑에 뉴스 추가
      if (selectedAssets.length > 0) {
        try {
          const newsDigest = await fetchNewsDigest(finnhubKey, selectedAssets);
          if (newsDigest && Object.keys(newsDigest).length > 0) {
            text += `\n\n📰 <b>관심 종목 뉴스</b>\n`;
            for (const [sym, summaries] of Object.entries(newsDigest)) {
              text += `\n🔹 <b>${sym}</b>\n`;
              summaries.forEach(s => { text += `  · ${s}\n`; });
            }
          }
        } catch {}
      }
    }

    await sendTelegramMessage(botToken, chatId, text);
    return res.status(200).json({ ok: true, type: notifyType });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
