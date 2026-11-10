// 🎒 내 장비 · 🧭 오늘의 떠돌이 도전자 (2026-11-08) — 배틀 화면(BattleArena) 위쪽. 계산은 utils/gear.js
import { useState } from "react";
import S, { UI } from "../../styles.js";
import { newDesignOn } from "../../utils/todayLook.js";
const NL = () => newDesignOn(); // 새 디자인 글자 단계 (2026-11-09) — 칸 제목 19px
import UndoBar from "../UndoBar.jsx";
import { useBattleFold, FoldHeader } from "./BattleFold.jsx";
import { useUndo, putBack } from "../../utils/useUndo.js";
import { toDateStr } from "../../utils/date.js";
import { GEAR_SLOTS, RARITIES, RARITY_ORDER, BAG_MAX, DROP_CHANCE, DROPS_PER_DAY, normalizeGear, gearBonus, itemEffects,
  GOLD, TASK_GOLD_CAP, BATTLE_GOLD_CAP, shopItems, shopBought, buyShopItem, sellItem,
  itemDisplayName, sellPriceOf, enhanceCost, enhanceItem, ENHANCE_MAX, ENHANCE_STEP, setById, equippedSets, setBonusText, SET_STREAK } from "../../utils/gear.js";

const ACCENT = "var(--dm-accent, #5B7CFA)";
const rarityChip = (r) => ({ fontSize: 12, fontWeight: 900, color: "#fff", background: RARITIES[r].color, borderRadius: 6, padding: "1px 6px", flexShrink: 0 });
// 세트 조각 표시 (등급 칩 옆)
const SetChip = ({ it }) => { const st = it?.set && setById(it.set); return st ? <span style={{ fontSize: 12, fontWeight: 900, color: "#FF9F0A", border: "1px solid #FF9F0A", borderRadius: 6, padding: "0 5px", flexShrink: 0, whiteSpace: "nowrap" }}>{st.emoji} 세트</span> : null; };

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
  const [enhMsg, setEnhMsg] = useState(null); // { id, ok, text } — 강화 결과 한 줄
  const undo = useUndo();
  const sets = equippedSets(g);
  const [open, toggle] = useBattleFold("gear");
  const equippedCount = Object.values(g.equipped).filter(Boolean).length;
  const bonus = gearBonus(g);
  const total = itemEffects(bonus);
  const isEquipped = (id) => Object.values(g.equipped).includes(id);
  const sorted = [...g.items].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || (b.at || "").localeCompare(a.at || ""));
  const newCount = g.items.filter((x) => x.at === today).length;

  const equip = (it) => setGear({ ...g, equipped: { ...g.equipped, [it.slot]: isEquipped(it.id) ? null : it.id } });
  // 팔기 (2026-11-10 — 예전 "버리기" 자리). 끼운 장비면 빼고 판다. 5초 되돌리기(그 사이 골드를 써 버렸으면 되돌리지 않음),
  // 전설은 아주 드물어 한 번 더 묻는다
  const sell = (it) => {
    if ((it.rarity === "legend" || it.plus >= 3) && !window.confirm(`${RARITIES[it.rarity].label} 장비 "${itemDisplayName(it)}"을(를) ${sellPriceOf(it)}골드에 팔까요?`)) return;
    const idx = g.items.findIndex((x) => x.id === it.id);
    const wasOn = isEquipped(it.id);
    const r = sellItem(g, it.id);
    setGear(r.gear);
    setSel(null);
    undo.offer(`🪙 +${r.gold} · "${itemDisplayName(it)}" 팔았어요`, () => setGear((cur) => {
      const c = normalizeGear(cur);
      if (c.gold < r.gold || c.items.some((x) => x.id === it.id)) return c;
      return { ...c, gold: c.gold - r.gold, items: putBack(c.items, it, idx), equipped: wasOn ? { ...c.equipped, [it.slot]: it.id } : c.equipped };
    }));
  };
  // 🔨 강화 — 확률이라 되돌리기 없음(되돌리면 실패를 다시 굴릴 수 있다). 실패해도 장비는 그대로
  const enhance = (it) => {
    const r = enhanceItem(g, it.id);
    if (r.error) { setEnhMsg({ id: it.id, ok: false, text: r.error === "gold" ? "골드가 모자라요" : "더 강화할 수 없어요" }); return; }
    setGear(r.gear);
    setEnhMsg({ id: it.id, ok: r.ok, text: r.ok ? `🔨 성공! ${itemDisplayName(r.item)}` : `💨 실패… 골드 ${r.cost}만 썼어요 (장비는 그대로)` });
  };

  return (
    <div style={S.card}>
      <UndoBar bar={undo.bar} onUndo={undo.run} />
      {/* 제목 한 줄, 효과 요약은 그 아래 한 줄 (2026-11-10 — 19px로 키운 뒤 효과 글자에 밀려 "내 장비"가 두 줄로 깨졌다) */}
      {/* 접기 (2026-11-10) — 접혀 있어도 끼운 수·가방·오늘 주운 것 */}
      <FoldHeader title="🎒 내 장비" open={open} onToggle={toggle}
        summary={`${newCount ? `오늘 +${newCount} · ` : ""}장착 ${equippedCount}/3 · 가방 ${g.items.length}`}
        summaryColor={newCount ? "#FF3B30" : "var(--dm-sub)"} />
      {open && <>
      <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.45, wordBreak: "keep-all", margin: "2px 0 6px" }}>{total.length ? total.join(" · ") : "아직 끼운 장비가 없어요"}</div>
      {/* ⛓️ 세트 효과 (2개·3개) — 끼운 세트 조각이 있을 때만 */}
      {sets.map(({ set, count }) => (
        <div key={set.id} style={{ fontSize: 13, lineHeight: 1.5, wordBreak: "keep-all", margin: "0 0 6px", color: "#FF9F0A", fontWeight: 700 }}>
          {set.emoji} {set.name} 세트 {count}/3
          <span style={{ display: "block", fontWeight: 600, color: count >= 2 ? "var(--dm-text)" : "var(--dm-muted)" }}>{count >= 2 ? "✓" : "·"} 2개: {setBonusText(set.bonus2)}</span>
          <span style={{ display: "block", fontWeight: 600, color: count >= 3 ? "var(--dm-text)" : "var(--dm-muted)" }}>{count >= 3 ? "✓" : "·"} 3개: {setBonusText(set.bonus3)}</span>
        </div>
      ))}
      {GEAR_SLOTS.map((s) => {
        const it = g.items.find((x) => x.id === g.equipped[s.id]);
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--dm-row)" }}>
            <span style={{ fontSize: 20, width: 26, textAlign: "center" }}>{s.emoji}</span>
            <span style={{ fontSize: 13, color: "var(--dm-muted)", width: 32, flexShrink: 0 }}>{s.label}</span>
            {it ? (
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={rarityChip(it.rarity)}>{RARITIES[it.rarity].label}</span><SetChip it={it} /><span style={{ fontSize: 15, fontWeight: 800, color: "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{itemDisplayName(it)}</span></span>
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
          <div style={{ fontSize: 13, color: "var(--dm-muted)", padding: "0 0 8px", lineHeight: 1.5, wordBreak: "keep-all" }}>⛓️ 습관을 {SET_STREAK}일 이어 할 때마다 세트 조각 1개 · 🔨 장비를 눌러 골드로 강화(+{ENHANCE_MAX}까지, 한 단계 +{Math.round(ENHANCE_STEP * 100)}%, 실패해도 안 깨져요)</div>
          {sorted.map((it) => (
            <div key={it.id} style={{ borderTop: "1px solid var(--dm-row)" }}>
              <button onClick={() => setSel(sel === it.id ? null : it.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 0", background: "none", border: "none", borderRadius: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ fontSize: 17 }}>{GEAR_SLOTS.find((s) => s.id === it.slot)?.emoji}</span>
                <span style={rarityChip(it.rarity)}>{RARITIES[it.rarity].label}</span>
                <SetChip it={it} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{itemDisplayName(it)}{it.at === today ? <span style={{ color: "#FF3B30", fontSize: 12, marginLeft: 6 }}>NEW</span> : null}</span>
                  <span style={{ display: "block", fontSize: 13, color: "var(--dm-sub)" }}>{itemEffects(it).join(" · ")}</span>
                </span>
                {isEquipped(it.id) && <span style={{ fontSize: 13, fontWeight: 800, color: "#30D158", flexShrink: 0 }}>장착 중</span>}
              </button>
              {sel === it.id && (() => {
                const ec = enhanceCost(it);
                const canEnh = ec && g.gold >= ec.gold;
                return (
                  <div style={{ paddingBottom: 10 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { equip(it); setSel(null); }} style={{ flex: 1, height: 42, padding: 0, border: "none", borderRadius: 10, background: isEquipped(it.id) ? "var(--dm-input)" : ACCENT, color: isEquipped(it.id) ? "var(--dm-text)" : "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{isEquipped(it.id) ? "빼기" : "끼우기"}</button>
                      <button onClick={() => sell(it)} style={{ height: 42, padding: "0 14px", border: "none", borderRadius: 10, background: "var(--dm-input)", color: "#FF9F0A", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>팔기 🪙{sellPriceOf(it)}</button>
                    </div>
                    {/* 🔨 강화 (2026-11-10) */}
                    <button disabled={!canEnh} onClick={() => enhance(it)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", height: 42, padding: 0, marginTop: 8, border: "none", borderRadius: 10, background: canEnh ? "#8B5CF6" : "var(--dm-input)", color: canEnh ? "#fff" : "var(--dm-muted)", fontSize: 15, fontWeight: 800, cursor: canEnh ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      {ec ? <>🔨 +{ec.next} 강화 · 🪙{ec.gold} · 성공 {Math.round(ec.rate * 100)}%</> : <>🔨 최고 단계 (+{ENHANCE_MAX})</>}
                    </button>
                    {enhMsg?.id === it.id && <div style={{ fontSize: 14, fontWeight: 800, marginTop: 6, color: enhMsg.ok ? "#30D158" : "#FF9F0A" }}>{enhMsg.text}</div>}
                  </div>
                );
              })()}
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
      </>}
    </div>
  );
}

// 🏪 오늘의 상점 (2026-11-10 사용자 요청) — 골드로 장비 사기. 날마다 바뀌는 3칸(utils/gear.js shopItems), 전설은 팔지 않는다.
// 산 것은 5초 안에 되돌릴 수 있다(확인창 대신, CLAUDE.md 14.1) — 그 사이 끼웠어도 빼고 골드를 돌려준다
export function ShopCard({ gear, setGear, seed }) {
  const g = normalizeGear(gear);
  const today = toDateStr();
  const undo = useUndo();
  const items = shopItems(today, seed);
  const bought = shopBought(g, today);
  const earned = g.earned?.date === today ? g.earned : { task: 0, battle: 0 };
  const [msg, setMsg] = useState('');
  const [open, toggle] = useBattleFold("shop");

  const buy = (i) => {
    const r = buyShopItem(g, today, seed, i);
    if (r.error) { setMsg(r.error === 'gold' ? '골드가 모자라요' : r.error === 'full' ? '가방이 꽉 찼어요 — 안 쓰는 장비를 팔아 주세요' : '이미 샀어요'); return; }
    setMsg('');
    setGear(r.gear);
    const price = items[i].price;
    undo.offer(`🪙 ${price} · 샀어요`, () => setGear((cur) => {
      const c = normalizeGear(cur);
      if (!c.items.some((x) => x.id === r.item.id)) return c; // 이미 버렸으면 그대로
      const equipped = Object.fromEntries(Object.entries(c.equipped).map(([k, v]) => [k, v === r.item.id ? null : v]));
      return { ...c, gold: c.gold + price, items: c.items.filter((x) => x.id !== r.item.id), equipped,
        shop: c.shop?.date === today ? { ...c.shop, bought: c.shop.bought.filter((x) => x !== i) } : c.shop };
    }));
  };

  return (
    <div style={S.card}>
      <UndoBar bar={undo.bar} onUndo={undo.run} />
      {/* 접기 (2026-11-10) — 접혀 있어도 가진 골드 */}
      <FoldHeader title="🏪 오늘의 상점" open={open} onToggle={toggle} summary={`🪙 ${g.gold.toLocaleString()}`} summaryColor="#FF9F0A" />
      {open && <>
      <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.45, wordBreak: "keep-all", margin: "2px 0 6px" }}>
        오늘 받은 골드 · 할일·습관 {earned.task}/{TASK_GOLD_CAP} · 배틀 {earned.battle}/{BATTLE_GOLD_CAP} · 물건은 내일 바뀌어요
      </div>
      {items.map((it, i) => {
        const done = bought.includes(i);
        const can = !done && g.gold >= it.price;
        const slot = GEAR_SLOTS.find((s) => s.id === it.slot);
        return (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid var(--dm-row)", opacity: done ? 0.55 : 1 }}>
            <span style={{ fontSize: 20, width: 26, textAlign: "center", flexShrink: 0 }}>{slot?.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span style={rarityChip(it.rarity)}>{RARITIES[it.rarity].label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--dm-sub)", marginTop: 2 }}>{itemEffects(it).join(" · ")}</div>
            </div>
            <button className="dm-hit" disabled={!can} onClick={() => buy(i)}
              style={{ flexShrink: 0, minWidth: 72, height: 36, padding: "0 10px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 900, fontFamily: "inherit", whiteSpace: "nowrap",
                cursor: can ? "pointer" : "default", background: done ? "var(--dm-input)" : can ? "#FF9F0A" : "var(--dm-input)", color: done ? "var(--dm-muted)" : can ? "#fff" : "var(--dm-muted)" }}>
              {done ? "샀어요" : `🪙 ${it.price}`}
            </button>
          </div>
        );
      })}
      {msg && <div style={{ fontSize: 13, color: "#FF9F0A", fontWeight: 700, marginTop: 4 }}>{msg}</div>}
      <div style={{ fontSize: 13, color: "var(--dm-muted)", lineHeight: 1.5, wordBreak: "keep-all", paddingTop: 8, borderTop: "1px solid var(--dm-row)" }}>
        골드는 할일 +{GOLD.task} · 습관 +{GOLD.habit} · 배틀 승리(나보다 강한 상대일수록 많이, 이미 이긴 상대는 0~100% 운). 하루 최대 할일·습관 {TASK_GOLD_CAP} · 배틀 {BATTLE_GOLD_CAP}. 안 쓰는 장비는 가방에서 팔 수 있어요. 전설 장비는 상점에서 팔지 않아요.
      </div>
      </>}
    </div>
  );
}
