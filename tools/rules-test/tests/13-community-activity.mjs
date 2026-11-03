// 커뮤니티 "최근 활동" — 멤버가 공지·댓글·일정을 올릴 때 서버 시각으로 기록 (2026-11-03, firebase.js touchCommunity)
// 규칙은 그대로(일반 멤버는 memberCount·lastActivityAt만 바꿀 수 있음) — 앱이 보내는 요청 모양이 통과하는지, 다른 칸은 여전히 막히는지
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

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
  await setDoc(doc(db, 'communities/c1'), { name: '모임', createdBy: 'leader', isPublic: false, memberCount: 2, lastActivityAt: '2026-11-01T00:00:00.000Z' });
  await setDoc(doc(db, 'communities/c1/members/member'), { nickname: 'm' });
});

await t('멤버: 최근 활동을 서버 시각으로 바꿈 (앱 요청 모양)', assertSucceeds(updateDoc(doc(as('member'), 'communities/c1'), { lastActivityAt: serverTimestamp() })));
await t('멤버: 예전 모양(ISO 글자)도 그대로 됨', assertSucceeds(updateDoc(doc(as('member'), 'communities/c1'), { lastActivityAt: new Date().toISOString() })));
await t('멤버: 최근 활동과 함께 이름을 바꾸면 막힘', assertFails(updateDoc(doc(as('member'), 'communities/c1'), { lastActivityAt: serverTimestamp(), name: '바꿈' })));
await t('로그인 안 함: 최근 활동도 못 바꿈', assertFails(updateDoc(doc(env.unauthenticatedContext().firestore(), 'communities/c1'), { lastActivityAt: serverTimestamp() })));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
