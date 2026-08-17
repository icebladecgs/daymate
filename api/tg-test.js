// Vercel Serverless Function — 텔레그램 테스트 메시지 전송
// 클라이언트가 직접 텔레그램 API를 호출하지 않도록 서버에서 봇 토큰을 관리한다.

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function ensureAdminApp() {
  if (!getApps().length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    initializeApp({ credential: cert(sa) });
  }
}

function getDb() {
  ensureAdminApp();
  return getFirestore();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { uid, text } = req.body || {};
  if (!uid) return res.status(400).json({ ok: false, error: 'uid 필요' });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return res.status(500).json({ ok: false, error: '봇 토큰 미설정' });

  // 요청자가 실제로 이 uid의 로그인 당사자인지 Firebase ID 토큰으로 검증
  // (검증 없이 uid만 신뢰하면 남의 uid를 넣어 그 사람 텔레그램으로 메시지를 강제 발송할 수 있음)
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) return res.status(401).json({ ok: false, error: '인증이 필요해요' });

  try {
    ensureAdminApp();
    const decoded = await getAuth().verifyIdToken(idToken);
    if (decoded.uid !== uid) return res.status(403).json({ ok: false, error: '권한이 없어요' });
  } catch {
    return res.status(401).json({ ok: false, error: '인증이 만료됐어요' });
  }

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
