// Vercel Serverless — Yahoo Finance 한국 주식 검색 프록시
export default async function handler(req, res) {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(200).json({ result: [] });

  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=ko-KR&region=KR&newsCount=0&quotesCount=10`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const j = await r.json();
    const result = (j.quotes || [])
      .filter(q => q.quoteType === 'EQUITY' && /\.(KS|KQ)$/.test(q.symbol))
      .slice(0, 6)
      .map(q => ({
        sym: q.symbol,
        label: q.shortname || q.longname || q.symbol,
        src: 'yahoo',
      }));
    res.status(200).json({ result });
  } catch {
    res.status(200).json({ result: [] });
  }
}
