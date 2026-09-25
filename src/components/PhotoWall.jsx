import { useEffect, useMemo, useRef, useState } from "react";

const PAGE = 60; // 원본 크기 사진이라 한 번에 다 그리면 휴대폰이 느려짐 → 스크롤하며 60장씩 추가

const monthLabel = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;

// 인스타그램식 사진 모음 — 3열 정사각형, 월별 구분 줄, 누르면 해당 메모·일정으로 이동
export default function PhotoWall({ photos, query, onOpen }) {
  const [visible, setVisible] = useState(PAGE);
  const sentinelRef = useRef(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || visible >= photos.length) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) setVisible(v => v + PAGE);
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible, photos.length]);

  const groups = useMemo(() => {
    const out = [];
    photos.slice(0, visible).forEach(p => {
      const ym = p.ds.slice(0, 7);
      if (!out.length || out[out.length - 1].ym !== ym) out.push({ ym, items: [] });
      out[out.length - 1].items.push(p);
    });
    return out;
  }, [photos, visible]);

  if (!photos.length) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--dm-muted)", fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-line" }}>
        {query.trim() ? "검색어가 들어간 메모·일정에\n사진이 없어요." : "메모나 일정에 첨부한 사진이\n여기에 모여요."}
      </div>
    );
  }

  return (
    <div>
      {groups.map(({ ym, items }) => (
        <div key={ym} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)", padding: "6px 12px 8px" }}>{monthLabel(ym)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 }}>
            {items.map(p => (
              <button key={p.key} type="button" onClick={() => onOpen(p)}
                aria-label={p.kind === "memo" ? "메모 열기" : "일정 열기"}
                style={{ position: "relative", padding: 0, border: "none", aspectRatio: "1 / 1", overflow: "hidden", background: "var(--dm-input)", cursor: "pointer", borderRadius: 4 }}>
                <img src={p.url} alt="" loading="lazy" decoding="async"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <span style={{ position: "absolute", top: 4, right: 4, fontSize: 11, lineHeight: 1, background: "rgba(0,0,0,.5)", borderRadius: 6, padding: "3px 4px" }}>
                  {p.kind === "memo" ? "📝" : "📅"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {visible < photos.length && <div ref={sentinelRef} style={{ height: 1 }} />}
    </div>
  );
}
