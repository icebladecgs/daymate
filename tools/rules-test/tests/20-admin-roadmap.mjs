// 📋 업그레이드 할 일 (2026-11-12) — adminRoadmap은 앱 관리자만 읽고 쓴다. 정해진 칸·길이·상태만.
// 허용 케이스는 앱이 보내는 모양(firebase.js saveRoadmapItem)과 같다.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';

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
  await setDoc(doc(db, 'adminRoadmap/r1'), { text: '있던 할 일', note: '', status: 'todo', pri: 'normal', createdAt: '2026-11-12T00:00:00.000Z', doneAt: null, from: '' });
});

const item = { text: '개인정보처리방침 페이지', note: '공개 전 필수', status: 'todo', pri: 'high', createdAt: new Date().toISOString(), doneAt: null, from: '' };

await t('관리자: 새 할 일 만들기 (앱 요청 모양)', assertSucceeds(setDoc(doc(as('appAdmin'), 'adminRoadmap/r2'), item)));
await t('관리자: 제안에서 옮긴 할 일 (from 칸)', assertSucceeds(setDoc(doc(as('appAdmin'), 'adminRoadmap/s_abc'), { ...item, from: 'abc' })));
await t('관리자: 끝냄으로 바꾸기', assertSucceeds(setDoc(doc(as('appAdmin'), 'adminRoadmap/r1'), { status: 'done', doneAt: new Date().toISOString() }, { merge: true })));
await t('관리자: 목록 읽기', assertSucceeds(getDocs(collection(as('appAdmin'), 'adminRoadmap'))));
await t('관리자: 지우기', assertSucceeds(deleteDoc(doc(as('appAdmin'), 'adminRoadmap/r2'))));
await t('관리자: 정해지지 않은 칸은 막힘', assertFails(setDoc(doc(as('appAdmin'), 'adminRoadmap/r3'), { ...item, secret: 'x' })));
await t('관리자: 빈 제목은 막힘', assertFails(setDoc(doc(as('appAdmin'), 'adminRoadmap/r3'), { ...item, text: '' })));
await t('관리자: 너무 긴 제목은 막힘', assertFails(setDoc(doc(as('appAdmin'), 'adminRoadmap/r3'), { ...item, text: 'ㄱ'.repeat(501) })));
await t('관리자: 이상한 상태는 막힘', assertFails(setDoc(doc(as('appAdmin'), 'adminRoadmap/r3'), { ...item, status: 'hidden' })));
await t('일반 사용자: 목록 못 읽음', assertFails(getDocs(collection(as('user1'), 'adminRoadmap'))));
await t('일반 사용자: 한 개도 못 읽음', assertFails(getDoc(doc(as('user1'), 'adminRoadmap/r1'))));
await t('일반 사용자: 못 만듦', assertFails(setDoc(doc(as('user1'), 'adminRoadmap/r4'), item)));
await t('일반 사용자: 못 지움', assertFails(deleteDoc(doc(as('user1'), 'adminRoadmap/r1'))));
await t('로그인 안 함: 못 읽음', assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'adminRoadmap/r1'))));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
