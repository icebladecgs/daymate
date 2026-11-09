// 🎒 내 장비 · 🧭 오늘의 떠돌이 도전자 (2026-11-08) — 배틀 화면(BattleArena) 위쪽. 계산은 utils/gear.js
import { useState } from "react";
import S, { UI } from "../../styles.js";
import { newDesignOn } from "../../utils/todayLook.js";
const NL = () => newDesignOn(); // 새 디자인 글자 단계 (2026-11-09) — 칸 제목 19px
import UndoBar from "../UndoBar.jsx";
import { useUndo, putBack } from "../../utils/useUndo.js";
import { toDateStr } from "../../utils/date.js";
import { GEAR_SLOTS, RARITIES, RARITY_ORDER, BAG_MAX, DROP_CHANCE, DROPS_PER_DAY, normalizeGear, gearBonus, itemEffects } from "../../utils/gear.js";

const ACCENT = "var(--dm-accent, #5B7CFA)";
const rarityChip = (r) => ({ fontSize: 12, fontWeight: 900, color: "#fff", background: RARITIES[r].color, borderRadius: 6, padding: "1px 6px", flexShrink: 0 });

export function WandererCard({ wanderer, done, onStart }) {
  if (!wanderer) return null;
  return (
    <div style={{ ...S.card, border: "1.5px solid rgba(255,159,10,.45)", background: "rgba(255,159,10,.07)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: NL() ? UI.title : 13, fontWeight: NL() ? 900 : 800, color: "#FF9F0A", marginBottom: NL() ? 12 : 8 }}>🧭 오늘의 떠돌이 도전자 <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--dm-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>자정에 떠나요</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--dm-input)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0 }}>{wanderer.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: "var(--dm-text)" }}>{wanderer.name}</div>
          <div style={{ fontSize: 13, color: "var(--dm-sub)", marginTop: 2, lineHeight: 1.45 }}>
            Energy {wanderer.energyMax.toLocaleString()} · 「{wanderer.trait?.label}」 {wanderer.trait?.desc}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4, color: done ? "#30D158" : "#FF9F0A" }}>{done ? "✓ 오늘 보상 받음 — 다시 겨뤄 볼 수는 있어요" : "🎁 이기면 희귀 이상 장비 1개"}</div>
        </div>
        <button onClick={onStart} style={{ height: 44, padding: "0 16px", border: "none", borderRadius: 12, background: "#FF9F0A", color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer", flexShrink: 0, fontFamily: "inherit" }}>도전</button>
      </div>
    </div>
  );
}

export default function GearPanel({ gear, setGear }) {
  const g = normalizeGear(gear);
  const today = toDateStr();
  const [bagOpen, setBagOpen] = useState(false);
  const [sel, setSel] = useState(null);
  const undo = useUndo();
  const bonus = gearBonus(g);
  const total = itemEffects(bonus);
  const isEquipped = (id) => Object.values(g.equipped).includes(id);
  const sorted = [...g.items].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || (b.at || "").localeCompare(a.at || ""));
  const newCount = g.items.filter((x) => x.at === today).length;

  const equip = (it) => setGear({ ...g, equipped: { ...g.equipped, [it.slot]: isEquipped(it.id) ? null : it.id } });
  const discard = (it) => {
    const idx = g.items.findIndex((x) => x.id === it.id);
    const wasOn = isEquipped(it.id);
    setGear({ ...g, items: g.items.filter((x) => x.id !== it.id), equipped: wasOn ? { ...g.equipped, [it.slot]: null } : g.equipped });
    setSel(null);
    undo.offer(`"${it.name}"을(를) 버렸어요`, () => setGear((cur) => {
      const c = normalizeGear(cur);
      return { ...c, items: putBack(c.items, it, idx), equipped: wasOn ? { ...c.equipped, [it.slot]: it.id } : c.equipped };
    }));
  };

  return (
    <div style={S.card}>
      <UndoBar bar={undo.bar} onUndo={undo.run} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: NL() ? UI.title : 17, fontWeight: 900, color: "var(--dm-text)" }}>🎒 내 장비</span>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--dm-sub)" }}>{total.length ? total.join(" · ") : "아직 끼운 장비가 없어요"}</span>
      </div>
      {GEAR_SLOTS.map((s) => {
        const it = g.items.find((x) => x.id === g.equipped[s.id]);
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--dm-row)" }}>
            <span style={{ fontSize: 20, width: 26, textAlign: "center" }}>{s.emoji}</span>
            <span style={{ fontSize: 13, color: "var(--dm-muted)", width: 32, flexShrink: 0 }}>{s.label}</span>
            {it ? (
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={rarityChip(it.rarity)}>{RARITIES[it.rarity].label}</span><span style={{ fontSize: 15, fontWeight: 800, color: "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span></span>
                <span style={{ display: "block", fontSize: 13, color: "var(--dm-sub)", marginTop: 2 }}>{itemEffects(it).join(" · ")}</span>
              </span>
            ) : <span style={{ flex: 1, fontSize: 14, color: "var(--dm-muted)" }}>비어 있음</span>}
          </div>
        );
      })}

      <button onClick={() => setBagOpen((v) => !v)} aria-expanded={bagOpen} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", minHeight: 44, padding: "8px 0 0", marginTop: 4, background: "none", border: "none", borderTop: "1px solid var(--dm-row)", borderRadius: 0, cursor: "pointer", fontFamily: "inherit", color: ACCENT, fontSize: 15, fontWeight: 800 }}>
        가방 {g.items.length}/{BAG_MAX}{newCount ? <span style={{ fontSize: 12, color: "#fff", background: "#FF3B30", borderRadius: 999, padding: "1px 7px" }}>오늘 +{newCount}</span> : null}
        <span style={{ marginLeft: "auto", color: "var(--dm-sub)", fontSize: 13 }}>{bagOpen ? "접기 ▲" : "열기 ▼"}</span>
      </button>
      {bagOpen && (
        <div style={{ marginTop: 6 }}>
          {sorted.length === 0 && <div style={{ fontSize: 14, color: "var(--dm-sub)", padding: "6px 0", lineHeight: 1.5 }}>할일을 끝내거나 습관을 체크하면 가끔 장비가 떨어져요. 도전 상대를 처음 이기면 상대마다 한 번, 떠돌이 도전자를 이기면 희귀 이상을 받아요.</div>}
          {sorted.map((it) => (
            <div key={it.id} style={{ borderTop: "1px solid var(--dm-row)" }}>
              <button onClick={() => setSel(sel === it.id ? null : it.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 0", background: "none", border: "none", borderRadius: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ fontSize: 17 }}>{GEAR_SLOTS.find((s) => s.id === it.slot)?.emoji}</span>
                <span style={rarityChip(it.rarity)}>{RARITIES[it.rarity].label}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}{it.at === today ? <span style={{ color: "#FF3B30", fontSize: 12, marginLeft: 6 }}>NEW</span> : null}</span>
                  <span style={{ display: "block", fontSize: 13, color: "var(--dm-sub)" }}>{itemEffects(it).join(" · ")}</span>
                </span>
                {isEquipped(it.id) && <span style={{ fontSize: 13, fontWeight: 800, color: "#30D158", flexShrink: 0 }}>장착 중</span>}
              </button>
              {sel === it.id && (
                <div style={{ display: "flex", gap: 8, paddingBottom: 10 }}>
                  <button onClick={() => { equip(it); setSel(null); }} style={{ flex: 1, height: 42, border: "none", borderRadius: 10, background: isEquipped(it.id) ? "var(--dm-input)" : ACCENT, color: isEquipped(it.id) ? "var(--dm-text)" : "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{isEquipped(it.id) ? "빼기" : "끼우기"}</button>
                  <button onClick={() => discard(it)} style={{ height: 42, padding: "0 16px", border: "none", borderRadius: 10, background: "var(--dm-input)", color: "#FF3B30", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>버리기</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button onClick={() => setGear({ ...g, dropsOff: !g.dropsOff })} role="switch" aria-checked={!g.dropsOff} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 0 0", marginTop: 6, background: "none", border: "none", borderTop: "1px solid var(--dm-row)", borderRadius: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "var(--dm-text)" }}>할일·습관을 하면 장비 줍기</span>
          <span style={{ display: "block", fontSize: 13, color: "var(--dm-muted)", marginTop: 2 }}>할일 {Math.round(DROP_CHANCE.task * 100)}% · 습관 {Math.round(DROP_CHANCE.habit * 100)}% · 하루 최대 {DROPS_PER_DAY}개</span>
        </span>
        <span aria-hidden style={{ width: 46, height: 28, borderRadius: 99, background: g.dropsOff ? "var(--dm-input)" : "#34C759", position: "relative", flexShrink: 0 }}>
          <span style={{ position: "absolute", top: 3, left: g.dropsOff ? 3 : 21, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
        </span>
      </button>
    </div>
  );
}
