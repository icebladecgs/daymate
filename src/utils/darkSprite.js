// 🗡️ 배틀 그림 — 다크 판타지 도트 48×48 (2026-11-13 사용자 승인, 시안 A+). 모두 직접 디자인한 것 —
// 다른 게임·만화(베르세르크 등)의 캐릭터·그림을 따라 그리지 않는다(CLAUDE.md, 다크 판타지 "분위기"만).
// 칸을 하나씩 찍지 않고 모양(타원·다각형·굵은 선)으로 그린 뒤, 자동으로 바깥 외곽선과 빛(왼쪽 위) 명암을 입힌다.
// 프레임 3장: 숨쉬기(몸이 1칸 내려감)·망토/깃털 흔들림 — 화면은 components/battle/DarkSprite.jsx.
// 오른쪽을 본다(상대는 화면에서 뒤집음). 계산 결과는 [x, y, 색] 목록이며 종류·색·프레임마다 한 번만 만든다.
export const SPRITE_N = 48;
const N = SPRITE_N;

// ── 그리기 도구 ──
const blank = () => Array.from({ length: N }, () => Array(N).fill(null));
const set = (g, x, y, m) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = m; };
const ellipse = (g, cx, cy, rx, ry, m) => {
  for (let y = Math.max(0, Math.floor(cy - ry - 1)); y <= Math.min(N - 1, Math.ceil(cy + ry + 1)); y++)
    for (let x = Math.max(0, Math.floor(cx - rx - 1)); x <= Math.min(N - 1, Math.ceil(cx + rx + 1)); x++)
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) g[y][x] = m;
};
const rect = (g, x0, y0, x1, y1, m) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(g, x, y, m); };
const poly = (g, pts, m) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = x + 0.5, py = y + 0.5;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) g[y][x] = m;
  }
};
const line = (g, x0, y0, x1, y1, w, m) => {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let i = 0; i <= n; i++) { const t = i / n; ellipse(g, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, w / 2, m); }
};

// ── 다리·발 (공통) ──
function legs(g, legM = 'leg', kneeM = 'plate', bootM = 'boot') {
  rect(g, 16, 36, 20, 44, legM); rect(g, 24, 36, 28, 44, legM);
  if (kneeM) { ellipse(g, 18.5, 38.5, 2.6, 2, kneeM); ellipse(g, 26.5, 38.5, 2.6, 2, kneeM); }
  rect(g, 14, 44, 21, 46, bootM); rect(g, 23, 44, 31, 46, bootM);
}

// ── 주인공: 깃털 투구 기사 + 긴 칼 ──
function hero(f) {
  const g = blank();
  const b = f === 1 ? 1 : 0; // 숨 내쉼
  const flap = [[5, 38, 8, 44], [4, 39, 7, 45], [6, 37, 9, 43]][f];
  poly(g, [[16, 19 + b], [10, 23 + b], [flap[0], flap[1]], [flap[2], flap[3]], [13, 43], [18, 41], [18, 28 + b]], 'cloak');
  legs(g);
  poly(g, [[15, 31 + b], [29, 31 + b], [31, 37], [13, 37]], 'trim');
  rect(g, 15, 30 + b, 29, 32 + b, 'belt'); rect(g, 21, 30 + b, 23, 32 + b, 'gold');
  poly(g, [[14, 19 + b], [30, 19 + b], [29, 30 + b], [15, 30 + b]], 'plate');
  line(g, 22, 21 + b, 22, 28 + b, 1, 'trim');
  rect(g, 18, 17 + b, 26, 19 + b, 'trim');
  ellipse(g, 14.5, 21.5 + b, 5, 4, 'plate'); ellipse(g, 14.5, 23.5 + b, 4.5, 1.2, 'trim');
  // 칼 — 칼날 3칸, 넓은 날밑, 긴 손잡이
  rect(g, 33, 2 + b, 35, 25 + b, 'blade'); set(g, 34, 1 + b, 'blade');
  rect(g, 29, 26 + b, 39, 27 + b, 'gold');
  rect(g, 33, 28 + b, 35, 35 + b, 'grip'); ellipse(g, 34.5, 36.5 + b, 1.8, 1.6, 'gold');
  line(g, 29.5, 23 + b, 32.5, 29 + b, 4, 'plate'); ellipse(g, 34.5, 30.5 + b, 2.4, 2.2, 'trim');
  ellipse(g, 30, 21 + b, 5.5, 4.2, 'plate'); ellipse(g, 30, 23.5 + b, 5, 1.3, 'trim');
  ellipse(g, 22.5, 11 + b, 7.2, 7.5, 'helm');
  poly(g, [[22, 13 + b], [30, 13 + b], [29, 18 + b], [23, 18 + b]], 'helm');
  rect(g, 21, 3 + b, 23, 7 + b, 'trim');
  rect(g, 19, 11 + b, 30, 12 + b, 'visor'); set(g, 27, 11 + b, 'eye'); set(g, 28, 11 + b, 'eye');
  line(g, 25, 14 + b, 29, 14 + b, 1, 'visor'); line(g, 25, 16 + b, 28, 16 + b, 1, 'visor');
  poly(g, [[22, 4 + b], [16, 1 + b], [10, 3 + b], [7 - f, 8], [12, 7 + b], [17, 6 + b]], 'plume');
  return g;
}

// ── 상대 1: 두건 도적 + 단검 (낮은 레벨) ──
function bandit(f) {
  const g = blank();
  const b = f === 1 ? 1 : 0;
  const flap = [[8, 40], [7, 41], [9, 39]][f];
  poly(g, [[16, 18 + b], [11, 24 + b], [flap[0], flap[1]], [15, 42], [19, 34 + b]], 'cloak');
  legs(g, 'leg', null, 'boot');
  rect(g, 15, 30 + b, 29, 32 + b, 'belt'); rect(g, 26, 30 + b, 27, 32 + b, 'gold');
  poly(g, [[15, 18 + b], [29, 18 + b], [30, 30 + b], [14, 30 + b]], 'plate'); // 가죽 조끼
  poly(g, [[15, 31 + b], [29, 31 + b], [30, 36], [14, 36]], 'plate');
  line(g, 18, 19 + b, 26, 29 + b, 1.2, 'belt'); // 어깨끈
  // 단검을 앞으로 쥠
  line(g, 28, 21 + b, 31, 27 + b, 3.6, 'plate'); ellipse(g, 32, 28 + b, 2.2, 2, 'leg');
  line(g, 33, 27 + b, 39, 21 + b, 2, 'blade'); set(g, 40, 20 + b, 'blade');
  line(g, 31, 30 + b, 32, 28 + b, 1.6, 'grip');
  // 두건
  ellipse(g, 22.5, 11.5 + b, 7.5, 8, 'hood');
  poly(g, [[16, 14 + b], [12, 20 + b], [18, 19 + b]], 'hood');
  ellipse(g, 25.5, 12.5 + b, 4.4, 3.8, 'visor'); // 얼굴 그늘
  set(g, 26, 11 + b, 'eye'); set(g, 28, 11 + b, 'eye');
  rect(g, 21, 15 + b, 29, 17 + b, 'scarf'); // 복면
  return g;
}

// ── 상대 2: 뿔 투구 무법자 + 큰 도끼 (중간 레벨) ──
function horn(f) {
  const g = blank();
  const b = f === 1 ? 1 : 0;
  const flap = [[6, 40], [5, 41], [7, 39]][f];
  poly(g, [[16, 19 + b], [10, 25 + b], [flap[0], flap[1]], [14, 43], [18, 33 + b]], 'cloak');
  legs(g, 'leg', 'plate', 'boot');
  poly(g, [[14, 31 + b], [30, 31 + b], [32, 37], [12, 37]], 'trim');
  rect(g, 14, 30 + b, 30, 32 + b, 'belt'); ellipse(g, 22.5, 31 + b, 1.8, 1.5, 'bone');
  poly(g, [[13, 19 + b], [31, 19 + b], [30, 30 + b], [14, 30 + b]], 'plate');
  ellipse(g, 13.5, 21 + b, 5.5, 4.5, 'plate'); ellipse(g, 31, 21 + b, 6, 4.6, 'plate');
  for (const [x, y] of [[11, 18], [15, 17], [29, 17], [33, 18]]) poly(g, [[x, y + 2 + b], [x + 1, y - 1 + b], [x + 2, y + 2 + b]], 'bone'); // 어깨 가시
  // 도끼 — 자루 + 날
  line(g, 37, 5 + b, 37, 40 + b, 2, 'grip');
  poly(g, [[38, 5 + b], [44, 3 + b], [46, 9 + b], [44, 15 + b], [38, 13 + b]], 'blade');
  line(g, 31, 23 + b, 36, 26 + b, 4, 'plate'); ellipse(g, 37, 26.5 + b, 2.3, 2.2, 'trim');
  // 투구 + 뿔
  ellipse(g, 22.5, 11 + b, 7, 7.2, 'helm');
  poly(g, [[16, 9 + b], [11, 6 + b], [9, 1 + b], [13, 3 + b], [17, 6 + b]], 'bone');
  poly(g, [[28, 7 + b], [32, 3 + b], [35, 0 + b], [34, 5 + b], [30, 10 + b]], 'bone');
  poly(g, [[22, 13 + b], [30, 13 + b], [28, 18 + b], [22, 18 + b]], 'helm');
  rect(g, 20, 11 + b, 29, 12 + b, 'visor'); set(g, 26, 11 + b, 'eye'); set(g, 27, 11 + b, 'eye');
  line(g, 24, 15 + b, 28, 15 + b, 1, 'visor');
  return g;
}

// ── 상대 3: 해골 기사 + 큰 검 (높은 레벨) ──
function skull(f) {
  const g = blank();
  const b = f === 1 ? 1 : 0;
  const rag = [[3, 41, 7, 44, 11, 41], [2, 42, 6, 45, 10, 42], [4, 40, 8, 43, 12, 40]][f];
  poly(g, [[16, 18 + b], [8, 24 + b], [rag[0], rag[1]], [rag[2], rag[3]], [rag[4], rag[5]], [14, 44], [18, 32 + b]], 'cloak');
  legs(g, 'leg', 'plate', 'boot');
  poly(g, [[14, 31 + b], [30, 31 + b], [31, 37], [13, 37]], 'trim');
  rect(g, 14, 30 + b, 30, 32 + b, 'belt'); rect(g, 21, 30 + b, 23, 32 + b, 'gold');
  poly(g, [[14, 18 + b], [30, 18 + b], [29, 30 + b], [15, 30 + b]], 'plate');
  for (let y = 21; y <= 27; y += 3) line(g, 18, y + b, 26, y + b, 1, 'bone'); // 갈비뼈 무늬
  ellipse(g, 14, 20.5 + b, 5.2, 4.2, 'plate'); ellipse(g, 30.5, 20.5 + b, 5.6, 4.4, 'plate');
  // 큰 검 — 넓은 날을 비스듬히
  line(g, 33, 33 + b, 44, 4 + b, 3.4, 'blade');
  line(g, 30, 30 + b, 37, 33 + b, 2, 'gold');
  line(g, 31, 36 + b, 33, 32 + b, 2, 'grip');
  line(g, 29, 22 + b, 32, 30 + b, 4, 'plate'); ellipse(g, 33, 31.5 + b, 2.3, 2.2, 'bone');
  // 해골 + 왕관 테
  ellipse(g, 22.5, 11 + b, 6.8, 7, 'bone');
  rect(g, 21, 15 + b, 28, 18 + b, 'bone');
  ellipse(g, 24, 10.5 + b, 1.8, 1.8, 'visor'); ellipse(g, 28.5, 10.5 + b, 1.6, 1.8, 'visor');
  set(g, 24, 10 + b, 'eye'); set(g, 28, 10 + b, 'eye');
  set(g, 27, 13 + b, 'visor');
  for (let x = 22; x <= 28; x += 2) set(g, x, 16 + b, 'visor'); // 이빨 사이
  rect(g, 16, 4 + b, 29, 5 + b, 'gold');
  for (const x of [17, 21, 25, 28]) set(g, x, 3 + b, 'gold');
  return g;
}

const FIGURES = { hero, bandit, horn, skull };

// ── 색 ──
const hex = (h) => h.replace('#', '').match(/../g).map((x) => parseInt(x, 16));
export const mixColor = (h, t, f) => { const a = hex(h), c = hex(t); const k = Math.max(0, Math.min(1, f)); return '#' + a.map((v, i) => Math.round(v + (c[i] - v) * k).toString(16).padStart(2, '0')).join(''); };

// 주인공 등급 6가지 (레벨 4단계씩 — components/battle/armor.js tierOfLevel)
export const HERO_TIERS = [
  { name: '브론즈', A: '#B87333', F: null, C: null },
  { name: '실버', A: '#B9C2CC', F: null, C: null },
  { name: '골드', A: '#E8B93A', F: '#C81E1E', C: null },
  { name: '플래티넘', A: '#3FC9B4', F: '#F1F5F9', C: '#1D4ED8' },
  { name: '다이아몬드', A: '#7FB0F5', F: '#E0F2FE', C: '#7C3AED' },
  { name: '챌린저', A: '#2C2A36', Lc: '#E8B93A', F: '#E11D48', C: '#9F1239', eye: '#FFB4A8' },
];
const heroColors = (t) => ({
  plate: t.A, helm: mixColor(t.A, '#ffffff', 0.05), trim: mixColor(t.A, '#000000', 0.42), blade: '#D9E1EA', gold: t.Lc || '#C9A23F',
  cloak: t.C ? mixColor(t.C, '#000000', 0.35) : '#5A1218', plume: t.F || mixColor(t.A, '#000000', 0.15), belt: '#2C1F18',
  grip: '#3B2A20', leg: mixColor(t.A, '#000000', 0.6), boot: '#1A1411', visor: '#06050A', eye: t.eye || '#BDE6FF',
});
const FOE_COLORS = {
  bandit: { plate: '#6B4A2E', hood: '#2F3A2C', cloak: '#232B22', scarf: '#5A1A1A', belt: '#2A1D14', gold: '#9C7A34', blade: '#C9D1DA', grip: '#3B2A20', leg: '#3A2E26', boot: '#17120F', visor: '#07060A', eye: '#F5D547' },
  horn: { plate: '#6B1D1D', helm: '#3A1414', trim: '#2A0E0E', bone: '#D8CFB8', cloak: '#26201D', belt: '#1E1612', blade: '#C3CAD2', grip: '#4A3424', leg: '#2A1A18', boot: '#120D0B', visor: '#050407', eye: '#FF3B30' },
  skull: { plate: '#3A3F4C', trim: '#262A33', bone: '#E3DCC8', cloak: '#2A1838', belt: '#17141C', gold: '#A8893A', blade: '#B9C7D8', grip: '#2A2024', leg: '#22252D', boot: '#0E0E12', visor: '#050407', eye: '#FF2D55' },
};
const METAL = { hero: ['plate', 'helm', 'trim', 'blade', 'gold'], bandit: ['blade', 'gold'], horn: ['plate', 'helm', 'trim', 'blade'], skull: ['plate', 'trim', 'blade', 'gold', 'bone'] };

function paint(g, base, metal) {
  const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? null : g[y][x]);
  const span = {};
  g.forEach((row, y) => row.forEach((m) => { if (m) { const s = span[m] || (span[m] = [y, y]); s[0] = Math.min(s[0], y); s[1] = Math.max(s[1], y); } }));
  const cells = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const m = g[y][x];
    if (!m) {
      if (at(x, y - 1) || at(x, y + 1) || at(x - 1, y) || at(x + 1, y)) cells.push([x, y, '#07050A']); // 바깥 외곽선
      continue;
    }
    const c0 = base[m] || '#888888';
    if (m === 'visor' || m === 'eye') { cells.push([x, y, c0]); continue; }
    const s = span[m];
    const t = s[1] > s[0] ? (y - s[0]) / (s[1] - s[0]) : 0;
    const isMetal = metal.includes(m);
    let c = mixColor(c0, '#000000', t * (isMetal ? 0.22 : 0.3)); // 아래로 갈수록 살짝 어둡게
    const up = at(x, y - 1) !== m, left = at(x - 1, y) !== m, down = at(x, y + 1) !== m, right = at(x + 1, y) !== m;
    if (isMetal) {
      if (up && left) c = mixColor(c0, '#ffffff', 0.7); // 반짝 점
      else if (up) c = mixColor(c, '#ffffff', 0.32);
      else if (left) c = mixColor(c, '#ffffff', 0.16);
      if (down || right) c = mixColor(c, '#000000', 0.35);
    } else {
      if (up) c = mixColor(c, '#ffffff', 0.12);
      if (down || right) c = mixColor(c, '#000000', 0.3);
    }
    cells.push([x, y, c]);
  }
  return cells;
}

// 종류(hero·bandit·horn·skull), 주인공 등급(0~5), 프레임(0~2) → [[x, y, 색]] (한 번 만든 것은 기억)
const cache = new Map();
export function spriteCells(kind = 'hero', tier = 0, frame = 0) {
  const k = FIGURES[kind] ? kind : 'hero';
  const ti = k === 'hero' ? Math.max(0, Math.min(HERO_TIERS.length - 1, Number(tier) || 0)) : 0;
  const fr = Math.max(0, Math.min(2, Number(frame) || 0));
  const key = `${k}|${ti}|${fr}`;
  if (!cache.has(key)) {
    const base = k === 'hero' ? heroColors(HERO_TIERS[ti]) : FOE_COLORS[k];
    cache.set(key, paint(FIGURES[k](fr), base, METAL[k]));
  }
  return cache.get(key);
}
// 얼굴만 자를 때(대사 창·컷인) 보여 줄 칸 [x, y, 너비, 높이]
export const HEAD_BOX = { hero: [12, 0, 21, 21], bandit: [13, 2, 19, 19], horn: [9, 0, 27, 21], skull: [13, 1, 19, 19] };
// 상대 레벨 → 상대 모습 (낮은 레벨 도적, 중간 뿔 투구 무법자, 높은 레벨 해골 기사)
export const foeKindOf = (level) => ((Number(level) || 1) <= 6 ? 'bandit' : (Number(level) || 1) <= 14 ? 'horn' : 'skull');
