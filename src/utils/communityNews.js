import { store } from "./storage.js";
import { getChatRead } from "./chatRead.js";

// 커뮤니티 "새 소식" (2026-11-03) — 이 기기에서 그 커뮤니티를 마지막으로 연 뒤 생긴 채팅·게시판 새 글·공지 수.
// 목록 카드 숫자와 아래 메뉴 "소셜" 숫자가 같이 쓴다. 예전엔 카드는 채팅만, 아래 메뉴는 마지막에 연 커뮤니티 공지만 셌고,
// 채팅방을 한 번도 안 연 기기에서는 지금까지 쌓인 메시지 전부가 숫자로 떴다.
// 처음 보는 커뮤니티는 지금부터 센다(0에서 시작). 기준 시각은 기기마다.
const seenKey = (cid) => `dm_comm_seen_${cid}`;
export function getCommunitySeen(cid) {
  let v = store.get(seenKey(cid), "");
  if (!v) { v = new Date().toISOString(); store.set(seenKey(cid), v); }
  return v;
}
export const markCommunitySeen = (cid) => { if (cid) store.set(seenKey(cid), new Date().toISOString()); };

// 채팅은 채팅방을 읽은 시각과 커뮤니티를 연 시각 중 늦은 쪽부터
export const chatSinceOf = (cid) => { const seen = getCommunitySeen(cid); const read = getChatRead(cid); return read > seen ? read : seen; };

// countSince(communityId, 'chat'|'board'|'notices', iso) → 개수 (firebase.js의 countCommunitySince)
export async function countCommunityNews(cid, countSince) {
  const seen = getCommunitySeen(cid);
  const [chat, board, notices] = await Promise.all([
    countSince(cid, "chat", chatSinceOf(cid)).catch(() => 0),
    countSince(cid, "board", seen).catch(() => 0),
    countSince(cid, "notices", seen).catch(() => 0),
  ]);
  return { chat, board, notices, total: chat + board + notices };
}
