import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, addDoc, collection, query, orderBy, limit, where, getCountFromServer } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-daymate',
  firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
const results = [];
const t = async (name, p) => { try { await p; results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name} — ${e.message.split('\n')[0]}`); } };
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = env.unauthenticatedContext().firestore();
const seed = async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admin/config'), { uids: ['appAdmin'] });
    await setDoc(doc(db, 'communities/c1'), { name: '모임', createdBy: 'leader', memberCount: 3 });
    for (const u of ['leader', 'member', 'member2']) await setDoc(doc(db, `communities/c1/members/${u}`), { nickname: u });
    await setDoc(doc(db, 'communities/c1/chat/m1'), { uid: 'member', nickname: 'member', text: '안녕', photos: [], createdAt: '2026-09-27T01:00:00.000Z' });
    await setDoc(doc(db, 'communities/c1/chat/m2'), { uid: 'member2', nickname: 'member2', text: '반가워', photos: [], createdAt: '2026-09-27T02:00:00.000Z' });
  });
};
const chatCol = (db) => collection(db, 'communities/c1/chat');
const latest = (db) => query(chatCol(db), orderBy('createdAt', 'desc'), limit(50));
const older = (db) => query(chatCol(db), where('createdAt', '<', '2026-09-27T02:00:00.000Z'), orderBy('createdAt', 'desc'), limit(50));
const since = (db) => query(chatCol(db), where('createdAt', '>', '2026-09-27T01:30:00.000Z'));
const msg = (uid) => ({ uid, nickname: uid, text: '테스트', photos: [], createdAt: new Date().toISOString() });

// ── 앱이 실제로 보내는 요청 (허용) ──
await seed();
await t('허용: 멤버가 최근 50개 실시간 조회(chatQuery)', assertSucceeds(getDocs(latest(as('member')))));
await t('허용: 멤버가 이전 대화 조회(loadOlderChat)', assertSucceeds(getDocs(older(as('member')))));
await t('허용: 멤버가 안 읽은 수 세기(countChatSince)', assertSucceeds(getCountFromServer(since(as('member')))));
await t('허용: 멤버가 전체 개수 세기(읽은 기록 없을 때)', assertSucceeds(getCountFromServer(chatCol(as('member')))));
await t('허용: 멤버가 본인 명의로 보내기(addChatMessage)', assertSucceeds(addDoc(chatCol(as('member')), msg('member'))));
await t('허용: 사진 메시지 보내기', assertSucceeds(addDoc(chatCol(as('member2')), { ...msg('member2'), text: '', photos: [{ url: 'https://x/y.jpg', path: 'community_photos/c1/chat_1.jpg' }] })));
await t('허용: 보낸 뒤 최근활동 갱신(lastActivityAt)', assertSucceeds(updateDoc(doc(as('member'), 'communities/c1'), { lastActivityAt: new Date().toISOString() })));
await t('허용: 내 메시지 삭제', assertSucceeds(deleteDoc(doc(as('member'), 'communities/c1/chat/m1'))));
await seed();
await t('허용: 커뮤니티 관리자가 남의 메시지 삭제', assertSucceeds(deleteDoc(doc(as('leader'), 'communities/c1/chat/m2'))));
await seed();
await t('허용: 앱 관리자가 남의 메시지 삭제', assertSucceeds(deleteDoc(doc(as('appAdmin'), 'communities/c1/chat/m2'))));
await t('허용: 앱 관리자 조회(멤버 아님)', assertSucceeds(getDocs(latest(as('appAdmin')))));

// ── 막아야 하는 것 ──
await seed();
await t('차단: 멤버 아닌 사람이 조회', assertFails(getDocs(latest(as('outsider')))));
await t('차단: 멤버 아닌 사람이 메시지 하나 읽기', assertFails(getDoc(doc(as('outsider'), 'communities/c1/chat/m1'))));
await t('차단: 멤버 아닌 사람이 개수 세기', assertFails(getCountFromServer(since(as('outsider')))));
await t('차단: 로그인 안 한 사람이 조회', assertFails(getDocs(latest(anon))));
await t('차단: 멤버 아닌 사람이 보내기', assertFails(addDoc(chatCol(as('outsider')), msg('outsider'))));
await t('차단: 남의 이름으로 보내기', assertFails(addDoc(chatCol(as('member')), msg('member2'))));
await t('차단: 로그인 안 한 사람이 보내기', assertFails(addDoc(chatCol(anon), msg('member'))));
await t('차단: 내 메시지라도 수정', assertFails(updateDoc(doc(as('member'), 'communities/c1/chat/m1'), { text: '고침' })));
await t('차단: 커뮤니티 관리자도 수정', assertFails(updateDoc(doc(as('leader'), 'communities/c1/chat/m1'), { text: '고침' })));
await t('차단: 일반 멤버가 남의 메시지 삭제', assertFails(deleteDoc(doc(as('member'), 'communities/c1/chat/m2'))));
await t('차단: 멤버 아닌 사람이 삭제', assertFails(deleteDoc(doc(as('outsider'), 'communities/c1/chat/m1'))));

// ── 기존 기능 유지 (회귀) ──
await seed();
await t('유지: 게시글 작성', assertSucceeds(setDoc(doc(as('member'), 'communities/c1/board/p1'), { uid: 'member', title: 't', body: 'b', createdAt: 'now' })));
await t('유지: 멤버 아닌 로그인 사용자가 게시판 읽기(기존과 동일)', assertSucceeds(getDoc(doc(as('outsider'), 'communities/c1/board/p1'))));
await t('유지: 일반 멤버가 관리자 변경 차단', assertFails(updateDoc(doc(as('member'), 'communities/c1'), { createdBy: 'member' })));
await t('유지: 가입(본인 멤버 문서)', assertSucceeds(setDoc(doc(as('newbie'), 'communities/c1/members/newbie'), { nickname: 'n' })));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
await env.cleanup();
