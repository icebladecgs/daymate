import { useCallback, useEffect, useState } from "react";
import S from "../styles.js";
import BattleStage from "../components/battle/BattleStage.jsx";
import { tierOfLevel } from "../components/battle/armor.js";
import { RARITIES, itemEffects, BAG_MAX, BATTLE_GOLD_CAP } from "../utils/gear.js";
import { store } from "../utils/storage.js";
import { getNpcById, getNpcAvatar, getNpcBasicMove } from "../data/battle/npcs.js";
import { PLAYER_BASIC_MOVES, SPECIALS_TIER10 } from "../data/battle/specials.js";
import { GROWTH_STATS } from "../data/growthStats.js";
import { createPlayerFighter, createNpcFighter, createBattleState, resolveRoundFirstTurn, resolveRoundSecondTurn, getAvailableSpecials, calcBattleReward, getTurnOrderChance, pickAutoAction } from "../data/battle/engine.js";

// 선공 결과를 보여준 뒤 후공까지의 간격 — 전투 장면을 볼 때는 선공 동작(0.6초)이 끝날 즈음, 생략하면 짧게
const ROUND_GAP_MS = 700;
const ROUND_GAP_SKIP_MS = 350;
const SKIP_KEY = 'dm_battle_skip_scene'; // 전투 장면 생략 (기기마다 기억)
const AUTO_KEY = 'dm_battle_auto'; // 자동 배틀 (기기마다 기억)

const FLASH_COLOR = {
  crit: 'rgba(252,211,77,0.55)',   // 크리티컬 — 노랑
  attack: 'rgba(248,113,113,0.45)', // 공격형 스페셜 — 빨강
  heal: 'rgba(74,222,128,0.4)',     // 회복형 스페셜 — 초록
  shield: 'rgba(96,165,250,0.4)',   // 보호막형 스페셜 — 파랑
  buff: 'rgba(167,139,250,0.45)',   // 버프형 스페셜 — 보라
};

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

// 로그 한 줄의 색/굵기 — 내 공격은 파랑, 상대 공격은 빨강 계열로 기본 구분하고
// 크리티컬·스페셜(회복/보호막/버프)은 그 위에 타입별 색으로 강조해서 한눈에 어떤 공격인지 보이게 한다
function logLineStyle(entry) {
  if (entry.kind === 'result') {
    return { color: entry.text.includes('격파') ? '#4ADE80' : '#F87171', fontWeight: 900 };
  }
  if (entry.kind === 'miss' || entry.kind === 'fumble') {
    return { color: 'var(--dm-muted)', fontStyle: 'italic' };
  }
  const sideColor = entry.side === 'player' ? '#6C8EFF' : entry.side === 'npc' ? '#F87171' : 'var(--dm-sub)';
  if (entry.kind === 'attack' && entry.crit) return { color: '#FCD34D', fontWeight: 900 };
  if (entry.kind === 'attack' && entry.special) return { color: sideColor, fontWeight: 700 };
  if (entry.kind === 'heal') return { color: '#4ADE80', fontWeight: 700 };
  if (entry.kind === 'shield') return { color: '#60A5FA', fontWeight: 700 };
  if (entry.kind === 'buff') return { color: '#A78BFA', fontWeight: 700 };
  if (entry.kind === 'regen') return { color: '#4ADE80' };
  return { color: sideColor };
}

// ── 좌우 캐릭터 칸 (왼쪽 나, 오른쪽 상대) ──
// 공격을 받으면 그 칸이 흔들리고 숫자가 튀어 오른다. 회복·보호막·버프는 행동한 쪽에 표시.
const PLAYER_AVATAR = '😎';

function FighterPanel({ side, label, fighter, color, avatar, pops, onPopEnd, shakeKey, callout }) {
  const pct = fighter.energyMax > 0 ? Math.max(0, Math.round((fighter.energy / fighter.energyMax) * 100)) : 0;
  return (
    <div key={shakeKey || 'still'} className={shakeKey ? 'dm-battle-shake' : ''}
      style={{ position: 'relative', flex: 1, minWidth: 0, textAlign: 'center', padding: '10px 6px 8px', borderRadius: 14,
        background: side === 'player' ? 'rgba(75,111,255,.08)' : 'rgba(248,113,113,.08)',
        border: `1.5px solid ${side === 'player' ? 'rgba(75,111,255,.3)' : 'rgba(248,113,113,.3)'}` }}>
      <div style={{ fontSize: 38, lineHeight: 1.1, opacity: fighter.energy <= 0 ? 0.35 : 1 }}>{fighter.energy <= 0 ? '😵' : avatar}</div>
      <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--dm-text)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--dm-muted)', marginBottom: 6 }}>
        Lv.{fighter.level}{fighter.shield ? ' · 🛡️' : ''}{fighter.critGuaranteed ? ' · ⚡' : ''}
      </div>
      <div style={{ height: 10, background: 'var(--dm-row)', borderRadius: 6, overflow: 'hidden', display: 'flex', justifyContent: side === 'npc' ? 'flex-end' : 'flex-start' }}>
        <div style={{ height: '100%', borderRadius: 6, background: color, width: `${pct}%`, transition: 'width 0.35s' }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--dm-sub)', marginTop: 4 }}>
        {fighter.energy.toLocaleString()} / {fighter.energyMax.toLocaleString()}
      </div>
      {callout && (
        <div key={callout.key} className="dm-battle-callout" style={{ color: callout.color, borderColor: callout.color }}>{callout.text}</div>
      )}
      {pops.map(p => (
        <div key={p.key} className="dm-battle-pop" onAnimationEnd={() => onPopEnd(side, p.key)}
          style={{ color: p.color, fontSize: p.big ? 26 : 20 }}>{p.text}</div>
      ))}
    </div>
  );
}

// 칸 안 한 줄 모양 — 좁은 칸이라 줄바꿈 허용, 크리티컬은 주황, 빗나감·실수는 흐리게
function cellStyle(e) {
  return {
    lineHeight: 1.45, wordBreak: 'keep-all', overflowWrap: 'anywhere', padding: '1px 0',
    ...(e.crit ? { color: '#F59E0B' } : {}),
    ...(e.kind === 'miss' || e.kind === 'fumble' ? { color: 'var(--dm-muted)', fontWeight: 600 } : {}),
    ...(e.kind === 'heal' || e.kind === 'regen' ? { color: '#22C55E' } : {}),
  };
}

// 라운드 기록 칸의 설명 문장 — 누가 했는지는 칸 위치(왼쪽 나, 오른쪽 상대)로 보이므로 이름은 뺀다
function actionLabel(e) {
  const tags = [e.crit && '크리티컬!', e.awaken && '각성!'].filter(Boolean).join(' ');
  switch (e.kind) {
    case 'attack': return `${e.crit ? '💥' : e.special ? '✨' : '⚔️'} ${e.move} → ${tags ? tags + ' ' : ''}${e.amount} 데미지`;
    case 'miss': return `💨 ${e.move} → 빗나감`;
    case 'fumble': return `😵 ${e.move} → 실수! 공격 무효`;
    case 'heal': return `💚 ${e.move} → Energy +${e.amount}`;
    case 'regen': return `🌱 복리 효과 → Energy +${e.amount}`;
    case 'shield': return `🛡️ ${e.move} → 보호막 준비`;
    case 'buff': return `⚡ ${e.move} → 다음 공격 크리티컬`;
    default: return e.text;
  }
}

// 방금 추가된 기록 한 줄이 화면에 만드는 효과: 어느 칸에 무엇을 띄우고, 어느 칸을 흔들지
function effectOf(e) {
  const other = e.side === 'player' ? 'npc' : 'player';
  switch (e.kind) {
    case 'attack':
      return { popSide: other, shake: other, text: e.crit ? `💥 -${e.amount}` : `-${e.amount}`, color: e.crit ? '#FCD34D' : '#F87171', big: e.crit || e.special };
    case 'miss': return { popSide: other, text: '회피!', color: '#94A3B8' };
    case 'fumble': return { popSide: e.side, text: '실수!', color: '#94A3B8' };
    case 'heal': return { popSide: e.side, text: `+${e.amount}`, color: '#4ADE80', big: true };
    case 'regen': return { popSide: e.side, text: `+${e.amount}`, color: '#4ADE80' };
    case 'shield': return { popSide: e.side, text: '🛡️', color: '#60A5FA', big: true };
    case 'buff': return { popSide: e.side, text: '⚡', color: '#A78BFA', big: true };
    default: return null;
  }
}

// 행동한 쪽 칸 위에 잠깐 뜨는 기술 외침 ("🍻 폭탄주 러시!", "🧠 분석!")
function calloutOf(e, specialIcon) {
  if (!e.move || !e.side) return null;
  const icon = ['attack', 'miss', 'fumble'].includes(e.kind) && !e.special ? '⚔️' : (specialIcon || '✨');
  const tail = e.kind === 'attack' && e.crit ? ' 크리티컬!' : e.kind === 'attack' && e.awaken ? ' 각성!' : '!';
  const color = e.kind === 'heal' ? '#4ADE80' : e.kind === 'shield' ? '#60A5FA' : e.kind === 'buff' ? '#A78BFA' : e.crit ? '#F59E0B' : e.side === 'player' ? '#4B6FFF' : '#EF4444';
  return { text: `${icon} ${e.move}${tail}`, color };
}

// 새로 추가된 기록에 라운드 번호를 붙인다 (선공·후공 모두 같은 라운드)
function tagRound(prevLog, nextLog, round) {
  return [...prevLog, ...nextLog.slice(prevLog.length).map(e => ({ ...e, round }))];
}

// gear: 끼운 장비 효과(utils/gear.js gearBonus), npcOverride: 떠돌이 도전자처럼 NPC 목록에 없는 상대 (2026-11-08)
export default function Battle({ totalScore, statXp, npcId, battleNickname, onExit, onBattleEnd, gear = null, npcOverride = null, bag = [], bagMax = BAG_MAX, gold = 0 }) {
  const playerLabel = battleNickname?.trim() || '나';
  const npcDef = npcOverride || getNpcById(npcId);
  const npcAvatar = npcOverride?.emoji || getNpcAvatar(npcId);
  // 기본공격 이름: 나는 가장 높은 능력치, 상대는 전용 기술 (표시용)
  const makeState = () => {
    const p = createPlayerFighter(totalScore, statXp, gear);
    const n = createNpcFighter(npcDef || { id: 'unknown', level: 1, name: '???', energyMax: 100, stats: {}, trait: null });
    return createBattleState({ ...p, basicMove: PLAYER_BASIC_MOVES[p.primaryStat] || '기본공격' }, { ...n, basicMove: npcDef?.basicMove || getNpcBasicMove(n.id) });
  };
  const [state, setState] = useState(makeState);
  const [resolving, setResolving] = useState(false);
  const [flash, setFlash] = useState(null);
  const [showStats, setShowStats] = useState(() => store.get('dm_battle_stats_open', true) !== false); // 능력치 비교 접기 (기기마다 기억)
  const toggleStats = () => setShowStats(v => { store.set('dm_battle_stats_open', !v); return !v; });
  const [pops, setPops] = useState({ player: [], npc: [] }); // 칸마다 튀어 오르는 숫자
  const [shake, setShake] = useState({ player: null, npc: null }); // 흔들 칸 (key가 바뀔 때마다 다시 흔들림)
  const [callouts, setCallouts] = useState({ player: null, npc: null }); // 칸 위 기술 외침
  const [narration, setNarration] = useState(null); // 두 칸 아래 해설 한 줄 (방금 일어난 일)
  const removePop = (side, key) => setPops(prev => ({ ...prev, [side]: prev[side].filter(p => p.key !== key) }));
  // 전투 장면(기본) — 새 기록을 차례로 재생. 생략하면 예전 좌우 칸 화면
  const [skipScene, setSkipScene] = useState(() => store.get(SKIP_KEY, false) === true);
  const [auto, setAuto] = useState(() => store.get(AUTO_KEY, false) === true);
  const [stageEvents, setStageEvents] = useState([]);
  const [stageBusy, setStageBusy] = useState(false);
  const onStageBusy = useCallback((b) => setStageBusy(b), []);
  const toggleSkip = () => {
    // 바꿀 때 예전 칸의 숫자·흔들림을 비운다 (장면을 보는 동안엔 쌓이지 않지만, 혹시 남은 것 정리)
    setPops({ player: [], npc: [] }); setShake({ player: null, npc: null }); setCallouts({ player: null, npc: null });
    setSkipScene(v => { store.set(SKIP_KEY, !v); return !v; });
  };

  useEffect(() => {
    if (!npcDef) return;
    if (state.status !== 'ongoing') setEndInfo(onBattleEnd(npcDef, state.status === 'win') || null);
  }, [state.status]); // eslint-disable-line
  // 승리 보상(떠돌이 도전자·레벨별 상대 모두) — 이 판을 시작할 때 가방에 없던 장비가 생기면 승리 카드에 보여 준다(전투 화면엔 알림 표시가 없다)
  const [startBagIds, setStartBagIds] = useState(() => new Set((bag || []).map(x => x.id)));
  const reward = npcDef && state.status === 'win' ? (bag || []).find(x => !startBagIds.has(x.id)) || null : null;
  // 🪙 이긴 판에 받은 골드 — 시작할 때 골드와 비교 (2026-11-10, 하루 상한을 넘으면 0)
  const [startGold, setStartGold] = useState(gold);
  const [endInfo, setEndInfo] = useState(null); // onBattleEnd가 돌려준 골드 계산 이유(난수 %·강한 상대 배수)
  const goldGain = npcDef && state.status === 'win' ? Math.max(0, gold - startGold) : 0;

  const { player, npc, status, log } = state;
  // 라운드별로 묶어서 최신 라운드가 위로 (각 칸 = 그 라운드에서 그쪽이 한 행동)
  const rounds = [];
  log.forEach(e => {
    if (!e.side && e.kind !== 'result') return; // "배틀 시작!" 같은 안내 줄은 라운드 칸을 만들지 않는다 (빈 "1R" 줄이 보였다)
    const n = e.round || 1;
    let r = rounds.find(x => x.round === n);
    if (!r) { r = { round: n, player: [], npc: [], result: null, all: [] }; rounds.push(r); }
    r.all.push(e);
    if (e.kind === 'result') r.result = e;
    else if (e.side === 'player') r.player.push(e);
    else if (e.side === 'npc') r.npc.push(e);
  });
  rounds.sort((a, b) => b.round - a.round);
  const availableSpecials = getAvailableSpecials(player);
  const playerFirstChance = Math.round(getTurnOrderChance(player, npc) * 100);

  // 방금 새로 추가된 로그 항목들에 대해 진동/색 효과를 판정
  const triggerEffects = (prevLog, newLog) => {
    const added = newLog.slice(prevLog.length);
    setStageEvents(prev => [...prev, ...added.map(entry => {
      const special = entry.special || ['heal', 'shield', 'buff'].includes(entry.kind);
      const sp = special ? Object.values(SPECIALS_TIER10).find(x => x.name === entry.move) : null;
      return { key: Date.now() + Math.random(), entry, icon: sp?.icon };
    })]);
    added.forEach(entry => {
      const special = entry.special || ['heal', 'shield', 'buff'].includes(entry.kind);
      const sp = special ? Object.values(SPECIALS_TIER10).find(x => x.name === entry.move) : null;
      // 예전 좌우 칸의 외침·숫자·흔들림은 장면을 생략했을 때만 (장면을 볼 땐 그 칸이 안 보여서 숫자가 쌓이기만 한다)
      const co = skipScene ? calloutOf(entry, sp?.icon) : null;
      if (co) setCallouts(prev => ({ ...prev, [entry.side]: { ...co, key: Date.now() + Math.random() } }));
      if (entry.kind !== 'regen') setNarration({ key: Date.now() + Math.random(), entry });
      const fx = skipScene ? effectOf(entry) : null;
      if (fx) {
        const key = Date.now() + Math.random();
        setPops(prev => ({ ...prev, [fx.popSide]: [...prev[fx.popSide], { key, text: fx.text, color: fx.color, big: fx.big }] }));
        if (fx.shake) setShake(prev => ({ ...prev, [fx.shake]: key }));
      }
      if (entry.kind === 'attack' && entry.crit) {
        vibrate([40, 30, 40]);
        if (skipScene) setFlash({ key: Date.now() + Math.random(), color: FLASH_COLOR.crit });
      } else if (entry.kind === 'attack' && entry.special) {
        vibrate(25);
        if (skipScene) setFlash({ key: Date.now() + Math.random(), color: FLASH_COLOR.attack });
      } else if (entry.kind === 'heal' || entry.kind === 'shield' || entry.kind === 'buff') {
        vibrate(20);
        if (skipScene) setFlash({ key: Date.now() + Math.random(), color: FLASH_COLOR[entry.kind] });
      }
    });
  };

  const busy = resolving || (!skipScene && stageBusy); // 장면이 재생되는 동안은 다음 공격을 막는다(합이 겹치지 않게)
  const act = (action) => {
    if (status !== 'ongoing' || busy) return;
    const prevLog = state.log;
    const firstRaw = resolveRoundFirstTurn(state, action, playerLabel);
    const first = { ...firstRaw, log: tagRound(prevLog, firstRaw.log, state.round) };
    setState(first);
    triggerEffects(prevLog, first.log);
    if (first.status !== 'ongoing') return; // 선공만으로 승부가 났다면 후공 없이 종료
    setResolving(true);
    setTimeout(() => {
      setState(prev => {
        const secondRaw = resolveRoundSecondTurn(prev, action, playerLabel);
        const second = { ...secondRaw, log: tagRound(prev.log, secondRaw.log, prev.round) };
        triggerEffects(prev.log, second.log);
        return second;
      });
      setResolving(false);
    }, skipScene ? ROUND_GAP_SKIP_MS : ROUND_GAP_MS);
  };

  // ▶ 자동 배틀 (2026-11-08) — 켜면 내 차례마다 알아서 고른다(pickAutoAction). 이 기기에 기억해서 다음 배틀도 자동으로 시작
  useEffect(() => {
    if (!auto || state.status !== 'ongoing' || busy) return undefined;
    const t = setTimeout(() => act(pickAutoAction(state.player, state.npc)), skipScene ? 250 : 450);
    return () => clearTimeout(t);
  }, [auto, state, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleAuto = () => setAuto(v => { store.set(AUTO_KEY, !v); return !v; });

  // 상대를 못 찾으면 — 훅(useState·useEffect)을 모두 부른 뒤에 돌려준다 (자동 배틀 효과가 아래에 생기면서 옮김)
  if (!npcDef) {
    return (
      <div style={S.content}>
        <div style={S.topbar}>
          <button onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer' }}>←</button>
        </div>
        <div style={{ ...S.card, textAlign: 'center', color: 'var(--dm-muted)' }}>상대를 찾을 수 없어요</div>
      </div>
    );
  }

  const retryBattle = () => {
    setStartBagIds(new Set((bag || []).map(x => x.id)));
    setStartGold(gold);
    setEndInfo(null);
    setResolving(false);
    setFlash(null);
    setPops({ player: [], npc: [] });
    setShake({ player: null, npc: null });
    setCallouts({ player: null, npc: null });
    setNarration(null);
    setStageEvents([]);
    setState(makeState());
  };

  return (
    <div style={S.content}>
      <div style={S.topbar}>
        <button onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, paddingLeft: 8 }}>
          <div className="dm-page-title" style={S.title}>⚔️ 배틀</div>
          <div style={S.sub}>Lv.{npc.level} {npc.name} · 「{npc.trait?.label}」</div>
        </div>
      </div>

      {/* 전투 장면 생략 / 보기 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px 6px' }}>
        <button onClick={toggleSkip}
          style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid var(--dm-border)', background: 'var(--dm-input)', color: 'var(--dm-text)', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          {skipScene ? '🎬 전투 장면 보기' : '⏭ 전투 장면 생략'}
        </button>
      </div>

      {!skipScene && (
        <BattleStage events={stageEvents} player={player} npc={npc} playerLabel={playerLabel} npcLabel={npc.name}
          npcEmoji={npcAvatar} playerTier={tierOfLevel(player.level)} onBusyChange={onStageBusy} />
      )}
      {!skipScene && status === 'ongoing' && (
        <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#A78BFA', margin: '-4px 0 10px' }}>⚡ {playerLabel} 선공 확률 {playerFirstChance}%</div>
      )}

      {/* 좌우 캐릭터 칸 (전투 장면 생략 시) */}
      {skipScene && (
      <div style={{ ...S.card, position: 'relative', overflow: 'hidden' }}>
        {flash && (
          <div key={flash.key} className="dm-battle-flash" style={{ background: flash.color }} onAnimationEnd={() => setFlash(null)} />
        )}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
          <FighterPanel side="player" label={playerLabel} fighter={player} color="#4B6FFF" avatar={PLAYER_AVATAR}
            pops={pops.player} onPopEnd={removePop} shakeKey={shake.player} callout={callouts.player} />
          <div style={{ alignSelf: 'center', fontSize: 12, fontWeight: 900, color: 'var(--dm-muted)', flexShrink: 0 }}>VS</div>
          <FighterPanel side="npc" label={npc.name} fighter={npc} color="#F87171" avatar={npcAvatar}
            pops={pops.npc} onPopEnd={removePop} shakeKey={shake.npc} callout={callouts.npc} />
        </div>
        <div key={narration?.key || 'none'} className={narration ? 'dm-battle-narration' : ''}
          style={{ minHeight: 40, marginTop: 10, padding: '8px 10px', borderRadius: 10, background: 'var(--dm-input)', textAlign: 'center',
            fontSize: 14, lineHeight: 1.45, display: 'flex', alignItems: 'center', justifyContent: 'center',
            ...(narration ? logLineStyle(narration.entry) : { color: 'var(--dm-muted)', fontSize: 13 }) }}>
          {narration ? narration.entry.text : '공격 버튼을 눌러 배틀을 시작하세요'}
        </div>
        {status === 'ongoing' && (
          <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#A78BFA', marginTop: 8 }}>⚡ {playerLabel} 선공 확률 {playerFirstChance}%</div>
        )}
      </div>
      )}

      {/* 공격 버튼 — 기록이 길어져도 찾기 쉽게 캐릭터 칸 바로 아래, 라운드 기록 위 */}
      {status === 'ongoing' ? (
        <div style={{ margin: '0 16px 14px' }}>
          <button onClick={toggleAuto} aria-pressed={auto}
            style={{ width: '100%', height: 46, marginBottom: 10, border: 'none', borderRadius: 12, background: auto ? '#FF9F0A' : 'var(--dm-input)', color: auto ? '#fff' : 'var(--dm-text)', fontSize: 16, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>
            {auto ? '⏸ 자동 배틀 멈추기' : '▶ 자동 배틀'}
          </button>
        </div>
      ) : null}
      {status === 'ongoing' ? (auto ? (
        <div style={{ margin: '-4px 16px 14px', fontSize: 13, color: 'var(--dm-sub)', textAlign: 'center' }}>알아서 싸우는 중 — 위험하면 회복·보호막, 필살기가 준비되면 바로 써요</div>
      ) : (
        <div style={{ margin: '0 16px 14px', opacity: busy ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          <button onClick={() => act({ type: 'basic' })} disabled={busy} style={{ ...S.btn, marginTop: 0, marginBottom: 10, cursor: busy ? 'default' : 'pointer' }}>⚔️ 기본공격 · {player.basicMove || '기본공격'}</button>
          <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--dm-muted)', marginBottom: 8, letterSpacing: '0.06em' }}>SPECIAL</div>
          {availableSpecials.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0' }}>아직 사용 가능한 SPECIAL이 없어요 (능력치 10 이상 필요)</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {availableSpecials.map(sp => (
                <button
                  key={sp.stat}
                  disabled={sp.onCooldown || busy}
                  onClick={() => act({ type: 'special', stat: sp.stat })}
                  title={sp.desc}
                  style={{
                    background: sp.onCooldown ? 'var(--dm-input)' : 'rgba(167,139,250,0.15)',
                    border: `1px solid ${sp.onCooldown ? 'var(--dm-border)' : 'rgba(167,139,250,0.4)'}`,
                    borderRadius: 10, padding: '8px 12px', fontSize: 14, fontWeight: 800,
                    // 예전 #c4b5fd는 어두운 화면용이라 밝은 화면에서 꺼진 버튼처럼 보였다 — 양쪽에서 보이는 보라
                    color: sp.onCooldown ? 'var(--dm-muted)' : '#8B5CF6',
                    cursor: (sp.onCooldown || busy) ? 'default' : 'pointer', fontFamily: 'inherit',
                  }}
                >{sp.icon} {sp.name}{sp.onCooldown ? ' (쿨다운)' : ''}</button>
              ))}
            </div>
          )}
        </div>
      )) : !skipScene && stageBusy ? (
        <div style={{ height: 8 }} /> /* 마지막 장면(쓰러짐)이 끝난 뒤 결과를 보여 준다 */
      ) : (
        <div style={{ ...S.card, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{status === 'win' ? '🎉' : '💧'}</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: status === 'win' ? '#4ADE80' : '#F87171' }}>
            {status === 'win' ? '승리했습니다!' : '패배했습니다'}
          </div>
          {status === 'win' && (
            <div style={{ fontSize: 12, color: 'var(--dm-muted)', marginTop: 6 }}>명성 +{calcBattleReward(npc, true).fame}</div>
          )}
          {status === 'win' && (
            <div style={{ fontSize: 14, fontWeight: 800, color: goldGain ? '#FF9F0A' : 'var(--dm-muted)', marginTop: 6 }}>
              {goldGain ? `🪙 +${goldGain} 골드 · 가진 골드 ${gold}` : `🪙 오늘 배틀 골드는 다 받았어요 (하루 ${BATTLE_GOLD_CAP})`}
              {goldGain > 0 && endInfo && (
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dm-sub)', marginTop: 2 }}>
                  {endInfo.goldFirst ? '🏅 처음 이긴 상대' : `🎲 이미 이긴 상대 · ${endInfo.goldPct}% 나왔어요`}
                  {endInfo.goldMult > 1 ? ` · 💪 강한 상대 ×${endInfo.goldMult}` : endInfo.goldMult < 1 ? ' · 약한 상대라 절반' : ''}
                </div>
              )}
            </div>
          )}
          {reward && (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,159,10,.12)' }}>
              <div style={{ fontSize: 13, color: 'var(--dm-sub)' }}>🎁 {npcDef?.isWanderer ? '떠돌이 도전자 보상' : '승리 보상'}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: RARITIES[reward.rarity].color, marginTop: 2 }}>[{RARITIES[reward.rarity].label}] {reward.name}</div>
              <div style={{ fontSize: 13, color: 'var(--dm-sub)', marginTop: 2 }}>{itemEffects(reward).join(' · ')} — 배틀 화면 가방에서 끼울 수 있어요</div>
            </div>
          )}
          {status === 'win' && !reward && (bag || []).length >= bagMax && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#FF9F0A' }}>🎒 가방이 꽉 차서 장비를 못 받았어요 — 안 쓰는 장비를 팔고 다시 이기면 받아요</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={onExit} style={{ ...S.btnGhost, flex: 1, marginTop: 0 }}>나가기</button>
            <button onClick={retryBattle} style={{ ...S.btn, flex: 1, marginTop: 0 }}>다시 도전</button>
          </div>
        </div>
      )}
      {/* 능력치 비교 — 가운데 이름, 왼쪽 나(파랑)·오른쪽 상대(빨강) 막대가 마주 본다. 높은 쪽 숫자는 굵게.
          ✨는 SPECIAL을 쓸 수 있는 능력치(10 이상). 예전엔 상대 능력치만 맨 위에 있었다(2026-10-30 사용자 요청) */}
      <div style={S.card}>
        <button onClick={toggleStats} style={{ width: '100%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--dm-text)' }}>🥊 능력치 비교</span>
          <span style={{ fontSize: 13, color: 'var(--dm-muted)' }}>{showStats ? '접기 ▲' : '펼치기 ▼'}</span>
        </button>
        {showStats && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 84px minmax(0,1fr)', gap: 8, fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
              <span style={{ textAlign: 'right', color: '#4B6FFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerLabel}</span>
              <span />
              <span style={{ color: '#EF4444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{npc.name}</span>
            </div>
            {GROWTH_STATS.map(stat => {
              const mine = player.stats[stat.id] || 0;
              const theirs = npc.stats[stat.id] || 0;
              return (
                <div key={stat.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 84px minmax(0,1fr)', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: mine > theirs ? 900 : 600, color: mine > theirs ? 'var(--dm-text)' : 'var(--dm-sub)', width: 26, textAlign: 'right', flexShrink: 0 }}>{mine}</span>
                    <div style={{ flex: 1, height: 8, background: 'var(--dm-row)', borderRadius: 4, overflow: 'hidden', display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={{ height: '100%', borderRadius: 4, background: '#4B6FFF', width: `${Math.min(100, mine)}%` }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--dm-text)', whiteSpace: 'nowrap' }}>
                    {stat.icon} {stat.name}{mine >= 10 && <span title="SPECIAL 사용 가능" style={{ fontSize: 11 }}>✨</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <div style={{ flex: 1, height: 8, background: 'var(--dm-row)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 4, background: '#EF4444', width: `${Math.min(100, theirs)}%` }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: theirs > mine ? 900 : 600, color: theirs > mine ? 'var(--dm-text)' : 'var(--dm-sub)', width: 26, flexShrink: 0 }}>{theirs}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 라운드별 기록 — 왼쪽 내 행동, 오른쪽 상대 행동을 설명 문장으로 */}
      <div style={{ ...S.card, maxHeight: 260, overflowY: 'auto', padding: '8px 12px' }}>
        {rounds.length > 0 && (
          <div style={{ display: 'flex', gap: 8, fontSize: 11, fontWeight: 900, color: 'var(--dm-muted)', paddingBottom: 4, borderBottom: '1px solid var(--dm-row)' }}>
            <span style={{ width: 26, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerLabel}</span>
            <span style={{ width: 1, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{npc.name}</span>
          </div>
        )}
        {rounds.length === 0 && <div style={{ fontSize: 12, color: 'var(--dm-muted)', padding: '6px 0' }}>공격하면 라운드별 기록이 여기 표시돼요</div>}
        {rounds.map(r => (
          <div key={r.round} style={{ padding: '7px 0', borderBottom: '1px solid var(--dm-row)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--dm-muted)', width: 26, flexShrink: 0, paddingTop: 1 }}>{r.round}R</span>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#6C8EFF' }}>
                {r.player.map((e, i) => <div key={i} style={cellStyle(e)}>{actionLabel(e)}</div>)}
              </div>
              <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--dm-row)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#F87171' }}>
                {r.npc.map((e, i) => <div key={i} style={cellStyle(e)}>{actionLabel(e)}</div>)}
              </div>
            </div>
            {r.result && <div style={{ fontSize: 13, textAlign: 'center', marginTop: 4, ...logLineStyle(r.result) }}>{r.result.text}</div>}
          </div>
        ))}
      </div>

      <div style={{ height: 16 }} />
    </div>
  );
}
