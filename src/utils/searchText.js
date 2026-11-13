// 글 검색 도우미 (2026-11-13, 메모 관리자) — 화면 부품(LinkOverlay)도 쓰므로 다른 파일을 불러오지 않는 작은 파일로 둔다.
// 띄어쓰기 = "그리고": "회의 예산" → 두 단어가 다 들어간 글(순서·붙임 상관없음).
// 초성만 쓴 단어(ㅎㅇ)는 초성으로 찾는다 — "ㅎㅇ" → 회의. 대소문자·한글 자모 분리(NFD) 무시
export const normText = (s) => (s || "").normalize("NFC").toLowerCase();
const CHOSEONG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
export const choseongOf = (s) => Array.from(normText(s)).map((ch) => {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 ? CHOSEONG[Math.floor(code / 588)] : ch;
}).join("");
const isChoToken = (t) => /^[ㄱ-ㅎ]+$/.test(t);
export const searchTokens = (query) => normText(query).trim().split(/\s+/).filter(Boolean);
// 노랗게 표시할 단어 — 초성 단어는 원문에서 자리를 바로 못 찾아 뺀다
export const highlightTerms = (query) => searchTokens(query).filter((t) => !isChoToken(t));
export function matchesQuery(text, tokens) {
  if (!tokens.length) return true;
  const hay = normText(text);
  let cho = null;
  return tokens.every((t) => {
    if (!isChoToken(t)) return hay.includes(t);
    if (cho === null) cho = choseongOf(text).replace(/\s+/g, "");
    return cho.includes(t);
  });
}
// 글 속에서 찾은 단어 자리 [{start, end}] — 겹치면 앞의 것만 (목록 제목·편집 칸 노란 표시)
export function termRanges(text, terms) {
  const out = [];
  if (!text || !terms?.length) return out;
  const hay = normText(text);
  if (hay.length !== text.length) return out; // 정규화로 길이가 바뀐 글(자모 분리)은 자리가 어긋나 표시하지 않음
  terms.forEach((t) => {
    for (let i = hay.indexOf(t); i >= 0 && t; i = hay.indexOf(t, i + t.length)) out.push({ start: i, end: i + t.length });
  });
  out.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  out.forEach((r) => { if (!kept.length || r.start >= kept[kept.length - 1].end) kept.push(r); });
  return kept;
}
