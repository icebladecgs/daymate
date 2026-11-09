// 🎟 친구 초대 코드 사용 — 서버 쪽 (api/chat.js?action=invite-use, 2026-11-09)
// 예전엔 코드를 쓴 사람의 앱이 코드 주인의 순위표(rankings) 초대 수를 직접 올렸는데 규칙상 본인만 쓸 수 있어 늘 실패했고,
// 개인 코드 등록도 커뮤니티 코드 저장소(inviteCodes)에 하다가 11-01 규칙 변경 뒤로 거절됐다. 코드가 진짜인지도 안 봐서
// 아무 글자나 넣어도 +100 XP를 받았다. 이제 서버가 확인하고 주인의 초대 수를 올린다.
// db = firebase-admin Firestore. 기록: inviteUses/{쓴 사람 uid}_{코드} (서버만), 개인 코드는 userInviteCodes/{코드} = { uid }
export const INVITE_CODE_RE = /^[A-Z0-9]{4,12}$/;

export async function applyInviteOnServer(db, uid, input = {}, now = Date.now()) {
  const code = String(input.code || "").trim().toUpperCase();
  if (!INVITE_CODE_RE.test(code)) return { status: 400, body: { error: "코드 형식이 맞지 않아요" } };
  // 개인 코드 → 없으면 11-01 전에 옛 저장소에 등록된 개인 코드(커뮤니티 코드는 uid가 없어서 해당 안 됨)
  let owner = null;
  const snap = await db.doc(`userInviteCodes/${code}`).get();
  if (snap.exists) owner = snap.data()?.uid || null;
  if (!owner) {
    const legacy = await db.doc(`inviteCodes/${code}`).get();
    if (legacy.exists && typeof legacy.data()?.uid === "string") owner = legacy.data().uid;
  }
  if (!owner) return { status: 404, body: { error: "없는 코드예요. 다시 확인해 주세요" } };
  if (owner === uid) return { status: 400, body: { error: "내 코드는 사용할 수 없어요" } };

  const useRef = db.doc(`inviteUses/${uid}_${code}`);
  const rankRef = db.doc(`rankings/${owner}`);
  const ok = await db.runTransaction(async (tx) => {
    const [used, rank] = await Promise.all([tx.get(useRef), tx.get(rankRef)]);
    if (used.exists) return false;
    tx.set(useRef, { uid, code, owner, at: new Date(now) });
    tx.set(rankRef, { inviteCount: (Number(rank.exists ? rank.data().inviteCount : 0) || 0) + 1 }, { merge: true });
    return true;
  });
  if (!ok) return { status: 409, body: { error: "이미 사용한 코드예요" } };
  return { status: 200, body: { ok: true } };
}
