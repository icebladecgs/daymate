// 🎟 친구 초대 코드 (2026-11-09) — 규칙(userInviteCodes·inviteUses) + 실제 서버 코드(src/utils/inviteServer.js, api/chat.js?action=invite-use)
// 예전: 개인 코드 등록이 규칙에 막히고, 초대 수 올리기도 막혔고, 아무 글자나 +100 XP. 이제 서버가 확인하고 올린다.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, increment } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const env = await initializeTestEnvironment({
  projectId: 'demo-daymate',
  firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
if (!getApps().length) initializeApp({ projectId: 'demo-daymate' });
const db = getFirestore();
const { applyInviteOnServer } = await import('../../../src/utils/inviteServer.js');

const results = [];
const t = (name, ok, detail = '') => results.push(ok ? `PASS ${name}` : `FAIL ${name}${detail ? ` — ${detail}` : ''}`);
const tp = async (name, p) => { try { await p; results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name} — ${e.message.split('\n')[0]}`); } };
const as = (uid) => env.authenticatedContext(uid).firestore();

await env.clearFirestore();
await db.doc('inviteCodes/OLD123').set({ uid: 'legacyOwner' }); // 11-01 전에 옛 저장소에 등록된 개인 코드
await db.doc('inviteCodes/COMM99').set({ communityId: 'c1' }); // 커뮤니티 코드 (개인 코드 아님)
await db.doc('rankings/owner').set({ totalScore: 10, nickname: '주인' });

// ── 규칙 ──
await tp('허용: 내 코드 등록 (앱 registerInviteCode와 같은 모양)', assertSucceeds(setDoc(doc(as('owner'), 'userInviteCodes/ABC123'), { uid: 'owner' })));
await tp('허용: 로그인하면 코드 하나 조회', assertSucceeds(getDoc(doc(as('friend'), 'userInviteCodes/ABC123'))));
await tp('막힘: 남의 uid로 코드 등록', assertFails(setDoc(doc(as('friend'), 'userInviteCodes/ZZZ999'), { uid: 'owner' })));
await tp('막힘: 남의 코드를 내 것으로 덮어쓰기', assertFails(setDoc(doc(as('friend'), 'userInviteCodes/ABC123'), { uid: 'friend' })));
await tp('막힘: 코드 지우기', assertFails(deleteDoc(doc(as('owner'), 'userInviteCodes/ABC123'))));
await tp('막힘: 이상한 코드 이름', assertFails(setDoc(doc(as('friend'), 'userInviteCodes/ab-1'), { uid: 'friend' })));
await tp('막힘: 다른 칸 끼워 넣기', assertFails(setDoc(doc(as('friend'), 'userInviteCodes/FRI777'), { uid: 'friend', bonus: 999 })));
await tp('막힘: 사용 기록 읽기·쓰기', assertFails(setDoc(doc(as('friend'), 'inviteUses/friend_ABC123'), { uid: 'friend' })));
await tp('막힘(예전 방식 — 그래서 등록이 안 됐다): 커뮤니티 코드 저장소에 개인 코드 등록', assertFails(setDoc(doc(as('owner'), 'inviteCodes/MYCODE1'), { uid: 'owner' }, { merge: true })));
await tp('막힘(예전 방식 — 그래서 초대 수가 안 올랐다): 남의 순위표 초대 수 직접 올리기', assertFails(setDoc(doc(as('friend'), 'rankings/owner'), { inviteCount: increment(1) }, { merge: true })));

// ── 서버 ──
let r = await applyInviteOnServer(db, 'friend', { code: 'abc123' });
t('서버: 진짜 코드면 성공 (소문자도)', r.status === 200 && r.body.ok, JSON.stringify(r));
let rank = (await db.doc('rankings/owner').get()).data();
t('서버: 주인 초대 수 +1, 다른 칸은 그대로', rank.inviteCount === 1 && rank.nickname === '주인' && rank.totalScore === 10, JSON.stringify(rank));
r = await applyInviteOnServer(db, 'friend', { code: 'ABC123' });
t('서버: 같은 사람이 같은 코드 두 번은 409', r.status === 409);
r = await applyInviteOnServer(db, 'friend2', { code: 'ABC123' });
t('서버: 다른 사람은 또 +1', r.status === 200 && (await db.doc('rankings/owner').get()).data().inviteCount === 2);
r = await applyInviteOnServer(db, 'owner', { code: 'ABC123' });
t('서버: 내 코드는 400', r.status === 400);
r = await applyInviteOnServer(db, 'friend', { code: 'NOPE42' });
t('서버: 없는 코드는 404 (예전엔 +100 XP를 받았다)', r.status === 404);
r = await applyInviteOnServer(db, 'friend', { code: '../x' });
t('서버: 이상한 코드는 400', r.status === 400);
r = await applyInviteOnServer(db, 'friend', { code: 'OLD123' });
t('서버: 옛 저장소의 개인 코드도 인정', r.status === 200 && (await db.doc('rankings/legacyOwner').get()).data().inviteCount === 1);
r = await applyInviteOnServer(db, 'friend', { code: 'COMM99' });
t('서버: 커뮤니티 코드는 개인 초대 코드가 아님 (404)', r.status === 404);
const [a, b] = await Promise.all([applyInviteOnServer(db, 'racer', { code: 'ABC123' }), applyInviteOnServer(db, 'racer', { code: 'ABC123' })]);
t('서버: 동시에 두 번 눌러도 한 번만', [a, b].filter((x) => x.status === 200).length === 1 && (await db.doc('rankings/owner').get()).data().inviteCount === 3);

console.log(results.join('\n'));
const failed = results.filter((x) => x.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
