// Vercel Serverless — Finnhub 주식 심볼 검색 프록시
// 클라이언트에 FINNHUB_KEY를 노출하지 않기 위한 서버사이드 프록시

export default async function handler(req, res) {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(200).json({ result: [], count: 0 });

  const key = process.env.FINNHUB_KEY || '';
  if (!key) return res.status(200).json({ result: [], count: 0 });

  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${key}`
    );
    const j = await r.json();
    res.status(200).json(j);
  } catch {
    res.status(200).json({ result: [], count: 0 });
  }
}
