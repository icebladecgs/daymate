// 📝 사진 속 글자 읽기 (2026-11-13 사용자 승인) — 메모에 붙인 사진의 글자를 메모 글로 옮긴다. 서버 api/chat.js?action=photo-text
// 원칙(메모 AI 정리와 같음): 누를 때만 보낸다 · 처음 한 번 "사진이 AI(Anthropic) 서버로 전송" 안내(기기마다) · 서버는 저장·기록 안 함 · 로그인 필요.
// 사진 원본은 그대로 두고 글자만 메모 끝에 덧붙인다(CLAUDE.md 6장 — 사진을 바꾸거나 지우지 않는다).
const OK_KEY = "dm_ai_photo_ok";
export function photoTextConsent() {
  try { if (localStorage.getItem(OK_KEY) === "true") return true; } catch { /* 무시 */ }
  const ok = window.confirm("사진 속 글자를 읽으려면 이 사진이 AI(Anthropic) 서버로 전송돼요.\n\n· 누를 때만 보내고, 서버는 사진과 글자를 저장하지 않아요\n· 주민번호·카드번호처럼 민감한 정보가 있는 사진은 보내지 마세요\n\n계속할까요?");
  if (ok) { try { localStorage.setItem(OK_KEY, "true"); } catch { /* 무시 */ } }
  return ok;
}
export async function readPhotoText(url) {
  const { auth } = await import("../firebase.js");
  await auth.authStateReady?.();
  if (!auth.currentUser) throw new Error("사진 글자 읽기는 로그인한 뒤 쓸 수 있어요");
  const { chatFetch } = await import("../api/chatFetch.js");
  const res = await chatFetch("/api/chat?action=photo-text", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "사진 글자를 읽지 못했어요");
  return String(j.text || "");
}
// 메모 끝에 덧붙이는 모양 — 빈 메모(사진만 있는 메모의 자동 글자 포함)면 글자만
export function appendPhotoText(text, read, autoLabel = "") {
  const base = String(text || "").trim();
  if (!base || base === autoLabel) return read;
  return `${base}\n\n📷 사진 글자\n${read}`;
}
