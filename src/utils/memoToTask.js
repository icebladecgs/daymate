// 메모 → 언젠가할일 보내기 (2026-10-05). 메모 원본은 그대로 두고, 할일에 출처(memoRef)를 붙인다.
// 2026-11-10부터 "오늘로"도 있다(사용자 요청) — 아래 sendMemoToToday.
import { parseSchedule } from "./nlSchedule.js";

const TAG_RE = /#[\w가-힣]{2,20}(?:\/[\w가-힣]{2,20})*/g;
const LIST_MARK = /^\s*(?:[-*•·]|\d+[.)]|\[[ xX]?\]|☐|☑|✓|✔)\s*/;
const HANGUL_MARK = /^\s+(?:하\d{1,2}|[가나다라마바사아자차카타파하])[.)]\s+/; // 들여 쓴 공문서 번호(가. 가)) — 편집 도우미와 같은 규칙
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
  return raw.split('\n').map(l => l.replace(HANGUL_MARK, '').replace(LIST_MARK, '')).join(' ')
    .replace(TAG_RE, ' ').replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\s+/g, ' ').trim().slice(0, TASK_TITLE_MAX);
}

// 실제 추가는 App.jsx가 받아서 한다(언젠가 목록·계정 동기화가 App에 있음). memoId로 메모 날짜를 찾아 출처를 붙인다
export function sendMemoToSomeday(title, memoId) {
  if (!title) return false;
  window.dispatchEvent(new CustomEvent('dm:add-someday', { detail: { title, memoId: memoId || null } }));
  return true;
}
// 📌 오늘로 (2026-11-10 사용자 요청) — 같은 줄을 오늘 할일로 바로. 받는 쪽은 App.jsx (dm:add-today)
// 줄에 "3시"·"내일 오후 2시" 같은 말이 있으면 오늘 탭 입력칸과 같은 규칙(utils/nlSchedule.js)으로 시간·날짜를 넣는다.
// "매주 ○요일" 같은 반복 표현은 반복 할일로 만들지 않고 글 그대로 오늘 할일로 (반복 등록은 오늘 탭에서)
export function memoLineToTask(title, now = new Date()) {
  const p = parseSchedule(title, now);
  if (!p || p.recurring) return { title, date: null, time: null };
  return { title: p.title || title, date: p.date || null, time: p.time || null };
}
export function sendMemoToToday(title, memoId, now = new Date()) {
  if (!title) return null;
  const t = memoLineToTask(title, now);
  window.dispatchEvent(new CustomEvent('dm:add-today', { detail: { ...t, memoId: memoId || null } }));
  return t;
}
// 버튼에 잠깐 보일 글 — 오늘이면 "보냄 ✓", 시간 있으면 "15:00 ✓", 다른 날이면 "11/12 ✓"
export function sentLabel(t, todayStr) {
  if (!t) return '';
  const day = t.date && t.date !== todayStr ? `${Number(t.date.slice(5, 7))}/${Number(t.date.slice(8, 10))}` : '';
  return `${[day, t.time].filter(Boolean).join(' ') || '보냄'} ✓`;
}
