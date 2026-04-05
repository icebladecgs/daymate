export const ASSET_META = {
  BTC:  { label: '비트코인',     src: 'coingecko' },
  ETH:  { label: '이더리움',     src: 'coingecko' },
  TSLA: { label: '테슬라',       src: 'finnhub' },
  GOOGL:{ label: '구글',         src: 'finnhub' },
  IVR:  { label: 'IVR',          src: 'finnhub' },
  QQQ:  { label: '나스닥100(QQQ)', src: 'finnhub' },
};

export async function sendTelegramMessage(botToken, chatId, text) {
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

export async function fetchMarketData(finnhubKey, assets = Object.keys(ASSET_META), customRegistry = {}) {
  const data = {};
  const registry = { ...ASSET_META, ...customRegistry };

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
    } catch (error) {
      console.error('[telegram] coingecko fetch failed:', error);
    }
  }

  if (finnhubKey) {
    const finnhubAssets = assets.filter(sym => registry[sym]?.src === 'finnhub');
    for (const sym of finnhubAssets) {
      try {
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`);
        const j = await r.json();
        if (j && j.c > 0) data[sym] = { label: registry[sym].label, price: j.c, change: j.d, chgPct: j.dp, src: 'finnhub' };
      } catch (error) {
        console.error(`[telegram] finnhub quote fetch failed for ${sym}:`, error);
      }
    }
  }
  return data;
}

export function buildBriefingText(marketData, userName, weather = null) {
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

  const cryptoSyms = Object.keys(marketData).filter(s => marketData[s].src === 'coingecko');
  for (const sym of cryptoSyms) {
    const d = marketData[sym];
    const icon = sym === 'BTC' ? '₿' : sym === 'ETH' ? 'Ξ' : '🪙';
    text += `${icon} <b>${d.label}</b>: ${fmtPrice(d.price)}${fmtChg(d.chgPct)}\n`;
  }

  const stockSyms = Object.keys(marketData).filter(s => marketData[s].src === 'finnhub');
  if (stockSyms.length > 0) {
    text += `━━━━━━━━━━━━━━━\n`;
    for (const sym of stockSyms) {
      const d = marketData[sym];
      text += `📈 <b>${d.label}</b>: ${fmtPrice(d.price)}${fmtChg(d.chgPct, d.change)}\n`;
    }
  }

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

export async function fetchMarketDataFromServer(assets, customRegistry = {}) {
  try {
    const r = await fetch('/api/market', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assets, customRegistry }),
    });
    if (!r.ok) return {};
    return await r.json();
  } catch (error) {
    console.error('[telegram] market proxy fetch failed:', error);
    return {};
  }
}

export async function searchFinnhub(_key, query) {
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const j = await r.json();
    return (j.result || [])
      .filter(item => item.type === 'Common Stock' || item.type === 'ETP')
      .slice(0, 6)
      .map(item => ({ sym: item.symbol, label: item.description, src: 'finnhub' }));
  } catch (error) {
    console.error('[telegram] finnhub search failed:', error);
    return [];
  }
}

export async function searchKoreanStock(query) {
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(query)}&src=kr`);
    const j = await r.json();
    return j.result || [];
  } catch (error) {
    console.error('[telegram] korean stock search failed:', error);
    return [];
  }
}

export async function searchCoinGecko(query) {
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
    const j = await r.json();
    return (j.coins || []).slice(0, 6).map(coin => ({
      sym: coin.symbol.toUpperCase(),
      label: coin.name,
      src: 'coingecko',
      coinId: coin.id,
    }));
  } catch (error) {
    console.error('[telegram] coingecko search failed:', error);
    return [];
  }
}
