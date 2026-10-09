// 메모 편집 도우미 (메모잇 참고) — 긴 메모·간편 메모·메모 관리자 입력칸에서 함께 쓴다.
//  · F12 / Ctrl+/ : 현재 줄 수식 계산 ("1500000*12" → "1500000*12 = 18,000,000 (1,800만)")
//                   빈 줄에서 누르면 바로 위에 이어진 숫자 줄들을 합산
//  · Ctrl+;       : 오늘 날짜 넣기 (엑셀과 같은 키)   Ctrl+Shift+; : 지금 시각 넣기
//  · Ctrl+D       : 현재 줄 복제
//  · Enter        : "- ", "• ", "1. ", "[ ] " 로 시작하는 줄이면 다음 줄에도 이어 붙임
//                   (체크박스는 빈 칸 "[ ]"으로, 빈 항목에서 Enter면 한 단계 위로 · 맨 위 단계면 목록 끝)
//  · Tab / Shift+Tab : 한 단계 들여쓰기 / 내어쓰기 (여러 줄을 고르면 한꺼번에). 목록 아닌 줄의 Tab은 공백 4칸
//  · Backspace    : 목록 기호 바로 뒤에서 누르면 한 단계 위로 (맨 위면 기호만 지움)
//  · Ctrl+Shift+X : 체크박스 [ ] ↔ [x] (없으면 [ ] 붙이기)
//  · Alt+↑ / Alt+↓ : 줄(고른 여러 줄) 위아래로 옮기기
//  · 번호 목록은 항목을 넣고·지우고·옮기면 1부터 다시 매김 (커서가 있는 목록만)
//  (Enter·Tab·Backspace 자동 처리와 번호 다시 매기기는 설정 → 앱 관리 → 메모 입력, 또는 메모 창의 ⚙️에서 끌 수 있음)

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
// 결과가 예상과 다르면(한글 입력기가 켜진 데스크탑 앱에서 전체가 지워진 적 있음, 2026-10-07) 예상한 내용으로 바로잡는다
function replaceRange(ta, start, end, text, caret) {
  const expected = ta.value.slice(0, start) + text + ta.value.slice(end);
  ta.focus();
  ta.setSelectionRange(start, end);
  let ok = false;
  try {
    // 지우기만 할 때는 빈 글자 넣기 대신 delete 명령 (둘 다 Ctrl+Z 가능)
    ok = text ? document.execCommand("insertText", false, text) : (start === end || document.execCommand("delete"));
  } catch { ok = false; }
  if (!ok || ta.value !== expected) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, expected);
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
  if (!ta || e.nativeEvent?.isComposing || e.keyCode === 229) return false; // 한글 조합 중(입력기가 처리 중인 키)에는 건드리지 않음
  const ctrl = e.ctrlKey || e.metaKey;
  const done = () => { e.preventDefault(); return true; };
  // 목록 키는 "지금 처리할지"만 정하고, 한글 조합 중이면 실제로 바꾸는 건 조합이 끝난 뒤에 한다(afterIme).
  // 데스크탑 앱에서 마지막 글자(예: "라")가 조합 중일 때 바로 바꾸면, 입력기가 예전 위치 기준으로 글자를 확정하면서
  // 내용이 뒤엉키거나 전체가 지워졌다(2026-10-07). 바꿀 때는 그 순간의 내용으로 다시 계산한다.
  // 조합 중이 아니면 바로 처리 (기다리면 빠르게 칠 때 다음 글자가 먼저 들어간다)
  const later = (fn) => { e.preventDefault(); if (imeComposing) afterIme(ta, fn); else fn(); return true; };

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
    autoRenumber(ta);
    return done();
  }
  // Ctrl+Shift+X: 체크박스 켜기/끄기 (없으면 [ ] 붙이기). 한글 자판에서도 되게 자판 위치(code)로
  if (ctrl && e.shiftKey && !e.altKey && e.code === "KeyX") {
    return later(() => { toggleCheckbox(ta); autoRenumber(ta); });
  }
  // Alt+↑/↓: 줄(고른 여러 줄) 위아래로 옮기기
  if (e.altKey && !ctrl && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    const dir = e.key === "ArrowUp" ? -1 : 1;
    return later(() => { moveLines(ta, dir); autoRenumber(ta); });
  }
  if ((e.key === "Tab" || e.key === "Enter" || e.key === "Backspace") && !memoAutoListOn()) return false;
  // Tab은 메모장·워드처럼 입력칸 안에서 처리 (다음 칸으로 넘어가지 않음)
  if (e.key === "Tab" && !ctrl && !e.altKey) {
    const shift = e.shiftKey;
    return later(() => { doTab(ta, shift); autoRenumber(ta); });
  }
  // 목록 기호 바로 뒤에서 Backspace → 들여쓴 항목이면 한 단계 위로, 맨 위면 기호만 지우기 (노션·구글 문서와 같게)
  if (e.key === "Backspace" && !ctrl && !e.shiftKey && !e.altKey && backspacePlan(ta)) {
    return later(() => { if (!doBackspace(ta)) replaceRange(ta, Math.max(0, ta.selectionStart - 1), ta.selectionEnd, ""); autoRenumber(ta); });
  }
  if (e.key === "Enter" && !ctrl && !e.shiftKey && !e.altKey && enterPlan(ta)) {
    return later(() => { if (!doEnter(ta)) replaceRange(ta, ta.selectionStart, ta.selectionEnd, "\n"); autoRenumber(ta); });
  }
  // 그냥 지우기·잘라내기(줄을 지웠을 수 있음) → 기본 동작이 끝난 뒤 번호 다시 매기기
  if (e.key === "Backspace" || e.key === "Delete" || (ctrl && e.code === "KeyX")) {
    setTimeout(() => { if (!imeComposing) autoRenumber(ta); }, 0);
  }
  return false;
}

// ---------- 체크박스 · 줄 옮기기 · 번호 다시 매기기 (2026-10-07) ----------

// 고른 줄(커서 줄)의 범위와 줄 목록
function selectedLines(ta) {
  const v = ta.value;
  const selS = ta.selectionStart, selE = ta.selectionEnd;
  const start = v.lastIndexOf("\n", selS - 1) + 1;
  const endPos = selE > selS && v[selE - 1] === "\n" ? selE - 1 : selE;
  let end = v.indexOf("\n", endPos);
  if (end < 0) end = v.length;
  return { start, end, lines: v.slice(start, end).split("\n") };
}

// [ ] ↔ [x], 체크박스 없는 줄은 기호 뒤(없으면 맨 앞)에 "[ ] " 붙이기
function toggleCheckbox(ta) {
  const { start, end, lines } = selectedLines(ta);
  const selS = ta.selectionStart, selE = ta.selectionEnd;
  let firstDelta = 0, total = 0;
  const out = lines.map((l, i) => {
    if (!l.trim() && lines.length > 1) return l;
    const m = /^([ \t]*)((?:[-•*]|\d+[.)]|(?:하\d{1,2}|[가나다라마바사아자차카타파하])[.)])[ \t]+)?(\[([ xX])\])?/.exec(l);
    let next;
    if (m[3]) next = l.slice(0, m[1].length + (m[2] || "").length) + (m[4] === " " ? "[x]" : "[ ]") + l.slice(m[0].length);
    else next = m[1] + (m[2] || "") + "[ ] " + l.slice(m[1].length + (m[2] || "").length);
    if (i === 0) firstDelta = next.length - l.length;
    total += next.length - l.length;
    return next;
  });
  replaceRange(ta, start, end, out.join("\n"));
  if (selS === selE) { const p = selS + firstDelta; ta.setSelectionRange(p, p); }
  else ta.setSelectionRange(selS + firstDelta, selE + total);
}

// 고른 줄 묶음을 한 줄 위(-1)/아래(1)로. 고른 범위는 따라 움직인다
function moveLines(ta, dir) {
  const v = ta.value;
  const { start, end } = selectedLines(ta);
  const selS = ta.selectionStart, selE = ta.selectionEnd;
  const block = v.slice(start, end);
  if (dir < 0) {
    if (start === 0) return;
    const prevStart = v.lastIndexOf("\n", start - 2) + 1;
    const prev = v.slice(prevStart, start - 1);
    replaceRange(ta, prevStart, end, `${block}\n${prev}`);
    const shift = prev.length + 1;
    ta.setSelectionRange(selS - shift, selE - shift);
  } else {
    if (end >= v.length) return;
    let nextEnd = v.indexOf("\n", end + 1);
    if (nextEnd < 0) nextEnd = v.length;
    const next = v.slice(end + 1, nextEnd);
    replaceRange(ta, start, nextEnd, `${next}\n${block}`);
    const shift = next.length + 1;
    ta.setSelectionRange(selS + shift, selE + shift);
  }
}

// 번호 목록 다시 매기기 — 커서가 있는 목록 덩어리 안에서만(빈 줄·들여쓰지 않은 일반 글에서 끊김),
// 같은 단계에 번호 항목이 2개 이상일 때만 1부터. 3자리까지만 번호로 본다("2026. 10. 7." 같은 날짜는 그대로)
const NUM_RE = /^([ \t]*)(\d{1,3}|하\d{1,2}|[가나다라마바사아자차카타파하])([.)])(?=[ \t]|$)/;
const BULLET_RE = /^([ \t]*)(?:[-•*]|\[[ xX]\])(?=[ \t]|$)/;
const indentWidth = (s) => s.replace(/\t/g, INDENT).length;
// 번호 기호는 한국 공문서 방식: 단계마다 1. → 가. → 1) → 가), 그 아래는 다시 반복 (2026-10-09 사용자 확정).
// "가."·"가)"는 들여 쓴 줄에서만 번호로 본다("가. 나는…" 같은 일반 문장 보호). 하 다음은 하1, 하2…
const HANGUL_NUM = "가나다라마바사아자차카타파하";
const isHangulMark = (mark) => /^[가-힣]/.test(mark);
const markNumber = (mark) => (isHangulMark(mark) ? (mark.length > 1 ? 14 + parseInt(mark.slice(1), 10) : HANGUL_NUM.indexOf(mark) + 1) : parseInt(mark, 10));
const hangulMark = (n) => (n <= 14 ? HANGUL_NUM[n - 1] : `하${n - 14}`);
const sameKindMark = (n, mark) => (isHangulMark(mark) ? hangulMark(n) : String(n)); // 같은 종류(숫자/한글)로 n번째
const levelMark = (n, level) => `${level % 2 ? hangulMark(n) : n}${level % 4 >= 2 ? ")" : "."}`; // 단계(0부터)의 n번째: 1. 가. 1) 가)
const numExec = (l) => { const m = NUM_RE.exec(l); return m && (!isHangulMark(m[2]) || m[1]) ? m : null; };
const inListBlock = (l) => l.trim() && (numExec(l) || BULLET_RE.test(l) || /^[ \t]/.test(l));

export function renumberLines(lines) {
  // 같은 단계 번호 항목들을 묶는다: [{ indent, idx: [줄 번호...] }]
  const groups = [];
  let stack = []; // 열린 묶음들 (바깥 → 안쪽)
  lines.forEach((l, i) => {
    const m = numExec(l);
    if (m) {
      const L = indentWidth(m[1]);
      while (stack.length && stack[stack.length - 1].indent > L) stack.pop();
      const top = stack[stack.length - 1];
      if (top && top.indent === L) top.idx.push(i);
      else { const g = { indent: L, idx: [i] }; groups.push(g); stack.push(g); }
      return;
    }
    const b = BULLET_RE.exec(l);
    if (b) { const L = indentWidth(b[1]); while (stack.length && stack[stack.length - 1].indent >= L) stack.pop(); }
  });
  const out = [...lines];
  for (const g of groups) {
    if (g.idx.length < 2) continue;
    g.idx.forEach((i, k) => { out[i] = out[i].replace(NUM_RE, (_, sp, mark, dot) => `${sp}${sameKindMark(k + 1, mark)}${dot}`); });
  }
  return out;
}

function autoRenumber(ta) {
  if (!ta || !memoAutoListOn()) return;
  const v = ta.value;
  const all = v.split("\n");
  const caretLine = v.slice(0, ta.selectionStart).split("\n").length - 1;
  // 커서 줄이 속한 목록 덩어리 (커서 줄이 비었으면 바로 위·아래 덩어리도 본다 — 줄을 지운 직후)
  let a = caretLine, b = caretLine;
  if (!inListBlock(all[caretLine] ?? "")) {
    if (caretLine > 0 && inListBlock(all[caretLine - 1])) a = b = caretLine - 1;
    else if (inListBlock(all[caretLine + 1] ?? "")) a = b = caretLine + 1;
    else return;
  }
  while (a > 0 && inListBlock(all[a - 1])) a--;
  while (b < all.length - 1 && inListBlock(all[b + 1])) b++;
  const block = all.slice(a, b + 1);
  const next = renumberLines(block);
  if (next.every((l, i) => l === block[i])) return;
  // 바뀐 줄만 바꿔 넣고, 커서·고른 범위는 같은 글자 자리에 두기
  let first = 0; while (next[first] === block[first]) first++;
  let last = block.length - 1; while (next[last] === block[last]) last--;
  const lineStart = (k) => all.slice(0, k).reduce((s, l) => s + l.length + 1, 0);
  const from = lineStart(a + first);
  const to = lineStart(a + last) + block[last].length;
  const mapPos = (pos) => {
    let p = from, delta = 0;
    for (let k = first; k <= last; k++) {
      const oldL = block[k], newL = next[k];
      const numEnd = (NUM_RE.exec(oldL)?.[0].length) ?? 0;
      if (pos >= p + oldL.length + 1 || (k === last && pos > p + oldL.length)) { delta += newL.length - oldL.length; p += oldL.length + 1; continue; }
      if (pos >= p + numEnd) delta += newL.length - oldL.length;
      return pos + delta;
    }
    return pos + delta;
  };
  const selS = ta.selectionStart, selE = ta.selectionEnd;
  const ns = selS < from ? selS : mapPos(selS);
  const ne = selE < from ? selE : mapPos(selE);
  replaceRange(ta, from, to, next.slice(first, last + 1).join("\n"));
  ta.setSelectionRange(ns, ne);
}

// 한글 조합 상태 — 입력기 조합이 시작되고 끝날 때까지
let imeComposing = false;
if (typeof document !== "undefined") {
  document.addEventListener("compositionstart", () => { imeComposing = true; }, true);
  document.addEventListener("compositionend", () => { imeComposing = false; }, true);
}
// 입력기가 조합 중인 글자를 확정한 뒤에 fn 실행. 다음 틱에도 조합 중이면 포커스를 잠깐 뺐다가 돌려 강제로 확정한다
function afterIme(ta, fn) {
  setTimeout(() => {
    if (imeComposing) {
      ta.blur();
      ta.focus();
      imeComposing = false;
      setTimeout(fn, 0);
      return;
    }
    fn();
  }, 0);
}

function doTab(ta, shift) {
  if (shift) { indentLines(ta, -1); return; }
  const multi = ta.value.slice(ta.selectionStart, ta.selectionEnd).includes("\n");
  if (!indentLines(ta, 1, multi)) replaceRange(ta, ta.selectionStart, ta.selectionEnd, INDENT); // 목록 아닌 줄 → 공백 4칸
}

// 커서가 목록 기호 바로 뒤인가 → 그 줄의 목록 정보
function backspacePlan(ta) {
  if (ta.selectionStart !== ta.selectionEnd) return null;
  const cl = currentLine(ta);
  const before = ta.value.slice(cl.start, ta.selectionStart);
  const m = LIST_RE.exec(before);
  return m && m[0] === before ? { cl, m } : null;
}
function doBackspace(ta) {
  const p = backspacePlan(ta);
  if (!p) return false;
  if (p.m[1]) indentLines(ta, -1);
  else replaceRange(ta, p.cl.start, p.cl.start + p.m[0].length, "", p.cl.start);
  return true;
}

// 커서가 목록 줄 안인가 → 그 줄의 목록 정보
function enterPlan(ta) {
  if (ta.selectionStart !== ta.selectionEnd) return null;
  const cl = currentLine(ta);
  const before = ta.value.slice(cl.start, ta.selectionStart);
  const m = LIST_RE.exec(before);
  return m && m[0].trim() ? { cl, m } : null;
}
function doEnter(ta) {
  const p = enterPlan(ta);
  if (!p) return false;
  const { cl, m } = p;
  if (!cl.text.slice(m[0].length).trim()) { // 빈 항목에서 Enter → 들여쓴 항목이면 한 단계 위로, 아니면 기호 지우고 목록 끝
    if (m[1]) indentLines(ta, -1);
    else replaceRange(ta, cl.start, cl.end, "");
    return true;
  }
  const marker = m[2] && /[.)]$/.test(m[2]) ? `${sameKindMark(markNumber(m[2].slice(0, -1)) + 1, m[2])}${m[2].slice(-1)}` : m[2];
  const box = m[3] || m[4] ? "[ ] " : "";
  replaceRange(ta, ta.selectionStart, ta.selectionStart, `\n${m[1]}${marker ? `${marker} ` : ""}${box}`);
  return true;
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
// 한글 번호(가. 가))는 들여 쓴 줄에서만 목록
const LIST_RE_RAW = /^([ \t]*)(?:([-•*]|\d+[.)]|(?:하\d{1,2}|[가나다라마바사아자차카타파하])[.)])[ \t]+(\[[ xX]\][ \t]+)?|(\[[ xX]\])[ \t]+)/;
const LIST_RE = { exec: (s) => { const m = LIST_RE_RAW.exec(s); return m && m[2] && isHangulMark(m[2]) && !m[1] ? null : m; } };
const LIST_LINE_RE_RAW = /^([ \t]*)(?:[-•*]|\d+[.)]|(하\d{1,2}|[가나다라마바사아자차카타파하])[.)]|\[[ xX]\])(?:[ \t]|$)/;
const LIST_LINE_RE = { test: (l) => { const m = LIST_LINE_RE_RAW.exec(l); return !!m && !(m[2] && !m[1]); } };
const INDENT = "    "; // 한 단계 = 공백 4칸 (메모 글꼴에서 2칸은 거의 안 보임)

// 번호 줄의 기호를 들여쓰기 단계에 맞게 바꾸기 (n을 주면 그 번호로)
function restyleOrdered(line, n) {
  const m = /^([ \t]*)(\d+|하\d{1,2}|[가나다라마바사아자차카타파하])[.)](?=[ \t]|$)/.exec(line);
  if (!m) return line;
  return m[1] + levelMark(n ?? markNumber(m[2]), Math.floor(indentWidth(m[1]) / 4)) + line.slice(m[0].length);
}

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
      // 번호 목록을 한 단계 내리면 그 단계 기호로 1부터 다시 (1. → 가. → 1) → 가))
      if (LIST_LINE_RE.test(l)) next = restyleOrdered(next, 1);
    } else {
      const lead = /^( {1,4}|\t)/.exec(l);
      if (lead) next = l.slice(lead[0].length);
      // 한 단계 올리면 번호는 두고 그 단계 기호로 (순서는 번호 다시 매기기가 맞춘다)
      if (lead && LIST_LINE_RE.test(l)) next = restyleOrdered(next);
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
