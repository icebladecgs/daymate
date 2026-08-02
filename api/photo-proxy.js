// Vercel Serverless — Firebase Storage 이미지를 같은 출처(same-origin)로 프록시
// 브라우저 fetch()는 firebasestorage.googleapis.com에 CORS가 안 걸려있으면 바이트를 못 읽어오는데
// (표시용 <img src>는 CORS 필요 없지만 fetch로 blob을 뽑아 저장/공유하려면 필요),
// 서버→서버 요청은 CORS 제약이 없으므로 여기서 대신 받아 그대로 흘려보냄.
// SSRF 방지를 위해 우리 프로젝트의 Firebase Storage 버킷 URL만 허용.

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const url = req.query.url;
  const bucket = process.env.VITE_FB_STORAGE_BUCKET || '';
  const allowedPrefix = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/`;

  if (!bucket || typeof url !== 'string' || !url.startsWith(allowedPrefix)) {
    return res.status(400).json({ error: 'invalid url' });
  }

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(upstream.status).end();
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.status(200).send(buf);
  } catch (error) {
    console.error('[photo-proxy] failed:', error);
    res.status(500).json({ error: 'proxy failed' });
  }
}
