import { useLayoutEffect, useRef } from "react";

// 줄 순서·높이가 바뀌면 이전 자리에서 새 자리로 미끄러지게 (FLIP).
// offsetTop은 큰글씨 zoom 전 단위라 translate와 단위가 같다(getBoundingClientRect는 확대된 값이라 쓰지 않음).
export function useFlip(containerRef) {
  const prev = useRef(null);
  useLayoutEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    const els = [...box.querySelectorAll("[data-flip-id]")];
    const next = new Map(els.map(el => [el.dataset.flipId, el.offsetTop]));
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prev.current && !reduce) {
      els.forEach(el => {
        const before = prev.current.get(el.dataset.flipId);
        const dy = before == null ? 0 : before - el.offsetTop;
        if (Math.abs(dy) > 1 && el.animate) {
          el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" });
        }
      });
    }
    prev.current = next;
  });
}
