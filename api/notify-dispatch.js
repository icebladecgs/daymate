// Vercel Cron (5분마다, 2026-11-12 Pro 전환) — 서버 알림을 사용자가 정한 시간에 보낸다.
// 시간표·계산은 src/utils/notifySchedule.js 한 곳. 실제 보내기는 예전 함수(push-morning·notify·push-cron·smart-notify)를 그대로 부른다.
// 보낸 날짜는 notifyLog/{uid}(서버만 — 보안 규칙에 match가 없어 앱은 못 읽고 못 씀)에 남겨 하루 한 번만 보낸다.
// 보내기가 실패하면(5xx·연결 실패) 기록을 되돌려 5분 뒤 다시 해 본다(정한 시각부터 15분 안).
// 지금은 예전과 같이 FIREBASE_USER_UID 한 계정만 — 여러 사용자 서버 알림은 따로 설계(동의·계정별 등록) 후.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { dueJobs, kstNow } from '../src/utils/notifySchedule.js';

function getDb() {
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  return getFirestore();
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  const uid = process.env.FIREBASE_USER_UID;
  if (!uid) return res.status(500).json({ error: 'No UID' });

  const db = getDb();
  const now = kstNow();
  const logRef = db.doc(`notifyLog/${uid}`);
  try {
    const [settingsSnap, logSnap] = await Promise.all([db.doc(`users/${uid}/data/settings`).get(), logRef.get()]);
    const settings = settingsSnap.data() || {};
    const jobs = dueJobs(settings, now, logSnap.data()?.sent || {});
    if (!jobs.length) return res.status(200).json({ ok: true, now, sent: [] });

    // 운영 주소로 부른다 — 배포별 주소(daymate-xxxx.vercel.app)는 Vercel 배포 보호에 막힐 수 있다 (push-morning의 날씨 조회와 같음)
    const base = process.env.DAYMATE_BASE_URL || 'https://daymate-beta.vercel.app';
    const results = [];
    for (const job of jobs) {
      // 먼저 "보냄"으로 표시(동시에 두 번 돌아도 한 번만) — 트랜잭션으로 오늘 이미 표시돼 있으면 건너뛴다
      const claimed = await db.runTransaction(async (tx) => {
        const cur = (await tx.get(logRef)).data()?.sent?.[job.id];
        if (cur === now.ds) return false;
        tx.set(logRef, { sent: { [job.id]: now.ds } }, { merge: true });
        return true;
      });
      if (!claimed) continue;
      let status = 0;
      try {
        const r = await fetch(base + job.path, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(50_000) });
        status = r.status;
      } catch (e) {
        console.error(`[notify-dispatch] ${job.id} call failed:`, e?.message);
      }
      // 서버 오류·연결 실패면 기록을 되돌려 다음 5분에 다시. 4xx(구독 없음 등)는 다시 해도 같아서 그대로 둔다
      if (status === 0 || status >= 500) {
        await logRef.set({ sent: { [job.id]: null } }, { merge: true });
      }
      results.push({ id: job.id, status });
    }
    console.log(`[notify-dispatch] ${now.ds} ${now.min}:`, JSON.stringify(results));
    return res.status(200).json({ ok: true, now, sent: results });
  } catch (e) {
    console.error('[notify-dispatch] failed:', e?.message);
    return res.status(500).json({ ok: false, error: e?.message });
  }
}
