// Vercel Cron — 투자일기 복기 알림 (KST 09:00)
// 3일 이상 된 미복기 기록이 있으면 텔레그램으로 알림

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

async function send(botToken, chatId, text) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;
  const uid      = process.env.FIREBASE_USER_UID;

  if (!botToken || !chatId || !uid) {
    return res.status(500).json({ error: '환경변수 누락' });
  }

  try {
    const snap = await db.collection('users').doc(uid).collection('invest_logs').get();
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const now = Date.now();

    // 3일 이상 됐는데 복기 안 된 것
    const needReview3 = logs.filter(l => {
      if (l.review) return false;
      const diff = (now - new Date(l.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 3 && diff < 4;
    });

    // 7일 이상 됐는데 복기 안 된 것
    const needReview7 = logs.filter(l => {
      if (l.review) return false;
      const diff = (now - new Date(l.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 7 && diff < 8;
    });

    if (needReview3.length === 0 && needReview7.length === 0) {
      return res.status(200).json({ ok: true, reason: 'no pending reviews' });
    }

    let msg = `📊 <b>투자일기 복기 알림</b>\n\n`;

    if (needReview3.length > 0) {
      msg += `⏰ <b>3일 경과 — 복기할 시간이에요!</b>\n`;
      needReview3.forEach(l => {
        msg += `  • ${l.date} ${l.asset} <b>${l.action}</b> — ${l.reason}\n`;
      });
      msg += `\n`;
    }

    if (needReview7.length > 0) {
      msg += `🔔 <b>7일 경과 — 마지막 복기 기회!</b>\n`;
      needReview7.forEach(l => {
        msg += `  • ${l.date} ${l.asset} <b>${l.action}</b> — ${l.reason}\n`;
      });
      msg += `\n`;
    }

    msg += `<a href="https://daymate-beta.vercel.app">📱 DayMate에서 복기하기</a>`;

    await send(botToken, chatId, msg);
    return res.status(200).json({ ok: true, review3: needReview3.length, review7: needReview7.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
