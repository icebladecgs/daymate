import { saveSettings } from "../firebase.js";

// 이 기기를 푸시 알림 받을 기기로 등록 (계정당 한 기기 — 마지막으로 등록한 기기로 알림이 간다)
// 알림 권한이 허용된 상태에서만 동작. App 시작 때와, 알림 설정·테스트에서 부른다.
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cleanKey = (k) => String(k || '').trim().replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// 데스크탑 앱(Electron)은 푸시를 받을 수 없어서 등록하지 않는다 — 트레이에 늘 떠 있어서
// 휴대폰 등록을 쓸모없는 등록으로 덮어쓰던 문제(2026-09-27, 테스트 푸시 410 만료)
export const pushSupported = () => !!VAPID_PUBLIC && typeof window !== 'undefined' && !window.daymateDesktop
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// force: 기존 등록을 지우고 새로 등록 (서버가 "만료됐다"고 답했을 때)
export async function ensurePushSubscription(uid, { force = false } = {}) {
  if (!uid || !pushSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // 다른(옛) 키로 만든 등록이면 서버가 보낼 수 없으니 새로 만든다
  const keyMismatch = sub?.options?.applicationServerKey && b64url(sub.options.applicationServerKey) !== cleanKey(VAPID_PUBLIC);
  if (sub && (force || keyMismatch)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleanKey(VAPID_PUBLIC) });
  await saveSettings(uid, { pushSubscription: JSON.parse(JSON.stringify(sub)) });
  return true;
}
