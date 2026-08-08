// Vercel Serverless Function — 텔레그램 테스트 메시지 전송
// 클라이언트가 직접 텔레그램 API를 호출하지 않도록 서버에서 봇 토큰을 관리한다.

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getDb() {
  if (!getApps().length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    initializeApp({ credential: cert(sa) });
  }
  return getFirestore();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { uid, text } = req.body || {};
  if (!uid) return res.status(400).json({ ok: false, error: 'uid 필요' });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return res.status(500).json({ ok: false, error: '봇 토큰 미설정' });

  try {
    const db = getDb();
    const snap = await db.doc(`tg_users/${uid}`).get();
    const chatId = snap.exists ? snap.data()?.chatId : null;
    if (!chatId) return res.status(400).json({ ok: false, error: '텔레그램이 연결되어 있지 않아요' });

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text || '✅ DayMate 연결 테스트 메시지예요!', parse_mode: 'HTML' }),
    });
    const json = await tgRes.json();
    if (!tgRes.ok) return res.status(500).json({ ok: false, error: json.description || `HTTP ${tgRes.status}` });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
