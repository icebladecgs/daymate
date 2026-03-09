import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '');
const UID = process.env.FIREBASE_USER_UID;

async function send(text) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
  });
}

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok');

  const body = req.body;
  const msg = body?.message;
  if (!msg) return res.status(200).send('ok');

  // 보안: 내 채팅에서 온 메시지만 처리
  if (String(msg.chat?.id) !== CHAT_ID) return res.status(200).send('ok');

  const text = (msg.text || '').trim();
  const today = toDateStr();

  try {
    if (text === '/today' || text === '/할일') {
      const snap = await db.doc(`users/${UID}/days/${today}`).get();
      const d = snap.data();
      const tasks = (d?.tasks || []).filter(t => t.title?.trim());
      if (tasks.length === 0) {
        await send(`📋 <b>오늘 할일 없음</b>\n\nDayMate에서 추가해보세요 ✏️`);
      } else {
        const done = tasks.filter(t => t.done).length;
        let reply = `📋 <b>오늘 할일</b> (${done}/${tasks.length} 완료)\n\n`;
        tasks.forEach((t, i) => {
          reply += `${t.done ? '✅' : `${i + 1}️⃣`} ${t.title}\n`;
        });
        await send(reply);
      }
    } else if (text.startsWith('/done ') || text.startsWith('/완료 ')) {
      const num = parseInt(text.split(' ')[1], 10);
      const snap = await db.doc(`users/${UID}/days/${today}`).get();
      const d = snap.data();
      const tasks = (d?.tasks || []).filter(t => t.title?.trim());
      if (!num || num < 1 || num > tasks.length) {
        await send(`❌ 번호가 올바르지 않아요. 1~${tasks.length} 사이로 입력해주세요.`);
      } else {
        const allTasks = d?.tasks || [];
        const filledTasks = allTasks.filter(t => t.title?.trim());
        const target = filledTasks[num - 1];
        const updated = allTasks.map(t => t.id === target.id ? { ...t, done: true, checkedAt: new Date().toISOString() } : t);
        await db.doc(`users/${UID}/days/${today}`).set({ ...d, tasks: updated }, { merge: true });
        await send(`✅ <b>${target.title}</b> 완료!`);
      }
    } else if (text === '/stats' || text === '/통계') {
      const snaps = await db.collection(`users/${UID}/days`).orderBy('__name__', 'desc').limit(7).get();
      let reply = `📊 <b>최근 7일 통계</b>\n\n`;
      snaps.docs.forEach(doc => {
        const d = doc.data();
        const tasks = (d.tasks || []).filter(t => t.title?.trim());
        const done = tasks.filter(t => t.done).length;
        reply += `${doc.id}: ${done}/${tasks.length} `;
        reply += tasks.length > 0 && done === tasks.length ? '🌟\n' : '\n';
      });
      await send(reply);
    } else if (text === '/help' || text === '/도움') {
      await send(
        `🤖 <b>DayMate 명령어</b>\n\n` +
        `/today — 오늘 할일 조회\n` +
        `/done N — N번 할일 완료 처리\n` +
        `/stats — 최근 7일 통계\n` +
        `/help — 도움말`
      );
    } else {
      await send(`❓ 모르는 명령어예요.\n/help 로 명령어 목록을 확인하세요.`);
    }
  } catch (e) {
    await send(`⚠️ 오류가 발생했어요: ${e.message}`);
  }

  res.status(200).send('ok');
}
