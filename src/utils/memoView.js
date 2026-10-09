import { trimUrl } from "./links.js";

// 메모 "👁 보기" — 저장된 글은 그대로 두고 읽을 때만 마크다운처럼 보여 준다 (노션·옵시디언 참고, 2026-10-08).
// 목록·체크박스 규칙은 편집 도우미(editorAssist.js)와 같다: 들여쓰기 한 단계 = 공백 4칸(탭 1개), "- [ ] "·"[ ] " 체크박스.

const LINE_RE = /^([ \t]*)(?:([-•*]|\d+[.)]|(?:하\d{1,2}|[가나다라마바사아자차카타파하])[.)])[ \t]+)?(?:\[([ xX])\][ \t]+)?(.*)$/;

const levelOf = (indent) => {
  let n = 0;
  for (const ch of indent) n += ch === "\t" ? 4 : 1;
  return Math.floor(n / 4);
};

// 줄마다 { line, type: heading|item|check|quote|hr|blank|text, level, depth(제목 1~3), marker, checked, content }
export function parseMemoLines(text) {
  return String(text || "").split("\n").map((raw, line) => {
    if (!raw.trim()) return { line, type: "blank" };
    const h = /^(#{1,3})[ \t]+(.+)$/.exec(raw);
    if (h) return { line, type: "heading", depth: h[1].length, content: h[2] };
    if (/^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/.test(raw)) return { line, type: "hr" };
    const q = /^>[ \t]?(.*)$/.exec(raw);
    if (q) return { line, type: "quote", content: q[1] };
    const m = LINE_RE.exec(raw);
    const [, indent, marker, check, content] = m;
    // 한글 번호(가. 가))는 들여 쓴 줄에서만 번호 — 맨 앞의 "가. 나는…"은 일반 글
    if (marker && /^[가-힣]/.test(marker) && !indent) return { line, type: "text", level: 0, content: raw.trim() };
    const level = levelOf(indent);
    if (check !== undefined) return { line, type: "check", level, marker: marker || "", checked: check !== " ", content };
    if (marker) return { line, type: "item", level, marker, content };
    return { line, type: "text", level, content: raw.trim() };
  });
}

// 보기에서 체크박스를 누르면 그 줄의 [ ] ↔ [x]만 바꾼다
export function toggleCheckAt(text, lineIndex) {
  const lines = String(text || "").split("\n");
  const cur = lines[lineIndex];
  if (cur === undefined) return text;
  lines[lineIndex] = cur.replace(/^([ \t]*(?:(?:[-•*]|\d+[.)]|(?:하\d{1,2}|[가나다라마바사아자차카타파하])[.)])[ \t]+)?)\[([ xX])\]/, (_, pre, c) => `${pre}[${c === " " ? "x" : " "}]`);
  return lines.join("\n");
}

// 한 줄 안의 꾸밈 — **굵게**, `코드`, [[키워드]], 링크, #태그 (나머지는 글자 그대로)
const INLINE_RE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[\[[^\]\n]+\]\]|https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+\.[^\s<>"'`]+|(?<![\w가-힣/&])#[\w가-힣]{2,20}(?:\/[\w가-힣]{2,20})*)/g;

export function parseInline(s) {
  const out = [];
  let at = 0;
  for (const m of String(s || "").matchAll(INLINE_RE)) {
    let tok = m[0];
    if (m.index > at) out.push({ type: "text", value: s.slice(at, m.index) });
    let tail = "";
    if (/^(https?:|www\.)/i.test(tok)) {
      const t = trimUrl(tok);
      tail = tok.slice(t.length);
      tok = t;
      out.push({ type: "link", value: tok, href: /^www\./i.test(tok) ? `https://${tok}` : tok });
    } else if (tok.startsWith("**")) out.push({ type: "bold", value: tok.slice(2, -2) });
    else if (tok.startsWith("`")) out.push({ type: "code", value: tok.slice(1, -1) });
    else if (tok.startsWith("[[")) {
      const kw = tok.slice(2, -2).trim();
      out.push(kw.length >= 2 ? { type: "wiki", value: kw } : { type: "text", value: tok });
    } else out.push({ type: "tag", value: tok.slice(1) });
    if (tail) out.push({ type: "text", value: tail });
    at = m.index + m[0].length;
  }
  if (at < String(s || "").length) out.push({ type: "text", value: s.slice(at) });
  return out;
}
