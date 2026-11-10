import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import S, { UI, boxCard } from "../../styles.js";
import { newDesignOn } from "../../utils/todayLook.js";
import { chatFetch } from "../../api/chatFetch.js";
import { RARITIES, BAG_MAX, itemEffects, normalizeGear } from "../../utils/gear.js";
import { fameRate, territoryFame, shortName, TRIES_PER_DAY } from "../../utils/territory.js";
import { useBackClose } from "../../utils/useBackClose.js";
import TerritoryReplay from "./TerritoryReplay.jsx";
const TerritoryMap = lazy(() => import("./TerritoryMap.jsx")); // 지도 도구(Leaflet)는 지도를 열 때만 받는다

// 🗺️ 내 동네 영토 (2026-11-09, CLAUDE.md "영토 확장 계획") — 배틀 화면 위쪽 칸.
// 위치는 "확인"·"도전"을 누를 때만 한 번 읽어 서버에 보내고, 서버는 어느 동인지만 찾는다(위치는 저장하지 않음).
// 승패·소유는 서버가 정한다(api/chat.js?action=territory-*). 이 화면은 결과를 보여 주고 받은 장비를 가방에 넣기만 한다.
import { ATTRIBUTION, readOk, markOk, getPosition, territoryCall as call } from "../../utils/territoryClient.js";
const daysHeld = (ms) => (ms ? Math.max(1, Math.floor((Date.now() - ms) / 86400000) + 1) : 1);

export function ConsentSheet({ onOk, onClose, onTop = false }) {
  useBackClose(onClose);
  // 전국 지도(body 위, zIndex 2000) 위에서 열 때는 onTop
  const target = (!onTop && document.querySelector(".dm-phone")) || document.body;
  const p = { fontSize: 14, color: "var(--dm-text)", lineHeight: 1.6, marginBottom: 8 };
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: onTop ? 2100 : 310, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: "var(--dm-bg)", borderRadius: 18, border: "1px solid var(--dm-border)", padding: "20px 20px 16px" }}>
        <div style={{ fontSize: 17, fontWeight: 900, color: "var(--dm-text)", marginBottom: 10 }}>📍 위치 사용 안내</div>
        <div style={p}>영토는 <b>지금 있는 읍·면·동</b>에서만 도전할 수 있어요.</div>
        <div style={p}>• <b>확인·도전을 누를 때만</b> 위치를 한 번 읽어요 (계속 따라다니지 않아요)</div>
        <div style={p}>• 서버는 <b>어느 동인지만</b> 찾고, 위치(좌표)는 <b>저장하지 않아요</b></div>
        <div style={p}>• 내가 차지한 땅의 <b>동 이름</b>과 배틀 닉네임은 다른 사람에게 보여요</div>
        <button onClick={onOk} style={{ ...S.btn, marginTop: 6, marginBottom: 8 }}>알겠어요</button>
        <button onClick={onClose} style={{ ...S.btnGhost, marginTop: 0 }}>취소</button>
      </div>
    </div>,
    target,
  );
}

export default function TerritoryPanel({ loggedIn, gear, setGear, nickname }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [here, setHere] = useState(null); // territory-here 결과
  const [result, setResult] = useState(null); // territory-challenge 결과
  const [mine, setMine] = useState(null); // 내 영토 목록
  const [consent, setConsent] = useState(null); // 동의 뒤 할 일 ('here' | 'challenge')
  const [showLog, setShowLog] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [replay, setReplay] = useState(null); // 도전 결과를 지금 배틀의 전투 장면으로 다시 보기

  const loadMine = () => { if (loggedIn) call("territory-mine").then((j) => setMine(j.list || [])).catch(() => setMine([])); };
  useEffect(loadMine, [loggedIn]);

  const withConsent = (what) => { if (readOk()) run(what); else setConsent(what); };
  const run = async (what) => {
    setErr(""); setBusy(what === "here" ? "위치 확인 중…" : "싸우는 중…");
    try {
      const pos = await getPosition();
      if (what === "here") { setHere(await call("territory-here", pos)); setResult(null); }
      else {
        const j = await call("territory-challenge", pos);
        setResult(j); setShowLog(false);
        if (j.frames?.length) setReplay(j);
        setHere((h) => (h ? { ...h, triesLeft: j.triesLeft, defender: j.captured ? { ...h.defender, mine: true } : h.defender } : h));
        // 이겨서 차지하면: 보상 장비를 가방에 넣고, 빼앗긴 사람에게 알림
        if (j.won && j.captured) {
          if (j.reward) {
            const g = normalizeGear(gear);
            if (g.items.length < BAG_MAX) setGear?.((cur) => { const c = normalizeGear(cur); return c.items.length < BAG_MAX ? { ...c, items: [...c.items, { ...j.reward, at: new Date().toISOString().slice(0, 10) }] } : c; });
            else setResult({ ...j, bagFull: true });
          }
          if (j.lostFrom) chatFetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "territory", code: j.region.code }) }).catch(() => {});
          loadMine();
        }
      }
    } catch (e) { setErr(e.message); }
    setBusy("");
  };

  const fame = territoryFame(mine || []);
  const head = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 };
  const sub = { fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.5 };
  const d = here?.defender;

  return (
    <div style={{ ...boxCard, border: "1.5px solid rgba(48,176,199,.45)" }}>
      <div style={head}>
        <span style={{ fontSize: newDesignOn() ? UI.title : 17, fontWeight: 900, color: "var(--dm-text)", whiteSpace: "nowrap", flexShrink: 0 }}>🗺️ 내 동네 영토</span>
        {mine && mine.length > 0 && <span style={{ fontSize: 13, fontWeight: 800, color: "#30B0C7" }}>{mine.length}곳 · 영토 명성 {fame.toLocaleString()}</span>}
      </div>

      {!loggedIn ? (
        <div style={sub}>로그인하면 지금 있는 동네의 지킴이에게 도전해 영토를 차지할 수 있어요.</div>
      ) : (
        <>
          {!here && <div style={{ ...sub, marginBottom: 10 }}>지금 있는 읍·면·동의 지킴이를 이기면 그 땅이 내 영토가 돼요. 내가 이긴 그때의 모습이 그 땅을 지켜요.</div>}
          {here && d && (
            <div style={{ background: "var(--dm-input)", borderRadius: 14, padding: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: "var(--dm-muted)" }}>📍 {here.region.name.split(" ").slice(0, -1).join(" ")} · {here.region.tierLabel} · 땅 Lv.{here.region.level} · 하루 명성 +{fameRate(here.region.level)}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "var(--dm-text)", marginTop: 4 }}>{shortName(here.region.name)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                <span style={{ fontSize: 30 }}>{d.emoji}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: d.mine ? "#30D158" : "var(--dm-text)" }}>
                    {d.mine ? "👑 내 영토" : d.isOwner ? `🛡️ ${d.name}님의 영토` : `Lv.${d.level} ${d.name}`}
                {d.isOwner && !d.mine && d.title ? <span style={{ color: "#FF9F0A", marginLeft: 4 }}>「{d.title}」</span> : null}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--dm-sub)" }}>
                    {d.isOwner && !d.mine ? `Lv.${d.level} · ` : ""}Energy {Number(d.energyMax || 0).toLocaleString()}{d.trait ? ` · 「${d.trait}」` : ""}
                    {d.isOwner && d.defenses > 0 ? ` · ${d.defenses}번 지켜 냄` : ""}
                  </div>
                </div>
              </div>
              {!d.mine && <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 8 }}>오늘 남은 도전 {here.triesLeft}/{TRIES_PER_DAY} · 자동 배틀로 겨뤄요</div>}
            </div>
          )}

          {result && (
            <div style={{ borderRadius: 14, padding: 12, marginBottom: 10, background: result.won ? "rgba(48,209,88,.12)" : "rgba(255,69,58,.10)" }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: result.won ? "#30D158" : "#FF453A" }}>
                {result.won ? (result.captured ? `🎉 ${shortName(result.region.name)}을(를) 차지했어요!` : "🎉 이겼어요") : "💧 졌어요"}
              </div>
              <div style={{ ...sub, marginTop: 4 }}>
                {result.rounds}라운드
                {result.note ? ` · ${result.note}` : ""}
                {result.won && result.captured ? " · 지금 내 모습이 이 땅을 지켜요" : ""}
                {!result.won ? ` · 오늘 남은 도전 ${result.triesLeft}번` : ""}
              </div>
              {result.reward && !result.bagFull && (
                <div style={{ marginTop: 6, fontSize: 14 }}>
                  🎁 <b style={{ color: RARITIES[result.reward.rarity]?.color }}>[{RARITIES[result.reward.rarity]?.label}] {result.reward.name}</b>
                  <span style={{ color: "var(--dm-sub)" }}> {itemEffects(result.reward).join(" · ")}</span>
                </div>
              )}
              {result.bagFull && <div style={{ marginTop: 6, fontSize: 13, color: "#FF9F0A" }}>🎒 가방이 꽉 차서 보상 장비를 못 받았어요</div>}
              {result.frames?.length > 0 && <button onClick={() => setReplay(result)} style={{ background: "none", border: "none", padding: 0, marginTop: 6, marginRight: 14, color: UI.accent, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🎬 전투 다시 보기</button>}
              <button onClick={() => setShowLog((v) => !v)} style={{ background: "none", border: "none", padding: 0, marginTop: 6, color: UI.accent, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                전투 기록 {showLog ? "접기 ▲" : "보기 ▼"}
              </button>
              {showLog && (
                <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 6, fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.55 }}>
                  {(result.log || []).filter((e) => e.text).slice(-40).map((e, i) => <div key={i}>{e.text}</div>)}
                </div>
              )}
            </div>
          )}

          {err && <div style={{ fontSize: 13, color: "#FF453A", marginBottom: 8, lineHeight: 1.5 }}>{err}</div>}

          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={!!busy} onClick={() => withConsent("here")} style={{ ...S.btnGhost, flex: 1, marginTop: 0, minHeight: UI.touch }}>
              {busy === "위치 확인 중…" ? busy : here ? "📍 다시 확인" : "📍 지금 있는 곳 확인"}
            </button>
            {here && d && !d.mine && (
              <button disabled={!!busy || here.triesLeft <= 0} onClick={() => withConsent("challenge")}
                style={{ ...S.btn, flex: 1, marginTop: 0, minHeight: UI.touch, opacity: here.triesLeft <= 0 ? 0.5 : 1 }}>
                {busy === "싸우는 중…" ? busy : "⚔️ 도전"}
              </button>
            )}
          </div>
          {/* 🗺️ 전국 지도 · 영토 순위 (2026-11-09) — 누구 땅인지 보고 갈 곳을 고른다 */}
          <button onClick={() => setShowMap(true)} style={{ ...S.btnGhost, marginTop: 8, minHeight: UI.touch, color: "#30B0C7", borderColor: "rgba(48,176,199,.45)" }}>
            🗺️ 전국 지도 · 🏆 영토 순위
          </button>

          {mine && mine.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: "var(--dm-text)", marginBottom: 6 }}>🏰 내 영토</div>
              {mine.slice(0, 30).map((t) => (
                <div key={t.code} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--dm-row)", fontSize: 14 }}>
                  <span style={{ color: "var(--dm-text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {shortName(t.name)} <span style={{ color: "var(--dm-muted)", fontSize: 13 }}>{t.name.split(" ").slice(0, -1).join(" ")}</span>
                  </span>
                  <span style={{ color: "var(--dm-sub)", fontSize: 13, flexShrink: 0 }}>Lv.{t.level} · {daysHeld(t.capturedAtMs)}일째{t.defenses ? ` · 🛡${t.defenses}` : ""}</span>
                </div>
              ))}
              <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 6, lineHeight: 1.5 }}>영토 명성은 가진 땅마다 하루씩 쌓여요. 땅을 잃으면 그 땅 몫도 사라져요.</div>
            </div>
          )}
          <div style={{ fontSize: UI.sub, color: "var(--dm-muted)", marginTop: 10, lineHeight: 1.4 }}>{ATTRIBUTION}</div>
        </>
      )}
      {showMap && <Suspense fallback={null}><TerritoryMap onClose={() => setShowMap(false)} /></Suspense>}
      {replay && <TerritoryReplay result={replay} playerLabel={String(nickname || "").trim() || "나"} onClose={() => setReplay(null)} />}
      {consent && <ConsentSheet onClose={() => setConsent(null)} onOk={() => { markOk(); const w = consent; setConsent(null); run(w); }} />}
    </div>
  );
}
