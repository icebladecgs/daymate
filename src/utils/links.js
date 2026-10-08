// 메모 글 속 링크 — 글자 위치(커서)에 있는 주소를 찾아 기본 브라우저로 연다 (메모잇 "인터넷주소 자동인식" 참고, 2026-10-08)
const URL_RE = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+\.[^\s<>"'`]+)/gi;

// 주소 끝에 붙은 문장부호(. , ! ? 등)를 뗀다. ")"는 주소 안에 "("가 없어 짝이 안 맞을 때만 뗀다
// — "(https://a.com)"은 a.com, 위키백과 ".../Foo_(bar)"는 그대로.
export function trimUrl(url) {
  let u = url;
  for (;;) {
    const last = u.slice(-1);
    if (/[.,;:!?'"\]}>]/.test(last)) { u = u.slice(0, -1); continue; }
    if (last === ")" && (u.match(/\)/g) || []).length > (u.match(/\(/g) || []).length) { u = u.slice(0, -1); continue; }
    return u;
  }
}

// 글 속 모든 주소의 위치 [{ start, end, url }] — 입력칸 위 링크 표시(LinkOverlay)용
export function linkRanges(text) {
  const out = [];
  if (typeof text !== "string") return out;
  for (const m of text.matchAll(URL_RE)) {
    const t = trimUrl(m[0]);
    out.push({ start: m.index, end: m.index + t.length, url: /^www\./i.test(t) ? `https://${t}` : t });
  }
  return out;
}

// 🔗 링크 버튼 이름 — 보통은 사이트 이름. 같은 사이트 링크가 여럿이면 구분이 안 되므로
// 그 링크가 있는 줄의 글(앞쪽, 없으면 뒤쪽)을 이름으로 쓰고, 그래도 없거나 겹치면 ①② 번호를 붙인다.
const siteName = (u) => {
  try {
    const { hostname } = new URL(u);
    if (/drive\.google|docs\.google/.test(hostname)) return "구글 드라이브";
    return hostname.replace(/^www\./, "");
  } catch { return u; }
};
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";
const shorten = (s, n = 14) => (s.length > n ? `${s.slice(0, n)}…` : s);
export function linkLabels(text, urls) {
  const sites = urls.map(siteName);
  const lines = String(text || "").split("\n");
  const lineWords = (u) => {
    const line = lines.find(l => l.includes(u)) || "";
    const i = line.indexOf(u);
    const clean = (s) => s.replace(/https?:\/\/\S+/g, "").replace(/^[\s\-•*]*(\d+[.)]\s*)?(\[[ xX]\]\s*)?/, "").replace(/[\s:：\-–—(（[]+$/, "").replace(/^[\s:：\-–—)）\]]+/, "").trim();
    return clean(line.slice(0, i)) || clean(line.slice(i + u.length));
  };
  const labels = urls.map((u, k) => (sites.filter(s => s === sites[k]).length > 1 ? (shorten(lineWords(u)) || sites[k]) : sites[k]));
  // 이름이 겹치면 순서대로 번호
  return labels.map((l, k) => {
    const same = labels.map((x, j) => (x === l ? j : -1)).filter(j => j >= 0);
    return same.length > 1 ? `${l} ${CIRCLED[same.indexOf(k)] || same.indexOf(k) + 1}` : l;
  });
}

// pos 위치를 덮는 주소 (없으면 null)
export function urlAt(text, pos) {
  if (typeof text !== "string" || pos == null) return null;
  for (const m of text.matchAll(URL_RE)) {
    const url = trimUrl(m[0]);
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

// <a target="_blank">의 onClick — 데스크탑 앱이면 앱 안의 작은 창 대신 기본 브라우저로. 웹은 그대로 새 탭.
// 부모의 클릭(펼치기 등)으로 번지지 않게 막는다.
export const externalLinkClick = (url) => (e) => {
  e.stopPropagation();
  if (window.daymateDesktop?.openExternal) { e.preventDefault(); window.daymateDesktop.openExternal(url); }
};

// 입력칸(textarea)에서 Ctrl+클릭한 곳이 링크면 연다 — 열었으면 true
export function openLinkOnCtrlClick(e) {
  const ta = e.currentTarget;
  if (!(e.ctrlKey || e.metaKey)) return false;
  const url = urlAt(ta.value, ta.selectionStart);
  if (!url) return false;
  e.preventDefault();
  openLink(url);
  return true;
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
