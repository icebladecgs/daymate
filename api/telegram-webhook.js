import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '');
const UID = process.env.FIREBASE_USER_UID;
const WEBHOOK_SECRET_TOKEN = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN || '';
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function send(text) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
  });
}

function pad2(n) { return String(n).padStart(2, '0'); }
function toDateStr() {
  // 한국 시간 기준
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

// 명령어 파싱: "/today@BotName" → "/today", "/done 1@BotName" → "/done 1"
function parseCommand(rawText) {
  return rawText.replace(/@\S+/, '').trim();
}

async function getTodayData(today) {
  const snap = await db.doc(`users/${UID}/days/${today}`).get();
  return snap.data() || {};
}

async function getRecentStats() {
  const snaps = await db.collection(`users/${UID}/days`).orderBy('__name__', 'desc').limit(7).get();
  return snaps.docs.map(doc => {
    const d = doc.data();
    const tasks = (d.tasks || []).filter(t => t.title?.trim());
    const done = tasks.filter(t => t.done).length;
    return { date: doc.id, done, total: tasks.length };
  });
}

// Claude tool use로 DayMate 데이터 조작
async function askClaude(userMessage, today) {
  const todayData = await getTodayData(today);
  const recentStats = await getRecentStats();
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

  // tool use 처리
  const toolResults = [];
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      const result = await executeTool(block.name, block.input, today, todayData);
      toolResults.push({ toolName: block.name, result });
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

async function executeTool(name, input, today, todayData) {
  const allTasks = todayData.tasks || [];
  const filledTasks = allTasks.filter(t => t.title?.trim());

  if (name === 'add_task') {
    const newTask = {
      id: `t${Date.now()}`,
      title: input.title,
      done: false,
      checkedAt: null,
      priority: false,
    };
    const tasks = [...allTasks];
    const emptyIdx = tasks.findIndex(t => !t.title?.trim());
    if (emptyIdx >= 0) tasks[emptyIdx] = newTask;
    else tasks.push(newTask);
    await db.doc(`users/${UID}/days/${today}`).set({ ...todayData, tasks }, { merge: true });
    return `"${input.title}" 추가됨`;
  }

  if (name === 'complete_task') {
    const target = filledTasks[input.number - 1];
    if (!target) return `번호 ${input.number}번 할일이 없습니다`;
    const updated = allTasks.map(t => t.id === target.id ? { ...t, done: true, checkedAt: new Date().toISOString() } : t);
    await db.doc(`users/${UID}/days/${today}`).set({ ...todayData, tasks: updated }, { merge: true });
    return `"${target.title}" 완료 처리됨`;
  }

  if (name === 'delete_task') {
    const target = filledTasks[input.number - 1];
    if (!target) return `번호 ${input.number}번 할일이 없습니다`;
    const updated = allTasks.map(t => t.id === target.id ? { ...t, title: '', done: false } : t);
    await db.doc(`users/${UID}/days/${today}`).set({ ...todayData, tasks: updated }, { merge: true });
    return `"${target.title}" 삭제됨`;
  }

  if (name === 'add_memo') {
    const prev = todayData.memo || '';
    const newMemo = prev ? `${prev}\n${input.content}` : input.content;
    await db.doc(`users/${UID}/days/${today}`).set({ ...todayData, memo: newMemo }, { merge: true });
    return `메모 추가됨`;
  }

  if (name === 'toggle_habit') {
    const settingsSnap = await db.doc(`users/${UID}/data/settings`).get();
    const habits = settingsSnap.data()?.habits || [];
    const target = habits.find(h => h.name.toLowerCase().includes(input.habit_name.toLowerCase()));
    if (!target) return `"${input.habit_name}" 습관을 찾을 수 없습니다`;
    const cur = todayData.habitChecks || {};
    await db.doc(`users/${UID}/days/${today}`).set({ ...todayData, habitChecks: { ...cur, [target.id]: input.done } }, { merge: true });
    return `"${target.name}" ${input.done ? '완료' : '취소'} 처리됨`;
  }

  return '알 수 없는 도구';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok');

  if (WEBHOOK_SECRET_TOKEN) {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (secretHeader !== WEBHOOK_SECRET_TOKEN) {
      return res.status(401).send('unauthorized');
    }
  }

  const body = req.body;
  const msg = body?.message;
  if (!msg) return res.status(200).send('ok');

  // 보안: 내 채팅에서 온 메시지만 처리
  if (String(msg.chat?.id) !== CHAT_ID) return res.status(200).send('ok');

  const rawText = (msg.text || '').trim();
  const text = parseCommand(rawText);  // @봇이름 제거
  const today = toDateStr();

  console.log(`[telegram] raw="${rawText}" parsed="${text}" today=${today}`);

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
    } else if (text === '/habit' || text === '/습관') {
      const snap = await db.doc(`users/${UID}/days/${today}`).get();
      const d = snap.data() || {};
      const settingsSnap = await db.doc(`users/${UID}/data/settings`).get();
      const habits = settingsSnap.data()?.habits || [];
      if (habits.length === 0) {
        await send('🎯 등록된 습관이 없어요. DayMate 앱에서 습관을 추가해보세요!');
      } else {
        const habitChecks = d.habitChecks || {};
        const done = habits.filter(h => habitChecks[h.id]).length;
        let reply = `🎯 <b>오늘 습관</b> (${done}/${habits.length} 완료)\n\n`;
        habits.forEach((h, i) => {
          reply += `${habitChecks[h.id] ? '✅' : `${i + 1}️⃣`} ${h.icon || ''} ${h.name}\n`;
        });
        await send(reply);
      }
    } else if (text === '/help' || text === '/도움' || text === '/start') {
      await send(
        `🤖 <b>DayMate AI 어시스턴트</b>\n\n` +
        `자연어로 말씀해주세요!\n` +
        `예) "운동하기 추가해줘"\n` +
        `예) "1번 완료해줘"\n` +
        `예) "오늘 할일 알려줘"\n` +
        `예) "운동 습관 완료해줘"\n\n` +
        `<b>명령어</b>\n` +
        `/today — 오늘 할일 조회\n` +
        `/habit — 오늘 습관 조회\n` +
        `/done N — N번 완료 처리\n` +
        `/stats — 최근 7일 통계\n` +
        `/help — 도움말`
      );
    } else if (text.startsWith('/')) {
      // 알 수 없는 명령어 → 안내
      await send(`❓ 알 수 없는 명령어예요.\n/help 로 사용법을 확인해보세요.`);
    } else {
      // 자연어 → Claude
      await send('⏳ 처리 중...');
      const reply = await askClaude(text, today);
      await send(reply);
    }
  } catch (e) {
    console.error('[telegram] error:', e);
    await send(`⚠️ 오류가 발생했어요: ${e.message}`);
  }

  res.status(200).send('ok');
}
