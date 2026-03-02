// Vercel Serverless Function — DayMate Telegram 알림
// 환경변수: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, FINNHUB_KEY, USER_NAME, SELECTED_ASSETS, NOTIFY_TYPE

const ASSET_META = {
  BTC:  { label: '비트코인',      src: 'coingecko' },
  ETH:  { label: '이더리움',      src: 'coingecko' },
  TSLA: { label: '테슬라',        src: 'finnhub' },
  GOOGL:{ label: '구글',          src: 'finnhub' },
  IVR:  { label: 'IVR',           src: 'finnhub' },
  QQQ:  { label: '나스닥100(QQQ)', src: 'finnhub' },
};

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

async function fetchMarketData(finnhubKey, assets) {
  const data = {};
  const assetSet = new Set(assets);

  // CoinGecko (BTC, ETH)
  const needBTC = assetSet.has('BTC'), needETH = assetSet.has('ETH');
  if (needBTC || needETH) {
    try {
      const ids = [needBTC && 'bitcoin', needETH && 'ethereum'].filter(Boolean).join(',');
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
      const j = await r.json();
      if (needBTC) data.BTC = { label: '비트코인', price: j.bitcoin?.usd, chgPct: j.bitcoin?.usd_24h_change };
      if (needETH) data.ETH = { label: '이더리움', price: j.ethereum?.usd, chgPct: j.ethereum?.usd_24h_change };
    } catch {}
  }

  // Finnhub (TSLA, GOOGL, IVR, QQQ)
  if (finnhubKey) {
    const stocks = ['TSLA', 'GOOGL', 'IVR', 'QQQ'].filter(s => assetSet.has(s));
    for (const sym of stocks) {
      try {
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`);
        const j = await r.json();
        if (j && j.c > 0) data[sym] = { label: ASSET_META[sym].label, price: j.c, change: j.d, chgPct: j.dp };
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

  for (const sym of ['BTC', 'ETH']) {
    const d = marketData[sym];
    if (d) {
      const icon = sym === 'BTC' ? '₿' : 'Ξ';
      text += `${icon} <b>${d.label}</b>: $${fmtPrice(d.price)}${fmtChg(d.chgPct)}\n`;
    }
  }
  const stockSyms = ['TSLA', 'GOOGL', 'IVR', 'QQQ'].filter(s => marketData[s]);
  if (stockSyms.length > 0) {
    text += `━━━━━━━━━━━━━━━\n`;
    for (const sym of stockSyms) {
      const d = marketData[sym];
      text += `📈 <b>${d.label}</b>: $${fmtPrice(d.price)}${fmtChg(d.chgPct, d.change)}\n`;
    }
  }
  text += `━━━━━━━━━━━━━━━\n좋은 하루 되세요! 🌅`;
  return text;
}

function buildTodoReminderText(userName) {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;
  return `📋 <b>${userName}님, 오늘의 할일을 확인하세요!</b> (${dateStr})\n\nDayMate를 열어 오늘 하루를 계획해보세요. 💪`;
}

export default async function handler(req, res) {
  // cron 보안: Vercel이 보내는 Authorization 헤더 확인
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;
  const finnhubKey = process.env.FINNHUB_KEY || '';
  const userName = process.env.USER_NAME || '사용자';
  const assetsRaw = process.env.SELECTED_ASSETS || Object.keys(ASSET_META).join(',');
  const selectedAssets = assetsRaw.split(',').map(s => s.trim()).filter(Boolean);
  const notifyType = process.env.NOTIFY_TYPE || req.query.type || 'briefing';

  if (!botToken || !chatId) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 환경변수 없음' });
  }

  try {
    let text;
    if (notifyType === 'todo') {
      text = buildTodoReminderText(userName);
    } else {
      const marketData = await fetchMarketData(finnhubKey, selectedAssets);
      text = buildBriefingText(marketData, userName);
    }

    await sendTelegramMessage(botToken, chatId, text);
    return res.status(200).json({ ok: true, type: notifyType });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
