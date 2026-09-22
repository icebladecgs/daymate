// FCM Web Push 전송 — VAPID 방식
import webpush from 'web-push';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

webpush.setVapidDetails(
  'mailto:daymate@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  const { uid, title, body } = req.body || {};
  if (!uid || !title) return res.status(400).json({ ok: false });

  // 요청자가 실제로 이 uid의 로그인 당사자인지 Firebase ID 토큰으로 검증
  // (검증 없이 uid만 신뢰하면 남의 uid로 임의 내용의 푸시를 강제 발송할 수 있음)
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) return res.status(401).json({ ok: false, error: '인증이 필요해요' });
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    if (decoded.uid !== uid) return res.status(403).json({ ok: false, error: '권한이 없어요' });
  } catch {
    return res.status(401).json({ ok: false, error: '인증이 만료됐어요' });
  }

  try {
    const snap = await db.doc(`users/${uid}/data/settings`).get();
    const sub = snap.data()?.pushSubscription;
    if (!sub) return res.status(404).json({ ok: false, reason: 'no subscription' });

    await webpush.sendNotification(sub, JSON.stringify({ title, body }));
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[push] notification send failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
