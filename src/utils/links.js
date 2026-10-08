// 메모 글 속 링크 — 글자 위치(커서)에 있는 주소를 찾아 기본 브라우저로 연다 (메모잇 "인터넷주소 자동인식" 참고, 2026-10-08)
const URL_RE = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+\.[^\s<>"'`]+)/gi;

// pos 위치를 덮는 주소 (없으면 null). 끝에 붙은 문장부호 ). , ] 등은 뺀다
export function urlAt(text, pos) {
  if (typeof text !== "string" || pos == null) return null;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[).,\]}>;:!?'"]+$/, "");
    const start = m.index, end = m.index + url.length;
    if (pos >= start && pos <= end) return /^www\./i.test(url) ? `https://${url}` : url;
    if (start > pos) break;
  }
  return null;
}

// 데스크탑 앱(1.3.1~)은 기본 브라우저로, 그 밖에는 새 탭으로
export function openLink(url) {
  const d = window.daymateDesktop;
  if (d?.openExternal) d.openExternal(url);
  else window.open(url, "_blank", "noopener");
}

// 찾기 — 대소문자를 무시하고 찾은 시작 위치 목록. 위치가 본문과 어긋나지 않게 본문은 정규화하지 않는다
export function findAll(text, query) {
  const q = (query || "").normalize("NFC").toLowerCase();
  if (!q) return [];
  const t = (text || "").toLowerCase();
  const out = [];
  for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + q.length)) out.push(i);
  return out;
}
