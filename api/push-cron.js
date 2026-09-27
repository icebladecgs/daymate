// Vercel Cron — 저녁 할 일 미완료 푸시 알림 (KST 21:00)
import webpush from 'web-push';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

// VAPID 키 — Vercel 환경변수를 붙여넣을 때 섞인 따옴표·줄바꿈·공백·끝의 '='를 정리하고,
// 일반 Base64(+,/)면 URL-safe(-,_)로 바꾼다. 그래도 잘못된 키면 함수가 통째로 죽지 않게 잡아서 알린다.
// (2026-09-27: 키 형식 오류로 이 함수가 켜질 때마다 죽어 푸시가 전부 조용히 실패하고 있었다)
const cleanVapidKey = (v) => String(v || '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '')
  .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
let vapidError = null;
try {
  webpush.setVapidDetails(
    'mailto:daymate@example.com',
    cleanVapidKey(process.env.VAPID_PUBLIC_KEY),
    cleanVapidKey(process.env.VAPID_PRIVATE_KEY)
  );
} catch (e) {
  vapidError = e.message;
  console.error('[push] VAPID 키 설정 오류 — Vercel 환경변수 VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY 확인 필요:', e.message);
}

export default async function handler(req, res) {
  if (vapidError) return res.status(500).json({ ok: false, error: `VAPID 키 설정 오류: ${vapidError}` });
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
    if (!sub) return res.status(404).json({ ok: false, reason: 'no subscription' });

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
    console.error('[push-cron] failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
