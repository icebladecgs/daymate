// 배틀 장면의 도트 장수 (2026-10-30, 영걸전 느낌 — 그림은 직접 그린 것, 원작 그림·음악은 쓰지 않는다)
// 16×16 칸 그림을 글자 지도로 그리고, 칸마다 색을 칠한다. 오른쪽을 본다(상대는 flip으로 뒤집음).
// 글자: H 머리·투구 S 피부 E 눈 A 갑옷 a 갑옷 그늘 B 허리띠 P 바지 K 신발 W 칼날 w 칼자루 C 망토 F 깃털

const MAP = [
  '.......FF.......',
  '......FHHH......',
  '.....HHHHHH.....',
  '.....HSSSSE.....',
  '.....HSSSSS.....',
  '......SSSS...W..',
  '....CAAAAAAa.W..',
  '...CCAAAAAAaaW..',
  '...CCaAAAAAa.SS.',
  '...CC.AAAAA..w..',
  '...C..BBBBB..w..',
  '......PP.PP.....',
  '......PP.PP.....',
  '......PP.PP.....',
  '......KK.KK.....',
  '.....KKK.KKK....',
];

const BASE = { S: '#F2C9A0', E: '#111827', W: '#E5E7EB', w: '#78350F' };

export default function PixelWarrior({ armor, size = 64, flip = false, headOnly = false, style }) {
  const pal = { ...BASE, ...armor };
  // 얼굴만(대사 창·컷인): 머리 부분(가로 4~11칸, 세로 0~6줄)만 잘라 크게
  const rows = headOnly ? MAP.slice(0, 7) : MAP;
  const cells = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const color = ch === '.' ? null : pal[ch];
      if (color) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={color} />);
    }
  });
  const h = rows.length;
  const vb = headOnly ? `4 0 8 ${h}` : `0 0 16 ${h}`;
  const w = headOnly ? 8 : 16;
  return (
    <svg viewBox={vb} width={size} height={(size * h) / w} shapeRendering="crispEdges" aria-hidden="true"
      style={{ display: 'block', transform: flip ? 'scaleX(-1)' : undefined, imageRendering: 'pixelated', ...style }}>
      {cells}
    </svg>
  );
}
