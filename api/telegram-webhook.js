import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET_TOKEN = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN || '';
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function send(chatId, text) {
  if (!BOT_TOKEN || !chatId) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

// chatId로 uid 조회
async function getUidByChatId(chatId) {
  const snap = await db.collection('tg_users').where('chatId', '==', String(chatId)).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].id; // document ID = uid
}

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr() {
  // 한국 시간 기준
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

// 명령어 파싱: "/today@BotName" → "/today", "/done 1@BotName" → "/done 1"
// 슬래시 명령어에만 적용 — 일반 대화문(이메일 주소 등에 포함된 @)까지 건드리면 안 됨
function parseCommand(rawText) {
  if (!rawText.startsWith('/')) return rawText.trim();
  return rawText.replace(/@\S+/, '').trim();
}

async function getTodayData(today, uid) {
  const snap = await db.doc(`users/${uid}/days/${today}`).get();
  return snap.data() || {};
}

async function getRecentStats(uid) {
  const snaps = await db.collection(`users/${uid}/days`).orderBy('__name__', 'desc').limit(7).get();
  return snaps.docs.map(doc => {
    const d = doc.data();
    const tasks = (d.tasks || []).filter(t => t.title?.trim());
    const done = tasks.filter(t => t.done).length;
    return { date: doc.id, done, total: tasks.length };
  });
}

// Claude tool use로 DayMate 데이터 조작
async function askClaude(userMessage, today, uid) {
  const todayData = await getTodayData(today, uid);
  const recentStats = await getRecentStats(uid);
  const tasks = (todayData.tasks || []).filter(t => t.title?.trim());

  const systemPrompt = `당신은 DayMate 앱의 AI 어시스턴트입니다. 사용자의 하루 관리를 돕습니다.
한국어로 간결하게 답변하세요. HTML 태그 없이 일반 텍스트로만 응답하세요.

오늘(${today}) 현황:
- 할일: ${tasks.length === 0 ? '없음' : tasks.map((t, i) => `${i+1}. ${t.title} [${t.done ? '완료' : '미완료'}]`).join(', ')}
- 메모: ${todayData.memo?.trim() || '없음'}
- 일기: ${todayData.journal?.body?.trim() ? '작성됨' : '없음'}
- 최근 7일: ${recentStats.map(s => `${s.date}(${s.done}/${s.total})`).join(', ')}

사용 가능한 기능:
- 할일 추가/완료/삭제
- 메모 추가
- 현황 조회`;

  const tools = [
    {
      name: 'add_task',
      description: '오늘 할일을 추가합니다',
      input_schema: {
        type: 'object',
        properties: { title: { type: 'string', description: '할일 제목' } },
        required: ['title'],
      },
    },
    {
      name: 'complete_task',
      description: '할일을 완료 처리합니다',
      input_schema: {
        type: 'object',
        properties: { number: { type: 'number', description: '할일 번호 (1부터 시작)' } },
        required: ['number'],
      },
    },
    {
      name: 'delete_task',
      description: '할일을 삭제합니다',
      input_schema: {
        type: 'object',
        properties: { number: { type: 'number', description: '할일 번호 (1부터 시작)' } },
        required: ['number'],
      },
    },
    {
      name: 'add_memo',
      description: '오늘 메모에 내용을 추가합니다',
      input_schema: {
        type: 'object',
        properties: { content: { type: 'string', description: '추가할 메모 내용' } },
        required: ['content'],
      },
    },
    {
      name: 'toggle_habit',
      description: '습관을 완료 또는 취소 처리합니다',
      input_schema: {
        type: 'object',
        properties: {
          habit_name: { type: 'string', description: '습관 이름 (부분 일치 가능)' },
          done: { type: 'boolean', description: '완료 여부 (true=완료, false=취소)' },
        },
        required: ['habit_name', 'done'],
      },
    },
  ];

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    tools,
    messages: [{ role: 'user', content: userMessage }],
  });

  // tool use 처리 — 도구마다 트랜잭션으로 최신 기록을 다시 읽어 바꾼 칸만 저장한다(updateDay).
  // 할일 번호는 AI에게 보여 준 목록(todayData) 기준으로 찾는다 — 앞 도구가 지워도 번호가 밀리지 않게
  const toolResults = [];
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      const { message } = await executeTool(block.name, block.input, today, todayData, uid);
      toolResults.push({ toolName: block.name, result: message });
    }
  }

  // tool을 사용했으면 결과 포함해서 최종 응답 받기
  if (toolResults.length > 0) {
    const followUp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      tools,
      messages: [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: response.content
            .filter(b => b.type === 'tool_use')
            .map((b, i) => ({
              type: 'tool_result',
              tool_use_id: b.id,
              content: toolResults[i].result,
            })),
        },
      ],
    });
    return followUp.content.find(b => b.type === 'text')?.text || '완료했어요.';
  }

  return response.content.find(b => b.type === 'text')?.text || '죄송해요, 다시 말씀해주세요.';
}

// 하루 기록을 트랜잭션으로 고친다 — 봇이 AI 답을 기다리는 몇 초 사이에 앱에서 같은 날 기록을 고쳐도 덮어쓰지 않게
// (예전엔 처음 읽은 하루 기록 전체를 다시 저장했다, 2026-11-01 ChatGPT 검토로 발견).
// change(최신 기록) → { patch: 바꿀 칸만, message } (patch가 null이면 저장 안 함). _syncedAt은 다른 기기 반영용
async function updateDay(uid, today, change) {
  const ref = db.doc(`users/${uid}/days/${today}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const { patch, message } = change(snap.data() || {});
    if (patch) tx.set(ref, { ...patch, _syncedAt: FieldValue.serverTimestamp() }, { merge: true });
    return message;
  });
}

// 번호(AI에게 보여 준 목록 기준)로 고른 할일을 최신 기록에서 id로 찾아 고친다
function changeTaskById(id, title, edit, doneMsg) {
  return (day) => {
    const tasks = day.tasks || [];
    if (!tasks.some(t => t.id === id && t.title?.trim())) return { patch: null, message: `"${title}" 할일이 이미 없어요` };
    return { patch: { tasks: tasks.map(t => (t.id === id ? edit(t) : t)) }, message: doneMsg };
  };
}

async function executeTool(name, input, today, todayData, uid) {
  const filledTasks = (todayData.tasks || []).filter(t => t.title?.trim());

  if (name === 'add_task') {
    const newTask = { id: `t${Date.now()}`, title: input.title, done: false, checkedAt: null, priority: false };
    const message = await updateDay(uid, today, (day) => {
      const tasks = [...(day.tasks || [])];
      const emptyIdx = tasks.findIndex(t => !t.title?.trim());
      if (emptyIdx >= 0) tasks[emptyIdx] = newTask;
      else tasks.push(newTask);
      return { patch: { tasks }, message: `"${input.title}" 추가됨` };
    });
    return { message };
  }

  if (name === 'complete_task' || name === 'delete_task') {
    const target = filledTasks[input.number - 1];
    if (!target) return { message: `번호 ${input.number}번 할일이 없습니다` };
    const message = await updateDay(uid, today, name === 'complete_task'
      ? changeTaskById(target.id, target.title, t => ({ ...t, done: true, checkedAt: new Date().toISOString() }), `"${target.title}" 완료 처리됨`)
      : changeTaskById(target.id, target.title, t => ({ ...t, title: '', done: false }), `"${target.title}" 삭제됨`));
    return { message };
  }

  if (name === 'add_memo') {
    const message = await updateDay(uid, today, (day) => {
      const prev = day.memo || '';
      return { patch: { memo: prev ? [prev, input.content].join('\n') : input.content }, message: '메모 추가됨' };
    });
    return { message };
  }

  if (name === 'toggle_habit') {
    const settingsSnap = await db.doc(`users/${uid}/data/settings`).get();
    const habits = settingsSnap.data()?.habits || [];
    const target = habits.find(h => h.name.toLowerCase().includes(input.habit_name.toLowerCase()));
    if (!target) return { message: `"${input.habit_name}" 습관을 찾을 수 없습니다` };
    const message = await updateDay(uid, today, (day) => ({
      patch: { habitChecks: { ...(day.habitChecks || {}), [target.id]: input.done } },
      message: `"${target.name}" ${input.done ? '완료' : '취소'} 처리됨`,
    }));
    return { message };
  }

  return { message: '알 수 없는 도구' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok');

  if (!WEBHOOK_SECRET_TOKEN) {
    console.error('[telegram-webhook] TELEGRAM_WEBHOOK_SECRET_TOKEN not configured — rejecting all requests');
    return res.status(401).send('unauthorized');
  }
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
  if (secretHeader !== WEBHOOK_SECRET_TOKEN) {
    return res.status(401).send('unauthorized');
  }

  const body = req.body;
  const msg = body?.message;
  if (!msg) return res.status(200).send('ok');

  const fromChatId = String(msg.chat?.id);
  const rawText = (msg.text || '').trim();
  const text = parseCommand(rawText);
  const today = toDateStr();

  console.log(`[telegram] chatId=${fromChatId} text="${text}" today=${today}`);

  try {
    // ── 연결 코드 처리: /start CODE ──
    if (text.startsWith('/start')) {
      const code = text.split(' ')[1];
      if (code) {
        const connectSnap = await db.doc(`tg_connect/${code}`).get();
        // 연결 코드는 만든 뒤 10분만 쓸 수 있다 (2026-11-01) — 예전엔 쓰기 전까지 계속 살아 있어서,
        // 코드를 알아낸 사람이 자기 텔레그램을 남의 계정에 연결해 할일·메모를 볼 수 있었다.
        const createdMs = connectSnap.exists ? Date.parse(connectSnap.data().createdAt || '') : NaN;
        const fresh = Number.isFinite(createdMs) && Date.now() - createdMs < 10 * 60 * 1000;
        if (connectSnap.exists && !fresh) await db.doc(`tg_connect/${code}`).delete().catch(() => {});
        if (connectSnap.exists && fresh) {
          const { uid } = connectSnap.data();
          const firstName = msg.from?.first_name || '';
          await db.doc(`tg_users/${uid}`).set({ chatId: fromChatId, connectedAt: new Date().toISOString(), firstName });
          await db.doc(`tg_connect/${code}`).delete();
          await send(fromChatId,
            `✅ <b>DayMate 연결 완료!</b>\n\n` +
            `${firstName ? `${firstName}님, ` : ''}이제 텔레그램에서 DayMate를 바로 사용할 수 있어요.\n\n` +
            `<b>명령어</b>\n` +
            `/today — 오늘 할일 조회\n` +
            `/habit — 오늘 습관 조회\n` +
            `/done N — N번 완료 처리\n` +
            `/stats — 최근 7일 통계\n\n` +
            `또는 자연어로 말씀해주세요 💬`
          );
          return res.status(200).send('ok');
        }
      }
      // 코드 없거나 만료 → 앱에서 연결하도록 안내
      await send(fromChatId, code
        ? `⏰ 연결 코드가 만료됐거나 맞지 않아요.\n앱 설정 → 텔레그램에서 연결 버튼을 다시 눌러주세요(코드는 10분 동안 쓸 수 있어요).`
        : `👋 DayMate 봇이에요!\n앱 설정 → 텔레그램에서 연결 버튼을 눌러주세요.`);
      return res.status(200).send('ok');
    }

    // ── 일반 명령어: chatId로 uid 조회 ──
    const uid = await getUidByChatId(fromChatId);
    if (!uid) {
      await send(fromChatId, `🔗 아직 연결되지 않았어요.\nDayMate 앱 설정 → 텔레그램에서 연결해주세요.`);
      return res.status(200).send('ok');
    }

    if (text === '/today' || text === '/할일') {
      const snap = await db.doc(`users/${uid}/days/${today}`).get();
      const d = snap.data();
      const tasks = (d?.tasks || []).filter(t => t.title?.trim());
      if (tasks.length === 0) {
        await send(fromChatId, `📋 <b>오늘 할일 없음</b>\n\nDayMate에서 추가해보세요 ✏️`);
      } else {
        const done = tasks.filter(t => t.done).length;
        let reply = `📋 <b>오늘 할일</b> (${done}/${tasks.length} 완료)\n\n`;
        tasks.forEach((t, i) => { reply += `${t.done ? '✅' : `${i + 1}️⃣`} ${t.title}\n`; });
        await send(fromChatId, reply);
      }
    } else if (text.startsWith('/done ') || text.startsWith('/완료 ')) {
      const num = parseInt(text.split(' ')[1], 10);
      const snap = await db.doc(`users/${uid}/days/${today}`).get();
      const d = snap.data();
      const allTasks = d?.tasks || [];
      const filledTasks = allTasks.filter(t => t.title?.trim());
      if (!num || num < 1 || num > filledTasks.length) {
        await send(fromChatId, `❌ 번호가 올바르지 않아요. 1~${filledTasks.length} 사이로 입력해주세요.`);
      } else {
        const target = filledTasks[num - 1];
        const message = await updateDay(uid, today, changeTaskById(target.id, target.title, t => ({ ...t, done: true, checkedAt: new Date().toISOString() }), ''));
        await send(fromChatId, message || `✅ <b>${target.title}</b> 완료!`);
      }
    } else if (text === '/stats' || text === '/통계') {
      const snaps = await db.collection(`users/${uid}/days`).orderBy('__name__', 'desc').limit(7).get();
      let reply = `📊 <b>최근 7일 통계</b>\n\n`;
      snaps.docs.forEach(doc => {
        const d = doc.data();
        const tasks = (d.tasks || []).filter(t => t.title?.trim());
        const done = tasks.filter(t => t.done).length;
        reply += `${doc.id}: ${done}/${tasks.length} ${tasks.length > 0 && done === tasks.length ? '🌟' : ''}\n`;
      });
      await send(fromChatId, reply);
    } else if (text === '/habit' || text === '/습관') {
      const snap = await db.doc(`users/${uid}/days/${today}`).get();
      const d = snap.data() || {};
      const settingsSnap = await db.doc(`users/${uid}/data/settings`).get();
      const habits = settingsSnap.data()?.habits || [];
      if (habits.length === 0) {
        await send(fromChatId, '🎯 등록된 습관이 없어요. DayMate 앱에서 습관을 추가해보세요!');
      } else {
        const habitChecks = d.habitChecks || {};
        const done = habits.filter(h => habitChecks[h.id]).length;
        let reply = `🎯 <b>오늘 습관</b> (${done}/${habits.length} 완료)\n\n`;
        habits.forEach((h, i) => { reply += `${habitChecks[h.id] ? '✅' : `${i + 1}️⃣`} ${h.icon || ''} ${h.name}\n`; });
        await send(fromChatId, reply);
      }
    } else if (text === '/help' || text === '/도움') {
      await send(fromChatId,
        `🤖 <b>DayMate AI 어시스턴트</b>\n\n자연어로 말씀해주세요!\n` +
        `예) "운동하기 추가해줘"\n예) "1번 완료해줘"\n예) "오늘 할일 알려줘"\n\n` +
        `<b>명령어</b>\n/today — 오늘 할일 조회\n/habit — 오늘 습관 조회\n/done N — N번 완료 처리\n/stats — 최근 7일 통계\n/help — 도움말`
      );
    } else if (text.startsWith('/')) {
      await send(fromChatId, `❓ 알 수 없는 명령어예요.\n/help 로 사용법을 확인해보세요.`);
    } else {
      await send(fromChatId, '⏳ 처리 중...');
      const reply = await askClaude(text, today, uid);
      await send(fromChatId, reply);
    }
  } catch (e) {
    console.error('[telegram] error:', e);
    await send(fromChatId, `⚠️ 오류가 발생했어요: ${e.message}`);
  }

  res.status(200).send('ok');
}
