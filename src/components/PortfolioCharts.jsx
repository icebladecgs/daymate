// 보유자산 차트 (2026-11-07) — 자산군 비중 막대 · 자산 추이 선 · 앞으로 12달 예상 배당 막대
// 색은 index.css --dm-viz-*(밝은·어두운 화면 각각 검증), 글자는 글자색 변수만 쓴다(차트 색으로 글자를 칠하지 않음).
// 금액은 부모가 넘긴 fmt로 쓰고, 숨기기(👁)를 켜면 MASK로 가린다. 비율(%)은 그대로.
import { useRef, useState } from "react";
import { MASK } from "../utils/portfolioExtras.js";

const TEXT = "var(--dm-text)", SUB = "var(--dm-sub)", MUTED = "var(--dm-muted)";
const LINE = "var(--dm-viz-1)";

// ── 자산군 비중: 한 줄 막대 + 아래 이름·%·금액 (밝은 화면 대비가 낮은 색이 있어 글자를 늘 함께 보인다) ──
export function AllocationBar({ parts, fmt, hidden }) {
  const [tip, setTip] = useState(null);
  if (!parts?.length) return null;
  return (
    <div>
      <div role="img" aria-label={`자산 비중: ${parts.map(p => `${p.name} ${p.pct.toFixed(0)}%`).join(", ")}`}
        style={{ display: "flex", gap: 2, height: 14, borderRadius: 4, overflow: "hidden" }}>
        {parts.map((p) => (
          <div key={p.id} title={`${p.name} ${p.pct.toFixed(1)}%`}
            onPointerEnter={() => setTip(p.id)} onPointerLeave={() => setTip(null)}
            style={{ flex: `${p.pct} 0 0`, minWidth: 3, background: p.color, opacity: tip && tip !== p.id ? 0.45 : 1, transition: "opacity .15s" }} />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
        {parts.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, fontSize: 14, color: SUB }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flexShrink: 0 }} />
            <span style={{ color: TEXT, fontWeight: 800, whiteSpace: "nowrap" }}>{p.name}</span>
            <span style={{ fontWeight: 800, color: TEXT }}>{p.pct.toFixed(0)}%</span>
            <span style={{ marginLeft: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hidden ? MASK : fmt(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 자산 추이 선 그래프 — mini는 My 탭용 작은 선(축·글자 없음) ──
export function TrendChart({ series, fmt, hidden, mini = false, height = 120 }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  if (!series || series.length < 2) {
    if (mini) return null;
    return (
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, padding: "10px 0", wordBreak: "keep-all" }}>
        기록이 쌓이면 그래프가 보여요. 오늘부터 앱을 연 날마다 하루 한 점씩 남아요.
      </div>
    );
  }
  const vals = series.map((s) => s.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < max * 0.002) { min -= max * 0.01; max += max * 0.01; } // 거의 평평하면 가운데로
  const pad = (max - min) * 0.08;
  min -= pad; max += pad;
  const W = 300, H = height;
  const x = (i) => (series.length === 1 ? W / 2 : (i / (series.length - 1)) * W);
  const y = (v) => H - ((v - min) / (max - min)) * H;
  const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.v).toFixed(1)}`).join(" ");
  const first = series[0].v, last = series[series.length - 1].v;
  const up = last >= first;

  const onMove = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.round(((e.clientX - r.left) / r.width) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  };
  const hp = hover != null ? series[hover] : null;
  const label = (ds) => `${Number(ds.slice(5, 7))}/${Number(ds.slice(8))}`;

  return (
    <div>
      <div ref={ref} style={{ position: "relative", height: H, touchAction: mini ? "auto" : "pan-y" }}
        onPointerMove={mini ? undefined : onMove} onPointerDown={mini ? undefined : onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} role="img"
          aria-label={`자산 추이 ${series.length}일, ${up ? "올랐어요" : "내렸어요"} (${(((last - first) / first) * 100).toFixed(1)}%)`} style={{ display: "block", overflow: "visible" }}>
          {!mini && [0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--dm-row)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <polygon points={`0,${H} ${pts} ${W},${H}`} fill={LINE} opacity="0.10" />
          <polyline points={pts} fill="none" stroke={LINE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hp && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--dm-muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* 점은 SVG 밖 HTML로 — 가로로 늘어난 SVG에서도 동그랗게 */}
        {(hp ? [hover] : [series.length - 1]).map((i) => (
          <span key={i} aria-hidden style={{ position: "absolute", left: `${(x(i) / W) * 100}%`, top: y(series[i].v), width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: "50%", background: LINE, boxShadow: "0 0 0 2px var(--dm-bg)" }} />
        ))}
        {hp && (
          <div style={{ position: "absolute", top: -6, left: `${(x(hover) / W) * 100}%`, transform: `translate(${hover > series.length / 2 ? "-100%" : "0"}, -100%)`, background: "var(--dm-text)", color: "var(--dm-bg)", borderRadius: 8, padding: "4px 8px", fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", pointerEvents: "none" }}>
            {label(hp.ds)} · {hidden ? MASK : fmt(hp.v)}
          </div>
        )}
      </div>
      {!mini && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 13, color: MUTED }}>
          <span>{label(series[0].ds)}</span>
          <span style={{ color: SUB }}>최고 {hidden ? MASK : fmt(Math.max(...vals))} · 최저 {hidden ? MASK : fmt(Math.min(...vals))}</span>
          <span>{label(series[series.length - 1].ds)}</span>
        </div>
      )}
    </div>
  );
}

// ── 앞으로 12달 예상 배당 (월별 막대) ──
export function DividendMonths({ months, fmt, hidden }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...months.map((m) => m.v), 0);
  if (!(max > 0)) return null;
  const H = 90;
  return (
    <div>
      <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 2, height: H, borderBottom: "1px solid var(--dm-row)" }}
        onPointerLeave={() => setHover(null)}>
        {months.map((m, i) => (
          <div key={m.ym} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}
            style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", cursor: "default" }}>
            {m.v > 0 && (
              <div title={`${m.label} ${hidden ? MASK : fmt(m.v)}`}
                style={{ width: "70%", maxWidth: 18, height: `${Math.max(4, (m.v / max) * (H - 4))}px`, background: LINE, borderRadius: "4px 4px 0 0", opacity: hover != null && hover !== i ? 0.45 : 1 }} />
            )}
          </div>
        ))}
        {hover != null && months[hover].v > 0 && (
          <div style={{ position: "absolute", top: -4, left: `${((hover + 0.5) / 12) * 100}%`, transform: `translate(${hover > 6 ? "-100%" : "-10%"}, -100%)`, background: "var(--dm-text)", color: "var(--dm-bg)", borderRadius: 8, padding: "4px 8px", fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", pointerEvents: "none" }}>
            {months[hover].label} · {hidden ? MASK : fmt(months[hover].v)}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
        {months.map((m) => (
          <span key={m.ym} style={{ flex: 1, textAlign: "center", fontSize: 13, color: m.v > 0 ? SUB : MUTED, fontWeight: m.v > 0 ? 800 : 400 }}>{Number(m.ym.slice(5))}</span>
        ))}
      </div>
    </div>
  );
}
