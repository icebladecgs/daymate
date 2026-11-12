// 🗑 계정 삭제(회원 탈퇴) — 서버 쪽 (2026-11-12 사용자 결정, api/account.js가 부른다)
// db = firebase-admin Firestore. 사진 파일·로그인 계정 지우기는 바깥에서 넘겨받는다(테스트에서는 가짜).
// 사용자 결정:
//  - 개인 기록(users/{uid} 아래 전부, 사진 users/{uid}/…, 순위표, 초대 코드, 텔레그램 연결, 문의, 오류 기록)은 모두 지운다.
//  - 커뮤니티·챌린지·게시판에 쓴 글·댓글·채팅·인증은 남기고 이름만 "탈퇴회원"으로 — 계정 번호(uid)도 떼어 나와 이어지지 않게.
//  - 멤버 명단에서는 빠진다. 내가 만든 커뮤니티·챌린지는 가장 오래된 멤버에게 넘기고, 남은 멤버가 없으면 지운다.
//  - 영토는 주인 없는 땅으로.
// 여러 번 불러도 안전하다(이미 지운 것은 건너뜀) — 중간에 실패하면 다시 부르면 된다. 로그인 계정은 맨 마지막에 지운다.
import { FieldValue, FieldPath } from "firebase-admin/firestore";

export const DELETED_NAME = "탈퇴회원";
const ANON = { uid: null, nickname: DELETED_NAME, deletedUser: true };
const FRESH_LOGIN_SEC = 5 * 60; // 삭제는 방금(5분 안) 구글 로그인을 다시 한 경우만

// 방금 다시 로그인했는지 (ID 토큰의 auth_time, 초)
export const isFreshLogin = (decoded, nowSec = Date.now() / 1000) =>
  Number.isFinite(decoded?.auth_time) && nowSec - decoded.auth_time <= FRESH_LOGIN_SEC;

async function updateAll(snap, data) {
  for (const d of snap.docs) await d.ref.update(data);
  return snap.size;
}

// 글 아래 댓글: 내 댓글은 이름만 바꾸고, 남의 댓글의 좋아요 목록에서 나를 뺀다
async function anonymizeComments(postsSnap, uid, count) {
  for (const p of postsSnap.docs) {
    const comments = p.ref.collection("comments");
    count.comments += await updateAll(await comments.where("uid", "==", uid).get(), ANON);
    const liked = await comments.where("likedBy", "array-contains", uid).get();
    for (const c of liked.docs) await c.ref.update({ likedBy: FieldValue.arrayRemove(uid) });
  }
}

// 남은 멤버 중 가장 먼저 들어온 사람 (joinedAt 글자 순 — ISO 시각)
async function oldestMember(membersRef, exceptUid) {
  const snap = await membersRef.get();
  return snap.docs
    .filter((d) => d.id !== exceptUid)
    .sort((a, b) => String(a.data().joinedAt || "").localeCompare(String(b.data().joinedAt || "")))[0] || null;
}

async function cleanCommunities(db, uid, count) {
  const all = await db.collection("communities").get();
  for (const c of all.docs) {
    const ref = c.ref;
    // 예전에 나간 커뮤니티에도 글이 남아 있을 수 있어서 모든 커뮤니티를 본다
    count.chat += await updateAll(await ref.collection("chat").where("uid", "==", uid).get(), ANON);
    count.posts += await updateAll(await ref.collection("board").where("uid", "==", uid).get(), ANON);
    await anonymizeComments(await ref.collection("board").get(), uid, count);
    count.posts += await updateAll(await ref.collection("notices").where("uid", "==", uid).get(), { uid: null, deletedUser: true });
    await anonymizeComments(await ref.collection("notices").get(), uid, count);
    count.posts += await updateAll(await ref.collection("events").where("createdBy", "==", uid).get(), { createdBy: null, creatorNickname: DELETED_NAME });
    for (const raid of (await ref.collection("raids").get()).docs) {
      const hit = raid.ref.collection("hits").doc(uid);
      if ((await hit.get()).exists) await hit.update({ nickname: DELETED_NAME });
      if (raid.data().defeatedBy === uid) await raid.ref.update({ defeatedBy: null });
    }
    await ref.collection("checkins").doc(uid).delete();

    const memberRef = ref.collection("members").doc(uid);
    if ((await memberRef.get()).exists) {
      await memberRef.delete();
      await ref.update({ memberCount: FieldValue.increment(-1) });
      count.communities++;
    }
    if (c.data().createdBy === uid) {
      const next = await oldestMember(ref.collection("members"), uid);
      if (next) {
        await ref.update({ createdBy: next.id });
        await next.ref.update({ isAdmin: true });
        count.handedOver++;
      } else {
        const code = (await ref.collection("private").doc("secret").get()).data()?.inviteCode || c.data().inviteCode || null;
        if (code) await db.doc(`inviteCodes/${code}`).delete();
        await db.recursiveDelete(ref);
        count.removedGroups++;
      }
    }
  }
}

async function cleanChallenges(db, uid, count) {
  const all = await db.collection("challenges").get();
  for (const ch of all.docs) {
    const ref = ch.ref;
    count.certs += await updateAll(await ref.collection("certs").where("uid", "==", uid).get(), ANON);
    const memberRef = ref.collection("members").doc(uid);
    if ((await memberRef.get()).exists) {
      await memberRef.delete();
      await ref.update({ memberCount: FieldValue.increment(-1) });
      count.challenges++;
    }
    if (ch.data().hostUid === uid) {
      const next = await oldestMember(ref.collection("members"), uid);
      if (next) {
        await ref.update({ hostUid: next.id, hostNickname: next.data().nickname || "" });
        count.handedOver++;
      } else {
        await db.recursiveDelete(ref);
        count.removedGroups++;
      }
    }
  }
}

async function deleteByPrefix(db, collection, uid) {
  // 문서 이름이 "{uid}_…"인 기록 (초대 코드 사용, 영토 도전 횟수, 커뮤니티 가입 시도)
  const snap = await db.collection(collection)
    .where(FieldPath.documentId(), ">=", db.doc(`${collection}/${uid}_`))
    .where(FieldPath.documentId(), "<", db.doc(`${collection}/${uid}_${String.fromCharCode(0xf8ff)}`)).get();
  for (const d of snap.docs) await d.ref.delete();
  return snap.size;
}

async function deleteWhere(db, collection, field, uid) {
  const snap = await db.collection(collection).where(field, "==", uid).get();
  for (const d of snap.docs) await d.ref.delete();
  return snap.size;
}

export async function deleteAccountOnServer(db, uid, { deleteStoragePrefix, deleteAuthUser } = {}) {
  if (!uid || typeof uid !== "string") throw new Error("uid 없음");
  const count = { chat: 0, posts: 0, comments: 0, certs: 0, communities: 0, challenges: 0, handedOver: 0, removedGroups: 0, territories: 0, records: 0 };

  // 1) 함께 쓰는 곳 — 글은 남기고 이름만 탈퇴회원, 명단에서 빼기, 관리자 넘기기
  await cleanCommunities(db, uid, count);
  await cleanChallenges(db, uid, count);
  count.posts += await updateAll(await db.collection("publicBoard").where("uid", "==", uid).get(), ANON);
  await anonymizeComments(await db.collection("publicBoard").get(), uid, count);

  // 2) 영토 — 주인 없는 땅으로 (지킴이로 돌아감)
  const lands = await db.collection("territories").where("ownerUid", "==", uid).get();
  for (const d of lands.docs) await d.ref.update({ ownerUid: null, owner: null, capturedAt: null });
  count.territories = lands.size;
  const lost = await db.collection("territories").where("prevOwnerUid", "==", uid).get();
  for (const d of lost.docs) await d.ref.update({ prevOwnerUid: null, prevOwnerName: DELETED_NAME });

  // 3) 개인 기록
  await db.doc(`rankings/${uid}`).delete();
  await db.doc(`tg_users/${uid}`).delete();
  await db.doc(`notifyLog/${uid}`).delete();
  count.records += await deleteWhere(db, "userInviteCodes", "uid", uid);
  count.records += await deleteWhere(db, "tg_connect", "uid", uid);
  count.records += await deleteWhere(db, "suggestions", "uid", uid);
  count.records += await deleteWhere(db, "errorLogs", "uid", uid);
  for (const col of ["inviteUses", "territoryTries", "joinAttempts"]) count.records += await deleteByPrefix(db, col, uid);
  await db.recursiveDelete(db.doc(`users/${uid}`)); // 할일·메모·일기·설정·연락처·오답 노트 등 전부

  // 4) 사진 파일 (users/{uid}/ 아래 — 메모·명함·꿈 목록·오답 노트). 커뮤니티 글에 붙은 사진은 글과 함께 남는다
  if (deleteStoragePrefix) await deleteStoragePrefix(`users/${uid}/`);

  // 5) 로그인 계정 — 맨 마지막 (앞에서 실패하면 다시 로그인해 다시 할 수 있게)
  if (deleteAuthUser) await deleteAuthUser(uid);
  return count;
}
