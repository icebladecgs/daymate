import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, collection, query, where, orderBy, increment } from 'firebase/firestore';
const env = await initializeTestEnvironment({ projectId: 'demo-daymate', firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } });
const results = []; const t = async (n, p) => { try { await p; results.push(`PASS ${n}`); } catch (e) { results.push(`FAIL ${n} — ${e.message.split('\n')[0]}`); } };
const as = (u) => env.authenticatedContext(u).firestore(); const anon = env.unauthenticatedContext().firestore();
await env.clearFirestore();
const now = () => new Date().toISOString();
const member = (nickname) => ({ nickname, joinedAt: now(), streak: 0, totalCerts: 0, lastCertDate: null });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'admin/config'), { uids: ['appAdmin'] });
  await setDoc(doc(db, 'challenges/c1'), { title: '매일 걷기', isPublic: true, hostUid: 'host', hostNickname: '호스트', memberCount: 2, createdAt: now(), status: 'open' });
  await setDoc(doc(db, 'challenges/c1/members/host'), member('호스트'));
  await setDoc(doc(db, 'challenges/c1/members/u1'), member('유저1'));
  await setDoc(doc(db, 'challenges/c1/certs/k1'), { uid: 'u1', nickname: '유저1', dateKey: '2026-10-12', text: '걸었다', createdAt: now(), cheerCount: 0 });
  await setDoc(doc(db, 'challenges/c2'), { title: '지울 챌린지', hostUid: 'host', memberCount: 1, status: 'open' });
  await setDoc(doc(db, 'challenges/c2/members/host'), member('호스트'));
  await setDoc(doc(db, 'challenges/c2/certs/k2'), { uid: 'host', dateKey: '2026-10-12', text: 'x', cheerCount: 0 });
});

// 만들기 (createChallenge)
await t('허용: 본인 명의로 챌린지 만들기', assertSucceeds(setDoc(doc(as('u1'), 'challenges/new1'), { title: '독서', isPublic: true, hostUid: 'u1', hostNickname: '유저1', memberCount: 1, createdAt: now(), status: 'open' })));
await t('허용: 만든 사람이 자기 참여 문서 만들기', assertSucceeds(setDoc(doc(as('u1'), 'challenges/new1/members/u1'), member('유저1'))));
await t('차단: 남을 호스트로 챌린지 만들기', assertFails(setDoc(doc(as('u1'), 'challenges/new2'), { title: 'x', hostUid: 'u2', memberCount: 1, status: 'open' })));
await t('차단: 로그인 안 한 사람이 챌린지 만들기', assertFails(setDoc(doc(anon, 'challenges/new3'), { title: 'x', hostUid: 'anon' })));
await t('허용: 내 챌린지 목록 조회(hostUid 검색)', assertSucceeds(getDocs(query(collection(as('u1'), 'challenges'), where('hostUid', '==', 'u1')))));
await t('허용: 공개 챌린지 목록 조회', assertSucceeds(getDocs(query(collection(as('u2'), 'challenges'), where('isPublic', '==', true)))));
await t('차단: 로그인 안 한 사람이 챌린지 조회', assertFails(getDoc(doc(anon, 'challenges/c1'))));

// 참여 (joinChallenge)
await t('허용: 본인 참여 문서 만들기', assertSucceeds(setDoc(doc(as('u2'), 'challenges/c1/members/u2'), member('유저2'))));
await t('허용: 참여하며 인원수 +1', assertSucceeds(updateDoc(doc(as('u2'), 'challenges/c1'), { memberCount: increment(1) })));
await t('허용: 화면 열 때 인원수 맞추기(syncChallengeMemberCount)', assertSucceeds(updateDoc(doc(as('u2'), 'challenges/c1'), { memberCount: 3 })));
await t('차단: 남을 참여시키기', assertFails(setDoc(doc(as('u2'), 'challenges/c1/members/u3'), member('유저3'))));
await t('허용: 참여자 목록 조회', assertSucceeds(getDocs(collection(as('u2'), 'challenges/c1/members'))));

// 챌린지 문서 수정
await t('허용: 호스트가 챌린지 제목 수정', assertSucceeds(updateDoc(doc(as('host'), 'challenges/c1'), { title: '매일 30분 걷기' })));
await t('허용: 앱 관리자가 챌린지 종료(endChallenge)', assertSucceeds(updateDoc(doc(as('appAdmin'), 'challenges/c1'), { status: 'ended', endedAt: now() })));
await t('차단: 다른 사람이 챌린지 제목 수정', assertFails(updateDoc(doc(as('u1'), 'challenges/c1'), { title: '해킹' })));
await t('차단: 다른 사람이 종료된 챌린지 다시 열기', assertFails(updateDoc(doc(as('u1'), 'challenges/c1'), { status: 'open' })));
await t('차단: 다른 사람이 챌린지 종료', assertFails(updateDoc(doc(as('u1'), 'challenges/c2'), { status: 'ended' })));
await t('차단: 다른 사람이 호스트 빼앗기', assertFails(updateDoc(doc(as('u1'), 'challenges/c1'), { hostUid: 'u1' })));
await t('차단: 인원수와 함께 다른 칸 바꾸기', assertFails(updateDoc(doc(as('u1'), 'challenges/c1'), { memberCount: 5, isPublic: false })));

// 참여 문서 수정 (updateMemberLinkedHabit, 인증 후 연속 기록)
await t('허용: 본인 습관 연결', assertSucceeds(setDoc(doc(as('u1'), 'challenges/c1/members/u1'), { linkedHabitId: 'h1' }, { merge: true })));
await t('허용: 본인 연속 기록 갱신', assertSucceeds(setDoc(doc(as('u1'), 'challenges/c1/members/u1'), { streak: 1, totalCerts: 1, lastCertDate: '2026-10-12' }, { merge: true })));
await t('차단: 남의 연속 기록 바꾸기', assertFails(setDoc(doc(as('u2'), 'challenges/c1/members/u1'), { streak: 0 }, { merge: true })));
await t('차단: 남을 챌린지에서 내보내기', assertFails(deleteDoc(doc(as('u2'), 'challenges/c1/members/u1'))));

// 인증 (certifyChallenge, cheerCert, deleteCert)
await t('허용: 본인 명의로 인증', assertSucceeds(setDoc(doc(as('u2'), 'challenges/c1/certs/k3'), { uid: 'u2', nickname: '유저2', dateKey: '2026-10-12', text: '했다', createdAt: now(), cheerCount: 0 })));
await t('차단: 남의 이름으로 인증', assertFails(setDoc(doc(as('u2'), 'challenges/c1/certs/k4'), { uid: 'u1', nickname: '유저1', dateKey: '2026-10-12', text: '가짜', cheerCount: 0 })));
await t('허용: 오늘 인증했는지 확인(중복 방지 검색)', assertSucceeds(getDocs(query(collection(as('u2'), 'challenges/c1/certs'), where('uid', '==', 'u2'), where('dateKey', '==', '2026-10-12')))));
await t('허용: 인증 목록 조회', assertSucceeds(getDocs(query(collection(as('u2'), 'challenges/c1/certs'), orderBy('createdAt', 'desc')))));
await t('허용: 남의 인증에 응원', assertSucceeds(updateDoc(doc(as('u2'), 'challenges/c1/certs/k1'), { cheerCount: increment(1) })));
await t('차단: 남의 인증 글 고치기', assertFails(updateDoc(doc(as('u2'), 'challenges/c1/certs/k1'), { text: '고침' })));
await t('차단: 응원과 함께 다른 칸 바꾸기', assertFails(updateDoc(doc(as('u2'), 'challenges/c1/certs/k1'), { cheerCount: 9, uid: 'u2' })));
await t('차단: 남의 인증 지우기', assertFails(deleteDoc(doc(as('u2'), 'challenges/c1/certs/k1'))));
await t('차단: 호스트도 남의 인증 지우기', assertFails(deleteDoc(doc(as('host'), 'challenges/c1/certs/k1'))));
await t('허용: 본인 인증 지우기', assertSucceeds(deleteDoc(doc(as('u2'), 'challenges/c1/certs/k3'))));
await t('허용: 앱 관리자가 인증 지우기', assertSucceeds(deleteDoc(doc(as('appAdmin'), 'challenges/c1/certs/k1'))));

// 챌린지 삭제 (deleteChallengeFull — 앱 관리자만)
await t('차단: 호스트가 챌린지 삭제', assertFails(deleteDoc(doc(as('host'), 'challenges/c2'))));
await t('차단: 다른 사람이 챌린지 삭제', assertFails(deleteDoc(doc(as('u1'), 'challenges/c2'))));
await t('허용: 앱 관리자가 참여 문서 정리', assertSucceeds(deleteDoc(doc(as('appAdmin'), 'challenges/c2/members/host'))));
await t('허용: 앱 관리자가 인증 정리', assertSucceeds(deleteDoc(doc(as('appAdmin'), 'challenges/c2/certs/k2'))));
await t('허용: 앱 관리자가 챌린지 삭제', assertSucceeds(deleteDoc(doc(as('appAdmin'), 'challenges/c2'))));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
await env.cleanup();
