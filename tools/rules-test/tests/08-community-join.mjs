// 커뮤니티 비밀번호·초대 코드 보호, 멤버만 읽기 (2026-11-01)
// 예전엔 비밀번호가 누구나 읽는 커뮤니티 문서에 있고 가입 확인은 화면에서만 해서,
// 로그인한 누구나 비밀 커뮤니티의 비밀번호를 읽고 가입할 수 있었다. 게시판·공지·일정도 누구나 읽혔다.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, deleteField, increment } from 'firebase/firestore';

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
    const s = (p, d) => setDoc(doc(db, p), d);
    await s('admin/config', { uids: ['appAdmin'] });
    // 비공개 + 비밀번호
    await s('communities/priv', { name: '비밀모임', createdBy: 'leader', isPublic: false, hasPassword: true, memberCount: 2 });
    await s('communities/priv/private/secret', { inviteCode: 'PRV123', password: '1234' });
    await s('inviteCodes/PRV123', { communityId: 'priv' });
    await s('communities/priv/members/leader', { nickname: 'l', isAdmin: true });
    await s('communities/priv/members/member', { nickname: 'm', isAdmin: false });
    await s('communities/priv/members/member2', { nickname: 'm2', isAdmin: false });
    await s('communities/priv/board/p1', { uid: 'member', title: 't', commentCount: 0 });
    await s('communities/priv/board/p1/comments/k1', { uid: 'member', text: 'c', likedBy: [] });
    await s('communities/priv/notices/n1', { uid: 'leader', title: 'n', commentCount: 0 });
    await s('communities/priv/events/e1', { createdBy: 'leader', title: 'e', date: '2026-11-01' });
    await s('communities/priv/checkins/member', { uid: 'member' });
    // 공개 · 비밀번호 없음 / 있음
    await s('communities/pubNoPw', { name: '공개', createdBy: 'leader', isPublic: true, hasPassword: false, memberCount: 1 });
    await s('communities/pubNoPw/private/secret', { inviteCode: 'PUB111', password: null });
    await s('communities/pubPw', { name: '공개암호', createdBy: 'leader', isPublic: true, hasPassword: true, memberCount: 1 });
    await s('communities/pubPw/private/secret', { inviteCode: 'PUB222', password: '5555' });
    // 비공개 · 비밀번호 없음 (초대 코드만)
    await s('communities/privNoPw', { name: '코드만', createdBy: 'leader', isPublic: false, hasPassword: false, memberCount: 1 });
    await s('communities/privNoPw/private/secret', { inviteCode: 'NOP333', password: null });
    // 아직 옮기지 않은 옛 커뮤니티
    await s('communities/old', { name: '옛모임', createdBy: 'leader', isPublic: false, inviteCode: 'OLD444', password: '7777', memberCount: 1 });
    await s('communities/old/members/leader', { nickname: 'l', isAdmin: true });
  });
};
// 앱 joinCommunity가 보내는 모양
const join = (uid, cid, proof = {}) => setDoc(doc(as(uid), `communities/${cid}/members/${uid}`),
  { nickname: uid, joinedAt: '2026-11-01T00:00:00.000Z', isAdmin: false, ...proof });

await seed();

// ── 막혀야 할 것 ──
await t('차단: 멤버 아닌 사람이 비밀번호·초대 코드 읽기', assertFails(getDoc(doc(as('outsider'), 'communities/priv/private/secret'))));
await t('차단: 멤버 아닌 사람이 게시판 읽기', assertFails(getDocs(collection(as('outsider'), 'communities/priv/board'))));
await t('차단: 멤버 아닌 사람이 게시글 하나 읽기', assertFails(getDoc(doc(as('outsider'), 'communities/priv/board/p1'))));
await t('차단: 멤버 아닌 사람이 게시글 댓글 읽기', assertFails(getDocs(collection(as('outsider'), 'communities/priv/board/p1/comments'))));
await t('차단: 멤버 아닌 사람이 공지 읽기', assertFails(getDocs(collection(as('outsider'), 'communities/priv/notices'))));
await t('차단: 멤버 아닌 사람이 일정 읽기', assertFails(getDocs(collection(as('outsider'), 'communities/priv/events'))));
await t('차단: 멤버 아닌 사람이 출석 읽기', assertFails(getDocs(collection(as('outsider'), 'communities/priv/checkins'))));
await t('차단: 멤버 아닌 사람이 멤버 목록 읽기', assertFails(getDocs(collection(as('outsider'), 'communities/priv/members'))));
await t('차단: 멤버 아닌 사람이 남의 멤버 문서 읽기', assertFails(getDoc(doc(as('outsider'), 'communities/priv/members/member'))));
await t('차단: 초대 코드 목록 조회', assertFails(getDocs(collection(as('outsider'), 'inviteCodes'))));
await t('차단: 로그인 안 하고 초대 코드 조회', assertFails(getDoc(doc(anon, 'inviteCodes/PRV123'))));
await t('차단: 아무것도 없이 비공개 가입', assertFails(join('j1', 'priv')));
await t('차단: 코드는 맞고 비밀번호 틀림', assertFails(join('j2', 'priv', { joinCode: 'PRV123', joinKey: '0000' })));
await t('차단: 비밀번호는 맞고 코드 없음', assertFails(join('j3', 'priv', { joinKey: '1234' })));
await t('차단: 코드 틀림', assertFails(join('j4', 'priv', { joinCode: 'XXXXXX', joinKey: '1234' })));
await t('차단: 공개 커뮤니티라도 비밀번호 없이', assertFails(join('j5', 'pubPw')));
await t('차단: 코드만 있는 비공개에 코드 없이', assertFails(join('j6', 'privNoPw')));
await t('차단: 옛 커뮤니티에 비밀번호 틀림', assertFails(join('j7', 'old', { joinCode: 'OLD444', joinKey: '0000' })));
await t('차단: 옛 커뮤니티에 코드 없이', assertFails(join('j8', 'old', { joinKey: '7777' })));
await t('차단: 남의 이름으로 가입', assertFails(setDoc(doc(as('outsider'), 'communities/pubNoPw/members/victim'), { nickname: 'x' })));
await t('차단: 멤버 아닌 사람이 게시글 쓰기', assertFails(setDoc(doc(as('outsider'), 'communities/priv/board/x1'), { uid: 'outsider', title: 'spam' })));
await t('차단: 멤버 아닌 사람이 공지 쓰기', assertFails(setDoc(doc(as('outsider'), 'communities/priv/notices/x1'), { uid: 'outsider', title: 'spam' })));
await t('차단: 멤버 아닌 사람이 일정 만들기', assertFails(setDoc(doc(as('outsider'), 'communities/priv/events/x1'), { createdBy: 'outsider', title: 'spam' })));
await t('차단: 멤버 아닌 사람이 출석', assertFails(setDoc(doc(as('outsider'), 'communities/priv/checkins/outsider'), { uid: 'outsider' })));
await t('차단: 멤버 아닌 사람이 댓글 수 바꾸기', assertFails(updateDoc(doc(as('outsider'), 'communities/priv/board/p1'), { commentCount: 99 })));
await t('차단: 멤버 아닌 사람이 좋아요 바꾸기', assertFails(updateDoc(doc(as('outsider'), 'communities/priv/board/p1/comments/k1'), { likedBy: ['outsider'] })));
await t('차단: 일반 멤버가 비밀번호 바꾸기', assertFails(setDoc(doc(as('member'), 'communities/priv/private/secret'), { password: '0000' }, { merge: true })));
await t('차단: 멤버 아닌 사람이 비밀번호 덮어쓰기', assertFails(setDoc(doc(as('outsider'), 'communities/priv/private/secret'), { inviteCode: 'MINE00', password: null })));
await t('차단: 남의 커뮤니티로 가는 초대 코드 만들기', assertFails(setDoc(doc(as('outsider'), 'inviteCodes/FAKE01'), { communityId: 'priv' })));
await t('차단: 일반 멤버가 초대 코드 만들기', assertFails(setDoc(doc(as('member'), 'inviteCodes/FAKE02'), { communityId: 'priv' })));
await t('차단: 초대 코드 덮어쓰기(가로채기)', assertFails(setDoc(doc(as('leader'), 'inviteCodes/PRV123'), { communityId: 'pubNoPw' })));
await t('차단: 초대 코드에 다른 칸 넣기', assertFails(setDoc(doc(as('leader'), 'inviteCodes/EXTRA1'), { communityId: 'priv', password: '1234' })));
await t('차단: 일반 멤버가 초대 코드 지우기', assertFails(deleteDoc(doc(as('member'), 'inviteCodes/PRV123'))));
await t('차단: 일반 멤버가 옛 커뮤니티 비밀번호 칸 지우기', assertFails(updateDoc(doc(as('member'), 'communities/priv'), { hasPassword: false })));

// ── 앱이 실제로 보내는 요청 (허용) ──
await t('허용: 멤버가 비밀번호·초대 코드 읽기(입장 확인·코드 공유)', assertSucceeds(getDoc(doc(as('member'), 'communities/priv/private/secret'))));
await t('허용: 멤버가 게시판 읽기', assertSucceeds(getDocs(collection(as('member'), 'communities/priv/board'))));
await t('허용: 멤버가 공지·일정·출석·멤버 목록 읽기', assertSucceeds(Promise.all([
  getDocs(collection(as('member'), 'communities/priv/notices')),
  getDocs(collection(as('member'), 'communities/priv/events')),
  getDocs(collection(as('member'), 'communities/priv/checkins')),
  getDocs(collection(as('member'), 'communities/priv/members')),
])));
await t('허용: 멤버가 게시글 쓰기', assertSucceeds(setDoc(doc(as('member'), 'communities/priv/board/p2'), { uid: 'member', title: 'hi', commentCount: 0 })));
await t('허용: 멤버가 남의 글 댓글 수 갱신', assertSucceeds(updateDoc(doc(as('member2'), 'communities/priv/board/p1'), { commentCount: increment(1) })));
await t('허용: 멤버가 좋아요', assertSucceeds(updateDoc(doc(as('member2'), 'communities/priv/board/p1/comments/k1'), { likedBy: ['member2'] })));
await t('허용: 멤버가 출석', assertSucceeds(setDoc(doc(as('member'), 'communities/priv/checkins/member'), { uid: 'member', date: '2026-11-01' })));
await t('허용: 멤버 아닌 사람도 커뮤니티 이름·인원 보기', assertSucceeds(getDoc(doc(as('outsider'), 'communities/priv'))));
await t('허용: 공개 목록 조회(loadPublicCommunities)', assertSucceeds(getDocs(collection(as('outsider'), 'communities'))));
await t('허용: 코드로 커뮤니티 찾기(findCommunityByCode)', assertSucceeds(getDoc(doc(as('outsider'), 'inviteCodes/PRV123'))));
await t('허용: 없는 코드 조회(없음 확인)', assertSucceeds(getDoc(doc(as('outsider'), 'inviteCodes/NONE00'))));
await t('허용: 가입 전 내 멤버 문서 확인(joinCommunity)', assertSucceeds(getDoc(doc(as('outsider'), 'communities/priv/members/outsider'))));
await t('허용: 내 커뮤니티 복구(loadMyCommunityIds)', assertSucceeds(getDoc(doc(as('member'), 'communities/priv/members/member'))));
await t('허용: 코드+비밀번호로 비공개 가입', assertSucceeds(join('ok1', 'priv', { joinCode: 'PRV123', joinKey: '1234' })));
await t('허용: 가입 뒤 확인용 값 지우기', assertSucceeds(updateDoc(doc(as('ok1'), 'communities/priv/members/ok1'), { joinCode: deleteField(), joinKey: deleteField() })));
await t('허용: 가입 뒤 인원수 +1', assertSucceeds(updateDoc(doc(as('ok1'), 'communities/priv'), { memberCount: increment(1) })));
await t('허용: 가입한 뒤 게시판 읽기', assertSucceeds(getDocs(collection(as('ok1'), 'communities/priv/board'))));
await t('허용: 공개·비밀번호 없음은 그냥 가입', assertSucceeds(join('ok2', 'pubNoPw')));
await t('허용: 공개·비밀번호 있음은 비밀번호로 가입', assertSucceeds(join('ok3', 'pubPw', { joinKey: '5555' })));
await t('허용: 공개 커뮤니티를 코드로 찾아 가입', assertSucceeds(join('ok4', 'pubPw', { joinCode: 'PUB222', joinKey: '5555' })));
await t('허용: 코드만 있는 비공개는 코드로 가입', assertSucceeds(join('ok5', 'privNoPw', { joinCode: 'NOP333' })));
await t('허용: 옛 커뮤니티도 코드+비밀번호로 가입', assertSucceeds(join('ok6', 'old', { joinCode: 'OLD444', joinKey: '7777' })));
await t('허용: 앱 관리자가 게시판·비밀번호 보기', assertSucceeds(Promise.all([
  getDocs(collection(as('appAdmin'), 'communities/priv/board')),
  getDoc(doc(as('appAdmin'), 'communities/priv/private/secret')),
])));

// 커뮤니티 만들기 (createCommunity 순서 그대로)
await t('허용: 만들기 1) 커뮤니티 문서', assertSucceeds(setDoc(doc(as('maker'), 'communities/newc'), { name: '새모임', createdBy: 'maker', createdAt: 'now', memberCount: 1, isPublic: false, hasPassword: true })));
await t('허용: 만들기 2) 비밀번호·초대 코드', assertSucceeds(setDoc(doc(as('maker'), 'communities/newc/private/secret'), { inviteCode: 'NEW555', password: '2468' })));
await t('허용: 만들기 3) 초대 코드 등록', assertSucceeds(setDoc(doc(as('maker'), 'inviteCodes/NEW555'), { communityId: 'newc' })));
await t('허용: 만들기 4) 만든 사람 멤버 문서', assertSucceeds(setDoc(doc(as('maker'), 'communities/newc/members/maker'), { nickname: 'mk', joinedAt: 'now', isAdmin: true })));
await t('허용: 만든 커뮤니티에 코드+비밀번호로 가입', assertSucceeds(join('ok7', 'newc', { joinCode: 'NEW555', joinKey: '2468' })));

// 관리자가 비밀번호 바꾸기 (setCommunityPassword)
await t('허용: 관리자가 비밀번호 바꾸기', assertSucceeds(setDoc(doc(as('leader'), 'communities/priv/private/secret'), { password: '9999' }, { merge: true })));
await t('허용: 관리자가 비밀번호 표시 바꾸기', assertSucceeds(updateDoc(doc(as('leader'), 'communities/priv'), { hasPassword: true })));
await t('차단: 바뀌기 전 비밀번호로 가입', assertFails(join('j9', 'priv', { joinCode: 'PRV123', joinKey: '1234' })));
await t('허용: 바뀐 비밀번호로 가입', assertSucceeds(join('ok8', 'priv', { joinCode: 'PRV123', joinKey: '9999' })));

// 옛 커뮤니티 옮기기 (migrateCommunitySecret) — 커뮤니티 관리자
await t('허용: 옮기기 1) 비밀번호·코드 복사', assertSucceeds(setDoc(doc(as('leader'), 'communities/old/private/secret'), { inviteCode: 'OLD444', password: '7777' }, { merge: true })));
await t('허용: 옮기기 2) 초대 코드 등록', assertSucceeds(setDoc(doc(as('leader'), 'inviteCodes/OLD444'), { communityId: 'old' })));
await t('허용: 옮기기 3) 커뮤니티 문서에서 지우기', assertSucceeds(updateDoc(doc(as('leader'), 'communities/old'), { inviteCode: deleteField(), password: deleteField(), hasPassword: true })));
await t('차단: 옮긴 뒤 비밀번호 없이 가입', assertFails(join('j10', 'old', { joinCode: 'OLD444' })));
await t('허용: 옮긴 뒤 코드+비밀번호로 가입', assertSucceeds(join('ok9', 'old', { joinCode: 'OLD444', joinKey: '7777' })));

// 앱 관리자 (관리자 화면 옮기기·삭제)
await seed();
await t('허용: 앱 관리자가 옛 커뮤니티 옮기기', assertSucceeds((async () => {
  const db = as('appAdmin');
  await setDoc(doc(db, 'communities/old/private/secret'), { inviteCode: 'OLD444', password: '7777' }, { merge: true });
  await setDoc(doc(db, 'inviteCodes/OLD444'), { communityId: 'old' });
  await updateDoc(doc(db, 'communities/old'), { inviteCode: deleteField(), password: deleteField(), hasPassword: true });
})()));
await t('허용: 앱 관리자가 초대 코드·비밀번호 지우기(커뮤니티 삭제)', assertSucceeds((async () => {
  const db = as('appAdmin');
  await deleteDoc(doc(db, 'inviteCodes/PRV123'));
  await deleteDoc(doc(db, 'communities/priv/private/secret'));
})()));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
