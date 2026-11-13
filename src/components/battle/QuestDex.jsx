// 📜 이번 주 퀘스트 · 📖 도감 · 🏅 칭호 (2026-11-10) — 배틀 화면(BattleArena). 계산은 utils/gear.js 한 곳
import { useState } from "react";
import S from "../../styles.js";
import { toDateStr } from "../../utils/date.js";
import { RARITIES, GEAR_SLOTS, QUEST_GOLD, QUEST_COUNT, bagSize, normalizeGear, questClaimed, questBoxClaimed, claimQuest, claimQuestBox,
  dexInfo, titleList, SETS, itemDisplayName } from "../../utils/gear.js";
import { useBattleFold, FoldHeader } from "./BattleFold.jsx";

const ACCENT = "var(--dm-accent, #5B7CFA)";

// quest = { week, quests: [{id, emoji, target, label}], progress: {id: n} } — App.jsx에서 날짜 기록으로 센 값
export function QuestCard({ quest, gear, setGear }) {
  const [msg, setMsg] = useState("");
  const [open, toggle] = useBattleFold("quest");
  if (!quest?.quests?.length) return null;
  const g = normalizeGear(gear);
  const { week, quests, progress } = quest;
  const claimed = questClaimed(g, week);
  const boxDone = questBoxClaimed(g, week);
  const allClaimed = claimed.length >= QUEST_COUNT;
  const isDone = (q) => (progress?.[q.id] || 0) >= q.target;
  const doneCount = quests.filter(isDone).length;
  const readyCount = quests.filter((q, i) => isDone(q) && !claimed.includes(i)).length;
  const boxReady = allClaimed && !boxDone;
  const [, m, d] = week.split("-").map(Number);

  const claim = (i) => {
    const r = claimQuest(g, week, i, progress, quests);
    if (r.error) return;
    setGear(r.gear);
    setMsg(`🪙 +${r.gold} 받았어요`);
  };
  const openBox = () => {
    const r = claimQuestBox(g, week, toDateStr());
    if (r.error) { setMsg(r.error === "full" ? `가방이 꽉 찼어요(${bagSize(gear)}) — 안 쓰는 장비를 팔아 주세요` : ""); return; }
    setGear(r.gear);
    setMsg(`🎁 [${RARITIES[r.item.rarity].label}] ${itemDisplayName(r.item)} — 가방에 넣었어요`);
  };

  return (
    <div style={S.card}>
      {/* 접혀 있어도: 끝낸 수, 받을 게 있으면 "받기 n" (2026-11-10 접기) */}
      <FoldHeader title="📜 이번 주 퀘스트" open={open} onToggle={toggle}
        summary={readyCount ? `🪙 받기 ${readyCount}` : boxReady ? "🎁 상자 열기" : `${doneCount}/${QUEST_COUNT}`}
        summaryColor={readyCount || boxReady ? "#FF9F0A" : "var(--dm-sub)"} />
      {open && <>
      <div style={{ fontSize: 13, color: "var(--dm-sub)", margin: "2px 0 6px", lineHeight: 1.45, wordBreak: "keep-all" }}>{m}/{d}~ · 하나 끝낼 때마다 🪙{QUEST_GOLD}, {QUEST_COUNT}개 다 받으면 🎁 장비 상자 · 월요일마다 새로 바뀌어요</div>
      {quests.map((q, i) => {
        const n = Math.min(q.target, progress?.[q.id] || 0);
        const done = n >= q.target;
        const got = claimed.includes(i);
        return (
          <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid var(--dm-row)" }}>
            <span style={{ fontSize: 20, width: 26, textAlign: "center", flexShrink: 0 }}>{q.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: got ? "var(--dm-muted)" : "var(--dm-text)", textDecoration: got ? "line-through" : "none" }}>{q.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                <div style={{ flex: 1, height: 6, background: "var(--dm-row)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(n / q.target) * 100}%`, background: done ? "#30D158" : ACCENT, borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 13, color: "var(--dm-sub)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{n}/{q.target}</span>
              </div>
            </div>
            <button className="dm-hit" disabled={!done || got} onClick={() => claim(i)}
              style={{ flexShrink: 0, minWidth: 64, height: 36, padding: "0 10px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 900, fontFamily: "inherit", whiteSpace: "nowrap",
                cursor: done && !got ? "pointer" : "default", background: done && !got ? "#FF9F0A" : "var(--dm-input)", color: done && !got ? "#fff" : "var(--dm-muted)" }}>
              {got ? "받음" : done ? `🪙 받기` : `🪙${QUEST_GOLD}`}
            </button>
          </div>
        );
      })}
      <button disabled={!allClaimed || boxDone} onClick={openBox}
        style={{ width: "100%", height: 44, padding: 0, marginTop: 4, border: "none", borderRadius: 12, fontSize: 15, fontWeight: 900, fontFamily: "inherit",
          cursor: allClaimed && !boxDone ? "pointer" : "default", background: allClaimed && !boxDone ? "#8B5CF6" : "var(--dm-input)", color: allClaimed && !boxDone ? "#fff" : "var(--dm-muted)" }}>
        {boxDone ? "🎁 이번 주 상자 받음" : allClaimed ? "🎁 장비 상자 열기" : `🎁 장비 상자 (${claimed.length}/${QUEST_COUNT})`}
      </button>
      </>}
      {msg && <div style={{ fontSize: 14, color: "#30D158", fontWeight: 800, marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

// 📖 도감 · 🏅 칭호 — 기본은 접혀 있고 한 줄 요약만
export function DexCard({ gear, setGear, record }) {
  const [open, toggle] = useBattleFold("dex");
  const g = normalizeGear(gear);
  const dex = dexInfo(g);
  const titles = titleList(g, record);
  const okCount = titles.filter((t) => t.ok).length;
  const pickTitle = (id) => setGear({ ...g, title: g.title === id ? "" : id });

  return (
    <div style={S.card}>
      <FoldHeader title="📖 도감 · 🏅 칭호" open={open} onToggle={toggle} summary={`${dex.got}/${dex.total} · ${okCount}/${titles.length}`} />
      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: "var(--dm-text)", padding: "8px 0 4px", borderTop: "1px solid var(--dm-row)" }}>🏅 칭호 <span style={{ fontSize: 13, color: "var(--dm-muted)", fontWeight: 600 }}>— 눌러서 닉네임 옆에 달기</span></div>
          {titles.map((t) => {
            const on = g.title === t.id;
            return (
              <button key={t.id} disabled={!t.ok} onClick={() => pickTitle(t.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 44, padding: "6px 0", background: "none", border: "none", borderRadius: 0, cursor: t.ok ? "pointer" : "default", fontFamily: "inherit", textAlign: "left" }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: t.ok ? "var(--dm-text)" : "var(--dm-muted)" }}>{t.ok ? `「${t.label}」` : "🔒 ???"}</span>
                <span style={{ flex: 1, fontSize: 13, color: "var(--dm-muted)", wordBreak: "keep-all" }}>{t.how}</span>
                {on && <span style={{ fontSize: 13, fontWeight: 900, color: "#30D158", flexShrink: 0 }}>다는 중</span>}
              </button>
            );
          })}
          <div style={{ fontSize: 15, fontWeight: 900, color: "var(--dm-text)", padding: "10px 0 4px", marginTop: 4, borderTop: "1px solid var(--dm-row)" }}>📖 장비 도감 <span style={{ fontSize: 13, color: "var(--dm-muted)", fontWeight: 600 }}>— 한 번 가져 본 장비는 팔아도 남아요</span></div>
          {[...["legend", "epic", "rare", "uncommon", "common"].map((r) => ({ key: r, label: RARITIES[r].label, color: RARITIES[r].color, list: dex.list.filter((d) => !d.set && d.rarity === r) })),
            ...SETS.map((st) => ({ key: st.id, label: `${st.emoji} ${st.name} 세트`, color: "#FF9F0A", list: dex.list.filter((d) => d.set === st.id) }))].map((grp) => (
            <div key={grp.key} style={{ padding: "6px 0" }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: grp.color, marginBottom: 4 }}>{grp.label} {grp.list.filter((d) => d.got).length}/{grp.list.length}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {grp.list.map((d) => (
                  <span key={d.name} style={{ fontSize: 13, padding: "3px 8px", borderRadius: 8, background: "var(--dm-input)", color: d.got ? "var(--dm-text)" : "var(--dm-muted)", fontWeight: d.got ? 700 : 500 }}>
                    {GEAR_SLOTS.find((s) => s.id === d.slot)?.emoji} {d.got ? d.name : "???"}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
