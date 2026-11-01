// 텔레그램 연결 코드 (2026-11-01): 본인 것만 만들고, 아무나 지우지 못한다. 10분 만료는 봇 서버가 확인.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-daymate',
  firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
const results = [];
const t = async (name, p) => { try { await p; results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name} — ${e.message.split('\n')[0]}`); } };
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = env.unauthenticatedContext().firestore();
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'tg_connect/MINE00000000'), { uid: 'me', createdAt: '2026-11-01T00:00:00.000Z' });
  await setDoc(doc(ctx.firestore(), 'tg_users/me'), { chatId: '1' });
});

await t('차단: 남의 uid로 코드 만들기', assertFails(setDoc(doc(as('attacker'), 'tg_connect/ATTACK000000'), { uid: 'victim', createdAt: 'now' })));
await t('차단: 코드에 다른 칸 넣기', assertFails(setDoc(doc(as('me'), 'tg_connect/EXTRA0000000'), { uid: 'me', createdAt: 'now', chatId: '999' })));
await t('차단: 로그인 안 하고 코드 지우기', assertFails(deleteDoc(doc(anon, 'tg_connect/MINE00000000'))));
await t('차단: 남의 코드 지우기', assertFails(deleteDoc(doc(as('attacker'), 'tg_connect/MINE00000000'))));
await t('차단: 코드 읽기', assertFails(getDoc(doc(as('attacker'), 'tg_connect/MINE00000000'))));
await t('차단: 남의 텔레그램 연결 읽기', assertFails(getDoc(doc(as('attacker'), 'tg_users/me'))));

await t('허용: 내 연결 코드 만들기(saveTgConnectCode)', assertSucceeds(setDoc(doc(as('me'), 'tg_connect/ABCDEFGH2345'), { uid: 'me', createdAt: new Date().toISOString() })));
await t('허용: 내 코드 지우기', assertSucceeds(deleteDoc(doc(as('me'), 'tg_connect/ABCDEFGH2345'))));
await t('허용: 내 텔레그램 연결 보기·해제', assertSucceeds((async () => { await getDoc(doc(as('me'), 'tg_users/me')); await deleteDoc(doc(as('me'), 'tg_users/me')); })()));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
