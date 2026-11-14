// 오답 노트 출력 (2026-11-14, 콴다 "오답 노트 출력" 참고) — 고른 문제를 A4에 모아 찍는다.
// 문제는 앞, 정답·풀이 사진은 뒤쪽 새 페이지에 같은 번호로 (풀면서 답이 보이지 않게).
// 사진은 원본 그대로, "문제만 보이기"(photo.crop)를 정했으면 그 부분만 — 화면과 같은 cropLayout.
// 숨은 iframe에 만들고, 사진을 다 받은 뒤(최대 10초) 인쇄 창을 연다 (utils/printMemo.js와 같은 방식).
import { cropLayout } from './exam.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function photoHtml(p) {
  if (!p?.url) return '';
  const lay = cropLayout(p.crop);
  if (!lay) return `<div class="ph"><img src="${esc(p.url)}" alt=""></div>`;
  return `<div class="ph"><div class="crop" style="aspect-ratio:${lay.ar}"><img src="${esc(p.url)}" alt="" style="position:absolute;width:${lay.width}%;max-width:none;max-height:none;left:${lay.left}%;top:${lay.top}%"></div></div>`;
}

export function buildWrongPrintHtml(notes, heading = '') {
  const list = notes || [];
  const head = (n, i) => `${i + 1}. ${esc(n.sub || '')}${n.unit ? ` · ${esc(n.unit)}` : ''}${n.reason ? ` <span class="tag">${esc(n.reason)}</span>` : ''}`;
  const problems = list.map((n, i) => `<section class="q"><div class="qh">${head(n, i)}</div>${(n.photos || []).map(photoHtml).join('')}${n.memo ? `<div class="memo">${esc(n.memo)}</div>` : ''}</section>`).join('');
  const withAns = list.map((n, i) => ({ n, i })).filter(({ n }) => (n.answerPhotos || []).length);
  const answers = withAns.length
    ? `<div class="page"><div class="title">정답·풀이</div>${withAns.map(({ n, i }) => `<section class="q"><div class="qh">${head(n, i)}</div>${n.answerPhotos.map(photoHtml).join('')}</section>`).join('')}</div>`
    : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>DayMate 오답 노트</title>
<style>
  @page { size: A4; margin: 14mm 14mm; }
  html, body { background: #fff; color: #000; margin: 0; }
  body { font-family: "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif; }
  .head { font-size: 9pt; color: #666; margin-bottom: 8pt; padding-bottom: 4pt; border-bottom: 0.5pt solid #ccc; }
  .title { font-size: 15pt; font-weight: 700; margin: 0 0 10pt; }
  .q { break-inside: avoid; page-break-inside: avoid; padding: 8pt 0 12pt; border-bottom: 0.5pt solid #ddd; }
  .qh { font-size: 12pt; font-weight: 700; margin-bottom: 6pt; }
  .tag { font-size: 9pt; font-weight: 400; color: #555; border: 0.5pt solid #999; border-radius: 8pt; padding: 0 5pt; margin-left: 4pt; }
  .ph { margin: 4pt 0; }
  .ph > img { display: block; max-width: 100%; max-height: 120mm; }
  .crop { position: relative; overflow: hidden; width: 100%; max-width: 160mm; }
  .memo { font-size: 10.5pt; color: #333; white-space: pre-wrap; margin-top: 4pt; }
  .page { break-before: page; page-break-before: always; }
</style></head><body>
${heading ? `<div class="head">${esc(heading)}</div>` : ''}<div class="title">오답 노트 · ${list.length}문제</div>${problems}${answers}
</body></html>`;
}

// 인쇄 창을 띄운다. 띄우지 못하면 false.
export function printWrongNotes(notes, heading = '') {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  // 크기 0이면 일부 브라우저가 사진을 받지 않아 A4 폭으로 화면 밖에 둔다
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(buildWrongPrintHtml(notes, heading));
  doc.close();
  const win = frame.contentWindow;
  win.addEventListener('afterprint', cleanup);
  const imgs = [...doc.images];
  const loaded = Promise.all(imgs.map(img => (img.complete ? null : new Promise(r => { img.onload = r; img.onerror = r; }))));
  return Promise.race([loaded, new Promise(r => setTimeout(r, 10000))]).then(() => {
    try { win.focus(); win.print(); return true; } catch { cleanup(); return false; }
  });
}
