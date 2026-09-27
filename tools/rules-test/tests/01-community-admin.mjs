import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, increment } from 'firebase/firestore';

const env = await initializeTestEnvironment({
  projectId: 'demo-daymate',
  firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});

const results = [];
const t = async (name, p) => { try { await p; results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name} — ${e.message.split('\n')[0]}`); } };

const seed = async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admin/config'), { uids: ['appAdmin'] });
    await setDoc(doc(db, 'communities/c1'), { name: '모임', createdBy: 'leader', inviteCode: 'ABC123', memberCount: 3, isPublic: true, password: '1234' });
    await setDoc(doc(db, 'communities/old'), { name: '옛모임', memberCount: 2 }); // createdBy 없는 옛 문서
  });
};
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = env.unauthenticatedContext().firestore();

// ── 막아야 하는 것 ──
await seed();
await t('차단: 일반 멤버가 자기를 관리자로 변경', assertFails(updateDoc(doc(as('member'), 'communities/c1'), { createdBy: 'member' })));
await t('차단: 일반 멤버가 암호 변경', assertFails(updateDoc(doc(as('member'), 'communities/c1'), { password: '0000' })));
await t('차단: 일반 멤버가 이름 변경', assertFails(updateDoc(doc(as('member'), 'communities/c1'), { name: '해킹' })));
await t('차단: 일반 멤버가 인원수와 관리자를 함께 변경', assertFails(updateDoc(doc(as('member'), 'communities/c1'), { memberCount: 9, createdBy: 'member' })));
await t('차단: 남을 관리자로 지정해서 커뮤니티 생성', assertFails(setDoc(doc(as('member'), 'communities/new1'), { name: 'x', createdBy: 'someoneElse', memberCount: 1 })));
await t('차단: 로그인 안 한 사용자 수정', assertFails(updateDoc(doc(anon, 'communities/c1'), { memberCount: 5 })));
await t('차단: 옛 문서(createdBy 없음)에 일반 멤버가 관리자 지정', assertFails(updateDoc(doc(as('member'), 'communities/old'), { createdBy: 'member' })));

// ── 기존 기능 유지 ──
await seed();
await t('허용: 커뮤니티 생성(createCommunity)', assertSucceeds(setDoc(doc(as('member'), 'communities/new2'), { name: '새모임', createdBy: 'member', inviteCode: 'Q1W2E3', createdAt: 'now', memberCount: 1, isPublic: false, password: null })));
await t('허용: 가입 시 인원수 +1(joinCommunity)', assertSucceeds(updateDoc(doc(as('member'), 'communities/c1'), { memberCount: increment(1) })));
await t('허용: 탈퇴 시 인원수 -1(leaveCommunity)', assertSucceeds(updateDoc(doc(as('member'), 'communities/c1'), { memberCount: increment(-1) })));
await t('허용: 인원수 자동보정(syncMemberCount)', assertSucceeds(updateDoc(doc(as('member'), 'communities/c1'), { memberCount: 7 })));
await t('허용: 출석·글쓰기 최근활동 갱신', assertSucceeds(updateDoc(doc(as('member'), 'communities/c1'), { lastActivityAt: '2026-09-24T10:00:00Z' })));
await t('허용: 옛 문서 인원수 갱신', assertSucceeds(updateDoc(doc(as('member'), 'communities/old'), { memberCount: increment(1) })));
await t('허용: 관리자가 암호 변경(setCommunityPassword)', assertSucceeds(updateDoc(doc(as('leader'), 'communities/c1'), { password: '5678' })));
await t('허용: 관리자가 나가며 승계(transferCommunityAdmin)', assertSucceeds(updateDoc(doc(as('leader'), 'communities/c1'), { createdBy: 'member' })));
await t('허용: 승계받은 새 관리자가 암호 변경', assertSucceeds(updateDoc(doc(as('member'), 'communities/c1'), { password: '9999' })));
await t('차단: 승계 후 예전 관리자는 암호 변경 불가', assertFails(updateDoc(doc(as('leader'), 'communities/c1'), { password: '1111' })));
await t('허용: 앱 관리자가 관리자 변경', assertSucceeds(updateDoc(doc(as('appAdmin'), 'communities/c1'), { createdBy: 'leader' })));
await t('허용: 커뮤니티 조회', assertSucceeds(getDoc(doc(as('member'), 'communities/c1'))));
await t('허용: 멤버 문서 쓰기(가입)', assertSucceeds(setDoc(doc(as('member'), 'communities/c1/members/member'), { nickname: 'n', isAdmin: false })));
await t('허용: 게시글 작성', assertSucceeds(setDoc(doc(as('member'), 'communities/c1/board/p1'), { uid: 'member', text: 'hi', commentCount: 0 })));
await t('허용: 앱 관리자 커뮤니티 삭제', assertSucceeds(deleteDoc(doc(as('appAdmin'), 'communities/c1'))));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
