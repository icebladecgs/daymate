import { useRef, useState } from "react";

// 끌어서 칸 크기를 바꾸는 선 (2026-11-13, 메모 관리자). dir "x" = 세로선(좌우로 끎), "y" = 가로선(위아래로 끎).
// 보이는 선은 1px, 잡히는 범위는 PC 12px·터치 24px(앞뒤 칸에 겹쳐 놓아 자리를 차지하지 않음).
// 두 번 누르면(더블클릭·두 번 탭) onReset — 원래 크기로. 끄는 동안 화면 스크롤·글자 선택이 일어나지 않게 막는다.
export default function Splitter({ dir = "y", onMove, onEnd, onReset, label }) {
  const [active, setActive] = useState(false);
  const [hover, setHover] = useState(false);
  const lastTap = useRef(0); // 끌지 않고 눌렀다 뗀 시각 — 두 번 누르기 판단
  const moved = useRef(false);
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const hit = touch ? 24 : 12;
  const x = dir === "x";

  const down = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    if (Date.now() - lastTap.current < 350) { lastTap.current = 0; onReset?.(); return; }
    moved.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setActive(true);
  };
  const move = (e) => { if (active) { moved.current = true; onMove?.(x ? e.clientX : e.clientY); } };
  const up = (e) => {
    if (!active) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setActive(false);
    lastTap.current = moved.current ? 0 : Date.now();
    onEnd?.();
  };
  const on = active || hover;

  return (
    <div role="separator" aria-orientation={x ? "vertical" : "horizontal"} aria-label={label} title={`${label} — 두 번 누르면 원래대로`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", zIndex: 3, flexShrink: 0, touchAction: "none", userSelect: "none",
        cursor: x ? "col-resize" : "row-resize",
        ...(x ? { width: hit, margin: `0 -${(hit - 1) / 2}px`, alignSelf: "stretch" } : { height: hit, margin: `-${(hit - 1) / 2}px 0` }),
      }}>
      {/* 보이는 선 */}
      <div style={{
        position: "absolute", background: on ? "var(--dm-accent, #5B7CFA)" : "var(--dm-border)", transition: "background .15s",
        ...(x ? { top: 0, bottom: 0, left: "50%", width: on ? 2 : 1, transform: "translateX(-50%)" } : { left: 0, right: 0, top: "50%", height: on ? 2 : 1, transform: "translateY(-50%)" }),
      }} />
      {/* 잡는 손잡이 — 가로선은 늘 작게 보이고(어디를 끌지 알게), 세로선은 마우스를 올릴 때만 */}
      {(!x || on) && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", borderRadius: 999,
          background: on ? "var(--dm-accent, #5B7CFA)" : "var(--dm-muted)", opacity: on ? 1 : 0.55,
          ...(x ? { width: 4, height: 32 } : { width: 36, height: 4 }),
        }} />
      )}
    </div>
  );
}
