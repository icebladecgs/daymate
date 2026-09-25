import { auth } from "../firebase.js";

// AI 서버(/api/chat)는 로그인한 사용자만 쓸 수 있다 — Firebase ID 토큰을 붙여 보낸다.
// (예전엔 누구나 호출할 수 있어서 주소만 알면 AI 비용을 대신 쓰게 할 수 있었다, 2026-09-25)
export async function chatFetch(url, options = {}) {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  return fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}
