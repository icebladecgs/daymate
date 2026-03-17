// Vercel Cron — 저녁 할 일 미완료 푸시 알림 (KST 21:00)
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
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const uid = process.env.FIREBASE_USER_UID;
  if (!uid) return res.status(500).json({ error: 'No UID' });

  try {
    // 구독 정보
    const settingsSnap = await db.doc(`users/${uid}/data/settings`).get();
    const sub = settingsSnap.data()?.pushSubscription;
    if (!sub) return res.status(200).json({ ok: false, reason: 'no subscription' });

    // 오늘 날짜 (KST)
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // 오늘 할 일 조회
    const daySnap = await db.doc(`users/${uid}/days/${dateStr}`).get();
    const tasks = daySnap.data()?.tasks || [];
    const total = tasks.filter(t => t.title?.trim()).length;
    const done = tasks.filter(t => t.done).length;

    // 모두 완료했으면 알림 안 보냄
    if (total > 0 && done >= total) {
      return res.status(200).json({ ok: true, reason: 'all done' });
    }

    const remaining = total - done;
    const body = total === 0
      ? '오늘 할 일을 아직 설정하지 않았어요 📝'
      : `${done}/${total} 완료 · ${remaining}개 남았어요. 오늘 마무리해볼까요? 💪`;

    await webpush.sendNotification(sub, JSON.stringify({
      title: 'DayMate 오늘 할 일',
      body,
      url: 'https://daymate-beta.vercel.app',
    }));

    res.status(200).json({ ok: true, remaining });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
