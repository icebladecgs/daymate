import { useEffect, useMemo, useState } from "react";
import S, { boxCard, UI } from "../styles.js";
import { store } from "../utils/storage.js";
import { toDateStr } from "../utils/date.js";
import { chatFetch } from "../api/chatFetch.js";
import { GROWTH_STATS, calcStatScore } from "../data/growthStats.js";
import { calcDayScore, calcLevel, calcStreak, LEVEL_ICONS, LEVEL_TITLES } from "../data/stats.js";
import { newDesignOn } from "../utils/todayLook.js";
import { SectionHeading, SectionIcon } from "./TodayLook.jsx";
import { useBackClose } from "../utils/useBackClose.js";
import UndoBar from "./UndoBar.jsx";
import { useUndo } from "../utils/useUndo.js";

const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];
// "11월 12일 (목)"
const dayLabelOf = (ds) => { const [y, m, d] = ds.split("-").map(Number); return `${m}월 ${d}일 (${DOW_KO[new Date(y, m - 1, d).getDay()]})`; };
// 이번 로또 추첨일(토요일) "11/14 토" — 토요일에 뽑으면 그날 추첨
const drawDayLabel = (ds) => { const [y, m, d] = ds.split("-").map(Number); const t = new Date(y, m - 1, d); t.setDate(t.getDate() + ((6 - t.getDay() + 7) % 7)); return `${t.getMonth() + 1}/${t.getDate()} 토`; };

// My 탭 위쪽 "나의 성장·운세" — 레벨·XP, 성장 능력치 6개, 배틀, 오늘의 운세·로또(+운세 팝업), XP 도움말.
// 예전엔 오늘 탭 맨 위에 있었는데, 오늘 탭은 할일·습관·일기 중심으로 하기로 해서 옮김(2026-09-27).
export default function GrowthFortunePanel({
  dateStr, data, habits, plans, scores, inviteBonus, statXp, myRank, onOpenStats, onOpenBattle,
  battleNickname, onSetBattleNickname, user, setToast, onOpenSettings,
  birthDate: birthDateProp, birthTime: birthTimeProp, onAddMemo, onRemoveMemo,
}) {
  // My탭과 동일한 계산(기존 XP/레벨/티어) — 오늘 화면에서도 함께 보여주기 위함, 기존 로직/저장방식은 그대로
  const todayScore = useMemo(() => calcDayScore(data, habits), [data, habits]);
  const totalScore = useMemo(() => Object.values(scores || {}).reduce((a, b) => a + b, 0) + todayScore + (inviteBonus || 0), [scores, todayScore, inviteBonus]);
  const levelInfo = useMemo(() => calcLevel(totalScore), [totalScore]);
  const streak = useMemo(() => calcStreak(plans), [plans]);
  const monthScore = useMemo(() => {
    const prefix = dateStr.slice(0, 7);
    return Object.entries(scores || {}).filter(([ds]) => ds.startsWith(prefix)).reduce((a, [, v]) => a + v, 0) + todayScore;
  }, [scores, todayScore, dateStr]);
  const [nl] = useState(newDesignOn); // 새 디자인 — 작은 글씨·흐린 배틀 버튼을 키우고 또렷하게
  const [xpHelpOpen, setXpHelpOpen] = useState(false);
  useBackClose(() => setXpHelpOpen(false), xpHelpOpen);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');

  // ── 운세 · 로또 (마이탭에서 이동) ────────────────────────────
  const [fortuneModalOpen, setFortuneModalOpen] = useState(false);
  useBackClose(() => setFortuneModalOpen(false), fortuneModalOpen);
  const [fortuneTab, setFortuneTab] = useState('daily'); // daily | saju | tojeong
  const [fortuneData, setFortuneData] = useState(null);
  const [fortuneLoading, setFortuneLoading] = useState(false);
  const [fortuneError, setFortuneError] = useState(false);
  const [sajuData, setSajuData] = useState(() => store.get('dm_saju_result', null));
  const [tojeongData, setTojeongData] = useState(() => store.get('dm_tojeong_result', null));
  const lottoKey = `dm_lotto_${dateStr}`;
  const [lottoNums, setLottoNums] = useState(() => store.get(lottoKey, null));
  const [lottoAnim, setLottoAnim] = useState(false);
  // 📋 로또 번호를 오늘 메모로 (2026-11-12 사용자 승인) — 토요일 추첨 뒤 맞춰 볼 수 있게. 같은 날 두 번 넣지 않게 메모 id를 기억
  const lottoMemoKey = `dm_lotto_memo_${dateStr}`;
  const [lottoMemoId, setLottoMemoId] = useState(() => store.get(lottoMemoKey, null));
  const undo = useUndo();
  const saveLottoMemo = () => {
    if (!lottoNums || !onAddMemo || lottoMemoId) return;
    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const id = onAddMemo(`🎱 로또 번호 (${drawDayLabel(dateStr)} 추첨)
${lottoNums.join(' · ')}`, time);
    store.set(lottoMemoKey, id);
    setLottoMemoId(id);
    undo.offer('오늘 메모에 로또 번호를 넣었어요', () => { onRemoveMemo?.(id); store.remove(lottoMemoKey); setLottoMemoId(null); });
  };
  const drawLotto = () => {
    if (lottoNums) return;
    setLottoAnim(true);
    setTimeout(() => {
      const pool = Array.from({ length: 45 }, (_, i) => i + 1);
      const picked = [];
      while (picked.length < 6) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(idx, 1)[0]);
      }
      picked.sort((a, b) => a - b);
      store.set(lottoKey, picked);
      setLottoNums(picked);
      setLottoAnim(false);
    }, 900);
  };
  const birthDate = birthDateProp || '';
  const birthTime = birthTimeProp || '';
  const fortuneCacheKey = `dm_fortune_${dateStr}`;
  const fortuneXpKey = `dm_fortune_xp_${dateStr}`;
  const avgFortuneScore = (fd) => {
    if (!fd?.overall) return null;
    const { overall, money, health, relation } = fd;
    return (overall + (money ?? overall) + (health ?? overall) + (relation ?? overall)) / 4;
  };
  const todayFortuneScore = (() => {
    try { return avgFortuneScore(store.get(fortuneCacheKey, null)); } catch { return null; }
  })();
  const loadFortune = async () => {
    if (!birthDate) return;
    const cached = store.get(fortuneCacheKey, null);
    if (cached) { setFortuneData(cached); return; }
    setFortuneLoading(true);
    setFortuneError(false);
    try {
      const res = await chatFetch('/api/chat?action=fortune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthDate, birthTime, userName: user?.name || '사용자', today: dateStr }),
      });
      if (!res.ok) throw new Error(`fortune ${res.status}`);
      const fd = await res.json();
      store.set(fortuneCacheKey, fd);
      setFortuneData(fd);
    } catch {
      setFortuneError(true);
    }
    setFortuneLoading(false);
  };
  useEffect(() => {
    if (fortuneData?.overall && !store.get(fortuneXpKey, null)) {
      const xp = Math.round(fortuneData.overall * 2);
      store.set(fortuneXpKey, xp);
      setToast(`🔮 오늘의 운세 확인 · +${xp} XP`);
    }
  }, [fortuneData]); // eslint-disable-line
  const loadSaju = async () => {
    if (!birthDate) return;
    setFortuneLoading(true);
    try {
      const res = await chatFetch('/api/chat?action=saju', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthDate, birthTime, userName: user?.name || '사용자' }),
      });
      if (!res.ok) throw new Error(`saju ${res.status}`);
      const sd = await res.json();
      store.set('dm_saju_result', sd);
      setSajuData(sd);
    } catch { setFortuneError(true); }
    setFortuneLoading(false);
  };
  const loadTojeong = async () => {
    if (!birthDate) return;
    setFortuneLoading(true);
    try {
      const year = new Date().getFullYear();
      const res = await chatFetch('/api/chat?action=tojeong', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthDate, birthTime, userName: user?.name || '사용자', year }),
      });
      if (!res.ok) throw new Error(`tojeong ${res.status}`);
      const td = await res.json();
      const saved = { ...td, year }; // 해가 바뀌면 다시 보게 (2026-11-12)
      store.set('dm_tojeong_result', saved);
      setTojeongData(saved);
    } catch { setFortuneError(true); }
    setFortuneLoading(false);
  };
  const starRating = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const fortuneLevel = (score) => {
    if (!score) return { label: '🔮', color: '#A78BFA', desc: '운세보기' };
    const pts = Math.round(score * 20);
    if (pts >= 80) return { label: '대길 ★', color: '#4ADE80', desc: `${pts}점` };
    if (pts >= 60) return { label: '길 ☆', color: '#FCD34D', desc: `${pts}점` };
    if (pts >= 40) return { label: '평 △', color: '#94A3B8', desc: `${pts}점` };
    return { label: '흉 ▽', color: '#F87171', desc: `${pts}점` };
  };
  const fortuneWeekHistory = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const ds = toDateStr(d);
      const cached = store.get(`dm_fortune_${ds}`, null);
      const dow = '일월화수목금토'[d.getDay()];
      return { dateStr: ds, overall: avgFortuneScore(cached), dow };
    });
  }, []); // eslint-disable-line

  const xpBadge = (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: nl ? 20 : 15, fontWeight: 900, color: "var(--dm-text)" }}>{totalScore.toLocaleString()}</span>
              <span style={{ fontSize: nl ? UI.sub : 11, color: "var(--dm-accent, #6C8EFF)", fontWeight: 700 }}>XP</span>
              <button className={nl ? "dm-hit" : undefined} aria-label="XP 설명" onClick={() => setXpHelpOpen(true)} style={{ background: "var(--dm-accent-soft, rgba(108,142,255,.18))", border: "1px solid var(--dm-accent-line, rgba(108,142,255,.4))", borderRadius: 999, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 10, color: "var(--dm-accent, #6C8EFF)", fontWeight: 900, padding: 0, lineHeight: 1 }}>?</button>
            </div>
  );

  return (
    <>
      {/* 🌱 나의 성장 능력치 (+ My탭과 동일한 레벨/XP 요약) */}
      {statXp && (
        <div style={{ ...S.card, background: "var(--dm-hero-bg, linear-gradient(135deg,rgba(75,111,255,.12),rgba(108,142,255,.05)))", border: "1.5px solid var(--dm-accent-line, rgba(108,142,255,.3))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: nl ? 14 : 10, flexWrap: nl ? "wrap" : "nowrap" }}>
            <span style={{ fontSize: 20 }}>{levelInfo.icon}</span>
            <span style={{ fontSize: nl ? 16 : 13, fontWeight: 900, color: "var(--dm-text)" }}>{levelInfo.title}</span>
            <span style={{ fontSize: nl ? 14 : 11, fontWeight: 700, color: "var(--dm-accent, #6C8EFF)" }}>Lv.{levelInfo.level}</span>
            {onSetBattleNickname && (
              <button className={nl ? "dm-hit" : undefined}
                onClick={() => { setNicknameDraft(battleNickname || ''); setEditingNickname(v => !v); }}
                title="배틀 닉네임 설정"
                // 새 디자인: 보라 대신 강조색 하나(D안) — 바탕만 연하게, 테두리 없음 (2026-11-08)
                style={nl
                  ? { background: "var(--dm-accent-soft, rgba(139,92,246,.12))", border: "none", borderRadius: 999, padding: "2px 10px", cursor: "pointer", fontFamily: "inherit" }
                  : { background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.35)", borderRadius: 999, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit" }}
              >
                <span style={{ fontSize: nl ? UI.sub : 10, color: nl ? "var(--dm-accent, #8B5CF6)" : "#c4b5fd", fontWeight: 700 }}>🏷️ {battleNickname || "닉네임"}</span>
              </button>
            )}
            {nl ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                {streak > 0 && <span style={{ fontSize: 13, color: "#F97316", fontWeight: 900 }}>🔥{streak}</span>}
                {xpBadge}
              </span>
            ) : streak > 0 && <span style={{ fontSize: 11, color: "#F97316", fontWeight: 900, marginLeft: "auto" }}>🔥{streak}</span>}
          </div>
          {editingNickname && (
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <input
                value={nicknameDraft}
                onChange={e => setNicknameDraft(e.target.value.slice(0, 10))}
                placeholder="배틀 닉네임 (최대 10자)"
                autoFocus
                style={{ ...S.input, flex: 1, marginBottom: 0, fontSize: 13, padding: "8px 10px" }}
              />
              <button
                onClick={() => { onSetBattleNickname(nicknameDraft.trim()); setEditingNickname(false); }}
                style={{ background: "var(--dm-accent, #6C8EFF)", border: "none", borderRadius: 8, padding: "0 14px", color: "#fff", fontWeight: 900, fontSize: 12, cursor: "pointer" }}
              >저장</button>
              <button
                onClick={() => setEditingNickname(false)}
                style={{ background: "var(--dm-input)", border: "none", borderRadius: 8, padding: "0 12px", color: "var(--dm-muted)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >취소</button>
            </div>
          )}
          {(!nl || myRank) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: nl ? 12 : 8 }}>
            {myRank ? (
              <button className="dm-hit-y" onClick={onOpenStats} style={{ background: "var(--dm-accent-soft, rgba(75,111,255,.15))", border: "1px solid var(--dm-accent-line, rgba(108,142,255,.4))", borderRadius: 20, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ fontSize: nl ? 13 : 11, fontWeight: 900, color: "var(--dm-accent, #6C8EFF)" }}>🏆 전체 {myRank.rank}위</span>
                <span style={{ fontSize: nl ? UI.sub : 10, color: "var(--dm-muted)", marginLeft: 4 }}>{myRank.total}명 중</span>
              </button>
            ) : <span />}
            {!nl && xpBadge}
          </div>
          )}
          <div style={{ height: nl ? 6 : 4, background: "var(--dm-row)", borderRadius: 4, overflow: "hidden", marginBottom: nl ? 8 : 6 }}>
            <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,var(--dm-accent, #4B6FFF),var(--dm-accent, #6C8EFF))", width: `${levelInfo.progress}%`, transition: "width 0.4s" }} />
          </div>
          <div style={{ display: "flex", flexWrap: nl ? "wrap" : "nowrap", columnGap: 8, justifyContent: "space-between", marginBottom: 14, ...(nl ? { paddingBottom: 14, borderBottom: "1px solid var(--dm-row)" } : {}) }}>
            <span style={{ fontSize: nl ? UI.sub : 10, color: "var(--dm-muted)" }}>다음 레벨까지 {(levelInfo.nextFloor - totalScore).toLocaleString()} XP</span>
            <span style={{ fontSize: nl ? UI.sub : 10, color: "var(--dm-muted)" }}>오늘 +{todayScore}pt · 이달 {monthScore}pt</span>
          </div>
          {nl ? <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 900, color: "var(--dm-text)", marginBottom: 10 }}><SectionIcon name="sprout" size={18} />나의 성장 능력치</div> : <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-muted)", letterSpacing: "0.06em", marginBottom: 10 }}>🌱 나의 성장 능력치</div>}
          {/* 새 디자인: 아직 쌓인 능력치가 없으면 0만 6줄 늘어놓지 않고 한 줄 안내 (2026-11-07) */}
          {nl && GROWTH_STATS.every(stat => calcStatScore(statXp[stat.id] || 0) === 0) ? (
            <div style={{ fontSize: 14, color: "var(--dm-sub)", lineHeight: 1.6, wordBreak: "keep-all" }}>
              할 일·습관을 끝내면 {GROWTH_STATS.slice(0, 3).map(s => `${s.icon} ${s.name}`).join(" · ")} 같은 능력치가 쌓여요.
            </div>
          ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 14, rowGap: 8 }}>
            {GROWTH_STATS.map(stat => {
              const score = calcStatScore(statXp[stat.id] || 0);
              return (
                <div key={stat.id} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: nl ? 15 : 13, width: nl ? 20 : 18, textAlign: "center", flexShrink: 0 }}>{stat.icon}</span>
                  <span style={{ fontSize: nl ? 13 : 11, color: nl ? "var(--dm-text)" : "var(--dm-sub)", width: nl ? 42 : 34, flexShrink: 0 }}>{stat.name}</span>
                  <div style={{ flex: 1, height: 6, background: "var(--dm-row)", borderRadius: 4, overflow: "hidden", minWidth: 0 }}>
                    <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,var(--dm-accent, #4B6FFF),var(--dm-accent, #6C8EFF))", width: `${score}%`, transition: "width 0.4s" }} />
                  </div>
                  <span style={{ fontSize: nl ? 14 : 11, fontWeight: 900, color: "var(--dm-text)", width: nl ? 26 : 22, textAlign: "right", flexShrink: 0 }}>{score}</span>
                </div>
              );
            })}
          </div>
          )}
          {onOpenBattle && (
            <button onClick={onOpenBattle} style={{ width: '100%', marginTop: 14, background: 'var(--dm-accent-soft, rgba(167,139,250,0.15))', border: '1px solid var(--dm-accent-line, rgba(167,139,250,0.4))', borderRadius: 12, padding: nl ? '12px 0' : '10px 0', fontSize: nl ? 16 : 13, fontWeight: 900, color: nl ? 'var(--dm-accent, #8B5CF6)' : '#c4b5fd', cursor: 'pointer', fontFamily: 'inherit' }}>
              ⚔️ 배틀
            </button>
          )}
        </div>
      )}

      {/* 🔮 운세 · 로또 */}
      {(() => {
        const fl = fortuneLevel(todayFortuneScore);
        return (
        <div style={nl ? boxCard : { margin: '0 16px 10px' }}>
          {nl ? <SectionHeading icon="sparkle" style={{ paddingTop: 0, marginBottom: 10 }}>운세 · 로또</SectionHeading> : <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--dm-muted)', letterSpacing: '0.06em', marginBottom: 8, paddingTop: 4 }}>🔮 운세 · 로또</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { if (!fortuneData && birthDate) loadFortune(); setFortuneModalOpen(true); history.pushState({ modal: 'fortune' }, ''); }}
              style={{ flex: 1, background: `${fl.color}22`, border: `1px solid ${fl.color}55`, borderRadius: 12, padding: nl ? '7px 12px' : '9px 12px', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ fontSize: nl ? 13 : 10, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: 3 }}>오늘의 운세</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: nl ? 18 : 15, fontWeight: 900, color: fl.color }}>{fl.label}</span>
                <span style={{ fontSize: nl ? 13 : 11, color: 'var(--dm-muted)' }}>{fl.desc}</span>
              </div>
            </button>
            <div style={{ flex: 1.2, background: nl ? 'var(--dm-input)' : 'var(--dm-card)', border: '1px solid var(--dm-border)', borderRadius: 12, padding: nl ? '7px 10px' : '9px 12px', minWidth: 0 }}>
              <div style={{ fontSize: nl ? 13 : 10, color: 'var(--dm-muted)', fontWeight: 700, marginBottom: nl ? 4 : 5 }}>🎱 오늘의 로또</div>
              {lottoNums ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                  {lottoNums.map((n, i) => {
                    const bg = n <= 10 ? "#F87171" : n <= 20 ? "#FBBF24" : n <= 30 ? "#4ADE80" : n <= 40 ? "#60A5FA" : "#A78BFA";
                    return <div key={i} style={{ aspectRatio: '1', borderRadius: 999, background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900 }}>{n}</div>;
                  })}
                </div>
              ) : (
                <button onClick={drawLotto} disabled={lottoAnim} className={nl ? 'dm-hit-y' : undefined}
                  style={{ background: lottoAnim ? 'var(--dm-input)' : 'var(--dm-btn-bg, linear-gradient(135deg,#7C3AED,#A78BFA))', border: 'none', borderRadius: 8, padding: nl ? 0 : '6px 0', height: nl ? 34 : undefined, fontSize: nl ? UI.sub : 12, color: '#fff', fontWeight: 700, cursor: 'pointer', width: '100%' }}>
                  {lottoAnim ? '추출 중...' : '번호 뽑기'}
                </button>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      <UndoBar bar={undo.bar} onUndo={undo.run} zIndex={1100} />
      {/* ── 운세 팝업 모달 ──────────────────────────────────── */}
      {fortuneModalOpen && (() => {
        const isFsTab = fortuneTab === 'saju' || fortuneTab === 'tojeong';
        return (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.75)", display: "flex", alignItems: isFsTab ? "stretch" : "flex-end", justifyContent: "center" }}
          onClick={() => setFortuneModalOpen(false)}>
          <div style={{ background: "var(--dm-card)", border: "1px solid rgba(255,255,255,.1)", borderRadius: isFsTab ? 0 : "24px 24px 0 0", padding: 0, width: "100%", maxHeight: isFsTab ? "100%" : "calc(90vh - 84px)", marginBottom: isFsTab ? 0 : 84, overflowY: "auto", display: "flex", flexDirection: "column" }}
            onClick={e => e.stopPropagation()}>
            {/* 헤더 — sticky */}
            <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--dm-card)", borderRadius: isFsTab ? 0 : "24px 24px 0 0", padding: "18px 16px 12px", borderBottom: "1px solid var(--dm-border)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: birthDate ? 12 : 0 }}>
                <div style={{ fontSize: 15, fontWeight: 900 }}>🔮 오늘의 운세 <span style={{ fontSize: 13, fontWeight: 700, color: "var(--dm-muted)", marginLeft: 4 }}>{dayLabelOf(dateStr)}</span></div>
                <button onClick={() => setFortuneModalOpen(false)}
                  style={{ background: "none", border: "none", color: "var(--dm-muted)", fontSize: 20, cursor: "pointer", padding: "0 4px" }}>✕</button>
              </div>
              {/* 탭 */}
              {birthDate && (
                <div style={{ display: "flex", gap: 4, background: "var(--dm-input)", borderRadius: 999, padding: 4 }}>
                {[{ key: 'daily', label: '오늘의 운세' }, { key: 'saju', label: '평생 사주' }, { key: 'tojeong', label: '토정비결' }].map(t => (
                  <button key={t.key} onClick={() => {
                    setFortuneTab(t.key);
                    if (t.key === 'daily' && !fortuneData) loadFortune();
                    if (t.key === 'saju' && !sajuData) loadSaju();
                    if (t.key === 'tojeong' && !tojeongData) loadTojeong();
                  }} style={{
                    flex: 1, padding: "8px 0", borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: "pointer",
                    border: "none", transition: "all .2s",
                    background: fortuneTab === t.key ? "var(--dm-accent, #6C8EFF)" : "transparent",
                    color: fortuneTab === t.key ? "#fff" : "var(--dm-muted)",
                    boxShadow: fortuneTab === t.key ? "0 2px 8px var(--dm-accent-soft, rgba(108,142,255,.4))" : "none",
                  }}>{t.label}</button>
                ))}
              </div>
              )}
            </div>
            {/* 컨텐츠 스크롤 영역 */}
            {/* 전체 화면 탭(평생 사주·토정비결)은 아래 메뉴 막대에 맨 아래가 가려져서 그만큼 더 띄운다 (2026-11-12 사용자 제보) */}
            <div style={{ padding: isFsTab ? "16px 16px calc(120px + env(safe-area-inset-bottom, 0px))" : "16px 16px 24px", overflowY: "auto" }}>
            {!birthDate ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 13, color: "var(--dm-muted)", marginBottom: 12 }}>생년월일을 입력하면 오늘의 운세를 볼 수 있어요</div>
                <button onClick={() => { setFortuneModalOpen(false); onOpenSettings?.(); }}
                  style={{ ...S.btn, width: "auto", padding: "10px 24px", fontSize: 13 }}>⚙️ 설정에서 입력하기</button>
              </div>
            ) : fortuneLoading ? (
              <div style={{ padding: "4px 0" }}>
                <div style={{ textAlign: 'center', padding: '18px 0 14px' }}>
                  <div className="dm-spin" style={{ fontSize: 36 }}>🔮</div>
                  <div style={{ fontSize: 13, color: 'var(--dm-muted)', marginTop: 10, fontWeight: 700 }}>운세를 읽는 중<span style={{ display: 'inline-block', minWidth: 18, textAlign: 'left' }}>...</span></div>
                </div>
                <div className="dm-skeleton" style={{ height: 80, borderRadius: 14, marginBottom: 14 }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {[1,2,3,4].map(i => <div key={i} className="dm-skeleton" style={{ height: 72, borderRadius: 10 }} />)}
                </div>
                <div className="dm-skeleton" style={{ height: 68, borderRadius: 10, marginBottom: 10 }} />
                <div className="dm-skeleton" style={{ height: 44, borderRadius: 10, marginBottom: 10 }} />
                <div style={{ display: "flex", gap: 10 }}>
                  <div className="dm-skeleton" style={{ flex: 1, height: 52, borderRadius: 10 }} />
                  <div className="dm-skeleton" style={{ flex: 1, height: 52, borderRadius: 10 }} />
                </div>
              </div>
            ) : fortuneError ? (
              <div style={{ textAlign: "center", padding: "24px 16px" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>😶‍🌫️</div>
                <div style={{ fontSize: 13, color: "var(--dm-muted)", marginBottom: 14 }}>운세를 불러오지 못했어요.<br/>네트워크를 확인하고 다시 시도해보세요.</div>
                <button onClick={loadFortune} style={{ ...S.btn, width: "auto", padding: "10px 24px", fontSize: 13 }}>🔄 다시 시도</button>
              </div>
            ) : fortuneTab === 'daily' ? (
              fortuneData ? (() => {
                const cats = [
                  { label: "전체운", val: fortuneData.overall || 3 },
                  { label: "금전운", val: fortuneData.money || 3 },
                  { label: "건강운", val: fortuneData.health || 3 },
                  { label: "인간관계", val: fortuneData.relation || 3 },
                ];
                const avgScore = avgFortuneScore(fortuneData);
                const totalFortunePts = avgScore ? Math.round(avgScore * 20) : 0;
                const scoreColor = fortuneLevel(avgScore).color;
                return (
                  <div style={S.card}>
                    {/* 주간 운세 히스토리 미니 차트 */}
                    {fortuneWeekHistory.some(d => d.overall !== null) && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 6, textAlign: "center" }}>7일 운세 흐름</div>
                        <div style={{ display: "flex", gap: 4, alignItems: "flex-end", justifyContent: "center", height: 36 }}>
                          {fortuneWeekHistory.map((d, i) => {
                            const pts = d.overall ? d.overall * 20 : 0;
                            const isToday = i === 6;
                            const barColor = pts >= 80 ? "#4ADE80" : pts >= 60 ? "#FCD34D" : pts > 0 ? "#F87171" : "var(--dm-row)";
                            return (
                              <div key={d.dateStr} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: 1 }}>
                                <div style={{ width: "100%", maxWidth: 28, height: d.overall ? `${Math.max(4, pts * 0.32)}px` : 4, background: barColor, borderRadius: 3, opacity: isToday ? 1 : 0.6, border: isToday ? `1.5px solid ${barColor}` : "none" }} />
                                <div style={{ fontSize: 9, color: isToday ? "var(--dm-text)" : "var(--dm-muted)", fontWeight: isToday ? 900 : 400 }}>{d.dow}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, gap: 12 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 2 }}>종합 운세 점수</div>
                        <div style={{ fontSize: 36, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{totalFortunePts}<span style={{ fontSize: 16 }}>점</span></div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                      {cats.map(item => {
                        const pct = item.val * 20;
                        const c = pct >= 80 ? "#4ADE80" : pct >= 60 ? "#FCD34D" : "#F87171";
                        return (
                          <div key={item.label} style={{ background: "var(--dm-input)", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                              <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>{item.label}</div>
                              <div style={{ fontSize: 13, fontWeight: 900, color: c }}>{pct}점</div>
                            </div>
                            <div style={{ fontSize: 13, color: "#FCD34D", letterSpacing: 1, marginBottom: 4 }}>{starRating(item.val)}</div>
                            <div style={{ height: 4, background: "var(--dm-row)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: c, borderRadius: 2, transition: "width 0.4s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--dm-text)", lineHeight: 1.7, marginBottom: 12 }}>{fortuneData.message}</div>
                    <div style={{ background: "var(--dm-input)", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-accent, #6C8EFF)", marginBottom: 4 }}>💡 오늘의 조언</div>
                      <div style={{ fontSize: 13, color: "var(--dm-text)" }}>{fortuneData.advice}</div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <div style={{ flex: 1, background: "var(--dm-input)", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>행운의 색</div>
                        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 2 }}>{fortuneData.luckyColor}</div>
                      </div>
                      <div style={{ flex: 1, background: "var(--dm-input)", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700 }}>행운의 숫자</div>
                        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 2 }}>{fortuneData.luckyNumber}</div>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div style={{ textAlign: "center", padding: "20px 16px" }}>
                  <button onClick={loadFortune} style={{ ...S.btn, width: "auto", padding: "10px 24px" }}>🔮 오늘의 운세 보기</button>
                </div>
              )
            ) : fortuneTab === 'saju' ? (
              sajuData ? (
                <div style={S.card}>
                  <div style={{ background: "var(--dm-input)", borderRadius: 10, padding: "10px 14px", marginBottom: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 2 }}>사주팔자</div>
                    <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 2 }}>{sajuData.pillars}</div>
                    <div style={{ fontSize: 12, color: "var(--dm-accent, #6C8EFF)", marginTop: 4 }}>일간: {sajuData.dayMaster}</div>
                  </div>
                  {[
                    { label: "🧠 성격 & 기질", content: sajuData.personality },
                    { label: "💼 적합한 직업", content: sajuData.career },
                    { label: "💰 재물운", content: sajuData.wealth },
                    { label: "❤️ 건강", content: sajuData.health },
                    { label: "🌟 인생 조언", content: sajuData.lifeAdvice },
                  ].map(sec => (
                    <div key={sec.label} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-sub)", marginBottom: 4 }}>{sec.label}</div>
                      <div style={{ fontSize: 13, color: "var(--dm-text)", lineHeight: 1.7 }}>{sec.content}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 16px" }}>
                  <button onClick={loadSaju} style={{ ...S.btn, width: "auto", padding: "10px 24px" }}>🌟 평생 사주 보기</button>
                </div>
              )
            ) : (
              tojeongData && (tojeongData.year ?? new Date().getFullYear()) === new Date().getFullYear() ? (
                <div style={S.card}>
                  <div style={{ background: "var(--dm-input)", borderRadius: 10, padding: "12px 14px", marginBottom: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 2 }}>{new Date().getFullYear()}년 토정비결</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: "#FCD34D" }}>{tojeongData.hexagram}</div>
                    <div style={{ fontSize: 13, color: "var(--dm-text)", marginTop: 6 }}>{tojeongData.summary}</div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--dm-text)", lineHeight: 1.8, marginBottom: 12 }}>{tojeongData.overall}</div>
                  {/* 1~12월 운세 (2026-11-12 사용자 요청 — 서버는 예전부터 받아 오는데 화면에 안 보였다). 이번 달은 강조 */}
                  {Array.isArray(tojeongData.monthly) && tojeongData.monthly.length > 0 && (
                    <div style={{ marginTop: 4, marginBottom: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: "var(--dm-text)", marginBottom: 8 }}>📅 달마다 운세</div>
                      {tojeongData.monthly.map((m) => {
                        const now = Number(m.month) === new Date().getMonth() + 1;
                        return (
                          <div key={m.month} style={{ display: "flex", gap: 10, padding: "8px 10px", borderRadius: 10, marginBottom: 4, background: now ? "rgba(252,211,77,.12)" : "transparent", border: now ? "1px solid rgba(252,211,77,.45)" : "1px solid transparent" }}>
                            <span style={{ flexShrink: 0, width: 36, fontSize: 13, fontWeight: 900, color: now ? "#F59E0B" : "var(--dm-muted)" }}>{m.month}월</span>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--dm-text)", lineHeight: 1.7 }}>{m.fortune}{now ? <b style={{ color: "#F59E0B" }}> · 이번 달</b> : null}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {tojeongData.caution && (
                    <div style={{ fontSize: 13, color: "var(--dm-text)", lineHeight: 1.8, marginBottom: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 4 }}>⚠️ 주의할 점</div>
                      {tojeongData.caution}
                    </div>
                  )}
                  {!Array.isArray(tojeongData.monthly) && (
                    <button onClick={loadTojeong} disabled={fortuneLoading} style={{ ...S.btn, marginTop: 0, marginBottom: 10 }}>🔄 달마다 운세까지 다시 보기</button>
                  )}
                  {tojeongData.advice && (
                    <div style={{ background: "var(--dm-input)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 800, color: "var(--dm-text)", lineHeight: 1.7 }}>
                      💡 {tojeongData.advice}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 16px" }}>
                  <button onClick={loadTojeong} style={{ ...S.btn, width: "auto", padding: "10px 24px" }}>📖 토정비결 보기</button>
                </div>
              )
            )}
            {/* ── 로또 번호 (운세 탭 하단) ── */}
            {fortuneTab === 'daily' && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--dm-border)", paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-sub)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  🎱 오늘의 로또 번호
                  {lottoNums && <span style={{ fontSize: 10, color: "var(--dm-muted)", fontWeight: 400 }}>· 오늘 1회 추출 완료</span>}
                </div>
                {lottoNums ? (
                  <>
                    {todayFortuneScore >= 80 && (
                      <div style={{ fontSize: 11, color: "#FBBF24", fontWeight: 700, marginBottom: 8 }}>🍀 오늘 운이 좋으니 한번 사보세요!</div>
                    )}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {lottoNums.map((n, i) => {
                        const bg = n <= 10 ? "#F87171" : n <= 20 ? "#FBBF24" : n <= 30 ? "#4ADE80" : n <= 40 ? "#60A5FA" : "#A78BFA";
                        return (
                          <div key={i} style={{ width: 36, height: 36, borderRadius: 999, background: bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, boxShadow: `0 2px 8px ${bg}66` }}>{n}</div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--dm-muted)" }}>{drawDayLabel(dateStr)} 추첨용 · 내일 새 번호를 뽑을 수 있어요</span>
                      {onAddMemo && (
                        <button onClick={saveLottoMemo} disabled={!!lottoMemoId}
                          style={{ flexShrink: 0, height: 36, padding: "0 12px", borderRadius: 10, border: "1.5px solid var(--dm-accent, #5B7CFA)", background: lottoMemoId ? "transparent" : "var(--dm-accent-soft, rgba(91,124,250,.12))", color: "var(--dm-accent, #5B7CFA)", fontSize: 13, fontWeight: 800, cursor: lottoMemoId ? "default" : "pointer", opacity: lottoMemoId ? 0.7 : 1 }}>
                          {lottoMemoId ? "✓ 메모에 있음" : "📋 메모로"}
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <button onClick={drawLotto} disabled={lottoAnim} className={nl ? 'dm-hit-y' : undefined}
                    style={{ ...S.btn, background: lottoAnim ? "var(--dm-input)" : "linear-gradient(135deg,#7C3AED,#A78BFA)", fontSize: 14, marginTop: 0 }}>
                    {lottoAnim ? "🎱 추출 중..." : "🎱 번호 뽑기"}
                  </button>
                )}
              </div>
            )}
            </div>
          </div>
        </div>
        );
      })()}

      {xpHelpOpen && (() => {
        const LEVELS = Array.from({ length: 21 }, (_, i) => {
          const lv = i + 1;
          const floor = Math.pow(lv - 1, 2) * 100;
          return { lv, icon: LEVEL_ICONS[i], title: LEVEL_TITLES[i], floor };
        });
        const XP_ITEMS = [
          { label: '할일 완료 1개', pt: '+10 XP' },
          { label: '할일 전체 완료 보너스', pt: '+20 XP' },
          { label: '습관 체크 1개', pt: '+5 XP' },
          { label: '습관 전체 완료 보너스', pt: '+15 XP' },
          { label: '일기/메모 작성', pt: '+15 XP' },
          { label: '완벽한 하루 달성', pt: '+25 XP' },
          { label: '7일 연속 보너스', pt: '+50 XP~' },
          { label: '타이머 챌린지 (5/15/25/50분)', pt: '5·15·30·70 XP' },
        ];
        return (
          <div onClick={() => setXpHelpOpen(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
            zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 20px",
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "var(--dm-bg)", border: "1px solid var(--dm-border2)",
              borderRadius: 22, width: "100%", maxWidth: 360,
              maxHeight: "80vh", display: "flex", flexDirection: "column",
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              animation: "modalPop 0.18s ease-out", overflow: "hidden",
            }}>
              <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid var(--dm-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "var(--dm-text)" }}>⚡ XP & 레벨 안내</div>
                <button onClick={() => setXpHelpOpen(false)} style={{ background: "transparent", border: "none", color: "var(--dm-muted)", fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>
                <div style={{ background: "linear-gradient(135deg,var(--dm-accent-soft, rgba(75,111,255,.15)),var(--dm-accent-soft, rgba(108,142,255,.07)))", border: "1.5px solid var(--dm-accent-line, rgba(108,142,255,.3))", borderRadius: 14, padding: "14px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 36 }}>{levelInfo.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "var(--dm-text)" }}>{levelInfo.title} · Lv.{levelInfo.level}</div>
                    <div style={{ fontSize: 11, color: "var(--dm-accent, #6C8EFF)", fontWeight: 700, marginTop: 2 }}>{totalScore.toLocaleString()} XP 보유</div>
                    <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 1 }}>다음 레벨까지 {(levelInfo.nextFloor - totalScore).toLocaleString()} XP 남음</div>
                  </div>
                </div>

                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-sub)", marginBottom: 8 }}>📌 XP 획득 방법</div>
                <div style={{ borderRadius: 12, border: "1px solid var(--dm-border)", overflow: "hidden", marginBottom: 18 }}>
                  {XP_ITEMS.map((it, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px",
                      background: i % 2 === 0 ? "transparent" : "var(--dm-row)",
                      borderBottom: i < XP_ITEMS.length - 1 ? "1px solid var(--dm-border)" : "none" }}>
                      <span style={{ fontSize: 13, color: "var(--dm-text)" }}>{it.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-accent, #6C8EFF)" }}>{it.pt}</span>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--dm-sub)", marginBottom: 8 }}>🏆 전체 등급표</div>
                <div style={{ borderRadius: 12, border: "1px solid var(--dm-border)", overflow: "hidden" }}>
                  {LEVELS.map((lv, i) => {
                    const isCurrent = lv.lv === levelInfo.level;
                    return (
                      <div key={lv.lv} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                        background: isCurrent ? "var(--dm-accent-soft, rgba(75,111,255,.15))" : i % 2 === 0 ? "transparent" : "var(--dm-row)",
                        borderBottom: i < LEVELS.length - 1 ? "1px solid var(--dm-border)" : "none",
                        border: isCurrent ? "1.5px solid var(--dm-accent-line, rgba(108,142,255,.5))" : undefined,
                      }}>
                        <span style={{ fontSize: 18 }}>{lv.icon}</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: isCurrent ? 900 : 700, color: isCurrent ? "var(--dm-accent, #6C8EFF)" : "var(--dm-text)" }}>
                            Lv.{lv.lv} {lv.title}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: isCurrent ? "var(--dm-accent, #6C8EFF)" : "var(--dm-muted)", fontWeight: 700 }}>
                          {lv.floor.toLocaleString()} XP~
                        </span>
                        {isCurrent && <span style={{ fontSize: 10, background: "var(--dm-accent, #4B6FFF)", color: "#fff", borderRadius: 999, padding: "2px 7px", fontWeight: 900 }}>현재</span>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ height: 8 }} />
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
