// 순위표(rankings) — 이메일 없이 닉네임만 (2026-11-09 사용자 결정)
// 앱 updateRanking과 같은 모양(setDoc merge + email: deleteField())으로 확인한다.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, deleteField } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-daymate',
  firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
const results = [];
const t = async (name, p) => { try { await p; results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name} — ${e.message.split('\n')[0]}`); } };
const as = (uid) => env.authenticatedContext(uid).firestore();
const appUpdate = (uid, data) => setDoc(doc(as(uid), 'rankings', uid), { ...data, email: deleteField() }, { merge: true });

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'admin/config'), { uids: ['appAdmin'] });
  await setDoc(doc(db, 'rankings/old'), { email: 'old@example.com', totalScore: 500, level: 3 });
  await setDoc(doc(db, 'rankings/old2'), { email: 'old2@example.com', totalScore: 700, level: 4 });
});

await t('허용: 앱 저장(닉네임·점수, 이메일 지우기) — 새 사람', assertSucceeds(appUpdate('u1', { nickname: '용사', totalScore: 10, level: 1 })));
await t('허용: 앱 저장 — 예전 이메일이 남은 사람도 지우면서 저장', assertSucceeds(appUpdate('old', { nickname: '옛사람', totalScore: 600, level: 3 })));
await t('결과: 이메일이 지워짐', (async () => { const d = (await getDoc(doc(as('u1'), 'rankings/old'))).data(); if (d.email || d.nickname !== '옛사람') throw new Error(JSON.stringify(d)); })());
await t('막힘: 이메일을 다시 저장', assertFails(setDoc(doc(as('u1'), 'rankings/u1'), { email: 'u1@example.com' }, { merge: true })));
await t('막힘: 예전 앱처럼 이메일을 그대로 두고 점수만', assertFails(setDoc(doc(as('old2'), 'rankings/old2'), { totalScore: 800 }, { merge: true })));
await t('막힘: 남의 순위표 고치기', assertFails(appUpdate('u1', { nickname: 'x' }).then(() => setDoc(doc(as('u1'), 'rankings/old'), { totalScore: 1 }, { merge: true }))));
await t('허용: 관리자가 남은 이메일만 지우기', assertSucceeds(updateDoc(doc(as('appAdmin'), 'rankings/old2'), { email: deleteField() })));
await t('막힘: 관리자가 점수 고치기', assertFails(updateDoc(doc(as('appAdmin'), 'rankings/old2'), { totalScore: 99999 })));
await t('막힘: 관리자가 이메일과 함께 다른 칸도', assertFails(updateDoc(doc(as('appAdmin'), 'rankings/u1'), { email: deleteField(), nickname: '바꿈' })));
await t('허용: 로그인하면 읽기', assertSucceeds(getDoc(doc(as('u1'), 'rankings/old2'))));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
