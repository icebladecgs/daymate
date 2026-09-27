import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDocs, collection, increment, arrayUnion } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-daymate',
  firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
const results = [];
const t = async (name, p) => { try { await p; results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name} — ${e.message.split('\n')[0]}`); } };
const C = 'communities/c1';
const seed = async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const s = (p, d) => setDoc(doc(db, p), d);
    await s('admin/config', { uids: ['appAdmin'] });
    await s(C, { name: '모임', createdBy: 'leader', memberCount: 3 });
    await s(`${C}/members/author`, { nickname: 'a' });
    await s(`${C}/members/other`, { nickname: 'o' });
    await s(`${C}/checkins/author`, { uid: 'author' });
    await s(`${C}/board/p1`, { uid: 'author', title: 't', commentCount: 1 });
    await s(`${C}/board/p1/comments/k1`, { uid: 'author', text: 'c', likedBy: [] });
    await s(`${C}/board/legacy`, { title: 'uid 없는 옛 글' });
    await s(`${C}/notices/n1`, { uid: 'leader', title: 'n', commentCount: 1 });
    await s(`${C}/notices/n1/comments/k1`, { uid: 'author', text: 'c', likedBy: [] });
    await s(`${C}/events/e1`, { createdBy: 'author', title: 'e' });
    await s('publicBoard/f1', { uid: 'author', title: 'f', commentCount: 1 });
    await s('publicBoard/f1/comments/k1', { uid: 'author', text: 'c', likedBy: [] });
  });
};
const as = (uid) => env.authenticatedContext(uid).firestore();
const del = (uid, p) => deleteDoc(doc(as(uid), p));

const cases = [
  ['커뮤니티 게시글', `${C}/board/p1`, true],
  ['커뮤니티 게시글 댓글', `${C}/board/p1/comments/k1`, true],
  ['공지 댓글', `${C}/notices/n1/comments/k1`, true],
  ['일정', `${C}/events/e1`, true],
  ['자유게시판 글', 'publicBoard/f1', false],
  ['자유게시판 댓글', 'publicBoard/f1/comments/k1', false],
];
for (const [label, path, communityScoped] of cases) {
  await seed(); await t(`차단: 남(other)이 ${label} 삭제`, assertFails(del('other', path)));
  await seed(); await t(`허용: 글쓴이가 ${label} 삭제`, assertSucceeds(del('author', path)));
  await seed(); await t(`허용: 앱 관리자가 ${label} 삭제`, assertSucceeds(del('appAdmin', path)));
  await seed();
  if (communityScoped) await t(`허용: 커뮤니티 관리자가 ${label} 삭제`, assertSucceeds(del('leader', path)));
  else await t(`차단: 커뮤니티 관리자도 ${label}은 삭제 불가`, assertFails(del('leader', path)));
}
await seed(); await t('차단: 남이 공지 삭제', assertFails(del('other', `${C}/notices/n1`)));
await seed(); await t('허용: 커뮤니티 관리자(작성자)가 공지 삭제', assertSucceeds(del('leader', `${C}/notices/n1`)));
await seed(); await t('차단: 남이 다른 멤버를 내보내기', assertFails(del('other', `${C}/members/author`)));
await seed(); await t('허용: 본인 탈퇴(멤버 문서 삭제)', assertSucceeds(del('author', `${C}/members/author`)));
await seed(); await t('허용: 커뮤니티 관리자가 멤버 문서 삭제', assertSucceeds(del('leader', `${C}/members/author`)));
await seed(); await t('차단: 남의 출석기록 삭제', assertFails(del('other', `${C}/checkins/author`)));
await seed(); await t('차단: uid 없는 옛 글을 일반 멤버가 삭제', assertFails(del('other', `${C}/board/legacy`)));
await seed(); await t('허용: uid 없는 옛 글을 커뮤니티 관리자가 삭제', assertSucceeds(del('leader', `${C}/board/legacy`)));

// 기존 기능 유지 (작성·수정·좋아요·댓글수)
await seed();
await t('허용: 게시글 작성', assertSucceeds(setDoc(doc(as('other'), `${C}/board/p2`), { uid: 'other', title: 'x' })));
await t('허용: 남의 글에 댓글 달며 댓글수 +1', assertSucceeds(updateDoc(doc(as('other'), `${C}/board/p1`), { commentCount: increment(1) })));
await t('허용: 남의 댓글 좋아요', assertSucceeds(updateDoc(doc(as('other'), `${C}/board/p1/comments/k1`), { likedBy: arrayUnion('other') })));
await t('허용: 자유게시판 글 수정', assertSucceeds(updateDoc(doc(as('author'), 'publicBoard/f1'), { title: '수정' })));
await t('허용: 일정 추가', assertSucceeds(setDoc(doc(as('other'), `${C}/events/e2`), { createdBy: 'other', title: 'x' })));
await t('허용: 출석', assertSucceeds(setDoc(doc(as('other'), `${C}/checkins/other`), { uid: 'other' })));
await t('허용: 가입(멤버 문서 생성)', assertSucceeds(setDoc(doc(as('newbie'), `${C}/members/newbie`), { nickname: 'n' })));

// 커뮤니티 통째 삭제 (deleteCommunityFull 순서 재현)
const fullDelete = async (uid) => {
  const db = as(uid);
  for (const sub of ['members', 'events', 'checkins', 'notices', 'board']) {
    const snap = await getDocs(collection(db, C, sub));
    for (const d of snap.docs) {
      if (sub === 'notices' || sub === 'board') {
        const cs = await getDocs(collection(db, C, sub, d.id, 'comments'));
        for (const c of cs.docs) await deleteDoc(c.ref);
      }
      await deleteDoc(d.ref);
    }
  }
  await deleteDoc(doc(db, C));
};
await seed(); await t('허용: 앱 관리자가 커뮤니티 통째 삭제(관리자 화면)', assertSucceeds(fullDelete('appAdmin')));
await seed(); await t('차단(기존과 동일): 일반 멤버는 커뮤니티 삭제 불가', assertFails(fullDelete('other')));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
