import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, increment, arrayUnion, arrayRemove } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-daymate',
  firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});
const results = [];
const t = async (name, p) => { try { await p; results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name} — ${e.message.split('\n')[0]}`); } };
const C = 'communities/c1';
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const s = (p, d) => setDoc(doc(db, p), d);
  await s('admin/config', { uids: ['appAdmin'] });
  await s(C, { name: '모임', createdBy: 'leader', memberCount: 3 });
  await s(`${C}/members/author`, { nickname: 'a' });
  await s(`${C}/checkins/author`, { uid: 'author', nickname: 'a' });
  await s(`${C}/board/p1`, { uid: 'author', title: '원본', body: 'b', commentCount: 1 });
  await s(`${C}/board/p1/comments/k1`, { uid: 'author', text: '원본댓글', likedBy: [] });
  await s(`${C}/notices/n1`, { uid: 'leader', title: '공지', commentCount: 0 });
  await s(`${C}/notices/n1/comments/k1`, { uid: 'author', text: 'c', likedBy: [] });
  await s(`${C}/events/e1`, { createdBy: 'author', title: '일정' });
  await s('publicBoard/f1', { uid: 'author', title: '원본', commentCount: 0 });
  await s('publicBoard/f1/comments/k1', { uid: 'author', text: 'c', likedBy: [] });
});
const as = (uid) => env.authenticatedContext(uid).firestore();
const up = (uid, p, d) => updateDoc(doc(as(uid), p), d);
const mk = (uid, p, d) => setDoc(doc(as(uid), p), d);

// ── 남의 글 수정 차단 ──
await t('차단: 남이 커뮤니티 게시글 내용 수정', assertFails(up('other', `${C}/board/p1`, { title: '해킹', editedAt: 'x' })));
await t('차단: 남이 댓글 수와 내용을 같이 수정', assertFails(up('other', `${C}/board/p1`, { commentCount: 5, body: '해킹' })));
await t('차단: 남이 커뮤니티 댓글 내용 수정', assertFails(up('other', `${C}/board/p1/comments/k1`, { text: '해킹' })));
await t('차단: 남이 공지 수정', assertFails(up('other', `${C}/notices/n1`, { title: '해킹' })));
await t('차단: 남이 공지 댓글 수정', assertFails(up('other', `${C}/notices/n1/comments/k1`, { text: '해킹' })));
await t('차단: 남이 일정 수정', assertFails(up('other', `${C}/events/e1`, { title: '해킹' })));
await t('차단: 남이 자유게시판 글 수정', assertFails(up('other', 'publicBoard/f1', { title: '해킹' })));
await t('차단: 남이 자유게시판 댓글 수정', assertFails(up('other', 'publicBoard/f1/comments/k1', { text: '해킹' })));
await t('차단: 남의 멤버 닉네임 수정', assertFails(up('other', `${C}/members/author`, { nickname: '해킹' })));
await t('차단: 남의 출석기록 수정', assertFails(up('other', `${C}/checkins/author`, { streak: 999 })));
await t('차단: 글 주인을 나로 바꾸기', assertFails(up('other', `${C}/board/p1`, { uid: 'other' })));
await t('차단: 커뮤니티 관리자도 자유게시판 글 수정 불가', assertFails(up('leader', 'publicBoard/f1', { title: 'x' })));
// ── 남의 이름으로 작성 차단 ──
await t('차단: 남의 이름(uid)으로 게시글 작성', assertFails(mk('other', `${C}/board/p9`, { uid: 'author', title: '사칭' })));
await t('차단: 남의 이름으로 댓글 작성', assertFails(mk('other', `${C}/board/p1/comments/k9`, { uid: 'author', text: '사칭', likedBy: [] })));
await t('차단: 남의 이름으로 자유게시판 글 작성', assertFails(mk('other', 'publicBoard/f9', { uid: 'author', title: '사칭' })));
await t('차단: 남의 이름으로 일정 작성', assertFails(mk('other', `${C}/events/e9`, { createdBy: 'author', title: '사칭' })));
await t('차단: 남의 출석기록 생성', assertFails(mk('other', `${C}/checkins/someone`, { uid: 'someone' })));
await t('차단: 남을 멤버로 가입시키기', assertFails(mk('other', `${C}/members/someone`, { nickname: 's' })));

// ── 앱이 실제로 하는 수정은 유지 ──
await t('허용: 글쓴이가 게시글 수정(updateBoardPost)', assertSucceeds(up('author', `${C}/board/p1`, { title: '수정', body: 'b2', photos: [], editedAt: 'now' })));
await t('허용: 글쓴이가 자유게시판 글 수정', assertSucceeds(up('author', 'publicBoard/f1', { title: '수정', editedAt: 'now' })));
await t('허용: 커뮤니티 관리자가 게시글 수정', assertSucceeds(up('leader', `${C}/board/p1`, { title: '관리자수정' })));
await t('허용: 앱 관리자가 자유게시판 글 수정', assertSucceeds(up('appAdmin', 'publicBoard/f1', { title: '앱관리자수정' })));
await t('허용: 남이 댓글 달며 게시글 댓글수 +1', assertSucceeds(up('other', `${C}/board/p1`, { commentCount: increment(1) })));
await t('허용: 남이 댓글 지우며 댓글수 -1', assertSucceeds(up('other', `${C}/board/p1`, { commentCount: increment(-1) })));
await t('허용: 댓글수 자동보정', assertSucceeds(up('other', `${C}/board/p1`, { commentCount: 3 })));
await t('허용: 공지 댓글수 +1', assertSucceeds(up('other', `${C}/notices/n1`, { commentCount: increment(1) })));
await t('허용: 자유게시판 댓글수 +1', assertSucceeds(up('other', 'publicBoard/f1', { commentCount: increment(1) })));
await t('허용: 남의 댓글 좋아요', assertSucceeds(up('other', `${C}/board/p1/comments/k1`, { likedBy: arrayUnion('other') })));
await t('허용: 좋아요 취소', assertSucceeds(up('other', `${C}/board/p1/comments/k1`, { likedBy: arrayRemove('other') })));
await t('허용: 공지 댓글 좋아요', assertSucceeds(up('other', `${C}/notices/n1/comments/k1`, { likedBy: arrayUnion('other') })));
await t('허용: 자유게시판 댓글 좋아요', assertSucceeds(up('other', 'publicBoard/f1/comments/k1', { likedBy: arrayUnion('other') })));
await t('허용: 내 닉네임 변경(updateMemberNickname)', assertSucceeds(setDoc(doc(as('author'), `${C}/members/author`), { nickname: '새닉' }, { merge: true })));
await t('허용: 내 출석기록 닉네임 반영', assertSucceeds(setDoc(doc(as('author'), `${C}/checkins/author`), { nickname: '새닉' }, { merge: true })));
await t('허용: 다음날 출석(기존 기록 덮어쓰기)', assertSucceeds(mk('author', `${C}/checkins/author`, { uid: 'author', nickname: 'a', streak: 2 })));
await t('허용: 내 이름으로 게시글 작성', assertSucceeds(mk('other', `${C}/board/p2`, { uid: 'other', title: 'x', commentCount: 0 })));
await t('허용: 내 이름으로 댓글 작성', assertSucceeds(mk('other', `${C}/board/p1/comments/k2`, { uid: 'other', text: 'x', likedBy: [] })));
await t('허용: 공지 작성(관리자 본인 명의)', assertSucceeds(mk('leader', `${C}/notices/n2`, { uid: 'leader', title: 'x', body: 'y' })));
await t('허용: 일정 작성', assertSucceeds(mk('other', `${C}/events/e2`, { createdBy: 'other', title: 'x' })));
await t('허용: 커뮤니티 가입(내 멤버 문서)', assertSucceeds(mk('newbie', `${C}/members/newbie`, { nickname: 'n', isAdmin: false })));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
