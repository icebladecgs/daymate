import { store } from "./storage.js";

// 커뮤니티 단체 채팅을 마지막으로 읽은 시각(기기별) — 안 읽은 메시지 수를 셀 때 기준
const readKey = (cid) => `dm_chat_read_${cid}`;
export const getChatRead = (cid) => store.get(readKey(cid), "");
export const markChatRead = (cid, iso) => { if (iso && iso > getChatRead(cid)) store.set(readKey(cid), iso); };
