// 🗺️ 영토 (2026-11-09) — territories/{코드}는 서버만 쓰고 로그인한 사람은 읽기, territoryTries는 서버만.
// 앱이 직접 "내 땅"으로 저장해 남의 땅을 가로채지 못하는지 본다.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-daymate',
  firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
const results = [];
const t = async (name, p) => { try { await p; results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name} — ${e.message.split('\n')[0]}`); } };
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const T = 'territories/1111053000';

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'admin/config'), { uids: ['appAdmin'] });
  await setDoc(doc(db, T), { code: '1111053000', name: '서울특별시 종로구 사직동', level: 14, ownerUid: 'owner', owner: { name: '영주', level: 9 }, defenses: 0 });
  await setDoc(doc(db, 'territoryTries/u1_1111053000'), { date: '2026-11-09', n: 1 });
});

await t('허용: 로그인하면 영토 읽기', assertSucceeds(getDoc(doc(as('u1'), T))));
await t('허용: 내 영토 목록 (주인으로 찾기)', assertSucceeds(getDocs(query(collection(as('owner'), 'territories'), where('ownerUid', '==', 'owner')))));
await t('막힘: 로그인 안 하면 읽기', assertFails(getDoc(doc(anon(), T))));
await t('막힘: 남의 땅을 내 것으로 바꾸기', assertFails(updateDoc(doc(as('u1'), T), { ownerUid: 'u1' })));
await t('막힘: 주인도 직접 고치기 (능력치 부풀리기)', assertFails(updateDoc(doc(as('owner'), T), { 'owner.level': 99 })));
await t('막힘: 빈 땅을 직접 차지', assertFails(setDoc(doc(as('u1'), 'territories/2611051000'), { code: '2611051000', ownerUid: 'u1' })));
await t('막힘: 영토 지우기', assertFails(deleteDoc(doc(as('owner'), T))));
await t('막힘: 앱 관리자도 직접 쓰기', assertFails(updateDoc(doc(as('appAdmin'), T), { ownerUid: 'appAdmin' })));
await t('막힘: 도전 횟수 읽기', assertFails(getDoc(doc(as('u1'), 'territoryTries/u1_1111053000'))));
await t('막힘: 도전 횟수 되돌리기', assertFails(setDoc(doc(as('u1'), 'territoryTries/u1_1111053000'), { date: '2026-11-09', n: 0 })));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
