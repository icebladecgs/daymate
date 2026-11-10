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
// 세력 지도처럼 땅을 꽉 채워 칠한다 (2026-11-09 사용자 요청 — "삼국지2처럼 색칠", 형식만 빌리고 그림·색은 직접)
// 빈 땅 = 지킴이 등급 색(은은하게), 사람 땅 = 진한 단색 + 굵은 테두리, 내 땅 = 초록 + 금색 테두리
const TIER_COLORS = { myeon: "#9BD46A", eup: "#F5CF4C", city: "#F59E4B", metro: "#F088B0", seoul: "#A98BF0", center: "#E5484D" };
const BASE_KEY = "dm_map_base"; // 바탕 지도 켜기/끄기 (기기마다, accountSwap DEVICE_KEYS)
const readBase = () => { try { return localStorage.getItem(BASE_KEY) !== "0"; } catch { return true; } };

function styleFor(own, name, selected) {
  const base = own
    ? (own.m
      ? { fillColor: MINE, fillOpacity: 0.85, color: "#FFD60A", weight: 2.5, opacity: 1 }
      : { fillColor: ownerColor(own.k), fillOpacity: 0.85, color: "#1F2937", weight: 1.6, opacity: 0.9 })
    : { fillColor: TIER_COLORS[regionTier(name)], fillOpacity: 0.6, color: "#ffffff", weight: 0.3, opacity: 0.35 };
  return selected ? { ...base, color: "#FF9F0A", weight: 3.5, opacity: 1 } : base;
}
// 이름표 자리 — 가장 큰 고리의 가운데(대략)
function centerOf(rings) {
  let best = rings[0], area = -1;
  for (const r of rings) {
    let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][1] + r[i][1]) * (r[j][0] - r[i][0]);
    if (Math.abs(a) > area) { area = Math.abs(a); best = r; }
  }
  let la0 = Infinity, la1 = -Infinity, ln0 = Infinity, ln1 = -Infinity;
  for (const [la, ln] of best) { la0 = Math.min(la0, la); la1 = Math.max(la1, la); ln0 = Math.min(ln0, ln); ln1 = Math.max(ln1, ln); }
  return [(la0 + la1) / 2, (ln0 + ln1) / 2];
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export default function TerritoryMap({ onClose }) {
  useBackClose(onClose);
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(new Map()); // 코드 → 다각형
  const selRef = useRef(null);
  const tileRef = useRef(null);
  const labelsRef = useRef(null);
  const sidoRef = useRef(null);
  const [baseOn, setBaseOn] = useState(readBase);
  const [view, setView] = useState(0); // 확대·이동할 때마다 +1 → 이름표 다시 그림
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
    // 바탕 지도는 흐리게(회색·연하게) — 땅 색이 돋보이게. 끄면 경계와 색만 남는 전략 지도
    tileRef.current = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, className: "dm-basemap", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    });
    if (readBase()) tileRef.current.addTo(map);
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution("행정동 경계 통계청 SGIS·admdongkor");
    labelsRef.current = L.layerGroup().addTo(map);
    map.on("zoomend moveend", () => setView((v) => v + 1));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; layersRef.current = new Map(); };
  }, []);

  // 바탕 지도 켜기/끄기
  useEffect(() => {
    const map = mapRef.current, tile = tileRef.current;
    if (!map || !tile) return;
    if (baseOn && !map.hasLayer(tile)) tile.addTo(map);
    if (!baseOn && map.hasLayer(tile)) tile.remove();
    try { localStorage.setItem(BASE_KEY, baseOn ? "1" : "0"); } catch { /* 이번엔 그대로 */ }
  }, [baseOn]);

  // 시·도 경계 굵은 선 (public/sido-lines.json — 이웃 동의 시·도가 다른 경계만 모은 선)
  useEffect(() => {
    let alive = true;
    fetch("/sido-lines.json").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const map = mapRef.current;
      if (!alive || !d || !map) return;
      const q = d.q || 1e4;
      if (!map.getPane("sido")) map.createPane("sido").style.zIndex = 450; // 땅(400) 위, 이름표(600) 아래
      const renderer = L.canvas({ padding: 0.3, pane: "sido" });
      const group = L.layerGroup();
      for (const ints of d.l) {
        const pts = []; let x = 0, y = 0;
        for (let i = 0; i < ints.length; i += 2) { x += ints[i]; y += ints[i + 1]; pts.push([y / q, x / q]); }
        L.polyline(pts, { renderer, color: "#1F2937", weight: 2.2, opacity: 0.75, interactive: false }).addTo(group);
      }
      group.addTo(map);
      sidoRef.current = group;
    }).catch(() => {});
    return () => { alive = false; };
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
      const poly = L.polygon(r.rings, { renderer, ...styleFor(own, r.n, false) });
      poly.on("click", () => setSel(r.c));
      poly.addTo(map);
      layers.set(r.c, poly);
    }
  }, [regions, owned, ownedByCode]);

  // 이름표 — 확대하면 주인 있는 땅에 🚩 닉네임(Lv.8~), 더 확대하면 빈 땅 동 이름(Lv.12~). 화면 안의 것만, 많으면 줄인다
  const centers = useMemo(() => new Map((regions || []).map((r) => [r.c, centerOf(r.rings)])), [regions]);
  useEffect(() => {
    const map = mapRef.current, group = labelsRef.current;
    if (!map || !group || !regions || !owned) return;
    group.clearLayers();
    const z = map.getZoom();
    const bounds = map.getBounds().pad(0.1);
    const inView = (c) => { const p = centers.get(c); return p && bounds.contains(p); };
    if (z >= 8) {
      let n = 0;
      for (const t of owned.list || []) {
        if (n >= 150 || !inView(t.c)) continue;
        n++;
        const color = t.m ? MINE : ownerColor(t.k);
        L.marker(centers.get(t.c), {
          interactive: false, keyboard: false,
          icon: L.divIcon({ className: "dm-flag", iconSize: null, html: `<span style="border-color:${color}">${t.m ? "👑" : "🚩"} ${esc(t.o)}</span>` }),
        }).addTo(group);
      }
    }
    if (z >= 12) {
      let n = 0;
      for (const r of regions) {
        if (n >= 120 || ownedByCode.has(r.c) || !inView(r.c)) continue;
        n++;
        L.marker(centers.get(r.c), { interactive: false, keyboard: false, icon: L.divIcon({ className: "dm-dong", iconSize: null, html: `<span>${esc(shortName(r.n))}</span>` }) }).addTo(group);
      }
    }
  }, [view, regions, owned, centers, ownedByCode]);

  // 고른 구역 강조
  useEffect(() => {
    const layers = layersRef.current;
    const prev = selRef.current;
    if (prev && layers.get(prev)) layers.get(prev).setStyle(styleFor(ownedByCode.get(prev), nameByCode.get(prev), false));
    if (sel && layers.get(sel)) { layers.get(sel).setStyle(styleFor(ownedByCode.get(sel), nameByCode.get(sel), true)); layers.get(sel).bringToFront(); }
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
          <button onClick={() => setBaseOn((v) => !v)} style={{ height: 34, padding: "0 12px", borderRadius: 999, border: "none", background: "#fff", color: "#111", fontSize: 13, fontWeight: 800, boxShadow: "0 2px 10px rgba(0,0,0,.25)", cursor: "pointer", fontFamily: "inherit" }}>
            {baseOn ? "🗺 바탕 지도 끄기" : "🗺 바탕 지도 켜기"}
          </button>
          <div style={{ background: "rgba(255,255,255,.94)", color: "#111", borderRadius: 10, padding: "6px 9px", fontSize: 12, lineHeight: 1.55, boxShadow: "0 2px 10px rgba(0,0,0,.2)" }}>
            <div><span style={{ color: MINE }}>■</span> 내 땅 {mineCount} · <span style={{ color: "#1F2937" }}>■</span> 남의 땅 {ownedCount - mineCount}</div>
            <div style={{ color: "#555", marginTop: 2 }}>빈 땅 지킴이</div>
            {[["myeon", "면 Lv1~5"], ["eup", "읍 4~9"], ["city", "시 동 7~12"], ["metro", "광역시 10~15"], ["seoul", "서울·세종 13~18"], ["center", "중심지 19~21"]].map(([k, l]) => (
              <div key={k}><span style={{ color: TIER_COLORS[k] }}>■</span> {l}</div>
            ))}
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
              {selOwn ? (selOwn.m ? <span style={{ color: MINE }}>👑 내 영토</span> : <span><span style={{ color: ownerColor(selOwn.k) }}>■</span> 🛡️ {selOwn.o}님의 영토{owned?.titles?.[selOwn.k] ? <span style={{ color: "#FF9F0A", marginLeft: 4 }}>「{owned.titles[selOwn.k]}」</span> : null}</span>)
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
              <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, color: r.mine ? MINE : "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}{r.mine ? " (나)" : ""}
                {/* 🏅 칭호 (2026-11-10) */}
                {r.title ? <div style={{ fontSize: 13, fontWeight: 800, color: "#FF9F0A", overflow: "hidden", textOverflow: "ellipsis" }}>「{r.title}」</div> : null}</div>
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
      <style>{`.leaflet-container{font-family:inherit;background:#cfdde9}.leaflet-control-attribution{font-size:10px}
.dm-basemap{filter:grayscale(1) contrast(.85) brightness(1.08);opacity:.5}
.dm-flag span{display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;background:rgba(255,255,255,.95);color:#111;font-size:12px;font-weight:900;padding:2px 7px;border-radius:999px;border:2px solid #333;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.dm-dong span{display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;color:#1F2937;font-size:11px;font-weight:700;text-shadow:0 0 3px #fff,0 0 3px #fff}`}</style>
    </div>,
    document.body,
  );
}

