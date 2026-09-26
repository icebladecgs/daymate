import { useEffect, useState } from "react";
import S from "../styles.js";
import { getNpcById } from "../data/battle/npcs.js";
import { GROWTH_STATS } from "../data/growthStats.js";
import { createPlayerFighter, createNpcFighter, createBattleState, resolveRoundFirstTurn, resolveRoundSecondTurn, getAvailableSpecials, calcBattleReward, getTurnOrderChance } from "../data/battle/engine.js";

const ROUND_GAP_MS = 1000; // 선공 결과를 보여준 뒤 후공까지의 간격

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
const NPC_AVATAR = '😈';

function FighterPanel({ side, label, fighter, color, avatar, pops, onPopEnd, shakeKey }) {
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
      {pops.map(p => (
        <div key={p.key} className="dm-battle-pop" onAnimationEnd={() => onPopEnd(side, p.key)}
          style={{ color: p.color, fontSize: p.big ? 26 : 20 }}>{p.text}</div>
      ))}
    </div>
  );
}

// 라운드 기록의 짧은 표시 (아이콘+숫자) — 좁은 좌우 칸에서도 한 줄로
function shortLabel(e) {
  switch (e.kind) {
    case 'attack':
      if (e.crit) return `💥 ${e.amount}`;
      return `${e.special ? '✨' : '⚔️'} ${e.amount}${e.awaken ? ' 🔥' : ''}`;
    case 'miss': return '💨 빗나감';
    case 'fumble': return '😵 실수';
    case 'heal': return `💚 +${e.amount}`;
    case 'regen': return `🌱 +${e.amount}`;
    case 'shield': return '🛡️ 보호막';
    case 'buff': return '⚡ 크리 준비';
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

// 새로 추가된 기록에 라운드 번호를 붙인다 (선공·후공 모두 같은 라운드)
function tagRound(prevLog, nextLog, round) {
  return [...prevLog, ...nextLog.slice(prevLog.length).map(e => ({ ...e, round }))];
}

export default function Battle({ totalScore, statXp, npcId, battleNickname, onExit, onBattleEnd }) {
  const playerLabel = battleNickname?.trim() || '나';
  const npcDef = getNpcById(npcId);
  const [state, setState] = useState(() => createBattleState(
    createPlayerFighter(totalScore, statXp),
    createNpcFighter(npcDef || { id: 'unknown', level: 1, name: '???', energyMax: 100, stats: {}, trait: null })
  ));
  const [resolving, setResolving] = useState(false);
  const [flash, setFlash] = useState(null);
  const [showNpcStats, setShowNpcStats] = useState(true);
  const [pops, setPops] = useState({ player: [], npc: [] }); // 칸마다 튀어 오르는 숫자
  const [shake, setShake] = useState({ player: null, npc: null }); // 흔들 칸 (key가 바뀔 때마다 다시 흔들림)
  const [openRound, setOpenRound] = useState(null); // 기록에서 눌러 펼친 라운드 (자세한 문장 보기)
  const removePop = (side, key) => setPops(prev => ({ ...prev, [side]: prev[side].filter(p => p.key !== key) }));

  useEffect(() => {
    if (!npcDef) return;
    if (state.status !== 'ongoing') onBattleEnd(npcDef, state.status === 'win');
  }, [state.status]); // eslint-disable-line

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

  const { player, npc, status, log } = state;
  // 라운드별로 묶어서 최신 라운드가 위로 (각 칸 = 그 라운드에서 그쪽이 한 행동)
  const rounds = [];
  log.forEach(e => {
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
    newLog.slice(prevLog.length).forEach(entry => {
      const fx = effectOf(entry);
      if (fx) {
        const key = Date.now() + Math.random();
        setPops(prev => ({ ...prev, [fx.popSide]: [...prev[fx.popSide], { key, text: fx.text, color: fx.color, big: fx.big }] }));
        if (fx.shake) setShake(prev => ({ ...prev, [fx.shake]: key }));
      }
      if (entry.kind === 'attack' && entry.crit) {
        vibrate([40, 30, 40]);
        setFlash({ key: Date.now() + Math.random(), color: FLASH_COLOR.crit });
      } else if (entry.kind === 'attack' && entry.special) {
        vibrate(25);
        setFlash({ key: Date.now() + Math.random(), color: FLASH_COLOR.attack });
      } else if (entry.kind === 'heal' || entry.kind === 'shield' || entry.kind === 'buff') {
        vibrate(20);
        setFlash({ key: Date.now() + Math.random(), color: FLASH_COLOR[entry.kind] });
      }
    });
  };

  const act = (action) => {
    if (status !== 'ongoing' || resolving) return;
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
    }, ROUND_GAP_MS);
  };

  const retryBattle = () => {
    setResolving(false);
    setFlash(null);
    setPops({ player: [], npc: [] });
    setShake({ player: null, npc: null });
    setOpenRound(null);
    setState(createBattleState(createPlayerFighter(totalScore, statXp), createNpcFighter(npcDef)));
  };

  return (
    <div style={S.content}>
      <div style={S.topbar}>
        <button onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--dm-muted)', fontSize: 22, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, paddingLeft: 8 }}>
          <div style={S.title}>⚔️ 일기토</div>
          <div style={S.sub}>Lv.{npc.level} {npc.name} · 「{npc.trait?.label}」</div>
        </div>
      </div>

      <div style={S.card}>
        <button onClick={() => setShowNpcStats(v => !v)} style={{ width: '100%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--dm-muted)', letterSpacing: '0.06em' }}>🥊 상대 능력치</span>
          <span style={{ fontSize: 11, color: 'var(--dm-muted)' }}>{showNpcStats ? '접기 ▲' : '펼치기 ▼'}</span>
        </button>
        {showNpcStats && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 14, rowGap: 8, marginTop: 10 }}>
            {GROWTH_STATS.map(stat => {
              const score = npc.stats[stat.id] || 0;
              return (
                <div key={stat.id} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 13, width: 18, textAlign: 'center', flexShrink: 0 }}>{stat.icon}</span>
                  <span style={{ fontSize: 11, color: 'var(--dm-sub)', width: 34, flexShrink: 0 }}>{stat.name}</span>
                  <div style={{ flex: 1, height: 6, background: 'var(--dm-row)', borderRadius: 4, overflow: 'hidden', minWidth: 0 }}>
                    <div style={{ height: '100%', borderRadius: 4, background: 'linear-gradient(90deg,#F87171,#FCA5A5)', width: `${score}%` }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--dm-text)', width: 22, textAlign: 'right', flexShrink: 0 }}>{score}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 좌우 캐릭터 칸 */}
      <div style={{ ...S.card, position: 'relative', overflow: 'hidden' }}>
        {flash && (
          <div key={flash.key} className="dm-battle-flash" style={{ background: flash.color }} onAnimationEnd={() => setFlash(null)} />
        )}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
          <FighterPanel side="player" label={playerLabel} fighter={player} color="#4B6FFF" avatar={PLAYER_AVATAR}
            pops={pops.player} onPopEnd={removePop} shakeKey={shake.player} />
          <div style={{ alignSelf: 'center', fontSize: 12, fontWeight: 900, color: 'var(--dm-muted)', flexShrink: 0 }}>VS</div>
          <FighterPanel side="npc" label={npc.name} fighter={npc} color="#F87171" avatar={NPC_AVATAR}
            pops={pops.npc} onPopEnd={removePop} shakeKey={shake.npc} />
        </div>
        {status === 'ongoing' && (
          <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#A78BFA', marginTop: 8 }}>⚡ {playerLabel} 선공 확률 {playerFirstChance}%</div>
        )}
      </div>

      {/* 라운드별 기록 — 왼쪽 내 행동, 오른쪽 상대 행동. 줄을 누르면 자세한 문장 */}
      <div style={{ ...S.card, maxHeight: 220, overflowY: 'auto', padding: '8px 12px' }}>
        {rounds.length === 0 && <div style={{ fontSize: 12, color: 'var(--dm-muted)', padding: '6px 0' }}>공격하면 라운드별 기록이 여기 표시돼요</div>}
        {rounds.map(r => (
          <div key={r.round} onClick={() => setOpenRound(v => (v === r.round ? null : r.round))}
            style={{ padding: '6px 0', borderBottom: '1px solid var(--dm-row)', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--dm-muted)', width: 26, flexShrink: 0, paddingTop: 1 }}>{r.round}R</span>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#6C8EFF' }}>
                {r.player.map((e, i) => <div key={i} style={{ whiteSpace: 'nowrap', ...(e.crit ? { color: '#FCD34D' } : {}) }}>{shortLabel(e)}</div>)}
              </div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#F87171', textAlign: 'right' }}>
                {r.npc.map((e, i) => <div key={i} style={{ whiteSpace: 'nowrap', ...(e.crit ? { color: '#FCD34D' } : {}) }}>{shortLabel(e)}</div>)}
              </div>
            </div>
            {r.result && <div style={{ fontSize: 13, textAlign: 'center', marginTop: 4, ...logLineStyle(r.result) }}>{r.result.text}</div>}
            {openRound === r.round && (
              <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 8, background: 'var(--dm-input)' }}>
                {r.all.map((l, i) => <div key={i} style={{ fontSize: 12, padding: '2px 0', ...logLineStyle(l) }}>{l.text}</div>)}
              </div>
            )}
          </div>
        ))}
      </div>

      {status === 'ongoing' ? (
        <div style={{ margin: '0 16px', opacity: resolving ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          <button onClick={() => act({ type: 'basic' })} disabled={resolving} style={{ ...S.btn, marginTop: 0, marginBottom: 10, cursor: resolving ? 'default' : 'pointer' }}>⚔️ 기본공격</button>
          <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--dm-muted)', marginBottom: 8, letterSpacing: '0.06em' }}>SPECIAL</div>
          {availableSpecials.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--dm-muted)', textAlign: 'center', padding: '8px 0' }}>아직 사용 가능한 SPECIAL이 없어요 (능력치 10 이상 필요)</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {availableSpecials.map(sp => (
                <button
                  key={sp.stat}
                  disabled={sp.onCooldown || resolving}
                  onClick={() => act({ type: 'special', stat: sp.stat })}
                  title={sp.desc}
                  style={{
                    background: sp.onCooldown ? 'var(--dm-input)' : 'rgba(167,139,250,0.15)',
                    border: `1px solid ${sp.onCooldown ? 'var(--dm-border)' : 'rgba(167,139,250,0.4)'}`,
                    borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700,
                    color: sp.onCooldown ? 'var(--dm-muted)' : '#c4b5fd',
                    cursor: (sp.onCooldown || resolving) ? 'default' : 'pointer', fontFamily: 'inherit',
                  }}
                >{sp.icon} {sp.name}{sp.onCooldown ? ' (쿨다운)' : ''}</button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...S.card, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{status === 'win' ? '🎉' : '💧'}</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: status === 'win' ? '#4ADE80' : '#F87171' }}>
            {status === 'win' ? '승리했습니다!' : '패배했습니다'}
          </div>
          {status === 'win' && (
            <div style={{ fontSize: 12, color: 'var(--dm-muted)', marginTop: 6 }}>명성 +{calcBattleReward(npc, true).fame}</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={onExit} style={{ ...S.btnGhost, flex: 1, marginTop: 0 }}>나가기</button>
            <button onClick={retryBattle} style={{ ...S.btn, flex: 1, marginTop: 0 }}>다시 도전</button>
          </div>
        </div>
      )}
      <div style={{ height: 16 }} />
    </div>
  );
}
