// Vercel Serverless — 시세 조회 프록시 (Finnhub + CoinGecko)
// 클라이언트에 FINNHUB_KEY를 노출하지 않기 위한 서버사이드 프록시

const ASSET_META = {
  BTC:  { label: '비트코인',       src: 'coingecko' },
  ETH:  { label: '이더리움',       src: 'coingecko' },
  TSLA: { label: '테슬라',         src: 'finnhub' },
  GOOGL:{ label: '구글',           src: 'finnhub' },
  IVR:  { label: 'IVR',            src: 'finnhub' },
  QQQ:  { label: '나스닥100(QQQ)', src: 'finnhub' },
};

const WX_DESC = {
  0:'맑음',1:'주로 맑음',2:'구름 조금',3:'흐림',
  45:'안개',48:'서리 안개',51:'가랑비',53:'보통 비',55:'강한 비',
  61:'약한 비',63:'보통 비',65:'강한 비',
  71:'약한 눈',73:'보통 눈',75:'강한 눈',
  80:'소나기',81:'강한 소나기',82:'폭우',
  95:'뇌우',96:'우박 뇌우',99:'강한 우박 뇌우',
};
const WX_ICON = {
  0:'☀️',1:'🌤',2:'⛅',3:'☁️',
  45:'🌫',48:'🌫',51:'🌦',53:'🌧',55:'🌧',
  61:'🌧',63:'🌧',65:'🌧',
  71:'🌨',73:'🌨',75:'❄️',
  80:'🌦',81:'🌧',82:'⛈',
  95:'⛈',96:'⛈',99:'⛈',
};

export default async function handler(req, res) {
  // ?type=weather&city=Seoul → 날씨 조회
  if (req.query.type === 'weather') {
    const city = (req.query.city || '').trim() || 'Seoul';
    try {
      const geo = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ko`,
        { headers: { 'User-Agent': 'DayMate/1.0' } }
      );
      const gj = await geo.json();
      const loc = gj.results?.[0];
      if (!loc) return res.status(200).json({ ok: false });

      const wx = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weathercode,windspeed_10m&timezone=auto`,
        { headers: { 'User-Agent': 'DayMate/1.0' } }
      );
      const wj = await wx.json();
      const c = wj.current;
      const code = c.weathercode;
      return res.status(200).json({
        ok: true,
        city: loc.name,
        temp: Math.round(c.temperature_2m),
        desc: WX_DESC[code] || '날씨 정보',
        icon: WX_ICON[code] || '🌡️',
        wind: Math.round(c.windspeed_10m),
      });
    } catch (error) {
      console.error('[market] weather lookup failed:', error);
      return res.status(200).json({ ok: false });
    }
  }

  // POST: { assets: string[], customRegistry: string (JSON) }
  const body = req.body || {};
  const assets = Array.isArray(body.assets) ? body.assets : [];
  let customRegistry = {};
  if (body.customRegistry) {
    try {
      customRegistry = typeof body.customRegistry === 'string'
        ? JSON.parse(body.customRegistry)
        : body.customRegistry;
    } catch {
      return res.status(400).json({ error: 'customRegistry must be valid JSON' });
    }
  }

  const finnhubKey = process.env.FINNHUB_KEY || '';
  const registry = { ...ASSET_META, ...customRegistry };
  const data = {};

  // CoinGecko
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
      const r = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
      );
      const j = await r.json();
      for (const { sym, coinId, label } of geckoCoins) {
        const coin = j[coinId];
        if (coin) data[sym] = { label, price: coin.usd, chgPct: coin.usd_24h_change, src: 'coingecko' };
      }
    } catch (error) {
      console.error('[market] coingecko price fetch failed:', error);
    }
  }

  // Finnhub
  if (finnhubKey) {
    const finnhubAssets = assets.filter(sym => registry[sym]?.src === 'finnhub');
    for (const sym of finnhubAssets) {
      try {
        const r = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${finnhubKey}`
        );
        const j = await r.json();
        if (j && j.c > 0) {
          data[sym] = { label: registry[sym].label, price: j.c, change: j.d, chgPct: j.dp, src: 'finnhub' };
        }
      } catch (error) {
        console.error(`[market] finnhub quote fetch failed for ${sym}:`, error);
      }
    }
  }

  // Yahoo Finance (한국 주식)
  const yahooAssets = assets.filter(sym => registry[sym]?.src === 'yahoo');
  for (const sym of yahooAssets) {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const j = await r.json();
      const meta = j?.chart?.result?.[0]?.meta;
      if (meta && meta.regularMarketPrice > 0) {
        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose || meta.previousClose || price;
        const change = price - prev;
        const chgPct = prev > 0 ? ((change / prev) * 100) : 0;
        data[sym] = {
          label: registry[sym].label,
          price,
          change,
          chgPct,
          src: 'yahoo',
          currency: meta.currency || 'KRW',
        };
      }
    } catch (error) {
      console.error(`[market] yahoo quote fetch failed for ${sym}:`, error);
    }
  }

  res.status(200).json(data);
}
