// Vercel Cron — 저녁 스마트 알림 (KST 21:00)
// 오늘 상황을 분석해서 맞춤형 텔레그램 메시지 발송

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

function pad2(n) { return String(n).padStart(2, '0'); }

function toKSTDateStr() {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  return `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
}

async function send(botToken, chatId, text) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

// 개별 습관 스트릭 계산
async function calcHabitStreak(uid, habitId, today) {
  let streak = 0;
  let current = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  current.setDate(current.getDate() - 1); // 어제부터 역산 (오늘은 아직 체크 안 됐을 수 있음)

  while (streak < 60) {
    const ds = `${current.getFullYear()}-${pad2(current.getMonth() + 1)}-${pad2(current.getDate())}`;
    const snap = await db.doc(`users/${uid}/days/${ds}`).get();
    if (!snap.data()?.habitChecks?.[habitId]) break;
    streak++;
    current.setDate(current.getDate() - 1);
  }
  return streak;
}

function buildMessage(userName, tasks, done, total, habits, habitChecks, habitStreaks, hasJournal) {
  const remaining = total - done;
  const allTasksDone = total > 0 && done >= total;
  const doneHabits = habits.filter(h => habitChecks[h.id]).length;
  const allHabitsDone = habits.length === 0 || doneHabits >= habits.length;
  const remainingHabits = habits.filter(h => !habitChecks[h.id]);

  // 완벽한 날 달성
  if (allTasksDone && allHabitsDone && hasJournal) {
    return `🌟 <b>${userName}님, 오늘 완벽한 날이에요!</b>\n\n할일 · 습관 · 일기 모두 완료했습니다.\n대단해요! 내일도 화이팅 💪`;
  }

  // 할일 + 습관 완료, 일기만 남음
  if (allTasksDone && allHabitsDone && !hasJournal) {
    return `📝 <b>${userName}님, 일기만 쓰면 완벽한 날이에요!</b>\n\n할일과 습관은 모두 완료했어요.\n오늘 하루 짧게라도 기록해보세요 ✍️`;
  }

  let msg = `⏰ <b>${userName}님, 오늘 하루 마무리 체크!</b>\n\n`;

  // 할일 현황
  if (total === 0) {
    msg += `📋 오늘 할일이 없어요.\n`;
  } else if (allTasksDone) {
    msg += `✅ 할일 ${total}개 모두 완료!\n`;
  } else {
    msg += `📋 할일 <b>${done}/${total}</b> 완료`;
    if (remaining <= 2) {
      msg += ` — <b>${remaining}개만 더!</b>`;
    }
    msg += `\n`;
    // 미완료 항목 목록
    const undoneTasks = tasks.filter(t => t.title?.trim() && !t.done).slice(0, 3);
    undoneTasks.forEach(t => { msg += `  • ${t.title}\n`; });
  }

  // 습관 현황
  if (habits.length > 0) {
    if (allHabitsDone) {
      msg += `🎯 습관 모두 완료!\n`;
    } else {
      msg += `🎯 습관 <b>${doneHabits}/${habits.length}</b> 완료\n`;
      // 스트릭 끊길 위험 습관 강조
      const atRisk = remainingHabits.filter(h => (habitStreaks[h.id] || 0) >= 3);
      atRisk.forEach(h => {
        msg += `  🔥 ${h.icon || ''} ${h.name} — ${habitStreaks[h.id]}일 스트릭 위험!\n`;
      });
    }
  }

  // 일기
  if (!hasJournal) msg += `📔 일기 미작성\n`;

  // 마무리 멘트
  msg += `\n`;
  if (!allTasksDone && remaining === 1) {
    msg += `딱 1개만 더 하면 돼요! 할 수 있어요 💪`;
  } else if (!allTasksDone && done === 0) {
    msg += `아직 늦지 않았어요. 지금 시작해봐요! 🚀`;
  } else if (!allTasksDone) {
    msg += `조금만 더 힘내요! 거의 다 왔어요 🎯`;
  } else {
    msg += `할일은 다 했네요! 나머지도 마무리해봐요 ✨`;
  }

  msg += `\n\n<a href="https://daymate-beta.vercel.app">📱 DayMate 열기</a>`;
  return msg;
}

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;
  const uid      = process.env.FIREBASE_USER_UID;
  const userName = process.env.USER_NAME || '사용자';

  if (!botToken || !chatId || !uid) {
    return res.status(500).json({ error: '환경변수 누락' });
  }

  try {
    const today = toKSTDateStr();

    const [daySnap, settingsSnap] = await Promise.all([
      db.doc(`users/${uid}/days/${today}`).get(),
      db.doc(`users/${uid}/data/settings`).get(),
    ]);

    const dayData   = daySnap.data() || {};
    const tasks     = dayData.tasks || [];
    const habits    = settingsSnap.data()?.habits || [];
    const habitChecks = dayData.habitChecks || {};
    const hasJournal  = !!dayData.journal?.body?.trim();

    const filledTasks = tasks.filter(t => t.title?.trim());
    const total = filledTasks.length;
    const done  = filledTasks.filter(t => t.done).length;

    // 이미 완벽한 날 달성 시에도 응원 메시지는 보냄
    // 스트릭 계산 (미체크 습관만)
    const habitStreaks = {};
    const uncheckedHabits = habits.filter(h => !habitChecks[h.id]);
    await Promise.all(
      uncheckedHabits.map(async h => {
        habitStreaks[h.id] = await calcHabitStreak(uid, h.id, today);
      })
    );

    const text = buildMessage(userName, tasks, done, total, habits, habitChecks, habitStreaks, hasJournal);
    await send(botToken, chatId, text);

    return res.status(200).json({ ok: true, done, total });
  } catch (e) {
    console.error('[smart-notify] failed:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
