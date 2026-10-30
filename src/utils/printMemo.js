// 메모 출력 — 화면(포스트잇 창)을 그대로 찍지 않고, 글만 A4 종이에 맞춘 페이지를 숨은 iframe에 만들어 인쇄 창을 연다.
// 글자는 쓴 그대로(줄바꿈·들여쓰기 유지), 흰 바탕·검은 글씨, 위에 날짜를 작게 둔다.

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export function buildPrintHtml(text, heading = "") {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>DayMate 메모</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  html, body { background: #fff; color: #000; margin: 0; }
  body { font-family: "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif; }
  .head { font-size: 9pt; color: #666; margin-bottom: 8pt; padding-bottom: 4pt; border-bottom: 0.5pt solid #ccc; }
  .body { font-size: 13pt; line-height: 1.6; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; tab-size: 4; }
</style></head><body>
${heading ? `<div class="head">${escapeHtml(heading)}</div>` : ""}<div class="body">${escapeHtml(text)}</div>
</body></html>`;
}

// 인쇄 창을 띄운다. 창을 닫으면(인쇄·취소 모두) iframe을 치운다. 띄우지 못하면 false.
export function printMemo(text, heading = "") {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(buildPrintHtml(text, heading));
  doc.close();
  const win = frame.contentWindow;
  win.addEventListener("afterprint", cleanup);
  try { win.focus(); win.print(); return true; } catch { cleanup(); return false; }
}
