// 메모 편집 도우미 (메모잇 참고) — 긴 메모·간편 메모·메모 관리자 입력칸에서 함께 쓴다.
//  · F12 / Ctrl+/ : 현재 줄 수식 계산 ("1500000*12" → "1500000*12 = 18,000,000 (1,800만)")
//                   빈 줄에서 누르면 바로 위에 이어진 숫자 줄들을 합산
//  · Ctrl+;       : 오늘 날짜 넣기 (엑셀과 같은 키)   Ctrl+Shift+; : 지금 시각 넣기
//  · Ctrl+D       : 현재 줄 복제
//  · Enter        : "- ", "• ", "1. " 로 시작하는 줄이면 다음 줄에도 이어 붙임 (빈 항목에서 Enter면 목록 끝)

const UNIT = { 천: 1e3, 만: 1e4, 억: 1e8, 조: 1e12, k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9 };

// 안전한 수식 계산기 (eval 사용 안 함). 숫자(쉼표·소수), 단위(천·만·억·조·k·m·b), + - * / × ÷ x, 괄호, %.
// "1억 2천만"처럼 단위가 붙은 수가 연달아 오면 더한다. 계산할 수 없으면 null.
export function evaluate(expr) {
  const src = String(expr || "").replace(/[×xX]/g, "*").replace(/÷/g, "/").replace(/\s+/g, " ").trim();
  if (!src || !/\d/.test(src)) return null;
  let i = 0;
  const peek = () => { while (src[i] === " ") i++; return src[i]; };
  const amount = () => {
    // 단위 붙은 수의 연속: 1억 2천만 3천 → 합산
    let total = null;
    for (;;) {
      const save = i;
      peek();
      const m = /^(\d[\d,]*(?:\.\d+)?|\.\d+)/.exec(src.slice(i));
      if (!m) { i = save; break; }
      i += m[0].length;
      let v = parseFloat(m[0].replace(/,/g, ""));
      let hadUnit = false;
      while (UNIT[src[i]]) { v *= UNIT[src[i]]; i++; hadUnit = true; }
      if (src[i] === "%") { v /= 100; i++; }
      total = (total ?? 0) + v;
      if (!hadUnit) break; // 단위 없는 수 뒤에는 연산자가 와야 함
      const rest = src.slice(i).trimStart();
      if (!/^(\d|\.\d)/.test(rest)) break;
    }
    return total;
  };
  const factor = () => {
    const c = peek();
    if (c === "(") { i++; const v = expr_(); if (peek() !== ")") throw new Error("paren"); i++; return v; }
    if (c === "-") { i++; return -factor(); }
    if (c === "+") { i++; return factor(); }
    const v = amount();
    if (v === null) throw new Error("num");
    return v;
  };
  const term = () => {
    let v = factor();
    for (;;) {
      const c = peek();
      if (c === "*") { i++; v *= factor(); }
      else if (c === "/") { i++; const d = factor(); if (d === 0) throw new Error("div0"); v /= d; }
      else return v;
    }
  };
  function expr_() {
    let v = term();
    for (;;) {
      const c = peek();
      if (c === "+") { i++; v += term(); }
      else if (c === "-") { i++; v -= term(); }
      else return v;
    }
  }
  try {
    const v = expr_();
    if (peek() !== undefined) return null; // 남은 글자가 있으면 수식 아님
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function formatNumber(v) {
  const r = Math.round(v * 1e6) / 1e6;
  return r.toLocaleString("ko-KR", { maximumFractionDigits: 6 });
}

// 123456789 → "1억 2,345만 6,789" (정수 부분만, 1만 미만이면 빈 문자열)
export function toKoreanUnits(v) {
  const neg = v < 0;
  let n = Math.floor(Math.abs(Math.round(v)));
  if (n < 10000) return "";
  const parts = [];
  for (const [u, size] of [["조", 1e12], ["억", 1e8], ["만", 1e4]]) {
    const q = Math.floor(n / size);
    if (q > 0) { parts.push(`${q.toLocaleString("ko-KR")}${u}`); n -= q * size; }
  }
  if (n > 0) parts.push(n.toLocaleString("ko-KR"));
  return (neg ? "-" : "") + parts.join(" ");
}

const withKorean = (v) => {
  const ko = toKoreanUnits(v);
  return ko ? `${formatNumber(v)} (${ko})` : formatNumber(v);
};

// 한 줄에서 계산할 부분: 이미 붙은 "= 결과"는 떼고, 앞의 설명 글("월급 ")은 건너뛴다
function lineExpression(line) {
  const base = line.replace(/\s*=\s*[^=]*$/, "").replace(/=\s*$/, "");
  const start = base.search(/[\d(.+-]/);
  if (start < 0) return null;
  return { base, expr: base.slice(start) };
}

// 한 줄의 값 (합산용): "= 결과"가 있으면 그 결과, 없으면 줄 수식을 계산
function lineValue(line) {
  const eq = /=\s*([-\d,.]+)/.exec(line);
  if (eq) { const v = parseFloat(eq[1].replace(/,/g, "")); if (Number.isFinite(v)) return v; }
  const le = lineExpression(line);
  return le ? evaluate(le.expr) : null;
}

// 계산 결과를 붙인 새 줄 (못하면 null). 빈 줄이면 위쪽 숫자 줄 합계
export function calcLine(lines, index) {
  const line = lines[index];
  if (!line.trim()) {
    const vals = [];
    for (let k = index - 1; k >= 0 && lines[k].trim(); k--) {
      const v = lineValue(lines[k]);
      if (v === null) break;
      vals.push(v);
    }
    if (!vals.length) return null;
    return `합계 = ${withKorean(vals.reduce((a, b) => a + b, 0))}`;
  }
  const le = lineExpression(line);
  if (!le) return null;
  const v = evaluate(le.expr);
  if (v === null) return null;
  return `${le.base.replace(/\s+$/, "")} = ${withKorean(v)}`;
}

const pad = (n) => String(n).padStart(2, "0");
export const todayText = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} (${"일월화수목금토"[d.getDay()]})`;
export const nowTimeText = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// textarea 일부를 바꿔 넣기 — execCommand로 넣어 Ctrl+Z(되돌리기)가 되게 하고, 안 되면 직접 넣고 input 이벤트로 알린다
function replaceRange(ta, start, end, text, caret) {
  ta.focus();
  ta.setSelectionRange(start, end);
  let ok = false;
  try { ok = document.execCommand("insertText", false, text); } catch { ok = false; }
  if (!ok) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, ta.value.slice(0, start) + text + ta.value.slice(end));
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const pos = caret ?? start + text.length;
  ta.setSelectionRange(pos, pos);
}

function currentLine(ta) {
  const v = ta.value;
  const pos = ta.selectionStart;
  const start = v.lastIndexOf("\n", pos - 1) + 1;
  let end = v.indexOf("\n", pos);
  if (end < 0) end = v.length;
  const lines = v.slice(0, end).split("\n");
  return { start, end, text: v.slice(start, end), lines: v.split("\n"), index: lines.length - 1 };
}

// 현재 줄 계산 (휴대폰의 🧮 버튼용). 성공하면 true
export function calcAtCursor(ta) {
  if (!ta) return false;
  const cl = currentLine(ta);
  const next = calcLine(cl.lines, cl.index);
  if (next === null) return false;
  replaceRange(ta, cl.start, cl.end, next);
  return true;
}

// textarea onKeyDown에 연결 — 처리했으면 true (이벤트 기본 동작도 막음)
export function handleEditorKey(e, onCalcFail) {
  const ta = e.currentTarget;
  if (!ta || e.nativeEvent?.isComposing) return false; // 한글 조합 중에는 건드리지 않음
  const ctrl = e.ctrlKey || e.metaKey;
  const done = () => { e.preventDefault(); return true; };

  if (e.key === "F12" || (ctrl && (e.key === "/" || e.code === "Slash"))) {
    if (!calcAtCursor(ta)) onCalcFail?.();
    return done();
  }
  if (ctrl && (e.code === "Semicolon" || e.key === ";" || e.key === ":")) {
    replaceRange(ta, ta.selectionStart, ta.selectionEnd, e.shiftKey ? nowTimeText() : todayText());
    return done();
  }
  if (ctrl && !e.shiftKey && (e.key === "d" || e.key === "D")) {
    const cl = currentLine(ta);
    const col = ta.selectionStart - cl.start;
    replaceRange(ta, cl.end, cl.end, `\n${cl.text}`, cl.end + 1 + col);
    return done();
  }
  if (e.key === "Enter" && !ctrl && !e.shiftKey && !e.altKey && ta.selectionStart === ta.selectionEnd) {
    const cl = currentLine(ta);
    const before = ta.value.slice(cl.start, ta.selectionStart);
    const m = /^(\s*)([-•*]|\d+[.)])\s+/.exec(before);
    if (!m) return false;
    if (!cl.text.slice(m[0].length).trim()) { // 빈 항목에서 Enter → 기호 지우고 목록 끝
      replaceRange(ta, cl.start, cl.end, "");
      return done();
    }
    const marker = /^\d+/.test(m[2]) ? `${parseInt(m[2], 10) + 1}${m[2].slice(-1)}` : m[2];
    replaceRange(ta, ta.selectionStart, ta.selectionStart, `\n${m[1]}${marker} `);
    return done();
  }
  return false;
}
