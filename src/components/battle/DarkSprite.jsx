import { memo } from "react";
import { spriteCells, HEAD_BOX, SPRITE_N } from "../../utils/darkSprite.js";

// 배틀 그림 (2026-11-13, 다크 판타지 48×48 — 계산은 utils/darkSprite.js). 프레임 3장을 겹쳐 두고 CSS로 번갈아 보인다
// (숨쉬기·망토 흔들림, index.css .dm-ds). 움직임 줄이기 설정이면 첫 장만. headOnly는 얼굴 칸만 잘라 크게.
function Frame({ cells, vb, w, h, cls }) {
  return (
    <svg className={cls} viewBox={vb} width={w} height={h} shapeRendering="crispEdges" aria-hidden="true" style={{ display: "block", imageRendering: "pixelated" }}>
      {cells.map(([x, y, c]) => <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={c} />)}
    </svg>
  );
}

function DarkSprite({ kind = "hero", tier = 0, size = 96, flip = false, headOnly = false, still = false, style }) {
  const [bx, by, bw, bh] = headOnly ? HEAD_BOX[kind] || HEAD_BOX.hero : [0, 0, SPRITE_N, SPRITE_N];
  const vb = `${bx} ${by} ${bw} ${bh}`;
  const w = size, h = (size * bh) / bw;
  const frames = still || headOnly ? [0] : [0, 1, 2];
  return (
    <div className={frames.length > 1 ? "dm-ds" : undefined}
      style={{ position: "relative", width: w, height: h, transform: flip ? "scaleX(-1)" : undefined, ...style }}>
      {frames.map((f) => (
        <div key={f} className={frames.length > 1 ? `dm-ds-f dm-ds-f${f}` : undefined} style={frames.length > 1 ? { position: "absolute", inset: 0 } : undefined}>
          <Frame cells={spriteCells(kind, tier, f)} vb={vb} w={w} h={h} />
        </div>
      ))}
    </div>
  );
}
export default memo(DarkSprite);
