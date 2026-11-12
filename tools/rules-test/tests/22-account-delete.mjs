// 🗑 계정 삭제(회원 탈퇴) — 실제 서버 코드(src/utils/accountDelete.js, api/account.js가 부름)를 에뮬레이터에서 (2026-11-12)
// A가 탈퇴: A의 개인 기록은 모두 지워지고, 커뮤니티·챌린지 글은 "탈퇴회원"으로 남고, B·C의 것은 그대로인지 본다.
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!getApps().length) initializeApp({ projectId: 'demo-daymate' });
const db = getFirestore();
const { deleteAccountOnServer, isFreshLogin, DELETED_NAME } = await import('../../../src/utils/accountDelete.js');

const results = [];
const t = (name, ok, detail = '') => results.push(ok ? `PASS ${name}` : `FAIL ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
const get = async (p) => (await db.doc(p).get());
const data = async (p) => (await get(p)).data();
const exists = async (p) => (await get(p)).exists;

// 비우기
for (const c of await db.listCollections()) await db.recursiveDelete(c);

// ── 준비: A(탈퇴할 사람), B, C ──
const set = (p, v) => db.doc(p).set(v);
await set('users/A', { email: 'a@test.com', name: 'A' });
await set('users/A/data/settings', { birthDate: '1990-01-01' });
await set('users/A/days/2026-11-12', { memos: [{ id: 'm', text: '비밀 메모' }] });
await set('users/A/contacts/c1', { name: '친구', phone: '010' });
await set('users/B/days/2026-11-12', { memos: [{ id: 'm', text: 'B 메모' }] });
await set('rankings/A', { nickname: 'A닉' });
await set('rankings/B', { nickname: 'B닉' });
await set('userInviteCodes/AAAA11', { uid: 'A' });
await set('userInviteCodes/BBBB22', { uid: 'B' });
await set('inviteUses/A_BBBB22', { uid: 'A' });
await set('inviteUses/B_AAAA11', { uid: 'B' });
await set('inviteUses/AB_XXXX99', { uid: 'AB' }); // 이름이 A로 시작하는 다른 사람 — 지우면 안 됨
await set('territoryTries/A_1101', { n: 1 });
await set('joinAttempts/A_c1', { n: 1 });
await set('tg_users/A', { chatId: 1 });
await set('tg_connect/CODE', { uid: 'A' });
await set('suggestions/s1', { uid: 'A', text: '문의' });
await set('suggestions/s2', { uid: 'B', text: '문의' });
await set('errorLogs/e1', { uid: 'A', msg: 'x' });
await set('notifyLog/A', { sent: {} });

// 커뮤니티 c1: A가 만듦, 멤버 A·B·C (B가 가장 오래된 다른 멤버)
await set('communities/c1', { name: '모임1', createdBy: 'A', memberCount: 3 });
await set('communities/c1/members/A', { nickname: 'A닉', joinedAt: '2026-01-01T00:00:00Z', isAdmin: true });
await set('communities/c1/members/C', { nickname: 'C닉', joinedAt: '2026-03-01T00:00:00Z', isAdmin: false });
await set('communities/c1/members/B', { nickname: 'B닉', joinedAt: '2026-02-01T00:00:00Z', isAdmin: false });
await set('communities/c1/chat/m1', { uid: 'A', nickname: 'A닉', text: 'A 채팅' });
await set('communities/c1/chat/m2', { uid: 'B', nickname: 'B닉', text: 'B 채팅' });
await set('communities/c1/board/p1', { uid: 'A', nickname: 'A닉', title: 'A 글', body: '내용' });
await set('communities/c1/board/p1/comments/k1', { uid: 'B', nickname: 'B닉', text: 'B 댓글', likedBy: ['A'] });
await set('communities/c1/board/p2', { uid: 'B', nickname: 'B닉', title: 'B 글' });
await set('communities/c1/board/p2/comments/k2', { uid: 'A', nickname: 'A닉', text: 'A 댓글', likedBy: ['A', 'B'] });
await set('communities/c1/notices/n1', { uid: 'A', title: '공지' });
await set('communities/c1/notices/n1/comments/k3', { uid: 'A', nickname: 'A닉', text: '공지 댓글', likedBy: [] });
await set('communities/c1/events/ev1', { createdBy: 'A', creatorNickname: 'A닉', title: '모임' });
await set('communities/c1/checkins/A', { uid: 'A', nickname: 'A닉' });
await set('communities/c1/checkins/B', { uid: 'B', nickname: 'B닉' });
await set('communities/c1/raids/w1', { level: 1, defeatedBy: 'A' });
await set('communities/c1/raids/w1/hits/A', { nickname: 'A닉', dmg: 100 });
await set('communities/c1/raids/w1/hits/B', { nickname: 'B닉', dmg: 50 });
// c2: A 혼자 → 지워짐
await set('communities/c2', { name: '혼자', createdBy: 'A', memberCount: 1 });
await set('communities/c2/members/A', { nickname: 'A닉', joinedAt: '2026-01-01T00:00:00Z' });
await set('communities/c2/private/secret', { inviteCode: 'CODE2', password: null });
await set('communities/c2/chat/x', { uid: 'A', text: '혼자 채팅' });
await set('inviteCodes/CODE2', { communityId: 'c2' });
// c3: B가 만듦, A는 멤버
await set('communities/c3', { name: '모임3', createdBy: 'B', memberCount: 2 });
await set('communities/c3/members/A', { nickname: 'A닉', joinedAt: '2026-01-01T00:00:00Z' });
await set('communities/c3/members/B', { nickname: 'B닉', joinedAt: '2025-01-01T00:00:00Z' });
// 챌린지 ch1: A가 만듦, B도 참여 / ch2: A 혼자
await set('challenges/ch1', { hostUid: 'A', hostNickname: 'A닉', memberCount: 2 });
await set('challenges/ch1/members/A', { nickname: 'A닉', joinedAt: '2026-01-01T00:00:00Z' });
await set('challenges/ch1/members/B', { nickname: 'B닉', joinedAt: '2026-02-01T00:00:00Z' });
await set('challenges/ch1/certs/ce1', { uid: 'A', nickname: 'A닉', text: '인증' });
await set('challenges/ch1/certs/ce2', { uid: 'B', nickname: 'B닉', text: '인증' });
await set('challenges/ch2', { hostUid: 'A', hostNickname: 'A닉', memberCount: 1 });
await set('challenges/ch2/members/A', { nickname: 'A닉', joinedAt: '2026-01-01T00:00:00Z' });
// 자유게시판
await set('publicBoard/pb1', { uid: 'A', nickname: 'A닉', title: 'A 글' });
await set('publicBoard/pb2', { uid: 'B', nickname: 'B닉', title: 'B 글' });
await set('publicBoard/pb2/comments/k4', { uid: 'A', nickname: 'A닉', text: 'A 댓글', likedBy: ['A'] });
// 영토
await set('territories/1101', { code: '1101', ownerUid: 'A', owner: { lv: 5 }, capturedAt: 'x' });
await set('territories/1102', { code: '1102', ownerUid: 'B', owner: { lv: 3 }, prevOwnerUid: 'A', prevOwnerName: 'A닉' });

// ── 실행 ──
const storageCalls = [], authCalls = [];
const count = await deleteAccountOnServer(db, 'A', {
  deleteStoragePrefix: async (p) => { storageCalls.push(p); },
  deleteAuthUser: async (u) => { authCalls.push(u); },
});

// ── 개인 기록: 지워짐 ──
t('A 기록 전부 지움 (users/A 아래)', !(await exists('users/A')) && !(await exists('users/A/days/2026-11-12')) && !(await exists('users/A/contacts/c1')) && !(await exists('users/A/data/settings')));
t('B 기록은 그대로', (await data('users/B/days/2026-11-12'))?.memos?.[0]?.text === 'B 메모');
t('순위표: A만 지움', !(await exists('rankings/A')) && await exists('rankings/B'));
t('초대 코드: A 것만 지움', !(await exists('userInviteCodes/AAAA11')) && await exists('userInviteCodes/BBBB22'));
t('초대 사용 기록: A_만 지움 (B_·AB_는 그대로)', !(await exists('inviteUses/A_BBBB22')) && await exists('inviteUses/B_AAAA11') && await exists('inviteUses/AB_XXXX99'));
t('영토 도전·가입 시도 기록 지움', !(await exists('territoryTries/A_1101')) && !(await exists('joinAttempts/A_c1')));
t('텔레그램 연결 지움', !(await exists('tg_users/A')) && !(await exists('tg_connect/CODE')));
t('문의: A 것만 지움', !(await exists('suggestions/s1')) && await exists('suggestions/s2'));
t('오류 기록·알림 기록 지움', !(await exists('errorLogs/e1')) && !(await exists('notifyLog/A')));
t('사진: users/A/ 아래만 지우라고 부름', JSON.stringify(storageCalls) === JSON.stringify(['users/A/']), storageCalls);
t('로그인 계정 지움 (맨 마지막)', JSON.stringify(authCalls) === JSON.stringify(['A']), authCalls);

// ── 커뮤니티: 글은 남고 이름만 탈퇴회원 ──
const m1 = await data('communities/c1/chat/m1');
t('채팅: 남고 이름 탈퇴회원·계정 번호 뗌', m1?.text === 'A 채팅' && m1.nickname === DELETED_NAME && m1.uid === null && m1.deletedUser === true, m1);
t('채팅: B 것은 그대로', (await data('communities/c1/chat/m2'))?.nickname === 'B닉');
const p1 = await data('communities/c1/board/p1');
t('게시글: 남고 이름 탈퇴회원', p1?.title === 'A 글' && p1.nickname === DELETED_NAME && p1.uid === null, p1);
const k1 = await data('communities/c1/board/p1/comments/k1');
t('내 글의 남의 댓글: 그대로, 좋아요에서 A만 빠짐', k1?.nickname === 'B닉' && k1.uid === 'B' && JSON.stringify(k1.likedBy) === '[]', k1);
const k2 = await data('communities/c1/board/p2/comments/k2');
t('남의 글에 단 내 댓글: 이름 탈퇴회원, 좋아요에서 A 빠짐', k2?.text === 'A 댓글' && k2.nickname === DELETED_NAME && JSON.stringify(k2.likedBy) === '["B"]', k2);
const n1 = await data('communities/c1/notices/n1');
t('공지: 남고 계정 번호 뗌', n1?.title === '공지' && n1.uid === null, n1);
t('공지 댓글: 이름 탈퇴회원', (await data('communities/c1/notices/n1/comments/k3'))?.nickname === DELETED_NAME);
const ev = await data('communities/c1/events/ev1');
t('일정: 남고 만든 사람 탈퇴회원', ev?.title === '모임' && ev.createdBy === null && ev.creatorNickname === DELETED_NAME, ev);
t('출석: A 것만 지움', !(await exists('communities/c1/checkins/A')) && await exists('communities/c1/checkins/B'));
const hitA = await data('communities/c1/raids/w1/hits/A');
t('보스전 공격 기록: 피해는 남고 이름 탈퇴회원', hitA?.dmg === 100 && hitA.nickname === DELETED_NAME, hitA);
t('보스 처치 표시: 계정 번호 뗌', (await data('communities/c1/raids/w1'))?.defeatedBy === null);
const c1 = await data('communities/c1');
t('멤버 명단에서 빠짐, 인원 3→2', !(await exists('communities/c1/members/A')) && c1?.memberCount === 2, c1);
t('관리자는 가장 오래된 멤버(B)에게', c1?.createdBy === 'B' && (await data('communities/c1/members/B'))?.isAdmin === true && (await data('communities/c1/members/C'))?.isAdmin === false, c1);
t('혼자였던 커뮤니티는 지워짐 (초대 코드도)', !(await exists('communities/c2')) && !(await exists('communities/c2/chat/x')) && !(await exists('communities/c2/private/secret')) && !(await exists('inviteCodes/CODE2')));
const c3 = await data('communities/c3');
t('남이 만든 커뮤니티: 나만 빠지고 관리자 그대로', !(await exists('communities/c3/members/A')) && c3?.memberCount === 1 && c3.createdBy === 'B', c3);

// ── 챌린지 ──
const ce1 = await data('challenges/ch1/certs/ce1');
t('인증: 남고 이름 탈퇴회원', ce1?.text === '인증' && ce1.nickname === DELETED_NAME && ce1.uid === null, ce1);
t('인증: B 것은 그대로', (await data('challenges/ch1/certs/ce2'))?.nickname === 'B닉');
const ch1 = await data('challenges/ch1');
t('챌린지: 만든 사람 B로 넘어감, 인원 2→1', ch1?.hostUid === 'B' && ch1.hostNickname === 'B닉' && ch1.memberCount === 1 && !(await exists('challenges/ch1/members/A')), ch1);
t('혼자였던 챌린지는 지워짐', !(await exists('challenges/ch2')) && !(await exists('challenges/ch2/members/A')));

// ── 자유게시판·영토 ──
t('자유게시판 글: 남고 이름 탈퇴회원', (await data('publicBoard/pb1'))?.nickname === DELETED_NAME && (await data('publicBoard/pb2'))?.nickname === 'B닉');
const k4 = await data('publicBoard/pb2/comments/k4');
t('자유게시판 댓글: 이름 탈퇴회원, 좋아요 빠짐', k4?.nickname === DELETED_NAME && JSON.stringify(k4.likedBy) === '[]', k4);
const t1 = await data('territories/1101');
t('내 땅: 주인 없는 땅으로', t1?.ownerUid === null && t1.owner === null, t1);
const t2 = await data('territories/1102');
t('남의 땅: 예전 주인 기록에서 A 뗌', t2?.ownerUid === 'B' && t2.prevOwnerUid === null && t2.prevOwnerName === DELETED_NAME, t2);
t('세어 준 숫자', count.chat === 2 && count.communities === 3 && count.challenges === 2 && count.handedOver === 2 && count.removedGroups === 2 && count.territories === 1, count);

// ── 한 번 더 불러도 괜찮음 (중간 실패 뒤 다시) ──
let again = null;
try { again = await deleteAccountOnServer(db, 'A', {}); } catch (e) { again = e; }
t('다시 불러도 오류 없음', again && !(again instanceof Error), again?.message);
t('다시 불러도 B 데이터 그대로', (await data('communities/c1'))?.memberCount === 2 && (await data('challenges/ch1'))?.memberCount === 1);

// ── 방금 로그인 확인 ──
const now = 1_800_000_000;
t('5분 안 로그인만 삭제 허용', isFreshLogin({ auth_time: now - 60 }, now) && isFreshLogin({ auth_time: now - 300 }, now) && !isFreshLogin({ auth_time: now - 301 }, now) && !isFreshLogin({}, now));

let threw = false;
try { await deleteAccountOnServer(db, ''); } catch { threw = true; }
t('계정 번호 없으면 거절', threw);

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
