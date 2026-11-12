// 📰 오늘의 브리핑 (2026-11-12) — briefings는 로그인한 사람 읽기만, 쓰기는 서버(관리자 SDK)만.
// 허용 케이스는 앱이 보내는 모양(firebase.js loadBriefing — 날짜 문서 하나 읽기)과 같다.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-daymate',
  firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
const results = [];
const t = async (name, p) => { try { await p; results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name} — ${e.message.split('\n')[0]}`); } };
const as = (uid) => env.authenticatedContext(uid).firestore();
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'admin/config'), { uids: ['appAdmin'] });
  await setDoc(doc(db, 'briefings/2026-11-13'), { date: '2026-11-13', headline: '한 줄', marketNote: '', news: [{ cat: '경제', title: '제목', body: '내용', sources: ['연합뉴스'] }], markets: [], events: [] });
});

await t('일반 사용자: 오늘 브리핑 읽기', assertSucceeds(getDoc(doc(as('user1'), 'briefings/2026-11-13'))));
await t('일반 사용자: 없는 날짜 읽기(빈 결과)', assertSucceeds(getDoc(doc(as('user1'), 'briefings/2026-11-12'))));
await t('로그인 안 함: 못 읽음', assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'briefings/2026-11-13'))));
await t('일반 사용자: 못 만듦', assertFails(setDoc(doc(as('user1'), 'briefings/2026-11-14'), { headline: '가짜 뉴스' })));
await t('일반 사용자: 못 고침', assertFails(updateDoc(doc(as('user1'), 'briefings/2026-11-13'), { headline: '바꿈' })));
await t('일반 사용자: 못 지움', assertFails(deleteDoc(doc(as('user1'), 'briefings/2026-11-13'))));
await t('앱 관리자도 앱에서는 못 씀(서버만)', assertFails(setDoc(doc(as('appAdmin'), 'briefings/2026-11-14'), { headline: 'x' })));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
