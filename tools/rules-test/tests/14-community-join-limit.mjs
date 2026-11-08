// 커뮤니티 비밀번호 대입 막기 (2026-11-08)
// 실제 서버 가입 코드(src/utils/communityJoin.js — api/chat.js?action=community-join이 부름)를 에뮬레이터에 붙여 실행한다.
// 5번 틀리면 1분, 10번 10분, 15번 1시간, 20번부터 하루. 틀린 횟수 기록(joinAttempts)은 앱에서 못 읽고 못 쓴다.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const env = await initializeTestEnvironment({
  projectId: 'demo-daymate',
  firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
if (!getApps().length) initializeApp({ projectId: 'demo-daymate' });
const db = getFirestore();
const { joinCommunityOnServer, lockMsFor } = await import('../../../src/utils/communityJoin.js');

const results = [];
const t = (name, ok, detail = '') => results.push(ok ? `PASS ${name}` : `FAIL ${name}${detail ? ` — ${detail}` : ''}`);
const tp = async (name, p) => { try { await p; results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name} — ${e.message.split('\n')[0]}`); } };

await env.clearFirestore();
await db.doc('communities/priv').set({ name: '비밀모임', createdBy: 'leader', isPublic: false, hasPassword: true, memberCount: 1 });
await db.doc('communities/priv/private/secret').set({ inviteCode: 'PRV123', password: '1234' });
await db.doc('communities/pub').set({ name: '공개암호', createdBy: 'leader', isPublic: true, hasPassword: true, memberCount: 1 });
await db.doc('communities/pub/private/secret').set({ inviteCode: 'PUB222', password: '135790' });
await db.doc('communities/old').set({ name: '옛모임', createdBy: 'leader', isPublic: false, inviteCode: 'OLD444', password: '7777', memberCount: 1 });

const T0 = Date.parse('2026-11-08T00:00:00Z');
const MIN = 60 * 1000;
const join = (uid, cid, password, joinCode, now = T0) => joinCommunityOnServer(db, uid, { communityId: cid, nickname: uid, password, joinCode }, now);
const isMember = async (uid, cid) => (await db.doc(`communities/${cid}/members/${uid}`).get()).exists;

// 잠금 단계
t('잠금 단계: 4번은 안 막힘', lockMsFor(4) === 0);
t('잠금 단계: 5번 1분 · 10번 10분 · 15번 1시간 · 20번 하루 · 25번 하루', lockMsFor(5) === MIN && lockMsFor(10) === 10 * MIN && lockMsFor(15) === 60 * MIN && lockMsFor(20) === 1440 * MIN && lockMsFor(25) === 1440 * MIN);
t('잠금 단계: 사이 횟수는 안 막힘', lockMsFor(6) === 0 && lockMsFor(19) === 0);

// 맞는 비밀번호
let r = await join('ok1', 'priv', '1234', 'PRV123');
t('허용: 코드+비밀번호 맞으면 가입', r.status === 200 && await isMember('ok1', 'priv'), JSON.stringify(r));
t('허용: 가입하면 인원수 +1', (await db.doc('communities/priv').get()).data().memberCount === 2);
t('허용: 멤버 문서에 비밀번호가 남지 않음', !('joinKey' in (await db.doc('communities/priv/members/ok1').get()).data()));
r = await join('ok1', 'priv', '1234', 'PRV123');
t('허용: 이미 가입했으면 그대로(인원수 안 늘어남)', r.body.already && (await db.doc('communities/priv').get()).data().memberCount === 2);
r = await join('ok2', 'pub', '135790');
t('허용: 공개 커뮤니티는 코드 없이 비밀번호로', r.status === 200 && await isMember('ok2', 'pub'));
r = await join('ok3', 'old', '7777', 'old444');
t('허용: 옛 커뮤니티(문서에 비밀번호)도 가입, 코드 소문자도 됨', r.status === 200 && await isMember('ok3', 'old'), JSON.stringify(r));

// 막혀야 할 것
r = await join('x1', 'priv', '1234');
t('차단: 비공개에 코드 없이', r.status === 403 && r.body.error === 'join-denied' && !await isMember('x1', 'priv'));
r = await join('x1', 'nope', '1234');
t('차단: 없는 커뮤니티', r.status === 404);
r = await joinCommunityOnServer(db, 'x1', { communityId: '../priv', nickname: 'x', password: '1234' }, T0);
t('차단: 이상한 커뮤니티 id', r.status === 400);

// 틀린 횟수 — 4번은 남은 기회 안내, 5번째에 1분 잠금
for (let i = 1; i <= 4; i++) {
  r = await join('atk', 'priv', `000${i}`, 'PRV123', T0 + i);
  t(`틀림 ${i}번: 남은 기회 ${5 - i}`, r.status === 403 && r.body.error === 'wrong-password' && r.body.left === 5 - i, JSON.stringify(r));
}
r = await join('atk', 'priv', '0005', 'PRV123', T0 + 5);
t('5번째 틀림: 1분 잠금', r.status === 429 && r.body.retryAt === T0 + 5 + MIN, JSON.stringify(r));
r = await join('atk', 'priv', '1234', 'PRV123', T0 + 30 * 1000);
t('잠긴 동안엔 맞는 비밀번호도 막힘', r.status === 429 && !await isMember('atk', 'priv'));
// 1분 뒤 다시 5번 틀리면 10분
for (let i = 6; i <= 9; i++) await join('atk', 'priv', '0000', 'PRV123', T0 + 2 * MIN + i);
r = await join('atk', 'priv', '0000', 'PRV123', T0 + 2 * MIN + 10);
t('10번째 틀림: 10분 잠금', r.status === 429 && r.body.retryAt === T0 + 2 * MIN + 10 + 10 * MIN, JSON.stringify(r));
// 다른 사람은 막히지 않음
r = await join('other', 'priv', '1234', 'PRV123', T0 + 3 * MIN);
t('다른 사람은 그대로 가입', r.status === 200);
// 다른 커뮤니티 기록과 섞이지 않음
r = await join('atk', 'pub', '135790', null, T0 + 3 * MIN);
t('같은 사람도 다른 커뮤니티는 막히지 않음', r.status === 200);
// 잠금이 풀린 뒤 맞으면 가입되고 기록이 지워짐
r = await join('atk', 'priv', '1234', 'PRV123', T0 + 20 * MIN);
t('잠금이 풀리면 맞는 비밀번호로 가입', r.status === 200 && await isMember('atk', 'priv'), JSON.stringify(r));
t('가입하면 틀린 기록 지움', !(await db.doc('joinAttempts/atk_priv').get()).exists);

// 하루 잠금까지 — 쉬지 않고 대입하면 하루 5번
let now = T0 + 60 * MIN;
const ATK = 'atk2';
let lockedFor = [];
for (let n = 1; n <= 20; n++) {
  r = await join(ATK, 'priv', '9999', 'PRV123', now);
  if (r.status === 429) { lockedFor.push(Math.round((r.body.retryAt - now) / MIN)); now = r.body.retryAt; }
  now += 1;
}
t('20번 틀리는 동안 잠금 1분 → 10분 → 1시간 → 하루', JSON.stringify(lockedFor) === JSON.stringify([1, 10, 60, 1440]), JSON.stringify(lockedFor));

// 앱(클라이언트)에서 틀린 기록을 보거나 지울 수 없음
const as = (uid) => env.authenticatedContext(uid).firestore();
await tp('차단: 앱에서 내 틀린 기록 읽기', assertFails(getDoc(doc(as(ATK), `joinAttempts/${ATK}_priv`))));
await tp('차단: 앱에서 내 틀린 기록 지우기(잠금 풀기)', assertFails(deleteDoc(doc(as(ATK), `joinAttempts/${ATK}_priv`))));
await tp('차단: 앱에서 틀린 기록 덮어쓰기', assertFails(setDoc(doc(as(ATK), `joinAttempts/${ATK}_priv`), { fails: 0, lockedUntil: 0 })));
await tp('차단: 잠긴 사람이 규칙으로 직접 가입', assertFails(setDoc(doc(as(ATK), 'communities/priv/members/' + ATK), { nickname: 'a', isAdmin: false, joinCode: 'PRV123', joinKey: '1234' })));

console.log(results.join('\n'));
const failed = results.filter(x => x.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
