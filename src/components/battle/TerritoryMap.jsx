import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { UI } from "../../styles.js";
import { regionTier, keeperLevel, keeperDef, fameRate, shortName, TIERS } from "../../utils/territory.js";
import { ATTRIBUTION, readOk, markOk, getPosition, territoryCall, loadMapRegions, ownerColor } from "../../utils/territoryClient.js";
import { useBackClose } from "../../utils/useBackClose.js";
import { ConsentSheet } from "./TerritoryPanel.jsx";

// 🗺️ 전국 지도 · 🏆 영토 순위 (2026-11-09 사용자 요청 — "배틀 전에 지도를 보며 누구 땅인지 보고 싶다", A안: Leaflet + OpenStreetMap 바탕)
// 경계는 public/regions-map.json(지도를 열 때만 받음), 주인 정보는 서버(territory-all — 계정 id 대신 색 키·닉네임만).
// 지도는 보기만 — 도전은 그 동에 있을 때 영토 칸에서. 큰 글씨(zoom)가 걸린 .dm-phone 밖(body)에 그린다(안에 그리면 누른 위치가 어긋남).
const KOREA = [[32.9, 124.4], [38.75, 131.2]];
const MINE = "#30D158";

function styleFor(own, level, selected) {
  const base = own
    ? { fillColor: own.m ? MINE : ownerColor(own.k), fillOpacity: 0.55, color: own.m ? "#0a7a2a" : "#333", weight: 0.8, opacity: 0.6 }
    : { fillColor: "#6B7280", fillOpacity: 0.04 + level * 0.016, color: "#6B7280", weight: 0.4, opacity: 0.35 };
  return selected ? { ...base, color: "#FF9F0A", weight: 3, opacity: 1 } : base;
}

export default function TerritoryMap({ onClose }) {
  useBackClose(onClose);
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(new Map()); // 코드 → 다각형
  const selRef = useRef(null);
  const [tab, setTab] = useState("map");
  const [regions, setRegions] = useState(null);
  const [owned, setOwned] = useState(null); // { list, ranking }
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null); // 고른 구역 코드
  const [locating, setLocating] = useState(false);
  const [consent, setConsent] = useState(false);
  const [now] = useState(() => Date.now()); // 며칠째 계산용 (열 때 한 번)

  useEffect(() => {
    loadMapRegions().then(setRegions).catch((e) => setErr(e.message));
    territoryCall("territory-all").then(setOwned).catch(() => setOwned({ list: [], ranking: [] }));
  }, []);
  const ownedByCode = useMemo(() => new Map((owned?.list || []).map((t) => [t.c, t])), [owned]);
  const nameByCode = useMemo(() => new Map((regions || []).map((r) => [r.c, r.n])), [regions]);

  // 지도 만들기 (한 번)
  useEffect(() => {
    if (!boxRef.current || mapRef.current) return undefined;
    const map = L.map(boxRef.current, { preferCanvas: true, zoomControl: true, minZoom: 6, maxZoom: 16, maxBounds: [[31.5, 122.5], [39.8, 133]], attributionControl: true });
    map.fitBounds(KOREA);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · 행정동 경계 통계청 SGIS·admdongkor',
    }).addTo(map);
    map.attributionControl.setPrefix(false);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; layersRef.current = new Map(); };
  }, []);

  // 구역 그리기 — 경계·주인 정보가 오면
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !regions || !owned) return;
    const renderer = L.canvas({ padding: 0.3 });
    const layers = layersRef.current;
    layers.forEach((l) => l.remove());
    layers.clear();
    for (const r of regions) {
      const own = ownedByCode.get(r.c);
      const poly = L.polygon(r.rings, { renderer, ...styleFor(own, keeperLevel(r.c, r.n), false) });
      poly.on("click", () => setSel(r.c));
      poly.addTo(map);
      layers.set(r.c, poly);
    }
  }, [regions, owned, ownedByCode]);

  // 고른 구역 강조
  useEffect(() => {
    const layers = layersRef.current;
    const prev = selRef.current;
    if (prev && layers.get(prev)) layers.get(prev).setStyle(styleFor(ownedByCode.get(prev), keeperLevel(prev, nameByCode.get(prev)), false));
    if (sel && layers.get(sel)) { layers.get(sel).setStyle(styleFor(ownedByCode.get(sel), keeperLevel(sel, nameByCode.get(sel)), true)); layers.get(sel).bringToFront(); }
    selRef.current = sel;
  }, [sel, ownedByCode, nameByCode]);

  // 지도 탭으로 돌아오면 크기 다시 재기
  useEffect(() => { if (tab === "map") setTimeout(() => mapRef.current?.invalidateSize(), 50); }, [tab]);

  const locate = async () => {
    if (!readOk()) { setConsent(true); return; }
    setErr(""); setLocating(true);
    try {
      const pos = await getPosition();
      const j = await territoryCall("territory-here", pos);
      setSel(j.region.code);
      const l = layersRef.current.get(j.region.code);
      if (l) mapRef.current?.flyToBounds(l.getBounds(), { maxZoom: 13, duration: 0.8 });
    } catch (e) { setErr(e.message); }
    setLocating(false);
  };

  const selName = sel ? nameByCode.get(sel) : null;
  const selOwn = sel ? ownedByCode.get(sel) : null;
  const selLevel = sel && selName ? keeperLevel(sel, selName) : null;
  const ownedCount = owned?.list?.length || 0;
  const mineCount = (owned?.list || []).filter((t) => t.m).length;
  const tabBtn = (id, label) => (
    <button onClick={() => setTab(id)} style={{ flex: 1, height: 36, padding: 0, borderRadius: 10, border: "none", fontFamily: "inherit", fontSize: 15, fontWeight: 900, cursor: "pointer",
      background: tab === id ? UI.accent : "var(--dm-input)", color: tab === id ? "#fff" : "var(--dm-sub)" }}>{label}</button>
  );

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "var(--dm-bg)", display: "flex", flexDirection: "column", color: "var(--dm-text)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--dm-border)", maxWidth: 760, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <button onClick={onClose} aria-label="닫기" style={{ background: "transparent", border: "none", color: "var(--dm-text)", fontSize: 22, cursor: "pointer", padding: 0, width: 32 }}>←</button>
        {tabBtn("map", "🗺️ 전국 지도")}
        {tabBtn("rank", "🏆 영토 순위")}
      </div>

      {/* 지도 — 순위 탭에서도 지우지 않고 숨긴다(다시 그리지 않게) */}
      <div style={{ flex: 1, position: "relative", display: tab === "map" ? "block" : "none" }}>
        <div ref={boxRef} style={{ position: "absolute", inset: 0, background: "#dfe7ee" }} />
        {(!regions || !owned) && !err && <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 1000, background: "rgba(0,0,0,.7)", color: "#fff", padding: "6px 12px", borderRadius: 999, fontSize: 13 }}>지도 불러오는 중…</div>}
        {/* 위쪽: 범례·내 위치 */}
        <div style={{ position: "absolute", top: 10, right: 10, zIndex: 1000, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <button onClick={locate} disabled={locating} style={{ height: UI.touch, padding: "0 14px", borderRadius: 999, border: "none", background: "#fff", color: "#111", fontSize: 14, fontWeight: 900, boxShadow: "0 2px 10px rgba(0,0,0,.25)", cursor: "pointer", fontFamily: "inherit" }}>
            {locating ? "확인 중…" : "📍 내 위치"}
          </button>
          <div style={{ background: "rgba(255,255,255,.92)", color: "#111", borderRadius: 10, padding: "6px 9px", fontSize: 12, lineHeight: 1.6, boxShadow: "0 2px 10px rgba(0,0,0,.2)" }}>
            <div><span style={{ color: MINE }}>■</span> 내 땅 {mineCount}</div>
            <div><span style={{ color: "#E4572E" }}>■</span> 남의 땅 {ownedCount - mineCount}</div>
            <div><span style={{ color: "#9CA3AF" }}>■</span> 빈 땅 (진할수록 강함)</div>
          </div>
        </div>
        {err && <div style={{ position: "absolute", top: 12, left: 12, right: 150, zIndex: 1000, background: "rgba(255,69,58,.95)", color: "#fff", padding: "8px 12px", borderRadius: 10, fontSize: 13 }}>{err}</div>}

        {/* 고른 구역 카드 */}
        {sel && selName && (
          <div style={{ position: "absolute", left: 10, right: 10, bottom: 18, zIndex: 1000, maxWidth: 480, margin: "0 auto", background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: 16, padding: 14, boxShadow: "0 6px 24px rgba(0,0,0,.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 900 }}>{shortName(selName)}</div>
                <div style={{ fontSize: 13, color: "var(--dm-muted)" }}>{selName.split(" ").slice(0, -1).join(" ")} · {TIERS[regionTier(selName)].label} · 땅 Lv.{selLevel} · 하루 명성 +{fameRate(selLevel)}</div>
              </div>
              <button onClick={() => setSel(null)} aria-label="닫기" style={{ background: "none", border: "none", color: "var(--dm-muted)", fontSize: 18, cursor: "pointer", padding: 0, width: 28, height: 28, flexShrink: 0 }}>✕</button>
            </div>
            <div style={{ marginTop: 10, fontSize: 15, fontWeight: 800 }}>
              {selOwn ? (selOwn.m ? <span style={{ color: MINE }}>👑 내 영토</span> : <span><span style={{ color: ownerColor(selOwn.k) }}>■</span> 🛡️ {selOwn.o}님의 영토</span>)
                : <span>{keeperDef(sel, selName).emoji} 지킴이 Lv.{selLevel} {keeperDef(sel, selName).name}</span>}
            </div>
            {selOwn && (
              <div style={{ fontSize: 13, color: "var(--dm-sub)", marginTop: 3 }}>
                {selOwn.t ? `${Math.max(1, Math.floor((now - selOwn.t) / 86400000) + 1)}일째` : ""}{selOwn.d ? ` · ${selOwn.d}번 지켜 냄` : ""}
              </div>
            )}
            <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 8 }}>도전은 이 동에 있을 때 배틀 화면 영토 칸에서 할 수 있어요</div>
          </div>
        )}
      </div>

      {tab === "rank" && (
        <div style={{ flex: 1, overflowY: "auto", padding: `14px ${UI.gutter}px 30px`, maxWidth: 640, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          <div style={{ fontSize: 13, color: "var(--dm-muted)", marginBottom: 10 }}>주인 있는 땅 {ownedCount.toLocaleString()} / {(regions?.length || 3559).toLocaleString()} · 땅 수 → 영토 명성 순</div>
          {!owned && <div style={{ color: "var(--dm-muted)", fontSize: 14 }}>불러오는 중…</div>}
          {owned && owned.ranking.length === 0 && <div style={{ color: "var(--dm-muted)", fontSize: 15, padding: "30px 0", textAlign: "center" }}>아직 영토를 가진 사람이 없어요. 첫 영주가 되어 보세요!</div>}
          {(owned?.ranking || []).map((r, i) => (
            <div key={r.k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--dm-row)" }}>
              <div style={{ width: 30, textAlign: "center", fontSize: i < 3 ? 22 : 15, fontWeight: 900, color: "var(--dm-muted)" }}>{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</div>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: r.mine ? MINE : ownerColor(r.k), flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, color: r.mine ? MINE : "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}{r.mine ? " (나)" : ""}</div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{r.count}곳</div>
                <div style={{ fontSize: 13, color: "var(--dm-muted)" }}>명성 {r.fame.toLocaleString()}</div>
              </div>
            </div>
          ))}
          <div style={{ fontSize: UI.sub, color: "var(--dm-muted)", marginTop: 16, lineHeight: 1.5 }}>{ATTRIBUTION} · 바탕 지도 © OpenStreetMap</div>
        </div>
      )}
      {consent && <ConsentSheet onTop onClose={() => setConsent(false)} onOk={() => { markOk(); setConsent(false); setTimeout(locate, 0); }} />}
      <style>{`.leaflet-container{font-family:inherit}.leaflet-control-attribution{font-size:10px}`}</style>
    </div>,
    document.body,
  );
}

