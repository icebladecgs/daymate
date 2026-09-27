import { doc, getDoc } from "firebase/firestore";
import { db, saveSettings } from "../firebase.js";
import { store } from "./storage.js";
import { playNotifSound } from "./notification.js";

// 커뮤니티 채팅 알림 설정
// - 서버가 읽는 것(계정 설정 settings.chatPush): enabled(채팅 알림 받기), muted{커뮤니티id: true}, preview(잠금 화면에 내용 보이기)
// - 이 기기만(localStorage dm_chat_sound): 앱을 켜 둔 동안 들리는 소리 — 휴대폰 푸시 알림 소리는 웹앱이 바꿀 수 없어 휴대폰 설정을 따른다
export const CHAT_PUSH_DEFAULTS = { enabled: true, preview: true, muted: {} };

export async function loadChatPush(uid) {
  const snap = await getDoc(doc(db, "users", uid, "data", "settings"));
  return { ...CHAT_PUSH_DEFAULTS, ...(snap.data()?.chatPush || {}) };
}

// patch 예: { enabled: false } / { muted: { [cid]: true } } — 계정 설정에 합쳐서 저장(merge)
export const saveChatPush = (uid, patch) => saveSettings(uid, { chatPush: patch });

export const getChatSound = () => store.get("dm_chat_sound", "dingdong"); // 'none' = 무음
export const setChatSound = (v) => store.set("dm_chat_sound", v);

export function playChatSound(style = getChatSound()) {
  if (style === "none") return;
  try { playNotifSound(style); } catch { /* 소리 재생 실패는 무시 */ }
}

// 메시지를 보낸 뒤 다른 멤버들에게 알림 요청 (실패해도 채팅에는 영향 없음)
export async function requestChatPush(communityId, messageId) {
  try {
    const { chatFetch } = await import("../api/chatFetch.js");
    await chatFetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "chat", communityId, messageId }),
    });
  } catch { /* 알림 실패는 조용히 */ }
}
