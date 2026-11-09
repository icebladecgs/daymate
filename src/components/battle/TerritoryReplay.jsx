import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import S, { UI } from "../../styles.js";
import BattleStage from "./BattleStage.jsx";
import { tierOfLevel } from "./armor.js";
import { SPECIALS_TIER10 } from "../../data/battle/specials.js";
import { useBackClose } from "../../utils/useBackClose.js";

// 🗺️ 영토 전투 다시 보기 (2026-11-09 사용자 요청 — "현재 있는 싸움 화면을 이용") — 승패는 서버가 이미 냈고,
// 서버가 보낸 기록 한 줄씩(frames: { e: 기록, p/n: 그 직후 양쪽 상태 })을 지금 배틀의 전투 장면(BattleStage)에 차례로 넣는다.
// 한 줄이 끝나면(onBusyChange false) 다음 줄. 에너지 막대는 그 줄 직후 상태로 맞춘다(막대는 0.25초 늦게 움직여 맞는 순간과 맞음).
const iconOf = (e) => {
  const special = e.special || ["heal", "shield", "buff"].includes(e.kind);
  return special ? Object.values(SPECIALS_TIER10).find((x) => x.name === e.move)?.icon : undefined;
};
const fighter = (base, st) => ({
  level: base.level, energyMax: base.energyMax,
  energy: st ? st.energy : base.energyMax, shield: st?.shield ? { amount: 1 } : null, critGuaranteed: !!st?.crit,
});

export default function TerritoryReplay({ result, playerLabel = "나", onClose }) {
  useBackClose(onClose);
  const frames = result.frames || [];
  const f = result.fighters || { player: { level: 1, energyMax: 1 }, npc: { level: 1, energyMax: 1, name: "지킴이" } };
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(true);
  const [skipped, setSkipped] = useState(false);
  const onBusy = useCallback((b) => setBusy(b), []);
  const done = skipped || (idx >= frames.length && !busy);

  // 한 줄 재생이 끝나면 다음 줄
  useEffect(() => {
    if (skipped || busy || idx >= frames.length) return undefined;
    const t = setTimeout(() => setIdx((i) => i + 1), idx === 0 ? 400 : 80);
    return () => clearTimeout(t);
  }, [busy, idx, frames.length, skipped]);

  const shownIdx = skipped ? frames.length : idx;
  const last = shownIdx > 0 ? frames[shownIdx - 1] : null;
  const events = skipped ? [] : frames.slice(0, idx).map((fr, i) => ({ key: i, entry: fr.e, icon: iconOf(fr.e) }));
  const player = fighter(f.player, last?.p);
  const npc = fighter(f.npc, last?.n);
  const round = last?.e?.round || (last ? null : 1);

  const target = document.querySelector(".dm-phone") || document.body;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "var(--dm-bg)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ ...S.topbar, position: "sticky", top: 0 }}>
        <button onClick={onClose} aria-label="닫기" style={{ background: "transparent", border: "none", color: "var(--dm-text)", fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, marginLeft: 8, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>⚔️ {f.npc.name}</div>
          <div style={{ fontSize: 13, color: "var(--dm-muted)" }}>🗺️ {result.region?.name?.split(" ").pop()} 영토전 · 자동 배틀</div>
        </div>
      </div>

      <div style={{ padding: "12px 0 0" }}>
        <BattleStage events={events} player={player} npc={npc} playerLabel={playerLabel} npcLabel={f.npc.name}
          npcEmoji={f.npc.emoji} playerTier={tierOfLevel(f.player.level)} onBusyChange={onBusy} />
      </div>

      <div style={{ padding: `0 ${UI.gutter}px 24px` }}>
        {!done ? (
          <>
            <div style={{ textAlign: "center", fontSize: 13, color: "var(--dm-muted)", margin: "4px 0 12px" }}>
              {[round ? `${round}라운드` : "", `${Math.min(idx, frames.length)} / ${frames.length}`].filter(Boolean).join(" · ")}
            </div>
            <button onClick={() => setSkipped(true)} style={{ ...S.btnGhost, marginTop: 0, minHeight: UI.touch }}>⏭ 결과 바로 보기</button>
          </>
        ) : (
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <div style={{ fontSize: 34 }}>{result.won ? "🎉" : "💧"}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: result.won ? "#30D158" : "#FF453A", marginTop: 4 }}>
              {result.won ? (result.captured ? `${result.region?.name?.split(" ").pop()}을(를) 차지했어요!` : "이겼어요") : "졌어요"}
            </div>
            <div style={{ fontSize: 14, color: "var(--dm-sub)", marginTop: 4 }}>{result.rounds}라운드</div>
            <button onClick={onClose} style={{ ...S.btn, marginTop: 14, minHeight: UI.touch }}>확인</button>
          </div>
        )}
      </div>
    </div>,
    target,
  );
}
