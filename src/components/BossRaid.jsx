import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { boxCard, UI } from "../styles.js";
import { SectionIcon } from "./TodayLook.jsx";
import { useBackClose } from "../utils/useBackClose.js";
import { GROWTH_STAT_MAP } from "../data/growthStats.js";
import { loadRaid, ensureRaid, markRaidDefeated, addChatMessage } from "../firebase.js";
import {
  raidWeekOf, prevRaidWeek, raidDaysLeft, raidDamage, raidHpFor, nextRaidLevel, raidTotal, raidDefeated,
  raidBoss, bossPixels, RAID_REWARD_XP,
} from "../utils/bossRaid.js";
import { RAID_GOLD } from "../utils/gear.js";

// 협동 보스전 칸 + 상세 창 (2026-11-08) — 커뮤니티 상세 화면 위쪽. 계산은 utils/bossRaid.js
// 공격량은 App이 능력치가 바뀔 때마다 hits에 올린다(saveRaidHit). 여기서는 내 것만 지금 값으로 바꿔 보여 준다.

const fmt = (n) => Math.round(n || 0).toLocaleString();

function BossSprite({ boss, size, flash }) {
  const px = bossPixels(boss, flash);
  return (
    <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", width: size, height: size, flexShrink: 0, transform: flash ? "translateX(6px)" : "none", transition: "transform .08s", imageRendering: "pixelated" }}>
      {px.map((c, i) => <span key={i} style={{ background: c }} />)}
    </div>
  );
}

function HpBar({ left, max, height = 12 }) {
  const pct = max ? Math.max(0, Math.min(100, (left / max) * 100)) : 0;
  return (
    <div style={{ height, borderRadius: height / 2, background: "var(--dm-row)", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: "#FF453A", borderRadius: height / 2, transition: "width .4s" }} />
    </div>
  );
}

export default function BossRaidCard({ communityId, uid, nickname, members = [], memberCount = 0, raidBase, statXp, claims = [], onClaim, setToast }) {
  const week = raidWeekOf();
  const lastWeek = prevRaidWeek(week);
  const [cur, setCur] = useState(null);   // { raid, hits }
  const [prev, setPrev] = useState(null);
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const claimedRef = useRef(new Set());
  const defeatTriedRef = useRef(new Set());
  useBackClose(() => setOpen(false), open);

  // 불러오기 — 이번 주 보스가 없으면 만든다(지난주를 쓰러뜨렸으면 레벨 +1)
  useEffect(() => {
    if (!communityId || !uid) return undefined;
    let alive = true;
    (async () => {
      try {
        const [c, p] = await Promise.all([loadRaid(communityId, week), loadRaid(communityId, lastWeek)]);
        let raid = c.raid;
        if (!raid) {
          const level = nextRaidLevel(p.raid, p.hits);
          raid = await ensureRaid(communityId, week, { level, bossId: raidBoss(level).id, hpMax: raidHpFor(level, memberCount || members.length) });
        }
        if (!alive) return;
        setCur({ raid, hits: c.hits });
        setPrev(p);
      } catch { /* 멤버가 아니거나 인터넷 없음 — 칸을 숨긴다 */ }
    })();
    return () => { alive = false; };
  }, [communityId, uid, week]); // eslint-disable-line react-hooks/exhaustive-deps

  // 내 공격은 지금 능력치로 (올라가기 전에도 바로 보이게)
  const mine = useMemo(() => (raidBase?.week === week ? raidDamage(raidBase.xp, statXp) : { dmg: 0, byStat: {} }), [raidBase, statXp, week]);
  const hits = useMemo(() => {
    if (!cur) return [];
    const others = cur.hits.filter(h => h.uid !== uid);
    return mine.dmg > 0 || cur.hits.some(h => h.uid === uid) ? [...others, { uid, nickname, dmg: mine.dmg, byStat: mine.byStat }] : others;
  }, [cur, uid, nickname, mine]);

  const nameOf = (h) => members.find(m => m.uid === h?.uid)?.nickname || h?.nickname || "멤버";
  const raid = cur?.raid;
  const total = raidTotal(hits);
  const defeated = raidDefeated(raid, hits);

  // 처치 표시(먼저 한 사람만) + 채팅방 한 줄, 보상은 공격한 사람마다 한 번
  useEffect(() => {
    if (!raid || !defeated || !uid) return;
    const key = `${communityId}_${week}`;
    if (!raid.defeatedAt && !defeatTriedRef.current.has(key)) {
      defeatTriedRef.current.add(key);
      markRaidDefeated(communityId, week, uid).then(first => {
        if (!first) return;
        const top = [...hits].sort((a, b) => b.dmg - a.dmg)[0];
        const boss = raidBoss(raid.level);
        addChatMessage(communityId, { uid, nickname: nickname || "", text: `⚔️ 보스 처치! ${boss.name} Lv.${boss.level} — 최다 공격: ${nameOf(top)} (${fmt(top?.dmg)})`, photos: [] }).catch(() => {});
      }).catch(() => {});
    }
  }, [raid, defeated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tryClaim = (w, r, hs, myByStat) => {
      const key = `${communityId}_${w}`;
      const myDmg = (hs.find(h => h.uid === uid)?.dmg) || 0;
      if (!r || !raidDefeated(r, hs) || myDmg <= 0 || claims.includes(key) || claimedRef.current.has(key)) return;
      claimedRef.current.add(key);
      // 처치 보상: XP + 🪙 골드 + 장비 상자 (2026-11-13 — App claimRaid가 받은 것을 돌려준다)
      const got = onClaim?.(key, myByStat);
      const extra = got?.gold ? ` · 🪙 +${got.gold}${got.item ? ` · 🎁 ${got.item.name}` : got.full ? ' · 가방이 꽉 차서 장비는 못 받았어요' : ''}` : '';
      setToast?.(`⚔️ 보스 처치 보상 +${RAID_REWARD_XP} XP${extra}`);
    };
    if (raid) tryClaim(week, raid, hits, mine.byStat);
    if (prev?.raid) tryClaim(lastWeek, prev.raid, prev.hits, prev.hits.find(h => h.uid === uid)?.byStat);
  }, [raid, hits, prev, claims]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!raid) return null;
  const boss = raidBoss(raid.level);
  const left = Math.max(0, raid.hpMax - total);
  const daysLeft = raidDaysLeft();
  const ranking = [
    ...[...hits].sort((a, b) => b.dmg - a.dmg),
    ...members.filter(m => !hits.some(h => h.uid === m.uid)).map(m => ({ uid: m.uid, nickname: m.nickname, dmg: 0 })),
  ];
  const maxDmg = Math.max(1, ...ranking.map(r => r.dmg));
  const lastResult = prev?.raid ? (raidDefeated(prev.raid, prev.hits) ? `지난주 ${raidBoss(prev.raid.level).name} 처치 ✓` : `지난주 ${raidBoss(prev.raid.level).name}은 놓쳤어요 (벌점 없음)`) : null;
  const playHit = () => { setFlash(true); setTimeout(() => setFlash(false), 600); };

  const card = (
    <div style={{ ...boxCard, margin: "8px 16px 4px", padding: "14px 16px" }}>
      <button onClick={() => setOpen(true)} style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", padding: 0, background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "var(--dm-text)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
          <SectionIcon name="sword" size={20} badge />
          <span style={{ fontSize: UI.title, fontWeight: 900 }}>이번 주 보스</span>
          <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 800, color: defeated ? "#30D158" : "var(--dm-accent, #5B7CFA)" }}>{defeated ? "처치 ✓ ›" : daysLeft ? `${daysLeft}일 남음 ›` : "오늘까지 ›"}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
          <BossSprite boss={boss} size={64} />
          <span style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 900 }}>{boss.name} <span style={{ fontSize: 13, color: "var(--dm-muted)", fontWeight: 600 }}>Lv.{boss.level}</span></span>
            <HpBar left={left} max={raid.hpMax} />
            <span style={{ fontSize: 13, color: "var(--dm-sub)" }}>{defeated ? "모두 함께 쓰러뜨렸어요" : `남은 체력 ${fmt(left)} / ${fmt(raid.hpMax)}`} · 내 공격 {fmt(mine.dmg)}</span>
          </span>
        </span>
      </button>
    </div>
  );

  const sheet = open && createPortal(
    <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="이번 주 보스" style={{ width: "100%", maxWidth: 480, maxHeight: "92%", overflowY: "auto", background: "var(--dm-bg, #000)", borderRadius: "20px 20px 0 0", padding: "16px 16px 28px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14, color: "var(--dm-text)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 21, fontWeight: 900 }}>{boss.name} <span style={{ fontSize: 14, color: "var(--dm-muted)", fontWeight: 600 }}>Lv.{boss.level}</span></span>
            <span style={{ fontSize: 13, color: "var(--dm-sub)" }}>{defeated ? "이번 주 처치 완료" : daysLeft ? `일요일 밤 12시까지 · ${daysLeft}일 남음` : "오늘 밤 12시까지"}</span>
          </span>
          <button onClick={() => setOpen(false)} aria-label="닫기" style={{ width: UI.touch, height: UI.touch, padding: 0, background: "none", border: "none", color: "var(--dm-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ ...boxCard, margin: 0, padding: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative", display: "flex", justifyContent: "center", width: "100%" }}>
            <BossSprite boss={boss} size={144} flash={flash} />
            {flash && mine.dmg > 0 && <span style={{ position: "absolute", top: 0, right: "18%", fontSize: 24, fontWeight: 900, color: "#FF9F0A" }}>-{fmt(mine.dmg)}</span>}
          </div>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
            <HpBar left={left} max={raid.hpMax} height={14} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--dm-sub)" }}>
              <span>남은 체력 {fmt(left)} / {fmt(raid.hpMax)}</span><span>{Math.min(100, Math.round((total / raid.hpMax) * 100))}% 깎음</span>
            </div>
          </div>
          <button onClick={playHit} disabled={mine.dmg <= 0} style={{ width: "100%", height: 46, borderRadius: 14, border: "none", padding: 0, background: mine.dmg > 0 ? "var(--dm-accent, #5B7CFA)" : "var(--dm-row)", color: mine.dmg > 0 ? "#fff" : "var(--dm-muted)", fontSize: 16, fontWeight: 900, fontFamily: "inherit", cursor: mine.dmg > 0 ? "pointer" : "default" }}>
            {mine.dmg > 0 ? "▶ 이번 주 내 공격 보기" : "아직 이번 주 공격이 없어요"}
          </button>
        </div>

        <div style={{ ...boxCard, margin: 0, padding: "14px 16px" }}>
          <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 6 }}>이번 주 내 공격 <span style={{ color: "#FF9F0A" }}>{fmt(mine.dmg)}</span></div>
          {Object.keys(mine.byStat).length === 0
            ? <div style={{ fontSize: 14, color: "var(--dm-sub)", lineHeight: 1.5 }}>할일·습관·공부로 능력치가 오르면 그만큼 보스를 때려요 (XP 1 = 공격 10).</div>
            : Object.entries(mine.byStat).sort((a, b) => b[1] - a[1]).map(([id, v], i, arr) => (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--dm-row)" : "none" }}>
                <span style={{ fontSize: 15, flex: 1 }}>{GROWTH_STAT_MAP[id]?.icon} {GROWTH_STAT_MAP[id]?.name || id}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#FF9F0A" }}>{fmt(v)}</span>
              </div>
            ))}
        </div>

        <div style={{ ...boxCard, margin: 0, padding: "14px 16px" }}>
          <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 8 }}>멤버 공격</div>
          {ranking.map((r, i) => (
            <div key={r.uid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <span style={{ width: 76, fontSize: 15, fontWeight: r.uid === uid ? 900 : 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{r.uid === uid ? "나" : nameOf(r)}</span>
              <span style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--dm-row)", overflow: "hidden" }}>
                <span style={{ display: "block", width: `${(r.dmg / maxDmg) * 100}%`, height: "100%", background: r.uid === uid ? "var(--dm-accent, #5B7CFA)" : "#64D2FF", borderRadius: 4 }} />
              </span>
              <span style={{ width: 56, textAlign: "right", fontSize: 14, color: "var(--dm-sub)", flexShrink: 0 }}>{i === 0 && r.dmg > 0 ? "👑 " : ""}{fmt(r.dmg)}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 4px", fontSize: 13, color: "var(--dm-muted)", lineHeight: 1.5 }}>
          {lastResult && <span>· {lastResult}</span>}
          <span>· 공격 버튼은 없어요 — 평소 오르는 능력치 XP가 그대로 공격이 돼요</span>
          <span>· 쓰러뜨리면 공격한 멤버 모두 +{RAID_REWARD_XP} XP · 🪙 +{RAID_GOLD} · 🎁 장비 상자, 다음 주 보스는 한 단계 셉니다</span>
          <span>· 못 쓰러뜨린 주는 그냥 지나가요 (벌점 없음)</span>
        </div>
      </div>
    </div>,
    document.querySelector(".dm-phone") || document.body,
  );

  return <>{card}{sheet}</>;
}
