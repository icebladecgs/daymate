// FCM Web Push 전송 — VAPID 방식
import webpush from 'web-push';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
