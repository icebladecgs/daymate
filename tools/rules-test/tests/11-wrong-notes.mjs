// 오답 노트 (수험생 모드, 2026-11-01): users/{uid}/wrongNotes는 본인만. 새 규칙 없이 users/{uid}/** 규칙으로 막히는지 확인.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection } from 'firebase/firestore';

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
  await setDoc(doc(ctx.firestore(), 'admin/config'), { uids: ['appAdmin'] });
  await setDoc(doc(ctx.firestore(), 'users/student/wrongNotes/w1'), { sub: '수학', step: 0, due: '2026-11-02' });
});
// 앱 saveWrongNote와 같은 모양
const note = { sub: '수학', unit: '극한', reason: '계산 실수', memo: '', photos: [{ url: 'u', path: 'users/student/wrong/1.jpg' }], answerPhotos: [], ds: '2026-11-01', createdAt: 'now', step: 0, due: '2026-11-02', done: false, reviews: [], updatedAt: 'now' };

await t('차단: 남의 오답 목록 읽기', assertFails(getDocs(collection(as('other'), 'users/student/wrongNotes'))));
await t('차단: 남의 오답 하나 읽기', assertFails(getDoc(doc(as('other'), 'users/student/wrongNotes/w1'))));
await t('차단: 남의 오답 쓰기', assertFails(setDoc(doc(as('other'), 'users/student/wrongNotes/x'), note)));
await t('차단: 남의 오답 지우기', assertFails(deleteDoc(doc(as('other'), 'users/student/wrongNotes/w1'))));
await t('차단: 로그인 없이 읽기', assertFails(getDocs(collection(anon, 'users/student/wrongNotes'))));
await t('차단: 앱 관리자도 남의 오답은 못 봄', assertFails(getDocs(collection(as('appAdmin'), 'users/student/wrongNotes'))));

await t('허용: 내 오답 저장(saveWrongNote)', assertSucceeds(setDoc(doc(as('student'), 'users/student/wrongNotes/w2'), note)));
await t('허용: 내 오답 목록(loadWrongNotes)', assertSucceeds(getDocs(collection(as('student'), 'users/student/wrongNotes'))));
await t('허용: 다시 풀기 결과 저장', assertSucceeds(setDoc(doc(as('student'), 'users/student/wrongNotes/w2'), { ...note, step: 1, due: '2026-11-05', reviews: [{ ds: '2026-11-02', ok: true }] })));
await t('허용: 내 오답 지우기', assertSucceeds(deleteDoc(doc(as('student'), 'users/student/wrongNotes/w2'))));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
