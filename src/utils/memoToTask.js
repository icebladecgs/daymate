// 메모 → 언젠가할일 보내기 (2026-10-05). 메모 원본은 그대로 두고, 할일에 출처(memoRef)를 붙인다.
// 할일이 생기는 길은 "언젠가 → 오늘"이므로 오늘 할일로 바로 보내지는 않는다.

const TAG_RE = /#[\w가-힣]{2,20}(?:\/[\w가-힣]{2,20})*/g;
const LIST_MARK = /^\s*(?:[-*•·]|\d+[.)]|\[[ xX]?\]|☐|☑|✓|✔)\s*/;
export const TASK_TITLE_MAX = 60; // 할일 상세 창 제목 칸과 같은 길이

// 고른 글자가 있으면 그 부분, 없으면 커서가 있는 줄을 할일 제목으로 — 목록 기호·#태그는 빼고 [[ ]]는 괄호만 뺀다
export function pickTaskTitle(text, start = 0, end = start) {
  const s = text || '';
  let raw;
  if (end > start) raw = s.slice(start, end);
  else {
    const from = s.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const to = s.indexOf('\n', start);
    raw = s.slice(from, to < 0 ? s.length : to);
  }
  return raw.split('\n').map(l => l.replace(LIST_MARK, '')).join(' ')
    .replace(TAG_RE, ' ').replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\s+/g, ' ').trim().slice(0, TASK_TITLE_MAX);
}

// 실제 추가는 App.jsx가 받아서 한다(언젠가 목록·계정 동기화가 App에 있음). memoId로 메모 날짜를 찾아 출처를 붙인다
export function sendMemoToSomeday(title, memoId) {
  if (!title) return false;
  window.dispatchEvent(new CustomEvent('dm:add-someday', { detail: { title, memoId: memoId || null } }));
  return true;
}
