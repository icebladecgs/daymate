// Vercel Cron — 아침 할일 잠금화면 알림 (30분 간격, 사용자 설정 시간에 발송)
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

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function kstNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
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
    const settingsSnap = await db.doc(`users/${uid}/data/settings`).get();
    const settings = settingsSnap.data() || {};
    const sub = settings.pushSubscription;
    if (!sub) return res.status(404).json({ ok: false, reason: 'no subscription' });

    // 사용자 설정 시간 (기본 07:00)
    const targetTime = settings.alarmTimes?.pushMorning || '07:00';
    const [targetH, targetM] = targetTime.split(':').map(Number);

    // 현재 KST 시간과 비교 (±14분 이내)
    const now = kstNow();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const targetMinutes = targetH * 60 + targetM;
    if (Math.abs(nowMinutes - targetMinutes) > 14) {
      return res.status(200).json({ ok: true, reason: 'not the right time', now: `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`, target: targetTime });
    }

    // KST 기준 오늘 날짜
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 ${DOW[now.getDay()]}`;

    const daySnap = await db.doc(`users/${uid}/days/${dateStr}`).get();
    const tasks = (daySnap.data()?.tasks || []).filter(t => t.title?.trim());

    let title, body;
    if (tasks.length === 0) {
      title = `☀️ 좋은 아침! ${dateLabel}`;
      body = '오늘 할일을 아직 설정하지 않았어요. DayMate에서 계획해보세요 📝';
    } else {
      const done = tasks.filter(t => t.done).length;
      title = `☀️ ${dateLabel} · 할일 ${tasks.length}개`;
      const lines = tasks.map(t => `${t.done ? '✅' : '⬜'} ${t.title}`).join('\n');
      body = done > 0 ? `${done}/${tasks.length} 완료\n${lines}` : lines;
    }

    await webpush.sendNotification(sub, JSON.stringify({
      title,
      body,
      url: 'https://daymate-beta.vercel.app',
    }));

    res.status(200).json({ ok: true, tasks: tasks.length, sentAt: dateLabel });
  } catch (e) {
    console.error('[push-morning] failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
