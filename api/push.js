// FCM Web Push 전송 — VAPID 방식
import webpush from 'web-push';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const db = getFirestore();

webpush.setVapidDetails(
  'mailto:daymate@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Firebase ID 토큰 → uid (없거나 만료면 null)
async function uidFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) return null;
  try { return (await getAuth().verifyIdToken(idToken)).uid; } catch { return null; }
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

// ── 커뮤니티 단체 채팅 알림 (type: 'chat') ──
// 보낸 사람이 자기 메시지를 보낸 직후 부른다. 서버가 메시지·멤버를 직접 확인하고, 다른 멤버들에게 푸시를 보낸다.
// 받는 사람 설정(users/{uid}/data/settings.chatPush): enabled(전체 끄기), muted[커뮤니티id], preview(잠금화면 내용)
// (Vercel Hobby는 서버 함수 12개 제한이라 새 파일 대신 이 파일에 둔다)
async function chatPush(req, res) {
  const uid = await uidFromRequest(req);
  if (!uid) return res.status(401).json({ ok: false, error: '인증이 필요해요' });
  const { communityId, messageId } = req.body || {};
  if (!SAFE_ID.test(communityId || '') || !SAFE_ID.test(messageId || '')) return res.status(400).json({ ok: false });

  const msgRef = db.doc(`communities/${communityId}/chat/${messageId}`);
  // 같은 메시지로 두 번 보내지 않게 pushedAt 표시 (보낸 사람 본인 메시지, 5분 안에만)
  const msg = await db.runTransaction(async (tx) => {
    const snap = await tx.get(msgRef);
    const m = snap.data();
    if (!m || m.uid !== uid || m.pushedAt) return null;
    if (Date.now() - new Date(m.createdAt).getTime() > 5 * 60 * 1000) return null;
    tx.update(msgRef, { pushedAt: new Date().toISOString() });
    return m;
  });
  if (!msg) return res.status(200).json({ ok: true, sent: 0, skipped: 'not-eligible' });

  const [communitySnap, membersSnap] = await Promise.all([
    db.doc(`communities/${communityId}`).get(),
    db.collection(`communities/${communityId}/members`).limit(300).get(),
  ]);
  const name = communitySnap.data()?.name || '커뮤니티';
  const others = membersSnap.docs.map(d => d.id).filter(id => id !== uid);
  if (!others.length) return res.status(200).json({ ok: true, sent: 0 });

  const settingsRefs = others.map(id => db.doc(`users/${id}/data/settings`));
  const settings = await db.getAll(...settingsRefs);
  const text = msg.text?.trim() ? clip(msg.text.trim().replace(/\s+/g, ' '), 80) : '📷 사진';
  let sent = 0;
  await Promise.allSettled(settings.map(async (snap, i) => {
    const s = snap.data() || {};
    const prefs = s.chatPush || {};
    if (prefs.enabled === false || prefs.muted?.[communityId] || !s.pushSubscription) return;
    const payload = {
      kind: 'chat',
      cid: communityId,
      tag: `chat-${communityId}`,
      title: `💬 ${name}`,
      body: prefs.preview === false ? '새 메시지가 있어요' : `${msg.nickname || '익명'}: ${text}`,
      url: `/?community=${encodeURIComponent(communityId)}&chat=1`,
    };
    try {
      await webpush.sendNotification(s.pushSubscription, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e) {
      // 만료된 구독(앱 삭제·권한 해제)은 지워서 다음부터 시도하지 않는다
      if (e.statusCode === 404 || e.statusCode === 410) await settingsRefs[i].update({ pushSubscription: FieldValue.delete() }).catch(() => {});
    }
  }));
  return res.status(200).json({ ok: true, sent });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  if (req.body?.type === 'chat') {
    try { return await chatPush(req, res); } catch (e) {
      console.error('[push] chat push failed:', e);
      return res.status(500).json({ ok: false });
    }
  }
  const { uid, title, body } = req.body || {};
  if (!uid || !title) return res.status(400).json({ ok: false });

  // 요청자가 실제로 이 uid의 로그인 당사자인지 Firebase ID 토큰으로 검증
  // (검증 없이 uid만 신뢰하면 남의 uid로 임의 내용의 푸시를 강제 발송할 수 있음)
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) return res.status(401).json({ ok: false, error: '인증이 필요해요' });
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    if (decoded.uid !== uid) return res.status(403).json({ ok: false, error: '권한이 없어요' });
  } catch {
    return res.status(401).json({ ok: false, error: '인증이 만료됐어요' });
  }

  try {
    const snap = await db.doc(`users/${uid}/data/settings`).get();
    const sub = snap.data()?.pushSubscription;
    if (!sub) return res.status(404).json({ ok: false, reason: 'no subscription' });

    await webpush.sendNotification(sub, JSON.stringify({ title, body }));
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[push] notification send failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
}
