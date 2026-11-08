// 협동 보스전 (2026-11-08) — communities/{id}/raids/{주}, 그 아래 hits/{uid}
// 앱이 보내는 요청(src/firebase.js의 ensureRaid·saveRaidHit·markRaidDefeated·loadRaid)과 같은 모양으로 확인한다.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, runTransaction, addDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-daymate',
  firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
const results = [];
const t = async (name, p) => { try { await p; results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name} — ${e.message.split('\n')[0]}`); } };
const as = (uid) => env.authenticatedContext(uid).firestore();
const W = '2026-11-02';
const R = `communities/c1/raids/${W}`;

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'admin/config'), { uids: ['appAdmin'] });
  await setDoc(doc(db, 'communities/c1'), { name: '가족', createdBy: 'leader', memberCount: 3 });
  for (const u of ['leader', 'm1', 'm2']) await setDoc(doc(db, `communities/c1/members/${u}`), { nickname: u, isAdmin: u === 'leader' });
});

// 앱 ensureRaid와 같은 트랜잭션
const ensure = (uid, data, week = W) => { const db = as(uid); return runTransaction(db, async (tx) => {
  const ref = doc(db, `communities/c1/raids/${week}`);
  const snap = await tx.get(ref);
  if (snap.exists()) return;
  tx.set(ref, data);
}); };
const raid = (extra = {}) => ({ week: W, level: 1, bossId: 'slime', hpMax: 1500, createdAt: '2026-11-02T09:00:00.000Z', ...extra });
const hit = (uid, extra = {}) => ({ uid, nickname: uid, dmg: 120, byStat: { STR: 120 }, at: '2026-11-03T09:00:00.000Z', ...extra });
const markDefeated = (uid, by = uid) => { const db = as(uid); return runTransaction(db, async (tx) => {
  const ref = doc(db, R);
  const snap = await tx.get(ref);
  if (!snap.exists() || snap.data().defeatedAt) throw new Error('already');
  tx.update(ref, { defeatedAt: '2026-11-07T21:00:00.000Z', defeatedBy: by });
}); };

// ── 막혀야 할 것 (보스 만들기) ──
await t('차단: 멤버 아닌 사람이 보스 만들기', assertFails(ensure('outsider', raid())));
await t('차단: 다른 칸을 넣어 만들기(처치된 채로)', assertFails(ensure('m1', raid({ defeatedAt: 'x' }))));
await t('차단: 주 이름과 다른 week', assertFails(ensure('m1', raid({ week: '2026-11-09' }))));
await t('차단: 체력 너무 작게', assertFails(ensure('m1', raid({ hpMax: 1 }))));
await t('차단: 체력이 정수 아님', assertFails(ensure('m1', raid({ hpMax: 1500.5 }))));
await t('차단: 레벨 0', assertFails(ensure('m1', raid({ level: 0 }))));

// ── 허용 (앱이 실제로 보내는 요청) ──
await t('허용: 멤버가 이번 주 보스 만들기(ensureRaid)', assertSucceeds(ensure('m1', raid())));
await t('허용: 다른 멤버가 동시에 열어도 그대로(이미 있음)', assertSucceeds(ensure('m2', raid({ hpMax: 9999 }))));
await t('허용: 멤버가 보스·공격 읽기(loadRaid)', assertSucceeds(Promise.all([getDoc(doc(as('m2'), R)), getDocs(collection(as('m2'), `${R}/hits`))])));
await t('허용: 없는 지난주 보스 읽기', assertSucceeds(getDoc(doc(as('m1'), 'communities/c1/raids/2026-10-26'))));
await t('허용: 내 공격 올리기(saveRaidHit)', assertSucceeds(setDoc(doc(as('m1'), `${R}/hits/m1`), hit('m1'))));
await t('허용: 내 공격 고치기(능력치 바뀜)', assertSucceeds(setDoc(doc(as('m1'), `${R}/hits/m1`), hit('m1', { dmg: 900, byStat: { STR: 400, INT: 500 } }))));
await t('허용: 공격 0으로(체크 취소)', assertSucceeds(setDoc(doc(as('m2'), `${R}/hits/m2`), hit('m2', { dmg: 0, byStat: {} }))));
await t('허용: 앱 관리자 읽기', assertSucceeds(getDocs(collection(as('appAdmin'), `${R}/hits`))));

// ── 막혀야 할 것 (공격·읽기) ──
await t('차단: 멤버 아닌 사람이 보스 읽기', assertFails(getDoc(doc(as('outsider'), R))));
await t('차단: 멤버 아닌 사람이 공격 목록 읽기', assertFails(getDocs(collection(as('outsider'), `${R}/hits`))));
await t('차단: 멤버 아닌 사람이 공격 올리기', assertFails(setDoc(doc(as('outsider'), `${R}/hits/outsider`), hit('outsider'))));
await t('차단: 남의 공격 고치기', assertFails(setDoc(doc(as('m2'), `${R}/hits/m1`), hit('m1', { dmg: 0 }))));
await t('차단: 내 문서에 남의 uid', assertFails(setDoc(doc(as('m2'), `${R}/hits/m2`), hit('m1'))));
await t('차단: 음수 공격', assertFails(setDoc(doc(as('m2'), `${R}/hits/m2`), hit('m2', { dmg: -5 }))));
await t('차단: 공격이 너무 큼', assertFails(setDoc(doc(as('m2'), `${R}/hits/m2`), hit('m2', { dmg: 5000000 }))));
await t('차단: 공격에 다른 칸', assertFails(setDoc(doc(as('m2'), `${R}/hits/m2`), hit('m2', { isAdmin: true }))));
await t('차단: 멤버가 체력 바꾸기', assertFails(updateDoc(doc(as('m1'), R), { hpMax: 100 })));
await t('차단: 멤버가 레벨 바꾸기', assertFails(updateDoc(doc(as('m1'), R), { level: 9 })));
await t('차단: 남의 이름으로 처치 표시', assertFails(markDefeated('m1', 'm2')));
await t('차단: 처치 표시하며 체력도 바꾸기', assertFails(updateDoc(doc(as('m1'), R), { defeatedAt: 'x', defeatedBy: 'm1', hpMax: 100 })));
await t('차단: 일반 멤버가 보스 지우기', assertFails(deleteDoc(doc(as('m1'), R))));

// ── 처치 ──
await t('허용: 멤버가 처치 표시(markRaidDefeated)', assertSucceeds(markDefeated('m2')));
await t('차단: 이미 처치된 보스에 다시 표시(덮어쓰기)', assertFails(updateDoc(doc(as('m1'), R), { defeatedAt: '2026-11-08T00:00:00.000Z', defeatedBy: 'm1' })));
await t('허용: 처치 뒤 채팅방에 한 줄(addChatMessage)', assertSucceeds(addDoc(collection(as('m2'), 'communities/c1/chat'), { uid: 'm2', nickname: 'm2', text: '⚔️ 보스 처치!', photos: [], createdAt: '2026-11-07T21:00:00.000Z' })));
await t('허용: 처치 뒤에도 내 공격 올리기', assertSucceeds(setDoc(doc(as('m1'), `${R}/hits/m1`), hit('m1', { dmg: 1000 }))));
await t('허용: 내 공격 지우기', assertSucceeds(deleteDoc(doc(as('m2'), `${R}/hits/m2`))));
await t('허용: 커뮤니티 관리자가 보스 지우기', assertSucceeds(deleteDoc(doc(as('leader'), R))));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
