// 📄 메모 서식 틀 (2026-11-13 사용자 승인) — 빈 메모에서 "틀로 시작". 기본 틀 + 내가 저장한 틀(계정 설정 memoTemplates, 기기끼리 동기화).
// 틀 글 속 {날짜}·{시간}은 넣는 순간 값으로 바뀌고, {커서} 자리에 커서를 둔다(없으면 끝).
// 내 틀은 이 기기 저장소(dm_memo_templates)에 두고 바뀌면 dm:templates-changed 이벤트 → App이 계정에 올린다.
const KEY = "dm_memo_templates";
export const MAX_USER_TEMPLATES = 10;
const pad = (n) => String(n).padStart(2, "0");

export const BUILTIN_TEMPLATES = [
  { id: "b_meeting", name: "회의록", text: "회의록 {날짜}\n일시: {날짜} {시간}\n참석: {커서}\n\n안건\n1. \n\n결정\n- \n\n할 일\n[ ] " },
  { id: "b_retro", name: "회고", text: "회고 {날짜}\n잘한 점\n- {커서}\n\n아쉬운 점\n- \n\n다음에 할 것\n- " },
  { id: "b_check", name: "체크리스트", text: "{커서}\n[ ] \n[ ] \n[ ] " },
  { id: "b_idea", name: "아이디어", text: "아이디어: {커서}\n- 왜: \n- 어떻게: \n- 다음 단계: " },
];

export function fillTemplate(text, d = new Date()) {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} (${"일월화수목금토"[d.getDay()]})`;
  const filled = String(text || "").replaceAll("{날짜}", date).replaceAll("{시간}", `${pad(d.getHours())}:${pad(d.getMinutes())}`);
  const at = filled.indexOf("{커서}");
  return at < 0 ? { text: filled, caret: filled.length } : { text: filled.replace("{커서}", ""), caret: at };
}

export function normalizeTemplates(list) {
  return (Array.isArray(list) ? list : [])
    .filter((t) => t && typeof t.text === "string" && t.text.trim())
    .map((t) => ({ id: String(t.id || `u${Date.now()}`), name: String(t.name || "내 틀").trim().slice(0, 12) || "내 틀", text: t.text.slice(0, 3000) }))
    .slice(0, MAX_USER_TEMPLATES);
}
export function getUserTemplates() {
  try { return normalizeTemplates(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { return []; }
}
export function setUserTemplates(list, { remote = false } = {}) {
  const v = normalizeTemplates(list);
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* 무시 */ }
  window.dispatchEvent(new CustomEvent("dm:templates-changed", { detail: { list: v, remote } }));
  return v;
}
// 지금 글을 틀로 — 이름은 첫 줄(꾸밈 기호 빼고 12자). 같은 이름이면 바꿔 쓴다. 결과 { list, name } 또는 { error }
export function templateNameOf(text) {
  const first = String(text || "").split("\n").map((l) => l.replace(/^[#\s\-*•]+|\[[ xX]\]\s*/g, "").trim()).find(Boolean) || "내 틀";
  return first.replace(/\d{4}-\d{2}-\d{2}.*$/, "").trim().slice(0, 12) || "내 틀";
}
export function addUserTemplate(list, text) {
  if (!String(text || "").trim()) return { error: "틀로 저장할 글이 없어요" };
  const name = templateNameOf(text);
  const rest = (list || []).filter((t) => t.name !== name);
  if (rest.length >= MAX_USER_TEMPLATES) return { error: `내 틀은 ${MAX_USER_TEMPLATES}개까지예요 — 안 쓰는 틀을 지워 주세요` };
  return { list: [...rest, { id: `u${Date.now().toString(36)}`, name, text: String(text).slice(0, 3000) }], name };
}
