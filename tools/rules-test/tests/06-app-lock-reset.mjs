import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, addDoc, collection } from 'firebase/firestore';
const env = await initializeTestEnvironment({ projectId: 'demo-daymate', firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } });
const results = []; const t = async (n, p) => { try { await p; results.push(`PASS ${n}`); } catch (e) { results.push(`FAIL ${n} — ${e.message.split('\n')[0]}`); } };
const as = (u) => env.authenticatedContext(u).firestore(); const anon = env.unauthenticatedContext().firestore();
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'admin/config'), { uids: ['appAdmin'] });
  await setDoc(doc(db, 'appLockResets/lockA'), { uid: 'u1', at: '2026-10-06T00:00:00.000Z' });
  await setDoc(doc(db, 'appLockResets/lockB'), { uid: 'u1', at: '2026-10-06T00:00:00.000Z' });
  await setDoc(doc(db, 'suggestions/s1'), { uid: 'u1', kind: 'appLock', lockId: 'lockA', text: 'x', status: 'pending' });
});
const reset = (uid) => ({ uid, at: new Date().toISOString() });

// 잠긴 기기가 해제 요청 보내기 (requestAppUnlock — 제안 게시판)
await t('허용: 로그인 사용자가 잠금 해제 요청을 제안 게시판에', assertSucceeds(addDoc(collection(as('u1'), 'suggestions'), { uid: 'u1', maskedEmail: 'ab**@x.com', kind: 'appLock', lockId: 'lockZ', platform: '설치앱·휴대폰 Android Chrome', text: '🔒 앱 잠금 해제 요청', status: 'pending', adminReply: null, createdAt: new Date().toISOString(), repliedAt: null })));
await t('차단: 일반 사용자가 제안 게시판 읽기(남의 lockId 알아내기)', assertFails(getDocs(collection(as('u2'), 'suggestions'))));

// 관리자가 풀기 (approveAppUnlock)
await t('허용: 앱 관리자가 해제 표시 만들기', assertSucceeds(setDoc(doc(as('appAdmin'), 'appLockResets/lockNew'), reset('u1'))));
await t('허용: 앱 관리자가 요청에 답변·해제 기록', assertSucceeds(setDoc(doc(as('appAdmin'), 'suggestions/s1'), { adminReply: '풀었어요', status: 'answered', repliedAt: 'x', unlockedAt: 'x' }, { merge: true })));
await t('차단: 본인이 스스로 해제 표시 만들기', assertFails(setDoc(doc(as('u1'), 'appLockResets/lockMine'), reset('u1'))));
await t('차단: 다른 사람이 해제 표시 만들기', assertFails(setDoc(doc(as('u2'), 'appLockResets/lockX'), reset('u1'))));
await t('차단: 로그인 안 한 사람이 해제 표시 만들기', assertFails(setDoc(doc(anon, 'appLockResets/lockY'), reset('u1'))));
await t('차단: 관리자도 정해지지 않은 칸 추가', assertFails(setDoc(doc(as('appAdmin'), 'appLockResets/lockZ2'), { ...reset('u1'), extra: 1 })));

// 잠긴 기기가 확인·사용 (consumeAppUnlock)
await t('허용: 본인이 아직 없는 해제 표시 확인(대기 중)', assertSucceeds(getDoc(doc(as('u1'), 'appLockResets/lockNone'))));
await t('허용: 본인이 자기 해제 표시 확인', assertSucceeds(getDoc(doc(as('u1'), 'appLockResets/lockA'))));
await t('허용: 본인이 사용한 해제 표시 지우기', assertSucceeds(deleteDoc(doc(as('u1'), 'appLockResets/lockA'))));
await t('차단: 다른 사람이 남의 해제 표시 확인', assertFails(getDoc(doc(as('u2'), 'appLockResets/lockB'))));
await t('차단: 다른 사람이 남의 해제 표시 지우기', assertFails(deleteDoc(doc(as('u2'), 'appLockResets/lockB'))));
await t('차단: 로그인 안 한 사람이 확인', assertFails(getDoc(doc(anon, 'appLockResets/lockB'))));
await t('차단: 목록 조회', assertFails(getDocs(collection(as('u1'), 'appLockResets'))));
await t('차단: 본인도 수정(시각 늘리기)', assertFails(updateDoc(doc(as('u1'), 'appLockResets/lockB'), { at: new Date().toISOString() })));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
