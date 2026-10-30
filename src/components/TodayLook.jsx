import { useEffect, useState } from "react";

// 오늘 탭 새 화면 부품 (2026-10-30 2단계): 섹션 선 아이콘, 남은 할 일 막대, 스크롤 띠

// 하단 메뉴와 같은 가는 선 아이콘 — 섹션 제목의 입체 이모지 대신
const PATHS = {
  today: <><path d="M9 11l3 3 8-8" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" /><circle cx="17" cy="8" r="3" /><path d="M22 20c0-3.3-2.5-5.5-5-6" /></>,
  repeat: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 013-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 01-3 3H3" /></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13L22 12v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6z" /></>,
  cal: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14z" /><path d="M20 17v4H6.5A2.5 2.5 0 014 18.5" /></>,
};
export function SectionIcon({ name, size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>{PATHS[name]}</svg>
  );
}

// 할 일 수만큼 칸 — 끝낸 만큼 초록. 많으면(12개 넘음) 한 줄 막대
export function DoneSegments({ done, total, height = 5 }) {
  if (!total) return null;
  if (total > 12) {
    return (
      <div style={{ height, borderRadius: 9, background: "var(--dm-row)", overflow: "hidden" }}>
        <div style={{ width: `${(done / total) * 100}%`, height: "100%", background: "#4ADE80", transition: "width .3s" }} />
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} style={{ flex: 1, height, borderRadius: 9, background: i < done ? "#4ADE80" : "var(--dm-row)", transition: "background .3s" }} />
      ))}
    </div>
  );
}

// 머리글이 화면 밖으로 나가면 위에 "오늘 2/6 + 막대" 작은 띠. 페이지(html) 전체가 스크롤되므로 화면 맨 위에 고정(앱 폭 430px)
export function CompactBar({ watchRef, done, total }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = watchRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [watchRef]);
  return (
    <div aria-hidden={!show}>
      <div style={{
        position: "fixed", top: 0, left: "50%", width: "100%", maxWidth: 430, boxSizing: "border-box", zIndex: 50, display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
        background: "var(--dm-nav)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid var(--dm-border)",
        fontSize: 15, fontWeight: 800, color: "var(--dm-text)",
        transform: show ? "translateX(-50%)" : "translate(-50%, -100%)", opacity: show ? 1 : 0, transition: "transform .26s cubic-bezier(.2,.8,.2,1), opacity .2s", pointerEvents: "none",
      }}>
        <span style={{ whiteSpace: "nowrap" }}>오늘 {done}/{total}</span>
        <div style={{ flex: 1 }}><DoneSegments done={done} total={total} height={4} /></div>
      </div>
    </div>
  );
}
