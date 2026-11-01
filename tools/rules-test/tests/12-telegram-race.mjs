// 텔레그램 봇이 AI 답을 기다리는 사이 앱에서 같은 날 기록을 고쳐도 덮어쓰지 않는지 (2026-11-01, ChatGPT 검토로 발견).
// 실제 봇 코드(api/telegram-webhook.js)를 에뮬레이터에 붙여 실행하고, AI(Anthropic) 자리에 가짜 서버를 둔다.
// 가짜 AI는 답하기 직전에 "앱에서 메모를 쓰고 할일을 고친" 것처럼 기록을 바꾼다 → 봇 저장 뒤에도 그 변경이 남아야 한다.
import { createServer } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';

const UID = 'race-user';
const DAY = (() => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
})();

// 가짜 AI 서버: 첫 요청(도구 고르기) 때 앱 쪽 변경을 넣고 add_task를, 둘째 요청(결과 요약) 때 글을 돌려준다
let db, calls = 0;
const ai = createServer(async (req, res) => {
  for await (const chunk of req) void chunk; // 본문은 안 씀
  calls++;
  const reply = (body) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: `msg${calls}`, type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 }, ...body })); };
  if (calls === 1) {
    await db.doc(`users/${UID}/days/${DAY}`).set({
      memos: [{ id: 'm-app', text: '봇이 생각하는 동안 앱에서 쓴 메모' }],
      tasks: [{ id: 't-old', title: '앱에서 고친 제목', done: false }],
    }, { merge: true });
    reply({ content: [{ type: 'tool_use', id: 'tu1', name: 'add_task', input: { title: '봇이 넣은 할일' } }], stop_reason: 'tool_use' });
  } else {
    reply({ content: [{ type: 'text', text: '추가했어요' }] });
  }
});
await new Promise(r => ai.listen(0, '127.0.0.1', r));

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
Object.assign(process.env, {
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080',
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ type: 'service_account', project_id: 'demo-daymate', client_email: 'test@demo-daymate.iam.gserviceaccount.com', private_key: privateKey }),
  TELEGRAM_WEBHOOK_SECRET_TOKEN: 'race-secret',
  TELEGRAM_BOT_TOKEN: '', // 텔레그램으로 실제 메시지를 보내지 않음
  ANTHROPIC_API_KEY: 'test',
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${ai.address().port}`,
});
// 에뮬레이터는 문서 id 역순 정렬(봇의 최근 7일 통계)을 지원하지 않는다 — 테스트에서만 정순으로 바꾼다(결과 순서는 상관없음)
const { Query } = await import('@google-cloud/firestore');
const orderBy = Query.prototype.orderBy;
Query.prototype.orderBy = function (field, dir) { return orderBy.call(this, field, field === '__name__' ? 'asc' : dir); };
const { default: handler } = await import('../../../api/telegram-webhook.js');
const { getFirestore } = await import('firebase-admin/firestore');
db = getFirestore();

await db.doc(`tg_users/${UID}`).set({ chatId: '777' });
await db.doc(`users/${UID}/days/${DAY}`).set({ tasks: [{ id: 't-old', title: '처음 제목', done: false }], memos: [] });

const results = [];
const t = (name, ok, detail = '') => results.push(ok ? `PASS ${name}` : `FAIL ${name}${detail ? ` — ${detail}` : ''}`);
const call = (text) => new Promise((resolve) => {
  const res = { status() { return this; }, send: resolve };
  handler({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'race-secret' }, body: { message: { chat: { id: 777 }, text } } }, res);
});

await call('할일에 봇이 넣은 할일 추가해줘');
let day = (await db.doc(`users/${UID}/days/${DAY}`).get()).data() || {};
t('봇이 넣은 할일 저장됨', (day.tasks || []).some(x => x.title === '봇이 넣은 할일'), JSON.stringify(day.tasks));
t('AI를 기다리는 사이 앱에서 쓴 메모가 남음', (day.memos || []).some(m => m.id === 'm-app'), JSON.stringify(day.memos));
t('AI를 기다리는 사이 앱에서 고친 할일 제목이 남음', (day.tasks || []).find(x => x.id === 't-old')?.title === '앱에서 고친 제목');

// /done: 번호로 고른 할일만 완료, 다른 칸은 그대로
await db.doc(`users/${UID}/days/${DAY}`).set({ journal: { body: '앱에서 쓴 일기' } }, { merge: true });
await call('/done 1');
day = (await db.doc(`users/${UID}/days/${DAY}`).get()).data() || {};
t('/done: 1번 할일 완료', (day.tasks || []).find(x => x.id === 't-old')?.done === true);
t('/done: 일기·메모는 그대로', day.journal?.body === '앱에서 쓴 일기' && (day.memos || []).some(m => m.id === 'm-app'));
t('/done: 다른 기기 반영용 _syncedAt 기록', !!day._syncedAt);

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
ai.close();
process.exit(process.exitCode || 0);
