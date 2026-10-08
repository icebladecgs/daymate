import { useEffect, useState } from "react";
import { linkRanges } from "../utils/links.js";

// 입력칸(textarea) 위에 얹는 투명한 층 — 글 속 링크 자리에만 연한 파란 바탕·밑줄을 그린다 (2026-10-08).
// 입력칸 안의 글자는 한 가지 색이라 링크만 파랗게 할 수 없어서, 같은 글꼴·여백·줄바꿈으로 겹쳐 그린다.
// 글꼴·여백은 입력칸의 실제 계산값을 읽어 맞춘다(큰 글씨 zoom·창 크기가 바뀌어도 제자리).
// 클릭은 통과시킨다(pointer-events: none) — 여는 건 Ctrl+클릭(openLinkOnCtrlClick)이나 🔗 버튼.
// 쓰는 쪽: 입력칸을 position:relative 상자 안에 두고 같은 상자에 <LinkOverlay taRef text />를 넣는다.
export default function LinkOverlay({ taRef, text }) {
  const ranges = linkRanges(text);
  const [box, setBox] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const has = ranges.length > 0;

  useEffect(() => {
    const ta = taRef.current;
    if (!ta || !has) return;
    const measure = () => {
      const cs = getComputedStyle(ta);
      setBox({
        left: ta.offsetLeft + ta.clientLeft, top: ta.offsetTop + ta.clientTop, width: ta.clientWidth, height: ta.clientHeight,
        padding: cs.padding, font: cs.font, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing,
        wordBreak: cs.wordBreak, overflowWrap: cs.overflowWrap, tabSize: cs.tabSize,
      });
      setScrollTop(ta.scrollTop);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ta);
    const onScroll = () => setScrollTop(ta.scrollTop);
    ta.addEventListener("scroll", onScroll);
    return () => { ro.disconnect(); ta.removeEventListener("scroll", onScroll); };
  }, [taRef, has, text]);

  if (!has || !box) return null;
  const parts = [];
  let at = 0;
  ranges.forEach((r, i) => {
    parts.push(text.slice(at, r.start));
    parts.push(<mark key={i} style={{ color: "transparent", background: "rgba(108,142,255,.16)", textDecoration: "underline", textDecorationColor: "#6C8EFF", textUnderlineOffset: 2, borderRadius: 2 }}>{text.slice(r.start, r.end)}</mark>);
    at = r.end;
  });
  parts.push(text.slice(at) + "\n");
  return (
    <div aria-hidden style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{ transform: `translateY(${-scrollTop}px)`, padding: box.padding, font: box.font, lineHeight: box.lineHeight, letterSpacing: box.letterSpacing,
        whiteSpace: "pre-wrap", wordBreak: box.wordBreak, overflowWrap: box.overflowWrap, tabSize: box.tabSize, color: "transparent", boxSizing: "border-box", width: "100%" }}>
        {parts}
      </div>
    </div>
  );
}
