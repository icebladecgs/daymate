import { saveSettings } from "../firebase.js";

// 이 기기를 푸시 알림 받을 기기로 등록 (계정당 한 기기 — 마지막으로 등록한 기기로 알림이 간다)
// 알림 권한이 허용된 상태에서만 동작. App 시작 때와, 채팅 알림 설정에서 "알림 허용"을 눌렀을 때 부른다.
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export async function ensurePushSubscription(uid) {
  if (!VAPID_PUBLIC || !uid) return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC });
  await saveSettings(uid, { pushSubscription: JSON.parse(JSON.stringify(sub)) });
  return true;
}

export const pushSupported = () => !!VAPID_PUBLIC && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
