// 🗑 계정 삭제(회원 탈퇴) — POST /api/account?action=delete (2026-11-12, Pro라 새 서버 파일)
// 로그인 확인 + "방금(5분 안) 구글 로그인을 다시 했는지" 확인 뒤에만 지운다 — 켜 둔 휴대폰을 남이 집어 지우는 것 방지.
// 무엇을 지우고 무엇을 남기는지는 src/utils/accountDelete.js 한 곳.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { deleteAccountOnServer, isFreshLogin } from '../src/utils/accountDelete.js';

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FB_STORAGE_BUCKET,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 받아요' });
  if (req.query.action !== 'delete') return res.status(400).json({ error: '모르는 요청' });

  const idToken = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (!idToken) return res.status(401).json({ error: '로그인 후 이용할 수 있어요' });
  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(idToken, true); // 이미 지운 계정·끊긴 로그인은 거절
  } catch {
    return res.status(401).json({ error: '로그인이 만료됐어요. 다시 로그인해 주세요' });
  }
  if (!isFreshLogin(decoded)) return res.status(403).json({ error: '본인 확인을 위해 구글 로그인을 한 번 더 해 주세요', needReauth: true });
  if (req.body?.confirm !== '삭제') return res.status(400).json({ error: '"삭제"를 입력해 주세요' });

  const uid = decoded.uid;
  try {
    const bucket = getStorage().bucket();
    const count = await deleteAccountOnServer(getFirestore(), uid, {
      deleteStoragePrefix: (prefix) => bucket.deleteFiles({ prefix, force: true }),
      deleteAuthUser: (id) => getAuth().deleteUser(id),
    });
    console.log('[account] deleted', JSON.stringify(count)); // 계정 번호·이메일은 남기지 않는다
    return res.status(200).json({ ok: true, count });
  } catch (e) {
    console.error('[account] delete failed:', e?.message);
    return res.status(500).json({ error: '삭제 중 문제가 생겼어요. 잠시 뒤 다시 해 주세요 (이미 지운 것은 다시 지워도 괜찮아요)' });
  }
}
