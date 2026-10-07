// 메모 편집 도우미 (메모잇 참고) — 긴 메모·간편 메모·메모 관리자 입력칸에서 함께 쓴다.
//  · F12 / Ctrl+/ : 현재 줄 수식 계산 ("1500000*12" → "1500000*12 = 18,000,000 (1,800만)")
//                   빈 줄에서 누르면 바로 위에 이어진 숫자 줄들을 합산
//  · Ctrl+;       : 오늘 날짜 넣기 (엑셀과 같은 키)   Ctrl+Shift+; : 지금 시각 넣기
//  · Ctrl+D       : 현재 줄 복제
//  · Enter        : "- ", "• ", "1. ", "[ ] " 로 시작하는 줄이면 다음 줄에도 이어 붙임
//                   (체크박스는 빈 칸 "[ ]"으로, 빈 항목에서 Enter면 한 단계 위로 · 맨 위 단계면 목록 끝)
//  · Tab / Shift+Tab : 한 단계 들여쓰기 / 내어쓰기 (여러 줄을 고르면 한꺼번에). 목록 아닌 줄의 Tab은 공백 4칸
//  · Backspace    : 목록 기호 바로 뒤에서 누르면 한 단계 위로 (맨 위면 기호만 지움)
//  (Enter·Tab·Backspace 자동 처리는 설정 → 앱 관리 → 메모 입력에서 끌 수 있음)

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
  if ((e.key === "Tab" || e.key === "Enter" || e.key === "Backspace") && !memoAutoListOn()) return false;
  // Tab은 메모장·워드처럼 입력칸 안에서 처리 (다음 칸으로 넘어가지 않음)
  if (e.key === "Tab" && !ctrl && !e.altKey) {
    if (e.shiftKey) { indentLines(ta, -1); return done(); }
    const multi = ta.value.slice(ta.selectionStart, ta.selectionEnd).includes("\n");
    if (!indentLines(ta, 1, multi)) replaceRange(ta, ta.selectionStart, ta.selectionEnd, INDENT); // 목록 아닌 줄 → 공백 4칸
    return done();
  }
  // 목록 기호 바로 뒤에서 Backspace → 들여쓴 항목이면 한 단계 위로, 맨 위면 기호만 지우기 (노션·구글 문서와 같게)
  if (e.key === "Backspace" && !ctrl && !e.shiftKey && !e.altKey && ta.selectionStart === ta.selectionEnd) {
    const cl = currentLine(ta);
    const before = ta.value.slice(cl.start, ta.selectionStart);
    const m = LIST_RE.exec(before);
    if (!m || m[0] !== before) return false;
    if (m[1]) indentLines(ta, -1);
    else replaceRange(ta, cl.start, cl.start + m[0].length, "", cl.start);
    return done();
  }
  if (e.key === "Enter" && !ctrl && !e.shiftKey && !e.altKey && ta.selectionStart === ta.selectionEnd) {
    const cl = currentLine(ta);
    const before = ta.value.slice(cl.start, ta.selectionStart);
    const m = LIST_RE.exec(before);
    if (!m || !m[0].trim()) return false;
    if (!cl.text.slice(m[0].length).trim()) { // 빈 항목에서 Enter → 들여쓴 항목이면 한 단계 위로, 아니면 기호 지우고 목록 끝
      if (m[1]) indentLines(ta, -1);
      else replaceRange(ta, cl.start, cl.end, "");
      return done();
    }
    const marker = m[2] && /^\d+/.test(m[2]) ? `${parseInt(m[2], 10) + 1}${m[2].slice(-1)}` : m[2];
    const box = m[3] || m[4] ? "[ ] " : "";
    replaceRange(ta, ta.selectionStart, ta.selectionStart, `\n${m[1]}${marker ? `${marker} ` : ""}${box}`);
    return done();
  }
  return false;
}

// 목록 자동완성(Enter 이어쓰기·Tab 들여쓰기) 켜기/끄기 — 기기마다(설정 → 앱 관리). 계산·날짜 키는 직접 누르는 것이라 항상 켬
const AUTO_LIST_KEY = "dm_memo_autolist";
export function memoAutoListOn() {
  try { return localStorage.getItem(AUTO_LIST_KEY) !== "false"; } catch { return true; }
}
export function setMemoAutoList(on) {
  try { localStorage.setItem(AUTO_LIST_KEY, on ? "true" : "false"); } catch { /* 저장 못 하면 이번만 */ }
}

// 목록 줄: 들여쓰기 + 기호(- • * 1. 1)) + 선택 체크박스 [ ] [x]  /  체크박스만 있는 줄 "[ ] 할일"
const LIST_RE = /^([ \t]*)(?:([-•*]|\d+[.)])[ \t]+(\[[ xX]\][ \t]+)?|(\[[ xX]\])[ \t]+)/;
const LIST_LINE_RE = /^[ \t]*(?:[-•*]|\d+[.)]|\[[ xX]\])(?:[ \t]|$)/;
const INDENT = "    "; // 한 단계 = 공백 4칸 (메모 글꼴에서 2칸은 거의 안 보임)

// 고른 줄(커서가 있는 줄)을 한 단계 들여쓰기(dir 1) / 내어쓰기(dir -1). 처리했으면 true
// 들여쓰기는 목록 줄이 있거나 여러 줄을 골랐을 때(any)만, 내어쓰기는 앞 공백이 있으면 언제나
function indentLines(ta, dir, any = false) {
  const v = ta.value;
  const selS = ta.selectionStart, selE = ta.selectionEnd;
  const start = v.lastIndexOf("\n", selS - 1) + 1;
  // 여러 줄을 골랐는데 끝이 다음 줄 맨 앞이면 그 줄은 빼기
  const endPos = selE > selS && v[selE - 1] === "\n" ? selE - 1 : selE;
  let end = v.indexOf("\n", endPos);
  if (end < 0) end = v.length;
  const lines = v.slice(start, end).split("\n");
  if (dir > 0 && !any && !lines.some(l => LIST_LINE_RE.test(l))) return false;
  let firstDelta = 0, total = 0;
  const out = lines.map((l, i) => {
    let next = l;
    if (dir > 0) {
      if (!l.trim()) return l;
      next = INDENT + l;
      // 번호 목록을 한 단계 내리면 1부터 다시
      if (LIST_LINE_RE.test(l)) next = next.replace(/^([ \t]*)\d+([.)])/, "$11$2");
    } else {
      const lead = /^( {1,4}|\t)/.exec(l);
      if (lead) next = l.slice(lead[0].length);
    }
    if (i === 0) firstDelta = next.length - l.length;
    total += next.length - l.length;
    return next;
  });
  if (!total) return false;
  replaceRange(ta, start, end, out.join("\n"));
  if (selS === selE) {
    const pos = Math.max(start, selS + firstDelta);
    ta.setSelectionRange(pos, pos);
  } else {
    ta.setSelectionRange(Math.max(start, selS + firstDelta), selE + total);
  }
  return true;
}
