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

export default async function handler(req, res) {
  // POST: { assets: string[], customRegistry: string (JSON) }
  const body = req.body || {};
  const assets = Array.isArray(body.assets) ? body.assets : [];
  const customRegistry = body.customRegistry
    ? (typeof body.customRegistry === 'string' ? JSON.parse(body.customRegistry) : body.customRegistry)
    : {};

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
    } catch {}
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
      } catch {}
    }
  }

  res.status(200).json(data);
}
