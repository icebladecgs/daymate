// 비밀번호 있는 커뮤니티 가입 — 서버(api/chat.js?action=community-join)에서만 부른다 (2026-11-08).
// 예전엔 보안 규칙이 비밀번호를 확인해서 몇 번이든 넣어 볼 수 있었다(4자리는 끈질기게 대입하면 뚫림).
// 이제 비밀번호 있는 커뮤니티는 규칙으로 직접 가입할 수 없고, 서버가 틀린 횟수를 세어 점점 길게 막는다.
// 틀린 횟수는 joinAttempts/{uid}_{커뮤니티id} — 규칙에 match가 없어 앱에서는 읽지도 쓰지도 못한다.
// 이 파일은 firebase-admin을 직접 불러오지 않는다(db를 받아 씀 — 에뮬레이터 테스트용).

// 5번 틀릴 때마다 잠금: 5번 1분, 10번 10분, 15번 1시간, 20번부터 하루 (사용자 선택 "점점 길게")
export const JOIN_FREE_TRIES = 5;
export function lockMsFor(fails) {
  if (fails < JOIN_FREE_TRIES || fails % JOIN_FREE_TRIES !== 0) return 0;
  if (fails >= 20) return 24 * 60 * 60 * 1000;
  if (fails >= 15) return 60 * 60 * 1000;
  if (fails >= 10) return 10 * 60 * 1000;
  return 60 * 1000;
}
// 다음 잠금까지 남은 기회
export const triesLeft = (fails) => JOIN_FREE_TRIES - (fails % JOIN_FREE_TRIES);

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// 결과: { status, body } — status는 HTTP 코드
export async function joinCommunityOnServer(db, uid, input = {}, now = Date.now()) {
  const communityId = str(input.communityId, 64);
  const nickname = str(input.nickname, 20);
  const password = str(input.password, 20);
  const joinCode = str(input.joinCode, 20).toUpperCase();
  if (!SAFE_ID.test(communityId) || !nickname) return { status: 400, body: { error: 'bad-request' } };

  const commRef = db.doc(`communities/${communityId}`);
  const memberRef = db.doc(`communities/${communityId}/members/${uid}`);
  const attemptRef = db.doc(`joinAttempts/${uid}_${communityId}`);

  return db.runTransaction(async (tx) => {
    const [commSnap, memberSnap, secretSnap, attemptSnap] = await Promise.all([
      tx.get(commRef), tx.get(memberRef), tx.get(db.doc(`communities/${communityId}/private/secret`)), tx.get(attemptRef),
    ]);
    if (!commSnap.exists) return { status: 404, body: { error: 'not-found' } };
    if (memberSnap.exists) return { status: 200, body: { ok: true, already: true } };
    const comm = commSnap.data();
    // 아직 옮기지 않은 옛 커뮤니티는 커뮤니티 문서에 그대로 있다 (규칙 communitySecret과 같음)
    const secret = secretSnap.exists ? secretSnap.data() : comm;
    const code = secret.inviteCode || null;
    const pw = secret.password == null ? '' : String(secret.password);

    // 초대 코드: 공개가 아니면 맞아야 한다 (코드는 길고 무작위라 횟수를 세지 않음)
    if (comm.isPublic !== true && !(code && joinCode === code)) return { status: 403, body: { error: 'join-denied' } };

    if (pw) {
      const a = attemptSnap.exists ? attemptSnap.data() : {};
      const fails = Number(a.fails) || 0;
      const lockedUntil = Number(a.lockedUntil) || 0;
      if (lockedUntil > now) return { status: 429, body: { error: 'locked', retryAt: lockedUntil } };
      if (password !== pw) {
        const n = fails + 1;
        const lock = lockMsFor(n);
        tx.set(attemptRef, { uid, communityId, fails: n, lockedUntil: lock ? now + lock : 0, lastAt: now });
        return lock
          ? { status: 429, body: { error: 'locked', retryAt: now + lock } }
          : { status: 403, body: { error: 'wrong-password', left: triesLeft(n) } };
      }
      if (attemptSnap.exists) tx.delete(attemptRef);
    }

    tx.set(memberRef, { nickname, joinedAt: new Date(now).toISOString(), isAdmin: false });
    tx.update(commRef, { memberCount: (Number(comm.memberCount) || 0) + 1 });
    return { status: 200, body: { ok: true } };
  });
}
